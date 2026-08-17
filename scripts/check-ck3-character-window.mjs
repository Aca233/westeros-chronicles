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
const sheetSource = await read('src/components/CharacterSheet.tsx');
const itemManagementSource = await read('src/components/items/ItemManagementPanel.tsx');

if (!windowSource.includes('data-ck3-character-window')) failures.push('人物窗口缺少 CK3 根标记。');
if (!appSource.includes("import { Ck3CharacterWindow } from './components/Ck3CharacterWindow'")) failures.push('App 尚未导入 CK3 人物窗口。');
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
if (!windowSource.includes('<CharacterSearch')) failures.push('关系页缺少全人物档案检索入口。');
if (!windowSource.includes('data-npc-health')) failures.push('NPC 人物栏缺少独立健康视图。');
if (!windowSource.includes('data-npc-inventory')) failures.push('NPC 人物栏缺少独立物品空状态。');
if (!windowSource.includes("dossier.kind === 'player' ? <CharacterSheet embedded")) failures.push('玩家专属健康装备功能没有与 NPC 只读资料隔离。');
for (const tab of ['关系与家族', '健康与装备', '记忆与经历', '随身物品']) {
  if (!windowSource.includes(tab)) failures.push(`缺少页签：${tab}`);
}
if (!windowSource.includes('data-character-lower-tabs')) failures.push('四个功能页签没有放在人物概览下方。');
if (windowSource.includes("id: 'titles'") || windowSource.includes('function TitlesTab')) failures.push('第一版不应实现“头衔与宣称”页签。');
if (windowSource.includes('const ACTIONS') || windowSource.includes('人物互动')) failures.push('第一版不应实现右侧人物互动区。');
for (const relation of ['配偶', '继承人', '领主', '父亲', '母亲', '重要关系']) {
  if (!windowSource.includes(relation)) failures.push(`缺少关系人物卡：${relation}`);
}
if (!sheetSource.includes('embedded?: boolean')) failures.push('旧健康装备面板尚未提供嵌入模式。');
if (!windowSource.includes('<CharacterSheet embedded')) failures.push('健康与装备页签尚未接入装备功能。');
if (!windowSource.includes('<ItemManagementPanel')) failures.push('玩家物品页签没有接入集中物品管理。');
for (const marker of ["id: 'carried'", "id: 'current-site'", "id: 'vehicle'", "id: 'remote-site'", 'data-item-search', 'data-item-category-filter', 'data-item-sort']) {
  if (!itemManagementSource.includes(marker)) failures.push(`集中物品管理缺少 ${marker}。`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('CK3 人物窗口结构检查通过。');
