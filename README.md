# 维斯特洛编年史

一个以 CK3 / AGOT 风格人物系统为基础的 AI 文字角色扮演前端。项目包含统治者设计器、人物特质与六项属性、人物关系资料、伤势与装备、随身物品、D20 检定、场景人物状态系统，以及与统一世界状态联动的维斯特洛地图。

## 当前功能

- CK3 风格通用人物窗口与统治者设计器
- 关系卡连续查看、返回人物与全 AGOT 人物姓名检索
- 外交、军事、管理、谋略、学识、勇武六项属性
- 教育、性格、先天、健康、生活方式和名望特质
- AGOT 人物资料、稳定人物 ID、关系档案与存档动态事件投影
- 身体伤势、日常装备、据点储藏和运输工具
- 装备在下一次成功对话后生效
- 可选 D20 行动检定和特质规则效果
- 人物事件、记忆与状态回滚
- 从左侧展开的维斯特洛离线地图，提供地形、政治、人物、旅行和资产五种模式
- 地点检索与详情、已知人物和据点位置、按时间线重建的政治归属
- 道路与海路规划、多途经点路线，以及在后续成功对话中结算的多回合旅行
- 地图情报按未知、传闻、过时和已确认等级过滤，不向界面泄露当前真值

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

只验证地图系统：

```bash
npm run verify:map
```

## 地图数据开发

运行时只读取仓库内已经生成的 `public/data/agot-map` 与 `public/assets/agot-map`，不会读取本机模组目录、Steam Workshop 或网络地图服务。地图画布、地点搜索、政治投影、人物与资产点位及旅行系统均使用这些离线数据；地图子树发生故障时不会阻断正文和人物卷宗。

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

### CK3 式语义地图

地图清单固定使用 schema version 2。运行时只读取已经提交的离线文件：

- `public/data/agot-map/semantic/titles.json`：战略区域、公国和伯爵领的中文标题与标签锚点
- `public/data/agot-map/semantic/membership.json`：具体地点到三级可见行政层的归属关系
- `public/assets/agot-map/semantic/{z}/{x}/{y}.pbf`：三级边界与中文标签矢量瓦片

开发者只有在更新地图资料时才显式执行 `npm run import:agot-map`。自动验证不会读取
`/mnt/c/agot/2962333032`、Steam Workshop 或任何网络地图服务。

地图可见行政层固定为战略区域、公国和伯爵领；`baronyId` 只作为程序内部的地点兼容键，不形成可见层级。相机与语义控制器不持有政治、人物、物品、旅行或时间线的权威状态。后续三维地形只能替换近景地形渲染层，不得改写 `semanticZoomState()`、语义归属、政治投影或旅行队列接口。

提供给 LLM 的地点上下文只包含经过验证的具体地点、伯爵领、公国和战略区域中文名，不包含 `baronyId` 或 `b_` 地点键；地点变化和旅程进度只由地图旅行系统与统一回合结算。

## 数据说明

`public/data/agot-characters` 包含项目运行所需的预处理人物数据；`public/data/agot-map` 与 `public/assets/agot-map` 包含地图运行时数据。关系页可按姓名打开任意稳定人物档案；NPC 的身份、特质、属性、亲属、伤势、头衔和记忆会叠加当前存档事件，未记录的装备与物品保持未知，不会复制玩家物品。原始 AGOT Workshop 文件、音频资源、构建产物和本地分析缓存不会提交到仓库。

本项目仅用于个人开发与研究。CK3、AGOT 及相关素材的权利归各自权利方所有。
