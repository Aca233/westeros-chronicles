import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

async function bundleModule(entryPoint) {
  const bundle = await build({ entryPoints: [entryPoint], bundle: true, write: false, format: 'esm', platform: 'node' });
  const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
  return import(url);
}

const { WESTEROS_ENTITIES } = await bundleModule('src/data/entities.ts');
const storySource = await readFile('src/components/StoryFeed.tsx', 'utf8');
const appSource = await readFile('src/App.tsx', 'utf8');
const searchIndex = JSON.parse(await readFile('public/data/agot-characters/search-index.json', 'utf8'));
const knownIds = new Set(searchIndex.map((entry) => entry.id));
const characterEntities = WESTEROS_ENTITIES.filter((entity) => entity.category === 'character');

assert.ok(characterEntities.length > 0, '没有可点击的高亮人物条目');
for (const entity of characterEntities) {
  assert.match(entity.characterId ?? '', /^agot:[^:]+$/, `${entity.name} 缺少合法稳定人物 ID`);
  assert.ok(knownIds.has(entity.characterId), `${entity.name} 的人物 ID 不存在于 AGOT 数据集：${entity.characterId}`);
}
for (const entity of WESTEROS_ENTITIES.filter((entry) => entry.category !== 'character')) {
  assert.equal(entity.characterId, undefined, `${entity.name} 不是人物，不应触发人物栏跳转`);
}

assert.ok(storySource.includes('data-story-character-link'), '文章高亮人物缺少可测试的点击标记');
assert.ok(storySource.includes('data-story-world-facts'), '正文没有展示统一回合事实。');
assert.ok(storySource.includes('data-story-fact-character'), '回合事实中的人物不能打开人物卷宗。');
assert.ok(storySource.includes('onSelectCharacter(entityToHover.characterId!)'), '文章高亮人物没有调用人物栏导航');
assert.ok(appSource.includes('<StoryFeed onSelectCharacter={openStoryCharacter} />'), 'App 没有把人物导航传给文章');
assert.ok(appSource.includes("window.matchMedia('(max-width: 1023px)').matches"), '移动端点击人物后不会自动打开人物抽屉');

console.log(`Validated ${characterEntities.length} clickable story character links against the AGOT dataset.`);
