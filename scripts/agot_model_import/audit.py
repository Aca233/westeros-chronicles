from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from .gltf_writer import inspect_glb
from .models import CONVERTER_COMMIT, EXPECTED_SOURCE_ID, ModelImportError

MIB = 1024 * 1024
MAX_TOTAL_BYTES = 120 * MIB
MAX_LOD_BYTES = {0: 20 * MIB, 1: 6 * MIB}
MAX_TEXTURE_EDGE = {0: 2048, 1: 1024}


@dataclass(frozen=True)
class AuditReport:
    landmark_count: int
    glb_count: int
    total_bytes: int
    asset_hash: str


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_hash(value: object) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def _safe_runtime_path(path: object, landmark_id: str, lod_level: int) -> str:
    expected = f"/assets/agot-map/models/{landmark_id}/lod{lod_level}.glb"
    if path != expected:
        raise ModelImportError(f"模型路径必须为 {expected}")
    return expected


def audit_outputs(data_root: Path, asset_root: Path, expected_ids: Iterable[str]) -> AuditReport:
    manifest_path = data_root / "landmarks.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ModelImportError(f"无法读取模型清单：{manifest_path}") from error
    if manifest.get("schemaVersion") != 1 or manifest.get("sourceId") != EXPECTED_SOURCE_ID:
        raise ModelImportError("模型清单 schema/sourceId 无效")
    if manifest.get("converter") != {"name": "io_pdx_mesh", "commit": CONVERTER_COMMIT}:
        raise ModelImportError("模型清单 converter 无效")
    landmarks = manifest.get("landmarks")
    if not isinstance(landmarks, list):
        raise ModelImportError("模型清单 landmarks 必须是数组")
    ids = [item.get("id") for item in landmarks if isinstance(item, dict)]
    expected = tuple(expected_ids)
    if tuple(ids) != expected or len(set(ids)) != len(ids):
        raise ModelImportError(f"模型清单地标顺序/集合无效：{ids}")
    total_bytes = 0
    glb_count = 0
    records_for_hash: list[object] = []
    for record in landmarks:
        landmark_id = record["id"]
        if not isinstance(record.get("locationId"), str) or not isinstance(record.get("provinceId"), int):
            raise ModelImportError(f"地标 {landmark_id} 身份无效")
        transform = record.get("transform", {})
        if not all(key in transform for key in ("mapX", "mapY", "elevationMeters", "rotation", "scale")):
            raise ModelImportError(f"地标 {landmark_id} transform 不完整")
        lods = record.get("lods")
        if not isinstance(lods, list) or len(lods) != 2:
            raise ModelImportError(f"地标 {landmark_id} 必须包含两个 LOD")
        triangle_counts: dict[int, int] = {}
        for level, lod in enumerate(lods):
            if not isinstance(lod, dict):
                raise ModelImportError(f"地标 {landmark_id} LOD 无效")
            _safe_runtime_path(lod.get("path"), landmark_id, level)
            glb = asset_root / landmark_id / f"lod{level}.glb"
            if not glb.is_file():
                raise ModelImportError(f"模型文件不存在：{glb}")
            report = inspect_glb(glb)
            if report.bytes != lod.get("bytes") or report.sha256 != lod.get("sha256"):
                raise ModelImportError(f"模型 {landmark_id}/lod{level} 哈希或字节数不一致")
            if report.triangle_count != lod.get("triangleCount"):
                raise ModelImportError(f"模型 {landmark_id}/lod{level} 三角形数不一致")
            if report.bytes > MAX_LOD_BYTES[level]:
                raise ModelImportError(f"模型 {landmark_id}/lod{level} 超过字节预算")
            if any(max(size) > MAX_TEXTURE_EDGE[level] for size in report.texture_sizes):
                raise ModelImportError(f"模型 {landmark_id}/lod{level} 贴图超过尺寸预算")
            total_bytes += report.bytes
            glb_count += 1
            triangle_counts[level] = report.triangle_count
        ratio = triangle_counts[1] / triangle_counts[0]
        if not 0.25 <= ratio <= 0.40:
            raise ModelImportError(f"模型 {landmark_id} LOD1 三角形比例超限：{ratio:.3f}")
        records_for_hash.append(record)
    if total_bytes > MAX_TOTAL_BYTES:
        raise ModelImportError("十二地标压缩总量超过 120 MiB")
    asset_hash = stable_hash(records_for_hash)
    if manifest.get("assetHash") != asset_hash:
        raise ModelImportError("模型清单 assetHash 不一致")
    serialized = json.dumps(manifest, ensure_ascii=False)
    if "2962333032/" in serialized or "/mnt/" in serialized or "\\\\" in serialized or "http://" in serialized or "https://" in serialized:
        raise ModelImportError("模型清单泄露源路径或远程 URL")
    return AuditReport(len(landmarks), glb_count, total_bytes, asset_hash)
