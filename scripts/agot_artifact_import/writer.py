from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Iterable, Any

from PIL import Image

from .deduplicate import ArtifactGroup
from .model import RejectedArtifact
from .world_state import WorldStateProjection


def _json(value: object, *, pretty: bool = True) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2 if pretty else None, separators=None if pretty else (",", ":"))


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _signed_value(value: float) -> int:
    rounded = round(value)
    if rounded == 0 and value != 0:
        rounded = 1 if value > 0 else -1
    return max(-5, min(5, rounded))


def _effects(group: ArtifactGroup) -> list[dict[str, Any]]:
    candidate = group.primary
    effects: list[dict[str, Any]] = []
    check_domains = {
        "diplomacy": "diplomacy", "intrigue": "intrigue", "stewardship": "stewardship",
        "learning": "learning", "martial": "battle", "prowess": "duel", "advantage": "battle",
    }
    labels = {
        "diplomacy": "外交威仪", "intrigue": "权谋助益", "stewardship": "治理助益",
        "learning": "学识助益", "martial": "战阵助益", "prowess": "决斗助益", "advantage": "战场优势",
    }
    for key, domain in check_domains.items():
        value = candidate.modifiers.get(key)
        if value:
            effects.append({
                "kind": "check_modifier", "domain": domain, "value": _signed_value(value),
                "stackGroup": f"artifact.{key}", "cap": 5, "label": labels[key],
            })
    if candidate.modifiers.get("monthly_prestige"):
        effects.append({
            "kind": "resource", "target": "prestigeGain", "value": _signed_value(candidate.modifiers["monthly_prestige"]),
            "stackGroup": "artifact.prestige", "cap": 3, "label": "威仪象征",
        })
    if candidate.modifiers.get("monthly_dread"):
        effects.append({
            "kind": "resource", "target": "dreadGain", "value": _signed_value(candidate.modifiers["monthly_dread"]),
            "stackGroup": "artifact.dread", "cap": 3, "label": "威慑象征",
        })
    opinion = sum(candidate.modifiers.get(key, 0) for key in ("vassal_opinion", "courtier_opinion", "general_opinion"))
    if opinion:
        effects.append({
            "kind": "social", "contextTags": ["court", "vassal"], "value": _signed_value(opinion / 5),
            "stackGroup": "artifact.court-opinion", "cap": 3, "label": "宫廷观感",
        })
    effects.append({"kind": "narrative", "directive": f"此物是{candidate.name}，其来历和象征意义应当影响持有者的身份与他人的反应。"})
    return effects


def _quality(rarity: str, unique: bool) -> tuple[str, str, int]:
    if unique:
        return "legendary", "unique", 3000
    return {
        "illustrious": ("legendary", "illustrious", 1800),
        "famed": ("masterwork", "rare", 900),
        "masterwork": ("masterwork", "rare", 750),
    }.get(rarity, ("fine", "uncommon", 300))


def _definition(group: ArtifactGroup, image_path: str, image_hash: str) -> dict[str, Any]:
    candidate = group.primary
    mapping = candidate.type_mapping
    quality, rarity, value = _quality(candidate.rarity, candidate.unique)
    variants = [
        {
            "workshopId": variant.source.workshop_id,
            "modName": variant.source.name,
            "sourceId": variant.source_id,
            "visualKey": variant.visual_key,
        }
        for variant in group.visual_variants
    ]
    return {
        "id": group.item_id,
        "name": candidate.name,
        "description": candidate.description,
        "roleplayText": candidate.description,
        "category": mapping.category,
        "subcategory": mapping.subcategory,
        "tags": ["artifact", f"artifact-type:{candidate.artifact_type}", f"workshop:{candidate.source.workshop_id}", *( ["unique"] if candidate.unique else [])],
        "image": {"type": "asset", "path": image_path, "fallbackIcon": mapping.fallback_icon},
        "material": "珍贵材料",
        "baseQuality": quality,
        "rarity": rarity,
        "bulk": mapping.bulk,
        "stackable": False,
        "maxStack": 1,
        "unique": candidate.unique,
        "equippable": mapping.equippable,
        "allowedPositions": list(mapping.allowed_positions),
        **({"handedness": mapping.handedness} if mapping.handedness else {}),
        "baseValue": value,
        "effects": _effects(group),
        "provenance": {"origin": f"来自 {candidate.source.name} 的神器资料。"},
        "contentSource": {
            "workshopId": candidate.source.workshop_id,
            "modName": candidate.source.name,
            "sourceId": candidate.source_id,
            "nameKey": candidate.name_key,
            "descriptionKey": candidate.description_key,
            "visualKey": candidate.visual_key,
            "templateKey": candidate.template_key,
            "modifierKey": candidate.modifier_key,
            "imageSha256": image_hash,
            "visualVariants": variants,
        },
    }


def _atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_bytes(data)
    os.replace(temporary, path)


def write_artifact_dataset(
    groups: Iterable[ArtifactGroup],
    rejected: Iterable[RejectedArtifact],
    conflicts: Iterable[str],
    typescript_path: Path,
    asset_root: Path,
    data_root: Path,
    *,
    world_projection: WorldStateProjection | None = None,
    world_start_date: str | None = None,
    character_dataset_hash: str | None = None,
    world_typescript_path: Path | None = None,
) -> dict[str, Any]:
    group_list = sorted(groups, key=lambda group: group.item_id)
    rejected_list = sorted(rejected, key=lambda item: (item.reason, item.source_id, item.detail))
    conflict_list = sorted(conflicts)
    temporary_assets = Path(tempfile.mkdtemp(prefix=f".{asset_root.name}-", dir=asset_root.parent if asset_root.parent.exists() else None))
    definitions: list[dict[str, Any]] = []
    manifest_items: list[dict[str, Any]] = []
    converted_by_source_hash: dict[str, tuple[str, str]] = {}
    try:
        for group in group_list:
            visual = group.visual_variants[0]
            source_bytes = visual.icon_path.read_bytes()
            source_hash = _sha256(source_bytes)
            cached = converted_by_source_hash.get(source_hash)
            if cached is None:
                filename = f"{source_hash[:20]}.webp"
                output_path = temporary_assets / filename
                with Image.open(visual.icon_path) as image:
                    image.convert("RGBA").save(output_path, "WEBP", lossless=True, method=6)
                output_hash = _sha256(output_path.read_bytes())
                cached = (filename, output_hash)
                converted_by_source_hash[source_hash] = cached
            filename, output_hash = cached
            public_path = f"/assets/item-images/generated/agot-artifacts/{filename}"
            definition = _definition(group, public_path, output_hash)
            definitions.append(definition)
            manifest_items.append({
                "itemId": group.item_id,
                "name": group.primary.name,
                "localPath": public_path,
                "sha256": output_hash,
                "sourceSha256": source_hash,
                "workshopId": visual.source.workshop_id,
                "modName": visual.source.name,
                "sourceId": visual.source_id,
                "sourcePath": visual.icon_path.relative_to(visual.source.root).as_posix(),
            })

        fingerprint = {"schemaVersion": 1, "definitions": definitions, "items": manifest_items}
        dataset_hash = _sha256(_json(fingerprint, pretty=False).encode("utf-8"))
        manifest: dict[str, Any] = {
            "schemaVersion": 1,
            "datasetHash": dataset_hash,
            "counts": {
                "emittedItems": len(definitions),
                "convertedImages": len(converted_by_source_hash),
                "rejectedCandidates": len(rejected_list),
                "conflicts": len(conflict_list),
            },
            "items": manifest_items,
        }
        report = {
            "datasetHash": dataset_hash,
            "counts": manifest["counts"],
            "rejected": [item.__dict__ for item in rejected_list],
            "conflicts": conflict_list,
            "unmappedModifiers": sorted({modifier for group in group_list for modifier in group.primary.unmapped_modifiers}),
        }
        world_state: dict[str, Any] | None = None
        world_report: dict[str, Any] | None = None
        if world_projection is not None:
            if world_start_date is None or character_dataset_hash is None or world_typescript_path is None:
                raise ValueError("World artifact output requires start date, character hash, and TypeScript path")
            world_fingerprint = {
                "schemaVersion": 1,
                "startDate": world_start_date,
                "artifactDatasetHash": dataset_hash,
                "characterDatasetHash": character_dataset_hash,
                "artifacts": world_projection.artifacts,
            }
            world_dataset_hash = _sha256(_json(world_fingerprint, pretty=False).encode("utf-8"))
            world_state = {
                **world_fingerprint,
                "datasetHash": world_dataset_hash,
            }
            issue_counts: dict[str, int] = {}
            for item in world_projection.issues:
                key = str(item["kind"])
                issue_counts[key] = issue_counts.get(key, 0) + 1
            world_report = {
                "datasetHash": world_dataset_hash,
                "startDate": world_start_date,
                "counts": {
                    "resolvedArtifacts": len(world_projection.artifacts),
                    "unresolvedIssues": len(world_projection.issues),
                    "issuesByKind": dict(sorted(issue_counts.items())),
                },
                "issues": list(world_projection.issues),
            }
            manifest["worldState"] = {
                "datasetHash": world_dataset_hash,
                "resolvedArtifacts": len(world_projection.artifacts),
                "unresolvedIssues": len(world_projection.issues),
            }
        typescript = (
            "import type { ItemDefinition } from '../../features/items/types';\n\n"
            "// Generated by scripts.agot_artifact_import.cli. Do not edit by hand.\n"
            f"export const AGOT_ARTIFACT_DEFINITIONS = {_json(definitions)} as const satisfies readonly ItemDefinition[];\n"
        )
        _atomic_write(typescript_path, typescript.encode("utf-8"))
        data_root.mkdir(parents=True, exist_ok=True)
        _atomic_write(data_root / "agot-artifact-import-manifest.json", (_json(manifest) + "\n").encode("utf-8"))
        _atomic_write(data_root / "agot-artifact-import-report.json", (_json(report) + "\n").encode("utf-8"))
        if world_state is not None and world_report is not None and world_typescript_path is not None:
            _atomic_write(data_root / "agot-artifact-world-state.json", (_json(world_state) + "\n").encode("utf-8"))
            _atomic_write(data_root / "agot-artifact-world-state-report.json", (_json(world_report) + "\n").encode("utf-8"))
            world_typescript = (
                "import type { WorldArtifactState } from '../../features/items/worldArtifacts';\n\n"
                "// Generated by scripts.agot_artifact_import.cli. Do not edit by hand.\n"
                f"export const AGOT_ARTIFACT_WORLD_STATE = {_json(world_state)} as const satisfies WorldArtifactState;\n"
            )
            _atomic_write(world_typescript_path, world_typescript.encode("utf-8"))
        asset_root.parent.mkdir(parents=True, exist_ok=True)
        if asset_root.exists():
            shutil.rmtree(asset_root)
        shutil.move(str(temporary_assets), str(asset_root))
    except Exception:
        shutil.rmtree(temporary_assets, ignore_errors=True)
        raise
    return manifest
