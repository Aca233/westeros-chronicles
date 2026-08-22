"""Build deterministic runtime indexes from the bundled AGOT character dataset."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable



WORLD_LOADOUTS_PATH = Path("public/data/world/loadouts.json")
_CURATED_LOADOUTS_CACHE: dict[str, tuple[str, str]] | None = None


def load_curated_loadouts(path: Path | None = None) -> dict[str, tuple[str, str]]:
    global _CURATED_LOADOUTS_CACHE
    if path is None and _CURATED_LOADOUTS_CACHE is not None:
        return _CURATED_LOADOUTS_CACHE
    source = path or WORLD_LOADOUTS_PATH
    if not source.exists():
        return {}
    document = json.loads(source.read_text(encoding="utf-8"))
    curated: dict[str, tuple[str, str]] = {}
    for override in document.get("overrides", []):
        character_id = override.get("characterId")
        template_id = override.get("templateId")
        override_id = override.get("id")
        if not isinstance(character_id, str) or not isinstance(template_id, str) or not isinstance(override_id, str):
            raise ValueError(f"世界装备覆盖无效：{override}")
        curated[character_id] = (template_id, override_id)
    if path is None:
        _CURATED_LOADOUTS_CACHE = curated
    return curated


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
    curated = load_curated_loadouts().get(character_id)
    if curated:
        return {"characterId": character_id, "templateId": curated[0], "overrideId": curated[1]}

    traits = {str(value).lower() for value in record.get("traits", [])}
    female = record.get("female") is True
    titled = bool(title_holders.get(character_id))
    year = _birth_year(record)
    age = max(0, start_year - year) if year is not None else None

    # 1. 职业与神职特质
    if any("kingsguard" in trait for trait in traits):
        template = "kingsguard_daily"
    elif any("nightswatch" in trait for trait in traits):
        template = "nights_watch"
    elif any("maester" in trait for trait in traits):
        template = "maester"
    elif any("silent_sister" in trait for trait in traits):
        template = "silent_sister"
    elif any("septon" in trait or "sept" == trait for trait in traits):
        template = "septon"
    # 2. 年龄段
    elif age is not None and age < 3:
        template = "infant"
    elif age is not None and age < 16:
        template = "child_noble" if titled or (record.get("dynastyId") and record.get("dynastyId") != "") else "child"
    # 3. 成人文化与地域
    else:
        culture = str(record.get("cultureId") or "").lower()
        if any(c in culture for c in ("frozen_shoreman", "ice_riverman", "thenn", "fangman", "forestman")):
            template = "beyond_the_wall_freefolk"
        elif any(c in culture for c in ("sand_dornish", "salt_dornish", "stone_dornish", "greenblood", "chroyanar", "dornish")):
            template = "dornish_noble" if titled else "dornish"
        elif any(c in culture for c in ("ironborn", "krakenman")):
            template = "ironborn_noble" if titled else "ironborn"
        elif any(c in culture for c in ("northman", "first_man", "crannogman", "barrowman", "bearman", "harborman", "skagosi", "northern_clan", "wolfswood_clansman")):
            template = "northern_lady" if female else ("northern_noble" if titled else "northern_common")
        elif any(c in culture for c in ("riverman_main", "clawman", "lakefolk")):
            template = "southern_lady" if female and titled else ("common_woman" if female else ("riverlands_noble" if titled else "riverlands_common"))
        elif any(c in culture for c in ("valeman_main", "valeman_finger", "valeman_upper", "sisterman")):
            template = "southern_lady" if female and titled else ("common_woman" if female else ("vale_noble" if titled else "vale_common"))
        elif "westerman_main" in culture:
            template = "southern_lady" if female and titled else ("common_woman" if female else ("westerlands_noble" if titled else "westerlands_common"))
        elif any(c in culture for c in ("reachman", "vineman", "honeywiner", "shieldman")):
            template = "reach_lady" if female else ("reach_noble" if titled else "reach_common")
        elif any(c in culture for c in ("stormlander_main", "marcher")):
            template = "southern_lady" if female and titled else ("common_woman" if female else ("stormlands_noble" if titled else "stormlands_common"))
        elif any(c in culture for c in ("crownlander", "high_valyrian", "westerosi_valyrian")):
            template = "southern_lady" if female and titled else ("common_woman" if female else ("crownlands_courtier" if titled else "crownlands_common"))
        elif any(c in culture for c in ("pentoshi", "braavosi", "myrish", "tyroshi", "lyseni", "volantene", "norvoshi", "qohorik", "lorathi", "andalosi", "essosi_valyrian", "qartheen", "dothraki")):
            template = "merchant_wealthy" if titled else "generic"
        elif any("knight" in trait for trait in traits):
            template = "knight_daily"
        else:
            template = "southern_lady" if female and titled else ("common_woman" if female else ("southern_noble" if titled else "southern_common"))

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
