# AGOT Terrain Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bake CK3/AGOT ground materials into offline z0–z5 WebP tiles, hard-switch between the existing far map and material terrain at CK3-style zoom thresholds, and make desktop wheel zoom animate zoom and pitch together.

**Architecture:** Extend the Python map importer with a deterministic material catalog, source resolver, four-channel compositor, and atomic tile publisher. Extend manifest schema v3 and MapLibre style with separate far/near raster sources, then add a small surface controller for hysteretic 0/1 switching and a wheel camera controller that owns desktop wheel animations. DEM terrain, political projection, semantic zoom, routing, and LLM boundaries remain independent.

**Tech Stack:** Python 3.10+, Pillow, NumPy, existing Paradox parser, Node test runner, TypeScript, React, Zustand, MapLibre GL, Zod, WebP.

**Spec:** `docs/superpowers/specs/2026-08-19-agot-terrain-materials-design.md`

## Global Constraints

- Development-time sources are local CK3 and AGOT files only; browser runtime may read only `/assets/agot-map/**` and `/data/agot-map/**`.
- AGOT material files override CK3 base files; CK3 supplies only referenced files missing from AGOT.
- Generate material terrain at zoom levels `0–5`, with `512 × 512` WebP tiles.
- Far and near raster opacity values are only `0` or `1`; do not implement cross-fade interpolation.
- Enter near mode at `zoom >= 3.25`; leave near mode at `zoom < 3.05`; preserve the previous state inside the hysteresis band.
- First version includes ground materials only—no 3D trees, vegetation, buildings, water renderer, seasons, or runtime PBR.
- Runtime failures must preserve the far flat map and must not break narrative, dossiers, search, or travel.
- Do not read Workshop, Steam, CK3, AGOT, or network resources from runtime code.
- Do not add Emoji.
- Do not add or commit the untracked `node_modules` worktree link.

---

### Task 1: Preserve the verified terrain-scale baseline

**Files:**
- Modify: `src/features/map/terrainProfile.ts`
- Modify: `scripts/test-map-terrain-profile.mjs`
- Modify: `scripts/test-map-terrain-controller.mjs`

**Interfaces:**
- Consumes: existing `terrainCameraProfile(input: TerrainProfileInput): TerrainCameraProfile`.
- Produces: committed `TERRAIN_VISUAL_SCALE = 32` baseline used by material-terrain rendering.

- [ ] **Step 1: Confirm only the intended baseline changes are pending**

Run:

```bash
git diff -- src/features/map/terrainProfile.ts \
  scripts/test-map-terrain-profile.mjs \
  scripts/test-map-terrain-controller.mjs
git status --short
```

Expected: the three terrain-scale files are modified; `node_modules` remains untracked and is not staged.

- [ ] **Step 2: Re-run the focused tests**

Run:

```bash
npm run test:map-terrain-profile
npm run test:map-terrain-controller
```

Expected: both commands pass.

- [ ] **Step 3: Commit the baseline separately**

```bash
git add src/features/map/terrainProfile.ts \
  scripts/test-map-terrain-profile.mjs \
  scripts/test-map-terrain-controller.mjs
git commit -m "fix: 提升近景地形可见度"
```

Expected: the working tree contains only the untracked `node_modules` link.

---

### Task 2: Validate material-map sources and parse the ordered catalog

**Files:**
- Create: `scripts/agot_map_import/material_catalog.py`
- Modify: `scripts/agot_map_import/source.py`
- Modify: `scripts/test_agot_map_import.py`

**Interfaces:**
- Consumes: `parse_document(text: str)` from `scripts/agot_character_import/paradox.py` and `MapImportError`.
- Produces:

```python
@dataclass(frozen=True, slots=True)
class TerrainMaterial:
    index: int
    id: str
    diffuse: str
    tile_factor: float

@dataclass(frozen=True, slots=True)
class TerrainMaterialInputs:
    index_map: Path
    intensity_map: Path
    settings: Path

def parse_material_catalog(path: Path, default_tile_factor: float) -> tuple[TerrainMaterial, ...]: ...
```

- [ ] **Step 1: Add failing source-validation and catalog tests**

Add tests that build a small fixture with `detail_index.tga`, `detail_intensity.tga`, and this catalog:

```text
{
  { id = "plains" diffuse = "plains_diffuse.dds" tile_factor = 16 }
  { id = "snow" diffuse = "snow_diffuse.dds" }
}
```

Assertions:

```python
materials = parse_material_catalog(settings, default_tile_factor=8)
self.assertEqual([(m.index, m.id) for m in materials], [(0, "plains"), (1, "snow")])
self.assertEqual([m.tile_factor for m in materials], [16.0, 8.0])
```

Also assert duplicate IDs, missing Diffuse, non-positive tile factors, wrong map dimensions, and missing detail maps raise `MapImportError` with Chinese messages.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
python3 -m unittest \
  scripts.test_agot_map_import.MapSourceTests \
  scripts.test_agot_map_import.MaterialCatalogTests -v
```

Expected: FAIL because `TerrainMaterialInputs` and `parse_material_catalog` do not exist.

- [ ] **Step 3: Implement catalog parsing and source validation**

Extend `MapSource` with:

```python
terrain_materials: TerrainMaterialInputs
```

Resolve exactly:

```python
terrain_root = root / "gfx/map/terrain"
TerrainMaterialInputs(
    index_map=terrain_root / "detail_index.tga",
    intensity_map=terrain_root / "detail_intensity.tga",
    settings=terrain_root / "materials.settings",
)
```

Validate index and intensity maps as RGBA and at `map_size`. Parse only live top-level material blocks; comments are already removed by the tokenizer. Assign zero-based indices in declaration order and reject ambiguous records.

- [ ] **Step 4: Run focused and full importer tests**

```bash
python3 -m unittest \
  scripts.test_agot_map_import.MapSourceTests \
  scripts.test_agot_map_import.MaterialCatalogTests -v
npm run test:agot-map-import
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/agot_map_import/material_catalog.py \
  scripts/agot_map_import/source.py scripts/test_agot_map_import.py
git commit -m "feat: 解析 AGOT 地形材质目录"
```

---

### Task 3: Resolve AGOT-over-CK3 DDS sources with bounded caching

**Files:**
- Create: `scripts/agot_map_import/material_sources.py`
- Modify: `scripts/test_agot_map_import.py`

**Interfaces:**
- Consumes: `TerrainMaterial` from Task 2.
- Produces:

```python
@dataclass(frozen=True, slots=True)
class MaterialSourceRoots:
    agot: Path
    ck3: Path

def resolve_diffuse(material: TerrainMaterial, roots: MaterialSourceRoots) -> Path: ...

class MaterialTextureCache:
    def __init__(self, roots: MaterialSourceRoots, max_bytes: int = 268_435_456): ...
    def get(self, material: TerrainMaterial) -> Image.Image: ...
    def close(self) -> None: ...
```

- [ ] **Step 1: Write failing precedence, decode, and eviction tests**

Use tiny Pillow-written DDS fixtures. Verify:

```python
self.assertEqual(resolve_diffuse(material, roots), agot / "gfx/map/terrain/shared.dds")
(agot / "gfx/map/terrain/shared.dds").unlink()
self.assertEqual(resolve_diffuse(material, roots), ck3 / "gfx/map/terrain/shared.dds")
```

Verify `MaterialTextureCache.get()` returns an RGB image, rejects unreadable DDS, and evicts least-recently-used images once decoded bytes exceed `max_bytes`.

- [ ] **Step 2: Run RED**

```bash
python3 -m unittest scripts.test_agot_map_import.MaterialSourceTests -v
```

Expected: FAIL because `material_sources.py` is missing.

- [ ] **Step 3: Implement deterministic resolution and LRU cleanup**

Search only these two paths, in order:

```python
roots.agot / "gfx/map/terrain" / material.diffuse
roots.ck3 / "gfx/map/terrain" / material.diffuse
```

Call `Path.resolve()` and verify the result remains inside the selected terrain root before opening it. Copy decoded pixels into RGB mode so the DDS file handle closes immediately. `close()` must close every cached Pillow image.

- [ ] **Step 4: Run tests**

```bash
python3 -m unittest scripts.test_agot_map_import.MaterialSourceTests -v
npm run test:agot-map-import
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/agot_map_import/material_sources.py scripts/test_agot_map_import.py
git commit -m "feat: 解析 CK3 地形材质来源"
```

---

### Task 4: Implement four-channel linear-color material composition

**Files:**
- Create: `scripts/agot_map_import/material_compositor.py`
- Modify: `scripts/test_agot_map_import.py`

**Interfaces:**
- Consumes: ordered `TerrainMaterial` records and `MaterialTextureCache`.
- Produces:

```python
def normalize_weights(weights: np.ndarray) -> np.ndarray: ...
def srgb_to_linear(values: np.ndarray) -> np.ndarray: ...
def linear_to_srgb(values: np.ndarray) -> np.ndarray: ...
def render_material_tile(
    index_crop: Image.Image,
    intensity_crop: Image.Image,
    materials: tuple[TerrainMaterial, ...],
    textures: MaterialTextureCache,
    source_bounds: tuple[float, float, float, float],
    map_size: tuple[int, int],
    tile_size: int,
) -> Image.Image: ...
```

- [ ] **Step 1: Add failing numeric tests**

Create four 4×4 solid textures: red, green, blue, and white. Use RGBA index values `[0, 1, 2, 3]` and weights `[64, 64, 64, 63]`. Assert the output equals linear-light blending converted back to sRGB within one integer value.

Add cases for:

```python
self.assertEqual(normalize_weights(np.array([0, 0, 0, 0], dtype=np.uint8)).tolist(), [1, 0, 0, 0])
```

Also verify an index equal to `len(materials)` raises `MapImportError`, index maps resize with nearest-neighbor sampling, intensity maps resize smoothly, and global UV gives identical edge samples for two adjacent tile bounds.

- [ ] **Step 2: Run RED**

```bash
python3 -m unittest scripts.test_agot_map_import.MaterialCompositorTests -v
```

Expected: FAIL because `render_material_tile` does not exist.

- [ ] **Step 3: Implement the compositor**

For each output tile:

```python
indices = np.asarray(index_crop.resize((tile_size, tile_size), Image.Resampling.NEAREST), dtype=np.uint8)
weights = np.asarray(intensity_crop.resize((tile_size, tile_size), Image.Resampling.BILINEAR), dtype=np.float32)
weights = normalize_weights(weights)
```

Group sampling by unique material index instead of loading a texture per pixel. Compute wrapped texture coordinates from `source_bounds`, `map_size`, and each material's `tile_factor`; never restart UV at a tile edge. Accumulate weighted RGB in linear space and emit an RGB Pillow image.

- [ ] **Step 4: Run focused and importer tests**

```bash
python3 -m unittest scripts.test_agot_map_import.MaterialCompositorTests -v
npm run test:agot-map-import
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/agot_map_import/material_compositor.py scripts/test_agot_map_import.py
git commit -m "feat: 烘焙四通道地表材质"
```

---

### Task 5: Generate and atomically publish z0–z5 material tiles

**Files:**
- Create: `scripts/agot_map_import/material_tiles.py`
- Modify: `scripts/agot_map_import/cli.py`
- Modify: `scripts/test_agot_map_import.py`

**Interfaces:**
- Consumes: `render_material_tile`, `MapSource.terrain_materials`, `MaterialSourceRoots`.
- Produces:

```python
def build_material_terrain_tiles(
    inputs: TerrainMaterialInputs,
    materials: tuple[TerrainMaterial, ...],
    roots: MaterialSourceRoots,
    bounds: MapBoundsTuple,
    map_size: tuple[int, int],
    output: Path,
    zooms: Iterable[int] = range(6),
    tile_size: int = 512,
) -> TileReport: ...
```

CLI additions:

```text
--ck3-source PATH
--max-material-zoom 5
```

- [ ] **Step 1: Add failing tile and rollback tests**

Generate a two-material 16×16 fixture and call with zooms `(0, 1)`, tile size 8. Assert exactly five decodable WebP files and `TileReport("materialTerrain", 5, 0, 1, ...)`.

Pre-create `output/sentinel.webp`, force the second tile render to raise, and assert the sentinel remains after failure.

- [ ] **Step 2: Run RED**

```bash
python3 -m unittest scripts.test_agot_map_import.MaterialTileTests -v
```

Expected: FAIL because `build_material_terrain_tiles` is missing.

- [ ] **Step 3: Implement generation and CLI wiring**

Use existing `_validated_zooms`, `_tile_bounds`, `_staging_directory`, and `_atomic_publish`. Open the two TGA maps once, crop per tile, close them and the texture cache in `finally`.

In `build_map(args)`, call:

```python
material = build_material_terrain_tiles(
    source.terrain_materials,
    parse_material_catalog(source.terrain_materials.settings, default_tile_factor=64),
    MaterialSourceRoots(agot=source.root, ck3=args.ck3_source),
    bounds,
    source.map_size,
    asset_stage / "material-terrain",
    range(args.max_material_zoom + 1),
    args.tile_size,
)
```

`--skip-tiles` must set `materialTerrain` count to zero without reading CK3.

- [ ] **Step 4: Run tests**

```bash
python3 -m unittest scripts.test_agot_map_import.MaterialTileTests -v
npm run test:agot-map-import
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/agot_map_import/material_tiles.py \
  scripts/agot_map_import/cli.py scripts/test_agot_map_import.py
git commit -m "feat: 生成近景地形材质瓦片"
```

---

### Task 6: Upgrade the manifest and audits to schema version 3

**Files:**
- Modify: `scripts/agot_map_import/cli.py`
- Modify: `scripts/agot_map_import/writer.py`
- Modify: `scripts/audit-agot-map.mjs`
- Modify: `src/features/map/types.ts`
- Modify: `src/features/map/schemas.ts`
- Modify: `scripts/test-map-schema.mjs`
- Modify: `scripts/test-map-runtime.mjs`
- Modify: map test fixtures containing `schemaVersion: 2` or `terrainTiles`
- Modify: `package.json`

**Interfaces:**
- Consumes: material tile report from Task 5.
- Produces manifest v3 fields:

```ts
schemaVersion: 3
paths: { materialTerrain: string }
counts: { materialTerrainTiles: number }
```

- [ ] **Step 1: Write failing v3 contract tests**

Update schema fixture assertions to require:

```js
schemaVersion: 3,
paths: {
  materialTerrain: '/assets/agot-map/material-terrain/{z}/{x}/{y}.webp',
},
counts: { materialTerrainTiles: 1365 },
```

Add negative cases for a remote material path, missing count, and schema version 2. Update `audit-agot-map.mjs` expectations to compare actual `.webp` files under `material-terrain` with the manifest count.

- [ ] **Step 2: Run RED**

```bash
npm run test:map-schema
npm run test:map-runtime
```

Expected: FAIL on schema version and missing fields.

- [ ] **Step 3: Implement the contract**

Update Python writer output:

```python
"schemaVersion": 3,
"paths": {
    "materialTerrain": "/assets/agot-map/material-terrain/{z}/{x}/{y}.webp",
},
"counts": {
    "materialTerrainTiles": int(tile_counts.get("materialTerrain", 0)),
},
```

Extend `_source_hashes` with prefixed, relative keys for settings, index, intensity, and every actually referenced Diffuse DDS. Reject absolute paths as before. Update all TypeScript fixtures directly to v3; do not add a v2 compatibility branch.

Add a focused `test:map-material-runtime` script only if a new test file is created; append it to `verify:map` in the same change.

- [ ] **Step 4: Run contract and boundary tests**

```bash
npm run test:agot-map-import
npm run test:map-schema
npm run test:map-runtime
npm run check:map-runtime-boundaries
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/agot_map_import/cli.py scripts/agot_map_import/writer.py \
  scripts/audit-agot-map.mjs src/features/map/types.ts src/features/map/schemas.ts \
  scripts/test-map-*.mjs package.json
git commit -m "feat: 升级地形材质地图清单"
```

---

### Task 7: Import and audit the real AGOT material tiles

**Files:**
- Modify: `public/data/agot-map/manifest.json`
- Modify: `public/data/agot-map/reports/audit.json`
- Create: `public/assets/agot-map/material-terrain/**/*.webp`
- Potentially modify: existing generated map outputs if deterministic source hashes change

**Interfaces:**
- Consumes the completed importer and local sources:
  - AGOT: `/mnt/c/Program Files (x86)/Steam/steamapps/workshop/content/1158310/2962333032`
  - CK3: `/mnt/c/Program Files (x86)/Steam/steamapps/common/Crusader Kings III/game`
- Produces 1365 project-local material tiles and manifest v3.

- [ ] **Step 1: Run the real import without touching runtime source paths**

```bash
python3 -m scripts.agot_map_import.cli \
  --source '/mnt/c/Program Files (x86)/Steam/steamapps/workshop/content/1158310/2962333032' \
  --ck3-source '/mnt/c/Program Files (x86)/Steam/steamapps/common/Crusader Kings III/game' \
  --data-output public/data/agot-map \
  --asset-output public/assets/agot-map \
  --max-raster-zoom 4 \
  --max-material-zoom 5 \
  --max-vector-zoom 6 \
  --tile-size 512
```

Expected: JSON status `ok`, `materialTerrainTiles: 1365`.

- [ ] **Step 2: Audit generated files and size**

```bash
npm run check:map-data
find public/assets/agot-map/material-terrain -type f -name '*.webp' | wc -l
du -sh public/assets/agot-map/material-terrain
find public/assets/agot-map/material-terrain -type f -size +95M -print
```

Expected: audit passes, file count is 1365, and no individual file approaches GitHub's 100 MB limit.

- [ ] **Step 3: Inspect representative tiles**

Render or open tiles around the North, Vale, Reach, and Dorne. Verify snow, rock, grass/farmland, and dry terrain differ visibly and no tile-edge seams appear. Record the inspected z5 coordinates in the commit message body.

- [ ] **Step 4: Commit generated data**

```bash
git add public/data/agot-map public/assets/agot-map/material-terrain
git commit -m "data: 烘焙 AGOT 地形材质瓦片"
```

---

### Task 8: Add separate far and near MapLibre raster layers

**Files:**
- Modify: `src/features/map/mapStyle.ts`
- Modify: `src/features/map/mapLayers.ts`
- Modify: `scripts/test-map-semantic-layers.mjs`
- Create: `scripts/test-map-material-layers.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes manifest v3 `paths.terrain` and `paths.materialTerrain`.
- Produces constants:

```ts
export const FAR_MAP_SOURCE = 'agot-flatmap'
export const FAR_MAP_LAYER = 'agot-flatmap'
export const MATERIAL_TERRAIN_SOURCE = 'agot-material-terrain'
export const MATERIAL_TERRAIN_LAYER = 'agot-material-terrain'
```

- [ ] **Step 1: Add failing style-order and opacity tests**

Assert the style contains both raster sources and layers, material layer is above far layer but below hillshade/political overlays, and initial paint is exactly:

```ts
far: { 'raster-opacity': 1 }
near: { 'raster-opacity': 0 }
```

Assert neither opacity is an interpolate expression. Assert `applyMapMode()` adjusts saturation/brightness without changing these two opacity values.

- [ ] **Step 2: Run RED**

```bash
npm run test:map-material-layers
```

Expected: FAIL because the source/layer constants are missing.

- [ ] **Step 3: Implement dual layers and mode styling**

Rename the existing raster source/layer to `agot-flatmap`, add the material source with `maxzoom: 5`, and place both before `agot-hillshade`. Keep RGB material tiles fully opaque when selected. Put mode-specific saturation/brightness in `applyMapMode`; do not use mode to select far versus near.

- [ ] **Step 4: Run tests**

```bash
npm run test:map-material-layers
npm run test:map-semantic-layers
npm run test:map-runtime
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/map/mapStyle.ts src/features/map/mapLayers.ts \
  scripts/test-map-material-layers.mjs scripts/test-map-semantic-layers.mjs package.json
git commit -m "feat: 添加远近景双地表图层"
```

---

### Task 9: Hard-switch material terrain with hysteresis and fallback

**Files:**
- Create: `src/features/map/terrainSurfaceController.ts`
- Create: `scripts/test-map-terrain-surface-controller.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes MapLibre source/layer IDs from Task 8 and thresholds from `terrainProfile.ts`.
- Produces:

```ts
export interface TerrainSurfaceController {
  requestSync(zoom: number): void
  syncNow(zoom: number): void
  handleSourceData(sourceId: string): void
  disable(reason: string): void
  destroy(): void
  isAvailable(): boolean
  isNear(): boolean
}

export function createTerrainSurfaceController(
  map: TerrainSurfaceMapAdapter,
  callbacks: { onUnavailable(reason: string): void },
  scheduler?: FrameScheduler,
): TerrainSurfaceController
```

- [ ] **Step 1: Write failing state-machine tests**

Use a fake adapter with `isSourceLoaded`, `setPaintProperty`, and call recording. Verify:

```js
controller.syncNow(3.24) // far
controller.syncNow(3.25) // request near; still far while source not ready
sourceLoaded = true
controller.handleSourceData('agot-material-terrain') // near
controller.syncNow(3.15) // remains near
controller.syncNow(3.04) // far
```

Assert every write uses only `0` or `1`; the material layer becomes `1` before the far layer becomes `0`; failure restores far `1`, near `0`; callbacks fire once; destroy cancels pending frames.

- [ ] **Step 2: Run RED**

```bash
npm run test:map-terrain-surface-controller
```

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement the state machine**

Use existing `TERRAIN_ENTER_ZOOM` and `TERRAIN_EXIT_ZOOM`. Keep `nearRequested`, `nearVisible`, `available`, and one scheduled frame. Never write interpolated opacity. Ignore unrelated `sourcedata` events.

- [ ] **Step 4: Run tests**

```bash
npm run test:map-terrain-surface-controller
npm run test:map-terrain-controller
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/map/terrainSurfaceController.ts \
  scripts/test-map-terrain-surface-controller.mjs package.json
git commit -m "feat: 硬切换近景地形材质"
```

---

### Task 10: Integrate material switching and independent failure handling

**Files:**
- Modify: `src/features/map/MapCanvas.tsx`
- Modify: `src/features/map/MapDrawer.tsx`
- Modify: `scripts/test-map-terrain-integration.mjs`
- Modify: `scripts/test-map-integration.mjs`

**Interfaces:**
- Consumes `createTerrainSurfaceController()` from Task 9.
- Produces MapCanvas lifecycle wiring for `zoom`, `zoomend`, `sourcedata`, error routing, and cleanup.

- [ ] **Step 1: Extend failing integration assertions**

Assert MapCanvas:

```js
assert.match(canvas, /createTerrainSurfaceController/)
assert.match(canvas, /map\.on\('sourcedata'/)
assert.match(canvas, /map\.off\('sourcedata'/)
assert.match(canvas, /terrainSurfaceController\.destroy\(\)/)
```

Assert an error whose `sourceId === 'agot-material-terrain'` disables only material terrain, retains flatmap, and does not call DEM `disable()` or `setInitializationError(true)`.

- [ ] **Step 2: Run RED**

```bash
npm run test:map-terrain-integration
npm run test:map-integration
```

Expected: FAIL on missing surface lifecycle.

- [ ] **Step 3: Wire the controller**

Create it after map `load`, sync it from the existing continuous zoom handler, pass `sourcedata.sourceId`, and destroy it before `map.remove()`. Split error routing:

```ts
if (sourceId === MATERIAL_TERRAIN_SOURCE) surfaceController.disable('近景地形材质不可用')
else if (sourceId === 'agot-dem') terrainController.disable('DEM 地形不可用')
```

A material-only fallback may show one non-blocking warning, but the toolbar terrain capability remains enabled when DEM still works.

- [ ] **Step 4: Run integration tests**

```bash
npm run test:map-terrain-integration
npm run test:map-integration
npm run check:map-runtime-boundaries
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/map/MapCanvas.tsx src/features/map/MapDrawer.tsx \
  scripts/test-map-terrain-integration.mjs scripts/test-map-integration.mjs
git commit -m "feat: 接入近景地形材质生命周期"
```

---

### Task 11: Implement continuous desktop wheel zoom and pitch

**Files:**
- Create: `src/features/map/wheelCameraController.ts`
- Create: `scripts/test-map-wheel-camera-controller.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes `targetPitch(zoom: number): number` supplied by MapCanvas.
- Produces:

```ts
export interface WheelCameraController {
  update(input: { reducedMotion: boolean; targetPitch(zoom: number): number }): void
  destroy(): void
}

export function normalizeWheelDelta(deltaY: number, deltaMode: number, viewportHeight: number): number

export function createWheelCameraController(
  map: WheelCameraMapAdapter,
  input: { reducedMotion: boolean; targetPitch(zoom: number): number },
): WheelCameraController
```

- [ ] **Step 1: Add failing unit tests**

Verify pixel/line/page delta normalization, zoom clamping to `getMinZoom()`/`getMaxZoom()`, and one wheel event creates one camera call containing all of:

```js
{
  zoom: expectedZoom,
  pitch: targetPitch(expectedZoom),
  around: pointerLngLat,
  duration: 220,
  essential: true,
}
```

Verify repeated wheel input updates the accumulated target, `preventDefault()` is called, reduced motion uses duration 0 and `essential: false`, and `destroy()` removes the exact wheel listener.

- [ ] **Step 2: Run RED**

```bash
npm run test:map-wheel-camera-controller
```

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement the controller**

Disable only `map.scrollZoom`; leave drag and touch handlers unchanged. Attach a non-passive wheel listener to `map.getCanvas()`. Convert the pointer to map coordinates with `map.unproject([offsetX, offsetY])`. Use a single `easeTo({ zoom, pitch, around, ... })` so MapLibre interpolates both camera values together. Clamp accumulated targets and reset the accumulator from `map.getZoom()` after external camera changes.

- [ ] **Step 4: Run tests**

```bash
npm run test:map-wheel-camera-controller
npm run test:map-terrain-profile
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/map/wheelCameraController.ts \
  scripts/test-map-wheel-camera-controller.mjs package.json
git commit -m "feat: 同步滚轮缩放与地图倾角"
```

---

### Task 12: Integrate the wheel camera without regressing touch gestures

**Files:**
- Modify: `src/features/map/cameraProfile.ts`
- Modify: `src/features/map/MapCanvas.tsx`
- Modify: `scripts/test-map-terrain-integration.mjs`
- Modify: `scripts/test-map-integration.mjs`
- Modify: `scripts/test-map-terrain-controller.mjs`

**Interfaces:**
- Consumes `createWheelCameraController()` from Task 11.
- Produces unified desktop wheel behavior; touch/native navigation still receives zoom-end pitch calibration.

- [ ] **Step 1: Add failing integration tests**

Assert `configureCk3Camera()` no longer enables native `scrollZoom`, MapCanvas creates one wheel controller and destroys it, and continuous terrain sync does not write camera values. Keep a test proving `zoomend` still calls the existing recommended-pitch calibration for touch and navigation buttons.

- [ ] **Step 2: Run RED**

```bash
npm run test:map-terrain-integration
npm run test:map-integration
npm run test:map-terrain-controller
```

Expected: FAIL because native wheel zoom is still enabled and no wheel controller lifecycle exists.

- [ ] **Step 3: Integrate the controller**

Create the controller after MapLibre creation and update its target-pitch callback when mode, top-down lock, or reduced-motion changes. Keep search `flyTo` and semantic double-click `easeTo` carrying pitch. Keep native touch zoom/rotate enabled; at `zoomend`, if the final pitch differs from `targetTerrainPitch(map.getZoom())`, use the existing short automatic calibration.

Do not call `setPitch()` from the continuous `zoom` event.

- [ ] **Step 4: Run camera and map tests**

```bash
npm run test:map-wheel-camera-controller
npm run test:map-terrain-profile
npm run test:map-terrain-controller
npm run test:map-terrain-integration
npm run test:map-integration
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/map/cameraProfile.ts src/features/map/MapCanvas.tsx \
  scripts/test-map-terrain-integration.mjs scripts/test-map-integration.mjs \
  scripts/test-map-terrain-controller.mjs
git commit -m "feat: 接入 CK3 式连续地图镜头"
```

---

### Task 13: Full verification and visual acceptance

**Files:**
- Modify only if verification exposes a defect in files already listed above.

**Interfaces:**
- Consumes all previous tasks.
- Produces a verified, reviewable feature branch without merging into `/mnt/c/agot`.

- [ ] **Step 1: Run the complete automated suite**

```bash
npm run verify:map
npm run build:code
git diff --check
```

Expected: all commands exit 0. The existing Vite large-chunk warning is informational; no new build errors are allowed.

- [ ] **Step 2: Confirm runtime boundaries and generated data**

```bash
npm run check:map-runtime-boundaries
npm run check:map-data
grep -R -nE 'Steam|Workshop|2962333032|https?://' \
  src/features/map public/data/agot-map/manifest.json
```

Expected: runtime boundary checks pass; no absolute source path or remote URL appears. `sourceId: 2962333032` in the manifest is allowed.

- [ ] **Step 3: Perform visual acceptance at `http://localhost:5199/`**

Verify:

1. Far zoom displays only the existing flat map.
2. Crossing zoom 3.25 switches directly to material terrain without a blended frame.
3. Zoom 3.05–3.25 does not flicker when alternating wheel direction.
4. Pulling below 3.05 switches directly back to flat map.
5. North, Vale, Reach, and Dorne show visibly different ground materials.
6. Political tint remains readable over material terrain.
7. Character, travel, and asset markers remain more prominent than the ground.
8. Mouse-wheel zoom continuously changes pitch before the wheel stops.
9. Top-down lock, reset north, search fly-to, and touch zoom-end calibration still work.
10. Simulated material-tile failure falls back to flatmap without closing the map.

- [ ] **Step 4: Review repository state**

```bash
git status --short
git log --oneline --decorate -15
```

Expected: no modified tracked files remain; only the intentionally untracked `node_modules` link may appear. Do not merge into the dirty main workspace unless the user separately requests it.
