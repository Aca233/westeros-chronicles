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
import type { CharacterId, CharacterItemRecord, ResolvedCharacter, StaticCharacterRecord } from './types';
import type { CustomCharacterOverlayState, CustomCharacterRuntimeRecord } from './customCharacterStart';
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
import { preloadNpcLoadoutContent } from '../items/npcLoadoutContent';
import { mapRepository } from '../map/repository';
import { worldContentRepository } from '../world-content/repository';
import type { CharacterContentRecord, WorldTerminology } from '../world-content/types';
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

function resolveCustomCharacter(
  record: CustomCharacterRuntimeRecord,
  overlay: CustomCharacterOverlayState,
): ResolvedCharacter {
  const relationFacts = overlay.relationships.filter((fact) => fact.participantIds.includes(record.id));
  return {
    id: record.id,
    rawId: record.id,
    canonTier: 'mod_supporting',
    name: record.name,
    dynastyId: record.dynastyName ? `save_${record.dynastyName}` : null,
    cultureId: record.culture,
    faithId: record.faith,
    female: record.gender === '女',
    born: true,
    alive: true,
    birthDate: `${record.birthYear}.1.1`,
    baseAttributes: { ...record.attributes },
    traits: [...record.traitIds],
    spouseIds: [],
    relations: relationFacts.flatMap((fact) => fact.participantIds
      .filter((id) => id !== record.id)
      .map((targetId) => ({ kind: fact.kind, target_id: targetId }))),
    titleIds: [],
    titles: [],
    hasDna: false,
    source: { file: 'save:custom-character-overlay', line: 0 },
    attributes: { ...record.attributes },
    locationId: record.location.locationId,
    ...(record.location.sceneLocation ? { sceneLocation: record.location.sceneLocation } : {}),
    currentActivity: 'idle',
    wounds: [],
    woundLevels: {},
    relationships: [],
    memories: [],
    knowledge: [],
    items: [],
  };
}

function attachCustomRelationshipFacts(
  dossier: CharacterDossier,
  overlay: CustomCharacterOverlayState | undefined,
  viewerId: CharacterId,
): CharacterDossier {
  if (!overlay) return dossier;
  const subjectId = dossier.worldCharacterId;
  const additions = overlay.relationships
    .filter((fact) => fact.participantIds.includes(subjectId) && (fact.publiclyKnown || fact.heardByIds.includes(viewerId)))
    .flatMap((fact) => fact.participantIds
      .filter((targetId) => targetId !== subjectId)
      .map((targetId) => ({ kind: fact.kind, targetId, description: fact.summary })));
  if (additions.length === 0) return dossier;
  const seen = new Set(dossier.relations.notableRelations.map((entry) => `${entry.kind}:${entry.targetId}`));
  const notableRelations = [...dossier.relations.notableRelations];
  for (const addition of additions) {
    const key = `${addition.kind}:${addition.targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    notableRelations.push(addition);
  }
  return { ...dossier, relations: { ...dossier.relations, notableRelations } };
}

async function loadRelatedRecordsIncludingOverlay(
  dossier: CharacterDossier,
  overlay: CustomCharacterOverlayState | undefined,
): Promise<ReadonlyMap<CharacterId, StaticCharacterRecord>> {
  const ids = relatedCharacterIds(dossier);
  const staticIds = ids.filter((id) => !overlay?.records[id]);
  const staticRecords = staticIds.length ? await dossierRepository.getMany(staticIds) : [];
  const records = new Map<CharacterId, StaticCharacterRecord>(staticRecords.map((record) => [record.id, record]));
  if (overlay) {
    for (const id of ids) {
      const custom = overlay.records[id];
      if (custom) records.set(id, resolveCustomCharacter(custom, overlay));
    }
  }
  return records;
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
  const { lord, currentYear, worldCharacters, worldArtifacts, worldHistory, worldRuntime, customCharacters } = useGameStore((state) => state.gameState);
  const playerId = playerCharacterId(lord, worldCharacters?.runId);
  const [playerContent, setPlayerContent] = useState<CharacterContentRecord | undefined>(undefined);
  const [terminology, setTerminology] = useState<WorldTerminology | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    setPlayerContent(undefined);
    worldContentRepository.loadCharacterContent(playerId)
      .then((content) => { if (!cancelled) setPlayerContent(content); })
      .catch(() => { if (!cancelled) setPlayerContent(undefined); });
    worldContentRepository.loadTerminology()
      .then((loaded) => { if (!cancelled) setTerminology(loaded); })
      .catch(() => { if (!cancelled) setTerminology(undefined); });
    return () => { cancelled = true; };
  }, [playerId]);
  const playerDossier = useMemo(
    () => attachCustomRelationshipFacts(
      createPlayerDossier(lord, currentYear, playerId, playerContent, terminology),
      customCharacters,
      playerId,
    ),
    [lord, currentYear, playerId, playerContent, terminology, customCharacters],
  );
  const isPlayer = !selectedCharacterId || selectedCharacterId === playerId;
  const [dossier, setDossier] = useState<CharacterDossier | null>(isPlayer ? playerDossier : null);
  const [relatedRecords, setRelatedRecords] = useState<ReadonlyMap<CharacterId, StaticCharacterRecord>>(new Map());
  const [status, setStatus] = useState<CharacterDossierLoadStatus>(isPlayer ? 'ready' : 'loading');
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    if (!selectedCharacterId || selectedCharacterId === playerId) {
      setDossier(playerDossier);
      setRelatedRecords(new Map());
      setStatus('ready');
      setError(null);
      let cancelled = false;
      void loadRelatedRecordsIncludingOverlay(playerDossier, customCharacters).then((records) => {
        if (!cancelled) setRelatedRecords(records);
      }).catch(() => {
        if (!cancelled) setRelatedRecords(new Map());
      });
      return () => { cancelled = true; };
    }

    let cancelled = false;
    setDossier(null);
    setRelatedRecords(new Map());
    setStatus('loading');
    setError(null);

    const load = async () => {
      const customRecord = customCharacters?.records[selectedCharacterId];
      if (customRecord && customCharacters) {
        const mapLocations = await mapRepository.loadSearchIndex().catch(() => []);
        const resolved = resolveCustomCharacter(customRecord, customCharacters);
        const nextDossier = attachCustomRelationshipFacts({
          ...createNpcDossier(resolved, currentYear, undefined, undefined, terminology),
          dynastyName: customRecord.dynastyName ?? customRecord.houseName ?? '无家族',
          house: customRecord.houseName ?? '无家族',
          houseSigil: customRecord.houseSigil ?? 'unknown',
          location: mapLocations.find((entry) => entry.id === customRecord.location.locationId)?.name ?? customRecord.location.locationId,
        }, customCharacters, playerId);
        const customRelatedRecords = await loadRelatedRecordsIncludingOverlay(nextDossier, customCharacters);
        if (cancelled) return;
        setDossier(nextDossier);
        setRelatedRecords(customRelatedRecords);
        setStatus('ready');
        return;
      }
      const record = await dossierRepository.get(selectedCharacterId);
      if (!record) throw new Error('没有找到这个人物的稳定 AGOT 档案');
      const [events, kinship, loadoutProfile, mapLocations, startCharacters, characterContent, loadedTerminology] = await Promise.all([
        worldCharacters
          ? dossierEventStore.eventsForCharacter(worldCharacters.runId, selectedCharacterId)
          : Promise.resolve([]),
        dossierRepository.getKinship(selectedCharacterId),
        dossierRepository.getLoadoutProfile(selectedCharacterId),
        mapRepository.loadSearchIndex().catch(() => []),
        worldContentRepository.loadStartState()
          .then((startState) => startState.characters)
          .catch(() => []),
        worldContentRepository.loadCharacterContent(selectedCharacterId).catch(() => undefined),
        worldContentRepository.loadTerminology().catch(() => undefined),
        preloadNpcLoadoutContent(),
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
      const nextDossier = attachCustomRelationshipFacts({
        ...createNpcDossier(resolved, currentYear, kinship, characterContent, loadedTerminology),
        location: characterWorldLocationLabel(resolved, mapLocations),
      }, customCharacters, playerId);
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
      const mergedRelatives = new Map<CharacterId, StaticCharacterRecord>(projectedRelatives);
      if (customCharacters) {
        for (const id of relatedCharacterIds(nextDossier)) {
          const custom = customCharacters.records[id];
          if (custom) mergedRelatives.set(id, resolveCustomCharacter(custom, customCharacters));
        }
      }
      if (cancelled) return;
      setDossier(nextDossier);
      setRelatedRecords(mergedRelatives);
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
  }, [selectedCharacterId, playerDossier, currentYear, worldCharacters?.runId, worldCharacters?.datasetHash, worldCharacters?.revision, worldRuntime.revision, worldHistory, customCharacters, terminology, reloadToken]);

  const projectedDossier = useMemo(
    () => dossier ? attachCurrentWorld(dossier, lord, playerId, worldArtifacts, worldRuntime) : null,
    [dossier, lord, playerId, worldArtifacts, worldRuntime],
  );

  return { dossier: projectedDossier, relatedRecords, status, error, reload };
}

export { dossierRepository };
