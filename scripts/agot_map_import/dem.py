from __future__ import annotations

import shutil
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image

from .models import MapImportError, TileReport
from .tiles import MapBoundsTuple, _atomic_publish, _open_copy, _staging_directory, _tile_bounds, _validate_bounds, _validated_zooms
from .terrain_lighting import _shared_edge_sample_bounds


def encode_terrain_rgb(height: np.ndarray) -> np.ndarray:
    values = np.asarray(height, dtype=np.float64)
    if not np.all(np.isfinite(values)):
        raise MapImportError("DEM 高程包含非有限值")
    packed = np.rint((values + 10000) * 10)
    packed = np.clip(packed, 0, 16777215).astype(np.uint32)
    return np.stack((
        (packed >> 16) & 255,
        (packed >> 8) & 255,
        packed & 255,
    ), axis=-1).astype(np.uint8)



def height_value_to_elevation(
    value: np.ndarray | float | int,
    min_elevation: float = -500,
    max_elevation: float = 8000,
) -> np.ndarray:
    if min_elevation >= max_elevation:
        raise MapImportError("DEM 最大高程必须大于最小高程")
    values = np.asarray(value, dtype=np.float64)
    if not np.all(np.isfinite(values)):
        raise MapImportError("DEM 高度图包含非有限值")
    return min_elevation + values / 65535.0 * (max_elevation - min_elevation)

def build_dem_tiles(
    heightmap: Image.Image | Path,
    bounds: MapBoundsTuple,
    output: Path,
    zooms: Iterable[int],
    tile_size: int = 512,
    min_elevation: float = -500,
    max_elevation: float = 8000,
    land_mask: Image.Image | Path | None = None,
) -> TileReport:
    bounds = _validate_bounds(bounds)
    zoom_values = _validated_zooms(zooms)
    if tile_size <= 0:
        raise MapImportError("DEM 瓦片尺寸必须为正整数")
    if min_elevation >= max_elevation:
        raise MapImportError("DEM 最大高程必须大于最小高程")
    source_image = _open_copy(heightmap)
    source = np.array(source_image, dtype=np.float32)
    if source.ndim != 2:
        source_image.close()
        raise MapImportError("DEM 高度图必须是单通道 16 位图像")

    min_x, min_y, max_x, max_y = bounds
    left, top = max(0, int(np.floor(min_x))), max(0, int(np.floor(min_y)))
    right = min(source.shape[1], int(np.ceil(max_x)))
    bottom = min(source.shape[0], int(np.ceil(max_y)))
    cropped_source = source[top:bottom, left:right].copy()
    if cropped_source.size == 0:
        source_image.close()
        raise MapImportError("DEM 范围超出高度图")

    mask_image: Image.Image | None = None
    if land_mask is not None:
        mask_image = _open_copy(land_mask).convert("L")
        if mask_image.size == source_image.size:
            cropped_mask = np.asarray(mask_image.crop((left, top, right, bottom)), dtype=np.uint8)
        elif mask_image.size == (cropped_source.shape[1], cropped_source.shape[0]):
            cropped_mask = np.asarray(mask_image, dtype=np.uint8)
        else:
            mask_image.close()
            source_image.close()
            raise MapImportError("DEM 陆地蒙版尺寸必须匹配高度图或裁剪范围")
        water = cropped_mask == 0
        if np.any(water):
            water_height = float(np.median(cropped_source[water]))
            cropped_source[water] = water_height

    local_bounds = (0.0, 0.0, float(cropped_source.shape[1]), float(cropped_source.shape[0]))
    elevation_image = Image.fromarray(
        height_value_to_elevation(cropped_source, min_elevation, max_elevation).astype(np.float32),
    )
    staging = _staging_directory(output)
    files: list[str] = []
    try:
        for zoom in zoom_values:
            count = 1 << zoom
            for tile_x in range(count):
                for tile_y in range(count):
                    tile_bounds = _tile_bounds(local_bounds, zoom, tile_x, tile_y)
                    sample_bounds = _shared_edge_sample_bounds(tile_bounds, tile_size)
                    resized = elevation_image.transform(
                        (tile_size, tile_size),
                        Image.Transform.EXTENT,
                        sample_bounds,
                        Image.Resampling.BILINEAR,
                    )
                    encoded = encode_terrain_rgb(np.asarray(resized, dtype=np.float32))
                    relative = Path(str(zoom)) / str(tile_x) / f"{tile_y}.png"
                    target = staging / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    Image.fromarray(encoded).save(target, format="PNG", optimize=True)
                    files.append(relative.as_posix())
        try:
            _atomic_publish(staging, output)
        except PermissionError:
            # DrvFS can reject directory replacement even when all staged files
            # are complete. DEM is an independent generated cache, so publish
            # the finished tree with a copy fallback rather than partial writes.
            if output.exists():
                shutil.rmtree(output)
            shutil.copytree(staging, output)
            shutil.rmtree(staging)
    except Exception:
        if staging.exists():
            shutil.rmtree(staging)
        raise
    finally:
        elevation_image.close()
        if mask_image is not None:
            mask_image.close()
        source_image.close()
    return TileReport("dem", len(files), zoom_values[0], zoom_values[-1], tuple(files))
