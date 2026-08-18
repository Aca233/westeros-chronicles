# AGOT 混合地图与旅行系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在项目内交付离线可用的完整维斯特洛二维地图、稳定地点 ID、路线规划、多回合旅行、情报过滤与动态政治投影，并让所有状态与正文、人物、物品和世界历史共享同一权威来源。

**Architecture:** 开发期由 `scripts/agot_map_import` 从固定 AGOT 模组目录生成地图清单、分片 JSON、本地 WebP/PBF/DEM 瓦片和旅行图，运行时只通过 `src/features/map` 加载项目内产物。MapLibre 在左侧抽屉内负责渲染；人物、地点、旅行、资产和政治信息由统一世界状态投影，原始 `9216×6144` 像素坐标始终作为游戏逻辑坐标。

**Tech Stack:** React 18、TypeScript 5.7、Zustand、Zod、MapLibre GL JS、Web Worker、Python 3、Pillow、NumPy、Rasterio、Shapely、mapbox-vector-tile、Node 测试脚本。

**Spec:** `docs/superpowers/specs/2026-08-18-agot-map-system-design.md`

## Global Constraints

- 第一版范围固定为完整维斯特洛、塞外、长城、铁群岛、龙石岛和近海航线，不生成厄斯索斯可浏览内容。
- 开发期源目录固定为 `/mnt/c/agot/2962333032`，运行时代码和清单不得包含或读取该绝对路径，也不得访问网络地图接口。
- 游戏逻辑只保存原始 `9216×6144` 像素坐标；伪经纬度只用于 MapLibre 渲染，不能参与旅行距离与路线成本计算。
- 地形瓦片为本地 512px XYZ WebP，矢量图层为本地 PBF，DEM 为 Terrain-RGB PNG；第一版 DEM 仅用于 hillshade。
- 地图从左侧打开，桌面约 `72vw` 且最大 `1180px`，小屏约 `82vw`，移动端全屏；与右侧人物卷宗互斥。
- 基础地理公开；人物、资产、驻军、危险和事件必须经过 `confirmed | rumored | stale | unknown` 情报过滤。
- 普通赶路不投 D20；仅渡河、逃亡、突破封锁等不确定动作进入现有检定系统。
- 不兼容旧测试存档；地点接入时将 `ITEM_SAVE_FORMAT_VERSION` 从 `6` 提升到 `7` 并拒绝旧格式。
- UI 禁止 Emoji；优先使用导入的 AGOT 游戏图标，无游戏图标时使用项目现有 Lucide 图标。
- 手写源码只用 `apply_patch` 修改；生成器只写 `public/data/agot-map` 和 `public/assets/agot-map` 的原子临时目录。
- 真实 `9216×6144` 导入不进入普通 `npm run verify`；fixture 测试和已生成数据审计进入完整验证链。
- 当前工作区的头像导入与头像 UI 改动属于另一任务；不得暂存、覆盖、回退或提交这些文件及临时头像目录。

---

### Task 1: 地图运行时核心类型、Schema 与依赖

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/features/map/types.ts`
- Create: `src/features/map/schemas.ts`
- Create: `src/features/map/coordinates.ts`
- Create: `scripts/test-map-schema.mjs`

**Interfaces:**
- Produces: `MapLocationType`, `MapLocation`, `MapManifest`, `MapPixelPoint`, `MapBounds`, `TravelMode`, `RoutePreference`, `KnowledgeLevel`。
- Produces: `parseMapManifest(value: unknown): MapManifest`、`parseMapLocation(value: unknown): MapLocation`。
- Produces: `mapPixelToLngLat(point, manifest): [number, number]` 与 `lngLatToMapPixel(lngLat, manifest): MapPixelPoint`。

- [ ] **Step 1: 写失败的核心 Schema 测试**

```js
// scripts/test-map-schema.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const types = readFileSync('src/features/map/types.ts', 'utf8')
const schemas = readFileSync('src/features/map/schemas.ts', 'utf8')
const coordinates = readFileSync('src/features/map/coordinates.ts', 'utf8')

assert.match(types, /interface MapLocation/)
assert.match(types, /mapX: number/)
assert.match(types, /mapY: number/)
assert.match(schemas, /sourceId: z\.literal\('2962333032'\)/)
assert.match(coordinates, /export function mapPixelToLngLat/)
assert.match(coordinates, /export function lngLatToMapPixel/)
console.log('map schema tests passed')
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node scripts/test-map-schema.mjs`

Expected: FAIL，原因是 `src/features/map/types.ts` 不存在。

- [ ] **Step 3: 安装 MapLibre 并实现精确类型**

Run: `npm install maplibre-gl@^5.7.1`

```ts
// src/features/map/types.ts
export type MapLocationType = 'region' | 'castle' | 'city' | 'town' | 'village' | 'port' | 'ruin' | 'landmark'
export type TravelMode = 'walk' | 'horse' | 'carriage' | 'ship'
export type RoutePreference = 'fastest' | 'safest' | 'cheapest'
export type KnowledgeLevel = 'confirmed' | 'rumored' | 'stale' | 'unknown'
export interface MapPixelPoint { mapX: number; mapY: number }
export interface MapBounds { minX: number; minY: number; maxX: number; maxY: number }
export interface MapLocation extends MapPixelPoint {
  id: string; name: string; englishName?: string; type: MapLocationType
  provinceId: number; baronyId?: string; countyId?: string; duchyId?: string
  kingdomId?: string; regionId: string; terrain: string; isCoastal: boolean
  isPort: boolean; importance: number; tags: string[]
}
export interface MapManifest {
  schemaVersion: 1; sourceId: '2962333032'; sourceHashes: Record<string, string>
  mapSize: { width: 9216; height: 6144 }; westerosBounds: MapBounds
  tileSize: 512; minZoom: number; maxZoom: number
  paths: { terrain: string; vector: string; dem: string; locations: string; routes: string; searchIndex: string }
  counts: { regions: number; provinces: number; locations: number; routeEdges: number; terrainTiles: number; vectorTiles: number; demTiles: number }
  datasetHash: string
}
```

`schemas.ts` 用严格 Zod 对象逐字段实现上面两个接口，路径字段必须以 `/data/agot-map/` 或 `/assets/agot-map/` 开头并拒绝 `http:`、`https:`、`2962333032` 和反斜线。`coordinates.ts` 使用 `westerosBounds` 做线性可逆映射：X 映射 `[-180, 180]`，Y 映射 `[85.05112878, -85.05112878]`，输入输出均 clamp 到边界。

- [ ] **Step 4: 将测试接入 package scripts 并验证**

在 `package.json` 增加：

```json
"test:map-schema": "node scripts/test-map-schema.mjs"
```

Run: `npm run test:map-schema && npm run build:code`

Expected: 两条命令均 PASS。

- [ ] **Step 5: 提交**

```bash
git add package.json package-lock.json src/features/map/types.ts src/features/map/schemas.ts src/features/map/coordinates.ts scripts/test-map-schema.mjs
git commit -m "feat: 建立地图运行时数据协议"
```

### Task 2: 地图源验证、Paradox 解析与 Fixture

**Files:**
- Create: `scripts/requirements-map.txt`
- Create: `scripts/agot_map_import/__init__.py`
- Create: `scripts/agot_map_import/models.py`
- Create: `scripts/agot_map_import/source.py`
- Create: `scripts/agot_map_import/paradox.py`
- Create: `scripts/agot_map_import/regions.py`
- Create: `scripts/fixtures/agot_map_source/map_data/definition.csv`
- Create: `scripts/fixtures/agot_map_source/map_data/default.map`
- Create: `scripts/fixtures/agot_map_source/map_data/adjacencies.csv`
- Create: `scripts/fixtures/agot_map_source/map_data/geographical_regions/00_fixture.txt`
- Create: `scripts/test_agot_map_import.py`

**Interfaces:**
- Produces: `MapSource.open(root: Path, expected_size: tuple[int, int] | None) -> MapSource`。
- Produces: `ProvinceDefinition`, `RegionDefinition` dataclasses。
- Produces: `parse_definition(path) -> dict[int, ProvinceDefinition]`、`expand_region(name, regions) -> frozenset[str]`。
- Consumes: `scripts/agot_character_import/paradox.py` 的词法规则，但地图包不导入人物 CLI。

- [ ] **Step 1: 创建 8×6 RGB/16 位图像 fixture 和失败测试**

测试 `MapSource.open` 拒绝缺少 `provinces.png`、错误 RGB 尺寸、错误 `sourceId`；验证 definition 的 RGB 唯一性；验证嵌套 `world_westeros -> north -> b_winterfell` 被递归展开，循环引用抛出 `MapImportError`。fixture 图像由测试 `setUpClass` 使用 Pillow 写入临时目录，不提交二进制测试图片。

```py
def test_expands_nested_westeros_region(self):
    regions = parse_regions(self.fixture / 'map_data/geographical_regions')
    self.assertEqual(expand_region('world_westeros', regions), frozenset({'b_winterfell', 'b_kings_landing'}))
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python3 -m unittest scripts.test_agot_map_import -v`

Expected: FAIL，原因是 `scripts.agot_map_import` 不存在。

- [ ] **Step 3: 实现源验证和解析器**

`source.py` 固定验证 `map_data/default.map` 中 province、definition、river、heightmap 文件名，真实源必须存在 `descriptor.mod` 或 `common/landed_titles` 且 Workshop ID 为 `2962333032`。图片验证规则是 provinces 为 RGB、heightmap 为 16 位、rivers 尺寸一致；fixture 可通过 `expected_size=(8, 6)` 覆盖真实尺寸。`paradox.py` 复用项目词法行为，支持注释、字符串、标量、块和重复键；`regions.py` 对嵌套区域做 DFS 并携带访问栈报告循环链。

- [ ] **Step 4: 固定地图 Python 依赖并验证**

```text
Pillow==12.3.0
numpy==2.2.6
rasterio==1.4.3
shapely==2.1.1
mapbox-vector-tile==2.2.0
```

Run: `python3 -m unittest scripts.test_agot_map_import -v`

Expected: 所有源验证和区域解析测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/requirements-map.txt scripts/agot_map_import scripts/fixtures/agot_map_source scripts/test_agot_map_import.py
git commit -m "feat: 添加 AGOT 地图源解析器"
```

### Task 3: 省份几何、头衔层级与命名地点目录

**Files:**
- Create: `scripts/agot_map_import/geometry.py`
- Create: `scripts/agot_map_import/titles.py`
- Create: `scripts/agot_map_import/locations.py`
- Create: `scripts/agot_map_import/overrides.json`
- Modify: `scripts/test_agot_map_import.py`

**Interfaces:**
- Produces: `extract_province_geometry(image, definitions, included_ids) -> dict[int, ProvinceGeometry]`。
- Produces: `parse_title_hierarchy(paths) -> TitleIndex`，其中 `TitleIndex.ancestors(barony_id)` 返回 county/duchy/kingdom。
- Produces: `build_locations(geometries, titles, localization, overrides) -> list[MapLocationRecord]`。

- [ ] **Step 1: 写失败的几何和地点测试**

测试不规则 3×2 省份的 `pixel_count`、bbox、`representative_point` 必须落在自身像素内；同色断岛合并为一个 MultiPolygon；地点 ID 等于男爵领 ID；策划覆盖只能修改名称、类型、坐标、标签、介绍和图标，不能修改稳定 ID。

```py
def test_representative_point_stays_inside_province(self):
    geometry = extract_province_geometry(self.provinces, self.definitions, {1})[1]
    self.assertEqual(self.provinces.getpixel((geometry.map_x, geometry.map_y)), (10, 20, 30))
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python3 -m unittest scripts.test_agot_map_import.MapGeometryTests -v`

Expected: FAIL，原因是 `geometry.py` 不存在。

- [ ] **Step 3: 实现几何和地点生成**

用 NumPy 将 RGB 编码为 `r<<16 | g<<8 | b`，用 `numpy.bincount` 求像素计数和均值，用 `rasterio.features.shapes` 提取多边形，用 `shapely.make_valid` 修复后按缩放级别生成不改变拓扑的简化版本。地点首选覆盖坐标，否则使用 `representative_point`；本地化优先简中，其次英文键名；类型按历史省份/头衔标志解析，无法细分的命名男爵领默认 `castle`。

`overrides.json` 首批精修 `b_winterfell`、`b_kings_landing`、`b_casterly_rock`、`b_the_eyrie`、`b_riverrun`、`b_highgarden`、`b_storms_end`、`b_sunspear`、`b_pyke`、`b_dragonstone` 和长城主要城堡，并写入中文介绍与本地游戏图标相对路径。

- [ ] **Step 4: 验证**

Run: `python3 -m unittest scripts.test_agot_map_import -v`

Expected: 省份、层级、地点和覆盖测试全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/agot_map_import/geometry.py scripts/agot_map_import/titles.py scripts/agot_map_import/locations.py scripts/agot_map_import/overrides.json scripts/test_agot_map_import.py
git commit -m "feat: 生成维斯特洛地点与领地几何"
```

### Task 4: 道路、渡口、海路和加权旅行图

**Files:**
- Create: `scripts/agot_map_import/routes.py`
- Modify: `scripts/agot_map_import/models.py`
- Modify: `scripts/test_agot_map_import.py`

**Interfaces:**
- Produces: `RouteNodeRecord` 与 `RouteEdgeRecord`。
- Produces: `build_route_graph(locations, geometries, adjacency_rows, road_mask, rivers, impassable) -> RouteGraphRecord`。
- 每条边保存 `distance`, `roadLevel`, `crossing`, `allowedModes`, `baseDays`, `baseCost`, `risk`, `seasonTags`。

- [ ] **Step 1: 写失败的路线图测试**

测试陆地相邻自动连边、`adjacencies.csv` 渡口标记、海路仅连接两个港口、不可通行省份不连普通陆路、马车不能走无道路山径、船只不能走陆路，并验证所有边双向一致。

- [ ] **Step 2: 运行测试确认失败**

Run: `python3 -m unittest scripts.test_agot_map_import.RouteGraphTests -v`

Expected: FAIL，原因是 `build_route_graph` 不存在。

- [ ] **Step 3: 实现确定性旅行图**

边距离使用原始像素折线长度；道路遮罩按采样像素占比判定 `major | minor | none`；渡河增加时间与风险；海路要求两端 `is_port`；`baseDays/baseCost/risk` 使用固定公式并保留 4 位小数。输出节点与边按稳定 ID 排序，确保相同输入产生相同哈希。

- [ ] **Step 4: 验证**

Run: `python3 -m unittest scripts.test_agot_map_import -v`

Expected: 路线图约束测试全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/agot_map_import/routes.py scripts/agot_map_import/models.py scripts/test_agot_map_import.py
git commit -m "feat: 构建维斯特洛旅行图"
```

### Task 5: 地形、矢量与 DEM 瓦片构建

**Files:**
- Create: `scripts/agot_map_import/tiles.py`
- Create: `scripts/agot_map_import/dem.py`
- Modify: `scripts/test_agot_map_import.py`

**Interfaces:**
- Produces: `build_terrain_tiles(flatmap, bounds, output, zooms, tile_size=512) -> TileReport`。
- Produces: `build_vector_tiles(layers, bounds, output, zooms) -> TileReport`。
- Produces: `encode_terrain_rgb(height: np.ndarray) -> np.ndarray` 和 `build_dem_tiles(...) -> TileReport`。

- [ ] **Step 1: 写失败的瓦片测试**

测试 1024×512 fixture 在 z0 生成一个 512px WebP；PBF 解码后包含 `provinces/borders/roads/routes/locations/labels` 层；高度 0、100、1000 编码后按 MapLibre 公式 `-10000 + (R*65536+G*256+B)*0.1` 可逆，误差不超过 0.1。

- [ ] **Step 2: 运行测试确认失败**

Run: `python3 -m unittest scripts.test_agot_map_import.TileBuilderTests -v`

Expected: FAIL，原因是 `tiles.py` 不存在。

- [ ] **Step 3: 实现本地瓦片构建器**

地形使用 Lanczos 重采样和质量 88 WebP；矢量瓦片坐标 extent 固定 4096，逐 zoom 裁剪并简化；DEM 读取 16 位高度图，在源配置的最小/最大高度间映射为米后编码 Terrain-RGB。每个写入都先进入同级临时目录，完整成功后 `os.replace` 原子切换。

- [ ] **Step 4: 验证**

Run: `python3 -m unittest scripts.test_agot_map_import -v`

Expected: 所有 fixture 瓦片可解码，尺寸、图层和 DEM 数值断言 PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/agot_map_import/tiles.py scripts/agot_map_import/dem.py scripts/test_agot_map_import.py
git commit -m "feat: 生成本地地图与高程瓦片"
```

### Task 6: 导入 CLI、清单、分片和数据审计

**Files:**
- Create: `scripts/agot_map_import/writer.py`
- Create: `scripts/agot_map_import/audit.py`
- Create: `scripts/agot_map_import/cli.py`
- Create: `scripts/audit-agot-map.mjs`
- Modify: `package.json`
- Modify: `scripts/test_agot_map_import.py`

**Interfaces:**
- Produces CLI: `python3 -m scripts.agot_map_import.cli --source /mnt/c/agot/2962333032 --data-output public/data/agot-map --asset-output public/assets/agot-map`。
- Produces: `manifest.json`, `regions.json`, `location-search-index.json`, `locations/*.json`, `routes/*.json`, `political/*.json`, `reports/audit.json`。
- Produces audit CLI: `npm run check:map-data`。

- [ ] **Step 1: 写失败的清单与审计测试**

测试输出不含源绝对路径；所有地点 ID 唯一；所有路线端点和领地引用存在；普通海路两端均为港口；清单数量等于实际文件；源哈希与数据集哈希稳定；临时写入失败不覆盖上一版完整输出。

- [ ] **Step 2: 运行测试确认失败**

Run: `python3 -m unittest scripts.test_agot_map_import.MapWriterTests -v`

Expected: FAIL，原因是 `writer.py` 不存在。

- [ ] **Step 3: 实现确定性写入和双层审计**

Python 审计在发布前验证完整内存模型；Node 审计验证已生成运行时文件及路径安全。JSON 使用 UTF-8、`ensure_ascii=False`、稳定 key 和紧凑分隔符；地点按 kingdom/region 分片，路线图按 region 分片；清单只记录相对 URL 与 SHA-256。

在 `package.json` 增加：

```json
"import:agot-map": "python3 -m scripts.agot_map_import.cli --source /mnt/c/agot/2962333032 --data-output public/data/agot-map --asset-output public/assets/agot-map",
"test:agot-map-import": "python3 -m unittest scripts.test_agot_map_import -v",
"check:map-data": "node scripts/audit-agot-map.mjs"
```

- [ ] **Step 4: 运行 fixture 与一次真实导入**

Run: `npm run test:agot-map-import`

Expected: PASS。

Run: `npm run import:agot-map`

Expected: 成功生成 `public/data/agot-map/manifest.json` 与三类瓦片；报告 sourceId 为 `2962333032`，地图尺寸为 `9216×6144`，locations 大于 0。

Run: `npm run check:map-data`

Expected: PASS，且报告无绝对源路径、孤立瓦片或悬空引用。

- [ ] **Step 5: 提交生成器与可复现生成结果**

```bash
git add scripts/agot_map_import scripts/audit-agot-map.mjs scripts/test_agot_map_import.py package.json public/data/agot-map public/assets/agot-map
git commit -m "feat: 导入离线维斯特洛地图数据"
```

### Task 7: 运行时仓储、缓存和坐标适配

**Files:**
- Create: `src/features/map/repository.ts`
- Create: `src/features/map/cache.ts`
- Create: `src/features/map/mapStyle.ts`
- Create: `scripts/test-map-runtime.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `MapRepository.loadManifest()`, `searchLocations(query, limit)`, `getLocation(id)`, `loadRouteRegion(regionId)`。
- Produces: `createLocalMapStyle(manifest): StyleSpecification`，只使用本地 raster、vector、raster-dem URL。
- Produces: manifest 与地点分片的内存 Promise 去重缓存，失败项可重试。

- [ ] **Step 1: 写失败的仓储测试**

使用 stub `fetch` 验证并发 manifest 只请求一次；失败后第二次调用重新请求；搜索只加载轻量索引；本地样式无 `http://`、`https://` 和源目录；DEM 仅配置 hillshade，不配置 terrain。

- [ ] **Step 2: 运行测试确认失败**

Run: `node scripts/test-map-runtime.mjs`

Expected: FAIL，原因是 `repository.ts` 不存在。

- [ ] **Step 3: 实现仓储与本地样式**

所有 JSON 响应通过 Task 1 Zod schema；错误包装为 `MapDataError` 并带 `resource` 与 `retryable`；MapLibre source 分别命名为 `agot-terrain`、`agot-vector`、`agot-dem`，hillshade 图层在地形上方、政治填色下方。

- [ ] **Step 4: 验证并接入脚本**

在 `package.json` 增加 `"test:map-runtime": "node scripts/test-map-runtime.mjs"`。

Run: `npm run test:map-runtime && npm run build:code`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/features/map/repository.ts src/features/map/cache.ts src/features/map/mapStyle.ts scripts/test-map-runtime.mjs package.json
git commit -m "feat: 添加本地地图运行时仓储"
```

### Task 8: 左侧 MapLibre 地图抽屉和人物卷宗互斥

**Files:**
- Create: `src/features/map/MapDrawer.tsx`
- Create: `src/features/map/MapCanvas.tsx`
- Create: `src/features/map/mapUiStore.ts`
- Create: `scripts/check-map-drawer.mjs`
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `package.json`

**Interfaces:**
- Produces: `useMapUiStore`，状态为 `activeDrawer: 'map' | 'character' | null`、`selectedLocationId`、`lastViewport`。
- Produces: `openMap(locationId?)`, `openCharacter(characterId)`, `closeDrawer()`，三者保证抽屉互斥。
- Produces: `<MapDrawer />` 和 `<MapCanvas onSelectLocation>`。

- [ ] **Step 1: 写失败的 UI 结构检查**

检查左缘文字“维斯特洛地图”、`aria-label="打开维斯特洛地图"`、`MapLibre` 容器、`72vw`、`1180px`、`82vw`、移动端 `100vw`、M/Esc 键、遮罩关闭、drawer 互斥调用和无 Emoji。

- [ ] **Step 2: 运行检查确认失败**

Run: `node scripts/check-map-drawer.mjs`

Expected: FAIL，原因是 `MapDrawer.tsx` 不存在。

- [ ] **Step 3: 实现抽屉与安全错误边界**

`MapDrawer` 动态创建和销毁 MapLibre map；关闭时调用 `map.stop()` 并暂停重绘；瓦片错误只设置非阻断警告；manifest 失败显示“地图资料未能载入”“重新载入”，不得覆盖主正文。人物卷宗原局部开关改由 `mapUiStore` 管理，打开人物时关闭地图，打开地图时关闭人物。

- [ ] **Step 4: 视觉和构建验证**

Run: `npm run check:no-emoji && node scripts/check-map-drawer.mjs && npm run build:code`

Expected: PASS。手动在 1440px、1024px、390px 宽度确认抽屉尺寸、遮罩、M/Esc 和互斥行为。

- [ ] **Step 5: 提交**

```bash
git add src/features/map/MapDrawer.tsx src/features/map/MapCanvas.tsx src/features/map/mapUiStore.ts src/App.tsx src/index.css scripts/check-map-drawer.mjs package.json
git commit -m "feat: 添加左侧维斯特洛地图抽屉"
```

### Task 9: 地点搜索、地图模式、聚合和详情

**Files:**
- Create: `src/features/map/MapToolbar.tsx`
- Create: `src/features/map/LocationSearch.tsx`
- Create: `src/features/map/LocationDetails.tsx`
- Create: `src/features/map/mapLayers.ts`
- Create: `src/features/map/locationViewModel.ts`
- Create: `scripts/test-map-location-view.mjs`
- Modify: `src/features/map/MapDrawer.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `MapMode = 'terrain' | 'political' | 'characters' | 'travel' | 'assets'`。
- Produces: `buildLocationView(locationId, worldState, knowledge): LocationViewModel`。
- `LocationDetails` 通过现有人物导航接口打开公开统治者卷宗。

- [ ] **Step 1: 写失败的地点视图测试**

验证搜索中文名、英文名和 title ID；importance 决定低缩放标签；近景显示全部地点；详情包含层级、地形、道路、港口、公开领主、已知人物/资产/事件与路线估算，但不出现宣战、征服和建设按钮。

- [ ] **Step 2: 运行测试确认失败**

Run: `node scripts/test-map-location-view.mjs`

Expected: FAIL，原因是 `locationViewModel.ts` 不存在。

- [ ] **Step 3: 实现搜索、模式和详情**

搜索输入防抖 120ms，最多显示 20 项；MapLibre 使用 source clustering 聚合地点；地形/政治默认开启，人物/旅行/资产按模式切换；图标优先 `/assets/agot-map/icons/`，缺失时用 Lucide `Castle`, `MapPin`, `Ship`, `Landmark`，不得用字符图标。

- [ ] **Step 4: 验证**

Run: `npm run test:map-runtime && node scripts/test-map-location-view.mjs && npm run build:code`

Expected: PASS。手动确认搜索跳转、聚合展开、地点详情和人物卷宗跳转。

- [ ] **Step 5: 提交**

```bash
git add src/features/map/MapToolbar.tsx src/features/map/LocationSearch.tsx src/features/map/LocationDetails.tsx src/features/map/mapLayers.ts src/features/map/locationViewModel.ts src/features/map/MapDrawer.tsx src/index.css scripts/test-map-location-view.mjs
git commit -m "feat: 完成地图地点浏览与详情"
```

### Task 10: 稳定 locationId 接入人物、NPC、物品、车辆和存档

**Files:**
- Modify: `src/types/game.ts`
- Modify: `src/store/useGameStore.ts`
- Modify: `src/features/items/types.ts`
- Modify: `src/features/items/saveVersion.ts`
- Modify: `src/features/characters/characterCommands.ts`
- Modify: `src/features/characters/characterCommandValidator.ts`
- Modify: `src/services/stateReducer.ts`
- Modify: `src/services/turnNarration.ts`
- Create: `src/features/map/locationResolver.ts`
- Create: `scripts/test-location-authority.mjs`

**Interfaces:**
- Produces: `WorldLocationRef { locationId: string; sceneLocation?: string }`。
- Produces: `resolveLocationLabel(ref, repository) -> Promise<string>`，显示“临冬城 · 神木林”。
- `MOVE` 命令 payload 改为 `{ characterId, locationId, sceneLocation? }`，拒绝只有自由文本目的地。

- [ ] **Step 1: 写失败的权威地点测试**

测试玩家、NPC、据点、车辆、物品 custody 和世界历史都保存 `locationId`；正文可附加 `sceneLocation`；未知 ID 被 validator/reducer 拒绝；旧版本 6 存档被明确拒绝而不是迁移；教育、装备和人物关系状态不因版本提升丢失。

- [ ] **Step 2: 运行测试确认失败**

Run: `node scripts/test-location-authority.mjs`

Expected: FAIL，因为现有类型仍使用自由文本地点或版本 6。

- [ ] **Step 3: 实现 locationId 权威状态并提升版本**

将 `ITEM_SAVE_FORMAT_VERSION` 设为 `7`；新局从选中现成人物的地图地点初始化，无法解析的角色必须使用明确的 `b_unknown_westeros` 兜底地点并在 UI 标为“所在地未查明”，不得把文化或头衔文本当地点。状态 reducer 在提交前通过地图地点索引验证引用。

- [ ] **Step 4: 验证所有受影响测试**

Run: `node scripts/test-location-authority.mjs && npm run test:character-commands && npm run test:item-save-version && npm run test:state-reducer && npm run test:world-history`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/types/game.ts src/store/useGameStore.ts src/features/items/types.ts src/features/items/saveVersion.ts src/features/characters/characterCommands.ts src/features/characters/characterCommandValidator.ts src/services/stateReducer.ts src/services/turnNarration.ts src/features/map/locationResolver.ts scripts/test-location-authority.mjs
git commit -m "feat: 统一世界地点权威状态"
```

### Task 11: 三种路线策略与 Web Worker

**Files:**
- Create: `src/features/map/routing/costs.ts`
- Create: `src/features/map/routing/pathfinder.ts`
- Create: `src/features/map/routing/routeWorker.ts`
- Create: `src/features/map/routing/routeClient.ts`
- Create: `scripts/test-map-routing.mjs`

**Interfaces:**
- Produces: `RouteRequest { from, to, preference, travelMode, via, season }`。
- Produces: `RoutePlan { id, legs, totalDays, totalCost, totalRisk, graphHash }`。
- Produces: `findRoute(graph, request): RoutePlan | RouteFailure`；`RouteClient.plan(request): Promise<RoutePlan>`。

- [ ] **Step 1: 写失败的路径测试**

构造同一图中快但危险、慢但安全、便宜但耗时三条路径，分别断言三种偏好；断言途经点按顺序；步行/骑马/马车/船过滤非法边；无路返回带中文原因的 `RouteFailure`；相同输入路线 ID 稳定。

- [ ] **Step 2: 运行测试确认失败**

Run: `node scripts/test-map-routing.mjs`

Expected: FAIL，原因是 `pathfinder.ts` 不存在。

- [ ] **Step 3: 实现 A* 与 Worker 协议**

最快成本为 days，最安全为 `days*0.15+risk*0.85`，最省钱为 `days*0.1+cost*0.9`，每项先按图内最大值归一化；季节标签只修改边成本，不修改几何；Worker 按 region 懒加载分片，返回请求 ID，client 支持取消过期请求。

- [ ] **Step 4: 验证**

Run: `node scripts/test-map-routing.mjs && npm run build:code`

Expected: PASS，且 Vite 产物包含独立 route worker chunk。

- [ ] **Step 5: 提交**

```bash
git add src/features/map/routing scripts/test-map-routing.mjs
git commit -m "feat: 添加地图路线规划器"
```

### Task 12: ActiveJourney、旅行命令与统一回合原子结算

**Files:**
- Create: `src/features/map/travel/types.ts`
- Create: `src/features/map/travel/journeyReducer.ts`
- Create: `src/features/map/travel/travelCommands.ts`
- Modify: `src/types/game.ts`
- Modify: `src/services/turnResolution.ts`
- Modify: `src/services/stateReducer.ts`
- Modify: `src/features/world/worldHistory.ts`
- Create: `scripts/test-map-travel.mjs`

**Interfaces:**
- Produces: `ActiveJourney { routePlan, currentLeg, progressDays, status, companions, vehicleIds, startedAt, interruptedBy? }`。
- Produces命令: `PLAN_TRAVEL`, `START_TRAVEL`, `PAUSE_TRAVEL`, `RESUME_TRAVEL`, `REROUTE_TRAVEL`, `RETURN_TRAVEL`, `ADVANCE_TRAVEL`, `CANCEL_PLANNED_TRAVEL`。
- Produces: `advanceJourney(world, elapsedDays): AtomicWorldPatch`。

- [ ] **Step 1: 写失败的旅行结算测试**

测试同地点内部移动在下一次成功对话后更新 `sceneLocation`；短途推进日期后到达；长途分多回合；暂停不推进；改道保留当前实际位置；返回以当前节点为起点；事件可中断；失败对话不结算待移动。抵达时人物、同行者、车辆和车内物品一起移动，据点大件物品不移动，且只写一条原子世界历史记录。

- [ ] **Step 2: 运行测试确认失败**

Run: `node scripts/test-map-travel.mjs`

Expected: FAIL，原因是 `journeyReducer.ts` 不存在。

- [ ] **Step 3: 实现纯 reducer 和统一回合接入**

`advanceJourney` 先计算完整 patch，再一次性验证日期单调、locationId 存在、车辆 custody 和物品 custody 一致，最后交给现有 state reducer 提交；任何验证失败均不部分更新。普通 `ADVANCE_TRAVEL` 不创建骰子请求，不确定障碍事件继续调用现有 D20 动作检定。

- [ ] **Step 4: 验证**

Run: `node scripts/test-map-travel.mjs && npm run test:unified-turn && npm run test:item-state-commands && npm run test:world-history`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/features/map/travel src/types/game.ts src/services/turnResolution.ts src/services/stateReducer.ts src/features/world/worldHistory.ts scripts/test-map-travel.mjs
git commit -m "feat: 接入多回合旅行与统一结算"
```

### Task 13: 路线规划与旅程进度 UI

**Files:**
- Create: `src/features/map/TravelPlanner.tsx`
- Create: `src/features/map/JourneyPanel.tsx`
- Modify: `src/features/map/LocationDetails.tsx`
- Modify: `src/features/map/MapDrawer.tsx`
- Modify: `src/features/map/mapLayers.ts`
- Create: `scripts/check-map-travel-ui.mjs`
- Modify: `src/index.css`

**Interfaces:**
- `TravelPlanner` 消费 `RouteClient`，提交前只产生待确认 RoutePlan。
- `JourneyPanel` 消费 `ActiveJourney` 并发出 Task 12 的暂停、继续、改道、返回和取消计划命令。

- [ ] **Step 1: 写失败的 UI 检查**

检查“最快 / 最安全 / 最省钱”、步行/骑马/马车/船只、途经点、时间/费用/风险预览、明确确认按钮；活动旅程显示进度、下一地点、预计抵达和暂停/改道/返回；原地点按钮在计划待生效时变为“取消”，不得另加全局待处理横条。

- [ ] **Step 2: 运行检查确认失败**

Run: `node scripts/check-map-travel-ui.mjs`

Expected: FAIL，原因是 `TravelPlanner.tsx` 不存在。

- [ ] **Step 3: 实现底部面板和路线图层**

路线规划结果用 MapLibre GeoJSON 临时 source 显示；计划与旅程状态分别使用虚线和实线；手机端地点详情和旅程面板堆叠为内部底部抽屉。所有按钮使用游戏图标或 Lucide，不使用 Emoji。

- [ ] **Step 4: 验证**

Run: `node scripts/check-map-travel-ui.mjs && npm run check:no-emoji && npm run build:code`

Expected: PASS。手动规划三种路线并验证取消、暂停、改道和返回按钮。

- [ ] **Step 5: 提交**

```bash
git add src/features/map/TravelPlanner.tsx src/features/map/JourneyPanel.tsx src/features/map/LocationDetails.tsx src/features/map/MapDrawer.tsx src/features/map/mapLayers.ts src/index.css scripts/check-map-travel-ui.mjs
git commit -m "feat: 完成地图旅行交互"
```

### Task 14: 情报过滤和地图防泄漏

**Files:**
- Create: `src/features/map/intelligence.ts`
- Modify: `src/features/map/locationViewModel.ts`
- Modify: `src/features/map/mapLayers.ts`
- Create: `scripts/test-map-intelligence.mjs`

**Interfaces:**
- Produces: `MapIntelRecord<T> { level, learnedAt?, source?, value? }`。
- Produces: `filterMapIntelligence(subject, knowledge, now, debug): VisibleMapSubject | null`。
- `unknown` 返回 null；`rumored` 移除精确数量与秘密；`stale` 保留最后日期并标记过时；debug 明确开启时才透传。

- [ ] **Step 1: 写失败的防泄漏测试**

分别测试人物精确位置、驻军数量、隐藏资产、封路、秘密身份、未公开死亡和隐藏事件；基础海岸、道路、七国和著名城堡在 unknown 下仍可见；正常模式序列化结果不含被过滤字段名和值。

- [ ] **Step 2: 运行测试确认失败**

Run: `node scripts/test-map-intelligence.mjs`

Expected: FAIL，原因是 `intelligence.ts` 不存在。

- [ ] **Step 3: 实现默认拒绝的情报投影**

每类动态主题必须注册公开字段白名单；未注册类型一律返回 null；rumored 只保留模糊地点 regionId 和定性描述；stale 显示最后获知日期但不自动读取当前世界真值；debug flag 从显式开发设置读取，不能由 URL 参数开启。

- [ ] **Step 4: 验证**

Run: `node scripts/test-map-intelligence.mjs && node scripts/test-map-location-view.mjs && npm run build:code`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/features/map/intelligence.ts src/features/map/locationViewModel.ts src/features/map/mapLayers.ts scripts/test-map-intelligence.mjs
git commit -m "feat: 添加地图情报可见性过滤"
```

### Task 15: 动态政治投影与历史日期重建

**Files:**
- Create: `src/features/map/politicalProjection.ts`
- Modify: `src/features/map/mapLayers.ts`
- Modify: `src/features/world/worldHistory.ts`
- Create: `scripts/test-map-political-projection.mjs`

**Interfaces:**
- Produces: `projectPoliticalState(staticTitles, characters, history, atDate): PoliticalFeatureState[]`。
- 消费现有 `GRANT_TITLE`、`REVOKE_TITLE`、死亡、继承和战争结果事件；不保存第二份当前领主状态。
- Produces: `changedTitleIds(previous, next): string[]`，供 MapLibre `setFeatureState` 局部刷新。

- [ ] **Step 1: 写失败的政治投影测试**

以 298 年初始持有人为基线，依次应用授予、撤销、死亡继承和正式战争结果；验证当前日期颜色和持有人改变、历史日期仍能重建旧状态、未受影响 title 不进入 changed IDs、秘密事件不绕过情报过滤。

- [ ] **Step 2: 运行测试确认失败**

Run: `node scripts/test-map-political-projection.mjs`

Expected: FAIL，原因是 `politicalProjection.ts` 不存在。

- [ ] **Step 3: 实现纯历史折叠投影**

按世界日期和稳定事件 ID 排序 fold；家族颜色与家徽从现有本地人物/家族数据解析，缺失时使用确定性低饱和颜色；投影结果只驻留内存，存档不序列化政治副本。

- [ ] **Step 4: 验证**

Run: `node scripts/test-map-political-projection.mjs && npm run test:world-history-projection && npm run build:code`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/features/map/politicalProjection.ts src/features/map/mapLayers.ts src/features/world/worldHistory.ts scripts/test-map-political-projection.mjs
git commit -m "feat: 投影动态维斯特洛政治地图"
```

### Task 16: 性能、移动端、完整审计与验收

**Files:**
- Create: `scripts/check-map-runtime-boundaries.mjs`
- Create: `scripts/test-map-integration.mjs`
- Modify: `package.json`
- Modify: `src/features/map/MapCanvas.tsx`
- Modify: `src/features/map/MapDrawer.tsx`
- Modify: `src/index.css`
- Modify: `README.md`

**Interfaces:**
- Produces完整命令: `npm run verify:map`。
- 将 `test:agot-map-import`、地图运行时测试、UI 检查和 `check:map-data` 接入 `npm run verify`，但不接入 `import:agot-map`。

- [ ] **Step 1: 写失败的集成与边界测试**

验证抽屉关闭后停止绘制；地图故障时正文和人物卷宗仍可用；地点搜索不读取所有详情分片；路线在 worker 中运行；运行时代码无 `2962333032`、Workshop、Steam、绝对源路径、网络 URL 和 Emoji；无效地点/路线存档拒绝提交；移动端详情为底部抽屉。

- [ ] **Step 2: 运行测试确认失败**

Run: `node scripts/check-map-runtime-boundaries.mjs && node scripts/test-map-integration.mjs`

Expected: 至少一项 FAIL，直到所有性能和故障隔离约束实现。

- [ ] **Step 3: 完成性能与错误恢复**

MapLibre 只保持当前视野需要的 source；人物和资产查询用视野 bbox；地点聚合按 zoom；地图 error boundary 仅包裹地图子树；加载失败提供局部重试；README 记录 `pip install -r scripts/requirements-map.txt`、fixture 测试、真实导入、数据审计和运行时禁止项。

在 `package.json` 增加：

```json
"verify:map": "npm run test:agot-map-import && npm run test:map-schema && npm run test:map-runtime && node scripts/test-map-location-view.mjs && node scripts/test-map-routing.mjs && node scripts/test-map-travel.mjs && node scripts/test-map-intelligence.mjs && node scripts/test-map-political-projection.mjs && node scripts/test-map-integration.mjs && node scripts/check-map-drawer.mjs && node scripts/check-map-travel-ui.mjs && node scripts/check-map-runtime-boundaries.mjs && npm run check:map-data"
```

将 `npm run verify:map` 加入完整 `verify`，不要加入 `verify:quick`；绝不把 `npm run import:agot-map` 加入任一 verify。

- [ ] **Step 4: 执行最终验证**

Run: `npm run verify:map`

Expected: PASS。

Run: `npm run verify`

Expected: PASS，且日志中没有执行真实地图导入。

Run: `npm run build`

Expected: PASS，MapLibre worker 与本地瓦片 URL 正确打包。

手动验收：打开/关闭/互斥、搜索全部命名地点、五种图层模式、地点详情、人物跳转、最快/安全/省钱与途经点、短途/长途/暂停/改道/返回、车辆和物品同步、情报过滤、政治变化、移动端和地图故障隔离。

- [ ] **Step 5: 只提交本任务文件并确认工作区边界**

```bash
git status --short
git add package.json package-lock.json README.md scripts/agot_map_import scripts/test_agot_map_import.py scripts/audit-agot-map.mjs scripts/test-map-*.mjs scripts/check-map-*.mjs src/features/map src/types/game.ts src/store/useGameStore.ts src/services src/features/world/worldHistory.ts src/features/items/types.ts src/features/items/saveVersion.ts src/features/characters/characterCommands.ts src/features/characters/characterCommandValidator.ts public/data/agot-map public/assets/agot-map src/App.tsx src/index.css
git diff --cached --check
git commit -m "feat: 完成 AGOT 混合地图与旅行系统"
```

提交前逐项确认暂存区不含 `scripts/character_portrait_import/`、头像相关组件和 `public/assets/.character-portraits-*`。
