"""Command-line importer for the AGOT character dataset."""
from __future__ import annotations

import argparse
import hashlib
import os
import re
from pathlib import Path
from typing import Iterable

from .characters import extract_character_histories
from .localization import load_localization
from .timeline import AgotDate
from .titles import project_title_holders
from .writer import DatasetManifest, write_dataset


WORKSHOP_ID = "2962333032"
MOD_NAME = "A Game of Thrones"
PROJECT_ROOT = Path(__file__).resolve().parents[2]


def validate_mod_root(path: Path) -> Path:
    root = path.expanduser().resolve()
    expected = f"AGOT workshop item {WORKSHOP_ID}"
    descriptor = root / "descriptor.mod"
    character_root = root / "history" / "characters"
    if root.name != WORKSHOP_ID or not descriptor.is_file() or not character_root.is_dir():
        raise ValueError(f"Expected {expected}, got {root}")
    descriptor_text = descriptor.read_text(encoding="utf-8-sig", errors="replace")
    if not re.search(r'^\s*name\s*=\s*"A Game of Thrones"\s*$', descriptor_text, re.MULTILINE):
        raise ValueError(f"Expected {expected}, descriptor name does not match")
    return root


def default_mod_root() -> Path:
    configured = os.environ.get("AGOT_MOD_ROOT")
    if configured:
        return Path(configured)
    candidates = [
        Path(r"C:\Program Files (x86)\Steam\steamapps\workshop\content\1158310\2962333032"),
        Path("/mnt/c/Program Files (x86)/Steam/steamapps/workshop/content/1158310/2962333032"),
    ]
    return next((candidate for candidate in candidates if candidate.exists()), candidates[0])


def _mod_version(descriptor: Path) -> str:
    text = descriptor.read_text(encoding="utf-8-sig", errors="replace")
    match = re.search(r'^\s*version\s*=\s*"([^"]+)"', text, re.MULTILINE)
    return match.group(1) if match else "unknown"


def _source_checksum(paths: Iterable[Path], root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths):
        digest.update(path.relative_to(root).as_posix().encode("utf-8"))
        digest.update(path.read_bytes())
    return digest.hexdigest()


def import_dataset(mod_root: Path, output: Path, start_date: AgotDate) -> DatasetManifest:
    root = validate_mod_root(mod_root)
    character_files = sorted((root / "history" / "characters").glob("*.txt"))
    if not character_files:
        raise ValueError(f"No AGOT character files found under {root}")
    title_files = sorted((root / "history" / "titles").glob("*.txt"))
    if not title_files:
        raise ValueError(f"No AGOT title files found under {root}")

    histories = []
    for path in character_files:
        histories.extend(extract_character_histories(path))

    localization_roots = [
        root / "localization" / "simp_chinese",
        root / "localization" / "replace" / "simp_chinese",
    ]
    localization_files = [
        path
        for localization_root in localization_roots
        if localization_root.exists()
        for path in sorted(localization_root.rglob("*.yml"))
    ]
    localization = load_localization(localization_files)
    title_holders = project_title_holders(title_files, start_date, localization)
    source_files = character_files + title_files + localization_files + [root / "descriptor.mod"]
    source_manifest = {
        "sourceId": WORKSHOP_ID,
        "name": MOD_NAME,
        "modVersion": _mod_version(root / "descriptor.mod"),
        "sourceChecksum": _source_checksum(source_files, root),
        "characterFileCount": len(character_files),
        "titleFileCount": len(title_files),
        "localizationFileCount": len(localization_files),
    }
    return write_dataset(histories, output, source_manifest, start_date, localization, title_holders)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import the AGOT character dataset")
    parser.add_argument("--mod-root", type=Path, default=default_mod_root())
    parser.add_argument("--start-date", default="8298.1.1")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "public" / "data" / "agot-characters")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    manifest = import_dataset(args.mod_root, args.output, AgotDate.parse(args.start_date))
    print(
        f"Imported {manifest.counts['emittedRecords']} AGOT characters "
        f"from {manifest.counts['totalSourceRecords']} source records "
        f"into {args.output} (dataset {manifest.dataset_hash[:12]})."
    )


if __name__ == "__main__":
    main()
