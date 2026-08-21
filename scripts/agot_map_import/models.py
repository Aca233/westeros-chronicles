from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

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
    empire_id: str | None = None
    hegemon_id: str | None = None


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


SemanticRank = Literal["hegemon", "empire", "kingdom", "duchy", "county"]


@dataclass(frozen=True, slots=True)
class SemanticBoundaryRecord:
    feature_id: int
    title_id: str
    rank: SemanticRank
    name: str | None
    region_id: str
    title_color: str
    geometry: "BaseGeometry"


@dataclass(frozen=True, slots=True)
class SemanticTitleRecord:
    feature_id: int
    title_id: str
    rank: SemanticRank
    name: str
    map_x: float
    map_y: float
    importance: int
    region_id: str
    title_color: str
    geometry: "BaseGeometry"
    anchor: "BaseGeometry"


@dataclass(frozen=True, slots=True)
class SemanticMembershipRecord:
    location_id: str
    barony_id: str
    county_id: str
    duchy_id: str
    kingdom_id: str | None
    empire_id: str | None
    hegemon_id: str | None
    region_id: str


@dataclass(frozen=True, slots=True)
class SemanticDataset:
    boundaries: tuple[SemanticBoundaryRecord, ...]
    titles: tuple[SemanticTitleRecord, ...]
    memberships: tuple[SemanticMembershipRecord, ...]
    missing_localizations: tuple[str, ...]


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


@dataclass(frozen=True, slots=True)
class TileReport:
    kind: str
    tile_count: int
    min_zoom: int
    max_zoom: int
    files: tuple[str, ...]
