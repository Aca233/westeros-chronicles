import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_character_supplements import build_kinship_index, build_supplements, classify_loadout


class CharacterSupplementTests(unittest.TestCase):
    def test_curated_supplement_pipeline_uses_generated_directories(self) -> None:
        root = Path(__file__).resolve().parents[1]
        generated = root / "src" / "data" / "generated" / "characterDossierSupplements.ts"
        legacy = root / "src" / "data" / "characterDossierSupplements.ts"
        compiler = (root / "scripts" / "compile_dossier_supplements.mjs").read_text(encoding="utf-8")
        self.assertTrue(generated.is_file())
        self.assertFalse(legacy.exists())
        self.assertIn("./data/character-dossier/raw_supplements_part1.mjs", compiler)
        self.assertIn("src/data/generated/characterDossierSupplements.ts", compiler)

    def test_reverse_children_are_complete_unique_and_sorted(self) -> None:
        records = [
            {"id": "agot:parent", "spouseIds": ["agot:spouse"]},
            {"id": "agot:spouse", "spouseIds": ["agot:parent"]},
            {"id": "agot:child_b", "fatherId": "agot:parent", "motherId": "agot:spouse", "spouseIds": []},
            {"id": "agot:child_a", "fatherId": "agot:parent", "motherId": "agot:spouse", "spouseIds": []},
        ]
        kinship = build_kinship_index(records)
        self.assertEqual(kinship["agot:parent"]["childIds"], ["agot:child_a", "agot:child_b"])
        self.assertEqual(kinship["agot:spouse"]["childIds"], ["agot:child_a", "agot:child_b"])
        self.assertEqual(kinship["agot:child_a"]["siblingIds"], ["agot:child_b"])
        self.assertEqual(kinship["agot:child_b"]["siblingIds"], ["agot:child_a"])

    def test_loadout_classifier_prioritizes_role_age_region_and_title(self) -> None:
        self.assertIsNone(classify_loadout({"id": "agot:dead", "born": True, "alive": False}, {}, 8298))
        self.assertEqual(classify_loadout({"id": "agot:baby", "born": True, "alive": True, "birthDate": "8297.1.1", "traits": []}, {}, 8298)["templateId"], "infant")
        self.assertEqual(classify_loadout({"id": "agot:child", "born": True, "alive": True, "birthDate": "8290.1.1", "traits": []}, {}, 8298)["templateId"], "child")
        self.assertEqual(classify_loadout({"id": "agot:maester", "born": True, "alive": True, "birthDate": "8270.1.1", "traits": ["maester"]}, {}, 8298)["templateId"], "maester")
        self.assertEqual(classify_loadout({"id": "agot:dornish", "born": True, "alive": True, "birthDate": "8270.1.1", "cultureId": "salt_dornish", "traits": []}, {}, 8298)["templateId"], "dornish")
        self.assertEqual(classify_loadout({"id": "agot:north", "born": True, "alive": True, "birthDate": "8270.1.1", "cultureId": "northman", "traits": []}, {"agot:north": [{"id": "c_x"}]}, 8298)["templateId"], "northern_noble")

    def test_builder_writes_bundled_shape_without_mod_sources(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "shards").mkdir()
            (root / "shards" / "00.json").write_text(json.dumps([
                {"id": "agot:parent", "spouseIds": []},
                {"id": "agot:child", "fatherId": "agot:parent", "spouseIds": []},
            ]), encoding="utf-8")
            counts = build_supplements(root, kinship_only=True)
            output = {}
            for path in (root / "kinship").glob("*.json"):
                output.update(json.loads(path.read_text(encoding="utf-8")))
            self.assertEqual(output["agot:parent"]["childIds"], ["agot:child"])
            self.assertEqual(counts["parentChildLinkCount"], 1)


if __name__ == "__main__":
    unittest.main()
