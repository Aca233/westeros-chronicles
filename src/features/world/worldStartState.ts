import type { CharacterId } from '../../domain/characterId';
import type { ResolvedCharacter } from '../characters/types';
import { createEmptyItemSystem, createItemInstance, validateItemSystem } from '../items/state';
import type { ItemCatalog, ItemInstance, ItemPlacement, ItemSystemState } from '../items/types';
import type { LivingWorldStartState, WorldAssetStartRecord, WorldCharacterStartRecord } from '../world-content/types';
import type { CharacterWorldPatch } from './worldRuntimeTypes';

export interface StartCharacterRuntimeState {
  characters: Readonly<Record<string, CharacterWorldPatch>>;
}

export function getStartCharacterState(
  characterId: string,
  startState: { characters: readonly WorldCharacterStartRecord[] },
): WorldCharacterStartRecord | undefined {
  return startState.characters.find((record) => record.characterId === characterId);
}

/**
 * Merges the fixed 298 AC start record over the AGOT base record, then lets a
 * committed runtime patch win for every field it carries. Base-record facts
 * without a start entry or patch pass through untouched.
 */
export function projectStartCharacterFacts<T extends ResolvedCharacter>(
  character: T,
  startState: { characters: readonly WorldCharacterStartRecord[] },
  runtime: StartCharacterRuntimeState,
): T {
  const start = getStartCharacterState(character.id, startState);
  const patch = runtime.characters[character.id];
  const alive = patch?.alive ?? start?.aliveOverride ?? character.alive;
  const location = patch?.location
    ?? start?.location
    ?? (character.locationId
      ? { locationId: character.locationId, ...(character.sceneLocation ? { sceneLocation: character.sceneLocation } : {}) }
      : undefined);
  const currentActivity = patch?.currentActivity ?? start?.currentActivity ?? character.currentActivity;
  return {
    ...character,
    alive,
    ...(start?.wounds ? { wounds: [...start.wounds] } : {}),
    ...(location
      ? {
          locationId: location.locationId,
          ...(location.sceneLocation ? { sceneLocation: location.sceneLocation } : {}),
        }
      : {}),
    ...(currentActivity ? { currentActivity } : {}),
  };
}

function instanceOverrides(record: WorldAssetStartRecord): Partial<ItemInstance> {
  const overrides = record.overrides;
  if (!overrides) return {};
  return {
    ...(overrides.customName !== undefined ? { customName: overrides.customName } : {}),
    ...(overrides.charges !== undefined ? { charges: overrides.charges } : {}),
    ...(overrides.renown !== undefined ? { renown: overrides.renown } : {}),
    ...(overrides.isHeirloom !== undefined ? { isHeirloom: overrides.isHeirloom } : {}),
  };
}

function involvesCharacter(record: WorldAssetStartRecord, characterId: CharacterId): boolean {
  for (const ref of [record.lawfulOwner, record.controller, record.custodian, record.placement]) {
    if (ref?.type === 'character' && ref.characterId === characterId) return true;
  }
  return false;
}

function startAssetPlacement(record: WorldAssetStartRecord, characterId: CharacterId, requiredSites: Set<string>, requiredVehicles: Set<string>): ItemPlacement | undefined {
  if (record.placement?.type === 'character' && record.placement.characterId === characterId) {
    return record.equippedPosition
      ? { type: 'equipped', position: { ...record.equippedPosition } }
      : { type: 'carried' };
  }
  if (record.placement?.type === 'asset') {
    if (record.placement.assetId.startsWith('site:')) {
      const siteId = record.placement.assetId.slice('site:'.length);
      requiredSites.add(siteId);
      return { type: 'site', siteId };
    }
    if (record.placement.assetId.startsWith('vehicle:')) {
      const vehicleId = record.placement.assetId.slice('vehicle:'.length);
      requiredVehicles.add(vehicleId);
      return { type: 'vehicle', vehicleId };
    }
  }
  return undefined;
}

/**
 * Projects the unified world start assets into the controlled character's
 * item system: worn or carried instances plus the storage sites they occupy.
 * The world records stay authoritative; this is only the player-facing view.
 */
export function createInitialLivingWorldItems(
  characterId: CharacterId,
  startState: LivingWorldStartState,
  catalog: ItemCatalog,
): ItemSystemState {
  const state = createEmptyItemSystem();
  const requiredSites = new Set<string>();
  const requiredVehicles = new Set<string>();
  for (const record of startState.assets) {
    if (!involvesCharacter(record, characterId)) continue;
    const placement = startAssetPlacement(record, characterId, requiredSites, requiredVehicles);
    if (!placement) continue;
    state.instances[record.instanceId] = createItemInstance(
      catalog,
      record.definitionId,
      record.instanceId,
      instanceOverrides(record),
    );
    state.placements[record.instanceId] = placement;
  }
  for (const site of startState.sites) {
    if (!requiredSites.has(site.id)) continue;
    state.sites[site.id] = { ...site, location: { ...site.location } };
  }
  for (const vehicle of startState.vehicles) {
    if (!requiredVehicles.has(vehicle.id)) continue;
    state.vehicles[vehicle.id] = { ...vehicle, location: { ...vehicle.location } };
  }
  validateItemSystem(state, catalog);
  return state;
}
