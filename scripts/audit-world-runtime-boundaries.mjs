import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const ROOT = resolve('src');
const files = [];
function walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = resolve(directory, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(?:ts|tsx)$/.test(name)) files.push(path);
  }
}
walk(ROOT);

const normalized = (file) => relative(process.cwd(), file).replaceAll('\\', '/');
const failures = [];
function report(file, rule, detail) {
  failures.push(`${normalized(file)}: ${rule}: ${detail}`);
}
function scan(rule, pattern, allowed) {
  for (const file of files) {
    const path = normalized(file);
    const text = readFileSync(file, 'utf8');
    if (pattern.test(text) && !allowed.some((entry) => path === entry || path.startsWith(`${entry}/`))) {
      report(file, rule, pattern.source);
    }
  }
}

scan(
  'UI 或业务代码不得直接读取世界唯一物品原始表',
  /worldArtifacts(?:\?\.|\.)artifacts|\.worldArtifacts(?:\?\.|\.)artifacts/,
  ['src/features/world/worldBaseline.ts', 'src/features/world/worldDisplayResolver.ts', 'src/data/generated', 'src/features/items/worldArtifacts.ts'],
);
scan(
  '物品位置写入只能发生在物品归约器或统一事务适配器',
  /(?:\.placements\s*\[[^\]]+\]\s*=|delete\s+[^;\n]*\.placements\s*\[)/,
  [
    'src/features/items/actions.ts',
    'src/features/items/custody.ts',
    'src/features/items/equipment.ts',
    'src/features/world/worldTransactions.ts',
    'src/features/characters/customRulerStart.ts',
    'src/features/world/worldStartState.ts',
    'src/features/characters/existingCharacterStart.ts',
  ],
);
for (const path of ['src/features/map/dynamicMapSubjects.ts']) {
  const text = readFileSync(path, 'utf8');
  if (/StaticCharacterRepository|loadCharacterShard|loadAllCharacters|for\s*\([^)]*characterShard/i.test(text)) {
    report(resolve(path), '地图点位投影不得加载静态人物仓储或遍历人物分片', '静态人物全量读取');
  }
}
scan(
  '世界事实只能由统一世界事件投影生成',
  /(?:const|let)\s+\w+\s*:\s*WorldEventFact\s*=\s*\{/,
  ['src/services/turn/legacySettlement.ts', 'src/services/turn/settlement.ts', 'src/features/world/worldHistory.ts'],
);

const lordLocationAllowlist = new Set([
  'src/services/turn/legacySettlement.ts',
  'src/services/turn/settlement.ts',
  'src/services/turn/worldPreparation.ts',
  'src/services/stateReducer.ts',
  'src/features/world/createLivingWorldGame.ts',
  'src/features/world/worldTurnContext.ts',
  'src/features/world/worldDisplayResolver.ts',
  'src/features/world/useWorldEventDisplays.ts',
  'src/features/characters/useCharacterDossier.ts',
  'src/components/character-window/CharacterCurrentTab.tsx',
  'src/features/debug/DebugOverlay.tsx',
  'src/features/map/TravelPlanner.tsx',
  'src/features/map/JourneyPanel.tsx',
  'src/features/map/MapDrawer.tsx',
  'src/components/items/ItemManagementPanel.tsx',
  'src/components/CharacterCreator.tsx',
  'src/components/items/EquipmentPanel.tsx',
  'src/features/items/saveVersion.ts',
  'src/services/api.ts',
  'src/services/promptBuilder.ts',
  'src/services/attemptPolicy.ts',
  'src/store/useGameStore.ts',
]);
for (const file of files) {
  const path = normalized(file);
  const text = readFileSync(file, 'utf8');
  if (/lord\.location/.test(text) && !lordLocationAllowlist.has(path)) {
    report(file, 'lord.location 只能留在明确的基线、事务或旧界面适配器', 'lord.location');
  }
}

for (const file of files) {
  const path = normalized(file);
  if (!path.startsWith('src/features/map/') && !path.startsWith('src/features/world/') && !path.startsWith('src/services/')) continue;
  const text = readFileSync(file, 'utf8');
  if (/SteamApps|steamapps|workshop\/content|api\.fandom|fetch\(['"]https?:/i.test(text)) {
    report(file, '运行时不得读取 Steam、Workshop 或网络导入源', '外部运行时数据源');
  }
}

if (failures.length) {
  console.error('统一世界权威边界审计失败：');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`统一世界权威边界审计通过：检查 ${files.length} 个运行时源文件。`);
