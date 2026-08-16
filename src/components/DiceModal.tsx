import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { Dices, Sparkles, CheckCircle2, XCircle } from 'lucide-react';

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

  if (!isDiceModalOpen || !activeDiceCheck) return null;

  // 兼容没有特质字段的旧存档检定记录。
  const traitModifier = activeDiceCheck.traitModifier ?? 0;
  const traitModifierBreakdown = activeDiceCheck.traitModifierBreakdown ?? [];
  const signed = (value: number) => `${value >= 0 ? '+' : ''}${value}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150 select-none">
      <div className="bg-[#14110e] border border-[#c89d54] rounded-2xl p-6 max-w-sm w-full shadow-2xl got-card-texture flex flex-col items-center text-center relative">
        {/* 顶部检定标题 */}
        <div className="flex items-center gap-2 text-xs font-serif text-[#c89d54] uppercase tracking-wider mb-2">
          <Dices className="w-4 h-4" />
          <span>D20 跑团规则检定</span>
        </div>

        <h3 className="font-serif font-bold text-lg text-[#e6ded1] mb-1">
          {activeDiceCheck.attributeName} 检定
        </h3>
        <p className="text-xs text-[#a89f91] mb-5 font-serif line-clamp-2 px-2">
          "{activeDiceCheck.actionText}"
        </p>

        {/* 20 面骰子动效容器 */}
        <div className="relative my-2">
          <div
            className={`w-24 h-24 rounded-2xl flex items-center justify-center text-4xl font-mono font-black border-2 transition-all duration-300 ${
              isRolling
                ? 'bg-[#2b221a] border-[#8a652a] text-[#e5be6c] animate-bounce'
                : activeDiceCheck.isNatural20
                ? 'bg-gradient-to-br from-amber-600 to-amber-900 border-amber-300 text-white scale-110 shadow-lg wax-glow'
                : activeDiceCheck.isNatural1
                ? 'bg-gradient-to-br from-red-800 to-red-950 border-red-500 text-white scale-95'
                : activeDiceCheck.success
                ? 'bg-emerald-950 border-emerald-500 text-emerald-200'
                : 'bg-red-950/70 border-red-800 text-red-300'
            }`}
          >
            {displayNumber}
          </div>
          {activeDiceCheck.isNatural20 && !isRolling && (
            <Sparkles className="w-6 h-6 text-amber-300 absolute -top-2 -right-2 animate-spin" />
          )}
        </div>

        {/* 结算公式与说明 */}
        {!isRolling && (
          <div className="flex flex-col items-center gap-2 mt-4 animate-in fade-in duration-200 w-full">
            <div className="w-full rounded border border-[#33271d] bg-black/40 px-3 py-2 font-mono text-xs text-[#e6ded1]">
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                <span>出目 {activeDiceCheck.roll}</span>
                <span>属性 {signed(activeDiceCheck.attributeModifier)}</span>
                {activeDiceCheck.equipmentBonus !== 0 && (
                  <span>武器 {signed(activeDiceCheck.equipmentBonus)}</span>
                )}
                {traitModifier !== 0 && (
                  <span className={traitModifier > 0 ? 'text-emerald-300' : 'text-red-300'}>
                    特质 {signed(traitModifier)}
                  </span>
                )}
                <span className="font-bold text-[#e5be6c]">总点数 {activeDiceCheck.total}</span>
                <span className="text-[#a89f91]">目标 DC {activeDiceCheck.dc}</span>
              </div>
              {traitModifierBreakdown.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1 border-t border-[#33271d]/70 pt-2 text-[10px]">
                  <span className="mr-1 text-[#8f8375]">特质明细</span>
                  {traitModifierBreakdown.map((item) => (
                    <span
                      key={`${item.traitId}-${item.value}`}
                      className={`rounded border px-1.5 py-0.5 ${
                        item.value > 0
                          ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
                          : 'border-red-800/60 bg-red-950/40 text-red-300'
                      }`}
                    >
                      {item.name} {signed(item.value)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 判定结论徽章 */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-serif font-bold ${
                activeDiceCheck.isNatural20
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : activeDiceCheck.isNatural1
                  ? 'bg-red-600/20 text-red-400 border border-red-600/40'
                  : activeDiceCheck.success
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-red-500/20 text-red-300 border border-red-500/40'
              }`}
            >
              {activeDiceCheck.success ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              <span>
                {activeDiceCheck.isNatural20
                  ? '大成功 (NATURAL 20)'
                  : activeDiceCheck.isNatural1
                  ? '大失败 (NATURAL 1)'
                  : activeDiceCheck.success
                  ? '检定通过 (SUCCESS)'
                  : '检定失败 (FAILURE)'}
              </span>
            </div>

            <p className="text-xs text-[#e6ded1] font-serif leading-relaxed mt-1">
              {activeDiceCheck.resultDescription}
            </p>
          </div>
        )}

        {/* 确认关闭按钮 */}
        <button
          onClick={closeDiceModal}
          disabled={isRolling}
          className="mt-6 w-full py-2.5 bg-[#1c1813] hover:bg-[#2b221a] text-[#e5be6c] font-serif font-bold text-xs rounded-lg border border-[#33271d] hover:border-[#c89d54] transition-all disabled:opacity-40"
        >
          {isRolling ? '掷骰中……' : '接受命运，继续剧情'}
        </button>
      </div>
    </div>
  );
};
