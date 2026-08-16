"""Read AGOT Simplified Chinese Paradox localization files."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable, Mapping


ENTRY_PATTERN = re.compile(r'^\s*([^\s:#]+):\d*\s+"(.*)"\s*$')
ICON_PATTERN = re.compile(r"@[A-Za-z0-9_./-]+!")
FORMAT_OPEN_PATTERN = re.compile(r"#[A-Za-z0-9_]+\s*")
SPACE_PATTERN = re.compile(r"\s+")


def clean_localized_text(value: str) -> str:
    value = value.replace(r'\"', '"').replace(r"\n", " ")
    value = ICON_PATTERN.sub("", value)
    value = FORMAT_OPEN_PATTERN.sub("", value).replace("#!", "")
    return SPACE_PATTERN.sub(" ", value).strip()


def load_localization(paths: Iterable[Path]) -> dict[str, str]:
    entries: dict[str, str] = {}
    for path in paths:
        for line in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
            match = ENTRY_PATTERN.match(line)
            if match:
                entries[match.group(1)] = clean_localized_text(match.group(2))
    return entries


def resolve_name(name_key: str | None, localization: Mapping[str, str]) -> str:
    if not name_key:
        return "未知人物"
    return localization.get(name_key, name_key)
