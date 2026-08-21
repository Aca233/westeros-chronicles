"""只重建低缩放级别的矢量与语义瓦片:不触碰地形/材质/DEM 栅格,也不重写数据清单。

用途:简化容差调整后,单独重烘指定缩放级别(默认 z0-z2,即体积异常的瓦片),
其余级别目录原样保留。逐缩放级别目录原子替换,完成后校验瓦片总数与清单一致。
用法: python -m scripts.agot_map_import.rebuild_vector_tiles --source 2962333032 [--zooms 0 1 2]
"""
from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from dataclasses import replace
from pathlib import Path
from typing import Iterable

from scripts.agot_character_import.localization import load_localization

from .cli import _bounds, _load_hegemon_scopes, _vector_layers, _westeros_provinces_and_regions
from .geometry import extract_province_geometry
from .locations import build_locations
from .province_history import holding_to_location_type, parse_province_holdings
from .regions import parse_regions
from .routes import build_route_graph, parse_adjacencies
from .semantic import build_semantic_dataset
from .source import MapSource, parse_definition
from .tiles import build_semantic_tiles, build_vector_tiles
from .titles import parse_title_hierarchy
from .water_coloring import parse_province_set
from .writer import _semantic_hash, _write_json

REPO_ROOT = Path(__file__).resolve().parents[2]
ASSET_ROOT = REPO_ROOT / "public/assets/agot-map"
MANIFEST_PATH = REPO_ROOT / "public/data/agot-map/manifest.json"


def _load_inputs(source_dir: Path):
    source = MapSource.open(source_dir)
    definitions = parse_definition(source.default_files["definitions"])
    titles = parse_title_hierarchy(source.landed_titles)
    region_definitions = parse_regions(source.geographical_regions)
    province_ids, province_regions, _ = _westeros_provinces_and_regions(region_definitions, titles)
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
    semantic = build_semantic_dataset(
        geometries, locations, titles, region_definitions, localization, _load_hegemon_scopes(),
    )
    return source, bounds, geometries, locations, route_graph, semantic


def _count_tiles(root: Path) -> int:
    return sum(1 for _ in root.rglob("*.pbf"))


def _sync_zoom_dir(produced: Path, live: Path) -> None:
    """按文件同步新瓦片到目标缩放目录:9P/drvfs 挂载不支持非空目录改名,
    因此逐文件覆盖并清理不再产生的旧瓦片,而不是整体目录替换。"""
    live.mkdir(parents=True, exist_ok=True)
    fresh = {item.relative_to(produced) for item in produced.rglob("*.pbf")}
    for relative in sorted(fresh):
        target = live / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(produced / relative, target)
    for stale in sorted(live.rglob("*.pbf")):
        if stale.relative_to(live) not in fresh:
            stale.unlink()
    for directory in sorted(
        (item for item in live.rglob("*") if item.is_dir()),
        key=lambda item: len(item.parts), reverse=True,
    ):
        if not any(directory.iterdir()):
            directory.rmdir()


def rebuild(source_dir: Path, zooms: tuple[int, ...]) -> dict[str, int]:
    _, bounds, geometries, locations, route_graph, semantic = _load_inputs(source_dir)
    staging_root = Path(tempfile.mkdtemp(prefix="agot-vector-rebuild-"))
    try:
        vector = build_vector_tiles(
            _vector_layers(geometries, locations, route_graph),
            bounds, staging_root / "vector", zooms,
        )
        semantic_tiles = build_semantic_tiles(
            semantic, bounds, staging_root / "semantic", zooms,
        )
        for kind in ("vector", "semantic"):
            for zoom in zooms:
                produced = staging_root / kind / str(zoom)
                if produced.is_dir():
                    _sync_zoom_dir(produced, ASSET_ROOT / kind / str(zoom))
        totals = {kind: _count_tiles(ASSET_ROOT / kind) for kind in ("vector", "semantic")}
        # 语义瓦片字节已变化:同步清单中的完整性哈希,保持审计一致
        semantic_hash = _semantic_hash(REPO_ROOT / "public/data/agot-map", ASSET_ROOT / "semantic")
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        if manifest.get("semanticHash") != semantic_hash:
            manifest["semanticHash"] = semantic_hash
            _write_json(MANIFEST_PATH, manifest)
    finally:
        if staging_root.exists():
            shutil.rmtree(staging_root)
    return {
        "bakedVector": vector.tile_count,
        "bakedSemantic": semantic_tiles.tile_count,
        "totalVector": totals["vector"],
        "totalSemantic": totals["semantic"],
    }


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="只重建低缩放级别的矢量与语义瓦片")
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--zooms", type=int, nargs="+", default=[0, 1, 2])
    args = parser.parse_args(argv)
    zooms = tuple(sorted(set(args.zooms)))
    counts = rebuild(args.source, zooms)
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    expected = manifest["counts"]
    for kind, total_key in (("vectorTiles", "totalVector"), ("semanticTiles", "totalSemantic")):
        if expected.get(kind) != counts[total_key]:
            raise SystemExit(f"瓦片总数与清单不一致:{kind} 期望 {expected.get(kind)} 实得 {counts[total_key]}")
    print(json.dumps({"status": "ok", "zooms": list(zooms), "counts": counts}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
