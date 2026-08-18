"""Project AGOT landed-title history to a deterministic campaign snapshot."""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping

from .paradox import parse_document
from .timeline import AgotDate


@dataclass(frozen=True)
class ProjectedTitle:
    id: str
    name: str
    tier: str


_TIER_BY_PREFIX: dict[str, tuple[int, str]] = {
    "h": (0, "hegemon"),
    "e": (1, "empire"),
    "k": (2, "kingdom"),
    "d": (3, "duchy"),
    "c": (4, "county"),
    "b": (5, "barony"),
}


def _tier(title_id: str) -> tuple[int, str]:
    prefix = title_id.split("_", 1)[0]
    return _TIER_BY_PREFIX.get(prefix, (6, "other"))


def _readable_title_name(title_id: str) -> str:
    without_prefix = re.sub(r"^[hekdcb]_", "", title_id)
    words = without_prefix.replace("_", " ").strip()
    return words.title() or "Unknown Holding"


def _localized_title_name(title_id: str, localization: Mapping[str, str]) -> str:
    localized = localization.get(title_id, "").strip()
    return localized or _readable_title_name(title_id)


def project_title_holders(
    title_files: Iterable[Path],
    start_date: AgotDate,
    localization: Mapping[str, str],
) -> dict[str, tuple[ProjectedTitle, ...]]:
    """Return raw character IDs mapped to their holdings at ``start_date``.

    Only direct ``holder`` operations inside dated title blocks are interpreted.
    Scripted effects and nested scopes are intentionally ignored.
    """

    latest_by_title: dict[str, tuple[AgotDate, int, int, str]] = {}
    for file_index, path in enumerate(sorted((Path(path) for path in title_files), key=lambda item: item.as_posix())):
        entries = parse_document(path.read_text(encoding="utf-8-sig", errors="replace"))
        for title in entries:
            for dated in title.children:
                try:
                    event_date = AgotDate.parse(dated.key)
                except (TypeError, ValueError):
                    continue
                if event_date > start_date:
                    continue
                for holder in dated.children:
                    if holder.key != "holder" or holder.value is None:
                        continue
                    candidate = (event_date, file_index, holder.line, holder.value)
                    existing = latest_by_title.get(title.key)
                    if existing is None or candidate[:3] >= existing[:3]:
                        latest_by_title[title.key] = candidate

    titles_by_holder: dict[str, list[ProjectedTitle]] = {}
    for title_id, (_, _, _, holder_id) in latest_by_title.items():
        if holder_id == "0":
            continue
        _, tier = _tier(title_id)
        titles_by_holder.setdefault(holder_id, []).append(ProjectedTitle(
            id=title_id,
            name=_localized_title_name(title_id, localization),
            tier=tier,
        ))

    projected: dict[str, tuple[ProjectedTitle, ...]] = {}
    for holder_id in sorted(titles_by_holder):
        ordered = sorted(titles_by_holder[holder_id], key=lambda title: (_tier(title.id)[0], title.id))
        unique: list[ProjectedTitle] = []
        seen_names: set[str] = set()
        for title in ordered:
            if title.name in seen_names:
                continue
            seen_names.add(title.name)
            unique.append(title)
        if unique:
            projected[holder_id] = tuple(unique)
    return projected
