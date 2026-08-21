from __future__ import annotations

import json
import math
import os
import subprocess
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

from .models import (
    CONVERTER_COMMIT,
    MaterialBinding,
    MeshPrimitive,
    ModelImportError,
    StaticMesh,
)

_FORBIDDEN_STATIC_KEYS = {"skeleton", "skin", "bones", "bone", "animation", "animations", "anim"}


def verify_converter(root: Path) -> None:
    if root.name != "io_pdx_mesh" or not (root / "__main__.py").is_file():
        raise ModelImportError("converter-root 必须指向名为 io_pdx_mesh 的工具目录")
    try:
        result = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise ModelImportError("无法验证 io_pdx_mesh git commit") from error
    if result.stdout.strip() != CONVERTER_COMMIT:
        raise ModelImportError(f"io_pdx_mesh 必须固定到 {CONVERTER_COMMIT}")


def _contains_forbidden(value: Any) -> bool:
    if isinstance(value, Mapping):
        return any(str(key).lower() in _FORBIDDEN_STATIC_KEYS or _contains_forbidden(item) for key, item in value.items())
    if isinstance(value, list):
        return any(_contains_forbidden(item) for item in value)
    return False


def _float_vectors(value: Any, width: int, label: str) -> tuple[tuple[float, ...], ...]:
    if not isinstance(value, list) or not value or len(value) % width:
        raise ModelImportError(f"网格 {label} 数组长度无效")
    try:
        numbers = tuple(float(item) for item in value)
    except (TypeError, ValueError) as error:
        raise ModelImportError(f"网格 {label} 必须包含数字") from error
    if not all(math.isfinite(item) for item in numbers):
        raise ModelImportError(f"网格 {label} 包含 NaN/Infinity")
    return tuple(tuple(numbers[index:index + width]) for index in range(0, len(numbers), width))


def _indices(value: Any, vertex_count: int) -> tuple[int, ...]:
    if not isinstance(value, list) or not value or len(value) % 3:
        raise ModelImportError("网格 tri 必须是非空三角形索引数组")
    if any(not isinstance(item, int) or isinstance(item, bool) for item in value):
        raise ModelImportError("网格 tri 必须包含整数")
    if min(value) < 0 or max(value) >= vertex_count:
        raise ModelImportError("网格 tri 索引越界")
    triangles = [tuple(value[index:index + 3]) for index in range(0, len(value), 3)]
    degenerate = [triangle for triangle in triangles if len(set(triangle)) < 3]
    if len(degenerate) / len(triangles) > 0.05:
        raise ModelImportError("网格退化三角形比例超过 5%")
    return tuple(item for triangle in triangles if len(set(triangle)) == 3 for item in triangle)


def _primitive(name: str, body: Any, material: MaterialBinding) -> MeshPrimitive:
    if not isinstance(body, Mapping) or not isinstance(body.get("mesh"), Mapping):
        raise ModelImportError(f"对象 {name} 缺少 mesh")
    mesh = body["mesh"]
    for key in ("p", "n", "ta", "u0", "tri"):
        if key not in mesh:
            raise ModelImportError(f"对象 {name} 缺少 {key}")
    positions = _float_vectors(mesh["p"], 3, "POSITION")
    normals = _float_vectors(mesh["n"], 3, "NORMAL")
    tangents = _float_vectors(mesh["ta"], 4, "TANGENT")
    uv0 = _float_vectors(mesh["u0"], 2, "TEXCOORD_0")
    count = len(positions)
    if len(normals) != count or len(tangents) != count or len(uv0) != count:
        raise ModelImportError(f"对象 {name} 的顶点属性数量不一致")
    indices = _indices(mesh["tri"], count)
    return MeshPrimitive(name, positions, normals, tangents, uv0, indices, material.name)


def normalize_pdx_json(
    payload: Mapping[str, object],
    materials: Sequence[MaterialBinding],
    ignored_shapes: frozenset[str] = frozenset(),
) -> StaticMesh:
    if _contains_forbidden(payload):
        raise ModelImportError("首批地标只允许静态、无蒙皮网格")
    objects = payload.get("object")
    if not isinstance(objects, Mapping) or not objects:
        raise ModelImportError("PDX JSON 缺少 object")
    by_name = {item.name: item for item in materials}
    primitives: list[MeshPrimitive] = []
    for name, body in objects.items():
        if isinstance(name, str) and name in ignored_shapes:
            continue
        if not isinstance(name, str) or name not in by_name:
            raise ModelImportError(f"网格对象没有对应 meshsettings：{name}")
        primitives.append(_primitive(name, body, by_name[name]))
    missing = set(by_name) - set(objects)
    if missing:
        raise ModelImportError(f"meshsettings 没有对应网格对象：{', '.join(sorted(missing))}")
    return StaticMesh(tuple(primitives))


def convert_mesh(
    converter_root: Path,
    mesh_path: Path,
    temp_json: Path,
    materials: Sequence[MaterialBinding],
    ignored_shapes: frozenset[str] = frozenset(),
) -> StaticMesh:
    verify_converter(converter_root)
    if not mesh_path.is_file():
        raise ModelImportError(f"mesh 不存在：{mesh_path}")
    command = [
        sys.executable,
        "-m",
        "io_pdx_mesh",
        "convert-to",
        "--inpath",
        str(mesh_path),
        "--outpath",
        str(temp_json),
        "--format",
        "json",
    ]
    env = {**os.environ, "PYTHONPATH": str(converter_root.parent)}
    try:
        subprocess.run(command, check=True, env=env, capture_output=True, text=True)
        payload = json.loads(temp_json.read_text(encoding="utf-8"))
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        raise ModelImportError(f"io_pdx_mesh 转换失败：{mesh_path.name}") from error
    return normalize_pdx_json(payload, materials, ignored_shapes)


def simplify_primitive(
    indices: Sequence[int],
    positions: Sequence[Sequence[float]],
    target_ratio: float,
    node_command: str = "node",
    allow_ratio_overshoot: bool = False,
) -> tuple[int, ...]:
    if not 0.25 <= target_ratio <= 0.40:
        raise ModelImportError("LOD1 target_ratio 必须在 25%–40%")
    flat_positions = [float(item) for position in positions for item in position]
    payload = json.dumps({
        "indices": list(indices),
        "positions": flat_positions,
        "targetRatio": target_ratio,
    }, separators=(",", ":"))
    bridge = Path(__file__).with_name("meshopt.mjs")
    try:
        result = subprocess.run(
            [node_command, str(bridge)],
            input=payload,
            check=True,
            capture_output=True,
            text=True,
        )
        output = json.loads(result.stdout)
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        raise ModelImportError("meshoptimizer LOD 简化失败") from error
    simplified = output.get("indices")
    if not isinstance(simplified, list) or not simplified or len(simplified) % 3:
        raise ModelImportError("meshoptimizer 返回无效索引")
    if any(not isinstance(item, int) or item < 0 or item >= len(positions) for item in simplified):
        raise ModelImportError("meshoptimizer 返回越界索引")
    ratio = len(simplified) / len(indices)
    if not allow_ratio_overshoot and not 0.25 <= ratio <= 0.40:
        raise ModelImportError(f"LOD1 三角形比例超限：{ratio:.3f}")
    return tuple(simplified)
