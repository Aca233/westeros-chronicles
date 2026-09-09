import React from 'react';
import { BookOpen, RotateCcw } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import type { CharacterId } from '../domain/characterId';
import { roleplayCommitmentsForViewer } from '../features/roleplay/state';

export const EndOfLifePanel: React.FC = () => {
  const gameState = useGameStore((state) => state.gameState);
  const enterMenu = useGameStore((state) => state.enterMenu);
  if (!gameState.isGameOver) return null;

  const choices = gameState.turns.filter((turn) => turn.playerInput.trim()).slice(-5);
  const playerId = (gameState.lord.canonicalCharacterId
    ?? `save:${gameState.worldCharacters?.runId ?? 'current'}:player`) as CharacterId;
  const commitments = roleplayCommitmentsForViewer(gameState.roleplay, playerId).slice(-4);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/95 px-4 py-8 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="end-of-life-title">
      <section className="panel-iron mx-auto w-full max-w-2xl p-6 md:p-9">
        <p className="eyebrow !text-rubric">人生卷宗封存</p>
        <h1 id="end-of-life-title" className="mt-3 font-brush text-4xl text-rubric md:text-6xl">{gameState.lord.name}的传奇终结</h1>
        <p className="mt-4 font-serif text-sm leading-relaxed text-parchment-dim">
          {gameState.deathReason || '这段人生已经结束，发生过的选择仍留在本周目的卷宗里。'}
        </p>

        <div className="mt-7 grid gap-6 md:grid-cols-2">
          <section>
            <h2 className="eyebrow">最后的重要选择</h2>
            {choices.length ? (
              <ol className="mt-3 space-y-3">
                {choices.map((turn) => <li key={turn.id} className="border-l border-gold-deep pl-3 font-serif text-xs leading-relaxed text-parchment-dim">第 {turn.turnNumber} 回合 · {turn.playerInput}</li>)}
              </ol>
            ) : <p className="mt-3 text-xs text-parchment-faint">没有可回顾的行动。</p>}
          </section>
          <section>
            <h2 className="eyebrow">身后未了之事</h2>
            {commitments.length ? (
              <ul className="mt-3 space-y-3">
                {commitments.map((entry) => <li key={entry.id} className="border-l border-rubric/50 pl-3 font-serif text-xs leading-relaxed text-parchment-dim">{entry.terms}{entry.dueDate ? ` · 期限 ${entry.dueDate}` : ''}</li>)}
              </ul>
            ) : <p className="mt-3 text-xs text-parchment-faint">没有仍在账本中的公开承诺。</p>}
          </section>
        </div>

        <p className="mt-7 border-t border-hairline pt-4 text-[11px] leading-relaxed text-parchment-faint">
          当前存档保留在人生终结时，可从读取存档查看。继承玩法尚未成立，因此不会在这里伪造继承人或转移资产。
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="btn-decree" onClick={() => enterMenu('new')}><RotateCcw className="h-4 w-4" />另开人生</button>
          <button type="button" className="btn-ghost" onClick={() => enterMenu('load')}><BookOpen className="h-4 w-4" />查看存档</button>
          <button type="button" className="btn-ghost" onClick={() => enterMenu('title')}>返回标题</button>
        </div>
      </section>
    </div>
  );
};
