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
