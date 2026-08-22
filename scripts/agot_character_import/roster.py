"""Select the compact 298 AC runtime character roster by reference closure."""
from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any, Iterable, Mapping


CORE_TIERS = frozenset({"canon", "semicanon", "genealogy"})
ARRAY_RELATION_FIELDS = ("spouseIds", "childIds", "siblingIds")
TITLE_TIERS_BY_PRIORITY = ("empire", "kingdom", "duchy", "county", "barony")
_TITLE_RANK_BY_PREFIX = {"b_": "barony", "c_": "county", "d_": "duchy", "k_": "kingdom", "e_": "empire", "h_": "hegemon"}
_TIER_SORT_RANK = {"h_": 0, "e_": 1, "k_": 2, "d_": 3, "c_": 4, "b_": 5}


def _title_rank(title_id: str) -> str:
    return _TITLE_RANK_BY_PREFIX.get(title_id[:2], "unknown")


def _title_sort_key(title: Mapping[str, Any]) -> tuple[int, str]:
    title_id = str(title["id"])
    return (_TIER_SORT_RANK.get(title_id[:2], 9), title_id)


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


def resolve_holder_succession(
    records: Iterable[Mapping[str, Any]],
    title_holders: Mapping[str, Any],
    retained_ids: set[str],
    *,
    title_parent: Mapping[str, str] | None = None,
    title_centroid: Mapping[str, tuple[float, float]] | None = None,
    previous_summaries: Mapping[str, Mapping[str, Any]] | None = None,
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, int]]:
    """Reassign titles held by pruned characters to retained successors.

    Per orphaned title, in priority order:

    1. Liege climb: walk the feudal parent chain and pick the first title
       whose original holder is still retained (pruned intermediates are
       skipped, so a barony whose count was also pruned goes to its duke).
    2. Proximity: otherwise give it to the retained holder of a same-rank
       title with the nearest centroid; ties prefer the same dynasty, then
       the lexicographically smallest character id. If no same-rank holder
       has a centroid, any retained title holder with one is considered.
    3. Unresolved: keep the original mapping so the holder degrades to a
       lightweight summary as before.

    The candidate pool is built once from original holdings, so the result
    is deterministic and independent of processing order; running against a
    fully resolved map is a no-op.
    """
    records_by_id = {str(record["id"]): record for record in records}
    holder_titles: dict[str, list[dict[str, Any]]] = {
        str(holder): [dict(title) for title in titles]
        for holder, titles in sorted((title_holders or {}).items())
    }
    retained = set(retained_ids)
    parent = dict(title_parent or {})
    centroid = dict(title_centroid or {})

    def _dynasty_of(character_id: str) -> str | None:
        record = records_by_id.get(character_id)
        if record is not None and record.get("dynastyId"):
            return str(record["dynastyId"])
        summary = (previous_summaries or {}).get(character_id)
        if summary is not None and summary.get("dynastyId"):
            return str(summary["dynastyId"])
        return None

    title_to_holder: dict[str, str] = {}
    for character_id, titles in holder_titles.items():
        for title in titles:
            title_to_holder.setdefault(str(title["id"]), character_id)

    candidates_by_rank: dict[str, list[tuple[float, float, str]]] = {}
    for character_id in sorted(retained):
        for title in holder_titles.get(character_id, []):
            point = centroid.get(str(title["id"]))
            if point is not None:
                candidates_by_rank.setdefault(_title_rank(str(title["id"])), []).append(
                    (point[0], point[1], character_id)
                )
    all_candidates = [entry for entries in candidates_by_rank.values() for entry in entries]

    stats = {"reassignedByLiege": 0, "reassignedByProximity": 0, "unresolvedHolders": 0}
    for holder_id, titles in sorted(holder_titles.items()):
        if holder_id in retained:
            continue
        holder_dynasty = _dynasty_of(holder_id)
        for title in list(titles):
            title_id = str(title["id"])
            successor: tuple[str, str] | None = None
            seen: set[str] = set()
            ancestor = parent.get(title_id)
            while ancestor is not None and ancestor not in seen:
                seen.add(ancestor)
                ancestor_holder = title_to_holder.get(ancestor)
                if ancestor_holder is not None and ancestor_holder in retained:
                    successor = ("reassignedByLiege", ancestor_holder)
                    break
                ancestor = parent.get(ancestor)
            if successor is None:
                base = centroid.get(title_id)
                if base is not None:
                    pool = candidates_by_rank.get(_title_rank(title_id)) or all_candidates
                    best_key: tuple[float, int, str] | None = None
                    best_character: str | None = None
                    for x, y, candidate_id in pool:
                        distance = (x - base[0]) ** 2 + (y - base[1]) ** 2
                        dynasty_penalty = 0 if _dynasty_of(candidate_id) == holder_dynasty else 1
                        key = (distance, dynasty_penalty, candidate_id)
                        if best_key is None or key < best_key:
                            best_key = key
                            best_character = candidate_id
                    if best_character is not None and best_character != holder_id:
                        successor = ("reassignedByProximity", best_character)
            if successor is None:
                continue
            kind, target_id = successor
            stats[kind] += 1
            holder_titles.setdefault(target_id, []).append(title)
            titles.remove(title)
            if not titles:
                holder_titles.pop(holder_id, None)
                break
        if holder_titles.get(holder_id):
            stats["unresolvedHolders"] += 1

    merged: dict[str, list[dict[str, Any]]] = {}
    for character_id, titles in holder_titles.items():
        # Highest feudal tier first (primary title leads), then title id for
        # determinism. Same-named holdings (CK3 often names a duchy after its
        # capital county) collapse to the higher-tier entry so display lists
        # never repeat a localized name.
        ordered: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        seen_names: set[str] = set()
        for title in sorted(titles, key=_title_sort_key):
            title_id = str(title["id"])
            if title_id in seen_ids:
                continue
            name = str(title.get("name") or "")
            if name and name in seen_names:
                continue
            seen_names.add(name)
            seen_ids.add(title_id)
            ordered.append(title)
        merged[character_id] = ordered
    return merged, stats


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
