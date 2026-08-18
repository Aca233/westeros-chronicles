from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from shapely.geometry.base import BaseGeometry


class MapImportError(ValueError):
    """Raised when the source map is incomplete, ambiguous, or unsafe."""


@dataclass(frozen=True, slots=True)
class ProvinceDefinition:
    province_id: int
    red: int
    green: int
    blue: int
    name: str
    comment: str = ""

    @property
    def rgb(self) -> tuple[int, int, int]:
        return self.red, self.green, self.blue


@dataclass(frozen=True, slots=True)
class RegionDefinition:
    name: str
    members: tuple[str, ...]
    regions: tuple[str, ...]
    source: str
    line: int


@dataclass(frozen=True, slots=True)
class ProvinceGeometry:
    province_id: int
    barony_id: str
    map_x: int
    map_y: int
    bbox: tuple[int, int, int, int]
    pixel_count: int
    geometry: "BaseGeometry"
    region_id: str = "world_westeros"
    terrain: str = "unknown"
    is_coastal: bool = False


@dataclass(frozen=True, slots=True)
class TitleAncestors:
    county_id: str | None = None
    duchy_id: str | None = None
    kingdom_id: str | None = None


@dataclass(frozen=True, slots=True)
class MapLocationRecord:
    id: str
    name: str
    english_name: str | None
    type: str
    map_x: int
    map_y: int
    province_id: int
    barony_id: str | None
    county_id: str | None
    duchy_id: str | None
    kingdom_id: str | None
    region_id: str
    terrain: str
    is_coastal: bool
    is_port: bool
    importance: int
    tags: tuple[str, ...]
    description: str | None = None
    icon: str | None = None


@dataclass(frozen=True, slots=True)
class RouteNodeRecord:
    id: str
    location_id: str
    map_x: int
    map_y: int
    province_id: int
    region_id: str
    is_port: bool


@dataclass(frozen=True, slots=True)
class RouteEdgeRecord:
    id: str
    from_id: str
    to_id: str
    distance: float
    road_level: str
    crossing: str
    allowed_modes: tuple[str, ...]
    base_days: float
    base_cost: float
    risk: float
    season_tags: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class RouteGraphRecord:
    nodes: tuple[RouteNodeRecord, ...]
    edges: tuple[RouteEdgeRecord, ...]
    dataset_hash: str
