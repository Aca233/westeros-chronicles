"""Select the compact 298 AC runtime character roster by reference closure."""
from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any, Iterable, Mapping


CORE_TIERS = frozenset({"canon", "semicanon", "genealogy"})
ARRAY_RELATION_FIELDS = ("spouseIds", "childIds", "siblingIds")
TITLE_TIERS_BY_PRIORITY = ("empire", "kingdom", "duchy", "county", "barony")


@dataclass(frozen=True)
class RosterReferences:
    playable_ids: frozenset[str]
    content_ids: frozenset[str]
    start_state_ids: frozenset[str]
    artifact_holder_ids: frozenset[str]
    title_holders: Mapping[str, Any]
    kinship: Mapping[str, Mapping[str, Any]]


def _born_reference_ids(candidate_ids: Iterable[str], records_by_id: Mapping[str, Mapping[str, Any]]) -> set[str]:
    return {
        character_id
        for character_id in candidate_ids
        if character_id in records_by_id and bool(records_by_id[character_id].get("born"))
    }


def select_runtime_character_ids(
    records: Iterable[Mapping[str, Any]],
    references: RosterReferences,
) -> set[str]:
    """Keep core tiers plus every explicit reference seed and one born kinship hop.

    Holding a title alone is no longer a retention reason; such holders are
    downgraded to lightweight summaries by partition_runtime_characters.
    """
    records_by_id = {str(record["id"]): record for record in records}
    seeds = {
        character_id
        for character_id, record in records_by_id.items()
        if bool(record.get("born")) and record.get("canonTier") in CORE_TIERS
    }
    for explicit_ids in (
        references.playable_ids,
        references.content_ids,
        references.start_state_ids,
    ):
        seeds |= _born_reference_ids(explicit_ids, records_by_id)
    retained = set(seeds)
    for character_id in sorted(seeds):
        entry = references.kinship.get(character_id, {})
        related_ids = [entry.get("fatherId"), entry.get("motherId")]
        for field in ARRAY_RELATION_FIELDS:
            related_ids.extend(entry.get(field, []) or [])
        retained.update(
            related_id
            for related_id in related_ids
            if related_id in records_by_id
            and bool(records_by_id[related_id].get("born"))
            and records_by_id[related_id].get("canonTier") in CORE_TIERS
        )
    return retained


def _primary_title(titles: Iterable[Mapping[str, Any]]) -> Mapping[str, Any] | None:
    by_tier = {str(title.get("tier", "")): title for title in titles}
    for tier in TITLE_TIERS_BY_PRIORITY:
        if tier in by_tier:
            return by_tier[tier]
    titles_list = list(titles)
    return titles_list[0] if titles_list else None


def build_holder_summaries(
    records: Iterable[Mapping[str, Any]],
    title_holders: Mapping[str, Any],
    retained_ids: set[str],
    previous: Mapping[str, Mapping[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """One lightweight summary per title holder that is not a full record.

    Holders whose records were pruned in an earlier pass are carried forward
    from the previous summary generation so repeated pruning stays stable.
    """
    records_by_id = {str(record["id"]): record for record in records}
    summaries: list[dict[str, Any]] = []
    for character_id, titles in sorted(title_holders.items()):
        if character_id in retained_ids:
            continue
        record = records_by_id.get(character_id)
        if record is None:
            carried = (previous or {}).get(character_id)
            if carried is not None:
                summaries.append(dict(carried))
            continue
        title_list = list(titles)
        primary = _primary_title(title_list)
        summaries.append({
            "id": character_id,
            "name": record.get("name") or character_id,
            "dynastyId": record.get("dynastyId"),
            "alive": bool(record.get("alive")),
            "titleIds": sorted(str(title.get("id")) for title in title_list if title.get("id")),
            "displayLabel": str(primary.get("name")) if primary and primary.get("name") else (record.get("name") or character_id),
        })
    return summaries


def partition_runtime_characters(
    records: Iterable[Mapping[str, Any]],
    references: RosterReferences,
    previous_summaries: Mapping[str, Mapping[str, Any]] | None = None,
) -> tuple[set[str], dict[str, dict[str, Any]]]:
    full_ids = select_runtime_character_ids(records, references)
    summaries = {
        summary["id"]: summary
        for summary in build_holder_summaries(records, references.title_holders, full_ids, previous_summaries)
    }
    return full_ids, summaries


def retention_reason_counts(
    records: Iterable[Mapping[str, Any]],
    references: RosterReferences,
    retained_ids: set[str],
) -> dict[str, int]:
    """Per-reason retention counts for the pruning audit report."""
    records_by_id = {str(record["id"]): record for record in records}
    counts = {
        "coreTier": 0,
        "playableEntry": 0,
        "narrativeContent": 0,
        "startState": 0,
        "artifactHolder": 0,
        "kinshipHop": 0,
    }
    for character_id in retained_ids:
        record = records_by_id.get(character_id)
        if record is None:
            continue
        if record.get("born") and record.get("canonTier") in CORE_TIERS:
            counts["coreTier"] += 1
        if character_id in references.playable_ids:
            counts["playableEntry"] += 1
        if character_id in references.content_ids:
            counts["narrativeContent"] += 1
        if character_id in references.start_state_ids:
            counts["startState"] += 1
        if character_id in references.artifact_holder_ids:
            counts["artifactHolder"] += 1
    explicit = (
        set(references.playable_ids) | set(references.content_ids)
        | set(references.start_state_ids) | set(references.artifact_holder_ids)
    )
    core_born = {
        character_id for character_id, record in records_by_id.items()
        if record.get("born") and record.get("canonTier") in CORE_TIERS
    }
    seeds = (core_born & retained_ids) | (explicit & retained_ids)
    counts["kinshipHop"] = len(retained_ids - seeds)
    return counts


def _relation_character_id(target_id: object) -> str | None:
    if not isinstance(target_id, str) or not target_id:
        return None
    if target_id.startswith("agot:"):
        return target_id
    if target_id.startswith("character:") and len(target_id) > len("character:"):
        return f"agot:{target_id[len('character:') :]}"
    return None


def sanitize_runtime_records(
    records: Iterable[Mapping[str, Any]], retained_ids: set[str]
) -> list[dict[str, Any]]:
    """Copy retained records and remove references outside the runtime roster."""
    sanitized: list[dict[str, Any]] = []
    for source in sorted(records, key=lambda record: str(record["id"])):
        if source["id"] not in retained_ids:
            continue
        record = copy.deepcopy(dict(source))
        for field in ("fatherId", "motherId", "killerId"):
            if record.get(field) not in retained_ids:
                record[field] = None
        record["spouseIds"] = sorted({
            spouse_id for spouse_id in record.get("spouseIds", []) if spouse_id in retained_ids
        })
        record["relations"] = [
            relation
            for relation in record.get("relations", [])
            if _relation_character_id(relation.get("target_id")) in retained_ids
        ]
        sanitized.append(record)
    return sanitized
