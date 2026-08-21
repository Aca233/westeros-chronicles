# AGOT 地标电影感光照与轻量阴影设计

日期：2026-08-21
状态：已确认

## 1. 目标

为已经接入地图的十二个 Three.js 地标增加稳定、好看的固定下午光照，重点改善建筑层次、塔楼与城墙的体积感，以及模型贴地感。

本次追求视觉效果与运行稳定性，不构建完整物理太阳、昼夜循环或 DEM 精确投影系统。

## 2. 明确不做

- 不增加昼夜循环、游戏小时或动态太阳轨迹。
- 不生成局部 DEM 阴影接收网格。
- 不重新转换或重新发布二十四个地标 GLB。
- 不增加第二 canvas、第二 WebGL context、第二渲染循环或独立相机控制器。
- 不让 Three.js 接管点击、悬停或射线交互。
- 不让阴影故障导致地图整体载入失败。
- 不提交或推送代码。

## 3. 统一电影光照配置

新增一个纯配置模块，作为 Three.js 地标光照与 MapLibre hillshade 的共同数据源。

固定视觉参数：

- 太阳方位约 310°，从西北偏西方向照射。
- 太阳高度约 35°，形成清晰但不过长的下午阴影。
- 主光使用偏暖颜色。
- 天空补光使用轻微冷色。
- 保留极弱环境光，避免门洞、背光墙面完全变黑。
- 光源锚定地图世界方向，地图旋转时不跟随屏幕旋转。

MapLibre hillshade 设置 `hillshade-illumination-anchor: map`，其照明方向与 Three.js 主光读取同一配置，避免地形与建筑受光方向相反。

## 4. Three.js 建筑光照

当前固定 AmbientLight + DirectionalLight 替换为：

- 一个 DirectionalLight 作为暖色太阳主光。
- 一个 HemisphereLight 作为天空与地面补光。
- 一个低强度 AmbientLight 作为极暗区域兜底。

加载模型后遍历所有 Mesh：

- 保持现有双面、非金属、粗糙材质调整。
- 开启 `castShadow`，使塔楼、屋顶和城墙产生阴影。
- 开启 `receiveShadow`，使建筑表面形成自阴影。
- 不启用阴影透明材质或高成本后处理。

方向光的阴影相机只覆盖当前选中的实时阴影地标，而不是覆盖整张维斯特洛地图。可见集合或 LOD 改变时重新计算一次包围范围。

## 5. 轻量接触阴影

每个已加载地标在运行时生成一个程序化柔和椭圆阴影，放置于模型底部：

- 使用 CircleGeometry 与径向渐变 ShaderMaterial。
- 不创建 CanvasTexture 或额外图片资源。
- 阴影中心较深，边缘平滑透明。
- `depthWrite` 关闭，避免遮挡地图内容。
- 使用极小偏移与 polygon offset 降低闪烁。
- 不接收事件、不参加 raycast。
- 尺寸由模型本地包围盒计算，不写死十二套参数。

接触阴影是视觉近似，不严格沿山坡变形。它只负责消除模型漂浮感；地图地形起伏仍由 MapLibre terrain 与 hillshade 表达。

接触阴影随模型资源生命周期创建和释放，不新增独立网络请求。

## 6. 自动质量分级

建立独立于模型 LOD 的光影质量等级：

### 高质量

适用于 WebGL2、设备内存不少于 8 GiB、硬件线程不少于 8 的设备：

- 2048×2048 PCFShadowMap。
- 最多两个距离视野中心最近的地标启用实时自阴影。
- 所有可见地标保留电影光照与接触阴影。

### 中质量

适用于支持 WebGL2、但未达到高质量条件的设备：

- 1024×1024 PCFShadowMap。
- 最多一个距离视野中心最近的地标启用实时自阴影。
- 所有可见地标保留电影光照与接触阴影。

### 低质量

适用于设备内存低于 4 GiB、硬件线程不多于 4，或阴影能力初始化失败的设备：

- 关闭实时 shadow map。
- 保留暖色主光、天空补光与程序化接触阴影。
- 不影响现有 LOD1 与两地标资源限制。

质量等级在运行时初始化时确定，不因帧率或镜头移动反复跳档。

## 7. 阴影更新策略

阴影贴图使用按需更新，而不是每帧更新：

- 首次载入地标时更新。
- 地标进入或离开实时阴影集合时更新。
- LOD 切换时更新。
- WebGL context 成功恢复后更新。

普通地图平移、缩放和旋转继续由 MapLibre 驱动渲染，但不会让静态地标阴影持续重算。

如果共享 context 的状态恢复、阴影贴图或方向光初始化失败：

1. 仅关闭实时阴影。
2. 保留普通电影光照和接触阴影。
3. 通过现有 `onWarning` 最多提示一次。
4. 不设置地图初始化错误，不移除二维交互层。

## 8. 运行时边界

光照系统继续位于现有 `agot-landmark-models` 自定义层中：

- 复用 MapLibre canvas/context。
- `autoClear = false`。
- 渲染前后继续调用 renderer state reset。
- 不调用 `forceContextLoss`。
- 不增加 RAF、OrbitControls、Raycaster 或第二相机系统。
- 地标层仍插入在伯爵领透明点击层之前。
- 原有二维 MapLibre 图层仍是唯一交互权威。

## 9. 预计代码范围

新增：

- `src/features/map/landmarks/landmarkLightingProfile.ts`
- `src/features/map/landmarks/landmarkContactShadow.ts`
- 相应 Node 测试文件

修改：

- `src/features/map/landmarks/landmarkCustomLayer.ts`
- `src/features/map/landmarks/landmarkResourceCache.ts`
- `src/features/map/landmarks/landmarkRuntime.ts`
- `src/features/map/mapStyle.ts`
- `scripts/check-map-runtime-boundaries.mjs`
- `package.json` 的地图验证链（如新增测试脚本）

不修改模型生成器、模型 manifest 或已发布 GLB。

## 10. 测试与验收

自动测试验证：

- 三档质量选择与 shadow map 尺寸。
- 低质量设备不启用实时 shadow map。
- 地标 Mesh 的 cast/receive shadow 配置。
- 接触阴影尺寸、材质、深度写入和释放。
- 阴影只在可见集合/LOD/context 恢复时标记更新。
- hillshade 与 Three.js 使用同一太阳方位。
- 仍无第二 canvas、RAF、控制器、raycast 或远程资源。
- 共享 WebGL 状态在渲染前后恢复。
- 地标光影失败不会升级为地图初始化失败。

最终运行：

- 新增聚焦测试。
- `npm run verify:map`
- `npx tsc --noEmit`
- Linux `npm run build:code`
- Windows `npm run build:code`
- `git diff --check`

人工视觉验收关注：

- 塔楼、屋顶和城墙是否出现清晰层次。
- 背光面是否仍可辨认。
- 城堡是否比当前更贴地。
- 阴影是否过黑、过硬或覆盖地图标签。
- 旋转地图后，地形与建筑的世界受光方向是否保持一致。

## 11. 视觉回归修订：稳定可见光影

2026-08-21 的连续截图回归确认，原设计虽然创建了 Three.js 灯光、MapLibre hillshade 与 shadow map，但最终画面仍无法稳定辨认统一光向。原因不是单纯参数偏低：现有 hillshade 使用未乘 `TERRAIN_VISUAL_SCALE` 的 DEM 坡度；低质量设备关闭实时 shadow map 后缺少明确投影；方向光位置此前依赖实时阴影重算；赫伦堡、派克城等 CK3 贴图本身又显著偏暗。

已确认采用以下收敛方案：

- 新增固定 310°/35° 太阳方向的离线地形光照覆盖瓦片，只影响地表明暗，不改变现有 DEM、地形高度、地点坐标或交互。
- MapLibre 使用透明栅格光照覆盖层替代运行时 hillshade，保证所有设备看到同一套山体受光。
- DirectionalLight 在阴影质量分档之前即获得固定世界方向；关闭 shadow map 时仍保留正确建筑主光。
- 对经离线审计确认偏暗的地标使用按地标配置的纹理驱动曝光补偿，不修改或重新转换 GLB。
- 程序化方向软影作为所有质量档的基础效果；实时 shadow map 只作为高、中质量设备的附加细节。
- 视觉验收必须能直接看出：西北受光、东南背光、城堡东南方向软影，以及偏暗模型仍可阅读。

本修订仍遵守：不增加第二 canvas/context/RAF，不恢复 Three.js 交互，不重新转换二十四个 GLB，不提交、不推送，不由 Codex 启动浏览器。
