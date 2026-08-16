import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/services/equipmentQueue.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  enqueueEquipmentAction,
  formatPendingEquipmentPrompt,
  getPendingEquipmentCommands,
  mergePendingEquipmentCommands,
  removeSubmittedEquipmentActions,
} = await import(moduleUrl);

const torso = {
  id: 'pending_torso',
  itemId: 'armor_a',
  itemName: '临冬城重板甲',
  slot: 'torso',
  from: { type: 'site', id: 'winterfell_armory' },
  sourceLabel: '临冬城军械库',
};

const secondTorso = {
  ...torso,
  id: 'pending_torso_2',
  itemId: 'armor_b',
  itemName: '北境锁子甲',
};

const head = {
  id: 'pending_head',
  itemId: 'helmet_a',
  itemName: '狼首战盔',
  slot: 'head',
  from: { type: 'site', id: 'winterfell_armory' },
  sourceLabel: '临冬城军械库',
};

test('同一装备槽的新排队项替换旧项，其他槽位保留', () => {
  let queue = enqueueEquipmentAction([], torso);
  queue = enqueueEquipmentAction(queue, head);
  queue = enqueueEquipmentAction(queue, secondTorso);
  assert.deepEqual(queue.map((entry) => entry.itemId), ['helmet_a', 'armor_b']);
});

test('排队装备转为来源明确且不含整备字段的命令', () => {
  const commands = getPendingEquipmentCommands([torso]);
  assert.deepEqual(commands, [{
    type: 'EQUIP_ITEM',
    itemId: 'armor_a',
    from: { type: 'site', id: 'winterfell_armory' },
    slot: 'torso',
  }]);
  assert.equal('preparation' in commands[0], false);
});

test('排队命令在模型命令前执行并去掉同物品或同槽位的重复装备命令', () => {
  const modelCommands = [
    { type: 'CHANGE_LOCATION', location: '君临' },
    { type: 'EQUIP_ITEM', itemId: 'armor_a', from: { type: 'site', id: 'winterfell_armory' }, slot: 'torso' },
    { type: 'EQUIP_ITEM', itemId: 'armor_b', from: { type: 'site', id: 'winterfell_armory' }, slot: 'torso' },
  ];
  const merged = mergePendingEquipmentCommands([torso], modelCommands);
  assert.equal(merged[0].type, 'EQUIP_ITEM');
  assert.equal(merged[0].itemId, 'armor_a');
  assert.equal(merged[1].type, 'CHANGE_LOCATION');
  assert.equal(merged.length, 2);
});

test('成功后只移除本次提交的排队项，后来加入的项目保留', () => {
  const remaining = removeSubmittedEquipmentActions([torso, head], [torso]);
  assert.deepEqual(remaining.map((entry) => entry.id), ['pending_head']);
});


test('排队提示要求本轮自然写出穿戴过程且由前端在回复后结算', () => {
  const prompt = formatPendingEquipmentPrompt([torso]);
  assert.match(prompt, /下一次叙事/);
  assert.match(prompt, /回复成功后/);
  assert.match(prompt, /临冬城军械库/);
  assert.match(prompt, /临冬城重板甲/);
  assert.doesNotMatch(prompt, /preparation|整备/);
});
