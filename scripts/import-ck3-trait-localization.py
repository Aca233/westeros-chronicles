"""Extract CK3 Simplified Chinese ruler-trait descriptions into a TypeScript map."""
from __future__ import annotations

import os
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CK3_GAME_ROOT = Path(os.environ.get("CK3_GAME_ROOT", r"C:\Program Files (x86)\Steam\steamapps\common\Crusader Kings III\game"))
TRAIT_LOCALIZATION = CK3_GAME_ROOT / "localization" / "simp_chinese" / "traits_l_simp_chinese.yml"
TRAIT_CATALOG = PROJECT_ROOT / "src" / "data" / "characterTraits.ts"
OUTPUT = PROJECT_ROOT / "src" / "data" / "ck3TraitDescriptions.ts"

LOCALIZATION_OVERRIDES = {
    "hunter": "trait_hunter_2_character_desc",
    "physician": "trait_physician_2_character_desc",
}


def parse_localization(path: Path) -> dict[str, str]:
    entries: dict[str, str] = {}
    line_pattern = re.compile(r'^\s*([^\s:#]+):\d*\s+"(.*)"\s*$')
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        match = line_pattern.match(line)
        if match:
            entries[match.group(1)] = match.group(2)
    return entries


def clean_paradox_text(value: str) -> str:
    value = value.replace(r'\"', '"').replace(r"\n", " ")
    value = re.sub(r"\[(?:ROOT|CHARACTER)\.GetCharacter\.[^\]]+\]", "该角色", value)
    value = re.sub(r"#(?:EMP|P|N|bold|high|low)\s*", "", value, flags=re.IGNORECASE)
    value = value.replace("#!", "")
    value = re.sub(r"@[A-Za-z0-9_]+!", "", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def quote_typescript(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def main() -> None:
    trait_ids = re.findall(r"\bid:\s*'([^']+)'", TRAIT_CATALOG.read_text(encoding="utf-8"))
    localization = parse_localization(TRAIT_LOCALIZATION)
    descriptions: dict[str, str] = {}
    missing: list[str] = []

    for trait_id in trait_ids:
        key = LOCALIZATION_OVERRIDES.get(trait_id, f"trait_{trait_id}_desc")
        raw = localization.get(key)
        if raw is None:
            missing.append(f"{trait_id} ({key})")
            continue
        descriptions[trait_id] = clean_paradox_text(raw)

    if missing:
        raise RuntimeError("Missing CK3 trait localization: " + ", ".join(missing))

    lines = [
        "// Generated from CK3 Simplified Chinese localization by scripts/import-ck3-trait-localization.py.",
        "// Paradox character references and formatting tags are normalized for browser display.",
        "export const CK3_TRAIT_DESCRIPTIONS: Readonly<Record<string, string>> = {",
    ]
    lines.extend(f"  {quote_typescript(trait_id)}: {quote_typescript(descriptions[trait_id])}," for trait_id in trait_ids)
    lines.extend(["};", ""])
    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Imported {len(descriptions)} CK3 official trait descriptions into {OUTPUT}")


if __name__ == "__main__":
    main()
