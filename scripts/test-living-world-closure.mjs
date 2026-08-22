import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export { createLivingWorldGame } from './src/features/world/createLivingWorldGame.ts';",
      "export { prepareWorldTurn } from './src/services/turn/worldPreparation.ts';",
      "export { settleTurnDraft } from './src/services/turn/settlement.ts';",
      "export { createWorldRuntimeState } from './src/features/world/worldRuntimeState.ts';",
      "export { createWorldHistoryState } from './src/features/world/worldHistory.ts';",
      "export { initializeCanonicalStates } from './src/features/world/canonicalTimeline.ts';",
      "export { CANONICAL_TIMELINE } from './src/data/generated/canonicalTimeline.ts';",
      "export { projectResolvedCharacterWorldFacts, characterWorldLocationLabel } from './src/features/world/characterWorldFacts.ts';",
      "export { createNpcDossier } from './src/features/characters/characterDossier.ts';",
      "export { resolveCharacter } from './src/features/characters/characterProjector.ts';",
      "export { buildWorldTurnContext } from './src/features/world/worldTurnContext.ts';",
      "export { preloadItemCatalog } from './src/data/itemDefinitions.ts';",
      "export { preloadNpcLoadoutContent } from './src/features/items/npcLoadoutContent.ts';",
      "export { StaticCharacterRepository } from './src/features/characters/staticCharacterRepository.ts';",
      "export { createInitialAgotArtifactWorldState } from './src/features/items/worldArtifacts.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'living-world-closure-runtime.ts',
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
  createLivingWorldGame,
  prepareWorldTurn,
  settleTurnDraft,
  createWorldRuntimeState,
  createWorldHistoryState,
  initializeCanonicalStates,
  CANONICAL_TIMELINE,
  projectResolvedCharacterWorldFacts,
  characterWorldLocationLabel,
  createNpcDossier,
  resolveCharacter,
  buildWorldTurnContext,
  preloadItemCatalog,
  preloadNpcLoadoutContent,
  StaticCharacterRepository,
  createInitialAgotArtifactWorldState,
} = await import(url);

const PLAYER_ID = 'agot:Stark_3';
const CATELYN_ID = 'agot:Tully_4';
const FILL_ID = 'agot:unreferenced_fill';
const RED_KEEP_ID = 'b_the_red_keep';
const SEAL_ASSET_ID = 'item:ned.house_seal';

async function loadPublicJson(path) {
  return JSON.parse(await readFile(join('public', path.replace(/^\//, '')), 'utf8'));
}

const [
  worldManifest,
  playableCharacters,
  startState,
  terminology,
  characterManifest,
  mapManifest,
  gameplayLocations,
  searchIndex,
  memberships,
] = await Promise.all([
  loadPublicJson('data/world/manifest.json'),
  loadPublicJson('data/world/playable-characters.json'),
  loadPublicJson('data/world/start-state.json'),
  loadPublicJson('data/world/terminology.json'),
  loadPublicJson('data/agot-characters/manifest.json'),
  loadPublicJson('data/agot-map/manifest.json'),
  loadPublicJson('data/world/gameplay-locations.json'),
  loadPublicJson('data/agot-map/location-search-index.json'),
  loadPublicJson('data/agot-map/semantic/membership.json'),
]);

const fetchJson = async (path) => loadPublicJson(path);
const characterRepository = new StaticCharacterRepository('/data/agot-characters', fetchJson);

const winterfell = searchIndex.find((entry) => entry.id === 'b_winterfell');
const redKeep = searchIndex.find((entry) => entry.id === RED_KEEP_ID);
assert.ok(winterfell, '临冬城必须存在于地图搜索索引');
assert.ok(redKeep, '红堡必须存在于地图搜索索引');
assert.match(redKeep.name, /红堡/);

const mapLocations = [winterfell, redKeep];
const mapMemberships = memberships.filter((entry) => entry.locationId === 'b_winterfell' || entry.locationId === RED_KEEP_ID);
const mapLocationRepository = {
  async loadSearchIndex() { return mapLocations; },
  async loadSemanticMembership() { return mapMemberships; },
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
    edgeId: 'edge:closure',
    from,
    to,
    distance: 100,
    days: 10,
    cost: 0,
    risk: 0,
    roadLevel: 'major',
    crossing: 'land',
    seasonTags: [],
    fromPoint: { mapX: winterfell.mapX, mapY: winterfell.mapY },
    toPoint: { mapX: redKeep.mapX, mapY: redKeep.mapY },
  }],
  totalDistance: 100,
  totalDays: 10,
  totalCost: 0,
  totalRisk: 0,
  points: [
    { mapX: winterfell.mapX, mapY: winterfell.mapY },
    { mapX: redKeep.mapX, mapY: redKeep.mapY },
  ],
});

const fixtureDependencies = {
  loadManifest: async () => structuredClone(worldManifest),
  loadPlayableCharacters: async () => structuredClone(playableCharacters),
  loadStartState: async () => structuredClone(startState),
  loadTerminology: async () => structuredClone(terminology),
  loadCharacterManifest: async () => structuredClone(characterManifest),
  loadMapManifest: async () => structuredClone(mapManifest),
  loadCharacter: (characterId) => characterRepository.get(characterId),
  loadLoadout: (characterId) => characterRepository.getLoadoutProfile(characterId),
  loadArtifacts: async () => createInitialAgotArtifactWorldState(),
};

function fillRecord() {
  return {
    id: FILL_ID,
    rawId: 'unreferenced_fill',
    canonTier: 'mod_supporting',
    name: '无名填充',
    dynastyId: 'dynn_None',
    female: false,
    born: true,
    alive: true,
    birthDate: '8270.1.1',
    deathDate: null,
    baseAttributes: {},
    traits: [],
    spouseIds: [],
    relations: [],
    titleIds: [],
    titles: [],
    hasDna: false,
    source: { file: 'closure-fixture.txt', line: 1 },
  };
}

test('奈德从统一世界起点移动并赠印后，人物、正文、资产和 LLM 上下文保持同一投影', async () => {
  await Promise.all([preloadItemCatalog(), preloadNpcLoadoutContent()]);
  const game = await createLivingWorldGame(PLAYER_ID, fixtureDependencies);
  assert.equal(game.worldId, 'agot-298');
  assert.deepEqual(game.startDate, { year: 298, month: 5, day: 10 });
  assert.equal(game.lord.location.locationId, 'b_winterfell');
  assert.ok(game.lord.items.instances['ned.house_seal']);

  const history = createWorldHistoryState(game.startDate);
  history.canonical = initializeCanonicalStates(CANONICAL_TIMELINE, game.startDate);
  const state = {
    saveFormatVersion: 9,
    currentYear: game.startDate.year,
    currentMonth: game.startDate.month,
    currentDay: game.startDate.day,
    currentSeason: game.season,
    turnCount: 1,
    lord: structuredClone(game.lord),
    turns: [],
    worldCharacters: { runId: 'run_living_world_closure', datasetHash: game.characterDatasetHash, revision: 0 },
    worldArtifacts: structuredClone(game.worldArtifacts),
    worldHistory: history,
    worldRuntime: createWorldRuntimeState(),
    worldFlags: {},
    isGameOver: false,
  };

  const actionText = '半个月后，我推开红堡议事厅的门，把临冬城公爵印章交给凯特琳。';
  const draft = {
    outcomeSummary: '半个月后抵达红堡，并把印章交给凯特琳。',
    stateCommands: [],
    worldIntents: [{
      kind: 'arrive',
      targetId: RED_KEEP_ID,
      sceneLocation: '议事厅',
      elapsedTime: { days: 15 },
      evidenceText: actionText,
    }],
  };
  const pendingTransactions = [{
    id: 'pending:gift-ned-seal',
    status: 'pending',
    source: 'ui_action',
    conflictKeys: [`asset:${SEAL_ASSET_ID}`],
    intents: [
      {
        kind: 'unequip_asset',
        actorId: PLAYER_ID,
        assetId: SEAL_ASSET_ID,
        placement: { type: 'character', characterId: PLAYER_ID },
        evidenceText: actionText,
      },
      {
        kind: 'gift_asset',
        actorId: PLAYER_ID,
        assetId: SEAL_ASSET_ID,
        recipientId: CATELYN_ID,
        evidenceText: actionText,
      },
    ],
    itemCommands: [
      { type: 'ITEM_UNEQUIP', instanceId: 'ned.house_seal', to: { type: 'carried' } },
      { type: 'ITEM_GIFT', instanceId: 'ned.house_seal', recipientId: CATELYN_ID },
    ],
  }];
  const characterContext = {
    characters: [
      { id: PLAYER_ID, alive: true, locationId: 'b_winterfell', traits: [], spouseIds: [], titles: [], wounds: [] },
      { id: CATELYN_ID, alive: true, locationId: 'b_winterfell', traits: [], spouseIds: [], titles: [], wounds: [] },
    ],
    currentLocationId: 'b_winterfell',
    presentCharacterIds: [PLAYER_ID, CATELYN_ID],
    knownLocationIds: ['b_winterfell', RED_KEEP_ID],
  };

  const preparedWorld = await prepareWorldTurn({
    gameState: state,
    draft,
    actionText,
    nextTurnNumber: 2,
    pendingTransactions,
    characterContext,
    mapLocationRepository,
    routePlanner,
  });
  const settled = settleTurnDraft({
    gameState: state,
    actionText,
    nextTurnNumber: 2,
    draft,
    pendingTransactions,
    characterContext,
    timeline: [],
    preparedWorld,
  });

  assert.equal(settled.updatedLord.location.locationId, RED_KEEP_ID);
  assert.equal(settled.worldRuntime.characters[PLAYER_ID].location.locationId, RED_KEEP_ID);
  assert.equal(settled.worldRuntime.assets[SEAL_ASSET_ID].custodian.characterId, CATELYN_ID);
  assert.match(settled.narrationContext, /红堡/);

  const nedRecord = await characterRepository.get(PLAYER_ID);
  const resolvedNed = projectResolvedCharacterWorldFacts(resolveCharacter(nedRecord, [], {
    datasetVersion: game.characterDatasetHash,
    currentYear: 8298,
  }), {
    history: settled.worldHistory,
    runtime: settled.worldRuntime,
    timeline: [],
    mapLocations,
    startCharacters: startState.characters,
  });
  const characterDossier = {
    ...createNpcDossier(resolvedNed, 298, undefined, undefined, terminology),
    location: characterWorldLocationLabel(resolvedNed, mapLocations),
  };
  assert.match(characterDossier.location, /红堡/);

  const nextState = {
    ...state,
    lord: settled.updatedLord,
    worldRuntime: settled.worldRuntime,
    worldHistory: settled.worldHistory,
    currentYear: settled.nextDate.year,
    currentMonth: settled.nextDate.month,
    currentDay: settled.nextDate.day,
    currentSeason: settled.nextSeason,
  };
  const [catelynRecord] = await Promise.all([characterRepository.get(CATELYN_ID)]);
  const llmContext = await buildWorldTurnContext({
    gameState: nextState,
    actionText,
    startCharacters: startState.characters,
    gameplayLocations: gameplayLocations.entries,
    timeline: [],
    mapLocationRepository,
    eventStore: { eventsForCharacter: async () => [] },
    repository: {
      loadManifest: async () => ({ datasetHash: characterManifest.datasetHash }),
      get: async (id) => {
        if (id === PLAYER_ID) return structuredClone(nedRecord);
        if (id === CATELYN_ID) return structuredClone(catelynRecord);
        if (id === FILL_ID) return fillRecord();
        return undefined;
      },
      getMany: async (ids) => ids.flatMap((id) => {
        if (id === PLAYER_ID) return [structuredClone(nedRecord)];
        if (id === CATELYN_ID) return [structuredClone(catelynRecord)];
        if (id === FILL_ID) return [fillRecord()];
        return [];
      }),
      findMentioned: async (text) => {
        const hits = [];
        if (/凯特琳|徒利/.test(text)) hits.push(structuredClone(catelynRecord));
        if (/填充/.test(text)) hits.push(fillRecord());
        return hits;
      },
      getLoadoutProfile: async () => undefined,
    },
  });
  const llmCharacters = [...llmContext.selection.full, ...llmContext.selection.compact];

  assert.equal(nextState.lord.location.locationId, RED_KEEP_ID);
  assert.equal(nextState.worldRuntime.characters[PLAYER_ID].location.locationId, RED_KEEP_ID);
  assert.match(characterDossier.location, /红堡/);
  assert.match(settled.narrationContext, /红堡/);
  assert.equal(nextState.worldRuntime.assets[SEAL_ASSET_ID].custodian.characterId, CATELYN_ID);
  assert.equal(llmCharacters.some((entry) => entry.id === FILL_ID), false);
});
