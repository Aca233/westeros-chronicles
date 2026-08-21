import type { CharacterId } from '../characters/types';
import type { WorldLocationRef } from '../map/types';
import type { WorldAssetBaseline, WorldBaselineSnapshot, WorldCharacterBaseline } from './worldBaseline';
import { buildWorldEventIndex, eventsForAsset, eventsForCharacter, type WorldEventIndex } from './worldEventIndex';
import {
  projectWorldAsset,
  projectWorldCharacter,
  projectWorldTitle,
  resolveAssetMapLocation,
} from './worldProjection';
import type { WorldEvent, WorldPrincipalRef, WorldRuntimeState } from './worldRuntimeTypes';

export interface WorldSelectorContext {
  baseline: WorldBaselineSnapshot;
  runtime: WorldRuntimeState;
  eventIndex?: WorldEventIndex;
  countyIdByLocationId?: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
  candidateCharacterIds?: ReadonlySet<CharacterId>;
}

export interface CharacterAssetGroups {
  equipment: readonly WorldAssetBaseline[];
  carried: readonly WorldAssetBaseline[];
  custody: readonly WorldAssetBaseline[];
  ownedElsewhere: readonly WorldAssetBaseline[];
  controlled: readonly WorldAssetBaseline[];
  sites: readonly WorldAssetBaseline[];
  vehicles: readonly WorldAssetBaseline[];
}

export const EMPTY_CHARACTER_ASSET_GROUPS: CharacterAssetGroups = Object.freeze({
  equipment: Object.freeze([]),
  carried: Object.freeze([]),
  custody: Object.freeze([]),
  ownedElsewhere: Object.freeze([]),
  controlled: Object.freeze([]),
  sites: Object.freeze([]),
  vehicles: Object.freeze([]),
});

export interface CharacterWorldView {
  character: WorldCharacterBaseline;
  location: WorldLocationRef | null;
  activity: WorldCharacterBaseline['currentActivity'];
  titleIds: readonly string[];
  assetGroups: CharacterAssetGroups;
  events: readonly WorldEvent[];
}

export interface WorldAssetView {
  asset: WorldAssetBaseline;
  location: WorldLocationRef | null;
  events: readonly WorldEvent[];
}

export interface CountyWorldView {
  countyId: string;
  lawfulHolderId: CharacterId | null;
  controllerId: CharacterId | null;
  isContested: boolean;
  contestedByIds: readonly CharacterId[];
  characterIds: readonly CharacterId[];
  siteAssetIds: readonly string[];
  vehicleAssetIds: readonly string[];
  itemAssetIds: readonly string[];
  eventIds: readonly string[];
  events: readonly WorldEvent[];
}

type RuntimeCharacterCache = Map<string, CharacterWorldView>;
type RuntimeAssetCache = Map<string, WorldAssetView | null>;
const characterCache = new WeakMap<WorldBaselineSnapshot, WeakMap<WorldRuntimeState, RuntimeCharacterCache>>();
const assetCache = new WeakMap<WorldBaselineSnapshot, WeakMap<WorldRuntimeState, RuntimeAssetCache>>();
const countyCache = new WeakMap<WorldBaselineSnapshot, WeakMap<WorldRuntimeState, Map<string, CountyWorldView>>>();

function runtimeCache<Value>(
  root: WeakMap<WorldBaselineSnapshot, WeakMap<WorldRuntimeState, Map<string, Value>>>,
  context: WorldSelectorContext,
): Map<string, Value> {
  let byRuntime = root.get(context.baseline);
  if (!byRuntime) {
    byRuntime = new WeakMap();
    root.set(context.baseline, byRuntime);
  }
  let values = byRuntime.get(context.runtime);
  if (!values) {
    values = new Map();
    byRuntime.set(context.runtime, values);
  }
  return values;
}

function immutableSorted<T extends { id: string }>(values: Iterable<T>): readonly T[] {
  return Object.freeze([...values].sort((left, right) => left.id.localeCompare(right.id)));
}

function immutableEvents(events: Iterable<WorldEvent>): readonly WorldEvent[] {
  return Object.freeze([...events]);
}

function principalIsCharacter(principal: WorldPrincipalRef | null, characterId: CharacterId): boolean {
  return principal?.type === 'character' && principal.characterId === characterId;
}

function directlyHeldBy(asset: WorldAssetBaseline, characterId: CharacterId): boolean {
  return asset.placement?.type === 'character'
    && asset.placement.characterId === characterId
    && asset.custodian?.type === 'character'
    && asset.custodian.characterId === characterId;
}

function relatedToCharacter(asset: WorldAssetBaseline, characterId: CharacterId): boolean {
  return principalIsCharacter(asset.lawfulOwner, characterId)
    || principalIsCharacter(asset.controller, characterId)
    || (asset.custodian?.type === 'character' && asset.custodian.characterId === characterId)
    || (asset.placement?.type === 'character' && asset.placement.characterId === characterId);
}

function projectedAssets(context: WorldSelectorContext): WorldAssetBaseline[] {
  const ids = new Set([...context.baseline.assets.keys(), ...Object.keys(context.runtime.assets)]);
  return [...ids].flatMap((assetId) => {
    const asset = projectWorldAsset(context.baseline, context.runtime, assetId);
    return asset ? [asset] : [];
  });
}

function buildCharacterAssetGroups(characterId: CharacterId, context: WorldSelectorContext): CharacterAssetGroups {
  const equipment: WorldAssetBaseline[] = [];
  const carried: WorldAssetBaseline[] = [];
  const custody: WorldAssetBaseline[] = [];
  const ownedElsewhere: WorldAssetBaseline[] = [];
  const controlled: WorldAssetBaseline[] = [];
  const sites: WorldAssetBaseline[] = [];
  const vehicles: WorldAssetBaseline[] = [];

  for (const asset of projectedAssets(context)) {
    const directlyHeld = directlyHeldBy(asset, characterId);
    const equipped = asset.kind === 'item' && directlyHeld && Boolean(asset.equippedPosition);
    const carriedByCharacter = asset.kind === 'item' && directlyHeld && !asset.equippedPosition;
    const related = relatedToCharacter(asset, characterId);

    if (equipped) equipment.push(asset);
    else if (carriedByCharacter) carried.push(asset);
    else if (asset.custodian?.type === 'character' && asset.custodian.characterId === characterId) custody.push(asset);

    if (asset.kind === 'vehicle' && related) vehicles.push(asset);
    if (asset.kind === 'site' && related) sites.push(asset);

    if (asset.kind !== 'vehicle'
      && principalIsCharacter(asset.lawfulOwner, characterId)
      && !equipped
      && !carriedByCharacter
      && !(asset.custodian?.type === 'character' && asset.custodian.characterId === characterId)) {
      ownedElsewhere.push(asset);
    }
    if (asset.kind !== 'vehicle'
      && principalIsCharacter(asset.controller, characterId)
      && !principalIsCharacter(asset.lawfulOwner, characterId)
      && !equipped
      && !carriedByCharacter) {
      controlled.push(asset);
    }
  }

  return Object.freeze({
    equipment: immutableSorted(equipment),
    carried: immutableSorted(carried),
    custody: immutableSorted(custody),
    ownedElsewhere: immutableSorted(ownedElsewhere),
    controlled: immutableSorted(controlled),
    sites: immutableSorted(sites),
    vehicles: immutableSorted(vehicles),
  });
}

function eventIndex(context: WorldSelectorContext): WorldEventIndex {
  return context.eventIndex ?? buildWorldEventIndex(context.runtime.events);
}

export function selectCharacterWorldView(
  characterId: CharacterId,
  context: WorldSelectorContext,
): CharacterWorldView {
  const cache = runtimeCache(characterCache, context);
  const key = `${context.runtime.revision}:${characterId}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const character = projectWorldCharacter(context.baseline, context.runtime, characterId);
  if (!character) throw new Error(`人物不存在：${characterId}`);
  const titleIds = immutableSorted(
    [...new Set([...context.baseline.titles.keys(), ...Object.keys(context.runtime.titles)])]
      .flatMap((titleId) => {
        const title = projectWorldTitle(context.baseline, context.runtime, titleId);
        return title?.lawfulHolderId === characterId ? [{ id: titleId }] : [];
      }),
  ).map((entry) => entry.id);
  const view: CharacterWorldView = Object.freeze({
    character,
    location: character.location ? Object.freeze({ ...character.location }) : null,
    activity: character.currentActivity,
    titleIds: Object.freeze(titleIds),
    assetGroups: buildCharacterAssetGroups(characterId, context),
    events: immutableEvents(eventsForCharacter(context.runtime.events, eventIndex(context), characterId)),
  });
  cache.set(key, view);
  return view;
}

export function selectCharacterAssetGroups(
  characterId: CharacterId,
  context: WorldSelectorContext,
): CharacterAssetGroups {
  return selectCharacterWorldView(characterId, context).assetGroups;
}

export function selectActualEquipment(
  characterId: CharacterId,
  context: WorldSelectorContext,
): readonly WorldAssetBaseline[] {
  return selectCharacterAssetGroups(characterId, context).equipment;
}

export function selectWorldAssetView(
  assetId: string,
  context: WorldSelectorContext,
): WorldAssetView | null {
  const cache = runtimeCache(assetCache, context);
  const key = `${context.runtime.revision}:${assetId}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const asset = projectWorldAsset(context.baseline, context.runtime, assetId);
  if (!asset) {
    cache.set(key, null);
    return null;
  }
  const location = resolveAssetMapLocation(context.baseline, context.runtime, assetId);
  const view: WorldAssetView = Object.freeze({
    asset,
    location: location ? Object.freeze({ ...location }) : null,
    events: immutableEvents(eventsForAsset(context.runtime.events, eventIndex(context), assetId)),
  });
  cache.set(key, view);
  return view;
}

function countyForLocation(locationId: string, context: WorldSelectorContext): string | undefined {
  const index = context.countyIdByLocationId;
  if (!index) return undefined;
  const get = (index as ReadonlyMap<string, string>).get;
  return typeof get === 'function'
    ? get.call(index, locationId)
    : (index as Readonly<Record<string, string>>)[locationId];
}

function belongsToCounty(location: WorldLocationRef | null, countyId: string, context: WorldSelectorContext): boolean {
  return Boolean(location && (location.locationId === countyId || countyForLocation(location.locationId, context) === countyId));
}

export function selectCountyWorldView(
  countyId: string,
  context: WorldSelectorContext,
): CountyWorldView {
  const cache = runtimeCache(countyCache, context);
  const key = `${context.runtime.revision}:${countyId}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const title = projectWorldTitle(context.baseline, context.runtime, countyId);
  const candidateIds = context.candidateCharacterIds
    ?? new Set([...context.baseline.characters.keys(), ...Object.keys(context.runtime.characters) as CharacterId[]]);
  const locatedCharacterIds = [...candidateIds].flatMap((characterId) => {
    const character = projectWorldCharacter(context.baseline, context.runtime, characterId);
    return character?.alive && belongsToCounty(character.location, countyId, context) ? [characterId] : [];
  });
  const locatedSet = new Set(locatedCharacterIds);
  const characterIds = [
    ...(title?.lawfulHolderId && locatedSet.delete(title.lawfulHolderId) ? [title.lawfulHolderId] : []),
    ...(title?.controllerId && locatedSet.delete(title.controllerId) ? [title.controllerId] : []),
    ...[...locatedSet].sort(),
  ];

  const siteAssetIds: string[] = [];
  const vehicleAssetIds: string[] = [];
  const itemAssetIds: string[] = [];
  const index = eventIndex(context);
  for (const asset of projectedAssets(context)) {
    const location = resolveAssetMapLocation(context.baseline, context.runtime, asset.id);
    if (!belongsToCounty(location, countyId, context)) continue;
    if (asset.kind === 'site') siteAssetIds.push(asset.id);
    else if (asset.kind === 'vehicle') vehicleAssetIds.push(asset.id);
    else if (asset.status !== 'normal'
      || Boolean(context.runtime.assets[asset.id])
      || asset.lawfulOwner?.type === 'title'
      || asset.lawfulOwner?.type === 'dynasty'
      || (index.byAssetId.get(asset.id)?.length ?? 0) > 0) itemAssetIds.push(asset.id);
  }

  const characterSet = new Set(characterIds);
  const assetSet = new Set([...siteAssetIds, ...vehicleAssetIds, ...itemAssetIds]);
  const events = context.runtime.events.filter((event) => {
    if (event.location && belongsToCounty(event.location, countyId, context)) return true;
    return event.subjectRefs.some((subject) => {
      if (subject.type === 'title') return subject.titleId === countyId;
      if (subject.type === 'location') return belongsToCounty(subject.location, countyId, context);
      if (subject.type === 'character') return characterSet.has(subject.characterId);
      return subject.type === 'asset' && assetSet.has(subject.assetId);
    });
  });
  const contestedByIds = Object.freeze([...(title?.contestedByIds ?? [])].sort());
  const frozenCharacterIds = Object.freeze([...characterIds]);
  const frozenSiteIds = Object.freeze([...siteAssetIds].sort());
  const frozenVehicleIds = Object.freeze([...vehicleAssetIds].sort());
  const frozenItemIds = Object.freeze([...itemAssetIds].sort());
  const frozenEvents = immutableEvents(events);
  const view: CountyWorldView = Object.freeze({
    countyId,
    lawfulHolderId: title?.lawfulHolderId ?? null,
    controllerId: title?.controllerId ?? null,
    isContested: contestedByIds.length > 0 || Boolean(title?.lawfulHolderId && title.controllerId && title.lawfulHolderId !== title.controllerId),
    contestedByIds,
    characterIds: frozenCharacterIds,
    siteAssetIds: frozenSiteIds,
    vehicleAssetIds: frozenVehicleIds,
    itemAssetIds: frozenItemIds,
    eventIds: Object.freeze(frozenEvents.map((event) => event.id)),
    events: frozenEvents,
  });
  cache.set(key, view);
  return view;
}
