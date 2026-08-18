"""Import selected AGOT game UI textures into browser-ready WebP assets."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Iterable

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = PROJECT_ROOT / "2962333032"
OUTPUT_ROOT = PROJECT_ROOT / "public" / "assets" / "game-icons"
IMPORTED_TRAIT_ICON_MAP = PROJECT_ROOT / "scripts" / "imported-character-trait-icons.json"
CK3_GAME_ROOT = Path(os.environ.get("CK3_GAME_ROOT", r"C:\Program Files (x86)\Steam\steamapps\common\Crusader Kings III\game"))
CK3_SKILL_SPRITE = CK3_GAME_ROOT / "gfx" / "interface" / "icons" / "icon_skills.dds"
CK3_SKILL_NAMES = ("diplomacy", "martial", "stewardship", "intrigue", "learning", "prowess")
CK3_TRAIT_ROOT = CK3_GAME_ROOT / "gfx" / "interface" / "icons" / "traits"
CK3_TRAIT_SOURCES = {
    'trait-brave': 'brave.dds',
    'trait-craven': 'craven.dds',
    'trait-calm': 'calm.dds',
    'trait-wrathful': 'wrathful.dds',
    'trait-chaste': 'chaste.dds',
    'trait-lustful': 'lustful.dds',
    'trait-compassionate': 'compassionate.dds',
    'trait-callous': 'callous.dds',
    'trait-sadistic': 'sadistic.dds',
    'trait-content': 'content.dds',
    'trait-ambitious': 'ambitious.dds',
    'trait-diligent': 'diligent.dds',
    'trait-lazy': 'lazy.dds',
    'trait-forgiving': 'forgiving.dds',
    'trait-vengeful': 'vengeful.dds',
    'trait-generous': 'generous.dds',
    'trait-greedy': 'greedy.dds',
    'trait-gluttonous': 'gluttonous.dds',
    'trait-temperate': 'temperate.dds',
    'trait-gregarious': 'gregarious.dds',
    'trait-shy': 'shy.dds',
    'trait-honest': 'honest.dds',
    'trait-deceitful': 'deceitful.dds',
    'trait-humble': 'humble.dds',
    'trait-arrogant': 'arrogant.dds',
    'trait-just': 'just.dds',
    'trait-arbitrary': 'arbitrary.dds',
    'trait-patient': 'patient.dds',
    'trait-impatient': 'impatient.dds',
    'trait-trusting': 'trusting.dds',
    'trait-paranoid': 'paranoid.dds',
    'trait-zealous': 'zealous.dds',
    'trait-cynical': 'cynical.dds',
    'trait-eccentric': 'eccentric.dds',
    'trait-fickle': 'fickle.dds',
    'trait-stubborn': 'stubborn.dds',
    'trait-education-diplomacy-1': 'education_diplomacy_1.dds',
    'trait-education-diplomacy-2': 'education_diplomacy_2.dds',
    'trait-education-diplomacy-3': 'education_diplomacy_3.dds',
    'trait-education-diplomacy-4': 'education_diplomacy_4.dds',
    'trait-education-martial-1': 'education_martial_1.dds',
    'trait-education-martial-2': 'education_martial_2.dds',
    'trait-education-martial-3': 'education_martial_3.dds',
    'trait-education-martial-4': 'education_martial_4.dds',
    'trait-education-stewardship-1': 'education_stewardship_1.dds',
    'trait-education-stewardship-2': 'education_stewardship_2.dds',
    'trait-education-stewardship-3': 'education_stewardship_3.dds',
    'trait-education-stewardship-4': 'education_stewardship_4.dds',
    'trait-education-intrigue-1': 'education_intrigue_1.dds',
    'trait-education-intrigue-2': 'education_intrigue_2.dds',
    'trait-education-intrigue-3': 'education_intrigue_3.dds',
    'trait-education-intrigue-4': 'education_intrigue_4.dds',
    'trait-education-learning-1': 'education_learning_1.dds',
    'trait-education-learning-2': 'education_learning_2.dds',
    'trait-education-learning-3': 'education_learning_3.dds',
    'trait-education-learning-4': 'education_learning_4.dds',
    'trait-diplomat': 'diplomat.dds',
    'trait-august': 'august.dds',
    'trait-strategist': 'strategist.dds',
    'trait-overseer': 'overseer.dds',
    'trait-gallant': 'gallant.dds',
    'trait-architect': 'architect.dds',
    'trait-avaricious': 'avaricious.dds',
    'trait-schemer': 'schemer.dds',
    'trait-seducer': 'seducer.dds',
    'trait-torturer': 'torturer.dds',
    'trait-scholar': 'scholar.dds',
    'trait-theologian': 'theologian.dds',
    'trait-whole-of-body': 'whole_of_body.dds',
    'trait-athletic': 'athletic.dds',
    'trait-hunter': 'hunter_2.dds',
    'trait-physician': 'physician_2.dds',
    'trait-beauty-good-1': 'beauty_good_1.dds',
    'trait-beauty-good-2': 'beauty_good_2.dds',
    'trait-beauty-good-3': 'beauty_good_3.dds',
    'trait-beauty-bad-1': 'beauty_bad_1.dds',
    'trait-beauty-bad-2': 'beauty_bad_2.dds',
    'trait-beauty-bad-3': 'beauty_bad_3.dds',
    'trait-intellect-good-1': 'intellect_good_1.dds',
    'trait-intellect-good-2': 'intellect_good_2.dds',
    'trait-intellect-good-3': 'intellect_good_3.dds',
    'trait-intellect-bad-1': 'intellect_bad_1.dds',
    'trait-intellect-bad-2': 'intellect_bad_2.dds',
    'trait-intellect-bad-3': 'intellect_bad_3.dds',
    'trait-physique-good-1': 'physique_good_1.dds',
    'trait-physique-good-2': 'physique_good_2.dds',
    'trait-physique-good-3': 'physique_good_3.dds',
    'trait-physique-bad-1': 'physique_bad_1.dds',
    'trait-physique-bad-2': 'physique_bad_2.dds',
    'trait-physique-bad-3': 'physique_bad_3.dds',
    'trait-fecund': 'fecund.dds',
    'trait-pure-blooded': 'pure_blooded.dds',
    'trait-giant': 'giant.dds',
    'trait-dwarf': 'dwarf.dds',
    'trait-wounded-1': 'wounded_1.dds',
    'trait-wounded-2': 'wounded_2.dds',
    'trait-wounded-3': 'wounded_3.dds',
    'trait-ill': 'ill.dds',
    'trait-infirm': 'infirm.dds',
    'trait-incapable': 'incapable.dds',
    'trait-cancer': 'cancer.dds',
    'trait-gout-ridden': 'gout_ridden.dds',
    'trait-consumption': 'consumption.dds',
    'trait-pneumonic': 'pneumonic.dds',
    'trait-lovers-pox': 'lovers_pox.dds',
    'trait-great-pox': 'great_pox.dds',
    'trait-disfigured': 'disfigured.dds',
    'trait-blind': 'blind.dds',
    'trait-one-eyed': 'one_eyed.dds',
    'trait-one-legged': 'one_legged.dds',
    'trait-maimed': 'maimed.dds',
    'trait-scarred': 'scarred.dds',
    'trait-adulterer': 'adulterer.dds',
    'trait-fornicator': 'fornicator.dds',
    'trait-murderer': 'murderer.dds',
    'trait-kinslayer-1': 'kinslayer_1.dds',
    'trait-kinslayer-2': 'kinslayer_2.dds',
    'trait-kinslayer-3': 'kinslayer_3.dds',
    'trait-excommunicated': 'excommunicated.dds',
    'trait-witch': 'witch.dds',
    'trait-cannibal': 'cannibal.dds',
    'trait-bastard': 'bastard.dds',
    # 兼容现有界面注册名，确保在清空输出目录后重新导入仍可完整构建。
    'trait-education-diplomacy': 'education_diplomacy_3.dds',
    'trait-education-martial': 'education_martial_3.dds',
    'trait-education-stewardship': 'education_stewardship_3.dds',
    'trait-education-intrigue': 'education_intrigue_3.dds',
    'trait-education-learning': 'education_learning_3.dds',
    'trait-education-prowess': 'education_martial_prowess_3.dds',
    'trait-intellect': 'intellect_good_2.dds',
    'trait-physique': 'physique_good_2.dds',
    'trait-beauty': 'beauty_good_2.dds',
    'trait-frail': 'physique_bad_1.dds',
    'trait-wounded': 'wounded_1.dds',
    'trait-agot-scurvy': 'scurvy.dds',
}


AGOT_TRAIT_SOURCES = {
    'trait-agot-nightswatch': 'nightswatch.dds',
    'trait-agot-mariner': 'mariner.dds',
    'trait-agot-authoritative': 'authoritative.dds',
    'trait-agot-rude': 'rude.dds',
    'trait-agot-inquisitive': 'inquisitive.dds',
    'trait-agot-uncouth': 'uncouth.dds',
    'trait-agot-one-handed': 'one_handed.dds',
    'trait-agot-crippled': 'crippled.dds',
    'trait-agot-greyscale': 'greyscale.dds',
    'trait-agot-burned': 'burned.dds',
    'trait-agot-mute': 'mute.dds',
    'trait-agot-half-blind': 'half_blind.dds',
    'trait-agot-the-mark': 'the_mark.dds',
    'trait-agot-dragon-dreams': 'dragon_dreams.dds',
    'trait-agot-greensight': 'greensight.dds',
    'trait-agot-fashionable': 'fashionable.dds',
    'trait-agot-fire-obsessed': 'fire_obsessed.dds',
    'trait-agot-freedman': 'freedman.dds',
    'trait-agot-spider': 'spider.dds',
    'trait-agot-dragonrider': 'dragonrider.dds',
}

HOUSE_SOURCES = {
    "house-stark": ("gfx/coat_of_arms/colored_emblems/no_stark_wolf.dds", ((132, 28, 42), (194, 222, 232), (170, 176, 184))),
    "house-lannister": ("gfx/coat_of_arms/colored_emblems/wl_lannister.dds", ((128, 16, 30), (218, 164, 62), (238, 198, 91))),
    "house-targaryen": ("gfx/coat_of_arms/colored_emblems/cl_targaryen_new.dds", ((234, 174, 62), (174, 28, 38), (118, 12, 24))),
    "house-baratheon": ("gfx/coat_of_arms/colored_emblems/st_baratheon.dds", ((132, 18, 25), (236, 190, 60), (42, 38, 34))),
    "house-tyrell": ("gfx/coat_of_arms/colored_emblems/re_tyrell.dds", ((73, 124, 64), (232, 202, 93), (216, 171, 57))),
    "house-martell": ("gfx/coat_of_arms/colored_emblems/do_nymeros_martell.dds", ((210, 72, 32), (240, 185, 57), (171, 42, 25))),
    "house-arryn": ("gfx/coat_of_arms/colored_emblems/va_arryn_falc2.dds", ((231, 230, 216), (116, 180, 210), (60, 113, 157))),
    "house-greyjoy": ("gfx/coat_of_arms/colored_emblems/ce_greyjoy.dds", ((74, 60, 38), (225, 184, 66), (205, 160, 45))),
    "house-tully": ("gfx/coat_of_arms/colored_emblems/rl_tully_2.dds", ((151, 37, 45), (205, 213, 222), (66, 112, 155))),
}

DIRECT_SOURCES = {
    "gear-helmet": "gfx/interface/icons/artifact/falcon_knight_helm.dds",
    "gear-armor": "gfx/interface/icons/artifact/ned_armor_01.dds",
    "gear-sword": "gfx/interface/icons/artifact/vs_valyrian_longsword_gold.dds",
    "gear-cloak": "gfx/interface/icons/artifact/raven_feather_cloak.dds",
    "gear-chainmail": "gfx/interface/icons/artifact/northman_armor_03.dds",
    "artifact-dragon-egg": "gfx/interface/icons/artifact/dragon_egg_blackred.dds",
    "artifact-dragonglass": "gfx/interface/icons/artifact/oily_black_stone.dds",
    "artifact-crown": "gfx/interface/icons/artifact/robertI_crown.dds",
    "artifact-goblet": "gfx/interface/icons/artifact/lannister_goblet (glowing).dds",
    "artifact-winter-rose": "gfx/interface/icons/artifact/winter_rose.dds",
    "artifact-white-book": "gfx/interface/icons/artifact/white_book.dds",
    "artifact-ruby": "gfx/interface/icons/artifact/ruby.dds",
    "artifact-glass-candle": "gfx/interface/icons/artifact/glasscandle_black.dds",
    "artifact-dragon-skull": "gfx/interface/icons/artifact/artifact_dragon_skull.dds",
    "artifact-krakenhorn": "gfx/interface/icons/artifact/krakenhorn.dds",
    "trait-dragon": "gfx/interface/icons/traits/dragon.dds",
}

SILHOUETTE_SOURCES = {
    "companion-wolf": "gfx/interface/icons/building_types/icon_building_wolf_den.dds",
    "location-winterfell": "gfx/interface/icons/building_types/icon_house_wolf.dds",
    "location-sunspear": "gfx/interface/icons/building_types/icon_structure_sunspear.dds",
    "location-hightower": "gfx/interface/icons/building_types/icon_structure_hightower.dds",
}


def fit_icon(image: Image.Image, size: int = 256, padding: int = 10, allow_upscale: bool = False) -> Image.Image:
    image = image.convert("RGBA")
    bbox = image.getbbox()
    if bbox:
        image = image.crop(bbox)
    target = size - padding * 2
    if allow_upscale and image.width > 0 and image.height > 0:
        scale = min(target / image.width, target / image.height)
        image = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.Resampling.LANCZOS,
        )
    else:
        image.thumbnail((target, target), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((size - image.width) // 2, (size - image.height) // 2))
    return canvas


def recolor_channels(image: Image.Image, palette: Iterable[tuple[int, int, int]]) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    colors = tuple(palette)
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            total = red + green + blue
            if alpha == 0 or total == 0:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            weights = (red / total, green / total, blue / total)
            color = tuple(round(sum(weights[index] * colors[index][channel] for index in range(3))) for channel in range(3))
            pixels[x, y] = (*color, alpha)
    return image


def recolor_silhouette(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            _red, _green, _blue, alpha = pixels[x, y]
            pixels[x, y] = (210, 168, 88, alpha)
    return image


def save(name: str, image: Image.Image, allow_upscale: bool = False) -> None:
    fit_icon(image, allow_upscale=allow_upscale).save(
        OUTPUT_ROOT / f"{name}.webp", "WEBP", lossless=True, method=6
    )


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, str] = {}
    for name, (source, palette) in HOUSE_SOURCES.items():
        save(name, recolor_channels(Image.open(SOURCE_ROOT / source), palette))
        manifest[name] = source
    for name, source in DIRECT_SOURCES.items():
        save(name, Image.open(SOURCE_ROOT / source))
        manifest[name] = source
    for name, source in SILHOUETTE_SOURCES.items():
        save(name, recolor_silhouette(Image.open(SOURCE_ROOT / source)))
        manifest[name] = source

    skill_sprite = Image.open(CK3_SKILL_SPRITE).convert("RGBA")
    skill_width = skill_sprite.width // len(CK3_SKILL_NAMES)
    for index, skill in enumerate(CK3_SKILL_NAMES):
        name = f"skill-{skill}"
        icon = skill_sprite.crop((index * skill_width, 0, (index + 1) * skill_width, skill_sprite.height))
        save(name, icon, allow_upscale=True)
        manifest[name] = f"CK3/gfx/interface/icons/icon_skills.dds#{index}"

    for name, source in CK3_TRAIT_SOURCES.items():
        save(name, Image.open(CK3_TRAIT_ROOT / source), allow_upscale=True)
        manifest[name] = f"CK3/gfx/interface/icons/traits/{source}"

    agot_trait_root = SOURCE_ROOT / "gfx" / "interface" / "icons" / "traits"
    for name, source in AGOT_TRAIT_SOURCES.items():
        save(name, Image.open(agot_trait_root / source), allow_upscale=True)
        manifest[name] = f"AGOT/gfx/interface/icons/traits/{source}"

    imported_trait_sources = json.loads(IMPORTED_TRAIT_ICON_MAP.read_text(encoding="utf-8"))
    for trait_id, entry in imported_trait_sources.items():
        icon_id = entry["iconId"]
        source = entry["file"]
        source_kind = entry["source"]
        source_root = agot_trait_root if source_kind == "agot" else CK3_TRAIT_ROOT
        source_prefix = "AGOT" if source_kind == "agot" else "CK3"
        save(icon_id, Image.open(source_root / source), allow_upscale=True)
        manifest[icon_id] = f"{source_prefix}/gfx/interface/icons/traits/{source}"

    (OUTPUT_ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(manifest)} game icons into {OUTPUT_ROOT}")


if __name__ == "__main__":
    main()
