from __future__ import annotations

import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping

import numpy as np
from PIL import Image

from .models import MapImportError, ProvinceDefinition
from .tiles import (
    MapBoundsTuple, _atomic_publish, _staging_directory, _tile_bounds,
    _validate_bounds, _validated_zooms,
)


_RANGE_PATTERN = re.compile(
    r"^\s*{key}\s*=\s*RANGE\s*\{{\s*(\d+)\s+(\d+)\s*\}}",
    re.MULTILINE,
)
_LIST_PATTERN = re.compile(
    r"^\s*{key}\s*=\s*LIST\s*\{{([^}}]+)\}}",
    re.MULTILINE,
)
_WATER_COLORS = np.asarray(
    (
        (0, 0, 0),
        (39, 67, 81),
        (43, 91, 101),
        (48, 106, 113),
        (59, 120, 127),
    ),
    dtype=np.float64,
)


@dataclass(frozen=True, slots=True)
class WaterProvinceSets:
    seas: frozenset[int]
    lakes: frozenset[int]
    rivers: frozenset[int]


def parse_province_set(default_map_text: str, key: str) -> frozenset[int]:
    text = re.sub(r"#.*$", "", default_map_text, flags=re.MULTILINE)
    values: set[int] = set()
    range_pattern = _RANGE_PATTERN.pattern.format(key=re.escape(key))
    list_pattern = _LIST_PATTERN.pattern.format(key=re.escape(key))
    for start, stop in re.findall(range_pattern, text, re.MULTILINE):
        first = int(start)
        last = int(stop)
        if first > last:
            raise MapImportError(f"default.map 的 {key} RANGE 起点大于终点")
        values.update(range(first, last + 1))
    for block in re.findall(list_pattern, text, re.MULTILINE):
        values.update(int(value) for value in re.findall(r"\d+", block))
    return frozenset(values)


def parse_water_province_sets(default_map_text: str) -> WaterProvinceSets:
    return WaterProvinceSets(
        seas=parse_province_set(default_map_text, "sea_zones"),
        lakes=parse_province_set(default_map_text, "lakes"),
        rivers=parse_province_set(default_map_text, "river_provinces"),
    )


def _province_class_lookup(
    definitions: Mapping[int, ProvinceDefinition],
    water: WaterProvinceSets,
) -> np.ndarray:
    lookup = np.zeros(1 << 24, dtype=np.uint8)
    categories = ((water.seas, 1), (water.lakes, 2), (water.rivers, 3))
    for province_ids, water_class in categories:
        for province_id in province_ids:
            definition = definitions.get(province_id)
            if definition is None:
                continue
            red, green, blue = definition.rgb
            lookup[(red << 16) | (green << 8) | blue] = water_class
    return lookup


def _water_classes(
    province_tile: Image.Image,
    river_tile: Image.Image,
    province_lookup: np.ndarray,
) -> np.ndarray:
    province_rgb = np.asarray(province_tile.convert("RGB"), dtype=np.uint32)
    packed = (province_rgb[..., 0] << 16) | (province_rgb[..., 1] << 8) | province_rgb[..., 2]
    classes = province_lookup[packed]
    river_indices = np.asarray(river_tile, dtype=np.uint8)
    small_rivers = (river_indices != 254) & (river_indices != 255)
    classes[small_rivers] = 4
    return classes


def _apply_water_colors(base: Image.Image, classes: np.ndarray) -> Image.Image:
    pixels = np.asarray(base.convert("RGB"), dtype=np.uint8).copy()
    luminance = (
        pixels[..., 0].astype(np.float64) * 0.2126
        + pixels[..., 1].astype(np.float64) * 0.7152
        + pixels[..., 2].astype(np.float64) * 0.0722
    )
    for water_class in range(1, len(_WATER_COLORS)):
        mask = classes == water_class
        if not np.any(mask):
            continue
        colored = _WATER_COLORS[water_class] * 0.84 + luminance[mask, None] * 0.16
        pixels[mask] = np.clip(np.rint(colored), 0, 255).astype(np.uint8)
    return Image.fromarray(pixels, mode="RGB")


def colorize_material_terrain_tiles(
    material_root: Path,
    province_map: Path,
    river_map: Path,
    definitions: Mapping[int, ProvinceDefinition],
    water: WaterProvinceSets,
    bounds: MapBoundsTuple,
    zooms: Iterable[int],
    tile_size: int = 512,
) -> int:
    bounds = _validate_bounds(bounds)
    zoom_values = _validated_zooms(zooms)
    if tile_size <= 0:
        raise MapImportError("水体着色瓦片尺寸必须为正整数")
    if not material_root.is_dir():
        raise MapImportError(f"地形材质瓦片目录不存在：{material_root}")

    staging = _staging_directory(material_root)
    province_source: Image.Image | None = None
    river_source: Image.Image | None = None
    colored_count = 0
    try:
        shutil.copytree(material_root, staging, dirs_exist_ok=True)
        province_source = Image.open(province_map)
        river_source = Image.open(river_map)
        if province_source.mode != "RGB":
            raise MapImportError("provinces.png 必须为 RGB 图像")
        if river_source.mode != "P":
            raise MapImportError("rivers.png 必须为索引色图像")
        if province_source.size != river_source.size:
            raise MapImportError("provinces.png 与 rivers.png 尺寸不一致")

        province_lookup = _province_class_lookup(definitions, water)
        for zoom in zoom_values:
            count = 1 << zoom
            for tile_x in range(count):
                for tile_y in range(count):
                    relative = Path(str(zoom)) / str(tile_x) / f"{tile_y}.webp"
                    source_tile_path = material_root / relative
                    target_tile_path = staging / relative
                    if not source_tile_path.is_file():
                        raise MapImportError(f"缺少待着色地形材质瓦片：{relative.as_posix()}")
                    source_bounds = _tile_bounds(bounds, zoom, tile_x, tile_y)
                    province_tile = province_source.transform(
                        (tile_size, tile_size), Image.Transform.EXTENT, source_bounds,
                        Image.Resampling.NEAREST,
                    )
                    river_tile = river_source.transform(
                        (tile_size, tile_size), Image.Transform.EXTENT, source_bounds,
                        Image.Resampling.NEAREST,
                    )
                    classes = _water_classes(province_tile, river_tile, province_lookup)
                    province_tile.close()
                    river_tile.close()
                    if not np.any(classes):
                        colored_count += 1
                        continue
                    with Image.open(source_tile_path) as source_tile:
                        if source_tile.size != (tile_size, tile_size):
                            raise MapImportError(f"地形材质瓦片尺寸错误：{relative.as_posix()}")
                        colored = _apply_water_colors(source_tile, classes)
                    colored.save(target_tile_path, format="WEBP", quality=90, method=4)
                    colored.close()
                    colored_count += 1
        _atomic_publish(staging, material_root)
    except Exception:
        if staging.exists():
            shutil.rmtree(staging)
        raise
    finally:
        if province_source is not None:
            province_source.close()
        if river_source is not None:
            river_source.close()
    return colored_count
