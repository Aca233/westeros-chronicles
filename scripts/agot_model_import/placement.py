from __future__ import annotations

import math
import struct
from pathlib import Path
from typing import Mapping, Sequence

import numpy as np
from PIL import Image

from .gltf_writer import _chunks
from .models import ModelImportError

MIN_EXPECTED_PROVINCE_COVERAGE = 0.60
MIN_LAND_COVERAGE = 0.70


def read_glb_positions(path: Path) -> tuple[tuple[float, float, float], ...]:
    document, binary = _chunks(path.read_bytes())
    accessors = document.get("accessors", [])
    views = document.get("bufferViews", [])
    positions: list[tuple[float, float, float]] = []
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            accessor_index = primitive.get("attributes", {}).get("POSITION")
            if not isinstance(accessor_index, int) or accessor_index >= len(accessors):
                raise ModelImportError(f"GLB 缺少 POSITION：{path}")
            accessor = accessors[accessor_index]
            if accessor.get("componentType") != 5126 or accessor.get("type") != "VEC3":
                raise ModelImportError(f"GLB POSITION 必须是 float VEC3：{path}")
            view_index = accessor.get("bufferView")
            if not isinstance(view_index, int) or view_index >= len(views):
                raise ModelImportError(f"GLB POSITION bufferView 无效：{path}")
            view = views[view_index]
            offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
            stride = view.get("byteStride", 12)
            count = accessor.get("count")
            if not isinstance(count, int) or count <= 0 or stride < 12:
                raise ModelImportError(f"GLB POSITION count/stride 无效：{path}")
            end = offset + (count - 1) * stride + 12
            if offset < 0 or end > len(binary):
                raise ModelImportError(f"GLB POSITION 越界：{path}")
            positions.extend(struct.unpack_from("<fff", binary, offset + index * stride) for index in range(count))
    if not positions:
        raise ModelImportError(f"GLB 没有可审计顶点：{path}")
    return tuple(positions)


def _placement_coordinates(record: Mapping[str, object], positions: Sequence[Sequence[float]]) -> tuple[np.ndarray, np.ndarray]:
    transform = record.get("transform")
    if not isinstance(transform, Mapping):
        raise ModelImportError("地标 placement 审计缺少 transform")
    try:
        map_x = float(transform["mapX"])
        map_y = float(transform["mapY"])
        rotation = np.asarray(transform["rotation"], dtype=np.float64)
        scale = np.asarray(transform["scale"], dtype=np.float64)
        points = np.asarray(positions, dtype=np.float64)
    except (KeyError, TypeError, ValueError) as error:
        raise ModelImportError("地标 placement transform/顶点无效") from error
    if rotation.shape != (4,) or scale.shape != (3,) or points.ndim != 2 or points.shape[1] != 3:
        raise ModelImportError("地标 placement transform/顶点维度无效")
    if not np.all(np.isfinite(rotation)) or not np.all(np.isfinite(scale)) or not np.all(np.isfinite(points)):
        raise ModelImportError("地标 placement transform/顶点包含非有限值")
    norm = float(np.linalg.norm(rotation))
    if norm <= 1e-8:
        raise ModelImportError("地标 placement rotation 无效")
    quaternion_vector = rotation[:3] / norm
    quaternion_w = rotation[3] / norm
    scaled = points * scale
    doubled_cross = 2 * np.cross(np.broadcast_to(quaternion_vector, scaled.shape), scaled)
    rotated = scaled + quaternion_w * doubled_cross + np.cross(
        np.broadcast_to(quaternion_vector, scaled.shape), doubled_cross,
    )
    return map_x + rotated[:, 0], map_y - rotated[:, 2]


def _validate_placement(
    record: Mapping[str, object],
    sampled_ids: np.ndarray,
    anchor_province_id: int,
    in_bounds: np.ndarray,
    water_province_ids: frozenset[int],
    minimum_expected_province_coverage: float,
    minimum_land_coverage: float,
) -> dict[str, object]:
    expected = record.get("provinceId")
    if not isinstance(expected, int):
        raise ModelImportError("地标 placement 审计缺少 provinceId")
    anchor_matches = anchor_province_id == expected
    valid_ids = sampled_ids[in_bounds]
    in_bounds_coverage = float(np.mean(in_bounds))
    expected_coverage = float(np.mean(valid_ids == expected)) if valid_ids.size else 0.0
    land_coverage = float(np.mean(~np.isin(valid_ids, tuple(water_province_ids)))) if valid_ids.size else 0.0
    result = {
        "anchorProvinceId": int(anchor_province_id),
        "anchorMatchesProvince": anchor_matches,
        "expectedProvinceCoverage": expected_coverage,
        "landCoverage": land_coverage,
        "inBoundsCoverage": in_bounds_coverage,
        "sampleCount": int(sampled_ids.size),
    }
    landmark_id = record.get("id", "unknown")
    if not anchor_matches:
        raise ModelImportError(f"地标 {landmark_id} 锚点省份 {anchor_province_id} 与声明 {expected} 不一致")
    if in_bounds_coverage < 1.0:
        raise ModelImportError(f"地标 {landmark_id} 模型足迹超出地图范围")
    if expected_coverage < minimum_expected_province_coverage:
        raise ModelImportError(
            f"地标 {landmark_id} 声明省份覆盖率过低：{expected_coverage:.3f} < {minimum_expected_province_coverage:.3f}"
        )
    if land_coverage < minimum_land_coverage:
        raise ModelImportError(f"地标 {landmark_id} 陆地覆盖率过低：{land_coverage:.3f} < {minimum_land_coverage:.3f}")
    return result


def audit_landmark_placement(
    record: Mapping[str, object],
    positions: Sequence[Sequence[float]],
    province_ids: np.ndarray,
    water_province_ids: frozenset[int],
    minimum_expected_province_coverage: float = MIN_EXPECTED_PROVINCE_COVERAGE,
    minimum_land_coverage: float = MIN_LAND_COVERAGE,
) -> dict[str, object]:
    province_ids = np.asarray(province_ids)
    if province_ids.ndim != 2:
        raise ModelImportError("省份栅格必须是二维数组")
    x, y = _placement_coordinates(record, positions)
    rounded_x = np.rint(x).astype(np.int64)
    rounded_y = np.rint(y).astype(np.int64)
    in_bounds = (
        (rounded_x >= 0) & (rounded_x < province_ids.shape[1])
        & (rounded_y >= 0) & (rounded_y < province_ids.shape[0])
    )
    sampled = np.zeros(len(rounded_x), dtype=np.int64)
    sampled[in_bounds] = province_ids[rounded_y[in_bounds], rounded_x[in_bounds]]
    transform = record["transform"]
    anchor_x = int(round(float(transform["mapX"])))
    anchor_y = int(round(float(transform["mapY"])))
    if not (0 <= anchor_x < province_ids.shape[1] and 0 <= anchor_y < province_ids.shape[0]):
        raise ModelImportError(f"地标 {record.get('id', 'unknown')} 锚点超出地图范围")
    return _validate_placement(
        record, sampled, int(province_ids[anchor_y, anchor_x]), in_bounds, water_province_ids,
        minimum_expected_province_coverage, minimum_land_coverage,
    )


def _rgb_crop_to_province_ids(rgb: np.ndarray, colour_to_province: Mapping[tuple[int, int, int], int]) -> np.ndarray:
    packed = (
        rgb[..., 0].astype(np.uint32) << 16
        | rgb[..., 1].astype(np.uint32) << 8
        | rgb[..., 2].astype(np.uint32)
    )
    result = np.zeros(packed.shape, dtype=np.int32)
    for colour in np.unique(packed):
        rgb_key = (int(colour >> 16), int((colour >> 8) & 255), int(colour & 255))
        province_id = colour_to_province.get(rgb_key)
        if province_id is None:
            raise ModelImportError(f"省份图包含 definition.csv 未定义颜色：{rgb_key}")
        result[packed == colour] = province_id
    return result


def audit_landmark_placement_image(
    record: Mapping[str, object],
    positions: Sequence[Sequence[float]],
    province_image: Image.Image,
    colour_to_province: Mapping[tuple[int, int, int], int],
    water_province_ids: frozenset[int],
) -> dict[str, object]:
    x, y = _placement_coordinates(record, positions)
    rounded_x = np.rint(x).astype(np.int64)
    rounded_y = np.rint(y).astype(np.int64)
    width, height = province_image.size
    in_bounds = (rounded_x >= 0) & (rounded_x < width) & (rounded_y >= 0) & (rounded_y < height)
    sampled = np.zeros(len(rounded_x), dtype=np.int64)
    if np.any(in_bounds):
        valid_x = rounded_x[in_bounds]
        valid_y = rounded_y[in_bounds]
        left, top = int(valid_x.min()), int(valid_y.min())
        right, bottom = int(valid_x.max()) + 1, int(valid_y.max()) + 1
        crop = np.asarray(province_image.crop((left, top, right, bottom)).convert("RGB"), dtype=np.uint8)
        crop_ids = _rgb_crop_to_province_ids(crop, colour_to_province)
        sampled[in_bounds] = crop_ids[valid_y - top, valid_x - left]
    transform = record["transform"]
    anchor_x = int(round(float(transform["mapX"])))
    anchor_y = int(round(float(transform["mapY"])))
    if not (0 <= anchor_x < width and 0 <= anchor_y < height):
        raise ModelImportError(f"地标 {record.get('id', 'unknown')} 锚点超出地图范围")
    anchor_rgb = tuple(province_image.convert("RGB").getpixel((anchor_x, anchor_y)))
    anchor_province_id = colour_to_province.get(anchor_rgb)
    if anchor_province_id is None:
        raise ModelImportError(f"地标 {record.get('id', 'unknown')} 锚点颜色未定义：{anchor_rgb}")
    return _validate_placement(
        record, sampled, anchor_province_id, in_bounds, water_province_ids,
        MIN_EXPECTED_PROVINCE_COVERAGE, MIN_LAND_COVERAGE,
    )
