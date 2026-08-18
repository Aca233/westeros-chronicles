"""Strict identity matching between runtime AGOT records and AWOIAF pages."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping

from .wiki import WikiCharacterPage


MINIMUM_SCORE = 80
MINIMUM_MARGIN = 15


def normalize(value: object) -> str:
    folded = unicodedata.normalize("NFKD", str(value or ""))
    return re.sub(r"[^a-z0-9]+", "", folded.encode("ascii", "ignore").decode("ascii").lower())


def _birth_year(record: Mapping[str, Any]) -> int | None:
    raw = str(record.get("birthDate") or "").split(".", 1)[0]
    if not raw.lstrip("-").isdigit():
        return None
    year = int(raw)
    return year - 8000 if year >= 8000 else year


def _dynasty(record: Mapping[str, Any]) -> str:
    value = str(record.get("dynastyId") or "")
    value = re.sub(r"^dynn_", "", value, flags=re.IGNORECASE)
    value = re.sub(r"_(?:of|the)_", " ", value, flags=re.IGNORECASE)
    return normalize(value.replace("_", " "))


@dataclass(frozen=True)
class MatchedPortrait:
    character_id: str
    page: WikiCharacterPage
    score: int
    source: str
    focal_point: str | None = None


@dataclass
class PortraitMatchResult:
    accepted: dict[str, MatchedPortrait] = field(default_factory=dict)
    ambiguous: dict[str, list[str]] = field(default_factory=dict)
    unmatched: set[str] = field(default_factory=set)
    conflicts: dict[str, list[str]] = field(default_factory=dict)


def _score_page(
    record: Mapping[str, Any],
    page: WikiCharacterPage,
    records_by_id: Mapping[str, Mapping[str, Any]],
) -> int | None:
    record_name = normalize(record.get("nameKey") or record.get("name"))
    page_name = normalize(page.firstname or page.title.split(" ", 1)[0])
    if not record_name or record_name != page_name:
        return None
    score = 50
    evidence = False
    dynasty = _dynasty(record)
    page_lastname = normalize(page.lastname)
    allegiance = normalize(page.allegiance)
    if dynasty:
        if page_lastname == dynasty:
            score += 40
            evidence = True
        if dynasty in allegiance:
            score += 25
            evidence = True
        if page_lastname and page_lastname != dynasty and dynasty not in allegiance:
            return None

    record_year = _birth_year(record)
    if record_year is not None and page.birth_year is not None:
        difference = abs(record_year - page.birth_year)
        if difference > 10:
            return None
        score += 25 if difference == 0 else 15 if difference <= 2 else 5
        evidence = True

    for id_field, page_parent in (("fatherId", page.father), ("motherId", page.mother)):
        parent_id = record.get(id_field)
        parent = records_by_id.get(str(parent_id)) if parent_id else None
        parent_name = normalize(parent.get("nameKey") or parent.get("name")) if parent else ""
        normalized_page_parent = normalize(page_parent)
        if parent_name and normalized_page_parent:
            if parent_name not in normalized_page_parent:
                return None
            score += 20
            evidence = True
    return score if evidence else None


def match_characters(
    records: Iterable[Mapping[str, Any]],
    kinship: Mapping[str, Mapping[str, Any]],
    pages: Iterable[WikiCharacterPage],
    overrides: Mapping[str, Any],
) -> PortraitMatchResult:
    del kinship  # Parent pointers are already present on static records.
    record_list = sorted((dict(record) for record in records), key=lambda record: record["id"])
    records_by_id = {record["id"]: record for record in record_list}
    page_list = sorted(pages, key=lambda page: page.title)
    pages_by_title = {page.title: page for page in page_list}
    pages_by_name: dict[str, list[WikiCharacterPage]] = {}
    for page in page_list:
        pages_by_name.setdefault(normalize(page.firstname or page.title.split(" ", 1)[0]), []).append(page)

    result = PortraitMatchResult()
    reserved_pages: set[str] = set()
    for character_id, raw_override in sorted(overrides.items()):
        if character_id not in records_by_id:
            raise ValueError(f"头像覆盖引用不存在人物：{character_id}")
        override = {"pageTitle": raw_override} if isinstance(raw_override, str) else dict(raw_override)
        page_title = str(override.get("pageTitle", ""))
        page = pages_by_title.get(page_title)
        if page is None:
            raise ValueError(f"头像覆盖引用不存在页面：{page_title}")
        if page_title in reserved_pages:
            raise ValueError(f"头像覆盖重复使用页面：{page_title}")
        reserved_pages.add(page_title)
        result.accepted[character_id] = MatchedPortrait(
            character_id=character_id,
            page=page,
            score=1000,
            source="override",
            focal_point=override.get("focalPoint"),
        )

    tentative: dict[str, tuple[WikiCharacterPage, int]] = {}
    for record in record_list:
        character_id = record["id"]
        if character_id in result.accepted:
            continue
        candidates = []
        name = normalize(record.get("nameKey") or record.get("name"))
        for page in pages_by_name.get(name, []):
            if page.title in reserved_pages:
                continue
            score = _score_page(record, page, records_by_id)
            if score is not None:
                candidates.append((page, score))
        candidates.sort(key=lambda entry: (-entry[1], entry[0].title))
        if not candidates:
            result.unmatched.add(character_id)
            continue
        top_page, top_score = candidates[0]
        second_score = candidates[1][1] if len(candidates) > 1 else -10_000
        if top_score < MINIMUM_SCORE or top_score - second_score < MINIMUM_MARGIN:
            result.ambiguous[character_id] = [page.title for page, _ in candidates[:5]]
            continue
        tentative[character_id] = (top_page, top_score)

    characters_by_page: dict[str, list[str]] = {}
    for character_id, (page, _) in tentative.items():
        characters_by_page.setdefault(page.title, []).append(character_id)
    for character_id, (page, score) in sorted(tentative.items()):
        collisions = sorted(characters_by_page[page.title])
        if len(collisions) > 1:
            result.ambiguous[character_id] = [page.title]
            result.conflicts[character_id] = collisions
            continue
        result.accepted[character_id] = MatchedPortrait(
            character_id=character_id,
            page=page,
            score=score,
            source="automatic",
        )
    return result
