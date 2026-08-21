import React, { useMemo, useState } from 'react';
import { MapPin, PackageOpen, Search } from 'lucide-react';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import type { PlayerCharacterDossier } from '../../features/characters/characterDossier';
import type { CharacterId } from '../../features/characters/types';
import { pendingItemActionsFromWorldTransactions } from '../../features/items/itemActionQueue';
import { createPendingWorldTransaction, itemActionToWorldIntent } from '../../features/world/worldTransactionQueue';
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
import type { WorldAssetBaseline } from '../../features/world/worldBaseline';
import { useGameStore } from '../../store/useGameStore';
import { ItemCard } from './ItemCard';
import { ItemChoiceDialog } from './ItemChoiceDialog';
import { ItemGiftDialog } from './ItemGiftDialog';
import { assetCustodianLabel, assetPrincipalLabel } from './worldAssetPresentation';

const CUSTODY_TABS: Array<{ id: CustodyTab; label: string }> = [
  { id: 'carried', label: '随行物品' },
  { id: 'current-site', label: '当前地点' },
  { id: 'vehicle', label: '随行载具' },
  { id: 'remote-site', label: '远方资产' },
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


export interface ItemManagementPanelProps {
  dossier?: PlayerCharacterDossier;
  onOpenCharacter?: (characterId: CharacterId) => void;
  onOpenLocation?: (locationId: string) => void;
  onOpenAsset?: (assetId: string) => void;
}

function itemInstanceId(assetId: string): string | null {
  if (assetId.startsWith('world-item:')) return assetId.slice('world-item:'.length);
  if (assetId.startsWith('item:')) return assetId.slice('item:'.length);
  return null;
}

function assetMapForDossier(dossier: PlayerCharacterDossier | undefined): Map<string, WorldAssetBaseline> {
  const result = new Map<string, WorldAssetBaseline>();
  if (!dossier) return result;
  const groups = dossier.assetGroups;
  for (const asset of [
    ...groups.equipment,
    ...groups.carried,
    ...groups.custody,
    ...groups.ownedElsewhere,
    ...groups.controlled,
  ]) {
    if (asset.kind !== 'item') continue;
    const instanceId = itemInstanceId(asset.id);
    if (instanceId && !result.has(instanceId)) result.set(instanceId, asset);
  }
  return result;
}



function ItemAssetContext({
  asset,
  characterNames,
  assetNames,
  locationId,
  locationName,
  assetName,
  onOpenCharacter,
  onOpenLocation,
  onOpenAsset,
}: {
  asset?: WorldAssetBaseline;
  characterNames: ReadonlyMap<CharacterId, string>;
  assetNames: ReadonlyMap<string, string>;
  locationId?: string;
  locationName?: string;
  assetName: string;
  onOpenCharacter?: (characterId: CharacterId) => void;
  onOpenLocation?: (locationId: string) => void;
  onOpenAsset?: (assetId: string) => void;
}) {
  if (!asset) return null;
  const ownerCharacterId = asset.lawfulOwner?.type === 'character' ? asset.lawfulOwner.characterId : undefined;
  const controllerCharacterId = asset.controller?.type === 'character' ? asset.controller.characterId : undefined;
  const custodianCharacterId = asset.custodian?.type === 'character' ? asset.custodian.characterId : undefined;
  const custodianAssetId = asset.custodian?.type === 'asset' ? asset.custodian.assetId : undefined;
  const ownerLabel = assetPrincipalLabel(asset.lawfulOwner, characterNames);
  const controllerLabel = assetPrincipalLabel(asset.controller, characterNames);
  const custodianLabel = assetCustodianLabel(asset, characterNames, assetNames);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-serif text-[9.5px] text-parchment-faint" data-asset-context>
      <button type="button" disabled={!ownerCharacterId || !onOpenCharacter} onClick={() => ownerCharacterId && onOpenCharacter?.(ownerCharacterId)} className="transition-colors enabled:hover:text-gold disabled:cursor-default">{ownerLabel}所有</button>
      <span aria-hidden="true">·</span>
      <button type="button" disabled={!controllerCharacterId || !onOpenCharacter} onClick={() => controllerCharacterId && onOpenCharacter?.(controllerCharacterId)} className="transition-colors enabled:hover:text-gold disabled:cursor-default">{controllerLabel}控制</button>
      <span aria-hidden="true">·</span>
      {custodianCharacterId && onOpenCharacter ? (
        <button type="button" onClick={() => onOpenCharacter(custodianCharacterId)} className="hover:text-gold-bright">{custodianLabel}保管</button>
      ) : custodianAssetId && onOpenAsset ? (
        <button type="button" onClick={() => onOpenAsset(custodianAssetId)} className="hover:text-gold-bright">{custodianLabel}保管</button>
      ) : <span>{custodianLabel}保管</span>}
      {asset.status !== 'normal' && <span className="border border-gold-deep/60 px-1 text-gold-dim">{asset.status === 'stolen' ? '失窃争议' : asset.status === 'contested' ? '归属争议' : '继承待定'}</span>}
      <span className="ml-auto flex items-center gap-1.5">
        {locationId && locationName && onOpenLocation && <button type="button" onClick={() => onOpenLocation(locationId)} className="text-gold-dim hover:text-gold-bright">{locationName}</button>}
        {onOpenAsset && <button type="button" onClick={() => onOpenAsset(asset.id)} className="text-gold-dim hover:text-gold-bright">{assetName}</button>}
      </span>
    </div>
  );
}

export const ItemManagementPanel: React.FC<ItemManagementPanelProps> = ({
  dossier,
  onOpenCharacter,
  onOpenLocation,
  onOpenAsset,
}) => {
  const { gameState, queueWorldTransaction, cancelWorldTransaction, isStreaming } = useGameStore();
  const { lord } = gameState;
  const state = lord.items;
  const playerCharacterId = (lord.canonicalCharacterId
    ?? `save:${gameState.worldCharacters?.runId ?? 'current'}:player`) as CharacterId;
  const pendingItemActions = useMemo(() => pendingItemActionsFromWorldTransactions(
    gameState.worldRuntime.pendingTransactions,
    state,
    ITEM_CATALOG,
  ), [gameState.worldRuntime.pendingTransactions, state]);
  const queueItemAction = (action: ItemAction) => queueWorldTransaction(createPendingWorldTransaction(
    itemActionToWorldIntent(action, playerCharacterId, `人物卷宗物品操作：${action.kind}`),
  ));
  const cancelItemAction = cancelWorldTransaction;
  const [activeTab, setActiveTab] = useState<CustodyTab>('carried');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ItemCategory | 'all'>('all');
  const [sortMode, setSortMode] = useState<SortMode>('location');
  const [transferRequest, setTransferRequest] = useState<{ instanceId: string; name: string } | null>(null);
  const [giftRequest, setGiftRequest] = useState<{ instanceId: string; name: string } | null>(null);
  const pendingByInstance = useMemo(() => new Map(pendingItemActions.map((action) => [action.instanceId, action])), [pendingItemActions]);
  const assetsByInstance = useMemo(() => assetMapForDossier(dossier), [dossier]);
  const storageAssets = useMemo(() => [
    ...Object.values(state.sites).map((site) => ({ id: `site:${site.id}`, name: site.name, locationId: site.location.locationId, locationLabel: site.locationLabel, kind: '据点' })),
    ...Object.values(state.vehicles).map((vehicle) => ({ id: `vehicle:${vehicle.id}`, name: vehicle.name, locationId: vehicle.location.locationId, locationLabel: vehicle.locationLabel, kind: '载具' })),
  ], [state.sites, state.vehicles]);
  const characterNames = useMemo(() => new Map<CharacterId, string>([[playerCharacterId, lord.name]]), [lord.name, playerCharacterId]);
  const assetNames = useMemo(() => new Map<string, string>([
    ...Object.values(state.sites).map((site) => [`site:${site.id}`, site.name] as const),
    ...Object.values(state.vehicles).map((vehicle) => [`vehicle:${vehicle.id}`, vehicle.name] as const),
    ...Object.values(state.instances).map((instance) => [
      `item:${instance.instanceId}`,
      instance.customName ?? getItemDefinition(ITEM_CATALOG, instance.definitionId).name,
    ] as const),
  ]), [state.instances, state.sites, state.vehicles]);
  const itemContext = (instanceId: string) => {
    const placement = state.placements[instanceId];
    if (!placement) return {};
    if (placement.type === 'site') {
      const site = state.sites[placement.siteId];
      return site ? { locationId: site.location.locationId, locationName: site.locationLabel } : {};
    }
    if (placement.type === 'vehicle') {
      const vehicle = state.vehicles[placement.vehicleId];
      return vehicle ? { locationId: vehicle.location.locationId, locationName: vehicle.locationLabel } : {};
    }
    if (placement.type === 'carried' || placement.type === 'equipped') {
      return { locationId: lord.location.locationId, locationName: lord.locationLabel };
    }
    return {};
  };

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
      <div className="grid gap-2 border border-hairline bg-ink-3/45 p-2 sm:grid-cols-3" data-asset-overview>
        <button type="button" onClick={() => onOpenLocation?.(lord.location.locationId)} className="flex min-w-0 items-center gap-2 border border-hairline bg-ink-2/65 px-2.5 py-2 text-left hover:border-gold-deep">
          <MapPin className="h-4 w-4 shrink-0 text-gold-deep" />
          <span className="min-w-0"><span className="block text-[9px] text-parchment-faint">当前位置</span><strong className="line-clamp-1 font-serif text-[11px] text-parchment">{lord.locationLabel}</strong></span>
        </button>
        <div className="flex items-center gap-2 border border-hairline bg-ink-2/65 px-2.5 py-2">
          <PackageOpen className="h-4 w-4 shrink-0 text-gold-deep" />
          <span><span className="block text-[9px] text-parchment-faint">随行容量</span><strong className="font-mono text-[11px] text-parchment">{usedCarry}/{DEFAULT_CARRIED_CAPACITY}</strong></span>
        </div>
        <div className="border border-hairline bg-ink-2/65 px-2.5 py-2">
          <span className="block text-[9px] text-parchment-faint">待生效调整</span>
          <strong className="font-mono text-[11px] text-parchment">{pendingItemActions.length} 项</strong>
        </div>
      </div>

      {storageAssets.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-storage-assets>
          {storageAssets.map((storage) => (
            <div key={storage.id} className="flex items-center border border-hairline bg-ink-3/35 text-[9.5px]">
              <button type="button" onClick={() => onOpenAsset?.(storage.id)} className="px-2 py-1 text-gold-dim hover:text-gold-bright">{storage.kind} · {storage.name}</button>
              <button type="button" onClick={() => onOpenLocation?.(storage.locationId)} className="border-l border-hairline px-2 py-1 text-parchment-faint hover:text-parchment">{storage.locationLabel}</button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="tablist" aria-label="物品保管位置" data-asset-location-tabs>
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
            const asset = assetsByInstance.get(card.instanceId);
            return (
              <ItemCard
                key={card.key}
                item={card}
                pendingNote={pending?.label}
                onCancelPending={pending ? () => cancelItemAction(pending.id) : undefined}
                pendingCancellationDisabled={isStreaming}
                assetContext={asset ? (
                  <ItemAssetContext
                    asset={asset}
                    characterNames={characterNames}
                    assetNames={assetNames}
                    {...itemContext(card.instanceId)}
                    assetName={card.name}
                    onOpenCharacter={onOpenCharacter}
                    onOpenLocation={onOpenLocation}
                    onOpenAsset={onOpenAsset}
                  />
                ) : undefined}
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
