from __future__ import annotations

from pathlib import Path
from typing import Iterable, Mapping

from scripts.agot_character_import.paradox import Entry, parse_document

from .model import ArtifactCandidate, ArtifactSource, ArtifactTypeMapping, RejectedArtifact


SUPPORTED_MODIFIERS = {
    "diplomacy", "intrigue", "stewardship", "learning", "martial", "prowess", "advantage",
    "monthly_prestige", "monthly_dread", "vassal_opinion", "courtier_opinion", "general_opinion",
}


def _mapping(category: str, subcategory: str, *, position: dict[str, object] | None = None,
             handedness: str | None = None, bulk: str = "small", fallback: str = "artifact-goblet") -> ArtifactTypeMapping:
    return ArtifactTypeMapping(category, subcategory, position is not None, (position,) if position else (), handedness, bulk, fallback)


def normalize_artifact_type(artifact_type: str) -> ArtifactTypeMapping:
    value = artifact_type.lower()
    if value == "helmet":
        return _mapping("clothing", "crown", position={"group": "head"}, fallback="artifact-crown")
    if value.startswith("armor_"):
        return _mapping("armor", value, position={"group": "torso", "layer": "armor"}, bulk="large", fallback="gear-armor")
    if value in {"sword", "axe", "mace", "dagger", "spear", "hammer", "crossbow"}:
        return _mapping("weapon", value, position={"group": "mainhand"}, handedness="one", bulk="medium", fallback="gear-sword")
    if value in {"longbow", "bow"}:
        return _mapping("weapon", value, position={"group": "mainhand"}, handedness="two", bulk="large", fallback="gear-sword")
    if value in {"ring", "necklace", "brooch", "regalia", "maester_link", "grandmaester_chain", "archmaester_ring"}:
        return ArtifactTypeMapping("jewelry", value, True, tuple({"group": "accessories", "index": index} for index in range(3)), None, "tiny", "artifact-ruby")
    if value in {"book", "journal", "valyrian_book"}:
        return _mapping("document", value, bulk="small", fallback="artifact-white-book")
    if value in {"panacea", "elixir"}:
        return _mapping("medicine", value, bulk="tiny", fallback="artifact-glass-candle")
    if "horn" in value:
        return _mapping("tool", value, bulk="medium", fallback="artifact-krakenhorn")
    return _mapping("keepsake", value, bulk="medium", fallback="artifact-goblet")


def _walk(entries: Iterable[Entry]) -> Iterable[Entry]:
    for entry in entries:
        yield entry
        yield from _walk(entry.children)


def _read_documents(root: Path) -> Iterable[tuple[Path, list[Entry]]]:
    if not root.exists():
        return
    for path in sorted(root.rglob("*.txt")):
        try:
            yield path, parse_document(path.read_text(encoding="utf-8-sig", errors="replace"))
        except ValueError:
            continue


def _scalar_map(entry: Entry) -> dict[str, str]:
    return {child.key: child.value for child in entry.children if child.value is not None}


def _numeric(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def extract_source_artifacts(
    source: ArtifactSource,
    localization: Mapping[str, str],
) -> tuple[tuple[ArtifactCandidate, ...], tuple[RejectedArtifact, ...]]:
    visuals: dict[str, str] = {}
    for _, entries in _read_documents(source.root / "common" / "artifacts" / "visuals"):
        for entry in entries:
            icon = entry.first("icon")
            if icon and icon.value:
                visuals[entry.key] = icon.value

    unique_templates: set[str] = set()
    for _, entries in _read_documents(source.root / "common" / "artifacts" / "templates"):
        for entry in entries:
            unique = entry.first("unique")
            if unique and unique.value == "yes":
                unique_templates.add(entry.key)

    modifier_values: dict[str, dict[str, float]] = {}
    modifier_unmapped: dict[str, tuple[str, ...]] = {}
    for _, entries in _read_documents(source.root / "common" / "modifiers"):
        for entry in entries:
            values: dict[str, float] = {}
            unmapped: list[str] = []
            for child in entry.children:
                number = _numeric(child.value)
                if number is None or child.key == "icon":
                    continue
                if child.key in SUPPORTED_MODIFIERS:
                    values[child.key] = number
                else:
                    unmapped.append(child.key)
            modifier_values[entry.key] = values
            modifier_unmapped[entry.key] = tuple(sorted(set(unmapped)))

    icon_index: dict[str, Path] = {}
    icon_root = source.root / "gfx" / "interface" / "icons" / "artifact"
    if icon_root.exists():
        for path in sorted(icon_root.rglob("*.dds")):
            icon_index.setdefault(path.name.lower(), path)
            icon_index.setdefault(path.as_posix().lower(), path)

    candidates: list[ArtifactCandidate] = []
    rejected: list[RejectedArtifact] = []
    for source_path, entries in _read_documents(source.root / "common" / "scripted_effects"):
        for context in entries:
            rarity = "common"
            for operation in _walk((context,)):
                if operation.key.startswith("set_artifact_rarity_") and operation.value == "yes":
                    rarity = operation.key.removeprefix("set_artifact_rarity_")
                    break
            create_index = 0
            for create in (entry for entry in _walk(context.children) if entry.key == "create_artifact"):
                create_index += 1
                fields = _scalar_map(create)
                source_id = context.key if create_index == 1 else f"{context.key}:{create_index}"
                name_key = fields.get("name", "")
                description_key = fields.get("description", "")
                visual_key = fields.get("visuals", "")
                if "$" in name_key or not name_key:
                    rejected.append(RejectedArtifact(source_id, "dynamic_name", name_key))
                    continue
                if not localization.get(name_key):
                    rejected.append(RejectedArtifact(source_id, "missing_name_localization", name_key))
                    continue
                if not description_key or not localization.get(description_key):
                    rejected.append(RejectedArtifact(source_id, "missing_description_localization", description_key))
                    continue
                icon_name = visuals.get(visual_key, "")
                icon_path = icon_index.get(Path(icon_name).name.lower())
                if not icon_path:
                    rejected.append(RejectedArtifact(source_id, "missing_icon", icon_name or visual_key))
                    continue
                artifact_type = fields.get("type", "miscellaneous")
                if "$" in artifact_type:
                    rejected.append(RejectedArtifact(source_id, "dynamic_type", artifact_type))
                    continue
                template_key = fields.get("template")
                modifier_key = fields.get("modifier")
                candidates.append(ArtifactCandidate(
                    source=source,
                    source_id=source_id,
                    name_key=name_key,
                    description_key=description_key,
                    name=localization[name_key],
                    description=localization[description_key],
                    artifact_type=artifact_type,
                    visual_key=visual_key,
                    icon_path=icon_path,
                    template_key=template_key,
                    modifier_key=modifier_key,
                    unique=bool(template_key and template_key in unique_templates),
                    rarity=rarity,
                    modifiers=modifier_values.get(modifier_key or "", {}),
                    unmapped_modifiers=modifier_unmapped.get(modifier_key or "", ()),
                    type_mapping=normalize_artifact_type(artifact_type),
                ))
    candidates.sort(key=lambda item: (item.name, item.source.workshop_id, item.source_id))
    rejected.sort(key=lambda item: (item.reason, item.source_id, item.detail))
    return tuple(candidates), tuple(rejected)
