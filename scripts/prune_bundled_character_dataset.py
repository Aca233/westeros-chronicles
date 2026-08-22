"""Prune the bundled AGOT character dataset without reading game files."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
from pathlib import Path
from typing import Any

from scripts.agot_character_import.roster import (
    RosterReferences,
    build_holder_summaries,
    partition_runtime_characters,
    resolve_holder_succession,
    retention_reason_counts,
    sanitize_runtime_records,
)
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


def _character_ids_from_principals(value: Any) -> set[str]:
    ids: set[str] = set()
    if not isinstance(value, dict):
        return ids
    for principal in (value.get("lawfulOwner"), value.get("controller"), value.get("custodian"), value.get("placement")):
        if isinstance(principal, dict) and principal.get("type") == "character" and principal.get("characterId"):
            ids.add(str(principal["characterId"]))
    return ids


def load_roster_references(characters_root: Path) -> RosterReferences:
    """Collect the formal reference closure from compiled world content."""
    data_root = characters_root.resolve().parent
    world_dir = data_root / "world"

    playable_ids: set[str] = set()
    content_ids: set[str] = set()
    start_state_ids: set[str] = set()
    artifact_holder_ids: set[str] = set()

    playable_path = world_dir / "playable-characters.json"
    if playable_path.exists():
        playable_ids = {str(entry["characterId"]) for entry in _read_json(playable_path)}

    content_dir = world_dir / "character-content"
    if content_dir.is_dir():
        for path in sorted(content_dir.glob("*.json")):
            if path.name == "index.json":
                continue
            shard = _read_json(path)
            if isinstance(shard, dict):
                content_ids.update(str(character_id) for character_id in shard)

    start_state_path = world_dir / "start-state.json"
    if start_state_path.exists():
        start_state = _read_json(start_state_path)
        for record in start_state.get("characters", []):
            start_state_ids.add(str(record["characterId"]))
        for record in start_state.get("assets", []):
            start_state_ids |= _character_ids_from_principals(record)
        for record in start_state.get("titles", []):
            for field in ("lawfulHolderId", "controllerId"):
                if record.get(field):
                    start_state_ids.add(str(record[field]))
            start_state_ids.update(str(cid) for cid in record.get("contestedByIds", []))

    artifact_state_path = data_root / "items" / "agot-artifact-world-state.json"
    if artifact_state_path.exists():
        artifact_state = _read_json(artifact_state_path)
        for artifact in artifact_state.get("artifacts", {}).values():
            if artifact.get("lawfulControllerId"):
                artifact_holder_ids.add(str(artifact["lawfulControllerId"]))
            placement = artifact.get("placement")
            if isinstance(placement, dict) and placement.get("type") == "character" and placement.get("characterId"):
                artifact_holder_ids.add(str(placement["characterId"]))

    title_holders = _read_json(characters_root / "title-holders.json")
    kinship = _load_mapping_shards(characters_root, "kinship")
    return RosterReferences(
        playable_ids=frozenset(playable_ids),
        content_ids=frozenset(content_ids),
        start_state_ids=frozenset(start_state_ids),
        artifact_holder_ids=frozenset(artifact_holder_ids),
        title_holders=title_holders,
        kinship=kinship,
    )


def _character_shard(character_id: str) -> str:
    return hashlib.sha256(character_id.encode("utf-8")).hexdigest()[:2]


def rebind_artifact_world_state(repo_root: Path, character_dataset_hash: str) -> bool:
    """Re-link the artifact world state to the freshly pruned character dataset.

    Pruning legitimately changes the character dataset hash; the artifact
    import pipeline owns the artifact records, so only the binding hashes are
    refreshed (the world datasetHash is recomputed with the writer's
    canonical JSON form).
    """
    state_path = repo_root / "public" / "data" / "items" / "agot-artifact-world-state.json"
    if not state_path.exists():
        return False
    state = _read_json(state_path)
    if state.get("characterDatasetHash") == character_dataset_hash:
        return False
    fingerprint = {
        "schemaVersion": state["schemaVersion"],
        "startDate": state["startDate"],
        "artifactDatasetHash": state["artifactDatasetHash"],
        "characterDatasetHash": character_dataset_hash,
        "artifacts": state["artifacts"],
    }
    bound = {**fingerprint, "datasetHash": hashlib.sha256(_json_bytes(fingerprint)).hexdigest()}
    state_path.write_bytes(_json_bytes(bound, pretty=True))

    typescript_path = repo_root / "src" / "data" / "generated" / "agotArtifactWorldState.ts"
    if typescript_path.exists():
        text = typescript_path.read_text(encoding="utf-8")
        text = text.replace(
            f'"characterDatasetHash": "{state["characterDatasetHash"]}"',
            f'"characterDatasetHash": "{bound["characterDatasetHash"]}"',
        )
        text = text.replace(
            f'"datasetHash": "{state["datasetHash"]}"',
            f'"datasetHash": "{bound["datasetHash"]}"',
        )
        typescript_path.write_text(text, encoding="utf-8")
    return True


def _write_mapping_shards(root: Path, directory: str, mapping: dict[str, Any]) -> None:
    target = root / directory
    target.mkdir(parents=True, exist_ok=True)
    shards: dict[str, dict[str, Any]] = {}
    for character_id, value in sorted(mapping.items()):
        shards.setdefault(_character_shard(character_id), {})[character_id] = value
    for shard, values in sorted(shards.items()):
        (target / f"{shard}.json").write_bytes(_json_bytes(values))


_SUCCESSOR_RANK_FIELDS = (
    ("baronyId", "countyId"),
    ("countyId", "duchyId"),
    ("duchyId", "kingdomId"),
    ("kingdomId", "empireId"),
    ("empireId", "hegemonId"),
)


def _load_title_geography(repo_root: Path) -> tuple[dict[str, str], dict[str, tuple[float, float]]]:
    """Feudal parent edges and per-title centroids from bundled AGOT map data.

    Parent chains come from semantic membership rows (barony through hegemon);
    centroids average member-baronies' map coordinates. Missing map data yields
    empty maps so succession still runs with liege/proximity disabled.
    """
    parent: dict[str, str] = {}
    centroid: dict[str, tuple[float, float]] = {}
    coords: dict[str, tuple[float, float]] = {}
    locations_root = repo_root / "public" / "data" / "agot-map" / "locations"
    if locations_root.is_dir():
        for path in sorted(locations_root.glob("*.json")):
            for location in _read_json(path):
                x, y = location.get("mapX"), location.get("mapY")
                if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                    coords[str(location["id"])] = (float(x), float(y))
    membership_path = repo_root / "public" / "data" / "agot-map" / "semantic" / "membership.json"
    if membership_path.exists():
        for row in _read_json(membership_path):
            barony_id = str(row.get("baronyId") or "")
            point = coords.get(barony_id)
            titles = [str(row.get(field)) for field, _ in _SUCCESSOR_RANK_FIELDS]
            titles = [title for title in titles if title and title != "None"]
            if point is not None:
                for title_id in titles:
                    total_x, total_y, count = centroid.get(title_id, (0.0, 0.0, 0))
                    centroid[title_id] = (total_x + point[0], total_y + point[1], count + 1)
            for child_field, ancestor_field in _SUCCESSOR_RANK_FIELDS:
                child = row.get(child_field)
                liege = row.get(ancestor_field)
                if child and liege:
                    parent.setdefault(str(child), str(liege))
    averaged = {
        title_id: (total_x / count, total_y / count)
        for title_id, (total_x, total_y, count) in centroid.items()
        if count > 0
    }
    return parent, averaged


def prune_bundled_dataset(root: Path, references: RosterReferences | None = None) -> dict[str, int]:
    root = root.resolve()
    manifest = _read_json(root / "manifest.json")
    records = _load_record_shards(root)
    search_index = _read_json(root / "search-index.json")
    title_holders = _read_json(root / "title-holders.json")
    kinship = _load_mapping_shards(root, "kinship")
    loadouts = _load_mapping_shards(root, "loadouts")
    if references is None:
        references = load_roster_references(root)
    else:
        references = RosterReferences(
            playable_ids=references.playable_ids,
            content_ids=references.content_ids,
            start_state_ids=references.start_state_ids,
            artifact_holder_ids=references.artifact_holder_ids,
            title_holders=title_holders,
            kinship=kinship,
        )

    previous_summaries: dict[str, dict[str, Any]] = {}
    previous_summaries_path = root / "holder-summaries.json"
    if previous_summaries_path.exists():
        previous_summaries = {
            str(summary["id"]): summary
            for summary in _read_json(previous_summaries_path).get("holders", [])
        }
    retained_ids, _ = partition_runtime_characters(records, references, previous_summaries)
    title_parent, title_centroid = _load_title_geography(root.parents[2])
    final_titles, succession_stats = resolve_holder_succession(
        records,
        references.title_holders,
        retained_ids,
        title_parent=title_parent,
        title_centroid=title_centroid,
        previous_summaries=previous_summaries,
    )
    final_titles = dict(sorted(final_titles.items()))
    holder_summaries = {
        str(summary["id"]): summary
        for summary in build_holder_summaries(records, final_titles, retained_ids, previous_summaries)
    }
    runtime_records = sanitize_runtime_records(records, retained_ids)
    final_kinship = _build_kinship_index(runtime_records)
    final_search = sorted(
        (entry for entry in search_index if entry["id"] in retained_ids),
        key=lambda entry: (entry["name"], entry["id"]),
    )
    final_loadouts = {
        character_id: profile
        for character_id, profile in sorted(loadouts.items())
        if character_id in retained_ids
    }
    removed_loadout_count = len(loadouts) - len(final_loadouts)
    reason_counts = retention_reason_counts(records, references, retained_ids)
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
        "fullRecordCount": len(runtime_records),
        "holderSummaryCount": len(holder_summaries),
        "excludedUnreferencedModSupporting": sum(
            record.get("canonTier") == "mod_supporting" and record["id"] not in retained_ids
            for record in records
        ),
        "excludedUnreferencedGenealogy": sum(
            record.get("canonTier") == "genealogy" and record["id"] not in retained_ids
            for record in records
        ),
        "removedLoadoutCount": removed_loadout_count,
        "retainedByCoreTier": reason_counts["coreTier"],
        "retainedByPlayableEntry": reason_counts["playableEntry"],
        "retainedByNarrativeContent": reason_counts["narrativeContent"],
        "retainedByStartState": reason_counts["startState"],
        "retainedByArtifactHolder": reason_counts["artifactHolder"],
        "retainedByKinshipHop": reason_counts["kinshipHop"],
        "reassignedTitleByLiege": succession_stats["reassignedByLiege"],
        "reassignedTitleByProximity": succession_stats["reassignedByProximity"],
        "unresolvedHolderSummaries": succession_stats["unresolvedHolders"],
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
        "holderSummaries": [holder_summaries[character_id] for character_id in sorted(holder_summaries)],
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
        (temporary / "holder-summaries.json").write_bytes(_json_bytes({
            "schemaVersion": 1,
            "holders": [holder_summaries[character_id] for character_id in sorted(holder_summaries)],
        }, pretty=True))

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

    rebind_artifact_world_state(root.parents[2], dataset_hash)
    return counts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--characters", type=Path, default=Path("public/data/agot-characters"))
    args = parser.parse_args()
    counts = prune_bundled_dataset(args.characters)
    unresolved = counts.get("unresolvedHolderSummaries", 0)
    if unresolved:
        # 守卫：无法解析继承的头衔持有人直接拒绝发布——
        # 全量降级成摘要曾把 1144 条持有人数据砍到 347 条并通过所有检查。
        raise SystemExit(
            f"裁剪失败：{unresolved} 个头衔持有人无法解析继承（候选池为空或引用失效），拒绝发布退化数据。"
        )
    print(json.dumps(counts, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
