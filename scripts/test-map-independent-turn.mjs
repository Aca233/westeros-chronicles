import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/services/turnResolution.ts';",
      "export * from './scripts/fixtures/living-world-test.ts';",
      "export * from './src/features/items/worldArtifacts.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'map-independent-turn-runtime.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const turnModule = await import(url);
await turnModule.ordinaryCatalogReady;
const { createLivingWorldTestLord, createInitialAgotArtifactWorldState, prepareWorldTurn, settleTurnDraft } = turnModule;

const PLAYER_ID = 'agot:Stark_3';
function gameState() {
  const lord = structuredClone(createLivingWorldTestLord());
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
    worldCharacters: { runId: 'run_map_failure', datasetHash: 'f'.repeat(64), revision: 0 },
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
  knownLocationIds: ['b_winterfell'],
};
let mapLoads = 0;
const brokenMapRepository = {
  async loadSearchIndex() { mapLoads += 1; throw new Error('地图索引离线'); },
  async loadSemanticMembership() { mapLoads += 1; throw new Error('地图语义离线'); },
};

test('ordinary dialogue settles without loading unavailable map datasets', async () => {
  mapLoads = 0;
  const state = gameState();
  const draft = { outcomeSummary: '继续讨论守城安排。', stateCommands: [{ type: 'ADVANCE_TIME', days: 1 }], worldIntents: [] };
  const prepared = await prepareWorldTurn({
    gameState: state,
    draft,
    actionText: '继续讨论守城安排',
    nextTurnNumber: 1,
    pendingTransactions: [],
    characterContext,
    mapLocationRepository: brokenMapRepository,
  });
  const settled = settleTurnDraft({
    gameState: state,
    draft,
    actionText: '继续讨论守城安排',
    nextTurnNumber: 1,
    pendingTransactions: [],
    characterContext,
    timeline: [],
    preparedWorld: prepared,
  });
  assert.equal(mapLoads, 0);
  assert.equal(settled.nextDate.day, 11);
  assert.equal(settled.worldHistory.turns.length, 1);
  assert.equal(settled.rejectedCommands.length, 0);
});

test('explicit travel intent is rejected locally when map data is unavailable', async () => {
  mapLoads = 0;
  const state = gameState();
  const intent = { kind: 'start_travel', targetText: '红堡', evidenceText: '立刻启程前往红堡' };
  const draft = { outcomeSummary: '试图启程。', stateCommands: [{ type: 'MODIFY_PRESTIGE', delta: 1 }], worldIntents: [intent] };
  const prepared = await prepareWorldTurn({
    gameState: state,
    draft,
    actionText: '立刻启程前往红堡',
    nextTurnNumber: 1,
    pendingTransactions: [],
    characterContext,
    mapLocationRepository: brokenMapRepository,
  });
  assert.equal(mapLoads > 0, true);
  assert.equal(prepared.rejectionReason, undefined);
  assert.equal(prepared.rejectedIntents.length, 1);
  assert.match(prepared.rejectedIntents[0].reason, /地图资料不可用/);

  const settled = settleTurnDraft({
    gameState: state,
    draft,
    actionText: '立刻启程前往红堡',
    nextTurnNumber: 1,
    pendingTransactions: [],
    characterContext,
    timeline: [],
    preparedWorld: prepared,
  });
  assert.equal(settled.updatedLord.prestige, state.lord.prestige + 1);
  assert.equal(settled.worldHistory.turns.length, 1);
  assert.equal(settled.activeJourney, undefined);
  assert.match(settled.rejectedCommands.map((entry) => entry.reason).join('\n'), /地图资料不可用/);
});
