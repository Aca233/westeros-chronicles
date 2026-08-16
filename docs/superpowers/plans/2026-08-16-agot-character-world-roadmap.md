# AGOT Character World Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this roadmap plan-by-plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a scalable, source-backed AGOT character world without loading CK3 vanilla character data or sending the full roster to the AI.

**Architecture:** Four independently testable plans build the immutable AGOT dataset, runtime save overlays, AI scene integration, and finally the character browser plus Wiki enrichment. Each plan must pass the existing `npm run verify` gate before the next begins.

**Tech Stack:** Python 3 standard library, TypeScript 5.7, React 18, Dexie 4, Zustand 5, Node test runner, Vite 6.

**Spec:** `docs/superpowers/specs/2026-08-16-agot-character-world-design.md`

## Global Constraints

- Character-world import reads AGOT Mod `2962333032` only; it must never read the CK3 vanilla game directory.
- Wiki supplements narrative/source fields only and never generates CK3 attributes or overrides stable AGOT IDs.
- Novel and AGOT Mod continuity is primary; television-only facts remain isolated.
- Static source data is immutable; save events and overrides have highest priority.
- Post-start canonical future events are not scheduled automatically.
- Technical/Dummy characters are excluded from interactive rosters.
- Education traits render first; unknown AGOT traits retain identity without invented numeric effects.
- No Emoji in first-party source or metadata; game icons remain preferred.
- `/mnt/c/AGOT` is not currently a Git worktree. Do not initialize Git implicitly; replace commit checkpoints with verified test checkpoints unless the user initializes a repository.

## Plan Order

1. `docs/superpowers/plans/2026-08-16-agot-character-dataset.md`
   - AGOT parser, classification, timeline projection, localization, manifest, and static shards.
2. `docs/superpowers/plans/2026-08-16-agot-character-runtime.md`
   - Browser repository, Dexie save overlay, event journal, rollback, attributes, knowledge, and memories.
3. `docs/superpowers/plans/2026-08-16-agot-character-ai.md`
   - Scene selection, prompt slices, validated character commands, store integration, and AI limits.
4. `docs/superpowers/plans/2026-08-16-agot-character-browser-wiki.md`
   - Search/browser UI, character cards, family/source views, Wiki matching, conflict review, and attribution.

## Cross-Plan Release Gates

- [ ] Dataset plan produces a deterministic manifest from the installed AGOT Mod and proves no vanilla reads.
- [ ] Runtime plan loads a shard, applies and rolls back save events, and leaves snapshots compact.
- [ ] AI plan selects no more than twelve full characters and validates all character mutations by ID.
- [ ] Browser/Wiki plan exposes knowledge-safe search and source-backed enrichment without blocking AGOT-only use.
- [ ] Final `npm run verify` passes after every plan.
