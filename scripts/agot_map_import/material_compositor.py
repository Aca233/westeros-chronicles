from __future__ import annotations

from typing import Protocol

import numpy as np
from PIL import Image

from .material_catalog import TerrainMaterial
from .models import MapImportError


class TextureProvider(Protocol):
    def get(self, material: TerrainMaterial) -> Image.Image: ...


def validate_material_index_weights(
    index_image: Image.Image,
    intensity_image: Image.Image,
    material_count: int,
    chunk_rows: int = 256,
) -> None:
    if material_count <= 0:
        raise MapImportError("地形材质目录不能为空")
    if index_image.size != intensity_image.size:
        raise MapImportError("地形材质索引图与权重图尺寸必须一致")
    if chunk_rows <= 0:
        raise MapImportError("地形材质校验分块高度必须为正整数")
    width, height = index_image.size
    for top in range(0, height, chunk_rows):
        box = (0, top, width, min(height, top + chunk_rows))
        with index_image.crop(box).convert("RGBA") as index_chunk:
            indices = np.asarray(index_chunk, dtype=np.uint8)
        with intensity_image.crop(box).convert("RGBA") as intensity_chunk:
            weights = np.asarray(intensity_chunk, dtype=np.uint8)
        invalid_active = (indices >= material_count) & (weights > 0)
        if np.any(invalid_active):
            invalid_index = int(indices[invalid_active].max())
            raise MapImportError(f"地形材质索引越界：{invalid_index} >= {material_count}")


def normalize_weights(weights: np.ndarray) -> np.ndarray:
    values = np.asarray(weights, dtype=np.float64)
    if values.shape[-1] != 4:
        raise MapImportError("地形材质权重必须包含 RGBA 四个通道")
    sums = values.sum(axis=-1, keepdims=True)
    normalized = np.divide(values, sums, out=np.zeros_like(values), where=sums > 0)
    zero = np.squeeze(sums <= 0, axis=-1)
    if np.any(zero):
        normalized[..., 0] = np.where(zero, 1.0, normalized[..., 0])
    return normalized


def srgb_to_linear(values: np.ndarray) -> np.ndarray:
    colours = np.clip(np.asarray(values, dtype=np.float64), 0.0, 1.0)
    return np.where(colours <= 0.04045, colours / 12.92, ((colours + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(values: np.ndarray) -> np.ndarray:
    colours = np.clip(np.asarray(values, dtype=np.float64), 0.0, 1.0)
    return np.where(colours <= 0.0031308, colours * 12.92, 1.055 * colours ** (1 / 2.4) - 0.055)


def _resize_weight_channels(image: Image.Image, size: tuple[int, int]) -> np.ndarray:
    rgba = image.convert("RGBA")
    resized: list[Image.Image] = []
    try:
        resized = [channel.resize(size, Image.Resampling.BILINEAR) for channel in rgba.split()]
        return np.stack([np.asarray(channel, dtype=np.uint8) for channel in resized], axis=-1)
    finally:
        for channel in resized:
            channel.close()
        rgba.close()


def _sample_wrapped(
    texture: Image.Image,
    source_bounds: tuple[float, float, float, float],
    map_size: tuple[int, int],
    tile_factor: float,
    tile_size: int,
) -> np.ndarray:
    left, top, right, bottom = source_bounds
    map_width, map_height = map_size
    if map_width <= 0 or map_height <= 0:
        raise MapImportError("地形材质地图尺寸必须为正数")
    pixels = np.asarray(texture, dtype=np.float64) / 255.0
    texture_height, texture_width = pixels.shape[:2]
    map_x = left + (np.arange(tile_size, dtype=np.float64) + 0.5) * (right - left) / tile_size
    map_y = top + (np.arange(tile_size, dtype=np.float64) + 0.5) * (bottom - top) / tile_size
    sample_x = np.mod(map_x / map_width * tile_factor, 1.0) * texture_width - 0.5
    sample_y = np.mod(map_y / map_width * tile_factor, 1.0) * texture_height - 0.5
    x0_raw = np.floor(sample_x).astype(np.int64)
    y0_raw = np.floor(sample_y).astype(np.int64)
    x_fraction = (sample_x - x0_raw)[None, :, None]
    y_fraction = (sample_y - y0_raw)[:, None, None]
    x0 = np.mod(x0_raw, texture_width)
    x1 = np.mod(x0_raw + 1, texture_width)
    y0 = np.mod(y0_raw, texture_height)
    y1 = np.mod(y0_raw + 1, texture_height)
    top_row = pixels[y0[:, None], x0[None, :]] * (1 - x_fraction) + pixels[y0[:, None], x1[None, :]] * x_fraction
    bottom_row = pixels[y1[:, None], x0[None, :]] * (1 - x_fraction) + pixels[y1[:, None], x1[None, :]] * x_fraction
    return top_row * (1 - y_fraction) + bottom_row * y_fraction


def render_material_tile(
    index_crop: Image.Image,
    intensity_crop: Image.Image,
    materials: tuple[TerrainMaterial, ...],
    textures: TextureProvider,
    source_bounds: tuple[float, float, float, float],
    map_size: tuple[int, int],
    tile_size: int,
) -> Image.Image:
    if tile_size <= 0:
        raise MapImportError("地形材质瓦片尺寸必须为正整数")
    if not materials:
        raise MapImportError("地形材质目录不能为空")
    indices = np.asarray(
        index_crop.convert("RGBA").resize((tile_size, tile_size), Image.Resampling.NEAREST),
        dtype=np.uint8,
    )
    sampled_weights = _resize_weight_channels(intensity_crop, (tile_size, tile_size))
    valid_channels = indices < len(materials)
    weights = normalize_weights(np.where(valid_channels, sampled_weights, 0))
    zero_valid_weight = np.sum(np.where(valid_channels, sampled_weights, 0), axis=-1) <= 0
    if np.any(zero_valid_weight):
        indices[..., 0] = np.where(zero_valid_weight, 0, indices[..., 0])
    active = (weights > 0) & (indices < len(materials))
    active_indices = indices[active]

    output = np.zeros((tile_size, tile_size, 3), dtype=np.float64)
    for material_index in np.unique(active_indices):
        material = materials[int(material_index)]
        material_weight = np.where(indices == material_index, weights, 0).sum(axis=-1)
        if not np.any(material_weight > 0):
            continue
        sampled = _sample_wrapped(textures.get(material), source_bounds, map_size, material.tile_factor, tile_size)
        output += srgb_to_linear(sampled) * material_weight[..., None]
    encoded = np.rint(linear_to_srgb(output) * 255).clip(0, 255).astype(np.uint8)
    return Image.fromarray(encoded, mode="RGB")
