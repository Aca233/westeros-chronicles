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
from scripts.agot_map_import.audit import audit_map_records, audit_semantic_records
from scripts.agot_map_import.geometry import extract_province_geometry
from scripts.agot_map_import.locations import build_locations
from scripts.agot_map_import.models import (
    MapImportError, MapLocationRecord, ProvinceGeometry, RegionDefinition,
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
from scripts.agot_map_import.cli import main as map_import_main


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
                "b_winterfell": TitleAncestors(None if countyless else "c_winterfell", "d_winterfell", "k_westeros"),
                "b_kings_landing": TitleAncestors("c_kings_landing", "d_kings_landing", "k_westeros"),
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
            {"the_north": "k_the_north", "the_crownlands": "k_the_crownlands"},
        )

    def test_builds_three_visible_ranks_internal_barony_key_and_membership(self) -> None:
        dataset = self._dataset()
        self.assertEqual([boundary.rank for boundary in dataset.boundaries].count("realm"), 2)
        self.assertEqual([boundary.rank for boundary in dataset.boundaries].count("duchy"), 2)
        self.assertEqual([boundary.rank for boundary in dataset.boundaries].count("county"), 2)
        self.assertNotIn("barony", {boundary.rank for boundary in dataset.boundaries})
        self.assertEqual([title.feature_id for title in dataset.titles], list(range(1, 7)))
        self.assertTrue(all(title.geometry.covers(title.anchor) for title in dataset.titles))
        winterfell = next(item for item in dataset.memberships if item.location_id == "b_winterfell")
        self.assertEqual(
            (winterfell.realm_id, winterfell.duchy_id, winterfell.county_id, winterfell.barony_id),
            ("the_north", "d_winterfell", "c_winterfell", "b_winterfell"),
        )

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
    ranks = (("realm", "the_fixture", 100), ("duchy", "d_fixture", 80), ("county", "c_fixture", 60))
    boundaries = tuple(
        SemanticBoundaryRecord(index, title_id, rank, f"{title_id}中文", "the_fixture", None, geometry)
        for index, (rank, title_id, _importance) in enumerate(ranks, 1)
    )
    titles = tuple(
        SemanticTitleRecord(
            index, title_id, rank, f"{title_id}中文", 7.0, 2.0, importance,
            "the_fixture", None, geometry, anchor,
        )
        for index, (rank, title_id, importance) in enumerate(ranks, 1)
    )
    memberships = tuple(
        SemanticMembershipRecord(location_id, location_id, "c_fixture", "d_fixture", "the_fixture")
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

    def test_semantic_tile_contains_only_three_visible_ranks_and_title_labels(self) -> None:
        report = build_semantic_tiles(
            semantic_fixture(), (0, 0, 14, 4), self.root / "semantic", (0,), tile_size=512,
        )
        tile = self.root / "semantic/0/0/0.pbf"
        decoded = mapbox_vector_tile.decode(tile.read_bytes(), default_options={"y_coord_down": True})
        self.assertEqual(set(decoded), {
            "realm_boundaries", "duchy_boundaries", "county_boundaries", "title_labels",
        })
        self.assertNotIn("barony_boundaries", decoded)
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
            tile_counts={"terrain": 1, "vector": 1, "dem": 1, "semantic": 1},
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

        self.assertEqual(first["schemaVersion"], 2)
        self.assertEqual(first["paths"]["semantic"], "/assets/agot-map/semantic/{z}/{x}/{y}.pbf")
        self.assertEqual(first["counts"]["semanticRealms"], 1)
        self.assertEqual(first["counts"]["semanticDuchies"], 1)
        self.assertEqual(first["counts"]["semanticCounties"], 1)
        self.assertEqual(first["counts"]["semanticLabels"], 3)
        self.assertRegex(first["semanticHash"], r"^[a-f0-9]{64}$")
        self.assertTrue((self.root / "first/semantic/titles.json").is_file())
        self.assertTrue((self.root / "first/semantic/membership.json").is_file())

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
            provinces = Image.new("RGB", (8, 6), (10, 20, 30))
            for x in range(4, 8):
                for y in range(6):
                    provinces.putpixel((x, y), (40, 50, 60))
            provinces.save(map_data / "provinces.png")
            Image.new("I;16", (8, 6), 32000).save(map_data / "heightmap.png")
            Image.new("P", (8, 6), 254).save(map_data / "rivers.png")
            Image.new("RGBA", (8, 6), (255, 255, 255, 255)).save(map_data / "mask-baronyroad.png")
            data_output = root / "data"
            asset_output = root / "assets"
            result = map_import_main([
                "--source", str(source),
                "--data-output", str(data_output),
                "--asset-output", str(asset_output),
                "--expected-size", "8", "6",
                "--max-vector-zoom", "0",
                "--skip-tiles",
            ])
            self.assertEqual(result, 0)
            manifest = json.loads((data_output / "manifest.json").read_text())
            self.assertEqual(manifest["counts"]["locations"], 2)
            self.assertEqual(manifest["schemaVersion"], 2)
            self.assertEqual(manifest["counts"]["terrainTiles"], 0)
            self.assertEqual(manifest["counts"]["semanticTiles"], 0)
            self.assertGreater(manifest["counts"]["semanticCounties"], 0)
            self.assertTrue((data_output / "semantic/titles.json").is_file())
            self.assertTrue((data_output / "reports/semantic.json").is_file())
            self.assertTrue((data_output / "reports/audit.json").is_file())


if __name__ == "__main__":
    unittest.main()
