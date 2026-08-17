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
import { useGameStore } from '../../store/useGameStore';
import { ItemCard } from './ItemCard';

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

function locationRoot(location: string): string {
  return location.split('·', 1)[0].trim();
}
function sameLocation(left: string, right: string): boolean {
  return locationRoot(left) === locationRoot(right);
}
function samePlacement(left: ItemPlacement, right: ItemPlacement): boolean {
  if (left.type !== right.type) return false;
  if (left.type === 'carried') return true;
  if (left.type === 'site') return right.type === 'site' && left.siteId === right.siteId;
  if (left.type === 'vehicle') return right.type === 'vehicle' && left.vehicleId === right.vehicleId;
  return false;
}

function preferredStorage(state: ReturnType<typeof useGameStore.getState>['gameState']['lord']['items'], currentLocation: string): ItemPlacement {
  const site = Object.values(state.sites).find((entry) => sameLocation(entry.location, currentLocation));
  if (site) return { type: 'site', siteId: site.id };
  const vehicle = Object.values(state.vehicles).find((entry) => sameLocation(entry.location, currentLocation));
  if (vehicle) return { type: 'vehicle', vehicleId: vehicle.id };
  return { type: 'carried' };
}

function transferDestination(
  state: ReturnType<typeof useGameStore.getState>['gameState']['lord']['items'],
  currentLocation: string,
  from: ItemPlacement,
): ItemPlacement | undefined {
  const choices: ItemPlacement[] = [
    { type: 'carried' },
    ...Object.values(state.sites).filter((site) => sameLocation(site.location, currentLocation)).map((site): ItemPlacement => ({ type: 'site', siteId: site.id })),
    ...Object.values(state.vehicles).filter((vehicle) => sameLocation(vehicle.location, currentLocation)).map((vehicle): ItemPlacement => ({ type: 'vehicle', vehicleId: vehicle.id })),
  ];
  return choices.find((choice) => !samePlacement(choice, from));
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
  const { gameState, pendingItemActions, queueItemAction, isStreaming } = useGameStore();
  const { lord } = gameState;
  const state = lord.items;
  const [activeTab, setActiveTab] = useState<CustodyTab>('carried');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ItemCategory | 'all'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('location');

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
        const to = transferDestination(state, lord.location, placement);
        if (to) queued = { kind: 'transfer', instanceId: card.instanceId, to };
        break;
      }
      case 'gift': {
        const recipient = window.prompt('请输入受赠人物标识');
        if (recipient?.trim()) queued = { kind: 'gift', instanceId: card.instanceId, recipientId: recipient.trim() };
        break;
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

  const tabCounts = useMemo(() => Object.fromEntries(CUSTODY_TABS.map((tab) => [tab.id, buildItemCardModels({ state, catalog: ITEM_CATALOG, currentLocation: lord.location, pendingActions: pendingItemActions, tab: tab.id }).length])), [lord.location, pendingItemActions, state]);
  const usedCarry = getUsedCarryUnits(state, ITEM_CATALOG);

  return (
    <section className="space-y-3" data-item-management>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="tablist" aria-label="物品保管位置">
        {CUSTODY_TABS.map((tab) => (
          <button key={tab.id} type="button" role="tab" data-custody-tab={tab.id} aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={`border px-2 py-2 text-left transition-colors ${activeTab === tab.id ? 'border-gold bg-gold-deep/15 text-gold-bright' : 'border-hairline bg-ink-3/40 text-parchment-dim hover:border-gold-deep'}`}>
            <span className="block font-serif text-[10.5px] font-bold">{tab.label}</span>
            <span className="mt-0.5 block font-mono text-[8.5px] text-parchment-faint">{tabCounts[tab.id]} 件</span>
          </button>
        ))}
      </div>

      <div className="grid gap-2 border border-hairline bg-ink-3/35 p-2 sm:grid-cols-[minmax(140px,1fr)_auto_auto]">
        <label className="flex items-center gap-2 border border-hairline bg-ink-2/65 px-2">
          <Search className="h-3.5 w-3.5 text-gold-dim" />
          <input data-item-search value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、材质或来历" className="min-w-0 flex-1 bg-transparent py-1.5 font-serif text-[10px] text-parchment outline-none placeholder:text-parchment-faint" />
        </label>
        <select data-item-category-filter value={category} onChange={(event) => setCategory(event.target.value as ItemCategory | 'all')} className="border border-hairline bg-ink-2 px-2 py-1.5 font-serif text-[10px] text-parchment outline-none">
          <option value="all">全部类别</option>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select data-item-sort value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="border border-hairline bg-ink-2 px-2 py-1.5 font-serif text-[10px] text-parchment outline-none">
          <option value="location">当前位置</option><option value="category">类别</option><option value="quality">品质</option><option value="durability">耐久</option><option value="name">名称</option>
        </select>
      </div>

      <div className="flex items-center justify-between gap-2 font-mono text-[9px] text-parchment-faint">
        <span>{activeTab === 'carried' ? `随身体积 ${usedCarry}/${DEFAULT_CARRIED_CAPACITY}` : CUSTODY_TABS.find((tab) => tab.id === activeTab)?.label}</span>
        {activeTab === 'remote-site' && <span>远方物品只读，抵达对应地点后才能操作</span>}
      </div>

      {cards.length > 0 ? (
        <div className="grid gap-2 xl:grid-cols-2">
          {cards.map((card) => <ItemCard key={card.key} item={card} onAction={queueCardAction} />)}
        </div>
      ) : (
        <div className="border border-dashed border-hairline py-10 text-center font-serif text-[11px] text-parchment-faint">此页没有符合条件的物品</div>
      )}
    </section>
  );
};
