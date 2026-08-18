# Character Roster Pruning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents for this project.

**Goal:** Replace the 126,978-record runtime dataset with a deterministic 298 AC roster containing living canon/semicanon characters, living current title holders, and exactly one relationship hop around those seeds.

**Architecture:** A shared pure Python roster selector computes retained IDs from the full projected records, current title holders, and full kinship index. Both the normal AGOT importer and a bundled-dataset pruning command use that selector, then sanitize references and regenerate every derived file atomically.

**Tech Stack:** Python 3 standard library, existing AGOT import package, `unittest`, Node dataset audit scripts.

**Spec:** `docs/superpowers/specs/2026-08-18-character-roster-portraits-design.md`

## Global Constraints

- Runtime code must not read CK3 or AGOT mod files.
- Seeds are born, living canon/semicanon records plus born, living 298 AC title holders.
- Expansion includes father, mother, spouses, children, and siblings exactly once; retained relatives must already be born.
- AGOT support characters survive only as living current title holders or one-hop relatives.
- Do not preserve test-version save compatibility.
- Do not use Emoji in code, data, tests, or UI text.
- Do not commit, merge, or push during execution.
- Handwritten edits use minimal `apply_patch` patches; generated dataset files are written only by deterministic generators.

---

### Task 1: Pure runtime roster selection

**Files:**
- Create: `scripts/agot_character_import/roster.py`
- Create: `scripts/test_character_roster.py`

**Interfaces:**
- Consumes: character records shaped like writer `_record()` output, title-holder mapping, and full `_build_kinship_index()` output.
- Produces: `select_runtime_character_ids(records, title_holders, kinship) -> set[str]` and `sanitize_runtime_records(records, retained_ids) -> list[dict[str, Any]]`.

- [ ] **Step 1: Add failing selection tests**

Cover a living canon character, living support title holder, their born parents/spouses/children/siblings, an unborn child, a dead grandparent two hops away, and an isolated support character. Assert only the seed and one-hop born relatives survive.

- [ ] **Step 2: Run the focused test and confirm the expected failure**

Run: `python3 -m unittest scripts.test_character_roster -v`

Expected: import failure for `scripts.agot_character_import.roster`.

- [ ] **Step 3: Implement deterministic selection**

Build `records_by_id`, seed IDs from tier/alive/born and title ownership, then union direct kinship IDs from the original full index once. Never iterate from newly retained relatives.

- [ ] **Step 4: Add failing sanitization tests**

Assert removed parents become `None`, removed spouses and `relations[].target_id` disappear, retained links remain sorted and unique, and input records are not mutated.

- [ ] **Step 5: Implement reference sanitization**

Return stable ID-sorted deep-enough record copies with filtered `fatherId`, `motherId`, `killerId`, `spouseIds`, and AGOT-targeting relation rows.

- [ ] **Step 6: Run focused tests**

Run: `python3 -m unittest scripts.test_character_roster -v`

Expected: all roster tests pass.

### Task 2: Apply selection in the normal AGOT writer

**Files:**
- Modify: `scripts/agot_character_import/writer.py`
- Modify: `scripts/test_agot_character_import.py`

**Interfaces:**
- Consumes: `select_runtime_character_ids()` and `sanitize_runtime_records()` from Task 1.
- Produces: `write_dataset()` output whose records, search index, title map, kinship, counts, and hash all describe the retained roster.

- [ ] **Step 1: Add a failing writer fixture test**

Construct histories containing a canon seed, current support title holder, one-hop dead relative, two-hop dead ancestor, isolated support record, and future child. Assert emitted IDs contain only the approved set.

- [ ] **Step 2: Run the writer test and confirm old behavior fails**

Run: `python3 -m unittest scripts.test_agot_character_import.DatasetWriterTests -v`

Expected: the old writer emits at least the isolated or two-hop record.

- [ ] **Step 3: Integrate roster selection before output generation**

Project all nontechnical records, make spouse links reciprocal, build full kinship, compute retained IDs, sanitize records, filter search rows and title holders, then rebuild final kinship from sanitized records.

- [ ] **Step 4: Make counts and hash describe final output**

Set `emittedRecords` to retained count. Add `projectedRecords`, `prunedRecords`, and retained tier counts. Include sanitized records, final titles, and final kinship in the fingerprint.

- [ ] **Step 5: Run importer tests**

Run: `npm run test:agot-character-import`

Expected: all importer tests pass with revised fixture counts.

### Task 3: Prune the already bundled dataset without source game files

**Files:**
- Create: `scripts/prune_bundled_character_dataset.py`
- Create: `scripts/test_prune_bundled_character_dataset.py`
- Modify: `package.json`

**Interfaces:**
- Consumes: `public/data/agot-characters` records, search index, titles, kinship, and loadout shards.
- Produces: `prune_bundled_dataset(root: Path) -> dict[str, int]` and package command `build:character-roster`.

- [ ] **Step 1: Add a temporary-directory integration test**

Create two character shards plus search, title, kinship, loadout, manifest, and report fixtures. Assert pruning rewrites all structures consistently, removes stale shards, and leaves no dangling IDs.

- [ ] **Step 2: Run the focused integration test and confirm failure**

Run: `python3 -m unittest scripts.test_prune_bundled_character_dataset -v`

Expected: import failure for the new pruning command.

- [ ] **Step 3: Implement atomic bundled pruning**

Read all current records before changing files. Use the shared roster selector, rebuild the search index from surviving existing rows, filter title/loadout maps, rebuild kinship, recompute manifest counts and a deterministic content hash, write to a sibling temporary directory, then replace generated directories/files.

- [ ] **Step 4: Add the package command**

Add:

```json
"build:character-roster": "python3 scripts/prune_bundled_character_dataset.py --characters public/data/agot-characters"
```

- [ ] **Step 5: Run pruning integration tests**

Run: `python3 -m unittest scripts.test_prune_bundled_character_dataset -v`

Expected: all tests pass and repeated fixture runs have identical hashes.

### Task 4: Strengthen dataset audit for the compact roster

**Files:**
- Modify: `scripts/check-agot-character-dataset.mjs`
- Modify: `scripts/test_character_supplements.py`

**Interfaces:**
- Consumes: compact roster manifest and generated maps.
- Produces: failures for out-of-policy records and any dangling person reference.

- [ ] **Step 1: Add audit assertions**

Require `manifest.counts.prunedRecords > 100000`, an emitted count between 10,000 and 13,000 for the real dataset, every living canon/semicanon search entry to exist, every title holder to exist, and all parent/spouse/child/sibling/loadout references to resolve.

- [ ] **Step 2: Add supplement coverage for trimmed records**

Ensure `build_character_supplements.py` accepts the compact shards and cannot recreate references to removed characters.

- [ ] **Step 3: Run audits before pruning**

Run: `npm run check:character-dataset`

Expected: fail because the current bundled manifest still contains 126,978 records.

- [ ] **Step 4: Run the actual project-data pruning command**

Run: `npm run build:character-roster`

Expected: report around 11,500 retained records and over 100,000 pruned records.

- [ ] **Step 5: Re-run dataset and relationship checks**

Run:

```bash
npm run check:character-dataset
npm run test:character-supplements
npm run test:character-runtime
npm run test:lord-relations
npm run test:character-dossier
```

Expected: all pass against the compact runtime dataset.

### Task 5: Roster verification checkpoint

**Files:**
- Verify generated changes under: `public/data/agot-characters/`

**Interfaces:**
- Produces: a compact, offline, internally consistent character dataset for the portrait plan.

- [ ] **Step 1: Verify representative retained and removed IDs**

Use a read-only script to assert Eddard, Jon, recommended start characters, and every current title holder remain; assert a sampled isolated support record and two-hop historical ancestor are absent.

- [ ] **Step 2: Run type checking and build**

Run: `npx tsc --noEmit && npm run build`

Expected: exit code 0.

- [ ] **Step 3: Check generated and handwritten diffs**

Run: `git diff --check` and inspect `git status --short` without staging, committing, merging, or pushing.
