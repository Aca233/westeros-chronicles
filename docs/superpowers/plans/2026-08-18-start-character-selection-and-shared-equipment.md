# 现成人物开局与统一健康装备界面实施计划

> **For agentic workers:** Use superpowers:executing-plans inline; subagents are prohibited by the user.

**Goal:** Replace fixed scenario presets with real-character selection while retaining custom creation, and align NPC health/equipment layout with the player panel.

**Architecture:** A character-start adapter resolves static records and loadouts into a LordProfile. CharacterCreator renders recommended IDs and repository search. NPC health uses the same body-zone/equipment visual grammar as CharacterSheet in read-only mode.

**Spec:** `docs/superpowers/specs/2026-08-18-start-character-selection-and-shared-equipment-design.md`

### Task 1: Existing-character start adapter
- [ ] Add deterministic conversion from ResolvedCharacter items to player ItemSystemState and LordProfile.
- [ ] Add focused tests.

### Task 2: Replace preset page
- [ ] Remove PRESET_SCENARIOS from CharacterCreator.
- [ ] Add recommended real-character cards and full search.
- [ ] Keep custom ruler tab unchanged.

### Task 3: Align NPC health/equipment layout
- [ ] Render the same body-zone visual hierarchy and equipment groups for NPCs.
- [ ] Keep NPC controls read-only and player controls interactive.

### Task 4: Verify
- [ ] Run creator, character-window, item UI, no-emoji, TypeScript and build checks.
