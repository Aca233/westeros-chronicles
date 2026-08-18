"""Build deterministic runtime indexes from the bundled AGOT character dataset."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable



CURATED_LOADOUTS = {
    "agot:Stark_3": ("northern_noble", "eddard_stark_daily"),
    "agot:Tully_4": ("northern_noble", "catelyn_stark_daily"),
}


def _birth_year(record: dict[str, Any]) -> int | None:
    raw = record.get("birthDate")
    if not isinstance(raw, str):
        return None
    try:
        return int(raw.split(".", 1)[0])
    except ValueError:
        return None


def classify_loadout(
    record: dict[str, Any],
    title_holders: dict[str, Any],
    start_year: int,
) -> dict[str, str] | None:
    if not record.get("born") or not record.get("alive"):
        return None
    character_id = record["id"]
    curated = CURATED_LOADOUTS.get(character_id)
    if curated:
        return {"characterId": character_id, "templateId": curated[0], "overrideId": curated[1]}
    traits = {str(value).lower() for value in record.get("traits", [])}
    if any("nightswatch" in trait for trait in traits):
        template = "nights_watch"
    elif any("maester" in trait for trait in traits):
        template = "maester"
    elif any("septon" in trait or "sept" == trait for trait in traits):
        template = "septon"
    else:
        year = _birth_year(record)
        age = max(0, start_year - year) if year is not None else None
        if age is not None and age < 3:
            template = "infant"
        elif age is not None and age < 13:
            template = "child"
        else:
            culture = str(record.get("cultureId") or "").lower()
            titled = bool(title_holders.get(character_id))
            if "dornish" in culture:
                template = "dornish"
            elif "ironborn" in culture:
                template = "ironborn"
            elif culture in {"northman", "first_man", "crannogman"}:
                template = "northern_noble" if titled else "northern_common"
            else:
                template = "southern_noble" if titled else "southern_common"
    return {"characterId": character_id, "templateId": template}


def build_loadout_profiles(
    records: Iterable[dict[str, Any]],
    title_holders: dict[str, Any],
    start_year: int,
) -> tuple[dict[str, dict[str, Any]], dict[str, int]]:
    profiles: dict[str, dict[str, Any]] = {}
    counts: dict[str, int] = {}
    for record in records:
        profile = classify_loadout(record, title_holders, start_year)
        if profile is None:
            continue
        profiles[record["id"]] = profile
        key = profile["templateId"]
        counts[key] = counts.get(key, 0) + 1
    return profiles, counts


def load_character_records(root: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for path in sorted((root / "shards").glob("*.json")):
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, list):
            raise ValueError(f"人物分片格式无效：{path}")
        records.extend(value)
    return records


def build_kinship_index(records: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    records_by_id = {record["id"]: record for record in records}
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


def write_json(path: Path, value: object, *, pretty: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2 if pretty else None, separators=None if pretty else (",", ":")) + "\n",
        encoding="utf-8",
    )


def build_supplements(root: Path, *, kinship_only: bool = False) -> dict[str, int]:
    records = load_character_records(root)
    kinship = build_kinship_index(records)
    kinship_root = root / "kinship"
    kinship_root.mkdir(parents=True, exist_ok=True)
    for stale in kinship_root.glob("*.json"):
        stale.unlink()
    shards: dict[str, dict[str, Any]] = {}
    for character_id, entry in kinship.items():
        shard = hashlib.sha256(character_id.encode("utf-8")).hexdigest()[:2]
        shards.setdefault(shard, {})[character_id] = entry
    for shard, entries in sorted(shards.items()):
        write_json(kinship_root / f"{shard}.json", entries)
    counts = {
        "characterCount": len(records),
        "parentChildLinkCount": sum(len(entry["childIds"]) for entry in kinship.values()),
        "charactersWithChildren": sum(bool(entry["childIds"]) for entry in kinship.values()),
    }
    if not kinship_only:
        manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
        title_holders = json.loads((root / "title-holders.json").read_text(encoding="utf-8"))
        start_year = int(str(manifest["startDate"]).split(".", 1)[0])
        profiles, profile_counts = build_loadout_profiles(records, title_holders, start_year)
        loadout_root = root / "loadouts"
        loadout_root.mkdir(parents=True, exist_ok=True)
        for stale in loadout_root.glob("*.json"):
            stale.unlink()
        loadout_shards: dict[str, dict[str, Any]] = {}
        for character_id, profile in profiles.items():
            shard = hashlib.sha256(character_id.encode("utf-8")).hexdigest()[:2]
            loadout_shards.setdefault(shard, {})[character_id] = profile
        for shard, entries in sorted(loadout_shards.items()):
            write_json(loadout_root / f"{shard}.json", entries)
        eligible = sum(bool(record.get("born") and record.get("alive")) for record in records)
        report = {
            "eligibleLiving": eligible,
            "assigned": len(profiles),
            "unassigned": eligible - len(profiles),
            "templates": dict(sorted(profile_counts.items())),
        }
        write_json(root / "reports" / "loadout-report.json", report, pretty=True)
        counts.update({"loadoutAssigned": len(profiles), "loadoutUnassigned": eligible - len(profiles)})
    return counts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--characters", type=Path, default=Path("public/data/agot-characters"))
    parser.add_argument("--kinship-only", action="store_true")
    args = parser.parse_args()
    counts = build_supplements(args.characters, kinship_only=args.kinship_only)
    print(json.dumps(counts, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
