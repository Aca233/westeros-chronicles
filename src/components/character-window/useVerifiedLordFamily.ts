import { useEffect, useState } from 'react';
import { CANONICAL_TIMELINE } from '../../data/generated/canonicalTimeline';
import { projectLordFamilyRecords } from '../../features/characters/characterRelationshipProjection';
import { resolveLordFamilyRecords, type LordFamilyRecords } from '../../features/characters/lordRelationshipResolver';
import { StaticCharacterRepository } from '../../features/characters/staticCharacterRepository';
import { dossierEventStore } from '../../features/characters/useCharacterDossier';
import type { WorldHistoryState } from '../../features/world/worldHistory';
import type { WorldRuntimeState } from '../../features/world/worldRuntimeTypes';
import type { LordProfile, WorldCharacterStateRef } from '../../types/game';

const relationshipRepository = new StaticCharacterRepository();

export function useVerifiedLordFamily(
  lord: LordProfile | null,
  currentYear: number,
  worldCharacters: WorldCharacterStateRef | undefined,
  worldHistory: WorldHistoryState,
  worldRuntime: WorldRuntimeState,
): { family: LordFamilyRecords; isLoading: boolean } {
  const [family, setFamily] = useState<LordFamilyRecords>({});
  const [isLoading, setIsLoading] = useState(Boolean(lord));

  useEffect(() => {
    let cancelled = false;
    if (!lord) {
      setFamily({});
      setIsLoading(false);
      return () => { cancelled = true; };
    }
    setIsLoading(true);
    resolveLordFamilyRecords({
      canonicalCharacterId: lord.canonicalCharacterId,
      name: lord.name,
      house: lord.house,
      houseSigil: lord.houseSigil,
      age: lord.age,
      currentYear,
    }, relationshipRepository)
      .then((result) => projectLordFamilyRecords(
        result,
        (characterId) => worldCharacters
          ? dossierEventStore.eventsForCharacter(worldCharacters.runId, characterId)
          : Promise.resolve([]),
        { history: worldHistory, runtime: worldRuntime, timeline: CANONICAL_TIMELINE },
      ))
      .then((result) => { if (!cancelled) setFamily(result); })
      .catch(() => { if (!cancelled) setFamily({}); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [
    lord?.canonicalCharacterId,
    lord?.name,
    lord?.house,
    lord?.houseSigil,
    lord?.age,
    currentYear,
    worldCharacters?.runId,
    worldCharacters?.revision,
    worldHistory,
    worldRuntime.revision,
  ]);

  return { family, isLoading };
}
