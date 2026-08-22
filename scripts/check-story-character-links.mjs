import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { build } from 'esbuild';

async function bundleModule(entryPoint) {
  const bundle = await build({ entryPoints: [entryPoint], bundle: true, write: false, format: 'esm', platform: 'node' });
  const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
  return import(url);
}

const { WESTEROS_ENTITIES } = await bundleModule('src/data/entities.ts');
const { buildStoryMentionEntities, findNextStoryEntity, supplementMentionedCharacterIds } = await bundleModule('src/features/world/storyEntityLinks.ts');
const storySource = await readFile('src/components/StoryFeed.tsx', 'utf8');
const appSource = await readFile('src/App.tsx', 'utf8');
const searchIndex = JSON.parse(await readFile('public/data/agot-characters/search-index.json', 'utf8'));
const knownIds = new Set(searchIndex.map((entry) => entry.id));
const characterContentFiles = (await readdir('public/data/world/character-content'))
  .filter((name) => name.endsWith('.json') && name !== 'index.json');
const characterContents = (await Promise.all(characterContentFiles
  .map((name) => readFile(`public/data/world/character-content/${name}`, 'utf8').then(JSON.parse))))
  .flatMap((shard) => Object.values(shard));
const contentByCharacter = new Map(characterContents.map((record) => [record.characterId, record]));
const characterEntities = WESTEROS_ENTITIES.filter((entity) => entity.category === 'character');

assert.ok(characterEntities.length > 0, '没有可点击的高亮人物条目');
for (const entity of characterEntities) {
  assert.match(entity.characterId ?? '', /^agot:[^:]+$/, `${entity.name} 缺少合法稳定人物 ID`);
  assert.ok(knownIds.has(entity.characterId), `${entity.name} 的人物 ID 不存在于 AGOT 数据集：${entity.characterId}`);
}
for (const entity of WESTEROS_ENTITIES.filter((entry) => entry.category !== 'character')) {
  assert.equal(entity.characterId, undefined, `${entity.name} 不是人物，不应触发人物栏跳转`);
}

for (const entity of WESTEROS_ENTITIES.filter((entry) => entry.category === 'location')) {
  assert.ok(entity.location?.locationId, `${entity.name} 缺少地图地点 ID`);
}
assert.ok(storySource.includes('data-story-character-link'), '文章高亮人物缺少可测试的点击标记');
assert.ok(storySource.includes('data-story-world-facts'), '正文没有展示统一回合事实。');
assert.ok(storySource.includes('data-story-fact-character'), '回合事实中的人物不能打开人物卷宗。');
assert.ok(storySource.includes('onSelectCharacter(entityToHover.characterId!)'), '文章高亮人物没有调用人物栏导航');
assert.match(appSource, /<StoryFeed[^>]*onSelectCharacter=\{openStoryCharacter\}/, 'App 没有把人物导航传给文章');
assert.ok(appSource.includes('openCharacterDrawer();'), '点击人物后不会切换到人物抽屉');
assert.ok(appSource.includes('<MapDrawer onSelectCharacter={openStoryCharacter} />'), '地图人物点没有复用人物卷宗导航');


const mentionEntities = buildStoryMentionEntities(
  '鲁温学士与罗德利克教头陪着艾莉亚前往君临。',
  [
    { id: 'agot:Stark_hh_1', name: '鲁温', canonTier: 'canon', born: true, alive: true, shard: 'df' },
    { id: 'agot:Cassel_3', name: '罗德利克', canonTier: 'canon', born: true, alive: true, shard: '7d' },
    { id: 'agot:Stark_9', name: '艾莉亚', dynastyId: 'dynn_Stark', canonTier: 'canon', born: true, alive: true, shard: 'e9' },
  ],
  [
    { id: 'b_the_red_keep', name: '君临·红堡', importance: 100, mapX: 1, mapY: 1, regionId: 'crownlands', type: 'city' },
  ],
  contentByCharacter,
);
for (const [keyword, id] of [['鲁温', 'agot:Stark_hh_1'], ['罗德利克教头', 'agot:Cassel_3'], ['艾莉亚', 'agot:Stark_9']]) {
  assert.ok(mentionEntities.some((entity) => entity.characterId === id && entity.keywords.includes(keyword)), `正文人物 ${keyword} 未生成稳定人物链接`);
}
assert.ok(mentionEntities.some((entity) => entity.location?.locationId === 'b_the_red_keep' && entity.keywords.includes('君临')), '君临未生成地图地点链接');
assert.ok(supplementMentionedCharacterIds('奈德走入大厅。', characterContents).includes('agot:Stark_3'), '人物别名奈德未解析为稳定人物 ID');
assert.equal(findNextStoryEntity('君临城门', mentionEntities)?.entity.location?.locationId, 'b_the_red_keep');

const tyrionPhrase = '巴利斯坦爵士与侏儒提利昂·兰尼斯特亦在大厅等候。';
const tyrionEntities = buildStoryMentionEntities(
  tyrionPhrase,
  [{ id: 'agot:Lannister_8', name: '提利昂', dynastyId: 'dynn_Lannister', canonTier: 'canon', born: true, alive: true, shard: '01' }],
  [],
  contentByCharacter,
);
const tyrionMatch = findNextStoryEntity(tyrionPhrase, [...WESTEROS_ENTITIES, ...tyrionEntities]);
assert.equal(tyrionMatch?.keyword, '侏儒提利昂·兰尼斯特', '同一人物的相邻别名与姓名不应被拆成两个连续链接');
assert.equal(tyrionMatch?.entity.characterId, 'agot:Lannister_8');

assert.ok(storySource.includes('data-story-location-link'), '正文地点缺少可测试的点击标记');
assert.ok(storySource.includes('onOpenLocation(entityToHover.location!)'), '正文地点没有调用地图导航');

console.log(`Validated ${characterEntities.length} clickable story character links against the AGOT dataset.`);
