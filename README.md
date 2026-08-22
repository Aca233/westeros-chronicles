# 维斯特洛编年史

一个以 CK3 / AGOT 世界资料为基础的本地优先 AI 文字角色扮演前端。项目把正文回合、人物卷宗、世界事件、物品资产、时间线、旅行与离线维斯特洛地图连接到同一份可恢复的游戏状态中。

## 设计主轴

> **在原作风暴中的维斯特洛，扮演一个具体的人：信息不完整，选择有代价，世界记得一切。**

一切机制的取舍以此为裁判：让选择带上真实代价、让世界如实记住，比补全世界资料更优先。

## 当前能力

- CK3 风格统治者设计器、通用人物窗口、六项属性、特质、亲属关系、伤势与记忆
- 2,241 名 AGOT 人物的离线分片资料、稳定人物 ID 和按存档事件叠加的动态档案；另有 1,144 条轻量持有人摘要服务头衔与地图显示
- 日常穿戴、战斗装备、随身物品、据点储藏、运输工具与唯一物品
- 可选 D20 检定、确定性特质效果和前端规则结算
- 两阶段 LLM 回合：先解析并验证状态变化，再根据已结算事实生成正文
- IndexedDB 回合快照、启动恢复、存档导入/导出、撤回和原子提交
- 统一世界事件账本，以及正文、人物、时间线和地图共用的可见性与名称解析
- 从左侧展开的离线维斯特洛地图；政治、人物、资产和道路是可叠加信息层，不是互斥模式
- 霸权、帝国、王国、公国、伯爵领五级头衔语义缩放；伯爵领是最小政治交互单位
- 地点检索、伯爵领与地点详情、已知人物和资产位置、道路/海路规划及多回合旅行
- 地图资料或三维表现失败时，普通正文回合和人物卷宗仍可继续使用

当前实现边界和数据流见 [`docs/CURRENT_ARCHITECTURE.md`](docs/CURRENT_ARCHITECTURE.md)。

## 开发文档

从 [`docs/INDEX.md`](docs/INDEX.md) 进入当前架构、测试套件、数据流水线以及设计与实施记录。历史规格用于追踪决策，当前行为以代码和 `docs/CURRENT_ARCHITECTURE.md` 为准。

## 本地运行

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

完整验证：

```bash
npm run verify
```

快速代码与核心规则验证：

```bash
npm run verify:quick
```

只验证地图系统：

```bash
npm run verify:map
```

## 模型提供商

设置页支持两类真实传输协议：

- OpenAI-compatible：OpenAI、DeepSeek、SiliconFlow 和自定义兼容端点，使用 `/chat/completions`
- Anthropic：使用 Messages API、`x-api-key` 与 `anthropic-version`

规则解析与正文生成使用同一个 provider adapter。模型请求具有超时与取消控制；请求失败或取消时不会提交尚未完成的回合。API Key 仅用于浏览器直接请求所配置的服务，不应在不受信任的部署环境中使用。

## 数据与版本

当前彼此独立的主要版本合同如下：

- 游戏存档格式：`saveFormatVersion: 9`
- 地图清单：`public/data/agot-map/manifest.json`，`schemaVersion: 4`
- 人物数据清单：`public/data/agot-characters/manifest.json`，`schemaVersion: 2`
- 世界运行时、世界历史与唯一物品初始状态各自使用内部 `schemaVersion: 1`

测试版不会迁移旧格式存档。启动时若最近快照不兼容或损坏，应用保留原数据并显示明确的重置入口，不会静默删除。导入存档通过完整校验后直接替换当前 Store，无需刷新页面。

## 地图数据开发

运行时只读取仓库内已经生成的 `public/data/agot-map` 与 `public/assets/agot-map`，不会读取本机模组目录、Steam Workshop 或网络地图服务。地图画布、地点搜索、政治投影、人物与资产点位及旅行系统均使用这些离线数据。

安装开发期地图导入依赖：

```bash
python3 -m pip install -r scripts/requirements-map.txt
```

使用内置 fixture 验证导入器，不需要本机 AGOT 文件：

```bash
npm run test:agot-map-import
```

开发者在本机准备好离线 AGOT 来源后，可显式执行真实导入：

```bash
npm run import:agot-map
```

真实导入不会被 `verify` 或 `verify:quick` 自动调用。生成数据可单独审计：

```bash
npm run check:map-data
```

### 五级头衔语义地图

地图清单固定使用 schema version 4。运行时读取：

- `public/data/agot-map/semantic/titles.json`：五级头衔的中文名称、颜色和标签锚点
- `public/data/agot-map/semantic/membership.json`：具体地点到伯爵领、公国、王国、帝国和霸权的归属链
- `public/assets/agot-map/semantic/{z}/{x}/{y}.pbf`：五级头衔表面、边界与标签矢量瓦片

可见头衔等级按缩放硬切换：

1. 霸权（`hegemon`）
2. 帝国（`empire`）
3. 王国（`kingdom`）
4. 公国（`duchy`）
5. 伯爵领（`county`）

同一时间只显示一个主要头衔等级。政治填色使用头衔颜色；进入近景后退出普通政治填色，保留地形、伯爵领选择边界和伯爵领内部地点。地图不显示家族名称副标题。`baronyId` 只作为地点、省份和旅行节点的内部映射键，不形成可见层级。

地图相机、三维地标和信息图层都只是表现层，不持有政治、人物、资产、旅行或时间线的权威状态。地图点击最终解析为伯爵领或具体地点；人物、资产和道路可由玩家独立显示或隐藏。

提供给 LLM 的地点上下文只包含经过验证的玩家可见中文名称，不包含 `h_`、`e_`、`k_`、`d_`、`c_`、`b_` 等内部键。地图索引不可用时，只有明确依赖地点或路线的意图会被拒绝，普通对话与非地图行动仍可完成。

## 数据说明

- `public/data/agot-characters`：预处理人物分片、关系、头衔与检索索引
- `public/data/agot-map`、`public/assets/agot-map`：地图清单、离线瓦片、地形和正式地标模型
- `src/data/generated`、`public/data/items`：生成的时间线、唯一物品目录与世界初始状态

静态 AGOT 数据是开局基线，存档中的 `worldRuntime` 只保存发生变化的稀疏覆盖；玩家看到的人物、头衔和资产由“静态基线 + 当前覆盖 + 可见事件”投影得到。政治制度与象征会标记为 `political-symbol`，不会冒充可操作的普通资产。

原始 AGOT Workshop 文件、音频资源、构建产物和本地分析缓存不会提交到仓库。`tmp/` 只用于本地试验，不属于正式运行时资产。

本项目仅用于个人开发与研究。CK3、AGOT 及相关素材的权利归各自权利方所有。
