import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/features/items/itemActionQueue.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  formatPendingItemPrompt,
  mergePendingWorldItemCommands,
  pendingItemActionsFromWorldTransactions,
} = await import(moduleUrl);

const image = { type: 'game', icon: 'crossed-swords' };
const catalog = new Map([['weapon.test', {
  id: 'weapon.test', name: '测试长剑', description: '', roleplayText: '', category: 'weapon', subcategory: 'sword', tags: [],
  image, material: 'steel', baseQuality: 'common', rarity: 'common', bulk: 'medium', stackable: false, maxStack: 1,
  unique: false, equippable: true, allowedPositions: [{ group: 'mainhand' }], baseValue: 1, effects: [],
}]]);
const state = {
  schemaVersion: 1,
  instances: { sword: { instanceId: 'sword', definitionId: 'weapon.test', quantity: 1, durability: 100, quality: 'common', renown: 0, isHeirloom: false, history: [] } },
  placements: { sword: { type: 'carried' } },
  sites: {},
  vehicles: {},
};
const pending = {
  id: 'tx:item:sword', status: 'pending', source: 'ui_action',
  conflictKeys: ['asset:item:sword', 'equipment:agot:1001:mainhand'], intents: [],
  itemCommands: [{ type: 'ITEM_EQUIP', instanceId: 'sword', position: { group: 'mainhand' }, displacedTo: { type: 'carried' } }],
};

test('统一事务可投影为原位置取消按钮需要的物品动作视图', () => {
  const actions = pendingItemActionsFromWorldTransactions([pending], state, catalog);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].id, pending.id);
  assert.equal(actions[0].instanceId, 'sword');
  assert.equal(actions[0].itemName, '测试长剑');
  assert.equal(actions[0].label, '穿上');
});

test('已结算事务不再投影成待处理物品动作', () => {
  const actions = pendingItemActionsFromWorldTransactions([{ ...pending, status: 'cancelled' }], state, catalog);
  assert.deepEqual(actions, []);
});

test('合并命令时界面世界事务优先并过滤模型重复槽位命令', () => {
  const commands = mergePendingWorldItemCommands([pending], [
    { type: 'ITEM_EQUIP', instanceId: 'model_sword', position: { group: 'mainhand' }, displacedTo: { type: 'carried' } },
    { type: 'ITEM_REPAIR', instanceId: 'armor', amount: 10 },
  ]);
  assert.equal(commands.length, 2);
  assert.equal(commands[0].type, 'ITEM_EQUIP');
  assert.equal(commands[0].instanceId, 'sword');
  assert.equal(commands[1].type, 'ITEM_REPAIR');
});

test('提示说明成功回复后才结算并禁止模型重复命令', () => {
  const queue = pendingItemActionsFromWorldTransactions([pending], state, catalog);
  const prompt = formatPendingItemPrompt(queue);
  assert.match(prompt, /成功回复后/);
  assert.match(prompt, /不要在 <state_cmd> 中重复/);
  assert.match(prompt, /穿上【测试长剑】/);
});
