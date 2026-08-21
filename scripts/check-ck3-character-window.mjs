import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const failures = [];

async function read(relativePath) {
  try {
    return await readFile(join(root, relativePath), 'utf8');
  } catch {
    failures.push(`缺少文件：${relativePath}`);
    return '';
  }
}

const windowSource = await read('src/components/Ck3CharacterWindow.tsx');
const appSource = await read('src/App.tsx');
const healthPanelSource = await read('src/components/items/HealthAndEquipmentPanel.tsx');
const itemManagementSource = await read('src/components/items/ItemManagementPanel.tsx');
const assetSectionsSource = await read('src/components/items/WorldAssetSections.tsx');
const dossierHookSource = await read('src/features/characters/useCharacterDossier.ts');

if (!windowSource.includes('data-ck3-character-window')) failures.push('人物窗口缺少 CK3 根标记。');
const importsCk3CharacterWindow = appSource.includes("import { Ck3CharacterWindow } from './components/Ck3CharacterWindow'")
  || /import\(\s*['"]\.\/components\/Ck3CharacterWindow['"]\s*\)/.test(appSource);
if (!importsCk3CharacterWindow) failures.push('App 尚未导入 CK3 人物窗口。');
if (!appSource.includes('<Ck3CharacterWindow')) failures.push('App 尚未使用 CK3 人物窗口。');
if (!windowSource.includes('CK3_SKILLS.map')) failures.push('人物窗口没有渲染 CK3 六项属性。');
if (!windowSource.includes('data-character-identity-layout="split"')) failures.push('人物身份区没有使用左侧信息、右侧头像的双栏布局。');
if (!windowSource.includes('data-character-portrait-side="right"')) failures.push('人物头像没有固定在身份区右侧。');
if (!windowSource.includes('className="min-w-0 text-left"')) failures.push('人物顶部身份信息没有左对齐。');
if (!windowSource.includes('<GameIcon icon={skill.icon}')) failures.push('六项属性没有优先使用游戏图标。');
if (/text-(?:3xl|4xl|5xl)[^"']*[^\n]*\{value\}/.test(windowSource)) failures.push('属性数字字号过大。');
if (windowSource.includes('{skill.label}</span>') || windowSource.includes('{skill.label}</small>')) failures.push('属性区重复显示了外交、军事等小字。');
if (!windowSource.includes('resolveCharacterTraits')) failures.push('人物窗口没有使用正式特质解析与教育特质优先排序。');
const portraitIndex = windowSource.indexOf('aria-label="人物肖像"');
const traitSectionIndex = windowSource.indexOf('data-character-traits');
const attributesIndex = windowSource.indexOf('aria-label="人物属性"');
if (portraitIndex < 0 || traitSectionIndex < portraitIndex || (attributesIndex >= 0 && traitSectionIndex > attributesIndex)) {
  failures.push('特质区必须位于人物头像下方、六项属性上方。');
}
for (const marker of ['dossier.name', 'dossier.title', 'dossier.house', 'dossier.culture', 'dossier.faith', 'dossier.location', 'dossier.age']) {
  if (!windowSource.includes(marker)) failures.push(`通用人物身份区缺少 ${marker}。`);
}
for (const prop of ['selectedCharacterId', 'onSelectCharacter', 'onBack', 'onReturnToPlayer']) {
  if (!windowSource.includes(prop)) failures.push(`人物窗口缺少通用人物导航参数 ${prop}。`);
}
if (!windowSource.includes('useCharacterDossier')) failures.push('人物窗口没有接入通用玩家/NPC 档案加载器。');
if (!windowSource.includes('data-character-card')) failures.push('关系人物卡尚不能打开对应人物档案。');
if (!windowSource.includes('data-character-children')) failures.push('关系页缺少完整子女分组。');
if (!windowSource.includes('data-character-siblings')) failures.push('关系页缺少完整兄弟姐妹分组。');
if (!windowSource.includes("group: 'sibling'")) failures.push('人物关系卡没有兄弟姐妹分组。');
if (!windowSource.includes('canonicalCharacterId: lord.canonicalCharacterId')) failures.push('现成人物关系没有使用稳定人物 ID。');
if (!windowSource.includes('当前时间线未公开')) failures.push('琼恩的未公开母亲关系缺少时间线安全文案。');
if (!windowSource.includes('显示全部子女')) failures.push('大量子女没有展开入口。');
if (windowSource.includes('return cards.slice(0, 8)')) failures.push('NPC 关系仍被八张卡片上限截断。');
if (!windowSource.includes('<CharacterSearch')) failures.push('关系页缺少全人物档案检索入口。');
if (!healthPanelSource.includes('data-npc-health')) failures.push('NPC 人物栏缺少独立健康视图。');
if (!healthPanelSource.includes('data-npc-equipment-state')) failures.push('NPC 健康页缺少实际穿戴状态区域。');
if (!healthPanelSource.includes('dossier.assetGroups.equipment')) failures.push('健康页没有读取统一世界选择器判定的实际穿戴。');
if (!windowSource.includes('data-character-world-facts')) failures.push('NPC 经历页没有读取统一世界历史事实。');
if (!healthPanelSource.includes('当前没有记录此人实际穿戴的装备')) failures.push('NPC 健康页没有明确区分实际穿戴与物品归属。');
if (windowSource.includes('listCharacterRecordedEquipment')) failures.push('NPC 健康页不应把归属人物的世界装备当作实际穿戴。');
if (windowSource.includes('data-npc-recorded-items') || windowSource.includes('data-recorded-equipment') || windowSource.includes('>未穿戴<')) failures.push('NPC 健康页仍在显示未穿戴的归属物品。');
if (!windowSource.includes('data-character-world-assets')) failures.push('人物栏缺少玩家与 NPC 共用的物品资产区域。');
if (!windowSource.includes('<WorldAssetSections')) failures.push('物品与资产页没有使用统一世界资产分组。');
if (!assetSectionsSource.includes('data-world-asset-sections')) failures.push('物品与资产页缺少统一资产记录区域。');
if (!dossierHookSource.includes('dossier.character.items')) failures.push('NPC 人物卷宗没有把人物投影后的普通物品接入世界基线。');
if (!windowSource.includes('法理所有、实际控制、直接保管、物理位置与装备状态分别记录')) failures.push('人物物品与资产页没有区分各类世界关系。');
if (windowSource.includes("id: 'inventory', label: '随身物品'")) failures.push('人物卷宗页签不应再命名为“随身物品”。');
if (!windowSource.includes('data-npc-status')) failures.push('NPC 人物栏缺少三项状态栏标记。');
if (windowSource.includes('value={dossier.titles.length} label="头衔"')) failures.push('NPC 状态栏不应重复显示头衔数量。');
if (!windowSource.includes('<HealthAndEquipmentPanel dossier={dossier} embedded')) failures.push('玩家与 NPC 没有统一使用健康与装备面板。');
if (windowSource.includes('state.gameState.worldArtifacts')) failures.push('人物窗口不应直接订阅原始世界神器状态。');
if (windowSource.includes("dossier.kind === 'player' ? <CharacterSheet embedded")) failures.push('健康与装备页仍保留玩家旧面板分支。');
for (const tab of ['关系与家族', '健康与装备', '记忆与经历', '物品与资产']) {
  if (!windowSource.includes(tab)) failures.push(`缺少页签：${tab}`);
}
if (!windowSource.includes('data-character-lower-tabs')) failures.push('四个功能页签没有放在人物概览下方。');
if (windowSource.includes("id: 'titles'") || windowSource.includes('function TitlesTab')) failures.push('第一版不应实现“头衔与宣称”页签。');
if (windowSource.includes('const ACTIONS') || windowSource.includes('人物互动')) failures.push('第一版不应实现右侧人物互动区。');
for (const relation of ['配偶', '继承人', '领主', '父亲', '母亲', '重要关系']) {
  if (!windowSource.includes(relation)) failures.push(`缺少关系人物卡：${relation}`);
}
if (!healthPanelSource.includes('data-hand-pair')) failures.push('NPC 主手与副手没有使用对称手部布局。');
if (!healthPanelSource.includes('body-model--mainhand') || !healthPanelSource.includes('body-model--offhand')) failures.push('统一面板没有区分主手与副手的人体高亮。');
if (!windowSource.includes('<ItemManagementPanel')) failures.push('玩家物品页签没有接入集中物品管理。');
for (const marker of ["id: 'carried'", "id: 'current-site'", "id: 'vehicle'", "id: 'remote-site'", 'data-item-search', 'data-item-category-filter', 'data-item-sort']) {
  if (!itemManagementSource.includes(marker)) failures.push(`集中物品管理缺少 ${marker}。`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('CK3 人物窗口结构检查通过。');
