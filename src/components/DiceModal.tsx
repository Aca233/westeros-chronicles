import React, { useEffect, useState } from 'react';
import { Activity, Dices, HeartPulse, Shield, Sparkles } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';

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

  useEffect(() => {
    if (!isDiceModalOpen || isRolling) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
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
  const healthModifier = activeDiceCheck.healthModifier ?? 0;
  const healthModifierBreakdown = activeDiceCheck.healthModifierBreakdown ?? [];
  const signed = (value: number) => `${value >= 0 ? '+' : ''}${value}`;
  const methodLabel = activeDiceCheck.secondaryAttributeName
    ? `${activeDiceCheck.attributeName} 70% ＋ ${activeDiceCheck.secondaryAttributeName} 30%`
    : activeDiceCheck.attributeName;

  const outcome = activeDiceCheck.outcome ?? (activeDiceCheck.success ? 'success' : 'failure');
  const verdict = outcome === 'strong_success'
    ? { word: '占得先机', tone: 'text-gold-bright', frame: 'border-gold-deep/70 bg-gold-deep/10' }
    : outcome === 'success'
      ? { word: '得手', tone: 'text-emerald-700', frame: 'border-emerald-800/50 bg-emerald-950/10' }
      : outcome === 'partial'
        ? { word: '险中有得', tone: 'text-gold', frame: 'border-gold-deep/60 bg-gold-deep/5' }
        : { word: '落空', tone: 'text-rubric-bright', frame: 'border-rubric/60 bg-rubric/10' };

  const modifierCards = [
    {
      label: '能力',
      value: activeDiceCheck.attributeModifier,
      detail: `有效值 ${activeDiceCheck.effectiveAttribute ?? activeDiceCheck.primaryAttributeValue ?? '旧制'}`,
      icon: Sparkles,
      danger: false,
    },
    {
      label: '装备',
      value: equipmentModifier,
      detail: equipmentModifierBreakdown.length ? `${equipmentModifierBreakdown.length} 项生效` : '无额外修正',
      icon: Shield,
      danger: equipmentModifier < 0,
    },
    {
      label: '特质',
      value: traitModifier,
      detail: traitModifierBreakdown.length ? `${traitModifierBreakdown.length} 项生效` : '无额外修正',
      icon: Activity,
      danger: traitModifier < 0,
    },
    {
      label: '身体',
      value: healthModifier,
      detail: healthModifierBreakdown.length ? `${healthModifierBreakdown.length} 项影响` : '当前行动不受限',
      icon: HeartPulse,
      danger: healthModifier < 0,
    },
  ];

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex select-none items-center justify-center p-3 sm:p-6"
      onClick={() => { if (!isRolling) closeDiceModal(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`${activeDiceCheck.attributeName}检定结果`}
    >
      <div
        className="panel-iron scene-enter relative w-full max-w-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="border-b border-hairline bg-ink-2/85 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 text-left">
              <p className="eyebrow flex items-center gap-2">
                <Dices className="h-3.5 w-3.5" />
                命运星盘 · D20
              </p>
              <h3 className="mt-2 font-serif text-xl font-black tracking-[0.08em] text-parchment sm:text-2xl">
                {activeDiceCheck.secondaryAttributeName ? '组合能力检定' : `${activeDiceCheck.attributeName}检定`}
              </h3>
              <p className="mt-1 max-w-xl font-serif text-[11px] italic leading-relaxed text-parchment-faint">
                “{activeDiceCheck.actionText}”
              </p>
            </div>
            {!isRolling && (
              <div className={`shrink-0 border px-3 py-1.5 font-serif text-[11px] font-black tracking-[0.18em] ${verdict.frame} ${verdict.tone}`}>
                {verdict.word}
              </div>
            )}
          </div>
        </header>

        <div className="grid md:grid-cols-[220px_minmax(0,1fr)]">
          <section className="flex flex-col items-center justify-center border-b border-hairline bg-ink/55 px-5 py-7 md:border-b-0 md:border-r md:py-8">
            <div className="relative">
              <div className={`astro-ring astro-ring--outer ${isRolling ? '' : 'astro-ring--settled'}`} aria-hidden="true" />
              <div className={`astro-ring astro-ring--inner ${isRolling ? '' : 'astro-ring--settled'}`} aria-hidden="true" />
              <div className="flex h-32 w-32 items-center justify-center rounded-full border border-hairline-bright bg-ink-2 shadow-[inset_0_2px_12px_rgba(74,58,32,0.24)]">
                <span className={`font-display text-[64px] font-black leading-none ${isRolling ? 'text-parchment-dim' : verdict.tone}`}>
                  {displayNumber}
                </span>
              </div>
            </div>
            <div className="mt-6 text-center">
              <div className="text-[9px] uppercase tracking-[0.22em] text-parchment-faint">D20 出目</div>
              <div className="mt-1 font-display text-2xl font-black text-parchment">{isRolling ? '—' : activeDiceCheck.roll}</div>
            </div>
          </section>

          <section className="p-5 sm:p-6">
            {isRolling ? (
              <div className="flex min-h-[300px] items-center justify-center text-center">
                <div>
                  <p className="font-serif text-sm text-parchment">星盘正在落定……</p>
                  <p className="mt-2 text-[10px] leading-relaxed text-parchment-faint">
                    能力、装备、特质与身体状态将在出目后统一结算。
                  </p>
                </div>
              </div>
            ) : (
              <div className="scene-enter space-y-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {modifierCards.map(({ label, value, detail, icon: Icon, danger }) => (
                    <div key={label} className={`border p-2.5 ${danger ? 'border-rubric/50 bg-rubric/5' : 'border-hairline bg-ink-2/55'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1 text-[9px] text-parchment-faint">
                          <Icon className="h-3 w-3" />{label}
                        </span>
                        <strong className={`font-mono text-sm ${value < 0 ? 'text-rubric-bright' : value > 0 ? 'text-gold-bright' : 'text-parchment-dim'}`}>
                          {signed(value)}
                        </strong>
                      </div>
                      <div className="mt-1 truncate text-[8px] text-parchment-faint" title={label === '能力' ? methodLabel : detail}>{detail}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-y border-hairline py-3 text-center">
                  <div>
                    <div className="text-[9px] tracking-[0.18em] text-parchment-faint">最终总计</div>
                    <div className="mt-1 font-display text-3xl font-black text-gold-bright">{activeDiceCheck.total}</div>
                  </div>
                  <div className="text-lg text-parchment-faint">/</div>
                  <div>
                    <div className="text-[9px] tracking-[0.18em] text-parchment-faint">难度 DC</div>
                    <div className="mt-1 font-display text-3xl font-black text-parchment">{activeDiceCheck.dc}</div>
                  </div>
                </div>

                {(activeDiceCheck.secondaryAttributeName || activeDiceCheck.methodReason) && (
                  <div className="border border-gold-deep/35 bg-gold-deep/5 px-3 py-2 text-left">
                    {activeDiceCheck.secondaryAttributeName && <p className="font-mono text-[9.5px] text-gold">{methodLabel}</p>}
                    {activeDiceCheck.methodReason && <p className="mt-1 font-serif text-[10px] leading-relaxed text-parchment-faint">{activeDiceCheck.methodReason}</p>}
                  </div>
                )}

                {healthModifierBreakdown.length > 0 && (
                  <div className="border border-rubric/55 bg-rubric/5 p-3 text-left">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 font-serif text-[11px] font-bold text-rubric-bright">
                        <HeartPulse className="h-3.5 w-3.5" />身体状态影响
                      </span>
                      <span className="font-mono text-[11px] font-bold text-rubric-bright">{signed(healthModifier)}</span>
                    </div>
                    <div className="space-y-1.5">
                      {healthModifierBreakdown.map((item) => (
                        <div key={`${item.injuryId}-${item.value}`} className="flex items-start justify-between gap-3 text-[9.5px]">
                          <span className="text-parchment-dim">
                            <strong className="text-parchment">{item.label}</strong>
                            <span className="ml-1 text-parchment-faint">影响 {item.capabilities.join('、')}</span>
                          </span>
                          <span className="shrink-0 font-mono text-rubric-bright">{signed(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(equipmentModifierBreakdown.length > 0 || traitModifierBreakdown.length > 0) && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {equipmentModifierBreakdown.length > 0 && (
                      <div className="border border-hairline bg-ink-2/40 p-3 text-left">
                        <div className="mb-2 text-[9px] tracking-[0.14em] text-parchment-faint">装备明细</div>
                        <div className="space-y-1">
                          {equipmentModifierBreakdown.map((item) => (
                            <div key={`${item.instanceId}-${item.reason}-${item.value}`} className="flex justify-between gap-2 text-[9.5px]">
                              <span className="truncate text-parchment-dim" title={item.reason}>{item.name}</span>
                              <span className={item.value < 0 ? 'text-rubric-bright' : 'text-gold'}>{signed(item.value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {traitModifierBreakdown.length > 0 && (
                      <div className="border border-hairline bg-ink-2/40 p-3 text-left">
                        <div className="mb-2 text-[9px] tracking-[0.14em] text-parchment-faint">特质明细</div>
                        <div className="space-y-1">
                          {traitModifierBreakdown.map((item) => (
                            <div key={`${item.traitId}-${item.value}`} className="flex justify-between gap-2 text-[9.5px]">
                              <span className="truncate text-parchment-dim">{item.name}</span>
                              <span className={item.value < 0 ? 'text-rubric-bright' : 'text-gold'}>{signed(item.value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeDiceCheck.methodEdge && (
                  <p className="border-l-2 border-gold-deep pl-3 text-left font-serif text-[10px] leading-relaxed text-gold">
                    {activeDiceCheck.methodEdge.traitName} · {activeDiceCheck.methodEdge.label}：{activeDiceCheck.methodEdge.directive}
                  </p>
                )}

                <p className="text-left font-serif text-[11px] leading-relaxed text-parchment-dim">
                  {activeDiceCheck.resultDescription}
                </p>
              </div>
            )}
          </section>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-hairline bg-ink-2/70 px-5 py-3 sm:px-6">
          <span className="hidden text-[9px] text-parchment-faint sm:block">Enter / Space / Esc 接受结果</span>
          <button onClick={closeDiceModal} disabled={isRolling} className="btn-decree ml-auto !px-7">
            {isRolling ? '星盘未停……' : '接受命运'}
          </button>
        </footer>
      </div>
    </div>
  );
};
