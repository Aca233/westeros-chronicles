# Imported Character Trait Presentation Implementation Plan

**Goal:** 将 AGOT 离线人物原始特质稳定投影为中文可见特质、隐藏辅助修正、未成年特质和身份状态，杜绝机器 ID 进入界面。

**Architecture:** 原始数据保持不变，在数据目录新增纯函数策略层；可见定义并入现有 `CHARACTER_TRAITS`，NPC 卷宗和现成人物开局共用同一投影。独立审计脚本扫描开局存活人物的全部分片，作为数据变化时的失败门槛。

**Tech Stack:** TypeScript、React、Node.js `node:test`、esbuild、Vite。

---

### Task 1: 建立策略层和行为测试

**Files:**
- Create: `src/data/importedCharacterTraitPolicy.ts`
- Create: `scripts/test-imported-character-trait-policy.mjs`
- Modify: `package.json`

**Steps:**
1. 测试 16 岁门槛、隐藏辅助 ID、状态 ID、替换 ID 与去重。
2. 实现 `ImportedTraitPresentation`、`ImportedCharacterTraitPolicy`、策略索引和 `filterImportedCharacterTraits()`。
3. 运行 `npm run test:imported-trait-policy`。

### Task 2: 补齐开局存活人物的可见定义

**Files:**
- Create: `src/data/importedCharacterTraitDefinitions.ts`
- Modify: `src/data/characterTraits.ts`
- Modify: `scripts/test-character-trait-display.mjs`

**Steps:**
1. 为策略中 `display`、`status`、`childhood_only` 的输出添加中文名称、中文描述、类别、现有图标和基础属性修正。
2. 将导入定义合并进 `CHARACTER_TRAITS`，继续由现有规则装配逻辑补充角色扮演指令。
3. 测试高频 ID 能解析且不会生成旧存档占位特质。
4. 运行 `npm run test:character-trait-display` 与 `npm run check:trait-display`。

### Task 3: 接入 NPC 卷宗和现成人物开局

**Files:**
- Modify: `src/features/characters/characterDossier.ts`
- Modify: `src/features/characters/existingCharacterStart.ts`
- Modify: `src/types/game.ts`
- Modify: `scripts/test-character-dossier.mjs`
- Modify: `scripts/test-existing-character-start.mjs`

**Steps:**
1. 为卷宗加入 `hiddenModifierTraitIds` 与 `statusTraitIds`，NPC 按当前年龄投影；普通玩家默认空数组。
2. 为 `LordProfile` 加入 `importedTraitIds`，现成人物转玩家时保留完整原始 ID，同时只显示策略给出的可见 ID。
3. 测试成年人物隐藏童年特质、儿童显示童年特质、隐藏辅助 ID 不进入 UI、状态特质正常显示。
4. 运行人物卷宗和现成人物开局测试。

### Task 4: 新增全量开局特质审计

**Files:**
- Create: `scripts/check-imported-character-traits.mjs`
- Modify: `package.json`

**Steps:**
1. 扫描 `public/data/agot-characters/shards/*.json` 中开局已出生且存活人物。
2. 校验每个原始 ID 均被正式定义或明确策略覆盖；每个可见输出均能解析到中文定义；每个图标均对应 `public/assets/game-icons` 中的文件。
3. 将检查加入 `verify`，运行 `npm run check:imported-character-traits`。

### Task 5: 回归验证

**Steps:**
1. 运行 `npm run test:imported-trait-policy`、`npm run test:character-dossier`、`npm run test:existing-character-start`、`npm run test:character-runtime`。
2. 运行 `npm run check:trait-display`、`npm run check:trait-effects`、`npm run check:no-emoji`。
3. 运行 `npx tsc --noEmit`、`npm run build`、`npm run verify`。
4. 检查 `git diff`，不处理 `.claude/`，不提交、不合并、不推送。
