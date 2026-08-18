from __future__ import annotations

import shutil
import tempfile
import unittest
import os
from pathlib import Path

from PIL import Image

from scripts.agot_map_import.geometry import extract_province_geometry
from scripts.agot_map_import.locations import build_locations
from scripts.agot_map_import.models import MapImportError
from scripts.agot_map_import.regions import expand_region, parse_regions
from scripts.agot_map_import.source import MapSource, parse_definition
from scripts.agot_map_import.titles import parse_title_hierarchy


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

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_opens_verified_agot_source(self) -> None:
        source = MapSource.open(self.root, expected_size=(8, 6))
        self.assertEqual(source.source_id, "2962333032")
        self.assertEqual(source.map_size, (8, 6))
        self.assertEqual(source.default_files["provinces"].name, "provinces.png")

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

    def test_definition_requires_unique_ids_and_colours(self) -> None:
        definitions = parse_definition(self.root / "map_data" / "definition.csv")
        self.assertEqual(definitions[1].name, "b_winterfell")
        self.assertEqual(definitions[1].rgb, (10, 20, 30))
        duplicate = self.root / "map_data" / "duplicate.csv"
        duplicate.write_text("1;10;20;30;b_one;x\n2;10;20;30;b_two;x\n")
        with self.assertRaisesRegex(MapImportError, "颜色重复"):
            parse_definition(duplicate)


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

    def test_override_cannot_change_stable_location_id(self) -> None:
        with self.assertRaisesRegex(MapImportError, "稳定 ID"):
            build_locations(
                self.geometries,
                self.titles,
                {},
                {"b_winterfell": {"id": "b_fake_winterfell"}},
            )


if __name__ == "__main__":
    unittest.main()
