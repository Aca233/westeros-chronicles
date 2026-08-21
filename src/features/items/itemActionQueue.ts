import type {
  EquipmentPosition,
  ItemAction,
  ItemImageRef,
  ItemStateCommand,
  ItemSystemState,
  ItemCatalog,
} from './types';
import type { PendingWorldTransaction } from '../world/worldRuntimeTypes';
import { getItemDefinition } from './catalog';

export interface PendingItemAction {
  id: string;
  action: ItemAction;
  instanceId?: string;
  itemName: string;
  image: ItemImageRef;
  label: string;
  conflictKey: string;
}

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

export function actionToCommand(action: ItemAction): ItemStateCommand {
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

export function itemCommandToAction(command: ItemStateCommand): ItemAction {
  switch (command.type) {
    case 'ITEM_CREATE': return { kind: 'acquire', instance: command.instance, placement: command.placement, historyType: command.historyType };
    case 'ITEM_EQUIP': return { kind: 'equip', instanceId: command.instanceId, position: command.position, displacedTo: command.displacedTo };
    case 'ITEM_UNEQUIP': return { kind: 'unequip', instanceId: command.instanceId, to: command.to };
    case 'ITEM_USE': return { kind: 'use', instanceId: command.instanceId, quantity: command.quantity };
    case 'ITEM_TRANSFER': return { kind: 'transfer', instanceId: command.instanceId, to: command.to, quantity: command.quantity, newInstanceId: command.newInstanceId };
    case 'ITEM_GIFT': return { kind: 'gift', instanceId: command.instanceId, recipientId: command.recipientId, quantity: command.quantity, newInstanceId: command.newInstanceId };
    case 'ITEM_DISCARD': return { kind: 'discard', instanceId: command.instanceId, quantity: command.quantity, newInstanceId: command.newInstanceId };
    case 'ITEM_REPAIR': return { kind: 'repair', instanceId: command.instanceId, amount: command.amount };
    case 'ITEM_DAMAGE': return { kind: 'damage', instanceId: command.instanceId, amount: command.amount, reason: command.reason };
    case 'ITEM_SPLIT': return { kind: 'split', instanceId: command.instanceId, quantity: command.quantity, newInstanceId: command.newInstanceId, to: command.to };
    case 'ITEM_MERGE': return { kind: 'merge', sourceInstanceId: command.sourceInstanceId, targetInstanceId: command.targetInstanceId };
    case 'ITEM_MARK_HEIRLOOM': return { kind: 'mark_heirloom', instanceId: command.instanceId, houseId: command.houseId };
  }
}

const ACTION_LABELS: Record<ItemAction['kind'], string> = {
  acquire: '收下', equip: '穿上', unequip: '卸下', use: '使用', transfer: '转移', gift: '赠送',
  discard: '丢弃', repair: '修理', damage: '受损', split: '拆分', merge: '合并', mark_heirloom: '立为传家宝',
};

export function pendingItemActionsFromWorldTransactions(
  queue: readonly PendingWorldTransaction[],
  state: ItemSystemState,
  catalog: ItemCatalog,
): PendingItemAction[] {
  const result: PendingItemAction[] = [];
  for (const transaction of queue) {
    if (transaction.status !== 'pending') continue;
    for (const [index, command] of (transaction.itemCommands ?? []).entries()) {
      const action = itemCommandToAction(command);
      const instanceId = instanceIdOf(action);
      const instance = action.kind === 'acquire' ? action.instance : instanceId ? state.instances[instanceId] : undefined;
      if (!instance) continue;
      const definition = getItemDefinition(catalog, instance.definitionId);
      result.push({
        id: index === 0 ? transaction.id : `${transaction.id}:${index}`,
        action,
        instanceId,
        itemName: instance.customName ?? definition.name,
        image: definition.image,
        label: ACTION_LABELS[action.kind],
        conflictKey: transaction.conflictKeys[0] ?? `asset:item:${instanceId}`,
      });
    }
  }
  return result;
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

export function mergePendingWorldItemCommands(
  queue: readonly PendingWorldTransaction[],
  modelCommands: readonly ItemStateCommand[],
): ItemStateCommand[] {
  const queuedCommands = queue
    .filter((entry) => entry.status === 'pending')
    .flatMap((entry) => entry.itemCommands ?? []);
  const queuedConflictKeys = new Set(queuedCommands.map(commandConflictKey));
  return [
    ...structuredClone(queuedCommands),
    ...modelCommands.filter((command) => !queuedConflictKeys.has(commandConflictKey(command))),
  ];
}

export function formatPendingItemPrompt(queue: readonly PendingItemAction[]): string {
  if (queue.length === 0) return '';
  const lines = queue.map((action) => `- ${action.label}【${action.itemName}】`);
  return `【界面已排队的物品动作】
以下动作是玩家已经确认的世界操作。请在下一次叙事中自然表现操作过程；前端只会在成功回复后原子结算，生成失败时仍保留队列和原状态。不要在 <state_cmd> 中重复输出这些 ITEM_* 命令。
${lines.join('\n')}`;
}
