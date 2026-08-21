# CK3 Five-Tier Title Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user explicitly prohibited subagents, worktrees, commits, pushes, merges, and browser use for this workspace.

**Goal:** Replace the three-rank map plus family subtitles with an offline-generated CK3-style `hegemon → empire → kingdom → duchy → county` title map that hard-switches by zoom and keeps county as the smallest political interaction unit.

**Architecture:** Extend the Python AGOT importer to parse the complete landed-title ancestor chain and title colors, generate five semantic polygon ranks plus explicit Iron Throne coverage, and publish a new schema version. Update TypeScript schemas, semantic zoom logic, MapLibre layers, political projection, narrative hierarchy, and county view models to consume the new data; remove the family-label GeoJSON pipeline entirely.

**Tech Stack:** Python 3, Shapely, mapbox-vector-tile, TypeScript, Zod, React, MapLibre GL, Node test runner, Vite.

**Spec:** `docs/superpowers/specs/2026-08-20-ck3-five-tier-title-map-design.md`

## Global Constraints

- Work directly in `/mnt/c/AGOT`; preserve all unrelated uncommitted changes.
- Do not create a worktree or branch.
- Do not use subagents.
- Do not commit, push, merge, reset, clean, or revert unrelated files.
- Do not call a browser.
- Do not add Emoji.
- Runtime map code must remain offline and must not read `/mnt/c/AGOT/2962333032`, Steam, Workshop, or network resources.
- The test build may break old semantic-map data; save compatibility is not required during this test phase.
- County remains the smallest political interaction unit; barony IDs remain internal location keys only.
- Show title names only on the map. Holder, dynasty, house, and sigil belong in county political details.
- Use hard zoom thresholds: `0.85`, `1.55`, `2.25`, `2.95`, and local-detail threshold `4.60`.
- End every task with targeted tests and `git diff --check`; do not substitute a commit step.

---

### Task 1: Parse full title ancestors and title colors

**Files:**
- Modify: `scripts/agot_map_import/models.py`
- Modify: `scripts/agot_map_import/titles.py`
- Modify: `scripts/test_agot_map_import.py`

**Interfaces:**
- Produces `TitleAncestors(hegemon_id, empire_id, kingdom_id, duchy_id, county_id)`.
- Produces `TitleIndex.title_colors: dict[str, str]`, keyed by stable `h_/e_/k_/d_/c_` title ID and valued as lowercase `#rrggbb`.
- Keeps `TitleIndex.ancestors(barony_id)` and `barony_for_province(province_id)` stable for callers.

- [ ] **Step 1: Add failing hierarchy and color tests**

Add a fixture title tree containing nested `e_test → k_test → d_test → c_test → b_test`, plus a standalone `h_test`, then assert:

```python
ancestors = index.ancestors("b_test")
self.assertEqual(ancestors.empire_id, "e_test")
self.assertEqual(ancestors.kingdom_id, "k_test")
self.assertEqual(ancestors.duchy_id, "d_test")
self.assertEqual(ancestors.county_id, "c_test")
self.assertEqual(index.title_colors["e_test"], "#b9bfbc")
self.assertEqual(index.title_colors["h_test"], "#826464")
```

Also assert malformed color channels outside `0..255` raise `MapImportError` and absent colors do not create a map entry.

- [ ] **Step 2: Run the focused importer tests and confirm failure**

Run:

```bash
python3 -m unittest scripts.test_agot_map_import.MapSourceTests scripts.test_agot_map_import.MapGeometryTests -v
```

If the new tests live in a dedicated class, run that class instead. Expected failure: missing `empire_id` or `title_colors`.

- [ ] **Step 3: Extend the Python data model**

Use optional fields so AGOT branches without a higher title remain representable:

```python
@dataclass(frozen=True, slots=True)
class TitleAncestors:
    county_id: str | None = None
    duchy_id: str | None = None
    kingdom_id: str | None = None
    empire_id: str | None = None
    hegemon_id: str | None = None
```

Extend `TitleIndex` with `title_colors: dict[str, str]`.

- [ ] **Step 4: Extend recursive title parsing**

Track `h_`, `e_`, `k_`, `d_`, and `c_` independently in `walk`. Parse direct `color = { r g b }` values for visible title prefixes only, validate integer channels, and normalize with:

```python
def _hex_color(channels: tuple[int, int, int]) -> str:
    if any(channel < 0 or channel > 255 for channel in channels):
        raise MapImportError("头衔颜色通道必须位于 0 到 255")
    return "#" + "".join(f"{channel:02x}" for channel in channels)
```

Do not infer a color from family, holder, parent title, or file order.

- [ ] **Step 5: Run focused and full importer tests**

Run:

```bash
python3 -m unittest scripts.test_agot_map_import -v
python3 -m unittest scripts.test_agot_map_import -v
```

The second run checks deterministic behavior and accidental fixture mutation.

- [ ] **Step 6: Review task diff**

Run:

```bash
git diff --check
git diff -- scripts/agot_map_import/models.py scripts/agot_map_import/titles.py scripts/test_agot_map_import.py
```

---

### Task 2: Generate five semantic ranks and explicit hegemon coverage

**Files:**
- Create: `scripts/agot_map_import/semantic_hegemons.json`
- Modify: `scripts/agot_map_import/models.py`
- Modify: `scripts/agot_map_import/semantic.py`
- Modify: `scripts/agot_map_import/cli.py`
- Modify: `scripts/test_agot_map_import.py`

**Interfaces:**
- `SemanticRank = Literal["hegemon", "empire", "kingdom", "duchy", "county"]`.
- `SemanticTitleRecord` and `SemanticBoundaryRecord` expose `title_color: str`.
- `SemanticMembershipRecord` exposes `region_id`, `county_id`, `duchy_id`, optional `kingdom_id`, optional `empire_id`, optional `hegemon_id`.
- `build_semantic_dataset(..., hegemon_scopes: Mapping[str, Sequence[str]]) -> SemanticDataset`.

- [ ] **Step 1: Add failing five-rank dataset tests**

Create fixture provinces under `e_test/k_test/d_test/c_test`, provide a scope `{ "h_test": ["e_test"] }`, then assert:

```python
self.assertEqual(
    {boundary.rank for boundary in dataset.boundaries},
    {"hegemon", "empire", "kingdom", "duchy", "county"},
)
membership = dataset.memberships[0]
self.assertEqual(membership.hegemon_id, "h_test")
self.assertEqual(membership.empire_id, "e_test")
self.assertEqual(membership.kingdom_id, "k_test")
self.assertEqual(membership.region_id, "world_westeros_the_north")
```

Assert duplicate empire membership across two hegemon scopes and unknown configured empire IDs raise `MapImportError`.

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
python3 -m unittest scripts.test_agot_map_import.MapGeometryTests -v
```

Expected failure: semantic ranks or membership fields do not exist.

- [ ] **Step 3: Add the explicit Iron Throne scope**

Create `semantic_hegemons.json` with `h_the_iron_throne` mapped to the Westerosi `e_` titles that form the 298 AC Iron Throne domain. Exclude `e_beyond_the_wall` and the Night's Watch title. Read and validate the file in `cli.py`; never infer hegemon extent from every map province.

- [ ] **Step 4: Replace realm grouping with five title ranks**

Build per-province hierarchy records as:

```python
hierarchy_by_province[province_id] = (
    stable_barony,
    ancestors.county_id,
    ancestors.duchy_id,
    ancestors.kingdom_id,
    ancestors.empire_id,
    hegemon_by_empire.get(ancestors.empire_id),
    region_id,
)
```

Group only IDs that exist. County and duchy remain mandatory. Kingdom, empire, and hegemon are optional and must not be synthesized.

- [ ] **Step 5: Generate title colors and stable importance**

Use:

```python
RANK_ORDER = {"hegemon": 0, "empire": 1, "kingdom": 2, "duchy": 3, "county": 4}
RANK_IMPORTANCE = {"hegemon": 100, "empire": 90, "kingdom": 80, "duchy": 70, "county": 60}
```

Set `title_color` from `TitleIndex.title_colors`; if absent, call a deterministic muted fallback keyed only by `title_id`.

- [ ] **Step 6: Preserve geographic regions separately**

Replace semantic membership `realm_id` with `region_id`. Do not use `world_westeros_*` region IDs as empire title IDs or political anchors.

- [ ] **Step 7: Run importer tests and deterministic comparison**

Run:

```bash
python3 -m unittest scripts.test_agot_map_import -v
python3 -m unittest scripts.test_agot_map_import -v
```

Expected: five-rank fixture tests pass and both runs produce the same ordered records.

- [ ] **Step 8: Review task diff**

Run `git diff --check` and inspect only the files listed for this task.

---

### Task 3: Encode, audit, and publish the five-rank semantic dataset

**Files:**
- Modify: `scripts/agot_map_import/tiles.py`
- Modify: `scripts/agot_map_import/audit.py`
- Modify: `scripts/agot_map_import/writer.py`
- Modify: `scripts/audit-agot-map.mjs`
- Modify: `scripts/test_agot_map_import.py`

**Interfaces:**
- Semantic PBF source layers: rank-specific `*_surfaces` polygon layers, rank-specific `*_boundaries` line layers, and `title_labels`.
- Manifest count keys: `semanticHegemons`, `semanticEmpires`, `semanticKingdoms`, `semanticDuchies`, `semanticCounties`, `semanticLabels`, `semanticTiles`.
- Semantic schema version increments from the current generated format.

- [ ] **Step 1: Replace the old three-rank tile test with a failing five-rank test**

Decode the fixture PBF and assert the exact source-layer set:

```python
self.assertEqual(set(decoded), {
    "hegemon_surfaces", "hegemon_boundaries",
    "empire_surfaces", "empire_boundaries",
    "kingdom_surfaces", "kingdom_boundaries",
    "duchy_surfaces", "duchy_boundaries",
    "county_surfaces", "county_boundaries",
    "title_labels",
})
```

Assert surfaces decode as Polygon/MultiPolygon, boundaries decode as LineString/MultiLineString, and labels/surfaces carry the title metadata used by the runtime. County boundary lines retain `titleId` for selected-county filtering.

- [ ] **Step 2: Run tile and writer tests and confirm failure**

Run the semantic tile, audit, and writer test classes from `scripts.test_agot_map_import`.

- [ ] **Step 3: Encode all five boundary layers**

Replace hard-coded three-rank loops with the single ordered rank constant. Keep one stable feature ID per `(rank, titleId)` and use the same ID in `title_labels`.

- [ ] **Step 4: Upgrade semantic audits**

Require nonzero counts for all five ranks in the real dataset. For fixtures, allow a dedicated explicit scope that contains all five ranks. Validate membership references only when the optional higher ID exists:

```python
for rank, title_id in (
    ("county", membership.county_id),
    ("duchy", membership.duchy_id),
    ("kingdom", membership.kingdom_id),
    ("empire", membership.empire_id),
    ("hegemon", membership.hegemon_id),
):
    if title_id is not None and (rank, title_id) not in by_key:
        raise MapImportError(...)
```

Validate lowercase `#rrggbb` title colors and Chinese-only visible labels.

- [ ] **Step 5: Publish new JSON fields and manifest counts**

Write `titleColor`, `regionId`, and five title IDs in camelCase. Remove the overloaded semantic `realmId` field. Keep atomic pair publication and failure rollback behavior unchanged.

- [ ] **Step 6: Upgrade the Node production-data audit**

Assert all five generated rank counts are positive, no family-label source is expected, every county has a duchy, and optional higher ancestors reference existing titles.

- [ ] **Step 7: Run importer and map-data audit tests**

Run:

```bash
python3 -m unittest scripts.test_agot_map_import -v
node scripts/audit-agot-map.mjs
```

The production audit may remain red until Task 8 regenerates the checked-in dataset; document that expected red state in the execution log and do not weaken the new audit.

- [ ] **Step 8: Review task diff**

Run `git diff --check` and inspect the task files.

---

### Task 4: Upgrade TypeScript types, schemas, repository, and hierarchy consumers

**Files:**
- Modify: `src/features/map/types.ts`
- Modify: `src/features/map/schemas.ts`
- Modify: `src/features/map/repository.ts`
- Modify: `src/features/map/countyInteraction.ts`
- Modify: `src/features/map/countyViewModel.ts`
- Modify: `src/features/map/locationViewModel.ts`
- Modify: `src/features/map/narrativeLocationContext.ts`
- Modify: `scripts/test-map-schema.mjs`
- Modify: `scripts/test-map-runtime.mjs`
- Modify: `scripts/test-map-county-interaction.mjs`
- Modify: `scripts/test-map-county-view.mjs`
- Modify: `scripts/test-map-narrative-context.mjs`

**Interfaces:**
- `SemanticRank` is the exact five-value union from the spec.
- `SemanticMembership` has `regionId`, `countyId`, `duchyId`, optional `kingdomId`, optional `empireId`, optional `hegemonId`.
- `SelectedCountyLocations` exposes optional higher title IDs without changing county selection behavior.
- Narrative output contains verified Chinese title names but no internal IDs.

- [ ] **Step 1: Add failing TypeScript schema tests**

Construct one five-rank semantic title array and membership. Assert old `rank: 'realm'` and overloaded `realmId` are rejected, while the five new ranks and explicit `regionId` parse.

- [ ] **Step 2: Run focused schema/runtime tests and confirm failure**

Run:

```bash
npm run test:map-schema
npm run test:map-runtime
```

Expected failure: `SemanticRank` and membership schema remain three-level.

- [ ] **Step 3: Upgrade types and Zod schemas**

Use strict schemas. Add `titleColor` validation with `/^#[0-9a-f]{6}$/`. Preserve unique feature ID, title ID, and location ID refinements.

- [ ] **Step 4: Upgrade repository indexes**

Index all available title IDs from membership fields. Keep county resolution authoritative and do not let a higher title substitute for a missing county.

- [ ] **Step 5: Thread higher titles through county and location views**

Show verified hierarchy names in this order when present:

```ts
['hegemonId', '霸权'],
['empireId', '帝国级头衔'],
['kingdomId', '王国级头衔'],
['duchyId', '公国'],
['countyId', '伯爵领'],
```

The visible value is the localized title name, never the internal ID or mechanically suffixed string.

- [ ] **Step 6: Upgrade narrative hierarchy**

Allow the LLM context to include verified localized hegemon, empire, kingdom, duchy, county, and concrete location names. Keep stable IDs out of prose and keep county as the travel/political selection key.

- [ ] **Step 7: Run focused tests and TypeScript**

Run:

```bash
npm run test:map-schema
npm run test:map-runtime
npm run test:map-county-interaction
npm run test:map-county-view
npm run test:map-narrative-context
npx tsc --noEmit
```

- [ ] **Step 8: Review task diff**

Run `git diff --check` and inspect the task files.

---

### Task 5: Replace three-rank semantic zoom with five hard bands

**Files:**
- Modify: `src/features/map/semanticZoom.ts`
- Modify: `src/features/map/mapPresentation.ts`
- Modify: `scripts/test-map-semantic-zoom.mjs`
- Modify: `scripts/test-map-presentation.mjs`

**Interfaces:**
- `semanticZoomState(zoom).primaryRank` returns exactly one of the five ranks.
- Export immutable thresholds `HEGEMON_MAX_ZOOM = 0.85`, `EMPIRE_MAX_ZOOM = 1.55`, `KINGDOM_MAX_ZOOM = 2.25`, `DUCHY_MAX_ZOOM = 2.95`, `LOCAL_MIN_ZOOM = 4.60` from one owner module.
- No adjacent rank blend weights remain.

- [ ] **Step 1: Replace cross-fade tests with failing boundary tests**

Assert values immediately before, at, and after every threshold:

```js
assert.equal(semanticZoomState(0.84).primaryRank, 'hegemon')
assert.equal(semanticZoomState(0.85).primaryRank, 'empire')
assert.equal(semanticZoomState(1.55).primaryRank, 'kingdom')
assert.equal(semanticZoomState(2.25).primaryRank, 'duchy')
assert.equal(semanticZoomState(2.95).primaryRank, 'county')
```

Assert exactly one rank opacity is `1` and all others are `0`.

- [ ] **Step 2: Run zoom tests and confirm failure**

Run `npm run test:map-semantic-zoom`.

- [ ] **Step 3: Implement a pure hard-band state function**

Remove `realmToDuchy`, `duchyToCounty`, and rank cross-fade interpolation. Keep continuous terrain, road-density, marker-detail, and camera math independent from title-rank switching.

- [ ] **Step 4: Update presentation bands**

Political surface remains enabled through county political zoom and becomes zero/hidden at `LOCAL_MIN_ZOOM`. Internal locations remain local-only and require a selected county.

- [ ] **Step 5: Run zoom/presentation/terrain regressions**

Run:

```bash
npm run test:map-semantic-zoom
npm run test:map-presentation
npm run test:map-terrain-profile
npm run test:map-wheel-camera-controller
npm run test:map-wheel-settle
```

- [ ] **Step 6: Review task diff**

Run `git diff --check` and inspect the four task files.

---

### Task 6: Render five title layers and delete family subtitle rendering

**Files:**
- Modify: `src/features/map/mapStyle.ts`
- Modify: `src/features/map/mapLayers.ts`
- Modify: `src/features/map/MapCanvas.tsx`
- Delete: `src/features/map/semanticPoliticalLabels.ts`
- Modify: `scripts/test-map-aesthetics.mjs`
- Modify: `scripts/test-map-semantic-layers.mjs`
- Modify: `scripts/test-map-semantic-projection.mjs`
- Modify: `scripts/test-map-semantic-resolver.mjs`
- Modify: `scripts/check-map-runtime-boundaries.mjs`

**Interfaces:**
- MapLibre has five boundary/casing/label layer families named `agot-<rank>-boundaries[-casing]` and `agot-<rank>-labels`.
- There is no political-house-label source, layer, resolver, collection, ref, refresh callback, or runtime GeoJSON update.
- Political fill selects `titleColor` for the active semantic rank and reaches opacity `0` at zoom `4.60`.

- [ ] **Step 1: Add failing structure tests**

Assert all five layer families exist, only current-rank visibility is enabled, and source text does not contain:

```text
POLITICAL_HOUSE_LABEL_SOURCE
POLITICAL_HOUSE_LABEL_LAYER
KINGDOM_HOUSE_LABEL_SOURCE
KINGDOM_HOUSE_LABEL_LAYER
politicalHouseLabel
createPoliticalHouseResolver
syncPoliticalHouseLabels
```

Assert the style has no visible `史塔克家族`-style subtitle field and uses `titleColor` from semantic features.

- [ ] **Step 2: Run focused layer tests and confirm failure**

Run:

```bash
npm run test:map-aesthetics
npm run test:map-semantic-layers
npm run test:map-semantic-projection
npm run test:map-semantic-resolver
```

- [ ] **Step 3: Build five boundary and title layers**

Generate or declare layers from the ordered rank list. Each normal rank label uses the semantic `name`; no second symbol layer displays holder or house. Keep dark casings and title colors visually subordinate to terrain.

- [ ] **Step 4: Replace house-based province fill inputs**

The current-rank semantic polygon provides `titleColor`. Do not use `PoliticalFeatureState.countyColor`, `duchyColor`, `kingdomColor`, `empireColor`, or `houseColor` as the normal background fill. Keep controller color only for contested-border emphasis if required.

- [ ] **Step 5: Delete the family-label pipeline**

Remove `semanticPoliticalLabels.ts`, both GeoJSON sources, both symbol layers, resolver refs, refresh callbacks, affected-title label invalidation, and associated tests. Do not leave dead hidden layers.

- [ ] **Step 6: Keep county hit testing and selection unchanged**

The transparent province hit layer must remain above fills. Clicking any visible rank still resolves province `baronyId → countyId`; selected county gold outline and local location markers remain unchanged.

- [ ] **Step 7: Run focused and runtime-boundary tests**

Run:

```bash
npm run test:map-aesthetics
npm run test:map-semantic-layers
npm run test:map-county-interaction
npm run test:map-integration
npm run check:map-runtime-boundaries
npx tsc --noEmit
```

- [ ] **Step 8: Review task diff**

Run `git diff --check` and inspect the listed files, including the deletion.

---

### Task 7: Align political details and world linkage with title-based map identity

**Files:**
- Modify: `src/features/map/politicalProjection.ts`
- Modify: `src/features/map/countyViewModel.ts`
- Modify: `src/features/map/CountyWorldDetails.tsx`
- Modify: `src/features/map/MapDrawer.tsx`
- Modify: `scripts/test-map-political-projection.mjs`
- Modify: `scripts/test-map-integration.mjs`
- Modify: `scripts/test-world-context-linkage.mjs`
- Modify: `scripts/test-world-travel-linkage.mjs`

**Interfaces:**
- Political projection continues to expose lawful holder, actual controller, contested state, and title history.
- Normal map labels and fills no longer consume house labels/colors.
- County details expose localized higher-title chain and holder family information without duplicating it on the map.

- [ ] **Step 1: Add failing political separation tests**

Assert changing a county holder changes county detail ownership but does not change imported title name or `titleColor`. Assert occupation changes contested-border state but not lawful title color.

- [ ] **Step 2: Run political and integration tests and confirm failure where old color coupling remains**

Run:

```bash
npm run test:map-political-projection
npm run test:map-integration
```

- [ ] **Step 3: Remove obsolete house color slots from map feature state**

Keep only political metadata needed by details and contested rendering. Remove normal-surface `politicalColor`, `politicalDuchyColor`, `politicalKingdomColor`, and `politicalEmpireColor` writes after `mapStyle` no longer consumes them.

- [ ] **Step 4: Keep family data in county political details**

Show holder name, house name/sigil, lawful title chain, controller, and contested status in the existing detail section. Do not create a new global title dossier or right-side interaction system.

- [ ] **Step 5: Run world-linkage regressions**

Run:

```bash
npm run test:map-political-projection
npm run test:map-integration
npm run test:world-context-linkage
npm run test:world-travel-linkage
npm run test:turn-pipeline
npx tsc --noEmit
```

- [ ] **Step 6: Review task diff**

Run `git diff --check` and inspect only the task files.

---

### Task 8: Regenerate the real AGOT map dataset and complete verification

**Files:**
- Regenerate: `public/data/agot-map/**`
- Regenerate: `public/assets/agot-map/semantic/**`
- Preserve unless the importer deterministically changes them: `public/assets/agot-map/terrain/**`, `material-terrain/**`, `dem/**`, `vector/**`
- Modify if required: `package.json`
- Modify: relevant map audit tests discovered by the final verification run

**Interfaces:**
- Checked-in runtime data uses the new five-rank schema.
- Real source is `/mnt/c/AGOT/2962333032` at generation time only.
- Runtime paths remain `/data/agot-map/**` and `/assets/agot-map/**`.

- [ ] **Step 1: Run the full real-data importer**

Run the importer with both verified local sources:

```bash
python3 -m scripts.agot_map_import.cli \
  --source /mnt/c/AGOT/2962333032 \
  --ck3-source '/mnt/c/Program Files (x86)/Steam/steamapps/common/Crusader Kings III/game' \
  --data-output public/data/agot-map \
  --asset-output public/assets/agot-map
```

Do not introduce network downloads. Do not use `--skip-tiles` because semantic PBFs must be regenerated.

- [ ] **Step 2: Audit generated rank counts and family-label absence**

Run:

```bash
node scripts/audit-agot-map.mjs
node --experimental-strip-types scripts/test-map-semantic-projection.mjs
```

Expected: every five-rank count is positive, `h_the_iron_throne` exists, all visible labels are Chinese, and map family-subtitle count is zero.

- [ ] **Step 3: Run the full map verification**

Run:

```bash
npm run verify:map
```

Expected: all map/import/schema/runtime/terrain/interaction/travel/audit tests pass.

- [ ] **Step 4: Run cross-system regressions**

Run:

```bash
npm run check:story-character-links
npm run test:character-navigation
npm run test:world-travel-linkage
npm run test:world-context-linkage
npm run test:turn-pipeline
npx tsc --noEmit
```

- [ ] **Step 5: Run the Windows production-equivalent code build**

Run without launching a browser:

```bash
/mnt/c/Windows/System32/cmd.exe /d /s /c "cd /d C:\\AGOT && npm run build:code"
```

The existing large-chunk warning is non-fatal; any TypeScript or Vite error is a failure.

- [ ] **Step 6: Inspect final diff and preserve the workspace**

Run:

```bash
git diff --check
git status --short
git diff --stat -- scripts/agot_map_import src/features/map public/data/agot-map public/assets/agot-map/semantic scripts/test-map-*.mjs scripts/audit-agot-map.mjs package.json
```

Do not commit, push, merge, clean, reset, or remove any unrelated uncommitted work.
