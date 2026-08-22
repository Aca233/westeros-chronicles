import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.build_character_supplements import build_kinship_index, build_supplements, classify_loadout

ROOT = Path(__file__).resolve().parents[1]

LEGACY_DUMP_JS = """
const root = process.argv[1];
const load = async (name, key) => {
  const module = await import(`file://${root}/scripts/data/character-dossier/${name}.mjs`);
  return module[key];
};
const parts = await Promise.all([
  load('raw_supplements_part1', 'RAW_SUPPLEMENTS'),
  load('raw_supplements_part2', 'RAW_SUPPLEMENTS_PART2'),
  load('raw_supplements_part3', 'RAW_SUPPLEMENTS_PART3'),
  load('raw_supplements_part4', 'RAW_SUPPLEMENTS_PART4'),
  load('raw_supplements_part5', 'RAW_SUPPLEMENTS_PART5'),
]);
const records = {};
for (const raw of parts.flat()) {
  const { subjectNameKey, ...rest } = raw;
  const { sourceUrls, ...withoutSources } = {
    ...rest,
    experiences: rest.experiences ? rest.experiences.map(({ participantNameKeys, ...experience }) => experience) : undefined,
    notableRelations: rest.notableRelations ? rest.notableRelations.map(({ targetNameKey, ...relation }) => relation) : undefined,
  };
  records[rest.characterId] = { schemaVersion: 1, ...withoutSources, sources: sourceUrls ?? [] };
}
process.stdout.write(JSON.stringify(records));
"""

EXPECTED_SUPPLEMENT_COUNT = 113


def load_character_json_files(directory: Path) -> dict:
    records = {}
    for path in sorted(directory.glob("*.json")):
        record = json.loads(path.read_text(encoding="utf-8"))
        records[record["characterId"]] = record
    return records


def load_legacy_supplements() -> dict | None:
    legacy_dir = ROOT / "scripts" / "data" / "character-dossier"
    if not legacy_dir.is_dir():
        return None
    result = subprocess.run(
        ["node", "-e", LEGACY_DUMP_JS, str(ROOT)],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


class CharacterSupplementTests(unittest.TestCase):
    def test_each_existing_supplement_becomes_one_character_json(self) -> None:
        migrated = load_character_json_files(ROOT / "content" / "world" / "characters")
        legacy = load_legacy_supplements()
        if legacy is None:
            self.assertEqual(len(migrated), EXPECTED_SUPPLEMENT_COUNT)
        else:
            self.assertEqual(set(migrated), set(legacy))
            self.assertEqual(migrated, legacy)
        for character_id, record in migrated.items():
            safe_id = "".join(ch if ch.isalnum() or ch in "_-" else "_" for ch in character_id)
            self.assertEqual(record["schemaVersion"], 1, character_id)
            self.assertTrue(record["sources"], f"{character_id} 缺少来源")

    def test_character_content_rejects_runtime_facts(self) -> None:
        forbidden = {"name", "gender", "birthDate", "age", "alive", "location", "titleIds", "titles", "items", "equipment"}
        for path, record in load_character_json_files(ROOT / "content" / "world" / "characters").items():
            self.assertFalse(forbidden.intersection(record), path)

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
        ned = classify_loadout({"id": "agot:Stark_3", "born": True, "alive": True, "birthDate": "8263.1.1", "traits": []}, {}, 8298)
        self.assertEqual(ned["templateId"], "northern_noble")
        self.assertEqual(ned["overrideId"], "eddard_stark_daily")

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
