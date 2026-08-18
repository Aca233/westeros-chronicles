"""Select the compact 298 AC runtime character roster."""
from __future__ import annotations

import copy
from typing import Any, Iterable, Mapping


CORE_TIERS = frozenset({"canon", "semicanon"})
ARRAY_RELATION_FIELDS = ("spouseIds", "childIds", "siblingIds")


def select_runtime_character_ids(
    records: Iterable[Mapping[str, Any]],
    title_holders: Mapping[str, Any],
    kinship: Mapping[str, Mapping[str, Any]],
) -> set[str]:
    """Return living core/title seeds plus one born kinship hop."""
    records_by_id = {str(record["id"]): record for record in records}
    seeds = {
        character_id
        for character_id, record in records_by_id.items()
        if bool(record.get("born"))
        and bool(record.get("alive"))
        and (record.get("canonTier") in CORE_TIERS or character_id in title_holders)
    }
    retained = set(seeds)
    for character_id in sorted(seeds):
        entry = kinship.get(character_id, {})
        related_ids = [entry.get("fatherId"), entry.get("motherId")]
        for field in ARRAY_RELATION_FIELDS:
            related_ids.extend(entry.get(field, []))
        retained.update(
            related_id
            for related_id in related_ids
            if related_id in records_by_id and bool(records_by_id[related_id].get("born"))
        )
    return retained


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
