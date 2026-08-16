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

if (!windowSource.includes('data-ck3-character-window')) failures.push('人物窗口缺少 CK3 根标记。');
if (!appSource.includes("import { Ck3CharacterWindow } from './components/Ck3CharacterWindow'")) failures.push('App 尚未导入 CK3 人物窗口。');
if (!appSource.includes('<Ck3CharacterWindow />')) failures.push('App 尚未使用 CK3 人物窗口。');
if (!windowSource.includes('CK3_SKILLS.map')) failures.push('人物窗口没有渲染 CK3 六项属性。');
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
for (const marker of ['lord.name', 'lord.title', 'lord.house', 'lord.culture', 'lord.faith', 'lord.location', 'lord.age']) {
  if (!windowSource.includes(marker)) failures.push(`人物身份区缺少 ${marker}。`);
}
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
if (!windowSource.includes('<CharacterSheet embedded')) failures.push('健康与装备页签尚未接入旧功能。');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('CK3 人物窗口结构检查通过。');
