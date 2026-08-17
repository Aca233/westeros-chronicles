import React, { useMemo, useState } from 'react';
import { ChevronDown, Hammer, Shield, ThermometerSun, Weight } from 'lucide-react';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import {
  aggregateEquippedItemEffects,
  getEquipmentBurden,
} from '../../features/items/effects';
import type {
  EquipmentGroup,
  EquipmentPosition,
  ItemPlacement,
  ItemSystemState,
} from '../../features/items/types';
import {
  buildEquipmentGroupModels,
  type EquipmentGroupModel,
  type ItemCardModel,
} from '../../features/items/viewModel';
import { useGameStore } from '../../store/useGameStore';
import type { BodyZoneKey, LordBodyCondition } from '../../types/game';
import { getItemDefinition } from '../../features/items/catalog';
import { ItemCard } from './ItemCard';
import { ItemImage } from './ItemImage';

const EQUIPMENT_GROUP_ORDER: EquipmentGroup[] = ['head', 'torso', 'mainhand', 'offhand', 'feet', 'accessories'];
const TORSO_POSITION_LABELS = ['服装', '护甲', '外披'];
const ACCESSORY_POSITION_COUNT = 3;

const BODY_ZONE_BY_GROUP: Partial<Record<EquipmentGroup, BodyZoneKey>> = {
  head: 'head',
  torso: 'torso',
  mainhand: 'arms',
  offhand: 'arms',
  feet: 'legs',
};

const WOUND_LABELS = {
  intact: '完好',
  minor: '轻创',
  heavy: '重创',
  critical: '危重',
} as const;

function locationRoot(location: string): string {
  return location.split('·', 1)[0].trim();
}

function atLocation(containerLocation: string, currentLocation: string): boolean {
  return locationRoot(containerLocation) === locationRoot(currentLocation);
}

function positionsEqual(left: EquipmentPosition, right: EquipmentPosition): boolean {
  if (left.group !== right.group) return false;
  if (left.group === 'torso') return right.group === 'torso' && left.layer === right.layer;
  if (left.group === 'accessories') return right.group === 'accessories' && left.index === right.index;
  return true;
}

function localStorageDestination(state: ItemSystemState, currentLocation: string): ItemPlacement {
  const site = Object.values(state.sites).find((entry) => atLocation(entry.location, currentLocation));
  if (site) return { type: 'site', siteId: site.id };
  const vehicle = Object.values(state.vehicles).find((entry) => atLocation(entry.location, currentLocation));
  if (vehicle) return { type: 'vehicle', vehicleId: vehicle.id };
  return { type: 'carried' };
}

function isAccessiblePlacement(state: ItemSystemState, placement: ItemPlacement, currentLocation: string): boolean {
  if (placement.type === 'carried') return true;
  if (placement.type === 'site') return Boolean(state.sites[placement.siteId] && atLocation(state.sites[placement.siteId].location, currentLocation));
  if (placement.type === 'vehicle') return Boolean(state.vehicles[placement.vehicleId] && atLocation(state.vehicles[placement.vehicleId].location, currentLocation));
  return false;
}

function findReplacement(
  state: ItemSystemState,
  currentLocation: string,
  positions: readonly EquipmentPosition[],
  excludedIds: readonly string[],
): { instanceId: string; position: EquipmentPosition } | undefined {
  const excluded = new Set(excludedIds);
  for (const instance of Object.values(state.instances)) {
    if (excluded.has(instance.instanceId) || instance.durability <= 0) continue;
    const placement = state.placements[instance.instanceId];
    if (!placement || !isAccessiblePlacement(state, placement, currentLocation)) continue;
    const definition = getItemDefinition(ITEM_CATALOG, instance.definitionId);
    const position = positions.find((candidate) => definition.allowedPositions.some((allowed) => positionsEqual(allowed, candidate)));
    if (definition.equippable && position) return { instanceId: instance.instanceId, position };
  }
  return undefined;
}

function groupPositions(group: EquipmentGroupModel): EquipmentPosition[] {
  return group.positions.map((position) => {
    if (position.key.startsWith('torso:')) return { group: 'torso', layer: position.key.split(':')[1] as 'garment' | 'armor' | 'outerwear' };
    if (position.key.startsWith('accessories:')) return { group: 'accessories', index: Number(position.key.split(':')[1]) as 0 | 1 | 2 };
    return { group: position.key as 'head' | 'mainhand' | 'offhand' | 'feet' };
  });
}

function aggregateStatus(state: ItemSystemState) {
  const effects = aggregateEquippedItemEffects(state, ITEM_CATALOG);
  const zoneValues = new Map<string, number>();
  let heat = 0;
  let social = 0;
  const restrictions: string[] = [];
  for (const entry of effects.active) {
    const effect = entry.effect;
    if (effect.kind === 'protection') {
      effect.zones.forEach((zone) => zoneValues.set(zone, Math.max(zoneValues.get(zone) ?? 0, effect.value)));
    } else if (effect.kind === 'heat') {
      heat += effect.value;
    } else if (effect.kind === 'social') {
      social += effect.value;
    } else if (effect.kind === 'fatigue' || effect.kind === 'narrative') {
      restrictions.push(effect.kind === 'narrative' ? effect.directive : effect.label);
    }
  }
  const zoneNames: Record<string, string> = { head: '头', torso: '躯干', arms: '双臂', legs: '双腿' };
  return {
    protection: [...zoneValues].map(([zone, value]) => `${zoneNames[zone] ?? zone} ${value}`).join(' · ') || '无',
    burden: getEquipmentBurden(effects),
    heat,
    social,
    restrictions: [...new Set(restrictions)].slice(0, 3),
  };
}

function cardForEquipment(item: ItemCardModel, canReplace: boolean): ItemCardModel {
  const pendingReason = item.actions.find((action) => action.disabledReason)?.disabledReason;
  const actions: ItemCardModel['actions'] = [
    { kind: 'unequip', label: '卸下', disabledReason: pendingReason },
    ...(item.durabilityLabel === '耐久 100/100' ? [] : [{ kind: 'repair' as const, label: '修理', disabledReason: pendingReason }]),
    ...(canReplace ? [{ kind: 'equip' as const, label: '更换', disabledReason: pendingReason }] : []),
  ];
  return { ...item, actions };
}

export interface EquipmentPanelProps {
  body: LordBodyCondition;
  focusedGroup?: string | null;
  onGroupFocus?: (group: EquipmentGroup | null) => void;
}

export const EquipmentPanel: React.FC<EquipmentPanelProps> = ({ body, focusedGroup, onGroupFocus }) => {
  const { gameState, pendingItemActions, queueItemAction, isStreaming } = useGameStore();
  const state = gameState.lord.items;
  const currentLocation = gameState.lord.location;
  const groups = useMemo(() => buildEquipmentGroupModels({ state, catalog: ITEM_CATALOG, pendingActions: pendingItemActions }), [state, pendingItemActions]);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.group, group])), [groups]);
  const status = useMemo(() => aggregateStatus(state), [state]);
  const [expanded, setExpanded] = useState<Set<EquipmentGroup>>(() => new Set(['head', 'mainhand', 'offhand', 'feet']));

  const toggle = (group: EquipmentGroup) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  };

  const queueReplacement = (group: EquipmentGroupModel, excludedIds: readonly string[]) => {
    const replacement = findReplacement(state, currentLocation, groupPositions(group), excludedIds);
    if (!replacement || isStreaming) return;
    queueItemAction({
      kind: 'equip',
      instanceId: replacement.instanceId,
      position: replacement.position,
      displacedTo: localStorageDestination(state, currentLocation),
    });
  };

  const renderGroup = (group: EquipmentGroupModel) => {
    const positions = groupPositions(group);
    const replacement = findReplacement(state, currentLocation, positions, group.items.map((item) => item.instanceId));
    const zone = BODY_ZONE_BY_GROUP[group.group];
    const wound = zone ? WOUND_LABELS[body[zone].level] : undefined;
    const isExpanded = expanded.has(group.group);
    const isFocused = focusedGroup === group.group || (focusedGroup === 'legs' && group.group === 'feet');
    return (
      <section
        key={group.group}
        data-equipment-group={group.group}
        onMouseEnter={() => onGroupFocus?.(group.group)}
        onMouseLeave={() => onGroupFocus?.(null)}
        className={`border bg-ink-2/60 ${isFocused ? 'border-gold shadow-[inset_0_0_16px_rgba(201,164,92,0.1)]' : 'border-hairline'}`}
      >
        <div className="flex items-center gap-2 px-2.5 py-2">
          {group.items[0] ? (
            <span className="h-14 w-14 shrink-0 border border-hairline-bright bg-ink-3 p-1">
              <ItemImage image={group.items[0].image} alt={group.items[0].name} className="h-full w-full" />
            </span>
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center border border-dashed border-hairline-bright bg-ink-3/40 font-display text-lg text-parchment-faint">—</span>
          )}
          <button type="button" aria-expanded={isExpanded} onClick={() => toggle(group.group)} className="min-w-0 flex-1 text-left">
            <span className="flex items-center gap-2">
              <strong className="shrink-0 whitespace-nowrap font-serif text-[12px] text-gold-bright">{group.label}</strong>
              {wound && <span className="font-mono text-[9px] text-parchment-faint">{wound}</span>}
            </span>
            <span className="mt-0.5 block truncate font-serif text-[9.5px] text-parchment-dim">{group.summary}</span>
          </button>
          <button
            type="button"
            disabled={!replacement || isStreaming || group.reservedByTwoHandedItem}
            title={replacement ? '下一次成功对话后更换' : group.reservedByTwoHandedItem ? '副手由双手武器占用' : '当前地点没有可用替换物品'}
            onClick={() => queueReplacement(group, group.items.map((item) => item.instanceId))}
            className="shrink-0 border border-gold-deep/70 px-2 py-1 font-serif text-[9.5px] text-gold transition-colors hover:border-gold disabled:cursor-not-allowed disabled:opacity-35"
          >
            更换
          </button>
          <ChevronDown className={`h-4 w-4 shrink-0 text-gold-dim transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>

        {isExpanded && (
          <div className="space-y-2 border-t border-hairline p-2">
            {group.positions.map((position) => (
              <div key={position.key} data-equipment-position={position.key}>
                {(group.group === 'torso' || group.group === 'accessories') && (
                  <p className="mb-1 font-serif text-[9px] font-bold tracking-[0.14em] text-gold-dim">{position.label}</p>
                )}
                {position.item ? (
                  <ItemCard
                    compact
                    item={cardForEquipment(position.item, Boolean(replacement))}
                    onAction={(_item, action) => {
                      if (isStreaming) return;
                      if (action.kind === 'unequip') queueItemAction({ kind: 'unequip', instanceId: position.item!.instanceId, to: localStorageDestination(state, currentLocation) });
                      else if (action.kind === 'repair') queueItemAction({ kind: 'repair', instanceId: position.item!.instanceId, amount: 25 });
                      else if (action.kind === 'equip') queueReplacement(group, group.items.map((item) => item.instanceId));
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-between border border-dashed border-hairline px-2.5 py-2 font-serif text-[9.5px] text-parchment-faint">
                    <span>{group.reservedByTwoHandedItem ? '由双手武器占用' : '空位'}</span>
                    <button type="button" disabled={!replacement || group.reservedByTwoHandedItem || isStreaming} onClick={() => queueReplacement(group, group.items.map((item) => item.instanceId))} className="text-gold disabled:opacity-30">更换</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  const head = groupById.get('head')!;
  const torso = groupById.get('torso')!;
  const mainhand = groupById.get('mainhand')!;
  const offhand = groupById.get('offhand')!;
  const feet = groupById.get('feet')!;
  const accessories = groupById.get('accessories')!;

  return (
    <div className="space-y-2.5" data-equipment-panel>
      <div className="grid grid-cols-2 gap-1.5 border border-hairline bg-ink-3/35 p-2 sm:grid-cols-4">
        <span className="flex items-center gap-1.5 font-mono text-[9px] text-parchment-dim"><Shield className="h-3.5 w-3.5 text-gold" />防护 {status.protection}</span>
        <span className="flex items-center gap-1.5 font-mono text-[9px] text-parchment-dim"><Weight className="h-3.5 w-3.5 text-gold" />负担 {status.burden || '无'}</span>
        <span className="flex items-center gap-1.5 font-mono text-[9px] text-parchment-dim"><ThermometerSun className="h-3.5 w-3.5 text-gold" />闷热 {status.heat || '无'}</span>
        <span className="flex items-center gap-1.5 font-mono text-[9px] text-parchment-dim"><Hammer className="h-3.5 w-3.5 text-gold" />威慑 {status.social || '无'}</span>
        {status.restrictions.length > 0 && <p className="col-span-full border-t border-hairline pt-1.5 font-serif text-[9px] leading-relaxed text-parchment-faint">限制：{status.restrictions.join('；')}</p>}
      </div>
      {renderGroup(head)}
      {renderGroup(torso)}
      <div data-hand-pair className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {renderGroup(mainhand)}
        {renderGroup(offhand)}
      </div>
      {renderGroup(feet)}
      {renderGroup(accessories)}
      <span className="sr-only">{TORSO_POSITION_LABELS.join('、')} · {ACCESSORY_POSITION_COUNT}</span>
    </div>
  );
};
