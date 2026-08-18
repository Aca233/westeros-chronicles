from __future__ import annotations

import os
import re
from pathlib import Path

from .model import ArtifactSource


WORKSHOP_ROOT = Path(os.environ.get(
    "CK3_WORKSHOP_ROOT",
    "/mnt/c/Program Files (x86)/Steam/steamapps/workshop/content/1158310",
))
TRANSLATION_ID = "2965154314"


def source_registry(workshop_root: Path = WORKSHOP_ROOT) -> tuple[ArtifactSource, ...]:
    translation = workshop_root / TRANSLATION_ID / "localization" / "simp_chinese"
    base_localization = workshop_root / "2962333032" / "localization" / "simp_chinese"
    return (
        ArtifactSource("2962333032", "A Game of Thrones", workshop_root / "2962333032", 0, ()),
        ArtifactSource("2995674648", "AGOT - Crowns of Westeros", workshop_root / "2995674648", 2, (translation / "AGOT Crowns of Westeros",)),
        ArtifactSource("2962713441", "Valyrian Steel", workshop_root / "2962713441", 1, (base_localization, translation / "Valyrian Steel")),
        ArtifactSource("3101422928", "Legacy Of The Dragon", workshop_root / "3101422928", 3, (base_localization, translation / "Legacy Of The Dragon")),
        ArtifactSource("2950245430", "AGOT+", workshop_root / "2950245430", 2, (base_localization,)),
    )


def validate_source(source: ArtifactSource) -> ArtifactSource:
    root = source.root.expanduser().resolve()
    if root.name != source.workshop_id or not root.is_dir():
        raise ValueError(f"Workshop source {source.workshop_id} path is invalid: {root}")
    descriptors = [root / "descriptor.mod", *sorted(root.glob("*.mod"))]
    descriptor = next((path for path in descriptors if path.is_file()), None)
    if descriptor is None:
        raise ValueError(f"Workshop source {source.workshop_id} has no descriptor")
    text = descriptor.read_text(encoding="utf-8-sig", errors="replace")
    remote = re.search(r'^\s*remote_file_id\s*=\s*"?([^"\s]+)', text, re.MULTILINE)
    name = re.search(r'^\s*name\s*=\s*"([^"]+)"', text, re.MULTILINE)
    if remote and remote.group(1) != source.workshop_id:
        raise ValueError(f"Workshop source {source.workshop_id} descriptor ID does not match")
    if not remote and (not name or name.group(1) != source.name):
        raise ValueError(f"Workshop source {source.workshop_id} descriptor name does not match")
    return ArtifactSource(source.workshop_id, source.name, root, source.priority, source.localization_roots)
