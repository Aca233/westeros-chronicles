import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: "export * from './src/features/world/worldDisplayResolver.ts';",
    resolveDir: process.cwd(), sourcefile: 'world-display-resolver-test-entry.ts', loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { resolveWorldEventDisplay } = await import(url);

const event = {
  id: 'event:1', transactionId: 'tx:1', turn: 1, date: { year: 298, month: 5, day: 10 },
  type: 'command.change_location', actorIds: ['agot:Stark_3'],
  subjectRefs: [
    { type: 'character', characterId: 'agot:Baratheon_2' },
    { type: 'location', location: { locationId: 'b_winterfell' } },
    { type: 'title', titleId: 'k_north' },
    { type: 'asset', assetId: 'world-item:world.artifact.longclaw' },
  ],
  reason: '艾德带劳勃前往临冬城，长爪仍由守卫保管。', source: 'ai_resolution', visibility: 'public',
};
const repositories = {
  characterNames: async () => new Map([['agot:Stark_3', '艾德·史塔克'], ['agot:Baratheon_2', '劳勃·拜拉席恩']]),
  locationNames: async () => new Map([['b_winterfell', '临冬城']]),
  titleNames: async () => new Map([['k_north', '北境王国']]),
  assetNames: () => new Map([['world-item:world.artifact.longclaw', '瓦雷利亚钢长剑“长爪”']]),
};
const display = await resolveWorldEventDisplay(event, repositories);
assert.equal(display.title, '艾德带劳勃前往临冬城，长爪仍由守卫保管。');
assert.deepEqual(display.entities.map((entity) => entity.label), [
  '艾德·史塔克', '劳勃·拜拉席恩', '临冬城', '北境王国', '瓦雷利亚钢长剑“长爪”',
]);
assert.equal(display.audit.eventType, 'command.change_location');
assert.doesNotMatch(display.title, /command|CHANGE_LOCATION|已确认命令/i);

const unresolved = await resolveWorldEventDisplay({ ...event, id: 'event:2', actorIds: [], subjectRefs: [{ type: 'asset', assetId: 'asset:missing' }] }, {
  characterNames: async () => new Map(), locationNames: async () => new Map(), titleNames: async () => new Map(), assetNames: () => new Map(),
});
assert.equal(unresolved.entities[0].label, event.reason, 'unresolved refs must fall back to natural-language evidence');
assert.doesNotMatch(unresolved.entities[0].label, /asset:missing/);

for (const file of ['src/components/StoryFeed.tsx', 'src/components/TvTimelineModal.tsx', 'src/components/Ck3CharacterWindow.tsx']) {
  const source = await readFile(file, 'utf8');
  assert.match(source, /useWorldEventDisplays/, `${file} must resolve canonical display names`);
  assert.doesNotMatch(source, />查看人物</);
  assert.doesNotMatch(source, />查看地点</);
  assert.doesNotMatch(source, />查看资产</);
}

console.log('World display resolver tests passed.');
