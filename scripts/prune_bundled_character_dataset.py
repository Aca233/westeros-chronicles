"""Prune the bundled AGOT character dataset without reading game files."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
from pathlib import Path
from typing import Any

from scripts.agot_character_import.roster import sanitize_runtime_records, select_runtime_character_ids
from scripts.agot_character_import.writer import _build_kinship_index


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _json_bytes(value: object, *, pretty: bool = False) -> bytes:
    text = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        indent=2 if pretty else None,
        separators=None if pretty else (",", ":"),
    )
    return f"{text}\n".encode("utf-8")


def _load_record_shards(root: Path) -> list[dict[str, Any]]:
    return [
        record
        for path in sorted((root / "shards").glob("*.json"))
        for record in _read_json(path)
    ]


def _load_mapping_shards(root: Path, directory: str) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for path in sorted((root / directory).glob("*.json")):
        merged.update(_read_json(path))
    return merged


def _character_shard(character_id: str) -> str:
    return hashlib.sha256(character_id.encode("utf-8")).hexdigest()[:2]


def _write_mapping_shards(root: Path, directory: str, mapping: dict[str, Any]) -> None:
    target = root / directory
    target.mkdir(parents=True, exist_ok=True)
    shards: dict[str, dict[str, Any]] = {}
    for character_id, value in sorted(mapping.items()):
        shards.setdefault(_character_shard(character_id), {})[character_id] = value
    for shard, values in sorted(shards.items()):
        (target / f"{shard}.json").write_bytes(_json_bytes(values))


def prune_bundled_dataset(root: Path) -> dict[str, int]:
    root = root.resolve()
    manifest = _read_json(root / "manifest.json")
    records = _load_record_shards(root)
    search_index = _read_json(root / "search-index.json")
    title_holders = _read_json(root / "title-holders.json")
    kinship = _load_mapping_shards(root, "kinship")
    loadouts = _load_mapping_shards(root, "loadouts")

    retained_ids = select_runtime_character_ids(records, title_holders, kinship)
    runtime_records = sanitize_runtime_records(records, retained_ids)
    final_kinship = _build_kinship_index(runtime_records)
    final_search = sorted(
        (entry for entry in search_index if entry["id"] in retained_ids),
        key=lambda entry: (entry["name"], entry["id"]),
    )
    final_titles = {
        character_id: titles
        for character_id, titles in sorted(title_holders.items())
        if character_id in retained_ids
    }
    final_loadouts = {
        character_id: profile
        for character_id, profile in sorted(loadouts.items())
        if character_id in retained_ids
    }
    projected_count = int(manifest.get("counts", {}).get("projectedRecords", len(records)))
    counts = dict(manifest.get("counts", {}))
    counts.update({
        "projectedRecords": projected_count,
        "emittedRecords": len(runtime_records),
        "prunedRecords": projected_count - len(runtime_records),
        "canon": sum(record["canonTier"] == "canon" for record in runtime_records),
        "semicanon": sum(record["canonTier"] == "semicanon" for record in runtime_records),
        "modSupporting": sum(record["canonTier"] == "mod_supporting" for record in runtime_records),
        "genealogy": sum(record["canonTier"] == "genealogy" for record in runtime_records),
        "titleHolderCount": len(final_titles),
        "heldTitleCount": sum(len(titles) for titles in final_titles.values()),
        "parentChildLinkCount": sum(len(entry["childIds"]) for entry in final_kinship.values()),
    })

    search_by_id = {entry["id"]: entry for entry in final_search}
    record_shards: dict[str, list[dict[str, Any]]] = {}
    for record in runtime_records:
        shard = search_by_id.get(record["id"], {}).get("shard") or _character_shard(record["id"])
        record_shards.setdefault(shard, []).append(record)
    for shard_records in record_shards.values():
        shard_records.sort(key=lambda record: record["id"])

    fingerprint = {
        "schemaVersion": manifest["schemaVersion"],
        "startDate": manifest["startDate"],
        "source": manifest.get("source", {}),
        "records": [record for shard in sorted(record_shards) for record in record_shards[shard]],
        "titleHolders": final_titles,
        "kinship": final_kinship,
    }
    dataset_hash = hashlib.sha256(_json_bytes(fingerprint)).hexdigest()
    final_manifest = {
        **manifest,
        "datasetHash": dataset_hash,
        "counts": counts,
        "shards": sorted(record_shards),
    }

    temporary = Path(tempfile.mkdtemp(prefix=f".{root.name}-", dir=root.parent))
    try:
        (temporary / "shards").mkdir()
        for shard, shard_records in sorted(record_shards.items()):
            (temporary / "shards" / f"{shard}.json").write_bytes(_json_bytes(shard_records))
        _write_mapping_shards(temporary, "kinship", final_kinship)
        _write_mapping_shards(temporary, "loadouts", final_loadouts)
        (temporary / "manifest.json").write_bytes(_json_bytes(final_manifest, pretty=True))
        (temporary / "search-index.json").write_bytes(_json_bytes(final_search))
        (temporary / "title-holders.json").write_bytes(_json_bytes(final_titles))

        if (root / "reports").exists():
            shutil.copytree(root / "reports", temporary / "reports")
        else:
            (temporary / "reports").mkdir()
        import_report_path = temporary / "reports" / "import-report.json"
        import_report = _read_json(import_report_path) if import_report_path.exists() else {}
        import_report.update({"datasetHash": dataset_hash, "counts": counts})
        import_report_path.write_bytes(_json_bytes(import_report, pretty=True))
        eligible_living = sum(bool(record.get("born") and record.get("alive")) for record in runtime_records)
        template_counts: dict[str, int] = {}
        for profile in final_loadouts.values():
            template_id = profile["templateId"]
            template_counts[template_id] = template_counts.get(template_id, 0) + 1
        (temporary / "reports" / "loadout-report.json").write_bytes(_json_bytes({
            "eligibleLiving": eligible_living,
            "assigned": len(final_loadouts),
            "unassigned": eligible_living - len(final_loadouts),
            "templates": dict(sorted(template_counts.items())),
        }, pretty=True))

        shutil.rmtree(root)
        shutil.move(str(temporary), str(root))
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise

    return counts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--characters", type=Path, default=Path("public/data/agot-characters"))
    args = parser.parse_args()
    counts = prune_bundled_dataset(args.characters)
    print(json.dumps(counts, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
