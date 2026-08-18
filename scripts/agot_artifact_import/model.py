from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


@dataclass(frozen=True)
class ArtifactSource:
    workshop_id: str
    name: str
    root: Path
    priority: int
    localization_roots: tuple[Path, ...]


@dataclass(frozen=True)
class ArtifactTypeMapping:
    category: str
    subcategory: str
    equippable: bool
    allowed_positions: tuple[dict[str, object], ...]
    handedness: str | None
    bulk: str
    fallback_icon: str


@dataclass(frozen=True)
class ArtifactCandidate:
    source: ArtifactSource
    source_id: str
    name_key: str
    description_key: str
    name: str
    description: str
    artifact_type: str
    visual_key: str
    icon_path: Path
    template_key: str | None
    modifier_key: str | None
    unique: bool
    rarity: str
    modifiers: Mapping[str, float]
    unmapped_modifiers: tuple[str, ...]
    type_mapping: ArtifactTypeMapping


@dataclass(frozen=True)
class RejectedArtifact:
    source_id: str
    reason: str
    detail: str = ""
