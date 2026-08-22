import copy
import inspect
import unittest

from scripts.agot_character_import.roster import (
    RosterReferences,
    build_holder_summaries,
    partition_runtime_characters,
    resolve_holder_succession,
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


class HolderSuccessionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.records = [
            {"id": "agot:Count_A", "canonTier": "canon", "born": True, "alive": True, "dynastyId": "dynn_A"},
            {"id": "agot:Count_B", "canonTier": "semicanon", "born": True, "alive": True, "dynastyId": "dynn_Other"},
            {"id": "agot:King_K", "canonTier": "canon", "born": True, "alive": True, "dynastyId": "dynn_B"},
            {"id": "agot:Duke_D", "canonTier": "canon", "born": True, "alive": True, "dynastyId": "dynn_C"},
            {"id": "agot:pruned_lord", "canonTier": "mod_supporting", "born": True, "alive": True,
             "dynastyId": "dynn_Pruned", "name": "被裁领主"},
            {"id": "agot:pruned_mid", "canonTier": "mod_supporting", "born": True, "alive": True,
             "dynastyId": "dynn_Mid"},
        ]
        self.retained = {"agot:Count_A", "agot:Count_B", "agot:King_K", "agot:Duke_D"}
        self.title_holders = {
            "agot:Count_A": [{"id": "c_a", "name": "A 伯国", "tier": "county"}],
            "agot:Count_B": [{"id": "c_b", "name": "B 伯国", "tier": "county"}],
            "agot:King_K": [{"id": "k_k", "name": "K 王国", "tier": "kingdom"}],
            "agot:Duke_D": [{"id": "d_d", "name": "D 公国", "tier": "duchy"}],
            "agot:pruned_lord": [
                {"id": "b_y", "name": "男爵领Y", "tier": "barony"},
                {"id": "c_z", "name": "Z 伯国", "tier": "county"},
                {"id": "c_void", "name": "无主之地", "tier": "county"},
            ],
            "agot:pruned_mid": [{"id": "d_w", "name": "W 公国", "tier": "duchy"}],
        }
        self.parent = {
            "b_y": "c_a",
            "c_z": "d_w",
            "d_w": "k_k",
            # d_w 的上级 k_k 在册；c_z 的直属上级 d_w 被裁剪，应跳级归王
        }
        self.centroid = {
            "c_a": (10.0, 10.0),
            "c_b": (50.0, 50.0),
            "k_k": (0.0, 0.0),
            "d_d": (20.0, 20.0),
            "c_iso": (11.0, 11.0),
            "c_near_b": (12.0, 12.0),
        }

    def test_barony_goes_to_direct_retained_count(self) -> None:
        holders, _ = resolve_holder_succession(
            self.records, self.title_holders, self.retained,
            title_parent=self.parent, title_centroid=self.centroid,
        )
        self.assertEqual([t["id"] for t in holders["agot:Count_A"]], ["c_a", "b_y"],
                         "主头衔（伯爵国）排在吸收的男爵领之前")
        remaining_own = [t["id"] for t in holders.get("agot:pruned_lord", [])]
        self.assertNotIn("b_y", remaining_own)

    def test_pruned_intermediate_level_is_skipped_upward(self) -> None:
        holders, _ = resolve_holder_succession(
            self.records, self.title_holders, self.retained,
            title_parent=self.parent, title_centroid=self.centroid,
        )
        king_titles = [t["id"] for t in holders["agot:King_K"]]
        self.assertIn("c_z", king_titles, "直属公爵被裁剪时伯国应跳归在册国王")
        self.assertIn("d_w", king_titles)
        self.assertNotIn("agot:pruned_mid", holders)

    def test_stats_count_each_resolution_path(self) -> None:
        records = [{"id": "agot:count", "canonTier": "canon", "born": True, "alive": True, "dynastyId": "dynn_A"}]
        title_holders = {
            "agot:count": [{"id": "c_a", "name": "A 伯国", "tier": "county"}],
            "agot:ghost": [
                {"id": "b_y", "name": "男爵领Y", "tier": "barony"},
                {"id": "c_void", "name": "无主之地", "tier": "county"},
            ],
        }
        _, stats = resolve_holder_succession(
            records, title_holders, {"agot:count"},
            title_parent={"b_y": "c_a"}, title_centroid={"c_a": (0.0, 0.0)},
        )
        self.assertEqual(stats, {"reassignedByLiege": 1, "reassignedByProximity": 0, "unresolvedHolders": 1})

    def test_proximity_beats_dynasty_for_orphan_without_liege(self) -> None:
        records = self.records + [{"id": "agot:far_kin", "canonTier": "mod_supporting", "born": True,
                                   "alive": True, "dynastyId": "dynn_Pruned"}]
        title_holders = dict(self.title_holders)
        title_holders["agot:far_kin"] = [{"id": "c_far_kin", "name": "远亲伯国", "tier": "county"}]
        parent = {**self.parent, "c_far_kin": "e_missing"}
        centroid = {**self.centroid, "c_far_kin": (13.0, 13.0)}
        previous = {"agot:far_kin": {"id": "agot:far_kin", "dynastyId": "dynn_Pruned"}}
        holders, stats = resolve_holder_succession(
            records, title_holders, self.retained,
            title_parent=parent, title_centroid=centroid, previous_summaries=previous,
        )
        holder_ids = {t["id"] for t in holders["agot:Count_A"]}
        self.assertIn("c_far_kin", holder_ids, "无封建上级时应就近归并给最近的同级别领主")
        self.assertEqual(stats["reassignedByProximity"], 1)

    def test_equidistant_candidates_prefer_same_dynasty_then_id(self) -> None:
        records = self.records + [
            {"id": "agot:Count_C", "canonTier": "canon", "born": True, "alive": True, "dynastyId": "dynn_B"},
            {"id": "agot:orphan", "canonTier": "mod_supporting", "born": True, "alive": True,
             "dynastyId": "dynn_B"},
        ]
        retained = self.retained | {"agot:Count_C"}
        title_holders = dict(self.title_holders)
        title_holders["agot:Count_C"] = [{"id": "c_c", "name": "C 伯国", "tier": "county"}]
        title_holders["agot:orphan"] = [{"id": "c_iso", "name": "孤地伯国", "tier": "county"}]
        centroid = {**self.centroid, "c_c": (12.0, 12.0)}
        previous = {"agot:orphan": {"id": "agot:orphan", "dynastyId": "dynn_B"}}
        holders, _ = resolve_holder_succession(
            records, title_holders, retained,
            title_parent={}, title_centroid=centroid, previous_summaries=previous,
        )
        # c_iso(11,11) 到 c_a(10,10) 与 c_c(12,12) 距离相等；同族 dynn_B 的 Count_C 应胜出。
        merged = {t["id"] for t in holders.get("agot:Count_C", [])}
        self.assertIn("c_iso", merged)
        self.assertNotIn("c_iso", {t["id"] for t in holders.get("agot:Count_A", [])})

    def test_unresolved_holder_keeps_titles_and_flows_into_summaries(self) -> None:
        holders, stats = resolve_holder_succession(
            self.records, self.title_holders, self.retained,
            title_parent=self.parent, title_centroid=self.centroid,
        )
        kept = [t["id"] for t in holders["agot:pruned_lord"]]
        self.assertEqual(kept, ["c_void"], "完全无法继承的头衔保持原映射")
        self.assertEqual(stats["unresolvedHolders"], 1)
        summaries = build_holder_summaries(self.records, holders, self.retained)
        summary_ids = {summary["id"] for summary in summaries}
        self.assertIn("agot:pruned_lord", summary_ids)

    def test_resolved_map_is_idempotent(self) -> None:
        holders, first_stats = resolve_holder_succession(
            self.records, self.title_holders, self.retained,
            title_parent=self.parent, title_centroid=self.centroid,
        )
        survivors = {cid: titles for cid, titles in holders.items() if cid in self.retained}
        again, second_stats = resolve_holder_succession(
            self.records, survivors, self.retained,
            title_parent=self.parent, title_centroid=self.centroid,
        )
        self.assertEqual(first_stats["reassignedByLiege"], 3)
        self.assertEqual(first_stats["reassignedByProximity"], 0)
        self.assertEqual(second_stats["reassignedByLiege"], 0)
        self.assertEqual(second_stats["reassignedByProximity"], 0)
        self.assertEqual(survivors, again)


if __name__ == "__main__":
    unittest.main()
