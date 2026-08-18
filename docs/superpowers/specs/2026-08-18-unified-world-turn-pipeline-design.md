# 统一世界回合与分支时间线设计

## 目标

正文、D20、玩家状态、NPC 人物、关系、特质、伤势、装备、地点归属与时间线必须读取并写入同一条回合事实链。界面不再依据静态资料或模型措辞自行推断状态，正文也不能叙述程序未接受的事实。

## 当前断点

1. `buildStateSlice` 稳定注入玩家状态，但 NPC 上下文依赖没有调用方的 `characterTurnContext`。
2. 模型在同一次响应中先写正文再给状态命令；命令被拒绝后正文不会重写。
3. 人物事件保存在 Dexie，玩家状态保存在 `GameState`，但没有统一的回合事件记录把两者与正文关联起来。
4. `worldArtifacts` 与玩家 `lord.items` 是独立状态，世界归属不会进入场景可用物品判断。
5. 电视时间线 JSON 只供弹窗展示，没有预定事件状态、前置条件、分支点或实际世界历史。
6. 开局日期固定为 298 AC 10 月 15 日，与三个预设的开场剧情不一致。

## 核心原则

### 单一事实来源

每个成功回合产生一个 `WorldTurnRecord`。它记录玩家意图、程序已确认的 D20、被接受的玩家命令、人物事件、时间推进、触发或偏离的原作事件，以及供正文使用的事实摘要。人物卷宗、时间线和正文均从该记录及其投影读取事实。

### 先结算，后叙述

回合分为两个阶段：

1. 解析阶段只产生结构化行动解析与命令，不产生最终正文。
2. 程序验证命令、结算 D20、人物事件、装备动作、时间与预定事件。
3. 叙述阶段只接收程序已确认的 `ResolvedTurnFacts`，流式生成正文与下一步选择。

离线演示同样遵守此顺序，不保留另一套旁路规则。

### 分支时间线

- 开局日期之前的原作事件属于不可改变的历史背景。
- 开局日期之后的原作事件是 `scheduled` 预定压力，不是已经发生的事实。
- 日期到达且前置事实仍成立时，事件变为 `occurred` 并进入世界历史。
- 玩家改变关键人物生死、地点、婚姻、头衔或控制关系后，相关事件可变为 `diverged`，并记录原因。
- 被后续事件替代或无法发生的预定事件变为 `suppressed`。
- 时间线界面同时展示“本世界实际历史”和“原作预定节点”，明确区分二者。

### 自动场景上下文

正文上下文不得依赖 UI 手工设置。`buildWorldTurnContext` 根据以下信息自动构建：

- 玩家对应的 AGOT 人物 ID；
- 玩家输入中直接点名的人物；
- 最近回合参与者；
- 当前到期时间线事件参与者；
- 已有重要关系；
- 人物事件投影后的真实状态；
- 玩家当前实际穿戴、随身与当前地点可访问物品；
- 当前地点可见的世界装备记录。

上下文只注入公开、玩家已知或当前场景可见的事实，不泄露秘密字段。

## 领域模型

```ts
export interface WorldDate {
  year: number;
  month: number;
  day: number;
}

export type CanonicalEventStatus = 'historical' | 'scheduled' | 'occurred' | 'diverged' | 'suppressed';

export interface CanonicalEventState {
  eventId: string;
  status: CanonicalEventStatus;
  resolvedOn?: WorldDate;
  reason?: string;
}

export interface WorldEventFact {
  id: string;
  turn: number;
  date: WorldDate;
  source: 'player' | 'character' | 'item' | 'timeline' | 'system';
  kind: string;
  title: string;
  summary: string;
  participantIds: CharacterId[];
  commandTypes: string[];
  canonicalEventId?: string;
}

export interface WorldTurnRecord {
  turn: number;
  action: string;
  startedOn: WorldDate;
  resolvedOn: WorldDate;
  acceptedCommands: StateCommand[];
  rejectedCommands: Array<{ type: string; reason: string }>;
  facts: WorldEventFact[];
  canonicalTransitions: CanonicalEventState[];
}

export interface WorldHistoryState {
  schemaVersion: 1;
  startDate: WorldDate;
  canonical: Record<string, CanonicalEventState>;
  turns: WorldTurnRecord[];
}
```

`GameState` 增加 `worldHistory`。当前测试版不迁移旧存档。

## 时间线数据

开发期脚本把 `public/data/tv-timeline/westeros_chronological_timeline.json` 转为 `src/data/generated/canonicalTimeline.ts`。每个节点至少包含机器日期、标题、摘要、地区、参与者名称、可解析人物 ID、死亡名单与后果。无法可靠映射的人物保留名称但不产生人物状态命令。

三个预设增加明确 `startDate` 与 `canonicalCharacterId`：

- 艾德：`agot:Stark_3`，298 AC 5 月 10 日；
- 琼恩：`agot:Stark_7`，298 AC 6 月 1 日；
- 丹妮莉丝：`agot:Targaryen_9`，298 AC 5 月 10 日。

## 回合接口

```ts
export async function buildWorldTurnContext(input: BuildWorldTurnContextInput): Promise<WorldTurnContext>;
export async function requestTurnResolution(messages: ChatMessage[], config: ApiConfig): Promise<TurnResolutionDraft>;
export function settleTurnDraft(input: SettleTurnDraftInput): SettledTurn;
export async function streamSettledNarrative(input: SettledNarrativeInput): Promise<NarrativeResult>;
```

`TurnResolutionDraft` 只允许结构化命令、耗时建议、行动结果摘要和下一场景参与者 ID。`NarrativeResult` 只允许正文、思考摘要和分支，不再包含状态命令。

## 一致性约束

1. 被拒绝命令不得出现在 `ResolvedTurnFacts`。
2. 最终正文只接收 `ResolvedTurnFacts`，不接收原始草案命令。
3. NPC 人物卷宗通过静态人物加已提交人物事件投影，不解析正文。
4. 时间线实际历史通过 `worldHistory.turns[].facts` 渲染，不解析正文。
5. 装备效果只来自实际 `equipped`；随身与地点物品只决定可访问性。
6. 时间只能向前推进；`SET_DATE` 不允许早于当前日期。
7. 同一预定事件只能完成一次状态转换。
8. 回滚必须同时回滚快照、人物事件与 `worldHistory`。

## 界面结果

- 正文中的人物高亮仍可打开卷宗，但人物状态与正文来自同一回合事实。
- NPC 面板保持只读，展示事件投影后的关系、伤势、特质、地点与实际穿戴。
- 时间线弹窗默认打开“本世界”，可切换“原作节点”；偏离事件显示原因。
- 变化日志显示被接受的事实和被拒绝命令，不把模型建议当作已发生事实。

## 不在本阶段实现

地图视觉界面仍按既定顺序后做，但地点 ID、地点事件和地点装备的领域接口在统一事实链中保留，避免地图再次形成独立状态。

## 实现验证记录（2026-08-18）

统一回合管线已经按上述八项一致性约束接入。数据库事务边界额外执行 `assertTurnCommitConsistency`，在写入前核对故事回合、世界账本、当前日期、人物世界修订号、人物事件 ID 与接受命令，避免任一投影单独前进。

已执行的验证命令：

```bash
npm run verify
python3 -m unittest scripts.test_agot_artifact_import scripts.test_agot_artifact_world_state scripts.test_agot_character_import -v
node scripts/test-unified-turn-integration.mjs
npx tsc --noEmit
git diff --check
curl -fsS http://localhost:5199/
```

原作时间表还执行了生成前后 SHA-256 对比，并连续运行两次 `python3 scripts/build_canonical_timeline.py`；两次输出与生成前均为 `89d9c4a79183710bc9afb2878a534b9e4725ddec78bec4459458e1dcbf17d116`，确认离线生成幂等。

`test-unified-turn-integration.mjs` 覆盖：点名 NPC 场景、可见 D20、排队穿戴、接受关系变化、拒绝重复死亡、跨越原作节点、正文失败、数据库提交失败，以及撤回后同步恢复故事回合、世界账本、人物事件和装备状态。

5199 开发服务通过 HTTP 烟雾检查。当前桌面浏览器控制因 WSL 工作区路径映射失败，未完成自动截图式视觉烟雾检查；这不影响上述代码、构建与 HTTP 验证，仍需在可连接浏览器的桌面会话中人工打开 5199 检查一次时间线双视图和正文事实区域。

地图视觉界面仍有意留待下一阶段。本阶段只保留地点 ID、人物移动事实、地点可访问物品与世界装备位置接口，不新增地图呈现，也不让地图形成第二套状态来源。

补充验证：离线模式的第二阶段现在只输出 `<think>`、`<narrate>` 与 `<branch>`，不会再次生成 `<state_cmd>`；地点、婚姻、关系与头衔变化会作为参与人物的原作节点前置条件变化触发 `diverged`，显式的 `timeline.replaced` 事实会触发 `suppressed`。`npm run verify` 还包含 `check:world-timeline`，用于确认时间线默认采用本世界账本、状态标签完整、节点数与年份动态计算，并且运行时不再请求静态时间线 JSON。
