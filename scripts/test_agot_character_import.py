from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from scripts.agot_character_import.paradox import parse_document
from scripts.agot_character_import.characters import extract_character_histories
from scripts.agot_character_import.model import CanonTier
from scripts.agot_character_import.timeline import AgotDate, project_character
from scripts.agot_character_import.titles import ProjectedTitle, project_title_holders
from scripts.agot_character_import.localization import load_localization, resolve_name
from scripts.agot_character_import.writer import _build_kinship_index, write_dataset
from scripts.agot_character_import.cli import import_dataset, validate_mod_root


FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures" / "agot-character-import"
PARADOX_FIXTURE = FIXTURE_ROOT / "paradox_sample.txt"
LOCALIZATION_FIXTURE = FIXTURE_ROOT / "localization_l_simp_chinese.yml"


class ParadoxParserTests(unittest.TestCase):
    def test_preserves_repeated_traits_dates_and_comments(self) -> None:
        entries = parse_document(PARADOX_FIXTURE.read_text(encoding="utf-8-sig"))

        eddard = next(entry for entry in entries if entry.key == "Stark_3")

        self.assertEqual(eddard.first("name").value, "Eddard")
        self.assertEqual([entry.value for entry in eddard.all("trait")], ["honest", "just"])
        self.assertIsNone(eddard.first("8299.1.10").first("death").value)
        self.assertIn("Canon character", eddard.comments)
        self.assertIn("Canon, THE Eddard", eddard.first("name").comments)


class CharacterExtractionTests(unittest.TestCase):
    def test_classifies_canon_semicanon_ancestor_and_dummy(self) -> None:
        records = []
        for name in (
            "paradox_sample.txt",
            "spouse_counterpart.txt",
            "semicanon.txt",
            "north_ancestors.txt",
            "agot_dummy_characters.txt",
        ):
            records.extend(extract_character_histories(FIXTURE_ROOT / name))
        by_id = {record.raw_id: record for record in records}

        self.assertEqual(by_id["Stark_3"].tier, CanonTier.CANON)
        self.assertEqual(by_id["Semi_1"].tier, CanonTier.SEMICANON)
        self.assertEqual(by_id["Ancestor_1"].tier, CanonTier.GENEALOGY)
        self.assertEqual(by_id["Dummy_1"].tier, CanonTier.TECHNICAL)

    def test_extracts_identity_attributes_traits_and_dated_entries(self) -> None:
        [eddard] = extract_character_histories(PARADOX_FIXTURE)

        self.assertEqual(eddard.name_key, "Eddard")
        self.assertEqual(eddard.dynasty, "dynn_Stark")
        self.assertEqual((eddard.father_id, eddard.mother_id), ("Stark_1", "Stark_127"))
        self.assertEqual(eddard.base_attributes["martial"], 8)
        self.assertEqual(eddard.undated_traits, ("honest", "just"))
        self.assertEqual([event.raw_date for event in eddard.dated_events], ["8263.1.1", "8298.1.1", "8298.2.1", "8298.3.1", "8299.1.10"])


class TimelineTests(unittest.TestCase):
    def setUp(self) -> None:
        [self.eddard] = extract_character_histories(PARADOX_FIXTURE)

    def test_projects_only_events_on_or_before_start(self) -> None:
        projected = project_character(self.eddard, AgotDate.parse("8298.6.1"))

        self.assertTrue(projected.born)
        self.assertTrue(projected.alive)
        self.assertEqual(projected.display_year, 298)
        self.assertIn("family_first", projected.traits)
        self.assertNotIn("just", projected.traits)
        self.assertEqual(projected.spouse_ids, ("Tully_4",))
        self.assertIsNone(projected.death_date)
        self.assertNotIn("death_execution", projected.applied_operations)
        self.assertFalse(hasattr(projected, "future_events"))

    def test_character_is_not_alive_before_birth_and_dies_only_after_death_event(self) -> None:
        before_birth = project_character(self.eddard, AgotDate.parse("8260.1.1"))
        after_death = project_character(self.eddard, AgotDate.parse("8299.1.10"))

        self.assertFalse(before_birth.born)
        self.assertFalse(before_birth.alive)
        self.assertFalse(after_death.alive)
        self.assertEqual(after_death.death_reason, "death_execution")


class LocalizationTests(unittest.TestCase):
    def test_resolves_chinese_name_and_keeps_raw_fallback(self) -> None:
        localization = load_localization([LOCALIZATION_FIXTURE])

        self.assertEqual(resolve_name("Eddard", localization), "艾德")
        self.assertEqual(resolve_name("Unknown_Key", localization), "Unknown_Key")

    def test_cleans_game_formatting_without_removing_chinese_punctuation(self) -> None:
        localization = load_localization([LOCALIZATION_FIXTURE])

        self.assertEqual(localization["formatted_name"], "北境")
        self.assertEqual(localization["quoted_name"], "“少狼主”")


class TitleHistoryTests(unittest.TestCase):
    def test_projects_direct_holders_at_start_date_and_ignores_future_or_nested_values(self) -> None:
        projected = project_title_holders(
            [FIXTURE_ROOT / "title_history.txt"],
            AgotDate.parse("8298.1.1"),
            {
                "h_the_test_realm": "至高王座",
                "e_the_north": "北境",
                "k_winterfell": "临冬城",
                "d_winterfell": "临冬城",
                "c_same_day": "同日领",
            },
        )

        self.assertEqual([title.id for title in projected["Hero_1"]], [
            "h_the_test_realm", "e_the_north", "k_winterfell",
        ])
        self.assertEqual([title.name for title in projected["Hero_1"]], ["至高王座", "北境", "临冬城"])
        self.assertEqual(projected["Final_1"][0].id, "c_same_day")
        self.assertNotIn("Old_1", projected)
        self.assertNotIn("Wrong_1", projected)
        self.assertNotIn("Future_1", projected)

    def test_holder_zero_clears_title_and_missing_localization_becomes_readable(self) -> None:
        projected = project_title_holders(
            [FIXTURE_ROOT / "title_history.txt"], AgotDate.parse("8298.1.1"), {}
        )

        self.assertNotIn("c_cleared", [title.id for titles in projected.values() for title in titles])
        fallback = projected["Fallback_1"][0]
        self.assertEqual(fallback.name, "Missing Localization")
        self.assertNotEqual(fallback.name, fallback.id)

    def test_projection_is_deterministic_for_reversed_input_order(self) -> None:
        first_path = FIXTURE_ROOT / "title_history.txt"
        second_path = FIXTURE_ROOT / "title_history_second.txt"
        second_path.write_text("c_second = { 8290.1.1 = { holder = Hero_1 } }\n", encoding="utf-8")
        try:
            first = project_title_holders([first_path, second_path], AgotDate.parse("8298.1.1"), {})
            second = project_title_holders([second_path, first_path], AgotDate.parse("8298.1.1"), {})
            self.assertEqual(first, second)
        finally:
            second_path.unlink(missing_ok=True)


class DatasetWriterTests(unittest.TestCase):
    def _records(self):
        records = []
        for name in (
            "paradox_sample.txt",
            "spouse_counterpart.txt",
            "semicanon.txt",
            "north_ancestors.txt",
            "agot_dummy_characters.txt",
        ):
            records.extend(extract_character_histories(FIXTURE_ROOT / name))
        return records

    @staticmethod
    def _tree_hash(root: Path) -> str:
        digest = hashlib.sha256()
        for path in sorted(item for item in root.rglob("*") if item.is_file()):
            digest.update(path.relative_to(root).as_posix().encode("utf-8"))
            digest.update(path.read_bytes())
        return digest.hexdigest()

    def test_writer_is_deterministic_and_excludes_technical_records(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            localization = load_localization([LOCALIZATION_FIXTURE])
            first = write_dataset(
                self._records(), temp / "a", {"modVersion": "fixture"}, AgotDate.parse("8298.6.1"), localization
            )
            second = write_dataset(
                self._records(), temp / "b", {"modVersion": "fixture"}, AgotDate.parse("8298.6.1"), localization
            )

            self.assertEqual(self._tree_hash(temp / "a"), self._tree_hash(temp / "b"))
            self.assertEqual(first.schema_version, 2)
            self.assertEqual(first.dataset_hash, second.dataset_hash)
            self.assertEqual(first.counts["excludedTechnical"], 1)
            all_records = []
            for shard in (temp / "a" / "shards").glob("*.json"):
                all_records.extend(json.loads(shard.read_text(encoding="utf-8")))
            self.assertNotIn("agot:Dummy_1", {record["id"] for record in all_records})
            self.assertIn("agot:Stark_3", {record["id"] for record in all_records})

    def test_writer_prunes_isolated_genealogy_but_keeps_core_spouse(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "dataset"
            manifest = write_dataset(
                self._records(), output, {"modVersion": "fixture"}, AgotDate.parse("8298.6.1"), {}
            )
            emitted_ids = {
                record["id"]
                for path in output.joinpath("shards").glob("*.json")
                for record in json.loads(path.read_text(encoding="utf-8"))
            }

            self.assertEqual(emitted_ids, {"agot:Stark_3", "agot:Tully_4", "agot:Semi_1"})
            self.assertEqual(manifest.counts["projectedRecords"], 4)
            self.assertEqual(manifest.counts["emittedRecords"], 3)
            self.assertEqual(manifest.counts["prunedRecords"], 1)

    def test_writer_emits_title_holder_map_counts_and_hashes_title_changes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            first_titles = {
                "Stark_3": (ProjectedTitle("e_the_north", "北境", "empire"),),
                "Missing_1": (ProjectedTitle("c_missing", "失落领", "county"),),
            }
            second_titles = {
                "Stark_3": (ProjectedTitle("e_the_north", "北境守护地", "empire"),),
            }
            first = write_dataset(
                self._records(), temp / "a", {"modVersion": "fixture", "titleFileCount": 1},
                AgotDate.parse("8298.6.1"), {}, first_titles,
            )
            second = write_dataset(
                self._records(), temp / "b", {"modVersion": "fixture", "titleFileCount": 1},
                AgotDate.parse("8298.6.1"), {}, second_titles,
            )

            title_map = json.loads((temp / "a" / "title-holders.json").read_text(encoding="utf-8"))
            self.assertEqual(title_map["agot:Stark_3"][0], {
                "id": "e_the_north", "name": "北境", "tier": "empire",
            })
            self.assertNotIn("agot:Missing_1", title_map, "未进入人物数据集的持有人不应进入运行时映射")
            self.assertEqual(first.counts["titleHolderCount"], 1)
            self.assertEqual(first.counts["heldTitleCount"], 1)
            self.assertNotEqual(first.dataset_hash, second.dataset_hash)

    def test_writer_makes_source_marriages_visible_to_both_spouses(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "dataset"
            write_dataset(
                self._records(), output, {"modVersion": "fixture"}, AgotDate.parse("8298.6.1"), {}
            )
            all_records = []
            for shard in output.joinpath("shards").glob("*.json"):
                all_records.extend(json.loads(shard.read_text(encoding="utf-8")))
            by_id = {record["id"]: record for record in all_records}

            self.assertIn("agot:Tully_4", by_id["agot:Stark_3"]["spouseIds"])
            self.assertIn("agot:Stark_3", by_id["agot:Tully_4"]["spouseIds"])

    def test_writer_derives_siblings_from_shared_parents(self) -> None:
        kinship = _build_kinship_index([
            {"id": "agot:parent", "spouseIds": []},
            {"id": "agot:child_b", "fatherId": "agot:parent", "spouseIds": []},
            {"id": "agot:child_a", "fatherId": "agot:parent", "spouseIds": []},
        ])
        self.assertEqual(kinship["agot:child_a"]["siblingIds"], ["agot:child_b"])
        self.assertEqual(kinship["agot:child_b"]["siblingIds"], ["agot:child_a"])

    def test_writer_emits_reverse_kinship_index(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "dataset"
            write_dataset(
                self._records(), output, {"modVersion": "fixture"}, AgotDate.parse("8298.6.1"), {}
            )
            kinship = {}
            for path in output.joinpath("kinship").glob("*.json"):
                kinship.update(json.loads(path.read_text(encoding="utf-8")))

            self.assertEqual(kinship["agot:Stark_3"]["spouseIds"], ["agot:Tully_4"])
            self.assertEqual(kinship["agot:Tully_4"]["spouseIds"], ["agot:Stark_3"])
            for entry in kinship.values():
                self.assertEqual(entry["childIds"], sorted(set(entry["childIds"])))

    def test_writer_falls_back_when_directory_replace_is_denied(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "dataset"
            with patch("scripts.agot_character_import.writer.os.replace", side_effect=PermissionError("denied")):
                manifest = write_dataset(
                    self._records(), output, {"modVersion": "fixture"}, AgotDate.parse("8298.6.1"), {}
                )

            self.assertTrue((output / "manifest.json").exists())
            self.assertEqual(manifest.counts["emittedRecords"], 3)

    def test_search_index_stays_lightweight_and_points_to_existing_shards(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "dataset"
            write_dataset(
                self._records(), output, {"modVersion": "fixture"}, AgotDate.parse("8298.6.1"), {}
            )
            index = json.loads((output / "search-index.json").read_text(encoding="utf-8"))

            self.assertNotIn("traits", index[0])
            self.assertTrue(all((output / "shards" / f'{item["shard"]}.json').exists() for item in index))


class ImporterTitleSourceTests(unittest.TestCase):
    def test_import_rejects_agot_root_without_title_history(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "2962333032"
            (root / "history" / "characters").mkdir(parents=True)
            (root / "descriptor.mod").write_text(
                'version="0.5.0"\nname="A Game of Thrones"\n', encoding="utf-8"
            )
            (root / "history" / "characters" / "fixture.txt").write_text(
                "Stark_3 = { name = Eddard }\n", encoding="utf-8"
            )

            with self.assertRaisesRegex(ValueError, "No AGOT title files"):
                import_dataset(root, Path(temp_dir) / "output", AgotDate.parse("8298.1.1"))

    def test_import_includes_title_files_in_source_checksum_and_dataset(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "2962333032"
            (root / "history" / "characters").mkdir(parents=True)
            (root / "history" / "titles").mkdir(parents=True)
            (root / "localization" / "simp_chinese").mkdir(parents=True)
            (root / "descriptor.mod").write_text(
                'version="0.5.0"\nname="A Game of Thrones"\n', encoding="utf-8"
            )
            (root / "history" / "characters" / "fixture.txt").write_text(
                "# Canon character\nStark_3 = { name = Eddard }\n", encoding="utf-8"
            )
            title_file = root / "history" / "titles" / "fixture.txt"
            title_file.write_text(
                "e_the_north = { 8298.1.1 = { holder = Stark_3 } }\n", encoding="utf-8"
            )
            (root / "localization" / "simp_chinese" / "fixture_l_simp_chinese.yml").write_text(
                'l_simp_chinese:\n e_the_north:0 "北境"\n', encoding="utf-8"
            )

            first = import_dataset(root, Path(temp_dir) / "first", AgotDate.parse("8298.1.1"))
            title_file.write_text(
                "e_the_north = { 8298.1.1 = { holder = 0 } }\n", encoding="utf-8"
            )
            second = import_dataset(root, Path(temp_dir) / "second", AgotDate.parse("8298.1.1"))

            first_titles = json.loads((Path(temp_dir) / "first" / "title-holders.json").read_text(encoding="utf-8"))
            self.assertEqual(first.source["titleFileCount"], 1)
            self.assertEqual(first_titles["agot:Stark_3"][0]["name"], "北境")
            self.assertNotEqual(first.source["sourceChecksum"], second.source["sourceChecksum"])
            self.assertNotEqual(first.dataset_hash, second.dataset_hash)


class SourceBoundaryTests(unittest.TestCase):
    def test_rejects_vanilla_game_root(self) -> None:
        vanilla = Path("C:/Steam/steamapps/common/Crusader Kings III/game")

        with self.assertRaisesRegex(ValueError, "AGOT workshop item 2962333032"):
            validate_mod_root(vanilla)

    def test_accepts_only_matching_agot_descriptor_and_workshop_id(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "2962333032"
            root.mkdir()
            (root / "descriptor.mod").write_text(
                'version="0.5.0"\nname="A Game of Thrones"\n', encoding="utf-8"
            )
            (root / "history" / "characters").mkdir(parents=True)

            self.assertEqual(validate_mod_root(root), root.resolve())


if __name__ == "__main__":
    unittest.main()
