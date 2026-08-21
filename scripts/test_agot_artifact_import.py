from __future__ import annotations

import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

from scripts.agot_character_import.localization import load_localization
from scripts.agot_artifact_import.extractor import extract_source_artifacts, normalize_artifact_type
from scripts.agot_artifact_import.model import ArtifactSource
from scripts.agot_artifact_import.deduplicate import deduplicate_candidates
from scripts.agot_artifact_import.localization import load_source_localization
from scripts.agot_artifact_import.sources import validate_source
from scripts.agot_artifact_import.writer import write_artifact_dataset
from scripts.agot_artifact_import.world_state import WorldStateProjection


FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures" / "agot-artifact-import"


class ArtifactExtractionTests(unittest.TestCase):
    def test_extracts_nested_creation_visual_template_rarity_and_supported_modifiers(self) -> None:
        localization = load_localization((FIXTURE_ROOT / "localization" / "simp_chinese").glob("*.yml"))
        source = ArtifactSource("fixture", "Fixture Artifacts", FIXTURE_ROOT, 1, ())

        candidates, rejected = extract_source_artifacts(source, localization)

        self.assertEqual(len(candidates), 1)
        crown = candidates[0]
        self.assertEqual(crown.name, "测试王冠")
        self.assertEqual(crown.description, "一顶用于测试离线导入的王冠。")
        self.assertEqual(crown.artifact_type, "helmet")
        self.assertEqual(crown.icon_path.name, "test_crown.dds")
        self.assertTrue(crown.unique)
        self.assertEqual(crown.rarity, "illustrious")
        self.assertEqual(crown.modifiers["diplomacy"], 2.0)
        self.assertEqual(crown.modifiers["monthly_prestige"], 0.1)
        self.assertIn("unknown_ck3_value", crown.unmapped_modifiers)
        self.assertTrue(any(item.reason == "dynamic_name" for item in rejected))

    def test_normalizes_existing_equipment_groups_without_shoulder_or_cloak_slots(self) -> None:
        crown = normalize_artifact_type("helmet")
        sword = normalize_artifact_type("sword")
        armor = normalize_artifact_type("armor_plate")
        book = normalize_artifact_type("book")

        self.assertEqual(crown.category, "clothing")
        self.assertEqual(crown.allowed_positions, ({"group": "head"},))
        self.assertEqual(sword.category, "weapon")
        self.assertEqual(sword.allowed_positions, ({"group": "mainhand"},))
        self.assertEqual(armor.allowed_positions, ({"group": "torso", "layer": "armor"},))
        self.assertFalse(book.equippable)
        self.assertNotIn("shoulder", str((crown, sword, armor, book)))
        self.assertNotIn("cloak", str((crown, sword, armor, book)))


class SourceAndDeduplicationTests(unittest.TestCase):
    def test_translation_pack_overrides_source_localization(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            own = temp / "own"
            translated = temp / "translated"
            (own / "localization" / "simp_chinese").mkdir(parents=True)
            translated.mkdir()
            (own / "localization" / "simp_chinese" / "own.yml").write_text(
                'l_simp_chinese:\n test_crown_name:0 "原译名"\n', encoding="utf-8"
            )
            (translated / "translated.yml").write_text(
                'l_simp_chinese:\n test_crown_name:0 "汉化合集译名"\n', encoding="utf-8"
            )
            source = ArtifactSource("fixture", "Fixture", own, 1, (translated,))
            self.assertEqual(load_source_localization(source)["test_crown_name"], "汉化合集译名")

    def test_source_validation_rejects_wrong_workshop_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "wrong"
            root.mkdir()
            (root / "test.mod").write_text('name="Fixture"\nremote_file_id="different"\n', encoding="utf-8")
            source = ArtifactSource("fixture", "Fixture", root, 1, ())
            with self.assertRaisesRegex(ValueError, "Workshop source"):
                validate_source(source)

    def test_unique_same_name_merges_visuals_while_non_unique_stays_separate(self) -> None:
        localization = load_localization((FIXTURE_ROOT / "localization" / "simp_chinese").glob("*.yml"))
        base_source = ArtifactSource("base", "Base", FIXTURE_ROOT, 0, ())
        addon_source = ArtifactSource("addon", "Addon", FIXTURE_ROOT, 2, ())
        candidates, _ = extract_source_artifacts(base_source, localization)
        crown = candidates[0]
        addon_crown = replace(crown, source=addon_source, source_id="addon_crown")
        generic_a = replace(crown, unique=False, name="普通头冠", source_id="generic_a")
        generic_b = replace(generic_a, source=addon_source, source_id="generic_b")

        groups, conflicts = deduplicate_candidates((crown, addon_crown, generic_a, generic_b), {})

        unique_group = next(group for group in groups if group.primary.name == "测试王冠")
        self.assertEqual(unique_group.primary.source.workshop_id, "base")
        self.assertEqual(len(unique_group.visual_variants), 2)
        self.assertEqual(len([group for group in groups if group.primary.name == "普通头冠"]), 2)
        self.assertEqual(conflicts, ())
        self.assertEqual(len({group.item_id for group in groups}), len(groups))


class ArtifactWriterTests(unittest.TestCase):
    def test_writer_emits_deterministic_typescript_webp_and_hash_manifest(self) -> None:
        localization = load_localization((FIXTURE_ROOT / "localization" / "simp_chinese").glob("*.yml"))
        source = ArtifactSource("fixture", "Fixture", FIXTURE_ROOT, 1, ())
        candidates, rejected = extract_source_artifacts(source, localization)
        groups, conflicts = deduplicate_candidates(candidates, {})
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            first = write_artifact_dataset(groups, rejected, conflicts, temp / "a.ts", temp / "assets-a", temp / "data-a")
            second = write_artifact_dataset(groups, rejected, conflicts, temp / "b.ts", temp / "assets-b", temp / "data-b")

            self.assertEqual(first["datasetHash"], second["datasetHash"] )
            self.assertEqual((temp / "a.ts").read_text(encoding="utf-8"), (temp / "b.ts").read_text(encoding="utf-8"))
            self.assertIn("AGOT_ARTIFACT_DEFINITIONS", (temp / "a.ts").read_text(encoding="utf-8"))
            self.assertEqual(len(list((temp / "assets-a").glob("*.webp"))), 1)
            self.assertEqual(first["counts"]["emittedItems"], 1)
            self.assertEqual(first["items"][0]["name"], "测试王冠")
            self.assertRegex(first["items"][0]["sha256"], r"^[a-f0-9]{64}$")

    def test_writer_emits_deterministic_world_state_json_report_and_typescript(self) -> None:
        localization = load_localization((FIXTURE_ROOT / "localization" / "simp_chinese").glob("*.yml"))
        source = ArtifactSource("fixture", "Fixture", FIXTURE_ROOT, 1, ())
        candidates, rejected = extract_source_artifacts(source, localization)
        groups, conflicts = deduplicate_candidates(candidates, {})
        item_id = groups[0].item_id
        projection = WorldStateProjection(
            artifacts={
                item_id: {
                    "instanceId": f"world.{item_id}",
                    "definitionId": item_id,
                    "lawfulControllerId": "agot:Tester_1",
                    "projectionKind": "portable-asset",
                    "placement": {"type": "character", "characterId": "agot:Tester_1"},
                    "equipped": False,
                    "source": {"file": "scenario.txt", "line": 4, "effectId": "test_crown_effect"},
                }
            },
            issues=({"kind": "unsupported_condition", "detail": "test", "file": "scenario.txt", "line": 8},),
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            first = write_artifact_dataset(
                groups, rejected, conflicts, temp / "a.ts", temp / "assets-a", temp / "data-a",
                world_projection=projection, world_start_date="8298.1.1", character_dataset_hash="a" * 64,
                world_typescript_path=temp / "world-a.ts",
            )
            second = write_artifact_dataset(
                groups, rejected, conflicts, temp / "b.ts", temp / "assets-b", temp / "data-b",
                world_projection=projection, world_start_date="8298.1.1", character_dataset_hash="a" * 64,
                world_typescript_path=temp / "world-b.ts",
            )

            self.assertEqual(first["worldState"], second["worldState"])
            self.assertEqual((temp / "world-a.ts").read_bytes(), (temp / "world-b.ts").read_bytes())
            self.assertEqual(
                (temp / "data-a" / "agot-artifact-world-state.json").read_bytes(),
                (temp / "data-b" / "agot-artifact-world-state.json").read_bytes(),
            )
            self.assertEqual(first["worldState"]["resolvedArtifacts"], 1)
            self.assertEqual(first["worldState"]["unresolvedIssues"], 1)


if __name__ == "__main__":
    unittest.main()
