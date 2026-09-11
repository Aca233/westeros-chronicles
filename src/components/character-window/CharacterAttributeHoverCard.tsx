import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Ck3SkillDefinition } from '../../data/ck3Skills';
import { getCk3SkillRank } from '../../data/ck3Skills';
import type { ResolvedCharacterTrait } from '../../data/characterTraits';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { aggregateEquippedItemEffects } from '../../features/items/effects';
import { getAttributeModifier } from '../../services/diceEngine';
import type { TraitCheckDomain } from '../../services/traitEffectEngine';
import type { LordAttributes, LordProfile } from '../../types/game';
import { GameIcon } from '../GameIcon';

const ATTRIBUTE_CHECK_DOMAINS: Record<keyof LordAttributes, readonly TraitCheckDomain[]> = {
  diplomacy: ['diplomacy', 'seduction', 'intimidation'],
  martial: ['battle'],
  stewardship: ['stewardship'],
  intrigue: ['intrigue'],
  learning: ['learning', 'medicine', 'survival'],
  prowess: ['duel', 'resistFear', 'survival'],
};

const DOMAIN_LABELS: Record<TraitCheckDomain, string> = {
  duel: '个人战斗',
  battle: '战争指挥',
  intrigue: '秘密行动',
  stewardship: '治理',
  diplomacy: '交涉',
  learning: '研究辨识',
  medicine: '治疗',
  survival: '生存行动',
  intimidation: '恐吓',
  seduction: '勾引',
  resistFear: '克服恐惧',
};

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`;
}

export function CharacterAttributeHoverCard({
  skill,
  value,
  baseValue,
  traits,
  items,
  isNpcArchive = false,
  children,
}: {
  skill: Ck3SkillDefinition;
  value: number;
  baseValue?: number;
  traits: readonly ResolvedCharacterTrait[];
  /** 玩家传自己的装备状态；NPC 没有随身装备系统，省略即可。 */
  items?: LordProfile['items'];
  /** 静态人物档案只保存最终属性值，没有基础值可比，措辞需要区分于"旧存档缺少基础属性"。 */
  isNpcArchive?: boolean;
  children: React.ReactNode;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const domains = ATTRIBUTE_CHECK_DOMAINS[skill.key];
  const directTraitModifiers = useMemo(() => traits.flatMap((trait) => {
    const modifier = trait.modifiers[skill.key];
    return typeof modifier === 'number' && modifier !== 0 ? [{ trait, modifier }] : [];
  }), [skill.key, traits]);
  const directTraitTotal = directTraitModifiers.reduce((sum, entry) => sum + entry.modifier, 0);
  const rawPanelValue = typeof baseValue === 'number' ? baseValue + directTraitTotal : undefined;
  const traitCalculatedValue = rawPanelValue === undefined ? undefined : Math.max(0, Math.min(100, rawPanelValue));
  const otherPersistentModifier = traitCalculatedValue === undefined ? 0 : value - traitCalculatedValue;

  const contextualTraitModifiers = useMemo(() => traits.flatMap((trait) => (
    Object.entries(trait.rules.checkModifiers ?? {}).flatMap(([domain, modifier]) => (
      domains.includes(domain as TraitCheckDomain) && typeof modifier === 'number' && modifier !== 0
        ? [{ name: trait.name, domain: domain as TraitCheckDomain, value: modifier }]
        : []
    ))
  )), [domains, traits]);

  // NPC 没有随身装备系统：省略 items 时只统计特质检定修正，不编造装备加成。
  const contextualEquipmentModifiers = useMemo(() => (items ? aggregateEquippedItemEffects(items, ITEM_CATALOG).active : []).flatMap((entry) => {
    const effect = entry.effect;
    if (effect.kind !== 'check_modifier' || !domains.includes(effect.domain)) return [];
    return [{
      name: entry.itemName,
      label: effect.label,
      domain: effect.domain,
      value: effect.value,
      conditional: Boolean(effect.condition),
    }];
  }), [domains, items]);

  const open = (target: HTMLElement) => setAnchor(target.getBoundingClientRect());
  const close = () => setAnchor(null);

  let tooltip: React.ReactNode = null;
  if (anchor && typeof document !== 'undefined' && typeof window !== 'undefined') {
    const width = Math.min(390, window.innerWidth - 24);
    const estimatedHeight = 430;
    const gap = 10;
    const left = anchor.right + gap + width <= window.innerWidth - 12
      ? anchor.right + gap
      : Math.max(12, anchor.left - width - gap);
    const top = Math.max(12, Math.min(anchor.top - 18, window.innerHeight - estimatedHeight - 12));
    const abilityContribution = getAttributeModifier(value);

    tooltip = createPortal(
      <div
        role="tooltip"
        className="panel-iron pointer-events-none fixed z-[100] p-3.5 shadow-[0_18px_48px_rgba(0,0,0,0.58)]"
        style={{ left, top, width }}
      >
        <div className="flex items-start gap-3">
          <GameIcon icon={skill.icon} className="h-12 w-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <strong className="font-serif text-[15px] text-parchment">{skill.label}</strong>
              <span className="font-display text-[18px] font-bold text-gold-bright">{value}</span>
            </div>
            <div className="mt-0.5 text-[9px] tracking-[0.1em] text-parchment-faint">
              {skill.englishLabel} · {getCk3SkillRank(value)}
            </div>

            <section className="mt-3 border-t border-hairline/70 pt-2.5">
              <div className="mb-1.5 flex items-center justify-between font-mono text-[9px]">
                <span className="text-parchment-faint">面板六维构成</span>
                <span className="text-gold">最终 {value}</span>
              </div>
              {typeof baseValue === 'number' ? (
                <div className="space-y-1 font-mono text-[10px] leading-relaxed">
                  <div className="flex justify-between gap-3 text-parchment-dim">
                    <span>基础 / 永久成长</span><span>{baseValue}</span>
                  </div>
                  {directTraitModifiers.map(({ trait, modifier }) => (
                    <div key={trait.id} className="flex justify-between gap-3 text-parchment-dim">
                      <span className="truncate">特质 · {trait.name}</span>
                      <span className={modifier > 0 ? 'text-gold' : 'text-rubric-bright'}>{signed(modifier)}</span>
                    </div>
                  ))}
                  {rawPanelValue !== undefined && rawPanelValue !== traitCalculatedValue && (
                    <div className="flex justify-between gap-3 text-parchment-faint">
                      <span>属性边界 0～100</span><span>{rawPanelValue} → {traitCalculatedValue}</span>
                    </div>
                  )}
                  {otherPersistentModifier !== 0 && (
                    <div className="flex justify-between gap-3 text-parchment-dim">
                      <span>其他常驻修正</span>
                      <span className={otherPersistentModifier > 0 ? 'text-gold' : 'text-rubric-bright'}>{signed(otherPersistentModifier)}</span>
                    </div>
                  )}
                  <div className="mt-1.5 flex justify-between gap-3 border-t border-hairline/60 pt-1.5 font-bold text-parchment">
                    <span>结算结果</span><span>{value}</span>
                  </div>
                </div>
              ) : (
                <p className="font-serif text-[10px] leading-relaxed text-parchment-faint">
                  {isNpcArchive
                    ? `稳定人物档案只记录最终属性值，不拆分基础成长与修正；当前为 ${value}。`
                    : `旧存档没有保留基础属性，无法可靠反推永久成长来源；当前最终值为 ${value}。`}
                </p>
              )}
            </section>

            <section className="mt-3 border-t border-hairline/70 pt-2.5">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-parchment-faint">进入 D20 检定</span>
                <span className="text-parchment">{value} ÷ 5 = {signed(abilityContribution)}</span>
              </div>
              {(contextualTraitModifiers.length > 0 || contextualEquipmentModifiers.length > 0) && (
                <div className="mt-2 space-y-1 font-mono text-[9.5px] leading-relaxed">
                  {contextualTraitModifiers.map((entry, index) => (
                    <div key={`trait:${entry.name}:${entry.domain}:${index}`} className="flex justify-between gap-3 text-parchment-dim">
                      <span className="min-w-0 truncate">特质 · {entry.name} · {DOMAIN_LABELS[entry.domain]}</span>
                      <span className={entry.value > 0 ? 'text-gold' : 'text-rubric-bright'}>{signed(entry.value)}</span>
                    </div>
                  ))}
                  {contextualEquipmentModifiers.map((entry, index) => (
                    <div key={`item:${entry.name}:${entry.domain}:${index}`} className="flex justify-between gap-3 text-parchment-dim">
                      <span className="min-w-0 truncate">装备 · {entry.name} · {entry.label}{entry.conditional ? '（条件）' : ''}</span>
                      <span className={entry.value > 0 ? 'text-gold' : 'text-rubric-bright'}>{signed(entry.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <>
      <span
        className="group flex min-w-0 cursor-help flex-col items-center outline-none"
        tabIndex={0}
        aria-label={`${skill.label} ${value}，悬停查看计算明细`}
        onMouseEnter={(event) => open(event.currentTarget)}
        onMouseLeave={close}
        onFocus={(event) => open(event.currentTarget)}
        onBlur={close}
      >
        {children}
      </span>
      {tooltip}
    </>
  );
}
