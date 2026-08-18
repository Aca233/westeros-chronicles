from __future__ import annotations

import re
from pathlib import Path

from .models import MapImportError
from .paradox import Entry, parse_file


DATE_PATTERN = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


def _date(value: str) -> tuple[int, int, int] | None:
    match = DATE_PATTERN.fullmatch(value)
    return tuple(int(part) for part in match.groups()) if match else None


def _holding(entry: Entry) -> str | None:
    value = entry.first("holding")
    return value.value if value and value.value else None


def parse_province_holdings(
    directory: Path,
    target_date: tuple[int, int, int] = (8298, 1, 1),
) -> dict[int, str]:
    holdings: dict[int, str] = {}
    for path in sorted(directory.glob("*.txt")):
        for province in parse_file(path):
            if not province.key.isdigit() or not province.children:
                continue
            province_id = int(province.key)
            holding = _holding(province)
            dated = sorted(
                (date, child)
                for child in province.children
                if child.children and (date := _date(child.key)) is not None and date <= target_date
            )
            for _, change in dated:
                holding = _holding(change) or holding
            if holding:
                existing = holdings.get(province_id)
                if existing and existing != holding:
                    raise MapImportError(f"省份 {province_id} 在多个历史文件中重复定义 holding")
                holdings[province_id] = holding
    return holdings


def holding_to_location_type(holding: str | None) -> str:
    return {
        "castle_holding": "castle",
        "city_holding": "city",
        "church_holding": "town",
        "monastery_holding": "landmark",
        "pirate_den_holding": "town",
        "ruin_holding": "ruin",
        "tribal_holding": "village",
        "none": "village",
    }.get(holding or "", "village")
