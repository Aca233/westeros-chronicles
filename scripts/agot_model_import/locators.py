from __future__ import annotations

import math
import re
from pathlib import Path

import numpy as np
from PIL import Image

from scripts.agot_map_import.dem import height_value_to_elevation

from .models import LandmarkCatalogEntry, Locator, ModelImportError, ResolvedTransform

_ID_RE = re.compile(r"\bid\s*=\s*(\d+)\b")


def _instance_block(text: str, id_match: re.Match[str]) -> str:
    opening = text.rfind("{", 0, id_match.start())
    if opening < 0:
        raise ModelImportError("locator id 不在实例块中")
    depth = 0
    for index in range(opening, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                return text[opening:index + 1]
    raise ModelImportError("locator 实例块未闭合")


def _vector(block: str, key: str, size: int, default: tuple[float, ...] | None = None) -> tuple[float, ...]:
    match = re.search(rf"\b{re.escape(key)}\s*=\s*\{{([^}}]+)\}}", block)
    if not match:
        if default is not None:
            return default
        raise ModelImportError(f"locator 缺少 {key}")
    try:
        values = tuple(float(item) for item in match.group(1).split())
    except ValueError as error:
        raise ModelImportError(f"locator {key} 包含无效数字") from error
    if len(values) != size or not all(math.isfinite(item) for item in values):
        raise ModelImportError(f"locator {key} 必须包含 {size} 个有限数字")
    return values


def parse_locators(path: Path) -> dict[int, Locator]:
    try:
        text = path.read_text(encoding="utf-8-sig")
    except (OSError, UnicodeError) as error:
        raise ModelImportError(f"无法读取 locator：{path}") from error
    records: dict[int, Locator] = {}
    for match in _ID_RE.finditer(text):
        locator_id = int(match.group(1))
        if locator_id in records:
            raise ModelImportError(f"locator id 重复：{locator_id}")
        block = _instance_block(text, match)
        records[locator_id] = Locator(
            locator_id,
            _vector(block, "position", 3),
            _vector(block, "rotation", 4, (0.0, 0.0, 0.0, 1.0)),
            _vector(block, "scale", 3),
        )
    if not records:
        raise ModelImportError("locator 文件没有实例")
    return records


def sample_elevation(heightmap: Path, map_x: float, map_y: float) -> float:
    if not math.isfinite(map_x) or not math.isfinite(map_y):
        raise ModelImportError("高度采样坐标包含非有限值")
    with Image.open(heightmap) as image:
        source = np.asarray(image, dtype=np.float64)
    if source.ndim != 2:
        raise ModelImportError("高度图必须是单通道图像")
    height, width = source.shape
    if map_x < 0 or map_y < 0 or map_x > width - 1 or map_y > height - 1:
        raise ModelImportError("高度采样坐标超出地图范围")
    x0, y0 = int(math.floor(map_x)), int(math.floor(map_y))
    x1, y1 = min(width - 1, x0 + 1), min(height - 1, y0 + 1)
    tx, ty = map_x - x0, map_y - y0
    top = source[y0, x0] * (1 - tx) + source[y0, x1] * tx
    bottom = source[y1, x0] * (1 - tx) + source[y1, x1] * tx
    raw = top * (1 - ty) + bottom * ty
    return float(height_value_to_elevation(raw))


def _quaternion_multiply(
    left: tuple[float, float, float, float],
    right: tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    lx, ly, lz, lw = left
    rx, ry, rz, rw = right
    value = (
        lw * rx + lx * rw + ly * rz - lz * ry,
        lw * ry - lx * rz + ly * rw + lz * rx,
        lw * rz + lx * ry - ly * rx + lz * rw,
        lw * rw - lx * rx - ly * ry - lz * rz,
    )
    norm = math.sqrt(sum(item * item for item in value))
    if norm <= 1e-8 or not math.isfinite(norm):
        raise ModelImportError("locator rotation 不是有效四元数")
    return tuple(item / norm for item in value)


def resolve_transform(
    entry: LandmarkCatalogEntry,
    locator: Locator,
    map_height: int,
    heightmap: Path,
    asset_scale: float = 1.0,
) -> ResolvedTransform:
    if locator.id != entry.province_id:
        raise ModelImportError(f"地标 {entry.id} 的 provinceId 与 locator 不一致")
    correction = entry.corrections
    position_offset = correction.position_offset if correction else (0.0, 0.0, 0.0)
    rotation_offset = correction.rotation_offset if correction else (0.0, 0.0, 0.0, 1.0)
    scale_multiplier = correction.scale_multiplier if correction else (1.0, 1.0, 1.0)
    source_x = locator.position[0] + position_offset[0]
    source_y = locator.position[1] + position_offset[1]
    source_z = locator.position[2] + position_offset[2]
    map_x = source_x
    map_y = float(map_height) - source_z
    base_elevation = sample_elevation(heightmap, map_x, map_y)
    if not math.isfinite(asset_scale) or asset_scale <= 0:
        raise ModelImportError("asset scale 必须为正数")
    scale = tuple(asset_scale * locator.scale[index] * scale_multiplier[index] for index in range(3))
    if any(not math.isfinite(item) or item <= 0 for item in scale):
        raise ModelImportError("最终模型 scale 必须为正数")
    rotation = _quaternion_multiply(rotation_offset, locator.rotation)
    return ResolvedTransform(map_x, map_y, base_elevation + source_y, rotation, scale)
