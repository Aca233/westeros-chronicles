"""Write deterministic, hash-sharded AGOT character datasets."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Mapping, Any

from .localization import resolve_name
from .model import CanonTier, CharacterHistory
from .roster import sanitize_runtime_records, select_runtime_character_ids
from .timeline import AgotDate, project_character
from .titles import ProjectedTitle


SCHEMA_VERSION = 2


@dataclass(frozen=True)
class DatasetManifest:
    schema_version: int
    dataset_hash: str
    start_date: str
    display_year: int
    counts: dict[str, int]
    shards: tuple[str, ...]
    source: dict[str, Any]


def _character_id(raw_id: str | None) -> str | None:
    return f"agot:{raw_id}" if raw_id else None


def _json_bytes(value: object, *, pretty: bool = False) -> bytes:
    if pretty:
        text = json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    else:
        text = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    return text.encode("utf-8")


def _record(history: CharacterHistory, start_date: AgotDate, localization: Mapping[str, str]) -> tuple[dict[str, Any], dict[str, Any], int]:
    projected = project_character(history, start_date)
    character_id = _character_id(history.raw_id)
    shard = hashlib.sha256(character_id.encode("utf-8")).hexdigest()[:2]
    full = {
        "id": character_id,
        "rawId": history.raw_id,
        "canonTier": history.tier.value,
        "name": resolve_name(history.name_key, localization),
        "nameKey": history.name_key,
        "dynastyId": history.dynasty,
        "fatherId": _character_id(history.father_id),
        "motherId": _character_id(history.mother_id),
        "cultureId": history.culture,
        "faithId": history.faith,
        "sexuality": history.sexuality,
        "female": history.female,
        "born": projected.born,
        "alive": projected.alive,
        "birthDate": str(projected.birth_date) if projected.birth_date else None,
        "deathDate": str(projected.death_date) if projected.death_date else None,
        "deathReason": projected.death_reason,
        "killerId": _character_id(projected.killer_id),
        "baseAttributes": projected.base_attributes,
        "traits": list(projected.traits),
        "spouseIds": [_character_id(raw_id) for raw_id in projected.spouse_ids],
        "relations": [asdict(relation) for relation in projected.relations],
        "hasDna": history.has_dna,
        "source": {"file": history.source_file.name, "line": history.source_line},
    }
    search = {
        "id": character_id,
        "name": full["name"],
        "nameKey": history.name_key,
        "dynastyId": history.dynasty,
        "canonTier": history.tier.value,
        "born": projected.born,
        "alive": projected.alive,
        "birthYear": projected.birth_date.ac_year if projected.birth_date else None,
        "deathYear": projected.death_date.ac_year if projected.death_date else None,
        "shard": shard,
    }
    return full, search, len(projected.unsupported_operations)


def _make_spouse_links_reciprocal(records: Iterable[dict[str, Any]]) -> int:
    record_list = list(records)
    records_by_id = {record["id"]: record for record in record_list}
    added = 0
    for record in record_list:
        for spouse_id in tuple(record["spouseIds"]):
            spouse = records_by_id.get(spouse_id)
            if spouse is None or record["id"] in spouse["spouseIds"]:
                continue
            spouse["spouseIds"].append(record["id"])
            added += 1
    return added


def _build_kinship_index(records: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    record_list = list(records)
    records_by_id = {record["id"]: record for record in record_list}
    kinship = {
        character_id: {
            "fatherId": record.get("fatherId"),
            "motherId": record.get("motherId"),
            "spouseIds": sorted(set(record.get("spouseIds", []))),
            "childIds": [],
            "siblingIds": [],
        }
        for character_id, record in sorted(records_by_id.items())
    }
    for child_id, record in sorted(records_by_id.items()):
        for field in ("fatherId", "motherId"):
            parent_id = record.get(field)
            if parent_id in kinship:
                kinship[parent_id]["childIds"].append(child_id)
    for entry in kinship.values():
        entry["childIds"] = sorted(set(entry["childIds"]))
    for character_id, entry in kinship.items():
        parent_ids = (entry.get("fatherId"), entry.get("motherId"))
        entry["siblingIds"] = sorted({
            sibling_id
            for parent_id in parent_ids
            if parent_id in kinship
            for sibling_id in kinship[parent_id]["childIds"]
            if sibling_id != character_id
        })
    return kinship


def write_dataset(
    histories: Iterable[CharacterHistory],
    output_root: Path,
    source_manifest: Mapping[str, Any],
    start_date: AgotDate,
    localization: Mapping[str, str],
    title_holders: Mapping[str, Iterable[ProjectedTitle]] | None = None,
) -> DatasetManifest:
    history_list = sorted(histories, key=lambda history: history.raw_id)
    emitted = [history for history in history_list if history.tier != CanonTier.TECHNICAL]
    projected_records: list[dict[str, Any]] = []
    projected_search: list[dict[str, Any]] = []
    unsupported_count = 0

    for history in emitted:
        full, search, unsupported = _record(history, start_date, localization)
        projected_records.append(full)
        projected_search.append(search)
        unsupported_count += unsupported

    reciprocal_spouse_links_added = _make_spouse_links_reciprocal(projected_records)

    emitted_raw_ids = {history.raw_id for history in emitted}
    full_title_map = {
        f"agot:{raw_id}": [asdict(title) for title in titles]
        for raw_id, titles in sorted((title_holders or {}).items())
        if raw_id in emitted_raw_ids
    }
    full_kinship_index = _build_kinship_index(projected_records)
    retained_ids = select_runtime_character_ids(projected_records, full_title_map, full_kinship_index)
    runtime_records = sanitize_runtime_records(projected_records, retained_ids)
    search_index = sorted(
        (entry for entry in projected_search if entry["id"] in retained_ids),
        key=lambda record: (record["name"], record["id"]),
    )
    title_map = {
        character_id: titles for character_id, titles in full_title_map.items() if character_id in retained_ids
    }
    shard_records: dict[str, list[dict[str, Any]]] = {}
    search_by_id = {entry["id"]: entry for entry in search_index}
    for record in runtime_records:
        shard_records.setdefault(search_by_id[record["id"]]["shard"], []).append(record)
    kinship_index = _build_kinship_index(runtime_records)

    counts = {
        "totalSourceRecords": len(history_list),
        "projectedRecords": len(emitted),
        "emittedRecords": len(runtime_records),
        "prunedRecords": len(emitted) - len(runtime_records),
        "excludedTechnical": len(history_list) - len(emitted),
        "canon": sum(record["canonTier"] == CanonTier.CANON.value for record in runtime_records),
        "semicanon": sum(record["canonTier"] == CanonTier.SEMICANON.value for record in runtime_records),
        "modSupporting": sum(record["canonTier"] == CanonTier.MOD_SUPPORTING.value for record in runtime_records),
        "genealogy": sum(record["canonTier"] == CanonTier.GENEALOGY.value for record in runtime_records),
        "unsupportedOperations": unsupported_count,
        "reciprocalSpouseLinksAdded": reciprocal_spouse_links_added,
        "titleHolderCount": len(title_map),
        "heldTitleCount": sum(len(titles) for titles in title_map.values()),
        "parentChildLinkCount": sum(len(entry["childIds"]) for entry in kinship_index.values()),
    }
    fingerprint = {
        "schemaVersion": SCHEMA_VERSION,
        "startDate": str(start_date),
        "source": dict(source_manifest),
        "records": [record for shard in sorted(shard_records) for record in shard_records[shard]],
        "titleHolders": title_map,
        "kinship": kinship_index,
    }
    dataset_hash = hashlib.sha256(_json_bytes(fingerprint)).hexdigest()
    shard_names = tuple(sorted(shard_records))
    manifest = DatasetManifest(
        schema_version=SCHEMA_VERSION,
        dataset_hash=dataset_hash,
        start_date=str(start_date),
        display_year=start_date.ac_year,
        counts=counts,
        shards=shard_names,
        source=dict(source_manifest),
    )
    manifest_json = {
        "schemaVersion": manifest.schema_version,
        "datasetHash": manifest.dataset_hash,
        "startDate": manifest.start_date,
        "displayYear": manifest.display_year,
        "counts": manifest.counts,
        "shards": list(manifest.shards),
        "source": manifest.source,
    }
    report = {
        "datasetHash": dataset_hash,
        "counts": counts,
        "excludedTiers": [CanonTier.TECHNICAL.value],
        "warnings": [],
    }

    output_root = output_root.resolve()
    output_root.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=f".{output_root.name}-", dir=output_root.parent))
    try:
        (temporary / "shards").mkdir()
        (temporary / "kinship").mkdir()
        (temporary / "reports").mkdir()
        (temporary / "manifest.json").write_bytes(_json_bytes(manifest_json, pretty=True))
        (temporary / "search-index.json").write_bytes(_json_bytes(search_index))
        (temporary / "title-holders.json").write_bytes(_json_bytes(title_map))
        kinship_shards: dict[str, dict[str, Any]] = {}
        for character_id, entry in kinship_index.items():
            shard = hashlib.sha256(character_id.encode("utf-8")).hexdigest()[:2]
            kinship_shards.setdefault(shard, {})[character_id] = entry
        for shard, entries in kinship_shards.items():
            (temporary / "kinship" / f"{shard}.json").write_bytes(_json_bytes(entries))
        (temporary / "reports" / "import-report.json").write_bytes(_json_bytes(report, pretty=True))
        for shard, records in shard_records.items():
            (temporary / "shards" / f"{shard}.json").write_bytes(_json_bytes(records))
        if output_root.exists():
            shutil.rmtree(output_root)
        try:
            os.replace(temporary, output_root)
        except PermissionError:
            # WSL-mounted NTFS can reject directory-level os.replace after a
            # large write even though a normal move remains available.
            shutil.move(str(temporary), str(output_root))
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise

    return manifest
