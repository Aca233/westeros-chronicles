import React, { useEffect, useMemo, useState } from 'react';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import type { CharacterDossier } from '../../features/characters/characterDossier';
import type { CharacterId, StaticCharacterRecord } from '../../features/characters/types';
import type { ItemImageRef } from '../../features/items/types';
import { mapRepository } from '../../features/map/repository';
import type { WorldAssetBaseline } from '../../features/world/worldBaseline';
import { GameIcon } from '../GameIcon';
import { ItemImage } from './ItemImage';

export interface WorldAssetSectionsProps {
  dossier: CharacterDossier;
  relatedRecords?: ReadonlyMap<CharacterId, StaticCharacterRecord>;
  onOpenCharacter: (characterId: CharacterId) => void;
  onOpenLocation: (locationId: string) => void;
  onOpenAsset: (assetId: string) => void;
}

export interface AssetDisplay {
  name: string;
  description: string;
  image?: ItemImageRef;
}

function assetInstanceId(assetId: string): string {
  if (assetId.startsWith('world-item:')) return assetId.slice('world-item:'.length);
  if (assetId.startsWith('item:')) return assetId.slice('item:'.length);
  return assetId.slice(assetId.indexOf(':') + 1);
}

export function getWorldAssetDisplay(
  asset: WorldAssetBaseline,
  dossier: CharacterDossier,
 ): AssetDisplay {
  const instanceId = assetInstanceId(asset.id);
  if (asset.kind === 'item') {
    const definitionId = dossier.kind === 'player'
      ? dossier.player.items.instances[instanceId]?.definitionId
      : dossier.character.items.find((item) => item.instanceId === instanceId)?.definitionId;
    const definition = ITEM_CATALOG.get(definitionId ?? asset.definitionId ?? '');
    return {
      name: definition?.name ?? '未记录名称的物品',
      description: definition?.description ?? '这件物品的详细记录尚未整理。',
      ...(definition?.image ? { image: definition.image } : {}),
    };
  }
  if (asset.kind === 'site') {
    const site = dossier.kind === 'player' ? dossier.player.items.sites[instanceId] : undefined;
    return { name: site?.name ?? '未记录名称的据点', description: site?.description ?? '与此人物有关联的固定资产。' };
  }
  const vehicle = dossier.kind === 'player' ? dossier.player.items.vehicles[instanceId] : undefined;
  return { name: vehicle?.name ?? '未记录名称的运输工具', description: vehicle?.description ?? '与此人物有关联的运输资产。' };
}

function characterPrincipal(asset: WorldAssetBaseline): CharacterId | undefined {
  for (const relation of [asset.custodian, asset.controller, asset.lawfulOwner]) {
    if (relation?.type === 'character') return relation.characterId;
  }
  return undefined;
}

function directLocationId(asset: WorldAssetBaseline): string | undefined {
  return asset.placement?.type === 'location' ? asset.placement.location.locationId : undefined;
}

function AssetCard({
  asset,
  relation,
  dossier,
  characterNames,
  locationNames,
  onOpenCharacter,
  onOpenLocation,
  onOpenAsset,
}: {
  asset: WorldAssetBaseline;
  relation: string;
  dossier: CharacterDossier;
  characterNames: ReadonlyMap<CharacterId, string>;
  locationNames: ReadonlyMap<string, string>;
  onOpenCharacter: WorldAssetSectionsProps['onOpenCharacter'];
  onOpenLocation: WorldAssetSectionsProps['onOpenLocation'];
  onOpenAsset: WorldAssetSectionsProps['onOpenAsset'];
}) {
  const display = getWorldAssetDisplay(asset, dossier);
  const relatedCharacterId = characterPrincipal(asset);
  const locationId = directLocationId(asset);
  return (
    <article className="flex min-w-0 gap-3 border border-hairline bg-ink-2/75 px-3 py-2.5" data-world-asset={asset.id}>
      <button
        type="button"
        className="h-14 w-14 shrink-0 border border-hairline bg-ink-3/80 p-1 transition-colors hover:border-gold-deep"
        onClick={() => onOpenAsset(asset.id)}
        aria-label={display.name}
      >
        {display.image
          ? <ItemImage image={display.image} alt={display.name} className="h-full w-full" />
          : <GameIcon icon={asset.kind === 'vehicle' ? 'artifact-krakenhorn' : 'artifact-crown'} className="h-full w-full" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <strong className="line-clamp-2 font-serif text-[12.5px] text-parchment">{display.name}</strong>
          <span className="shrink-0 border border-gold-deep/60 px-1.5 py-0.5 text-[9px] text-gold-dim">{relation}</span>
        </div>
        <p className="mt-1 line-clamp-2 font-serif text-[10px] leading-relaxed text-parchment-faint">{display.description}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[9px]">
          {relatedCharacterId && relatedCharacterId !== dossier.worldCharacterId && (
            <button type="button" className="btn-ghost !px-2 !py-0.5 !text-[9px]" onClick={() => onOpenCharacter(relatedCharacterId)}>{characterNames.get(relatedCharacterId) ?? '人物姓名未能解析'}</button>
          )}
          {locationId && (
            <button type="button" className="btn-ghost !px-2 !py-0.5 !text-[9px]" onClick={() => onOpenLocation(locationId)}>{locationNames.get(locationId) ?? '地点名称未能解析'}</button>
          )}
          <button type="button" className="btn-ghost !px-2 !py-0.5 !text-[9px]" onClick={() => onOpenAsset(asset.id)}>{display.name}</button>
        </div>
      </div>
    </article>
  );
}

export const WorldAssetSections: React.FC<WorldAssetSectionsProps> = ({
  dossier,
  relatedRecords = new Map(),
  onOpenCharacter,
  onOpenLocation,
  onOpenAsset,
}) => {
  const [locationNames, setLocationNames] = useState<ReadonlyMap<string, string>>(new Map());
  const characterNames = useMemo(() => new Map<CharacterId, string>([
    [dossier.worldCharacterId, dossier.name],
    ...[...relatedRecords].map(([characterId, record]) => [characterId, record.name || '人物姓名未能解析'] as const),
  ]), [dossier.name, dossier.worldCharacterId, relatedRecords]);
  const locationIds = useMemo(() => [...new Set([
    ...dossier.assetGroups.equipment,
    ...dossier.assetGroups.carried,
    ...dossier.assetGroups.custody,
    ...dossier.assetGroups.ownedElsewhere,
    ...dossier.assetGroups.controlled,
    ...dossier.assetGroups.sites,
    ...dossier.assetGroups.vehicles,
  ].flatMap((asset) => asset.placement?.type === 'location' ? [asset.placement.location.locationId] : []))], [dossier.assetGroups]);

  useEffect(() => {
    let cancelled = false;
    setLocationNames(new Map());
    if (locationIds.length > 0) {
      mapRepository.getLocations(locationIds).then((locations) => {
        if (!cancelled) setLocationNames(new Map(locations.map((location) => [location.id, location.name])));
      }).catch(() => undefined);
    }
    return () => { cancelled = true; };
  }, [locationIds]);

  const sections = useMemo(() => {
    const groups = dossier.assetGroups;
    const claimed = new Set([
      ...groups.carried,
      ...groups.custody,
      ...groups.ownedElsewhere,
      ...groups.controlled,
      ...groups.vehicles,
    ].map((asset) => asset.id));
    return [
      { id: 'carried', title: '随行物品', relation: '直接携带', assets: groups.carried },
      { id: 'custody', title: '代为保管', relation: '当前保管', assets: groups.custody },
      { id: 'owned', title: '远处名下资产', relation: '法理所有', assets: groups.ownedElsewhere },
      { id: 'controlled', title: '实际控制', relation: '实际控制', assets: groups.controlled },
      { id: 'sites', title: '其他据点', relation: '据点关联', assets: groups.sites.filter((asset) => !claimed.has(asset.id)) },
      { id: 'vehicles', title: '运输工具', relation: '运输资产', assets: groups.vehicles },
    ].filter((section) => section.assets.length > 0);
  }, [dossier.assetGroups]);

  if (sections.length === 0) {
    return <p className="py-5 text-center font-serif text-[10px] italic text-parchment-faint">当前没有能够确认关系的物品与资产。</p>;
  }

  return (
    <div className="space-y-5" data-world-asset-sections>
      {sections.map((section) => (
        <section key={section.id} className="space-y-2" data-world-asset-section={section.id}>
          <div className="flex items-center justify-between border-b border-hairline/70 pb-1.5">
            <h3 className="text-[10px] font-bold tracking-[0.14em] text-gold">{section.title}</h3>
            <span className="font-mono text-[9px] text-parchment-faint">{section.assets.length} 项</span>
          </div>
          <div className="grid gap-2">
            {section.assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                relation={section.relation}
                dossier={dossier}
                characterNames={characterNames}
                locationNames={locationNames}
                onOpenCharacter={onOpenCharacter}
                onOpenLocation={onOpenLocation}
                onOpenAsset={onOpenAsset}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
