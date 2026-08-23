from __future__ import annotations

import hashlib
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

# 参与导入的顶级世界区域：维斯特洛必须存在，东大陆可选。
WORLD_REGIONS = ["world_westeros", "world_essos"]

RANK_ORDER: dict[SemanticRank, int] = {"hegemon": 0, "empire": 1, "kingdom": 2, "duchy": 3, "county": 4}
RANK_IMPORTANCE: dict[SemanticRank, int] = {"hegemon": 100, "empire": 90, "kingdom": 80, "duchy": 70, "county": 60}
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
    title_members = _title_member_index(titles)
    result: dict[int, str] = {}
    participating = set(geometries)
    for world_id in WORLD_REGIONS:
        world = regions.get(world_id)
        if world is None:
            continue
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


def _fallback_title_color(title_id: str) -> str:
    digest = hashlib.sha256(title_id.encode("utf-8")).digest()
    channels = tuple(72 + value % 72 for value in digest[:3])
    return "#" + "".join(f"{channel:02x}" for channel in channels)


def _hegemon_by_empire(
    titles: TitleIndex,
    scopes: Mapping[str, Sequence[str]],
) -> dict[str, str]:
    known_empires = {item.empire_id for item in titles.by_barony.values() if item.empire_id}
    result: dict[str, str] = {}
    for hegemon_id, empire_ids in sorted(scopes.items()):
        if not hegemon_id.startswith("h_"):
            raise MapImportError(f"霸权配置不是 h_ 头衔：{hegemon_id}")
        for empire_id in sorted(set(empire_ids)):
            if empire_id not in known_empires:
                raise MapImportError(f"霸权 {hegemon_id} 引用不存在的帝国头衔：{empire_id}")
            existing = result.get(empire_id)
            if existing and existing != hegemon_id:
                raise MapImportError(f"帝国头衔 {empire_id} 同时属于两个霸权：{existing}、{hegemon_id}")
            result[empire_id] = hegemon_id
    return result


def build_semantic_dataset(
    geometries: Mapping[int, ProvinceGeometry],
    locations: Sequence[MapLocationRecord],
    titles: TitleIndex,
    region_definitions: Mapping[str, RegionDefinition],
    localization: Mapping[str, str],
    hegemon_scopes: Mapping[str, Sequence[str]],
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
    hegemon_by_empire = _hegemon_by_empire(titles, hegemon_scopes)
    grouped: dict[tuple[SemanticRank, str], list[object]] = defaultdict(list)
    group_regions: dict[tuple[SemanticRank, str], str] = {}
    hierarchy_by_province: dict[int, tuple[str, str, str, str | None, str | None, str | None, str]] = {}

    for province_id, geometry in sorted(geometries.items()):
        stable_barony = titles.barony_for_province(province_id)
        if stable_barony is None:
            raise MapImportError(f"省份 {province_id} 缺少唯一稳定男爵领内部键")
        ancestors = titles.ancestors(stable_barony)
        if not ancestors.county_id:
            raise MapImportError(f"男爵领 {stable_barony} 无法解析到伯爵领")
        if not ancestors.duchy_id:
            raise MapImportError(f"伯爵领 {ancestors.county_id} 无法解析到公国")
        region_id = province_realms[province_id]
        hegemon_id = hegemon_by_empire.get(ancestors.empire_id)
        hierarchy_by_province[province_id] = (
            stable_barony, ancestors.county_id, ancestors.duchy_id, ancestors.kingdom_id,
            ancestors.empire_id, hegemon_id, region_id,
        )
        for rank, title_id in (
            ("hegemon", hegemon_id), ("empire", ancestors.empire_id),
            ("kingdom", ancestors.kingdom_id), ("duchy", ancestors.duchy_id),
            ("county", ancestors.county_id),
        ):
            if title_id is None:
                continue
            key = (rank, title_id)
            existing_region = group_regions.get(key)
            if existing_region and existing_region != region_id and rank in {"duchy", "county"}:
                raise MapImportError(f"领地 {title_id} 跨越战略区域 {existing_region} 与 {region_id}")
            group_regions.setdefault(key, region_id)
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
        feature_id = feature_ids[(rank, title_id)]
        region_id = group_regions[(rank, title_id)]
        title_color = titles.title_colors.get(title_id, _fallback_title_color(title_id))
        boundaries.append(SemanticBoundaryRecord(
            feature_id=feature_id,
            title_id=title_id,
            rank=rank,
            name=name,
            region_id=region_id,
            title_color=title_color,
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
                title_color=title_color,
                geometry=geometry,
                anchor=anchor,
            ))

    memberships: list[SemanticMembershipRecord] = []
    for location in sorted(locations, key=lambda item: item.id):
        hierarchy = hierarchy_by_province.get(location.province_id)
        if hierarchy is None:
            raise MapImportError(f"地点 {location.id} 的省份不在语义地图中")
        barony_id, county_id, duchy_id, kingdom_id, empire_id, hegemon_id, region_id = hierarchy
        if location.barony_id != barony_id:
            raise MapImportError(f"地点 {location.id} 的内部男爵领键与省份不一致")
        memberships.append(SemanticMembershipRecord(
            location_id=location.id,
            barony_id=barony_id,
            county_id=county_id,
            duchy_id=duchy_id,
            kingdom_id=kingdom_id,
            empire_id=empire_id,
            hegemon_id=hegemon_id,
            region_id=region_id,
        ))

    return SemanticDataset(
        boundaries=tuple(boundaries),
        titles=tuple(visible_titles),
        memberships=tuple(memberships),
        missing_localizations=tuple(sorted(set(missing_localizations))),
    )
