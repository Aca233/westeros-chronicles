import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/features/items/itemActionQueue.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  cancelItemAction,
  createPendingItemAction,
  enqueueItemAction,
  formatPendingItemPrompt,
  mergePendingItemCommands,
  removeSubmittedItemActions,
} = await import(moduleUrl);

const image = { type: 'game', icon: 'crossed-swords' };
function pending(action, itemName, label) {
  return createPendingItemAction(action, { itemName, image, label });
}

test('同一装备位置以后一次选择为准且不影响无关动作', () => {
  const oldSword = pending({ kind: 'equip', instanceId: 'old_sword', position: { group: 'mainhand' }, displacedTo: { type: 'carried' } }, '旧剑', '换上旧剑');
  const queuedGift = pending({ kind: 'gift', instanceId: 'ring', recipientId: 'char_sansa' }, '银戒', '赠送银戒');
  const newSword = pending({ kind: 'equip', instanceId: 'new_sword', position: { group: 'mainhand' }, displacedTo: { type: 'carried' } }, '新剑', '换上新剑');
  assert.deepEqual(enqueueItemAction([oldSword, queuedGift], newSword), [queuedGift, newSword]);
});

test('取消只按动作 ID 删除', () => {
  const first = pending({ kind: 'repair', instanceId: 'sword', amount: 20 }, '长剑', '修理长剑');
  const second = pending({ kind: 'mark_heirloom', instanceId: 'sword', houseId: 'house_stark' }, '长剑', '立为传家宝');
  assert.deepEqual(cancelItemAction([first, second], first.id), [second]);
});

test('成功提交只移除提交快照，不会吞掉后来动作', () => {
  const oldSword = pending({ kind: 'equip', instanceId: 'old_sword', position: { group: 'mainhand' }, displacedTo: { type: 'carried' } }, '旧剑', '换剑');
  const laterRepair = pending({ kind: 'repair', instanceId: 'old_sword', amount: 10 }, '旧剑', '修剑');
  assert.deepEqual(removeSubmittedItemActions([oldSword, laterRepair], [oldSword]), [laterRepair]);
});

test('合并命令时前端动作优先并过滤模型重复命令', () => {
  const queued = pending({ kind: 'equip', instanceId: 'new_sword', position: { group: 'mainhand' }, displacedTo: { type: 'carried' } }, '新剑', '换上新剑');
  const commands = mergePendingItemCommands([queued], [
    { type: 'ITEM_EQUIP', instanceId: 'model_sword', position: { group: 'mainhand' }, displacedTo: { type: 'carried' } },
    { type: 'ITEM_REPAIR', instanceId: 'armor', amount: 10 },
  ]);
  assert.equal(commands.length, 2);
  assert.equal(commands[0].type, 'ITEM_EQUIP');
  assert.equal(commands[0].instanceId, 'new_sword');
  assert.equal(commands[1].type, 'ITEM_REPAIR');
});

test('提示说明成功回复后才结算并禁止模型重复命令', () => {
  const queued = pending({ kind: 'use', instanceId: 'herbs' }, '止血药草', '使用止血药草');
  const prompt = formatPendingItemPrompt([queued]);
  assert.match(prompt, /成功回复后/);
  assert.match(prompt, /不要在 <state_cmd> 中重复/);
  assert.match(prompt, /使用止血药草/);
});
