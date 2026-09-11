# AGOT 三维地标模型导入

## 范围

本管线仅发布白名单中的十二处静态地标：临冬城、红堡、龙石岛、凯岩城、高庭、阳戟城、风息堡、鹰巢城、派克城、旧镇、奔流城与毁坏状态的赫伦堡。普通城堡、绝境长城、树林、动物和环境物件不属于该数据集。

浏览器只读取：

- `/data/agot-map/models/landmarks.json`
- `/assets/agot-map/models/<landmark-id>/lod0.glb`
- `/assets/agot-map/models/<landmark-id>/lod1.glb`

运行时不会读取 Steam Workshop、CK3 安装目录、本机绝对路径或远程模型 URL。现有 MapLibre 地点和伯爵领命中层仍是唯一交互入口；模型没有 raycast、存档状态或独立画布。

## 外部工具与许可边界

模型转换依赖外部项目 `ross-g/io_pdx_mesh`，固定提交为：

```text
2249e35f80a1cc04ba4c2b8e4c650f36b18085db
```

该工具采用 GPL-3.0，仅作为开发期外部命令调用，其实现不会复制进本项目或浏览器包。AGOT/CK3 原始模型与贴图的版权和再分发资格必须由发布者单独确认；本脚本不意味着获得原始资产的再分发许可。

示例准备命令：

```bash
git clone https://github.com/ross-g/io_pdx_mesh.git /tmp/io_pdx_mesh
cd /tmp/io_pdx_mesh
git checkout 2249e35f80a1cc04ba4c2b8e4c650f36b18085db
```

转换器会在执行前验证精确提交，不匹配时拒绝生成。

## Python 依赖

建议使用隔离环境安装模型专用依赖：

```bash
python3 -m venv .venv-models
. .venv-models/bin/activate
python3 -m pip install -r scripts/requirements-models.txt
```

Node 依赖由项目锁文件提供，包括 `meshoptimizer@1.2.0`。

## 源资料审计

源目录必须是 AGOT 数据根，并包含 `descriptor.mod`、地图定义、locator、白名单 `.asset`、mesh 和贴图。先执行：

```bash
python3 -m scripts.agot_model_import.cli audit-source \
  --source /path/to/agot-source \
  --converter-root /tmp/io_pdx_mesh
```

审计会校验十二个 `locationId`/`provinceId`、locator、源文件、贴图和转换器提交。基础游戏贴图不在 AGOT 源中的 `tree` shader 子网格会被明确排除并写入生成审计；其他主体贴图缺失会直接失败。

## 试点与完整转换

转换到临时目录进行试点：

```bash
python3 -m scripts.agot_model_import.cli convert \
  --source /path/to/agot-source \
  --converter-root /tmp/io_pdx_mesh \
  --data-output tmp/agot-model-pilot-data \
  --asset-output tmp/agot-model-pilot-assets \
  --only winterfell,dragonstone,the-eyrie
```

完整发布命令：

```bash
IO_PDX_MESH_ROOT=/tmp/io_pdx_mesh npm run import:agot-models
```

也可以显式执行：

```bash
python3 -m scripts.agot_model_import.cli convert \
  --source /path/to/agot-source \
  --converter-root /tmp/io_pdx_mesh \
  --data-output public/data/agot-map/models \
  --asset-output public/assets/agot-map/models
```

转换会先写同级 staging 目录，完整审计成功后再成对替换数据目录和资产目录。失败时不会发布半套清单或模型。

## 输出和预算

- 模型清单 schema：`1`，与地图 schema `4` 独立。
- 每处地标两个 LOD，共 24 个 GLB。
- LOD0：`zoom >= 5.35` 的标准设备使用，单文件不超过 20 MiB。
- LOD1：`zoom >= 4.60` 使用，单文件不超过 6 MiB，三角形数为 LOD0 的 25%–40%。
- 所有 GLB 总量不超过 120 MiB。
- 贴图上限：LOD0 2048、LOD1 1024；导入器可为复杂模型确定性地进一步降低贴图尺寸以满足字节预算。
- GLB 使用内嵌 WebP，不含外部 URI。

当前生成物位于：

```text
public/data/agot-map/models/landmarks.json
public/data/agot-map/models/reports/audit.json
public/assets/agot-map/models/<landmark-id>/{lod0,lod1}.glb
```

## 审计与非浏览器验证

生成后运行轻量审计：

```bash
npm run audit:agot-models
```

指定其他输出根：

```bash
node scripts/audit-agot-models.mjs \
  --data /path/to/data-root \
  --assets /path/to/asset-root
```

当前保留的非浏览器检查：

```bash
npm run audit:agot-models
npm run check:map-runtime-boundaries
npx tsc --noEmit
npm run build:code
```

`import:agot-models` 不得被 `check:*` 或构建命令隐式触发。常规工程检查只审计已生成文件和运行时边界，不读取真实 AGOT 源。

## 运行时与人工验收

Three.js 自定义层复用 MapLibre 的 canvas、WebGL2 context、相机矩阵和渲染调用。它不创建第二 canvas、独立 RAF、控制器或 raycast。加载同步只发生在清单就绪、`moveend` 和 `zoomend`；模型失败只输出局部警告，不能触发“地图资料未能载入”、关闭 DEM 或影响正文与人物卷宗。

自动化测试套件已从仓库移除。以下项目需用户在实际地图中人工检查：

- 模型朝向和视觉比例；
- 建筑基座是否贴合 DEM；
- 材质、法线和 AO 的外观；
- 各缩放阈值切换时的视觉连续性；
- 二维地点标签和点击区域是否始终清晰可用。


## 固定电影光照与轻量阴影

地标使用固定电影感下午光，而不是昼夜模拟：太阳方位固定为 `310°`、高度固定为 `35°`。MapLibre hillshade 使用 `map` 锚点和同一方位，因此地图旋转后地形与建筑仍保持一致的世界受光方向。

光影质量在运行时初始化时根据 WebGL2 与硬件资料一次性确定，不随帧率反复跳档：

- 高质量：2048 阴影贴图，距离视野中心最近的最多两个地标启用实时建筑自阴影；
- 中质量：1024 阴影贴图，最近的最多一个地标启用实时建筑自阴影；
- 低质量：关闭实时 shadow map，但保留暖色主光、冷色天空补光和程序化接触阴影。

所有可见地标都会保留电影灯光和由模型本地包围盒生成的无纹理柔和接触阴影。接触阴影是水平艺术近似，只负责减轻漂浮感，不是沿 DEM 坡面变形的物理投影。阴影初始化或渲染失败时只降级为普通电影光照与接触阴影，不会使地图初始化失败，也不会影响二维标签、边界或点击层。

自动测试验证质量分级、共享 WebGL 边界、按需阴影更新和降级行为，但不能证明最终画面好看。最终仍需用户通过地图截图检查建筑层次、背光可读性、贴地感、阴影强度和旋转后的光照方向。
