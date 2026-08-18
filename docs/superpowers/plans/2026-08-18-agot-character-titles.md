# AGOT Character Titles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import actual AGOT title holders at `8298.1.1` and show each character's localized highest title without inventing titles for landless characters.

**Architecture:** A focused Python projector reads only AGOT `history/titles`, emits one compact title-holder map, and includes it in the deterministic dataset fingerprint. The TypeScript repository lazy-loads that map and merges paired title IDs and display names before the existing character-event projection applies grants and revocations.

**Tech Stack:** Python 3 standard library, Paradox text parser, TypeScript, Node test runner, Vite

**Spec:** `docs/superpowers/specs/2026-08-18-agot-character-titles-design.md`

## Global Constraints

- Read only Steam workshop AGOT item `2962333032`; never read CK3 vanilla files.
- Project title history at exactly `8298.1.1`.
- Use AGOT Simplified Chinese localization and never expose raw title IDs as UI labels.
- Sort highest tier first and deduplicate localized same-name holdings.
- Preserve dynamic grant and revoke event overlays.
- Show `未持有封地` for genuinely landless characters.
- No Emoji may appear in source or UI copy.
- Do not add save compatibility for schema 1 because the project is in testing.
- Do not use subagents, commit, or push automatically.

---

### Task 1: Deterministic title-history projection

**Files:**
- Create: `scripts/agot_character_import/titles.py`
- Modify: `scripts/test_agot_character_import.py`
- Test fixture: `scripts/fixtures/agot-character-import/title_history.txt`

**Interfaces:**
- Consumes: `Iterable[Path]`, `AgotDate`, and `Mapping[str, str]`.
- Produces: `ProjectedTitle(id: str, name: str, tier: str)` and `project_title_holders(...) -> dict[str, tuple[ProjectedTitle, ...]]` keyed by raw character ID.

- [ ] Add a fixture containing past, same-day, future, cleared, repeated, nested, and same-localized-name title cases.
- [ ] Add tests proving cutoff projection, direct-holder-only parsing, `holder = 0`, stable last-write behavior, rank ordering, localization fallback, and same-name deduplication.
- [ ] Run `python3 -m unittest scripts.test_agot_character_import.TitleHistoryTests -v` and confirm failure because `titles.py` does not exist.
- [ ] Implement tier metadata, readable fallback naming, direct date-block holder extraction, stable event projection, sorting, and deduplication in `titles.py`.
- [ ] Re-run the focused Python tests and confirm they pass.

### Task 2: Dataset emission and AGOT source boundary

**Files:**
- Modify: `scripts/agot_character_import/cli.py`
- Modify: `scripts/agot_character_import/writer.py`
- Modify: `scripts/test_agot_character_import.py`

**Interfaces:**
- Consumes: the projected mapping from Task 1.
- Produces: schema 2 `title-holders.json`, manifest counts `titleHolderCount` and `heldTitleCount`, `source.titleFileCount`, and a dataset hash that includes title holdings.

- [ ] Add writer and importer tests asserting the mapping file, counts, schema 2, deterministic hashes, checksum sensitivity, and rejection of roots without AGOT title history at import time.
- [ ] Run the new tests and confirm they fail against schema 1 and the old writer signature.
- [ ] Extend `import_dataset()` to load only `<AGOT root>/history/titles/*.txt`, include them in `_source_checksum`, and pass projected titles to `write_dataset()`.
- [ ] Extend `write_dataset()` to serialize sorted `agot:` keys and title entries, include them in the fingerprint, update counts, and atomically write `title-holders.json`.
- [ ] Re-run `npm run test:agot-character-import` and confirm all importer tests pass.

### Task 3: Runtime title map validation and lazy merge

**Files:**
- Modify: `src/features/characters/types.ts`
- Modify: `src/features/characters/characterDatasetSchema.ts`
- Modify: `src/features/characters/staticCharacterRepository.ts`
- Modify: `scripts/test-character-runtime.mjs`

**Interfaces:**
- Adds: `StaticCharacterTitle`, `CharacterTitleHolders`, optional static `titleIds`/`titles`, and required resolved `titleIds`/`titles`.
- Produces: `parseCharacterTitleHolders(value)` and repository records enriched from one cached `title-holders.json` request.

- [ ] Add tests for schema 2 parsing, invalid title-map filtering/rejection, one-time map loading, landholder merging, and empty arrays for landless characters.
- [ ] Run `npm run test:character-runtime` and confirm failures before implementation.
- [ ] Add the title types and schema parser, then change manifest validation from schema 1 to schema 2.
- [ ] Cache the title map promise and merge paired IDs/names into every loaded AGOT record returned by `get()`.
- [ ] Re-run runtime tests and `npm run build`.

### Task 4: Event projection and dossier copy

**Files:**
- Modify: `src/features/characters/characterEventStore.ts`
- Modify: `src/features/characters/characterDossier.ts`
- Modify: `scripts/test-character-dossier.mjs`
- Modify: `scripts/test-character-commands.mjs`

**Interfaces:**
- Consumes: paired base `titleIds` and localized `titles`.
- Produces: paired resolved values after `GRANT_TITLE` and `REVOKE_TITLE`; dossier fallback `未持有封地`.

- [ ] Add tests proving an initial localized title is displayed, revoke-by-ID removes its paired label, later grant is appended, and a landless character displays `未持有封地`.
- [ ] Run focused dossier and command tests and confirm the new assertions fail.
- [ ] Initialize both title arrays in `projectCharacterEvents()` and keep them aligned across grant/revoke operations.
- [ ] Replace the old `无头衔人物` fallback with `未持有封地`.
- [ ] Re-run `npm run test:character-dossier`, `npm run test:character-commands`, and `npm run build`.

### Task 5: Regenerate and validate production AGOT data

**Files:**
- Modify generated: `public/data/agot-characters/manifest.json`
- Create generated: `public/data/agot-characters/title-holders.json`
- Modify generated: `public/data/agot-characters/reports/import-report.json`
- Generated shards remain content-equivalent except for the new dataset manifest/hash.
- Modify: `scripts/check-agot-character-dataset.mjs`

**Interfaces:**
- Validates real AGOT 298 AC title holdings for key IDs and landless truthfulness.

- [ ] Extend the dataset checker to require schema 2, title map/count consistency, no raw-ID display labels, and expected titles for `agot:Baratheon_2`, `agot:Stark_3`, and `agot:Arryn_3`.
- [ ] Run `npm run check:character-dataset` and confirm it fails before regeneration.
- [ ] Run `npm run import:agot-characters` against workshop item `2962333032`.
- [ ] Run the dataset checker and inspect representative entries for rank order and same-name deduplication.
- [ ] Run `npm run test:agot-character-import`, `npm run test:character-runtime`, `npm run test:character-dossier`, `npm run test:character-commands`, `npm run build`, and `npm run verify`.
- [ ] Review `git diff --check` and `git status --short`; leave all work uncommitted and unpushed.
