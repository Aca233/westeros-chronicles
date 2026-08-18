from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .deduplicate import ArtifactGroup, deduplicate_candidates
from .extractor import extract_source_artifacts
from .localization import load_source_localization
from .sources import WORKSHOP_ROOT, source_registry, validate_source
from .world_state import (
    ArtifactEffectSpec,
    CharacterSnapshot,
    extract_title_parents,
    project_artifact_world_state,
)
from .writer import write_artifact_dataset
from scripts.agot_character_import.timeline import AgotDate


PROJECT_ROOT = Path(__file__).resolve().parents[2]
START_DATE = AgotDate.parse("8298.1.1")
CANONICAL_ALIASES = {
    "vs_ice_name": "artifact.ice",
    "vs_longclaw_name": "artifact.longclaw",
    "vs_dawn_name": "artifact.dawn",
    "vs_blackfyre_name": "artifact.blackfyre",
}
MANUAL_EFFECT_SPECS = {
    "agot_create_artifact_vs_ice_effect": ArtifactEffectSpec("artifact.ice", True, "greatsword"),
    "agot_create_artifact_vs_longclaw_effect": ArtifactEffectSpec("artifact.longclaw", True, "longsword"),
    "agot_create_artifact_vs_dawn_effect": ArtifactEffectSpec("artifact.dawn", True, "greatsword"),
    "agot_create_artifact_vs_blackfyre_effect": ArtifactEffectSpec("artifact.blackfyre", True, "longsword"),
}


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _effect_specs(groups: tuple[ArtifactGroup, ...]) -> dict[str, ArtifactEffectSpec]:
    result = dict(MANUAL_EFFECT_SPECS)
    for group in groups:
        spec = ArtifactEffectSpec(
            definition_id=group.item_id,
            unique=group.primary.unique,
            subcategory=group.primary.type_mapping.subcategory,
        )
        for variant in group.visual_variants:
            if variant.source.workshop_id == "2962333032":
                result.setdefault(variant.source_id, spec)
    return result


def _load_characters(character_data: Path) -> tuple[dict[str, CharacterSnapshot], str]:
    manifest = _load_json(character_data / "manifest.json")
    if manifest.get("startDate") != str(START_DATE):
        raise ValueError(f"Character dataset start date must be {START_DATE}")
    rows = _load_json(character_data / "search-index.json")
    characters = {
        row["id"]: CharacterSnapshot(
            id=row["id"],
            alive=bool(row["alive"]),
            born=bool(row["born"]),
            birth_year=row.get("birthYear"),
            dynasty_id=row.get("dynastyId"),
        )
        for row in rows
    }
    return characters, str(manifest["datasetHash"])


def _load_direct_title_holders(character_data: Path) -> dict[str, str]:
    by_character = _load_json(character_data / "title-holders.json")
    holders: dict[str, str] = {}
    for character_id, titles in sorted(by_character.items()):
        for title in titles:
            holders.setdefault(title["id"], character_id)
    return holders


def import_artifacts(
    workshop_root: Path,
    typescript: Path,
    assets: Path,
    data: Path,
    *,
    character_data: Path = PROJECT_ROOT / "public" / "data" / "agot-characters",
    world_typescript: Path = PROJECT_ROOT / "src" / "data" / "generated" / "agotArtifactWorldState.ts",
) -> dict:
    candidates = []
    rejected = []
    for configured in source_registry(workshop_root):
        source = validate_source(configured)
        source_candidates, source_rejected = extract_source_artifacts(source, load_source_localization(source))
        candidates.extend(source_candidates)
        rejected.extend(source_rejected)
    groups, conflicts = deduplicate_candidates(candidates, CANONICAL_ALIASES)

    agot_root = workshop_root / "2962333032"
    scenario_file = agot_root / "common" / "scripted_effects" / "00_agot_scenario_artifacts_effects.txt"
    landed_title_files = sorted((agot_root / "common" / "landed_titles").rglob("*.txt"))
    characters, character_dataset_hash = _load_characters(character_data)
    world_projection = project_artifact_world_state(
        scenario_file=scenario_file,
        root_effect_id="agot_historical_artifacts_setup",
        helper_effect_ids={"agot_assign_starting_family_weapons_effect"},
        start_date=START_DATE,
        effect_specs=_effect_specs(groups),
        characters=characters,
        direct_title_holders=_load_direct_title_holders(character_data),
        title_parents=extract_title_parents(landed_title_files),
    )
    return write_artifact_dataset(
        groups,
        rejected,
        conflicts,
        typescript,
        assets,
        data,
        world_projection=world_projection,
        world_start_date=str(START_DATE),
        character_dataset_hash=character_dataset_hash,
        world_typescript_path=world_typescript,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import approved AGOT artifacts into static project data")
    parser.add_argument("--workshop-root", type=Path, default=WORKSHOP_ROOT)
    parser.add_argument("--typescript", type=Path, default=PROJECT_ROOT / "src" / "data" / "generated" / "agotArtifactDefinitions.ts")
    parser.add_argument("--world-typescript", type=Path, default=PROJECT_ROOT / "src" / "data" / "generated" / "agotArtifactWorldState.ts")
    parser.add_argument("--assets", type=Path, default=PROJECT_ROOT / "public" / "assets" / "item-images" / "generated" / "agot-artifacts")
    parser.add_argument("--data", type=Path, default=PROJECT_ROOT / "public" / "data" / "items")
    parser.add_argument("--character-data", type=Path, default=PROJECT_ROOT / "public" / "data" / "agot-characters")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    manifest = import_artifacts(
        args.workshop_root,
        args.typescript,
        args.assets,
        args.data,
        character_data=args.character_data,
        world_typescript=args.world_typescript,
    )
    counts = manifest["counts"]
    world = manifest["worldState"]
    print(
        f"Imported {counts['emittedItems']} AGOT artifact definitions with "
        f"{counts['convertedImages']} converted images and {world['resolvedArtifacts']} placed world artifacts "
        f"(dataset {manifest['datasetHash'][:12]})."
    )


if __name__ == "__main__":
    main()
