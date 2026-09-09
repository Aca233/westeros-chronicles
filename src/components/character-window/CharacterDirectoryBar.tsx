import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, UserRound } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { dossierRepository } from '../../features/characters/useCharacterDossier';
import type { CharacterId, StaticCharacterRecord } from '../../features/characters/types';
import { CharacterSearch } from '../CharacterSearch';

export function CharacterDirectoryBar({ onSelectCharacter }: { onSelectCharacter: (id: CharacterId) => void }) {
  const activeScene = useGameStore((state) => state.gameState.activeScene);
  const [records, setRecords] = useState<StaticCharacterRecord[]>([]);
  const ids = useMemo(() => activeScene?.presentCharacterIds ?? [], [activeScene?.revision, activeScene?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!ids.length) {
      setRecords([]);
      return () => { cancelled = true; };
    }
    dossierRepository.getMany(ids)
      .then((loaded) => { if (!cancelled) setRecords(loaded); })
      .catch(() => { if (!cancelled) setRecords([]); });
    return () => { cancelled = true; };
  }, [ids]);

  return (
    <section className="space-y-2 border-b border-hairline/70 bg-ink-2/45 px-3 py-3" aria-label="人物名册入口">
      <div className="flex items-center gap-2">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-gold-deep" />
        <span className="eyebrow !text-[9px]">当前场景</span>
        <span className="ml-auto text-[9px] text-parchment-faint">{records.length} 人在场</span>
      </div>
      {records.length ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {records.map((record) => (
            <button
              key={record.id}
              type="button"
              onClick={() => onSelectCharacter(record.id)}
              className="flex shrink-0 items-center gap-1.5 border border-hairline bg-ink-3/50 px-2 py-1.5 font-serif text-[10px] text-parchment-dim hover:border-gold-deep hover:text-parchment"
            >
              <UserRound className="h-3 w-3 text-gold-deep" />
              {record.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="font-serif text-[10px] text-parchment-faint">当前场景尚未确认其他在场人物。</p>
      )}
      <CharacterSearch onSelectCharacter={onSelectCharacter} />
    </section>
  );
}
