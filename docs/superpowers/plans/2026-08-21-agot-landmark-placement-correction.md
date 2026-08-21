# AGOT 地标建筑尺寸与位置修复实施计划

**日期：** 2026-08-21
**目标：** 修复三维地标在非正方形 AGOT 地图上的南北向拉伸、沿海越界及阳戟城异常锚点，同时保持现有 GLB、MapLibre/Three.js 共用渲染架构和二维交互权威不变。

## 约束

- 不提交、不推送。
- 不启动浏览器；最终视觉验收由用户截图完成。
- 不 reset、clean 或回退工作区中的其他改动。
- 不重新转换或修改 24 个 GLB 文件。
- 不新增 canvas、WebGL context、RAF、控制器或 raycast。
- 不对阳戟城以外的 11 个地标做无依据的逐个视觉微调。

## 文件职责与改动范围

### 修改

- `scripts/test-map-landmark-transform.mjs`
  - 使用非正方形裁剪范围验证东西、南北、垂直三个轴分别换算。
  - 保留坐标系手性与“只应用一次模型 scale”的回归断言。
- `src/features/map/landmarks/landmarkTransform.ts`
  - 水平 X 轴按裁剪宽度换算。
  - 水平南北轴按裁剪高度换算。
  - 垂直轴按锚点的 Mercator 米制单位乘地形视觉倍率换算。
- `scripts/agot_model_import/landmark_models.json`
  - 仅为阳戟城添加有原因记录的 position/scale correction。
- `scripts/test_agot_model_import.py`
  - 锁定阳戟城 correction 的解析、坐标方向和倍率行为。
  - 增加地标锚点/陆海覆盖审计的回归测试。
- `scripts/agot_model_import/audit.py`（或新增同目录单一职责模块）
  - 增加全地标锚点省份一致性与模型足迹陆地覆盖检查。
- `scripts/audit-agot-models.mjs`（仅在现有 Node 审计需要读取新字段时）
  - 校验审计报告中的 placement 结果与 correction reason。
- `public/data/agot-map/models/landmarks.json`
  - 只刷新由 catalog/locator 产生的 transform、bounds 和 assetHash；LOD 路径及 GLB 哈希保持不变。
- `public/data/agot-map/models/reports/audit.json`
  - 同步 assetHash、阳戟城 correction reason 与 placement audit 结果。

### 不修改

- `public/assets/agot-map/models/**/*.glb`
- 地图语义瓦片、DEM、地形光照及人物/卷宗系统。

## Task 1：用测试复现非正方形地图轴比例错误

1. 在 `scripts/test-map-landmark-transform.mjs` 增加 `100 × 200` bounds 用例。
2. 构造单位模型轴：
   - 本地 X=1 应产生 `scaleX / 100` 的 Mercator X 位移；
   - 本地 Z=1 应产生 `scaleZ / 200` 的 Mercator Y 位移，方向向北；
   - 本地 Y=1 应产生 `scaleY × meterInMercatorCoordinateUnits × terrainScale` 的 Mercator Z 位移。
3. 运行 `npm run test:map-landmark-transform`，确认旧实现至少在南北或垂直断言上失败。

## Task 2：修复运行时三轴矩阵

1. 在 `landmarkTransform.ts` 中分别计算：
   - `mapWidth`；
   - `mapHeight`；
   - `metersToMercator = anchor.meterInMercatorCoordinateUnits() * terrainScale`。
2. 保持现有 `MODEL_TO_MAP_BASIS` 与 quaternion 顺序，避免镜像和旋转语义变化。
3. 使用显式非均匀单位换算矩阵，使经旋转后的地图轴分别采用：
   - 东西：`1 / mapWidth`；
   - 垂直：`metersToMercator`；
   - 南北：`1 / mapHeight`。
4. 模型记录的 `[x, y, z]` scale 仍只应用一次。
5. 运行 transform 测试，确认新用例和旧手性用例全部通过。

## Task 3：给阳戟城添加明确数据修正

1. 在 `landmark_models.json` 的 `sunspear` 项加入：
   - `positionOffset: [8, 0, 9]`，对应地图 `(+8, -9)`；原候选 `(+4, -12)` 经精确省份图审计后锚点仍落在 4939，故改用最近的 4937 内合格点；
   - `scaleMultiplier: [0.55, 0.55, 0.55]`；
   - reason：AGOT 阳戟城 locator 落在影子城省份且原始占地跨越海域。
2. 在 Python 测试中验证：
   - correction 被 catalog 正确读取；
   - mapY 因 source Z 正偏移而减小 12；
   - 三轴 scale 均乘 0.55；
   - 其他地标不会因本次修复自动获得 correction。
3. 运行 `npm run test:agot-model-import`。

## Task 4：刷新清单而不重新转换 GLB

1. 复用 importer 中 catalog、locator、heightmap、bounds 与 stable hash 逻辑，增加或使用“metadata-only refresh”路径。
2. 读取现有 manifest，保留每个 LOD 的 URL、文件字节数和 SHA-256。
3. 重算 12 个记录的 transform；只对阳戟城应用 correction。
4. 按 scale multiplier 更新阳戟城 `radiusMapPixels` 与 `heightMeters`。
5. 重算 records 的 `assetHash`，同步 manifest 和 audit report。
6. 对刷新前后 GLB 文件哈希列表做比较，必须完全一致。

## Task 5：加入全地标放置审计

1. 对 12 个 locator 锚点检查其声明 province；阳戟城以 correction 后锚点为准。
2. 基于模型平面足迹采样或保守包围足迹，计算：
   - 声明省份覆盖率；
   - 陆地覆盖率；
   - 是否跨出地图有效范围。
3. 采用能捕获当前已知回归、但允许龙石岛/派克城等岛屿轮廓误差的阈值；阈值与例外必须在代码中具名且有说明，不能静默跳过。
4. 审计必须失败于：
   - 锚点落在错误省份；
   - 陆地覆盖明显不足；
   - correction 缺少 reason；
   - 除允许项外出现无依据 correction。
5. 将结果写入 `audit.json`，供 `audit:agot-models` 验证。

## Task 6：完整验证

依次运行：

```bash
npm run test:agot-model-import
npm run test:map-landmark-transform
npm run test:map-landmark-schema
npm run test:map-landmark-visibility
npm run test:map-landmark-cache
npm run test:map-landmark-layer
npm run test:map-landmark-integration
npm run audit:agot-models
npm run check:map-runtime-boundaries
npx tsc --noEmit
npm run build:code
```

另外确认：

- 24 个 GLB 的 SHA-256 未改变；
- 工作区其他已有改动未被回退；
- 没有新增浏览器或第二渲染上下文相关代码。

## Task 7：用户视觉验收

请用户强制刷新后重点检查并截图：

- 龙石岛：岛上占地与海岸贴合；
- 风息堡：南北尺寸不再近两倍拉长；
- 红堡：城体不再大面积伸入黑水湾；
- 阳戟城：缩小并回到正确陆地区域；
- 派克城：岛屿地标仍保持合理尺度。

自动测试通过只代表结构修复完成；在用户确认以上视觉效果前，不宣称最终视觉任务完成。
