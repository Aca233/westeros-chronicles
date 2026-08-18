# Offline AGOT Artifact Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a localized, deduplicated AGOT artifact catalog and browser-ready images entirely at development time.

**Architecture:** A Python importer validates an allowlisted set of workshop sources, parses Paradox artifact creation/visual/template/modifier data, merges approved Chinese localization, and atomically emits TypeScript definitions, WebP assets, and provenance reports. The existing synchronous item catalog composes the generated definitions while runtime code only renders local assets.

**Tech Stack:** Python 3, existing Paradox parser, Pillow, TypeScript, React, Node tests, Vite

**Spec:** `docs/superpowers/specs/2026-08-18-offline-agot-artifact-import-design.md`

## Global Constraints

- Never read CK3 vanilla files or unapproved Workshop items.
- Generation happens only during development; players never regenerate content.
- No Emoji may appear in generated source or UI copy.
- Do not create shoulder or standalone cloak slots.
- Keep unique lore artifacts non-stackable and globally identifiable.
- Preserve source provenance and Chinese localization source for every generated artifact.
- Do not add save compatibility because the project is in testing.
- Do not use subagents, commit, or push automatically.

---

### Task 1: Pure artifact extraction and normalization

**Files:**
- Create: `scripts/agot_artifact_import/__init__.py`
- Create: `scripts/agot_artifact_import/model.py`
- Create: `scripts/agot_artifact_import/extractor.py`
- Create: `scripts/fixtures/agot-artifact-import/`
- Create: `scripts/test_agot_artifact_import.py`
- Modify: `package.json`

**Interfaces:**
- Produces `extract_source_artifacts(source_root, localization) -> tuple[ArtifactCandidate, ...]` and pure category/equipment normalization helpers.

- [ ] Add fixtures for nested `create_artifact`, visuals, templates, modifiers and Chinese localization.
- [ ] Add failing tests for direct field extraction, unique templates, modifier whitelist mapping, unsupported parameterized entries and type normalization.
- [ ] Run the focused test and confirm the importer module is missing.
- [ ] Implement focused immutable models and extraction using the existing repeated-key Paradox parser.
- [ ] Re-run focused tests until green.

### Task 2: Source validation, localization and deduplication

**Files:**
- Create: `scripts/agot_artifact_import/sources.py`
- Create: `scripts/agot_artifact_import/localization.py`
- Create: `scripts/agot_artifact_import/deduplicate.py`
- Modify: `scripts/test_agot_artifact_import.py`

**Interfaces:**
- Produces an allowlisted `ArtifactSource` registry, `load_source_localization()`, and `deduplicate_candidates()` with explicit canonical exclusions and visual variants.

- [ ] Add failing tests for Workshop ID validation, translation-pack precedence, same-name unique merging, stable IDs and non-unique separation.
- [ ] Implement source descriptor validation without vanilla fallback.
- [ ] Implement scoped Simplified Chinese localization loading and deterministic merge precedence.
- [ ] Implement stable deduplication and conflict reporting.
- [ ] Run all Python importer tests.

### Task 3: Atomic TypeScript, image and provenance generation

**Files:**
- Create: `scripts/agot_artifact_import/writer.py`
- Create: `scripts/agot_artifact_import/cli.py`
- Modify: `scripts/test_agot_artifact_import.py`
- Modify: `package.json`

**Interfaces:**
- Produces `src/data/generated/agotArtifactDefinitions.ts`, local WebP assets, manifest and import report from one `npm run import:agot-artifacts` command.

- [ ] Add failing tests for deterministic TypeScript, DDS-to-WebP output, hashes, reports and atomic replacement.
- [ ] Implement local image deduplication and conversion without upscaling.
- [ ] Implement deterministic item-definition serialization and source reports.
- [ ] Add the import command and run it against the installed Workshop sources.
- [ ] Inspect counts, representative crowns/weapons and unresolved reports.

### Task 4: Runtime catalog integration

**Files:**
- Modify: `src/features/items/types.ts`
- Modify: `src/components/items/ItemImage.tsx`
- Modify: `src/data/itemDefinitions.ts`
- Modify: `scripts/test-item-definitions.mjs`
- Modify: `scripts/check-item-images.mjs`

**Interfaces:**
- Adds local asset image references and composes `AGOT_ARTIFACT_DEFINITIONS` into the existing catalog.

- [ ] Add failing tests for generated catalog breadth, unique-item invariants, source metadata and local image existence.
- [ ] Add the local asset image type with game-icon fallback.
- [ ] Compose generated definitions after excluding existing canonical hand-authored artifacts.
- [ ] Extend image checks to validate the generated manifest and every emitted WebP hash.
- [ ] Run focused item tests and build.

### Task 5: Full verification

**Files:**
- Review all generated and modified files.

- [ ] Run `npm run test:agot-artifact-import`.
- [ ] Run `npm run test:item-definitions` and the full item test group.
- [ ] Run `npm run check:item-images`, `npm run check:no-emoji`, and `npm run build`.
- [ ] Run `npm run verify`.
- [ ] Run `git diff --check` and inspect `git status --short` without touching `.claude/`.
- [ ] Leave changes uncommitted and unpushed.
