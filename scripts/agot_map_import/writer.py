from __future__ import annotations

import hashlib
import json
import re
import shutil
from dataclasses import asdict
from pathlib import Path
from typing import Mapping, Sequence

from .audit import audit_map_records
from .models import MapImportError, MapLocationRecord, RouteGraphRecord
from .tiles import _atomic_publish, _staging_directory


SAFE_SHARD = re.compile(r"[^a-zA-Z0-9_.-]+")


def _write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def _location_json(location: MapLocationRecord) -> dict[str, object]:
    value: dict[str, object] = {
        "id": location.id,
        "name": location.name,
        "type": location.type,
        "mapX": location.map_x,
        "mapY": location.map_y,
        "provinceId": location.province_id,
        "regionId": location.region_id,
        "terrain": location.terrain,
        "isCoastal": location.is_coastal,
        "isPort": location.is_port,
        "importance": location.importance,
        "tags": list(location.tags),
    }
    optional = {
        "englishName": location.english_name,
        "baronyId": location.barony_id,
        "countyId": location.county_id,
        "duchyId": location.duchy_id,
        "kingdomId": location.kingdom_id,
        "description": location.description,
        "icon": location.icon,
    }
    value.update({key: item for key, item in optional.items() if item is not None})
    return value


def _edge_json(edge) -> dict[str, object]:
    return {
        "id": edge.id,
        "from": edge.from_id,
        "to": edge.to_id,
        "distance": edge.distance,
        "roadLevel": edge.road_level,
        "crossing": edge.crossing,
        "allowedModes": list(edge.allowed_modes),
        "baseDays": edge.base_days,
        "baseCost": edge.base_cost,
        "risk": edge.risk,
        "seasonTags": list(edge.season_tags),
    }


def _hash_runtime_files(root: Path) -> tuple[str, dict[str, str]]:
    hashes: dict[str, str] = {}
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*.json")):
        relative = path.relative_to(root).as_posix()
        if relative == "manifest.json" or relative.startswith("reports/"):
            continue
        data = path.read_bytes()
        file_hash = hashlib.sha256(data).hexdigest()
        hashes[relative] = file_hash
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(data)
    return digest.hexdigest(), hashes


def write_map_dataset(
    *,
    output: Path,
    locations: Sequence[MapLocationRecord],
    route_graph: RouteGraphRecord,
    regions: Sequence[Mapping[str, object]],
    political: Sequence[Mapping[str, object]],
    source_hashes: Mapping[str, str],
    map_size: tuple[int, int],
    westeros_bounds: tuple[float, float, float, float],
    tile_counts: Mapping[str, int],
    min_zoom: int,
    max_zoom: int,
) -> dict[str, object]:
    audit_counts = audit_map_records(locations, route_graph, map_size, westeros_bounds)
    if min_zoom < 0 or max_zoom < min_zoom:
        raise MapImportError("清单缩放级别无效")
    for path, digest in source_hashes.items():
        if path.startswith("/") or "\\" in path or "2962333032" in path or not re.fullmatch(r"[a-f0-9]{64}", digest):
            raise MapImportError(f"源文件哈希记录不安全：{path}")

    staging = _staging_directory(output)
    try:
        location_groups: dict[str, list[dict[str, object]]] = {}
        for location in sorted(locations, key=lambda item: item.id):
            location_groups.setdefault(location.region_id, []).append(_location_json(location))
        for region_id, records in sorted(location_groups.items()):
            shard = SAFE_SHARD.sub("_", region_id)
            _write_json(staging / "locations" / f"{shard}.json", records)

        search_index = [
            {
                "id": location.id,
                "name": location.name,
                **({"englishName": location.english_name} if location.english_name else {}),
                "type": location.type,
                "mapX": location.map_x,
                "mapY": location.map_y,
                "importance": location.importance,
                "regionId": location.region_id,
            }
            for location in sorted(locations, key=lambda item: item.id)
        ]
        _write_json(staging / "location-search-index.json", search_index)
        _write_json(staging / "regions.json", sorted((dict(region) for region in regions), key=lambda item: str(item.get("id", ""))))
        _write_json(staging / "political" / "titles.json", sorted((dict(item) for item in political), key=lambda item: str(item.get("baronyId", ""))))

        nodes_by_id = {node.id: node for node in route_graph.nodes}
        route_regions: dict[str, list] = {}
        for edge in route_graph.edges:
            route_regions.setdefault(nodes_by_id[edge.from_id].region_id, []).append(edge)
        for region_id, edges in sorted(route_regions.items()):
            referenced = {edge.from_id for edge in edges} | {edge.to_id for edge in edges}
            payload = {
                "graphHash": route_graph.dataset_hash,
                "nodes": [asdict(nodes_by_id[node_id]) for node_id in sorted(referenced)],
                "edges": [_edge_json(edge) for edge in sorted(edges, key=lambda item: item.id)],
            }
            shard = SAFE_SHARD.sub("_", region_id)
            _write_json(staging / "routes" / f"{shard}.json", payload)

        dataset_hash, data_file_hashes = _hash_runtime_files(staging)
        min_x, min_y, max_x, max_y = westeros_bounds
        manifest: dict[str, object] = {
            "schemaVersion": 1,
            "sourceId": "2962333032",
            "sourceHashes": dict(sorted(source_hashes.items())),
            "mapSize": {"width": map_size[0], "height": map_size[1]},
            "westerosBounds": {"minX": min_x, "minY": min_y, "maxX": max_x, "maxY": max_y},
            "tileSize": 512,
            "minZoom": min_zoom,
            "maxZoom": max_zoom,
            "paths": {
                "terrain": "/assets/agot-map/terrain/{z}/{x}/{y}.webp",
                "vector": "/assets/agot-map/vector/{z}/{x}/{y}.pbf",
                "dem": "/assets/agot-map/dem/{z}/{x}/{y}.png",
                "locations": "/data/agot-map/locations",
                "routes": "/data/agot-map/routes",
                "searchIndex": "/data/agot-map/location-search-index.json",
            },
            "counts": {
                "regions": len(regions),
                "provinces": len({location.province_id for location in locations}),
                "locations": len(locations),
                "routeEdges": len(route_graph.edges),
                "terrainTiles": int(tile_counts.get("terrain", 0)),
                "vectorTiles": int(tile_counts.get("vector", 0)),
                "demTiles": int(tile_counts.get("dem", 0)),
            },
            "datasetHash": dataset_hash,
        }
        _write_json(staging / "manifest.json", manifest)
        _write_json(staging / "reports" / "audit.json", {
            "status": "passed",
            "counts": audit_counts,
            "datasetHash": dataset_hash,
            "dataFileHashes": data_file_hashes,
        })
        _atomic_publish(staging, output)
        return manifest
    except Exception:
        if staging.exists():
            shutil.rmtree(staging)
        raise
