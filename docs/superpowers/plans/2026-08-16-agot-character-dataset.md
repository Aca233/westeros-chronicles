# AGOT Character Dataset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert AGOT Mod character history and Simplified Chinese localization into deterministic, classified, date-aware static dataset shards without reading CK3 vanilla files.

**Architecture:** A dependency-free Python parser produces normalized intermediate records, then a projector resolves history as of a requested start date and a writer emits a small search index plus hash-sharded full records. A manifest records source version, checksums, counts, exclusions, conflicts, and importer schema version.

**Tech Stack:** Python 3 standard library, JSON, SHA-256, Node package scripts.

**Spec:** `docs/superpowers/specs/2026-08-16-agot-character-world-design.md`

## Global Constraints

- Only the AGOT Mod root from `AGOT_MOD_ROOT` or workshop item `2962333032` may be read.
- Do not import any file from `steamapps/common/Crusader Kings III/game`.
- Generated output lives under `public/data/agot-characters/`; importer source and tests stay small and reviewable.
- Preserve AGOT raw IDs and dates; never infer Wiki data in this plan.
- Dummy records are reported but never emitted as interactive characters.
- The repository is not a Git worktree; do not initialize Git implicitly.

---

### Task 1: Parse Paradox Script Into a Lossless Syntax Tree

**Files:**
- Create: `scripts/agot_character_import/__init__.py`
- Create: `scripts/agot_character_import/paradox.py`
- Create: `scripts/fixtures/agot-character-import/paradox_sample.txt`
- Create: `scripts/test_agot_character_import.py`

**Interfaces:**
- Produces: `Token(kind: str, value: str, line: int)` and `parse_document(text: str) -> list[Entry]`.
- `Entry` exposes `key`, scalar `value`, nested `children`, source `line`, and preceding/inline comments.

- [ ] **Step 1: Create the representative fixture and write the failing tokenizer/parser tests**

```text
# Canon character
Stark_3 = {
    name = Eddard # Canon, THE Eddard
    trait = honest
    trait = just
    8298.1.1 = { trait = family_first }
    8299.1.10 = { death = { death_reason = death_execution } }
}
Semi_1 = { 8290.1.1 = { add_character_flag = canon_status_semicanon } }
Ancestor_1 = { 8200.1.1 = { birth = yes } }
Dummy_1 = { name = Dummy }
```

```python
class ParadoxParserTests(unittest.TestCase):
    def test_preserves_repeated_traits_dates_and_comments(self):
        entries = parse_document(FIXTURE.read_text(encoding="utf-8-sig"))
        eddard = next(entry for entry in entries if entry.key == "Stark_3")
        self.assertEqual(eddard.first("name").value, "Eddard")
        self.assertEqual([e.value for e in eddard.all("trait")], ["honest", "just"])
        self.assertEqual(eddard.first("8299.1.10").first("death").value, None)
        self.assertIn("Canon", eddard.comments)
```

- [ ] **Step 2: Run the parser test and verify RED**

Run: `python3 -m unittest scripts.test_agot_character_import.ParadoxParserTests -v`
Expected: FAIL because `scripts.agot_character_import.paradox` does not exist.

- [ ] **Step 3: Implement tokenization, comments, quoted strings, repeated keys, and nested blocks**

```python
@dataclass(frozen=True)
class Entry:
    key: str
    value: str | None
    children: tuple["Entry", ...]
    line: int
    comments: tuple[str, ...] = ()

    def all(self, key: str) -> list["Entry"]:
        return [child for child in self.children if child.key == key]

    def first(self, key: str) -> "Entry | None":
        return next((child for child in self.children if child.key == key), None)
```

Implement a character scanner rather than regex-only brace matching so quoted braces, comments, repeated keys, UTF-8 BOM, and inline blocks remain valid.

- [ ] **Step 4: Run the parser test and verify GREEN**

Run: `python3 -m unittest scripts.test_agot_character_import.ParadoxParserTests -v`
Expected: PASS.

- [ ] **Step 5: Run the existing project verification checkpoint**

Run: `npm run verify`
Expected: all existing checks and build pass. If Git is later initialized, commit parser and fixture as `feat: parse AGOT character history`.

---

### Task 2: Normalize and Classify AGOT Character Records

**Files:**
- Create: `scripts/agot_character_import/model.py`
- Create: `scripts/agot_character_import/characters.py`
- Modify: `scripts/test_agot_character_import.py`

**Interfaces:**
- Consumes: `parse_document()` from Task 1.
- Produces: `CharacterHistory`, `DatedEvent`, `CanonTier`, and `extract_character_histories(path: Path) -> list[CharacterHistory]`.

- [ ] **Step 1: Write failing classification tests**

```python
def test_classifies_canon_semicanon_ancestor_and_dummy(self):
    records = extract_character_histories(FIXTURE)
    self.assertEqual(by_id(records)["Stark_3"].tier, CanonTier.CANON)
    self.assertEqual(by_id(records)["Semi_1"].tier, CanonTier.SEMICANON)
    self.assertEqual(by_id(records)["Ancestor_1"].tier, CanonTier.GENEALOGY)
    self.assertEqual(by_id(records)["Dummy_1"].tier, CanonTier.TECHNICAL)
```

- [ ] **Step 2: Run classification tests and verify RED**

Run: `python3 -m unittest scripts.test_agot_character_import.CharacterExtractionTests -v`
Expected: FAIL because the extraction types/functions do not exist.

- [ ] **Step 3: Implement normalized extraction and explicit tier rules**

```python
class CanonTier(StrEnum):
    CANON = "canon"
    SEMICANON = "semicanon"
    MOD_SUPPORTING = "mod_supporting"
    GENEALOGY = "genealogy"
    TECHNICAL = "technical"
```

Tier priority must be: Dummy/technical file or marker, canon flag, semicanon flag, ancestor file, then Mod supporting. Capture raw ID, source file/line, name key, dynasty, parents, sexuality, culture, faith, raw six attributes, undated traits, dated entries, DNA presence, and flags.

- [ ] **Step 4: Run extraction tests and verify GREEN**

Run: `python3 -m unittest scripts.test_agot_character_import.CharacterExtractionTests -v`
Expected: PASS with exact tier counts from the fixture.

- [ ] **Step 5: Checkpoint**

Run: `python3 -m unittest scripts.test_agot_character_import -v && npm run check:no-emoji`
Expected: all importer tests pass and source contains no Emoji.

---

### Task 3: Resolve Start-Date State Without Scheduling Future Canon

**Files:**
- Create: `scripts/agot_character_import/timeline.py`
- Modify: `scripts/fixtures/agot-character-import/paradox_sample.txt`
- Modify: `scripts/test_agot_character_import.py`

**Interfaces:**
- Consumes: `CharacterHistory` and `DatedEvent`.
- Produces: `AgotDate.parse(raw: str)`, `to_ac_year()`, and `project_character(history, start_date) -> ProjectedCharacter`.

- [ ] **Step 1: Write failing date projection tests**

```python
def test_projects_only_events_on_or_before_start(self):
    projected = project_character(self.eddard, AgotDate.parse("8298.6.1"))
    self.assertTrue(projected.alive)
    self.assertIn("family_first", projected.traits)
    self.assertNotIn("death_execution", projected.applied_events)
    self.assertEqual(projected.display_year, 298)
    self.assertEqual(projected.future_events, ())
```

Also assert that a 298 AC start does not emit 299 AC death as a runtime timer.

- [ ] **Step 2: Run timeline tests and verify RED**

Run: `python3 -m unittest scripts.test_agot_character_import.TimelineTests -v`
Expected: FAIL because projection is not implemented.

- [ ] **Step 3: Implement date ordering and supported history operations**

```python
@dataclass(frozen=True, order=True)
class AgotDate:
    year: int
    month: int
    day: int

    @property
    def ac_year(self) -> int:
        return self.year - 8000
```

Support birth, death, trait add/remove/inactivate, spouse links, parent IDs, explicit attributes, and recognized relation effects. Preserve unsupported operations as diagnostics. Do not return future events in runtime data.

- [ ] **Step 4: Run timeline tests and verify GREEN**

Run: `python3 -m unittest scripts.test_agot_character_import.TimelineTests -v`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `python3 -m unittest scripts.test_agot_character_import -v`
Expected: all parser, extraction, and timeline tests pass.

---

### Task 4: Import AGOT Simplified Chinese Localization

**Files:**
- Create: `scripts/agot_character_import/localization.py`
- Create: `scripts/fixtures/agot-character-import/localization_l_simp_chinese.yml`
- Modify: `scripts/test_agot_character_import.py`

**Interfaces:**
- Produces: `load_localization(paths: Iterable[Path]) -> dict[str, str]` and `resolve_character_names(record, localization) -> CharacterNames`.

- [ ] **Step 1: Write failing localization precedence tests**

```python
def test_resolves_chinese_name_and_keeps_raw_fallback(self):
    loc = load_localization([LOCALIZATION_FIXTURE])
    self.assertEqual(resolve_name("Eddard", loc), "艾德")
    self.assertEqual(resolve_name("Unknown_Key", loc), "Unknown_Key")
```

- [ ] **Step 2: Run localization tests and verify RED**

Run: `python3 -m unittest scripts.test_agot_character_import.LocalizationTests -v`
Expected: FAIL because localization loader does not exist.

- [ ] **Step 3: Implement BOM-safe YAML-line parsing and text cleanup**

Parse Paradox localization keys without adding a YAML dependency. Preserve original name key and remove only game formatting tokens; do not invent translations.

- [ ] **Step 4: Run localization tests and verify GREEN**

Run: `python3 -m unittest scripts.test_agot_character_import.LocalizationTests -v`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `python3 -m unittest scripts.test_agot_character_import -v`
Expected: all importer unit tests pass.

---

### Task 5: Emit Deterministic Search Index, Shards, and Manifest

**Files:**
- Create: `scripts/agot_character_import/writer.py`
- Create: `scripts/agot_character_import/cli.py`
- Modify: `scripts/test_agot_character_import.py`
- Create: `public/data/agot-characters/.gitkeep`

**Interfaces:**
- Produces: `write_dataset(records, output_root, source_manifest, start_date) -> DatasetManifest`.
- Output files: `manifest.json`, `search-index.json`, `shards/<00..ff>.json`, `reports/import-report.json`.

- [ ] **Step 1: Write failing deterministic writer tests**

```python
def test_writer_is_deterministic_and_excludes_technical_records(self):
    first = write_fixture_dataset(self.temp / "a")
    second = write_fixture_dataset(self.temp / "b")
    self.assertEqual(tree_hash(self.temp / "a"), tree_hash(self.temp / "b"))
    self.assertNotIn("agot:Dummy_1", load_all_shards(self.temp / "a"))
    self.assertEqual(first.schema_version, 1)
```

- [ ] **Step 2: Run writer tests and verify RED**

Run: `python3 -m unittest scripts.test_agot_character_import.DatasetWriterTests -v`
Expected: FAIL because writer/CLI do not exist.

- [ ] **Step 3: Implement stable sorting, SHA-256 sharding, atomic writes, and report counts**

```python
def shard_for(character_id: str) -> str:
    return hashlib.sha256(character_id.encode("utf-8")).hexdigest()[:2]
```

Write sorted compact JSON with UTF-8 Chinese text, stable separators, a schema version, source checksums, tier counts, unsupported operation counts, missing references, and excluded technical counts. Use a temporary directory and replace output only after a successful complete build.

- [ ] **Step 4: Run writer tests and verify GREEN**

Run: `python3 -m unittest scripts.test_agot_character_import.DatasetWriterTests -v`
Expected: PASS and identical fixture tree hashes.

- [ ] **Step 5: Checkpoint**

Run: `python3 -m unittest scripts.test_agot_character_import -v`
Expected: all dataset tests pass.

---

### Task 6: Enforce AGOT-Only Source Boundaries and Validate the Installed Mod

**Files:**
- Create: `scripts/check-agot-character-dataset.mjs`
- Modify: `package.json`
- Modify: `scripts/test_agot_character_import.py`
- Generate: `public/data/agot-characters/manifest.json`
- Generate: `public/data/agot-characters/search-index.json`
- Generate: `public/data/agot-characters/shards/*.json`
- Generate: `public/data/agot-characters/reports/import-report.json`

**Interfaces:**
- CLI: `python3 -m scripts.agot_character_import.cli --mod-root <AGOT_ROOT> --start-date 8298.1.1 --output public/data/agot-characters`.
- Check: `npm run check:character-dataset` validates schema, counts, source path policy, technical exclusion, and shard references.

- [ ] **Step 1: Write a failing source-boundary test**

```python
def test_cli_rejects_vanilla_game_root(self):
    with self.assertRaisesRegex(ValueError, "AGOT workshop item 2962333032"):
        validate_mod_root(Path("C:/Steam/steamapps/common/Crusader Kings III/game"))
```

- [ ] **Step 2: Run boundary test and verify RED**

Run: `python3 -m unittest scripts.test_agot_character_import.SourceBoundaryTests -v`
Expected: FAIL until `validate_mod_root()` rejects vanilla paths and checks AGOT `descriptor.mod`.

- [ ] **Step 3: Implement boundary validation and package scripts**

Add:

```json
"import:agot-characters": "python -m scripts.agot_character_import.cli --start-date 8298.1.1 --output public/data/agot-characters",
"test:agot-character-import": "python -m unittest scripts.test_agot_character_import -v",
"check:character-dataset": "node scripts/check-agot-character-dataset.mjs"
```

Append `test:agot-character-import` and `check:character-dataset` to `verify` before `build`.

- [ ] **Step 4: Generate from the installed Mod and inspect counts**

Run in WSL:

```bash
AGOT_MOD_ROOT='/mnt/c/Program Files (x86)/Steam/steamapps/workshop/content/1158310/2962333032' \
python3 -m scripts.agot_character_import.cli --start-date 8298.1.1 --output public/data/agot-characters
```

Expected manifest invariants: `totalSourceRecords` near 129375, `canon` near 2760, `semicanon` near 3786, and excluded technical count greater than 2000. Exact values come from the source version and are recorded, not hard-coded as permanent truth.

- [ ] **Step 5: Run full verification**

Run: `npm run verify`
Expected: importer tests, dataset checks, all existing tests, TypeScript, and Vite build pass. Record generated dataset size and manifest checksum in the execution report.
