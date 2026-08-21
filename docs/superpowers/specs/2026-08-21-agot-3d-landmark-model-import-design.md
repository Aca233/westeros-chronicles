# AGOT 三维地标模型移植设计

**日期：** 2026-08-21
**状态：** 已确认
**项目根目录：** `/mnt/c/AGOT`

## 1. 目标

把 AGOT 模组中的代表性特殊建筑离线转换为浏览器可加载的三维地标，并嵌入现有 MapLibre 地图。三维模型只负责近景视觉展示；地点 ID、选择、详情、路线、人物位置和世界状态继续由现有地图数据与二维命中层负责。

本设计必须满足：

1. 运行时只读取项目内生成的 GLB、贴图和地标清单，不读取 Workshop、CK3 或 `/mnt/c/AGOT/2962333032`。
2. 三维地标与现有 Terrain-RGB 地形、五级政治地图、地点系统和旅行系统共享同一地图坐标协议。
3. MapLibre 与 Three.js 共用同一 WebGL 画布和上下文，不叠加第二张 canvas。
4. 模型按缩放、视野和设备能力懒加载；任何模型失败都只回退到现有二维地点表达，不能导致整张地图失败。
5. 第一批只移植明确白名单中的主要地标，不批量发布全部 3471 个 `.mesh`。

## 2. 已确认的产品决策

- 首批范围是主要地标，不覆盖所有普通城堡、城市、树林、动物或环境物件。
- 三维模型首版只作视觉展示。
- 点击、地点选择、详情打开和旅行目标继续使用现有二维地点命中层。
- 不为模型增加独立射线拾取，不创建第二套地点交互状态。
- 采用 MapLibre `CustomLayerInterface` 与 Three.js 共享 WebGL 上下文。
- 原始 Paradox `.mesh`、`.asset` 和 DDS 仅作为开发期离线输入。
- 绝境长城是多段线性组合工程，不进入首批十二地标；首批稳定后单独设计。

## 3. 资产盘点与约束

AGOT 源目录当前包含约：

- 3471 个 `.mesh`；
- 1732 个 `.asset`；
- 7461 张 DDS；
- 1084 个 `.anim`。

仅 `gfx/models/buildings/special` 就包含约 131 个网格、257 MiB 原始网格和 1.26 GiB DDS，不能整体进入 Web 项目。

Paradox 网格为 `pdxasset` 二进制格式，不能直接被 MapLibre 或 Three.js 读取。转换探针已验证 `ross-g/io_pdx_mesh` 可在无 Blender UI 的 Python 环境中把静态建筑网格解析为位置、法线、切线、UV、三角形索引和材质引用。开发工具固定到提交：

`2249e35f80a1cc04ba4c2b8e4c650f36b18085db`

该工具只作为独立开发期转换命令使用，并保留其 GPL-3.0 来源与许可证说明；它不进入浏览器运行时包。模型及贴图的再分发权限必须由项目使用者自行确认，本设计不把技术可转换性视为公开再分发授权。

## 4. 首批地标

| 地标 | locationId | 原始模型方向 |
|---|---|---|
| 临冬城 | `b_winterfell` | `buildings/special/Winterfell` |
| 君临·红堡 | `b_the_red_keep` | `buildings/special/Kings Landing/Red Keep` |
| 龙石岛 | `b_dragonstone` | `buildings/special/Dragonstone` |
| 凯岩城 | `b_casterly_rock` | `buildings/special/Casterly Rock` |
| 高庭 | `b_highgarden` | `buildings/special/Highgarden` |
| 阳戟城 | `b_sunspear` | `buildings/special/Sunspear` |
| 风息堡 | `b_storms_end` | `buildings/special/Storms End` |
| 鹰巢城 | `b_the_eyrie` | `buildings/special/The Eyrie` |
| 派克城 | `b_pyke` | `buildings/special/Pyke` |
| 旧镇 | `b_oldtown` | `buildings/special/Oldtown` |
| 奔流城 | `b_riverrun` | `buildings/special/Riverrun` |
| 赫伦堡 | `b_harrenhal` | `buildings/special/Harrenhal/Harrenhal Redo` |

转换实现顺序先以临冬城、龙石岛和鹰巢城验证多材质、海岛与山地贴合，再扩展到其余九处。赫伦堡首版固定使用一个明确的毁坏状态，不根据游戏日期动态切换修复状态。

## 5. 离线转换架构

新增独立包：

```text
scripts/agot_model_import/
  cli.py
  catalog.py
  asset_parser.py
  mesh_adapter.py
  gltf_writer.py
  textures.py
  locators.py
  audit.py
  landmark_models.json
```

转换流程：

1. 读取白名单配置，拒绝任意目录扫描结果直接进入输出。
2. 校验 AGOT 源身份、模型路径、`.asset`、`.mesh` 和所有必需 DDS。
3. 调用固定提交的 `io_pdx_mesh` 命令行工具，把 `.mesh` 转成临时 JSON；转换器不复制其解析实现。
4. 解析 `.asset` 中的网格名、源文件、资产级 scale、子网格材质和 diffuse/normal/properties 贴图。
5. 将 PDX 静态网格转换成 glTF 2.0：位置、法线、切线、UV0 和三角形索引必须保留；首版拒绝骨骼、蒙皮和动画网格。
6. DDS diffuse 转为 sRGB WebP；normal 以线性纹理处理；properties 按经过测试的 CK3 通道映射生成 metallic-roughness/occlusion 数据。无法确认通道语义时必须使用显式降级材质，不能猜测后静默发布。
7. 对网格执行顶点去重、无效三角形清理和边界重算；生成完整 LOD 与低模 LOD。
8. 生成 GLB、地标清单、来源哈希、输出哈希和审计报告。
9. 使用同级临时文件与原子替换发布，失败保留上一次完整输出。

`io_pdx_mesh`、真实 AGOT 模型转换和网格压缩不加入普通 `npm run verify`；普通验证使用小型中间 JSON/GLB fixture，真实结果由独立模型审计命令验证。

## 6. 坐标、旋转与贴地

### 6.1 原始定位器

`gfx/map/map_object_data/special_building_locators.txt` 的实例 ID 与省份 ID 对应。转换器通过地标 `locationId → provinceId → locator id` 恢复：

- `position { x y z }`；
- 四元数 `rotation { x y z w }`；
- `scale { x y z }`。

例如临冬城使用省份 `77` 的原始定位器，而不是仅使用地点质心猜测建筑位置。

### 6.2 地图坐标转换

原始地图采用左上角图像 Y，而 locator 使用地图 Z：

```text
mapX = locator.x
mapY = mapHeight - locator.z
```

运行时继续使用现有 `mapPixelToLngLat`/Mercator 协议。GLB 保持 Y-up；运行时模型矩阵负责把：

- 模型 X 映射到地图 X；
- 模型 Z 映射到地图 Y；
- 模型 Y 映射到海拔轴；
- 原始四元数与 asset scale、locator scale 依确定顺序组合。

### 6.3 地形高度

转换器从同一 AGOT 高度图和现有 DEM 高程公式采样模型基座高度，并写入地标清单。运行时不得依赖异步 `queryTerrainElevation` 才能确定基本位置。locator 的非零 Y 作为相对高度偏移保留。

每个地标允许在白名单中提供经过审计的 `positionOffset`、`rotationOffset` 和 `scaleMultiplier`，但必须记录原因；禁止在运行时代码中散落地点特例。

## 7. 生成物与数据模型

```text
public/data/agot-map/models/
  landmarks.json
  reports/audit.json

public/assets/agot-map/models/
  winterfell/lod0.glb
  winterfell/lod1.glb
  ...
```

模型使用独立 schema，不提升现有地图 schemaVersion 4，也不使正文、路线和二维地图依赖模型文件。

地标清单核心结构：

```ts
interface LandmarkModelManifest {
  schemaVersion: 1
  sourceId: '2962333032'
  converter: { name: 'io_pdx_mesh'; commit: string }
  assetHash: string
  landmarks: LandmarkModelRecord[]
}

interface LandmarkModelRecord {
  id: string
  locationId: string
  provinceId: number
  name: string
  transform: {
    mapX: number
    mapY: number
    elevationMeters: number
    rotation: [number, number, number, number]
    scale: [number, number, number]
  }
  lods: Array<{
    minZoom: number
    path: string
    bytes: number
    triangleCount: number
    sha256: string
  }>
  bounds: { radiusMapPixels: number; heightMeters: number }
}
```

所有 URL 必须是项目内绝对 URL；清单不得出现源目录绝对路径。

## 8. 运行时渲染架构

新增模块建议：

```text
src/features/map/landmarks/
  landmarkSchemas.ts
  landmarkRepository.ts
  landmarkVisibility.ts
  landmarkCustomLayer.ts
  landmarkTransform.ts
  landmarkResourceCache.ts
```

### 8.1 单画布自定义层

- 使用 Three.js `WebGLRenderer`，传入 MapLibre 已有 canvas 与 WebGL context。
- 自定义层使用 `renderingMode: '3d'`，共享 MapLibre 相机和深度缓冲。
- 禁止创建第二个 canvas、第二个 `requestAnimationFrame` 循环或独立相机控制器。
- 每帧渲染前恢复/同步 Three.js 状态，渲染后把 GL 状态交还 MapLibre。
- 自定义层插入地形之后、二维地点符号和交互层之前，使现有地点图标始终保持可读和可点击。
- 首版使用方向光与环境光，不启用实时阴影；材质 AO 和 normal map 承担主要立体细节。

### 8.2 可见性与加载

- `zoom < 4.60`：不请求模型资源。
- `4.60 ≤ zoom < 5.35`：只加载 LOD1。
- `zoom ≥ 5.35`：标准设备加载 LOD0；低能力设备继续使用 LOD1。
- 只加载当前视野与一个模型半径缓冲区相交的地标。
- 同时网络/解码任务最多 2 个；任务离开需求集合后可取消。
- 同时保留的可见模型设上限；低能力设备最多 2 个，标准设备最多 6 个。
- 资源切换由 `moveend`、`zoomend` 和模型清单就绪触发，禁止在连续 `zoom` 事件中反复请求或重建场景。
- 离开缓存预算的几何体、材质和纹理必须显式 `dispose()`。

### 8.3 能力与回退

满足 WebGL2、GLB 解码和共享上下文条件时才启用三维层。以下任一情况发生时保留二维地图：

- 浏览器或 GPU 能力不足；
- 地标清单载入失败；
- 单个 GLB/贴图载入或解码失败；
- 自定义层创建失败；
- WebGL context 丢失后无法恢复。

单模型失败只标记该地标不可用并发出一次合并警告，不设置地图初始化失败，不关闭 DEM terrain，也不影响其余模型。

## 9. 交互和世界状态边界

- 模型没有权威状态，不保存到游戏存档。
- 模型不参与地点搜索、伯爵领选择、路线计算、人物移动或资产投影。
- 点击仍命中现有 MapLibre 地点/伯爵领图层；模型不进行 raycast。
- 三维层不得遮断现有二维命中层事件。
- 首版模型始终表现静态建筑外观，不根据持有人、战争、占领、日期或建筑等级改变。
- 赫伦堡毁坏状态等选择写在白名单配置中，不由运行时推测。

## 10. 性能与资产预算

首批发布必须满足：

- 地图初始 JS 不同步打包 GLB 字节；Three.js 与地标运行时代码随地图分包按需加载。
- 十二处地标全部 LOD 的压缩资产总量不超过 120 MiB。
- 单个 LOD0 不超过 20 MiB；单个 LOD1 不超过 6 MiB。
- diffuse/normal/properties 派生贴图单边不超过 2048；LOD1 使用不超过 1024 的贴图。
- LOD1 三角形数目标为对应 LOD0 的 25%–40%，轮廓、塔楼和城墙必须保持可辨识。
- 任一模型超预算时必须先减面、拆分或降贴图，不得直接提高全局预算。
- 资源缓存必须有显式字节预算和 LRU 淘汰，不以“地标只有十二个”为由永久驻留全部 GPU 资源。

## 11. 错误处理与审计

### 11.1 导入期拒绝条件

- 白名单地点不存在或 provinceId 不一致；
- locator 缺失、重复或超出地图范围；
- `.asset` 引用的 mesh/贴图缺失；
- 网格没有位置、索引或 UV；
- 索引越界、NaN/Infinity、退化比例超限；
- 动画/蒙皮资产进入首批静态管线；
- GLB 无法重新解码；
- 输出路径逃逸、绝对源路径泄露；
- 单模型或总预算超限；
- 输出哈希与清单不一致。

### 11.2 运行时隔离

模型仓储与现有 `MapRepository` 分离缓存和错误状态。模型错误不得复用“地图资料未能载入”的全局失败提示，避免一个装饰性地标阻断地图、正文或人物卷宗。

## 12. 测试与验证

### 12.1 转换器测试

- `.asset` 多子网格和贴图映射；
- PDX 中间 JSON 到 glTF 顶点、索引、法线、切线和 UV；
- PDX→glTF 轴向、四元数和 scale 组合；
- provinceId 与 locator 的一一对应；
- map Z 到 mapY 的翻转；
- 高度图采样与现有 DEM 公式一致；
- DDS 色彩空间和 properties 通道映射；
- 无效/蒙皮网格拒绝；
- 原子发布和确定性哈希。

普通测试使用小型 fixture，不包含 AGOT 原始模型。

### 12.2 运行时测试

- 自定义层复用 MapLibre canvas/context，且不创建第二 canvas；
- 缩放阈值和 LOD 选择；
- 视野过滤、并发上限、取消和 LRU 释放；
- 加载失败只回退单个地标；
- `remove` 生命周期释放全部 Three.js 资源；
- 连续 zoom 不触发网络加载或场景重建；
- 二维地点点击仍是唯一交互入口；
- 地图抽屉关闭后 MapLibre 和三维资源均销毁。

### 12.3 真实生成物审计

独立命令验证十二处地标、GLB 头与 JSON chunk、三角形数、包围盒、贴图尺寸、路径、哈希和总体积。真实转换不进入 `npm run verify`，但生成后的轻量审计可以进入 `verify:map`。

当前用户要求不调用浏览器，因此实施阶段的自动验证不得启动浏览器。最终外观仍需要用户在实际地图中检查比例、朝向、贴地和材质；自动审计不能替代视觉验收。

## 13. 实施阶段

1. 建立转换器 fixture、白名单 schema 和 locator 解析。
2. 完成临冬城单模型 PDX→GLB 转换与审计。
3. 增加龙石岛、鹰巢城，验证海岛/山地位置与多材质。
4. 建立 Three.js MapLibre 单画布自定义层和失败回退。
5. 完成 LOD、视野加载、缓存与资源释放。
6. 扩展到剩余九处地标并压到总体积预算内。
7. 更新运行时边界检查：从“禁止 Three.js”改为“只允许共享 MapLibre canvas/context，禁止第二 canvas 和独立渲染循环”。
8. 执行转换器测试、`verify:map`、类型检查、Windows 构建、真实资产审计和人工外观验收。

## 14. 验收标准

- 十二处白名单地标在近景按正确位置、旋转和比例显示。
- 模型基座与 DEM 地形一致，不明显漂浮或埋入。
- 远景不会请求 GLB；近景只请求视野内所需 LOD。
- 地图继续只有一个 canvas，二维地点点击、详情和旅行行为不变。
- 任一模型损坏时地图、正文和人物卷宗仍可正常使用。
- 运行时不包含模组绝对路径或网络模型 URL。
- 压缩资产满足 120 MiB 总预算与单模型预算。
- 地图关闭后没有残留加载任务、Three.js 场景或 GPU 资源。
- 没有提交或推送，除非用户之后明确要求。
