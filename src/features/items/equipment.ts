import { getItemDefinition } from './catalog';
import { assertPlacementAccessible } from './custody';
import { validateItemSystem } from './state';
import type { WorldLocationRef } from '../map/types';
import type { CharacterHealthState } from '../health/types';
import { validateHeldEquipmentAgainstHealth } from '../health/engine';
import type {
  AccessoryIndex,
  EquipmentGroup,
  EquipmentPosition,
  ItemCatalog,
  ItemInstance,
  ItemPlacement,
  ItemSystemState,
  LegLayer,
  TorsoLayer,
} from './types';

export const EQUIPMENT_GROUPS: readonly EquipmentGroup[] = [
  'head',
  'torso',
  'mainhand',
  'offhand',
  'legs',
  'accessories',
];

export const TORSO_LAYERS: readonly TorsoLayer[] = ['garment', 'armor', 'outerwear'];
export const LEG_LAYERS: readonly LegLayer[] = ['legwear', 'footwear'];
export const ACCESSORY_INDICES: readonly AccessoryIndex[] = [0, 1, 2];

export interface EquipmentGroupView {
  group: EquipmentGroup;
  instances: ItemInstance[];
}

export interface EquipOptions {
  currentLocation: WorldLocationRef;
  displacedTo: ItemPlacement;
  health?: CharacterHealthState;
}

export interface UnequipOptions {
  currentLocation: WorldLocationRef;
}

function positionsEqual(left: EquipmentPosition, right: EquipmentPosition): boolean {
  if (left.group !== right.group) return false;
  if (left.group === 'torso') return right.group === 'torso' && left.layer === right.layer;
  if (left.group === 'legs') return right.group === 'legs' && left.layer === right.layer;
  if (left.group === 'accessories') return right.group === 'accessories' && left.index === right.index;
  return true;
}

function isEquipmentPosition(value: EquipmentPosition): boolean {
  if (!EQUIPMENT_GROUPS.includes(value.group)) return false;
  if (value.group === 'torso') return TORSO_LAYERS.includes(value.layer);
  if (value.group === 'legs') return LEG_LAYERS.includes(value.layer);
  if (value.group === 'accessories') return ACCESSORY_INDICES.includes(value.index);
  return value.group === 'head' || value.group === 'mainhand' || value.group === 'offhand';
}

export function getEquippedInstance(
  state: ItemSystemState,
  position: EquipmentPosition,
): ItemInstance | undefined {
  return Object.values(state.instances).find((instance) => {
    const placement = state.placements[instance.instanceId];
    return placement?.type === 'equipped' && positionsEqual(placement.position, position);
  });
}

export function getEquipmentGroups(state: ItemSystemState): EquipmentGroupView[] {
  return EQUIPMENT_GROUPS.map((group) => ({
    group,
    instances: Object.values(state.instances).filter((instance) => {
      const placement = state.placements[instance.instanceId];
      return placement?.type === 'equipped' && placement.position.group === group;
    }),
  }));
}

export function physicalHandForEquipmentPosition(position: EquipmentPosition, dominantHand: 'left' | 'right'): 'left' | 'right' | undefined {
  if (position.group === 'mainhand') return dominantHand;
  if (position.group === 'offhand') return dominantHand === 'right' ? 'left' : 'right';
  return undefined;
}

export function getReservedPositions(state: ItemSystemState, catalog: ItemCatalog): EquipmentPosition[] {
  const mainhand = getEquippedInstance(state, { group: 'mainhand' });
  if (!mainhand) return [];
  const definition = getItemDefinition(catalog, mainhand.definitionId);
  return definition.handedness === 'two' ? [{ group: 'offhand' }] : [];
}

function getEquipRejectionReason(
  state: ItemSystemState,
  catalog: ItemCatalog,
  instanceId: string,
  position: EquipmentPosition,
  health?: CharacterHealthState,
): string | undefined {
  const instance = state.instances[instanceId];
  if (!instance) return `物品实例不存在：${instanceId}`;
  if (!isEquipmentPosition(position)) return '无效装备位置';
  const definition = getItemDefinition(catalog, instance.definitionId);
  if (!definition.equippable || !definition.allowedPositions.some((allowed) => positionsEqual(allowed, position))) {
    return '物品不允许装备到该位置';
  }
  if (instance.durability <= 0) return '完全损坏的物品不能装备';
  if (definition.handedness === 'two' && position.group !== 'mainhand') {
    return '双手武器必须装备在主手';
  }
  if (position.group === 'offhand') {
    const mainhand = getEquippedInstance(state, { group: 'mainhand' });
    if (mainhand && mainhand.instanceId !== instanceId) {
      const mainhandDefinition = getItemDefinition(catalog, mainhand.definitionId);
      if (mainhandDefinition.handedness === 'two') return '双手武器占用副手';
    }
  }
  if (health && (position.group === 'mainhand' || position.group === 'offhand')) {
    const rejection = validateHeldEquipmentAgainstHealth(health, position.group, definition.handedness === 'two');
    if (rejection) return rejection;
  }
  return undefined;
}

export function canEquipItem(
  state: ItemSystemState,
  catalog: ItemCatalog,
  instanceId: string,
  position: EquipmentPosition,
  health?: CharacterHealthState,
): boolean {
  return getEquipRejectionReason(state, catalog, instanceId, position, health) === undefined;
}

function assertEquipmentDestination(placement: ItemPlacement): asserts placement is Extract<ItemPlacement, { type: 'carried' | 'site' | 'vehicle' }> {
  if (placement.type !== 'carried' && placement.type !== 'site' && placement.type !== 'vehicle') {
    throw new Error('装备替换目标必须是随身、据点或运输工具');
  }
}

function cloneState(state: ItemSystemState): ItemSystemState {
  return {
    schemaVersion: 1,
    instances: Object.fromEntries(Object.entries(state.instances).map(([id, instance]) => [id, {
      ...instance,
      history: instance.history.map((entry) => ({ ...entry })),
    }])),
    placements: Object.fromEntries(Object.entries(state.placements).map(([id, placement]) => [id, placement.type === 'equipped'
      ? { type: 'equipped', position: { ...placement.position } }
      : { ...placement }])),
    sites: Object.fromEntries(Object.entries(state.sites).map(([id, site]) => [id, { ...site, location: { ...site.location } }])),
    vehicles: Object.fromEntries(Object.entries(state.vehicles).map(([id, vehicle]) => [id, { ...vehicle, location: { ...vehicle.location } }])),
  };
}

function displacedInstanceIds(
  state: ItemSystemState,
  catalog: ItemCatalog,
  instanceId: string,
  position: EquipmentPosition,
): string[] {
  const ids = new Set<string>();
  const occupant = getEquippedInstance(state, position);
  if (occupant && occupant.instanceId !== instanceId) ids.add(occupant.instanceId);

  const definition = getItemDefinition(catalog, state.instances[instanceId].definitionId);
  if (definition.handedness === 'two' && position.group === 'mainhand') {
    const offhand = getEquippedInstance(state, { group: 'offhand' });
    if (offhand && offhand.instanceId !== instanceId) ids.add(offhand.instanceId);
  }
  return [...ids];
}

export function equipItem(
  state: ItemSystemState,
  catalog: ItemCatalog,
  instanceId: string,
  position: EquipmentPosition,
  options: EquipOptions,
): ItemSystemState {
  validateItemSystem(state, catalog);
  const rejection = getEquipRejectionReason(state, catalog, instanceId, position, options.health);
  if (rejection) throw new Error(rejection);
  assertEquipmentDestination(options.displacedTo);
  assertPlacementAccessible(state, options.displacedTo, options.currentLocation, '目标');

  const current = state.placements[instanceId];
  if (!current) throw new Error(`位置记录与实例不一致：${instanceId}`);
  if (current.type !== 'equipped') {
    assertPlacementAccessible(state, current, options.currentLocation, '来源');
  }

  const displaced = displacedInstanceIds(state, catalog, instanceId, position);
  const next = cloneState(state);
  for (const displacedId of displaced) {
    next.placements[displacedId] = { ...options.displacedTo };
  }
  next.placements[instanceId] = { type: 'equipped', position: { ...position } };
  validateItemSystem(next, catalog);
  return next;
}

export function unequipItem(
  state: ItemSystemState,
  catalog: ItemCatalog,
  instanceId: string,
  to: ItemPlacement,
  options: UnequipOptions,
): ItemSystemState {
  validateItemSystem(state, catalog);
  const instance = state.instances[instanceId];
  if (!instance) throw new Error(`物品实例不存在：${instanceId}`);
  const placement = state.placements[instanceId];
  if (placement?.type !== 'equipped') throw new Error('物品当前未装备');
  assertEquipmentDestination(to);
  assertPlacementAccessible(state, to, options.currentLocation, '目标');

  const definition = getItemDefinition(catalog, instance.definitionId);
  if (to.type === 'carried' && definition.bulk === 'large') throw new Error('大型物品不能普通随身携带');

  const next = cloneState(state);
  next.placements[instanceId] = { ...to };
  validateItemSystem(next, catalog);
  return next;
}
