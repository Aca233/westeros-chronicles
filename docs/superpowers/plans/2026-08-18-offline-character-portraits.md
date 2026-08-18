# Offline Character Portraits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents for this project.

**Goal:** Import every reliably matchable AWOIAF character illustration into local WebP assets and display it through one reusable portrait component everywhere stable characters appear.

**Architecture:** A fixture-tested Python importer catalogs AWOIAF character pages, scores strict identity matches against the compact runtime roster, downloads approved infobox illustrations, and writes sharded mappings plus attribution and audit reports. A cached TypeScript portrait repository and one fallback-safe React component render those local assets without runtime network access.

**Tech Stack:** Python 3, MediaWiki API, Pillow, JSON, TypeScript, React 18, existing Vite application and Node test scripts.

**Spec:** `docs/superpowers/specs/2026-08-18-character-roster-portraits-design.md`

## Global Constraints

- Run this plan only after `2026-08-18-character-roster-pruning.md` succeeds.
- Use AWOIAF infobox illustrations; reject sigils, maps, objects, actor photographs, and television screenshots.
- Runtime must use only local JSON and WebP files and must never call Wiki.
- Only unique high-confidence matches are accepted; name-only matches are rejected.
- Preserve page, image, author, caption, and license metadata without inventing missing values.
- Do not generate AI portraits.
- Do not use Emoji in code, reports, or UI text.
- Do not commit, merge, or push during execution.
- Handwritten edits use minimal `apply_patch` patches; downloaded/generated outputs are written only by the importer.

---

### Task 1: Portrait dataset types, schema, and repository

**Files:**
- Modify: `src/features/characters/types.ts`
- Create: `src/features/characters/characterPortraitSchema.ts`
- Create: `src/features/characters/characterPortraitRepository.ts`
- Create: `scripts/test-character-portraits-runtime.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `CharacterPortraitRef`, `CharacterPortraitAttribution`, `parseCharacterPortraitShard()`, and `CharacterPortraitRepository.get(id)`.

- [ ] **Step 1: Add failing runtime schema tests**

Test valid `agot:` IDs, local `/assets/character-portraits/*.webp` paths, attribution IDs, optional `focalPoint`, duplicate rejection, malformed remote URL rejection, and an empty shard.

- [ ] **Step 2: Run and confirm failure**

Run: `node scripts/test-character-portraits-runtime.mjs`

Expected: module import failure.

- [ ] **Step 3: Implement types and parsers**

Use a `CharacterPortraitShard = Partial<Record<CharacterId, CharacterPortraitRef>>`; validate that the object key equals `characterId` and that paths cannot be remote URLs.

- [ ] **Step 4: Implement cached sharded repository**

Resolve the same two-hex SHA-256 shard convention already recorded in the character search hit, cache each JSON promise, return copied refs, and return `undefined` when no portrait exists.

- [ ] **Step 5: Add package test command and run it**

Add `test:character-portraits-runtime` and run it. Expected: all tests pass.

### Task 2: MediaWiki client and catalog cache

**Files:**
- Create: `scripts/character_portrait_import/__init__.py`
- Create: `scripts/character_portrait_import/wiki.py`
- Create: `scripts/fixtures/character-portraits/wiki-category.json`
- Create: `scripts/fixtures/character-portraits/wiki-pages.json`
- Create: `scripts/fixtures/character-portraits/wiki-imageinfo.json`
- Create: `scripts/test_character_portrait_import.py`

**Interfaces:**
- Produces: `WikiCharacterPage`, `WikiImageInfo`, and `AwoiafClient.build_catalog()` with an injectable JSON fetcher and request delay.

- [ ] **Step 1: Add failing fixture-driven client tests**

Test category pagination, batched page queries, extraction of `Infobox character` fields, page image filename, and image metadata including author and license.

- [ ] **Step 2: Run and confirm failure**

Run: `python3 -m unittest scripts.test_character_portrait_import.PortraitWikiClientTests -v`

Expected: import failure for the new package.

- [ ] **Step 3: Implement the API client**

Use `https://awoiaf.westeros.org/api.php`, explicit User-Agent, `maxlag`, bounded retry for timeout/429/5xx, category continuation, batches no larger than API limits, and a disk response cache outside committed output.

- [ ] **Step 4: Parse only character infobox data**

Extract `firstname`, `lastname`, aliases, allegiance/house, father, mother, birth date, `image`, and `image_caption`; normalize wiki markup only for matching while retaining raw caption for attribution.

- [ ] **Step 5: Run client tests**

Expected: fixture tests pass without network.

### Task 3: Strict identity matcher and manual overrides

**Files:**
- Create: `scripts/character_portrait_import/matcher.py`
- Create: `scripts/character_portrait_import/overrides.json`
- Modify: `scripts/test_character_portrait_import.py`

**Interfaces:**
- Consumes: compact static records, kinship records, and `WikiCharacterPage` catalog.
- Produces: `match_characters(records, kinship, pages, overrides) -> PortraitMatchResult` with accepted, ambiguous, unmatched, and conflict collections.

- [ ] **Step 1: Add failing matching tests**

Cover exact full identity, name-only rejection, dynasty conflict, birth-year conflict, parent confirmation, close first/second score ambiguity, duplicate page assignment, and explicit Jon Snow override.

- [ ] **Step 2: Run tests and confirm expected failures**

Run: `python3 -m unittest scripts.test_character_portrait_import.PortraitMatcherTests -v`

- [ ] **Step 3: Implement normalization and scoring**

Normalize punctuation, accents, wiki links, bastard surnames, and `dynn_` slugs. Require a name signal plus at least one family, parent, or chronology signal. Hard conflicts reject candidates; accepted candidates require the documented threshold and margin.

- [ ] **Step 4: Implement override validation**

Overrides map stable character IDs to exact Wiki page titles and optional focal points. Reject missing characters, missing pages, page reuse, and pages without character infoboxes.

- [ ] **Step 5: Run all matcher tests**

Expected: deterministic results regardless of input order.

### Task 4: Image validation, conversion, attribution, and output writer

**Files:**
- Create: `scripts/character_portrait_import/writer.py`
- Modify: `scripts/test_character_portrait_import.py`

**Interfaces:**
- Produces: `write_portrait_dataset(matches, output_data_root, output_asset_root, fetch_bytes) -> PortraitImportReport`.

- [ ] **Step 1: Add failing image/output tests**

Use local PNG/JPEG fixture bytes to test WebP conversion, maximum 640x800 bounds, deterministic filenames, sharded refs, attribution preservation, report categories, stale asset removal, and repeatable output hashes.

- [ ] **Step 2: Add rejection tests**

Reject captions/metadata identifying sigils, maps, weapons, crowns, actors, HBO, television screenshots, images below minimum dimensions, unsupported MIME, and corrupt bytes.

- [ ] **Step 3: Run tests and confirm failure**

Run: `python3 -m unittest scripts.test_character_portrait_import.PortraitWriterTests -v`

- [ ] **Step 4: Implement Pillow conversion and deterministic output**

Apply EXIF orientation, convert to RGB/RGBA WebP, preserve source aspect ratio, cap dimensions, strip metadata from served files, hash content for stable filenames, and atomically replace generated directories.

- [ ] **Step 5: Write attribution and reports**

Write `manifest.json`, `attribution.json`, `shards/*.json`, and separate accepted, ambiguous, unmatched, rejected, and failed report data with sorted keys and IDs.

- [ ] **Step 6: Run writer tests**

Expected: all output tests pass byte-for-byte on repeated runs.

### Task 5: Portrait import CLI and real offline import

**Files:**
- Create: `scripts/character_portrait_import/cli.py`
- Modify: `package.json`
- Generate: `public/assets/character-portraits/*.webp`
- Generate: `public/data/agot-character-portraits/**`

**Interfaces:**
- Produces package command `import:character-portraits` with `--cache`, `--offline-cache-only`, `--limit`, and output-root options.

- [ ] **Step 1: Add CLI orchestration test**

Run the CLI against fixture cache and a temporary compact character dataset; assert it never contacts network in `--offline-cache-only` mode and writes a complete report.

- [ ] **Step 2: Implement CLI argument parsing and orchestration**

Load the compact roster and kinship, build/read Wiki catalog, apply overrides, fetch image metadata and bytes, write output, then print concise Chinese counts.

- [ ] **Step 3: Add package commands**

Add `import:character-portraits` and `test:character-portrait-import`.

- [ ] **Step 4: Run fixture tests**

Run: `npm run test:character-portrait-import`

Expected: all tests pass without live network.

- [ ] **Step 5: Run the real import with respectful API pacing**

Run: `npm run import:character-portraits`

Expected: local assets and reports are generated; isolated failures are reported rather than silently accepted.

- [ ] **Step 6: Inspect high-value mappings**

Read the generated entries for all recommended start characters and a sample of ambiguous repeated names. Add only evidence-backed override entries, rerun import, and keep ambiguous cases unresolved.

### Task 6: Unified fallback-safe portrait component

**Files:**
- Create: `src/components/CharacterPortrait.tsx`
- Modify: `src/components/CameoPortrait.tsx`
- Modify: `src/index.css`
- Create: `scripts/check-character-portraits-ui.mjs`

**Interfaces:**
- Produces `<CharacterPortrait characterId houseIcon size priority className />`, internally backed by the portrait repository.

- [ ] **Step 1: Add failing structural UI checks**

Require local portrait repository use, `img` error fallback, lazy loading for non-priority images, house/cameo fallback, focal-point application, and no direct `awoiaf.westeros.org` URL in runtime source.

- [ ] **Step 2: Implement repository-backed loading state**

Cache portrait refs globally through the repository. Cancel stale state updates when character IDs change. An absent ref or failed image sets fallback without logging repeated errors.

- [ ] **Step 3: Implement visual variants**

Support hero, card, and compact dimensions; use `object-fit: cover`, mapping focal point, accessible alt text supplied by caller, and existing CK3 frame colors.

- [ ] **Step 4: Run UI checks and TypeScript**

Run: `node scripts/check-character-portraits-ui.mjs && npx tsc --noEmit`

Expected: both pass.

### Task 7: Replace character placeholders across current UI

**Files:**
- Modify: `src/components/Ck3CharacterWindow.tsx`
- Modify: `src/components/CharacterSearch.tsx`
- Modify: `src/components/CharacterCreator.tsx`
- Modify: `scripts/check-ck3-character-window.mjs`
- Modify: `scripts/check-character-creator.mjs`

**Interfaces:**
- Consumes: `CharacterPortrait` from Task 6.
- Produces: portrait-backed dossier hero, relationship rows, search results, and recommended start cards.

- [ ] **Step 1: Extend checks for all required surfaces**

Require `CharacterPortrait` in the hero portrait, relationship row, `CharacterSearch`, and `data-recommended-characters`; forbid direct house-icon-only avatar blocks in those surfaces.

- [ ] **Step 2: Replace the CK3 hero and relationship avatars**

Pass `dossier.kind === 'npc' ? dossier.id : dossier.player.canonicalCharacterId`, and each related `person.id`. Preserve house sigil background and cameo fallback.

- [ ] **Step 3: Replace search and recommended start avatars**

Use search hit IDs and resolved character IDs. Keep all existing click behavior and loading states unchanged.

- [ ] **Step 4: Run focused UI tests**

Run:

```bash
npm run check:ck3-character-window
npm run check:character-creator
node scripts/check-character-portraits-ui.mjs
npm run test:existing-character-start
```

Expected: all pass.

### Task 8: Portrait dataset audit and final verification

**Files:**
- Create: `scripts/check-character-portrait-dataset.mjs`
- Modify: `package.json`
- Verify generated portrait files and reports.

**Interfaces:**
- Produces package command `check:character-portraits` and integration into `npm run verify`.

- [ ] **Step 1: Implement portrait data audit**

Verify every mapping ID exists in the compact roster, every asset is a real WebP, every attribution ID resolves, every referenced file is present, no generated image is orphaned, no Wiki page is multiply assigned without an explicit allow rule, and all runtime paths are local.

- [ ] **Step 2: Add commands to the full verification chain**

Place portrait import unit tests, runtime tests, UI checks, and dataset checks before the production build. Do not make live network import part of `npm run verify`.

- [ ] **Step 3: Run targeted checks**

Run:

```bash
npm run test:character-portrait-import
npm run test:character-portraits-runtime
npm run check:character-portraits
node scripts/check-character-portraits-ui.mjs
npx tsc --noEmit
```

Expected: all pass offline.

- [ ] **Step 4: Run complete verification**

Run: `npm run verify`

Expected: zero failures and successful Vite production build. A bundle-size warning is acceptable; an error is not.

- [ ] **Step 5: Check diffs without committing**

Run `git diff --check`, inspect generated report counts, and report exact retained-character and accepted-portrait totals. Do not stage, commit, merge, or push.
