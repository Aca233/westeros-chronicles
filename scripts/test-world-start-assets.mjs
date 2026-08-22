import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/features/world/createLivingWorldGame.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { createLivingWorldGame } = await import(moduleUrl);

const [startState, artifactState] = await Promise.all([
  readFile('public/data/world/start-state.json', 'utf8').then(JSON.parse),
  readFile('public/data/items/agot-artifact-world-state.json', 'utf8').then(JSON.parse),
]);

const hashes = {
  characters: artifactState.characterDatasetHash,
  map: 'b'.repeat(64),
  artifact: artifactState.artifactDatasetHash,
  artifactWorld: artifactState.datasetHash,
};
const worldManifest = {
  schemaVersion: 1, worldId: 'agot-298', startDate: { year: 298, month: 5, day: 10 },
  characterDatasetHash: hashes.characters, mapDatasetHash: hashes.map, artifactDatasetHash: hashes.artifact,
  artifactWorldStateHash: hashes.artifactWorld, contentHash: 'e'.repeat(64), paths: {},
};
const playable = ['agot:Stark_3', 'agot:Stark_7', 'agot:Targaryen_9'].map((characterId, index) => ({
  characterId, enabled: true, difficulty: ['normal', 'hard', 'epic'][index], focus: ['查看世界'],
  card: { title: `入口${index + 1}`, tagline: '共同世界', background: '只改变视角', avatarIcon: 'house-stark' },
}));
const records = Object.fromEntries(['agot:Stark_3', 'agot:Stark_7', 'agot:Targaryen_9'].map((id, index) => [id, {
  id, rawId: id.slice(5), canonTier: 'canon', name: `人物${index + 1}`, dynastyId: 'dynn_Stark', female: false,
  born: true, alive: true, birthDate: '8263.1.1', deathDate: null, baseAttributes: {}, traits: [], spouseIds: [],
  relations: [], titleIds: [], titles: [], hasDna: true, source: { file: 'fixture.txt', line: index + 1 },
}]));
const fixtureDependencies = {
  loadManifest: async () => structuredClone(worldManifest),
  loadPlayableCharacters: async () => structuredClone(playable),
  loadStartState: async () => structuredClone(startState),
  loadCharacterManifest: async () => ({ datasetHash: hashes.characters }),
  loadMapManifest: async () => ({ datasetHash: hashes.map }),
  loadCharacter: async (id) => structuredClone(records[id]),
  loadLoadout: async () => undefined,
  loadArtifacts: async () => structuredClone(artifactState),
};

test('不同控制者读取同一资产基线，玩家物品只是装备投影', async () => {
  const ned = await createLivingWorldGame('agot:Stark_3', fixtureDependencies);
  const jon = await createLivingWorldGame('agot:Stark_7', fixtureDependencies);
  assert.deepEqual(ned.worldBaseline.assets, jon.worldBaseline.assets);
  assert.equal(ned.worldBaseline.assets.some((asset) => asset.id === 'world-item:world.artifact.ice'), false);
  assert.equal(ned.worldBaseline.assets.some((asset) => asset.id === 'item:ned.ice'), true);
  assert.equal(ned.lord.items.instances['ned.ice'].definitionId, 'artifact.ice');
  assert.equal(ned.lord.items.instances['ned.ice'].isHeirloom, true);
  assert.equal(ned.lord.items.instances['ned.ice'].renown, 100);
  assert.deepEqual(ned.lord.items.placements['ned.ice'], { type: 'equipped', position: { group: 'mainhand' } });
  assert.equal(jon.lord.items.instances['jon.castle_sword'].definitionId, 'weapon.castle_bastard_sword');
  assert.equal(jon.lord.items.instances['jon.castle_sword'].customName, '守夜人手半剑');
  assert.equal(ned.lord.items.instances['jon.castle_sword'], undefined);
  assert.equal(jon.lord.items.instances['ned.ice'], undefined);
});

test('玩家投影只包含自己实际使用的保管站点', async () => {
  const ned = await createLivingWorldGame('agot:Stark_3', fixtureDependencies);
  const jon = await createLivingWorldGame('agot:Stark_7', fixtureDependencies);
  assert.deepEqual(Object.keys(ned.lord.items.sites).sort(), ['winterfell_armory', 'winterfell_room']);
  assert.deepEqual(Object.keys(jon.lord.items.sites), ['castle_black_quarters']);
});

test('起点资产声明完整覆盖三个视角的旧预设', async () => {
  const expected = {
    'agot:Stark_3': ['ned.castle_sword', 'ned.chainmail', 'ned.grey_cloak', 'ned.house_seal', 'ned.ice', 'ned.poppy_milk', 'ned.riding_boots', 'ned.staunching_herbs', 'ned.wolf_helm', 'ned.wool_breeches', 'ned.wool_tunic'],
    'agot:Stark_7': ['jon.black_cloak', 'jon.castle_sword', 'jon.leathers', 'jon.patrol_boots', 'jon.spirits', 'jon.staunching_herbs', 'jon.uniform', 'jon.wool_trousers'],
    'agot:Targaryen_9': ['daenerys.black_red_egg', 'daenerys.cream_gold_egg', 'daenerys.green_bronze_egg', 'daenerys.house_seal', 'daenerys.silk_robe', 'daenerys.silk_skirt', 'daenerys.silver_ring', 'daenerys.soft_shoes'],
  };
  for (const [characterId, instanceIds] of Object.entries(expected)) {
    const game = await createLivingWorldGame(characterId, fixtureDependencies);
    assert.deepEqual(Object.keys(game.lord.items.instances).sort(), instanceIds);
  }
});
