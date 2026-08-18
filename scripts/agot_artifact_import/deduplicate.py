from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Iterable, Mapping

from .model import ArtifactCandidate


@dataclass(frozen=True)
class ArtifactGroup:
    item_id: str
    primary: ArtifactCandidate
    visual_variants: tuple[ArtifactCandidate, ...]


def _slug(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if normalized:
        return normalized
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]


def _identity_name(value: str) -> str:
    return re.sub(r"[\s《》“”‘’「」『』·—\-_'\"，。]+", "", value).lower()


def deduplicate_candidates(
    candidates: Iterable[ArtifactCandidate],
    canonical_aliases: Mapping[str, str],
) -> tuple[tuple[ArtifactGroup, ...], tuple[str, ...]]:
    ordered = sorted(candidates, key=lambda item: (item.name, item.source.priority, item.source.workshop_id, item.source_id))
    unique_buckets: dict[str, list[ArtifactCandidate]] = {}
    standalone: list[ArtifactCandidate] = []
    for candidate in ordered:
        if candidate.name_key in canonical_aliases:
            continue
        if candidate.unique:
            unique_buckets.setdefault(_identity_name(candidate.name), []).append(candidate)
        else:
            standalone.append(candidate)

    groups: list[ArtifactGroup] = []
    used_ids: set[str] = set()
    conflicts: list[str] = []

    def add_group(primary: ArtifactCandidate, variants: tuple[ArtifactCandidate, ...], suffix: str) -> None:
        base = f"artifact.generated.{_slug(suffix)}"
        item_id = base
        if item_id in used_ids:
            item_id = f"{base}-{hashlib.sha256((primary.source.workshop_id + primary.source_id).encode()).hexdigest()[:8]}"
        if item_id in used_ids:
            conflicts.append(primary.source_id)
            return
        used_ids.add(item_id)
        groups.append(ArtifactGroup(item_id, primary, variants))

    for identity, bucket in sorted(unique_buckets.items()):
        primary = min(bucket, key=lambda item: (item.source.priority, item.source.workshop_id, item.source_id))
        variants = tuple(sorted(bucket, key=lambda item: (-item.source.priority, item.source.workshop_id, item.source_id)))
        add_group(primary, variants, primary.name_key.removesuffix("_name"))
    for candidate in standalone:
        add_group(candidate, (candidate,), f"{candidate.source.workshop_id}-{candidate.name_key.removesuffix('_name')}-{candidate.source_id}")

    groups.sort(key=lambda group: group.item_id)
    return tuple(groups), tuple(sorted(conflicts))
