import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/data/itemDefinitions.ts';",
      "export * from './src/features/items/worldArtifacts.ts';",
      "export * from './src/features/items/worldArtifactClassification.ts';",
      "export * from './src/store/useGameStore.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'world-artifact-state-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  ITEM_CATALOG,
  preloadItemCatalog,
  createInitialAgotArtifactWorldState,
  isWorldArtifactAsset,
  listCharacterRecordedEquipment,
  validateWorldArtifactState,
  useGameStore,
} = await import(moduleUrl);
await preloadItemCatalog();

const first = createInitialAgotArtifactWorldState();
const second = createInitialAgotArtifactWorldState();
validateWorldArtifactState(first);

assert.equal(first.schemaVersion, 1);
assert.equal(first.startDate, '8298.1.1');
assert.match(first.datasetHash, /^[a-f0-9]{64}$/);
assert.equal(Object.keys(first.artifacts).length, 70);

const longclaw = first.artifacts['artifact.longclaw'];
assert.ok(longclaw, '298 AC world state should contain Longclaw');
assert.equal(longclaw.lawfulControllerId, 'agot:Mormont_2');
assert.deepEqual(longclaw.placement, { type: 'character', characterId: 'agot:Mormont_2' });
assert.equal(longclaw.equipped, false);
assert.equal(longclaw.projectionKind, 'portable-asset');

const throne = first.artifacts['artifact.generated.iron-throne'];
assert.ok(throne, '298 AC world state should contain the Iron Throne');
assert.equal(throne.lawfulControllerId, 'agot:Baratheon_2');
assert.equal(throne.projectionKind, 'political-symbol');
assert.deepEqual(throne.placement, {
  type: 'title',
  titleId: 'b_the_red_keep',
  controllerId: 'agot:Baratheon_2',
});
assert.equal(isWorldArtifactAsset(throne), false, 'generated political symbols must be excluded by explicit classification');
assert.equal(isWorldArtifactAsset(longclaw), true, 'generated portable assets remain in asset projections');
assert.equal(isWorldArtifactAsset({ definitionId: 'artifact.generated.iron-throne' }), false, 'legacy records retain the ID guard');

const records = Object.values(first.artifacts);
assert.equal(new Set(records.map((record) => record.instanceId)).size, records.length);
assert.equal(new Set(records.map((record) => record.definitionId)).size, records.length);
assert.ok(records.every((record) => record.equipped === false));
assert.ok(records.every((record) => record.projectionKind === 'portable-asset' || record.projectionKind === 'political-symbol'));
assert.equal(records.filter((record) => record.projectionKind === 'political-symbol').length, 7);
assert.ok(records.every((record) => ITEM_CATALOG.has(record.definitionId)), 'world artifact must reference the item catalog');
assert.ok(records.every((record) => !/crown.*winter|winter.*crown/i.test(record.source.effectId)), '298 AC should not create a winter crown');

first.artifacts['artifact.longclaw'].lawfulControllerId = 'mutated';
assert.equal(second.artifacts['artifact.longclaw'].lawfulControllerId, 'agot:Mormont_2', 'new games must not share mutable world state');
assert.equal(ITEM_CATALOG.get('artifact.longclaw').unique, true);
assert.equal(Object.keys(second.artifacts).some((id) => second.artifacts[id].placement.type === 'equipped'), false);

const robertEquipment = listCharacterRecordedEquipment(second, 'agot:Baratheon_2');
assert.equal(robertEquipment.length, 2, 'only equipment directly held by Robert should be listed');
assert.ok(robertEquipment.every((record) => record.placement.type === 'character'));
assert.ok(robertEquipment.every((record) => record.definitionId !== 'artifact.generated.iron-throne'), 'title-held fixtures wait for the map UI');
assert.deepEqual(robertEquipment.map((record) => record.definitionId), [...robertEquipment.map((record) => record.definitionId)].sort());
assert.deepEqual(listCharacterRecordedEquipment(second, 'agot:missing'), []);

const initialGameState = useGameStore.getState().gameState;
assert.equal(initialGameState.worldArtifacts.datasetHash, second.datasetHash);
assert.equal(initialGameState.worldArtifacts.artifacts['artifact.longclaw'].lawfulControllerId, 'agot:Mormont_2');
assert.equal(Object.values(initialGameState.lord.items.instances).some((item) => item.instanceId === longclaw.instanceId), false, 'world artifacts must not be copied into lord.items');

console.log('World artifact state tests passed.');
