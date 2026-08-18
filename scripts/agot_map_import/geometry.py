from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Iterable, Mapping

import numpy as np
from PIL import Image
from rasterio.features import shapes
from shapely import make_valid
from shapely.geometry import shape
from shapely.ops import unary_union

from .models import MapImportError, ProvinceDefinition, ProvinceGeometry


def _read_rgb_image(image: Image.Image | Path) -> np.ndarray:
    if isinstance(image, Path):
        with Image.open(image) as opened:
            if opened.mode != "RGB":
                raise MapImportError(f"省份图必须为 RGB，实际为 {opened.mode}")
            return np.asarray(opened, dtype=np.uint8)
    if image.mode != "RGB":
        raise MapImportError(f"省份图必须为 RGB，实际为 {image.mode}")
    return np.asarray(image, dtype=np.uint8)


def _colour_code(red: int, green: int, blue: int) -> int:
    return (red << 16) | (green << 8) | blue


def extract_province_geometry(
    image: Image.Image | Path,
    definitions: Mapping[int, ProvinceDefinition],
    included_ids: Iterable[int],
) -> dict[int, ProvinceGeometry]:
    pixels = _read_rgb_image(image)
    included = tuple(sorted(set(included_ids)))
    if not included:
        return {}
    missing_definitions = [province_id for province_id in included if province_id not in definitions]
    if missing_definitions:
        raise MapImportError(f"省份定义不存在：{missing_definitions[:10]}")

    encoded = (
        pixels[:, :, 0].astype(np.uint32) << 16
        | pixels[:, :, 1].astype(np.uint32) << 8
        | pixels[:, :, 2].astype(np.uint32)
    )
    colour_to_id = sorted(
        (_colour_code(*definitions[province_id].rgb), province_id)
        for province_id in included
    )
    colours = np.asarray([item[0] for item in colour_to_id], dtype=np.uint32)
    province_ids = np.asarray([item[1] for item in colour_to_id], dtype=np.int32)
    positions = np.searchsorted(colours, encoded)
    safe_positions = np.minimum(positions, len(colours) - 1)
    matched = (positions < len(colours)) & (colours[safe_positions] == encoded)
    id_raster = np.zeros(encoded.shape, dtype=np.int32)
    id_raster[matched] = province_ids[safe_positions[matched]]

    max_id = max(included)
    counts = np.bincount(id_raster.ravel(), minlength=max_id + 1)
    missing_pixels = [province_id for province_id in included if counts[province_id] == 0]
    if missing_pixels:
        raise MapImportError(f"省份定义没有对应像素：{missing_pixels[:10]}")

    pieces: dict[int, list] = defaultdict(list)
    for geojson, value in shapes(id_raster, mask=id_raster != 0, connectivity=4):
        province_id = int(value)
        if province_id in definitions:
            pieces[province_id].append(shape(geojson))

    output: dict[int, ProvinceGeometry] = {}
    for province_id in included:
        geometry = make_valid(unary_union(pieces[province_id]))
        if geometry.is_empty:
            raise MapImportError(f"省份 {province_id} 的边界为空")
        representative = geometry.representative_point()
        map_x = min(pixels.shape[1] - 1, max(0, int(representative.x)))
        map_y = min(pixels.shape[0] - 1, max(0, int(representative.y)))
        if id_raster[map_y, map_x] != province_id:
            first_y, first_x = np.argwhere(id_raster == province_id)[0]
            map_x, map_y = int(first_x), int(first_y)
        min_x, min_y, max_x, max_y = geometry.bounds
        output[province_id] = ProvinceGeometry(
            province_id=province_id,
            barony_id=definitions[province_id].name,
            map_x=map_x,
            map_y=map_y,
            bbox=(int(np.floor(min_x)), int(np.floor(min_y)), int(np.ceil(max_x)), int(np.ceil(max_y))),
            pixel_count=int(counts[province_id]),
            geometry=geometry,
        )
    return output
