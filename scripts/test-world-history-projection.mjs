import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: "export * from './src/features/world/worldHistoryProjection.ts';",
    resolveDir: process.cwd(), sourcefile: 'world-history-projection-test-entry.ts', loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { factsForCharacter, projectActualTimeline, projectCanonicalTimeline, projectNpcAssets, projectNpcEquipment, visibleAssetsForCharacter, visibleEquipmentForCharacter } = await import(url);

const marriage = { id: 'marriage', turn: 2, date: { year: 298, month: 5, day: 10 }, source: 'character', kind: 'command.marry_characters', title: '婚姻成立', summary: '两人结婚', participantIds: ['agot:a', 'agot:b'], commandTypes: ['MARRY_CHARACTERS'] };
const death = { id: 'death', turn: 3, date: { year: 298, month: 5, day: 12 }, source: 'character', kind: 'character.death', title: '人物死亡', summary: '甲死亡', participantIds: ['agot:a'], commandTypes: ['KILL_CHARACTER'] };
const history = {
  schemaVersion: 1,
  startDate: { year: 298, month: 5, day: 1 },
  canonical: {
    canon_past: { eventId: 'canon_past', status: 'historical' },
    canon_diverged: { eventId: 'canon_diverged', status: 'diverged', resolvedOn: { year: 298, month: 5, day: 15 }, reason: '关键人物提前死亡' },
  },
  turns: [{ turn: 2, action: '', startedOn: { year: 298, month: 5, day: 10 }, resolvedOn: { year: 298, month: 5, day: 12 }, acceptedCommands: [], rejectedCommands: [], facts: [marriage, death], canonicalTransitions: [] }],
};
const schedule = [
  { id: 'canon_past', date: { year: 298, month: 4, day: 5 }, title: '过去节点', summary: '过去', region: '北境', category: 'intrigue', participants: [], fatalities: [], consequences: [] },
  { id: 'canon_diverged', date: { year: 298, month: 5, day: 15 }, title: '偏离节点', summary: '原定事件', region: '君临', category: 'death', participants: [], fatalities: [], consequences: [] },
];
assert.deepEqual(factsForCharacter(history, 'agot:a').map((fact) => fact.id), ['marriage', 'death']);
assert.deepEqual(factsForCharacter(history, 'agot:b').map((fact) => fact.id), ['marriage']);
const actual = projectActualTimeline(history, schedule);
assert.ok(actual.some((event) => event.id === 'canon_past' && event.status === 'historical'));
assert.ok(actual.some((event) => event.id === 'marriage' && event.source === 'character'));
assert.ok(actual.some((event) => event.id === 'death'));
const canon = projectCanonicalTimeline(history, schedule);
assert.equal(canon.find((event) => event.id === 'canon_diverged').status, 'diverged');
assert.equal(canon.find((event) => event.id === 'canon_diverged').reason, '关键人物提前死亡');

const artifacts = {
  schemaVersion: 1, startDate: '8298.1.1', datasetHash: 'a'.repeat(64), artifactDatasetHash: 'b'.repeat(64), characterDatasetHash: 'c'.repeat(64),
  artifacts: {
    owned: { instanceId: 'owned', definitionId: 'artifact.longclaw', lawfulControllerId: 'agot:a', placement: { type: 'character', characterId: 'agot:a' }, equipped: false, source: { file: '', line: 1, effectId: '' } },
    worn: { instanceId: 'worn', definitionId: 'artifact.ice', lawfulControllerId: 'agot:a', placement: { type: 'character', characterId: 'agot:a' }, equipped: true, source: { file: '', line: 1, effectId: '' } },
    custodied: { instanceId: 'custodied', definitionId: 'artifact.custodied', lawfulControllerId: 'agot:b', placement: { type: 'character', characterId: 'agot:a' }, equipped: false, source: { file: '', line: 1, effectId: '' } },
    titleAsset: { instanceId: 'titleAsset', definitionId: 'artifact.title', lawfulControllerId: 'agot:a', placement: { type: 'title', titleId: 'k_north', controllerId: 'agot:a' }, equipped: false, source: { file: '', line: 1, effectId: '' } },
    unrelated: { instanceId: 'unrelated', definitionId: 'artifact.unrelated', lawfulControllerId: 'agot:b', placement: { type: 'character', characterId: 'agot:b' }, equipped: false, source: { file: '', line: 1, effectId: '' } },
  },
};
assert.deepEqual(visibleEquipmentForCharacter(artifacts, 'agot:a').map((record) => record.instanceId), ['worn']);
assert.deepEqual(visibleAssetsForCharacter(artifacts, 'agot:a').map((record) => record.instanceId).sort(), ['custodied', 'owned', 'titleAsset', 'worn']);



const ordinaryItems = [
  { instanceId: 'ordinary-worn', definitionId: 'clothing.common_linen_tunic', ownerId: 'agot:a', custody: { type: 'character', characterId: 'agot:a' }, equippedPosition: { group: 'torso', layer: 'garment' }, source: 'baseline_template' },
  { instanceId: 'ordinary-held', definitionId: 'clothing.plain_wool_cloak', ownerId: 'agot:a', custody: { type: 'character', characterId: 'agot:a' }, source: 'story_event' },
  { instanceId: 'ordinary-custody', definitionId: 'footwear.leather_turnshoes', ownerId: 'agot:b', custody: { type: 'character', characterId: 'agot:a' }, source: 'story_event' },
  { instanceId: 'duplicate-special', definitionId: 'clothing.common_linen_tunic', ownerId: 'agot:a', custody: { type: 'character', characterId: 'agot:a' }, source: 'story_event' },
];
const mergedArtifacts = structuredClone(artifacts);
mergedArtifacts.artifacts['artifact.duplicate'] = {
  instanceId: 'duplicate-special', definitionId: 'artifact.duplicate', lawfulControllerId: 'agot:a',
  placement: { type: 'character', characterId: 'agot:a' }, equipped: false, source: { file: '', line: 1, effectId: '' },
};
mergedArtifacts.artifacts['artifact.dynasty'] = {
  instanceId: 'dynasty-asset', definitionId: 'artifact.dynasty', lawfulControllerId: 'agot:b',
  placement: { type: 'dynasty', dynastyId: 'dynn_stark' }, equipped: false, source: { file: '', line: 1, effectId: '' },
};
const mergedEquipment = projectNpcEquipment(ordinaryItems, mergedArtifacts, 'agot:a');
assert.deepEqual(mergedEquipment.map((record) => record.instanceId).sort(), ['ordinary-worn', 'worn']);
assert.equal(mergedEquipment.find((record) => record.instanceId === 'ordinary-worn').equippedPosition.layer, 'garment');
assert.ok(mergedEquipment.every((record) => record.relation === '当前穿戴'));
assert.equal(mergedEquipment.some((record) => record.instanceId === 'titleAsset'), false, '领地资产不能显示为穿戴');

const mergedAssets = projectNpcAssets(ordinaryItems, mergedArtifacts, {
  characterId: 'agot:a', titleIds: ['k_north'], dynastyId: 'dynn_stark',
});
assert.equal(new Set(mergedAssets.map((record) => record.instanceId)).size, mergedAssets.length, '合并资产必须按实例 ID 去重');
assert.equal(mergedAssets.filter((record) => record.instanceId === 'duplicate-special').length, 1);
assert.equal(mergedAssets.find((record) => record.instanceId === 'ordinary-held').relation, '本人保管');
assert.equal(mergedAssets.find((record) => record.instanceId === 'ordinary-custody').relation, '代为保管');
assert.equal(mergedAssets.find((record) => record.instanceId === 'titleAsset').relation, '领地资产');
assert.equal(mergedAssets.find((record) => record.instanceId === 'dynasty-asset').relation, '家族资产');

console.log('World history projection tests passed.');
