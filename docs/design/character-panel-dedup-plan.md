# 人物面板去重复与直观化改造方案

状态：**C1～C7 已实施，C8 决定不做，C9 待定**。实施记录见文末第 8 节。
范围：`src/components/Ck3CharacterWindow.tsx` 与 `src/components/character-window/`（玩家与 NPC 共用的人物卷宗抽屉）
依据：`docs/CURRENT_ARCHITECTURE.md` 第 103/180 行、`docs/design/gameplay-overhaul-2026-09-07/character-panel.md`

---

## 0. 目标与约束

用户诉求两条：**同一信息只出现在一个地方**、**尽量直观且简单**。

约束（本方案不碰）：

- 信息可见性规则不变。`visibleMemories` / `visibleFacts` / `relationshipEvidenceForViewer` / `hiddenWorldEventIdsForPlayer` 的过滤边界是设计文档第 3、6 节的硬要求，本方案只改"显示在哪"，不改"能不能看到"。
- 玩家与 NPC 继续共用同一个窗口组件（`character-panel.md` 第 4 节的信息架构，以及 `check-ck3-character-window` 对双分支的断言）。
- 抽屉形态不变：`App.tsx:230-247`，右侧 92vw／`max-w-[460px]`，`activeDrawer === 'character'` 时打开。

一条关键前提：**这个面板是窄抽屉，不是宽页面。**在手机上它盖住 92vw，桌面上它和常驻左侧栏同屏。所以"桌面重复"和"移动端够不够用"是两个不同问题，下文分开处理。

---

## 1. 审计结论：现存 9 处重复

| # | 信息 | 出现位置 | 判定 |
|---|---|---|---|
| 1 | 所在位置 | `CharacterIdentityHeader.tsx:73-83`（头部地点按钮）<br>`CharacterCurrentTab.tsx:123-133`（当前位置卡片）<br>`PlayerStatusRail.tsx:108-113`（左侧栏"所在"，桌面常驻） | **3 处**，最严重 |
| 2 | 家族名 | `CharacterIdentityHeader.tsx:69`（族名小字）<br>`CharacterIdentityHeader.tsx:107`（肖像下方） | 2 处，同一屏可见 |
| 3 | 头衔 | `CharacterIdentityHeader.tsx:63-67`（名字下方头衔行）<br>`CharacterIdentityHeader.tsx:71`（肖像 `alt`）<br>`dossier.title` 另在左侧栏 `PlayerStatusRail.tsx:94、103` 出现 | 2 处可见 |
| 4 | **人物记忆** | `CharacterCurrentTab.tsx:186-196`（眼下 → 已知线索，`memories.slice(-5).reverse()`）<br>`CharacterHistoryTab.tsx:177-195`（往事 → 个人记忆，取 `dossier.memories` 全量，排序见 `:133`） | **2 处同一份数据**，且眼下展示的是往事的子集 |
| 5 | 共同经历 | `CharacterCurrentTab.tsx:172-184`（眼下 → 你们之间，最近 4 条）<br>`CharacterRelationsTab.tsx:132-148`（关系 → 共同经历，最近 6 条，带 impact 与依据 ID） | 2 处，关系页版本信息更完整 |
| 6 | 六维属性 | `CharacterOverview.tsx:51-68`（能力页签：图标 + 数字，仅 `title` 提示）<br>`PlayerStatusRail.tsx:116-145`（左侧栏：图标 + 数字 + **中文标签** + 完整明细悬停卡） | 2 处；且人物面板里那份**更差**——没有标签、没有明细 |
| 7 | 全部特质 | `CharacterOverview.tsx:17-47`（能力页签特质网格）<br>`PlayerStatusRail.tsx:147+`（左侧栏"全部特质"） | 2 处（仅桌面 ≥1024px，`PlayerStatusRail.tsx:61` 是 `hidden lg:flex`） |
| 8 | 当前时间 | `CharacterCurrentTab.tsx:134-139`（当前时点卡片） | 面板内 1 处，但与顶端 `Header` 全局时间重复；且它不是人物信息 |
| 9 | 所在地入口的数据源分歧 | `PlayerStatusRail.tsx:112-113` 用权威 `dossier.worldLocation`；`CharacterCurrentTab.tsx:126` 用 `gameState.lord.location.locationId`；`CharacterIdentityHeader.tsx:73-83` 又用 `worldLocation` | 同一语义两个数据源，可能互相矛盾 |

### 已排查、**不是**重复的部分（避免误删）

- `CharacterOverview.tsx` 的特质网格 vs `HealthAndEquipmentPanel.tsx:521-545` 的"长期身体状态与特质"：后者经 `isHealthCategoryTrait` 过滤（`HealthAndEquipmentPanel.tsx:121、162-165`），只含伤残/病痛。两者**交集为空**，保留。
- `ItemManagementPanel` 的"随行物品"（`viewModel.ts:207`：`placement.type === 'carried'`）vs `EquipmentPanel` 的穿戴位（`head`/`mainhand`/`offhand`/`torso`）：**数据不重叠**，是"随身但没穿"与"正穿着"两个集合。**不要合并这两个页签**，合并反而制造新的重复。
- 关系卡的家庭数据：配偶/子女/父母/兄弟姐妹来自 `useVerifiedLordFamily`（只对玩家生效，`CharacterRelationsTab.tsx:40-45`），NPC 走 `npcRelationshipCards`。各页签各取所需，无重复。
- `dossier.worldEvents`：`characterDossier.ts:225` 与 `:329` 都写死 `Object.freeze([])`，NPC 往事页实际读的是 `factsForCharacter(visibleWorldEvents, dossier.id)`（`CharacterHistoryTab.tsx:120-121`）。该字段目前是死数据，不是重复。

---

## 2. 去重原则：每条信息只有一个权威位置

| 信息 | 改造后唯一位置 | 理由 |
|---|---|---|
| 姓名、别名、肖像、族语 | 身份头部 | 面板存在的第一目的：这是谁 |
| 家族名 | 身份头部**或**肖像说明，二选一（建议肖像说明） | 族徽+族名放一起最直观 |
| 头衔、年龄、生/死 | 身份头部 | 身份的一部分 |
| 文化、信仰 | 身份头部一行 | 次要，压成一行 |
| 所在位置 | **眼下** 一处（并把数据源统一到 `dossier.worldLocation`） | 位置是"处境"，不是身份；左侧栏那份保留（它承载地图入口，且移动端不可见） |
| 六维、特质 | **能够** 页签一处，并升级为左侧栏同款悬停明细 | 属性要能点开看构成，否则只是一排数字 |
| 伤情、穿戴 | **身体装备** 页签一处 | 已有 |
| 金币、整体健康 | 能够页签（玩家） | 已有 |
| 未了事项、最近互动 | **眼下** 一处 | 设计文档第 4 节对"眼下"的定义 |
| 个人记忆、世界事实、履历 | **往事** 一处 | 眼下不再重复列记忆 |
| 共同经历 | **关系** 一处（保留 impact 与依据 ID） | 眼下不再重复 |
| 亲属、重要关系 | **关系** 一处 | 已有 |
| 随身/据点/载具/远方资产 | **行囊** 一处 | 已有 |

净效果：**人物记忆从 2 处降到 1 处，共同经历 2→1，所在位置 3→2（桌面）／3→1（移动端），家族名 2→1，头衔可见处 2→1。**

---

## 3. 改动清单（可逐条执行、可单独回滚）

### C1 身份头部：删掉所在地按钮

文件 `src/components/character-window/CharacterIdentityHeader.tsx:73-83`

现状是玩家一个可点按钮 + NPC 一行"所在地需由消息或会面确认"，两者都删。

配套：`onOpenLocation` 这个 prop 在该组件内将不再被使用，从 `CharacterIdentityHeaderProps`（`:8-21`）移除，并同步 `Ck3CharacterWindow.tsx:39、100-101` 的传参。位置入口统一由眼下的位置卡片承担。

### C2 身份头部：头衔行只留头衔

文件同上，`:63-67`

删掉紧随其后的 `house` 小字行（`:76`），族名保留肖像下方那一处；文化/信仰与家族合并成一行 `家族 · 文化 · 信仰`（`:77`）。

### C3 眼下：删掉"已知线索"整节

文件 `src/components/character-window/CharacterCurrentTab.tsx:185-195`

同一份 `dossier.memories` 在往事页有完整版本。删除该 `<section aria-label="已知线索">`，同时删掉为它读取的记忆相关变量（若删除后 `dossier` 在该作用域另有用途则保留）。

### C4 眼下：删掉"当前时点"卡片

文件同上，`:134-139`

时间不属于人物信息，顶端 `Header` 已常驻显示。删掉后把 `:108` 的 `grid grid-cols-2` 改为单列，让位置卡片占满宽度——顺带解决窄抽屉里位置文字被 `truncate` 截断的问题。

### C5 眼下：位置卡片改用权威数据源

文件同上，`:126`

`onOpenLocation(gameState.lord.location.locationId)` 改为使用 `dossier.worldLocation`（与 `PlayerStatusRail.tsx:112-113` 一致），并在 `worldLocation` 为空时禁用按钮，而不是回退到 `lord.location`。这样"同一语义只有一个数据源"。

注意：NPC 分支现在显示"所在地未确认"，但 `characterDossier.ts:313` 会把 `character.locationId` 原样写进 `dossier.location`，而头部文案正在说"需由消息或会面确认"——**代码与文案不一致，NPC 位置实际是全知的**。这是设计文档第 3 节明令禁止的倒灌路径，本方案建议一并处理，但需要你拍板（见第 6 节问题 3）。

### C6 眼下：共同经历只留一行摘要

文件同上，`:166-177`

眼下保留最近 1 条并附"另有 N 条见关系页"的跳转提示；完整列表仍只在关系页。若你认为眼下干脆不显示共同经历更干净，也可以整节删除——这属于第 6 节问题 1 的范围。

### C7 能够页签：属性升级为可点明细

文件 `src/components/character-window/CharacterOverview.tsx:51-68`

把裸 `<div>` 换成已有的 `CharacterAttributeHoverCard`（`src/components/character-window/CharacterAttributeHoverCard.tsx`，目前**只有左侧栏在用**）。

障碍：该组件签名要求 `items: LordProfile['items']` 与可选 `baseValue`，玩家可用 `dossier.player`，NPC 没有 `baseAttributes`。三种做法：

- **A（推荐）** 组件加一个 `mode` 或把 `items` 放宽为可选；NPC 传空数组，悬停卡自然退化成"该属性参与哪些检定 + 特质检定修正"，不再报"基础/永久成长"构成。改动集中在悬停卡内部，其它调用点不受影响。
- B 只给玩家接，NPC 维持裸数字。最省事，但同一个面板两种交互，反而不直观。
- C 不动。属性仍是黑盒数字。

### C8 可读性：属性补中文小字

文件同上，`:51-68`

左侧栏（`PlayerStatusRail.tsx:140`）每个属性下面有 `skill.label`，而人物面板只有图标 + 数字。补上标签后，移动端用户（看不到左侧栏）才知道哪个是外交、哪个是军事。

注意与既有断言冲突：`scripts/check-ck3-character-window.mjs:34-35` 明令禁止 `{skill.label}</span>` 这种写法，并且禁止大字号。所以这里必须换成**不匹配该正则的写法**（例如把标签放进 `<span className="...">{skill.label}</span>` 之外的结构，或改用 `aria-label` + 视觉标签重新组织），否则检查脚本会红。这条要在实施时实际跑一遍脚本确认。

### C9 左侧栏：删掉"全部特质"区块

文件 `src/components/PlayerStatusRail.tsx:147+`

只在桌面 ≥1024px 可见，却和能够页签的特质网格完全重复。

建议先确认你是否经常在正文阅读时直接看左侧栏特质——这是唯一一处"删了可能变难用"的地方，所以列为待决（第 6 节问题 2）。属性区**建议保留**：它是当前唯一带明细的入口，且 C7 落地后两处行为会一致。

---

## 4. 不改的部分（明确记录，避免后续误伤）

- 页签数量与名称：`眼下 / 往事 / 关系 / 能力 / 身体装备 / 行囊`，及 `playerOnly` 过滤逻辑（`Ck3CharacterWindow.tsx:23-30、110-121`）。
- 页签切换时重置到"眼下"的行为（`Ck3CharacterWindow.tsx:66-68`）。
- 人物目录条（`CharacterDirectoryBar`）与其中的人物检索；关系页底部的人物检索**保留**——前者服务"当前场景在场者"，后者服务"全档案找人"，语义不同。
- `CharacterSearch` 的两处入口、`data-character-card` 等结构标记。
- `HealthAndEquipmentPanel` 的健康特质区（与能力页特质不重叠，见第 1 节排除项）。

---

## 5. 验证方案

**本次改动前基线（已实测）：**

- `npx tsc --noEmit` → 通过（exit 0）
- `node scripts/check-ck3-character-window.mjs` → **已失败 2 项**，与本次无关：
  - `NPC 人物栏缺少三项状态栏标记。`（`data-npc-status` 全仓库不存在，断言过时）
  - `统一面板没有区分主手与副手的人体高亮。`（实现改用 `body-model--right-upper/--left-upper`；这两组类名在 `index.css` 里指向同一组多边形，属重构改名而非回归）

**结论：这个检查脚本已经不能作为"改动是否破坏结构"的判据，只覆盖到 2026-09 的旧结构（例如它仍要求"关系与家族""健康与装备"等页签名，而代码早已改名）。**所以：

1. **先修脚本再改代码**：按当前结构更新 `check-ck3-character-window.mjs` 的过时断言（页签名、`data-npc-status`、手部高亮），使其恢复全绿。否则改完之后无法区分"我改坏的"和"本来就红的"。
2. 改动后跑：`npx tsc --noEmit`、`check:ck3-character-window`、`check:trait-display`（断言 `CharacterOverview.tsx` 的 `data-character-traits` 与 `<GameIcon icon={trait.icon}`，C7/C8 若动了该文件需复跑）、`check:no-emoji`、`check:icons`、`check:module-cycles`。
3. 新增去重断言（建议加进 `check-ck3-character-window.mjs`）：
   - `CharacterCurrentTab.tsx` 不再包含 `dossier.memories`
   - `CharacterIdentityHeader.tsx` 不再包含 `onOpenLocation`
   - `CharacterCurrentTab.tsx` 不再包含 `grid-cols-2` 的场景区与 `currentSeason`
4. **人工回归最小集**：桌面 ≥1024px 与 360px 各一遍，分别打开玩家自己、一个熟人 NPC、一个陌生人；检查项：位置只出现一次且能开地图、往事页记忆条数与改前一致、关系页共同经历仍在、六维悬停明细可开、ESC/返回/回到自己三个动作行为不变。

**环境限制（影响第 4 项）：**本机 `node_modules` 是 Windows 平台安装的（只有 `rollup-win32-*`、`esbuild-win32-x64`），WSL 下 `vite` 无法启动（`Cannot find module @rollup/rollup-linux-x64-gnu`），`dist/` 也停留在 2026-09-09。因此**我目前无法启动 dev server 截图自检**，第 4 项需要你在 Windows 侧跑 `npm run dev` 目视确认，或者授权我执行一次 `npm install` 安装 Linux 原生依赖（会改动 `node_modules`）。

---

## 6. 待你拍板的三件事

1. **眼下页要不要保留"共同经历"一行摘要？**（C6）删除更彻底，保留更连贯。
2. **桌面左侧栏的"全部特质"区块删还是留？**（C9）如果你常在阅读正文时瞄特质，就留。
3. **NPC 所在地的文案/代码矛盾怎么处理？**（C5 附注）当前文案声称"需由消息或会面确认"，代码却直接输出静态档案里的 `locationId`。选项：(a) 维持现状，只当文案是措辞；(b) 改为仅在获得相关事件/消息时显示，其余显示"所在地未确认"——符合设计文档，但要动 `characterDossier.ts` 的投影，属于本方案之外的功能改动；(c) 暂不处理，另开一项。

---

## 7. 影响面与工作量

| 文件 | 改动 |
|---|---|
| `src/components/character-window/CharacterIdentityHeader.tsx` | C1 C2，约 -20 行 / +3 行 |
| `src/components/character-window/CharacterCurrentTab.tsx` | C3 C4 C5 C6，约 -35 行 |
| `src/components/character-window/CharacterOverview.tsx` | C7 C8，约 ±25 行 |
| `src/components/character-window/CharacterAttributeHoverCard.tsx` | C7，签名放宽约 ±10 行 |
| `src/components/Ck3CharacterWindow.tsx` | C1 配套传参，-2 行 |
| `src/components/PlayerStatusRail.tsx` | C9（待定），-15 行 |
| `scripts/check-ck3-character-window.mjs` | 修过时断言 + 新增去重断言 |

预计净减约 60～90 行，无新增依赖，无数据层改动（除非第 6 节问题 3 选 b）。

改动顺序建议：**先修检查脚本并跑到全绿 → 再做 C1～C6（纯删减，风险最低）→ 最后做 C7 C8（涉及交互升级，需要目视确认）**。每一阶段结束跑一次 `tsc` + 检查脚本，便于定位回归。

---

## 8. 实施记录（已在代码中落地）

### 已完成的改动

| 文件 | 实际改动 | 行数变化 |
|---|---|---|
| `CharacterIdentityHeader.tsx` | 删掉所在地按钮与 NPC 保密文案、删掉重复的家族名小字、年龄与"已故"改为对玩家和 NPC 一致生效、移除不再使用的 `onOpenLocation` prop 与 `MapPin` 导入 | 114 → 100 |
| `CharacterCurrentTab.tsx` | 删掉整节"已知线索"（`dossier.memories`）、删掉"当前时点"卡片、位置改为单列并使用 `dossier.worldLocation`、"你们之间"收敛为最近一条 + 完整条数 | 203 → 199（另净减 5 个信息区块） |
| `CharacterOverview.tsx` | 六项属性接入 `CharacterAttributeHoverCard`，移除裸 `title`/`aria-label` 双重朗读，清理不再使用的 `getCk3SkillRank` 导入 | 110 → 117 |
| `CharacterAttributeHoverCard.tsx` | `items` 改为可选、新增 `isNpcArchive` 措辞分支、无装备时跳过装备加成聚合 | 200 → 207 |
| `Ck3CharacterWindow.tsx` | 停止向身份头部传 `onOpenLocation` | -1 |
| `check-ck3-character-window.mjs` | 更新 2 项过时断言、页签断言改为按当前信息架构、新增 6 条去重断言 | 110 → 140 |

### 实施期间做出的决定（与原方案不同处）

1. **C8（属性补中文小字）不做。**两个理由：一是左侧常驻状态栏已经为同一组属性提供了中文标签，再补一次就是新的重复，与本方案第 2 节的原则冲突；二是 `check-ck3-character-window.mjs` 有一条显式断言禁止把 `skill.label` 渲染成小字。属性名称改由悬停明细承担（`CharacterAttributeHoverCard` 的表头直接显示"外交 12"）。
2. **C6 采用"最近一条 + 完整条数"。**眼下页保留最近一次共同经历并附"另有 N 条共同经历，见'关系'页"。这里修掉了一个原方案没发现的计数缺陷：`sharedEvidence` 已被截断为 4 条，原来的写法会**少报**总条数，现已改用未截断的 `allSharedEvidence`。
3. **在场者的位置标签改用当前场景名。**原方案只说"统一到 `dossier.worldLocation`"，但 NPC 的 `dossier.location` 来自静态档案（可能是家族驻地），与"此刻站在你面前"互相矛盾。现在在场者一律显示 `activeScene.location.sceneLocation`，只有没有场景记录时才回退到档案地点。不在场者仍显示"所在地未确认"，未放宽历史行为。
4. **手部高亮断言按不变量重写，而非钉死类名。**`body-model--mainhand/--offhand` 与 `body-model--right-upper/--left-upper` 在 `index.css` 中指向同一组多边形，属重构改名。新断言校验"六个部位都有映射"且"映射出的类名在样式表里有定义"，比原来的字符串匹配更能抓到真实回归。
5. **"已故"标注从仅玩家扩展到 NPC。**原代码只在玩家分支显示存亡，已故 NPC 看起来仍可交谈。新的脚本断言要求 `dossier.alive` 同时覆盖两个分支。

### 验证结果（已实测）

- `npx tsc --noEmit` → 通过
- `node scripts/check-ck3-character-window.mjs` → **通过**（改动前为 2 项失败）
- `check-body-highlights`、`check-no-emoji`、`check-game-icons` → 通过
- `check-trait-display`、`check-module-cycles`、`check-ck3-attributes`、`check-trait-effects` → 仍失败，但均为**改动前既有**：这些脚本读取的是 `CharacterCreator.tsx`、`characterCommands.ts`、`creationTraitRules.ts` 等本次未触碰的文件（`check-trait-effects` 是 esbuild 在 node_modules 里的崩溃）。全仓库 40 余个检查脚本普遍存在同类历史漂移。

### 仍未完成

- **C9（左侧状态栏"全部特质"删留）**：未动，等你决定。删掉可再消除一处桌面端重复，但会减少阅读正文时的随手可查性。
- **目视回归**：本机 `node_modules` 为 Windows 平台安装，WSL 下 `vite` 无法启动，`dist/` 停留在 2026-09-09。方案第 5 节第 4 项（桌面 ≥1024px 与 360px 各一遍，玩家/熟人/陌生人各一次）**尚未执行**，需要你在 Windows 侧跑 `npm run dev`，或授权我在 WSL 里执行一次 `npm install` 安装 Linux 原生依赖。
- **第 6 节问题 3（NPC 所在地的文案/代码矛盾）**：未处理。`characterDossier.ts:313` 仍把静态档案的 `locationId` 写进 `dossier.location`；眼下页只是不再对不在场者显示它。
