import json
import tempfile
import unittest
from pathlib import Path

from scripts.agot_character_import.roster import RosterReferences
from scripts.prune_bundled_character_dataset import prune_bundled_dataset


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


class BundledCharacterDatasetPruningTests(unittest.TestCase):
    def test_prunes_every_derived_mapping_and_is_repeatable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "characters"
            records = [
                {"id": "agot:core", "rawId": "core", "canonTier": "canon", "name": "Core",
                 "born": True, "alive": True, "fatherId": "agot:parent", "motherId": None,
                 "killerId": None, "spouseIds": [], "relations": [], "traits": [], "baseAttributes": {},
                 "hasDna": False, "source": {"file": "x", "line": 1}},
                {"id": "agot:parent", "rawId": "parent", "canonTier": "genealogy", "name": "Parent",
                 "born": True, "alive": False, "fatherId": "agot:ancestor", "motherId": None,
                 "killerId": None, "spouseIds": [], "relations": [], "traits": [], "baseAttributes": {},
                 "hasDna": False, "source": {"file": "x", "line": 2}},
                {"id": "agot:ancestor", "rawId": "ancestor", "canonTier": "genealogy", "name": "Ancestor",
                 "born": True, "alive": False, "fatherId": None, "motherId": None, "killerId": None,
                 "spouseIds": [], "relations": [], "traits": [], "baseAttributes": {}, "hasDna": False,
                 "source": {"file": "x", "line": 3}},
                {"id": "agot:holder", "rawId": "holder", "canonTier": "mod_supporting", "name": "Holder",
                 "born": True, "alive": True, "fatherId": None, "motherId": None, "killerId": None,
                 "spouseIds": [], "relations": [], "traits": [], "baseAttributes": {}, "hasDna": False,
                 "source": {"file": "x", "line": 4}},
                {"id": "agot:isolated", "rawId": "isolated", "canonTier": "mod_supporting", "name": "Isolated",
                 "born": True, "alive": True, "fatherId": None, "motherId": None, "killerId": None,
                 "spouseIds": [], "relations": [], "traits": [], "baseAttributes": {}, "hasDna": False,
                 "source": {"file": "x", "line": 5}},
            ]
            write_json(root / "manifest.json", {
                "schemaVersion": 2, "datasetHash": "old", "startDate": "8298.1.1", "displayYear": 298,
                "counts": {"emittedRecords": 5, "excludedTechnical": 2}, "shards": ["00"], "source": {"name": "fixture"},
            })
            write_json(root / "shards" / "00.json", records)
            write_json(root / "search-index.json", [
                {"id": record["id"], "name": record["name"], "canonTier": record["canonTier"],
                 "born": record["born"], "alive": record["alive"], "shard": "00"}
                for record in records
            ])
            write_json(root / "title-holders.json", {"agot:holder": [{"id": "c_holder", "name": "Holder", "tier": "county"}]})
            write_json(root / "kinship" / "00.json", {
                "agot:core": {"fatherId": "agot:parent", "spouseIds": [], "childIds": [], "siblingIds": []},
                "agot:parent": {"fatherId": "agot:ancestor", "spouseIds": [], "childIds": ["agot:core"], "siblingIds": []},
                "agot:ancestor": {"spouseIds": [], "childIds": ["agot:parent"], "siblingIds": []},
                "agot:holder": {"spouseIds": [], "childIds": [], "siblingIds": []},
                "agot:isolated": {"spouseIds": [], "childIds": [], "siblingIds": []},
            })
            write_json(root / "loadouts" / "00.json", {
                character_id: {"characterId": character_id, "templateId": "courtier"}
                for character_id in ("agot:core", "agot:parent", "agot:ancestor", "agot:holder", "agot:isolated")
            })
            write_json(root / "reports" / "import-report.json", {"datasetHash": "old", "counts": {}})
            write_json(root / "reports" / "loadout-report.json", {"assigned": 5})
            references = RosterReferences(
                playable_ids=frozenset(),
                content_ids=frozenset(),
                start_state_ids=frozenset(),
                artifact_holder_ids=frozenset(),
                title_holders={},
                kinship={},
            )

            first = prune_bundled_dataset(root, references)
            first_hash = json.loads((root / "manifest.json").read_text(encoding="utf-8"))["datasetHash"]
            second = prune_bundled_dataset(root, references)
            second_hash = json.loads((root / "manifest.json").read_text(encoding="utf-8"))["datasetHash"]
            output_records = [
                record
                for path in (root / "shards").glob("*.json")
                for record in json.loads(path.read_text(encoding="utf-8"))
            ]
            output_loadouts = {
                character_id: profile
                for path in (root / "loadouts").glob("*.json")
                for character_id, profile in json.loads(path.read_text(encoding="utf-8")).items()
            }
            holder_summaries = json.loads((root / "holder-summaries.json").read_text(encoding="utf-8"))

            self.assertEqual({record["id"] for record in output_records}, {"agot:core", "agot:parent", "agot:ancestor"})
            self.assertEqual(next(record for record in output_records if record["id"] == "agot:parent")["fatherId"], "agot:ancestor")
            self.assertEqual(set(output_loadouts), {"agot:core", "agot:parent", "agot:ancestor"})
            self.assertEqual(first["emittedRecords"], 3)
            self.assertEqual(first["prunedRecords"], 2)
            self.assertEqual(first["fullRecordCount"], 3)
            self.assertEqual(first["holderSummaryCount"], 1)
            self.assertEqual(first["removedLoadoutCount"], 2)
            self.assertEqual(
                [summary["id"] for summary in holder_summaries["holders"]],
                ["agot:holder"],
            )
            self.assertEqual(holder_summaries["holders"][0]["titleIds"], ["c_holder"])
            self.assertEqual(json.loads((root / "title-holders.json").read_text(encoding="utf-8"))["agot:holder"][0]["id"], "c_holder")
            self.assertEqual(second["emittedRecords"], 3)
            self.assertEqual(first_hash, second_hash)
            self.assertFalse((root / "shards" / "stale.json").exists())


if __name__ == "__main__":
    unittest.main()
