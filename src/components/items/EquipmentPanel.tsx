import React, { useMemo, useState } from 'react';
import { ChevronDown, Hammer, Shield, ThermometerSun, Weight } from 'lucide-react';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { pendingItemActionsFromWorldTransactions } from '../../features/items/itemActionQueue';
import {
  aggregateEquippedItemEffects,
  getEquipmentBurden,
} from '../../features/items/effects';
import type {
  EquipmentGroup,
  EquipmentPosition,
  ItemAction,
  ItemSystemState,
} from '../../features/items/types';
import {
  buildEquipmentGroupModels,
  type EquipmentGroupModel,
  type ItemCardModel,
} from '../../features/items/viewModel';
import type { WorldLocationRef } from '../../features/map/types';
import {
  getEquipmentReplacementChoices,
  getTransferDestinationChoices,
  type EquipmentReplacementChoice,
  type TransferDestinationChoice,
} from '../../features/items/actionChoices';
import { canEquipItem, equipItem, physicalHandForEquipmentPosition, unequipItem } from '../../features/items/equipment';
import type { CharacterHealthState } from '../../features/health/types';
import { getItemDefinition } from '../../features/items/catalog';
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

function equipmentPositionsEqual(left: EquipmentPosition, right: EquipmentPosition): boolean {
  if (left.group !== right.group) return false;
  if (left.group === 'torso') return right.group === 'torso' && left.layer === right.layer;
  if (left.group === 'legs') return right.group === 'legs' && left.layer === right.layer;
  if (left.group === 'accessories') return right.group === 'accessories' && left.index === right.index;
  return true;
}

function displacedEquipmentIds(
  state: ItemSystemState,
  replacement: EquipmentReplacementChoice,
): string[] {
  const ids = Object.entries(state.placements)
    .filter(([, placement]) => placement.type === 'equipped' && equipmentPositionsEqual(placement.position, replacement.position))
    .map(([id]) => id);
  const definition = getItemDefinition(ITEM_CATALOG, state.instances[replacement.instanceId].definitionId);
  if (definition.handedness === 'two' && replacement.position.group === 'mainhand') {
    for (const [id, placement] of Object.entries(state.placements)) {
      if (placement.type === 'equipped' && placement.position.group === 'offhand') ids.push(id);
    }
  }
  return [...new Set(ids)];
}

type StowRequest =
  | { kind: 'unequip'; instanceId: string; itemName: string; displacedIds: string[] }
  | { kind: 'equip'; replacement: EquipmentReplacementChoice; itemName: string; displacedIds: string[] };

function validStowChoices(
  state: ItemSystemState,
  currentLocation: WorldLocationRef,
  request: StowRequest,
  health?: CharacterHealthState,
): TransferDestinationChoice[] {
  return getTransferDestinationChoices({ state, currentLocation, from: { type: 'equipped', position: { group: 'mainhand' } } })
    .filter((choice) => {
      try {
        if (request.kind === 'unequip') {
          unequipItem(state, ITEM_CATALOG, request.instanceId, choice.placement, { currentLocation });
        } else {
          equipItem(state, ITEM_CATALOG, request.replacement.instanceId, request.replacement.position, {
            currentLocation,
            displacedTo: choice.placement,
            health,
          });
        }
        return true;
      } catch {
        return false;
      }
    });
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
    ...(canReplace ? [{ kind: 'equip' as const, label: '更换', disabledReason: pendingReason }] : []),
  ];
  return { ...item, actions };
}

export interface EquipmentPanelProps {
  body: LordBodyCondition;
  focusedGroup?: string | null;
  onGroupFocus?: (group: EquipmentGroup | null) => void;
  visibleGroups?: readonly EquipmentGroup[];
  showStatusSummary?: boolean;
  showWoundBadge?: boolean;
  compact?: boolean;
}

export const EquipmentPanel: React.FC<EquipmentPanelProps> = ({
  body,
  focusedGroup,
  onGroupFocus,
  visibleGroups,
  showStatusSummary = true,
  showWoundBadge = true,
  compact = false,
}) => {
  const { gameState, cancelWorldTransaction, isStreaming } = useGameStore();
  const state = gameState.lord.items;
  const currentLocation = gameState.lord.location;
  const playerId = gameState.lord.canonicalCharacterId ?? `save:${gameState.worldCharacters?.runId ?? 'current'}:player`;
  const playerHealth = gameState.health.characters[playerId];
  const handLabel = (position: EquipmentPosition): string => {
    const physical = playerHealth ? physicalHandForEquipmentPosition(position, playerHealth.dominantHand) : undefined;
    if (!physical) return position.group === 'mainhand' ? '惯用手' : position.group === 'offhand' ? '非惯用手' : '';
    const dominant = physical === playerHealth?.dominantHand;
    return `${physical === 'right' ? '右手' : '左手'}${dominant ? '（惯用）' : '（非惯用）'}`;
  };
  const pendingItemActions = useMemo(() => pendingItemActionsFromWorldTransactions(
    gameState.worldRuntime.pendingTransactions,
    state,
    ITEM_CATALOG,
  ), [gameState.worldRuntime.pendingTransactions, state]);
  const draftItemAction = (action: ItemAction) => {
    if (isStreaming) return;
    if (action.kind !== 'equip' && action.kind !== 'unequip') return;
    const instance = state.instances[action.instanceId];
    if (!instance) return;
    const definition = getItemDefinition(ITEM_CATALOG, instance.definitionId);
    const name = instance.customName || definition.name;
    if (action.kind === 'equip') {
      const positionLabel = action.position.group === 'mainhand' || action.position.group === 'offhand'
        ? handLabel(action.position)
        : { head: '头部', torso: '躯干', legs: '腿部', accessories: '配饰' }[action.position.group];
      window.dispatchEvent(new CustomEvent('agot:prefill-action', { detail: { text: `我准备把【${name}】装备到${positionLabel}。请按当前实际装备、负担和可用保管位置结算；如果必须收起别的装备且存放方式会造成实质差异，先让我决定。` } }));
      return;
    }
    if (action.kind === 'unequip') {
      window.dispatchEvent(new CustomEvent('agot:prefill-action', { detail: { text: `我准备卸下【${name}】并收好。请按当前位置实际可用的携带或寄存条件结算；如果存放方式会造成实质差异，先让我决定。` } }));
    }
  };
  const cancelItemAction = cancelWorldTransaction;
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
  const [stowRequest, setStowRequest] = useState<StowRequest | null>(null);

  const replacementChoices = useMemo(() => replacementRequest ? getEquipmentReplacementChoices({
    state,
    catalog: ITEM_CATALOG,
    currentLocation,
    positions: replacementRequest.positions,
    excludedIds: replacementRequest.excludedIds,
  }).filter((choice) => canEquipItem(state, ITEM_CATALOG, choice.instanceId, choice.position, playerHealth)) : [], [currentLocation, replacementRequest, state, playerHealth]);
  const stowChoices = useMemo(
    () => stowRequest ? validStowChoices(state, currentLocation, stowRequest, playerHealth) : [],
    [currentLocation, state, stowRequest, playerHealth],
  );

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
    setReplacementRequest(null);
    const displacedIds = displacedEquipmentIds(state, replacement);
    if (!displacedIds.length) {
      draftItemAction({ kind: 'equip', instanceId: replacement.instanceId, position: replacement.position, displacedTo: { type: 'carried' } });
      return;
    }
    setStowRequest({ kind: 'equip', replacement, itemName: replacement.name, displacedIds });
  };

  const chooseStowDestination = (choiceId: string) => {
    if (!stowRequest || isStreaming) return;
    const choice = stowChoices.find((candidate) => candidate.id === choiceId);
    if (!choice) return;
    if (stowRequest.kind === 'unequip') {
      draftItemAction({ kind: 'unequip', instanceId: stowRequest.instanceId, to: choice.placement });
    } else {
      draftItemAction({
        kind: 'equip',
        instanceId: stowRequest.replacement.instanceId,
        position: stowRequest.replacement.position,
        displacedTo: choice.placement,
      });
    }
    setStowRequest(null);
  };

  const renderGroup = (group: EquipmentGroupModel) => {
    const positions = groupPositions(group);
    const groupReplacementChoices = getEquipmentReplacementChoices({
      state,
      catalog: ITEM_CATALOG,
      currentLocation,
      positions,
      excludedIds: group.items.map((item) => item.instanceId),
    }).filter((choice) => canEquipItem(state, ITEM_CATALOG, choice.instanceId, choice.position, playerHealth));
    const displayGroupLabel = group.group === 'mainhand' || group.group === 'offhand' ? handLabel(positions[0]) : group.label;
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
        <div className={`flex items-center gap-2 ${compact ? 'px-2 py-1.5' : 'px-2.5 py-2'}`}>
          <button
            type="button"
            data-equipment-toggle={group.group}
            aria-expanded={isExpanded}
            onClick={() => toggle(group.group)}
            className="group flex min-w-0 flex-1 items-center gap-2.5 text-left transition-colors hover:bg-parchment/[0.035] focus-visible:outline focus-visible:outline-1 focus-visible:outline-gold-deep"
          >
            {group.items[0] ? (
              <span className={`${compact ? 'h-10 w-10' : 'h-14 w-14'} shrink-0 border border-hairline-bright bg-ink-3 p-1 transition-colors group-hover:border-gold-deep`}>
                <ItemImage image={group.items[0].image} alt={group.items[0].name} className="h-full w-full" />
              </span>
            ) : (
              <span className={`flex ${compact ? 'h-10 w-10 text-sm' : 'h-14 w-14 text-lg'} shrink-0 items-center justify-center border border-dashed border-hairline-bright bg-ink-3/40 font-display text-parchment-faint transition-colors group-hover:border-gold-deep`}>—</span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <strong className={`shrink-0 whitespace-nowrap font-serif font-bold text-gold-bright ${compact ? 'text-[11.5px]' : 'text-[13px]'}`}>{displayGroupLabel}</strong>
                {showWoundBadge && wound && <span className={`font-mono text-[10px] ${woundLevel === 'intact' ? 'text-parchment-faint' : 'font-bold text-rubric'}`}>{wound}</span>}
                {pendingEntry && <span className="pending-chip">待生效 · {pendingEntry.label}</span>}
              </span>
              <span className={`mt-0.5 line-clamp-2 block break-words font-serif leading-relaxed text-parchment-dim ${compact ? 'text-[9.5px]' : 'text-[10.5px]'}`} title={group.summary}>{group.summary}</span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-gold-dim transition-all group-hover:text-gold ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
          <button
            type="button"
            disabled={isStreaming || (!pendingReplacement && group.reservedByTwoHandedItem)}
            title={pendingReplacement
              ? isStreaming ? '本次对话完成后才能取消操作' : `取消${pendingReplacement.label}`
              : group.reservedByTwoHandedItem ? '另一只手由双手武器占用'
                : groupReplacementChoices.length ? '选择替换装备' : '查看当前地点的可用装备'}
            onClick={() => {
              if (pendingReplacement) cancelItemAction(pendingReplacement.id);
              else openReplacementChoices(`更换${displayGroupLabel}`, positions, group.items.map((item) => item.instanceId));
            }}
            className={`item-action shrink-0 disabled:cursor-not-allowed disabled:opacity-35 ${pendingReplacement ? 'item-action--danger' : 'item-action--primary'}`}
          >
            {pendingReplacement ? '取消' : '更换'}
          </button>
        </div>

        {isExpanded && (
          <div className={`border-t border-hairline ${compact ? 'space-y-1.5 p-1.5' : 'space-y-2 p-2'}`}>
            {group.positions.map((position, index) => {
              const equipmentPosition = positions[index];
              const positionReplacementChoices = getEquipmentReplacementChoices({
                state,
                catalog: ITEM_CATALOG,
                currentLocation,
                positions: [equipmentPosition],
                excludedIds: position.item ? [position.item.instanceId] : [],
              }).filter((choice) => canEquipItem(state, ITEM_CATALOG, choice.instanceId, choice.position, playerHealth));
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
                      if (action.kind === 'unequip') setStowRequest({
                        kind: 'unequip',
                        instanceId: position.item!.instanceId,
                        itemName: position.item!.name,
                        displacedIds: [position.item!.instanceId],
                      });
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
  const groupVisible = (group: EquipmentGroup) => !visibleGroups || visibleGroups.includes(group);

  return (
    <div className="space-y-2.5" data-equipment-panel>
      {showStatusSummary && <div className="grid grid-cols-2 gap-1.5 border border-hairline bg-ink-3/35 p-2 sm:grid-cols-4">
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
      </div>}
      {groupVisible('head') && renderGroup(head)}
      {groupVisible('torso') && renderGroup(torso)}
      {(groupVisible('mainhand') || groupVisible('offhand')) && (
        <div data-hand-pair className={`grid grid-cols-1 gap-2 ${groupVisible('mainhand') && groupVisible('offhand') ? 'sm:grid-cols-2' : ''}`}>
          {groupVisible('mainhand') && renderGroup(mainhand)}
          {groupVisible('offhand') && renderGroup(offhand)}
        </div>
      )}
      {groupVisible('legs') && renderGroup(legs)}
      {groupVisible('accessories') && renderGroup(accessories)}
      <span className="sr-only">{TORSO_POSITION_LABELS.join('、')} · {LEG_POSITION_LABELS.join('、')} · {ACCESSORY_POSITION_COUNT}</span>
      {replacementRequest && (
        <ItemChoiceDialog
          title={replacementRequest.title}
          description="选择一件装备。选择后只会写入中央行动草稿；穿戴、收纳、时间与条件仍由正常回合结算。"
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
      {stowRequest && (
        <ItemChoiceDialog
          title={stowRequest.kind === 'unequip' ? `卸下${stowRequest.itemName}` : `收纳被替换装备`}
          description={stowRequest.kind === 'unequip'
            ? '选择卸下后实际存放的位置。只有当前地点且容量足够的保管处可用。'
            : `穿戴${stowRequest.itemName}后，选择原装备的实际存放位置。`}
          options={stowChoices.map((choice) => ({
            id: choice.id,
            title: choice.label,
            subtitle: choice.kind === 'carried' ? '随身保管' : choice.kind === 'site' ? '当前据点' : '当前载具',
            detail: choice.detail,
            icon: choice.kind,
          }))}
          emptyMessage="当前位置没有容量足够的保管位置。请先腾出空间或建立储藏处。"
          onChoose={chooseStowDestination}
          onClose={() => setStowRequest(null)}
        />
      )}
    </div>
  );
};
