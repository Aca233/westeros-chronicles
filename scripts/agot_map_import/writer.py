from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import uuid
from dataclasses import asdict
from pathlib import Path
from typing import Mapping, Sequence

from .audit import audit_map_records, audit_semantic_records
from .models import MapImportError, MapLocationRecord, RouteGraphRecord, SemanticDataset
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
        "id": location.id, "name": location.name, "type": location.type,
        "mapX": location.map_x, "mapY": location.map_y, "provinceId": location.province_id,
        "regionId": location.region_id, "terrain": location.terrain,
        "isCoastal": location.is_coastal, "isPort": location.is_port,
        "importance": location.importance, "tags": list(location.tags),
    }
    optional = {
        "englishName": location.english_name, "baronyId": location.barony_id,
        "countyId": location.county_id, "duchyId": location.duchy_id,
        "kingdomId": location.kingdom_id, "description": location.description, "icon": location.icon,
    }
    value.update({key: item for key, item in optional.items() if item is not None})
    return value


def _edge_json(edge) -> dict[str, object]:
    return {
        "id": edge.id, "from": edge.from_id, "to": edge.to_id, "distance": edge.distance,
        "roadLevel": edge.road_level, "crossing": edge.crossing,
        "allowedModes": list(edge.allowed_modes), "baseDays": edge.base_days,
        "baseCost": edge.base_cost, "risk": edge.risk, "seasonTags": list(edge.season_tags),
    }


def _title_json(title) -> dict[str, object]:
    return {
        "featureId": title.feature_id, "titleId": title.title_id, "rank": title.rank,
        "name": title.name, "mapX": title.map_x, "mapY": title.map_y,
        "importance": title.importance, "regionId": title.region_id,
        "titleColor": title.title_color,
    }


def _membership_json(item) -> dict[str, object]:
    value: dict[str, object] = {
        "locationId": item.location_id, "baronyId": item.barony_id,
        "countyId": item.county_id, "duchyId": item.duchy_id,
        "regionId": item.region_id,
    }
    optional = {
        "kingdomId": item.kingdom_id,
        "empireId": item.empire_id,
        "hegemonId": item.hegemon_id,
    }
    value.update({key: title_id for key, title_id in optional.items() if title_id is not None})
    return value


def _hash_runtime_files(root: Path) -> tuple[str, dict[str, str]]:
    hashes: dict[str, str] = {}
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*.json")):
        relative = path.relative_to(root).as_posix()
        if relative == "manifest.json" or relative.startswith("reports/"):
            continue
        data = path.read_bytes()
        hashes[relative] = hashlib.sha256(data).hexdigest()
        digest.update(relative.encode("utf-8")); digest.update(b"\0"); digest.update(data)
    return digest.hexdigest(), hashes


def _semantic_hash(data_root: Path, semantic_tile_root: Path) -> str:
    digest = hashlib.sha256()
    for relative in ("semantic/titles.json", "semantic/membership.json"):
        data = (data_root / relative).read_bytes()
        digest.update(relative.encode("utf-8")); digest.update(b"\0"); digest.update(data)
    if semantic_tile_root.exists():
        for path in sorted(semantic_tile_root.rglob("*.pbf")):
            relative = f"semantic/{path.relative_to(semantic_tile_root).as_posix()}"
            digest.update(relative.encode("utf-8")); digest.update(b"\0"); digest.update(path.read_bytes())
    return digest.hexdigest()


def _remove_path(path: Path) -> None:
    if path.is_dir():
        shutil.rmtree(path)
    elif path.exists():
        path.unlink()


def publish_map_pair(data_stage: Path, data_output: Path, asset_stage: Path, asset_output: Path) -> None:
    data_backup = data_output.with_name(f".{data_output.name}.backup-{uuid.uuid4().hex}")
    asset_backup = asset_output.with_name(f".{asset_output.name}.backup-{uuid.uuid4().hex}")
    data_had_previous = data_output.exists()
    asset_had_previous = asset_output.exists()
    try:
        if data_had_previous:
            os.replace(data_output, data_backup)
        if asset_had_previous:
            os.replace(asset_output, asset_backup)
        os.replace(data_stage, data_output)
        os.replace(asset_stage, asset_output)
    except Exception:
        if data_output.exists():
            _remove_path(data_output)
        if asset_output.exists():
            _remove_path(asset_output)
        if data_had_previous and data_backup.exists():
            os.replace(data_backup, data_output)
        if asset_had_previous and asset_backup.exists():
            os.replace(asset_backup, asset_output)
        raise
    finally:
        if data_backup.exists():
            _remove_path(data_backup)
        if asset_backup.exists():
            _remove_path(asset_backup)


def stage_map_dataset(
    *, output: Path, locations: Sequence[MapLocationRecord], route_graph: RouteGraphRecord,
    regions: Sequence[Mapping[str, object]], political: Sequence[Mapping[str, object]],
    source_hashes: Mapping[str, str], map_size: tuple[int, int],
    westeros_bounds: tuple[float, float, float, float], tile_counts: Mapping[str, int],
    semantic: SemanticDataset, semantic_tile_root: Path, min_zoom: int, max_zoom: int,
) -> dict[str, object]:
    audit_counts = audit_map_records(locations, route_graph, map_size, westeros_bounds)
    semantic_counts = audit_semantic_records(semantic, locations, westeros_bounds)
    if min_zoom < 0 or max_zoom < min_zoom:
        raise MapImportError("清单缩放级别无效")
    for path, digest in source_hashes.items():
        if path.startswith("/") or "\\" in path or "2962333032" in path or not re.fullmatch(r"[a-f0-9]{64}", digest):
            raise MapImportError(f"源文件哈希记录不安全：{path}")
    output.mkdir(parents=True, exist_ok=True)

    location_groups: dict[str, list[dict[str, object]]] = {}
    for location in sorted(locations, key=lambda item: item.id):
        location_groups.setdefault(location.region_id, []).append(_location_json(location))
    for region_id, records in sorted(location_groups.items()):
        _write_json(output / "locations" / f"{SAFE_SHARD.sub('_', region_id)}.json", records)
    _write_json(output / "location-search-index.json", [{
        "id": location.id, "name": location.name,
        **({"englishName": location.english_name} if location.english_name else {}),
        "type": location.type, "mapX": location.map_x, "mapY": location.map_y,
        "importance": location.importance, "regionId": location.region_id,
    } for location in sorted(locations, key=lambda item: item.id)])
    _write_json(output / "regions.json", sorted((dict(region) for region in regions), key=lambda item: str(item.get("id", ""))))
    _write_json(output / "political/titles.json", sorted((dict(item) for item in political), key=lambda item: str(item.get("baronyId", ""))))
    _write_json(output / "semantic/titles.json", [_title_json(item) for item in semantic.titles])
    _write_json(output / "semantic/membership.json", [_membership_json(item) for item in semantic.memberships])

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
        _write_json(output / "routes" / f"{SAFE_SHARD.sub('_', region_id)}.json", payload)

    semantic_hash = _semantic_hash(output, semantic_tile_root)
    dataset_hash, data_file_hashes = _hash_runtime_files(output)
    min_x, min_y, max_x, max_y = westeros_bounds
    manifest: dict[str, object] = {
        "schemaVersion": 4, "sourceId": "2962333032",
        "sourceHashes": dict(sorted(source_hashes.items())),
        "mapSize": {"width": map_size[0], "height": map_size[1]},
        "westerosBounds": {"minX": min_x, "minY": min_y, "maxX": max_x, "maxY": max_y},
        "tileSize": 512, "minZoom": min_zoom, "maxZoom": max_zoom,
        "paths": {
            "terrain": "/assets/agot-map/terrain/{z}/{x}/{y}.webp",
            "terrainLight": "/assets/agot-map/terrain-light/{z}/{x}/{y}.webp",
            "materialTerrain": "/assets/agot-map/material-terrain/{z}/{x}/{y}.webp",
            "vector": "/assets/agot-map/vector/{z}/{x}/{y}.pbf",
            "dem": "/assets/agot-map/dem/{z}/{x}/{y}.png",
            "semantic": "/assets/agot-map/semantic/{z}/{x}/{y}.pbf",
            "locations": "/data/agot-map/locations", "routes": "/data/agot-map/routes",
            "searchIndex": "/data/agot-map/location-search-index.json",
            "semanticTitles": "/data/agot-map/semantic/titles.json",
            "semanticMembership": "/data/agot-map/semantic/membership.json",
        },
        "counts": {
            "regions": len(regions), "provinces": len({item.province_id for item in locations}),
            "locations": len(locations), "routeEdges": len(route_graph.edges),
            "terrainTiles": int(tile_counts.get("terrain", 0)),
            "terrainLightTiles": int(tile_counts.get("terrainLight", 0)),
            "materialTerrainTiles": int(tile_counts.get("materialTerrain", 0)),
            "vectorTiles": int(tile_counts.get("vector", 0)), "demTiles": int(tile_counts.get("dem", 0)),
            "semanticTiles": int(tile_counts.get("semantic", 0)),
            "semanticHegemons": semantic_counts["hegemons"],
            "semanticEmpires": semantic_counts["empires"],
            "semanticKingdoms": semantic_counts["kingdoms"],
            "semanticDuchies": semantic_counts["duchies"],
            "semanticCounties": semantic_counts["counties"], "semanticLabels": semantic_counts["labels"],
            "missingSemanticLocalizations": semantic_counts["missingLocalizations"],
        },
        "datasetHash": dataset_hash, "semanticHash": semantic_hash,
    }
    _write_json(output / "manifest.json", manifest)
    _write_json(output / "reports/audit.json", {
        "status": "passed", "counts": audit_counts, "datasetHash": dataset_hash,
        "dataFileHashes": data_file_hashes,
    })
    _write_json(output / "reports/semantic.json", {
        "status": "passed", "counts": semantic_counts, "semanticHash": semantic_hash,
        "missingLocalizations": list(semantic.missing_localizations),
    })
    return manifest


def write_map_dataset(**kwargs) -> dict[str, object]:
    output = Path(kwargs.pop("output"))
    staging = _staging_directory(output)
    try:
        manifest = stage_map_dataset(output=staging, **kwargs)
        _atomic_publish(staging, output)
        return manifest
    except Exception:
        if staging.exists():
            shutil.rmtree(staging)
        raise
