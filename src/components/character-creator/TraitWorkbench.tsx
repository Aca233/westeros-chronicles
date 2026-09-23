import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, Search } from 'lucide-react';
import { CHARACTER_TRAITS, calculateFinalAttributes, formatTraitDescription, formatTraitModifiers, formatTraitRuleEffects, isDerivedInjuryTraitId } from '../../data/characterTraits';
import { CK3_SKILLS } from '../../data/ck3Skills';
import { CREATION_APPROACHES, approachTraitContributions, previewCreationApproach, type CreationApproach } from '../../features/characters/creationApproaches';
import type { CharacterCreationDraft } from '../../features/characters/customCharacterStart';
import { CREATION_TRAIT_GROUPS, MAX_LEARNING_TARGETS, creationBudget, creationTraitBlock, creationTraitGroup, creationTraitPrice, creationTraitRequirement, isLearningTarget, learningRoute, previewCreationTrait, traitNeedsBackground, type CreationTraitGroup } from '../../features/characters/creationTraitRules';
import { GameIcon } from '../GameIcon';
import { TraitSourceLegend, TraitSourceTag } from './CharacterReadoutPanel';
import { TRAIT_SOURCES, traitSourceOf } from './characterReadout';

interface Props {
  draft: CharacterCreationDraft;
  inspectedId: string | null;
  onInspect: (id: string) => void;
  onToggle: (id: string) => void;
  onChange: (patch: Partial<CharacterCreationDraft>) => void;
  catalogState: 'loading' | 'ready' | 'error';
  onRetryCatalog: () => void;
}

export function TraitWorkbench(props: Props) {
  const { draft, inspectedId, onInspect } = props;
  const [group, setGroup] = useState<CreationTraitGroup>('personality');
  const [query, setQuery] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [onlyRelevant, setOnlyRelevant] = useState(false);
  const [approachId, setApproachId] = useState<CreationApproach['id']>('grapple');
  const libraryRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLDivElement>(null);
  const approach = CREATION_APPROACHES.find((entry) => entry.id === approachId)!;
  const relevantIds = useMemo(() => new Set(approachTraitContributions({ ...draft, traitIds: CHARACTER_TRAITS.map((trait) => trait.id) }, approach).map((entry) => entry.trait.id)), [draft.attributes, draft.age, approach]);
  const selected = CHARACTER_TRAITS.filter((trait) => draft.traitIds.includes(trait.id));
  useEffect(() => {
    if (inspectedId && window.matchMedia('(max-width: 1279px)').matches) inspectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [inspectedId]);
  const visible = useMemo(() => CHARACTER_TRAITS.filter((trait) => {
    if (isDerivedInjuryTraitId(trait.id)) return false;
    if (onlySelected && !draft.traitIds.includes(trait.id) && !draft.learningTraitIds?.includes(trait.id)) return false;
    if (onlyRelevant && !relevantIds.has(trait.id)) return false;
    const text = query.trim().toLocaleLowerCase('zh-CN');
    if (text && !`${trait.name} ${trait.description} ${formatTraitRuleEffects(trait.rules).join(' ')}`.toLocaleLowerCase('zh-CN').includes(text)) return false;
    return Boolean(text) || onlySelected || onlyRelevant || creationTraitGroup(trait) === group;
  }), [draft.traitIds, draft.learningTraitIds, group, onlySelected, onlyRelevant, query, relevantIds]);

  return <section aria-label="特质工作台" className="trait-workbench">
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Traits & Approaches</p><h2 className="mt-1 font-serif text-xl text-gold-bright">特质与实际做法</h2><p className="mt-1 text-xs text-parchment-dim">相容特质不限数量，每项都按标价花费或返还。</p></div></div>
    <div className="flex flex-wrap items-center gap-2 border border-hairline bg-ink/35 p-2" data-approach-filter>
      <label className="flex min-w-64 flex-1 items-center gap-2 text-xs text-parchment-dim"><span className="shrink-0 text-gold-deep">看一种做法</span><select className="creator-input !py-2" value={approachId} onChange={(event) => setApproachId(event.target.value as CreationApproach['id'])}>{['交锋', '交涉', '谋生'].map((area) => <optgroup key={area} label={area}>{CREATION_APPROACHES.filter((entry) => entry.area === area).map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</optgroup>)}</select></label>
      <button type="button" aria-pressed={onlyRelevant} onClick={() => setOnlyRelevant((value) => !value)} className={`border px-3 py-2 text-xs ${onlyRelevant ? 'border-gold text-gold' : 'border-hairline text-parchment-dim'}`}>只看相关</button>
      <details className="w-full border-t border-hairline pt-2 text-[11px] text-parchment-faint"><summary className="cursor-pointer text-parchment-dim">“{approach.action}”的前提</summary><p className="mt-1 leading-relaxed">{approach.condition}</p></details>
    </div>
    <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
      <div ref={libraryRef} className="min-w-0">
        <div className="grid grid-cols-2 gap-1 bg-ink p-1 sm:grid-cols-4" role="group" aria-label="特质分类">{CREATION_TRAIT_GROUPS.map((entry) => <button key={entry.id} type="button" aria-pressed={group === entry.id && !onlySelected && !query && !onlyRelevant} onClick={() => { setGroup(entry.id); setQuery(''); setOnlySelected(false); setOnlyRelevant(false); }} className={`px-2 py-3 text-sm transition-colors ${group === entry.id && !onlySelected && !query && !onlyRelevant ? 'bg-gold-deep/25 text-gold-bright' : 'text-parchment-dim hover:bg-ink-3'}`}>{entry.label}</button>)}</div>
        <p className="mt-2 text-xs leading-relaxed text-parchment-dim">{onlySelected ? '检查已掌握的特质和成长方向。' : onlyRelevant ? `筛出会影响“${approach.label}”的特质。` : query ? '正在搜索全部分类。' : CREATION_TRAIT_GROUPS.find((entry) => entry.id === group)?.description}</p>
        <div className="mt-2 flex gap-2"><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-parchment-faint" /><input className="creator-input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按名称、描述或规则效果搜索" aria-label="搜索特质" /></label><button type="button" aria-pressed={onlySelected} onClick={() => setOnlySelected((value) => !value)} className={`border px-3 text-xs ${onlySelected ? 'border-gold text-gold' : 'border-hairline text-parchment-dim'}`}>已选 {selected.length}</button></div>
        <div className="mt-3 flex justify-between text-xs text-parchment-faint"><span>{visible.length} 项</span><span>性格不限数量 · 互斥项仍会替换</span></div>
        <div className="creator-trait-browser mt-2 grid max-h-[54vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2" aria-label="特质库">{visible.map((trait) => {
          const active = draft.traitIds.includes(trait.id);
          const learning = draft.learningTraitIds?.includes(trait.id);
          const block = creationTraitBlock(trait, draft);
          const needs = creationTraitRequirement(trait, draft);
          const cost = creationTraitPrice(trait);
          const relevant = relevantIds.has(trait.id);
          return <button key={trait.id} type="button" onClick={() => onInspect(trait.id)} aria-pressed={inspectedId === trait.id} className={`relative flex gap-3 border p-3 text-left transition-colors ${inspectedId === trait.id ? 'border-gold bg-gold-deep/15' : active ? 'border-gold-deep/60 bg-ink' : 'border-hairline bg-ink/35 hover:border-gold-deep'} ${block ? 'opacity-60' : ''}`}><GameIcon icon={trait.icon} className="h-12 w-12 shrink-0" /><span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><strong className="text-sm font-medium text-parchment">{trait.name}</strong><span className={`shrink-0 text-xs ${cost < 0 ? 'text-parchment-dim' : 'text-gold'}`}>{cost < 0 ? `返还 ${-cost}` : `${cost} 点`}</span></span><span className="mt-1.5 block line-clamp-2 text-xs leading-relaxed text-parchment-dim">{formatTraitDescription(trait.description, draft.name)}</span><span className="mt-2 flex flex-wrap items-center gap-1 text-xs text-gold-deep">{active ? <><Check className="h-3.5 w-3.5" />已选<TraitSourceTag draft={draft} traitId={trait.id} full /></> : learning ? <><BookOpen className="h-3.5 w-3.5" />成长方向</> : block ? '当前不可选' : needs ? '需要补充背景' : '查看加入前后'}{relevant && <span className="ml-auto border border-gold-deep/40 px-1 text-[9px]">影响此做法</span>}</span></span></button>;
        })}{!visible.length && <p className="col-span-full border border-dashed border-hairline p-8 text-center text-sm text-parchment-faint">没有符合条件的特质。</p>}</div>
      </div>
      <div ref={inspectorRef} className="scroll-mt-14"><button type="button" onClick={() => libraryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="mb-2 text-xs text-gold underline underline-offset-4 xl:hidden">返回特质列表</button><TraitInspector {...props} approach={approach} /></div>
    </div>
  </section>;
}

export function TraitInspector({ draft, inspectedId, onToggle, onChange, approach, catalogState, onRetryCatalog }: Props & { approach: CreationApproach }) {
  const trait = CHARACTER_TRAITS.find((entry) => entry.id === inspectedId);
  const canPreview = catalogState === 'ready' && Boolean(draft.location);
  const currentAction = canPreview ? previewCreationApproach(draft, approach) : undefined;
  if (!trait) return <section className="border border-dashed border-hairline p-4"><h3 className="font-serif text-base text-gold">加入前后会怎样</h3><p className="mt-2 text-sm leading-relaxed text-parchment-dim">从左侧选择一项特质。这里会并排显示能力、预算和当前做法的变化。</p><ApproachNotice preview={currentAction} approach={approach} catalogState={catalogState} hasLocation={Boolean(draft.location)} onRetry={onRetryCatalog} /></section>;
  const traitPreview = previewCreationTrait(draft, trait.id);
  const selected = draft.traitIds.includes(trait.id);
  const learning = draft.learningTraitIds?.includes(trait.id) ?? false;
  const targets = draft.learningTraitIds ?? [];
  const current = calculateFinalAttributes(draft.attributes, draft.traitIds);
  const next = calculateFinalAttributes(draft.attributes, traitPreview.traitIds);
  const currentBudget = creationBudget(draft.attributes, draft.traitIds).total;
  const nextBudget = creationBudget(draft.attributes, traitPreview.traitIds).total;
  const nextAction = canPreview && !traitPreview.blocked ? previewCreationApproach({ ...draft, traitIds: traitPreview.traitIds }, approach) : undefined;
  const effects = formatTraitRuleEffects(trait.rules);
  const requirement = creationTraitRequirement(trait, draft);
  const learningBlock = creationTraitBlock(trait, draft);
  const currentContribution = approachTraitContributions({ ...draft, traitIds: [trait.id] }, approach).find((entry) => entry.trait.id === trait.id);
  return <section className="border border-gold-deep/50 bg-ink-2 p-4" aria-label="特质比较" data-inline-trait-inspector>
    <div className="flex items-center gap-3"><GameIcon icon={trait.icon} className="h-14 w-14 shrink-0" /><div><h3 className="font-serif text-lg text-gold-bright">{trait.name}</h3><p className="mt-1 text-xs text-parchment-dim">{selected ? `已掌握 · ${TRAIT_SOURCES[traitSourceOf(draft, trait.id)].label}` : learning ? '成长方向 · 尚未掌握' : '加入前后比较'}</p></div></div>
    <p className="mt-3 text-sm leading-relaxed text-parchment">{formatTraitDescription(trait.description, draft.name)}</p>{(selected || learning) && <TraitSourceLegend draft={draft} trait={trait} />}
    <p className="mt-3 text-xs leading-relaxed text-gold">{formatTraitModifiers(trait.modifiers) || '不直接改变六项能力'}</p>{!!effects.length && <ul className="mt-3 space-y-2 text-xs leading-relaxed text-parchment-dim">{effects.map((effect, index) => <li key={index}>{effect}</li>)}</ul>}
    {currentContribution && <div className="mt-3 border-l-2 border-gold-deep pl-2 text-xs leading-relaxed text-parchment-dim"><p>它会{currentContribution.contribution > 0 ? '支持' : currentContribution.contribution < 0 ? '牵制' : '改变'}“{approach.label}”。这是规则来源提示，不是可直接相加的精确总值。</p>{currentContribution.edges.map((edge) => <p key={edge.label} className="mt-1 text-gold">失手时还能：{edge.label}。{edge.directive}</p>)}</div>}
    {!traitPreview.blocked && <div className="mt-4 grid grid-cols-2 border-y border-hairline py-3 text-xs"><div className="pr-3"><span className="text-parchment-faint">现在</span><strong className="mt-1 block text-base text-parchment">{currentBudget} 点</strong></div><div className="border-l border-hairline pl-3"><span className="text-parchment-faint">{selected ? '移除后' : '加入后'}</span><strong className="mt-1 block text-base text-gold">{nextBudget} 点 <small>({nextBudget - currentBudget > 0 ? '+' : ''}{nextBudget - currentBudget})</small></strong></div>{CK3_SKILLS.filter((skill) => current[skill.key] !== next[skill.key]).map((skill) => <div key={skill.key} className="col-span-2 mt-2 flex justify-between text-parchment-dim"><span>{skill.label}</span><span className="flex items-center gap-2">{current[skill.key]}<ArrowRight className="h-3 w-3" />{next[skill.key]}</span></div>)}</div>}
    {currentAction && nextAction && <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><OutcomeColumn label="当前做法" preview={currentAction} /><OutcomeColumn label={selected ? '移除以后' : '加入以后'} preview={nextAction} /></div>}
    <ApproachNotice preview={currentAction} approach={approach} catalogState={catalogState} hasLocation={Boolean(draft.location)} onRetry={onRetryCatalog} />
    {!!traitPreview.replaces.length && <p className="mt-3 text-xs leading-relaxed text-gold">将替换：{traitPreview.replaces.map((id) => CHARACTER_TRAITS.find((entry) => entry.id === id)?.name).join('、')}</p>}{traitPreview.blocked && <p role="status" className="mt-3 text-xs leading-relaxed text-rubric-bright">{traitPreview.blocked}</p>}{requirement && !traitPreview.blocked && <p className="mt-3 text-xs leading-relaxed text-gold">{requirement}</p>}
    {traitNeedsBackground(trait) && !creationTraitBlock(trait, draft) && <label className="mt-3 block text-xs text-parchment-dim">公开往事<textarea className="creator-input mt-2 min-h-24 resize-y" value={draft.traitBackgrounds?.[trait.id] ?? ''} maxLength={400} placeholder="写清经历、关系及这项名声的由来。" onChange={(event) => onChange({ traitBackgrounds: { ...draft.traitBackgrounds, [trait.id]: event.target.value } })} /></label>}
    <button type="button" disabled={!!traitPreview.blocked} onClick={() => onToggle(trait.id)} className="btn-decree mt-4 w-full justify-center text-sm disabled:opacity-40">{selected ? '移除此特质' : traitPreview.replaces.length ? '替换并掌握' : '加入人物'}</button>
    {isLearningTarget(trait) && <div className="mt-4 border-t border-hairline pt-3"><h4 className="flex items-center gap-2 text-sm text-gold"><BookOpen className="h-4 w-4" />也可以在游戏中学习</h4><p className="mt-2 text-xs leading-relaxed text-parchment-dim">{learningRoute(trait)}</p><button type="button" disabled={!learning && (!!learningBlock || targets.length >= MAX_LEARNING_TARGETS)} onClick={() => onChange({ learningTraitIds: learning ? targets.filter((id) => id !== trait.id) : [...targets, trait.id], ...(selected && !learning ? { traitIds: draft.traitIds.filter((id) => id !== trait.id), backgroundTraitIds: (draft.backgroundTraitIds ?? []).filter((id) => id !== trait.id), ...(trait.category === 'education' ? { educationMode: 'manual' as const } : {}) } : {}) })} className="mt-3 w-full border border-gold-deep px-3 py-2 text-xs text-gold disabled:opacity-40">{learning ? '取消成长方向' : selected ? '改为成长方向（移除当前效果）' : `设为成长方向 · 不收费 · ${targets.length}/${MAX_LEARNING_TARGETS}`}</button></div>}
  </section>;
}

type ApproachResult = ReturnType<typeof previewCreationApproach>;
function OutcomeColumn({ label, preview }: { label: string; preview: ApproachResult }) { return <div className="border border-hairline bg-ink/50 p-2"><strong className="text-gold">{label}</strong><p className="mt-1 text-parchment-dim">20 种骰面结果中</p><p className="mt-1 text-parchment-dim">优势成功 {preview.counts.strong_success} · 成功 {preview.counts.success}</p><p className="text-parchment-faint">有代价 {preview.counts.partial} · 失败 {preview.counts.failure}</p></div>; }
function ApproachNotice({ preview, approach, catalogState, hasLocation, onRetry }: { preview?: ApproachResult; approach: CreationApproach; catalogState: Props['catalogState']; hasLocation: boolean; onRetry: () => void }) {
  if (catalogState === 'error') return <p className="mt-4 text-xs text-rubric-bright">装备资料读取失败。<button type="button" onClick={onRetry} className="ml-2 text-gold underline">重试</button></p>;
  if (catalogState === 'loading') return <p className="mt-4 text-xs text-parchment-faint">正在读取实际装备，稍后显示做法示例。</p>;
  if (!hasLocation) return <p className="mt-4 text-xs text-parchment-faint">选定真实地点后，才能用正式开局行装演算。</p>;
  if (!preview) return null;
  return <details className="mt-4 border-t border-hairline pt-3 text-xs text-parchment-dim"><summary className="cursor-pointer text-gold-deep">查看示例条件与检定明细</summary><p className="mt-2">固定示例：{approach.label}，难度 {preview.check.dc}；20 个骰面逐一用正式检定引擎演算。</p><p className="mt-1">第 10 面：能力 {signed(preview.example.attributeModifier)} · 装备 {signed(preview.example.equipmentModifier)} · 特质 {signed(preview.example.traitModifier)}</p><p className="mt-2 text-parchment-faint">这里只比较方法。实际游戏会另计对手、地形、当前伤势和当时判断的行动难度，玩家仍可自由描述任何行动。</p></details>;
}
function signed(value: number) { return value >= 0 ? `+${value}` : String(value); }
