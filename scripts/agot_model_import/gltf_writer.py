from __future__ import annotations

import hashlib
import json
import math
import struct
from io import BytesIO
from pathlib import Path
from typing import Iterable, Mapping

from PIL import Image

from .models import (
    ConvertedTexture,
    GlbBounds,
    GlbReport,
    MaterialBinding,
    MeshPrimitive,
    ModelImportError,
    StaticMesh,
)

_ARRAY_BUFFER = 34962
_ELEMENT_ARRAY_BUFFER = 34963
_FLOAT = 5126
_UNSIGNED_SHORT = 5123
_UNSIGNED_INT = 5125


def _pad(data: bytes, byte: bytes = b"\x00") -> bytes:
    return data + byte * ((-len(data)) % 4)


class _BufferBuilder:
    def __init__(self) -> None:
        self.data = bytearray()
        self.views: list[dict[str, object]] = []
        self.accessors: list[dict[str, object]] = []

    def view(self, payload: bytes, target: int | None = None) -> int:
        while len(self.data) % 4:
            self.data.append(0)
        offset = len(self.data)
        self.data.extend(payload)
        view: dict[str, object] = {"buffer": 0, "byteLength": len(payload), "byteOffset": offset}
        if target is not None:
            view["target"] = target
        self.views.append(view)
        return len(self.views) - 1

    def vectors(self, values: Iterable[tuple[float, ...]], kind: str) -> int:
        rows = tuple(values)
        width = {"VEC2": 2, "VEC3": 3, "VEC4": 4}[kind]
        payload = struct.pack(f"<{len(rows) * width}f", *(item for row in rows for item in row))
        view = self.view(payload, _ARRAY_BUFFER)
        accessor: dict[str, object] = {
            "bufferView": view,
            "componentType": _FLOAT,
            "count": len(rows),
            "type": kind,
        }
        if kind == "VEC3":
            accessor["min"] = [min(row[index] for row in rows) for index in range(3)]
            accessor["max"] = [max(row[index] for row in rows) for index in range(3)]
        self.accessors.append(accessor)
        return len(self.accessors) - 1

    def indices(self, values: tuple[int, ...], vertex_count: int) -> int:
        component = _UNSIGNED_SHORT if vertex_count <= 65535 else _UNSIGNED_INT
        code = "H" if component == _UNSIGNED_SHORT else "I"
        payload = struct.pack(f"<{len(values)}{code}", *values)
        view = self.view(payload, _ELEMENT_ARRAY_BUFFER)
        self.accessors.append({
            "bufferView": view,
            "componentType": component,
            "count": len(values),
            "type": "SCALAR",
            "min": [min(values)],
            "max": [max(values)],
        })
        return len(self.accessors) - 1


def compact_primitive(primitive: MeshPrimitive) -> MeshPrimitive:
    """Remove vertices not referenced by this LOD while preserving every vertex attribute."""
    used = sorted(set(primitive.indices))
    if len(used) == len(primitive.positions):
        return primitive
    remap = {source: target for target, source in enumerate(used)}
    return MeshPrimitive(
        name=primitive.name,
        positions=tuple(primitive.positions[index] for index in used),
        normals=tuple(primitive.normals[index] for index in used),
        tangents=tuple(primitive.tangents[index] for index in used),
        uv0=tuple(primitive.uv0[index] for index in used),
        indices=tuple(remap[index] for index in primitive.indices),
        material_name=primitive.material_name,
    )


def _encode_glb(document: dict[str, object], binary: bytes) -> bytes:
    json_chunk = _pad(json.dumps(document, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"), b" ")
    bin_chunk = _pad(binary)
    total = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
    return b"".join((
        struct.pack("<4sII", b"glTF", 2, total),
        struct.pack("<I4s", len(json_chunk), b"JSON"), json_chunk,
        struct.pack("<I4s", len(bin_chunk), b"BIN\x00"), bin_chunk,
    ))


def write_glb(
    mesh: StaticMesh,
    materials: tuple[MaterialBinding, ...],
    textures: Mapping[tuple[str, str], ConvertedTexture],
    output: Path,
) -> GlbReport:
    builder = _BufferBuilder()
    images: list[dict[str, object]] = []
    gltf_textures: list[dict[str, object]] = []
    material_documents: list[dict[str, object]] = []
    texture_index: dict[tuple[str, str], int] = {}
    for material in materials:
        for role in ("diffuse", "normal", "properties"):
            converted = textures.get((material.name, role))
            if converted is None:
                raise ModelImportError(f"材质 {material.name} 缺少 {role} 派生贴图")
            if converted.mime_type != "image/webp":
                raise ModelImportError("GLB 只接受嵌入式 WebP")
            image_index = len(images)
            images.append({"bufferView": builder.view(converted.data), "mimeType": "image/webp", "name": f"{material.name}-{role}"})
            gltf_textures.append({"extensions": {"EXT_texture_webp": {"source": image_index}}})
            texture_index[(material.name, role)] = len(gltf_textures) - 1
        properties = texture_index[(material.name, "properties")]
        material_documents.append({
            "name": material.name,
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": texture_index[(material.name, "diffuse")]},
                "metallicRoughnessTexture": {"index": properties},
                "metallicFactor": 1.0,
                "roughnessFactor": 1.0,
            },
            "normalTexture": {"index": texture_index[(material.name, "normal")]},
            "occlusionTexture": {"index": properties},
        })
    material_indices = {material.name: index for index, material in enumerate(materials)}
    primitives: list[dict[str, object]] = []
    for source_primitive in mesh.primitives:
        primitive = compact_primitive(source_primitive)
        primitives.append({
            "attributes": {
                "POSITION": builder.vectors(primitive.positions, "VEC3"),
                "NORMAL": builder.vectors(primitive.normals, "VEC3"),
                "TANGENT": builder.vectors(primitive.tangents, "VEC4"),
                "TEXCOORD_0": builder.vectors(primitive.uv0, "VEC2"),
            },
            "indices": builder.indices(primitive.indices, len(primitive.positions)),
            "material": material_indices[primitive.material_name],
            "mode": 4,
        })
    document: dict[str, object] = {
        "asset": {"version": "2.0", "generator": "AGOT landmark importer 1"},
        "extensionsUsed": ["EXT_texture_webp"],
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "landmark"}],
        "meshes": [{"primitives": primitives}],
        "materials": material_documents,
        "textures": gltf_textures,
        "images": images,
        "samplers": [],
        "accessors": builder.accessors,
        "bufferViews": builder.views,
        "buffers": [{"byteLength": len(builder.data)}],
    }
    payload = _encode_glb(document, bytes(builder.data))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(payload)
    return inspect_glb(output)


def _chunks(payload: bytes) -> tuple[dict[str, object], bytes]:
    if len(payload) < 28:
        raise ModelImportError("GLB 文件过短")
    magic, version, total = struct.unpack_from("<4sII", payload)
    if magic != b"glTF" or version != 2 or total != len(payload):
        raise ModelImportError("GLB 头无效")
    offset = 12
    json_data: bytes | None = None
    binary: bytes | None = None
    while offset < len(payload):
        if offset + 8 > len(payload):
            raise ModelImportError("GLB chunk 头截断")
        length, kind = struct.unpack_from("<I4s", payload, offset)
        offset += 8
        chunk = payload[offset:offset + length]
        if len(chunk) != length:
            raise ModelImportError("GLB chunk 截断")
        offset += length
        if kind == b"JSON":
            json_data = chunk
        elif kind == b"BIN\x00":
            binary = chunk
    if json_data is None or binary is None:
        raise ModelImportError("GLB 缺少 JSON 或 BIN chunk")
    try:
        document = json.loads(json_data.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ModelImportError("GLB JSON 无效") from error
    if not isinstance(document, dict):
        raise ModelImportError("GLB JSON 根必须是对象")
    return document, binary


def inspect_glb(path: Path) -> GlbReport:
    payload = path.read_bytes()
    document, binary = _chunks(payload)
    if any("uri" in item for item in document.get("images", [])) or any("uri" in item for item in document.get("buffers", [])):
        raise ModelImportError("GLB 不得引用外部 URI")
    buffers = document.get("buffers", [])
    if len(buffers) != 1 or buffers[0].get("byteLength", -1) > len(binary):
        raise ModelImportError("GLB buffer 长度无效")
    views = document.get("bufferViews", [])
    accessors = document.get("accessors", [])
    triangle_count = 0
    position_minima: list[list[float]] = []
    position_maxima: list[list[float]] = []
    required = {"POSITION", "NORMAL", "TANGENT", "TEXCOORD_0"}
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            attributes = primitive.get("attributes", {})
            if not required.issubset(attributes):
                raise ModelImportError("GLB primitive 缺少必需顶点属性")
            index_accessor = accessors[primitive["indices"]]
            if index_accessor["count"] % 3:
                raise ModelImportError("GLB indices 不是三角形")
            triangle_count += index_accessor["count"] // 3
            position = accessors[attributes["POSITION"]]
            position_minima.append(position["min"])
            position_maxima.append(position["max"])
    if not position_minima:
        raise ModelImportError("GLB 没有网格 primitive")
    minimum = tuple(min(item[index] for item in position_minima) for index in range(3))
    maximum = tuple(max(item[index] for item in position_maxima) for index in range(3))
    if not all(math.isfinite(item) for item in minimum + maximum):
        raise ModelImportError("GLB 包围盒无效")
    texture_sizes: list[tuple[int, int]] = []
    for image in document.get("images", []):
        if image.get("mimeType") != "image/webp":
            raise ModelImportError("GLB 贴图必须是 WebP")
        view = views[image["bufferView"]]
        start = view.get("byteOffset", 0)
        end = start + view["byteLength"]
        if start < 0 or end > len(binary):
            raise ModelImportError("GLB 图片 bufferView 越界")
        try:
            with Image.open(BytesIO(binary[start:end])) as texture:
                texture_sizes.append(texture.size)
        except OSError as error:
            raise ModelImportError("GLB 内嵌 WebP 无法解码") from error
    return GlbReport(
        len(payload),
        triangle_count,
        GlbBounds(minimum, maximum),
        tuple(texture_sizes),
        hashlib.sha256(payload).hexdigest(),
    )
