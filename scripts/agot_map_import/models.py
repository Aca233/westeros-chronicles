from __future__ import annotations

from dataclasses import dataclass


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
