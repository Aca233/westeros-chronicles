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
import { getEquipmentReplacementChoices } from '../../features/items/actionChoices';
import { sameWorldLocation } from '../../features/map/locationResolver';
import type { WorldLocationRef } from '../../features/map/types';
import { useGameStore } from '../../store/useGameStore';
import type { BodyZoneKey, LordBodyCondition } from '../../types/game';
import { ItemCard } from './ItemCard';
import { ItemChoiceDialog } from './ItemChoiceDialog';
import { ItemImage } from './ItemImage';

const EQUIPMENT_GROUP_ORDER: EquipmentGroup[] = ['head', 'torso', 'mainhand', 'offhand', 'legs', 'accessories'];
const TORSO_POSITION_LABELS = ['服装', '护甲', '外披'];
const LEG_POSITION_LABELS = ['腿部', '足部'];
const ACCESSORY_POSITION_COUNT = 3;

const BODY_ZONE_BY_GROUP: Partial<Record<EquipmentGroup, BodyZoneKey>> = {
  head: 'head',
  torso: 'torso',
  mainhand: 'arms',
  offhand: 'arms',
  legs: 'legs',
};

const WOUND_LABELS = {
  intact: '完好',
  minor: '轻创',
  heavy: '重创',
  critical: '危重',
} as const;

function localStorageDestination(state: ItemSystemState, currentLocation: WorldLocationRef): ItemPlacement {
  const site = Object.values(state.sites).find((entry) => sameWorldLocation(entry.location, currentLocation));
  if (site) return { type: 'site', siteId: site.id };
  const vehicle = Object.values(state.vehicles).find((entry) => sameWorldLocation(entry.location, currentLocation));
  if (vehicle) return { type: 'vehicle', vehicleId: vehicle.id };
  return { type: 'carried' };
}

function groupPositions(group: EquipmentGroupModel): EquipmentPosition[] {
  return group.positions.map((position) => {
    if (position.key.startsWith('torso:')) return { group: 'torso', layer: position.key.split(':')[1] as 'garment' | 'armor' | 'outerwear' };
    if (position.key.startsWith('legs:')) return { group: 'legs', layer: position.key.split(':')[1] as 'legwear' | 'footwear' };
    if (position.key.startsWith('accessories:')) return { group: 'accessories', index: Number(position.key.split(':')[1]) as 0 | 1 | 2 };
    return { group: position.key as 'head' | 'mainhand' | 'offhand' };
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
  const { gameState, pendingItemActions, queueItemAction, cancelItemAction, isStreaming } = useGameStore();
  const state = gameState.lord.items;
  const currentLocation = gameState.lord.location;
  const groups = useMemo(() => buildEquipmentGroupModels({ state, catalog: ITEM_CATALOG, pendingActions: pendingItemActions }), [state, pendingItemActions]);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.group, group])), [groups]);
  const status = useMemo(() => aggregateStatus(state), [state]);
  const pendingByInstance = useMemo(() => new Map(pendingItemActions.map((action) => [action.instanceId, action])), [pendingItemActions]);
  // 组级待生效:穿戴/更换的目标位置落在本组,或本组已装备物品被排队(卸下/修理)
  const pendingForGroup = (group: EquipmentGroupModel) => pendingItemActions.find((entry) => {
    if (entry.action.kind === 'equip') return entry.action.position.group === group.group;
    if (entry.action.kind === 'unequip' && entry.instanceId) {
      return group.items.some((item) => item.instanceId === entry.instanceId);
    }
    return undefined;
  });
  const [expanded, setExpanded] = useState<Set<EquipmentGroup>>(() => new Set(['head', 'mainhand', 'offhand', 'legs']));
  const [replacementRequest, setReplacementRequest] = useState<{
    title: string;
    positions: EquipmentPosition[];
    excludedIds: string[];
  } | null>(null);

  const replacementChoices = useMemo(() => replacementRequest ? getEquipmentReplacementChoices({
    state,
    catalog: ITEM_CATALOG,
    currentLocation,
    positions: replacementRequest.positions,
    excludedIds: replacementRequest.excludedIds,
  }) : [], [currentLocation, replacementRequest, state]);

  const toggle = (group: EquipmentGroup) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  };

  const openReplacementChoices = (title: string, positions: readonly EquipmentPosition[], excludedIds: readonly string[]) => {
    if (isStreaming) return;
    setReplacementRequest({ title, positions: [...positions], excludedIds: [...excludedIds] });
  };

  const chooseReplacement = (instanceId: string) => {
    const replacement = replacementChoices.find((choice) => choice.instanceId === instanceId);
    if (!replacement || isStreaming) return;
    queueItemAction({
      kind: 'equip',
      instanceId: replacement.instanceId,
      position: replacement.position,
      displacedTo: localStorageDestination(state, currentLocation),
    });
    setReplacementRequest(null);
  };

  const renderGroup = (group: EquipmentGroupModel) => {
    const positions = groupPositions(group);
    const groupReplacementChoices = getEquipmentReplacementChoices({
      state,
      catalog: ITEM_CATALOG,
      currentLocation,
      positions,
      excludedIds: group.items.map((item) => item.instanceId),
    });
    const zone = BODY_ZONE_BY_GROUP[group.group];
    const wound = zone ? WOUND_LABELS[body[zone].level] : undefined;
    const woundLevel = zone ? body[zone].level : 'intact';
    const isExpanded = expanded.has(group.group);
    const isFocused = focusedGroup === group.group;
    const pendingEntry = pendingForGroup(group);
    const pendingReplacement = pendingItemActions.find((entry) => entry.action.kind === 'equip' && entry.action.position.group === group.group);
    return (
      <section
        key={group.group}
        data-equipment-group={group.group}
        onMouseEnter={() => onGroupFocus?.(group.group)}
        onMouseLeave={() => onGroupFocus?.(null)}
        className={`border bg-ink-2/60 transition-colors ${isFocused ? 'border-gold shadow-[inset_0_0_16px_rgba(201,164,92,0.1)]' : 'border-hairline'}`}
      >
        <div className="flex items-center gap-2 px-2.5 py-2">
          <button
            type="button"
            data-equipment-toggle={group.group}
            aria-expanded={isExpanded}
            onClick={() => toggle(group.group)}
            className="group flex min-w-0 flex-1 items-center gap-2.5 text-left transition-colors hover:bg-parchment/[0.035] focus-visible:outline focus-visible:outline-1 focus-visible:outline-gold-deep"
          >
            {group.items[0] ? (
              <span className="h-14 w-14 shrink-0 border border-hairline-bright bg-ink-3 p-1 transition-colors group-hover:border-gold-deep">
                <ItemImage image={group.items[0].image} alt={group.items[0].name} className="h-full w-full" />
              </span>
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center border border-dashed border-hairline-bright bg-ink-3/40 font-display text-lg text-parchment-faint transition-colors group-hover:border-gold-deep">—</span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <strong className="shrink-0 whitespace-nowrap font-serif text-[13px] font-bold text-gold-bright">{group.label}</strong>
                {wound && <span className={`font-mono text-[10px] ${woundLevel === 'intact' ? 'text-parchment-faint' : 'font-bold text-rubric'}`}>{wound}</span>}
                {pendingEntry && <span className="pending-chip">待生效 · {pendingEntry.label}</span>}
              </span>
              <span className="mt-0.5 line-clamp-2 block break-words font-serif text-[10.5px] leading-relaxed text-parchment-dim" title={group.summary}>{group.summary}</span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-gold-dim transition-all group-hover:text-gold ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
          <button
            type="button"
            disabled={isStreaming || (!pendingReplacement && group.reservedByTwoHandedItem)}
            title={pendingReplacement
              ? isStreaming ? '本次对话完成后才能取消操作' : `取消${pendingReplacement.label}`
              : group.reservedByTwoHandedItem ? '副手由双手武器占用'
                : groupReplacementChoices.length ? '选择替换装备' : '查看当前地点的可用装备'}
            onClick={() => {
              if (pendingReplacement) cancelItemAction(pendingReplacement.id);
              else openReplacementChoices(`更换${group.label}`, positions, group.items.map((item) => item.instanceId));
            }}
            className={`item-action shrink-0 disabled:cursor-not-allowed disabled:opacity-35 ${pendingReplacement ? 'item-action--danger' : 'item-action--primary'}`}
          >
            {pendingReplacement ? '取消' : '更换'}
          </button>
        </div>

        {isExpanded && (
          <div className="space-y-2 border-t border-hairline p-2">
            {group.positions.map((position, index) => {
              const equipmentPosition = positions[index];
              const positionReplacementChoices = getEquipmentReplacementChoices({
                state,
                catalog: ITEM_CATALOG,
                currentLocation,
                positions: [equipmentPosition],
                excludedIds: position.item ? [position.item.instanceId] : [],
              });
              return (
              <div key={position.key} data-equipment-position={position.key}>
                {(group.group === 'torso' || group.group === 'legs' || group.group === 'accessories') && (
                  <p className="mb-1 font-serif text-[10px] font-bold tracking-[0.14em] text-gold-dim">{position.label}</p>
                )}
                {position.item ? (
                  <ItemCard
                    compact
                    item={cardForEquipment(position.item, !group.reservedByTwoHandedItem)}
                    pendingNote={pendingByInstance.get(position.item.instanceId)?.label}
                    onCancelPending={() => {
                      const pending = pendingByInstance.get(position.item!.instanceId);
                      if (pending) cancelItemAction(pending.id);
                    }}
                    pendingCancellationDisabled={isStreaming}
                    onAction={(_item, action) => {
                      if (isStreaming) return;
                      if (action.kind === 'unequip') queueItemAction({ kind: 'unequip', instanceId: position.item!.instanceId, to: localStorageDestination(state, currentLocation) });
                      else if (action.kind === 'repair') queueItemAction({ kind: 'repair', instanceId: position.item!.instanceId, amount: 25 });
                      else if (action.kind === 'equip') openReplacementChoices(`更换${position.label}`, [equipmentPosition], [position.item!.instanceId]);
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-between border border-dashed border-hairline px-2.5 py-2 font-serif text-[10.5px] text-parchment-dim">
                    <span>{group.reservedByTwoHandedItem ? '由双手武器占用' : '空位'}</span>
                    <button
                      type="button"
                      disabled={group.reservedByTwoHandedItem || isStreaming}
                      title={positionReplacementChoices.length ? `选择${position.label}装备` : `查看可用于${position.label}的装备`}
                      onClick={() => openReplacementChoices(`选择${position.label}`, [equipmentPosition], [])}
                      className="item-action !py-0.5 disabled:opacity-30"
                    >
                      更换
                    </button>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  const head = groupById.get('head')!;
  const torso = groupById.get('torso')!;
  const mainhand = groupById.get('mainhand')!;
  const offhand = groupById.get('offhand')!;
  const legs = groupById.get('legs')!;
  const accessories = groupById.get('accessories')!;

  return (
    <div className="space-y-2.5" data-equipment-panel>
      <div className="grid grid-cols-2 gap-1.5 border border-hairline bg-ink-3/35 p-2 sm:grid-cols-4">
        <span className="flex items-center gap-1.5 px-1 py-0.5" title="各部位当前防护值">
          <Shield className="h-4 w-4 shrink-0 text-gold" />
          <span className="min-w-0"><span className="block font-serif text-[9.5px] text-parchment-faint">防护</span><span className="block truncate font-mono text-[10.5px] text-parchment">{status.protection}</span></span>
        </span>
        <span className="flex items-center gap-1.5 px-1 py-0.5" title="当前负重负担">
          <Weight className="h-4 w-4 shrink-0 text-gold" />
          <span className="min-w-0"><span className="block font-serif text-[9.5px] text-parchment-faint">负担</span><span className="block truncate font-mono text-[10.5px] text-parchment">{status.burden || '无'}</span></span>
        </span>
        <span className="flex items-center gap-1.5 px-1 py-0.5" title="穿着闷热程度">
          <ThermometerSun className="h-4 w-4 shrink-0 text-gold" />
          <span className="min-w-0"><span className="block font-serif text-[9.5px] text-parchment-faint">闷热</span><span className="block truncate font-mono text-[10.5px] text-parchment">{status.heat || '无'}</span></span>
        </span>
        <span className="flex items-center gap-1.5 px-1 py-0.5" title="装束带来的身份威慑">
          <Hammer className="h-4 w-4 shrink-0 text-gold" />
          <span className="min-w-0"><span className="block font-serif text-[9.5px] text-parchment-faint">威慑</span><span className="block truncate font-mono text-[10.5px] text-parchment">{status.social || '无'}</span></span>
        </span>
        {status.restrictions.length > 0 && <p className="col-span-full border-t border-hairline pt-1.5 font-serif text-[10px] leading-relaxed text-parchment-dim">限制：{status.restrictions.join('；')}</p>}
      </div>
      {renderGroup(head)}
      {renderGroup(torso)}
      <div data-hand-pair className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {renderGroup(mainhand)}
        {renderGroup(offhand)}
      </div>
      {renderGroup(legs)}
      {renderGroup(accessories)}
      <span className="sr-only">{TORSO_POSITION_LABELS.join('、')} · {LEG_POSITION_LABELS.join('、')} · {ACCESSORY_POSITION_COUNT}</span>
      {replacementRequest && (
        <ItemChoiceDialog
          title={replacementRequest.title}
          description="选择一件装备。选择后会加入队列，并在下一次成功对话后穿上。"
          options={replacementChoices.map((choice) => ({
            id: choice.instanceId,
            title: choice.name,
            subtitle: `装备位置：${choice.positionLabel}`,
            detail: `${choice.locationLabel} · 耐久 ${choice.durability}/100`,
            image: choice.image,
          }))}
          emptyMessage="当前地点没有适合这个位置的可用装备。"
          onChoose={chooseReplacement}
          onClose={() => setReplacementRequest(null)}
        />
      )}
    </div>
  );
};
