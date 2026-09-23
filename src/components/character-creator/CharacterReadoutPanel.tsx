import { Minus, Plus, RotateCcw, ShieldAlert, Sparkles } from 'lucide-react';
import { DESIGN_POINT_LIMIT, type CharacterTraitDefinition } from '../../data/characterTraits';
import type { LordAttributes } from '../../types/game';
import type { CharacterCreationDraft, CharacterCreationValidation } from '../../features/characters/customCharacterStart';
import { GameIcon } from '../GameIcon';
import { TRAIT_SOURCES, formatDelta, traitSourceOf, type CharacterReadout, type ReadoutHighlight, type SkillReadout, type TraitSourceId } from './characterReadout';

const TONE_CLASS: Record<ReadoutHighlight['tone'], string> = {
  gold: 'border-gold-deep/60 text-gold-bright',
  rubric: 'border-rubric/50 text-rubric-bright',
  plain: 'border-hairline text-parchment-dim',
};

export function TraitSourceTag({ draft, traitId, full = false }: { draft: CharacterCreationDraft; traitId: string; full?: boolean }) {
  const source = TRAIT_SOURCES[traitSourceOf(draft, traitId)];
  return (
    <span
      title={source.hint}
      data-trait-source={source.id}
      className={`inline-flex shrink-0 items-center border bg-ink/85 px-1 leading-[1.4] ${source.tone === 'gold' ? 'border-gold-deep/70 text-gold' : 'border-hairline text-parchment-faint'}`}
    >
      {full ? source.label : source.short}
    </span>
  );
}

export function TraitSourceLegend({ draft, trait }: { draft: CharacterCreationDraft; trait: CharacterTraitDefinition }) {
  const source = TRAIT_SOURCES[traitSourceOf(draft, trait.id)];
  return <p className="mt-2 text-[10px] leading-relaxed text-parchment-faint" data-trait-source-legend={source.id}>来源：{source.label} · {source.hint}</p>;
}

function HighlightList({ title, entries, empty }: { title: string; entries: ReadoutHighlight[]; empty: string }) {
  return (
    <div className="mt-3">
      <h4 className="text-[10px] tracking-[0.16em] text-gold-deep">{title}</h4>
      {entries.length === 0
        ? <p className="mt-1.5 text-[11px] leading-relaxed text-parchment-faint">{empty}</p>
        : <ul className="mt-1.5 space-y-1.5">{entries.map((entry) => (
          <li key={entry.id} className={`border-l-2 pl-2 ${TONE_CLASS[entry.tone]}`}>
            <span className="block text-[11px] font-bold">{entry.label}</span>
            <span className="block text-[10px] leading-relaxed text-parchment-faint">{entry.detail}</span>
          </li>
        ))}</ul>}
    </div>
  );
}

export function CharacterReadoutPanel({ draft, validation, readout }: { draft: CharacterCreationDraft; validation: CharacterCreationValidation; readout: CharacterReadout }) {
  const riskTone = readout.risk.level === '高' ? 'text-rubric-bright' : readout.risk.level === '中' ? 'text-gold' : 'text-parchment-dim';
  return (
    <section aria-label="人物概览" data-creator-readout className="border border-hairline bg-ink-2/60 p-3">
      <div className="flex items-start justify-between gap-2 border-b border-hairline pb-2">
        <div className="min-w-0">
          <p className="eyebrow">Overview</p>
          <h2 className="mt-1 font-serif text-base text-gold-bright">人物概览</h2>
        </div>
        <span className="shrink-0 border border-hairline px-1.5 py-0.5 text-[10px] text-parchment-faint" title="只归纳你已选定的事实，不改变任何规则。">阅读参考</span>
      </div>

      <p className="mt-2.5 font-serif text-sm text-parchment">{readout.headline}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-parchment-dim">{readout.summary}</p>

      <HighlightList title="优势" entries={readout.strengths} empty="还没有明确的优势：可以加一项本事，或先定下家族与关系。" />
      <HighlightList title="弱点与空缺" entries={readout.weaknesses} empty="没有发现明显短板。" />

      <div className="mt-3 space-y-1.5 border-t border-hairline pt-2.5 text-[11px]">
        <div className="flex justify-between gap-2"><span className="text-parchment-faint">社会地位</span><span className="max-w-[62%] truncate text-right text-parchment-dim" title={readout.standing.title}>{readout.standing.title}</span></div>
        <div className="flex justify-between gap-2"><span className="text-parchment-faint">开局风险</span><span className={`text-right ${riskTone}`}>{readout.risk.level}</span></div>
        <p className="leading-relaxed text-parchment-faint">{readout.risk.detail}</p>
      </div>

      <details className="mt-3 border-t border-hairline pt-2.5" data-creator-advanced>
        <summary className="cursor-pointer text-[11px] text-parchment-faint hover:text-parchment-dim">高级明细：设计点数与开局事实</summary>
        <div className="mt-2" aria-label="设计点数明细">
          <div className="flex items-end justify-between">
            <div><span className="text-[11px] text-parchment-faint">设计点数明细</span><div className="mt-1 font-display text-2xl text-gold-bright">{validation.usedDesignPoints}<span className="ml-1 text-[10px] text-parchment-faint">已用</span></div></div>
            <div className={`text-right ${validation.remainingDesignPoints < 0 ? 'text-rubric-bright' : 'text-gold'}`}>
              <span className="block text-[11px]">剩余 / {DESIGN_POINT_LIMIT}</span>
              <strong className="font-display text-xl">{validation.remainingDesignPoints}</strong>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-hairline pt-2 text-[11px] text-parchment-dim">
            <div className="flex justify-between"><span>能力</span><span>{validation.budget.abilities}</span></div>
            <div className="flex justify-between"><span>本事</span><span>{validation.budget.skills}</span></div>
            <div className="flex justify-between"><span>身体与天赋</span><span>{validation.budget.body}</span></div>
            <div className="flex justify-between"><span>性格</span><span>{validation.budget.personality}</span></div>
            <div className="flex justify-between"><span>身份与名声</span><span>{validation.budget.identity}</span></div>
            <div className="flex justify-between"><span>返还计入</span><span>−{validation.budget.refund}</span></div>
            <div className="flex justify-between"><span>原始返还</span><span>{validation.budget.rawRefund}</span></div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5 border-t border-hairline pt-2.5 text-[11px] text-parchment-dim">
          {readout.ties.map((line) => <div key={line} className="leading-relaxed">{line}</div>)}
          <div>已选特质：{draft.traitIds.length} 项 · 成长方向：{(draft.learningTraitIds ?? []).length} 项</div>
        </div>
      </details>
    </section>
  );
}

export function AttributeBoard({
  readouts,
  onChange,
}: {
  readouts: SkillReadout[];
  onChange: (key: keyof LordAttributes, delta: number) => void;
}) {
  return (
    <section aria-label="六项能力" data-creator-attributes className="mt-4">
      <div className="border-b border-hairline pb-2">
        <p className="eyebrow">Attributes</p>
        <h2 className="mt-1 font-serif text-base text-gold-bright">六项能力</h2>
        <p className="mt-1.5 text-[10px] leading-relaxed text-parchment-faint">基础值随身份与经历变化，是你手动调整前的起点；特质修正在基础值之上结算，最终值就是进入游戏时使用的数值。</p>
      </div>
      <div className="mt-2.5 space-y-1.5">
        {readouts.map((skill) => (
          <div key={skill.key} className="border border-hairline bg-ink-2/60 px-2.5 py-2" data-skill-row={skill.key}>
            <div className="flex items-center gap-2.5">
              <GameIcon icon={skill.definition.icon} className="h-9 w-9 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-xs font-bold text-parchment">{skill.definition.label}</span>
                  <span className="text-[10px] text-parchment-faint">{skill.rank}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-parchment-faint">
                  <span>基础 <strong className="font-mono text-parchment-dim">{skill.base}</strong></span>
                  <span className={skill.traitDelta > 0 ? 'text-gold' : skill.traitDelta < 0 ? 'text-rubric-bright' : ''}>特质 {skill.traitDelta === 0 ? '±0' : formatDelta(skill.traitDelta)}</span>
                  <span>最终 <strong className="font-mono text-gold-bright">{skill.final}</strong></span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => onChange(skill.key, -1)} disabled={skill.base <= 0} aria-label={`降低${skill.definition.label}`} className="creator-stat-button"><Minus className="h-3 w-3" /></button>
                <button type="button" onClick={() => onChange(skill.key, 1)} disabled={skill.base >= 30} aria-label={`提高${skill.definition.label}`} className="creator-stat-button"><Plus className="h-3 w-3" /></button>
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-2 border-t border-hairline pt-1.5 text-[10px] text-parchment-faint">
              <span>背景建议 {skill.suggested}</span>
              <span className={skill.manual === 0 ? '' : skill.manual > 0 ? 'text-gold' : 'text-rubric-bright'}>手动 {skill.manual === 0 ? '未调整' : formatDelta(skill.manual)}</span>
              {skill.manual !== 0 && <button type="button" onClick={() => onChange(skill.key, -skill.manual)} className="ml-auto inline-flex items-center gap-1 text-gold underline underline-offset-2"><RotateCcw className="h-3 w-3" />回到建议值</button>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CreatorTraitSummary({ draft, readouts }: { draft: CharacterCreationDraft; readouts: SkillReadout[] }) {
  const best = [...readouts].sort((a, b) => b.final - a.final)[0];
  const counts = (['background', 'innate', 'chosen', 'growth'] as TraitSourceId[])
    .map((id) => ({ id, count: id === 'growth' ? (draft.learningTraitIds ?? []).length : draft.traitIds.filter((traitId) => traitSourceOf(draft, traitId) === id).length }))
    .filter((entry) => entry.count > 0);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-parchment-faint" data-creator-trait-summary>
      <span className="inline-flex items-center gap-1 text-gold-deep"><Sparkles className="h-3 w-3" />{best ? `最强项 ${best.definition.label} ${best.final}` : '尚未分配能力'}</span>
      {counts.map((entry) => <span key={entry.id}>{TRAIT_SOURCES[entry.id].short} {entry.count}</span>)}
      {counts.length === 0 && <span className="inline-flex items-center gap-1"><ShieldAlert className="h-3 w-3" />尚无特质</span>}
    </div>
  );
}
