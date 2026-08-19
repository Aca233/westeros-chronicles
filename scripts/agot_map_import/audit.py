from __future__ import annotations

from collections import Counter
from typing import Sequence

from .models import MapImportError, MapLocationRecord, RouteGraphRecord


def audit_map_records(
    locations: Sequence[MapLocationRecord],
    route_graph: RouteGraphRecord,
    map_size: tuple[int, int],
    westeros_bounds: tuple[float, float, float, float],
) -> dict[str, object]:
    width, height = map_size
    min_x, min_y, max_x, max_y = westeros_bounds
    if width <= 0 or height <= 0 or min_x >= max_x or min_y >= max_y:
        raise MapImportError("地图尺寸或维斯特洛裁剪范围无效")
    if min_x < 0 or min_y < 0 or max_x > width or max_y > height:
        raise MapImportError("维斯特洛裁剪范围超出原始地图")

    ids = [location.id for location in locations]
    duplicates = sorted(identifier for identifier, count in Counter(ids).items() if count > 1)
    if duplicates:
        raise MapImportError(f"地点稳定 ID 重复：{duplicates[:10]}")
    by_id = {location.id: location for location in locations}
    for location in locations:
        if not (0 <= location.map_x < width and 0 <= location.map_y < height):
            raise MapImportError(f"地点坐标超出地图：{location.id}")
        if not (min_x <= location.map_x <= max_x and min_y <= location.map_y <= max_y):
            raise MapImportError(f"地点坐标超出维斯特洛范围：{location.id}")
        if not location.region_id:
            raise MapImportError(f"地点缺少区域：{location.id}")
        if location.is_port and not location.is_coastal:
            raise MapImportError(f"港口地点必须临海：{location.id}")

    node_ids = {node.id for node in route_graph.nodes}
    unknown_nodes = sorted(node_ids - set(by_id))
    if unknown_nodes:
        raise MapImportError(f"路线节点没有对应地点：{unknown_nodes[:10]}")
    edge_pairs = {(edge.from_id, edge.to_id) for edge in route_graph.edges}
    for edge in route_graph.edges:
        if edge.from_id not in node_ids or edge.to_id not in node_ids:
            raise MapImportError(f"路线端点不存在：{edge.from_id} -> {edge.to_id}")
        if (edge.to_id, edge.from_id) not in edge_pairs:
            raise MapImportError(f"路线缺少反向边：{edge.from_id} -> {edge.to_id}")
        if edge.crossing == "sea":
            if not by_id[edge.from_id].is_port or not by_id[edge.to_id].is_port:
                raise MapImportError(f"海路端点不是港口：{edge.from_id} -> {edge.to_id}")
            if edge.allowed_modes != ("ship",):
                raise MapImportError(f"海路交通方式非法：{edge.id}")
        elif "ship" in edge.allowed_modes:
            raise MapImportError(f"陆路不能允许船只：{edge.id}")
        if edge.distance < 0 or edge.base_days < 0 or edge.base_cost < 0 or not 0 <= edge.risk <= 1:
            raise MapImportError(f"路线代价非法：{edge.id}")

    return {
        "locations": len(locations),
        "routeNodes": len(route_graph.nodes),
        "routeEdges": len(route_graph.edges),
        "ports": sum(location.is_port for location in locations),
        "regions": len({location.region_id for location in locations}),
    }


def audit_semantic_records(
    dataset,
    locations: Sequence[MapLocationRecord],
    westeros_bounds: tuple[float, float, float, float],
) -> dict[str, object]:
    ranks = ("realm", "duchy", "county")
    rank_counts = Counter(boundary.rank for boundary in dataset.boundaries)
    for rank in ranks:
        if rank_counts[rank] <= 0:
            raise MapImportError(f"语义地图缺少 {rank} 层")
    if set(rank_counts) - set(ranks):
        raise MapImportError(f"语义地图包含不可见层级：{sorted(set(rank_counts) - set(ranks))}")

    feature_ids = [boundary.feature_id for boundary in dataset.boundaries]
    duplicate_features = sorted(identifier for identifier, count in Counter(feature_ids).items() if count > 1)
    if duplicate_features:
        raise MapImportError(f"语义 feature ID 重复：{duplicate_features[:10]}")
    keys = [(boundary.rank, boundary.title_id) for boundary in dataset.boundaries]
    duplicate_keys = sorted(identifier for identifier, count in Counter(keys).items() if count > 1)
    if duplicate_keys:
        raise MapImportError(f"语义领地重复：{duplicate_keys[:10]}")

    min_x, min_y, max_x, max_y = westeros_bounds
    by_key = {(boundary.rank, boundary.title_id): boundary for boundary in dataset.boundaries}
    boundary_by_feature = {boundary.feature_id: boundary for boundary in dataset.boundaries}
    for boundary in dataset.boundaries:
        geom_min_x, geom_min_y, geom_max_x, geom_max_y = boundary.geometry.bounds
        if geom_min_x < min_x or geom_min_y < min_y or geom_max_x > max_x or geom_max_y > max_y:
            raise MapImportError(f"语义领地越出维斯特洛范围：{boundary.title_id}")
    for title in dataset.titles:
        boundary = boundary_by_feature.get(title.feature_id)
        if boundary is None or (boundary.rank, boundary.title_id) != (title.rank, title.title_id):
            raise MapImportError(f"语义标题没有对应边界：{title.title_id}")
        if not boundary.geometry.covers(title.anchor):
            raise MapImportError(f"语义标题中心不在边界内：{title.title_id}")

    location_by_id = {location.id: location for location in locations}
    membership_ids = [item.location_id for item in dataset.memberships]
    duplicate_memberships = sorted(identifier for identifier, count in Counter(membership_ids).items() if count > 1)
    if duplicate_memberships:
        raise MapImportError(f"语义 membership 重复：{duplicate_memberships[:10]}")
    for membership in dataset.memberships:
        location = location_by_id.get(membership.location_id)
        if location is None:
            raise MapImportError(f"语义 membership 地点不存在：{membership.location_id}")
        if location.barony_id != membership.barony_id:
            raise MapImportError(f"语义 membership 内部地点键不一致：{membership.location_id}")
        for rank, title_id in (
            ("county", membership.county_id),
            ("duchy", membership.duchy_id),
            ("realm", membership.realm_id),
        ):
            if (rank, title_id) not in by_key:
                raise MapImportError(f"语义 membership 引用不存在：{rank}:{title_id}")

    return {
        "realms": rank_counts["realm"],
        "duchies": rank_counts["duchy"],
        "counties": rank_counts["county"],
        "labels": len(dataset.titles),
        "memberships": len(dataset.memberships),
        "missingLocalizations": len(dataset.missing_localizations),
    }
