import { getItemDefinition } from './catalog';
import { sameWorldLocation } from '../map/locationResolver';
import type { WorldLocationRef } from '../map/types';
import type {
  EquipmentPosition,
  ItemCatalog,
  ItemImageRef,
  ItemPlacement,
  ItemSystemState,
} from './types';

export type TransferPlacement = Extract<ItemPlacement, { type: 'carried' | 'site' | 'vehicle' }>;

export interface EquipmentReplacementChoice {
  instanceId: string;
  position: EquipmentPosition;
  name: string;
  image: ItemImageRef;
  durability: number;
  locationLabel: string;
  positionLabel: string;
}

export interface TransferDestinationChoice {
  id: string;
  kind: TransferPlacement['type'];
  placement: TransferPlacement;
  label: string;
  detail: string;
}

function positionsEqual(left: EquipmentPosition, right: EquipmentPosition): boolean {
  if (left.group !== right.group) return false;
  if (left.group === 'torso') return right.group === 'torso' && left.layer === right.layer;
  if (left.group === 'legs') return right.group === 'legs' && left.layer === right.layer;
  if (left.group === 'accessories') return right.group === 'accessories' && left.index === right.index;
  return true;
}

function samePlacement(left: ItemPlacement, right: ItemPlacement): boolean {
  if (left.type !== right.type) return false;
  if (left.type === 'carried') return true;
  if (left.type === 'site') return right.type === 'site' && left.siteId === right.siteId;
  if (left.type === 'vehicle') return right.type === 'vehicle' && left.vehicleId === right.vehicleId;
  return false;
}

function accessibleLocationLabel(state: ItemSystemState, placement: ItemPlacement, currentLocation: WorldLocationRef): string | undefined {
  if (placement.type === 'carried') return '随身携带';
  void state;
  void currentLocation;
  return undefined;
}

export function equipmentPositionLabel(position: EquipmentPosition): string {
  if (position.group === 'head') return '头部';
  if (position.group === 'mainhand') return '主手';
  if (position.group === 'offhand') return '副手';
  if (position.group === 'torso') return { garment: '服装', armor: '护甲', outerwear: '外披' }[position.layer];
  if (position.group === 'legs') return { legwear: '腿部', footwear: '足部' }[position.layer];
  if (position.group === 'accessories') return `佩饰 ${position.index + 1}`;
  return '装备';
}

export function getEquipmentReplacementChoices({
  state,
  catalog,
  currentLocation,
  positions,
  excludedIds,
}: {
  state: ItemSystemState;
  catalog: ItemCatalog;
  currentLocation: WorldLocationRef;
  positions: readonly EquipmentPosition[];
  excludedIds: readonly string[];
}): EquipmentReplacementChoice[] {
  const excluded = new Set(excludedIds);
  const choices: EquipmentReplacementChoice[] = [];
  for (const instance of Object.values(state.instances)) {
    if (excluded.has(instance.instanceId) || instance.durability <= 0) continue;
    const placement = state.placements[instance.instanceId];
    if (!placement) continue;
    const locationLabel = accessibleLocationLabel(state, placement, currentLocation);
    if (!locationLabel) continue;
    const definition = getItemDefinition(catalog, instance.definitionId);
    if (!definition.equippable) continue;
    const position = positions.find((candidate) => definition.allowedPositions.some((allowed) => positionsEqual(allowed, candidate)));
    if (!position) continue;
    choices.push({
      instanceId: instance.instanceId,
      position,
      name: instance.customName ?? definition.name,
      image: { ...definition.image },
      durability: instance.durability,
      locationLabel,
      positionLabel: equipmentPositionLabel(position),
    });
  }
  return choices.sort((left, right) => {
    return left.name.localeCompare(right.name, 'zh-CN')
      || left.instanceId.localeCompare(right.instanceId);
  });
}

export function getTransferDestinationChoices({
  state,
  currentLocation,
  from,
}: {
  state: ItemSystemState;
  currentLocation: WorldLocationRef;
  from: ItemPlacement;
}): TransferDestinationChoice[] {
  const choices: TransferDestinationChoice[] = [
    {
      id: 'carried',
      kind: 'carried',
      placement: { type: 'carried' },
      label: '随身携带',
      detail: '由角色随身保管，可在行动中直接取用。',
    },
    ...Object.values(state.sites)
      .filter((site) => sameWorldLocation(site.location, currentLocation))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN') || left.id.localeCompare(right.id))
      .map((site): TransferDestinationChoice => ({
        id: `site:${site.id}`,
        kind: 'site',
        placement: { type: 'site', siteId: site.id },
        label: site.name,
        detail: `${site.locationLabel} · ${site.description}`,
      })),
    ...Object.values(state.vehicles)
      .filter((vehicle) => sameWorldLocation(vehicle.location, currentLocation))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN') || left.id.localeCompare(right.id))
      .map((vehicle): TransferDestinationChoice => ({
        id: `vehicle:${vehicle.id}`,
        kind: 'vehicle',
        placement: { type: 'vehicle', vehicleId: vehicle.id },
        label: vehicle.name,
        detail: `${vehicle.locationLabel} · 容量 ${vehicle.capacity} · ${vehicle.description}`,
      })),
  ];
  return choices.filter((choice) => !samePlacement(choice.placement, from));
}
