import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { formatDynastyName, type CharacterDossier } from '../../features/characters/characterDossier';
import { dossierRepository, useCharacterDossier } from '../../features/characters/useCharacterDossier';
import type { CharacterId } from '../../features/characters/types';
import type { CraftQuality, ItemBulk, ItemCategory } from '../../features/items/types';
import { createWorldBaselineSnapshot, type WorldAssetBaseline } from '../../features/world/worldBaseline';
import { selectWorldAssetView } from '../../features/world/worldSelectors';
import type { WorldPrincipalRef } from '../../features/world/worldRuntimeTypes';
import { mapRepository } from '../../features/map/repository';
import { useGameStore } from '../../store/useGameStore';
import { GameIcon } from '../GameIcon';
import { getWorldAssetDisplay } from './WorldAssetSections';
import { ItemImage } from './ItemImage';
import {
  assetCustodianLabel,
  assetEquipmentLabel,
  compactEquipmentLabel,
  containedAssets,
  itemEffectLabels,
} from './worldAssetPresentation';

export interface WorldAssetDrawerProps {
  assetId: string;
  sourceCharacterId?: CharacterId | null;
  onBack: () => void;
  onClose: () => void;
  onOpenCharacter: (characterId: CharacterId) => void;
  onOpenLocation: (locationId: string) => void;
  onOpenAsset: (assetId: string, sourceCharacterId?: CharacterId | null) => void;
}

function inferredSourceCharacterId(assetId: string): CharacterId | null {
  const match = /^item:npc:([^:]+):/.exec(assetId);
  return match ? `agot:${match[1]}` : null;
}

function dossierAssets(dossier: CharacterDossier): WorldAssetBaseline[] {
  const groups = dossier.assetGroups;
  return [...new Map([
    ...groups.equipment,
    ...groups.carried,
    ...groups.custody,
    ...groups.ownedElsewhere,
    ...groups.controlled,
    ...groups.sites,
    ...groups.vehicles,
  ].map((asset) => [asset.id, asset])).values()];
}

function principalCharacters(asset: WorldAssetBaseline): CharacterId[] {
  const result: CharacterId[] = [];
  for (const relation of [asset.lawfulOwner, asset.controller, asset.custodian]) {
    if (relation?.type === 'character') result.push(relation.characterId);
  }
  if (asset.placement?.type === 'character') result.push(asset.placement.characterId);
  return result;
}

function selectDrawerAsset(dossier: CharacterDossier, assetId: string, runtime: ReturnType<typeof useGameStore.getState>['gameState']['worldRuntime']) {
  const assets = dossierAssets(dossier);
  const characters = new Map<CharacterId, { id: CharacterId; alive: boolean; location: CharacterDossier['worldLocation'] }>();
  characters.set(dossier.worldCharacterId, {
    id: dossier.worldCharacterId,
    alive: dossier.alive,
    location: dossier.worldLocation ? { ...dossier.worldLocation } : null,
  });
  for (const asset of assets) {
    for (const characterId of principalCharacters(asset)) {
      if (!characters.has(characterId)) characters.set(characterId, { id: characterId, alive: true, location: null });
    }
  }
  for (const [id, patch] of Object.entries(runtime.characters) as Array<[CharacterId, typeof runtime.characters[CharacterId]]>) {
    if (!characters.has(id)) characters.set(id, { id, alive: patch.alive ?? true, location: patch.location ? { ...patch.location } : null });
  }
  const titles = new Map<string, {
    id: string;
    lawfulHolderId: CharacterId | null;
    controllerId: CharacterId | null;
    contestedByIds: CharacterId[];
  }>(dossier.worldTitleIds.map((titleId) => [titleId, {
    id: titleId,
    lawfulHolderId: dossier.worldCharacterId,
    controllerId: dossier.worldCharacterId,
    contestedByIds: [] as CharacterId[],
  }]));
  for (const [titleId, patch] of Object.entries(runtime.titles)) {
    if (!titles.has(titleId)) titles.set(titleId, {
      id: titleId,
      lawfulHolderId: patch.lawfulHolderId ?? null,
      controllerId: patch.controllerId ?? null,
      contestedByIds: [...(patch.contestedByIds ?? [])],
    });
  }
  const knownLocationIds = new Set<string>();
  if (dossier.worldLocation) knownLocationIds.add(dossier.worldLocation.locationId);
  for (const asset of assets) if (asset.placement?.type === 'location') knownLocationIds.add(asset.placement.location.locationId);
  const baseline = createWorldBaselineSnapshot({
    characters: [...characters.values()],
    titles: [...titles.values()],
    assets,
    knownLocationIds: [...knownLocationIds],
  });
  return selectWorldAssetView(assetId, { baseline, runtime });
}

function RelationRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 border-b border-hairline/60 py-2.5 last:border-b-0">
      <span className="text-[9px] tracking-[0.12em] text-parchment-faint">{label}</span>
      <div className="min-w-0 font-serif text-[11px] text-parchment">{children}</div>
    </div>
  );
}

function principalLabel(
  principal: WorldPrincipalRef,
  characterNames: ReadonlyMap<CharacterId, string>,
  titleNames: ReadonlyMap<string, string>,
): string {
  if (principal.type === 'character') return characterNames.get(principal.characterId) ?? '人物姓名未能解析';
  if (principal.type === 'title') return titleNames.get(principal.titleId) ?? '头衔名称未能解析';
  return formatDynastyName(principal.dynastyId);
}

function PrincipalValue({
  principal,
  characterNames,
  titleNames,
  onOpenCharacter,
  missingLabel,
}: {
  principal: WorldPrincipalRef | null;
  characterNames: ReadonlyMap<CharacterId, string>;
  titleNames: ReadonlyMap<string, string>;
  onOpenCharacter: (characterId: CharacterId) => void;
  missingLabel: string;
}) {
  if (!principal) return <>{missingLabel}</>;
  const label = principalLabel(principal, characterNames, titleNames);
  if (principal.type === 'character') {
    return <button type="button" className="text-gold hover:text-gold-bright" onClick={() => onOpenCharacter(principal.characterId)}>{label}</button>;
  }
  return <>{label}</>;
}

function CustodianValue({
  asset,
  sourceCharacterId,
  characterNames,
  assetNames,
  onOpenCharacter,
  onOpenAsset,
}: {
  asset: WorldAssetBaseline;
  sourceCharacterId: CharacterId | null;
  characterNames: ReadonlyMap<CharacterId, string>;
  assetNames: ReadonlyMap<string, string>;
  onOpenCharacter: (characterId: CharacterId) => void;
  onOpenAsset: WorldAssetDrawerProps['onOpenAsset'];
}) {
  const { custodian } = asset;
  const label = assetCustodianLabel(asset, characterNames, assetNames);
  if (!custodian) return <>{label}</>;
  if (custodian.type === 'character') {
    return <button type="button" className="text-gold hover:text-gold-bright" onClick={() => onOpenCharacter(custodian.characterId)}>{label}</button>;
  }
  return <button type="button" className="text-gold hover:text-gold-bright" onClick={() => onOpenAsset(custodian.assetId, sourceCharacterId)}>{label}</button>;
}

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  weapon: '武器', armor: '防具', clothing: '服装', jewelry: '佩饰', tool: '工具',
  document: '文书', medicine: '药品', poison: '毒物', supply: '补给', keepsake: '信物',
};

const QUALITY_LABELS: Record<CraftQuality, string> = {
  rough: '粗制', common: '普通', fine: '精良', masterwork: '大师级', legendary: '传奇',
};

const BULK_LABELS: Record<ItemBulk, string> = {
  tiny: '微小', small: '小型', medium: '中型', large: '大型',
};

function itemInstanceId(assetId: string): string {
  if (assetId.startsWith('world-item:')) return assetId.slice('world-item:'.length);
  if (assetId.startsWith('item:')) return assetId.slice('item:'.length);
  return assetId.slice(assetId.indexOf(':') + 1);
}

function StoredItemInformation({
  asset,
  dossier,
  sourceCharacterId,
  characterNames,
  titleNames,
  assetNames,
  onOpenCharacter,
  onOpenAsset,
}: {
  asset: WorldAssetBaseline;
  dossier: CharacterDossier;
  sourceCharacterId: CharacterId | null;
  characterNames: ReadonlyMap<CharacterId, string>;
  titleNames: ReadonlyMap<string, string>;
  assetNames: ReadonlyMap<string, string>;
  onOpenCharacter: WorldAssetDrawerProps['onOpenCharacter'];
  onOpenAsset: WorldAssetDrawerProps['onOpenAsset'];
}) {
  const display = getWorldAssetDisplay(asset, dossier);
  const instanceId = itemInstanceId(asset.id);
  const playerInstance = dossier.kind === 'player' ? dossier.player.items.instances[instanceId] : undefined;
  const npcItem = dossier.kind === 'npc' ? dossier.character.items.find((item) => item.instanceId === instanceId) : undefined;
  const definition = ITEM_CATALOG.get(playerInstance?.definitionId ?? npcItem?.definitionId ?? asset.definitionId ?? '');
  const quantity = playerInstance?.quantity ?? 1;
  const durability = playerInstance?.durability ?? 100;
  const quality = playerInstance?.quality ?? definition?.baseQuality ?? 'common';
  const equipmentLabel = definition
    ? compactEquipmentLabel(asset, definition, characterNames)
    : assetEquipmentLabel(asset, characterNames, assetNames);
  const effects = definition ? itemEffectLabels(definition.effects) : [];
  const ownerLabel = asset.lawfulOwner ? principalLabel(asset.lawfulOwner, characterNames, titleNames) : '未记录';
  const custodianLabel = assetCustodianLabel(asset, characterNames, assetNames);
  return (
    <article className="border border-hairline bg-ink-2/55 px-2.5 py-2" data-stored-item-information={asset.id}>
      <div className="flex gap-2.5">
        <button
          type="button"
          className="h-10 w-10 shrink-0 border border-hairline bg-ink-3/80 p-0.5 transition-colors hover:border-gold-deep"
          onClick={() => onOpenAsset(asset.id, sourceCharacterId)}
          aria-label={display.name}
        >
          {display.image
            ? <ItemImage image={display.image} alt={display.name} className="h-full w-full" />
            : <GameIcon icon="artifact-crown" className="h-full w-full" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button type="button" className="line-clamp-1 text-left font-serif text-[11px] font-bold text-parchment hover:text-gold-bright" onClick={() => onOpenAsset(asset.id, sourceCharacterId)}>{display.name}</button>
            <span className="shrink-0 font-mono text-[8.5px] text-parchment-faint">×{quantity}</span>
          </div>
          {definition ? (
            <>
              <div className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[8.5px] text-parchment-faint" data-stored-item-attributes>
                <span>{CATEGORY_LABELS[definition.category]}</span>
                <span>{QUALITY_LABELS[quality]}</span>
                <span>耐久 {durability}/100</span>
                <span>{BULK_LABELS[definition.bulk]}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-serif text-[9px] text-parchment-dim">
                <span>材质：{definition.material}</span>
                <span className="text-gold-dim">{equipmentLabel}</span>
              </div>
              {effects.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {effects.map((effect) => <span key={effect} className="border border-gold-deep/45 bg-ink-3/45 px-1.5 py-0.5 font-mono text-[8px] text-gold-dim">{effect}</span>)}
                </div>
              )}
            </>
          ) : <div className="mt-1 text-[9px] text-parchment-faint">{equipmentLabel}</div>}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 border-t border-hairline/55 pt-1.5 font-serif text-[8.5px] text-parchment-faint">
        <span>所有者：{ownerLabel}</span>
        <span>保管：{custodianLabel}</span>
        {asset.status !== 'normal' && <span className="text-gold-dim">{STATUS_LABELS[asset.status]}</span>}
      </div>
    </article>
  );
}

const STATUS_LABELS: Record<WorldAssetBaseline['status'], string> = {
  normal: '关系正常',
  stolen: '失窃',
  inheritance_pending: '等待继承',
};

export const WorldAssetDrawer: React.FC<WorldAssetDrawerProps> = ({
  assetId,
  sourceCharacterId: requestedSourceCharacterId = null,
  onBack,
  onClose,
  onOpenCharacter,
  onOpenLocation,
  onOpenAsset,
}) => {
  const runtime = useGameStore((state) => state.gameState.worldRuntime);
  const sourceCharacterId = requestedSourceCharacterId ?? inferredSourceCharacterId(assetId);
  const { dossier, relatedRecords, status, error } = useCharacterDossier(sourceCharacterId);
  const [loadedCharacterNames, setLoadedCharacterNames] = useState<ReadonlyMap<CharacterId, string>>(new Map());
  const [titleNames, setTitleNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [locationName, setLocationName] = useState<string | null>(null);
  const view = useMemo(
    () => dossier ? selectDrawerAsset(dossier, assetId, runtime) : null,
    [assetId, dossier, runtime],
  );
  const display = view && dossier ? getWorldAssetDisplay(view.asset, dossier) : null;
  const characterNames = useMemo(() => {
    const names = new Map<CharacterId, string>();
    if (dossier) names.set(dossier.worldCharacterId, dossier.name);
    for (const [characterId, record] of relatedRecords) names.set(characterId, record.name || '人物姓名未能解析');
    for (const [characterId, name] of loadedCharacterNames) names.set(characterId, name);
    return names;
  }, [dossier, loadedCharacterNames, relatedRecords]);
  const allAssets = useMemo(() => dossier ? dossierAssets(dossier) : [], [dossier]);
  const assetNames = useMemo(() => new Map(
    dossier ? allAssets.map((asset) => [asset.id, getWorldAssetDisplay(asset, dossier).name] as const) : [],
  ), [allAssets, dossier]);
  const equipmentLabel = view ? assetEquipmentLabel(view.asset, characterNames, assetNames) : null;
  const storedAssets = useMemo(
    () => view && view.asset.kind !== 'item' ? containedAssets(view.asset.id, allAssets) : [],
    [allAssets, view],
  );

  useEffect(() => {
    if (!view) {
      setLoadedCharacterNames(new Map());
      setTitleNames(new Map());
      setLocationName(null);
      return;
    }
    let cancelled = false;
    const visibleAssets = [view.asset, ...storedAssets];
    const characterIds = [...new Set(visibleAssets.flatMap(principalCharacters))];
    const titleIds = [...new Set(visibleAssets.flatMap((asset) => [asset.lawfulOwner, asset.controller])
      .flatMap((principal) => principal?.type === 'title' ? [principal.titleId] : []))];
    setLoadedCharacterNames(new Map());
    setTitleNames(new Map());
    setLocationName(null);

    if (characterIds.length > 0) {
      dossierRepository.getSearchHits(characterIds).then((records) => {
        if (!cancelled) setLoadedCharacterNames(new Map(records.map((record) => [record.id, record.name])));
      }).catch(() => undefined);
    }
    if (titleIds.length > 0) {
      mapRepository.loadSemanticIndex().then((index) => {
        if (!cancelled) setTitleNames(new Map(titleIds.flatMap((titleId) => {
          const title = index.titleById.get(titleId);
          return title ? [[titleId, title.name] as const] : [];
        })));
      }).catch(() => undefined);
    }
    if (view.location) {
      mapRepository.getLocation(view.location.locationId).then((location) => {
        if (!cancelled) setLocationName(location.name);
      }).catch(() => {
        if (!cancelled) setLocationName('地点名称未能解析');
      });
    }
    return () => { cancelled = true; };
  }, [storedAssets, view]);

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="资产详情" data-world-asset-drawer>
      <div className="modal-backdrop absolute inset-0" onClick={onClose} />
      <aside className="drawer-enter absolute right-0 top-0 flex h-full w-[92vw] max-w-[460px] flex-col border-l border-hairline-bright bg-ink shadow-[-32px_0_80px_rgba(0,0,0,0.45)]">
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-hairline/70 px-3">
          <button type="button" onClick={onBack} className="btn-ghost !px-2 !py-1 !text-[10px]"><ArrowLeft className="h-3.5 w-3.5" />返回</button>
          <span className="eyebrow">资产详情</span>
          <button type="button" onClick={onClose} className="btn-ghost !px-1.5" aria-label="关闭资产详情"><X className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {status !== 'ready' ? (
            <p className="py-10 text-center font-serif text-[11px] text-parchment-faint">{status === 'loading' ? '正在核对资产记录' : error ?? '资料未能解析'}</p>
          ) : !view || !display || !dossier ? (
            <p className="py-10 text-center font-serif text-[11px] text-parchment-faint">资料未能解析</p>
          ) : (
            <div className="space-y-5">
              <section className="flex gap-4 border border-hairline bg-ink-2/70 p-4">
                <div className="h-24 w-24 shrink-0 border border-hairline bg-ink-3 p-1.5">
                  {display.image
                    ? <ItemImage image={display.image} alt={display.name} className="h-full w-full" />
                    : <GameIcon icon={view.asset.kind === 'vehicle' ? 'artifact-krakenhorn' : 'artifact-crown'} className="h-full w-full" />}
                </div>
                <div className="min-w-0">
                  <h2 className="font-serif text-lg font-bold text-parchment">{display.name}</h2>
                  <p className="mt-2 font-serif text-[10.5px] leading-relaxed text-parchment-faint">{display.description}</p>
                  <span className="mt-2 inline-block border border-gold-deep/60 px-1.5 py-0.5 text-[9px] text-gold">{STATUS_LABELS[view.asset.status]}</span>
                </div>
              </section>

              <section className="border border-hairline bg-ink-2/45 px-3" aria-label="资产关系">
                <RelationRow label="法理所有者"><PrincipalValue principal={view.asset.lawfulOwner} characterNames={characterNames} titleNames={titleNames} onOpenCharacter={onOpenCharacter} missingLabel="未记录法理所有者" /></RelationRow>
                <RelationRow label="实际控制者"><PrincipalValue principal={view.asset.controller} characterNames={characterNames} titleNames={titleNames} onOpenCharacter={onOpenCharacter} missingLabel="未记录实际控制者" /></RelationRow>
                <RelationRow label="当前保管者"><CustodianValue asset={view.asset} sourceCharacterId={sourceCharacterId} characterNames={characterNames} assetNames={assetNames} onOpenCharacter={onOpenCharacter} onOpenAsset={onOpenAsset} /></RelationRow>
                <RelationRow label="物理位置">
                  {view.location
                    ? <button type="button" className="text-gold hover:text-gold-bright" onClick={() => onOpenLocation(view.location!.locationId)}>{locationName ?? '正在读取地点名称'}</button>
                    : '未记录具体地点'}
                </RelationRow>
                {view.asset.kind === 'item' && <RelationRow label="装备状态">{equipmentLabel}</RelationRow>}
              </section>

              {view.asset.kind !== 'item' && (
                <section className="space-y-2" aria-label="存放内容">
                  <div className="flex items-center justify-between border-b border-hairline pb-1.5">
                    <h3 className="text-[10px] font-bold tracking-[0.14em] text-gold">存放内容</h3>
                    <span className="font-mono text-[9px] text-parchment-faint">{storedAssets.length} 件</span>
                  </div>
                  {storedAssets.length > 0 ? (
                    <div className="grid gap-2">
                      {storedAssets.map((storedAsset) => (
                        <StoredItemInformation
                          key={storedAsset.id}
                          asset={storedAsset}
                          dossier={dossier}
                          sourceCharacterId={sourceCharacterId}
                          characterNames={characterNames}
                          titleNames={titleNames}
                          assetNames={assetNames}
                          onOpenCharacter={onOpenCharacter}
                          onOpenAsset={onOpenAsset}
                        />
                      ))}
                    </div>
                  ) : <p className="py-2 font-serif text-[10px] text-parchment-faint">当前没有记录存放于此的物品。</p>}
                </section>
              )}

              <section className="space-y-2">
                <div className="flex items-center justify-between border-b border-hairline pb-1.5">
                  <h3 className="text-[10px] font-bold tracking-[0.14em] text-gold">近期沿革</h3>
                  <span className="font-mono text-[9px] text-parchment-faint">{view.events.length} 条</span>
                </div>
                {view.events.length ? view.events.slice(-5).reverse().map((event) => (
                  <article key={event.id} className="border border-hairline bg-ink-2/55 px-3 py-2">
                    <div className="font-mono text-[9px] text-gold-dim">{event.date.year}.{event.date.month}.{event.date.day}</div>
                    <p className="mt-1 font-serif text-[10.5px] leading-relaxed text-parchment-dim">{event.reason}</p>
                  </article>
                )) : <p className="py-3 text-center font-serif text-[10px] italic text-parchment-faint">尚无已确认的沿革记录</p>}
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
