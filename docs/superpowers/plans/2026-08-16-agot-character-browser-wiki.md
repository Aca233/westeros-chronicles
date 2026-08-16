# AGOT Character Browser and Wiki Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a CK3-style, knowledge-safe character browser and enrich AGOT records with source-attributed Chinese Wiki facts without making Wiki availability a runtime dependency.

**Architecture:** The UI queries the existing lightweight index and opens full records on demand. A separate offline MediaWiki importer caches revisioned source payloads, generates conservative match candidates, applies only confirmed field-level enrichments, and emits attribution/conflict reports consumed by the browser.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Dexie/static repository, Python standard library MediaWiki client, existing `GameIcon` and coat-of-arms components.

**Spec:** `docs/superpowers/specs/2026-08-16-agot-character-world-design.md`

## Global Constraints

- Requires dataset, runtime, and AI plans.
- Wiki failures never block AGOT-only import, startup, search, or gameplay.
- Never merge by name alone; `probable` and `conflict` records require explicit review.
- Novel/AGOT facts are primary; television-only facts remain tagged and excluded from novel state.
- UI never exposes system truths, future facts, or undiscovered secrets.
- Use existing game icons first, Lucide only when no game icon exists, and no Emoji.
- No 3D character models.
- The repository is not a Git worktree; do not initialize Git implicitly.

---

### Task 1: Add Offline Wiki Cache and Field-Level Source Types

**Files:**
- Create: `scripts/agot_wiki_import/__init__.py`
- Create: `scripts/agot_wiki_import/mediawiki.py`
- Create: `scripts/agot_wiki_import/model.py`
- Create: `scripts/fixtures/agot-wiki/page-response.json`
- Create: `scripts/test_agot_wiki_import.py`

**Interfaces:**
- Produces: `WikiPage`, `WikiFact`, `SourceCitation`, `fetch_page(api_url, title, cache_root)`.
- Cache key includes page ID and revision ID; fixture tests perform no network access.

- [ ] **Step 1: Write failing cache and revision tests**

```python
def test_cached_revision_is_reused_without_network(self):
    page = fetch_page(API, "艾德·史塔克", self.cache, transport=forbidden_transport)
    self.assertEqual(page.revision_id, 12345)
    self.assertEqual(page.url, "https://asoiaf.fandom.com/zh/wiki/艾德·史塔克")
```

- [ ] **Step 2: Run and verify RED**

Run: `python3 -m unittest scripts.test_agot_wiki_import.WikiCacheTests -v`
Expected: FAIL because importer modules do not exist.

- [ ] **Step 3: Implement MediaWiki API transport, revisioned cache, and typed source records**

Use `urllib.request` with timeout, user agent, retry limit, and explicit error messages. Parsing must accept cached JSON when network is unavailable. Facts carry `continuity`, `validFrom`, `visibility`, `field`, and citation.

- [ ] **Step 4: Run and verify GREEN**

Run: `python3 -m unittest scripts.test_agot_wiki_import.WikiCacheTests -v`
Expected: PASS entirely from fixtures.

- [ ] **Step 5: Checkpoint**

Run: `python3 -m unittest scripts.test_agot_wiki_import -v`
Expected: all Wiki fixture tests pass.

---

### Task 2: Generate Conservative AGOT-to-Wiki Match Candidates

**Files:**
- Create: `scripts/agot_wiki_import/matcher.py`
- Create: `scripts/agot_wiki_import/manual_matches.json`
- Modify: `scripts/test_agot_wiki_import.py`

**Interfaces:**
- Produces: `match_character(agot, wiki_candidates, manual_matches) -> MatchResult`.
- Status is `confirmed`, `probable`, `unmatched`, or `conflict`; result includes evidence and score components.

- [ ] **Step 1: Write failing same-name and explicit-map tests**

```python
def test_same_name_without_family_or_dates_is_not_confirmed(self):
    result = match_character(agot_jon, [wiki_jon_wrong_house], {})
    self.assertNotEqual(result.status, "confirmed")

def test_manual_mapping_confirms_major_character(self):
    result = match_character(eddard, [wiki_eddard], {"agot:Stark_3": wiki_eddard.page_id})
    self.assertEqual(result.status, "confirmed")
```

- [ ] **Step 2: Run and verify RED**

Run: `python3 -m unittest scripts.test_agot_wiki_import.WikiMatcherTests -v`
Expected: FAIL because matcher is missing.

- [ ] **Step 3: Implement evidence scoring with a hard no-name-only rule**

Require at least two independent evidence classes for automatic confirmation unless a manual mapping exists. Evidence classes are names/aliases, house, close kin, dates, title/location, and explicit source ID. Any incompatible close-kin or birth evidence yields `conflict`.

- [ ] **Step 4: Run and verify GREEN**

Run: `python3 -m unittest scripts.test_agot_wiki_import.WikiMatcherTests -v`
Expected: PASS for ambiguity, conflict, and manual confirmation.

- [ ] **Step 5: Checkpoint**

Run: `python3 -m unittest scripts.test_agot_wiki_import -v`
Expected: all matcher/cache tests pass.

---

### Task 3: Emit Knowledge-Safe Enrichment and Attribution Reports

**Files:**
- Create: `scripts/agot_wiki_import/writer.py`
- Create: `scripts/agot_wiki_import/cli.py`
- Modify: `scripts/test_agot_wiki_import.py`
- Generate: `public/data/agot-characters/wiki/enrichment.json`
- Generate: `public/data/agot-characters/wiki/match-report.json`
- Generate: `public/data/agot-characters/wiki/attribution.json`

**Interfaces:**
- CLI consumes the dataset manifest plus cache and writes enrichment without mutating AGOT shards.
- Runtime joins enrichment by `CharacterId` and field.

- [ ] **Step 1: Write failing continuity and secret-output tests**

```python
def test_writer_separates_tv_and_hides_future_secret_facts(self):
    output = build_enrichment([novel_fact, tv_fact, future_secret])
    self.assertIn(novel_fact, output["novelFacts"])
    self.assertIn(tv_fact, output["televisionFacts"])
    self.assertNotIn(future_secret, output["publicFacts"])
```

- [ ] **Step 2: Run and verify RED**

Run: `python3 -m unittest scripts.test_agot_wiki_import.WikiWriterTests -v`
Expected: FAIL because writer is missing.

- [ ] **Step 3: Implement immutable enrichment and report writer**

Only `confirmed` matches enter runtime enrichment. `probable`, `unmatched`, and `conflict` remain report-only. Include page URL, page/revision ID, continuity, field names, and generated-at time in attribution.

- [ ] **Step 4: Run and verify GREEN**

Run: `python3 -m unittest scripts.test_agot_wiki_import.WikiWriterTests -v`
Expected: PASS.

- [ ] **Step 5: Verify AGOT-only degradation**

Temporarily omit `wiki/enrichment.json` in the fixture repository and run runtime tests.
Expected: character search/cards still load from AGOT data with no exception.

---

### Task 4: Build Search Service and Character Browser Shell

**Files:**
- Create: `src/features/characters/characterSearch.ts`
- Create: `src/components/characters/CharacterBrowser.tsx`
- Create: `src/components/characters/CharacterFilters.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Header.tsx`
- Create: `scripts/test-character-browser.mjs`

**Interfaces:**
- Produces: `searchCharacters(repository, query, filters, viewerContext)`.
- Browser tabs: scene, location, court, family, vassals, allies, enemies, known, history.

- [ ] **Step 1: Write failing search visibility/filter tests**

```js
test('default search hides technical and genealogy-only records', async () => {
  const hits = await searchCharacters(repo, 'Stark', defaultFilters, playerViewer);
  assert.equal(hits.some(hit => hit.tier === 'genealogy'), false);
  assert.equal(hits.some(hit => hit.technical), false);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node scripts/test-character-browser.mjs`
Expected: FAIL because search/UI modules do not exist.

- [ ] **Step 3: Implement debounced indexed search, filters, pagination, and app entry point**

The browser opens from a text/icon button in `Header`, uses existing modal visual language, and fetches full records only when selected. Filters include names, aliases, house, culture, faith, location, life, age, gender, title, trait, canon tier, and player relationship.

- [ ] **Step 4: Run and verify GREEN**

Run: `node scripts/test-character-browser.mjs`
Expected: PASS for default hiding, explicit genealogy inclusion, Chinese/English aliases, and pagination.

- [ ] **Step 5: Checkpoint**

Run: `npm run build`
Expected: browser shell compiles and does not increase initial dataset fetch beyond manifest/index.

---

### Task 5: Build Character Card, Family Links, Knowledge Masking, and Sources

**Files:**
- Create: `src/features/characters/characterViewModel.ts`
- Create: `src/components/characters/WorldCharacterCard.tsx`
- Create: `src/components/characters/CharacterRelations.tsx`
- Create: `src/components/characters/CharacterSources.tsx`
- Create: `src/components/characters/CharacterPortraitFallback.tsx`
- Modify: `src/components/characters/CharacterBrowser.tsx`
- Modify: `scripts/test-character-browser.mjs`

**Interfaces:**
- Produces: `buildCharacterCardModel(character, viewerContext) -> ResolvedCharacterView`.
- Card consumes only `ResolvedCharacterView`, never raw system facts.
- Parent/spouse/child links navigate by stable ID and load on demand.

- [ ] **Step 1: Write failing card ordering and masking tests**

```js
test('card renders education first and masks undiscovered facts', () => {
  const model = buildCharacterCardModel(resolved, playerViewer);
  assert.match(model.traits[0].id, /^education_/);
  assert.equal(model.facts.some(f => f.visibility === 'system'), false);
  assert.equal(model.sources.every(source => Boolean(source.url || source.sourceId)), true);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node scripts/test-character-browser.mjs`
Expected: FAIL before card model/components exist.

- [ ] **Step 3: Implement CK3-style card with existing game assets**

Render identity, house/title, six skills, traits, status, visible relationships, memories, and sources. Use AGOT/CK3 game icons already present in the project; use Lucide for generic navigation/search only. Use a non-Emoji heraldic/silhouette fallback when no portrait exists.

- [ ] **Step 4: Run and verify GREEN**

Run: `node scripts/test-character-browser.mjs`
Expected: PASS for trait ordering, secret masking, source links, and family navigation models.

- [ ] **Step 5: Full browser/Wiki plan gate**

Add `test:agot-wiki-import` and `test:character-browser` to `verify`, then run `npm run verify`.
Expected: all tests and production build pass; AGOT-only mode and cached-Wiki mode both work, no Emoji is found, and initial load fetches no full character shard until needed.
