from __future__ import annotations

import shutil
from pathlib import Path
from typing import Iterable

from PIL import Image

from .material_catalog import TerrainMaterial, TerrainMaterialInputs
from .material_compositor import render_material_tile
from .material_sources import MaterialSourceRoots, MaterialTextureCache
from .models import MapImportError, TileReport
from .tiles import (
    MapBoundsTuple, _atomic_publish, _staging_directory, _tile_bounds,
    _validate_bounds, _validated_zooms,
)


def build_material_terrain_tiles(
    inputs: TerrainMaterialInputs,
    materials: tuple[TerrainMaterial, ...],
    roots: MaterialSourceRoots,
    bounds: MapBoundsTuple,
    map_size: tuple[int, int],
    output: Path,
    zooms: Iterable[int] = range(6),
    tile_size: int = 512,
) -> TileReport:
    bounds = _validate_bounds(bounds)
    zoom_values = _validated_zooms(zooms)
    if tile_size <= 0:
        raise MapImportError("地形材质瓦片尺寸必须为正整数")
    staging = _staging_directory(output)
    files: list[str] = []
    index_image: Image.Image | None = None
    intensity_image: Image.Image | None = None
    textures = MaterialTextureCache(roots)
    try:
        index_image = Image.open(inputs.index_map)
        intensity_image = Image.open(inputs.intensity_map)
        if index_image.mode != "RGBA" or intensity_image.mode != "RGBA":
            raise MapImportError("地形材质索引图与权重图必须为 RGBA")
        for zoom in zoom_values:
            count = 1 << zoom
            for tile_x in range(count):
                for tile_y in range(count):
                    source_bounds = _tile_bounds(bounds, zoom, tile_x, tile_y)
                    index_tile = index_image.transform(
                        (tile_size, tile_size), Image.Transform.EXTENT, source_bounds,
                        Image.Resampling.NEAREST,
                    )
                    intensity_tile = intensity_image.transform(
                        (tile_size, tile_size), Image.Transform.EXTENT, source_bounds,
                        Image.Resampling.BILINEAR,
                    )
                    tile = render_material_tile(
                        index_tile, intensity_tile, materials, textures,
                        source_bounds, map_size, tile_size,
                    )
                    relative = Path(str(zoom)) / str(tile_x) / f"{tile_y}.webp"
                    target = staging / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    tile.save(target, format="WEBP", quality=88, method=6)
                    tile.close()
                    index_tile.close()
                    intensity_tile.close()
                    files.append(relative.as_posix())
        _atomic_publish(staging, output)
    except Exception:
        if staging.exists():
            shutil.rmtree(staging)
        raise
    finally:
        textures.close()
        if index_image is not None:
            index_image.close()
        if intensity_image is not None:
            intensity_image.close()
    return TileReport("materialTerrain", len(files), zoom_values[0], zoom_values[-1], tuple(files))
