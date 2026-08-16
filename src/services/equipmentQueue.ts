import type {
  EquippedGearSlot,
  InventoryItem,
  ItemContainerRef,
  PendingEquipmentAction,
  StateCommand,
} from '../types/game';

function inferQueuedSlot(item: InventoryItem): EquippedGearSlot {
  if (item.slot) return item.slot;
  if (/头盔|战盔|风帽|冠冕/i.test(item.name)) return 'head';
  if (/甲|铠|胸甲|锁子甲/i.test(item.name)) return 'torso';
  if (/盾|火把/i.test(item.name)) return 'offhand';
  if (/靴|鞋|护胫/i.test(item.name)) return 'legs';
  if (/斗篷|大氅|披风/i.test(item.name)) return 'cloak';
  return 'mainhand';
}

function containerKey(from: ItemContainerRef): string {
  return from.type === 'carried' ? 'carried' : `${from.type}:${from.id}`;
}

export function createPendingEquipmentAction(
  item: InventoryItem,
  from: ItemContainerRef,
  sourceLabel: string,
): PendingEquipmentAction {
  const slot = inferQueuedSlot(item);
  return {
    id: `${slot}:${containerKey(from)}:${item.id}`,
    itemId: item.id,
    itemName: item.name,
    icon: item.icon || item.gearData?.icon,
    from,
    slot,
    sourceLabel,
  };
}

/** 同一槽位只保留玩家最后一次选择，避免下一回合连续穿脱互相覆盖。 */
export function enqueueEquipmentAction(
  queue: PendingEquipmentAction[],
  action: PendingEquipmentAction,
): PendingEquipmentAction[] {
  return [...queue.filter((entry) => entry.slot !== action.slot), action];
}

export function getPendingEquipmentCommands(queue: PendingEquipmentAction[]): StateCommand[] {
  return queue.map((action) => ({
    type: 'EQUIP_ITEM' as const,
    itemId: action.itemId,
    from: action.from,
    slot: action.slot,
  }));
}

/**
 * 排队操作是玩家在界面上的确定选择，先于模型命令执行。
 * 模型若重复输出相同物品或同一槽位的装备命令，则忽略该重复命令。
 */
export function mergePendingEquipmentCommands(
  queue: PendingEquipmentAction[],
  modelCommands: StateCommand[],
): StateCommand[] {
  const queuedCommands = getPendingEquipmentCommands(queue);
  const queuedItemIds = new Set(queue.map((action) => action.itemId));
  const queuedSlots = new Set(queue.map((action) => action.slot));
  const filteredModelCommands = modelCommands.filter((command) => {
    if (command.type !== 'EQUIP_ITEM' && command.type !== 'EQUIP_FROM_INVENTORY') return true;
    return !queuedItemIds.has(command.itemId) && !(command.slot && queuedSlots.has(command.slot));
  });
  return [...queuedCommands, ...filteredModelCommands];
}

export function removeSubmittedEquipmentActions(
  current: PendingEquipmentAction[],
  submitted: PendingEquipmentAction[],
): PendingEquipmentAction[] {
  const submittedIds = new Set(submitted.map((action) => action.id));
  return current.filter((action) => !submittedIds.has(action.id));
}

export function formatPendingEquipmentPrompt(queue: PendingEquipmentAction[]): string {
  if (!queue.length) return '';
  const lines = queue.map((action) => `- 从${action.sourceLabel}取出并穿上【${action.itemName}】`);
  return `【界面已排队的装备动作】
这些动作不要求玩家输入固定口令。请在下一次叙事中自然写出取用与穿戴过程；前端只会在本次回复成功后确定性结算装备状态。不要在 <state_cmd> 中重复输出这些 EQUIP_ITEM 命令。
${lines.join('\n')}`;
}
