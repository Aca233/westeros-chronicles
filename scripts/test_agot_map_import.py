from __future__ import annotations

import shutil
import tempfile
import unittest
from unittest import mock
import os
import json
from dataclasses import replace

import mapbox_vector_tile
import numpy as np
from pathlib import Path

from PIL import Image
from shapely.geometry import Point, box, mapping

from scripts.agot_map_import.dem import build_dem_tiles, encode_terrain_rgb
from scripts.agot_map_import.terrain_lighting import build_terrain_light_tiles, terrain_light_overlay
from scripts.agot_map_import.audit import audit_map_records, audit_semantic_records
from scripts.agot_map_import.geometry import extract_province_geometry
from scripts.agot_map_import.locations import build_locations
from scripts.agot_map_import.material_catalog import TerrainMaterial, parse_material_catalog
from scripts.agot_map_import.material_sources import (
    MaterialSourceRoots, MaterialTextureCache, resolve_diffuse,
)
from scripts.agot_map_import.material_compositor import (
    linear_to_srgb, normalize_weights, render_material_tile, srgb_to_linear,
    validate_material_index_weights,
)
from scripts.agot_map_import.material_catalog import TerrainMaterialInputs
from scripts.agot_map_import.material_tiles import build_material_terrain_tiles
from scripts.agot_map_import.models import (
    MapImportError, MapLocationRecord, ProvinceDefinition, ProvinceGeometry, RegionDefinition,
    SemanticBoundaryRecord, SemanticDataset, SemanticMembershipRecord, SemanticTitleRecord,
    TitleAncestors,
)
from scripts.agot_map_import.regions import expand_region, parse_regions
from scripts.agot_map_import.province_history import holding_to_location_type, parse_province_holdings
from scripts.agot_map_import.routes import build_route_graph
from scripts.agot_map_import.source import MapSource, parse_definition
from scripts.agot_map_import.semantic import build_semantic_dataset
from scripts.agot_map_import.titles import TitleIndex, parse_title_hierarchy
from scripts.agot_map_import.tiles import build_semantic_tiles, build_terrain_tiles, build_vector_tiles
from scripts.agot_map_import.writer import publish_map_pair, write_map_dataset
from scripts.agot_map_import.water_coloring import (
    colorize_material_terrain_tiles, parse_water_province_sets,
)
from scripts.agot_map_import.cli import _source_hashes, main as map_import_main


FIXTURE_ROOT = Path(__file__).parent / "fixtures" / "agot_map_source"
FAST_TMP_ROOT = Path(os.environ.get("AGOT_MAP_TEST_TMPDIR", "/tmp"))


class MapSourceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="agot-map-", dir=FAST_TMP_ROOT)
        self.root = Path(self.temp_dir.name) / "2962333032"
        shutil.copytree(FIXTURE_ROOT, self.root)
        map_data = self.root / "map_data"
        provinces = Image.new("RGB", (8, 6), (10, 20, 30))
        for x in range(4, 8):
            for y in range(6):
                provinces.putpixel((x, y), (40, 50, 60))
        provinces.save(map_data / "provinces.png")
        Image.new("I;16", (8, 6), 32000).save(map_data / "heightmap.png")
        Image.new("P", (8, 6), 254).save(map_data / "rivers.png")
        Image.new("RGBA", (8, 6), (0, 0, 0, 255)).save(map_data / "mask-baronyroad.png")
        terrain = self.root / "gfx" / "map" / "terrain"
        terrain.mkdir(parents=True, exist_ok=True)
        Image.new("RGBA", (8, 6), (0, 1, 0, 0)).save(terrain / "detail_index.tga")
        Image.new("RGBA", (8, 6), (255, 0, 0, 0)).save(terrain / "detail_intensity.tga")
        (terrain / "materials.settings").write_text(
            '{\n{ id = "plains" diffuse = "plains_diffuse.dds" tile_factor = 16 }\n}\n',
            encoding="utf-8",
        )
        Image.new("RGB", (2, 2), (40, 80, 40)).save(terrain / "plains_diffuse.dds")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_opens_verified_agot_source(self) -> None:
        source = MapSource.open(self.root, expected_size=(8, 6))
        self.assertEqual(source.source_id, "2962333032")
        self.assertEqual(source.map_size, (8, 6))
        self.assertEqual(source.default_files["provinces"].name, "provinces.png")
        self.assertEqual(source.terrain_materials.index_map.name, "detail_index.tga")

    def test_rejects_missing_required_image(self) -> None:
        (self.root / "map_data" / "provinces.png").unlink()
        with self.assertRaisesRegex(MapImportError, "provinces.png"):
            MapSource.open(self.root, expected_size=(8, 6))

    def test_rejects_wrong_source_identity(self) -> None:
        descriptor = self.root / "descriptor.mod"
        descriptor.write_text(descriptor.read_text().replace("2962333032", "529340"))
        with self.assertRaisesRegex(MapImportError, "2962333032"):
            MapSource.open(self.root, expected_size=(8, 6))

    def test_rejects_wrong_image_mode_or_size(self) -> None:
        Image.new("RGBA", (8, 6)).save(self.root / "map_data" / "provinces.png")
        with self.assertRaisesRegex(MapImportError, "RGB"):
            MapSource.open(self.root, expected_size=(8, 6))
        Image.new("RGB", (7, 6)).save(self.root / "map_data" / "provinces.png")
        with self.assertRaisesRegex(MapImportError, "8x6"):
            MapSource.open(self.root, expected_size=(8, 6))

    def test_rejects_missing_or_invalid_material_maps(self) -> None:
        terrain = self.root / "gfx" / "map" / "terrain"
        (terrain / "detail_index.tga").unlink()
        with self.assertRaisesRegex(MapImportError, "detail_index.tga"):
            MapSource.open(self.root, expected_size=(8, 6))
        Image.new("RGB", (8, 6)).save(terrain / "detail_index.tga")
        with self.assertRaisesRegex(MapImportError, "RGBA"):
            MapSource.open(self.root, expected_size=(8, 6))

    def test_definition_requires_unique_ids_and_colours(self) -> None:
        definitions = parse_definition(self.root / "map_data" / "definition.csv")
        self.assertEqual(definitions[1].name, "b_winterfell")
        self.assertEqual(definitions[1].rgb, (10, 20, 30))
        duplicate = self.root / "map_data" / "duplicate.csv"
        duplicate.write_text("1;10;20;30;b_one;x\n2;10;20;30;b_two;x\n")
        with self.assertRaisesRegex(MapImportError, "颜色重复"):
            parse_definition(duplicate)

    def test_source_hashes_include_material_maps_and_resolved_diffuse_without_absolute_paths(self) -> None:
        source = MapSource.open(self.root, expected_size=(8, 6))
        hashes = _source_hashes(source, self.root, include_material_textures=True)
        self.assertIn("gfx/map/terrain/detail_index.tga", hashes)
        self.assertIn("gfx/map/terrain/detail_intensity.tga", hashes)
        self.assertIn("gfx/map/terrain/materials.settings", hashes)
        self.assertIn("agot/gfx/map/terrain/plains_diffuse.dds", hashes)
        self.assertFalse(any(str(self.root) in key for key in hashes))


class MaterialCatalogTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="agot-materials-", dir=FAST_TMP_ROOT)
        self.path = Path(self.temp_dir.name) / "materials.settings"

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def write(self, text: str) -> None:
        self.path.write_text(text, encoding="utf-8")

    def test_preserves_live_declaration_order_and_defaults(self) -> None:
        self.write('''
        {
            # { id = "disabled" diffuse = "disabled.dds" }
            {
                name = "Plains"
                diffuse = "plains_diffuse.dds"
                id = "plains"
                tile_factor = 16
            }
            { id = "snow" diffuse = "snow_diffuse.dds" }
        }
        { { id = "rock" diffuse = "rock_diffuse.dds" tile_factor = 4 } }
        ''')
        materials = parse_material_catalog(self.path, default_tile_factor=8)
        self.assertEqual(
            [(item.index, item.id) for item in materials],
            [(0, "plains"), (1, "snow"), (2, "rock")],
        )
        self.assertEqual(
            [item.diffuse for item in materials],
            ["plains_diffuse.dds", "snow_diffuse.dds", "rock_diffuse.dds"],
        )
        self.assertEqual([item.tile_factor for item in materials], [16.0, 8.0, 4.0])

    def test_rejects_duplicate_missing_and_invalid_records(self) -> None:
        cases = [
            ('{ { id = "same" diffuse = "a.dds" } { id = "same" diffuse = "b.dds" } }', "重复"),
            ('{ { id = "missing" } }', "diffuse"),
            ('{ { id = "bad" diffuse = "bad.dds" tile_factor = 0 } }', "tile_factor"),
        ]
        for text, message in cases:
            with self.subTest(message=message):
                self.write(text)
                with self.assertRaisesRegex(MapImportError, message):
                    parse_material_catalog(self.path, default_tile_factor=8)


class MaterialSourceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="agot-material-source-", dir=FAST_TMP_ROOT)
        self.root = Path(self.temp_dir.name)
        self.agot = self.root / "agot"
        self.ck3 = self.root / "ck3"
        for root in (self.agot, self.ck3):
            (root / "gfx" / "map" / "terrain").mkdir(parents=True)
        self.roots = MaterialSourceRoots(self.agot, self.ck3)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def material(self, index: int, name: str) -> TerrainMaterial:
        return TerrainMaterial(index, name, f"{name}.dds", 8)

    def write_dds(self, root: Path, name: str, colour: tuple[int, int, int]) -> Path:
        path = root / "gfx" / "map" / "terrain" / f"{name}.dds"
        Image.new("RGB", (2, 2), colour).save(path)
        return path

    def test_agot_overrides_ck3_and_missing_material_is_rejected(self) -> None:
        material = self.material(0, "shared")
        agot_path = self.write_dds(self.agot, "shared", (100, 0, 0))
        ck3_path = self.write_dds(self.ck3, "shared", (0, 100, 0))
        self.assertEqual(resolve_diffuse(material, self.roots), agot_path.resolve())
        agot_path.unlink()
        self.assertEqual(resolve_diffuse(material, self.roots), ck3_path.resolve())
        ck3_path.unlink()
        with self.assertRaisesRegex(MapImportError, "shared"):
            resolve_diffuse(material, self.roots)

    def test_cache_decodes_rgb_reuses_entries_and_evicts_lru(self) -> None:
        materials = [self.material(index, name) for index, name in enumerate(("a", "b", "c"))]
        for material, colour in zip(materials, ((10, 20, 30), (40, 50, 60), (70, 80, 90))):
            self.write_dds(self.agot, material.id, colour)
        with mock.patch("scripts.agot_map_import.material_sources.Image.open", wraps=Image.open) as opened:
            cache = MaterialTextureCache(self.roots, max_bytes=24)
            self.assertEqual(cache.get(materials[0]).mode, "RGB")
            self.assertIs(cache.get(materials[0]), cache.get(materials[0]))
            cache.get(materials[1])
            cache.get(materials[0])
            cache.get(materials[2])
            cache.get(materials[1])
            self.assertEqual(opened.call_count, 4)
            cache.close()

    def test_cache_rejects_unreadable_dds(self) -> None:
        material = self.material(0, "broken")
        path = self.agot / "gfx" / "map" / "terrain" / "broken.dds"
        path.write_bytes(b"not a dds")
        cache = MaterialTextureCache(self.roots)
        with self.assertRaisesRegex(MapImportError, "broken.dds"):
            cache.get(material)
        cache.close()


class MaterialCompositorTests(unittest.TestCase):
    class TextureFixture:
        def __init__(self, colours: tuple[tuple[int, int, int], ...]) -> None:
            self.images = {
                index: Image.new("RGB", (4, 4), colour)
                for index, colour in enumerate(colours)
            }

        def get(self, material: TerrainMaterial) -> Image.Image:
            return self.images[material.index]

    @staticmethod
    def materials(count: int, tile_factor: float = 1) -> tuple[TerrainMaterial, ...]:
        return tuple(TerrainMaterial(index, f"m{index}", f"m{index}.dds", tile_factor) for index in range(count))

    def test_normalizes_zero_weights_to_first_channel(self) -> None:
        result = normalize_weights(np.array([0, 0, 0, 0], dtype=np.uint8))
        self.assertEqual(result.tolist(), [1.0, 0.0, 0.0, 0.0])

    def test_blends_four_materials_in_linear_colour_space(self) -> None:
        colours = ((255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255))
        indices = Image.new("RGBA", (1, 1), (0, 1, 2, 3))
        intensities = Image.new("RGBA", (1, 1), (64, 64, 64, 63))
        rendered = render_material_tile(
            indices, intensities, self.materials(4), self.TextureFixture(colours),
            (0, 0, 1, 1), (1, 1), 1,
        )
        weights = np.array([64, 64, 64, 63], dtype=np.float64) / 255
        linear = sum(srgb_to_linear(np.asarray(colour, dtype=np.float64) / 255) * weight
                     for colour, weight in zip(colours, weights))
        expected = tuple(np.rint(linear_to_srgb(linear) * 255).astype(np.uint8))
        self.assertEqual(rendered.getpixel((0, 0)), expected)

    def test_rejects_active_out_of_range_material_index(self) -> None:
        with self.assertRaisesRegex(MapImportError, "材质索引"):
            validate_material_index_weights(
                Image.new("RGBA", (1, 1), (9, 0, 0, 0)),
                Image.new("RGBA", (1, 1), (255, 0, 0, 0)),
                material_count=1,
            )

    def test_accepts_zero_weight_sentinel_material_indices(self) -> None:
        validate_material_index_weights(
            Image.new("RGBA", (1, 1), (0, 255, 255, 255)),
            Image.new("RGBA", (1, 1), (255, 0, 0, 0)),
            material_count=1,
        )

    def test_preserves_rgb_weight_channels_when_alpha_weight_is_zero(self) -> None:
        indices = Image.new("RGBA", (2, 2))
        intensities = Image.new("RGBA", (2, 2))
        for y in range(2):
            indices.putpixel((0, y), (0, 255, 255, 255))
            indices.putpixel((1, y), (0, 1, 255, 255))
            intensities.putpixel((0, y), (255, 0, 0, 0))
            intensities.putpixel((1, y), (0, 255, 0, 0))
        rendered = render_material_tile(
            indices, intensities, self.materials(2),
            self.TextureFixture(((255, 0, 0), (0, 255, 0))),
            (0, 0, 2, 2), (2, 2), 8,
        )
        self.assertEqual(rendered.getpixel((0, 0)), (255, 0, 0))
        self.assertEqual(rendered.getpixel((7, 0)), (0, 255, 0))

    def test_ignores_sentinel_weight_created_by_bilinear_sampling(self) -> None:
        rendered = render_material_tile(
            Image.new("RGBA", (1, 1), (0, 255, 255, 255)),
            Image.new("RGBA", (1, 1), (200, 55, 0, 0)),
            self.materials(1), self.TextureFixture(((30, 90, 30),)),
            (0, 0, 1, 1), (1, 1), 1,
        )
        self.assertEqual(rendered.getpixel((0, 0)), (30, 90, 30))

    def test_global_uv_matches_one_render_across_adjacent_tiles(self) -> None:
        texture = Image.new("RGB", (4, 1))
        for x, colour in enumerate(((0, 0, 0), (64, 0, 0), (128, 0, 0), (255, 0, 0))):
            texture.putpixel((x, 0), colour)
        cache = self.TextureFixture(((0, 0, 0),))
        cache.images[0] = texture
        materials = self.materials(1, tile_factor=1)
        indices = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
        weights = Image.new("RGBA", (1, 1), (255, 0, 0, 0))
        full = render_material_tile(indices, weights, materials, cache, (0, 0, 2, 1), (4, 1), 8)
        left = render_material_tile(indices, weights, materials, cache, (0, 0, 1, 1), (4, 1), 4)
        right = render_material_tile(indices, weights, materials, cache, (1, 0, 2, 1), (4, 1), 4)
        joined_row = [left.getpixel((x, 0)) for x in range(4)] + [right.getpixel((x, 0)) for x in range(4)]
        self.assertEqual(joined_row, [full.getpixel((x, 0)) for x in range(8)])


class MaterialTileTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="agot-material-tiles-", dir=FAST_TMP_ROOT)
        self.root = Path(self.temp_dir.name)
        self.agot = self.root / "agot"
        self.ck3 = self.root / "ck3"
        for root in (self.agot, self.ck3):
            (root / "gfx" / "map" / "terrain").mkdir(parents=True)
        terrain = self.agot / "gfx" / "map" / "terrain"
        self.index_map = terrain / "detail_index.tga"
        self.intensity_map = terrain / "detail_intensity.tga"
        self.settings = terrain / "materials.settings"
        Image.new("RGBA", (16, 16), (0, 1, 0, 0)).save(self.index_map)
        Image.new("RGBA", (16, 16), (192, 63, 0, 0)).save(self.intensity_map)
        self.settings.write_text('{ { id = "a" diffuse = "a.dds" } { id = "b" diffuse = "b.dds" } }')
        Image.new("RGB", (4, 4), (30, 90, 30)).save(terrain / "a.dds")
        Image.new("RGB", (4, 4), (220, 220, 220)).save(terrain / "b.dds")
        self.inputs = TerrainMaterialInputs(self.index_map, self.intensity_map, self.settings)
        self.materials = (
            TerrainMaterial(0, "a", "a.dds", 2),
            TerrainMaterial(1, "b", "b.dds", 2),
        )
        self.roots = MaterialSourceRoots(self.agot, self.ck3)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_builds_five_local_webp_tiles_for_zooms_zero_and_one(self) -> None:
        output = self.root / "material-terrain"
        report = build_material_terrain_tiles(
            self.inputs, self.materials, self.roots, (0, 0, 16, 16), (16, 16),
            output, (0, 1), tile_size=8,
        )
        files = sorted(output.rglob("*.webp"))
        self.assertEqual((report.kind, report.tile_count, report.min_zoom, report.max_zoom),
                         ("materialTerrain", 5, 0, 1))
        self.assertEqual(len(files), 5)
        for path in files:
            with Image.open(path) as tile:
                self.assertEqual((tile.format, tile.size), ("WEBP", (8, 8)))
        with Image.open(output / "0" / "0" / "0.webp") as tile:
            red, green, blue = tile.convert("RGB").getpixel((4, 4))
            self.assertGreater(red, 60)
            self.assertGreater(blue, 30)
            self.assertGreater(green, 100)

    def test_failure_keeps_previous_output(self) -> None:
        output = self.root / "material-terrain"
        output.mkdir()
        (output / "sentinel.txt").write_text("old", encoding="utf-8")
        with mock.patch(
            "scripts.agot_map_import.material_tiles.render_material_tile",
            side_effect=MapImportError("render failed"),
        ):
            with self.assertRaisesRegex(MapImportError, "render failed"):
                build_material_terrain_tiles(
                    self.inputs, self.materials, self.roots, (0, 0, 16, 16), (16, 16),
                    output, (0,), tile_size=8,
                )
        self.assertEqual((output / "sentinel.txt").read_text(encoding="utf-8"), "old")

class WaterColoringTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="agot-map-water-", dir=FAST_TMP_ROOT)
        self.root = Path(self.temp_dir.name)
        self.output = self.root / "material-terrain"
        tile_path = self.output / "0" / "0" / "0.webp"
        tile_path.parent.mkdir(parents=True)
        Image.new("RGB", (60, 60), (150, 105, 65)).save(tile_path, format="WEBP", lossless=True)
        (self.output / "sentinel.txt").write_text("old", encoding="utf-8")

        self.provinces = self.root / "provinces.png"
        province_image = Image.new("RGB", (6, 1))
        definitions = {}
        for province_id, red in enumerate((10, 20, 30, 40, 50, 60), start=1):
            province_image.putpixel((province_id - 1, 0), (red, red + 1, red + 2))
            definitions[province_id] = ProvinceDefinition(
                province_id, red, red + 1, red + 2, f"province_{province_id}",
            )
        province_image.save(self.provinces)
        self.definitions = definitions

        self.rivers = self.root / "rivers.png"
        river_image = Image.new("P", (6, 1), 255)
        river_image.putpalette([channel for value in range(256) for channel in (value, value, value)])
        river_image.putdata((254, 255, 254, 0, 254, 255))
        river_image.save(self.rivers)
        self.water = parse_water_province_sets('''
            sea_zones = RANGE { 1 1 }
            sea_zones = LIST { 61 62 }
            lakes = RANGE { 2 2 }
            lakes = LIST { 68 }
            river_provinces = RANGE { 3 3 }
            river_provinces = LIST { 69 70 }
        ''')

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_parses_all_repeated_range_and_list_blocks(self) -> None:
        self.assertEqual(self.water.seas, frozenset({1, 61, 62}))
        self.assertEqual(self.water.lakes, frozenset({2, 68}))
        self.assertEqual(self.water.rivers, frozenset({3, 69, 70}))

    def test_colors_sea_lake_major_and_small_river_without_touching_land(self) -> None:
        count = colorize_material_terrain_tiles(
            self.output, self.provinces, self.rivers, self.definitions, self.water,
            (0, 0, 6, 1), (0,), tile_size=60,
        )
        self.assertEqual(count, 1)
        self.assertEqual(len(list(self.output.rglob("*.webp"))), 1)
        self.assertEqual((self.output / "sentinel.txt").read_text(encoding="utf-8"), "old")
        with Image.open(self.output / "0" / "0" / "0.webp") as tile:
            pixels = [tile.convert("RGB").getpixel((x, 30)) for x in (5, 15, 25, 35, 45, 55)]
        sea, lake, major_river, small_river, land_254, land_255 = pixels
        self.assertGreater(sea[2], sea[0])
        self.assertGreater(lake[1], sea[1])
        self.assertGreater(major_river[1], lake[1])
        self.assertGreater(small_river[1], major_river[1])
        self.assertGreater(land_254[0], land_254[1])
        self.assertGreater(land_254[1], land_254[2])
        self.assertGreater(land_255[0], land_255[1])
        self.assertGreater(land_255[1], land_255[2])

    def test_background_river_indices_254_and_255_do_not_color_land(self) -> None:
        colorize_material_terrain_tiles(
            self.output, self.provinces, self.rivers, self.definitions, self.water,
            (0, 0, 6, 1), (0,), tile_size=60,
        )
        with Image.open(self.output / "0" / "0" / "0.webp") as tile:
            rgb = tile.convert("RGB")
            lands = (rgb.getpixel((45, 30)), rgb.getpixel((55, 30)))
        for land in lands:
            self.assertLess(
                sum(abs(channel - original) for channel, original in zip(land, (150, 105, 65))),
                20,
            )

    def test_failure_keeps_previous_tiles(self) -> None:
        original = (self.output / "0" / "0" / "0.webp").read_bytes()
        with mock.patch("PIL.Image.Image.save", side_effect=OSError("save failed")):
            with self.assertRaisesRegex(OSError, "save failed"):
                colorize_material_terrain_tiles(
                    self.output, self.provinces, self.rivers, self.definitions, self.water,
                    (0, 0, 6, 1), (0,), tile_size=60,
                )
        self.assertEqual((self.output / "0" / "0" / "0.webp").read_bytes(), original)
        self.assertEqual((self.output / "sentinel.txt").read_text(encoding="utf-8"), "old")


class MapRegionTests(unittest.TestCase):
    def test_expands_nested_westeros_region(self) -> None:
        regions = parse_regions(FIXTURE_ROOT / "map_data" / "geographical_regions")
        self.assertEqual(
            expand_region("world_westeros", regions),
            frozenset({"b_winterfell", "b_kings_landing"}),
        )

    def test_rejects_unknown_and_cyclic_region_references(self) -> None:
        with tempfile.TemporaryDirectory(prefix="agot-map-", dir=FAST_TMP_ROOT) as directory:
            root = Path(directory)
            (root / "regions.txt").write_text(
                "a = { regions = { b } }\n"
                "b = { regions = { a } }\n",
                encoding="utf-8",
            )
            regions = parse_regions(root)
            with self.assertRaisesRegex(MapImportError, "a -> b -> a"):
                expand_region("a", regions)
            with self.assertRaisesRegex(MapImportError, "不存在"):
                expand_region("missing", regions)


class SemanticDatasetTests(unittest.TestCase):
    def _dataset(
        self,
        reverse: bool = False,
        missing: tuple[str, ...] = (),
        *,
        countyless: bool = False,
        missing_stable_barony: bool = False,
        mismatched_definition_name: bool = False,
        outside_bounds: bool = False,
        cyclic_region: bool = False,
    ):
        winterfell_geometry = box(-1, 0, 4, 4) if outside_bounds else box(0, 0, 4, 4)
        rows = [
            (1, "b_winterfell", winterfell_geometry, "the_north"),
            (2, "b_kings_landing", box(4, 0, 8, 4), "the_crownlands"),
        ]
        if reverse:
            rows.reverse()
        geometries = {
            province_id: ProvinceGeometry(
                province_id,
                ("b_definition_alias" if mismatched_definition_name and province_id == 1 else barony_id),
                2 + 4 * index, 2,
                tuple(map(int, geometry.bounds)), 16, geometry, region_id,
            )
            for index, (province_id, barony_id, geometry, region_id) in enumerate(rows)
        }
        titles = TitleIndex(
            by_barony={
                "b_winterfell": TitleAncestors(None if countyless else "c_winterfell", "d_winterfell", "k_westeros", "e_test"),
                "b_kings_landing": TitleAncestors("c_kings_landing", "d_kings_landing", "k_westeros", "e_test"),
            },
            province_baronies={
                **({} if missing_stable_barony else {1: "b_winterfell"}),
                2: "b_kings_landing",
            },
        )
        regions = {
            "world_westeros": RegionDefinition("world_westeros", (), ("the_north", "the_crownlands"), "fixture", 1),
            "the_north": RegionDefinition(
                "the_north", ("b_winterfell",),
                ("world_westeros",) if cyclic_region else (), "fixture", 2,
            ),
            "the_crownlands": RegionDefinition("the_crownlands", ("b_kings_landing",), (), "fixture", 3),
        }
        localization = {
            "h_test": "铁王座", "e_test": "测试帝国", "k_westeros": "测试王国",
            "the_north": "北境", "b_winterfell": "临冬城", "c_winterfell": "临冬城伯爵领",
            "d_winterfell": "临冬城公国", "the_crownlands": "王领",
            "b_kings_landing": "君临", "c_kings_landing": "君临伯爵领", "d_kings_landing": "君临公国",
        }
        for key in missing:
            localization.pop(key, None)
        locations = [
            MapLocationRecord(
                id=barony_id, name=localization.get(barony_id, barony_id), english_name=None,
                type="castle", map_x=geometry.map_x, map_y=geometry.map_y,
                province_id=province_id, barony_id=barony_id,
                county_id=titles.by_barony[barony_id].county_id,
                duchy_id=titles.by_barony[barony_id].duchy_id, kingdom_id="k_westeros",
                region_id=geometry.region_id, terrain="plains", is_coastal=False,
                is_port=False, importance=100, tags=(),
            )
            for province_id, geometry in sorted(geometries.items())
            for barony_id in ["b_winterfell" if province_id == 1 else "b_kings_landing"]
        ]
        return build_semantic_dataset(
            geometries, locations, titles, regions, localization,
            {"h_test": ["e_test"]},
        )

    def test_builds_five_visible_ranks_internal_barony_key_and_membership(self) -> None:
        dataset = self._dataset()
        self.assertEqual({boundary.rank for boundary in dataset.boundaries}, {
            "hegemon", "empire", "kingdom", "duchy", "county",
        })
        self.assertNotIn("barony", {boundary.rank for boundary in dataset.boundaries})
        self.assertEqual([title.feature_id for title in dataset.titles], list(range(1, 8)))
        self.assertTrue(all(title.geometry.covers(title.anchor) for title in dataset.titles))
        winterfell = next(item for item in dataset.memberships if item.location_id == "b_winterfell")
        self.assertEqual(
            (winterfell.hegemon_id, winterfell.empire_id, winterfell.kingdom_id,
             winterfell.duchy_id, winterfell.county_id, winterfell.barony_id, winterfell.region_id),
            ("h_test", "e_test", "k_westeros", "d_winterfell", "c_winterfell",
             "b_winterfell", "the_north"),
        )
        self.assertTrue(all(title.title_color.startswith("#") for title in dataset.titles))

    def test_output_is_identical_when_input_order_is_reversed(self) -> None:
        self.assertEqual(self._dataset(), self._dataset(reverse=True))

    def test_landed_title_mapping_overrides_mismatched_definition_name(self) -> None:
        dataset = self._dataset(mismatched_definition_name=True)
        winterfell = next(item for item in dataset.memberships if item.location_id == "b_winterfell")
        self.assertEqual(winterfell.barony_id, "b_winterfell")

    def test_missing_chinese_name_keeps_boundary_but_suppresses_title(self) -> None:
        dataset = self._dataset(missing=("d_winterfell",))
        self.assertTrue(any(item.title_id == "d_winterfell" for item in dataset.boundaries))
        self.assertFalse(any(item.title_id == "d_winterfell" for item in dataset.titles))
        self.assertIn("d_winterfell", dataset.missing_localizations)

    def test_rejects_missing_stable_barony_and_county_hierarchy(self) -> None:
        with self.assertRaisesRegex(MapImportError, "稳定男爵领"):
            self._dataset(missing_stable_barony=True)
        with self.assertRaisesRegex(MapImportError, "伯爵领"):
            self._dataset(countyless=True)

    def test_rejects_region_cycles_and_out_of_bounds_geometry(self) -> None:
        with self.assertRaisesRegex(MapImportError, "循环引用"):
            self._dataset(cyclic_region=True)
        with self.assertRaisesRegex(MapImportError, "越出地图"):
            self._dataset(outside_bounds=True)



class ProvinceHistoryTests(unittest.TestCase):
    def test_resolves_holding_at_298_and_maps_location_types(self) -> None:
        with tempfile.TemporaryDirectory(prefix="agot-map-", dir=FAST_TMP_ROOT) as directory:
            path = Path(directory) / "history.txt"
            path.write_text(
                "1 = { holding = castle_holding 8299.1.1 = { holding = city_holding } }\n"
                "2 = { holding = none 8290.1.1 = { holding = city_holding } }\n"
                "3 = { holding = church_holding }\n",
                encoding="utf-8",
            )
            holdings = parse_province_holdings(path.parent)
            self.assertEqual(holdings, {1: "castle_holding", 2: "city_holding", 3: "church_holding"})
            self.assertEqual(holding_to_location_type(holdings[1]), "castle")
            self.assertEqual(holding_to_location_type(holdings[2]), "city")
            self.assertEqual(holding_to_location_type(holdings[3]), "town")
            self.assertEqual(holding_to_location_type("none"), "village")
            self.assertEqual(holding_to_location_type("ruin_holding"), "ruin")


class MapGeometryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.image = Image.new("RGB", (4, 3), (40, 50, 60))
        for point in ((0, 0), (1, 0), (0, 1), (3, 1), (3, 2)):
            self.image.putpixel(point, (10, 20, 30))
        self.definitions = {
            1: parse_definition(FIXTURE_ROOT / "map_data" / "definition.csv")[1],
            2: parse_definition(FIXTURE_ROOT / "map_data" / "definition.csv")[2],
        }

    def test_extracts_pixel_statistics_and_disconnected_geometry(self) -> None:
        geometries = extract_province_geometry(self.image, self.definitions, {1, 2})
        winterfell = geometries[1]
        self.assertEqual(winterfell.pixel_count, 5)
        self.assertEqual(winterfell.bbox, (0, 0, 4, 3))
        self.assertEqual(winterfell.geometry.geom_type, "MultiPolygon")
        self.assertEqual(self.image.getpixel((winterfell.map_x, winterfell.map_y)), (10, 20, 30))

    def test_rejects_definition_colour_missing_from_bitmap(self) -> None:
        definitions = parse_definition(FIXTURE_ROOT / "map_data" / "definition.csv")
        with self.assertRaisesRegex(MapImportError, "没有对应像素"):
            extract_province_geometry(self.image, definitions, {3})


class MapLocationTests(unittest.TestCase):
    def setUp(self) -> None:
        image = Image.new("RGB", (4, 3), (40, 50, 60))
        for point in ((0, 0), (1, 0), (0, 1)):
            image.putpixel(point, (10, 20, 30))
        definitions = parse_definition(FIXTURE_ROOT / "map_data" / "definition.csv")
        self.geometries = extract_province_geometry(image, definitions, {1, 2})
        self.titles = parse_title_hierarchy(FIXTURE_ROOT / "common" / "landed_titles")

    def test_resolves_title_ancestors_and_builds_stable_location(self) -> None:
        ancestors = self.titles.ancestors("b_winterfell")
        self.assertEqual(ancestors.county_id, "c_winterfell")
        self.assertEqual(ancestors.duchy_id, "d_winterfell")
        self.assertEqual(ancestors.kingdom_id, "k_westeros")
        self.assertEqual(ancestors.empire_id, "e_test")
        self.assertEqual(ancestors.hegemon_id, "h_test")
        self.assertEqual(self.titles.title_colors["e_test"], "#b9bfbc")
        self.assertEqual(self.titles.title_colors["h_test"], "#826464")
        locations = build_locations(
            self.geometries,
            self.titles,
            {"b_winterfell": "临冬城", "b_kings_landing": "君临"},
            {"b_winterfell": {"type": "landmark", "mapX": 0, "mapY": 0, "tags": ["capital"]}},
        )
        winterfell = next(location for location in locations if location.id == "b_winterfell")
        self.assertEqual(winterfell.name, "临冬城")
        self.assertEqual(winterfell.type, "landmark")
        self.assertEqual((winterfell.map_x, winterfell.map_y), (0, 0))
        self.assertEqual(winterfell.county_id, "c_winterfell")

    def test_rejects_out_of_range_title_color(self) -> None:
        with tempfile.TemporaryDirectory(prefix="agot-title-color-", dir=FAST_TMP_ROOT) as directory:
            path = Path(directory) / "titles.txt"
            path.write_text(
                "e_test = { color = { 256 10 20 } k_test = { d_test = { c_test = { b_test = { province = 1 } } } } }",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(MapImportError, "color 通道必须位于 0 到 255"):
                parse_title_hierarchy(path)

    def test_accepts_optional_alpha_title_color_channel(self) -> None:
        with tempfile.TemporaryDirectory(prefix="agot-title-color-", dir=FAST_TMP_ROOT) as directory:
            path = Path(directory) / "titles.txt"
            path.write_text(
                "e_test = { color = { 120 130 140 0 } k_test = { d_test = { c_test = { b_test = { province = 1 } } } } }",
                encoding="utf-8",
            )
            self.assertEqual(parse_title_hierarchy(path).title_colors["e_test"], "#78828c")

    def test_missing_title_color_does_not_create_entry(self) -> None:
        with tempfile.TemporaryDirectory(prefix="agot-title-color-", dir=FAST_TMP_ROOT) as directory:
            path = Path(directory) / "titles.txt"
            path.write_text(
                "e_test = { k_test = { d_test = { c_test = { b_test = { province = 1 } } } } }",
                encoding="utf-8",
            )
            self.assertEqual(parse_title_hierarchy(path).title_colors, {})

    def test_override_cannot_change_stable_location_id(self) -> None:
        with self.assertRaisesRegex(MapImportError, "稳定 ID"):
            build_locations(
                self.geometries,
                self.titles,
                {},
                {"b_winterfell": {"id": "b_fake_winterfell"}},
            )


class RouteGraphTests(unittest.TestCase):
    def setUp(self) -> None:
        self.geometries = {
            1: ProvinceGeometry(1, "b_one", 1, 1, (0, 0, 4, 4), 16, box(0, 0, 4, 4), terrain="plains", is_coastal=True),
            2: ProvinceGeometry(2, "b_two", 6, 1, (4, 0, 8, 4), 16, box(4, 0, 8, 4), terrain="hills"),
            3: ProvinceGeometry(3, "b_three", 11, 1, (10, 0, 14, 4), 16, box(10, 0, 14, 4), terrain="coastal", is_coastal=True),
        }
        self.locations = [
            self._location("b_one", 1, 1, 1, is_port=True),
            self._location("b_two", 2, 6, 1),
            self._location("b_three", 3, 11, 1, is_port=True),
        ]
        self.road_mask = Image.new("L", (14, 4), 0)
        for x in range(1, 7):
            self.road_mask.putpixel((x, 1), 255)
        self.rivers = Image.new("P", (14, 4), 254)

    @staticmethod
    def _location(location_id: str, province_id: int, map_x: int, map_y: int, is_port: bool = False) -> MapLocationRecord:
        return MapLocationRecord(
            id=location_id, name=location_id, english_name=None, type="port" if is_port else "castle",
            map_x=map_x, map_y=map_y, province_id=province_id, barony_id=location_id,
            county_id=None, duchy_id=None, kingdom_id=None, region_id="world_westeros",
            terrain="plains", is_coastal=is_port, is_port=is_port, importance=20, tags=(),
        )

    def test_builds_mirrored_land_and_river_edges_with_road_modes(self) -> None:
        graph = build_route_graph(
            self.locations,
            self.geometries,
            [{"From": "1", "To": "2", "Type": "river_large", "Through": "9"}],
            self.road_mask,
            self.rivers,
            set(),
        )
        forward = next(edge for edge in graph.edges if edge.from_id == "b_one" and edge.to_id == "b_two")
        reverse = next(edge for edge in graph.edges if edge.from_id == "b_two" and edge.to_id == "b_one")
        self.assertEqual(forward.crossing, "river")
        self.assertEqual(forward.road_level, "major")
        self.assertIn("carriage", forward.allowed_modes)
        self.assertNotIn("ship", forward.allowed_modes)
        self.assertEqual(forward.distance, reverse.distance)
        self.assertEqual(forward.base_days, reverse.base_days)

    def test_sea_routes_require_ports_and_allow_only_ships(self) -> None:
        graph = build_route_graph(
            self.locations,
            self.geometries,
            [{"From": "1", "To": "3", "Type": "sea", "Through": "-1"}],
            self.road_mask,
            self.rivers,
            set(),
        )
        sea = next(edge for edge in graph.edges if edge.from_id == "b_one" and edge.to_id == "b_three")
        self.assertEqual(sea.crossing, "sea")
        self.assertEqual(sea.allowed_modes, ("ship",))
        with self.assertRaisesRegex(MapImportError, "港口"):
            build_route_graph(
                self.locations,
                self.geometries,
                [{"From": "2", "To": "3", "Type": "sea", "Through": "-1"}],
                self.road_mask,
                self.rivers,
                set(),
            )

    def test_impassable_land_and_roadless_carriage_are_excluded(self) -> None:
        graph = build_route_graph(
            self.locations,
            self.geometries,
            [],
            Image.new("L", (14, 4), 0),
            self.rivers,
            set(),
        )
        land = next(edge for edge in graph.edges if edge.from_id == "b_one" and edge.to_id == "b_two")
        self.assertNotIn("carriage", land.allowed_modes)
        blocked = build_route_graph(
            self.locations,
            self.geometries,
            [],
            self.road_mask,
            self.rivers,
            {2},
        )
        self.assertFalse(any({edge.from_id, edge.to_id} == {"b_one", "b_two"} for edge in blocked.edges))

    def test_output_order_and_hash_are_deterministic(self) -> None:
        first = build_route_graph(self.locations, self.geometries, [], self.road_mask, self.rivers, set())
        second = build_route_graph(list(reversed(self.locations)), self.geometries, [], self.road_mask, self.rivers, set())
        self.assertEqual(first, second)
        self.assertEqual(list(first.nodes), sorted(first.nodes, key=lambda node: node.id))
        self.assertEqual(list(first.edges), sorted(first.edges, key=lambda edge: edge.id))


def semantic_fixture(location_ids: tuple[str, ...] = ("b_one", "b_two", "b_three")) -> SemanticDataset:
    geometry = box(0, 0, 14, 4)
    anchor = Point(7, 2)
    ranks = (
        ("hegemon", "h_fixture", 100),
        ("empire", "e_fixture", 90),
        ("kingdom", "k_fixture", 80),
        ("duchy", "d_fixture", 70),
        ("county", "c_fixture", 60),
    )
    boundaries = tuple(
        SemanticBoundaryRecord(index, title_id, rank, f"{title_id}中文", "the_fixture", "#777777", geometry)
        for index, (rank, title_id, _importance) in enumerate(ranks, 1)
    )
    titles = tuple(
        SemanticTitleRecord(
            index, title_id, rank, f"{title_id}中文", 7.0, 2.0, importance,
            "the_fixture", "#777777", geometry, anchor,
        )
        for index, (rank, title_id, importance) in enumerate(ranks, 1)
    )
    memberships = tuple(
        SemanticMembershipRecord(
            location_id,
            location_id,
            "c_fixture",
            "d_fixture",
            "k_fixture",
            "e_fixture",
            "h_fixture",
            "the_fixture",
        )
        for location_id in sorted(location_ids)
    )
    return SemanticDataset(boundaries, titles, memberships, ())


class SemanticAuditTests(unittest.TestCase):
    @staticmethod
    def _locations(location_ids: tuple[str, ...] = ("b_one", "b_two", "b_three")) -> list[MapLocationRecord]:
        return [
            MapLocationRecord(
                id=location_id, name=location_id, english_name=None, type="castle",
                map_x=index, map_y=2, province_id=index, barony_id=location_id,
                county_id="c_fixture", duchy_id="d_fixture", kingdom_id=None,
                region_id="the_fixture", terrain="plains", is_coastal=False,
                is_port=False, importance=20, tags=(),
            )
            for index, location_id in enumerate(location_ids, 1)
        ]

    def test_rejects_duplicate_feature_id(self) -> None:
        dataset = semantic_fixture()
        duplicate = replace(dataset.boundaries[1], feature_id=dataset.boundaries[0].feature_id)
        invalid = replace(dataset, boundaries=(dataset.boundaries[0], duplicate, *dataset.boundaries[2:]))
        with self.assertRaisesRegex(MapImportError, "feature ID 重复"):
            audit_semantic_records(invalid, self._locations(), (0, 0, 14, 4))

    def test_rejects_dangling_membership_title(self) -> None:
        dataset = semantic_fixture()
        dangling = replace(dataset.memberships[0], county_id="c_missing")
        invalid = replace(dataset, memberships=(dangling, *dataset.memberships[1:]))
        with self.assertRaisesRegex(MapImportError, "membership 引用不存在：county:c_missing"):
            audit_semantic_records(invalid, self._locations(), (0, 0, 14, 4))

    def test_rejects_label_anchor_outside_boundary(self) -> None:
        dataset = semantic_fixture()
        outside = replace(dataset.titles[0], anchor=Point(20, 20))
        invalid = replace(dataset, titles=(outside, *dataset.titles[1:]))
        with self.assertRaisesRegex(MapImportError, "标题中心不在边界内"):
            audit_semantic_records(invalid, self._locations(), (0, 0, 14, 4))

    def test_rejects_missing_visible_rank(self) -> None:
        dataset = semantic_fixture()
        invalid = replace(
            dataset,
            boundaries=tuple(boundary for boundary in dataset.boundaries if boundary.rank != "county"),
        )
        with self.assertRaisesRegex(MapImportError, "缺少 county 层"):
            audit_semantic_records(invalid, self._locations(), (0, 0, 14, 4))


class TileBuilderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="agot-map-", dir=FAST_TMP_ROOT)
        self.root = Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_builds_single_local_webp_terrain_tile_at_zoom_zero(self) -> None:
        flatmap = Image.new("RGB", (1024, 512), (38, 62, 45))
        report = build_terrain_tiles(flatmap, (0, 0, 1024, 512), self.root / "terrain", (0,))
        tile = self.root / "terrain" / "0" / "0" / "0.webp"
        self.assertEqual(report.tile_count, 1)
        self.assertTrue(tile.is_file())
        with Image.open(tile) as rendered:
            self.assertEqual(rendered.size, (512, 512))
            self.assertEqual(rendered.format, "WEBP")

    def test_vector_tile_contains_all_runtime_layers(self) -> None:
        layer_names = ("provinces", "borders", "roads", "routes", "locations", "labels")
        layers = {
            name: [{
                "id": index + 1,
                "geometry": mapping(box(100 + index, 100, 120 + index, 120)),
                "properties": {"name": name},
            }]
            for index, name in enumerate(layer_names)
        }
        report = build_vector_tiles(layers, (0, 0, 1024, 512), self.root / "vector", (0,))
        tile = self.root / "vector" / "0" / "0" / "0.pbf"
        decoded = mapbox_vector_tile.decode(tile.read_bytes(), default_options={"y_coord_down": True})
        self.assertEqual(report.tile_count, 1)
        self.assertEqual(set(decoded), set(layer_names))
        self.assertTrue(all(decoded[name]["extent"] == 4096 for name in layer_names))

    def test_semantic_tiles_only_encode_ranks_visible_within_each_integer_zoom(self) -> None:
        report = build_semantic_tiles(
            semantic_fixture(), (0, 0, 14, 4), self.root / "semantic", (0, 1, 2, 3), tile_size=512,
        )
        expected_ranks = {
            0: {"hegemon", "empire"},
            1: {"empire", "kingdom"},
            2: {"kingdom", "duchy", "county"},
            3: {"county"},
        }
        for zoom, ranks in expected_ranks.items():
            seen_layers: set[str] = set()
            seen_label_ranks: set[str] = set()
            for tile in (self.root / "semantic" / str(zoom)).rglob("*.pbf"):
                decoded = mapbox_vector_tile.decode(tile.read_bytes(), default_options={"y_coord_down": True})
                seen_layers.update(decoded)
                seen_label_ranks.update(
                    feature["properties"]["rank"]
                    for feature in decoded.get("title_labels", {}).get("features", [])
                )
                for layer_name, layer in decoded.items():
                    for feature in layer["features"]:
                        properties = feature["properties"]
                        if layer_name.endswith("_surfaces") or layer_name == "title_labels":
                            for key in ("titleId", "rank", "name", "regionId", "titleColor"):
                                self.assertIn(key, properties, f"{layer_name} 缺少 {key}")
                            self.assertRegex(properties["titleColor"], r"^#[0-9a-f]{6}$")
                        if layer_name.endswith("_surfaces"):
                            self.assertIn(feature["geometry"]["type"], {"Polygon", "MultiPolygon"})
                        elif layer_name.endswith("_boundaries"):
                            self.assertIn(feature["geometry"]["type"], {"LineString", "MultiLineString"})
                            if layer_name == "county_boundaries":
                                self.assertIn("titleId", properties)
                self.assertNotIn("barony_boundaries", decoded)
                self.assertNotIn("barony_surfaces", decoded)
            expected_layers = {
                f"{rank}_{geometry_kind}"
                for rank in ranks
                for geometry_kind in ("surfaces", "boundaries")
            } | {"title_labels"}
            self.assertEqual(seen_layers, expected_layers)
            self.assertEqual(seen_label_ranks, ranks)
        self.assertEqual(report.kind, "semantic")

    def test_terrain_rgb_formula_is_reversible_with_point_one_precision(self) -> None:
        heights = np.asarray([[0.0, 100.0, 1000.0]], dtype=np.float64)
        encoded = encode_terrain_rgb(heights)
        packed = (
            encoded[:, :, 0].astype(np.uint32) * 65536
            + encoded[:, :, 1].astype(np.uint32) * 256
            + encoded[:, :, 2].astype(np.uint32)
        )
        decoded = -10000 + packed * 0.1
        np.testing.assert_allclose(decoded, heights, atol=0.1)

    def test_adjacent_dem_tiles_share_the_same_world_edge(self) -> None:
        output = self.root / "seamless-dem"
        y, x = np.mgrid[0:128, 0:128]
        height = np.clip(
            x * 180 + y * 80 + np.sin(x / 13) * 3500 + np.cos(y / 17) * 2600 + 8000,
            0,
            65535,
        ).astype(np.uint16)
        build_dem_tiles(
            Image.fromarray(height), (0, 0, 128, 128), output, (1,), tile_size=128,
        )

        def decode(path: Path) -> np.ndarray:
            with Image.open(path) as rendered:
                rgb = np.asarray(rendered, dtype=np.uint32)
            packed = rgb[..., 0] * 65536 + rgb[..., 1] * 256 + rgb[..., 2]
            return -10000 + packed * 0.1

        left = decode(output / "1/0/0.png")
        right = decode(output / "1/1/0.png")
        seam = np.abs(left[:, -1] - right[:, 0])
        nearby = np.concatenate((
            np.abs(left[:, -1] - left[:, -2]),
            np.abs(right[:, 1] - right[:, 0]),
        ))
        self.assertLessEqual(float(np.percentile(seam, 99)), float(np.percentile(nearby, 99)) + 0.2)

    def test_dem_flattens_masked_ocean_height_before_encoding(self) -> None:
        output = self.root / "flat-water-dem"
        heightmap = Image.fromarray(np.tile(
            np.asarray([0, 1000, 2000, 3000], dtype=np.uint16),
            (4, 1),
        ))
        ocean_mask = Image.new("L", (4, 4), 0)
        build_dem_tiles(
            heightmap,
            (0, 0, 4, 4),
            output,
            (0,),
            tile_size=16,
            min_elevation=0,
            max_elevation=1000,
            land_mask=ocean_mask,
        )
        with Image.open(output / "0/0/0.png") as rendered:
            encoded = np.asarray(rendered, dtype=np.uint32)
        packed = encoded[..., 0] * 65536 + encoded[..., 1] * 256 + encoded[..., 2]
        decoded = -10000 + packed * 0.1
        self.assertLessEqual(float(decoded.max() - decoded.min()), 0.1)

    def test_builds_dem_png_and_atomically_removes_stale_tiles(self) -> None:
        output = self.root / "dem"
        output.mkdir()
        (output / "stale.png").write_bytes(b"stale")
        heightmap = Image.fromarray(np.asarray([[0, 65535], [32768, 16384]], dtype=np.uint16))
        report = build_dem_tiles(
            heightmap,
            (0, 0, 2, 2),
            output,
            (0,),
            tile_size=16,
            min_elevation=0,
            max_elevation=1000,
        )
        tile = output / "0" / "0" / "0.png"
        self.assertEqual(report.tile_count, 1)
        self.assertTrue(tile.is_file())
        self.assertFalse((output / "stale.png").exists())
        with Image.open(tile) as rendered:
            self.assertEqual(rendered.mode, "RGB")
            self.assertEqual(rendered.size, (16, 16))


class MapWriterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="agot-map-", dir=FAST_TMP_ROOT)
        self.root = Path(self.temp_dir.name)
        route_tests = RouteGraphTests()
        route_tests.setUp()
        self.locations = route_tests.locations
        self.graph = build_route_graph(
            self.locations,
            route_tests.geometries,
            [{"From": "1", "To": "3", "Type": "sea", "Through": "-1"}],
            route_tests.road_mask,
            route_tests.rivers,
            set(),
        )
        self.semantic = semantic_fixture(tuple(location.id for location in self.locations))
        self.semantic_tiles = self.root / "semantic-tiles"
        build_semantic_tiles(self.semantic, (0, 0, 14, 4), self.semantic_tiles, (0,))

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _write(self, output: Path):
        return write_map_dataset(
            output=output,
            locations=self.locations,
            route_graph=self.graph,
            regions=[{"id": "world_westeros", "name": "维斯特洛", "provinceCount": 3}],
            political=[{"baronyId": location.id, "provinceId": location.province_id} for location in self.locations],
            source_hashes={"map_data/provinces.png": "a" * 64},
            map_size=(9216, 6144),
            westeros_bounds=(0, 0, 14, 4),
            tile_counts={"terrain": 1, "terrainLight": 1, "vector": 1, "dem": 1, "semantic": 1},
            semantic=self.semantic,
            semantic_tile_root=self.semantic_tiles,
            min_zoom=0,
            max_zoom=6,
        )

    def test_writes_deterministic_manifest_shards_and_search_index(self) -> None:
        first = self._write(self.root / "first")
        second = self._write(self.root / "second")
        self.assertEqual(first["datasetHash"], second["datasetHash"])
        self.assertEqual(first["sourceId"], "2962333032")
        self.assertEqual(first["counts"]["locations"], 3)
        self.assertTrue((self.root / "first/locations/world_westeros.json").is_file())
        search = json.loads((self.root / "first/location-search-index.json").read_text())
        self.assertEqual([entry["id"] for entry in search], ["b_one", "b_three", "b_two"])
        serialized = json.dumps(first, ensure_ascii=False)
        self.assertNotIn("/mnt/c/agot/2962333032", serialized)
        self.assertNotIn("http://", serialized)

        self.assertEqual(first["schemaVersion"], 4)
        self.assertEqual(first["paths"]["semantic"], "/assets/agot-map/semantic/{z}/{x}/{y}.pbf")
        self.assertEqual(first["paths"]["terrainLight"], "/assets/agot-map/terrain-light/{z}/{x}/{y}.webp")
        self.assertEqual(first["counts"]["terrainLightTiles"], 1)
        self.assertEqual(first["counts"]["semanticHegemons"], 1)
        self.assertEqual(first["counts"]["semanticEmpires"], 1)
        self.assertEqual(first["counts"]["semanticKingdoms"], 1)
        self.assertEqual(first["counts"]["semanticDuchies"], 1)
        self.assertEqual(first["counts"]["semanticCounties"], 1)
        self.assertEqual(first["counts"]["semanticLabels"], 5)
        self.assertRegex(first["semanticHash"], r"^[a-f0-9]{64}$")
        self.assertTrue((self.root / "first/semantic/titles.json").is_file())
        self.assertTrue((self.root / "first/semantic/membership.json").is_file())

    def test_omits_missing_optional_semantic_ancestors(self) -> None:
        first_membership = replace(
            self.semantic.memberships[0], kingdom_id=None, empire_id=None, hegemon_id=None,
        )
        self.semantic = replace(
            self.semantic, memberships=(first_membership, *self.semantic.memberships[1:]),
        )
        self._write(self.root / "optional-ancestors")
        memberships = json.loads(
            (self.root / "optional-ancestors/semantic/membership.json").read_text(encoding="utf-8"),
        )
        first = next(item for item in memberships if item["locationId"] == first_membership.location_id)
        self.assertNotIn("kingdomId", first)
        self.assertNotIn("empireId", first)
        self.assertNotIn("hegemonId", first)

    def test_audit_rejects_dangling_route_and_preserves_previous_output(self) -> None:
        output = self.root / "published"
        output.mkdir()
        (output / "marker.txt").write_text("old", encoding="utf-8")
        broken_edge = replace(self.graph.edges[0], to_id="b_missing")
        broken_graph = replace(self.graph, edges=(broken_edge,) + self.graph.edges[1:])
        with self.assertRaisesRegex(MapImportError, "路线端点"):
            audit_map_records(self.locations, broken_graph, (9216, 6144), (0, 0, 14, 4))
        self.assertEqual((output / "marker.txt").read_text(encoding="utf-8"), "old")


    def test_pair_publication_restores_both_previous_roots_when_asset_swap_fails(self) -> None:
        data_output, asset_output = self.root / "published-data", self.root / "published-assets"
        data_output.mkdir(); asset_output.mkdir()
        (data_output / "marker.txt").write_text("old-data")
        (asset_output / "marker.txt").write_text("old-assets")
        data_stage, asset_stage = self.root / "new-data", self.root / "new-assets"
        data_stage.mkdir(); asset_stage.mkdir()
        (data_stage / "marker.txt").write_text("new-data")
        (asset_stage / "marker.txt").write_text("new-assets")
        real_replace = os.replace

        def fail_asset_swap(source, target):
            if Path(source) == asset_stage:
                raise OSError("asset swap failed")
            return real_replace(source, target)

        with mock.patch("scripts.agot_map_import.writer.os.replace", side_effect=fail_asset_swap):
            with self.assertRaisesRegex(OSError, "asset swap failed"):
                publish_map_pair(data_stage, data_output, asset_stage, asset_output)
        self.assertEqual((data_output / "marker.txt").read_text(), "old-data")
        self.assertEqual((asset_output / "marker.txt").read_text(), "old-assets")


class MapCliTests(unittest.TestCase):
    def test_fixture_cli_writes_complete_data_without_tiles(self) -> None:
        with tempfile.TemporaryDirectory(prefix="agot-map-", dir=FAST_TMP_ROOT) as directory:
            root = Path(directory)
            source = root / "2962333032"
            shutil.copytree(FIXTURE_ROOT, source)
            map_data = source / "map_data"
            provinces = Image.new("RGB", (12, 6), (10, 20, 30))
            for x in range(4, 8):
                for y in range(6):
                    provinces.putpixel((x, y), (40, 50, 60))
            for x in range(8, 12):
                for y in range(6):
                    provinces.putpixel((x, y), (100, 110, 120))
            provinces.save(map_data / "provinces.png")
            Image.new("I;16", (12, 6), 32000).save(map_data / "heightmap.png")
            Image.new("P", (12, 6), 254).save(map_data / "rivers.png")
            Image.new("RGBA", (12, 6), (255, 255, 255, 255)).save(map_data / "mask-baronyroad.png")
            terrain = source / "gfx" / "map" / "terrain"
            terrain.mkdir(parents=True, exist_ok=True)
            Image.new("RGBA", (12, 6), (0, 0, 0, 0)).save(terrain / "detail_index.tga")
            Image.new("RGBA", (12, 6), (255, 0, 0, 0)).save(terrain / "detail_intensity.tga")
            (terrain / "materials.settings").write_text(
                '{ { id = "plains" diffuse = "plains.dds" } }', encoding="utf-8",
            )
            data_output = root / "data"
            asset_output = root / "assets"
            with mock.patch(
                "scripts.agot_map_import.cli._load_hegemon_scopes",
                return_value={"h_test": ["e_test"]},
            ):
                result = map_import_main([
                    "--source", str(source),
                    "--data-output", str(data_output),
                    "--asset-output", str(asset_output),
                    "--expected-size", "12", "6",
                    "--max-vector-zoom", "0",
                    "--skip-tiles",
                ])
            self.assertEqual(result, 0)
            manifest = json.loads((data_output / "manifest.json").read_text())
            self.assertEqual(manifest["counts"]["locations"], 3)
            self.assertEqual(manifest["schemaVersion"], 4)
            self.assertEqual(manifest["counts"]["terrainTiles"], 0)
            self.assertEqual(manifest["counts"]["terrainLightTiles"], 0)
            self.assertEqual(manifest["counts"]["materialTerrainTiles"], 0)
            self.assertEqual(manifest["counts"]["semanticTiles"], 0)
            self.assertGreater(manifest["counts"]["semanticCounties"], 0)
            self.assertTrue((data_output / "semantic/titles.json").is_file())
            self.assertTrue((data_output / "reports/semantic.json").is_file())
            self.assertTrue((data_output / "reports/audit.json").is_file())
            # Essos location shard should exist alongside Westeros shards
            location_files = list((data_output / "locations").iterdir())
            location_shard_ids = {f.stem for f in location_files}
            self.assertIn("the_north", location_shard_ids)
            self.assertIn("world_essos_free_cities", location_shard_ids)
            # Essos barony should have hegemonId absent (no iron throne)
            membership = json.loads((data_output / "semantic/membership.json").read_text())
            essos_membership = [m for m in membership if m.get("regionId") == "world_essos_free_cities"]
            self.assertTrue(len(essos_membership) >= 1)
            for m in essos_membership:
                self.assertNotIn("hegemonId", m)
                self.assertEqual(m["empireId"], "e_essos_test")
            # westerosBounds should always be present (describes tile extent)
            bounds = manifest["westerosBounds"]
            self.assertGreater(bounds["maxX"], bounds["minX"])
            self.assertGreater(bounds["maxY"], bounds["minY"])


class TerrainLightingTests(unittest.TestCase):
    def test_overlay_is_transparent_on_flat_ground_and_directional_on_relief(self) -> None:
        flat = np.zeros((64, 64), dtype=np.uint16)
        flat_overlay = terrain_light_overlay(Image.fromarray(flat), (0, 0, 64, 64))
        self.assertEqual(int(np.asarray(flat_overlay)[..., 3].max()), 0)

        height = np.zeros((96, 96), dtype=np.uint16)
        height[:, 36:60] = np.linspace(0, 65535, 24, dtype=np.uint16)[None, :]
        overlay = terrain_light_overlay(Image.fromarray(height), (0, 0, 96, 96))
        rgba = np.asarray(overlay)
        self.assertGreater(int(rgba[..., 3].max()), 80)
        self.assertGreater(len(np.unique(rgba[..., :3].reshape(-1, 3), axis=0)), 1)

    def test_overlay_suppresses_high_frequency_height_noise_and_uses_neutral_highlight(self) -> None:
        y, x = np.mgrid[0:128, 0:128]
        noisy = (30000 + ((x + y) % 2) * 300).astype(np.uint16)
        overlay = np.asarray(terrain_light_overlay(
            Image.fromarray(noisy), (0, 0, 128, 128),
        ))
        interior_alpha = overlay[16:-16, 16:-16, 3]
        self.assertLessEqual(int(interior_alpha.max()), 12)
        visible = overlay[..., 3] > 0
        if np.any(visible):
            visible_rgb = overlay[..., :3][visible].astype(np.int16)
            self.assertLessEqual(int(np.max(visible_rgb[:, 0] - visible_rgb[:, 2])), 48)

    def test_overlay_masks_water_relief_without_hiding_land_relief(self) -> None:
        height = np.zeros((64, 64), dtype=np.uint16)
        height[:, 16:48] = np.linspace(0, 65535, 32, dtype=np.uint16)[None, :]
        land_mask = np.full((64, 64), 255, dtype=np.uint8)
        land_mask[:, :32] = 0

        overlay = terrain_light_overlay(
            Image.fromarray(height),
            (0, 0, 64, 64),
            land_mask=Image.fromarray(land_mask),
        )
        alpha = np.asarray(overlay)[..., 3]
        self.assertEqual(int(alpha[:, :32].max()), 0)
        self.assertGreater(int(alpha[:, 32:].max()), 80)

    def test_adjacent_tiles_sample_one_global_overlay_without_visible_seam(self) -> None:
        with tempfile.TemporaryDirectory(prefix="agot-light-seam-", dir=FAST_TMP_ROOT) as folder:
            y, x = np.mgrid[0:128, 0:128]
            height = np.clip(
                x * 180 + y * 80 + np.sin(x / 13) * 3500 + np.cos(y / 17) * 2600 + 8000,
                0,
                65535,
            ).astype(np.uint16)
            output = Path(folder) / "tiles"
            build_terrain_light_tiles(
                Image.fromarray(height), (0, 0, 128, 128), output, (1,), 128,
            )
            left = np.asarray(Image.open(output / "1/0/0.webp").convert("RGBA"), dtype=np.int16)
            right = np.asarray(Image.open(output / "1/1/0.webp").convert("RGBA"), dtype=np.int16)
            seam = np.abs(left[:, -1] - right[:, 0])
            nearby = np.concatenate((
                np.abs(left[:, -1] - left[:, -2]),
                np.abs(right[:, 1] - right[:, 0]),
            ))
            self.assertLessEqual(float(np.percentile(seam, 99)), float(np.percentile(nearby, 99)) + 8)

    def test_builder_writes_transparent_webp_tiles(self) -> None:
        with tempfile.TemporaryDirectory(prefix="agot-light-", dir=FAST_TMP_ROOT) as folder:
            source = Path(folder) / "height.png"
            output = Path(folder) / "tiles"
            values = np.tile(np.linspace(0, 65535, 64, dtype=np.uint16), (64, 1))
            Image.fromarray(values).save(source)
            report = build_terrain_light_tiles(source, (0, 0, 64, 64), output, (0, 1), 32)
            self.assertEqual(report.tile_count, 5)
            with Image.open(output / "0/0/0.webp") as tile:
                self.assertEqual(tile.mode, "RGBA")
                self.assertGreater(tile.getchannel("A").getextrema()[1], 0)


if __name__ == "__main__":
    unittest.main()
