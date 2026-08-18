from __future__ import annotations

import shutil
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image

from .models import MapImportError, TileReport
from .tiles import MapBoundsTuple, _atomic_publish, _open_copy, _staging_directory, _tile_bounds, _validate_bounds, _validated_zooms


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


def build_dem_tiles(
    heightmap: Image.Image | Path,
    bounds: MapBoundsTuple,
    output: Path,
    zooms: Iterable[int],
    tile_size: int = 512,
    min_elevation: float = -500,
    max_elevation: float = 8000,
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
    staging = _staging_directory(output)
    files: list[str] = []
    try:
        for zoom in zoom_values:
            count = 1 << zoom
            for tile_x in range(count):
                for tile_y in range(count):
                    left, top, right, bottom = _tile_bounds(bounds, zoom, tile_x, tile_y)
                    crop = source[
                        max(0, int(np.floor(top))):min(source.shape[0], int(np.ceil(bottom))),
                        max(0, int(np.floor(left))):min(source.shape[1], int(np.ceil(right))),
                    ]
                    if crop.size == 0:
                        raise MapImportError(f"DEM 瓦片超出高度图范围：z{zoom}/{tile_x}/{tile_y}")
                    normalized = crop / 65535
                    elevation = min_elevation + normalized * (max_elevation - min_elevation)
                    resized = Image.fromarray(elevation.astype(np.float32)).resize(
                        (tile_size, tile_size), Image.Resampling.BILINEAR,
                    )
                    encoded = encode_terrain_rgb(np.asarray(resized, dtype=np.float32))
                    relative = Path(str(zoom)) / str(tile_x) / f"{tile_y}.png"
                    target = staging / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    Image.fromarray(encoded).save(target, format="PNG", optimize=True)
                    files.append(relative.as_posix())
        _atomic_publish(staging, output)
    except Exception:
        if staging.exists():
            shutil.rmtree(staging)
        raise
    finally:
        source_image.close()
    return TileReport("dem", len(files), zoom_values[0], zoom_values[-1], tuple(files))
