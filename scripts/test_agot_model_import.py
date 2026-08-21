from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path

from scripts.agot_model_import.asset_parser import parse_asset
from scripts.agot_model_import.cli import LOD_TEXTURE_EDGE_CANDIDATES
from scripts.agot_model_import.catalog import load_catalog, validate_source_root
from scripts.agot_model_import.mesh_adapter import normalize_pdx_json, simplify_primitive
from scripts.agot_model_import.gltf_writer import compact_primitive, inspect_glb, write_glb
from scripts.agot_model_import.locators import parse_locators, resolve_transform, sample_elevation
from scripts.agot_model_import.placement import audit_landmark_placement
from scripts.agot_model_import.textures import convert_texture, pack_properties
from scripts.agot_map_import.dem import height_value_to_elevation
from scripts.agot_model_import.models import Correction, MeshPrimitive, ModelImportError

FIXTURES = Path(__file__).parent / "fixtures" / "agot-models"


class CatalogTests(unittest.TestCase):
    def test_accepts_only_exact_twelve_unique_entries(self) -> None:
        catalog = load_catalog(FIXTURES / "catalog-valid.json")
        self.assertEqual(len(catalog.landmarks), 12)
        self.assertEqual(catalog.landmarks[0].location_id, "b_winterfell")
        self.assertEqual(catalog.landmarks[-1].variant, "ruined")

    def test_rejects_path_escape_duplicate_location_and_unexplained_correction(self) -> None:
        for fixture, message in [
            ("catalog-path-escape.json", "相对路径"),
            ("catalog-duplicate.json", "重复"),
            ("catalog-unexplained-correction.json", "reason"),
        ]:
            with self.subTest(fixture=fixture):
                with self.assertRaisesRegex(ModelImportError, message):
                    load_catalog(FIXTURES / fixture)

    def test_release_catalog_contains_only_documented_sunspear_correction(self) -> None:
        catalog = load_catalog(Path("scripts/agot_model_import/landmark_models.json"))
        corrected = [entry for entry in catalog.landmarks if entry.corrections is not None]
        self.assertEqual([entry.id for entry in corrected], ["sunspear"])
        correction = corrected[0].corrections
        assert correction is not None
        self.assertEqual(correction.position_offset, (8.0, 0.0, 9.0))
        self.assertEqual(correction.scale_multiplier, (0.55, 0.55, 0.55))
        self.assertIn("影子城", correction.reason)
        self.assertIn("海域", correction.reason)

    def test_validates_source_identity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "descriptor.mod").write_text('name="A Game of Thrones"\nremote_file_id="2962333032"\n')
            validate_source_root(root)
            (root / "descriptor.mod").write_text('remote_file_id="123"\n')
            with self.assertRaisesRegex(ModelImportError, "2962333032"):
                validate_source_root(root)


def fixture_materials():
    return parse_asset(FIXTURES / "multi-material.asset").materials


class AssetAndMeshTests(unittest.TestCase):
    def test_asset_preserves_scale_material_order_and_three_texture_roles(self) -> None:
        asset = parse_asset(FIXTURES / "multi-material.asset")
        self.assertEqual(asset.scale, 0.5)
        self.assertEqual([item.name for item in asset.materials], ["wallsShape", "roofShape"])
        self.assertEqual(asset.materials[0].textures.properties.name, "walls_properties.dds")
        self.assertEqual(asset.mesh_path.name, "fixture.mesh")

    def test_normalizer_requires_all_static_vertex_attributes(self) -> None:
        payload = json.loads((FIXTURES / "static-mesh.json").read_text())
        mesh = normalize_pdx_json(payload, fixture_materials())
        self.assertEqual(mesh.primitives[0].indices, (0, 1, 2))
        self.assertEqual(mesh.primitives[0].material_name, "wallsShape")
        for field in ("p", "n", "ta", "u0", "tri"):
            broken = copy.deepcopy(payload)
            del broken["object"]["wallsShape"]["mesh"][field]
            with self.subTest(field=field):
                with self.assertRaises(ModelImportError):
                    normalize_pdx_json(broken, fixture_materials())

    def test_normalizer_rejects_skinning_non_finite_and_bad_indices(self) -> None:
        payload = json.loads((FIXTURES / "static-mesh.json").read_text())
        for mutate in (
            lambda value: value.update({"skeleton": {}}),
            lambda value: value["object"]["wallsShape"]["mesh"]["p"].__setitem__(0, float("nan")),
            lambda value: value["object"]["wallsShape"]["mesh"]["tri"].__setitem__(2, 9),
        ):
            broken = copy.deepcopy(payload)
            mutate(broken)
            with self.assertRaises(ModelImportError):
                normalize_pdx_json(broken, fixture_materials())


def entry_for(province_id: int):
    return next(item for item in load_catalog(FIXTURES / "catalog-valid.json").landmarks if item.province_id == province_id)


class LocatorTests(unittest.TestCase):
    def test_flips_locator_z_and_preserves_y_quaternion_and_scale(self) -> None:
        locators = parse_locators(FIXTURES / "special_building_locators.txt")
        transform = resolve_transform(entry_for(77), locators[77], 6144, FIXTURES / "heightmap.png")
        self.assertAlmostEqual(transform.map_x, 1358.390869)
        self.assertAlmostEqual(transform.map_y, 1455.082520)
        self.assertAlmostEqual(transform.rotation[1], 0.008655, places=5)
        self.assertAlmostEqual(transform.scale[0], 0.150777)
        self.assertAlmostEqual(transform.elevation_meters, float(height_value_to_elevation(16384)) + 0.053711, places=3)

    def test_applies_documented_position_and_scale_correction(self) -> None:
        locators = parse_locators(FIXTURES / "special_building_locators.txt")
        entry = copy.copy(entry_for(77))
        entry = type(entry)(
            entry.id, entry.name, entry.location_id, entry.province_id, entry.asset, entry.variant,
            Correction((-4.0, 0.0, 12.0), (0.0, 0.0, 0.0, 1.0), (0.55, 0.55, 0.55), "测试修正"),
        )
        transform = resolve_transform(entry, locators[77], 6144, FIXTURES / "heightmap.png")
        self.assertAlmostEqual(transform.map_x, 1354.390869)
        self.assertAlmostEqual(transform.map_y, 1443.082520)
        self.assertAlmostEqual(transform.scale[0], 0.150777 * 0.55)
        self.assertAlmostEqual(transform.scale[1], 0.150777 * 0.55)
        self.assertAlmostEqual(transform.scale[2], 0.150777 * 0.55)

    def test_height_uses_same_dem_formula_and_bilinear_sampling(self) -> None:
        self.assertAlmostEqual(float(height_value_to_elevation(0)), -500.0)
        self.assertAlmostEqual(float(height_value_to_elevation(65535)), 8000.0)
        self.assertAlmostEqual(sample_elevation(FIXTURES / "heightmap-small.png", 0.5, 0.5), 3218.774319, places=3)

    def test_rejects_duplicate_locator_and_out_of_bounds_transform(self) -> None:
        source = (FIXTURES / "special_building_locators.txt").read_text()
        with tempfile.TemporaryDirectory() as directory:
            duplicate = Path(directory) / "duplicate.txt"
            duplicate.write_text(source.replace("id=4415", "id=77"))
            with self.assertRaisesRegex(ModelImportError, "重复"):
                parse_locators(duplicate)
        locators = parse_locators(FIXTURES / "special_building_locators.txt")
        with self.assertRaisesRegex(ModelImportError, "范围"):
            resolve_transform(entry_for(4415), locators[4415], 0, FIXTURES / "heightmap.png")


class PlacementAuditTests(unittest.TestCase):
    def test_reports_anchor_province_land_and_declared_province_coverage(self) -> None:
        province_ids = __import__("numpy").array([
            [1, 1, 9, 9],
            [1, 1, 9, 9],
            [2, 2, 9, 9],
            [2, 2, 9, 9],
        ], dtype="int32")
        positions = ((-0.4, 0.0, -0.4), (0.4, 0.0, -0.4), (-0.4, 0.0, 0.4), (0.4, 0.0, 0.4))
        record = {
            "provinceId": 1,
            "transform": {
                "mapX": 1.0, "mapY": 1.0, "elevationMeters": 0.0,
                "rotation": [0.0, 0.0, 0.0, 1.0], "scale": [1.0, 1.0, 1.0],
            },
        }
        placement = audit_landmark_placement(record, positions, province_ids, frozenset({9}))
        self.assertEqual(placement["anchorProvinceId"], 1)
        self.assertTrue(placement["anchorMatchesProvince"])
        self.assertEqual(placement["sampleCount"], 4)
        self.assertAlmostEqual(placement["expectedProvinceCoverage"], 1.0)
        self.assertAlmostEqual(placement["landCoverage"], 1.0)
        self.assertAlmostEqual(placement["inBoundsCoverage"], 1.0)

    def test_rejects_wrong_anchor_or_low_land_coverage(self) -> None:
        province_ids = __import__("numpy").array([[9, 9], [9, 1]], dtype="int32")
        positions = ((0.0, 0.0, 0.0),) * 4
        record = {
            "provinceId": 1,
            "transform": {
                "mapX": 0.0, "mapY": 0.0, "elevationMeters": 0.0,
                "rotation": [0.0, 0.0, 0.0, 1.0], "scale": [1.0, 1.0, 1.0],
            },
        }
        with self.assertRaisesRegex(ModelImportError, "锚点省份"):
            audit_landmark_placement(record, positions, province_ids, frozenset({9}))


class TextureAndGlbTests(unittest.TestCase):
    def test_compacts_unreferenced_lod_vertices_without_losing_attributes(self) -> None:
        primitive = MeshPrimitive(
            name="compact",
            positions=((0, 0, 0), (1, 0, 0), (0, 1, 0), (99, 99, 99)),
            normals=((0, 0, 1),) * 4,
            tangents=((1, 0, 0, 1),) * 4,
            uv0=((0, 0), (1, 0), (0, 1), (1, 1)),
            indices=(0, 1, 2),
            material_name="wallsShape",
        )
        compacted = compact_primitive(primitive)
        self.assertEqual(len(compacted.positions), 3)
        self.assertEqual(compacted.indices, (0, 1, 2))
        self.assertEqual(compacted.uv0, ((0, 0), (1, 0), (0, 1)))

    def test_properties_channels_are_repacked_to_gltf_orm(self) -> None:
        texture = pack_properties(FIXTURES / "properties.png", 1024)
        from io import BytesIO
        from PIL import Image
        with Image.open(BytesIO(texture.data)) as image:
            self.assertEqual(image.convert("RGBA").getpixel((0, 0)), (30, 20, 10, 255))
        self.assertEqual(texture.role, "occlusion-metallic-roughness")

    def test_texture_limits_and_roles(self) -> None:
        diffuse = convert_texture(FIXTURES / "diffuse.png", "diffuse", 1)
        normal = convert_texture(FIXTURES / "normal.png", "normal", 1)
        self.assertEqual((diffuse.width, diffuse.height, diffuse.role), (1, 1, "diffuse"))
        self.assertEqual(normal.role, "normal")
        self.assertEqual(diffuse.mime_type, "image/webp")

    def test_glb_round_trip_is_deterministic_and_embeds_required_attributes(self) -> None:
        payload = json.loads((FIXTURES / "static-mesh.json").read_text())
        mesh = normalize_pdx_json(payload, fixture_materials())
        textures = {}
        for material in fixture_materials():
            textures[(material.name, "diffuse")] = convert_texture(FIXTURES / "diffuse.png", "diffuse", 2048)
            textures[(material.name, "normal")] = convert_texture(FIXTURES / "normal.png", "normal", 2048)
            textures[(material.name, "properties")] = pack_properties(FIXTURES / "properties.png", 2048)
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first.glb"
            second = Path(directory) / "second.glb"
            report = write_glb(mesh, fixture_materials(), textures, first)
            write_glb(mesh, fixture_materials(), textures, second)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            self.assertEqual(first.read_bytes()[:4], b"glTF")
            self.assertEqual(report.triangle_count, 2)
            inspected = inspect_glb(first)
            self.assertEqual(inspected.sha256, report.sha256)
            self.assertEqual(len(inspected.texture_sizes), 6)


class LodTests(unittest.TestCase):
    def test_release_texture_edges_stay_below_spec_budget(self) -> None:
        self.assertEqual(LOD_TEXTURE_EDGE_CANDIDATES, {0: (512, 256, 128), 1: (256, 128)})
        self.assertLessEqual(max(LOD_TEXTURE_EDGE_CANDIDATES[0]), 2048)
        self.assertLessEqual(max(LOD_TEXTURE_EDGE_CANDIDATES[1]), 1024)

    def test_simplifies_grid_deterministically_with_original_vertex_indices(self) -> None:
        size = 12
        positions = tuple((float(x), float(y), 0.0) for y in range(size) for x in range(size))
        indices = []
        for y in range(size - 1):
            for x in range(size - 1):
                a = y * size + x
                b = a + 1
                c = a + size
                d = c + 1
                indices.extend((a, b, c, b, d, c))
        first = simplify_primitive(tuple(indices), positions, 0.35)
        second = simplify_primitive(tuple(indices), positions, 0.35)
        self.assertEqual(first, second)
        self.assertEqual(len(first) % 3, 0)
        self.assertTrue(0.25 <= len(first) / len(indices) <= 0.40)
        self.assertLess(max(first), len(positions))

    def test_rejects_target_ratio_outside_release_budget(self) -> None:
        with self.assertRaises(ModelImportError):
            simplify_primitive((0, 1, 2), ((0, 0, 0), (1, 0, 0), (0, 1, 0)), 0.5)


    def test_allows_tiny_primitive_overshoot_when_landmark_aggregate_is_enforced(self) -> None:
        result = simplify_primitive(
            (0, 1, 2),
            ((0, 0, 0), (1, 0, 0), (0, 1, 0)),
            0.35,
            allow_ratio_overshoot=True,
        )
        self.assertEqual(result, (0, 1, 2))


if __name__ == "__main__":
    unittest.main()
