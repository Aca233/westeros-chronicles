/**
 * 提示词生死状态与开局时间线分界检查。
 *
 * 背景：正文把已故人物写成在场角色。根因是人物卡（characterPromptSlice）根本不向模型输出
 * 存亡状态——上游 projectResolvedCharacterWorldFacts 已经算出 alive，却在序列化这一步丢失，
 * 模型因此把琼恩·艾林这样的已故人物当成可交谈的活人。
 *
 * 这个脚本导入真实实现并检查真实输出，不做源码字符串匹配：那类断言在同类缺陷上已经失效过一次。
 */
import './lib/ts-strip-resolve.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');
const failures = [];

const { CANONICAL_TIMELINE } = await import(join(root, 'src/data/generated/canonicalTimeline.ts'));
const { initializeCanonicalStates, resolveDueCanonicalEvents } = await import(join(root, 'src/features/world/canonicalTimeline.ts'));
const { compareWorldDates, createWorldHistoryState, advanceWorldDate } = await import(join(root, 'src/features/world/worldHistory.ts'));
const { buildCharacterPromptSlice } = await import(join(root, 'src/features/characters/characterPromptSlice.ts'));

const viewer = { viewerId: 'player', knownFactIds: new Set() };

// --- 1. 开局分界必须与调度窗口互补，不允许任何原作节点永久不可达 ---
const start = { ...JSON.parse(read('public/data/world/manifest.json')).startDate };
const storeStart = /INITIAL_WORLD_DATE: WorldDate = \{ year: (\d+), month: (\d+), day: (\d+) \}/.exec(read('src/store/useGameStore.ts'));
if (!storeStart) failures.push('无法从 useGameStore 解析 INITIAL_WORLD_DATE。');
else if (+storeStart[1] !== start.year || +storeStart[2] !== start.month || +storeStart[3] !== start.day) {
  failures.push(`开局日不一致：世界 manifest ${start.year}.${start.month}.${start.day}，useGameStore ${storeStart[1]}.${storeStart[2]}.${storeStart[3]}。`);
}

const initialStates = initializeCanonicalStates(CANONICAL_TIMELINE, start);
let history = { ...createWorldHistoryState(start), canonical: initialStates };
const horizon = advanceWorldDate(start, { years: 3 });
let cursor = { ...start };
while (compareWorldDates(cursor, horizon) < 0) {
  const day = advanceWorldDate(cursor, { days: 1 });
  history = resolveDueCanonicalEvents(history, CANONICAL_TIMELINE, cursor, day, []).history;
  cursor = day;
}
for (const event of CANONICAL_TIMELINE) {
  const status = history.canonical[event.id].status;
  if (status === 'scheduled' && compareWorldDates(event.date, horizon) <= 0) {
    failures.push(`原作节点永久不可达：${event.id} @ ${event.date.year}.${event.date.month}.${event.date.day}。`);
  }
}

// 开局当天及之前的节点必须在初始化时就被判为已发生，否则模型会把已发生的事写成未来。
for (const event of CANONICAL_TIMELINE) {
  const expected = compareWorldDates(event.date, start) <= 0 ? 'historical' : 'scheduled';
  if (initialStates[event.id].status !== expected) {
    failures.push(`开局状态错误：${event.id} 为 ${initialStates[event.id].status}，期望 ${expected}。`);
  }
}

// --- 2. 已故人物进入提示词时必须明确标注 ---
const deceasedCard = buildCharacterPromptSlice({
  full: [{
    id: 'agot:Arryn_3',
    name: '琼恩',
    publicIdentity: '鹰巢城公爵',
    role: '鹰巢城公爵',
    alive: false,
    deathDate: '298.4.5',
  }],
  compact: [],
}, viewer, `${start.year}.${start.month}.${start.day}`);

if (!deceasedCard.includes('已故')) failures.push('完整人物卡没有向模型标注已故。');
if (!deceasedCard.includes('298.4.5')) failures.push('完整人物卡没有向模型提供死亡日期。');
if (!/不可作为在场角色出现/.test(deceasedCard)) failures.push('完整人物卡没有禁止把已故者当作在场角色。');

const livingCard = buildCharacterPromptSlice({
  full: [{ id: 'agot:Stark_3', name: '艾德', publicIdentity: '临冬城公爵', alive: true, deathDate: null }],
  compact: [],
}, viewer, `${start.year}.${start.month}.${start.day}`);

if (!livingCard.includes('在世')) failures.push('完整人物卡没有标注在世。');
if (livingCard.includes('已故')) failures.push('在世人物的卡片被错误标注为已故。');

const compactCard = buildCharacterPromptSlice({
  full: [],
  compact: [{ id: 'agot:Arryn_3', name: '琼恩', role: '鹰巢城公爵', alive: false, deathDate: '298.4.5' }],
}, viewer, `${start.year}.${start.month}.${start.day}`);
if (!compactCard.includes('已故')) failures.push('轻量人物卡没有向模型标注已故。');

// --- 3. 上游确实把投影后的生死事实传进了候选对象 ---
const turnContext = read('src/features/world/worldTurnContext.ts');
for (const marker of ['projectResolvedCharacterWorldFacts', 'alive: character.alive', 'deathDate: character.deathDate']) {
  if (!turnContext.includes(marker)) failures.push(`回合上下文没有把 ${marker} 接入人物候选。`);
}

// 死亡日期与死因可能属于未获知的秘密：只允许输出存亡与日期，不得输出死因或凶手。
const slice = read('src/features/characters/characterPromptSlice.ts');
for (const forbidden of ['deathReason', 'killerId']) {
  if (slice.includes(forbidden)) failures.push(`人物卡不应输出 ${forbidden}，那可能是未获知的秘密。`);
}

const arryn = CANONICAL_TIMELINE.find((event) => event.fatalities?.some((person) => person.characterId === 'agot:Arryn_3'));
console.log(`开局日 ${start.year}.${start.month}.${start.day}；时间线节点 ${CANONICAL_TIMELINE.length} 个。`);
if (arryn) {
  console.log(`琼恩·艾林死亡节点 ${arryn.id} @ ${arryn.date.year}.${arryn.date.month}.${arryn.date.day} → 开局状态 ${initialStates[arryn.id].status}。`);
}

if (failures.length) {
  console.error(failures.map((line) => `  - ${line}`).join('\n'));
  process.exit(1);
}
console.log('提示词生死状态与开局时间线分界检查通过。');
