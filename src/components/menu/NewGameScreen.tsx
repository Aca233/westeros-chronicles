import React, { useEffect, useState } from 'react';
import { ArrowLeft, UserPlus, Users } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import type { PlayableCharacterCard } from '../../features/world/createLivingWorldGame';
import { GameIcon, getHouseIconId } from '../GameIcon';

const DIFFICULTY_BADGE: Record<PlayableCharacterCard['difficulty'], { label: string; className: string }> = {
  normal: { label: '普通', className: 'border-hairline-bright/60 text-parchment-dim' },
  hard: { label: '困难', className: 'border-gold/60 text-gold-bright' },
  epic: { label: '史诗', className: 'border-rubric-deep/70 text-rubric-bright' },
};

export const NewGameScreen: React.FC = () => {
  const setMenuView = useGameStore((state) => state.setMenuView);
  const startNewGame = useGameStore((state) => state.startNewGame);
  const openCreator = useGameStore((state) => state.openCreator);
  const [cards, setCards] = useState<PlayableCharacterCard[]>([]);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('../../features/world/createLivingWorldGame')
      .then(({ loadPlayableCharacterCards }) => loadPlayableCharacterCards())
      .then((entries) => { if (!cancelled) setCards(entries); })
      .catch((error: unknown) => { if (!cancelled) setStartError(error instanceof Error ? error.message : '世界内容读取失败'); });
    return () => { cancelled = true; };
  }, []);

  const handleStart = async (card: PlayableCharacterCard) => {
    if (startingId) return;
    setStartingId(card.characterId);
    setStartError(null);
    try {
      const { createLivingWorldGame } = await import('../../features/world/createLivingWorldGame');
      await startNewGame(await createLivingWorldGame(card.characterId));
    } catch (error) {
      setStartError(error instanceof Error ? error.message : '开局失败,请重试。');
      setStartingId(null);
    }
  };

  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5 md:px-10 md:py-7">
      <div className="menu-screen-head">
        <div><p className="eyebrow">Registrum Domini · 开创新局</p><h2 className="mt-1 font-serif text-lg font-bold tracking-wide text-parchment">选择你的视角</h2></div>
        <button type="button" onClick={() => setMenuView('title')} className="btn-ghost" aria-label="返回标题屏"><ArrowLeft className="h-3.5 w-3.5" /><span className="hidden sm:inline">返回标题</span></button>
      </div>
      <div className="mt-5 grid content-start gap-4 md:grid-cols-3">
        {cards.map((card, index) => {
          const badge = DIFFICULTY_BADGE[card.difficulty];
          return <article key={card.characterId} className="scenario-card scene-enter" style={{ '--d': `${index * 90}ms` } as React.CSSProperties}>
            <div className="flex items-start justify-between gap-3"><GameIcon icon={getHouseIconId(card.card.avatarIcon)} className="h-10 w-10 shrink-0 opacity-90" tone="raw" /><span className={`border px-2 py-0.5 font-serif text-[10px] tracking-[0.22em] ${badge.className}`}>{badge.label}</span></div>
            <div><h3 className="font-serif text-base font-bold text-parchment">{card.card.title}</h3><p className="mt-1 text-[10.5px] tracking-wide text-gold-dim">{card.subtitle}</p></div>
            <p className="font-serif text-[11px] italic leading-relaxed text-parchment-dim">{card.card.tagline}</p>
            <p className="border-y border-hairline/50 py-2.5 font-serif text-[11.5px] leading-[1.75] text-parchment-dim">{card.card.background}</p>
            <div className="mt-auto flex items-end justify-between gap-3 pt-1"><div className="min-w-0"><p className="text-[9px] tracking-[0.3em] text-parchment-faint">控制人物</p><p className="truncate font-serif text-xs font-bold text-parchment">{card.characterName}</p><p className="truncate text-[9px] text-parchment-faint">{card.houseName}</p></div><button type="button" className="btn-decree shrink-0 !px-4 !py-2 !text-[11px]" disabled={startingId != null} onClick={() => void handleStart(card)}>{startingId === card.characterId ? '正在进入世界…' : '以此视角开始'}</button></div>
          </article>;
        })}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-hairline/60 pt-4"><span className="eyebrow !text-[9px]">或选择其他视角</span><button type="button" className="btn-ghost !py-2" onClick={() => openCreator('existing')}><Users className="h-3.5 w-3.5 text-gold" /><span>从人物名册中选择</span></button><button type="button" className="btn-ghost !py-2" onClick={() => openCreator('custom')}><UserPlus className="h-3.5 w-3.5 text-gold" /><span>高级沙盒创建</span></button></div>
      {startError && <p className="mt-3 font-serif text-[11px] text-rubric-bright">{startError}</p>}
    </div>
  );
};
export default NewGameScreen;
