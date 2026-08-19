# CK3 Semantic Map Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline, three-rank CK3-style semantic zoom system with continuous camera behavior while preserving the selected map mode and the existing political, travel, character, asset, timeline, and turn authorities.

**Architecture:** The development-time Python importer unions province geometry into realm, duchy, and county vector layers while retaining `baronyId` only as an internal location key and publishes deterministic semantic indexes with manifest schema version 2. Runtime TypeScript validates those files, renders static boundaries and Chinese title labels from vector tiles, derives political house subtitles and character/asset aggregates from authoritative state, and uses a pure semantic-zoom controller plus a focused camera profile to drive MapLibre without rebuilding React state on every zoom frame.

**Tech Stack:** Python 3, unittest, Shapely 2, Pillow, mapbox-vector-tile, TypeScript, React, Zustand, Zod, MapLibre GL 5, Node test runner, Vite

**Spec:** `docs/superpowers/specs/2026-08-19-ck3-semantic-map-zoom-design.md`

## Global Constraints

- Runtime map code must remain fully offline and may only read project paths under `/data/agot-map/` and `/assets/agot-map/`.
- `/mnt/c/agot/2962333032` is a development-time import source only; never read it from runtime code and never add `npm run import:agot-map` to `verify` or `verify:quick`.
- Keep map zoom in the exact range `0–6` with administrative overlap bands `1.1–1.4` and `2.5–2.8`; use `4.1–4.4` only to cross-fade aggregates into detailed points and roads.
- Keep the current `terrain`, `political`, `characters`, `travel`, or `assets` mode while zoom changes; semantic zoom must never write `mapMode`.
- Use the existing geographical regions such as 北境、河间地 and 多恩 for the realm rank; do not treat AGOT `k_` titles as the strategic realm rank.
- Static boundaries and main labels must be vector tiles; do not load all semantic geometry as runtime GeoJSON. Never generate or render a barony boundary, label, tile layer, or zoom rank.
- Political fill remains existing province `feature-state`; dynamic house subtitles use a viewport-scoped GeoJSON source and never use `feature-state` for text.
- Character and asset aggregation must use semantic membership and authoritative visible state; do not create people, items, ownership, locations, or political facts in the map layer.
- LLM messages may contain verified Chinese place, county, duchy, and realm names, but never `baronyId`, a `b_` location key, a barony title/name, or a model-authored location transition.
- Existing routes and journey progress stay visible and are never recalculated, changed, or cancelled by zoom.
- Keep the implementation two-dimensional: no terrain mesh, tilt, buildings, or 3D scene in this plan.
- Use local Chinese labels only. A missing Chinese localization keeps the boundary, suppresses the visible label, and appears in the import report.
- Do not add Emoji. Use existing game icons first and Lucide only where an interface icon is required.
- Test data schema compatibility is intentionally broken: manifest schema version 1 must be rejected after schema version 2 lands.
- Do not modify or commit unrelated portrait data or character UI changes from the main workspace.
- Execute this plan inline with `superpowers:executing-plans`; the user has explicitly declined subagent execution.
- Run focused map tests and `npm run build:code` during implementation. Run full `npm run verify` only in the final verification task.

---

## File Structure

### Development-time importer

- `scripts/agot_map_import/models.py`: semantic rank, boundary, title, membership, and dataset records.
- `scripts/agot_map_import/semantic.py`: deterministic hierarchy expansion, geometry union/repair, localization filtering, representative points, and membership generation.
- `scripts/agot_map_import/tiles.py`: reusable semantic vector-tile writing and tile decoding audit.
- `scripts/agot_map_import/writer.py`: semantic JSON files, schema-v2 manifest, hashes, staging, and publication primitives.
- `scripts/agot_map_import/cli.py`: wire semantic generation into the explicit AGOT import and atomically publish data plus assets.
- `scripts/agot_map_import/semantic_anchors.json`: reviewed strategic-region-to-political-title anchors; an absent entry remains unanchored.
- `scripts/fixtures/agot_map_source/localization/simp_chinese/agot_map_fixture_l_simp_chinese.yml`: fixture Chinese names.
- `scripts/test_agot_map_import.py`: semantic importer, determinism, geometry, localization, tiles, and atomicity tests.

### Runtime data boundary

- `src/features/map/types.ts`: schema-v2 manifest and semantic runtime types.
- `src/features/map/schemas.ts`: strict parsers for schema-v2 manifest, titles, and membership.
- `src/features/map/repository.ts`: cached loaders for the two semantic JSON indexes.
- `scripts/test-map-schema.mjs`: accepted and rejected schema fixtures.
- `scripts/test-map-runtime.mjs`: repository cache/path behavior.

### Runtime rendering and behavior

- `src/features/map/semanticZoom.ts`: pure zoom weights, primary rank, densities, MapLibre interpolation expressions, and double-click targets.
- `src/features/map/cameraProfile.ts`: MapLibre camera options, input rates, bounds, reduced-motion animation policy, and teardown.
- `src/features/map/semanticPoliticalLabels.ts`: deterministic direct-holder/descendant-majority house subtitle projection.
- `src/features/map/semanticAggregation.ts`: stable character and asset aggregate records from membership.
- `src/features/map/mapStyle.ts`: semantic source, static boundary/title layers, dynamic subtitle source/layer, and zoom expressions.
- `src/features/map/mapLayers.ts`: five-mode visibility, semantic dynamic sources/layers, and viewport-scoped synchronization.
- `src/features/map/MapCanvas.tsx`: camera configuration, semantic-rank transitions, move-end refreshes, double-click, reduced motion, and cleanup.
- `scripts/test-map-semantic-zoom.mjs`: pure zoom and camera tests.
- `scripts/test-map-semantic-projection.mjs`: political subtitle and subject aggregation tests.
- `scripts/test-map-semantic-layers.mjs`: style, layer, mode, and MapCanvas integration checks.
- `src/features/map/narrativeLocationContext.ts`: verified Chinese place/county/duchy/realm projection for LLM messages without internal location keys.
- `src/features/world/worldTurnContext.ts`: resolve character and player location names through the semantic indexes.
- `src/services/promptBuilder.ts`: omit internal map IDs and prohibit model-authored location changes.
- `scripts/test-map-narrative-context.mjs`: location hierarchy and prompt leakage tests.

### Generated data and verification

- `public/data/agot-map/manifest.json`: schema-v2 manifest.
- `public/data/agot-map/semantic/titles.json`: localized title anchors.
- `public/data/agot-map/semantic/membership.json`: stable location hierarchy.
- `public/assets/agot-map/semantic/{z}/{x}/{y}.pbf`: realm, duchy, and county semantic boundaries and labels only.
- `scripts/audit-agot-map.mjs`: generated semantic data and tile audit.
- `scripts/check-map-runtime-boundaries.mjs`: offline, no-Emoji, and explicit-import boundaries.
- `README.md`: explicit regeneration command, runtime data contract, and two-dimensional extension boundary.
- `package.json`: focused semantic map tests added to `verify:map`, never the real import command.

---

### Task 1: Build the deterministic three-rank semantic dataset

**Files:**
- Modify: `scripts/agot_map_import/models.py`
- Create: `scripts/agot_map_import/semantic.py`
- Create: `scripts/agot_map_import/semantic_anchors.json`
- Create: `scripts/fixtures/agot_map_source/localization/simp_chinese/agot_map_fixture_l_simp_chinese.yml`
- Modify: `scripts/test_agot_map_import.py`

**Interfaces:**
- Consumes: `ProvinceGeometry`, `MapLocationRecord`, `TitleIndex.by_barony`, `TitleIndex.province_baronies`, `RegionDefinition`, and the `load_localization()` result `Mapping[str, str]`.
- Produces: `SemanticRank = Literal['realm', 'duchy', 'county']`; `SemanticBoundaryRecord`; `SemanticTitleRecord`; `SemanticMembershipRecord`; `SemanticDataset`; and `build_semantic_dataset(geometries, locations, titles, region_definitions, localization, anchors) -> SemanticDataset`.

- [ ] **Step 1: Add failing semantic dataset tests**

Append imports and a `SemanticDatasetTests` class that constructs two rectangular fixture provinces, calls `build_semantic_dataset()` with both forward and reversed dictionaries, and asserts the exact contract:

```python
from shapely.geometry import box

from scripts.agot_map_import.models import (
    MapLocationRecord, ProvinceGeometry, RegionDefinition, TitleAncestors,
)
from scripts.agot_map_import.semantic import build_semantic_dataset
from scripts.agot_map_import.titles import TitleIndex

class SemanticDatasetTests(unittest.TestCase):
    def _dataset(self, reverse: bool = False, missing: tuple[str, ...] = ()):
        rows = [
            (1, "b_winterfell", box(0, 0, 4, 4), "the_north"),
            (2, "b_kings_landing", box(4, 0, 8, 4), "the_crownlands"),
        ]
        if reverse:
            rows.reverse()
        geometries = {
            province_id: ProvinceGeometry(
                province_id, barony_id, 2 + 4 * index, 2,
                tuple(map(int, geometry.bounds)), 16, geometry, region_id,
            )
            for index, (province_id, barony_id, geometry, region_id) in enumerate(rows)
        }
        titles = TitleIndex(
            by_barony={
                "b_winterfell": TitleAncestors("c_winterfell", "d_winterfell", "k_westeros"),
                "b_kings_landing": TitleAncestors("c_kings_landing", "d_kings_landing", "k_westeros"),
            },
            province_baronies={1: "b_winterfell", 2: "b_kings_landing"},
        )
        regions = {
            "world_westeros": RegionDefinition("world_westeros", (), ("the_north", "the_crownlands"), "fixture", 1),
            "the_north": RegionDefinition("the_north", ("b_winterfell",), (), "fixture", 2),
            "the_crownlands": RegionDefinition("the_crownlands", ("b_kings_landing",), (), "fixture", 3),
        }
        localization = {
            "the_north": "北境", "b_winterfell": "临冬城", "c_winterfell": "临冬城伯爵领",
            "d_winterfell": "临冬城公国", "the_crownlands": "王领",
            "b_kings_landing": "君临", "c_kings_landing": "君临伯爵领", "d_kings_landing": "君临公国",
        }
        for key in missing:
            localization.pop(key, None)
        locations = [
            MapLocationRecord(
                id=barony_id, name=localization.get(barony_id, barony_id), english_name=None,
                type="castle", map_x=geometry.map_x, map_y=geometry.map_y,
                province_id=province_id, barony_id=barony_id,
                county_id=titles.by_barony[barony_id].county_id,
                duchy_id=titles.by_barony[barony_id].duchy_id, kingdom_id="k_westeros",
                region_id=geometry.region_id, terrain="plains", is_coastal=False,
                is_port=False, importance=100, tags=(),
            )
            for province_id, geometry in sorted(geometries.items())
            for barony_id in [geometry.barony_id]
        ]
        return build_semantic_dataset(
            geometries, locations, titles, regions, localization,
            {"the_north": "k_the_north", "the_crownlands": "k_the_crownlands"},
        )

    def test_builds_three_visible_ranks_internal_barony_key_and_membership(self):
        dataset = self._dataset()
        self.assertEqual([boundary.rank for boundary in dataset.boundaries].count("realm"), 2)
        self.assertEqual([boundary.rank for boundary in dataset.boundaries].count("duchy"), 2)
        self.assertEqual([boundary.rank for boundary in dataset.boundaries].count("county"), 2)
        self.assertEqual([title.feature_id for title in dataset.titles], list(range(1, 7)))
        self.assertTrue(all(title.geometry.covers(title.anchor) for title in dataset.titles))
        winterfell = next(item for item in dataset.memberships if item.location_id == "b_winterfell")
        self.assertEqual((winterfell.realm_id, winterfell.duchy_id, winterfell.county_id, winterfell.barony_id),
                         ("the_north", "d_winterfell", "c_winterfell", "b_winterfell"))

    def test_output_is_identical_when_input_order_is_reversed(self):
        self.assertEqual(self._dataset(), self._dataset(reverse=True))

    def test_missing_chinese_name_keeps_boundary_but_suppresses_title(self):
        dataset = self._dataset(missing=("d_winterfell",))
        self.assertTrue(any(item.title_id == "d_winterfell" for item in dataset.boundaries))
        self.assertFalse(any(item.title_id == "d_winterfell" for item in dataset.titles))
        self.assertIn("d_winterfell", dataset.missing_localizations)
```

Also add rejection tests for a participating province without a stable internal `baronyId`, a province whose barony cannot resolve to a county, an empty/repaired-to-empty visible union, a region cycle, and an anchor point outside its geometry. Add an explicit assertion that no boundary or title rank equals `barony`.

- [ ] **Step 2: Run the importer tests and confirm the new module is missing**

Run: `python3 -m unittest scripts.test_agot_map_import.SemanticDatasetTests -v`

Expected: FAIL with `ModuleNotFoundError: No module named 'scripts.agot_map_import.semantic'`.

- [ ] **Step 3: Add semantic records and the deterministic builder**

Add these records to `models.py` and implement `semantic.py` with sorted IDs, `shapely.make_valid`, `unary_union`, and `representative_point()`:

```python
SemanticRank = Literal["realm", "duchy", "county"]

@dataclass(frozen=True, slots=True)
class SemanticBoundaryRecord:
    feature_id: int
    title_id: str
    rank: SemanticRank
    name: str | None
    region_id: str
    political_anchor_title_id: str | None
    geometry: "BaseGeometry"

@dataclass(frozen=True, slots=True)
class SemanticTitleRecord:
    feature_id: int
    title_id: str
    rank: SemanticRank
    name: str
    map_x: float
    map_y: float
    importance: int
    region_id: str
    political_anchor_title_id: str | None
    geometry: "BaseGeometry"
    anchor: "BaseGeometry"

@dataclass(frozen=True, slots=True)
class SemanticMembershipRecord:
    location_id: str
    barony_id: str
    county_id: str | None
    duchy_id: str | None
    realm_id: str

@dataclass(frozen=True, slots=True)
class SemanticDataset:
    boundaries: tuple[SemanticBoundaryRecord, ...]
    titles: tuple[SemanticTitleRecord, ...]
    memberships: tuple[SemanticMembershipRecord, ...]
    missing_localizations: tuple[str, ...]
```

The builder must use this exact key order and feature-ID policy:

```python
RANK_ORDER = {"realm": 0, "duchy": 1, "county": 2}
RANK_IMPORTANCE = {"realm": 100, "duchy": 80, "county": 60}
keys = sorted(grouped_geometry, key=lambda item: (RANK_ORDER[item[0]], item[1]))
feature_ids = {key: index + 1 for index, key in enumerate(keys)}
```

For each province, derive `(realm_id, duchy_id, county_id, barony_id)` from the top-level children of `world_westeros` plus `TitleIndex`. Keep `barony_id` only in membership and never add it to `grouped_geometry`. Reject duplicate realm membership and hierarchy gaps. Union only realm, duchy, and county groups, run `make_valid`, reject empty/non-polygonal/out-of-map geometry, and create a visible title only when `localization.get(title_id, '').strip()` is non-empty. Sort boundaries by `feature_id`, titles by `feature_id`, memberships by `location_id`, and missing IDs lexicographically.

- [ ] **Step 4: Add reviewed fixture localization and anchor configuration**

Create the fixture localization with a valid Paradox localization header and Chinese strings:

```yaml
l_simp_chinese:
 the_north:0 "北境"
 the_crownlands:0 "王领"
 d_winterfell:0 "临冬城公国"
 c_winterfell:0 "临冬城伯爵领"
 b_winterfell:0 "临冬城"
 d_kings_landing:0 "君临公国"
 c_kings_landing:0 "君临伯爵领"
 b_kings_landing:0 "君临"
```

Create `semantic_anchors.json` as a deterministic reviewed mapping. The current real source does not provide one verified `k_` title per strategic region, so begin with the exact empty object below; every strategic region deliberately uses descendant-majority political resolution. Fixture tests continue to pass inline anchors and therefore test the optional anchor branch without publishing false real-data mappings:

```json
{}
```

- [ ] **Step 5: Run semantic and complete importer tests**

Run: `python3 -m unittest scripts.test_agot_map_import.SemanticDatasetTests -v`

Expected: PASS, including stable reverse-order output and missing-localization behavior.

Run: `python3 -m unittest scripts.test_agot_map_import -v`

Expected: PASS with all existing map importer tests unchanged.

- [ ] **Step 6: Commit the semantic dataset builder**

```bash
git add scripts/agot_map_import/models.py scripts/agot_map_import/semantic.py \
  scripts/agot_map_import/semantic_anchors.json \
  scripts/fixtures/agot_map_source/localization/simp_chinese/agot_map_fixture_l_simp_chinese.yml \
  scripts/test_agot_map_import.py
git commit -m "feat: 生成三级地图语义数据"
```

### Task 2: Publish semantic tiles, indexes, and manifest schema version 2 atomically

**Files:**
- Modify: `scripts/agot_map_import/tiles.py`
- Modify: `scripts/agot_map_import/writer.py`
- Modify: `scripts/agot_map_import/cli.py`
- Modify: `scripts/agot_map_import/audit.py`
- Modify: `scripts/test_agot_map_import.py`

**Interfaces:**
- Consumes: `SemanticDataset` from Task 1 and existing `_atomic_publish()`, `_staging_directory()`, `build_vector_tiles()`, and `write_map_dataset()` infrastructure.
- Produces: `semantic_vector_layers(dataset) -> dict[str, list[dict[str, object]]]`; `build_semantic_tiles(dataset, bounds, output, zooms, tile_size) -> TileReport`; schema-v2 `manifest.json`; `semantic/titles.json`; `semantic/membership.json`; and rollback-safe `publish_map_pair(data_stage, data_output, asset_stage, asset_output) -> None`.

- [ ] **Step 1: Add failing writer, tile, and rollback tests**

Extend `TileBuilderTests`, `MapWriterTests`, and `MapCliTests` with assertions for all four source layers and schema-v2 output. In each relevant `setUp`, assign `self.semantic_dataset = SemanticDatasetTests()._dataset()`. Create `self.data_stage` and `self.asset_stage` as populated sibling directories before the rollback test, and update the `_write()` helper to accept `semantic=self.semantic_dataset` plus `semantic_tile_count=1`:

```python
def test_semantic_tiles_contain_all_source_layers(self) -> None:
    report = build_semantic_tiles(self.semantic_dataset, (0, 0, 8, 4), self.root / "semantic", (0,), 16)
    decoded = mapbox_vector_tile.decode((self.root / "semantic/0/0/0.pbf").read_bytes())
    self.assertEqual(set(decoded), {
        "realm_boundaries", "duchy_boundaries", "county_boundaries", "title_labels",
    })
    self.assertGreater(report.tile_count, 0)

def test_writer_emits_schema_two_semantic_indexes_and_hash(self) -> None:
    manifest = self._write(self.root / "schema-two", semantic=self.semantic_dataset, semantic_tile_count=1)
    self.assertEqual(manifest["schemaVersion"], 2)
    self.assertEqual(manifest["paths"]["semantic"], "/assets/agot-map/semantic/{z}/{x}/{y}.pbf")
    self.assertEqual(manifest["counts"]["semanticRealms"], 2)
    self.assertEqual(manifest["counts"]["semanticLabels"], len(self.semantic_dataset.titles))
    self.assertRegex(manifest["semanticHash"], r"^[a-f0-9]{64}$")
    self.assertTrue((self.root / "schema-two/semantic/titles.json").is_file())
    self.assertTrue((self.root / "schema-two/semantic/membership.json").is_file())

def test_pair_publication_restores_both_previous_roots_on_second_swap_failure(self) -> None:
    data, assets = self.root / "data", self.root / "assets"
    data.mkdir(); assets.mkdir()
    (data / "marker").write_text("old-data")
    (assets / "marker").write_text("old-assets")
    with mock.patch("scripts.agot_map_import.writer.os.replace", side_effect=[None, None, OSError("swap failed")]):
        with self.assertRaisesRegex(OSError, "swap failed"):
            publish_map_pair(self.data_stage, data, self.asset_stage, assets)
    self.assertEqual((data / "marker").read_text(), "old-data")
    self.assertEqual((assets / "marker").read_text(), "old-assets")
```

Add an audit test that rejects duplicate semantic `featureId`, an anchor outside its geometry, a dangling membership title, an undecodable semantic tile, and an empty rank.

- [ ] **Step 2: Run the focused importer tests and verify the schema assertion fails**

Run: `python3 -m unittest scripts.test_agot_map_import.TileBuilderTests scripts.test_agot_map_import.MapWriterTests scripts.test_agot_map_import.MapCliTests -v`

Expected: FAIL because `build_semantic_tiles`, schema version 2 fields, and paired publication do not exist.

- [ ] **Step 3: Encode the five semantic vector layers**

Create layer features from the Task 1 records. Boundary properties must be exactly `featureId`, `titleId`, `rank`, `name`, `regionId`, and optional `politicalAnchorTitleId`; title point properties add `importance`. Use one source layer per boundary rank and one shared `title_labels` source layer:

```python
SEMANTIC_LAYER_BY_RANK = {
    "realm": "realm_boundaries",
    "duchy": "duchy_boundaries",
    "county": "county_boundaries",
}

def build_semantic_tiles(dataset, bounds, output, zooms, tile_size=512):
    return build_vector_tiles(
        semantic_vector_layers(dataset), bounds, output, zooms, tile_size=tile_size,
    )
```

After encoding each `.pbf`, decode it with `mapbox_vector_tile.decode()` during audit and reject a tile whose layer payload cannot be decoded.

- [ ] **Step 4: Write semantic indexes and schema-v2 manifest fields**

Serialize titles and memberships using these exact JSON shapes:

```json
{
  "featureId": 1,
  "titleId": "the_north",
  "rank": "realm",
  "name": "北境",
  "mapX": 1360.5,
  "mapY": 1447.5,
  "importance": 100,
  "regionId": "the_north",
  "politicalAnchorTitleId": "k_the_north"
}
```

```json
{
  "locationId": "b_winterfell",
  "baronyId": "b_winterfell",
  "countyId": "c_winterfell",
  "duchyId": "d_winterfell",
  "realmId": "the_north"
}
```

Upgrade the manifest to:

```python
"schemaVersion": 2,
"paths": {
    **existing_paths,
    "semantic": "/assets/agot-map/semantic/{z}/{x}/{y}.pbf",
    "semanticTitles": "/data/agot-map/semantic/titles.json",
    "semanticMembership": "/data/agot-map/semantic/membership.json",
},
"counts": {
    **existing_counts,
    "semanticTiles": semantic_tile_count,
    "semanticRealms": rank_counts["realm"],
    "semanticDuchies": rank_counts["duchy"],
    "semanticCounties": rank_counts["county"],
    "semanticLabels": len(semantic.titles),
    "missingSemanticLocalizations": len(semantic.missing_localizations),
},
"semanticHash": semantic_hash,
```

Write `reports/semantic.json` with rank counts, localized label count, sorted missing IDs, and the semantic hash. Include semantic JSON files in `datasetHash`; compute `semanticHash` from the semantic indexes and sorted semantic tile paths plus bytes.

- [ ] **Step 5: Stage, audit, and publish data plus assets as one rollback-safe pair**

Refactor `write_map_dataset()` so its file-writing body is callable as `stage_map_dataset(stage, ...)`. In `build_map()`, create sibling data and asset stages, generate terrain/vector/DEM/semantic assets and all data files, run `audit_map_records()` plus `audit_semantic_records()`, then call `publish_map_pair()` only after every check passes. The publisher must rename existing roots to unique backups, move both stages into place, and restore both backups if either move fails; remove backups only after both new roots exist.

Wire the builder with:

```python
anchors = json.loads(Path(__file__).with_name("semantic_anchors.json").read_text(encoding="utf-8"))
semantic = build_semantic_dataset(
    geometries, locations, titles, region_definitions, localization, anchors,
)
semantic_report = build_semantic_tiles(
    semantic, bounds, asset_stage / "semantic", range(args.max_vector_zoom + 1), args.tile_size,
)
```

`--skip-tiles` must set all four tile counts, including `semanticTiles`, to zero while still writing and validating the semantic indexes.

- [ ] **Step 6: Run all importer tests**

Run: `python3 -m unittest scripts.test_agot_map_import -v`

Expected: PASS. The fixture CLI manifest is schema version 2, contains semantic paths/counts/hash, and the previous-output preservation test passes for both data and asset roots.

- [ ] **Step 7: Commit semantic publication**

```bash
git add scripts/agot_map_import/tiles.py scripts/agot_map_import/writer.py \
  scripts/agot_map_import/cli.py scripts/agot_map_import/audit.py scripts/test_agot_map_import.py
git commit -m "feat: 发布地图语义瓦片与索引"
```

### Task 3: Enforce manifest schema version 2 and load semantic indexes at runtime

**Files:**
- Modify: `src/features/map/types.ts`
- Modify: `src/features/map/schemas.ts`
- Modify: `src/features/map/repository.ts`
- Modify: `scripts/test-map-schema.mjs`
- Modify: `scripts/test-map-runtime.mjs`

**Interfaces:**
- Consumes: Task 2 JSON shapes and manifest paths.
- Produces: `SemanticRank`; `SemanticTitle`; `SemanticMembership`; `SemanticMembershipIndex`; `parseSemanticTitles(value) -> SemanticTitle[]`; `parseSemanticMembership(value) -> SemanticMembership[]`; `buildSemanticMembershipIndex(titles, memberships) -> SemanticMembershipIndex`; `MapRepository.loadSemanticTitles()`; `MapRepository.loadSemanticMembership()`; and `MapRepository.loadSemanticIndex()`.

- [ ] **Step 1: Add failing strict-schema and repository tests**

Define a shared schema-v2 manifest fixture in both test files, then add:

```javascript
test('地图清单只接受版本二并要求全部语义路径与计数', () => {
  assert.equal(parseMapManifest(manifestV2).schemaVersion, 2)
  assert.throws(() => parseMapManifest({ ...manifestV2, schemaVersion: 1 }), /地图资料格式/)
  assert.throws(() => parseMapManifest({
    ...manifestV2,
    paths: { ...manifestV2.paths, semantic: 'https://example.test/{z}.pbf' },
  }), /项目内 AGOT 地图资源路径/)
})

test('语义标题与 membership 拒绝重复和悬空层级', () => {
  assert.equal(parseSemanticTitles([semanticTitle]).length, 1)
  assert.throws(() => parseSemanticTitles([semanticTitle, semanticTitle]), /featureId/)
  assert.throws(() => parseSemanticMembership([{ ...membership, realmId: '' }]), /realmId/)
  assert.throws(() => buildSemanticMembershipIndex(
    [semanticTitle], [{ ...membership, countyId: 'c_missing' }],
  ), /c_missing/)
})

test('仓储按清单路径缓存语义标题和 membership', async () => {
  const [titles, memberships] = await Promise.all([
    repository.loadSemanticTitles(), repository.loadSemanticMembership(),
  ])
  assert.equal(titles[0].name, '北境')
  assert.equal(memberships[0].locationId, 'b_winterfell')
  assert.equal(requested.filter((value) => value.endsWith('/semantic/titles.json')).length, 1)
})
```

- [ ] **Step 2: Run schema/runtime tests and verify schema version 1 is still accepted**

Run: `npm run test:map-schema && npm run test:map-runtime`

Expected: FAIL because `parseSemanticTitles`, `parseSemanticMembership`, and schema version 2 fields are absent.

- [ ] **Step 3: Add exact runtime types**

Add:

```typescript
export type SemanticRank = 'realm' | 'duchy' | 'county'

export interface SemanticTitle extends MapPixelPoint {
  featureId: number
  titleId: string
  rank: SemanticRank
  name: string
  importance: number
  regionId: string
  politicalAnchorTitleId?: string
}

export interface SemanticMembership {
  locationId: string
  baronyId: string
  countyId?: string
  duchyId?: string
  realmId: string
}

export interface SemanticMembershipIndex {
  titles: readonly SemanticTitle[]
  memberships: readonly SemanticMembership[]
  byLocationId: ReadonlyMap<string, SemanticMembership>
  titleById: ReadonlyMap<string, SemanticTitle>
}
```

Change `MapManifest.schemaVersion` to literal `2`; add the three semantic paths, six semantic counts, and `semanticHash: string` exactly as emitted in Task 2.

- [ ] **Step 4: Add strict Zod parsers and cached repository loaders**

Use `stableIdSchema` for all title/location IDs, `z.enum(['realm', 'duchy', 'county'])`, map coordinate bounds `0–9216` and `0–6144`, positive integer `featureId`, `importance` integer `0–100`, and `.strict()` on every record. Add `superRefine` duplicate checks for `featureId`, `(rank,titleId)`, and `locationId`. Export parse wrappers with Chinese error prefixes.

After parsing, `buildSemanticMembershipIndex()` must require every `countyId`, optional `duchyId`, and `realmId` to resolve to a title with the matching rank; it ignores the internal `baronyId` as a visible title. Repository methods must resolve paths only through the parsed manifest:

```typescript
loadSemanticTitles(): Promise<SemanticTitle[]> {
  return this.loadManifest().then((manifest) =>
    this.loadJson(manifest.paths.semanticTitles, parseSemanticTitles))
}

loadSemanticMembership(): Promise<SemanticMembership[]> {
  return this.loadManifest().then((manifest) =>
    this.loadJson(manifest.paths.semanticMembership, parseSemanticMembership))
}

async loadSemanticIndex(): Promise<SemanticMembershipIndex> {
  const [titles, memberships] = await Promise.all([
    this.loadSemanticTitles(), this.loadSemanticMembership(),
  ])
  return buildSemanticMembershipIndex(titles, memberships)
}
```

- [ ] **Step 5: Run focused tests and TypeScript build**

Run: `npm run test:map-schema && npm run test:map-runtime`

Expected: PASS, including explicit rejection of schema version 1 and external semantic paths.

Run: `npm run build:code`

Expected: PASS with no stale schema-v1 manifest fixtures in TypeScript-checked code.

- [ ] **Step 6: Commit the runtime data boundary**

```bash
git add src/features/map/types.ts src/features/map/schemas.ts src/features/map/repository.ts \
  scripts/test-map-schema.mjs scripts/test-map-runtime.mjs
git commit -m "feat: 校验地图语义数据边界"
```

### Task 4: Implement continuous semantic zoom weights and CK3 camera policy

**Files:**
- Create: `src/features/map/semanticZoom.ts`
- Create: `src/features/map/cameraProfile.ts`
- Create: `scripts/test-map-semantic-zoom.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `SemanticRank`, MapLibre `Map`, `MapOptions`, `LngLatBoundsLike`, and `MediaQueryList.matches`.
- Produces: `semanticZoomState(zoom) -> SemanticZoomState`; `semanticRankOpacityExpression(rank)`; `semanticLabelSizeExpression(rank)`; `nextSemanticZoom(zoom)`; `createCk3MapOptions(manifest, reducedMotion)`; `configureCk3Camera(map, reducedMotion) -> () => void`; and `cameraAnimation(reducedMotion, kind) -> { duration: number; essential: boolean }`.

- [ ] **Step 1: Write failing pure semantic zoom and camera tests**

Create the Node test file with boundary and midpoint assertions:

```javascript
test('三级权重在两个行政重叠区连续交叉且总和为一', () => {
  assert.deepEqual(semanticZoomState(0).weights, { realm: 1, duchy: 0, county: 0 })
  assert.deepEqual(semanticZoomState(1.25).weights, { realm: 0.5, duchy: 0.5, county: 0 })
  assert.deepEqual(semanticZoomState(2.65).weights, { realm: 0, duchy: 0.5, county: 0.5 })
  assert.deepEqual(semanticZoomState(4.25).weights, { realm: 0, duchy: 0, county: 1 })
  assert.deepEqual(semanticZoomState(6).weights, { realm: 0, duchy: 0, county: 1 })
  assert.equal(semanticZoomState(4.25).detailMix, 0.5)
})

test('双击只推进到下一个语义观察层', () => {
  assert.equal(nextSemanticZoom(0), 2)
  assert.equal(nextSemanticZoom(2.2), 3.4)
  assert.equal(nextSemanticZoom(3.8), 5)
  assert.equal(nextSemanticZoom(5.2), 6)
})

test('伯爵领细节观察点不会创建第四个行政层', () => {
  assert.equal(semanticZoomState(5).primaryRank, 'county')
  assert.equal(semanticZoomState(5).detailMix, 1)
})

test('减少动态效果关闭惯性和长动画', () => {
  assert.deepEqual(cameraAnimation(true, 'search'), { duration: 0, essential: false })
  assert.deepEqual(cameraAnimation(false, 'search'), { duration: 850, essential: true })
  assert.deepEqual(cameraAnimation(false, 'semantic'), { duration: 420, essential: true })
})
```

Use a fake MapLibre handler to assert `setWheelZoomRate(1 / 600)`, `setZoomRate(1 / 160)`, `doubleClickZoom.disable()`, rotation disablement, and cleanup of the custom double-click listener.

- [ ] **Step 2: Run the new test and verify both modules are absent**

Run: `node --experimental-strip-types scripts/test-map-semantic-zoom.mjs`

Expected: FAIL with a module-not-found error for `semanticZoom.ts`.

- [ ] **Step 3: Implement exact overlap math and expressions**

Use clamped linear interpolation with the exact rank bands:

```typescript
const CROSS_FADES = {
  realmToDuchy: [1.1, 1.4],
  duchyToCounty: [2.5, 2.8],
} as const
const DETAIL_CROSS_FADE = [4.1, 4.4] as const

export interface SemanticZoomState {
  zoom: number
  primaryRank: SemanticRank
  weights: Record<SemanticRank, number>
  detailMix: number
  characterAggregateOpacity: number
  characterPointOpacity: number
  assetAggregateOpacity: number
  assetPointOpacity: number
  roadDensity: number
  locationDensity: number
}

function fade(start: number, end: number, zoom: number): number {
  return Math.min(1, Math.max(0, (zoom - start) / (end - start)))
}
```

Return three rank weights that sum to exactly one and choose the deeper rank on a tie. Keep county weight at `1` from zoom `2.8` through `6`. Separately expose `detailMix = fade(4.1, 4.4, zoom)`, `characterAggregateOpacity = 1 - detailMix`, `characterPointOpacity = detailMix`, equivalent asset values, and monotonic road/location densities. Clamp non-finite zoom to `0` and all finite zoom to `0–6`.

The zoom targets `2`, `3.4`, `5`, and `6` mean duchy overview, county overview, county detail, and maximum county detail respectively; zoom `5` is not a fourth semantic rank. Export MapLibre expressions with the same stops, including realm `[0,1,1.1,1,1.4,0]`, duchy `[1.1,0,1.4,1,2.5,1,2.8,0]`, and county `[2.5,0,2.8,1,6,1]`. Label-size expressions must be realm `22–18`, duchy `18–15`, and county `15–12` over each rank’s active range. Export a separate detail expression `[4.1,0,4.4,1,6,1]` for points, roads, and locations only; it must never control an administrative boundary or title.

- [ ] **Step 4: Implement the camera profile without storing map mode**

`createCk3MapOptions()` must return `zoomSnap: 0`, `minZoom: 0`, `maxZoom: 6`, `maxPitch: 0`, `pitchWithRotate: false`, `dragRotate: false`, `touchPitch: false`, `renderWorldCopies: false`, and `maxBounds` computed from `mapPixelToLngLat()` using `manifest.westerosBounds`. `configureCk3Camera()` must configure scroll rates, disable double-click zoom and all rotation, leave native pointer-anchored scroll and pinch zoom active, and return one teardown function for every listener it owns.

- [ ] **Step 5: Register and run the focused test**

Add:

```json
"test:map-semantic-zoom": "node --experimental-strip-types scripts/test-map-semantic-zoom.mjs"
```

Run: `npm run test:map-semantic-zoom && npm run build:code`

Expected: PASS. The test confirms continuous weights, fixed targets, camera rates, reduced motion, and cleanup.

- [ ] **Step 6: Commit semantic zoom and camera policy**

```bash
git add src/features/map/semanticZoom.ts src/features/map/cameraProfile.ts \
  scripts/test-map-semantic-zoom.mjs package.json
git commit -m "feat: 添加 CK3 式地图镜头规则"
```

### Task 5: Render static semantic boundaries, Chinese labels, and mode-preserving detail

**Files:**
- Modify: `src/features/map/mapStyle.ts`
- Modify: `src/features/map/mapLayers.ts`
- Create: `scripts/test-map-semantic-layers.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: schema-v2 `MapManifest`, `semanticRankOpacityExpression()`, `semanticLabelSizeExpression()`, existing `MapMode`, and existing province political `feature-state`.
- Produces: semantic source ID `agot-semantic`; boundary layers `agot-realm-boundaries`, `agot-duchy-boundaries`, `agot-county-boundaries`; main label layers `agot-realm-labels`, `agot-duchy-labels`, `agot-county-labels`; dynamic source/layer IDs `agot-political-house-label-source` and `agot-political-house-labels`; and complete `MODE_VISIBILITY` coverage.

- [ ] **Step 1: Add failing style and mode tests**

Create tests that inspect the returned style object rather than screenshots:

```javascript
test('样式只包含三级可见边界和三级中文主标签', () => {
  const style = createLocalMapStyle(manifestV2)
  assert.deepEqual(style.sources['agot-semantic'].tiles, [manifestV2.paths.semantic])
  for (const rank of ['realm', 'duchy', 'county']) {
    const boundary = style.layers.find((layer) => layer.id === `agot-${rank}-boundaries`)
    const label = style.layers.find((layer) => layer.id === `agot-${rank}-labels`)
    assert.equal(boundary['source-layer'], `${rank}_boundaries`)
    assert.equal(label['source-layer'], 'title_labels')
    assert.deepEqual(label.filter, ['==', ['get', 'rank'], rank])
    assert.equal(label.layout['text-field'], ['get', 'name'])
  }
  assert.doesNotMatch(JSON.stringify(style), /https?:|glyphs|sprite/)
})

test('五种模式切换不会写入 zoom 或地图模式之外的状态', () => {
  for (const mode of ['terrain', 'political', 'characters', 'travel', 'assets']) {
    const map = fakeMapWithAllSemanticLayers()
    applyMapMode(map, mode)
    assert.equal(map.zoomCalls.length, 0)
    assert.equal(map.visibility.get('agot-political-house-labels'), mode === 'political' ? 'visible' : 'none')
  }
})
```

Also assert: political provinces remain visible at every zoom in political mode; old `agot-borders` does not duplicate semantic borders; roads increase opacity/detail with zoom; route layers are visible only in travel mode; semantic title layers appear before generic location points so mode labels win collision priority; and every new layer ID occurs in all five `MODE_VISIBILITY` entries.

- [ ] **Step 2: Run the new style test and confirm semantic source/layers are absent**

Run: `node --experimental-strip-types scripts/test-map-semantic-layers.mjs`

Expected: FAIL because `agot-semantic` and the three visible rank layers do not exist.

- [ ] **Step 3: Add the local semantic vector source and static layers**

Add the source:

```typescript
'agot-semantic': {
  type: 'vector',
  tiles: [manifest.paths.semantic],
  minzoom: manifest.minZoom,
  maxzoom: manifest.maxZoom,
},
```

For each visible rank, add a line layer using its matching source layer, zoom-opacity expression, rank-specific width expression, and a dark casing effect supplied by line color/blur rather than duplicate geometries. Use realm `#d9c99d`, duchy `#c2ad78`, and county `#aa9160`; widths range respectively `1.8–3.2`, `1.2–2.6`, and `0.8–2.0` over active zooms. Add a test that serialized style contains neither `barony_boundaries` nor an `agot-barony-` layer ID. Replace the old province-border layer with these layers; keep `agot-provinces` only as political fill.

Add one symbol layer per rank with:

```typescript
layout: {
  'text-field': ['get', 'name'],
  'text-font': ['Noto Sans CJK SC Regular'],
  'text-size': semanticLabelSizeExpression(rank),
  'text-letter-spacing': rank === 'realm' ? 0.14 : 0.08,
  'text-allow-overlap': false,
  'text-ignore-placement': false,
  'symbol-sort-key': ['-', 100, ['get', 'importance']],
},
paint: {
  'text-color': '#eadcb6',
  'text-halo-color': '#17130d',
  'text-halo-width': rank === 'realm' ? 2.2 : 1.5,
  'text-opacity': semanticRankOpacityExpression(rank),
}
```

Do not set a `glyphs` URL; rely on MapLibre local ideograph rendering and set `localIdeographFontFamily: 'Noto Sans CJK SC, Microsoft YaHei, sans-serif'` in the Map constructor during Task 8. Also define `agot-political-house-label-source` as an empty GeoJSON source and `agot-political-house-labels` as a symbol layer with `text-field: ['get', 'politicalHouseLabel']`; it starts hidden and contains no static political truth.

- [ ] **Step 4: Encode mode visibility and zoom-aware terrain/travel detail**

Keep the three semantic boundary and title layers visible in all five modes. Show `agot-provinces` and `agot-political-house-labels` only in political mode; roads in terrain and travel; base route network and active route layers only in travel; character sources only in character mode; asset sources only in asset mode. Change roads and generic location filters to continuous expressions aligned with `semanticZoomState()` and preserve current `mapMode` by keeping `applyMapMode(map, mode)` a pure set-layout loop with no camera/store calls.

- [ ] **Step 5: Register and run layer tests plus existing runtime tests**

Add:

```json
"test:map-semantic-layers": "node --experimental-strip-types scripts/test-map-semantic-layers.mjs"
```

Run: `npm run test:map-semantic-layers && npm run test:map-runtime && npm run build:code`

Expected: PASS. Serialized style contains only project-local source paths and no three-dimensional `terrain` property.

- [ ] **Step 6: Commit static semantic rendering**

```bash
git add src/features/map/mapStyle.ts src/features/map/mapLayers.ts \
  scripts/test-map-semantic-layers.mjs package.json
git commit -m "feat: 渲染地图语义边界与标题"
```

### Task 6: Derive deterministic political house subtitles from the current timeline projection

**Files:**
- Modify: `src/features/map/politicalProjection.ts`
- Create: `src/features/map/semanticPoliticalLabels.ts`
- Create: `scripts/test-map-semantic-projection.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `PoliticalFeatureState[]`, `changedTitleIds()`, `SemanticTitle[]`, `SemanticMembership[]`, viewport `MapBounds`, `SemanticRank`, `mapPixelToLngLat()`, and public house metadata from `HOUSES`.
- Produces: `PoliticalFeatureState.houseLabel?: string`; `resolveSemanticPoliticalHouse(title, states, memberships) -> SemanticPoliticalHouse | undefined`; `buildPoliticalHouseLabelCollection(input) -> GeoJSON.FeatureCollection`; and `semanticTitlesAffectedByChanges(changedTitleIds, memberships) -> ReadonlySet<string>`.

- [ ] **Step 1: Write failing direct-holder, majority, secrecy, and deterministic tie tests**

Create fixtures for two counties and one realm:

```javascript
test('政治副标题优先直接公开持有人之家族', () => {
  const result = resolveSemanticPoliticalHouse(countyTitle, [
    state('b_one', 'c_winterfell', 'stark', '史塔克家族'),
    state('b_two', 'd_winterfell', 'bolton', '波顿家族'),
  ], memberships)
  assert.deepEqual(result, { houseId: 'stark', houseLabel: '史塔克家族', holderId: 'agot:Ned_1' })
})

test('战略区域无直接锚点时按公开省份多数并以稳定家族 ID 破同票', () => {
  assert.equal(resolveSemanticPoliticalHouse(realmTitle, tiedStates, memberships).houseId, 'arryn')
})

test('没有公开家族时不生成替代标签', () => {
  assert.equal(resolveSemanticPoliticalHouse(countyTitle, secretOnlyStates, memberships), undefined)
})

test('副标题集合只包含当前视野和当前主要语义层', () => {
  const collection = buildPoliticalHouseLabelCollection({
    rank: 'county', titles, states, memberships, pixelBounds, manifest,
  })
  assert.deepEqual(collection.features.map((feature) => feature.properties.titleId), ['c_winterfell'])
  assert.equal(collection.features[0].properties.politicalHouseLabel, '史塔克家族')
})
```

Add a change-impact test where changing one internal barony state returns its county, duchy, and realm semantic IDs but not an unrelated county.

- [ ] **Step 2: Run the projection test and confirm the module is absent**

Run: `node --experimental-strip-types scripts/test-map-semantic-projection.mjs`

Expected: FAIL with module-not-found for `semanticPoliticalLabels.ts`.

- [ ] **Step 3: Add verified house labels to existing political projection**

Extend `PoliticalFeatureState` with `houseLabel?: string`. In `holderStyle()`, emit `localHouse?.name` only when the normalized public house ID resolves to a reviewed `HOUSES` record. If no reviewed Chinese house name exists, omit `houseLabel` and therefore omit the subtitle. Never synthesize a label from an ID, inspect hidden world state, or infer a family from sigil/color.

- [ ] **Step 4: Implement subtitle resolution and viewport collection**

For direct resolution, use `title.politicalAnchorTitleId ?? title.titleId` and choose public states whose `effectiveTitleId` equals that ID; sort by `holderId` and take the first stable result. If absent, select descendant baronies through membership for the semantic title’s rank, count states by `houseId`, sort by descending count then ascending `houseId`, and return the winning state’s verified `houseLabel` and holder. If any required `houseId` or `houseLabel` is absent, skip it.

Build point features at each title’s `(mapX,mapY)` with exact properties:

```typescript
{
  featureId: title.featureId,
  titleId: title.titleId,
  politicalHouseId: resolved.houseId,
  politicalHouseLabel: resolved.houseLabel,
  politicalHolderId: resolved.holderId ?? null,
}
```

Filter by exact rank and pixel viewport before resolution; sort output by numeric `featureId`. `semanticTitlesAffectedByChanges()` must map changed internal barony IDs through membership to county, duchy, and realm semantic IDs and include a changed effective title ID directly.

- [ ] **Step 5: Run projection tests and existing political tests**

Run: `npm run test:map-political-projection && node --experimental-strip-types scripts/test-map-semantic-projection.mjs && npm run build:code`

Expected: PASS. Existing province colors and incremental `changedTitleIds()` behavior remain unchanged.

- [ ] **Step 6: Register and commit semantic political projection**

Add:

```json
"test:map-semantic-projection": "node --experimental-strip-types scripts/test-map-semantic-projection.mjs"
```

Then:

```bash
git add src/features/map/politicalProjection.ts src/features/map/semanticPoliticalLabels.ts \
  scripts/test-map-semantic-projection.mjs package.json
git commit -m "feat: 投影地图政治家族副标题"
```

### Task 7: Aggregate visible characters and assets by semantic membership

**Files:**
- Create: `src/features/map/semanticAggregation.ts`
- Modify: `src/features/map/mapLayers.ts`
- Modify: `scripts/test-map-semantic-projection.mjs`
- Modify: `scripts/test-map-integration.mjs`

**Interfaces:**
- Consumes: authoritative `MapCharacterPoint[]`, `MapAssetPoint[]`, `SemanticMembership[]`, `SemanticTitle[]`, `MapBounds`, `SemanticZoomState`, and existing `filterMapPointsByPixelBounds()`.
- Produces: `SemanticSubjectAggregate`; `aggregateCharacterPoints(input) -> SemanticSubjectAggregate[]`; `aggregateAssetPoints(input) -> SemanticSubjectAggregate[]`; dynamic layer IDs `agot-character-aggregates` and `agot-asset-aggregates`; and `syncDynamicMapSubjects(..., semanticContext) -> void`.

- [ ] **Step 1: Add failing stable aggregation tests**

Append:

```javascript
test('人物中景按伯爵领聚合，缺少伯爵领时回退公国', () => {
  const groups = aggregateCharacterPoints({ points: characters, memberships, titles, pixelBounds })
  assert.deepEqual(groups, [
    {
      id: 'characters:county:c_winterfell', kind: 'characters', rank: 'county',
      scopeId: 'c_winterfell', mapX: 120, mapY: 90, count: 2,
      memberIds: ['agot:Arya_1', 'agot:Ned_1'],
    },
    {
      id: 'characters:duchy:d_the_neck', kind: 'characters', rank: 'duchy',
      scopeId: 'd_the_neck', mapX: 180, mapY: 140, count: 1,
      memberIds: ['agot:Howland_1'],
    },
  ])
})

test('资产先按地点聚合，县内超过八个地点时提升为伯爵领聚合', () => {
  const groups = aggregateAssetPoints({ points: denseAssets, memberships, titles, pixelBounds })
  assert.equal(groups[0].id, 'assets:county:c_winterfell')
  assert.equal(groups[0].count, denseAssets.length)
})

test('反向输入、重复输入和视野外输入不会改变聚合结果', () => {
  assert.deepEqual(aggregateCharacterPoints(base), aggregateCharacterPoints(reversedDuplicatedAndOffscreen))
})
```

Use already-projected points so deceased people, unknown positions, invalid locations, and hidden intelligence are absent before aggregation; add an integration assertion that those records never reappear.

- [ ] **Step 2: Run semantic projection/integration tests and verify aggregation exports are absent**

Run: `npm run test:map-semantic-projection && npm run test:map-integration`

Expected: FAIL because `semanticAggregation.ts` and aggregate layers do not exist.

- [ ] **Step 3: Implement stable semantic aggregation**

Define:

```typescript
export interface SemanticSubjectAggregate extends MapPixelPoint {
  id: string
  kind: 'characters' | 'assets'
  rank: 'county' | 'duchy' | 'location'
  scopeId: string
  count: number
  memberIds: string[]
}
```

Deduplicate input by stable subject ID, crop by pixel bounds first, look up membership by `locationId`, group characters by county with duchy fallback, and sort member IDs. Assets group by `locationId`; if a county contains assets at more than eight distinct locations, replace those location groups with one county group. Character groups and promoted county asset groups use the matching semantic title anchor and are suppressed when that anchor is missing. Location asset groups use the authoritative map coordinates shared by their sorted member points and set `rank: 'location'`. Form IDs as `${kind}:${rank}:${scopeId}` and sort by group ID.

- [ ] **Step 4: Add aggregate sources/layers and cross-fade properties**

Keep separate aggregate and point layers so only individual points are clickable. Aggregate features have `{ id, kind, rank, scopeId, count, memberIds }`. Add circle plus symbol count layers for character and asset aggregates. In the `4.1–4.4` overlap, aggregate paint opacity follows `1 - detailMix` and individual point opacity follows `detailMix`; the county boundary and county title remain fully active. For zoom below `2.5`, send empty feature collections; from `2.5` through `4.4`, send aggregates; from `4.1` through `6`, send individuals. Do not recompute on continuous `zoom`; synchronization occurs only at initial load, `moveend`, authoritative subject changes, or a primary semantic-rank transition.

- [ ] **Step 5: Run aggregation, integration, and TypeScript tests**

Run: `npm run test:map-semantic-projection && npm run test:map-integration && npm run build:code`

Expected: PASS. Existing character-point click opens the same dossier, asset-point click opens the same location, and aggregate circles do not pretend to be individual records.

- [ ] **Step 6: Commit semantic subject aggregation**

```bash
git add src/features/map/semanticAggregation.ts src/features/map/mapLayers.ts \
  scripts/test-map-semantic-projection.mjs scripts/test-map-integration.mjs
git commit -m "feat: 按领地聚合地图人物与资产"
```

### Task 8: Integrate camera, semantic refresh, political subtitles, travel detail, and cleanup in MapCanvas

**Files:**
- Modify: `src/features/map/MapCanvas.tsx`
- Modify: `src/features/map/mapLayers.ts`
- Modify: `scripts/test-map-semantic-layers.mjs`
- Modify: `scripts/test-map-integration.mjs`

**Interfaces:**
- Consumes: Task 3 repository loaders, Task 4 camera/zoom APIs, Task 6 subtitle projection, Task 7 aggregation, existing `PoliticalFeatureState[]`, journey GeoJSON, and current `MapMode` prop.
- Produces: one runtime `SemanticRuntimeContext`; refresh functions `refreshSemanticSubjects()` and `refreshPoliticalHouseLabels()`; custom double-click semantic zoom; search fly-to zoom `4.8`; and complete listener/source teardown.

- [ ] **Step 1: Add failing source-update cadence, mode preservation, travel, and cleanup checks**

Extend structural and fake-map tests to assert:

```javascript
test('MapCanvas 只在 moveend、语义主层变化或权威状态变化时刷新动态语义源', () => {
  const source = readFileSync('src/features/map/MapCanvas.tsx', 'utf8')
  assert.match(source, /semanticZoomState\(map\.getZoom\(\)\)/)
  assert.match(source, /map\.on\('zoomend'/)
  assert.match(source, /refreshPoliticalHouseLabels/)
  assert.doesNotMatch(source, /map\.on\('zoom',\s*refresh(?:Political|Semantic)/)
})

test('缩放不会修改地图模式且旅程路线始终来自原 routePlan', () => {
  const source = readFileSync('src/features/map/MapCanvas.tsx', 'utf8')
  assert.doesNotMatch(source, /setMapMode|useMapUiStore/)
  assert.match(source, /syncJourneyLayers\(map, manifest, routeRef\.current\.routePlan/)
})

test('双击、zoomend 和动态语义监听器在销毁时全部解绑', () => {
  const source = readFileSync('src/features/map/MapCanvas.tsx', 'utf8')
  for (const event of ['dblclick', 'zoomend', 'moveend']) {
    assert.match(source, new RegExp(`map\\.off\\('${event}'`))
  }
  assert.match(source, /cameraCleanup\(\)/)
})
```

Add a fake source test: political subtitle `setData` is not called for an unrelated changed title, is called once for an affected current-viewport title, and a thrown subtitle projection hides only `agot-political-house-labels` while route source data remains intact.

- [ ] **Step 2: Run semantic layer/integration tests and verify integration checks fail**

Run: `npm run test:map-semantic-layers && npm run test:map-integration`

Expected: FAIL because MapCanvas does not configure semantic camera events or load semantic indexes.

- [ ] **Step 3: Load semantic indexes once and construct runtime indexes**

During `load`, call `mapRepository.loadSemanticIndex()` once. Use its already cross-validated titles and memberships before storing them in a ref:

```typescript
interface SemanticRuntimeContext extends SemanticMembershipIndex {
  primaryRank: SemanticRank
}
```

A load failure must call `onWarning('地图语义资料未能载入，请重新载入地图')`, set the map-local initialization error state, and leave the surrounding application mounted. Do not fetch a source-mod path and do not substitute English labels.

- [ ] **Step 4: Configure continuous camera and exact input behavior**

Build map options with `createCk3MapOptions()` and add `localIdeographFontFamily: 'Noto Sans CJK SC, Microsoft YaHei, sans-serif'`. Resolve reduced motion with `window.matchMedia('(prefers-reduced-motion: reduce)')`, call `configureCk3Camera()`, and subscribe to media-query changes so later fly/ease calls use the current policy.

On `dblclick`, prevent the default, keep `event.lngLat` as the center, and call `easeTo({ center, zoom: nextSemanticZoom(currentZoom), ...cameraAnimation(reduced, 'semantic') })`. Do not trigger location selection from the double-click handler. Selected-location search uses fixed zoom `4.8` and `cameraAnimation(reduced, 'search')`; it may bypass intermediate semantic targets by design.

- [ ] **Step 5: Refresh semantic dynamic data only at stable boundaries**

On initial load and `moveend`, calculate pixel bounds once, call `syncDynamicMapSubjects()` with semantic context and `semanticZoomState(map.getZoom())`, then update political house subtitles if mode is political. On `zoomend`, compare `primaryRank` with the ref; refresh only if it changed. On political state changes, continue incremental province `feature-state` updates, then use `semanticTitlesAffectedByChanges()` to skip subtitle `setData` when no affected current-viewport title exists.

Use the empty GeoJSON source `agot-political-house-label-source` and symbol layer `agot-political-house-labels` created by Task 5. Keep that layer below generic location layers, with size `11–13`, muted gold color, dark halo, collision enabled, and political-only visibility. Catch subtitle projection errors, set this source to an empty feature collection, hide the layer, and warn without touching terrain, travel, story, dossier, turn, or save state.

- [ ] **Step 6: Preserve route visibility and increase travel detail by zoom**

Keep `JOURNEY_ROUTE_SOURCE`, `JOURNEY_PROGRESS_SOURCE`, and `JOURNEY_POSITION_SOURCE` visible at all zooms whenever travel mode is active. Use continuous line width and opacity expressions, show main roads from zoom `1.1`, route waypoints from `2.5`, and detailed roads/locations from `4.1`. Do not call routing workers from a zoom/move handler and do not modify `routePlan` or `journey`.

- [ ] **Step 7: Clean up every owned resource**

In the effect cleanup: disconnect `ResizeObserver`; unsubscribe media-query changes; call `cameraCleanup()`; unregister `error`, `moveend`, `zoomend`, `dblclick`, all layer click/hover handlers, and `load`; stop and remove the map; clear refs. Preserve current behavior that closing the drawer destroys MapLibre.

- [ ] **Step 8: Run focused integration and build checks**

Run: `npm run test:map-semantic-zoom && npm run test:map-semantic-projection && npm run test:map-semantic-layers && npm run test:map-integration && npm run build:code`

Expected: PASS. Zoom changes do not import or call the Zustand store, map mode remains prop-controlled, and active routes keep the same route ID and coordinates.

- [ ] **Step 9: Commit MapCanvas integration**

```bash
git add src/features/map/MapCanvas.tsx src/features/map/mapLayers.ts \
  scripts/test-map-semantic-layers.mjs scripts/test-map-integration.mjs
git commit -m "feat: 接入地图语义缩放交互"
```

### Task 9: Project county-minimum Chinese location context to the LLM without internal barony keys

**Files:**
- Create: `src/features/map/narrativeLocationContext.ts`
- Modify: `src/features/world/worldTurnContext.ts`
- Modify: `src/services/promptBuilder.ts`
- Create: `scripts/test-map-narrative-context.mjs`
- Modify: `scripts/test-world-turn-context.mjs`
- Modify: `scripts/test-character-prompt.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `MapLocationSearchEntry[]`, `SemanticMembership[]`, `SemanticTitle[]`, authoritative `WorldLocationRef`, current journey labels, and the existing formatted world-turn context.
- Produces: `NarrativeLocationContext`; `resolveNarrativeLocationContext(input) -> NarrativeLocationContext`; `formatNarrativeLocationContext(context) -> string`; player/character prompt locations expressed as verified Chinese place, county, duchy, and realm names; and an LLM constitution that reserves location mutation for the map travel/turn pipeline.

- [ ] **Step 1: Add failing pure projection and prompt-leakage tests**

Create a focused test with exact visible hierarchy and internal-key rejection:

```javascript
const title = (titleId, rank, name) => ({
  featureId: { realm: 1, duchy: 2, county: 3 }[rank], titleId, rank, name,
  mapX: 10, mapY: 20, importance: 80, regionId: 'the_north',
})

test('叙事地点只输出具体地点、伯爵领、公国和战略区域中文名', () => {
  const context = resolveNarrativeLocationContext({
    location: { locationId: 'b_winterfell', sceneLocation: '神木林' },
    locations: [{ id: 'b_winterfell', name: '临冬城', type: 'castle', importance: 100, mapX: 10, mapY: 20, regionId: 'the_north' }],
    memberships: [{
      locationId: 'b_winterfell', baronyId: 'b_winterfell',
      countyId: 'c_winterfell', duchyId: 'd_winterfell', realmId: 'the_north',
    }],
    titles: [
      title('c_winterfell', 'county', '临冬城伯爵领'),
      title('d_winterfell', 'duchy', '临冬城公国'),
      title('the_north', 'realm', '北境'),
    ],
  })
  assert.equal(
    formatNarrativeLocationContext(context),
    '临冬城 · 神木林 · 临冬城伯爵领 · 临冬城公国 · 北境',
  )
  assert.doesNotMatch(JSON.stringify(context), /b_winterfell|baronyId|男爵/)
})

test('语义资料缺失时只保留已验证中文地点名', () => {
  const context = resolveNarrativeLocationContext({
    location: { locationId: 'b_winterfell' },
    locations: [{ id: 'b_winterfell', name: '临冬城', type: 'castle', importance: 100, mapX: 10, mapY: 20, regionId: 'the_north' }],
    memberships: [], titles: [],
  })
  assert.equal(formatNarrativeLocationContext(context), '临冬城')
})
```

In `test-character-prompt.mjs`, build messages from a state whose current location, active route endpoints, and prior accepted movement command all contain `b_` IDs. Assert the combined message content does not match `/\bb_[a-z0-9_]+\b|baronyId|男爵领/`, does contain the Chinese hierarchy supplied by world context, and does not advertise `CHANGE_LOCATION` or `MOVE_CHARACTER` as model commands.

- [ ] **Step 2: Run the new and existing context tests and verify leakage is detected**

Run: `node --experimental-strip-types scripts/test-map-narrative-context.mjs && npm run test:world-turn-context && npm run test:character-prompt`

Expected: FAIL because `narrativeLocationContext.ts` is absent and `buildStateSlice()` still emits `当前地图地点 ID: b_...`.

- [ ] **Step 3: Implement a non-leaking narrative location projection**

Define output without any ID fields:

```typescript
export interface NarrativeLocationContext {
  placeName: string
  sceneName?: string
  countyName?: string
  duchyName?: string
  realmName?: string
}
```

Index locations by ID for lookup only, index titles by `${rank}:${titleId}`, and use membership to resolve county, duchy, and realm. Output only trimmed names that passed runtime schemas. Never copy `locationId`, `baronyId`, title IDs, English names, or unresolved raw values into the result. `formatNarrativeLocationContext()` joins present fields with ` · ` in the exact order place, scene, county, duchy, realm and runs the existing Emoji sanitizer.

- [ ] **Step 4: Resolve player and character prompt locations in the unified world context**

Expand `BuildWorldTurnContextInput.mapLocationRepository` to expose:

```typescript
{
  loadSearchIndex(): Promise<MapLocationSearchEntry[]>
  loadSemanticTitles(): Promise<SemanticTitle[]>
  loadSemanticMembership(): Promise<SemanticMembership[]>
}
```

Load the location index in the existing `Promise.all`; load semantic titles and membership with individual `.catch(() => [])` fallbacks so a semantic-index failure cannot expose a raw ID or abort story resolution. Add `narrativeLocation: NarrativeLocationContext` to `WorldTurnContext`. Set each `CharacterPromptCandidate.locationName` to the verified location `name`, never `character.locationId`. Add this exact section to `formatWorldTurnContext()`:

```text
### 【当前权威地点】
- 位置：临冬城 · 神木林 · 临冬城伯爵领 · 临冬城公国 · 北境
- 地图位置与旅程由程序结算；模型不得输出 CHANGE_LOCATION 或 MOVE_CHARACTER。
```

If semantic index loading fails, let the existing world-context error isolation use the verified location name fallback; do not serialize the failed ID.

- [ ] **Step 5: Remove all internal location keys from model messages**

In `buildStateSlice()`, delete both the `当前地图地点 ID` and raw `当前地点` lines; the verified `WorldTurnContext.narrativeLocation` becomes the only model-facing current-location source. Format journey endpoints through `activeJourney.locationLabels`; if a verified label is absent, use `已确认起点` or `已确认终点` instead of route IDs. Remove the `CHANGE_LOCATION` example and location-ID instruction from `GOT_CONSTITUTION_PROMPT`, replacing them with:

```text
// 地图位置、人物移动和旅程进度只由地图旅行系统与统一回合结算。
// 禁止输出 CHANGE_LOCATION、MOVE_CHARACTER 或任何内部地点键。
```

When replaying the last four assistant turns into the next prompt, filter `CHANGE_LOCATION` and `MOVE_CHARACTER` out of the serialized historical `stateCommands`. Keep the authoritative commands in saved state; only the model-message copy is filtered. Do not change the state reducer or route engine’s ability to consume internal location IDs from trusted program code.

- [ ] **Step 6: Register and run all narrative-location tests**

Add:

```json
"test:map-narrative-context": "node --experimental-strip-types scripts/test-map-narrative-context.mjs"
```

Run: `npm run test:map-narrative-context && npm run test:world-turn-context && npm run test:character-prompt && npm run test:location-authority && npm run test:map-travel && npm run build:code`

Expected: PASS. Model messages contain the verified Chinese county-minimum hierarchy, contain no `b_` key or barony concept, and program-owned travel/location authority tests remain unchanged.

- [ ] **Step 7: Commit the LLM location boundary**

```bash
git add src/features/map/narrativeLocationContext.ts src/features/world/worldTurnContext.ts \
  src/services/promptBuilder.ts scripts/test-map-narrative-context.mjs \
  scripts/test-world-turn-context.mjs scripts/test-character-prompt.mjs package.json
git commit -m "feat: 隔离模型内部地图地点键"
```

### Task 10: Harden failure isolation, performance boundaries, accessibility, and generated-data audit

**Files:**
- Modify: `src/features/map/MapErrorBoundary.tsx`
- Modify: `src/features/map/MapDrawer.tsx`
- Modify: `scripts/audit-agot-map.mjs`
- Modify: `scripts/check-map-runtime-boundaries.mjs`
- Modify: `scripts/check-map-drawer.mjs`
- Modify: `scripts/test-map-semantic-layers.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: schema-v2 generated files and the map-local retry callback already owned by the drawer/error boundary.
- Produces: an explicit map-only “重新载入地图” recovery path; semantic data/tile hash audit; static checks for no remote fallback, no per-frame dynamic rebuild, no Emoji, and no real import in automated verification; and semantic tests included in `verify:map`.

- [ ] **Step 1: Add failing boundary and audit assertions**

Extend checks with:

```javascript
test('地图语义错误只显示地图重载入口', () => {
  const drawer = readFileSync('src/features/map/MapDrawer.tsx', 'utf8')
  const boundary = readFileSync('src/features/map/MapErrorBoundary.tsx', 'utf8')
  assert.match(drawer + boundary, /重新载入地图/)
  assert.doesNotMatch(drawer + boundary, /重新载入页面/)
})

test('运行时不在连续 zoom 事件重建政治、人物或资产 GeoJSON', () => {
  assert.doesNotMatch(runtimeSource, /map\.on\(['"]zoom['"][\s\S]{0,300}(?:setData|syncDynamicMapSubjects)/)
})

test('语义地图保持二维且没有远程字体或地图回退', () => {
  assert.doesNotMatch(runtimeSource, /setTerrain|pitch:\s*[1-9]|glyphs:\s*['"]https?:|fallback.*https?:/i)
})
```

In the data audit, assert schema version 2; exact semantic paths; semantic title/membership counts; unique feature IDs and rank-title pairs; all membership ancestors exist; Chinese visible names contain at least one CJK character; semantic PBF count equals the manifest; every PBF decodes; and the calculated semantic hash equals `manifest.semanticHash`.

- [ ] **Step 2: Run boundary checks and confirm schema-v1 audit or missing retry copy fails**

Run: `npm run check:map-runtime-boundaries && npm run check:map-drawer && npm run check:map-data`

Expected: FAIL until schema-v2 generated data exists and the semantic recovery checks are implemented.

- [ ] **Step 3: Make retry explicitly reset only the map subtree**

Use an error-boundary key or existing local retry counter to unmount/remount only `MapCanvas`. The button label must be `重新载入地图`; retry clears map repository caches for manifest, semantic titles, and semantic membership, then remounts the map drawer content. It must not reload `window`, reset game state, close character dossier state, submit a turn, or alter story messages.

When only the dynamic political subtitle or subject aggregation fails, use the layer-local empty-source behavior from Task 8 instead of throwing the whole map boundary.

- [ ] **Step 4: Complete semantic data and runtime boundary audits**

Import `@mapbox/vector-tile`/existing vector decoding support already present in dependencies, or invoke the same installed decoder used by importer tests, to validate every semantic tile. Recalculate `semanticHash` in the exact Task 2 order: semantic index relative path plus null byte plus file bytes, followed by each sorted semantic tile relative path plus null byte plus bytes. Reject missing ranks, empty realm rank, duplicate IDs, English-only visible labels, invalid paths, and count/hash mismatch.

Expand runtime scanning to include the new semantic modules. Keep these explicit package rules:

```javascript
assert.doesNotMatch(packageJson.scripts.verify ?? '', /import:agot-map/)
assert.doesNotMatch(packageJson.scripts['verify:quick'] ?? '', /import:agot-map/)
assert.match(packageJson.scripts['verify:map'], /test:map-semantic-zoom/)
assert.match(packageJson.scripts['verify:map'], /test:map-semantic-projection/)
assert.match(packageJson.scripts['verify:map'], /test:map-semantic-layers/)
assert.match(packageJson.scripts['verify:map'], /test:map-narrative-context/)
```

- [ ] **Step 5: Add semantic tests to `verify:map` without adding real import**

Place the four semantic/narrative test scripts after `test:map-runtime` and before UI checks. The final map verification chain must still finish with `check:map-data`; it must contain no `import:agot-map` token.

- [ ] **Step 6: Run all checks that do not require regenerated real data**

Run: `npm run test:agot-map-import && npm run test:map-schema && npm run test:map-runtime && npm run test:map-semantic-zoom && npm run test:map-semantic-projection && npm run test:map-semantic-layers && npm run test:map-narrative-context && npm run test:map-integration && npm run check:map-runtime-boundaries && npm run check:map-drawer && npm run build:code`

Expected: PASS. `npm run check:map-data` is deferred to Task 11 because the checked-in public data is still schema version 1 at this point.

- [ ] **Step 7: Commit isolation and audit rules**

```bash
git add src/features/map/MapErrorBoundary.tsx src/features/map/MapDrawer.tsx \
  scripts/audit-agot-map.mjs scripts/check-map-runtime-boundaries.mjs scripts/check-map-drawer.mjs \
  scripts/test-map-semantic-layers.mjs package.json
git commit -m "test: 加固地图语义缩放边界"
```

### Task 11: Regenerate the checked-in AGOT semantic dataset and document the offline contract

**Files:**
- Modify: `public/data/agot-map/manifest.json`
- Create: `public/data/agot-map/semantic/titles.json`
- Create: `public/data/agot-map/semantic/membership.json`
- Modify: `public/data/agot-map/reports/audit.json`
- Create: `public/data/agot-map/reports/semantic.json`
- Create: `public/assets/agot-map/semantic/{z}/{x}/{y}.pbf`
- Modify: other generated files under `public/data/agot-map/` and `public/assets/agot-map/` only when their deterministic importer output changes
- Modify: `README.md`

**Interfaces:**
- Consumes: explicit development source `/mnt/c/agot/2962333032` and the completed importer.
- Produces: committed schema-v2 offline data used directly by the game at runtime and documented regeneration/extension rules.

- [ ] **Step 1: Run the explicit real-data import once**

Run: `npm run import:agot-map`

Expected: exit code `0` and JSON output containing `"status":"ok"`, positive three-rank semantic counts, and a 64-character dataset hash. This command is manual development work and remains outside every verification script.

- [ ] **Step 2: Inspect the semantic report before accepting generated files**

Run:

```bash
node - <<'NODE'
const fs = require('node:fs')
const manifest = JSON.parse(fs.readFileSync('public/data/agot-map/manifest.json', 'utf8'))
const report = JSON.parse(fs.readFileSync('public/data/agot-map/reports/semantic.json', 'utf8'))
console.log(JSON.stringify({
  schemaVersion: manifest.schemaVersion,
  semanticHash: manifest.semanticHash,
  ranks: {
    realm: manifest.counts.semanticRealms,
    duchy: manifest.counts.semanticDuchies,
    county: manifest.counts.semanticCounties,
  },
  labels: manifest.counts.semanticLabels,
  missingLocalizations: manifest.counts.missingSemanticLocalizations,
  sampleMissing: report.missingLocalizations.slice(0, 20),
}, null, 2))
NODE
```

Expected: `schemaVersion` is `2`; every rank count is greater than zero; `semanticHash` has 64 hexadecimal characters; labels are greater than zero; missing localization entries, if present, are stable IDs and not rendered English labels.

- [ ] **Step 3: Run generated-data audit and focused map verification**

Run: `npm run check:map-data && npm run verify:map && npm run build:code`

Expected: PASS. The audit decodes all semantic tiles, verifies both hashes and all membership ancestors, and finds no remote path.

- [ ] **Step 4: Document regeneration, runtime isolation, and future 3D boundary**

Add a README section stating:

```markdown
### CK3 式语义地图

运行时只读取 `public/data/agot-map` 与 `public/assets/agot-map` 中已提交的离线资料。
开发者需要更新地图资料时，才显式执行 `npm run import:agot-map`；自动验证不会读取
`/mnt/c/agot/2962333032`、Steam Workshop 或网络地图服务。

可见语义层固定为战略区域、公国和伯爵领；`baronyId` 只作为内部地点兼容键。相机与语义控制器不持有政治、人物、
物品、旅行或时间线权威状态。后续三维地形只能替换近景地形渲染层，不得改写
`semanticZoomState()`、语义 membership、政治投影或旅行队列接口。LLM 地点上下文只使用
具体地点、伯爵领、公国和战略区域中文名，不得包含内部 `baronyId` 或 `b_` 地点键。
```

Also list the three generated semantic paths and manifest schema version 2.

- [ ] **Step 5: Review generated diff boundaries before committing**

Run:

```bash
git status --short
git diff --stat
git diff -- public/data/agot-map/manifest.json public/data/agot-map/reports/semantic.json README.md
git diff --check
```

Expected: no portrait, character dossier, item, story, save, or unrelated UI file appears; `git diff --check` prints nothing; `node_modules` remains untracked and unstaged.

- [ ] **Step 6: Commit generated semantic data and documentation**

```bash
git add README.md public/data/agot-map public/assets/agot-map/semantic
git commit -m "data: 生成 AGOT 地图语义层"
```

### Task 12: Perform final automated and visual acceptance

**Files:**
- Modify: only files required to fix a failing acceptance check within the ownership boundaries above
- Test: all map scripts and full repository verification

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: verified implementation evidence for the branch; no new runtime API.

- [ ] **Step 1: Run focused semantic and map suites from a clean Git index**

Run:

```bash
npm run test:agot-map-import
npm run test:map-schema
npm run test:map-runtime
npm run test:map-semantic-zoom
npm run test:map-semantic-projection
npm run test:map-semantic-layers
npm run test:map-narrative-context
npm run test:world-turn-context
npm run test:character-prompt
npm run test:map-political-projection
npm run test:map-integration
npm run check:map-runtime-boundaries
npm run check:map-data
npm run verify:map
npm run build:code
git diff --check
```

Expected: every command exits `0`; no test reports a network source, schema-v1 acceptance, per-frame GeoJSON rebuild, Emoji, map-mode mutation, or internal barony key in an LLM message.

- [ ] **Step 2: Run the full repository verification once**

Run: `npm run verify`

Expected: exit code `0`. Do not rerun it unless a subsequent fix changes files covered by full verification.

- [ ] **Step 3: Start the existing Vite test server and inspect desktop behavior**

Use the existing `http://localhost:5199/` server if it is still healthy; otherwise run `npm run dev -- --host 0.0.0.0 --port 5199`. At a desktop viewport, verify in each of the five modes:

- Zoom `0`: strategic-realm outline/name is dominant; character and asset points are absent.
- Zoom `1.25`: realm and duchy labels/borders visibly cross-fade without a hard jump.
- Zoom `2.65`: duchy and county layers cross-fade; character/asset modes show stable aggregate counts.
- Zoom `4.25`: county aggregates fade while individual characters/assets appear.
- Zoom `5`: county boundaries remain stable while roads, locations, individual subjects, and travel position are legible; no barony boundary or label exists.
- Political mode displays a Chinese territory main label and public house subtitle without exposing hidden holders.
- The LLM context shows the verified Chinese place, county, duchy, and realm chain and contains no internal `b_` key or barony concept.
- Wheel zoom stays pointer-anchored, trackpad/pinch remains continuous, rotation stays disabled, and double-click advances one semantic observation level.
- Switching zoom never changes the selected map mode.
- Active route geometry and journey progress remain unchanged through every zoom level.

Capture one far, middle, and close screenshot for review outside the repository; do not commit transient screenshots unless the user asks.

- [ ] **Step 4: Inspect mobile and reduced-motion behavior**

At a mobile viewport, confirm two-finger zoom works, rotation and pitch remain disabled, location selection still works, and map details remain inside the existing drawer. Emulate `prefers-reduced-motion: reduce`; double-click/search positioning must be immediate, while semantic layer opacity remains readable and no long fly animation runs.

- [ ] **Step 5: Verify map-only fault isolation**

Temporarily block one semantic JSON request in browser developer tools. Confirm the map drawer shows `重新载入地图`, while story text, character dossier, turn submission, timeline, and save state remain usable. Restore the request and use the button; confirm the map subtree reloads without a page refresh. Then block only the political subtitle source update path and confirm terrain/travel remain usable with subtitles hidden.

- [ ] **Step 6: Record final repository state and commit any acceptance-only correction**

Run:

```bash
git status --short --branch
git log --oneline -12
git diff --check
```

Expected: branch `codex/ck3-semantic-zoom`; no staged `node_modules`; no unrelated main-workspace portrait changes. If visual acceptance required a correction, rerun the affected focused test plus `npm run build:code`, stage only owned files, and commit with a specific Chinese commit message. If no correction was needed, create no empty commit.
