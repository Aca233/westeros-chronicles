import copy
import unittest

from scripts.agot_character_import.roster import sanitize_runtime_records, select_runtime_character_ids


class RuntimeCharacterRosterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.records = [
            {"id": "agot:canon", "canonTier": "canon", "born": True, "alive": True,
             "fatherId": "agot:dead_parent", "motherId": None, "spouseIds": ["agot:living_spouse"],
             "killerId": None, "relations": []},
            {"id": "agot:dead_parent", "canonTier": "mod_supporting", "born": True, "alive": False,
             "fatherId": "agot:dead_grandparent", "motherId": None, "spouseIds": [],
             "killerId": None, "relations": []},
            {"id": "agot:dead_grandparent", "canonTier": "genealogy", "born": True, "alive": False,
             "fatherId": None, "motherId": None, "spouseIds": [], "killerId": None, "relations": []},
            {"id": "agot:living_spouse", "canonTier": "mod_supporting", "born": True, "alive": True,
             "fatherId": None, "motherId": None, "spouseIds": ["agot:canon"],
             "killerId": None, "relations": []},
            {"id": "agot:dead_sibling", "canonTier": "mod_supporting", "born": True, "alive": False,
             "fatherId": "agot:dead_parent", "motherId": None, "spouseIds": [],
             "killerId": None, "relations": []},
            {"id": "agot:future_child", "canonTier": "canon", "born": False, "alive": False,
             "fatherId": "agot:canon", "motherId": "agot:living_spouse", "spouseIds": [],
             "killerId": None, "relations": []},
            {"id": "agot:title_holder", "canonTier": "mod_supporting", "born": True, "alive": True,
             "fatherId": None, "motherId": None, "spouseIds": [], "killerId": None, "relations": []},
            {"id": "agot:isolated", "canonTier": "mod_supporting", "born": True, "alive": True,
             "fatherId": None, "motherId": None, "spouseIds": [], "killerId": None, "relations": []},
        ]
        self.kinship = {
            "agot:canon": {"fatherId": "agot:dead_parent", "motherId": None,
                           "spouseIds": ["agot:living_spouse"], "childIds": ["agot:future_child"],
                           "siblingIds": ["agot:dead_sibling"]},
            "agot:dead_parent": {"fatherId": "agot:dead_grandparent", "motherId": None,
                                 "spouseIds": [], "childIds": ["agot:canon", "agot:dead_sibling"],
                                 "siblingIds": []},
            "agot:dead_grandparent": {"spouseIds": [], "childIds": ["agot:dead_parent"], "siblingIds": []},
            "agot:living_spouse": {"spouseIds": ["agot:canon"], "childIds": ["agot:future_child"], "siblingIds": []},
            "agot:dead_sibling": {"fatherId": "agot:dead_parent", "spouseIds": [], "childIds": [], "siblingIds": ["agot:canon"]},
            "agot:future_child": {"fatherId": "agot:canon", "motherId": "agot:living_spouse", "spouseIds": [], "childIds": [], "siblingIds": []},
            "agot:title_holder": {"spouseIds": [], "childIds": [], "siblingIds": []},
            "agot:isolated": {"spouseIds": [], "childIds": [], "siblingIds": []},
        }

    def test_keeps_seeds_and_exactly_one_born_relationship_hop(self) -> None:
        retained = select_runtime_character_ids(
            self.records,
            {"agot:title_holder": [{"id": "c_keep"}]},
            self.kinship,
        )
        self.assertEqual(retained, {
            "agot:canon", "agot:dead_parent", "agot:living_spouse", "agot:dead_sibling", "agot:title_holder",
        })
        self.assertNotIn("agot:dead_grandparent", retained)
        self.assertNotIn("agot:future_child", retained)
        self.assertNotIn("agot:isolated", retained)

    def test_sanitizes_removed_references_without_mutating_input(self) -> None:
        records = copy.deepcopy(self.records)
        canon = next(record for record in records if record["id"] == "agot:canon")
        canon["motherId"] = "agot:removed_mother"
        canon["killerId"] = "agot:removed_killer"
        canon["spouseIds"] = ["agot:living_spouse", "agot:removed_spouse", "agot:living_spouse"]
        canon["relations"] = [
            {"kind": "friend", "target_id": "character:living_spouse"},
            {"kind": "rival", "target_id": "character:removed_rival"},
        ]
        original = copy.deepcopy(records)

        sanitized = sanitize_runtime_records(records, {"agot:canon", "agot:living_spouse"})

        self.assertEqual([record["id"] for record in sanitized], ["agot:canon", "agot:living_spouse"])
        result = sanitized[0]
        self.assertIsNone(result["fatherId"])
        self.assertIsNone(result["motherId"])
        self.assertIsNone(result["killerId"])
        self.assertEqual(result["spouseIds"], ["agot:living_spouse"])
        self.assertEqual(result["relations"], [{"kind": "friend", "target_id": "character:living_spouse"}])
        self.assertEqual(records, original)


if __name__ == "__main__":
    unittest.main()
