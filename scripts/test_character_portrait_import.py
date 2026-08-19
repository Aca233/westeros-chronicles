import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

from PIL import Image

from scripts.character_portrait_import.matcher import MatchedPortrait, PortraitMatchResult, match_characters
from scripts.character_portrait_import.cli import run_import
from scripts.character_portrait_import.wiki import AwoiafClient, WikiCharacterPage, WikiImageInfo
from scripts.character_portrait_import.writer import _convert_to_webp, _json_bytes, write_portrait_dataset


FIXTURES = Path(__file__).resolve().parent / "fixtures" / "character-portraits"


class PortraitWikiClientTests(unittest.TestCase):
    def test_builds_character_catalog_from_fixture_api(self) -> None:
        category = json.loads((FIXTURES / "wiki-category.json").read_text(encoding="utf-8"))
        pages = json.loads((FIXTURES / "wiki-pages.json").read_text(encoding="utf-8"))
        images = json.loads((FIXTURES / "wiki-imageinfo.json").read_text(encoding="utf-8"))

        def fetch(params):
            if params.get("list") == "categorymembers":
                return category
            if params.get("prop") == "revisions|info":
                return pages
            if params.get("prop") == "imageinfo":
                return images
            raise AssertionError(f"unexpected request: {params}")

        catalog = AwoiafClient(fetch_json=fetch, request_delay=0).build_catalog()

        self.assertEqual([page.title for page in catalog], ["Eddard Stark", "Jon Snow"])
        jon = next(page for page in catalog if page.title == "Jon Snow")
        self.assertEqual(jon.firstname, "Jon")
        self.assertEqual(jon.lastname, "Snow")
        self.assertEqual(jon.birth_year, 283)
        self.assertIn("Eddard Stark", jon.father)
        self.assertEqual(jon.image.author, "Example Artist")
        self.assertEqual(jon.image.license_name, "Fair use")


def page(title, firstname, lastname="", allegiance="", birth_year=None, father="", mother=""):
    return WikiCharacterPage(
        title=title, page_url=f"https://example.test/{title}", firstname=firstname, lastname=lastname,
        aliases="", allegiance=allegiance, father=father, mother=mother, birth_year=birth_year,
        image_caption="", image=None,
    )


class PortraitMatcherTests(unittest.TestCase):
    def setUp(self) -> None:
        self.records = [
            {"id": "agot:Stark_3", "nameKey": "Eddard", "dynastyId": "dynn_Stark", "birthDate": "8263.1.1",
             "fatherId": "agot:Stark_1", "motherId": None},
            {"id": "agot:Stark_1", "nameKey": "Rickard", "dynastyId": "dynn_Stark", "birthDate": "8230.1.1",
             "fatherId": None, "motherId": None},
            {"id": "agot:Stark_7", "nameKey": "Jon", "dynastyId": "dynn_Stark", "birthDate": "8283.1.1",
             "fatherId": "agot:Stark_3", "motherId": None},
            {"id": "agot:NoHouse_1", "nameKey": "Pate", "dynastyId": None, "birthDate": None,
             "fatherId": None, "motherId": None},
        ]
        self.pages = [
            page("Eddard Stark", "Eddard", "Stark", "House Stark", 263, "Rickard Stark"),
            page("Eddard Tallhart", "Eddard", "Tallhart", "House Tallhart", 270),
            page("Jon Snow", "Jon", "Snow", "House Stark", 283, "Eddard Stark"),
            page("Pate", "Pate"),
        ]

    def test_accepts_full_identity_and_rejects_name_only(self) -> None:
        result = match_characters(self.records, {}, self.pages, {})
        self.assertEqual(result.accepted["agot:Stark_3"].page.title, "Eddard Stark")
        self.assertIn("agot:NoHouse_1", result.unmatched)

    def test_override_handles_jon_snow_without_treating_stark_as_lastname(self) -> None:
        result = match_characters(
            self.records, {}, self.pages,
            {"agot:Stark_7": {"pageTitle": "Jon Snow", "focalPoint": "50% 20%"}},
        )
        match = result.accepted["agot:Stark_7"]
        self.assertEqual(match.source, "override")
        self.assertEqual(match.focal_point, "50% 20%")

    def test_old_overrides_format_compatibility(self) -> None:
        string_override_result = match_characters(
            self.records, {}, self.pages,
            {"agot:Stark_7": "Jon Snow"},
        )
        self.assertEqual(string_override_result.accepted["agot:Stark_7"].page.title, "Jon Snow")

        dict_override_result = match_characters(
            self.records, {}, self.pages,
            {"agot:Stark_7": {"pageTitle": "Jon Snow", "focalPoint": "50% 18%"}},
        )
        self.assertEqual(dict_override_result.accepted["agot:Stark_7"].focal_point, "50% 18%")

    def test_manual_image_title_override_uses_specified_image_and_evidence(self) -> None:
        custom_image = WikiImageInfo(
            filename="Custom_Jon.png", url="https://images.test/custom_jon.png",
            description_url="https://awoiaf.westeros.org/index.php/File:Custom_Jon.png",
            width=500, height=700, mime="image/png", author="Custom Artist",
            license_name="Fair use", license_url="",
        )
        images = {"Custom_Jon.png": custom_image}
        result = match_characters(
            self.records, {}, self.pages,
            {
                "agot:Stark_7": {
                    "pageTitle": "Jon Snow",
                    "imageTitle": "File:Custom_Jon.png",
                    "focalPoint": "50% 25%",
                    "evidence": {
                        "name": "Jon",
                        "dynasty": "Stark allegiance",
                        "birth": "283",
                        "parents": "Ned Stark",
                    },
                }
            },
            images=images,
        )
        match = result.accepted["agot:Stark_7"]
        self.assertEqual(match.page.image.filename, "Custom_Jon.png")
        self.assertEqual(match.evidence["name"], "Jon")
        self.assertEqual(match.focal_point, "50% 25%")

    def test_nonexistent_image_title_raises_error(self) -> None:
        with self.assertRaises(ValueError):
            match_characters(
                self.records, {}, self.pages,
                {"agot:Stark_7": {"pageTitle": "Jon Snow", "imageTitle": "File:Nonexistent_Image.png"}},
            )

    def test_duplicate_override_page_title_raises_error(self) -> None:
        with self.assertRaises(ValueError):
            match_characters(
                self.records, {}, self.pages,
                {
                    "agot:Stark_3": {"pageTitle": "Eddard Stark"},
                    "agot:Stark_1": {"pageTitle": "Eddard Stark"},
                },
            )

    def test_duplicate_override_image_title_raises_error(self) -> None:
        custom_image = WikiImageInfo(
            filename="Shared.png", url="https://images.test/shared.png",
            description_url="https://awoiaf.westeros.org/index.php/File:Shared.png",
            width=500, height=700, mime="image/png",
        )
        images = {"Shared.png": custom_image}
        with self.assertRaises(ValueError):
            match_characters(
                self.records, {}, self.pages,
                {
                    "agot:Stark_3": {"pageTitle": "Eddard Stark", "imageTitle": "Shared.png"},
                    "agot:Stark_7": {"pageTitle": "Jon Snow", "imageTitle": "Shared.png"},
                },
                images=images,
            )

    def test_family_and_birth_conflicts_are_not_accepted(self) -> None:
        wrong_pages = [page("Eddard Tallhart", "Eddard", "Tallhart", "House Tallhart", 100)]
        result = match_characters(self.records, {}, wrong_pages, {})
        self.assertNotIn("agot:Stark_3", result.accepted)

    def test_close_candidates_stay_ambiguous_and_output_is_deterministic(self) -> None:
        records = [{"id": "agot:A", "nameKey": "Alyn", "dynastyId": "dynn_Velaryon", "birthDate": "8270.1.1"}]
        pages = [
            page("Alyn Velaryon", "Alyn", "Velaryon", "House Velaryon", 270),
            page("Alyn of Hull", "Alyn", "Velaryon", "House Velaryon", 271),
        ]
        first = match_characters(records, {}, pages, {})
        second = match_characters(list(reversed(records)), {}, list(reversed(pages)), {})
        self.assertIn("agot:A", first.ambiguous)
        self.assertEqual(first.ambiguous, second.ambiguous)


class PortraitWriterTests(unittest.TestCase):
    def test_preserves_copyright_attribution_without_literal_symbol_in_generated_json(self) -> None:
        payload = _json_bytes({"caption": "Artist © Publisher"}, pretty=True)

        self.assertNotIn("©".encode("utf-8"), payload)
        self.assertEqual(json.loads(payload)["caption"], "Artist © Publisher")

    @staticmethod
    def image_bytes(size=(192, 192), image_format="PNG", color=(80, 60, 40)) -> bytes:
        output = BytesIO()
        Image.new("RGB", size, color).save(output, format=image_format)
        return output.getvalue()

    def test_caps_large_source_dimensions_during_webp_conversion(self) -> None:
        converted = _convert_to_webp(self.image_bytes(size=(641, 161)))

        with Image.open(BytesIO(converted)) as image:
            self.assertEqual(image.format, "WEBP")
            self.assertEqual(image.width, 640)
            self.assertLessEqual(image.height, 800)

    @staticmethod
    def illustrated_page(title="Eddard Stark", caption="Eddard Stark, by Artist", image_url=None):
        return WikiCharacterPage(
            title=title, page_url=f"https://awoiaf.westeros.org/index.php/{title.replace(' ', '_')}",
            firstname=title.split()[0], lastname=title.split()[-1], aliases="", allegiance="House Stark",
            father="", mother="", birth_year=263, image_caption=caption,
            image=WikiImageInfo(
                filename=f"{title}.png", url=image_url or f"https://images.test/{title.replace(' ', '_')}.png",
                description_url=f"https://awoiaf.westeros.org/index.php/File:{title.replace(' ', '_')}.png",
                width=900, height=1200, mime="image/png", author="Artist", license_name="Fair use",
                license_url="https://example.test/license",
            ),
        )

    def test_writes_deterministic_webp_shards_attribution_and_reports(self) -> None:
        match = MatchedPortrait("agot:Stark_3", self.illustrated_page(), 140, "automatic", "50% 18%")
        result = PortraitMatchResult(
            accepted={"agot:Stark_3": match}, ambiguous={"agot:A": ["Alyn One", "Alyn Two"]},
            unmatched={"agot:Missing"}, conflicts={},
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = write_portrait_dataset(result, root / "data", root / "assets", lambda _: self.image_bytes())
            first_manifest = (root / "data" / "manifest.json").read_bytes()
            second = write_portrait_dataset(result, root / "data", root / "assets", lambda _: self.image_bytes())
            second_manifest = (root / "data" / "manifest.json").read_bytes()
            refs = {
                character_id: ref
                for path in (root / "data" / "shards").glob("*.json")
                for character_id, ref in json.loads(path.read_text(encoding="utf-8")).items()
            }
            attribution = json.loads((root / "data" / "attribution.json").read_text(encoding="utf-8"))
            asset = root / refs["agot:Stark_3"]["assetPath"].removeprefix("/assets/character-portraits/")
            asset = root / "assets" / asset.name
            with Image.open(asset) as image:
                self.assertEqual(image.format, "WEBP")
                self.assertLessEqual(image.width, 640)
                self.assertLessEqual(image.height, 800)
            self.assertEqual(first.accepted, 1)
            self.assertEqual(second.accepted, 1)
            self.assertEqual(first_manifest, second_manifest)
            self.assertEqual(attribution[refs["agot:Stark_3"]["attributionId"]]["author"], "Artist")
            self.assertEqual(len(list((root / "data" / "shards").glob("*.json"))), 256)

    def test_rejects_television_and_non_character_images(self) -> None:
        for forbidden in ("HBO television series screenshot", "House Sigil", "Map of the North", "Weapon illustration", "Actor promo still"):
            rejected = MatchedPortrait(
                "agot:Stark_3", self.illustrated_page(caption=forbidden), 140, "automatic"
            )
            result = PortraitMatchResult(accepted={"agot:Stark_3": rejected})
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                report = write_portrait_dataset(result, root / "data", root / "assets", lambda _: self.image_bytes())
                self.assertEqual(report.accepted, 0)
                self.assertEqual(report.rejected, 1)

    def test_duplicate_original_url_raises_error(self) -> None:
        page1 = self.illustrated_page("Jon Snow", image_url="https://images.test/same.png")
        page2 = self.illustrated_page("Robb Stark", image_url="https://images.test/same.png")
        result = PortraitMatchResult(
            accepted={
                "agot:Stark_7": MatchedPortrait("agot:Stark_7", page1, 100, "automatic"),
                "agot:Stark_6": MatchedPortrait("agot:Stark_6", page2, 100, "automatic"),
            }
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(ValueError):
                write_portrait_dataset(result, root / "data", root / "assets", lambda _: self.image_bytes())

    def test_duplicate_image_content_hash_raises_error(self) -> None:
        page1 = self.illustrated_page("Jon Snow", image_url="https://images.test/jon.png")
        page2 = self.illustrated_page("Robb Stark", image_url="https://images.test/robb.png")
        result = PortraitMatchResult(
            accepted={
                "agot:Stark_7": MatchedPortrait("agot:Stark_7", page1, 100, "automatic"),
                "agot:Stark_6": MatchedPortrait("agot:Stark_6", page2, 100, "automatic"),
            }
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            # Returning identical bytes for different URLs
            with self.assertRaises(ValueError):
                write_portrait_dataset(result, root / "data", root / "assets", lambda _: self.image_bytes())


class PortraitCliTests(unittest.TestCase):
    def test_runs_entire_import_against_injected_fixture_catalog(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            characters = root / "characters"
            (characters / "shards").mkdir(parents=True)
            (characters / "kinship").mkdir()
            (characters / "shards" / "00.json").write_text(json.dumps([{
                "id": "agot:Stark_3", "name": "艾德", "nameKey": "Eddard", "dynastyId": "dynn_Stark",
                "birthDate": "8263.1.1", "fatherId": None, "motherId": None,
            }]), encoding="utf-8")
            (characters / "kinship" / "00.json").write_text(json.dumps({
                "agot:Stark_3": {"spouseIds": [], "childIds": [], "siblingIds": []},
            }), encoding="utf-8")
            catalog = [PortraitWriterTests.illustrated_page()]

            report = run_import(
                character_root=characters,
                output_data_root=root / "portrait-data",
                output_asset_root=root / "portrait-assets",
                client=type("FixtureClient", (), {
                    "build_catalog": lambda self, extra_titles=(), extra_images=(): catalog,
                    "images": {},
                })(),
                fetch_bytes=lambda _: PortraitWriterTests.image_bytes(),
                overrides={},
            )

            self.assertEqual(report.accepted, 1)
            self.assertTrue((root / "portrait-data" / "manifest.json").exists())
            self.assertEqual(len(list((root / "portrait-data" / "shards").glob("*.json"))), 256)


if __name__ == "__main__":
    unittest.main()
