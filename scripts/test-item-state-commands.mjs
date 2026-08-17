import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/services/stateReducer.ts';",
      "export * from './src/data/presets.ts';",
      "export * from './src/data/itemDefinitions.ts';",
      "export * from './src/features/items/state.ts';",
      "export * from './src/services/api.ts';",
    ].join('\n'),
    resolveDir: process.cwd(), sourcefile: 'item-state-command-entry.ts', loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { applyStateCommands, generateOfflineDemoResponse, PRESET_SCENARIOS, ITEM_CATALOG, createItemInstance } = await import(url);

function ned() {
  return structuredClone(PRESET_SCENARIOS.find((preset) => preset.id === 'ned_stark').initialLord);
}
function historylessInstance(id, definitionId, overrides = {}) {
  return createItemInstance(ITEM_CATALOG, definitionId, id, overrides);
}

test('ITEM_CREATE 拒绝未知定义且不改变物品状态', () => {
  const lord = ned();
  const before = structuredClone(lord.items);
  const result = applyStateCommands(lord, [{
    type: 'ITEM_CREATE',
    instance: { instanceId: 'bad', definitionId: 'unknown.item', quantity: 1, durability: 100, quality: 'common', renown: 0, isHeirloom: false, history: [] },
    placement: { type: 'carried' },
    historyType: 'acquired',
  }]);
  assert.deepEqual(result.updatedLord.items, before);
  assert.match(result.changesLog.join('\n'), /未知物品定义/);
});

test('ITEM_EQUIP 可从当前据点穿上已存在实例', () => {
  const result = applyStateCommands(ned(), [{
    type: 'ITEM_EQUIP', instanceId: 'ned.chainmail', position: { group: 'torso', layer: 'armor' }, displacedTo: { type: 'site', siteId: 'winterfell_armory' },
  }]);
  assert.deepEqual(result.updatedLord.items.placements['ned.chainmail'], { type: 'equipped', position: { group: 'torso', layer: 'armor' } });
});

test('ITEM_TRANSFER 不能让随身容量溢出', () => {
  const lord = ned();
  lord.items.placements['ned.castle_sword'] = { type: 'site', siteId: 'winterfell_armory' };
  for (let index = 0; index < 4; index += 1) {
    const id = `full_cloak_${index}`;
    lord.items.instances[id] = historylessInstance(id, 'clothing.grey_wolf_cloak');
    lord.items.placements[id] = { type: 'carried' };
  }
  lord.items.placements['ned.staunching_herbs'] = { type: 'site', siteId: 'winterfell_room' };
  const before = structuredClone(lord.items);
  const result = applyStateCommands(lord, [{ type: 'ITEM_TRANSFER', instanceId: 'ned.castle_sword', to: { type: 'carried' } }]);
  assert.deepEqual(result.updatedLord.items, before);
  assert.match(result.changesLog.join('\n'), /随身容量不足/);
});

test('混合物品批次中任一命令无效会回滚整个物品批次', () => {
  const lord = ned();
  const before = structuredClone(lord.items);
  const result = applyStateCommands(lord, [
    { type: 'ITEM_TRANSFER', instanceId: 'ned.castle_sword', to: { type: 'carried' } },
    { type: 'ITEM_GIFT', instanceId: 'missing', recipientId: 'char_arya' },
  ]);
  assert.deepEqual(result.updatedLord.items, before);
  assert.match(result.changesLog.join('\n'), /物品实例不存在/);
});


test('离线叙事只从目录和可访问实例生成新版物品命令', () => {
  const lord = ned();
  const gameState = { saveFormatVersion: 5, currentYear: 298, currentMonth: 10, currentDay: 15, currentSeason: '晚秋', turnCount: 1, lord, turns: [], worldFlags: {}, isGameOver: false };
  const response = generateOfflineDemoResponse('换剑', 2, gameState);
  const itemCommand = response.stateCommands.find((command) => command.type === 'ITEM_EQUIP');
  assert.ok(itemCommand);
  assert.equal(itemCommand.instanceId, 'ned.castle_sword');
  assert.equal(response.stateCommands.some((command) => ['EQUIP_ITEM', 'ADD_ITEM', ['EQUIP_', 'GEAR'].join('')].includes(command.type)), false);
});
