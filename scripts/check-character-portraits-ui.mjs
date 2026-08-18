import { readFile } from 'node:fs/promises';

const source = await readFile('src/components/CharacterPortrait.tsx', 'utf8');
const windowSource = await readFile('src/components/Ck3CharacterWindow.tsx', 'utf8');
const searchSource = await readFile('src/components/CharacterSearch.tsx', 'utf8');
const creatorSource = await readFile('src/components/CharacterCreator.tsx', 'utf8');
const failures = [];

if (!source.includes('CharacterPortraitRepository')) failures.push('统一头像组件没有读取本地头像仓储。');
if (!source.includes('onError')) failures.push('头像图片缺少加载失败回退。');
if (!source.includes("loading={priority ? 'eager' : 'lazy'}")) failures.push('非重点头像没有使用懒加载。');
if (!source.includes('<CameoPortrait')) failures.push('头像组件缺少浮雕剪影回退。');
if (!source.includes('<GameIcon')) failures.push('头像组件缺少家徽背景回退。');
if (!source.includes('objectPosition: portrait.focalPoint')) failures.push('头像组件没有应用人物焦点。');
if (source.includes('awoiaf.westeros.org')) failures.push('运行时头像组件不能直接访问 Wiki。');
if (!windowSource.includes('<CharacterPortrait') || !windowSource.includes('characterId={person.id}')) failures.push('人物卷宗主头像或关系卡没有接入统一头像。');
if (windowSource.includes('className="absolute inset-0 pb-7"')) failures.push('人物卷宗主头像不能用 absolute 覆盖组件内置的 relative 定位，否则肖像高度会坍缩。');
if (!windowSource.includes('className="h-full w-full pb-7"')) failures.push('人物卷宗主头像没有填满右侧肖像框。');
if (!searchSource.includes('<CharacterPortrait') || !searchSource.includes('characterId={hit.id}')) failures.push('人物搜索没有接入统一头像。');
if (!creatorSource.includes('<CharacterPortrait') || !creatorSource.includes('characterId={character.id}')) failures.push('推荐开局人物没有接入统一头像。');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('人物头像统一组件结构检查通过。');
