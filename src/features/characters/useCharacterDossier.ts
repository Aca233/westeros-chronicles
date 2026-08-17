import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { DexieCharacterEventStore } from './characterEventStore';
import {
  characterDatasetYear,
  createNpcDossier,
  createPlayerDossier,
  relatedCharacterIds,
  relationRecordsById,
  type CharacterDossier,
} from './characterDossier';
import { resolveCharacter } from './characterProjector';
import { StaticCharacterRepository } from './staticCharacterRepository';
import type { CharacterId, StaticCharacterRecord } from './types';

const dossierRepository = new StaticCharacterRepository();
const dossierEventStore = new DexieCharacterEventStore();

export type CharacterDossierLoadStatus = 'ready' | 'loading' | 'error';

export interface CharacterDossierLoadResult {
  dossier: CharacterDossier | null;
  relatedRecords: ReadonlyMap<CharacterId, StaticCharacterRecord>;
  status: CharacterDossierLoadStatus;
  error: string | null;
  reload: () => void;
}

export function useCharacterDossier(selectedCharacterId: CharacterId | null): CharacterDossierLoadResult {
  const { lord, currentYear, worldCharacters } = useGameStore((state) => state.gameState);
  const playerDossier = useMemo(() => createPlayerDossier(lord), [lord]);
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
      const events = worldCharacters
        ? await dossierEventStore.eventsForCharacter(worldCharacters.runId, selectedCharacterId)
        : [];
      const resolved = resolveCharacter(record, events, {
        datasetVersion: worldCharacters?.datasetHash ?? 'agot-local-dataset',
        currentYear: characterDatasetYear(currentYear, record.birthDate),
      });
      const nextDossier = createNpcDossier(resolved, currentYear);
      const relatives = await dossierRepository.getMany(relatedCharacterIds(nextDossier));
      if (cancelled) return;
      setDossier(nextDossier);
      setRelatedRecords(relationRecordsById(relatives));
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
  }, [selectedCharacterId, playerDossier, currentYear, worldCharacters?.runId, worldCharacters?.datasetHash, worldCharacters?.revision, reloadToken]);

  return { dossier, relatedRecords, status, error, reload };
}

export { dossierRepository };
