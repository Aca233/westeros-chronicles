import type { CharacterId } from '../characters/types';
import type { WorldLocationRef } from '../map/types';
import type {
  WorldAssetBaseline,
  WorldBaselineSnapshot,
  WorldCharacterBaseline,
  WorldTitleBaseline,
} from './worldBaseline';
import type { WorldRuntimeState } from './worldRuntimeTypes';

const hasOwn = (value: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(value, key);

export function projectWorldCharacter(
  baseline: WorldBaselineSnapshot,
  runtime: WorldRuntimeState,
  characterId: CharacterId,
): WorldCharacterBaseline | undefined {
  const base = baseline.characters.get(characterId);
  const patch = runtime.characters[characterId];
  if (!base && !patch) return undefined;
  return {
    id: characterId,
    alive: patch && hasOwn(patch, 'alive') ? patch.alive as boolean : (base?.alive ?? true),
    location: patch && hasOwn(patch, 'location') ? patch.location ?? null : (base?.location ?? null),
    ...(patch && hasOwn(patch, 'currentActivity')
      ? { currentActivity: patch.currentActivity }
      : base?.currentActivity
        ? { currentActivity: base.currentActivity }
        : {}),
  };
}

export function projectWorldTitle(
  baseline: WorldBaselineSnapshot,
  runtime: WorldRuntimeState,
  titleId: string,
): WorldTitleBaseline | undefined {
  const base = baseline.titles.get(titleId);
  const patch = runtime.titles[titleId];
  if (!base && !patch) return undefined;
  return {
    id: titleId,
    lawfulHolderId: patch && hasOwn(patch, 'lawfulHolderId') ? patch.lawfulHolderId ?? null : (base?.lawfulHolderId ?? null),
    controllerId: patch && hasOwn(patch, 'controllerId') ? patch.controllerId ?? null : (base?.controllerId ?? null),
    contestedByIds: patch && hasOwn(patch, 'contestedByIds') ? [...(patch.contestedByIds ?? [])] : [...(base?.contestedByIds ?? [])],
  };
}

export function projectWorldAsset(
  baseline: WorldBaselineSnapshot,
  runtime: WorldRuntimeState,
  assetId: string,
): WorldAssetBaseline | undefined {
  const base = baseline.assets.get(assetId);
  const patch = runtime.assets[assetId];
  if (!base && !patch) return undefined;
  return {
    id: assetId,
    kind: patch?.kind ?? base!.kind,
    ...(base?.definitionId ? { definitionId: base.definitionId } : {}),
    lawfulOwner: patch && hasOwn(patch, 'lawfulOwner') ? patch.lawfulOwner ?? null : (base?.lawfulOwner ?? null),
    controller: patch && hasOwn(patch, 'controller') ? patch.controller ?? null : (base?.controller ?? null),
    custodian: patch && hasOwn(patch, 'custodian') ? patch.custodian ?? null : (base?.custodian ?? null),
    placement: patch && hasOwn(patch, 'placement') ? patch.placement ?? null : (base?.placement ?? null),
    equippedPosition: patch && hasOwn(patch, 'equippedPosition') ? patch.equippedPosition ?? null : (base?.equippedPosition ?? null),
    status: patch && hasOwn(patch, 'status') ? patch.status! : (base?.status ?? 'normal'),
  };
}

export function resolveAssetMapLocation(
  baseline: WorldBaselineSnapshot,
  runtime: WorldRuntimeState,
  assetId: string,
): WorldLocationRef | null {
  const visited = new Set<string>();

  const resolve = (currentAssetId: string): WorldLocationRef | null => {
    if (visited.has(currentAssetId)) {
      throw new Error(`资产容器形成循环：${[...visited, currentAssetId].join(' -> ')}`);
    }
    visited.add(currentAssetId);
    const asset = projectWorldAsset(baseline, runtime, currentAssetId);
    if (!asset?.placement) return null;
    if (asset.placement.type === 'location') return { ...asset.placement.location };
    if (asset.placement.type === 'character') {
      const character = projectWorldCharacter(baseline, runtime, asset.placement.characterId);
      return character?.location ? { ...character.location } : null;
    }
    return resolve(asset.placement.assetId);
  };

  return resolve(assetId);
}
