import type {
  EquipmentPosition,
  ItemAction,
  ItemImageRef,
  ItemStateCommand,
} from './types';

export interface PendingItemAction {
  id: string;
  action: ItemAction;
  instanceId?: string;
  itemName: string;
  image: ItemImageRef;
  label: string;
  conflictKey: string;
}

let pendingSequence = 0;

function positionKey(position: EquipmentPosition): string {
  if (position.group === 'torso') return `torso:${position.layer}`;
  if (position.group === 'legs') return `legs:${position.layer}`;
  if (position.group === 'accessories') return `accessories:${position.index}`;
  return position.group;
}

function instanceIdOf(action: ItemAction): string | undefined {
  if (action.kind === 'acquire') return action.instance.instanceId;
  if (action.kind === 'merge') return action.sourceInstanceId;
  return action.instanceId;
}

function conflictKeyOf(action: ItemAction): string {
  switch (action.kind) {
    case 'equip': return `equip:${positionKey(action.position)}`;
    case 'use': return `item:${action.instanceId}:use`;
    case 'repair': return `item:${action.instanceId}:repair`;
    case 'transfer':
    case 'gift':
    case 'discard':
    case 'split':
    case 'unequip': return `item:${action.instanceId}:move`;
    case 'merge': return `item:${action.sourceInstanceId}:move`;
    case 'mark_heirloom': return `item:${action.instanceId}:heirloom`;
    case 'damage': return `item:${action.instanceId}:damage`;
    case 'acquire': return `item:${action.instance.instanceId}:create`;
  }
}

export function createPendingItemAction(
  action: ItemAction,
  model: { itemName: string; image: ItemImageRef; label: string },
): PendingItemAction {
  pendingSequence += 1;
  return {
    id: `pending_item_${Date.now()}_${pendingSequence}`,
    action,
    instanceId: instanceIdOf(action),
    itemName: model.itemName,
    image: model.image,
    label: model.label,
    conflictKey: conflictKeyOf(action),
  };
}

export function enqueueItemAction(
  queue: readonly PendingItemAction[],
  action: PendingItemAction,
): PendingItemAction[] {
  return [...queue.filter((entry) => entry.conflictKey !== action.conflictKey), action];
}

export function cancelItemAction(
  queue: readonly PendingItemAction[],
  actionId: string,
): PendingItemAction[] {
  return queue.filter((action) => action.id !== actionId);
}

function actionToCommand(action: ItemAction): ItemStateCommand {
  switch (action.kind) {
    case 'acquire': return { type: 'ITEM_CREATE', instance: action.instance, placement: action.placement, historyType: action.historyType };
    case 'equip': return { type: 'ITEM_EQUIP', instanceId: action.instanceId, position: action.position, displacedTo: action.displacedTo };
    case 'unequip': return { type: 'ITEM_UNEQUIP', instanceId: action.instanceId, to: action.to };
    case 'use': return { type: 'ITEM_USE', instanceId: action.instanceId, quantity: action.quantity };
    case 'transfer': return { type: 'ITEM_TRANSFER', instanceId: action.instanceId, to: action.to, quantity: action.quantity, newInstanceId: action.newInstanceId };
    case 'gift': return { type: 'ITEM_GIFT', instanceId: action.instanceId, recipientId: action.recipientId, quantity: action.quantity, newInstanceId: action.newInstanceId };
    case 'discard': return { type: 'ITEM_DISCARD', instanceId: action.instanceId, quantity: action.quantity, newInstanceId: action.newInstanceId };
    case 'repair': return { type: 'ITEM_REPAIR', instanceId: action.instanceId, amount: action.amount };
    case 'damage': return { type: 'ITEM_DAMAGE', instanceId: action.instanceId, amount: action.amount, reason: action.reason };
    case 'split': return { type: 'ITEM_SPLIT', instanceId: action.instanceId, quantity: action.quantity, newInstanceId: action.newInstanceId, to: action.to };
    case 'merge': return { type: 'ITEM_MERGE', sourceInstanceId: action.sourceInstanceId, targetInstanceId: action.targetInstanceId };
    case 'mark_heirloom': return { type: 'ITEM_MARK_HEIRLOOM', instanceId: action.instanceId, houseId: action.houseId };
  }
}

function commandConflictKey(command: ItemStateCommand): string {
  switch (command.type) {
    case 'ITEM_EQUIP': return `equip:${positionKey(command.position)}`;
    case 'ITEM_USE': return `item:${command.instanceId}:use`;
    case 'ITEM_REPAIR': return `item:${command.instanceId}:repair`;
    case 'ITEM_TRANSFER':
    case 'ITEM_GIFT':
    case 'ITEM_DISCARD':
    case 'ITEM_SPLIT':
    case 'ITEM_UNEQUIP': return `item:${command.instanceId}:move`;
    case 'ITEM_MERGE': return `item:${command.sourceInstanceId}:move`;
    case 'ITEM_MARK_HEIRLOOM': return `item:${command.instanceId}:heirloom`;
    case 'ITEM_DAMAGE': return `item:${command.instanceId}:damage`;
    case 'ITEM_CREATE': return `item:${command.instance.instanceId}:create`;
  }
}

export function mergePendingItemCommands(
  queue: readonly PendingItemAction[],
  modelCommands: readonly ItemStateCommand[],
): ItemStateCommand[] {
  const queuedConflictKeys = new Set(queue.map((entry) => entry.conflictKey));
  const queuedCommands = queue.map((entry) => actionToCommand(entry.action));
  const filteredModelCommands = modelCommands.filter((command) => !queuedConflictKeys.has(commandConflictKey(command)));
  return [...queuedCommands, ...filteredModelCommands];
}

export function removeSubmittedItemActions(
  current: readonly PendingItemAction[],
  submitted: readonly PendingItemAction[],
): PendingItemAction[] {
  const submittedIds = new Set(submitted.map((action) => action.id));
  return current.filter((action) => !submittedIds.has(action.id));
}

export function formatPendingItemPrompt(queue: readonly PendingItemAction[]): string {
  if (queue.length === 0) return '';
  const lines = queue.map((action) => `- ${action.label}【${action.itemName}】`);
  return `【界面已排队的物品动作】
以下动作是玩家已经确认的世界操作。请在下一次叙事中自然表现操作过程；前端只会在成功回复后原子结算，生成失败时仍保留队列和原状态。不要在 <state_cmd> 中重复输出这些 ITEM_* 命令。
${lines.join('\n')}`;
}
