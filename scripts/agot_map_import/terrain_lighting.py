from __future__ import annotations

import math
import shutil
from pathlib import Path
from typing import Iterable, Mapping

import numpy as np
from PIL import Image, ImageFilter

from .models import MapImportError, ProvinceDefinition, TileReport
from .tiles import MapBoundsTuple, _atomic_publish, _open_copy, _staging_directory, _tile_bounds, _validate_bounds, _validated_zooms


def terrain_land_mask(
    province_map: Image.Image | Path,
    bounds: MapBoundsTuple,
    definitions: Mapping[int, ProvinceDefinition],
    water_province_ids: Iterable[int],
) -> Image.Image:
    """Return an opaque-land/transparent-water mask for the cropped map."""
    min_x, min_y, max_x, max_y = _validate_bounds(bounds)
    opened = _open_copy(province_map).convert("RGB")
    try:
        left, top = max(0, int(math.floor(min_x))), max(0, int(math.floor(min_y)))
        right = min(opened.width, int(math.ceil(max_x)))
        bottom = min(opened.height, int(math.ceil(max_y)))
        cropped = np.asarray(opened.crop((left, top, right, bottom)), dtype=np.uint32)
    finally:
        opened.close()
    if cropped.size == 0:
        raise MapImportError("地形光照陆地蒙版范围超出省份图")

    water_lookup = np.zeros(1 << 24, dtype=np.bool_)
    for province_id in water_province_ids:
        definition = definitions.get(int(province_id))
        if definition is None:
            continue
        red, green, blue = definition.rgb
        water_lookup[(red << 16) | (green << 8) | blue] = True
    packed = (cropped[..., 0] << 16) | (cropped[..., 1] << 8) | cropped[..., 2]
    land = np.where(water_lookup[packed], 0, 255).astype(np.uint8)
    return Image.fromarray(land, mode="L")


def _box_blur_axis(values: np.ndarray, radius: int, axis: int) -> np.ndarray:
    if radius <= 0:
        return values.astype(np.float32, copy=True)
    padding = [(0, 0)] * values.ndim
    padding[axis] = (radius, radius)
    padded = np.pad(values, padding, mode="edge")
    cumulative = np.cumsum(padded, axis=axis, dtype=np.float32)
    zero_shape = list(cumulative.shape)
    zero_shape[axis] = 1
    cumulative = np.concatenate((np.zeros(zero_shape, dtype=np.float32), cumulative), axis=axis)
    window = radius * 2 + 1
    start = [slice(None)] * values.ndim
    stop = [slice(None)] * values.ndim
    start[axis] = slice(0, values.shape[axis])
    stop[axis] = slice(window, window + values.shape[axis])
    return (cumulative[tuple(stop)] - cumulative[tuple(start)]) / window


def _broad_relief(values: np.ndarray) -> np.ndarray:
    # Two float box passes approximate a broad Gaussian without quantising the
    # 16-bit heightmap to 8-bit bands. This deliberately removes CK3's tiny
    # stepped height noise before directional lighting is calculated.
    blurred = _box_blur_axis(values, 10, 1)
    blurred = _box_blur_axis(blurred, 10, 0)
    blurred = _box_blur_axis(blurred, 6, 1)
    return _box_blur_axis(blurred, 6, 0)


def _shared_edge_sample_bounds(
    tile_bounds: MapBoundsTuple, tile_size: int,
) -> MapBoundsTuple:
    left, top, right, bottom = tile_bounds
    if tile_size <= 1:
        return tile_bounds
    half_x = (right - left) / (tile_size - 1) * 0.5
    half_y = (bottom - top) / (tile_size - 1) * 0.5
    return left - half_x, top - half_y, right + half_x, bottom + half_y


def terrain_light_overlay(
    heightmap: Image.Image | Path,
    bounds: MapBoundsTuple,
    *,
    land_mask: Image.Image | Path | None = None,
    azimuth_degrees: float = 310,
    altitude_degrees: float = 35,
) -> Image.Image:
    """Build a transparent, world-anchored terrain-light overlay.

    The overlay intentionally exaggerates gradients for the cropped CK3 map. It
    changes only surface colour; the runtime DEM remains the authority for 3D
    geometry and elevation.
    """
    min_x, min_y, max_x, max_y = _validate_bounds(bounds)
    opened = _open_copy(heightmap)
    heightmap_size = opened.size
    try:
        source = np.asarray(opened, dtype=np.float32)
    finally:
        opened.close()
    if source.ndim != 2:
        raise MapImportError("地形光照高度图必须是单通道图像")

    left, top = max(0, int(math.floor(min_x))), max(0, int(math.floor(min_y)))
    right = min(source.shape[1], int(math.ceil(max_x)))
    bottom = min(source.shape[0], int(math.ceil(max_y)))
    cropped = source[top:bottom, left:right]
    if cropped.size == 0:
        raise MapImportError("地形光照范围超出高度图")

    # Use only broad, float-precision relief. The previous fine-gradient term
    # amplified one-pixel CK3 height steps into dirty yellow stripes.
    low = float(np.percentile(cropped, 1))
    span = max(float(np.percentile(cropped, 99) - low), 1.0)
    normalized = np.clip((cropped - low) / span, 0, 1).astype(np.float32)
    broad = _broad_relief(normalized)
    dy, dx = np.gradient(broad)

    slope_gain = 150.0
    nx = -dx * slope_gain
    ny = -dy * slope_gain
    nz = np.ones_like(nx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny, nz = nx / length, ny / length, nz / length

    azimuth = math.radians(azimuth_degrees)
    altitude = math.radians(altitude_degrees)
    horizontal = math.cos(altitude)
    sun_x = math.sin(azimuth) * horizontal
    sun_y = -math.cos(azimuth) * horizontal
    sun_z = math.sin(altitude)
    illumination = nx * sun_x + ny * sun_y + nz * sun_z

    # Remove the flat-ground response. Only directional relief remains.
    directional = np.clip((illumination - sun_z) / max(1.0 - sun_z, 1e-6), -1, 1)
    # Suppress tiny texture noise while keeping a deliberately visible result.
    magnitude = np.clip((np.abs(directional) - 0.035) / 0.48, 0, 1)
    highlight = np.clip(directional, 0, 1)
    shadow = np.clip(-directional, 0, 1)

    rgba = np.zeros((*cropped.shape, 4), dtype=np.uint8)
    warm = np.array([218, 207, 185], dtype=np.float32)
    cool = np.array([30, 35, 40], dtype=np.float32)
    is_highlight = highlight >= shadow
    rgba[..., :3] = np.where(is_highlight[..., None], warm, cool).astype(np.uint8)
    alpha = np.where(
        is_highlight,
        magnitude * 76,
        magnitude * 112,
    )
    if land_mask is not None:
        mask_image = _open_copy(land_mask).convert("L")
        try:
            if mask_image.size == heightmap_size:
                mask_image = mask_image.crop((left, top, right, bottom))
            elif mask_image.size != (cropped.shape[1], cropped.shape[0]):
                raise MapImportError("地形光照陆地蒙版尺寸必须匹配高度图或裁剪范围")
            # Pull the visible mask a couple of source pixels inland so height
            # discontinuities at the coastline cannot create a bright/dark halo.
            visible_land = np.asarray(mask_image.filter(ImageFilter.MinFilter(size=5)), dtype=np.uint8) > 0
        finally:
            mask_image.close()
        alpha = np.where(visible_land, alpha, 0)
    rgba[..., 3] = np.uint8(np.clip(alpha, 0, 255))
    return Image.fromarray(rgba, mode="RGBA")


def build_terrain_light_tiles(
    heightmap: Image.Image | Path,
    bounds: MapBoundsTuple,
    output: Path,
    zooms: Iterable[int],
    tile_size: int = 512,
    land_mask: Image.Image | Path | None = None,
    azimuth_degrees: float = 310,
    altitude_degrees: float = 35,
) -> TileReport:
    bounds = _validate_bounds(bounds)
    zoom_values = _validated_zooms(zooms)
    if tile_size <= 0:
        raise MapImportError("地形光照瓦片尺寸必须为正整数")
    overlay = terrain_light_overlay(
        heightmap,
        bounds,
        land_mask=land_mask,
        azimuth_degrees=azimuth_degrees,
        altitude_degrees=altitude_degrees,
    )
    local_bounds = (0.0, 0.0, float(overlay.width), float(overlay.height))
    staging = _staging_directory(output)
    files: list[str] = []
    try:
        for zoom in zoom_values:
            count = 1 << zoom
            for tile_x in range(count):
                for tile_y in range(count):
                    tile_bounds = _tile_bounds(local_bounds, zoom, tile_x, tile_y)
                    # Make neighbouring tiles sample the exact same world point
                    # at their shared edge. MapLibre clamps each tile texture at
                    # its edge; centre-only sampling otherwise repeats two
                    # different texels and exposes a visible grid when pitched.
                    sample_bounds = _shared_edge_sample_bounds(tile_bounds, tile_size)
                    tile = overlay.transform(
                        (tile_size, tile_size),
                        Image.Transform.EXTENT,
                        sample_bounds,
                        Image.Resampling.BILINEAR,
                    )
                    relative = Path(str(zoom)) / str(tile_x) / f"{tile_y}.webp"
                    target = staging / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    tile.save(target, format="WEBP", lossless=True, method=3, exact=True)
                    files.append(relative.as_posix())
        try:
            _atomic_publish(staging, output)
        except PermissionError:
            # DrvFS can reject directory replacement even when individual file
            # writes are allowed. This output is an independent generated cache,
            # so fall back to a complete copy after the staging set is finished.
            if output.exists():
                shutil.rmtree(output)
            shutil.copytree(staging, output)
            shutil.rmtree(staging)
    except Exception:
        if staging.exists():
            shutil.rmtree(staging)
        raise
    finally:
        overlay.close()
    return TileReport("terrainLight", len(files), zoom_values[0], zoom_values[-1], tuple(files))
