import React, { useState } from 'react';
import {
  Biohazard,
  Coins,
  Droplets,
  HeartPulse,
  ScrollText,
  Skull,
} from 'lucide-react';
import Model, { type IExerciseData } from 'react-body-highlighter';
import { useGameStore } from '../store/useGameStore';
import { useThemeMode } from '../hooks/useThemeMode';
import type { EquipmentGroup } from '../features/items/types';
import type { WoundLevel } from '../types/game';
import { GameIcon, type GameIconId, getHouseIconId } from './GameIcon';
import { CoatOfArms } from './CoatOfArms';
import { CK3_SKILLS, getCk3SkillRank } from '../data/ck3Skills';
import {
  formatTraitDescription,
  formatTraitModifiers,
  formatTraitRuleEffects,
  resolveCharacterTraits,
  TRAIT_CATEGORY_LABELS,
} from '../data/characterTraits';
import { EquipmentPanel } from './items/EquipmentPanel';

export const CharacterSheet: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { gameState } = useGameStore();
  const theme = useThemeMode();
  const { lord } = gameState;
  const { body } = lord;
  const displayedTraits = resolveCharacterTraits(lord.traitIds ?? [], lord.traits ?? []);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [activeTraitId, setActiveTraitId] = useState<string | null>(null);
  const activeTrait = displayedTraits.find((trait) => trait.id === activeTraitId);
  const currentTarget = hoveredSlot;

  // 人体着色:日间羊皮淡彩,夜间烛下深墨
  const bodyFill = theme === 'night' ? '#2e2519' : '#cdb889';
  const bodyShadow = currentTarget
    ? 'drop-shadow(0 0 4px rgba(234,201,126,0.8))'
    : theme === 'night'
      ? 'drop-shadow(0 2px 3px rgba(0,0,0,0.75))'
      : 'drop-shadow(0 2px 3px rgba(74,58,32,0.32))';

  const bodyHighlighterData: IExerciseData[] = [];
  const getFreq = (level: WoundLevel) => {
    if (level === 'critical') return 3;
    if (level === 'heavy') return 2;
    if (level === 'minor') return 1;
    return 0;
  };

  if (body.head.level !== 'intact') {
    bodyHighlighterData.push({ name: '头部伤情', muscles: ['head', 'neck'], frequency: getFreq(body.head.level) });
  }
  if (body.torso.level !== 'intact') {
    bodyHighlighterData.push({ name: '躯干伤情', muscles: ['chest', 'abs', 'obliques'], frequency: getFreq(body.torso.level) });
  }
  if (body.arms.level !== 'intact') {
    bodyHighlighterData.push({ name: '双臂伤情', muscles: ['biceps', 'triceps', 'forearm', 'front-deltoids'], frequency: getFreq(body.arms.level) });
  }
  if (body.legs.level !== 'intact') {
    bodyHighlighterData.push({ name: '下肢伤情', muscles: ['quadriceps', 'abductors', 'calves', 'knees'], frequency: getFreq(body.legs.level) });
  }

  if (currentTarget === 'head') {
    bodyHighlighterData.push({ name: '头部选中', muscles: ['head', 'neck'], frequency: 4 });
  } else if (currentTarget === 'torso') {
    bodyHighlighterData.push({ name: '躯干选中', muscles: ['chest', 'abs', 'obliques'], frequency: 4 });
  } else if (currentTarget === 'legs') {
    bodyHighlighterData.push({ name: '下肢选中', muscles: ['quadriceps', 'abductors', 'calves', 'knees'], frequency: 4 });
  }

  const focusEquipmentGroup = (group: EquipmentGroup | null) => {
    setHoveredSlot(group);
  };

  return (
    <aside className={`${embedded ? 'w-full overflow-visible bg-transparent p-2' : 'h-full w-full overflow-y-auto border-r border-hairline bg-ink p-3.5'} flex select-none flex-col gap-3 font-serif text-parchment scrollbar-thin`}>
      {!embedded && (
        <div className="panel-iron relative shrink-0 overflow-hidden p-3.5">
          {lord.coatOfArms ? (
            <CoatOfArms design={lord.coatOfArms} muted className="pointer-events-none absolute -bottom-3 right-1 w-20" />
          ) : (
            <GameIcon icon={getHouseIconId(lord.houseSigil || lord.house)} className="pointer-events-none absolute -bottom-3 right-1 h-24 w-24 opacity-10 blur-[0.5px]" />
          )}

          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-gold-deep/60 bg-[#2b2417] p-1">
              {lord.coatOfArms ? (
                <CoatOfArms design={lord.coatOfArms} className="h-full" />
              ) : (
                <GameIcon icon={getHouseIconId(lord.houseSigil || lord.house)} tone="raw" className="h-full w-full drop-shadow-md" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-serif text-base font-bold leading-tight tracking-wide text-gold-bright">{lord.house}</h2>
              <p className="truncate font-serif text-xs italic text-gold-deep">“{lord.houseWords}”</p>
            </div>
          </div>

          <div className="mt-1.5 flex items-center justify-between border-t border-hairline pt-2 text-xs">
            <div>
              <span className="font-serif text-sm font-bold text-parchment">{lord.name}</span>
              <span className="ml-2 font-mono text-parchment-dim">({lord.age} 岁 · {lord.gender})</span>
            </div>
            <span className="max-w-[140px] truncate font-serif text-gold">{lord.title}</span>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-2 border-t border-hairline pt-2 font-mono text-xs">
            <div className="flex items-center justify-between border border-hairline bg-ink-2/70 px-2.5 py-1.5">
              <span className="flex items-center gap-1.5 font-bold text-gold-bright"><Coins className="h-4 w-4 text-gold" />{lord.goldDragons} <span className="text-[11px] font-normal text-parchment-dim">金龙</span></span>
              <span className="text-[11px] text-parchment-faint">{lord.silverStags} 银鹿</span>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-6 gap-1 border-t border-hairline pt-2 text-center font-serif">
            {CK3_SKILLS.map((skill) => <CompactStatCell key={skill.key} label={skill.label} val={lord.attributes[skill.key] ?? 0} icon={skill.icon} />)}
          </div>

          <div data-character-traits className="mt-2 border-t border-hairline pt-2 font-serif">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-gold"><ScrollText className="h-3.5 w-3.5" />人物特质</span>
              <span className="font-mono text-[9px] text-parchment-faint">{displayedTraits.length} 项</span>
            </div>
            {displayedTraits.length > 0 ? (
              <>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin" aria-label="人物特质列表">
                  {displayedTraits.map((trait) => {
                    const selected = activeTraitId === trait.id;
                    const description = formatTraitDescription(trait.description, lord.name);
                    return (
                      <button key={trait.id} type="button" onClick={() => setActiveTraitId(selected ? null : trait.id)} title={`${trait.name}：${description}`} aria-pressed={selected} className={`flex w-[58px] shrink-0 flex-col items-center gap-1 border px-1 py-1.5 transition-colors ${selected ? 'border-gold bg-gold-deep/20 shadow-[inset_0_0_12px_rgba(201,164,92,0.16)]' : 'border-hairline bg-ink-3/40 hover:border-gold-deep hover:bg-ink-2'}`}>
                        <GameIcon icon={trait.icon} className="h-11 w-11 shrink-0" />
                        <span className={`w-full truncate text-[9px] font-bold ${selected ? 'text-gold-bright' : 'text-parchment-dim'}`}>{trait.name}</span>
                      </button>
                    );
                  })}
                </div>
                {activeTrait && (
                  <div className="mt-2 border border-hairline-bright bg-ink-3/50 px-2.5 py-2 text-[10px] leading-relaxed">
                    <div className="flex items-center justify-between gap-2"><strong className="text-[11px] text-gold-bright">{activeTrait.name}</strong><span className="text-parchment-faint">{activeTrait.isLegacy ? '旧标签' : TRAIT_CATEGORY_LABELS[activeTrait.category]}</span></div>
                    <p className="mt-1 text-parchment-dim">{formatTraitDescription(activeTrait.description, lord.name)}</p>
                    {(formatTraitModifiers(activeTrait.modifiers) || formatTraitRuleEffects(activeTrait.rules).length > 0) && <p className="mt-1 text-gold">{[formatTraitModifiers(activeTrait.modifiers), ...formatTraitRuleEffects(activeTrait.rules)].filter(Boolean).join(' · ')}</p>}
                  </div>
                )}
              </>
            ) : <div className="border border-hairline bg-ink-3/40 py-3 text-center text-[10px] text-parchment-faint">尚未记录人物特质</div>}
          </div>
        </div>
      )}

      <div className="panel-iron flex shrink-0 flex-col gap-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow">健康与装备</p>
          <HeartPulse className="h-3.5 w-3.5 text-gold-deep" />
        </div>

        {(body.isBleeding || body.isPoisoned || body.isInfected) && (
          <div className="flex flex-wrap gap-1.5 border border-rubric/50 bg-ink-3/50 p-1.5 text-xs">
            {body.isBleeding && <span className="flex animate-pulse items-center gap-1 font-bold text-rubric-bright"><Droplets className="h-3.5 w-3.5" />持续大出血</span>}
            {body.isPoisoned && <span className="flex animate-pulse items-center gap-1 font-bold text-rubric"><Skull className="h-3.5 w-3.5" />身中剧毒</span>}
            {body.isInfected && <span className="flex items-center gap-1 font-bold text-gold-bright"><Biohazard className="h-3.5 w-3.5" />伤口发炎</span>}
          </div>
        )}

        <div className="grid gap-2 border border-hairline bg-gradient-to-b from-ink-2 via-ink-3 to-ink p-2.5 shadow-inner sm:grid-cols-[minmax(150px,0.75fr)_minmax(180px,1fr)]">
          <div className="relative min-h-[280px] overflow-hidden border border-hairline bg-ink/35">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#c9a45c_1px,transparent_1px)] [background-size:12px_12px]" />
            <div className={`body-model absolute inset-0 flex items-center justify-center ${currentTarget === 'mainhand' ? 'body-model--mainhand' : currentTarget === 'offhand' ? 'body-model--offhand' : ''}`}>
              <Model
                type="anterior"
                bodyColor={bodyFill}
                highlightedColors={['#d97706', '#b4432f', '#d4593f', '#eac97e']}
                data={bodyHighlighterData}
                style={{ width: '100%', height: '100%', maxHeight: '270px', maxWidth: '165px' }}
                svgStyle={{ filter: bodyShadow }}
              />
            </div>
          </div>
          <div className="grid content-start grid-cols-2 gap-1.5">
            {([
              ['head', '头部', body.head.level, body.head.wounds],
              ['torso', '躯干', body.torso.level, body.torso.wounds],
              ['mainhand', '主手', body.arms.level, body.arms.wounds],
              ['offhand', '副手', body.arms.level, body.arms.wounds],
              ['legs', '双腿', body.legs.level, body.legs.wounds],
            ] as const).map(([key, label, level, wounds]) => (
              <div key={key} data-body-zone={key} onMouseEnter={() => setHoveredSlot(key)} onMouseLeave={() => setHoveredSlot(null)} className={`border px-2 py-2 text-left transition-colors ${currentTarget === key ? 'border-gold bg-gold-deep/15' : 'border-hairline bg-ink-2/55'}`}>
                <span className="flex items-center justify-between gap-2"><strong className="font-serif text-[11.5px] text-parchment">{label}</strong><span className={`font-mono text-[10px] ${level === 'intact' ? 'text-gold-dim' : 'font-bold text-rubric'}`}>{getWoundLabel(level)}</span></span>
                <span className="mt-1 line-clamp-2 block font-serif text-[10px] leading-relaxed text-parchment-dim">{wounds.length ? wounds.join(' · ') : '未记录创伤'}</span>
              </div>
            ))}
            <div className="col-span-2 mt-1 border border-hairline bg-ink-3/35 px-2.5 py-2">
              <span className="eyebrow !text-[8px]">总体状态</span>
              <p className="mt-1 font-serif text-[12px] font-semibold text-gold-bright">{lord.overallStatus}</p>
            </div>
          </div>
        </div>

        {/* 长期身体状态与健康特质 */}
        <div className="space-y-1.5 border-t border-hairline/70 pt-2" data-health-traits-section>
          <div className="flex items-center justify-between">
            <span className="eyebrow !text-[9px]">长期身体状态与特质</span>
            <span className="font-mono text-[9px] text-parchment-faint">
              {displayedTraits.filter((t) => t.category === 'health' || t.id.startsWith('wound') || t.id.startsWith('scar') || t.id.startsWith('maim') || t.id.startsWith('ill') || t.id.startsWith('blind')).length ? `${displayedTraits.filter((t) => t.category === 'health' || t.id.startsWith('wound') || t.id.startsWith('scar') || t.id.startsWith('maim') || t.id.startsWith('ill') || t.id.startsWith('blind')).length} 项` : '无特殊病残'}
            </span>
          </div>
          {displayedTraits.filter((t) => t.category === 'health' || t.id.startsWith('wound') || t.id.startsWith('scar') || t.id.startsWith('maim') || t.id.startsWith('ill') || t.id.startsWith('blind')).length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {displayedTraits
                .filter((t) => t.category === 'health' || t.id.startsWith('wound') || t.id.startsWith('scar') || t.id.startsWith('maim') || t.id.startsWith('ill') || t.id.startsWith('blind'))
                .map((trait) => {
                  const isSelected = activeTraitId === trait.id;
                  return (
                    <button
                      key={trait.id}
                      type="button"
                      onClick={() => setActiveTraitId(isSelected ? null : trait.id)}
                      title={`${trait.name}：${formatTraitDescription(trait.description, lord.name)}`}
                      className={`flex items-center gap-1 border px-2 py-0.5 text-left transition-colors ${
                        isSelected
                          ? 'border-gold bg-gold-deep/20 text-gold-bright'
                          : 'border-hairline bg-ink-3/40 text-parchment hover:border-gold-deep'
                      }`}
                    >
                      <GameIcon icon={trait.icon} className="h-5 w-5 shrink-0" />
                      <span className="text-[10px] font-bold">{trait.name}</span>
                    </button>
                  );
                })}
            </div>
          ) : (
            <div className="border border-hairline/60 bg-ink-3/25 py-1 text-center text-[10px] text-parchment-faint">
              未记录长期疾病或肢体伤残
            </div>
          )}
        </div>

        <EquipmentPanel body={body} focusedGroup={currentTarget} onGroupFocus={focusEquipmentGroup} />
      </div>
    </aside>
  );
};

function getWoundLabel(level: WoundLevel): string {
  const map: Record<WoundLevel, string> = { intact: '完好', minor: '轻创', heavy: '重创', critical: '残废致命' };
  return map[level] || '完好';
}

function CompactStatCell({ label, val, icon }: { label: string; val: number; icon: GameIconId }) {
  const rank = getCk3SkillRank(val);
  const valueColor = val >= 25 ? 'text-rubric' : val >= 16 ? 'text-emerald-700' : val <= 4 ? 'text-rubric-bright' : 'text-gold-bright';
  return (
    <div className="flex flex-col items-center justify-center border border-hairline bg-ink-2/70 px-0.5 py-1 transition-colors hover:border-gold-deep" title={`${label}：${rank}`}>
      <GameIcon icon={icon} className="h-12 w-12 shrink-0 drop-shadow-md" />
      <span className={`-mt-1 font-display text-xs font-bold leading-none ${valueColor}`}>{val}</span>
    </div>
  );
}
