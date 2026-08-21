# AGOT 3D Landmark Model Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将十二处 AGOT 特殊建筑离线转换为受预算约束的 LOD GLB，并通过共享 MapLibre 画布与 WebGL 上下文的 Three.js 自定义层在近景安全显示。

**Architecture:** 开发期 Python 导入器只接受显式白名单，调用固定提交的 `io_pdx_mesh` CLI 获得中间 JSON，再完成材质、贴图、LOD、GLB、清单和审计发布。浏览器端使用独立 schema/repository、纯函数可见性选择、有并发和 LRU 约束的资源控制器，以及 MapLibre `CustomLayerInterface`；现有二维地点和伯爵领图层始终是唯一交互权威，任何模型故障均局部降级。

**Tech Stack:** Python 3 `unittest`、Pillow 12.3、NumPy 2.2、`ross-g/io_pdx_mesh` commit `2249e35f80a1cc04ba4c2b8e4c650f36b18085db`、Node.js、TypeScript 5.7、Zod 3.24、MapLibre GL JS 5.24、Three.js 0.185.1、meshoptimizer 1.2.0、React 18、Vite 6。

**Spec:** `/mnt/c/AGOT/docs/superpowers/specs/2026-08-21-agot-3d-landmark-model-import-design.md`

## Global Constraints

- 不提交、不推送；因此本计划故意不包含任何 `git commit` 步骤。
- 不调用浏览器；自动验证不得启动 Playwright、Chrome、Vite 预览或其他浏览器会话。
- 保留当前脏工作区中的五级头衔地图改动，不 reset、clean、checkout 或回滚无关文件。
- 运行时只能读取 `/data/agot-map/models/landmarks.json` 与 `/assets/agot-map/models/**`，不得读取 Workshop、Steam、CK3、远程模型 URL 或 `/mnt/c/AGOT/2962333032`。
- `/mnt/c/AGOT/2962333032` 仅为开发期输入；真实转换使用独立命令，不进入 `npm run verify`、`npm run verify:quick` 或 `npm run verify:map`。
- `io_pdx_mesh` 必须处于 commit `2249e35f80a1cc04ba4c2b8e4c650f36b18085db`，只作为外部 GPL-3.0 开发命令，不能复制实现或打入浏览器包。
- 只发布十二处白名单地标，不得把源目录中的全部 3471 个 `.mesh` 批量发布；绝境长城、普通城堡、树林、动物和环境物件不在本计划范围。
- 现有地图 `schemaVersion` 保持 4；模型清单使用独立 `schemaVersion: 1`。
- Three.js 必须复用 MapLibre 传入的 canvas、WebGL context、相机矩阵和渲染循环；禁止第二 canvas、独立 `requestAnimationFrame`、独立相机控制、raycast 和第二套地点交互状态。
- 模型只作静态视觉展示，不进入存档、搜索、路线、人物移动、资产投影、战争、持有人或日期状态。
- `zoom < 4.60` 不请求 GLB；`4.60 ≤ zoom < 5.35` 使用 LOD1；`zoom ≥ 5.35` 标准设备使用 LOD0、低能力设备继续使用 LOD1。
- 资源同步只由模型清单就绪、`moveend` 和 `zoomend` 触发；同时加载/解码最多 2 个，低能力设备最多保留 2 个可见模型，标准设备最多 6 个。
- 十二处全部 LOD 压缩总量不超过 120 MiB；单个 LOD0 不超过 20 MiB；单个 LOD1 不超过 6 MiB；LOD0 贴图最大 2048，LOD1 最大 1024；LOD1 三角形数为 LOD0 的 25%–40%。
- 首版不启用实时阴影；单模型或清单失败不得设置现有地图初始化错误，不得显示“地图资料未能载入”，也不得关闭 DEM terrain。

---

## File and Responsibility Map

### Offline importer

- `scripts/agot_model_import/__init__.py`：包入口，不执行转换副作用。
- `scripts/agot_model_import/models.py`：导入期 dataclass、常量和 `ModelImportError`。
- `scripts/agot_model_import/catalog.py`：白名单 schema、源身份和路径逃逸校验。
- `scripts/agot_model_import/asset_parser.py`：解析 `.asset` 的 pdxmesh、scale、meshsettings 和贴图引用。
- `scripts/agot_model_import/mesh_adapter.py`：校验外部工具 commit、调用 CLI、规范化中间网格。
- `scripts/agot_model_import/locators.py`：province locator、地图坐标、四元数、scale 和 DEM 高度采样。
- `scripts/agot_model_import/textures.py`：DDS→WebP、色彩空间、properties 通道重排和尺寸约束。
- `scripts/agot_model_import/meshopt.mjs`：使用 meshoptimizer 生成只重写索引的 LOD，保留全部顶点属性。
- `scripts/agot_model_import/gltf_writer.py`：确定性 GLB 2.0 编码、嵌入 WebP、结构复读校验。
- `scripts/agot_model_import/audit.py`：预算、哈希、路径、GLB、三角形、包围盒和十二地标审计。
- `scripts/agot_model_import/cli.py`：`audit-source`、`convert` 与 `audit` 子命令、同级 staging 和原子发布。
- `scripts/agot_model_import/landmark_models.json`：十二处地标唯一发布白名单及显式修正原因。
- `scripts/requirements-models.txt`：真实模型转换所需 Python 依赖；普通地图依赖文件不被扩大。
- `scripts/test_agot_model_import.py`：不含 AGOT 原始字节的小 fixture 测试。
- `scripts/fixtures/agot-models/**`：最小 `.asset`、locator、中间 JSON、DDS/PNG fixture 与预期 GLB 元数据。

### Runtime

- `src/features/map/landmarks/landmarkSchemas.ts`：模型 schema、类型和解析函数。
- `src/features/map/landmarks/landmarkRepository.ts`：独立清单请求、缓存和错误类型。
- `src/features/map/landmarks/landmarkVisibility.ts`：能力等级、LOD、视野缓冲和保留上限纯逻辑。
- `src/features/map/landmarks/landmarkTransform.ts`：地图像素、Mercator、Y-up、四元数和地形基座矩阵。
- `src/features/map/landmarks/landmarkResourceCache.ts`：并发 2、AbortController、LRU、字节预算和 Three 资源释放。
- `src/features/map/landmarks/landmarkCustomLayer.ts`：共享上下文 renderer、scene、camera、灯光和生命周期。
- `src/features/map/landmarks/landmarkRuntime.ts`：manifest、选择、加载、场景替换、合并警告和事件同步。
- `src/features/map/MapCanvas.tsx`：动态导入运行时、添加层、`moveend`/`zoomend` 同步和抽屉关闭销毁。

### Verification and generated output

- `scripts/test-map-landmark-schema.mjs`、`test-map-landmark-visibility.mjs`、`test-map-landmark-transform.mjs`、`test-map-landmark-cache.mjs`、`test-map-landmark-layer.mjs`、`test-map-landmark-integration.mjs`：无浏览器 Node 测试。
- `scripts/check-map-runtime-boundaries.mjs`：允许受约束 Three.js，共享上下文，继续禁止第二 canvas/RAF/raycast/远程源。
- `scripts/audit-agot-models.mjs`：对已生成的轻量清单与 GLB 执行本地审计。
- `public/data/agot-map/models/landmarks.json`、`reports/audit.json`：独立模型数据。
- `public/assets/agot-map/models/<id>/lod0.glb`、`lod1.glb`：十二处生成物。

---

### Task 1: Pin Tooling and Define the Twelve-Landmark Catalog

**Files:**
- Create: `scripts/requirements-models.txt`
- Create: `scripts/agot_model_import/__init__.py`
- Create: `scripts/agot_model_import/models.py`
- Create: `scripts/agot_model_import/catalog.py`
- Create: `scripts/agot_model_import/landmark_models.json`
- Create: `scripts/test_agot_model_import.py`
- Create: `scripts/fixtures/agot-models/catalog-{valid,path-escape,duplicate,unexplained-correction}.json`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `ModelImportError`, `Correction`, `LandmarkCatalogEntry`, `LandmarkCatalog`, `load_catalog(path: Path) -> LandmarkCatalog`, `validate_source_root(root: Path) -> None`.
- Catalog entry fields: `id`, `name`, `locationId`, `provinceId`, `asset`, `variant`, optional `corrections` with `positionOffset`, `rotationOffset`, `scaleMultiplier`, `reason`.
- Later tasks consume the catalog only; no directory scan may create publishable entries.

- [ ] **Step 1: Install exact JavaScript dependencies and isolate Python conversion dependencies**

Run:

```bash
npm install --save-exact three@0.185.1
npm install --save-dev --save-exact meshoptimizer@1.2.0
cat > scripts/requirements-models.txt <<'EOF'
-r requirements-map.txt
EOF
```

Expected: `three` is a runtime dependency, `meshoptimizer` is development-only, and neither command modifies existing map schema files.

- [ ] **Step 2: Write catalog rejection tests first**

Add tests that construct temporary catalog JSON and assert:

```python
class CatalogTests(unittest.TestCase):
    def test_accepts_only_exact_twelve_unique_entries(self):
        catalog = load_catalog(FIXTURES / "catalog-valid.json")
        self.assertEqual(len(catalog.landmarks), 12)
        self.assertEqual(catalog.landmarks[0].location_id, "b_winterfell")

    def test_rejects_path_escape_duplicate_location_and_unexplained_correction(self):
        for fixture, message in [
            ("catalog-path-escape.json", "相对路径"),
            ("catalog-duplicate.json", "重复"),
            ("catalog-unexplained-correction.json", "reason"),
        ]:
            with self.subTest(fixture=fixture):
                with self.assertRaisesRegex(ModelImportError, message):
                    load_catalog(FIXTURES / fixture)
```

- [ ] **Step 3: Run the focused test and confirm the missing-module failure**

Run: `python3 -m unittest scripts.test_agot_model_import.CatalogTests -v`

Expected: FAIL because `scripts.agot_model_import.catalog` does not exist.

- [ ] **Step 4: Implement immutable catalog models and validation**

Use frozen dataclasses and reject absolute paths, `..`, non-`gfx/models/buildings/special/` paths, duplicate ids/locationIds/provinceIds, non-unit correction quaternions, non-positive scale, corrections without a non-empty reason, and any count other than 12:

```python
@dataclass(frozen=True)
class LandmarkCatalogEntry:
    id: str
    name: str
    location_id: str
    province_id: int
    asset: PurePosixPath
    variant: str | None
    corrections: Correction | None

EXPECTED_SOURCE_ID = "2962333032"
CONVERTER_COMMIT = "2249e35f80a1cc04ba4c2b8e4c650f36b18085db"

def load_catalog(path: Path) -> LandmarkCatalog:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schemaVersion") != 1 or payload.get("sourceId") != EXPECTED_SOURCE_ID:
        raise ModelImportError("地标白名单 schema 或源身份无效")
    entries = tuple(_parse_entry(item) for item in payload.get("landmarks", ()))
    _validate_exact_whitelist(entries)
    return LandmarkCatalog(1, EXPECTED_SOURCE_ID, entries)
```

- [ ] **Step 5: Write the actual whitelist with exact identities**

Use these tuples and exact source assets:

```text
winterfell | b_winterfell | 77 | gfx/models/buildings/special/Winterfell/winterfell_new.asset
red-keep | b_the_red_keep | 4151 | gfx/models/buildings/special/Kings Landing/Red Keep/building_special_KL_RedKeep.asset
dragonstone | b_dragonstone | 4415 | gfx/models/buildings/special/Dragonstone/Dragonstone.asset
casterly-rock | b_casterly_rock | 2855 | gfx/models/buildings/special/Casterly Rock/casterlyrock.asset
highgarden | b_highgarden | 3237 | gfx/models/buildings/special/Highgarden/building_special_highgarden.asset
sunspear | b_sunspear | 4937 | gfx/models/buildings/special/Sunspear/building_special_sunspear.asset
storms-end | b_storms_end | 4439 | gfx/models/buildings/special/Storms End/building_special_stormsend_castle.asset
the-eyrie | b_the_eyrie | 2251 | gfx/models/buildings/special/The Eyrie/building_special_the_eyrie.asset
pyke | b_pyke | 2723 | gfx/models/buildings/special/Pyke/building_special_PykeUpdated.asset
oldtown | b_oldtown | 3494 | gfx/models/buildings/special/Oldtown/building_special_OT/building_special_oldtown.asset
riverrun | b_riverrun | 1658 | gfx/models/buildings/special/Riverrun/building_special_riverrun.asset
harrenhal | b_harrenhal | 1934 | gfx/models/buildings/special/Harrenhal/Harrenhal Redo/building_special_harrenhal_ruined.asset
```

Set 赫伦堡（Harrenhal）`variant` to `ruined`; omit correction objects until a real audit proves one is needed.

- [ ] **Step 6: Run catalog tests and dependency boundary check**

Run:

```bash
python3 -m unittest scripts.test_agot_model_import.CatalogTests -v
node -e "const p=require('./package.json'); if(p.dependencies.three!=='0.185.1'||p.devDependencies.meshoptimizer!=='1.2.0') process.exit(1)"
```

Expected: PASS; the catalog contains exactly the twelve confirmed province IDs.

---

### Task 2: Parse `.asset` and Normalize `io_pdx_mesh` JSON

**Files:**
- Create: `scripts/agot_model_import/asset_parser.py`
- Create: `scripts/agot_model_import/mesh_adapter.py`
- Create: `scripts/fixtures/agot-models/multi-material.asset`
- Create: `scripts/fixtures/agot-models/static-mesh.json`
- Modify: `scripts/test_agot_model_import.py`

**Interfaces:**
- Consumes: `ModelImportError`, `CONVERTER_COMMIT`, catalog asset paths.
- Produces: `TextureSet(diffuse, normal, properties)`, `MaterialBinding(name, mesh_index, textures, shader)`, `AssetDefinition(mesh_path, scale, materials)`, `MeshPrimitive(name, positions, normals, tangents, uv0, indices, material_name)`, `StaticMesh(primitives)`.
- Produces: `parse_asset(path: Path) -> AssetDefinition`, `verify_converter(root: Path) -> None`, `convert_mesh(converter_root: Path, mesh_path: Path, temp_json: Path) -> StaticMesh`, `normalize_pdx_json(payload: Mapping[str, object], materials: Sequence[MaterialBinding]) -> StaticMesh`.

- [ ] **Step 1: Add failing multi-material and malformed-mesh tests**

```python
def fixture_materials():
    return parse_asset(FIXTURES / "multi-material.asset").materials

class AssetAndMeshTests(unittest.TestCase):
    def test_asset_preserves_scale_material_order_and_three_texture_roles(self):
        asset = parse_asset(FIXTURES / "multi-material.asset")
        self.assertEqual(asset.scale, 0.5)
        self.assertEqual([m.name for m in asset.materials], ["wallsShape", "roofShape"])
        self.assertEqual(asset.materials[0].textures.properties.name, "walls_properties.dds")

    def test_normalizer_requires_all_static_vertex_attributes(self):
        payload = json.loads((FIXTURES / "static-mesh.json").read_text())
        mesh = normalize_pdx_json(payload, fixture_materials())
        self.assertEqual(mesh.primitives[0].indices, (0, 1, 2))
        for field in ("p", "n", "ta", "u0", "tri"):
            broken = copy.deepcopy(payload)
            del broken["object"]["wallsShape"]["mesh"][field]
            with self.assertRaises(ModelImportError):
                normalize_pdx_json(broken, fixture_materials())
```

Also reject skeleton/bones/skin/animation keys, non-finite floats, indices outside vertex count, missing UV, and a degenerate-triangle ratio above 5%.

- [ ] **Step 2: Run the focused tests and observe import failures**

Run: `python3 -m unittest scripts.test_agot_model_import.AssetAndMeshTests -v`

Expected: FAIL because parser and adapter modules do not exist.

- [ ] **Step 3: Implement a comment-aware Paradox token parser**

Tokenize quoted strings, identifiers, numbers, braces and `=` after removing `#` comments outside strings. Parse repeated `meshsettings` blocks in declaration order. Resolve texture paths against the `.asset` directory and reject paths escaping the source root. Map `texture_specular` to the semantic `properties` role without renaming source files.

```python
def parse_asset(path: Path) -> AssetDefinition:
    nodes = parse_pdx(tokenize(path.read_text(encoding="utf-8-sig")))
    mesh = require_single(nodes, "pdxmesh")
    materials = tuple(material_from_node(node, path.parent) for node in mesh.repeated("meshsettings"))
    return AssetDefinition(resolve_relative(path.parent, mesh.string("file")), mesh.number("scale", 1.0), materials)
```

- [ ] **Step 4: Implement the exact external converter command and commit gate**

`verify_converter` must run `git -C <root> rev-parse HEAD`; `convert_mesh` must execute from the converter parent so its package name is `io_pdx_mesh`:

```python
command = [
    sys.executable, "-m", "io_pdx_mesh", "convert-to",
    "--inpath", str(mesh_path),
    "--outpath", str(temp_json),
    "--format", "json",
]
env = {**os.environ, "PYTHONPATH": str(converter_root.parent)}
subprocess.run(command, check=True, env=env, capture_output=True, text=True)
```

Reject a converter directory not named `io_pdx_mesh`, a commit mismatch, nonzero exit, missing output, and output containing animation/skinning.

- [ ] **Step 5: Normalize PDX arrays without copying converter internals**

Read `payload["object"][shape]["mesh"]`; group flat arrays by widths `p=3`, `n=3`, `ta=4`, `u0=2`, `tri=3`; preserve declared shape/material association and triangle winding. Do not import from `io_pdx_mesh` inside project code—the only integration is the subprocess contract.

```python
def normalize_pdx_json(payload, materials):
    primitives = tuple(_primitive(name, body["mesh"], materials) for name, body in payload["object"].items())
    _validate_static_primitives(primitives)
    return StaticMesh(primitives)
```

- [ ] **Step 6: Run focused tests**

Run: `python3 -m unittest scripts.test_agot_model_import.AssetAndMeshTests -v`

Expected: PASS using fixture JSON only; it must not invoke the real converter.

---

### Task 3: Restore Locator Transform and DEM Base Elevation

**Files:**
- Create: `scripts/agot_model_import/locators.py`
- Create: `scripts/fixtures/agot-models/special_building_locators.txt`
- Create: `scripts/fixtures/agot-models/heightmap.png`
- Modify: `scripts/test_agot_model_import.py`

**Interfaces:**
- Consumes: catalog `province_id`, existing DEM constants `min_elevation=-500`, `max_elevation=8000`.
- Produces: `Locator(id, position, rotation, scale)`, `ResolvedTransform(map_x, map_y, elevation_meters, rotation, scale)`.
- Produces: `parse_locators(path: Path) -> dict[int, Locator]`, `sample_elevation(heightmap: Path, map_x: float, map_y: float) -> float`, `resolve_transform(entry, locator, map_height, heightmap) -> ResolvedTransform`.

- [ ] **Step 1: Write failing coordinate, uniqueness and height tests**

```python
def entry_for(province_id):
    return next(item for item in load_catalog(FIXTURES / "catalog-valid.json").landmarks if item.province_id == province_id)

def elevation_for_sample(value):
    return float(height_value_to_elevation(value))

class LocatorTests(unittest.TestCase):
    def test_flips_locator_z_and_preserves_y_quaternion_and_scale(self):
        locators = parse_locators(FIXTURES / "special_building_locators.txt")
        transform = resolve_transform(entry_for(77), locators[77], 6144, FIXTURES / "heightmap.png")
        self.assertAlmostEqual(transform.map_x, 1358.390869)
        self.assertAlmostEqual(transform.map_y, 1455.082520)
        self.assertAlmostEqual(transform.rotation[1], 0.008655)
        self.assertAlmostEqual(transform.scale[0], 0.150777)

    def test_height_uses_same_dem_formula(self):
        self.assertAlmostEqual(elevation_for_sample(0), -500.0)
        self.assertAlmostEqual(elevation_for_sample(65535), 8000.0)
```

Add duplicate id, missing locator, out-of-range map coordinate, non-unit quaternion, zero scale and bilinear interpolation cases.

- [ ] **Step 2: Run and verify failure**

Run: `python3 -m unittest scripts.test_agot_model_import.LocatorTests -v`

Expected: FAIL because `locators.py` does not exist.

- [ ] **Step 3: Implement parser and coordinate conversion**

Parse each locator block by `id`, `position`, `rotation`, and `scale`; enforce one record per id. Resolve:

```python
map_x = locator.position[0]
map_y = map_height - locator.position[2]
base = sample_elevation(heightmap, map_x, map_y)
elevation_meters = base + locator.position[1]
rotation = quaternion_multiply(entry.rotation_offset, locator.rotation)
scale = tuple(asset_scale * locator.scale[i] * entry.scale_multiplier[i] for i in range(3))
```

Apply `positionOffset` before bounds validation and write corrections only from the catalog.

- [ ] **Step 4: Share the DEM formula exactly**

Move or import a small `height_value_to_elevation(value, min_elevation=-500, max_elevation=8000)` helper from `scripts/agot_map_import/dem.py` so tile generation and landmark sampling use the same formula; do not duplicate magic numbers in two implementations.

```python
def height_value_to_elevation(value, min_elevation=-500.0, max_elevation=8000.0):
    return min_elevation + np.asarray(value, dtype=np.float64) / 65535.0 * (max_elevation - min_elevation)
```

- [ ] **Step 5: Run locator and existing DEM tests**

Run:

```bash
python3 -m unittest scripts.test_agot_model_import.LocatorTests -v
python3 -m unittest scripts.test_agot_map_import.DemTests -v
```

Expected: PASS; existing Terrain-RGB encoding remains unchanged.

---

### Task 4: Convert Static Meshes and Textures into Deterministic GLB

**Files:**
- Create: `scripts/agot_model_import/textures.py`
- Create: `scripts/agot_model_import/gltf_writer.py`
- Create: `scripts/fixtures/agot-models/diffuse.png`
- Create: `scripts/fixtures/agot-models/normal.png`
- Create: `scripts/fixtures/agot-models/properties.png`
- Modify: `scripts/test_agot_model_import.py`

**Interfaces:**
- Consumes: `StaticMesh`, `MaterialBinding`, texture source paths.
- Produces: `ConvertedTexture(bytes, width, height, mime_type, role)`, `GlbReport(bytes, triangle_count, bounds, texture_sizes, sha256)`.
- Produces: `convert_texture(path, role, max_size) -> ConvertedTexture`, `pack_properties(path, max_size) -> ConvertedTexture`, `write_glb(mesh, materials, textures, output) -> GlbReport`, `inspect_glb(path) -> GlbReport`.

- [ ] **Step 1: Add failing texture channel and GLB round-trip tests**

Use a 1×1 properties pixel where source R=metallic, G=roughness, B=occlusion. Assert the glTF-packed pixel is R=occlusion, G=roughness, B=metallic. Assert diffuse is declared as base color, while normal and packed properties remain non-color data. Assert GLB magic `glTF`, version 2, aligned JSON/BIN chunks, POSITION/NORMAL/TANGENT/TEXCOORD_0/indices, and `EXT_texture_webp`.

- [ ] **Step 2: Run and verify module failure**

Run: `python3 -m unittest scripts.test_agot_model_import.TextureAndGlbTests -v`

Expected: FAIL because texture and GLB modules do not exist.

- [ ] **Step 3: Implement DDS/image conversion rules**

Use Pillow to decode DDS. For diffuse, resize with Lanczos, convert RGBA, encode lossless WebP and mark usage as sRGB through `baseColorTexture`. For normal, preserve linear RGB and renormalize XY/Z after resizing. For properties, write target `(source.B, source.G, source.R, 255)` and bind the same image as `occlusionTexture` and `metallicRoughnessTexture`. If a source cannot be decoded or its channel semantics are not the standard CK3 mapping, emit an explicit fallback material with constants `metallicFactor=0`, `roughnessFactor=0.85` and record `materialFallback` in audit data.

```python
def pack_properties(path: Path, max_size: int) -> ConvertedTexture:
    rgba = np.asarray(_open_resized(path, max_size).convert("RGBA"))
    packed = rgba[..., [2, 1, 0, 3]]
    return _encode_webp(packed, role="occlusion-metallic-roughness")
```

- [ ] **Step 4: Implement deterministic GLB encoding**

Sort primitives by source declaration order, images by `(material, role)`, use compact JSON with sorted object keys, align buffer views to 4 bytes, use unsigned 16-bit indices only when vertex count permits, otherwise unsigned 32-bit. Include `generator: "AGOT landmark importer 1"`, no absolute source paths, and `extensionsUsed: ["EXT_texture_webp"]`.

```python
def write_glb(mesh, materials, textures, output):
    document, binary = build_gltf_document(mesh, materials, textures)
    payload = encode_glb(document, binary)
    output.write_bytes(payload)
    return inspect_glb(output)
```

- [ ] **Step 5: Implement strict structural re-read**

`inspect_glb` must reject bad magic/version/chunk lengths, unknown external URI, missing required attributes, out-of-range accessors, NaN bounds, texture dimensions over the requested limit, and manifest counts that disagree with decoded accessors.

```python
magic, version, total = struct.unpack_from("<4sII", payload)
if magic != b"glTF" or version != 2 or total != len(payload):
    raise ModelImportError("GLB 头无效")
```

- [ ] **Step 6: Run focused tests**

Run: `python3 -m unittest scripts.test_agot_model_import.TextureAndGlbTests -v`

Expected: PASS and two writes of the same fixture produce identical SHA-256.

---

### Task 5: Generate LOD1 While Preserving Vertex Attributes and Material Boundaries

**Files:**
- Create: `scripts/agot_model_import/meshopt.mjs`
- Modify: `scripts/agot_model_import/mesh_adapter.py`
- Modify: `scripts/test_agot_model_import.py`
- Modify: `package.json`

**Interfaces:**
- Consumes: one primitive’s triangle indices and POSITION array.
- Produces: `simplify_primitive(indices, positions, target_ratio, node_command='node') -> tuple[int, ...]`.
- `meshopt.mjs` stdin JSON: `{indices:number[], positions:number[], targetRatio:number}`; stdout JSON: `{indices:number[], error:number}`.

- [ ] **Step 1: Write failing simplification contract tests**

Assert a fixture grid is reduced to 25%–40% of the original triangles, all output indices reference original vertices, output length is divisible by three, material primitives are simplified independently, and the same input yields byte-identical output.

- [ ] **Step 2: Run and verify failure**

Run: `python3 -m unittest scripts.test_agot_model_import.LodTests -v`

Expected: FAIL because `meshopt.mjs` and `simplify_primitive` do not exist.

- [ ] **Step 3: Implement the Node meshoptimizer bridge**

Await `MeshoptSimplifier.ready`, then use `MeshoptSimplifier.simplify(indices, positions, 3, targetIndexCount, 1e-2, ['LockBorder'])`; round target index count to a multiple of three. Return only new indices so normal, tangent, UV and material association remain untouched. Reject an output outside 25%–40%, invalid indices, or a subprocess failure.

```js
await MeshoptSimplifier.ready
const [simplified, error] = MeshoptSimplifier.simplify(
  Uint32Array.from(input.indices), Float32Array.from(input.positions), 3,
  Math.floor(input.indices.length * input.targetRatio / 3) * 3, 1e-2, ['LockBorder'],
)
process.stdout.write(JSON.stringify({ indices: Array.from(simplified), error }))
```

- [ ] **Step 4: Add package scripts without contaminating normal verification**

Add:

```json
"test:agot-model-import": "python3 -m unittest scripts.test_agot_model_import -v",
"import:agot-models": "python3 -m scripts.agot_model_import.cli convert --source /mnt/c/AGOT/2962333032 --converter-root \"$IO_PDX_MESH_ROOT\" --data-output public/data/agot-map/models --asset-output public/assets/agot-map/models",
"audit:agot-models": "node scripts/audit-agot-models.mjs"
```

The CLI must reject an empty `IO_PDX_MESH_ROOT` before doing work and still verify the exact git commit. Do not add `import:agot-models` to any verify chain.

- [ ] **Step 5: Run LOD and package-boundary tests**

Run:

```bash
python3 -m unittest scripts.test_agot_model_import.LodTests -v
node -e "const p=require('./package.json'); for(const k of ['verify','verify:quick','verify:map']) if((p.scripts[k]||'').includes('import:agot-models')) process.exit(1)"
```

Expected: PASS.

---

### Task 6: Build Atomic Publishing, Manifest and Import Audit

**Files:**
- Create: `scripts/agot_model_import/audit.py`
- Create: `scripts/agot_model_import/cli.py`
- Modify: `scripts/test_agot_model_import.py`

**Interfaces:**
- Consumes all prior importer contracts.
- Produces `convert_catalog(..., only: tuple[str, ...] | None = None) -> ImportReport`, `audit_source(source_root, converter_root, catalog) -> SourceAuditReport`, `audit_outputs(data_root, asset_root, expected_ids) -> AuditReport`; CLI subcommands are `audit-source`, `convert` (with optional `--only`) and `audit`, and exit 0 only for a complete audit/publication.
- Output contracts exactly match model schema v1 and paths `/assets/agot-map/models/<id>/lod0.glb|lod1.glb`.

- [ ] **Step 1: Add failing deterministic publication and rollback tests**

Load the twelve-entry fixture catalog and pass `only=("winterfell", "dragonstone")` to the internal conversion function. Assert manifest ordering, relative source hashes, GLB output hashes, no temp names, no absolute paths, and unchanged old output when the second landmark raises. Test all listed importer rejection conditions from spec section 11.1.

- [ ] **Step 2: Run and verify failure**

Run: `python3 -m unittest scripts.test_agot_model_import.PublishAndAuditTests -v`

Expected: FAIL because pipeline and audit modules do not exist.

- [ ] **Step 3: Implement staging and atomic replacement**

Create sibling directories `<data>.staging-<pid>` and `<assets>.staging-<pid>`, generate both fully, audit staging, then use backup-and-rename with rollback if either rename fails. Never delete or partially overwrite the last successful pair. Clean only staging directories created by this invocation.

```python
with paired_staging(data_output, asset_output) as (data_stage, asset_stage):
    report = convert_catalog(catalog, data_stage, asset_stage, options)
    audit_outputs(data_stage, asset_stage, catalog.ids)
    atomic_replace_pair(data_stage, asset_stage, data_output, asset_output)
```

- [ ] **Step 4: Generate independent manifest and audit records**

Write `landmarks.json` with `schemaVersion: 1`, `sourceId`, converter name/commit, aggregate `assetHash`, and records containing exact transform, two LODs, bytes, triangles, SHA-256, radius and height. Write `reports/audit.json` with source-relative paths/hashes, material fallbacks, correction reason, per-LOD texture dimensions, budgets and aggregate bytes. Never include a source root string.

```python
manifest = {"schemaVersion": 1, "sourceId": EXPECTED_SOURCE_ID,
            "converter": {"name": "io_pdx_mesh", "commit": CONVERTER_COMMIT},
            "assetHash": asset_hash(records), "landmarks": [record.json() for record in records]}
```

- [ ] **Step 5: Enforce budgets and validation before publication**

Reject LOD0 over 20 MiB, LOD1 over 6 MiB, total over 120 MiB, LOD1 ratio outside 25%–40%, texture edge above 2048/1024, unexpected ids, mismatched province/location, missing locator, GLB re-read failure, output hash mismatch, and any path not rooted at `/assets/agot-map/models/`.

- [ ] **Step 6: Run the complete fixture importer suite**

Run: `npm run test:agot-model-import`

Expected: PASS without reading `/mnt/c/AGOT/2962333032`, cloning the converter, or running real mesh conversion.

---

### Task 7: Convert and Audit the Three Pilot Landmarks

**Files:**
- Generate: `tmp/agot-model-pilot-data/landmarks.json`
- Generate: `tmp/agot-model-pilot-data/reports/audit.json`
- Generate: `tmp/agot-model-pilot-assets/{winterfell,dragonstone,the-eyrie}/{lod0,lod1}.glb`
- Modify only if audited correction is needed: `scripts/agot_model_import/landmark_models.json`

**Interfaces:**
- Consumes real AGOT source and exact external converter commit.
- Produces three valid records first; publication to the final twelve-record manifest occurs only in Task 13. During pilot work, write to `tmp/agot-model-pilot-*`, not final public roots.

- [ ] **Step 1: Verify the external tool and source before conversion**

Run:

```bash
git -C "$IO_PDX_MESH_ROOT" rev-parse HEAD
python3 -m scripts.agot_model_import.cli audit-source --source /mnt/c/AGOT/2962333032 --converter-root "$IO_PDX_MESH_ROOT"
```

Expected: exact converter commit and valid source id `2962333032`; otherwise stop without touching public outputs.

- [ ] **Step 2: Convert Winterfell to a temporary pilot root**

Run the CLI with `--only winterfell`, temporary data/assets outputs and verbose report. Expected: two valid GLBs, locator id 77, `mapX=1358.390869`, `mapY=1455.082520`, no fallback unless explicitly recorded.

- [ ] **Step 3: Convert Dragonstone and The Eyrie**

Run with `--only winterfell,dragonstone,the-eyrie`. Expected: three complete records, multi-material assignments retained, LOD ratios/budgets valid, and island/mountain base elevations sampled from the same heightmap formula.

- [ ] **Step 4: Record only evidence-based corrections**

If numeric inspection proves a correction is required, add it only to the relevant catalog entry with a Chinese `reason` naming the observed source mismatch. Rerun conversion; do not add location-specific branches to Python or TypeScript.

- [ ] **Step 5: Audit pilots**

Run the Python audit against temporary roots and independently inspect each GLB. Expected: exact three ids, no source path leakage, all hashes match, and total pilot size respects per-file limits. Do not claim visual appearance is accepted; user visual inspection remains a later manual gate.

---

### Task 8: Add Runtime Manifest Schema and Isolated Repository

**Files:**
- Create: `src/features/map/landmarks/landmarkSchemas.ts`
- Create: `src/features/map/landmarks/landmarkRepository.ts`
- Create: `scripts/test-map-landmark-schema.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces exact TypeScript types `LandmarkModelManifest`, `LandmarkModelRecord`, `LandmarkLod`, `LandmarkTransform`, `LandmarkBounds` via `z.infer`.
- Produces `parseLandmarkManifest(input: unknown): LandmarkModelManifest`.
- Produces `LandmarkRepository.loadManifest(signal?: AbortSignal): Promise<LandmarkModelManifest>`, `clear(): void`, `LandmarkDataError`.

- [ ] **Step 1: Write failing schema and repository tests**

Test a valid schema v1 fixture, URL locality, exactly two LODs with minZoom 4.60/5.35, unique ids/locationIds/provinceIds, positive dimensions/counts and SHA-256. Test repository caching, abort propagation, retry after rejected promise, and error isolation from `MapDataError`.

- [ ] **Step 2: Run and verify failure**

Run: `node --experimental-strip-types scripts/test-map-landmark-schema.mjs`

Expected: FAIL because runtime landmark modules do not exist.

- [ ] **Step 3: Implement strict Zod schema**

Use tuple types for quaternion/scale and `z.string().regex(/^\/assets\/agot-map\/models\/[a-z0-9-]+\/lod[01]\.glb$/)`. Add `superRefine` for uniqueness, LOD order, limits and 120 MiB aggregate. Do not reference or mutate `MapManifest` or its schemaVersion 4.

```ts
export const landmarkModelManifestSchema = z.object({
  schemaVersion: z.literal(1), sourceId: z.literal('2962333032'),
  converter: z.object({ name: z.literal('io_pdx_mesh'), commit: z.literal(CONVERTER_COMMIT) }),
  assetHash: sha256Schema, landmarks: z.array(landmarkModelRecordSchema).length(12),
}).superRefine(validateManifestInvariants)
export type LandmarkModelManifest = z.infer<typeof landmarkModelManifestSchema>
```

- [ ] **Step 4: Implement repository with separate cache/error state**

Fetch only `'/data/agot-map/models/landmarks.json'`; check `response.ok`; parse through Zod. Cache only a live/successful promise and clear it after rejection so reopening can retry. Wrap errors in `LandmarkDataError` and never import `MapRepository`, `MapDataError` or UI warning copy.

```ts
loadManifest(signal?: AbortSignal): Promise<LandmarkModelManifest> {
  this.pending ??= this.fetcher(MANIFEST_PATH, { signal })
    .then(requireOk).then(response => response.json()).then(parseLandmarkManifest)
    .catch(error => { this.pending = null; throw new LandmarkDataError(MANIFEST_PATH, error) })
  return this.pending
}
```

- [ ] **Step 5: Register and run test**

Add `test:map-landmark-schema` to package scripts and run it. Expected: PASS.

---

### Task 9: Implement Pure LOD, Capability, Viewport and Transform Logic

**Files:**
- Create: `src/features/map/landmarks/landmarkVisibility.ts`
- Create: `src/features/map/landmarks/landmarkTransform.ts`
- Create: `scripts/test-map-landmark-visibility.mjs`
- Create: `scripts/test-map-landmark-transform.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `type LandmarkCapability = 'unsupported' | 'low' | 'standard'`.
- Produces `LandmarkRequest { key: string; landmark: LandmarkModelRecord; lodLevel: 0 | 1; lod: LandmarkLod }`, `landmarkLodFor(zoom, capability): 0 | 1 | null`, `visibleLandmarkRequests(records, bounds, zoom, capability): LandmarkRequest[]`, `retainedLimit(capability): number`, `landmarkCacheBytes(capability): number`.
- Produces `landmarkModelMatrix(record, mapManifest, terrainScale=32): THREE.Matrix4` and `landmarkAnchor(record, mapManifest, terrainScale): MercatorCoordinate`.

- [ ] **Step 1: Write threshold and viewport tests first**

Assert 4.599→null, 4.60→LOD1, 5.349→LOD1, 5.35 standard→LOD0, 5.35 low→LOD1, unsupported→null. Test intersection using `radiusMapPixels`, deterministic nearest-to-center ordering, max 2/6, a record just outside bounds included by radius, and explicit cache budgets of 12 MiB for low capability and 120 MiB for standard capability.

- [ ] **Step 2: Write transform basis tests first**

Assert map X moves east, source model Z moves south on map, model Y increases altitude, quaternion is preserved in composition order, locator/asset scale is applied once, and base elevation is multiplied by `TERRAIN_VISUAL_SCALE=32` while building geometry scale is not vertically exaggerated.

- [ ] **Step 3: Run tests and observe failures**

Run both new test commands. Expected: FAIL due to missing modules.

- [ ] **Step 4: Implement pure selection**

Use an expanded pixel bounds intersection and sort by squared center distance then id. Return desired requests as `{key: `${id}:lod${lodLevel}`, landmark, lodLevel, lod: landmark.lods.find(item => item.path.endsWith(`/lod${lodLevel}.glb`))!}` after schema validation has proved each level exists exactly once. Return cache budgets `12 * 1024 * 1024` for low and `120 * 1024 * 1024` for standard. No fetch, scene mutation, timers or MapLibre dependency is allowed in this module.

```ts
export function landmarkLodFor(zoom: number, capability: LandmarkCapability): 0 | 1 | null {
  if (capability === 'unsupported' || zoom < 4.60) return null
  if (capability === 'low' || zoom < 5.35) return 1
  return 0
}
```

- [ ] **Step 5: Implement Mercator matrix composition**

Convert `mapX/mapY` with existing `mapPixelToLngLat`, anchor through `MercatorCoordinate.fromLngLat(lngLat, elevationMeters * terrainScale)`, scale horizontal PDX/map units by `1 / (westerosBounds.maxX - minX)`, use a basis transform mapping `(X,Y,Z)` to `(mercatorX, altitude, mercatorY)`, then compose source quaternion and scale. Return a new matrix without mutating the record.

```ts
const anchor = MercatorCoordinate.fromLngLat(mapPixelToLngLat(record.transform, manifest), record.transform.elevationMeters * terrainScale)
return new Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z)
  .multiply(MODEL_XYZ_TO_MAP_X_ALTITUDE_Y)
  .multiply(new Matrix4().makeRotationFromQuaternion(new Quaternion(...record.transform.rotation)))
  .scale(new Vector3(...record.transform.scale).multiplyScalar(1 / mapWidth))
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm run test:map-landmark-visibility
npm run test:map-landmark-transform
```

Expected: PASS at all hard thresholds and axis assertions.

---

### Task 10: Implement Bounded Loading, Cancellation, LRU and Disposal

**Files:**
- Create: `src/features/map/landmarks/landmarkResourceCache.ts`
- Create: `scripts/test-map-landmark-cache.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `LandmarkLoadError`, `LoadedLandmarkResource { key, object: THREE.Group, bytes, dispose(): void }`.
- Produces `LandmarkResourceCache.request(request): Promise<LoadedLandmarkResource>`, `reconcile(desiredKeys): void`, `get(key)`, `clear(): void`, and constructor options `{maxConcurrent: 2, maxBytes, loader}`.
- Loader signature: `(request: LandmarkRequest, signal: AbortSignal) => Promise<LoadedLandmarkResource>`.

- [ ] **Step 1: Write failing concurrency, cancellation and disposal tests**

Use deferred fake loads. Assert only two start, queued work starts after settlement, leaving desired set aborts in-flight and removes queued requests, cache hits do not reload, LRU skips currently retained keys, and eviction calls `dispose` exactly once.

- [ ] **Step 2: Add recursive Three disposal tests**

Build a Group with shared geometry/material/texture and assert recursive disposal deduplicates each object. Include material arrays and baseColor/normal/metalness/roughness/AO textures.

- [ ] **Step 3: Run and verify failure**

Run: `node --experimental-strip-types scripts/test-map-landmark-cache.mjs`

Expected: FAIL because cache module does not exist.

- [ ] **Step 4: Implement queue and LRU state machine**

Use maps for `inFlight`, `ready`, `lastUsed`, and a FIFO queue. `reconcile` updates retained keys, aborts obsolete work and evicts non-retained least-recently-used entries until within `maxBytes`; never exceed `maxConcurrent=2`. Treat AbortError as normal cancellation, not a landmark failure.

```ts
reconcile(desiredKeys: ReadonlySet<string>): void {
  this.retained = new Set(desiredKeys)
  for (const [key, job] of this.inFlight) if (!desiredKeys.has(key)) job.abort.abort()
  this.queue = this.queue.filter(job => desiredKeys.has(job.request.key))
  this.evictToBudget()
  this.pump()
}
```

- [ ] **Step 5: Implement GLTFLoader adapter**

Use `GLTFLoader.loadAsync` via fetch/ArrayBuffer plus `loader.parseAsync` so AbortSignal controls network. Set `castShadow=false`, `receiveShadow=false`, clone only scene graph nodes needed for one record, and report manifest bytes rather than estimating decoded GPU bytes. Fail one request without clearing other ready resources.

```ts
const response = await fetch(request.lod.path, { signal })
if (!response.ok) throw new LandmarkLoadError(request.key, response.status)
const gltf = await loader.parseAsync(await response.arrayBuffer(), request.lod.path.slice(0, request.lod.path.lastIndexOf('/') + 1))
gltf.scene.traverse(node => { node.castShadow = false; node.receiveShadow = false })
```

- [ ] **Step 6: Run cache tests**

Run: `npm run test:map-landmark-cache`

Expected: PASS; no test performs network or creates a DOM canvas.

---

### Task 11: Create the Shared-Context MapLibre Custom Layer

**Files:**
- Create: `src/features/map/landmarks/landmarkCustomLayer.ts`
- Create: `scripts/test-map-landmark-layer.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `LANDMARK_LAYER_ID = 'agot-landmark-models'`.
- Produces `createLandmarkCustomLayer(options): LandmarkCustomLayer`, where options include injectable `rendererFactory(parameters: WebGLRendererParameters)` for unit tests and the layer implements `CustomLayerInterface`, `setObject(key, object, matrix)`, `removeObject(key)`, `clearObjects()`, `capability()`.
- Consumes MapLibre `CustomRenderMethodInput.defaultProjectionData.mainMatrix` and the exact `gl` passed to `onAdd`/`render`.

- [ ] **Step 1: Write source and fake-renderer tests first**

Assert `type='custom'`, `renderingMode='3d'`, the renderer factory receives `{canvas: map.getCanvas(), context: gl, antialias: true}`, no `document.createElement`, no `requestAnimationFrame`, no Raycaster, and `onRemove` disposes scene resources/renderer without calling `forceContextLoss` on MapLibre’s shared context.

- [ ] **Step 2: Run and verify failure**

Run: `node --experimental-strip-types scripts/test-map-landmark-layer.mjs`

Expected: FAIL because the custom layer does not exist.

- [ ] **Step 3: Implement renderer and scene initialization**

In `onAdd`, reject non-WebGL2 contexts as unsupported, create `WebGLRenderer({canvas: map.getCanvas(), context: gl, antialias: true})`, set `autoClear=false`, `shadowMap.enabled=false`, output color space to sRGB, and add one ambient plus one directional light. Use a plain `Camera`; do not attach controls.

```ts
const parameters = { canvas: map.getCanvas(), context: gl, antialias: true }
this.renderer = this.options.rendererFactory?.(parameters) ?? new WebGLRenderer(parameters)
this.renderer.autoClear = false
this.renderer.shadowMap.enabled = false
this.scene.add(new AmbientLight(0xffffff, 1.1), new DirectionalLight(0xfff2d0, 1.4))
```

- [ ] **Step 4: Implement MapLibre-driven render only**

In `render`, set camera projection matrix from `options.defaultProjectionData.mainMatrix`, call `renderer.resetState()`, render scene once, call `renderer.resetState()` again, and call `map.triggerRepaint()` only after scene membership changes—not every frame. Never schedule another frame loop.

```ts
render(_gl, options): void {
  this.camera.projectionMatrix.fromArray(options.defaultProjectionData.mainMatrix)
  this.renderer.resetState(); this.renderer.render(this.scene, this.camera); this.renderer.resetState()
}
```

- [ ] **Step 5: Implement safe removal and context events**

`onRemove` clears objects, disposes renderer-owned lists, unregisters `webglcontextlost/restored` listeners and nulls references. On context loss, prevent only model rendering; on unsuccessful restore, keep layer empty and report one local warning callback.

```ts
onRemove(): void {
  this.clearObjects(); this.renderer?.dispose()
  this.canvas?.removeEventListener('webglcontextlost', this.onContextLost)
  this.canvas?.removeEventListener('webglcontextrestored', this.onContextRestored)
  this.renderer = null; this.map = null
}
```

- [ ] **Step 6: Run layer tests**

Run: `npm run test:map-landmark-layer`

Expected: PASS with exactly one canvas/context identity.

---

### Task 12: Integrate Runtime Lifecycle into `MapCanvas` Without Changing Interaction Authority

**Files:**
- Create: `src/features/map/landmarks/landmarkRuntime.ts`
- Create: `scripts/test-map-landmark-integration.mjs`
- Modify: `src/features/map/MapCanvas.tsx`
- Modify: `scripts/check-map-runtime-boundaries.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `createLandmarkRuntime(map, manifest, options?): Promise<LandmarkRuntime>`.
- `LandmarkRuntime` methods: `sync(reason: 'manifest-ready'|'moveend'|'zoomend'): void`, `destroy(): void`.
- Runtime warning callback emits one merged decorative warning and never calls `setInitializationError`, `setSemanticInitializationError`, or terrain disable methods.

- [ ] **Step 1: Write failing integration/source-boundary tests**

Assert dynamic `import('./landmarks/landmarkRuntime.ts')`, layer insertion before `COUNTY_HIT_LAYER`, sync calls only in `moveend`/`zoomend`/manifest ready, cleanup before `map.remove`, and absence of model work inside `handleTerrainZoom`. Assert existing click handlers and 2D layer ids remain unchanged.

- [ ] **Step 2: Rewrite the old blanket Three.js ban as precise invariants**

Change `check-map-runtime-boundaries.mjs` to require shared `canvas` and `context`, and reject:

```regex
/document\.createElement\(['"]canvas|new\s+HTMLCanvasElement|requestAnimationFrame|new\s+THREE\.Raycaster|new\s+Raycaster|OrbitControls|TrackballControls/
```

Continue rejecting source/Workshop/remote URLs. Require `renderingMode: '3d'`, MapLibre custom layer, dynamic import, and `map.addLayer(..., COUNTY_HIT_LAYER)`.

- [ ] **Step 3: Run tests and verify expected failure**

Run:

```bash
node --experimental-strip-types scripts/test-map-landmark-integration.mjs
npm run check:map-runtime-boundaries
```

Expected: FAIL because runtime integration has not been added and the old check still bans Three.js.

- [ ] **Step 4: Implement `landmarkRuntime` orchestration**

Load the independent manifest, add the custom layer, classify low capability when WebGL2 is available and either `navigator.hardwareConcurrency <= 4` or `navigator.deviceMemory` exists and is `< 4`; otherwise standard. Compute viewport pixel bounds through existing coordinate helpers, reconcile cache, attach loaded objects with `landmarkModelMatrix`, and aggregate failed ids into one `console.warn('[Landmarks] ...')` plus optional non-blocking warning callback.

```ts
if (!map.getLayer(LANDMARK_LAYER_ID)) map.addLayer(layer, COUNTY_HIT_LAYER)
const records = visibleLandmarkRequests(manifest.landmarks, viewportPixelBounds(map, mapManifest), map.getZoom(), capability)
cache.reconcile(new Set(records.map(record => record.key)))
for (const request of records) void cache.request(request).then(resource => layer.setObject(request.key, resource.object, landmarkModelMatrix(request.landmark, mapManifest)))
```

- [ ] **Step 5: Dynamically attach and destroy from `MapCanvas`**

Inside the map setup effect, keep `let landmarkRuntime: LandmarkRuntime | null = null` and `let landmarksCancelled=false`. In the existing `load` initialization, run dynamic import and create runtime inside a `.catch` that only logs a decorative warning. Add `landmarkRuntime?.sync('moveend')` and `sync('zoomend')` to the existing settled handlers. In cleanup set cancellation, call `landmarkRuntime?.destroy()` before terrain controller destruction and `map.remove()`.

```ts
void import('./landmarks/landmarkRuntime.ts').then(({ createLandmarkRuntime }) => createLandmarkRuntime(map, manifest))
  .then(runtime => { if (landmarksCancelled) runtime.destroy(); else landmarkRuntime = runtime })
  .catch(error => console.warn('[Landmarks] 三维地标不可用，保留二维地图', error))
```

- [ ] **Step 6: Preserve all failure boundaries**

Do not change `initializationError` or `semanticInitializationError` based on landmarks. Do not route landmark failures through `handleMapError`, `MapRepository`, or “地图资料未能载入”. Do not remove or cover `COUNTY_HIT_LAYER`, `SELECTED_COUNTY_LOCATION_LAYER`, character or asset click handlers.

- [ ] **Step 7: Run integration and boundary tests**

Run:

```bash
npm run test:map-landmark-integration
npm run check:map-runtime-boundaries
npm run test:map-integration
npm run test:map-terrain-integration
```

Expected: PASS; continuous zoom remains terrain-only.

---

### Task 13: Convert the Remaining Nine and Publish the Complete Twelve-Landmark Set

**Files:**
- Generate: `public/data/agot-map/models/landmarks.json`
- Generate: `public/data/agot-map/models/reports/audit.json`
- Generate: `public/assets/agot-map/models/{winterfell,red-keep,dragonstone,casterly-rock,highgarden,sunspear,storms-end,the-eyrie,pyke,oldtown,riverrun,harrenhal}/{lod0,lod1}.glb`
- Modify only for audited corrections: `scripts/agot_model_import/landmark_models.json`

**Interfaces:**
- Produces final exact twelve records and 24 GLBs consumed by runtime.
- Final `assetHash` covers manifest-relevant source hashes and all output hashes deterministically.

- [ ] **Step 1: Run the full real conversion to staging outputs**

Use explicit source and converter roots and staging destinations outside `public`. Expected: twelve records; Harrenhal uses `building_special_harrenhal_ruined.asset`; no other state variant is inferred.

- [ ] **Step 2: Resolve budget failures without raising limits**

For any file over budget, reduce texture edge within 2048/1024 or increase mesh simplification while keeping LOD1 within 25%–40%. Rerun that landmark and inspect its audit. Never alter global 120/20/6 MiB constants.

- [ ] **Step 3: Run full real audit before publishing**

Assert exact ids/province ids, 24 valid GLBs, hashes, no absolute paths, WebP limits, material fallback declarations, triangle ratios, finite bounds, total ≤120 MiB and each per-file limit.

- [ ] **Step 4: Atomically publish final roots**

Run the conversion with final `public/data/agot-map/models` and `public/assets/agot-map/models` outputs only after staging audit passes. Expected: both directories switch as one logical publication and contain no stale extra landmarks.

- [ ] **Step 5: Re-run audit from final paths**

Run Python audit and compare final manifest/audit hashes with staging. Expected: identical results and no `.staging-*` or backup files under public roots.

---

### Task 14: Add Generated-Asset Audit and Run the Complete Non-Browser Verification

**Files:**
- Create: `scripts/audit-agot-models.mjs`
- Modify: `scripts/check-map-runtime-boundaries.mjs`
- Modify: `package.json`
- Create: `docs/agot-landmark-model-import.md`

**Interfaces:**
- `audit-agot-models.mjs` accepts optional `--data` and `--assets`, defaults to final public roots, and exits nonzero on any mismatch.
- `verify:map` consumes only lightweight generated-output audit and fixture tests, never real source conversion.

- [ ] **Step 1: Write audit assertions before adding it to verify**

Validate schema 1, converter commit, exact 12 ids and province ids, 24 local paths, each SHA-256/byte count, GLB magic/version/JSON chunk, triangle/accessor counts, finite bounds, texture metadata, LOD ratios, all budgets and no remote/source path strings.

- [ ] **Step 2: Run the standalone audit**

Run: `node scripts/audit-agot-models.mjs`

Expected: PASS with a summary naming twelve landmarks, 24 GLBs and aggregate MiB. If generated files are deliberately not distributable, the command must report them missing and `verify:map` integration must wait until local publication exists; do not replace real GLBs with empty fixtures.

- [ ] **Step 3: Register lightweight tests and audit in `verify:map`**

Add all six landmark Node tests, `test:agot-model-import`, boundary check and `audit:agot-models` to `verify:map`. Keep `import:agot-models` absent from all verify scripts. Keep existing five-tier semantic, terrain, interaction and map data checks unchanged.

- [ ] **Step 4: Document reproducible conversion and licensing boundary**

Document exact converter clone/checkout command, GPL-3.0 external-tool status, source redistribution caveat, explicit source/converter flags, pilot/full conversion commands, audit commands, output paths, budgets, no-browser verification and the fact that visual acceptance remains manual.

- [ ] **Step 5: Run focused complete verification**

Run:

```bash
npm run test:agot-model-import
npm run test:map-landmark-schema
npm run test:map-landmark-visibility
npm run test:map-landmark-transform
npm run test:map-landmark-cache
npm run test:map-landmark-layer
npm run test:map-landmark-integration
npm run audit:agot-models
npm run check:map-runtime-boundaries
npx tsc --noEmit
```

Expected: every command exits 0.

- [ ] **Step 6: Run full map and build verification without a browser**

Run:

```bash
npm run verify:map
npm run build:code
git diff --check
```

Then run the existing Windows build command from the project’s established Windows Node environment, matching prior verification practice. Expected: all commands exit 0; no browser starts; no real conversion runs inside verification.

- [ ] **Step 7: Perform final requirement audit**

Inspect evidence requirement by requirement: twelve identities/transforms, DEM base height, two LODs, hard zoom thresholds, visibility buffer, 2/2-or-6 limits, cancellation/LRU/disposal, one canvas/context, 2D-only interaction, local URLs, independent schema/repository/errors, 120/20/6 MiB budgets, no shadows, no source path leakage, cleanup before map removal, and no commit/push. Record visual scale/orientation/material/grounding as “等待用户人工地图内检查” rather than claiming automatic tests proved appearance.

---

## Execution Notes

- Recommended order is strictly Task 1→14 because each task’s interface is consumed by the next; Task 7 is a pilot gate and Task 13 must not begin until the importer and pilot audits pass.
- Review after each task against its **Interfaces** block and focused test. Preserve unrelated dirty files throughout.
- Since the user explicitly prohibited commits, use `git diff -- <task files>` for checkpoints instead of commit boundaries.
- Final manual visual acceptance is intentionally separate from automated completion because the user prohibited browser use in this implementation session.
