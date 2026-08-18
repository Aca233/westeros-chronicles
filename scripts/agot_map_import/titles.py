from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .models import MapImportError, TitleAncestors
from .paradox import Entry, parse_file


@dataclass(frozen=True, slots=True)
class TitleIndex:
    by_barony: dict[str, TitleAncestors]
    province_baronies: dict[int, str]

    def ancestors(self, barony_id: str) -> TitleAncestors:
        try:
            return self.by_barony[barony_id]
        except KeyError as error:
            raise MapImportError(f"男爵领不存在：{barony_id}") from error

    def barony_for_province(self, province_id: int) -> str | None:
        return self.province_baronies.get(province_id)


def _province_value(entry: Entry) -> int | None:
    province = entry.first("province")
    if province is None or province.value is None:
        return None
    try:
        return int(province.value)
    except ValueError as error:
        raise MapImportError(f"{entry.key} 的 province 不是整数：{province.value}") from error


def parse_title_hierarchy(paths: Path) -> TitleIndex:
    files = [paths] if paths.is_file() else sorted(paths.glob("*.txt"))
    by_barony: dict[str, TitleAncestors] = {}
    province_baronies: dict[int, str] = {}

    def walk(
        entry: Entry,
        kingdom_id: str | None,
        duchy_id: str | None,
        county_id: str | None,
    ) -> None:
        key = entry.key
        next_kingdom = key if key.startswith("k_") else kingdom_id
        next_duchy = key if key.startswith("d_") else duchy_id
        next_county = key if key.startswith("c_") else county_id
        if key.startswith("b_"):
            if key in by_barony:
                raise MapImportError(f"男爵领重复：{key}")
            by_barony[key] = TitleAncestors(next_county, next_duchy, next_kingdom)
            province_id = _province_value(entry)
            if province_id is not None:
                existing = province_baronies.get(province_id)
                if existing and existing != key:
                    raise MapImportError(f"省份 {province_id} 同时属于 {existing} 与 {key}")
                province_baronies[province_id] = key
        for child in entry.children:
            if child.children:
                walk(child, next_kingdom, next_duchy, next_county)

    for path in files:
        for entry in parse_file(path):
            if entry.children:
                walk(entry, None, None, None)
    if not by_barony:
        raise MapImportError(f"没有在 {paths} 中找到男爵领")
    return TitleIndex(by_barony=by_barony, province_baronies=province_baronies)
