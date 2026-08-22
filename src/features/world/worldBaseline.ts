import type { StaticCharacterRepository } from '../characters/staticCharacterRepository';
import type { CharacterId } from '../characters/types';
import type { EquipmentPosition, ItemPlacement, ItemSystemState } from '../items/types';
import type { WorldArtifactRecord, WorldArtifactState } from '../items/worldArtifacts';
import { isWorldArtifactAsset } from '../items/worldArtifactClassification';
import type { MapRepository } from '../map/repository';
import type { MapLocation, WorldLocationRef } from '../map/types';
import type { LivingWorldStartState } from '../world-content/types';
import { worldAssetId } from './worldAssetId';
export { worldAssetId } from './worldAssetId';
import type {
  AssetPlacement,
  WorldCustodianRef,
  WorldPrincipalRef,
} from './worldRuntimeTypes';

export interface WorldCharacterBaseline {
  id: CharacterId;
  alive: boolean;
  location: WorldLocationRef | null;
  currentActivity?: 'idle' | 'travelling' | 'imprisoned' | 'missing';
}

export interface WorldTitleBaseline {
  id: string;
  lawfulHolderId: CharacterId | null;
  controllerId: CharacterId | null;
  contestedByIds: CharacterId[];
}

export interface WorldAssetBaseline {
  id: string;
  kind: 'item' | 'site' | 'vehicle';
  definitionId?: string;
  lawfulOwner: WorldPrincipalRef | null;
  controller: WorldPrincipalRef | null;
  custodian: WorldCustodianRef | null;
  placement: AssetPlacement | null;
  equippedPosition: EquipmentPosition | null;
  status: 'normal' | 'stolen' | 'contested' | 'inheritance_pending';
}

export interface WorldBaselineSnapshot {
  characters: ReadonlyMap<CharacterId, WorldCharacterBaseline>;
  titles: ReadonlyMap<string, WorldTitleBaseline>;
  assets: ReadonlyMap<string, WorldAssetBaseline>;
  knownLocationIds: ReadonlySet<string>;
}

export interface WorldBaselineSnapshotInput {
  characters: readonly WorldCharacterBaseline[];
  titles: readonly WorldTitleBaseline[];
  assets: readonly WorldAssetBaseline[];
  knownLocationIds: readonly string[];
}

function uniqueMap<Key, Value extends { id: Key }>(
  values: readonly Value[],
  label: string,
): Map<Key, Value> {
  const result = new Map<Key, Value>();
  for (const value of values) {
    if (result.has(value.id)) throw new Error(`${label} ID 重复：${String(value.id)}`);
    result.set(value.id, value);
  }
  return result;
}

export function createWorldBaselineSnapshot(input: WorldBaselineSnapshotInput): WorldBaselineSnapshot {
  return {
    characters: uniqueMap(input.characters, '人物基线'),
    titles: uniqueMap(input.titles, '头衔基线'),
    assets: uniqueMap(input.assets, '资产基线'),
    knownLocationIds: new Set(input.knownLocationIds),
  };
}

export interface WorldBaselineRequest {
  characterIds: CharacterId[];
  titleIds: string[];
  assetIds: string[];
  locationIds: string[];
}

export interface WorldBaselineRepositoryDependencies {
  characters: Pick<StaticCharacterRepository, 'getWorldBaselineRecords' | 'findTitleHoldersByTitleIds'>;
  map: Pick<MapRepository, 'getLocations' | 'hasPoliticalTitles'>;
  loadAssets: (assetIds: readonly string[]) => Promise<WorldAssetBaseline[]>;
}

function referencedAssetIds(asset: WorldAssetBaseline): string[] {
  const ids: string[] = [];
  if (asset.placement?.type === 'asset') ids.push(asset.placement.assetId);
  if (asset.custodian?.type === 'asset') ids.push(asset.custodian.assetId);
  return ids;
}

function collectPrincipalReference(
  principal: WorldPrincipalRef | WorldCustodianRef | null,
  characterIds: Set<CharacterId>,
  titleIds: Set<string>,
): void {
  if (principal?.type === 'character') characterIds.add(principal.characterId);
  if (principal?.type === 'title') titleIds.add(principal.titleId);
}

export class WorldBaselineRepository {
  constructor(private readonly dependencies: WorldBaselineRepositoryDependencies) {}

  async loadSnapshot(request: WorldBaselineRequest): Promise<WorldBaselineSnapshot> {
    const characterIds = new Set(request.characterIds);
    const titleIds = new Set(request.titleIds);
    const locationIds = new Set(request.locationIds);
    const assetIds = new Set(request.assetIds);
    const loadedAssets = new Map<string, WorldAssetBaseline>();
    const pendingAssets = [...assetIds];

    while (pendingAssets.length > 0) {
      const batch = pendingAssets.splice(0).filter((id) => !loadedAssets.has(id));
      if (batch.length === 0) break;
      const assets = await this.dependencies.loadAssets(batch);
      for (const asset of assets) {
        if (loadedAssets.has(asset.id)) continue;
        loadedAssets.set(asset.id, asset);
        collectPrincipalReference(asset.lawfulOwner, characterIds, titleIds);
        collectPrincipalReference(asset.controller, characterIds, titleIds);
        collectPrincipalReference(asset.custodian, characterIds, titleIds);
        if (asset.placement?.type === 'character') characterIds.add(asset.placement.characterId);
        if (asset.placement?.type === 'location') locationIds.add(asset.placement.location.locationId);
        for (const referenceId of referencedAssetIds(asset)) {
          if (!loadedAssets.has(referenceId) && !pendingAssets.includes(referenceId)) pendingAssets.push(referenceId);
        }
      }
    }

    const [characterRecords, holderByTitleId, existingTitleIds, locations] = await Promise.all([
      this.dependencies.characters.getWorldBaselineRecords([...characterIds]),
      this.dependencies.characters.findTitleHoldersByTitleIds([...titleIds]),
      this.dependencies.map.hasPoliticalTitles([...titleIds]),
      this.dependencies.map.getLocations([...locationIds]),
    ]);

    const characters: WorldCharacterBaseline[] = characterRecords.map((record) => ({
      id: record.id,
      alive: record.alive,
      location: null,
    }));
    const titles: WorldTitleBaseline[] = [...titleIds]
      .filter((titleId) => existingTitleIds.has(titleId) || holderByTitleId.has(titleId))
      .map((titleId) => {
        const holderId = holderByTitleId.get(titleId) ?? null;
        return {
          id: titleId,
          lawfulHolderId: holderId,
          controllerId: holderId,
          contestedByIds: [],
        };
      });

    return createWorldBaselineSnapshot({
      characters,
      titles,
      assets: [...loadedAssets.values()],
      knownLocationIds: locations.map((location) => location.id),
    });
  }
}



export interface BuildWorldAssetBaselineInput {
  playerId: CharacterId;
  itemState: ItemSystemState;
  worldArtifacts: WorldArtifactState;
}

/**
 * Builds the single world baseline shared by every viewpoint at 298-05-10:
 * portable artifact records first, then the validated start-state assets.
 * A start instance that re-declares an artifact definition supersedes the
 * pipeline record so each unique asset keeps exactly one authority.
 */
export function createLivingWorldBaseline(
  startState: LivingWorldStartState,
  artifacts: WorldArtifactState,
): WorldBaselineSnapshotInput {
  const assets: WorldAssetBaseline[] = [];
  const supersededArtifactDefinitions = new Set<string>();
  for (const record of Object.values(artifacts.artifacts).filter(isWorldArtifactAsset)) {
    assets.push({
      id: worldAssetId.worldItem(record.instanceId),
      kind: 'item',
      definitionId: record.definitionId,
      ...worldArtifactRelations(record),
      status: 'normal',
    });
  }
  for (const site of startState.sites) {
    assets.push({
      id: worldAssetId.site(site.id),
      kind: 'site',
      lawfulOwner: null,
      controller: null,
      custodian: null,
      placement: { type: 'location', location: { ...site.location } },
      equippedPosition: null,
      status: 'normal',
    });
  }
  for (const vehicle of startState.vehicles) {
    assets.push({
      id: worldAssetId.vehicle(vehicle.id),
      kind: 'vehicle',
      lawfulOwner: null,
      controller: null,
      custodian: null,
      placement: { type: 'location', location: { ...vehicle.location } },
      equippedPosition: null,
      status: 'normal',
    });
  }
  const instanceIds = new Set<string>();
  for (const record of startState.assets) {
    if (instanceIds.has(record.instanceId)) throw new Error(`唯一资产重复：${record.instanceId}`);
    instanceIds.add(record.instanceId);
    if (record.definitionId in artifacts.artifacts) {
      const artifact = artifacts.artifacts[record.definitionId];
      const controllerId = record.controller?.type === 'character' ? record.controller.characterId : null;
      if (controllerId !== artifact.lawfulControllerId) {
        throw new Error(`唯一物品覆盖控制者不一致：${record.definitionId}`);
      }
      supersededArtifactDefinitions.add(record.definitionId);
    }
    assets.push({
      id: worldAssetId.item(record.instanceId),
      kind: record.kind,
      definitionId: record.definitionId,
      lawfulOwner: record.lawfulOwner,
      controller: record.controller,
      custodian: record.custodian,
      placement: record.placement,
      equippedPosition: record.equippedPosition,
      status: record.status,
    });
  }
  const mergedAssets = assets.filter((asset) =>
    !(asset.id.startsWith('world-item:') && asset.definitionId && supersededArtifactDefinitions.has(asset.definitionId)));
  const knownLocationIds = new Set<string>();
  for (const asset of mergedAssets) {
    if (asset.placement?.type === 'location') knownLocationIds.add(asset.placement.location.locationId);
  }
  return {
    characters: startState.characters.map((record) => ({
      id: record.characterId,
      alive: record.aliveOverride ?? true,
      location: { ...record.location },
      ...(record.currentActivity ? { currentActivity: record.currentActivity } : {}),
    })),
    titles: startState.titles.map((record) => ({
      id: record.titleId,
      lawfulHolderId: record.lawfulHolderId,
      controllerId: record.controllerId,
      contestedByIds: [...record.contestedByIds],
    })),
    assets: mergedAssets,
    knownLocationIds: [...knownLocationIds],
  };
}

function playerPrincipal(playerId: CharacterId): WorldPrincipalRef {
  return { type: 'character', characterId: playerId };
}

function mapItemPlacement(
  placement: ItemPlacement | undefined,
  playerId: CharacterId,
): { placement: AssetPlacement | null; custodian: WorldCustodianRef | null; equippedPosition: EquipmentPosition | null } {
  if (!placement || placement.type === 'lost') return { placement: null, custodian: null, equippedPosition: null };
  if (placement.type === 'carried') {
    const character = { type: 'character' as const, characterId: playerId };
    return { placement: character, custodian: character, equippedPosition: null };
  }
  if (placement.type === 'equipped') {
    const character = { type: 'character' as const, characterId: playerId };
    return { placement: character, custodian: character, equippedPosition: { ...placement.position } };
  }
  if (placement.type === 'site') {
    const asset = { type: 'asset' as const, assetId: worldAssetId.site(placement.siteId) };
    return { placement: asset, custodian: asset, equippedPosition: null };
  }
  if (placement.type === 'vehicle') {
    const asset = { type: 'asset' as const, assetId: worldAssetId.vehicle(placement.vehicleId) };
    return { placement: asset, custodian: asset, equippedPosition: null };
  }
  const characterId = placement.characterId as CharacterId;
  const character = { type: 'character' as const, characterId };
  return { placement: character, custodian: character, equippedPosition: null };
}

function worldArtifactRelations(record: WorldArtifactRecord): Pick<WorldAssetBaseline, 'lawfulOwner' | 'controller' | 'custodian' | 'placement' | 'equippedPosition'> {
  const controllerId = record.lawfulControllerId as CharacterId;
  const controller: WorldPrincipalRef = { type: 'character', characterId: controllerId };
  if (record.placement.type === 'character') {
    const characterId = record.placement.characterId as CharacterId;
    return {
      lawfulOwner: controller,
      controller,
      custodian: { type: 'character', characterId },
      placement: { type: 'character', characterId },
      equippedPosition: record.equipped && record.equippedPosition ? { ...record.equippedPosition } : null,
    };
  }
  if (record.placement.type === 'title') {
    return {
      lawfulOwner: { type: 'title', titleId: record.placement.titleId },
      controller,
      custodian: null,
      placement: null,
      equippedPosition: null,
    };
  }
  return {
    lawfulOwner: { type: 'dynasty', dynastyId: record.placement.dynastyId },
    controller,
    custodian: null,
    placement: null,
    equippedPosition: null,
  };
}

export function buildWorldAssetBaseline(input: BuildWorldAssetBaselineInput): WorldAssetBaseline[] {
  const owner = playerPrincipal(input.playerId);
  const assets: WorldAssetBaseline[] = [];
  for (const site of Object.values(input.itemState.sites)) {
    assets.push({
      id: worldAssetId.site(site.id),
      kind: 'site',
      lawfulOwner: owner,
      controller: owner,
      custodian: null,
      placement: { type: 'location', location: { ...site.location } },
      equippedPosition: null,
      status: 'normal',
    });
  }
  for (const vehicle of Object.values(input.itemState.vehicles)) {
    assets.push({
      id: worldAssetId.vehicle(vehicle.id),
      kind: 'vehicle',
      lawfulOwner: owner,
      controller: owner,
      custodian: null,
      placement: { type: 'location', location: { ...vehicle.location } },
      equippedPosition: null,
      status: 'normal',
    });
  }
  for (const instance of Object.values(input.itemState.instances)) {
    const relations = mapItemPlacement(input.itemState.placements[instance.instanceId], input.playerId);
    assets.push({
      id: worldAssetId.item(instance.instanceId),
      kind: 'item',
      definitionId: instance.definitionId,
      lawfulOwner: owner,
      controller: owner,
      ...relations,
      status: 'normal',
    });
  }
  for (const record of Object.values(input.worldArtifacts.artifacts).filter(isWorldArtifactAsset)) {
    assets.push({
      id: worldAssetId.worldItem(record.instanceId),
      kind: 'item',
      definitionId: record.definitionId,
      ...worldArtifactRelations(record),
      status: 'normal',
    });
  }
  return assets;
}

const MAP_SITE_TYPES = new Set<MapLocation['type']>(['castle', 'city', 'village']);

function mapLocationSiteAsset(location: MapLocation): WorldAssetBaseline | undefined {
  if (!MAP_SITE_TYPES.has(location.type)) return undefined;
  return {
    id: worldAssetId.site(location.id),
    kind: 'site',
    lawfulOwner: null,
    controller: null,
    custodian: null,
    placement: { type: 'location', location: { locationId: location.id } },
    equippedPosition: null,
    status: 'normal',
  };
}

export type PlayerItemAssetSource = Pick<BuildWorldAssetBaselineInput, 'playerId' | 'itemState'>;

export function createWorldAssetBaselineLoader(
  getItemState: () => PlayerItemAssetSource,
  getWorldArtifacts: () => WorldArtifactState,
  map: Pick<MapRepository, 'getLocation'>,
): (assetIds: readonly string[]) => Promise<WorldAssetBaseline[]> {
  let cachedItems: ItemSystemState | undefined;
  let cachedArtifacts: WorldArtifactState | undefined;
  let cachedPlayerId: CharacterId | undefined;
  let indexed = new Map<string, WorldAssetBaseline>();
  const mapSites = new Map<string, WorldAssetBaseline | null>();

  const refresh = (): void => {
    const itemSource = getItemState();
    const artifacts = getWorldArtifacts();
    if (cachedItems === itemSource.itemState && cachedArtifacts === artifacts && cachedPlayerId === itemSource.playerId) return;
    cachedItems = itemSource.itemState;
    cachedArtifacts = artifacts;
    cachedPlayerId = itemSource.playerId;
    indexed = new Map(buildWorldAssetBaseline({ ...itemSource, worldArtifacts: artifacts }).map((asset) => [asset.id, asset]));
  };

  const loadOne = async (assetId: string): Promise<WorldAssetBaseline | undefined> => {
    const existing = indexed.get(assetId);
    if (existing) return existing;
    if (!assetId.startsWith('site:b_')) return undefined;
    if (!mapSites.has(assetId)) {
      const location = await map.getLocation(assetId.slice('site:'.length));
      mapSites.set(assetId, mapLocationSiteAsset(location) ?? null);
    }
    return mapSites.get(assetId) ?? undefined;
  };

  return async (assetIds: readonly string[]): Promise<WorldAssetBaseline[]> => {
    refresh();
    const result = new Map<string, WorldAssetBaseline>();
    const pending = [...new Set(assetIds)];
    while (pending.length > 0) {
      const assetId = pending.shift()!;
      if (result.has(assetId)) continue;
      const asset = await loadOne(assetId);
      if (!asset) continue;
      result.set(asset.id, asset);
      if (asset.placement?.type === 'asset' && !result.has(asset.placement.assetId)) pending.push(asset.placement.assetId);
      if (asset.custodian?.type === 'asset' && !result.has(asset.custodian.assetId)) pending.push(asset.custodian.assetId);
    }
    return [...result.values()];
  };
}
