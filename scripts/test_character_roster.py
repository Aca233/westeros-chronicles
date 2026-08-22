import copy
import inspect
import unittest

from scripts.agot_character_import.roster import (
    RosterReferences,
    build_holder_summaries,
    partition_runtime_characters,
    sanitize_runtime_records,
    select_runtime_character_ids,
)


class RuntimeCharacterRosterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.records = [
            {"id": "agot:canon", "canonTier": "canon", "born": True, "alive": True,
             "fatherId": "agot:dead_parent", "motherId": None, "spouseIds": ["agot:living_spouse"],
             "killerId": None, "relations": []},
            {"id": "agot:semicanon", "canonTier": "semicanon", "born": True, "alive": True,
             "fatherId": None, "motherId": None, "spouseIds": [], "killerId": None, "relations": []},
            {"id": "agot:playable", "canonTier": "mod_supporting", "born": True, "alive": True,
             "fatherId": None, "motherId": None, "spouseIds": [], "killerId": None, "relations": []},
            {"id": "agot:curated", "canonTier": "mod_supporting", "born": True, "alive": True,
             "fatherId": None, "motherId": None, "spouseIds": [], "killerId": None, "relations": []},
            {"id": "agot:start", "canonTier": "mod_supporting", "born": True, "alive": True,
             "fatherId": None, "motherId": None, "spouseIds": [], "killerId": None, "relations": []},
            {"id": "agot:artifact", "canonTier": "mod_supporting", "born": True, "alive": True,
             "fatherId": None, "motherId": None, "spouseIds": [], "killerId": None, "relations": []},
            {"id": "agot:dead_parent", "canonTier": "mod_supporting", "born": True, "alive": False,
             "fatherId": "agot:dead_grandparent", "motherId": None, "spouseIds": [],
             "killerId": None, "relations": []},
            {"id": "agot:dead_grandparent", "canonTier": "genealogy", "born": True, "alive": False,
             "fatherId": None, "motherId": None, "spouseIds": [], "killerId": None, "relations": []},
            {"id": "agot:living_spouse", "canonTier": "mod_supporting", "born": True, "alive": True,
             "fatherId": None, "motherId": None, "spouseIds": ["agot:canon"],
             "killerId": None, "relations": []},
            {"id": "agot:future_child", "canonTier": "canon", "born": False, "alive": False,
             "fatherId": "agot:canon", "motherId": "agot:living_spouse", "spouseIds": [],
             "killerId": None, "relations": []},
            {"id": "agot:minor_holder", "canonTier": "mod_supporting", "name": "小领主", "dynastyId": "dynn_Minor",
             "born": True, "alive": True, "fatherId": None, "motherId": None, "spouseIds": [],
             "killerId": None, "relations": []},
            {"id": "agot:isolated_fill", "canonTier": "mod_supporting", "born": True, "alive": True,
             "fatherId": None, "motherId": None, "spouseIds": [], "killerId": None, "relations": []},
            {"id": "agot:dead_holder", "canonTier": "mod_supporting", "name": "亡故领主", "dynastyId": None,
             "born": True, "alive": False, "fatherId": None, "motherId": None, "spouseIds": [],
             "killerId": None, "relations": []},
        ]
        self.kinship = {
            "agot:canon": {"fatherId": "agot:dead_parent", "motherId": None,
                           "spouseIds": ["agot:living_spouse"], "childIds": ["agot:future_child"],
                           "siblingIds": []},
            "agot:dead_parent": {"fatherId": "agot:dead_grandparent", "motherId": None,
                                 "spouseIds": [], "childIds": ["agot:canon"], "siblingIds": []},
            "agot:dead_grandparent": {"spouseIds": [], "childIds": ["agot:dead_parent"], "siblingIds": []},
            "agot:living_spouse": {"spouseIds": ["agot:canon"], "childIds": [], "siblingIds": []},
            "agot:future_child": {"fatherId": "agot:canon", "motherId": "agot:living_spouse", "spouseIds": [], "childIds": [], "siblingIds": []},
        }
        self.references = RosterReferences(
            playable_ids=frozenset({"agot:playable"}),
            content_ids=frozenset({"agot:curated"}),
            start_state_ids=frozenset({"agot:start"}),
            artifact_holder_ids=frozenset({"agot:artifact"}),
            title_holders={
                "agot:minor_holder": [{"id": "c_minor", "name": "小伯爵领", "tier": "county"}],
                "agot:dead_holder": [{"id": "c_dead", "name": "旧伯爵领", "tier": "county"}],
            },
            kinship=self.kinship,
        )

    def test_reference_closure_keeps_explicit_seeds_and_one_born_kinship_hop(self) -> None:
        retained = select_runtime_character_ids(self.records, self.references)
        self.assertTrue({
            "agot:canon", "agot:semicanon", "agot:playable", "agot:curated",
            "agot:start",
        }.issubset(retained))
        # 原著角色的一层亲属中，只有 canon/semicanon/genealogy 层级的才保留；
        # mod_supporting 亲属不再因亲属跳板保留完整档案。
        self.assertNotIn("agot:dead_parent", retained)
        self.assertNotIn("agot:living_spouse", retained)
        self.assertNotIn("agot:artifact", retained, "唯一物品持有人不再自动保留完整档案")
        self.assertNotIn("agot:isolated_fill", retained)
        self.assertIn("agot:dead_grandparent", retained, "族谱角色保留完整档案")
        self.assertNotIn("agot:future_child", retained)
        self.assertNotIn("agot:minor_holder", retained, "持有头衔不再自动保留完整档案")

    def test_unretained_title_holder_becomes_summary_not_full_record(self) -> None:
        full_ids, summaries = partition_runtime_characters(self.records, self.references)
        self.assertNotIn("agot:minor_holder", full_ids)
        self.assertEqual(summaries["agot:minor_holder"]["titleIds"], ["c_minor"])
        self.assertEqual(summaries["agot:minor_holder"]["name"], "小领主")
        self.assertEqual(summaries["agot:minor_holder"]["alive"], True)
        self.assertEqual(summaries["agot:minor_holder"]["displayLabel"], "小伯爵领")
        self.assertIn("agot:dead_holder", summaries)

    def test_holder_summaries_keep_only_unretained_holders(self) -> None:
        retained = select_runtime_character_ids(self.records, self.references)
        summaries = build_holder_summaries(self.records, self.references.title_holders, retained)
        self.assertEqual({summary["id"] for summary in summaries}, {"agot:minor_holder", "agot:dead_holder"})

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

    def test_roster_selection_has_no_headcount_constants(self) -> None:
        source = inspect.getsource(select_runtime_character_ids) + inspect.getsource(build_holder_summaries)
        for constant in ("5553", "799"):
            self.assertNotIn(constant, source)


if __name__ == "__main__":
    unittest.main()
