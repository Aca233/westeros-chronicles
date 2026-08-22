import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/features/world/createLivingWorldGame.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { createLivingWorldGame } = await import(moduleUrl);

const characterIds = ['agot:Stark_3', 'agot:Stark_7', 'agot:Targaryen_9'];
const hashes = { characters: 'a'.repeat(64), map: 'b'.repeat(64), artifact: 'c'.repeat(64), artifactWorld: 'd'.repeat(64) };
const worldStartState = { schemaVersion: 1, characters: [], titles: [], assets: [], sites: [], vehicles: [] };
const worldManifest = {
  schemaVersion: 1, worldId: 'agot-298', startDate: { year: 298, month: 5, day: 10 },
  characterDatasetHash: hashes.characters, mapDatasetHash: hashes.map, artifactDatasetHash: hashes.artifact,
  artifactWorldStateHash: hashes.artifactWorld, contentHash: 'e'.repeat(64), paths: {},
};
const playable = characterIds.map((characterId, index) => ({
  characterId, enabled: true, difficulty: ['normal', 'hard', 'epic'][index], focus: ['查看世界'],
  card: { title: `入口${index + 1}`, tagline: '共同世界', background: '只改变视角', avatarIcon: 'house-stark' },
}));
const records = Object.fromEntries(characterIds.map((id, index) => [id, {
  id, rawId: id.slice(5), canonTier: 'canon', name: `人物${index + 1}`, dynastyId: 'dynn_Stark', female: false,
  born: true, alive: true, birthDate: '8263.1.1', deathDate: null, baseAttributes: {}, traits: [], spouseIds: [],
  relations: [], titleIds: [], titles: [], hasDna: true, source: { file: 'fixture.txt', line: index + 1 },
}]));
const artifacts = { schemaVersion: 1, startDate: '8298.5.10', datasetHash: hashes.artifactWorld, artifactDatasetHash: hashes.artifact, characterDatasetHash: hashes.characters, artifacts: {} };
const fixtureDependencies = {
  loadManifest: async () => structuredClone(worldManifest), loadPlayableCharacters: async () => structuredClone(playable),
  loadStartState: async () => structuredClone(worldStartState), loadTerminology: async () => ({ schemaVersion: 1, cultures: {}, faiths: {}, relationships: {} }),
  loadCharacterManifest: async () => ({ datasetHash: hashes.characters }),
  loadMapManifest: async () => ({ datasetHash: hashes.map }), loadCharacter: async (id) => structuredClone(records[id]),
  loadLoadout: async () => undefined, loadArtifacts: async () => structuredClone(artifacts),
};

test('三个可玩人物入口只改变控制者', async () => {
  const starts = await Promise.all(characterIds.map((id) => createLivingWorldGame(id, fixtureDependencies)));
  assert.deepEqual(starts.map((entry) => entry.worldId), ['agot-298', 'agot-298', 'agot-298']);
  assert.deepEqual(starts.map((entry) => entry.startDate), Array(3).fill({ year: 298, month: 5, day: 10 }));
  assert.equal(new Set(starts.map((entry) => entry.lord.canonicalCharacterId)).size, 3);
  assert.deepEqual(starts.map((entry) => entry.worldStartState), Array(3).fill(starts[0].worldStartState));
  assert.deepEqual(starts.map((entry) => entry.worldArtifacts), Array(3).fill(starts[0].worldArtifacts));
});

test('可玩人物源不重复基础人物事实', async () => {
  const source = JSON.parse(await readFile('content/world/playable-characters.json', 'utf8'));
  assert.deepEqual(source.map((entry) => entry.characterId), characterIds);
  for (const entry of source) {
    for (const forbidden of ['name', 'age', 'house', 'title', 'attributes', 'traits', 'location', 'items']) {
      assert.equal(Object.hasOwn(entry, forbidden), false, `${entry.characterId} 重复字段 ${forbidden}`);
    }
  }
});
