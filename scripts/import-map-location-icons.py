"""Convert selected AGOT medieval building silhouettes into offline map icons.

This is a development-time importer only. The browser loads only the generated
WebP files from public/assets/map-icons and never reads the mod installation.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from PIL import Image, ImageFilter

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = Path(os.environ.get("AGOT_SOURCE_ROOT", PROJECT_ROOT / "2962333032"))
SOURCE_PREFIX = Path("gfx/interface/icons/building_types")
OUTPUT_ROOT = PROJECT_ROOT / "public/assets/map-icons"

# Use CK3/AGOT silhouettes rather than modern application pictograms. The
# selected subjects remain readable at map scale and are deliberately generic.
ICON_SOURCES = {
    "castle": "icon_building_fort.dds",
    "city": "icon_structure_tyrosh.dds",
    "town": "icon_building_tribal.dds",
    "village": "icon_building_inn.dds",
    "port": "icon_fleetport.dds",
    "ruin": "icon_structure_castamere.dds",
    "landmark": "icon_structure_tree_of_crowns.dds",
    "region": "icon_structure_dragonmont.dds",
}

ICON_SIZE = 64
MAX_ART_WIDTH = 54
MAX_ART_HEIGHT = 50
ICON_COLOR = (226, 195, 117)
SHADOW_COLOR = (20, 14, 8)


def render_icon(source: Path) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    bounds = image.getbbox()
    if bounds:
        image = image.crop(bounds)

    alpha = image.getchannel("A")
    alpha.thumbnail((MAX_ART_WIDTH, MAX_ART_HEIGHT), Image.Resampling.LANCZOS)
    mask = Image.new("L", (ICON_SIZE, ICON_SIZE), 0)
    mask.paste(alpha, ((ICON_SIZE - alpha.width) // 2, (ICON_SIZE - alpha.height) // 2))

    canvas = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    shadow_alpha = mask.filter(ImageFilter.GaussianBlur(1.4)).point(lambda value: round(value * 0.85))
    shadow = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (*SHADOW_COLOR, 0))
    shadow.putalpha(shadow_alpha)
    canvas.alpha_composite(shadow, (1, 2))

    icon = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (*ICON_COLOR, 0))
    icon.putalpha(mask)
    canvas.alpha_composite(icon)
    return canvas


def main() -> None:
    source_dir = SOURCE_ROOT / SOURCE_PREFIX
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "schemaVersion": 1,
        "sourceId": "2962333032",
        "style": "agot-medieval-silhouette",
        "icons": {},
    }

    for icon_type, filename in ICON_SOURCES.items():
        source = source_dir / filename
        if not source.is_file():
            raise FileNotFoundError(f"AGOT map icon source is missing: {source}")
        render_icon(source).save(
            OUTPUT_ROOT / f"location-{icon_type}.webp",
            "WEBP",
            lossless=True,
            method=6,
        )
        manifest["icons"][icon_type] = (SOURCE_PREFIX / filename).as_posix()

    (OUTPUT_ROOT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Imported {len(ICON_SOURCES)} medieval map icons into {OUTPUT_ROOT}")


if __name__ == "__main__":
    main()
