import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { Dices } from 'lucide-react';

export const DiceModal: React.FC = () => {
  const { isDiceModalOpen, activeDiceCheck, closeDiceModal } = useGameStore();
  const [isRolling, setIsRolling] = useState(true);
  const [displayNumber, setDisplayNumber] = useState(1);

  useEffect(() => {
    if (!isDiceModalOpen || !activeDiceCheck) return;

    setIsRolling(true);
    let count = 0;
    const interval = setInterval(() => {
      setDisplayNumber(Math.floor(Math.random() * 20) + 1);
      count++;
      if (count > 15) {
        clearInterval(interval);
        setDisplayNumber(activeDiceCheck.roll);
        setIsRolling(false);
      }
    }, 45);

    return () => clearInterval(interval);
  }, [isDiceModalOpen, activeDiceCheck]);

  // 星盘落定后,Enter / Space / Esc 均可接受命运
  useEffect(() => {
    if (!isDiceModalOpen || isRolling) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        closeDiceModal();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isDiceModalOpen, isRolling, closeDiceModal]);

  if (!isDiceModalOpen || !activeDiceCheck) return null;

  const equipmentModifier = activeDiceCheck.equipmentModifier;
  const equipmentModifierBreakdown = activeDiceCheck.equipmentModifierBreakdown;
  const traitModifier = activeDiceCheck.traitModifier ?? 0;
  const traitModifierBreakdown = activeDiceCheck.traitModifierBreakdown ?? [];
  const signed = (value: number) => `${value >= 0 ? '+' : ''}${value}`;

  const verdict = activeDiceCheck.isNatural20
    ? { word: '天 成', tone: 'text-rubric' }
    : activeDiceCheck.isNatural1
      ? { word: '溃 败', tone: 'text-rubric-deep' }
      : activeDiceCheck.success
        ? { word: '得 手', tone: 'text-emerald-700' }
        : { word: '落 空', tone: 'text-rubric' };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex select-none items-center justify-center p-4"
      onClick={() => { if (!isRolling) closeDiceModal(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`${activeDiceCheck.attributeName}检定结果`}
    >
      <div
        className="panel-iron scene-enter relative flex w-full max-w-sm flex-col items-center p-8 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部:检定名目 */}
        <p className="eyebrow flex items-center gap-2">
          <Dices className="h-3.5 w-3.5" />
          命运星盘 · D20
        </p>
        <h3 className="mt-3 font-serif text-xl font-black tracking-[0.14em] text-parchment">
          {activeDiceCheck.attributeName}检定
        </h3>
        <p className="mt-1.5 line-clamp-2 max-w-xs px-2 font-serif text-[11px] italic leading-relaxed text-parchment-faint">
          “{activeDiceCheck.actionText}”
        </p>

        {/* 星盘:双环对转,停摆定数 */}
        <div className="relative my-10">
          <div className={`astro-ring astro-ring--outer ${isRolling ? '' : 'astro-ring--settled'}`} aria-hidden="true" />
          <div className={`astro-ring astro-ring--inner ${isRolling ? '' : 'astro-ring--settled'}`} aria-hidden="true" />
          <div className="flex h-28 w-28 items-center justify-center rounded-full border border-hairline-bright bg-ink-2 shadow-[inset_0_2px_8px_rgba(74,58,32,0.18)]">
            <span
              className={`font-display text-[56px] font-black leading-none ${
                isRolling ? 'text-parchment-dim' : verdict.tone
              }`}
            >
              {displayNumber}
            </span>
          </div>
        </div>

        {/* 结算账目 */}
        {!isRolling && (
          <div className="scene-enter flex w-full flex-col items-center gap-3">
            <div className="w-full border-y border-hairline py-2.5 font-mono text-[11px] text-parchment-dim">
              <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1">
                <span>出目 {activeDiceCheck.roll}</span>
                <span>属性 {signed(activeDiceCheck.attributeModifier)}</span>
                {equipmentModifier !== 0 && (
                  <span>物品 {signed(equipmentModifier)}</span>
                )}
                {traitModifier !== 0 && (
                  <span className={traitModifier > 0 ? 'text-emerald-700' : 'text-rubric'}>
                    特质 {signed(traitModifier)}
                  </span>
                )}
                <span className="font-bold text-gold-bright">总计 {activeDiceCheck.total}</span>
                <span>DC {activeDiceCheck.dc}</span>
              </div>
              {equipmentModifierBreakdown.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1 border-t border-hairline pt-2 text-[9.5px]">
                  {equipmentModifierBreakdown.map((item) => (
                    <span
                      key={`${item.instanceId}-${item.reason}-${item.value}`}
                      title={item.reason}
                      className={`border px-1.5 py-0.5 ${
                        item.value > 0
                          ? 'border-emerald-700/50 text-emerald-800'
                          : 'border-rubric-deep/60 text-rubric-deep'
                      }`}
                    >
                      {item.name} {signed(item.value)}
                    </span>
                  ))}
                </div>
              )}
              {traitModifierBreakdown.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1 border-t border-hairline pt-2 text-[9.5px]">
                  {traitModifierBreakdown.map((item) => (
                    <span
                      key={`${item.traitId}-${item.value}`}
                      className={`border px-1.5 py-0.5 ${
                        item.value > 0
                          ? 'border-emerald-700/50 text-emerald-800'
                          : 'border-rubric-deep/60 text-rubric-deep'
                      }`}
                    >
                      {item.name} {signed(item.value)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <span className={`font-serif text-lg font-black tracking-[0.5em] ${verdict.tone}`}>
              {verdict.word}
            </span>

            <p className="max-w-xs font-serif text-[12px] leading-relaxed text-parchment">
              {activeDiceCheck.resultDescription}
            </p>
          </div>
        )}

        {/* 确认 */}
        <button
          onClick={closeDiceModal}
          disabled={isRolling}
          className="btn-decree mt-8 !px-8"
        >
          {isRolling ? '星盘未停……' : '接受命运'}
        </button>
      </div>
    </div>
  );
};
