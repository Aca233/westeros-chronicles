import type { PendingItemAction } from './itemActionQueue';
import { getItemDefinition } from './catalog';
import {
  ACCESSORY_INDICES,
  EQUIPMENT_GROUPS,
  LEG_LAYERS,
  TORSO_LAYERS,
  getEquippedInstance,
  getReservedPositions,
} from './equipment';
import type {
  CraftQuality,
  EquipmentGroup,
  EquipmentPosition,
  ItemAction,
  ItemBulk,
  ItemCatalog,
  ItemCategory,
  ItemDefinition,
  ItemEffect,
  ItemHistoryEntry,
  ItemImageRef,
  ItemInstance,
  ItemPlacement,
  ItemRarity,
  ItemSystemState,
} from './types';

export type CustodyTab = 'carried' | 'current-site' | 'vehicle' | 'remote-site';

export interface ItemCardModel {
  key: string;
  instanceId: string;
  name: string;
  image: ItemImageRef;
  category: ItemCategory;
  quality: CraftQuality;
  rarity: ItemRarity;
  quantityLabel: string;
  durabilityLabel: string;
  bulkLabel: string;
  locationLabel: string;
  primaryEffects: string[];
  description: string;
  roleplayText: string;
  provenanceLines: string[];
  history: ItemHistoryEntry[];
  actions: Array<{ kind: ItemAction['kind']; label: string; disabledReason?: string }>;
}

export interface EquipmentGroupModel {
  group: EquipmentGroup;
  label: string;
  summary: string;
  items: ItemCardModel[];
  positions: Array<{ key: string; label: string; item?: ItemCardModel }>;
  reservedByTwoHandedItem: boolean;
}

const GROUP_LABELS: Record<EquipmentGroup, string> = {
  head: '头部',
  torso: '躯干',
  mainhand: '主手',
  offhand: '副手',
  legs: '双腿',
  accessories: '佩饰',
};

const BULK_LABELS: Record<ItemBulk, string> = {
  tiny: '微小',
  small: '小型',
  medium: '中型',
  large: '大型',
};

const TORSO_LABELS = { garment: '服装', armor: '护甲', outerwear: '外披' } as const;
const LEG_LABELS = { legwear: '腿部', footwear: '足部' } as const;
const EFFECT_KIND_LABELS: Record<ItemEffect['kind'], string> = {
  check_modifier: '检定',
  action_unlock: '行动',
  protection: '防护',
  social: '身份',
  burden: '负担',
  fatigue: '疲劳',
  heat: '闷热',
  resource: '资源',
  capacity: '收纳',
  narrative: '叙事',
};

function locationRoot(location: string): string {
  return location.split('·', 1)[0].trim();
}

function sameLocation(left: string, right: string): boolean {
  return locationRoot(left) === locationRoot(right);
}

function positionKey(position: EquipmentPosition): string {
  if (position.group === 'torso') return `torso:${position.layer}`;
  if (position.group === 'legs') return `legs:${position.layer}`;
  if (position.group === 'accessories') return `accessories:${position.index}`;
  return position.group;
}

function positionLabel(position: EquipmentPosition): string {
  if (position.group === 'torso') return TORSO_LABELS[position.layer];
  if (position.group === 'legs') return LEG_LABELS[position.layer];
  if (position.group === 'accessories') return `佩饰 ${position.index + 1}`;
  return GROUP_LABELS[position.group];
}

function formatEffect(effect: ItemEffect): string {
  if (effect.kind === 'narrative') return effect.directive;
  if (effect.kind === 'action_unlock') return `${EFFECT_KIND_LABELS[effect.kind]} · ${effect.label}`;
  if (effect.kind === 'capacity') return `${effect.label} · +${effect.units} 容量`;
  const signed = 'value' in effect && effect.value !== 0 ? ` ${effect.value > 0 ? '+' : ''}${effect.value}` : '';
  return `${EFFECT_KIND_LABELS[effect.kind]} · ${effect.label}${signed}`;
}

function locationLabel(state: ItemSystemState, placement: ItemPlacement): string {
  switch (placement.type) {
    case 'carried': return '随身携带';
    case 'site': {
      const site = state.sites[placement.siteId];
      return site ? `${site.name} · ${site.location}` : '未知据点';
    }
    case 'vehicle': {
      const vehicle = state.vehicles[placement.vehicleId];
      return vehicle ? `${vehicle.name} · ${vehicle.location}` : '未知运输工具';
    }
    case 'equipped': return `已装备 · ${positionLabel(placement.position)}`;
    case 'character': return `由人物持有 · ${placement.characterId}`;
    case 'lost': return `已遗失 · ${placement.reason}`;
  }
}

function provenanceLines(instance: ItemInstance, definition: ItemDefinition): string[] {
  const result: string[] = [];
  if (definition.provenance?.maker) result.push(`制作者：${definition.provenance.maker}`);
  if (definition.provenance?.origin) result.push(`来历：${definition.provenance.origin}`);
  if (definition.provenance?.createdAt) result.push(`年代：${definition.provenance.createdAt}`);
  if (definition.provenance?.boundHouse) result.push(`绑定家族：${definition.provenance.boundHouse}`);
  if (instance.lawfulControllerId) result.push(`合法归属：${instance.lawfulControllerId}`);
  if (instance.isHeirloom) result.push('家族传家宝');
  if (instance.renown > 0) result.push(`名望：${instance.renown}`);
  return result;
}

function createActions(
  instance: ItemInstance,
  definition: ItemDefinition,
  placement: ItemPlacement,
  pendingActions: readonly PendingItemAction[],
): ItemCardModel['actions'] {
  const actions: Array<{ kind: ItemAction['kind']; label: string }> = [];
  if (placement.type === 'equipped') {
    actions.push({ kind: 'unequip', label: '卸下' });
  } else {
    if (definition.equippable && placement.type !== 'character' && placement.type !== 'lost') {
      actions.push({ kind: 'equip', label: '穿上' });
    }
    if (['medicine', 'poison', 'supply', 'tool'].includes(definition.category)) {
      actions.push({ kind: 'use', label: '使用' });
    }
    if (placement.type === 'carried' || placement.type === 'site' || placement.type === 'vehicle') {
      actions.push({ kind: 'transfer', label: '转移' }, { kind: 'gift', label: '赠予' }, { kind: 'discard', label: '放弃' });
    }
  }
  if (instance.durability < 100) actions.push({ kind: 'repair', label: '修理' });
  if (!instance.isHeirloom) actions.push({ kind: 'mark_heirloom', label: '定为传家宝' });

  const pending = pendingActions.find((entry) => entry.instanceId === instance.instanceId);
  return actions.map((action) => ({
    ...action,
    disabledReason: pending ? `已有待执行动作：${pending.label}` : undefined,
  }));
}

function buildCard(
  state: ItemSystemState,
  catalog: ItemCatalog,
  instance: ItemInstance,
  pendingActions: readonly PendingItemAction[],
): ItemCardModel {
  const definition = getItemDefinition(catalog, instance.definitionId);
  const placement = state.placements[instance.instanceId];
  if (!placement) throw new Error(`物品缺少位置：${instance.instanceId}`);
  const quantityParts = [instance.quantity > 1 ? `${instance.quantity} 件` : '1 件'];
  if (instance.charges !== undefined) quantityParts.push(`剩余 ${instance.charges} 次`);
  return {
    key: `item:${instance.instanceId}`,
    instanceId: instance.instanceId,
    name: instance.customName ?? definition.name,
    image: { ...definition.image },
    category: definition.category,
    quality: instance.quality,
    rarity: definition.rarity,
    quantityLabel: quantityParts.join(' · '),
    durabilityLabel: `耐久 ${Math.max(0, instance.durability)}/100`,
    bulkLabel: `${BULK_LABELS[definition.bulk]}体积`,
    locationLabel: locationLabel(state, placement),
    primaryEffects: definition.effects.slice(0, 3).map(formatEffect),
    description: definition.description,
    roleplayText: definition.roleplayText,
    provenanceLines: provenanceLines(instance, definition),
    history: instance.history.map((entry) => ({ ...entry })),
    actions: createActions(instance, definition, placement, pendingActions),
  };
}

function belongsToTab(
  state: ItemSystemState,
  placement: ItemPlacement,
  currentLocation: string,
  tab: CustodyTab,
): boolean {
  if (tab === 'carried') return placement.type === 'carried';
  if (tab === 'vehicle') {
    if (placement.type !== 'vehicle') return false;
    const vehicle = state.vehicles[placement.vehicleId];
    return Boolean(vehicle && sameLocation(vehicle.location, currentLocation));
  }
  if (placement.type !== 'site') return false;
  const site = state.sites[placement.siteId];
  if (!site) return false;
  return tab === 'current-site'
    ? sameLocation(site.location, currentLocation)
    : !sameLocation(site.location, currentLocation);
}

export function buildItemCardModels(input: {
  state: ItemSystemState;
  catalog: ItemCatalog;
  currentLocation: string;
  pendingActions: readonly PendingItemAction[];
  tab: CustodyTab;
}): ItemCardModel[] {
  return Object.values(input.state.instances)
    .filter((instance) => {
      const placement = input.state.placements[instance.instanceId];
      return placement && belongsToTab(input.state, placement, input.currentLocation, input.tab);
    })
    .map((instance) => buildCard(input.state, input.catalog, instance, input.pendingActions))
    .sort((left, right) => left.locationLabel.localeCompare(right.locationLabel, 'zh-CN')
      || left.name.localeCompare(right.name, 'zh-CN')
      || left.instanceId.localeCompare(right.instanceId));
}

function positionModel(
  state: ItemSystemState,
  catalog: ItemCatalog,
  pendingActions: readonly PendingItemAction[],
  position: EquipmentPosition,
): { key: string; label: string; item?: ItemCardModel } {
  const instance = getEquippedInstance(state, position);
  return {
    key: positionKey(position),
    label: positionLabel(position),
    item: instance ? buildCard(state, catalog, instance, pendingActions) : undefined,
  };
}

export function buildEquipmentGroupModels(input: {
  state: ItemSystemState;
  catalog: ItemCatalog;
  pendingActions: readonly PendingItemAction[];
}): EquipmentGroupModel[] {
  const reservedKeys = new Set(getReservedPositions(input.state, input.catalog).map(positionKey));
  return EQUIPMENT_GROUPS.map((group) => {
    const positions: EquipmentPosition[] = group === 'torso'
      ? TORSO_LAYERS.map((layer) => ({ group: 'torso', layer }))
      : group === 'legs'
        ? LEG_LAYERS.map((layer) => ({ group: 'legs', layer }))
        : group === 'accessories'
          ? ACCESSORY_INDICES.map((index) => ({ group: 'accessories', index }))
          : [{ group } as EquipmentPosition];
    const positionModels = positions.map((position) => positionModel(input.state, input.catalog, input.pendingActions, position));
    const items = positionModels.flatMap((position) => position.item ? [position.item] : []);
    const reservedByTwoHandedItem = positions.some((position) => reservedKeys.has(positionKey(position)));
    const summary = items.length > 0
      ? positionModels.filter((position) => position.item).map((position) => `${position.label}：${position.item?.name}`).join(' · ')
      : reservedByTwoHandedItem
        ? '由双手武器占用'
        : '未装备';
    return {
      group,
      label: GROUP_LABELS[group],
      summary,
      items,
      positions: positionModels,
      reservedByTwoHandedItem,
    };
  });
}
