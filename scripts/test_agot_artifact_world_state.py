from __future__ import annotations

import unittest
from pathlib import Path

from scripts.agot_artifact_import.world_state import (
    ArtifactEffectSpec,
    CharacterSnapshot,
    extract_title_parents,
    project_artifact_world_state,
)
from scripts.agot_character_import.timeline import AgotDate


FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures" / "agot-artifact-world-state"
SCENARIO = FIXTURE_ROOT / "scenario.txt"


def specs() -> dict[str, ArtifactEffectSpec]:
    return {
        "create_longclaw": ArtifactEffectSpec("artifact.longclaw", unique=True, subcategory="longsword"),
        "create_old_winter_crown": ArtifactEffectSpec("artifact.old-winter-crown", unique=True, subcategory="crown"),
        "create_new_winter_crown": ArtifactEffectSpec("artifact.new-winter-crown", unique=True, subcategory="crown"),
        "create_iron_throne": ArtifactEffectSpec("artifact.iron-throne", unique=True, subcategory="throne_special"),
        "create_unknown_relic": ArtifactEffectSpec("artifact.unknown", unique=True, subcategory="miscellaneous"),
        "create_duplicate_unique": ArtifactEffectSpec("artifact.duplicate", unique=True, subcategory="longsword"),
    }


def characters() -> dict[str, CharacterSnapshot]:
    return {
        "agot:Stark_7": CharacterSnapshot("agot:Stark_7", alive=True, born=True, birth_year=283, dynasty_id="dynn_Stark"),
        "agot:Stark_8": CharacterSnapshot("agot:Stark_8", alive=True, born=True, birth_year=283, dynasty_id="dynn_Stark"),
        "agot:Stark_old": CharacterSnapshot("agot:Stark_old", alive=False, born=True, birth_year=1, dynasty_id="dynn_Stark"),
        "agot:Mormont_1": CharacterSnapshot("agot:Mormont_1", alive=False, born=True, birth_year=200, dynasty_id="dynn_Mormont"),
        "agot:Mormont_2": CharacterSnapshot("agot:Mormont_2", alive=True, born=True, birth_year=230, dynasty_id="dynn_Mormont"),
        "agot:Baratheon_2": CharacterSnapshot("agot:Baratheon_2", alive=True, born=True, birth_year=262, dynasty_id="dynn_Baratheon"),
    }


def project(date: str):
    parents = extract_title_parents([FIXTURE_ROOT / "landed_titles.txt"])
    return project_artifact_world_state(
        scenario_file=SCENARIO,
        root_effect_id="agot_historical_artifacts_setup",
        helper_effect_ids={"agot_assign_starting_family_weapons_effect"},
        start_date=AgotDate.parse(date),
        effect_specs=specs(),
        characters=characters(),
        direct_title_holders={"d_kings_landing": "agot:Baratheon_2"},
        title_parents=parents,
    )


class ArtifactWorldStateProjectionTests(unittest.TestCase):
    def test_projects_longclaw_to_jeor_in_298_and_jon_after_299(self) -> None:
        in_298 = project("8298.1.1").artifacts["artifact.longclaw"]
        in_299 = project("8299.1.1").artifacts["artifact.longclaw"]

        self.assertEqual(in_298["lawfulControllerId"], "agot:Mormont_2")
        self.assertEqual(in_298["placement"], {"type": "character", "characterId": "agot:Mormont_2"})
        self.assertEqual(in_299["lawfulControllerId"], "agot:Stark_7")

    def test_298_has_neither_historical_winter_crown_branch(self) -> None:
        result = project("8298.1.1")

        self.assertNotIn("artifact.old-winter-crown", result.artifacts)
        self.assertNotIn("artifact.new-winter-crown", result.artifacts)

    def test_title_holder_climbs_landed_title_parents_but_throne_stays_at_holding(self) -> None:
        result = project("8298.1.1")
        throne = result.artifacts["artifact.iron-throne"]

        self.assertEqual(throne["lawfulControllerId"], "agot:Baratheon_2")
        self.assertEqual(throne["projectionKind"], "political-symbol")
        self.assertEqual(result.artifacts["artifact.longclaw"]["projectionKind"], "portable-asset")
        self.assertEqual(throne["placement"], {
            "type": "title",
            "titleId": "b_the_red_keep",
            "controllerId": "agot:Baratheon_2",
        })

    def test_unknown_condition_is_reported_without_guessing(self) -> None:
        result = project("8298.1.1")

        self.assertNotIn("artifact.unknown", result.artifacts)
        self.assertTrue(any(issue["kind"] == "unsupported_condition" for issue in result.issues))

    def test_unique_definition_has_one_instance_and_source_equip_is_ignored(self) -> None:
        result = project("8298.1.1")

        self.assertEqual(sum(record["definitionId"] == "artifact.duplicate" for record in result.artifacts.values()), 1)
        self.assertTrue(any(issue["kind"] == "duplicate_unique_definition" for issue in result.issues))
        self.assertTrue(all(record["equipped"] is False for record in result.artifacts.values()))
        self.assertEqual(len({record["instanceId"] for record in result.artifacts.values()}), len(result.artifacts))

    def test_non_unique_effects_are_never_instantiated(self) -> None:
        non_unique = specs()
        non_unique["create_longclaw"] = ArtifactEffectSpec("artifact.longclaw", unique=False, subcategory="longsword")
        parents = extract_title_parents([FIXTURE_ROOT / "landed_titles.txt"])

        result = project_artifact_world_state(
            scenario_file=SCENARIO,
            root_effect_id="agot_historical_artifacts_setup",
            helper_effect_ids={"agot_assign_starting_family_weapons_effect"},
            start_date=AgotDate.parse("8298.1.1"),
            effect_specs=non_unique,
            characters=characters(),
            direct_title_holders={"d_kings_landing": "agot:Baratheon_2"},
            title_parents=parents,
        )

        self.assertNotIn("artifact.longclaw", result.artifacts)
        self.assertTrue(any(issue["kind"] == "non_unique_effect" for issue in result.issues))


if __name__ == "__main__":
    unittest.main()
