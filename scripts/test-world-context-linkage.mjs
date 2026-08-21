import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/services/turnResolution.ts';",
      "export * from './src/data/presets.ts';",
      "export * from './src/features/items/worldArtifacts.ts';",
      "export { WORLD_CONTEXT_LIMITS } from './src/features/world/worldTurnContext.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'world-context-linkage-runtime.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  PRESET_SCENARIOS,
  createInitialAgotArtifactWorldState,
  prepareWorldTurn,
  settleTurnDraft,
  WORLD_CONTEXT_LIMITS,
} = await import(url);

const PLAYER_ID = 'agot:Stark_3';
const locations = [
  { id: 'b_winterfell', name: '临冬城', englishName: 'Winterfell', type: 'castle', importance: 100, regionId: 'north', mapX: 10, mapY: 10 },
  { id: 'b_red_keep', name: '红堡', englishName: 'Red Keep', type: 'castle', importance: 100, regionId: 'crownlands', mapX: 50, mapY: 60 },
];
const memberships = [
  { locationId: 'b_winterfell', baronyId: 'b_winterfell', countyId: 'c_winterfell', duchyId: 'd_north', kingdomId: 'k_north', regionId: 'north' },
  { locationId: 'b_red_keep', baronyId: 'b_red_keep', countyId: 'c_kings_landing', duchyId: 'd_crownlands', kingdomId: 'k_iron_throne', regionId: 'crownlands' },
];
const mapLocationRepository = {
  async loadSearchIndex() { return locations; },
  async loadSemanticMembership() { return memberships; },
  async loadSemanticTitles() { return []; },
};
const routePlanner = async ({ from, to }) => ({
  ok: true,
  id: `route:${from}:${to}`,
  from,
  to,
  preference: 'fastest',
  travelMode: 'horse',
  via: [],
  legs: [{
    index: 0,
    edgeId: 'edge:test',
    from,
    to,
    distance: 100,
    days: 10,
    cost: 0,
    risk: 0,
    roadLevel: 'major',
    crossing: 'land',
    seasonTags: [],
    fromPoint: { mapX: 10, mapY: 10 },
    toPoint: { mapX: 50, mapY: 60 },
  }],
  totalDistance: 100,
  totalDays: 10,
  totalCost: 0,
  totalRisk: 0,
  points: [{ mapX: 10, mapY: 10 }, { mapX: 50, mapY: 60 }],
});

function gameState() {
  const lord = structuredClone(PRESET_SCENARIOS[0].initialLord);
  lord.canonicalCharacterId = PLAYER_ID;
  lord.location = { locationId: 'b_winterfell' };
  lord.locationLabel = '临冬城';
  return {
    saveFormatVersion: 9,
    currentYear: 298,
    currentMonth: 5,
    currentDay: 10,
    currentSeason: '暮春',
    turnCount: 0,
    lord,
    turns: [],
    worldCharacters: { runId: 'run_test', datasetHash: 'f'.repeat(64), revision: 0 },
    worldArtifacts: createInitialAgotArtifactWorldState(),
    worldHistory: { schemaVersion: 1, startDate: { year: 298, month: 5, day: 10 }, canonical: {}, turns: [] },
    worldRuntime: { schemaVersion: 1, revision: 0, characters: {}, titles: {}, assets: {}, events: [], pendingTransactions: [] },
    worldFlags: {},
    isGameOver: false,
  };
}
const characterContext = {
  characters: [{ id: PLAYER_ID, alive: true, locationId: 'b_winterfell', traits: [], spouseIds: [], titles: [], wounds: [] }],
  currentLocationId: 'b_winterfell',
  presentCharacterIds: [PLAYER_ID],
  knownLocationIds: locations.map((entry) => entry.id),
};
const arrivalDraft = {
  outcomeSummary: '半个月后抵达红堡并向国王行礼。',
  stateCommands: [],
  worldIntents: [{
    kind: 'arrive',
    targetText: '红堡',
    sceneLocation: '议事厅',
    elapsedTime: { days: 15 },
    evidenceText: '半个月后，我推开红堡议事厅的门，向国王行礼',
  }],
};

async function prepare(state, pendingTransactions = []) {
  return prepareWorldTurn({
    gameState: state,
    draft: arrivalDraft,
    actionText: '半个月后，我推开红堡议事厅的门，向国王行礼。',
    nextTurnNumber: 1,
    pendingTransactions,
    characterContext,
    mapLocationRepository,
    routePlanner,
  });
}

test('附带抵达事实以单一事务推进地点、日期、事件和叙事上下文', async () => {
  const state = gameState();
  const preparedWorld = await prepare(state);
  const settled = settleTurnDraft({
    gameState: state,
    actionText: '半个月后，我推开红堡议事厅的门，向国王行礼。',
    nextTurnNumber: 1,
    draft: arrivalDraft,
    pendingTransactions: [],
    characterContext,
    timeline: [],
    preparedWorld,
  });

  assert.equal(settled.worldRuntime.revision, 1);
  assert.equal(settled.worldLocation.locationId, 'b_red_keep');
  assert.equal(settled.worldLocation.sceneLocation, '议事厅');
  assert.equal(settled.nextDate.day, 25);
  assert.equal(settled.worldRuntime.events.length > 0, true);
  assert.equal(settled.worldRuntime.events.every((event) => event.transactionId === settled.transactionId), true);
  assert.equal(settled.worldHistory.turns[0].eventIds.length > 0, true);
  assert.match(settled.narrationContext, /红堡/);
  assert.doesNotMatch(settled.narrationContext, /b_[a-z0-9_]+/);
});

test('同一回合普通状态变化与世界事务只推进一次修订', async () => {
  const state = gameState();
  const draft = {
    ...arrivalDraft,
    stateCommands: [{ type: 'MODIFY_PRESTIGE', delta: 1 }],
  };
  const preparedWorld = await prepareWorldTurn({
    gameState: state,
    draft,
    actionText: '半个月后抵达红堡，声望也有所增长。',
    nextTurnNumber: 1,
    pendingTransactions: [],
    characterContext,
    mapLocationRepository,
    routePlanner,
  });
  const settled = settleTurnDraft({
    gameState: state,
    actionText: '半个月后抵达红堡，声望也有所增长。',
    nextTurnNumber: 1,
    draft,
    pendingTransactions: [],
    characterContext,
    timeline: [],
    preparedWorld,
  });

  assert.equal(settled.worldHistory.turns.length, 1);
  assert.equal(settled.worldRuntime.revision, 1);
});

test('同批次资产转移无效时旅行、日期、车辆和资产全部回滚', async () => {
  const state = gameState();
  const pendingTransactions = [{
    id: 'pending:invalid-asset',
    status: 'pending',
    source: 'ui_action',
    conflictKeys: ['asset:item:missing'],
    intents: [{
      kind: 'transfer_asset',
      actorId: PLAYER_ID,
      assetId: 'item:missing',
      placement: { type: 'location', location: { locationId: 'b_red_keep' } },
      evidenceText: '转移不存在的资产',
    }],
  }];
  const preparedWorld = await prepare(state, pendingTransactions);
  const settled = settleTurnDraft({
    gameState: state,
    actionText: '半个月后，我推开红堡议事厅的门，向国王行礼。',
    nextTurnNumber: 1,
    draft: arrivalDraft,
    pendingTransactions,
    characterContext,
    timeline: [],
    preparedWorld,
  });

  assert.deepEqual(settled.worldLocation, state.lord.location);
  assert.deepEqual(settled.nextDate, { year: 298, month: 5, day: 10 });
  assert.deepEqual(settled.updatedLord.items.vehicles, state.lord.items.vehicles);
  assert.deepEqual(settled.worldRuntime.assets, state.worldRuntime.assets);
  assert.equal(settled.worldRuntime.revision, state.worldRuntime.revision + 1);
  assert.equal(settled.worldRuntime.revision, settled.worldHistory.turns.length);
  assert.match(settled.rejectedCommands.map((entry) => entry.reason).join('\n'), /资产不存在/);
});

test('提交后世界切片使用明确的容量上限', () => {
  assert.deepEqual(WORLD_CONTEXT_LIMITS, {
    characters: 12,
    assets: 20,
    events: 12,
    neighboringLocations: 8,
  });
});
