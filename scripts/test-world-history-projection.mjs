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

const marriage = { id: 'marriage', transactionId: 'turn:2', turn: 2, date: { year: 298, month: 5, day: 10 }, source: 'ai_resolution', type: 'command.marry_characters', actorIds: ['agot:a', 'agot:b'], subjectRefs: [{ type: 'character', characterId: 'agot:a' }, { type: 'character', characterId: 'agot:b' }], reason: '两人结婚', visibility: 'public' };
const death = { id: 'death', transactionId: 'turn:3', turn: 3, date: { year: 298, month: 5, day: 12 }, source: 'ai_resolution', type: 'character.death', actorIds: ['agot:a'], subjectRefs: [{ type: 'character', characterId: 'agot:a' }], reason: '甲死亡', visibility: 'public' };
const history = {
  schemaVersion: 1,
  startDate: { year: 298, month: 5, day: 1 },
  canonical: {
    canon_past: { eventId: 'canon_past', status: 'historical' },
    canon_diverged: { eventId: 'canon_diverged', status: 'diverged', resolvedOn: { year: 298, month: 5, day: 15 }, reason: '关键人物提前死亡' },
  },
  turns: [{ turn: 2, action: '', startedOn: { year: 298, month: 5, day: 10 }, resolvedOn: { year: 298, month: 5, day: 12 }, acceptedCommands: [], rejectedCommands: [], eventIds: ['marriage', 'death'], canonicalTransitions: [] }],
};
const schedule = [
  { id: 'canon_past', date: { year: 298, month: 4, day: 5 }, title: '过去节点', summary: '过去', region: '北境', category: 'intrigue', participants: [], fatalities: [], consequences: [] },
  { id: 'canon_diverged', date: { year: 298, month: 5, day: 15 }, title: '偏离节点', summary: '原定事件', region: '君临', category: 'death', participants: [], fatalities: [], consequences: [] },
];
assert.deepEqual(factsForCharacter([marriage, death], 'agot:a').map((fact) => fact.id), ['marriage', 'death']);
assert.deepEqual(factsForCharacter([marriage, death], 'agot:b').map((fact) => fact.id), ['marriage']);
const actual = projectActualTimeline(history, [marriage, death], schedule);
assert.ok(actual.some((event) => event.id === 'canon_past' && event.status === 'historical'));
assert.ok(actual.some((event) => event.id === 'marriage' && event.source === 'ai_resolution'));
assert.ok(actual.some((event) => event.id === 'death'));
const canon = projectCanonicalTimeline(history, schedule);
assert.equal(canon.find((event) => event.id === 'canon_diverged').status, 'diverged');
assert.equal(canon.find((event) => event.id === 'canon_diverged').reason, '关键人物提前死亡');

const artifacts = {
  schemaVersion: 1, startDate: '8298.1.1', datasetHash: 'a'.repeat(64), artifactDatasetHash: 'b'.repeat(64), characterDatasetHash: 'c'.repeat(64),
  artifacts: {
    owned: { instanceId: 'owned', definitionId: 'artifact.longclaw', lawfulControllerId: 'agot:a', placement: { type: 'character', characterId: 'agot:a' }, equipped: false, source: { file: '', line: 1, effectId: '' } },
    worn: { instanceId: 'worn', definitionId: 'artifact.ice', lawfulControllerId: 'agot:a', placement: { type: 'character', characterId: 'agot:a' }, equipped: true, equippedPosition: { group: 'mainhand' }, source: { file: '', line: 1, effectId: '' } },
    positionless: { instanceId: 'positionless', definitionId: 'artifact.longclaw', lawfulControllerId: 'agot:a', placement: { type: 'character', characterId: 'agot:a' }, equipped: true, source: { file: '', line: 1, effectId: '' } },
    custodied: { instanceId: 'custodied', definitionId: 'artifact.custodied', lawfulControllerId: 'agot:b', placement: { type: 'character', characterId: 'agot:a' }, equipped: false, source: { file: '', line: 1, effectId: '' } },
    titleAsset: { instanceId: 'titleAsset', definitionId: 'artifact.title', lawfulControllerId: 'agot:a', placement: { type: 'title', titleId: 'k_north', controllerId: 'agot:a' }, equipped: false, source: { file: '', line: 1, effectId: '' } },
    unrelated: { instanceId: 'unrelated', definitionId: 'artifact.unrelated', lawfulControllerId: 'agot:b', placement: { type: 'character', characterId: 'agot:b' }, equipped: false, source: { file: '', line: 1, effectId: '' } },
  },
};
assert.deepEqual(visibleEquipmentForCharacter(artifacts, 'agot:a').map((record) => record.instanceId), ['worn']);
assert.deepEqual(visibleAssetsForCharacter(artifacts, 'agot:a').map((record) => record.instanceId).sort(), ['custodied', 'owned', 'positionless', 'titleAsset', 'worn']);



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
mergedArtifacts.artifacts['artifact.iron-throne'] = {
  instanceId: 'world.artifact.generated.iron-throne', definitionId: 'artifact.generated.iron-throne', projectionKind: 'political-symbol', lawfulControllerId: 'agot:a',
  placement: { type: 'title', titleId: 'b_the_red_keep', controllerId: 'agot:a' }, equipped: false, source: { file: '', line: 1, effectId: '' },
};
const mergedEquipment = projectNpcEquipment(ordinaryItems, mergedArtifacts, 'agot:a');
assert.deepEqual(mergedEquipment.map((record) => record.instanceId).sort(), ['ordinary-worn', 'worn']);
assert.equal(mergedEquipment.find((record) => record.instanceId === 'ordinary-worn').equippedPosition.layer, 'garment');
assert.deepEqual(mergedEquipment.find((record) => record.instanceId === 'worn').equippedPosition, { group: 'mainhand' });
assert.equal(mergedEquipment.some((record) => record.instanceId === 'positionless'), false, '没有实际槽位的世界物品不得猜测穿戴位置');
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
assert.equal(mergedAssets.some((record) => record.definitionId === 'artifact.generated.iron-throne'), false, '铁王座不得进入人物普通资产投影');

console.log('World history projection tests passed.');
