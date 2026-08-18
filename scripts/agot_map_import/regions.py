from __future__ import annotations

from pathlib import Path
from typing import Mapping

from .models import MapImportError, RegionDefinition
from .paradox import Entry, parse_file


MEMBER_BLOCKS = ("duchies", "counties", "provinces", "baronies")


def _block_values(entry: Entry) -> tuple[str, ...]:
    return tuple(
        child.value
        for child in entry.children
        if child.key == "$value" and child.value
    )


def parse_regions(directory: Path) -> dict[str, RegionDefinition]:
    regions: dict[str, RegionDefinition] = {}
    for path in sorted(directory.glob("*.txt")):
        for entry in parse_file(path):
            if entry.value is not None or not entry.children:
                continue
            if entry.key in regions:
                previous = regions[entry.key]
                raise MapImportError(
                    f"地理区域重复：{entry.key}（{previous.source}:{previous.line} 与 {path}:{entry.line}）"
                )
            members: list[str] = []
            nested: list[str] = []
            for child in entry.children:
                if child.key in MEMBER_BLOCKS:
                    members.extend(_block_values(child))
                elif child.key == "regions":
                    nested.extend(_block_values(child))
            regions[entry.key] = RegionDefinition(
                name=entry.key,
                members=tuple(dict.fromkeys(members)),
                regions=tuple(dict.fromkeys(nested)),
                source=str(path),
                line=entry.line,
            )
    if not regions:
        raise MapImportError(f"没有在 {directory} 中找到地理区域")
    return regions


def expand_region(
    name: str,
    regions: Mapping[str, RegionDefinition],
    _stack: tuple[str, ...] = (),
) -> frozenset[str]:
    if name not in regions:
        raise MapImportError(f"地理区域不存在：{name}")
    if name in _stack:
        start = _stack.index(name)
        cycle = _stack[start:] + (name,)
        raise MapImportError(f"地理区域循环引用：{' -> '.join(cycle)}")
    region = regions[name]
    expanded = set(region.members)
    stack = _stack + (name,)
    for child_name in region.regions:
        expanded.update(expand_region(child_name, regions, stack))
    return frozenset(expanded)
