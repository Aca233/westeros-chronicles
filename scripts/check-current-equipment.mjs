import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');
const [presets, creator, prompt, reducer, sheet, types, store, dock, queue] = await Promise.all([
  read('src/data/presets.ts'),
  read('src/components/CharacterCreator.tsx'),
  read('src/services/promptBuilder.ts'),
  read('src/services/stateReducer.ts'),
  read('src/components/CharacterSheet.tsx'),
  read('src/types/game.ts'),
  read('src/store/useGameStore.ts'),
  read('src/components/ActionDock.tsx'),
  read('src/services/equipmentQueue.ts'),
]);
const failures = [];
const requireMarker = (source, marker, message) => { if (!source.includes(marker)) failures.push(message); };
requireMarker(presets, "name: '北境深灰羊毛外衣'", 'Ned is still shown in battle armor during the godswood opening.');
requireMarker(presets, "name: '徒手空拳'", 'Unarmed current-scene loadout is missing.');
requireMarker(presets, "id: 'winterfell_armory'", 'Ned battle equipment is not stored in the Winterfell armory.');
requireMarker(presets, 'carriedItems:', 'Preset carried-item lists are missing.');
requireMarker(creator, '家族纹章礼服', 'Custom rulers still begin in battle armor inside the great hall.');
requireMarker(creator, 'storageSites:', 'Custom ruler armory storage is missing.');
requireMarker(types, 'interface TransportStorage', 'Transport storage model is missing.');
requireMarker(prompt, '唯一当前穿戴与持握的装备', 'Prompt does not bind narration to the current equipped slots.');
requireMarker(prompt, '玩家无需使用任何固定关键词', 'Prompt still requires a fixed equipment phrase.');
requireMarker(prompt, '"type": "EQUIP_ITEM"', 'Prompt does not use source-backed equipment changes.');
requireMarker(prompt, '当前地点可用储藏', 'Prompt does not expose location storage.');
requireMarker(reducer, '必须先归入随身物品、当前据点或附近运输工具', 'Reducer still allows conjuring equipment directly into a slot.');
requireMarker(reducer, 'equipFromContainer(next, cmd.itemId, cmd.from, cmd.slot, changesLog)', 'Source-backed equipment cannot be applied without a legacy preparation flag.');
requireMarker(prompt, '不得把战甲当作日常服装持续穿戴', 'Prompt does not prevent permanent everyday armor use.');
requireMarker(sheet, 'title="随身物品"', 'Character sheet does not show carried items.');
requireMarker(sheet, '远方储藏', 'Character sheet does not separate inaccessible storage.');
requireMarker(types, 'interface PendingEquipmentAction', 'Pending equipment action model is missing.');
requireMarker(sheet, 'onQueueEquip={queueEquipmentAction}', 'Equipment buttons still change gear immediately instead of entering the queue.');
requireMarker(dock, 'data-equipment-queue', 'Action dock does not expose the pending equipment queue.');
requireMarker(dock, '下一次对话生成成功后生效', 'Action dock does not explain delayed equipment timing.');
requireMarker(queue, '前端只会在本次回复成功后确定性结算装备状态', 'Queued equipment is not bound to the next successful response.');
requireMarker(store, 'mergePendingEquipmentCommands(submittedEquipmentActions', 'Queued equipment is not merged into the next successful turn.');
requireMarker(store, 'removeSubmittedEquipmentActions(get().pendingEquipmentActions', 'Successful submissions do not clear only their queued equipment actions.');
if (types.includes('preparation?:') || reducer.includes('preparation !==')) failures.push('Legacy battle-preparation gate still exists.');
if (prompt.includes('"type": "EQUIP_GEAR"')) failures.push('Prompt still teaches the model to replace equipment directly.');
if (prompt.includes('EQUIP_FROM_INVENTORY') || prompt.includes('ADD_INVENTORY_ITEM')) failures.push('Prompt still teaches the legacy all-purpose inventory model.');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Equipment custody and next-dialog equipment queue are source-backed.');
