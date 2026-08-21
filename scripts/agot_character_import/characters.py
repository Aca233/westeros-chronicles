"""Extract normalized character histories from parsed AGOT files."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable, Iterator

from .model import CanonTier, CharacterHistory, DatedEvent
from .paradox import Entry, parse_document


ATTRIBUTE_KEYS = ("diplomacy", "martial", "stewardship", "intrigue", "learning", "prowess")
DATE_PATTERN = re.compile(r"^\d+\.\d+\.\d+$")
CANON_FLAG = "canon_status_canon"
SEMICANON_FLAG = "canon_status_semicanon"


def walk_entries(entries: Iterable[Entry]) -> Iterator[Entry]:
    for entry in entries:
        yield entry
        yield from walk_entries(entry.children)


def _scalar(entry: Entry, key: str) -> str | None:
    child = entry.first(key)
    return child.value if child is not None else None


def _int_scalar(entry: Entry, key: str) -> int | None:
    raw = _scalar(entry, key)
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _all_flags(entry: Entry) -> tuple[str, ...]:
    flags: list[str] = []
    for child in walk_entries(entry.children):
        if child.key in {"add_character_flag", "set_character_flag"} and child.value:
            flags.append(child.value)
    return tuple(dict.fromkeys(flags))


def classify_character(raw_id: str, source_path: Path, flags: tuple[str, ...]) -> CanonTier:
    lowered_name = source_path.name.lower()
    lowered_id = raw_id.lower()
    if "dummy" in lowered_name or "dummy" in lowered_id or "placeholder" in lowered_id:
        return CanonTier.TECHNICAL
    if CANON_FLAG in flags:
        return CanonTier.CANON
    if SEMICANON_FLAG in flags:
        return CanonTier.SEMICANON
    if "ancestor" in lowered_name:
        return CanonTier.GENEALOGY
    return CanonTier.MOD_SUPPORTING


def extract_character_histories(path: Path) -> list[CharacterHistory]:
    document = parse_document(path.read_text(encoding="utf-8-sig"))
    histories: list[CharacterHistory] = []

    for entry in document:
        if entry.value is not None or entry.key == "$value":
            continue
        flags = _all_flags(entry)
        attributes = {
            key: value
            for key in ATTRIBUTE_KEYS
            if (value := _int_scalar(entry, key)) is not None
        }
        dated_events = [
            DatedEvent(child.key, child)
            for child in entry.children
            if DATE_PATTERN.fullmatch(child.key)
        ]
        dated_events.sort(key=lambda event: tuple(int(part) for part in event.raw_date.split(".")))
        undated_traits = tuple(
            child.value
            for child in entry.all("trait")
            if child.value is not None
        )
        histories.append(
            CharacterHistory(
                raw_id=entry.key,
                tier=classify_character(entry.key, path, flags),
                source_file=path,
                source_line=entry.line,
                name_key=_scalar(entry, "name"),
                dynasty=_scalar(entry, "dynasty"),
                father_id=_scalar(entry, "father"),
                mother_id=_scalar(entry, "mother"),
                culture=_scalar(entry, "culture"),
                faith=_scalar(entry, "religion"),
                sexuality=_scalar(entry, "sexuality"),
                female=_scalar(entry, "female") == "yes",
                base_attributes=attributes,
                undated_traits=undated_traits,
                dated_events=tuple(dated_events),
                flags=flags,
                has_dna=_scalar(entry, "dna") is not None,
                comments=entry.comments,
            )
        )

    return histories
