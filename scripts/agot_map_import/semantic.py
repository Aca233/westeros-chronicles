from __future__ import annotations

import math
import re
from collections import defaultdict
from collections.abc import Mapping, Sequence

from shapely import make_valid
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon
from shapely.ops import unary_union

from .models import (
    MapImportError,
    MapLocationRecord,
    ProvinceGeometry,
    RegionDefinition,
    SemanticBoundaryRecord,
    SemanticDataset,
    SemanticMembershipRecord,
    SemanticRank,
    SemanticTitleRecord,
)
from .regions import expand_region
from .titles import TitleIndex

RANK_ORDER: dict[SemanticRank, int] = {"realm": 0, "duchy": 1, "county": 2}
RANK_IMPORTANCE: dict[SemanticRank, int] = {"realm": 100, "duchy": 80, "county": 60}
_CJK_PATTERN = re.compile(r"[\u3400-\u9fff]")
_MAP_BOUNDS = (0.0, 0.0, 9216.0, 6144.0)


def _title_member_index(titles: TitleIndex) -> dict[str, set[int]]:
    province_by_barony = {
        barony_id: province_id
        for province_id, barony_id in titles.province_baronies.items()
    }
    result: dict[str, set[int]] = defaultdict(set)
    for barony_id, ancestors in titles.by_barony.items():
        province_id = province_by_barony.get(barony_id)
        if province_id is None:
            continue
        for title_id in (barony_id, ancestors.county_id, ancestors.duchy_id, ancestors.kingdom_id):
            if title_id:
                result[title_id].add(province_id)
    return dict(result)


def _member_provinces(member: str, title_members: Mapping[str, set[int]]) -> set[int]:
    if member.isdigit():
        return {int(member)}
    return set(title_members.get(member, set()))


def _province_realms(
    geometries: Mapping[int, ProvinceGeometry],
    titles: TitleIndex,
    regions: Mapping[str, RegionDefinition],
) -> dict[int, str]:
    world = regions.get("world_westeros")
    if world is None:
        raise MapImportError("地理区域缺少 world_westeros")
    title_members = _title_member_index(titles)
    result: dict[int, str] = {}
    participating = set(geometries)
    for realm_id in sorted(world.regions):
        members = expand_region(realm_id, regions)
        province_ids: set[int] = set()
        for member in members:
            province_ids.update(_member_provinces(member, title_members))
        for province_id in sorted(province_ids & participating):
            existing = result.get(province_id)
            if existing and existing != realm_id:
                raise MapImportError(f"省份 {province_id} 同时属于战略区域 {existing} 与 {realm_id}")
            result[province_id] = realm_id
    missing = sorted(participating - set(result))
    if missing:
        raise MapImportError(f"参与地图的省份缺少战略区域：{missing[:10]}")
    return result


def _polygonal_union(geometries: Sequence[object], title_id: str):
    merged = make_valid(unary_union(list(geometries)))
    if isinstance(merged, (Polygon, MultiPolygon)):
        polygonal = merged
    elif isinstance(merged, GeometryCollection):
        pieces = [item for item in merged.geoms if isinstance(item, (Polygon, MultiPolygon)) and not item.is_empty]
        polygonal = unary_union(pieces) if pieces else GeometryCollection()
    else:
        polygonal = GeometryCollection()
    if polygonal.is_empty or not isinstance(polygonal, (Polygon, MultiPolygon)):
        raise MapImportError(f"语义领地几何为空或不是面：{title_id}")
    if not polygonal.is_valid:
        raise MapImportError(f"语义领地几何无法安全修复：{title_id}")
    min_x, min_y, max_x, max_y = polygonal.bounds
    if not all(math.isfinite(value) for value in polygonal.bounds):
        raise MapImportError(f"语义领地几何坐标非法：{title_id}")
    world_min_x, world_min_y, world_max_x, world_max_y = _MAP_BOUNDS
    if min_x < world_min_x or min_y < world_min_y or max_x > world_max_x or max_y > world_max_y:
        raise MapImportError(f"语义领地几何越出地图：{title_id}")
    return polygonal


def _localized_chinese(localization: Mapping[str, str], title_id: str) -> str | None:
    value = localization.get(title_id, "").strip()
    return value if value and _CJK_PATTERN.search(value) else None


def build_semantic_dataset(
    geometries: Mapping[int, ProvinceGeometry],
    locations: Sequence[MapLocationRecord],
    titles: TitleIndex,
    region_definitions: Mapping[str, RegionDefinition],
    localization: Mapping[str, str],
    anchors: Mapping[str, str],
) -> SemanticDataset:
    if not geometries:
        raise MapImportError("没有可生成语义层的省份几何")
    for province_id, geometry in sorted(geometries.items()):
        stable_barony = titles.barony_for_province(province_id)
        if stable_barony is None:
            raise MapImportError(f"省份 {province_id} 缺少唯一稳定男爵领内部键")
        ancestors = titles.ancestors(stable_barony)
        if not ancestors.county_id:
            raise MapImportError(f"男爵领 {stable_barony} 无法解析到伯爵领")
        if not ancestors.duchy_id:
            raise MapImportError(f"伯爵领 {ancestors.county_id} 无法解析到公国")
    province_realms = _province_realms(geometries, titles, region_definitions)
    grouped: dict[tuple[SemanticRank, str], list[object]] = defaultdict(list)
    group_regions: dict[tuple[SemanticRank, str], str] = {}
    hierarchy_by_province: dict[int, tuple[str, str, str, str]] = {}

    for province_id, geometry in sorted(geometries.items()):
        stable_barony = titles.barony_for_province(province_id)
        if stable_barony is None:
            raise MapImportError(f"省份 {province_id} 缺少唯一稳定男爵领内部键")
        ancestors = titles.ancestors(stable_barony)
        if not ancestors.county_id:
            raise MapImportError(f"男爵领 {stable_barony} 无法解析到伯爵领")
        if not ancestors.duchy_id:
            raise MapImportError(f"伯爵领 {ancestors.county_id} 无法解析到公国")
        realm_id = province_realms[province_id]
        hierarchy_by_province[province_id] = (
            stable_barony, ancestors.county_id, ancestors.duchy_id, realm_id,
        )
        for rank, title_id in (
            ("realm", realm_id), ("duchy", ancestors.duchy_id), ("county", ancestors.county_id),
        ):
            key = (rank, title_id)
            existing_region = group_regions.get(key)
            if existing_region and existing_region != realm_id:
                raise MapImportError(f"领地 {title_id} 跨越战略区域 {existing_region} 与 {realm_id}")
            group_regions[key] = realm_id
            grouped[key].append(geometry.geometry)

    keys = sorted(grouped, key=lambda item: (RANK_ORDER[item[0]], item[1]))
    feature_ids = {key: index + 1 for index, key in enumerate(keys)}
    boundaries: list[SemanticBoundaryRecord] = []
    visible_titles: list[SemanticTitleRecord] = []
    missing_localizations: list[str] = []

    for rank, title_id in keys:
        geometry = _polygonal_union(grouped[(rank, title_id)], title_id)
        anchor = geometry.representative_point()
        if not geometry.covers(anchor):
            raise MapImportError(f"语义标签中心不在领地内部：{title_id}")
        name = _localized_chinese(localization, title_id)
        if name is None:
            missing_localizations.append(title_id)
        political_anchor = anchors.get(title_id) if rank == "realm" else None
        feature_id = feature_ids[(rank, title_id)]
        region_id = group_regions[(rank, title_id)]
        boundaries.append(SemanticBoundaryRecord(
            feature_id=feature_id,
            title_id=title_id,
            rank=rank,
            name=name,
            region_id=region_id,
            political_anchor_title_id=political_anchor,
            geometry=geometry,
        ))
        if name is not None:
            visible_titles.append(SemanticTitleRecord(
                feature_id=feature_id,
                title_id=title_id,
                rank=rank,
                name=name,
                map_x=float(anchor.x),
                map_y=float(anchor.y),
                importance=RANK_IMPORTANCE[rank],
                region_id=region_id,
                political_anchor_title_id=political_anchor,
                geometry=geometry,
                anchor=anchor,
            ))

    memberships: list[SemanticMembershipRecord] = []
    for location in sorted(locations, key=lambda item: item.id):
        hierarchy = hierarchy_by_province.get(location.province_id)
        if hierarchy is None:
            raise MapImportError(f"地点 {location.id} 的省份不在语义地图中")
        barony_id, county_id, duchy_id, realm_id = hierarchy
        if location.barony_id != barony_id:
            raise MapImportError(f"地点 {location.id} 的内部男爵领键与省份不一致")
        memberships.append(SemanticMembershipRecord(
            location_id=location.id,
            barony_id=barony_id,
            county_id=county_id,
            duchy_id=duchy_id,
            realm_id=realm_id,
        ))

    return SemanticDataset(
        boundaries=tuple(boundaries),
        titles=tuple(visible_titles),
        memberships=tuple(memberships),
        missing_localizations=tuple(sorted(set(missing_localizations))),
    )
