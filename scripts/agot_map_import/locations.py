from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from shapely.geometry import Point

from .models import MapImportError, MapLocationRecord, ProvinceGeometry
from .titles import TitleIndex


LOCATION_TYPES = {"region", "castle", "city", "town", "village", "port", "ruin", "landmark"}


def build_locations(
    geometries: Mapping[int, ProvinceGeometry],
    titles: TitleIndex,
    localization: Mapping[str, str],
    overrides: Mapping[str, Mapping[str, Any]],
) -> list[MapLocationRecord]:
    locations: list[MapLocationRecord] = []
    for province_id, geometry in sorted(geometries.items()):
        barony_id = titles.barony_for_province(province_id) or geometry.barony_id
        if not barony_id.startswith("b_") or barony_id == "b_x":
            continue
        try:
            ancestors = titles.ancestors(barony_id)
        except MapImportError:
            continue
        override = overrides.get(barony_id, {})
        if "id" in override and override["id"] != barony_id:
            raise MapImportError(f"策划覆盖不能修改地点稳定 ID：{barony_id}")
        location_type = str(override.get("type", "castle"))
        if location_type not in LOCATION_TYPES:
            raise MapImportError(f"{barony_id} 使用未知地点类型：{location_type}")
        map_x = int(override.get("mapX", geometry.map_x))
        map_y = int(override.get("mapY", geometry.map_y))
        if not geometry.geometry.covers(Point(map_x + 0.5, map_y + 0.5)):
            raise MapImportError(f"{barony_id} 的策划坐标不在对应省份内：{map_x},{map_y}")
        is_port = bool(override.get("isPort", location_type == "port"))
        is_coastal = bool(override.get("isCoastal", geometry.is_coastal or is_port))
        importance = int(override.get("importance", 20))
        if not 0 <= importance <= 100:
            raise MapImportError(f"{barony_id} 的 importance 必须在 0 到 100 之间")
        locations.append(MapLocationRecord(
            id=barony_id,
            name=str(override.get("name", localization.get(barony_id, barony_id))),
            english_name=str(override["englishName"]) if override.get("englishName") else None,
            type=location_type,
            map_x=map_x,
            map_y=map_y,
            province_id=province_id,
            barony_id=barony_id,
            county_id=ancestors.county_id,
            duchy_id=ancestors.duchy_id,
            kingdom_id=ancestors.kingdom_id,
            region_id=str(override.get("regionId", geometry.region_id)),
            terrain=str(override.get("terrain", geometry.terrain)),
            is_coastal=is_coastal,
            is_port=is_port,
            importance=importance,
            tags=tuple(dict.fromkeys(str(tag) for tag in override.get("tags", ()))),
            description=str(override["description"]) if override.get("description") else None,
            icon=str(override["icon"]) if override.get("icon") else None,
        ))
    return locations
