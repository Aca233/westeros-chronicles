from __future__ import annotations

import csv
import hashlib
import json
import math
from dataclasses import asdict
from pathlib import Path
from typing import Iterable, Mapping, Sequence

import numpy as np
from PIL import Image
from shapely.strtree import STRtree

from .models import (
    MapImportError,
    MapLocationRecord,
    ProvinceGeometry,
    RouteEdgeRecord,
    RouteGraphRecord,
    RouteNodeRecord,
)


LAND_MODES = ("walk", "horse")
ROAD_MODES = ("walk", "horse", "carriage")
SEA_MODES = ("ship",)


def parse_adjacencies(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as handle:
        rows = []
        for row in csv.DictReader(handle, delimiter=";"):
            normalized = {str(key).strip(): str(value or "").strip() for key, value in row.items() if key}
            if normalized.get("From") == "-1" or not normalized.get("From"):
                continue
            rows.append(normalized)
        return rows


def _image_values(image: Image.Image | Path | None) -> np.ndarray | None:
    if image is None:
        return None
    if isinstance(image, Path):
        with Image.open(image) as opened:
            return np.asarray(opened)
    return np.asarray(image)


def _sample_line(values: np.ndarray | None, start: tuple[int, int], end: tuple[int, int]) -> np.ndarray:
    if values is None:
        return np.asarray([], dtype=np.uint8)
    distance = math.dist(start, end)
    sample_count = max(8, int(math.ceil(distance * 2)) + 1)
    xs = np.rint(np.linspace(start[0], end[0], sample_count)).astype(np.int64)
    ys = np.rint(np.linspace(start[1], end[1], sample_count)).astype(np.int64)
    xs = np.clip(xs, 0, values.shape[1] - 1)
    ys = np.clip(ys, 0, values.shape[0] - 1)
    return values[ys, xs]


def _road_level(road_values: np.ndarray | None, start: tuple[int, int], end: tuple[int, int]) -> str:
    sampled = _sample_line(road_values, start, end)
    if sampled.size == 0:
        return "none"
    if sampled.ndim == 2 and sampled.shape[1] == 4:
        intensity = sampled[:, 3]
    elif sampled.ndim == 2:
        intensity = sampled[:, :3].max(axis=1)
    else:
        intensity = sampled
    if float(np.count_nonzero(intensity >= 192)) / len(intensity) >= 0.2:
        return "major"
    if float(np.count_nonzero(intensity >= 32)) / len(intensity) >= 0.1:
        return "minor"
    return "none"


def _crosses_river(river_values: np.ndarray | None, start: tuple[int, int], end: tuple[int, int]) -> bool:
    sampled = _sample_line(river_values, start, end)
    if sampled.size == 0:
        return False
    if sampled.ndim == 1:
        return bool(np.any((sampled != 254) & (sampled != 255)))
    channels = sampled[:, :3]
    return bool(np.any(np.any(channels < 250, axis=1)))


def _primary_locations(locations: Iterable[MapLocationRecord]) -> dict[int, MapLocationRecord]:
    grouped: dict[int, list[MapLocationRecord]] = {}
    for location in locations:
        grouped.setdefault(location.province_id, []).append(location)
    return {
        province_id: sorted(candidates, key=lambda item: (-item.importance, item.id))[0]
        for province_id, candidates in grouped.items()
    }


def _physical_connections(
    geometries: Mapping[int, ProvinceGeometry],
    province_locations: Mapping[int, MapLocationRecord],
    impassable: set[int],
) -> set[tuple[int, int]]:
    province_ids = [
        province_id for province_id in sorted(geometries)
        if province_id in province_locations and province_id not in impassable
    ]
    shape_list = [geometries[province_id].geometry for province_id in province_ids]
    tree = STRtree(shape_list)
    connections: set[tuple[int, int]] = set()
    for left_index, geometry in enumerate(shape_list):
        for right_index in tree.query(geometry, predicate="touches"):
            right_index = int(right_index)
            if right_index <= left_index:
                continue
            connections.add((province_ids[left_index], province_ids[right_index]))
    return connections


def _edge_metrics(
    left: MapLocationRecord,
    right: MapLocationRecord,
    road_level: str,
    crossing: str,
) -> tuple[float, float, float, float, tuple[str, ...]]:
    distance = round(math.dist((left.map_x, left.map_y), (right.map_x, right.map_y)), 4)
    if crossing == "sea":
        days = distance / 70
        cost = distance * 0.0225
        risk = 0.18 + min(0.22, distance / 5000)
        season_tags = ("storm_season",)
    else:
        road_multiplier = {"major": 0.7, "minor": 0.85, "none": 1.1}[road_level]
        crossing_multiplier = 1.2 if crossing == "river" else 1
        days = distance / 40 * road_multiplier * crossing_multiplier
        cost = distance * (0.012 if road_level == "major" else 0.015)
        risk = {"major": 0.05, "minor": 0.08, "none": 0.15}[road_level]
        tags: list[str] = []
        if crossing == "river":
            risk += 0.12
            tags.append("flood_season")
        if "mountain" in left.terrain or "mountain" in right.terrain:
            risk += 0.08
            tags.append("winter_danger")
        season_tags = tuple(tags)
    return distance, round(days, 4), round(cost, 4), round(min(risk, 1), 4), season_tags


def _row_value(row: Mapping[str, str], key: str) -> str:
    for candidate, value in row.items():
        if candidate.lower() == key.lower():
            return str(value).strip()
    return ""


def build_route_graph(
    locations: Sequence[MapLocationRecord],
    geometries: Mapping[int, ProvinceGeometry],
    adjacency_rows: Iterable[Mapping[str, str]],
    road_mask: Image.Image | Path | None,
    rivers: Image.Image | Path | None,
    impassable: set[int],
) -> RouteGraphRecord:
    province_locations = _primary_locations(locations)
    road_values = _image_values(road_mask)
    river_values = _image_values(rivers)
    connection_types: dict[tuple[int, int], str] = {
        pair: "land" for pair in _physical_connections(geometries, province_locations, impassable)
    }

    for row in adjacency_rows:
        try:
            left_id = int(_row_value(row, "From"))
            right_id = int(_row_value(row, "To"))
        except ValueError as error:
            raise MapImportError(f"adjacencies.csv 存在非整数端点：{row}") from error
        if left_id in impassable or right_id in impassable:
            continue
        if left_id not in province_locations or right_id not in province_locations:
            continue
        pair = tuple(sorted((left_id, right_id)))
        adjacency_type = _row_value(row, "Type").lower()
        if adjacency_type == "sea":
            if not province_locations[left_id].is_port or not province_locations[right_id].is_port:
                raise MapImportError(
                    f"普通海路必须连接两个港口：{province_locations[left_id].id} -> {province_locations[right_id].id}"
                )
            connection_types[pair] = "sea"
        elif adjacency_type.startswith("river"):
            connection_types[pair] = "river"
        else:
            raise MapImportError(f"未知邻接类型：{adjacency_type or '空'}")

    nodes = tuple(sorted((
        RouteNodeRecord(
            id=location.id,
            location_id=location.id,
            map_x=location.map_x,
            map_y=location.map_y,
            province_id=location.province_id,
            region_id=location.region_id,
            is_port=location.is_port,
        )
        for location in province_locations.values()
        if location.province_id not in impassable
    ), key=lambda node: node.id))

    edges: list[RouteEdgeRecord] = []
    for (left_id, right_id), declared_crossing in sorted(connection_types.items()):
        left = province_locations[left_id]
        right = province_locations[right_id]
        start = (left.map_x, left.map_y)
        end = (right.map_x, right.map_y)
        crossing = declared_crossing
        if crossing == "land" and _crosses_river(river_values, start, end):
            crossing = "river"
        road_level = "none" if crossing == "sea" else _road_level(road_values, start, end)
        allowed_modes = SEA_MODES if crossing == "sea" else (ROAD_MODES if road_level != "none" else LAND_MODES)
        distance, base_days, base_cost, risk, season_tags = _edge_metrics(left, right, road_level, crossing)
        for origin, destination in ((left, right), (right, left)):
            edges.append(RouteEdgeRecord(
                id=f"{origin.id}>{destination.id}",
                from_id=origin.id,
                to_id=destination.id,
                distance=distance,
                road_level=road_level,
                crossing=crossing,
                allowed_modes=allowed_modes,
                base_days=base_days,
                base_cost=base_cost,
                risk=risk,
                season_tags=season_tags,
            ))
    sorted_edges = tuple(sorted(edges, key=lambda edge: edge.id))
    payload = {
        "nodes": [asdict(node) for node in nodes],
        "edges": [asdict(edge) for edge in sorted_edges],
    }
    dataset_hash = hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return RouteGraphRecord(nodes=nodes, edges=sorted_edges, dataset_hash=dataset_hash)
