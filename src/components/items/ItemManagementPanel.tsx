import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { getItemDefinition } from '../../features/items/catalog';
import { DEFAULT_CARRIED_CAPACITY, getUsedCarryUnits } from '../../features/items/custody';
import type {
  EquipmentPosition,
  ItemAction,
  ItemCategory,
  ItemPlacement,
} from '../../features/items/types';
import {
  buildItemCardModels,
  type CustodyTab,
  type ItemCardModel,
} from '../../features/items/viewModel';
import { getTransferDestinationChoices } from '../../features/items/actionChoices';
import { sameWorldLocation } from '../../features/map/locationResolver';
import type { WorldLocationRef } from '../../features/map/types';
import { useGameStore } from '../../store/useGameStore';
import { ItemCard } from './ItemCard';
import { ItemChoiceDialog } from './ItemChoiceDialog';
import { ItemGiftDialog } from './ItemGiftDialog';

const CUSTODY_TABS: Array<{ id: CustodyTab; label: string }> = [
  { id: 'carried', label: '随身物品' },
  { id: 'current-site', label: '当前据点' },
  { id: 'vehicle', label: '随行运输' },
  { id: 'remote-site', label: '远方储藏' },
];

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  weapon: '武器', armor: '防具', clothing: '服装', jewelry: '佩饰', tool: '工具',
  document: '文书', medicine: '药品', poison: '毒物', supply: '补给', keepsake: '信物',
};
const QUALITY_ORDER = { rough: 0, common: 1, fine: 2, masterwork: 3, legendary: 4 } as const;
type SortMode = 'location' | 'category' | 'quality' | 'durability' | 'name';

function preferredStorage(state: ReturnType<typeof useGameStore.getState>['gameState']['lord']['items'], currentLocation: WorldLocationRef): ItemPlacement {
  const site = Object.values(state.sites).find((entry) => sameWorldLocation(entry.location, currentLocation));
  if (site) return { type: 'site', siteId: site.id };
  const vehicle = Object.values(state.vehicles).find((entry) => sameWorldLocation(entry.location, currentLocation));
  if (vehicle) return { type: 'vehicle', vehicleId: vehicle.id };
  return { type: 'carried' };
}

function exactActions(
  card: ItemCardModel,
  tab: CustodyTab,
  state: ReturnType<typeof useGameStore.getState>['gameState']['lord']['items'],
): ItemCardModel['actions'] {
  if (tab === 'remote-site') return [];
  const instance = state.instances[card.instanceId];
  const definition = getItemDefinition(ITEM_CATALOG, instance.definitionId);
  const placement = state.placements[card.instanceId];
  const pendingReason = card.actions.find((action) => action.disabledReason)?.disabledReason;
  const disabled = (reason?: string) => pendingReason ?? reason;
  const actions: ItemCardModel['actions'] = [];
  if (placement.type === 'equipped') {
    actions.push({ kind: 'unequip', label: '卸下', disabledReason: disabled() });
  } else if (definition.equippable) {
    actions.push({ kind: 'equip', label: '穿戴', disabledReason: disabled(instance.durability <= 0 ? '物品已经完全损坏' : undefined) });
  }
  if (['medicine', 'poison', 'supply', 'tool'].includes(definition.category)) actions.push({ kind: 'use', label: '使用', disabledReason: disabled() });
  if (placement.type === 'carried' || placement.type === 'site' || placement.type === 'vehicle') {
    actions.push({ kind: 'transfer', label: '转移', disabledReason: disabled() });
    actions.push({ kind: 'gift', label: '赠送', disabledReason: disabled() });
    actions.push({ kind: 'discard', label: '丢弃', disabledReason: disabled() });
  }
  if (instance.durability < 100) actions.push({ kind: 'repair', label: '修理', disabledReason: disabled() });
  if (!instance.isHeirloom) actions.push({ kind: 'mark_heirloom', label: '设为传家宝', disabledReason: disabled() });
  if (definition.stackable && instance.quantity > 1) actions.push({ kind: 'split', label: '拆分', disabledReason: disabled() });
  const mergeTarget = Object.values(state.instances).find((candidate) => candidate.instanceId !== instance.instanceId
    && candidate.definitionId === instance.definitionId
    && state.placements[candidate.instanceId]?.type !== 'lost'
    && state.placements[candidate.instanceId]?.type !== 'character');
  if (definition.stackable && mergeTarget) actions.push({ kind: 'merge', label: '合并', disabledReason: disabled() });
  return actions;
}

function durableValue(label: string): number {
  return Number(label.match(/(\d+)\/100/)?.[1] ?? 0);
}

export const ItemManagementPanel: React.FC = () => {
  const { gameState, pendingItemActions, queueItemAction, cancelItemAction, isStreaming } = useGameStore();
  const { lord } = gameState;
  const state = lord.items;
  const [activeTab, setActiveTab] = useState<CustodyTab>('carried');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ItemCategory | 'all'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('location');
  const [transferRequest, setTransferRequest] = useState<{ instanceId: string; name: string } | null>(null);
  const [giftRequest, setGiftRequest] = useState<{ instanceId: string; name: string } | null>(null);
  const pendingByInstance = useMemo(() => new Map(pendingItemActions.map((action) => [action.instanceId, action])), [pendingItemActions]);

  const transferChoices = useMemo(() => {
    if (!transferRequest) return [];
    const placement = state.placements[transferRequest.instanceId];
    if (!placement) return [];
    return getTransferDestinationChoices({ state, currentLocation: lord.location, from: placement });
  }, [lord.location, state, transferRequest]);

  const cards = useMemo(() => {
    const models = buildItemCardModels({ state, catalog: ITEM_CATALOG, currentLocation: lord.location, pendingActions: pendingItemActions, tab: activeTab });
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
    return models
      .filter((card) => {
        if (category !== 'all' && card.category !== category) return false;
        if (!normalizedQuery) return true;
        const instance = state.instances[card.instanceId];
        const definition = getItemDefinition(ITEM_CATALOG, instance.definitionId);
        return [card.name, CATEGORY_LABELS[card.category], definition.material, definition.provenance?.maker, definition.provenance?.origin, ...card.provenanceLines]
          .filter(Boolean).some((value) => String(value).toLocaleLowerCase('zh-CN').includes(normalizedQuery));
      })
      .map((card) => ({ ...card, actions: exactActions(card, activeTab, state) }))
      .sort((left, right) => {
        if (sortMode === 'category') return left.category.localeCompare(right.category) || left.name.localeCompare(right.name, 'zh-CN');
        if (sortMode === 'quality') return QUALITY_ORDER[right.quality] - QUALITY_ORDER[left.quality] || left.name.localeCompare(right.name, 'zh-CN');
        if (sortMode === 'durability') return durableValue(right.durabilityLabel) - durableValue(left.durabilityLabel) || left.name.localeCompare(right.name, 'zh-CN');
        if (sortMode === 'name') return left.name.localeCompare(right.name, 'zh-CN');
        return left.locationLabel.localeCompare(right.locationLabel, 'zh-CN') || left.name.localeCompare(right.name, 'zh-CN');
      });
  }, [activeTab, category, lord.location, pendingItemActions, query, sortMode, state]);

  const queueCardAction = (card: ItemCardModel, action: ItemCardModel['actions'][number]) => {
    if (isStreaming || action.disabledReason || activeTab === 'remote-site') return;
    const instance = state.instances[card.instanceId];
    const definition = getItemDefinition(ITEM_CATALOG, instance.definitionId);
    const placement = state.placements[card.instanceId];
    let queued: ItemAction | undefined;
    switch (action.kind) {
      case 'equip': {
        const position = definition.allowedPositions[0] as EquipmentPosition | undefined;
        if (position) queued = { kind: 'equip', instanceId: card.instanceId, position, displacedTo: preferredStorage(state, lord.location) };
        break;
      }
      case 'unequip': queued = { kind: 'unequip', instanceId: card.instanceId, to: preferredStorage(state, lord.location) }; break;
      case 'use': queued = { kind: 'use', instanceId: card.instanceId }; break;
      case 'transfer': {
        setTransferRequest({ instanceId: card.instanceId, name: card.name });
        return;
      }
      case 'gift': {
        setGiftRequest({ instanceId: card.instanceId, name: card.name });
        return;
      }
      case 'discard': queued = { kind: 'discard', instanceId: card.instanceId }; break;
      case 'repair': queued = { kind: 'repair', instanceId: card.instanceId, amount: 25 }; break;
      case 'mark_heirloom': queued = { kind: 'mark_heirloom', instanceId: card.instanceId, houseId: lord.house }; break;
      case 'split': queued = { kind: 'split', instanceId: card.instanceId, quantity: 1, newInstanceId: `${card.instanceId}.split.${Date.now()}`, to: placement }; break;
      case 'merge': {
        const target = Object.values(state.instances).find((candidate) => candidate.instanceId !== card.instanceId && candidate.definitionId === instance.definitionId);
        if (target) queued = { kind: 'merge', sourceInstanceId: card.instanceId, targetInstanceId: target.instanceId };
        break;
      }
      default: break;
    }
    if (queued) queueItemAction(queued);
  };

  const chooseTransferDestination = (choiceId: string) => {
    if (!transferRequest || isStreaming) return;
    const choice = transferChoices.find((candidate) => candidate.id === choiceId);
    if (!choice) return;
    queueItemAction({ kind: 'transfer', instanceId: transferRequest.instanceId, to: choice.placement });
    setTransferRequest(null);
  };

  const tabCounts = useMemo(() => Object.fromEntries(CUSTODY_TABS.map((tab) => [tab.id, buildItemCardModels({ state, catalog: ITEM_CATALOG, currentLocation: lord.location, pendingActions: pendingItemActions, tab: tab.id }).length])), [lord.location, pendingItemActions, state]);
  const usedCarry = getUsedCarryUnits(state, ITEM_CATALOG);

  return (
    <>
    <section className="space-y-3" data-item-management>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="tablist" aria-label="物品保管位置">
        {CUSTODY_TABS.map((tab) => (
          <button key={tab.id} type="button" role="tab" data-custody-tab={tab.id} aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={`border px-2 py-2 text-left transition-colors ${activeTab === tab.id ? 'border-gold bg-gold-deep/15 text-gold-bright' : 'border-hairline bg-ink-3/40 text-parchment-dim hover:border-gold-deep'}`}>
            <span className="block font-serif text-[11px] font-bold">{tab.label}</span>
            <span className="mt-0.5 block font-mono text-[9.5px] text-parchment-faint">{tabCounts[tab.id]} 件</span>
          </button>
        ))}
      </div>

      <div className="grid gap-2 border border-hairline bg-ink-3/35 p-2 sm:grid-cols-[minmax(140px,1fr)_auto_auto]">
        <label className="flex items-center gap-2 border border-hairline bg-ink-2/65 px-2">
          <Search className="h-3.5 w-3.5 text-gold-dim" />
          <input data-item-search value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、材质或来历" className="min-w-0 flex-1 bg-transparent py-1.5 font-serif text-[11px] text-parchment outline-none placeholder:text-parchment-faint" />
        </label>
        <select data-item-category-filter value={category} onChange={(event) => setCategory(event.target.value as ItemCategory | 'all')} className="border border-hairline bg-ink-2 px-2 py-1.5 font-serif text-[11px] text-parchment outline-none">
          <option value="all">全部类别</option>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select data-item-sort value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="border border-hairline bg-ink-2 px-2 py-1.5 font-serif text-[11px] text-parchment outline-none">
          <option value="location">当前位置</option><option value="category">类别</option><option value="quality">品质</option><option value="durability">耐久</option><option value="name">名称</option>
        </select>
      </div>

      <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-parchment-dim">
        <span>{activeTab === 'carried' ? `随身体积 ${usedCarry}/${DEFAULT_CARRIED_CAPACITY}` : CUSTODY_TABS.find((tab) => tab.id === activeTab)?.label}</span>
        {activeTab === 'remote-site' && <span>远方物品只读,抵达对应地点后才能操作</span>}
      </div>

      {cards.length > 0 ? (
        <div className="grid gap-2 xl:grid-cols-2">
          {cards.map((card) => {
            const pending = pendingByInstance.get(card.instanceId);
            return (
              <ItemCard
                key={card.key}
                item={card}
                pendingNote={pending?.label}
                onCancelPending={pending ? () => cancelItemAction(pending.id) : undefined}
                pendingCancellationDisabled={isStreaming}
                onAction={queueCardAction}
              />
            );
          })}
        </div>
      ) : (
        <div className="border border-dashed border-hairline py-10 text-center font-serif text-[11.5px] text-parchment-dim">此页没有符合条件的物品</div>
      )}
    </section>
    {transferRequest && (
      <ItemChoiceDialog
        title={`转移${transferRequest.name}`}
        description="选择物品要转移到的保管位置。选择后会加入队列,并在下一次成功对话后完成。"
        options={transferChoices.map((choice) => ({
          id: choice.id,
          title: choice.label,
          subtitle: choice.kind === 'carried' ? '随身物品' : choice.kind === 'site' ? '据点储藏' : '运输工具',
          detail: choice.detail,
          icon: choice.kind,
        }))}
        emptyMessage="当前位置没有其他可用的保管位置。"
        onChoose={chooseTransferDestination}
        onClose={() => setTransferRequest(null)}
      />
    )}
    {giftRequest && (
      <ItemGiftDialog
        itemName={giftRequest.name}
        onConfirm={(recipientId) => {
          if (!isStreaming) queueItemAction({ kind: 'gift', instanceId: giftRequest.instanceId, recipientId });
          setGiftRequest(null);
        }}
        onClose={() => setGiftRequest(null)}
      />
    )}
    </>
  );
};
