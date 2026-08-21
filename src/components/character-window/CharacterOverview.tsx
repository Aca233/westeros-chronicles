import React from 'react';
import { Coins, Crown, HeartPulse, Skull } from 'lucide-react';
import { CK3_SKILLS, getCk3SkillRank } from '../../data/ck3Skills';
import { formatTraitDescription, resolveCharacterTraits } from '../../data/characterTraits';
import type { CharacterDossier } from '../../features/characters/characterDossier';
import { GameIcon } from '../GameIcon';

export function CharacterOverview({
  dossier,
  displayedTraits,
  activeTraitId,
  onTraitSelect,
}: {
  dossier: CharacterDossier;
  displayedTraits: ReturnType<typeof resolveCharacterTraits>;
  activeTraitId: string | null;
  onTraitSelect: (traitId: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-5 px-5 pb-6">
      <section data-character-traits aria-label="人物特质">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[11px] font-bold tracking-[0.18em] text-gold">特质</span>
          <span className="font-mono text-[9px] text-parchment-faint">{displayedTraits.length} 项 · 教育优先</span>
        </div>
        {displayedTraits.length > 0 ? (
          <div className="flex flex-wrap items-start gap-x-0.5 gap-y-1.5" aria-label="人物特质列表">
            {(['education', 'personality', 'other'] as const)
              .map((bucket) => displayedTraits.filter((trait) =>
                bucket === 'other' ? trait.category !== 'education' && trait.category !== 'personality' : trait.category === bucket))
              .filter((cluster) => cluster.length > 0)
              .map((cluster, clusterIndex) => (
                <React.Fragment key={clusterIndex}>
                  {cluster.map((trait, traitIndex) => {
                    const active = activeTraitId === trait.id;
                    const clusterStart = clusterIndex > 0 && traitIndex === 0;
                    return (
                      <button
                        key={trait.id}
                        type="button"
                        onClick={() => onTraitSelect(active ? null : trait.id)}
                        aria-pressed={active}
                        title={`${trait.name}:${formatTraitDescription(trait.description, dossier.name)}`}
                        className={`trait-chip relative flex w-[52px] shrink-0 flex-col items-center px-0.5 pb-1 pt-1 ${
                          clusterStart ? 'trait-chip--cluster-start' : ''
                        } ${
                          active ? 'text-gold' : 'text-parchment-dim hover:text-parchment'
                        }`}
                      >
                        {trait.category === 'education' && (
                          <span className="absolute left-0 top-0 z-10 bg-rubric px-1 text-[7px] leading-3 text-[#f6efdd]">教育</span>
                        )}
                        <GameIcon icon={trait.icon} className="h-9 w-9 shrink-0" />
                        <span className="mt-0.5 w-full truncate text-[9px] font-bold">{trait.name}</span>
                        {active && <span className="absolute inset-x-2.5 bottom-0 h-[1.5px] bg-gold" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </React.Fragment>
              ))}
          </div>
        ) : (
          <EmptyState label="尚未记录人物特质" />
        )}
      </section>

      <section aria-label="人物属性">
        <div className="grid grid-cols-6">
          {CK3_SKILLS.map((skill) => {
            const value = dossier.attributes[skill.key] ?? 0;
            return (
              <div
                key={skill.key}
                className="group flex min-w-0 flex-col items-center pb-1 pt-0.5"
                title={`${skill.label}:${getCk3SkillRank(value)}`}
                aria-label={`${skill.label} ${value}`}
              >
                <GameIcon icon={skill.icon} className="h-[44px] w-[44px] shrink-0 transition-transform duration-300 group-hover:scale-110" />
                <span className={`font-display text-[15px] font-bold leading-none ${getSkillValueColor(value)}`}>{value}</span>
              </div>
            );
          })}
        </div>
        <hr className="hairline mt-2" aria-hidden="true" />
      </section>

      {dossier.kind === 'player' && (
        <section className="grid grid-cols-4" aria-label="资源与状态">
          <ResourceCell icon={<Coins className="h-3.5 w-3.5 text-gold-deep" />} value={dossier.player.goldDragons} label="金龙" />
          <ResourceCell icon={<Crown className="h-3.5 w-3.5 text-gold" />} value={dossier.player.prestige} label="威仪" />
          <ResourceCell icon={<Skull className="h-3.5 w-3.5 text-rubric" />} value={dossier.player.dread} label="恶名" />
          <ResourceCell icon={<HeartPulse className="h-3.5 w-3.5 text-emerald-700" />} value={dossier.player.overallStatus} label="健康" textValue />
        </section>
      )}
    </div>
  );
}


export function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-[11px] font-bold tracking-[0.18em] text-gold">{title}</h3>
      <p className="mt-1 text-[9.5px] text-parchment-faint">{subtitle}</p>
      <hr className="hairline mt-2" aria-hidden="true" />
    </div>
  );
}

function ResourceCell({ icon, value, label, textValue = false }: { icon: React.ReactNode; value: number | string; label: string; textValue?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 py-1">
      <span className={`truncate font-display font-bold text-parchment ${textValue ? 'text-[10px]' : 'text-[13px]'}`}>{value}</span>
      <span className="flex items-center gap-1 text-[8.5px] tracking-widest text-parchment-faint">{icon}{label}</span>
    </div>
  );
}
export function EmptyState({ label }: { label: string }) {
  return <p className="py-4 text-center font-serif text-[10px] italic leading-relaxed text-parchment-faint">{label}</p>;
}

function getSkillValueColor(value: number): string {
  if (value >= 25) return 'text-rubric';
  if (value >= 20) return 'text-emerald-700';
  if (value >= 16) return 'text-emerald-700';
  if (value <= 4) return 'text-rubric';
  return 'text-gold';
}
