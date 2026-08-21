import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: "export * from './src/features/world/worldTurnContext.ts';",
    resolveDir: process.cwd(),
    sourcefile: 'world-turn-context-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { buildWorldTurnContext, formatWorldTurnContext } = await import(moduleUrl);

const base = {
  rawId: '1', canonTier: 'canon', nameKey: null, dynastyId: null, cultureId: null, faithId: null,
  sexuality: null, born: true, alive: true, birthDate: '8270.1.1', deathDate: null, deathReason: null,
  killerId: null, baseAttributes: {}, traits: [], spouseIds: [], relations: [], titleIds: [], titles: [],
  fatherId: null, motherId: null, hasDna: false, source: { file: 'fixture', line: 1 },
};
const records = new Map([
  ['agot:player_1', { ...base, id: 'agot:player_1', name: '玩家原型', fatherId: 'agot:relative_1' }],
  ['agot:named_1', { ...base, id: 'agot:named_1', name: '劳勃', locationId: 'b_winterfell', traits: ['brave', 'family_first', 'education_martial_prowess_3', 'rowdy', 'knight'], titles: ['七国国王'] }],
  ['agot:relative_1', { ...base, id: 'agot:relative_1', name: '父亲' }],
  ['agot:recent_1', { ...base, id: 'agot:recent_1', name: '近来人物' }],
  ['agot:due_1', { ...base, id: 'agot:due_1', name: '时间线人物' }],
  ['agot:genealogy_1', { ...base, id: 'agot:genealogy_1', name: '劳勃', canonTier: 'genealogy' }],
]);
const repository = {
  loadManifest: async () => ({ datasetHash: 'fixture' }),
  get: async (id) => records.get(id),
  getMany: async (ids) => ids.map((id) => records.get(id)).filter(Boolean),
  findMentioned: async () => [records.get('agot:named_1'), records.get('agot:genealogy_1')],
  getLoadoutProfile: async (id) => id === 'agot:named_1' ? { characterId: id, templateId: 'southern_common' } : undefined,
};
const characterEvents = new Map();
const eventStore = { eventsForCharacter: async (_runId, id) => characterEvents.get(id) ?? [] };
const mapLocationRepository = {
  loadSearchIndex: async () => [
    { id: 'b_winterfell', name: '临冬城', type: 'castle', importance: 100, mapX: 10, mapY: 20, regionId: 'the_north' },
    { id: 'b_red_keep', name: '红堡', type: 'castle', importance: 100, mapX: 30, mapY: 40, regionId: 'crownlands' },
  ],
  loadSemanticTitles: async () => [
    { featureId: 1, titleId: 'the_north', rank: 'kingdom', name: '北境', mapX: 10, mapY: 20, importance: 100, regionId: 'the_north' },
    { featureId: 2, titleId: 'd_winterfell', rank: 'duchy', name: '临冬城公国', mapX: 10, mapY: 20, importance: 90, regionId: 'the_north' },
    { featureId: 3, titleId: 'c_winterfell', rank: 'county', name: '临冬城伯爵领', mapX: 10, mapY: 20, importance: 80, regionId: 'the_north' },
  ],
  loadSemanticMembership: async () => [{
    locationId: 'b_winterfell', baronyId: 'b_winterfell', countyId: 'c_winterfell', duchyId: 'd_winterfell', kingdomId: 'the_north', regionId: 'the_north',
  }],
};
const gameState = {
  currentYear: 298, currentMonth: 5, currentDay: 10, currentSeason: '暮春', turnCount: 2,
  lord: { canonicalCharacterId: 'agot:player_1', location: { locationId: 'b_winterfell', sceneLocation: '神木林' }, locationLabel: '临冬城', items: { instances: {}, placements: {}, sites: {}, vehicles: {} } },
  worldCharacters: { runId: 'run_fixture', datasetHash: 'fixture', revision: 1 },
  worldArtifacts: {
    artifacts: {
      named_sword: {
        instanceId: 'named_sword', definitionId: 'artifact.longclaw', lawfulControllerId: 'agot:named_1',
        placement: { type: 'character', characterId: 'agot:named_1' }, equipped: false,
        source: { file: 'fixture', line: 1, effectId: 'sword' },
      },
      title_asset: {
        instanceId: 'title_asset', definitionId: 'artifact.ice', lawfulControllerId: 'agot:named_1',
        placement: { type: 'title', titleId: 'k_realm', controllerId: 'agot:named_1' }, equipped: false,
        source: { file: 'fixture', line: 2, effectId: 'title' },
      },
    },
  },
  worldHistory: {
    schemaVersion: 1,
    startDate: { year: 298, month: 5, day: 1 },
    canonical: { due: { eventId: 'due', status: 'scheduled' } },
    turns: [{
      turn: 2, action: '此前行动', startedOn: { year: 298, month: 5, day: 9 }, resolvedOn: { year: 298, month: 5, day: 10 },
      acceptedCommands: [], rejectedCommands: [], canonicalTransitions: [], eventIds: ['recent'],
    }],
  },
  worldRuntime: {
    schemaVersion: 1, revision: 1, characters: {}, titles: {}, assets: {}, pendingTransactions: [],
    events: [{ id: 'recent', transactionId: 'turn:2', turn: 2, date: { year: 298, month: 5, day: 10 }, source: 'ai_resolution', type: 'relationship', actorIds: ['agot:recent_1'], subjectRefs: [{ type: 'character', characterId: 'agot:recent_1' }], reason: '会面', visibility: 'public' }],
  },
};
const timeline = [{
  id: 'due', date: { year: 298, month: 5, day: 15 }, title: '将要发生', summary: '压力', region: '北境', category: 'intrigue',
  participants: [{ name: '时间线人物', characterId: 'agot:due_1' }], fatalities: [], consequences: [],
}];
const context = await buildWorldTurnContext({ gameState, actionText: '与劳勃交谈', repository, eventStore, mapLocationRepository, timeline });
const selectedIds = [...context.selection.full, ...context.selection.compact].map((entry) => entry.id);
for (const id of ['agot:named_1', 'agot:relative_1', 'agot:recent_1', 'agot:due_1']) {
  assert.ok(selectedIds.includes(id), `${id} should be selected`);
}
assert.equal(selectedIds.includes('agot:genealogy_1'), false);
assert.ok(context.directlyNamedIds.includes('agot:named_1'));
assert.ok(context.strongRelationshipIds.includes('agot:relative_1'));
assert.ok(context.eventParticipantIds.includes('agot:due_1'));
assert.ok(context.recentInteractionIds.includes('agot:recent_1'));
assert.ok(context.characterCommandContext.presentCharacterIds.includes('agot:named_1'));
assert.ok(context.visibleWorldEquipment.some((item) => item.definitionId === 'clothing.common_linen_tunic'));
assert.equal(context.visibleWorldEquipment.some((item) => item.definitionId === 'artifact.longclaw'), false);
assert.ok(context.visibleWorldAssets.some((item) => item.definitionId === 'artifact.longclaw' && item.relation === '本人保管'));
assert.ok(context.visibleWorldAssets.some((item) => item.definitionId === 'artifact.ice' && item.relation === '领地资产'));
assert.equal(context.narrativeLocation.placeName, '临冬城');
assert.equal(context.narrativeLocation.countyName, '临冬城伯爵领');
assert.equal(context.selection.full.find((entry) => entry.id === 'agot:named_1')?.locationName, '临冬城');

const formatted = formatWorldTurnContext(context);
assert.match(formatted, /稳定人物 ID: agot:named_1/);
assert.match(formatted, /当前权威地点/);
assert.match(formatted, /临冬城 · 神木林 · 临冬城伯爵领 · 临冬城公国 · 北境/);
assert.doesNotMatch(formatted, /b_winterfell|baronyId|男爵领/);
assert.match(formatted, /特质: 勇敢；家族至上；骑士/);
assert.doesNotMatch(formatted, /education_martial_prowess_3|family_first|rowdy/);
assert.match(formatted, /原作预定压力/);
assert.match(formatted, /当前实际穿戴/);
assert.match(formatted, /朴素亚麻束腰衣/);
assert.match(formatted, /瓦雷利亚钢长剑“长爪”[\s\S]*本人保管/);
assert.match(formatted, /领地资产/);
assert.match(formatted, /不代表当前随身携带/);
assert.doesNotMatch(formatted, /genealogy_1/);

const semanticFailureRepository = {
  ...mapLocationRepository,
  loadSemanticTitles: async () => { throw new Error('fixture semantic titles failure'); },
  loadSemanticMembership: async () => { throw new Error('fixture semantic membership failure'); },
};
const semanticFallbackContext = await buildWorldTurnContext({
  gameState, actionText: '与劳勃交谈', repository, eventStore, mapLocationRepository: semanticFailureRepository, timeline,
});
assert.deepEqual(semanticFallbackContext.narrativeLocation, { placeName: '临冬城', sceneName: '神木林', countyName: undefined, duchyName: undefined, kingdomName: undefined, empireName: undefined, hegemonName: undefined });
assert.doesNotMatch(formatWorldTurnContext(semanticFallbackContext), /b_winterfell|baronyId|男爵领/);


const unavailableMapContext = await buildWorldTurnContext({
  gameState,
  actionText: '继续与劳勃交谈',
  repository,
  eventStore,
  mapLocationRepository: {
    loadSearchIndex: async () => { throw new Error('fixture map unavailable'); },
    loadSemanticTitles: async () => { throw new Error('fixture map unavailable'); },
    loadSemanticMembership: async () => { throw new Error('fixture map unavailable'); },
  },
  timeline,
});
assert.equal(unavailableMapContext.mapAvailability.status, 'unavailable');
assert.equal(unavailableMapContext.selection.full.some((entry) => entry.id === 'agot:named_1'), true);
assert.match(formatWorldTurnContext(unavailableMapContext), /地图资料暂不可用/);

characterEvents.set('agot:named_1', [
  { id: 'acquire-cloak', characterId: 'agot:named_1', turn: 3, sequence: 0, timestamp: 1, event: { type: 'ITEM_ACQUIRE', item: {
    instanceId: 'story:named:cloak', definitionId: 'clothing.plain_wool_cloak', ownerId: 'agot:named_1',
    custody: { type: 'character', characterId: 'agot:named_1' }, source: 'story_event',
  } } },
  { id: 'equip-cloak', characterId: 'agot:named_1', turn: 3, sequence: 1, timestamp: 1, event: {
    type: 'ITEM_EQUIP', instanceId: 'story:named:cloak', position: { group: 'torso', layer: 'outerwear' },
  } },
]);
const updatedContext = await buildWorldTurnContext({ gameState, actionText: '与劳勃交谈', repository, eventStore, mapLocationRepository, timeline });
assert.ok(updatedContext.visibleWorldEquipment.some((item) => item.instanceId === 'story:named:cloak'));
assert.equal(updatedContext.visibleWorldAssets.some((item) => item.instanceId === 'story:named:cloak'), false, '已经穿戴的物品不得在正文资产段重复');

console.log('World turn context tests passed.');
