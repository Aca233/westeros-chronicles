from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from dataclasses import replace
from pathlib import Path
from typing import Iterable

from shapely.geometry import LineString, Point, mapping

from scripts.agot_character_import.localization import load_localization

from .dem import build_dem_tiles
from .geometry import extract_province_geometry
from .locations import build_locations
from .material_catalog import parse_material_catalog
from .material_sources import MaterialSourceRoots, resolve_diffuse
from .material_tiles import build_material_terrain_tiles
from .models import MapImportError, MapLocationRecord, ProvinceGeometry
from .province_history import holding_to_location_type, parse_province_holdings
from .regions import expand_region, parse_regions
from .routes import build_route_graph, parse_adjacencies
from .semantic import build_semantic_dataset
from .source import MapSource, parse_definition
from .tiles import _staging_directory, build_semantic_tiles, build_terrain_tiles, build_vector_tiles
from .titles import TitleIndex, parse_title_hierarchy
from .writer import publish_map_pair, stage_map_dataset
from .water_coloring import (
    colorize_material_terrain_tiles, parse_province_set, parse_water_province_sets,
)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()



def _title_member_index(titles: TitleIndex) -> dict[str, set[int]]:
    province_by_barony = {barony: province for province, barony in titles.province_baronies.items()}
    output: dict[str, set[int]] = {}
    for barony, ancestors in titles.by_barony.items():
        province_id = province_by_barony.get(barony)
        if province_id is None:
            continue
        for title_id in (barony, ancestors.county_id, ancestors.duchy_id, ancestors.kingdom_id):
            if title_id:
                output.setdefault(title_id, set()).add(province_id)
    return output


def _member_provinces(member: str, title_members: dict[str, set[int]]) -> set[int]:
    if member.isdigit():
        return {int(member)}
    return title_members.get(member, set())


def _westeros_provinces_and_regions(
    region_definitions,
    titles: TitleIndex,
) -> tuple[set[int], dict[int, str], list[dict[str, object]]]:
    if "world_westeros" not in region_definitions:
        raise MapImportError("地理区域缺少 world_westeros")
    title_members = _title_member_index(titles)
    province_regions: dict[int, str] = {}
    records: list[dict[str, object]] = []
    top_level = region_definitions["world_westeros"].regions
    for region_id in top_level:
        members = expand_region(region_id, region_definitions)
        province_ids: set[int] = set()
        for member in members:
            province_ids.update(_member_provinces(member, title_members))
        for province_id in province_ids:
            existing = province_regions.get(province_id)
            if existing and existing != region_id:
                raise MapImportError(f"省份 {province_id} 同时属于 {existing} 与 {region_id}")
            province_regions[province_id] = region_id
        records.append({"id": region_id, "name": region_id, "provinceCount": len(province_ids)})
    direct_members = expand_region("world_westeros", region_definitions)
    all_provinces = set(province_regions)
    for member in direct_members:
        all_provinces.update(_member_provinces(member, title_members))
    for province_id in all_provinces:
        province_regions.setdefault(province_id, "world_westeros")
    records.insert(0, {"id": "world_westeros", "name": "维斯特洛", "provinceCount": len(all_provinces)})
    return all_provinces, province_regions, records


def _bounds(geometries: dict[int, ProvinceGeometry], map_size: tuple[int, int]) -> tuple[int, int, int, int]:
    min_x = max(0, min(item.bbox[0] for item in geometries.values()) - 16)
    min_y = max(0, min(item.bbox[1] for item in geometries.values()) - 16)
    max_x = min(map_size[0], max(item.bbox[2] for item in geometries.values()) + 16)
    max_y = min(map_size[1], max(item.bbox[3] for item in geometries.values()) + 16)
    return min_x, min_y, max_x, max_y


def _vector_layers(
    geometries: dict[int, ProvinceGeometry],
    locations: list[MapLocationRecord],
    route_graph,
) -> dict[str, list[dict[str, object]]]:
    provinces = [{
        "id": province_id,
        "geometry": mapping(item.geometry),
        "properties": {"provinceId": province_id, "baronyId": item.barony_id, "regionId": item.region_id},
    } for province_id, item in sorted(geometries.items())]
    borders = [{
        "id": province_id,
        "geometry": mapping(item.geometry.boundary),
        "properties": {"provinceId": province_id, "regionId": item.region_id},
    } for province_id, item in sorted(geometries.items())]
    location_features = [{
        "id": index + 1,
        "geometry": mapping(Point(location.map_x, location.map_y)),
        "properties": {"id": location.id, "name": location.name, "type": location.type, "importance": location.importance},
    } for index, location in enumerate(sorted(locations, key=lambda item: item.id))]
    node_by_id = {node.id: node for node in route_graph.nodes}
    undirected = [edge for edge in route_graph.edges if edge.from_id < edge.to_id]
    route_features = [{
        "id": index + 1,
        "geometry": mapping(LineString([
            (node_by_id[edge.from_id].map_x, node_by_id[edge.from_id].map_y),
            (node_by_id[edge.to_id].map_x, node_by_id[edge.to_id].map_y),
        ])),
        "properties": {"id": edge.id, "crossing": edge.crossing, "roadLevel": edge.road_level},
    } for index, edge in enumerate(undirected)]
    roads = [feature for feature, edge in zip(route_features, undirected) if edge.road_level != "none"]
    return {
        "provinces": provinces,
        "borders": borders,
        "roads": roads,
        "routes": route_features,
        "locations": location_features,
        "labels": location_features,
    }


def _source_hashes(
    source: MapSource,
    ck3_source: Path | None = None,
    include_material_textures: bool = False,
) -> dict[str, str]:
    paths = [
        source.default_files["definitions"], source.default_files["provinces"],
        source.default_files["rivers"], source.default_files["adjacencies"],
        source.heightmap, source.road_mask, source.root / "map_data/default.map",
        source.root / "gfx/map/terrain/flat_maps/flatmap.dds",
        source.terrain_materials.index_map,
        source.terrain_materials.intensity_map,
        source.terrain_materials.settings,
    ]
    paths.extend(sorted(source.geographical_regions.glob("*.txt")))
    paths.extend(sorted(source.landed_titles.glob("*.txt")))
    paths.extend(sorted((source.root / "history/provinces").glob("*.txt")))
    hashes = {path.relative_to(source.root).as_posix(): _sha256(path) for path in paths if path.is_file()}
    if include_material_textures:
        if ck3_source is None:
            raise MapImportError("地形材质源哈希需要 --ck3-source")
        roots = MaterialSourceRoots(agot=source.root, ck3=ck3_source)
        for material in parse_material_catalog(source.terrain_materials.settings, default_tile_factor=64):
            path = resolve_diffuse(material, roots)
            try:
                key = f"agot/{path.relative_to(source.root.resolve()).as_posix()}"
            except ValueError:
                key = f"ck3/{path.relative_to(ck3_source.resolve()).as_posix()}"
            hashes[key] = _sha256(path)
    return dict(sorted(hashes.items()))


def build_map(args: argparse.Namespace) -> dict[str, object]:
    expected_size = tuple(args.expected_size) if args.expected_size else None
    source = MapSource.open(args.source, expected_size=expected_size)
    definitions = parse_definition(source.default_files["definitions"])
    titles = parse_title_hierarchy(source.landed_titles)
    region_definitions = parse_regions(source.geographical_regions)
    province_ids, province_regions, region_records = _westeros_provinces_and_regions(region_definitions, titles)
    province_ids &= set(definitions)
    geometries = extract_province_geometry(source.default_files["provinces"], definitions, province_ids)
    adjacency_rows = parse_adjacencies(source.default_files["adjacencies"])
    sea_provinces = {
        int(row[key])
        for row in adjacency_rows if row.get("Type", "").lower() == "sea"
        for key in ("From", "To") if row.get(key, "").isdigit()
    }
    geometries = {
        province_id: replace(
            geometry,
            region_id=province_regions.get(province_id, "world_westeros"),
            terrain="land",
            is_coastal=province_id in sea_provinces,
        )
        for province_id, geometry in geometries.items()
    }
    bounds = _bounds(geometries, source.map_size)
    localization_paths = list((source.root / "localization/simp_chinese").rglob("*.yml"))
    localization_paths.extend((source.root / "localization/replace/simp_chinese").rglob("*.yml"))
    localization = load_localization(sorted(localization_paths))
    for record in region_records:
        record["name"] = localization.get(str(record["id"]), record["name"])
    overrides = json.loads((Path(__file__).with_name("overrides.json")).read_text(encoding="utf-8"))
    locations = build_locations(geometries, titles, localization, overrides)
    province_holdings = parse_province_holdings(source.root / "history/provinces")
    locations = [
        replace(
            location,
            type=(location.type if "type" in overrides.get(location.id, {}) else holding_to_location_type(province_holdings.get(location.province_id))),
            is_port=(location.is_port or location.province_id in sea_provinces),
            is_coastal=(location.is_coastal or location.province_id in sea_provinces),
        )
        for location in locations
    ]
    default_text = (source.root / "map_data/default.map").read_text(encoding="utf-8-sig", errors="replace")
    impassable = parse_province_set(default_text, "impassable_mountains") | parse_province_set(default_text, "impassable_seas")
    route_graph = build_route_graph(
        locations, geometries, adjacency_rows, source.road_mask,
        source.default_files["rivers"], impassable,
    )

    anchors = json.loads(Path(__file__).with_name("semantic_anchors.json").read_text(encoding="utf-8"))
    semantic = build_semantic_dataset(
        geometries, locations, titles, region_definitions, localization, anchors,
    )
    political = [{
        "baronyId": location.id,
        "provinceId": location.province_id,
        "countyId": location.county_id,
        "duchyId": location.duchy_id,
        "kingdomId": location.kingdom_id,
    } for location in locations]

    asset_stage = _staging_directory(args.asset_output)
    data_stage = _staging_directory(args.data_output)
    try:
        if args.skip_tiles:
            tile_counts = {"terrain": 0, "materialTerrain": 0, "vector": 0, "dem": 0, "semantic": 0}
        else:
            if args.ck3_source is None or not (args.ck3_source / "gfx/map/terrain").is_dir():
                raise MapImportError("生成地形材质瓦片需要有效的 --ck3-source")
            raster_zooms = range(0, args.max_raster_zoom + 1)
            material_zooms = range(0, args.max_material_zoom + 1)
            vector_zooms = range(0, args.max_vector_zoom + 1)
            terrain = build_terrain_tiles(
                source.root / "gfx/map/terrain/flat_maps/flatmap.dds",
                bounds, asset_stage / "terrain", raster_zooms, args.tile_size,
            )
            vector = build_vector_tiles(
                _vector_layers(geometries, locations, route_graph),
                bounds, asset_stage / "vector", vector_zooms,
            )
            dem = build_dem_tiles(source.heightmap, bounds, asset_stage / "dem", raster_zooms, args.tile_size)
            material_terrain = build_material_terrain_tiles(
                source.terrain_materials,
                parse_material_catalog(source.terrain_materials.settings, default_tile_factor=64),
                MaterialSourceRoots(agot=source.root, ck3=args.ck3_source),
                bounds, source.map_size, asset_stage / "material-terrain",
                material_zooms, args.tile_size,
            )
            colored_tile_count = colorize_material_terrain_tiles(
                asset_stage / "material-terrain",
                source.default_files["provinces"],
                source.default_files["rivers"],
                definitions,
                parse_water_province_sets(default_text),
                bounds, material_zooms, args.tile_size,
            )
            if colored_tile_count != material_terrain.tile_count:
                raise MapImportError("水体着色后的地形材质瓦片数量不一致")
            semantic_tiles = build_semantic_tiles(
                semantic, bounds, asset_stage / "semantic", vector_zooms, args.tile_size,
            )
            tile_counts = {
                "terrain": terrain.tile_count, "vector": vector.tile_count,
                "materialTerrain": material_terrain.tile_count,
                "dem": dem.tile_count, "semantic": semantic_tiles.tile_count,
            }
        manifest = stage_map_dataset(
            output=data_stage,
            locations=locations,
            route_graph=route_graph,
            regions=region_records,
            political=political,
            source_hashes=_source_hashes(
                source, args.ck3_source, include_material_textures=not args.skip_tiles,
            ),
            map_size=source.map_size,
            westeros_bounds=bounds,
            tile_counts=tile_counts,
            semantic=semantic,
            semantic_tile_root=asset_stage / "semantic",
            min_zoom=0,
            max_zoom=args.max_vector_zoom,
        )
        publish_map_pair(data_stage, args.data_output, asset_stage, args.asset_output)
        return manifest
    except Exception:
        if data_stage.exists():
            shutil.rmtree(data_stage)
        if asset_stage.exists():
            shutil.rmtree(asset_stage)
        raise


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="离线生成 AGOT 维斯特洛地图")
    result.add_argument("--source", type=Path, required=True)
    result.add_argument("--ck3-source", type=Path)
    result.add_argument("--data-output", type=Path, required=True)
    result.add_argument("--asset-output", type=Path, required=True)
    result.add_argument("--max-raster-zoom", type=int, default=4)
    result.add_argument("--max-material-zoom", type=int, default=5)
    result.add_argument("--max-vector-zoom", type=int, default=6)
    result.add_argument("--tile-size", type=int, default=512)
    result.add_argument("--skip-tiles", action="store_true")
    result.add_argument("--expected-size", type=int, nargs=2)
    return result


def main(argv: Iterable[str] | None = None) -> int:
    args = parser().parse_args(argv)
    manifest = build_map(args)
    print(json.dumps({"status": "ok", "counts": manifest["counts"], "datasetHash": manifest["datasetHash"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
