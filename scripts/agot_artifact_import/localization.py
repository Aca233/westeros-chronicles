from __future__ import annotations

from scripts.agot_character_import.localization import load_localization

from .model import ArtifactSource


def load_source_localization(source: ArtifactSource) -> dict[str, str]:
    files = []
    for root in (source.root / "localization" / "simp_chinese", *source.localization_roots):
        if root.exists():
            files.extend(sorted(root.rglob("*.yml")))
    return load_localization(files)
