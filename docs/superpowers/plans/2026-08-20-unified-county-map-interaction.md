# Unified County Map Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This workspace explicitly forbids subagents and worktrees.

**Goal:** Replace the five mutually exclusive map modes with one county-first map whose visual density follows zoom, whose people and assets are scoped overlays, and whose travel flow starts from county or location details.

**Architecture:** Introduce pure interaction and presentation contracts first, then move Zustand, MapDrawer, MapCanvas, toolbar, details, search, and travel onto those contracts in reviewable slices. County selection and location selection remain distinct; MapLibre renders an automatic strategic/county/local presentation while the world transaction queue remains the only authority for travel and location changes.

**Tech Stack:** React 18, TypeScript, Zustand, MapLibre GL, existing Node test scripts with `node:test`, esbuild-based source audits, Vite Windows build.

**Spec:** `docs/superpowers/specs/2026-08-20-unified-county-map-interaction-design.md`

## Global Constraints

- Do not use subagents, create worktrees, call a browser, commit, or push.
- Keep every batch visible in the current workspace diff; do not revert unrelated dirty files.
- Do not use Emoji.
- The test version does not require compatibility with `mapMode`, `titleExpansion`, or other old map-only UI state.
- Do not change authoritative character, asset, title, timeline, journey, or world-transaction semantics.
- A character's current location remains a physical location; never substitute a family seat or lawful title.
- County is the primary political interaction layer; `baronyId` remains an internal lookup key and is never shown as a playable layer.
- Use project-bundled icons or high-quality icon libraries; never use text pictographs.
- Run focused tests after each task. Do not run the repository-wide `npm run verify`; the final gate is `npm run verify:map`, focused linkage tests, TypeScript, Windows `build:code`, and `git diff --check`.
- If WSL Vite fails because `@rollup/rollup-linux-x64-gnu` is absent, do not reinstall dependencies; use the Windows build command specified in Task 9.

---

## File Responsibility Map

**New files**

- `src/features/map/mapInteraction.ts`: map selection, overlay preferences, focus targets, visible interaction state, and pure selection transitions.
- `src/features/map/mapPresentation.ts`: zoom-to-presentation-band mapping and layer visibility decisions.
- `src/features/map/MapInformationMenu.tsx`: independent people, asset, road, and political overlay controls.
- `src/features/map/CountyDetails.tsx`: county-level identity, political state, locations, people, assets, and travel entry.
- `src/features/map/countyViewModel.ts`: pure county detail projection from semantic, political, character, asset, and world data.
- `scripts/test-map-interaction-state.mjs`: pure interaction transition regression tests.
- `scripts/test-map-presentation.mjs`: strategic/county/local display policy regression tests.
- `scripts/test-map-county-view.mjs`: county detail projection regression tests.

**Existing files with changed responsibility**

- `src/features/map/mapUiStore.ts`: owns `MapSelection`, map focus requests, overlay preferences, and visible travel-destination picking; no map mode or title expansion.
- `src/features/map/mapLayers.ts`: applies independent presentation decisions rather than one of five visibility tables.
- `src/features/map/MapCanvas.tsx`: direct county hit handling, selected-county internal locations, automatic presentation, scoped dynamic subjects, and route rendering.
- `src/features/map/MapDrawer.tsx`: resolves focus targets and composes county, location, journey, and travel planning panels.
- `src/features/map/MapToolbar.tsx`: search, information menu, top-down view, and north reset only.
- `src/features/map/LocationDetails.tsx`: concrete location facts only; no embedded county world section and no always-visible planner.
- `src/features/map/TravelPlanner.tsx`: route draft and confirmation for an explicit target; never changes the base map presentation.
- `src/features/map/JourneyPanel.tsx`: begins visible destination picking without switching a map mode.
- `src/features/map/LocationSearch.tsx`: returns typed county or location focus targets and never displays internal IDs.
- `src/features/map/repository.ts`: searches both semantic counties and concrete locations.
- `src/features/map/countyInteraction.ts`: exposes direct county lookup and county-primary-location lookup; removes drill-down-only helpers after consumers migrate.
- `src/features/map/dynamicMapSubjects.ts`: county scoping, relevance ordering, budgets, and location aggregation.
- `src/features/map/mapDataDemand.ts`: loads political, character, and asset projection data from selection and overlay demand instead of map mode.
- `src/App.tsx`: routes external location links into typed map focus and gives Escape map-specific dismissal precedence.
- `src/index.css`: compact information menu, county/location panel hierarchy, destination-picking notice, and responsive layout.
- `scripts/check-map-drawer.mjs`, `scripts/check-map-travel-ui.mjs`, `scripts/test-map-data-demand.mjs`, `scripts/test-map-county-interaction.mjs`, `scripts/test-map-semantic-layers.mjs`, `scripts/test-map-integration.mjs`, `scripts/test-map-location-view.mjs`: replace old five-mode and title-expansion assertions with the unified contract.
- `package.json`: registers the three new focused tests and adds them to `verify:map`.

---

### Task 1: Define Pure Map Interaction Contracts

**Files:**
- Create: `src/features/map/mapInteraction.ts`
- Create: `scripts/test-map-interaction-state.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `MapSelection`
  - `MapOverlayPreferences`
  - `MapInteractionState`
  - `MapFocusTarget`
  - `EMPTY_MAP_SELECTION`
  - `DEFAULT_MAP_OVERLAYS`
  - `selectCounty(countyId: string): MapSelection`
  - `selectMapLocation(countyId: string, locationId: string): MapSelection`
  - `clearSelectedLocation(selection: MapSelection): MapSelection`
  - `selectionContainsLocation(selection: MapSelection, countyId: string): boolean`
- Consumes: no runtime store or MapLibre state.

- [ ] **Step 1: Write the failing pure transition tests**

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_MAP_OVERLAYS,
  EMPTY_MAP_SELECTION,
  clearSelectedLocation,
  selectCounty,
  selectMapLocation,
  selectionContainsLocation,
} from '../src/features/map/mapInteraction.ts'

test('选择伯爵领不会伪造具体地点', () => {
  assert.deepEqual(selectCounty('c_winterfell'), {
    countyId: 'c_winterfell',
    locationId: null,
  })
})

test('具体地点必须与父伯爵领一起保存', () => {
  const selected = selectMapLocation('c_winterfell', 'b_winterfell')
  assert.equal(selectionContainsLocation(selected, 'c_winterfell'), true)
  assert.deepEqual(clearSelectedLocation(selected), {
    countyId: 'c_winterfell',
    locationId: null,
  })
})

test('地图信息默认开启但不会改变空选择', () => {
  assert.deepEqual(DEFAULT_MAP_OVERLAYS, {
    characters: true,
    assets: true,
    roads: true,
    political: true,
  })
  assert.deepEqual(EMPTY_MAP_SELECTION, { countyId: null, locationId: null })
})
```

- [ ] **Step 2: Run the test and confirm the missing module failure**

Run: `node --experimental-strip-types scripts/test-map-interaction-state.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `mapInteraction.ts`.

- [ ] **Step 3: Implement the pure contracts**

```ts
export interface MapSelection {
  countyId: string | null
  locationId: string | null
}

export interface MapOverlayPreferences {
  characters: boolean
  assets: boolean
  roads: boolean
  political: boolean
}

export type MapInteractionState = 'browse' | 'pick-travel-destination'

export type MapFocusTarget =
  | { kind: 'county'; countyId: string }
  | { kind: 'location'; locationId: string }

export const EMPTY_MAP_SELECTION: MapSelection = { countyId: null, locationId: null }
export const DEFAULT_MAP_OVERLAYS: MapOverlayPreferences = {
  characters: true,
  assets: true,
  roads: true,
  political: true,
}

export function selectCounty(countyId: string): MapSelection {
  return { countyId, locationId: null }
}

export function selectMapLocation(countyId: string, locationId: string): MapSelection {
  return { countyId, locationId }
}

export function clearSelectedLocation(selection: MapSelection): MapSelection {
  return { countyId: selection.countyId, locationId: null }
}

export function selectionContainsLocation(selection: MapSelection, countyId: string): boolean {
  return selection.countyId === countyId && selection.locationId !== null
}
```

- [ ] **Step 4: Register the test without changing unrelated package scripts**

Add:

```json
"test:map-interaction-state": "node --experimental-strip-types scripts/test-map-interaction-state.mjs"
```

Place it before `test:map-runtime` and add `npm run test:map-interaction-state` near the start of `verify:map`.

- [ ] **Step 5: Verify the contract and diff**

Run:

```bash
npm run test:map-interaction-state
git diff --check -- src/features/map/mapInteraction.ts scripts/test-map-interaction-state.mjs package.json
git diff -- src/features/map/mapInteraction.ts scripts/test-map-interaction-state.mjs package.json
```

Expected: 3 tests pass; no whitespace errors. Do not commit.

---

### Task 2: Define Automatic Strategic, County, and Local Presentation

**Files:**
- Create: `src/features/map/mapPresentation.ts`
- Create: `scripts/test-map-presentation.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `MapOverlayPreferences` from Task 1.
- Produces:
  - `MapPresentationBand = 'strategic' | 'county' | 'local'`
  - `MapPresentation`
  - `STRATEGIC_MAX_ZOOM = 2.8`
  - `LOCAL_MIN_ZOOM = 4.6`
  - `mapPresentationFor(input): MapPresentation`

- [ ] **Step 1: Write the failing zoom policy tests**

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { mapPresentationFor } from '../src/features/map/mapPresentation.ts'

const overlays = { characters: true, assets: true, roads: true, political: true }

test('远景只显示政治战略表达', () => {
  assert.deepEqual(mapPresentationFor({ zoom: 2, overlays, selectedCountyId: null }), {
    band: 'strategic', politicalSurface: true, countyLabels: false,
    internalLocations: false, roads: false, characters: false, assets: false,
  })
})

test('中景以伯爵领为主且动态内容必须有选中伯爵领', () => {
  assert.equal(mapPresentationFor({ zoom: 3.5, overlays, selectedCountyId: null }).characters, false)
  assert.deepEqual(mapPresentationFor({ zoom: 3.5, overlays, selectedCountyId: 'c_winterfell' }), {
    band: 'county', politicalSurface: false, countyLabels: true,
    internalLocations: false, roads: true, characters: true, assets: true,
  })
})

test('近景只为选中伯爵领展开内部地点', () => {
  assert.equal(mapPresentationFor({ zoom: 5, overlays, selectedCountyId: null }).internalLocations, false)
  assert.equal(mapPresentationFor({ zoom: 5, overlays, selectedCountyId: 'c_winterfell' }).internalLocations, true)
})
```

- [ ] **Step 2: Run the test and confirm the missing module failure**

Run: `node --experimental-strip-types scripts/test-map-presentation.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the stepped presentation policy**

```ts
import type { MapOverlayPreferences } from './mapInteraction.ts'

export const STRATEGIC_MAX_ZOOM = 2.8
export const LOCAL_MIN_ZOOM = 4.6
export type MapPresentationBand = 'strategic' | 'county' | 'local'

export interface MapPresentation {
  band: MapPresentationBand
  politicalSurface: boolean
  countyLabels: boolean
  internalLocations: boolean
  roads: boolean
  characters: boolean
  assets: boolean
}

export function mapPresentationFor(input: {
  zoom: number
  overlays: MapOverlayPreferences
  selectedCountyId: string | null
}): MapPresentation {
  const band = input.zoom < STRATEGIC_MAX_ZOOM
    ? 'strategic'
    : input.zoom < LOCAL_MIN_ZOOM ? 'county' : 'local'
  const hasCounty = input.selectedCountyId !== null
  return {
    band,
    politicalSurface: band === 'strategic' && input.overlays.political,
    countyLabels: band !== 'strategic',
    internalLocations: band === 'local' && hasCounty,
    roads: band !== 'strategic' && input.overlays.roads,
    characters: band !== 'strategic' && hasCounty && input.overlays.characters,
    assets: band !== 'strategic' && hasCounty && input.overlays.assets,
  }
}
```

- [ ] **Step 4: Register and verify the presentation test**

Add `test:map-presentation` to `package.json` and `verify:map`, then run:

```bash
npm run test:map-presentation
npm run test:map-semantic-zoom
git diff --check -- src/features/map/mapPresentation.ts scripts/test-map-presentation.mjs package.json
```

Expected: new tests pass and existing semantic zoom tests remain green. Do not commit.

---

### Task 3: Replace Mode and Title Expansion State with Direct County Selection

**Files:**
- Modify: `src/features/map/mapUiStore.ts`
- Modify: `src/features/map/countyInteraction.ts`
- Modify: `src/features/map/MapCanvas.tsx`
- Modify: `src/features/map/MapDrawer.tsx`
- Modify: `src/features/map/mapLayers.ts`
- Modify: `src/features/map/MapToolbar.tsx`
- Create: `src/features/map/MapInformationMenu.tsx`
- Modify: `scripts/test-map-county-interaction.mjs`
- Modify: `scripts/test-map-semantic-layers.mjs`
- Modify: `scripts/check-map-drawer.mjs`
- Modify: `scripts/test-map-integration.mjs`

**Interfaces:**
- Consumes: `MapSelection`, `MapOverlayPreferences`, `MapInteractionState`, `MapFocusTarget`, and `MapPresentation` from Tasks 1–2.
- Produces store actions:
  - `openMap(target?: MapFocusTarget): void`
  - `selectCounty(countyId: string | null): void`
  - `selectLocation(countyId: string, locationId: string): void`
  - `clearLocation(): void`
  - `clearSelection(): void`
  - `setOverlay<K extends keyof MapOverlayPreferences>(key: K, enabled: boolean): void`
  - `beginDestinationPick(): void`
  - `cancelDestinationPick(): void`
- Produces county index methods:
  - `countyIdForBarony(baronyId: string): string | undefined`
  - `primaryLocationForCounty(countyId: string): string | undefined`
  - `locationsForCounty(countyId: string): SelectedCountyLocations | undefined`

- [ ] **Step 1: Change source audits to demand the new contract**

Update `scripts/check-map-drawer.mjs` to assert:

```js
assert.doesNotMatch(toolbar, /地形|政治|人物|旅行|资产/)
assert.doesNotMatch(store, /mapMode|titleExpansion|expandTitle/)
assert.match(toolbar, /LocationSearch/)
assert.match(toolbar, /MapInformationMenu/)
assert.match(toolbar, /俯视/)
assert.match(toolbar, /归北/)
```

Update `scripts/test-map-county-interaction.mjs` so a Winterfell barony resolves directly:

```js
assert.equal(index.countyIdForBarony('b_winterfell'), 'c_winterfell')
assert.equal(index.primaryLocationForCounty('c_winterfell'), 'b_winterfell')
assert.deepEqual(index.locationsForCounty('c_winterfell')?.locations.map((entry) => entry.id), [
  'b_winterfell',
  'b_wintertown',
])
```

Update semantic layer and integration audits to reject realm/kingdom/duchy click expansion and require `callbacksRef.current.onSelectCounty(countyId)`.

- [ ] **Step 2: Run the focused checks and confirm failures describe old modes**

Run:

```bash
npm run test:map-county-interaction
npm run test:map-semantic-layers
npm run check:map-drawer
npm run test:map-integration
```

Expected: FAIL on `mapMode`, `titleExpansion`, or old click-drill assertions.

- [ ] **Step 3: Replace MapUiStore fields and actions**

Use this state shape:

```ts
interface MapFocusRequest {
  id: number
  target: MapFocusTarget
}

interface MapUiState {
  activeDrawer: ActiveDrawer
  selection: MapSelection
  overlays: MapOverlayPreferences
  interactionState: MapInteractionState
  focusRequest: MapFocusRequest | null
  lastViewport: MapViewport | null
  topDownLocked: boolean
  northResetRequestId: number
  routePreview: RoutePlan | null
  // existing asset drawer return fields remain unchanged
}
```

`openMap(target)` opens the map and, when target exists, increments the focus request ID. `selectCounty(null)` clears both county and location. `selectLocation` writes both IDs. `cancelDestinationPick` returns to `browse` without clearing selection or route preview.

- [ ] **Step 4: Simplify CountyInteractionIndex**

Retain its deterministic primary-location ordering, then expose direct methods:

```ts
countyIdForBarony: (baronyId) => countyIdByBaronyId.get(baronyId),
primaryLocationForCounty: (countyId) => primaryLocationByCountyId.get(countyId),
locationsForCounty: (countyId) => selectedCountyById.get(countyId),
```

Keep old drill-down helpers only until MapCanvas compiles in this step; remove them before Step 8 after all consumers are migrated.

- [ ] **Step 5: Replace mode visibility with presentation visibility**

Remove `MapMode`, `INTELLIGENCE_TYPES_BY_MODE`, and `MODE_VISIBILITY`. Add:

```ts
export function applyMapPresentation(map: MapLibreMap, presentation: MapPresentation): void {
  setVisible(map, 'agot-provinces', presentation.politicalSurface)
  setVisible(map, POLITICAL_CONTESTED_BORDER_LAYER, presentation.politicalSurface)
  setVisible(map, POLITICAL_HOUSE_LABEL_LAYER, presentation.politicalSurface)
  setVisible(map, 'agot-roads-casing', presentation.roads)
  setVisible(map, 'agot-roads', presentation.roads)
  setVisible(map, CHARACTER_POINT_LAYER, presentation.characters)
  setVisible(map, CHARACTER_AGGREGATE_LAYER, presentation.characters)
  setVisible(map, CHARACTER_AGGREGATE_COUNT_LAYER, presentation.characters)
  setVisible(map, ASSET_POINT_LAYER, presentation.assets)
  setVisible(map, ASSET_AGGREGATE_LAYER, presentation.assets)
  setVisible(map, ASSET_AGGREGATE_COUNT_LAYER, presentation.assets)
}
```

Journey route, progress, and position visibility must depend on route/journey existence, not presentation overlays.

- [ ] **Step 6: Make county clicks direct in MapCanvas**

Replace the expansion ladder with:

```ts
const countyId = countyInteractionRef.current?.countyIdForBarony(baronyId)
if (!countyId) return
callbacksRef.current.onSelectCounty(countyId)
```

Pass `selection`, `overlays`, `interactionState`, and `onSelectCounty` as props. Sync selected-county internal locations from `selection.countyId`; only expose their symbol layer when `presentation.internalLocations` is true. Clicking an internal location resolves its county from the index and calls `onSelectLocation(countyId, locationId)`. Internal map clicks do not call `flyTo`.

- [ ] **Step 7: Replace the toolbar with final controls**

`MapToolbar` renders only:

```tsx
<LocationSearch onSelect={onFocusTarget} />
<MapInformationMenu preferences={overlays} onChange={onOverlayChange} />
<button aria-pressed={topDownLocked}>俯视</button>
<button aria-label="地图归北">归北</button>
```

`MapInformationMenu` uses `Layers3`, `Users`, `Boxes`, `Route`, and `Shield` from Lucide, with checkboxes for 已知人物、据点与运输工具、道路、政治归属. It must not use tabs or change interaction state.

- [ ] **Step 8: Wire MapDrawer and remove obsolete code**

MapDrawer passes the new state and callbacks to MapCanvas and MapToolbar. Delete all title-expansion and mode-empty rendering, `kingdomIndexRef`, expansion synchronization, `refreshKingdomHouseLabels`, and mode refs. Remove old drill-down-only index helpers once `rg` confirms no consumers:

```bash
rg -n "MapMode|mapMode|TitleExpansion|titleExpansion|expandTitle|clearTitleExpansion|kingdomIndexRef|MODE_VISIBILITY" src/features/map
```

Expected: no matches except historical documentation.

- [ ] **Step 9: Run the direct-selection regression set**

Run:

```bash
npm run test:map-interaction-state
npm run test:map-presentation
npm run test:map-county-interaction
npm run test:map-semantic-layers
npm run check:map-drawer
npm run test:map-integration
npx tsc --noEmit
git diff --check
```

Expected: all pass. Review the focused diff for MapUiStore, MapCanvas, mapLayers, and toolbar. Do not commit.

---

### Task 4: Split County Details from Concrete Location Details

**Files:**
- Create: `src/features/map/countyViewModel.ts`
- Create: `src/features/map/CountyDetails.tsx`
- Create: `scripts/test-map-county-view.mjs`
- Modify: `src/features/map/LocationDetails.tsx`
- Modify: `src/features/map/CountyWorldDetails.tsx`
- Modify: `src/features/map/MapDrawer.tsx`
- Modify: `scripts/test-map-location-view.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `MapSelection`, `SemanticTitle`, `SelectedCountyLocations`, `PoliticalFeatureState`, `CountyWorldView`, `MapCharacterPoint`, and `MapAssetPoint`.
- Produces:

```ts
export interface CountyViewModel {
  id: string
  name: string
  duchyName?: string
  realmName?: string
  primaryLocationId: string
  locations: readonly ExpandedCountyLocation[]
  characters: readonly MapCharacterPoint[]
  assets: readonly MapAssetPoint[]
  politicalState?: PoliticalFeatureState
}
```

- [ ] **Step 1: Write the failing county projection test**

Test a Winterfell fixture and assert:

```js
assert.equal(view.id, 'c_winterfell')
assert.equal(view.name, '临冬城伯爵领')
assert.equal(view.primaryLocationId, 'b_winterfell')
assert.deepEqual(view.locations.map((entry) => entry.id), ['b_winterfell', 'b_wintertown'])
assert.deepEqual(view.characters.map((entry) => entry.characterId), ['agot:Stark_3'])
assert.deepEqual(view.assets.map((entry) => entry.assetId), ['winterfell'])
```

- [ ] **Step 2: Run the test and confirm the missing projection failure**

Run: `node --experimental-strip-types scripts/test-map-county-view.mjs`
Expected: FAIL because `countyViewModel.ts` is missing.

- [ ] **Step 3: Implement `buildCountyViewModel` as a pure projector**

Signature:

```ts
export function buildCountyViewModel(input: {
  countyId: string
  titles: readonly SemanticTitle[]
  selectedCounty: SelectedCountyLocations
  characters: readonly MapCharacterPoint[]
  assets: readonly MapAssetPoint[]
  politicalState?: PoliticalFeatureState
}): CountyViewModel
```

Resolve county, duchy, and realm names from semantic titles; filter characters and assets to the selected county's location IDs even if callers pass extra points.

- [ ] **Step 4: Create CountyDetails**

Props:

```ts
interface CountyDetailsProps {
  view: CountyViewModel
  worldView?: CountyWorldView
  characterNames: ReadonlyMap<string, string>
  assetNames: ReadonlyMap<string, string>
  onSelectLocation: (countyId: string, locationId: string) => void
  onSelectCharacter: (characterId: CharacterId) => void
  onOpenAsset: (assetId: string) => void
  onPlanTravel: (destinationId: string) => void
  onClose: () => void
}
```

Render identity, duchy/realm, holder/controller, contested state, locations, known characters, assets, and `前往这里`. The button calls `onPlanTravel(view.primaryLocationId)`.

- [ ] **Step 5: Narrow LocationDetails**

Remove `CountyWorldDetails` and the unconditional `<TravelPlanner>`. Add `onBackToCounty` and `onPlanTravel`; the top control says `返回伯爵领`, and the location action calls `onPlanTravel(locationId)`. Replace “道路网络可在旅行模式查看” with “道路网络可在地图信息中显示”.

- [ ] **Step 6: Compose detail precedence in MapDrawer**

Render exactly one primary details panel:

```tsx
selection.locationId
  ? <LocationDetails ... onBackToCounty={clearLocation} />
  : selection.countyId && countyView
    ? <CountyDetails ... />
    : null
```

Closing a location returns to the county; closing the county clears the complete selection.

- [ ] **Step 7: Register and run county/detail tests**

Run:

```bash
npm run test:map-county-view
npm run test:map-location-view
npm run test:world-selectors
npx tsc --noEmit
git diff --check
```

Expected: county and concrete location projections pass independently. Do not commit.

---

### Task 5: Scope and Budget People and Assets by Selected County

**Files:**
- Modify: `src/features/map/dynamicMapSubjects.ts`
- Modify: `src/features/map/mapDataDemand.ts`
- Modify: `src/features/map/mapLayers.ts`
- Modify: `src/features/map/MapCanvas.tsx`
- Modify: `src/features/map/MapDrawer.tsx`
- Modify: `scripts/test-map-semantic-projection.mjs`
- Modify: `scripts/test-map-data-demand.mjs`
- Modify: `scripts/test-map-integration.mjs`

**Interfaces:**
- Consumes: selected county ID, `MapPresentation`, semantic membership, known character points, and asset points.
- Produces:

```ts
export interface ScopedMapSubjects {
  characters: readonly MapCharacterPoint[]
  assets: readonly MapAssetPoint[]
  characterPoints: readonly MapCharacterPoint[]
  assetPoints: readonly MapAssetPoint[]
}

export function scopeMapSubjects(input: {
  countyId: string | null
  countyIdByLocationId: ReadonlyMap<string, string>
  characters: readonly MapCharacterPoint[]
  assets: readonly MapAssetPoint[]
  characterBudget?: number
  assetBudget?: number
}): ScopedMapSubjects
```

`characters` and `assets` are the complete county-scoped arrays used by detail lists and aggregate counts. `characterPoints` and `assetPoints` are the relevance-sorted independent markers capped at 8 and 6 respectively.

- [ ] **Step 1: Add failing county-scope and budget tests**

Create fixtures in `test-map-semantic-projection.mjs` with Winterfell and King's Landing subjects. Assert an empty county returns no map subjects, Winterfell returns no King's Landing subjects, the complete `characters` array retains a ninth Winterfell character for details and aggregation, and `characterPoints` contains only the first eight independent markers.

- [ ] **Step 2: Rewrite demand tests around overlays and selection**

Replace mode arrays with:

```js
assert.equal(needsCharacterNameData({ selectedCountyId: null, charactersVisible: true }), false)
assert.equal(needsCharacterNameData({ selectedCountyId: 'c_winterfell', charactersVisible: true }), true)
assert.equal(needsCharacterNameData({ selectedCountyId: 'c_winterfell', charactersVisible: false }), false)
assert.equal(needsPoliticalData({ politicalVisible: true, selectedCountyId: null }), true)
assert.equal(needsPoliticalData({ politicalVisible: false, selectedCountyId: 'c_winterfell' }), true)
```

- [ ] **Step 3: Run the tests and confirm old global-mode behavior fails**

Run:

```bash
npm run test:map-semantic-projection
npm run test:map-data-demand
```

Expected: FAIL on old `MapMode` signatures or unscoped results.

- [ ] **Step 4: Implement county scoping before aggregation**

Filter by `countyIdByLocationId.get(point.locationId) === countyId`, sort characters by current-player/event relevance then stable `characterId`, and sort assets by site/vehicle importance then stable ID. Return the full sorted county arrays plus budgeted point arrays. Update `syncDynamicMapSubjects` to build location aggregates from the full arrays and individual point collections from `characterPoints` and `assetPoints`. MapDrawer passes the full arrays to detail panels.

- [ ] **Step 5: Gate MapDrawer data loading by actual demand**

Use:

```ts
const needsCharacters = needsCharacterNameData({
  selectedCountyId: selection.countyId,
  charactersVisible: overlays.characters,
}) || selection.countyId !== null
const needsPolitics = needsPoliticalData({
  politicalVisible: overlays.political,
  selectedCountyId: selection.countyId,
})
```

Political projection loads for strategic political display or county details. Character names and asset projections load only for a selected county. Existing world-context known/rumored/stale filtering remains unchanged.

- [ ] **Step 6: Stop dynamic rebuilds during every wheel frame**

MapCanvas recomputes scoped source data only when selection, overlay preference, semantic band, stable subject arrays, or `moveend` viewport bounds change. The `zoom` handler only updates terrain/presentation paint; crossing a band boundary schedules one subject refresh.

- [ ] **Step 7: Run density, demand, and integration tests**

Run:

```bash
npm run test:map-data-demand
npm run test:map-semantic-projection
npm run test:map-intelligence
npm run test:map-integration
npx tsc --noEmit
git diff --check
```

Expected: all pass; `rg -n "mode === 'characters'|mode === 'assets'" src/features/map` returns no matches. Do not commit.

---

### Task 6: Unify Search and External Location Focus

**Files:**
- Modify: `src/features/map/types.ts`
- Modify: `src/features/map/repository.ts`
- Modify: `src/features/map/LocationSearch.tsx`
- Modify: `src/features/map/MapDrawer.tsx`
- Modify: `src/features/map/mapUiStore.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/StoryFeed.tsx`
- Modify: `src/components/Ck3CharacterWindow.tsx`
- Modify: `scripts/test-map-semantic-resolver.mjs`
- Modify: `scripts/check-story-character-links.mjs`
- Modify: `scripts/test-character-navigation.mjs`

**Interfaces:**
- Consumes: `MapFocusTarget`, semantic titles, semantic membership, and existing location search entries.
- Produces:

```ts
export interface MapSearchResult {
  target: MapFocusTarget
  name: string
  englishName?: string
  kind: 'county' | 'location'
  locationType?: MapLocationType
  importance: number
}

mapRepository.searchMapTargets(query: string, limit?: number): Promise<MapSearchResult[]>
```

- [ ] **Step 1: Add failing search and focus tests**

Assert:

```js
const winterfellCounty = results.find((entry) => entry.target.kind === 'county')
assert.equal(winterfellCounty.target.countyId, 'c_winterfell')
const winterfellCastle = results.find((entry) => entry.target.kind === 'location')
assert.equal(winterfellCastle.target.locationId, 'b_winterfell')
```

Source audits must assert that StoryFeed and character dossier call `openMap({ kind: 'location', locationId })`, and that search result markup does not render `entry.id`, `b_`, or `c_`.

- [ ] **Step 2: Run focused tests and confirm old string-only focus fails**

Run:

```bash
npm run test:map-semantic-resolver
npm run check:story-character-links
npm run test:character-navigation
```

Expected: FAIL on string-only `openMap` or missing county search results.

- [ ] **Step 3: Add typed target search to the repository**

Search county titles where `rank === 'county'` and concrete location entries in parallel. Score exact name, prefix, contains, then importance. Deduplicate by `kind + stable ID`, interleave county and location results by score, and cap after merging.

- [ ] **Step 4: Update LocationSearch**

Change `onSelect` to `(target: MapFocusTarget) => void`. Render localized kind text (`伯爵领`, `城堡`, `城市`, and existing location type labels) instead of internal IDs. Use `Castle`, `MapPin`, and existing high-quality icons.

- [ ] **Step 5: Resolve focus requests once in MapDrawer**

For county targets, select the county and fly to its semantic title center at county zoom. For location targets, resolve membership, write both county and location, then fly to the concrete location at local zoom. Track handled `focusRequest.id` in a ref so rerenders do not repeat flight.

If membership is missing, clear the formal selection, position the camera from the location entry without writing `locationId`, and show `伯爵领资料未记录`; do not infer a family seat.

- [ ] **Step 6: Update every external caller**

App adapters:

```tsx
const openMapLocation = useCallback((locationId: string) => {
  openMap({ kind: 'location', locationId })
}, [openMap])
```

Pass this adapter to `Ck3CharacterWindow`. StoryFeed uses the same typed location target. Asset drawer location links use the same adapter. Internal MapCanvas selection never calls the focus request path.

- [ ] **Step 7: Run navigation and type checks**

Run:

```bash
npm run test:map-semantic-resolver
npm run check:story-character-links
npm run test:character-navigation
npm run test:map-location-view
npx tsc --noEmit
git diff --check
```

Expected: all external links select the parent county and exact location; no internal map key is visible in search UI. Do not commit.

---

### Task 7: Make Travel a Visible Detail Action Instead of a Map Mode

**Files:**
- Modify: `src/features/map/mapUiStore.ts`
- Modify: `src/features/map/CountyDetails.tsx`
- Modify: `src/features/map/LocationDetails.tsx`
- Modify: `src/features/map/TravelPlanner.tsx`
- Modify: `src/features/map/JourneyPanel.tsx`
- Modify: `src/features/map/MapDrawer.tsx`
- Modify: `src/features/map/MapCanvas.tsx`
- Modify: `scripts/check-map-travel-ui.mjs`
- Modify: `scripts/test-map-travel.mjs`
- Modify: `scripts/test-world-transaction-queue.mjs`

**Interfaces:**
- Consumes: county primary location, explicit location IDs, existing `RoutePlan`, existing unified world transaction queue.
- Produces store state/actions:

```ts
travelTargetLocationId: string | null
travelPickOriginLocationId: string | null
beginTravelPlanning(locationId: string): void
beginDestinationPick(): void
chooseTravelDestination(locationId: string): void
cancelDestinationPick(): void
closeTravelPlanning(): void
```

- [ ] **Step 1: Rewrite travel UI audits before implementation**

Require:

```js
assert.match(countyDetails, /前往这里/)
assert.match(locationDetails, /前往这里/)
assert.match(drawer, /pick-travel-destination/)
assert.match(drawer, /正在选择目的地/)
assert.match(drawer, /取消选择/)
assert.doesNotMatch(store, /mapMode:\s*'travel'/)
assert.doesNotMatch(details, /<TravelPlanner[^>]*\/>/)
```

Retain existing assertions that commands enter `queueWorldTransaction` and that no global pending-action banner is introduced.

- [ ] **Step 2: Run travel tests and confirm the old mode/embedded planner fails**

Run:

```bash
npm run check:map-travel-ui
npm run test:map-travel
npm run test:world-transaction-queue
```

Expected: FAIL on `mapMode: 'travel'`, always-visible planner, or missing visible pick notice.

- [ ] **Step 3: Add explicit travel draft actions to MapUiStore**

`beginTravelPlanning` stores a target but leaves interaction in `browse`. `beginDestinationPick` stores the current target in `travelPickOriginLocationId` and changes interaction to `pick-travel-destination`. JourneyPanel first calls `beginTravelPlanning(journey.routePlan.to)` and then `beginDestinationPick()` when rerouting an active journey. `chooseTravelDestination` replaces the target and returns to `browse`. `cancelDestinationPick` restores the origin target and returns to `browse`. `closeTravelPlanning` clears preview and both target fields.

- [ ] **Step 4: Open TravelPlanner only from detail actions**

CountyDetails passes its `primaryLocationId`; LocationDetails passes its exact `locationId`. MapDrawer renders one planner panel only when `travelTargetLocationId` exists. TravelPlanner continues to own preference, mode, waypoint, route request, preview, confirmation, and unified queue submission.

- [ ] **Step 5: Route map clicks through visible destination picking**

When `interactionState === 'pick-travel-destination'`, county clicks resolve `primaryLocationForCounty(countyId)` and call `chooseTravelDestination`. The county still becomes the current map selection. A persistent notice above details says `正在选择目的地`, names the previous target when available, and includes `取消选择`.

- [ ] **Step 6: Keep active journeys presentation-independent**

Journey route, progress line, and position are visible whenever an active journey or route draft exists. JourneyPanel `改道` calls `beginDestinationPick` instead of changing a map mode. Pause, resume, return, and cancellation commands remain unchanged.

- [ ] **Step 7: Run travel and unified world tests**

Run:

```bash
npm run check:map-travel-ui
npm run test:map-travel
npm run test:world-transaction-queue
npm run test:world-travel-linkage
npm run test:turn-pipeline
npx tsc --noEmit
git diff --check
```

Expected: route planning, modification, cancellation, and queued settlement pass without a travel mode. Do not commit.

---

### Task 8: Finish Escape Precedence, Error Isolation, Styling, and Cleanup

**Files:**
- Modify: `src/features/map/mapUiStore.ts`
- Modify: `src/App.tsx`
- Modify: `src/features/map/MapDrawer.tsx`
- Modify: `src/features/map/MapErrorBoundary.tsx`
- Modify: `src/index.css`
- Modify: `scripts/check-map-drawer.mjs`
- Modify: `scripts/test-map-aesthetics.mjs`
- Modify: `scripts/test-map-data-demand.mjs`
- Modify: `scripts/test-map-integration.mjs`

**Interfaces:**
- Consumes: all final state from Tasks 1–7.
- Produces:

```ts
dismissMapContext(): boolean
```

It returns `true` after canceling destination picking, closing travel planning, clearing a concrete location, or clearing a county; it returns `false` when the drawer itself should close.

- [ ] **Step 1: Add failing dismissal and accessibility assertions**

Store test sequence:

```js
assert.equal(state.dismissMapContext(), true) // cancel destination picking
assert.equal(state.dismissMapContext(), true) // close travel planning
assert.equal(state.dismissMapContext(), true) // close location
assert.equal(state.dismissMapContext(), true) // close county
assert.equal(state.dismissMapContext(), false) // caller may close drawer
```

Source audits require visible labels and `aria-pressed` for overlay controls, `role="status"` for destination picking, and no five-mode CSS selectors.

- [ ] **Step 2: Implement Escape precedence**

In App, after item dialogs:

```ts
if (activeDrawer === 'map' && dismissMapContext()) return
closeDrawer()
```

Do not change character or asset drawer Escape behavior.

- [ ] **Step 3: Add final responsive styles**

Add focused classes for:

- `.map-information-menu`
- `.map-information-popover`
- `.map-county-details`
- `.map-location-details`
- `.map-destination-pick-notice`
- `.map-detail-back`

Desktop keeps details at the right edge inside the map drawer. At `max-width: 640px`, county/location/planner panels stack as internal bottom sheets without covering the search field. Remove `.map-mode-tabs` and `.map-mode-empty` styles after `rg` confirms no JSX consumers.

- [ ] **Step 4: Preserve fault isolation**

MapDrawer distinguishes semantic membership, political projection, subject projection, icon, and route errors. Semantic failure disables county interaction and shows reload; political failure hides political surface; people/assets failure disables only the affected list and overlay; route failure clears only the draft preview. Keep MapErrorBoundary local to the map canvas.

- [ ] **Step 5: Remove all obsolete mode and expansion references**

Run:

```bash
rg -n "MapMode|mapMode|MODE_VISIBILITY|TitleExpansion|titleExpansion|expandTitle|clearTitleExpansion|地图模式|旅行模式" src scripts --glob '*.ts' --glob '*.tsx' --glob '*.mjs'
```

Expected matches are only migration assertions that explicitly use `doesNotMatch`; remove every runtime and UI reference.

- [ ] **Step 6: Run the final focused UI/performance checks**

Run:

```bash
npm run check:map-drawer
npm run test:map-aesthetics
npm run test:map-data-demand
npm run test:map-integration
npm run check:map-runtime-boundaries
npm run check:no-emoji
npx tsc --noEmit
git diff --check
```

Expected: all pass; no five-mode selectors or runtime branches remain. Do not commit.

---

### Task 9: Full Map Verification and Diff Review

**Files:**
- Modify only files required to fix failures caused by Tasks 1–8.
- Do not regenerate map PBF, terrain, DEM, character, portrait, loadout, or artifact data.

**Interfaces:**
- Consumes: the complete implementation.
- Produces: verified current-workspace diff; no commit and no push.

- [ ] **Step 1: Run the complete map verification suite**

Run:

```bash
npm run verify:map
```

Expected: every map import, schema, runtime, demand, presentation, terrain, semantic, county, navigation, travel, political, integration, UI, boundary, and data audit passes.

- [ ] **Step 2: Run cross-system linkage tests**

Run:

```bash
npm run check:story-character-links
npm run test:character-navigation
npm run test:world-travel-linkage
npm run test:world-context-linkage
npm run test:turn-pipeline
```

Expected: all pass; map focus does not break story, dossier, world location, or turn settlement.

- [ ] **Step 3: Run TypeScript and the Windows production-equivalent code build**

Run:

```bash
npx tsc --noEmit
/mnt/c/Windows/System32/cmd.exe /d /s /c "cd /d C:\AGOT && npm run build:code"
```

Expected: TypeScript exits 0; Vite transforms all modules and builds successfully. Existing chunk-size warnings may remain but no build error is allowed.

- [ ] **Step 4: Audit the final diff without touching unrelated work**

Run:

```bash
git diff --check
git status --short
git diff --stat
git diff -- src/features/map src/App.tsx src/index.css scripts package.json docs/superpowers
```

Confirm:

- no generated map or character data was changed by this plan;
- no five-mode runtime remains;
- county and location selections are distinct;
- no external focus uses family seat or legal title fallback;
- route commands still enter the unified world queue;
- no Emoji or internal map IDs appear in new player-facing copy.

- [ ] **Step 5: Report the verified result and leave changes uncommitted**

Report changed files, test commands and counts, the Windows build result, and any unrelated pre-existing dirty files. Do not commit, push, merge, or delete branches.
