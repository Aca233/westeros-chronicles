import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/features/items/actionChoices.ts';",
      "export * from './src/features/items/state.ts';",
      "export * from './src/data/itemPresetState.ts';",
      "export * from './src/data/itemDefinitions.ts';",
    ].join('\n'),
    resolveDir: process.cwd(), sourcefile: 'item-action-choices-entry.ts', loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  ITEM_CATALOG,
  createItemInstance,
  createNedItemState,
  getEquipmentReplacementChoices,
  getTransferDestinationChoices,
} = await import(url);

test('更换返回全部可接触的兼容装备而不是直接取第一个', () => {
  const state = createNedItemState();
  state.instances['ned.spare_sword'] = createItemInstance(ITEM_CATALOG, 'weapon.castle_bastard_sword', 'ned.spare_sword', { customName: '备用临冬城长名称骑行佩剑' });
  state.placements['ned.spare_sword'] = { type: 'carried' };
  state.sites.remote_armory = { id: 'remote_armory', name: '君临军械库', type: 'armory', location: '君临', description: '远方据点' };
  state.instances['ned.remote_sword'] = createItemInstance(ITEM_CATALOG, 'weapon.castle_bastard_sword', 'ned.remote_sword');
  state.placements['ned.remote_sword'] = { type: 'site', siteId: 'remote_armory' };
  state.instances['ned.broken_sword'] = createItemInstance(ITEM_CATALOG, 'weapon.castle_bastard_sword', 'ned.broken_sword', { durability: 0 });
  state.placements['ned.broken_sword'] = { type: 'carried' };

  const choices = getEquipmentReplacementChoices({
    state,
    catalog: ITEM_CATALOG,
    currentLocation: '临冬城·领主厅',
    positions: [{ group: 'mainhand' }],
    excludedIds: ['ned.ice'],
  });

  assert.deepEqual(new Set(choices.map((choice) => choice.instanceId)), new Set(['ned.castle_sword', 'ned.spare_sword']));
  assert.ok(choices.every((choice) => choice.position.group === 'mainhand'));
  assert.ok(choices.some((choice) => choice.name === '备用临冬城长名称骑行佩剑'));
  assert.ok(choices.every((choice) => choice.instanceId !== 'ned.remote_sword' && choice.instanceId !== 'ned.broken_sword'));
});

test('转移返回所有本地目的地并排除当前位置', () => {
  const state = createNedItemState();
  state.vehicles.winterfell_wagon = { id: 'winterfell_wagon', name: '临冬城随行辎重马车', type: 'wagon', location: '临冬城', capacity: 24, description: '本地运输' };
  state.vehicles.remote_wagon = { id: 'remote_wagon', name: '君临马车', type: 'wagon', location: '君临', capacity: 24, description: '远方运输' };

  const choices = getTransferDestinationChoices({
    state,
    currentLocation: '临冬城·领主厅',
    from: { type: 'site', siteId: 'winterfell_armory' },
  });

  assert.deepEqual(choices.map((choice) => choice.id), [
    'carried',
    'site:winterfell_room',
    'vehicle:winterfell_wagon',
  ]);
  assert.ok(choices.some((choice) => choice.label === '临冬城领主起居室'));
  assert.ok(choices.some((choice) => choice.label === '临冬城随行辎重马车'));
  assert.ok(choices.every((choice) => choice.id !== 'site:winterfell_armory' && choice.id !== 'vehicle:remote_wagon'));
});
