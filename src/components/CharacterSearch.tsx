import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { dossierRepository } from '../features/characters/useCharacterDossier';
import type { CharacterId, CharacterSearchHit } from '../features/characters/types';
import { dynastySlug } from '../features/characters/characterDossier';
import { getHouseIconId } from './GameIcon';
import { CharacterPortrait } from './CharacterPortrait';

interface CharacterSearchProps {
  onSelectCharacter: (characterId: CharacterId) => void;
  aliveOnly?: boolean;
  revealStatus?: boolean;
}

export const CharacterSearch: React.FC<CharacterSearchProps> = ({ onSelectCharacter, aliveOnly = false, revealStatus = aliveOnly }) => {
  const [isOpen, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [includeGenealogy, setIncludeGenealogy] = useState(false);
  const [results, setResults] = useState<CharacterSearchHit[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const normalized = query.trim();
    if (!isOpen || normalized.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      dossierRepository.search(normalized, { includeGenealogy: aliveOnly ? false : includeGenealogy, alive: aliveOnly ? true : undefined, limit: 24 })
        .then((hits) => {
          if (!cancelled) setResults(hits.filter((hit) => hit.name.trim() && (!aliveOnly || (hit.born && hit.alive && hit.canonTier !== 'genealogy'))));
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            setResults([]);
            setError(reason instanceof Error ? reason.message : '人物索引读取失败');
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, query, includeGenealogy, aliveOnly]);

  if (!isOpen) {
    return (
      <button
        type="button"
        data-character-search-trigger
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 border border-dashed border-hairline-bright/70 py-2.5 font-serif text-[10.5px] tracking-[0.16em] text-parchment-faint transition-colors hover:border-gold hover:text-gold"
      >
        <Search className="h-3.5 w-3.5" />
        查找人物档案
      </button>
    );
  }

  return (
    <section data-character-search className="border border-gold-deep/55 bg-ink-2/80 p-2.5">
      <div className="flex items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gold-deep" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 w-full border border-hairline-bright bg-ink pl-7 pr-2 font-serif text-[11px] text-parchment outline-none focus:border-gold"
            placeholder="输入至少两个字或字母"
            aria-label="人物姓名"
          />
        </label>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost !h-8 !px-2" aria-label="关闭人物检索">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {!aliveOnly && <label className="mt-2 flex items-center gap-2 text-[9px] text-parchment-faint">
        <input
          type="checkbox"
          checked={includeGenealogy}
          onChange={(event) => setIncludeGenealogy(event.target.checked)}
          className="accent-[#b08a3c]"
        />
        包含家谱人物
      </label>}

      <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
        {isLoading && <SearchState text="正在查阅人物索引" />}
        {!isLoading && error && <SearchState text={error} tone="error" />}
        {!isLoading && !error && query.trim().length < 2 && <SearchState text="输入姓名后开始查找" />}
        {!isLoading && !error && query.trim().length >= 2 && results.length === 0 && <SearchState text="没有找到相符的稳定人物档案" />}
        {!isLoading && results.map((hit) => {
          const dynasty = dynastySlug(hit.dynastyId) || '家族未记录';
          const icon = getHouseIconId(dynasty.toLowerCase());
          return (
            <button
              key={hit.id}
              type="button"
              onClick={() => {
                onSelectCharacter(hit.id);
                setOpen(false);
                setQuery('');
              }}
              className="flex w-full items-center gap-2 border border-hairline bg-ink-3/40 px-2 py-1.5 text-left transition-colors hover:border-gold-deep hover:bg-ink-3"
            >
              <CharacterPortrait
                characterId={hit.id}
                houseIcon={icon}
                alt={`${hit.name}的肖像`}
                deceased={revealStatus ? !hit.alive : false}
                className="h-9 w-8 shrink-0 border border-hairline-bright"
              />
              <span className="min-w-0 flex-1">
                <strong className="block truncate font-serif text-[11px] text-parchment">{hit.name}</strong>
                <span className="mt-0.5 block truncate text-[9px] text-parchment-faint">
                  {revealStatus
                    ? `${dynasty} · ${hit.birthYear === null || hit.birthYear === undefined ? '生年未记录' : `${hit.birthYear} AC 生`} · ${hit.alive ? '在世' : '已故'}`
                    : `${dynasty} · 稳定人物档案`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

function SearchState({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'error' }) {
  return <div className={`border border-dashed border-hairline px-2 py-3 text-center font-serif text-[10px] ${tone === 'error' ? 'text-rubric-bright' : 'text-parchment-faint'}`}>{text}</div>;
}
