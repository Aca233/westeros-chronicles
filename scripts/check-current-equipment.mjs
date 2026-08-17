import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');
const [definitions, presets, prompt, reducer, store, dock, queue, equipment] = await Promise.all([
  read('src/data/itemDefinitions.ts'),
  read('src/data/itemPresetState.ts'),
  read('src/services/promptBuilder.ts'),
  read('src/services/stateReducer.ts'),
  read('src/store/useGameStore.ts'),
  read('src/components/ActionDock.tsx'),
  read('src/features/items/itemActionQueue.ts'),
  read('src/features/items/equipment.ts'),
]);
const failures = [];
const requireMarker = (source, marker, message) => { if (!source.includes(marker)) failures.push(message); };
requireMarker(definitions, "id: 'artifact.ice'", 'The item catalog does not define Ice.');
requireMarker(definitions, "layer: 'outerwear'", 'Cloaks are not represented as the torso outerwear layer.');
requireMarker(presets, "instanceId: 'ned.ice'", 'Ned does not have a deterministic Ice instance.');
requireMarker(presets, "siteId: 'winterfell_armory'", 'Winterfell armory custody is missing.');
requireMarker(prompt, '当前装备（唯一真实穿戴状态）', 'Prompt does not use the authoritative equipped item state.');
requireMarker(prompt, '当前可访问物品', 'Prompt does not expose only accessible item summaries.');
requireMarker(prompt, 'ITEM_EQUIP', 'Prompt does not teach the new item equip command.');
requireMarker(reducer, 'applyItemActions', 'Reducer does not apply item commands atomically.');
requireMarker(store, 'pendingItemActions', 'Store does not expose the generic item queue.');
requireMarker(store, 'mergePendingItemCommands', 'Queued item commands are not merged on submission.');
requireMarker(store, 'removeSubmittedItemActions', 'Successful submission does not remove only its queue snapshot.');
requireMarker(dock, 'data-item-action-queue', 'Action dock does not expose the generic item queue.');
requireMarker(dock, '待执行物品动作', 'Action dock still labels the queue as equipment-only.');
requireMarker(dock, '下一次对话生成成功后生效', 'Action dock does not explain delayed application.');
requireMarker(queue, '生成失败时仍保留队列和原状态', 'Queue prompt does not preserve actions after generation failure.');
requireMarker(equipment, "'head',\n  'torso',\n  'mainhand',\n  'offhand',\n  'feet',\n  'accessories'", 'Equipment does not expose the six agreed groups.');
for (const legacy of ['EQUIP_GEAR', 'EQUIP_FROM_INVENTORY', 'ADD_INVENTORY_ITEM', 'USE_POUCH_ITEM']) {
  if (prompt.includes(legacy)) failures.push(`Prompt still teaches legacy command ${legacy}.`);
}
try {
  await access(join(root, 'src/services/equipmentQueue.ts'));
  failures.push('Legacy equipment-only queue module still exists.');
} catch {
  // Expected after generic item queue cutover.
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Authoritative item custody and generic next-dialog action queue are source-backed.');
