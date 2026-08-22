import { useCallback, useEffect, useMemo, useState } from 'react';
import { CANONICAL_TIMELINE } from '../../data/generated/canonicalTimeline';
import { useGameStore } from '../../store/useGameStore';
import { DexieCharacterEventStore } from './characterEventStore';
import {
  attachCharacterWorldView,
  characterDatasetYear,
  createNpcDossier,
  createPlayerDossier,
  relatedCharacterIds,
  type CharacterDossier,
} from './characterDossier';
import { resolveCharacter } from './characterProjector';
import { projectRelationshipRecords } from './characterRelationshipProjection';
import { StaticCharacterRepository } from './staticCharacterRepository';
import type { CharacterId, CharacterItemRecord, StaticCharacterRecord } from './types';
import {
  buildWorldAssetBaseline,
  createWorldBaselineSnapshot,
  worldAssetId,
  type WorldAssetBaseline,
} from '../world/worldBaseline';
import { selectCharacterWorldView } from '../world/worldSelectors';
import type { WorldRuntimeState } from '../world/worldRuntimeTypes';
import type { WorldArtifactState } from '../items/worldArtifacts';
import type { LordProfile } from '../../types/game';
import { mapRepository } from '../map/repository';
import { worldContentRepository } from '../world-content/repository';
import { characterWorldLocationLabel, projectResolvedCharacterWorldFacts } from '../world/characterWorldFacts';

const dossierRepository = new StaticCharacterRepository();
export const dossierEventStore = new DexieCharacterEventStore();

function characterItemAsset(item: CharacterItemRecord): WorldAssetBaseline {
  const lawfulOwner = { type: 'character' as const, characterId: item.ownerId };
  const custody = item.custody.type === 'character'
    ? { type: 'character' as const, characterId: item.custody.characterId }
    : { type: 'asset' as const, assetId: worldAssetId.site(item.custody.siteId) };
  return {
    id: worldAssetId.item(item.instanceId),
    kind: 'item',
    definitionId: item.definitionId,
    lawfulOwner,
    controller: lawfulOwner,
    custodian: custody,
    placement: custody,
    equippedPosition: item.equippedPosition ? { ...item.equippedPosition } : null,
    status: 'normal',
  };
}

function playerCharacterId(lord: LordProfile, runId: string | undefined): CharacterId {
  return lord.canonicalCharacterId ?? `save:${runId ?? 'current'}:player`;
}

function attachCurrentWorld(
  dossier: CharacterDossier,
  lord: LordProfile,
  playerId: CharacterId,
  worldArtifacts: WorldArtifactState,
  runtime: WorldRuntimeState,
): CharacterDossier {
  const characters = new Map<CharacterId, {
    id: CharacterId;
    alive: boolean;
    location: CharacterDossier['worldLocation'];
    currentActivity?: CharacterDossier['worldActivity'];
  }>();
  characters.set(playerId, {
    id: playerId,
    alive: lord.overallStatus !== '阵亡',
    location: { ...lord.location },
    currentActivity: 'idle',
  });
  if (dossier.kind === 'npc') {
    characters.set(dossier.id, {
      id: dossier.id,
      alive: dossier.alive,
      location: dossier.worldLocation ? { ...dossier.worldLocation } : null,
      currentActivity: dossier.worldActivity,
    });
  }
  for (const [id, patch] of Object.entries(runtime.characters) as Array<[CharacterId, WorldRuntimeState['characters'][CharacterId]]>) {
    if (!characters.has(id)) {
      characters.set(id, {
        id,
        alive: patch.alive ?? true,
        location: patch.location ? { ...patch.location } : null,
        ...(patch.currentActivity ? { currentActivity: patch.currentActivity } : {}),
      });
    }
  }

  const assets = new Map(buildWorldAssetBaseline({
    playerId,
    itemState: lord.items,
    worldArtifacts,
  }).map((asset) => [asset.id, asset]));
  if (dossier.kind === 'npc') {
    for (const item of dossier.character.items) assets.set(worldAssetId.item(item.instanceId), characterItemAsset(item));
  }
  for (const asset of assets.values()) {
    for (const principal of [asset.lawfulOwner, asset.controller, asset.custodian]) {
      if (principal?.type === 'character' && !characters.has(principal.characterId)) {
        characters.set(principal.characterId, { id: principal.characterId, alive: true, location: null });
      }
    }
    if (asset.placement?.type === 'character' && !characters.has(asset.placement.characterId)) {
      characters.set(asset.placement.characterId, { id: asset.placement.characterId, alive: true, location: null });
    }
  }

  const titles = new Map<string, {
    id: string;
    lawfulHolderId: CharacterId | null;
    controllerId: CharacterId | null;
    contestedByIds: CharacterId[];
  }>();
  if (dossier.kind === 'npc') {
    for (const titleId of dossier.character.titleIds) {
      titles.set(titleId, { id: titleId, lawfulHolderId: dossier.id, controllerId: dossier.id, contestedByIds: [] });
    }
  }
  for (const [titleId, patch] of Object.entries(runtime.titles)) {
    if (!titles.has(titleId)) {
      titles.set(titleId, {
        id: titleId,
        lawfulHolderId: patch.lawfulHolderId ?? null,
        controllerId: patch.controllerId ?? null,
        contestedByIds: [...(patch.contestedByIds ?? [])],
      });
    }
  }

  const knownLocationIds = new Set<string>([lord.location.locationId]);
  for (const character of characters.values()) if (character.location) knownLocationIds.add(character.location.locationId);
  for (const asset of assets.values()) {
    if (asset.placement?.type === 'location') knownLocationIds.add(asset.placement.location.locationId);
  }
  const baseline = createWorldBaselineSnapshot({
    characters: [...characters.values()],
    titles: [...titles.values()],
    assets: [...assets.values()],
    knownLocationIds: [...knownLocationIds],
  });
  return attachCharacterWorldView(dossier, selectCharacterWorldView(dossier.worldCharacterId, { baseline, runtime }));
}

export type CharacterDossierLoadStatus = 'ready' | 'loading' | 'error';

export interface CharacterDossierLoadResult {
  dossier: CharacterDossier | null;
  relatedRecords: ReadonlyMap<CharacterId, StaticCharacterRecord>;
  status: CharacterDossierLoadStatus;
  error: string | null;
  reload: () => void;
}

export function useCharacterDossier(selectedCharacterId: CharacterId | null): CharacterDossierLoadResult {
  const { lord, currentYear, worldCharacters, worldArtifacts, worldHistory, worldRuntime } = useGameStore((state) => state.gameState);
  const playerId = playerCharacterId(lord, worldCharacters?.runId);
  const playerDossier = useMemo(() => createPlayerDossier(lord, currentYear, playerId), [lord, currentYear, playerId]);
  const [dossier, setDossier] = useState<CharacterDossier | null>(selectedCharacterId ? null : playerDossier);
  const [relatedRecords, setRelatedRecords] = useState<ReadonlyMap<CharacterId, StaticCharacterRecord>>(new Map());
  const [status, setStatus] = useState<CharacterDossierLoadStatus>(selectedCharacterId ? 'loading' : 'ready');
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    if (!selectedCharacterId) {
      setDossier(playerDossier);
      setRelatedRecords(new Map());
      setStatus('ready');
      setError(null);
      return;
    }

    let cancelled = false;
    setDossier(null);
    setRelatedRecords(new Map());
    setStatus('loading');
    setError(null);

    const load = async () => {
      const record = await dossierRepository.get(selectedCharacterId);
      if (!record) throw new Error('没有找到这个人物的稳定 AGOT 档案');
      const [events, kinship, loadoutProfile, mapLocations, startCharacters] = await Promise.all([
        worldCharacters
          ? dossierEventStore.eventsForCharacter(worldCharacters.runId, selectedCharacterId)
          : Promise.resolve([]),
        dossierRepository.getKinship(selectedCharacterId),
        dossierRepository.getLoadoutProfile(selectedCharacterId),
        mapRepository.loadSearchIndex().catch(() => []),
        worldContentRepository.loadStartState()
          .then((startState) => startState.characters)
          .catch(() => []),
      ]);
      const resolved = projectResolvedCharacterWorldFacts(resolveCharacter(record, events, {
        datasetVersion: worldCharacters?.datasetHash ?? 'agot-local-dataset',
        currentYear: characterDatasetYear(currentYear, record.birthDate),
        loadoutProfile,
      }), {
        history: worldHistory,
        runtime: worldRuntime,
        timeline: CANONICAL_TIMELINE,
        mapLocations,
        startCharacters,
      });
      const nextDossier = {
        ...createNpcDossier(resolved, currentYear, kinship),
        location: characterWorldLocationLabel(resolved, mapLocations),
      };
      const relatives = await dossierRepository.getMany(relatedCharacterIds(nextDossier));
      const projectedRelatives = await projectRelationshipRecords(
        relatives,
        (characterId) => worldCharacters
          ? dossierEventStore.eventsForCharacter(worldCharacters.runId, characterId)
          : Promise.resolve([]),
        {
          history: worldHistory,
          runtime: worldRuntime,
          timeline: CANONICAL_TIMELINE,
          startCharacters,
        },
      );
      if (cancelled) return;
      setDossier(nextDossier);
      setRelatedRecords(projectedRelatives);
      setStatus('ready');
    };

    load().catch((reason: unknown) => {
      if (cancelled) return;
      setDossier(null);
      setRelatedRecords(new Map());
      setStatus('error');
      setError(reason instanceof Error ? reason.message : '人物档案读取失败');
    });

    return () => { cancelled = true; };
  }, [selectedCharacterId, playerDossier, currentYear, worldCharacters?.runId, worldCharacters?.datasetHash, worldCharacters?.revision, worldRuntime.revision, worldHistory, reloadToken]);

  const projectedDossier = useMemo(
    () => dossier ? attachCurrentWorld(dossier, lord, playerId, worldArtifacts, worldRuntime) : null,
    [dossier, lord, playerId, worldArtifacts, worldRuntime],
  );

  return { dossier: projectedDossier, relatedRecords, status, error, reload };
}

export { dossierRepository };
