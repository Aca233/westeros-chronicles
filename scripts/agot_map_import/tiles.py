from __future__ import annotations

import os
import shutil
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping, Sequence

import mapbox_vector_tile
from PIL import Image
from shapely import make_valid
from shapely.geometry import box, mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.strtree import STRtree

from .models import MapImportError, TileReport


MapBoundsTuple = tuple[float, float, float, float]


def _validated_zooms(zooms: Iterable[int]) -> tuple[int, ...]:
    values = tuple(sorted(set(int(zoom) for zoom in zooms)))
    if not values or values[0] < 0 or values[-1] > 12:
        raise MapImportError("瓦片缩放级别必须位于 0 到 12")
    return values


def _validate_bounds(bounds: MapBoundsTuple) -> MapBoundsTuple:
    min_x, min_y, max_x, max_y = (float(value) for value in bounds)
    if min_x >= max_x or min_y >= max_y:
        raise MapImportError(f"地图裁剪范围无效：{bounds}")
    return min_x, min_y, max_x, max_y


def _open_copy(image: Image.Image | Path) -> Image.Image:
    if isinstance(image, Path):
        with Image.open(image) as opened:
            return opened.copy()
    return image.copy()


def _tile_bounds(bounds: MapBoundsTuple, zoom: int, tile_x: int, tile_y: int) -> MapBoundsTuple:
    min_x, min_y, max_x, max_y = bounds
    count = 1 << zoom
    width = (max_x - min_x) / count
    height = (max_y - min_y) / count
    return (
        min_x + tile_x * width,
        min_y + tile_y * height,
        min_x + (tile_x + 1) * width,
        min_y + (tile_y + 1) * height,
    )


def _atomic_publish(staging: Path, output: Path) -> None:
    backup = output.with_name(f".{output.name}.backup-{uuid.uuid4().hex}")
    moved_previous = False
    try:
        if output.exists():
            os.replace(output, backup)
            moved_previous = True
        os.replace(staging, output)
    except Exception:
        if moved_previous and backup.exists() and not output.exists():
            os.replace(backup, output)
        raise
    finally:
        if backup.exists():
            shutil.rmtree(backup)


def _staging_directory(output: Path) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    return Path(tempfile.mkdtemp(prefix=f".{output.name}-", dir=output.parent))


def build_terrain_tiles(
    flatmap: Image.Image | Path,
    bounds: MapBoundsTuple,
    output: Path,
    zooms: Iterable[int],
    tile_size: int = 512,
) -> TileReport:
    bounds = _validate_bounds(bounds)
    zoom_values = _validated_zooms(zooms)
    if tile_size <= 0:
        raise MapImportError("地形瓦片尺寸必须为正整数")
    source = _open_copy(flatmap).convert("RGB")
    staging = _staging_directory(output)
    files: list[str] = []
    try:
        for zoom in zoom_values:
            count = 1 << zoom
            for tile_x in range(count):
                for tile_y in range(count):
                    tile_bounds = _tile_bounds(bounds, zoom, tile_x, tile_y)
                    tile = source.crop(tile_bounds).resize((tile_size, tile_size), Image.Resampling.LANCZOS)
                    relative = Path(str(zoom)) / str(tile_x) / f"{tile_y}.webp"
                    target = staging / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    tile.save(target, format="WEBP", quality=88, method=6)
                    files.append(relative.as_posix())
        _atomic_publish(staging, output)
    except Exception:
        if staging.exists():
            shutil.rmtree(staging)
        raise
    finally:
        source.close()
    return TileReport("terrain", len(files), zoom_values[0], zoom_values[-1], tuple(files))


def _feature_geometry(feature: Mapping[str, object]) -> BaseGeometry:
    value = feature.get("geometry")
    if isinstance(value, BaseGeometry):
        geometry = value
    elif isinstance(value, Mapping):
        geometry = shape(value)
    else:
        raise MapImportError("矢量要素缺少合法 geometry")
    return make_valid(geometry)


@dataclass(frozen=True, slots=True)
class _PreparedLayer:
    name: str
    features: tuple[Mapping[str, object], ...]
    geometries: tuple[BaseGeometry, ...]
    tree: STRtree


def _prepare_layers(layers: Mapping[str, Sequence[Mapping[str, object]]]) -> tuple[_PreparedLayer, ...]:
    prepared: list[_PreparedLayer] = []
    for layer_name in sorted(layers):
        features = tuple(layers[layer_name])
        geometries = tuple(_feature_geometry(feature) for feature in features)
        if geometries:
            prepared.append(_PreparedLayer(layer_name, features, geometries, STRtree(geometries)))
    return tuple(prepared)


def _tile_layers(
    layers: Sequence[_PreparedLayer],
    tile_bounds: MapBoundsTuple,
    tolerance: float,
) -> list[dict[str, object]]:
    clipping_box = box(*tile_bounds)
    encoded_layers: list[dict[str, object]] = []
    for layer in layers:
        features: list[dict[str, object]] = []
        for feature_index in layer.tree.query(clipping_box, predicate="intersects"):
            feature = layer.features[int(feature_index)]
            geometry = layer.geometries[int(feature_index)]
            if geometry.is_empty or not geometry.intersects(clipping_box):
                continue
            clipped = make_valid(geometry.intersection(clipping_box))
            if tolerance > 0:
                clipped = clipped.simplify(tolerance, preserve_topology=True)
            if clipped.is_empty:
                continue
            encoded: dict[str, object] = {
                "geometry": mapping(clipped),
                "properties": dict(feature.get("properties") or {}),
            }
            feature_id = feature.get("id")
            if isinstance(feature_id, int) and feature_id >= 0:
                encoded["id"] = feature_id
            features.append(encoded)
        if features:
            encoded_layers.append({"name": layer.name, "features": features})
    return encoded_layers


def build_vector_tiles(
    layers: Mapping[str, Sequence[Mapping[str, object]]],
    bounds: MapBoundsTuple,
    output: Path,
    zooms: Iterable[int],
) -> TileReport:
    bounds = _validate_bounds(bounds)
    zoom_values = _validated_zooms(zooms)
    prepared_layers = _prepare_layers(layers)
    staging = _staging_directory(output)
    files: list[str] = []
    try:
        for zoom in zoom_values:
            count = 1 << zoom
            for tile_x in range(count):
                for tile_y in range(count):
                    tile_bounds = _tile_bounds(bounds, zoom, tile_x, tile_y)
                    tolerance = max(
                        (tile_bounds[2] - tile_bounds[0]) / 8192,
                        (tile_bounds[3] - tile_bounds[1]) / 8192,
                    )
                    encoded_layers = _tile_layers(prepared_layers, tile_bounds, tolerance)
                    if not encoded_layers:
                        continue
                    data = mapbox_vector_tile.encode(
                        encoded_layers,
                        default_options={
                            "quantize_bounds": tile_bounds,
                            "extents": 4096,
                            "y_coord_down": True,
                        },
                    )
                    relative = Path(str(zoom)) / str(tile_x) / f"{tile_y}.pbf"
                    target = staging / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
                    files.append(relative.as_posix())
        _atomic_publish(staging, output)
    except Exception:
        if staging.exists():
            shutil.rmtree(staging)
        raise
    return TileReport("vector", len(files), zoom_values[0], zoom_values[-1], tuple(files))
