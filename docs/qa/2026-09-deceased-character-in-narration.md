# 已故人物被写成在场角色

状态：**已修复并验证**（提示词层）。发现于玩家报告"琼恩·艾林不是死了吗，怎么还出现在正文"。

## 症状

正文把已故人物写成在场可交谈的角色。人物档案页、关系页、人物检索都显示他已故，**只有正文不认**——同一个界面里两套互相矛盾的真相。

## 根因

经实测确认：数据、时间线、投影都是对的，缺陷只在**提示词序列化**这一步。

1. 世界 manifest（`public/data/world/manifest.json`）的 `startDate` 是 **298.5.10**，这就是真实开局日。
   `useGameStore.ts` 的 `INITIAL_WORLD_DATE` 同为 298.5.10。
   （角色数据集 manifest 里的 `8298.1.1` 是另一套日期尺度，**不用于开局**，曾据此误判过一次，见下。）
2. 琼恩·艾林的死亡节点 `evt_298_04_01` 在 **298.4.5**，早于开局日。因此
   `initializeCanonicalStates`（`canonicalTimeline.ts`，判据 `compareWorldDates(event.date, startDate) < 0`）
   **已经**把它标为 `historical`。
3. `projectCharacterLifeFacts`（`characterWorldFacts.ts:41`，只认 `historical` / `occurred`）
   因此把他的 `alive` 投影为 `false`、`deathDate` 为 `298.4.5`。**投影是正确的。**
4. `worldTurnContext.ts` 也**确实**调用了 `projectResolvedCharacterWorldFacts` 并得到了 `alive`。
5. **真实病根**：`characterPromptSlice.ts` 的 `formatFullCard` / `formatCompactCard` 从不输出存亡状态。
   模型收到的人物卡只有 ID、姓名、公开身份、地点、关系、特质、目标、记忆、知识——
   已故者与活人的卡片**结构完全一样**。于是模型把这位前首相写成在场角色。

`src/data/entities.ts` 里的实体高亮反而是对的（tag 写着"前首相 · 鹰巢城公爵 (已故)"），
进一步印证"面板说死了、正文说活着"的分裂来自提示词而非数据。

### 被推翻的早期假设（不要重复这个错误）

第一轮分析判断为"开局分界与调度窗口之间存在夹缝"：

- `initializeCanonicalStates` 用严格 `<`，只认**开局日之前**为历史；
- `resolveDueCanonicalEvents` 只结算**晚于当前日期**的事件（`(from, to]` 半开区间）。

据此认为正好落在开局当天的事件既非历史、又永远排不到期，永久不可达，琼恩·艾林因此一直是活人。

**这个判断是错的。**实测把判据改成 `<=` 后，验证脚本输出**完全不变**——因为 298.4.5 本来就早于
298.5.10，走的是 `<` 的 historical 分支。该改动已回退，`canonicalTimeline.ts` 未做任何改动。

教训：我当时用了一个**重实现比较逻辑**的验证脚本，且没有先验证"改动前该脚本会失败"，
所以"改动后通过"不能证明任何事。现在的检查脚本改为导入真实实现，并补做了反向验证。

## 修复

| 文件 | 改动 |
|---|---|
| `src/features/characters/characterPromptSlice.ts` | 新增 `lifeStatusText()`；完整卡与轻量卡各输出一行存亡；`CharacterPromptCandidate` 增加 `alive` / `deathDate` |
| `src/features/world/worldTurnContext.ts` | 候选对象补上 `alive: character.alive` 与 `deathDate: character.deathDate ?? null` |
| `scripts/check-prompt-life-status.mjs` | 新增检查（`npm run check:prompt-life-status`） |
| `scripts/lib/ts-strip-resolve.mjs` | 新增：让 `node --experimental-strip-types` 能解析项目里无扩展名的相对 import，使检查脚本可以直接导入真实实现 |

模型现在收到的是：

```
##### 完整人物
- 稳定人物 ID: agot:Arryn_3
- 姓名: 琼恩
- 公开身份: 鹰巢城公爵
- 存亡: 已故（卒于 298.4.5 AC），不可作为在场角色出现
```

只输出**存亡与死亡日期**。`deathReason` 与 `killerId` 可能是尚未获知的秘密（例如小指头主使下毒），
检查脚本明令禁止它们进入提示词。

## 验证

```
npx tsc --noEmit                              通过
npm run check:prompt-life-status              通过（新增）
npm run check:ck3-character-window            通过
npm run check:world-timeline                  通过
check-body-highlights / no-emoji / game-icons / current-equipment   通过
```

**反向验证**：删掉 `characterPromptSlice.ts` 里的存亡输出行后，新检查立即报出 5 条失败
（完整卡缺已故、缺死亡日期、缺禁止在场表述、缺在世标注、轻量卡缺已故），确认它真的在测行为。

仍未由机器验证的部分：真实回合里模型是否**遵守**这行指令。这需要跑实际对局观察。

## 教训

`scripts/check-world-timeline.mjs` 只做源码正则匹配（如 `/historical:[^\n]*开局前历史/`），
对"实现正确但语义缺失"这类缺陷完全无效——所以这个 bug 一路漏到了玩家手里。
**同类新增检查应导入真实实现并断言真实输出，且必须先确认它在缺陷存在时会失败。**
