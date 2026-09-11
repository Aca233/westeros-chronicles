import { useMemo, useState } from 'react';
import { Check, Search, X, BookOpen, ArrowRight } from 'lucide-react';
import { CHARACTER_TRAITS, calculateFinalAttributes, formatTraitDescription, formatTraitModifiers, formatTraitRuleEffects, isDerivedInjuryTraitId } from '../../data/characterTraits';
import { CK3_SKILLS } from '../../data/ck3Skills';
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
}

export function TraitWorkbench({ draft, inspectedId, onInspect, onToggle }: Props) {
  const [group, setGroup] = useState<CreationTraitGroup>('personality');
  const [query, setQuery] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const selected = CHARACTER_TRAITS.filter((trait) => draft.traitIds.includes(trait.id));
  const personalities = selected.filter((trait) => trait.category === 'personality');
  const visible = useMemo(() => CHARACTER_TRAITS.filter((trait) => {
    if (isDerivedInjuryTraitId(trait.id)) return false;
    if (onlySelected && !draft.traitIds.includes(trait.id) && !draft.learningTraitIds?.includes(trait.id)) return false;
    const text = query.trim().toLocaleLowerCase('zh-CN');
    if (text) return `${trait.name} ${trait.description} ${formatTraitRuleEffects(trait.rules).join(' ')}`.toLocaleLowerCase('zh-CN').includes(text);
    return onlySelected || creationTraitGroup(trait) === group;
  }), [draft.traitIds, draft.learningTraitIds, group, onlySelected, query]);

  return <section aria-label="特质工作台" className="trait-workbench">
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-xs tracking-widest text-gold-deep">人物特质</p><h2 className="mt-1 font-serif text-xl text-parchment">你想成为怎样的人</h2></div>
      <span className="text-xs text-parchment-dim">性格 {personalities.length} / 3 · 不占点数</span>
    </div>
    <div className="mt-4 grid grid-cols-3 gap-2" aria-label="三个性格位置">
      {Array.from({ length: 3 }, (_, index) => {
        const trait = personalities[index];
        return trait ? <div key={trait.id} className="relative flex items-center gap-2 border border-gold-deep/60 bg-gold-deep/10 p-3">
          <button type="button" onClick={() => onInspect(trait.id)} className="flex min-w-0 flex-1 flex-col items-center gap-2 sm:flex-row"><GameIcon icon={trait.icon} className="h-10 w-10 shrink-0" /><span className="text-sm text-gold-bright">{trait.name}</span></button>
          <button type="button" onClick={() => onToggle(trait.id)} aria-label={`移除${trait.name}`} className="absolute right-1 top-1 p-1 text-parchment-faint hover:text-parchment"><X className="h-3.5 w-3.5" /></button>
        </div> : <button key={index} type="button" onClick={() => { setGroup('personality'); setOnlySelected(false); setQuery(''); }} className="min-h-20 border border-dashed border-hairline p-3 text-xs text-parchment-faint">性格位置 {index + 1}<span className="mt-1 block text-gold-deep">自由选择</span></button>;
      })}
    </div>
    <div className="mt-5 grid grid-cols-2 gap-1 rounded-sm bg-ink p-1 sm:grid-cols-4" role="group" aria-label="特质分类">
      {CREATION_TRAIT_GROUPS.map((entry) => <button key={entry.id} type="button" aria-pressed={group === entry.id && !onlySelected && !query} onClick={() => { setGroup(entry.id); setQuery(''); setOnlySelected(false); }} className={`px-2 py-3 text-sm transition-colors ${group === entry.id && !onlySelected && !query ? 'bg-gold-deep/25 text-gold-bright' : 'text-parchment-dim hover:bg-ink-3'}`}>{entry.label}</button>)}
    </div>
    <p className="mt-3 min-h-10 text-xs leading-relaxed text-parchment-dim">{onlySelected ? '检查已掌握的特质和留待游戏中学习的方向。' : query ? '搜索全部分类；点击特质，在右侧比较效果与条件。' : CREATION_TRAIT_GROUPS.find((entry) => entry.id === group)?.description}</p>
    <div className="mt-2 flex gap-2">
      <label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-parchment-faint" /><input className="creator-input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按名称、描述或效果搜索" aria-label="搜索特质" /></label>
      <button type="button" aria-pressed={onlySelected} onClick={() => setOnlySelected((value) => !value)} className={`border px-3 text-xs ${onlySelected ? 'border-gold text-gold' : 'border-hairline text-parchment-dim'}`}>已选 {selected.length}</button>
    </div>
    <div className="mt-3 flex justify-between text-xs text-parchment-faint"><span>{visible.length} 项</span><span>点击查看 · 比较后加入</span></div>
    <div className="creator-trait-browser mt-2 grid max-h-[52vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2" aria-label="特质库">
      {visible.map((trait) => {
        const active = draft.traitIds.includes(trait.id);
        const learning = draft.learningTraitIds?.includes(trait.id);
        const block = creationTraitBlock(trait, draft);
        const needs = creationTraitRequirement(trait, draft);
        const cost = creationTraitPrice(trait);
        return <button key={trait.id} type="button" onClick={() => onInspect(trait.id)} aria-pressed={inspectedId === trait.id} className={`relative flex gap-3 border p-3 text-left transition-colors ${inspectedId === trait.id ? 'border-gold bg-gold-deep/15' : active ? 'border-gold-deep/60 bg-ink' : 'border-hairline bg-ink/35 hover:border-gold-deep'} ${block ? 'opacity-60' : ''}`}>
          <GameIcon icon={trait.icon} className="h-12 w-12 shrink-0" />
          <span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><strong className="text-sm font-medium text-parchment">{trait.name}</strong><span className="shrink-0 text-xs text-gold">{trait.category === 'personality' ? '性格位' : trait.category === 'fame' ? '背景' : cost < 0 ? `返还 ≤${-cost}` : `${cost} 点`}</span></span>
            <span className="mt-1.5 block line-clamp-2 text-xs leading-relaxed text-parchment-dim">{formatTraitDescription(trait.description, draft.name)}</span>
            <span className="mt-2 flex flex-wrap items-center gap-1 text-xs text-gold-deep">{active ? <><Check className="h-3.5 w-3.5" />已掌握<TraitSourceTag draft={draft} traitId={trait.id} full />{needs ? '待补条件' : ''}</> : learning ? <><BookOpen className="h-3.5 w-3.5" />成长方向</> : block ? '当前不可选 · 查看原因' : needs ? '需要补充背景' : '查看效果与取舍'}</span>
          </span>
        </button>;
      })}
      {!visible.length && <p className="col-span-full border border-dashed border-hairline p-8 text-center text-sm text-parchment-faint">没有符合条件的特质。试试其他名称或清空搜索。</p>}
    </div>
  </section>;
}

export function TraitInspector({ draft, inspectedId, onToggle, onChange }: Props) {
  const trait = CHARACTER_TRAITS.find((entry) => entry.id === inspectedId);
  if (!trait) return <section className="mb-5 border border-dashed border-hairline p-4"><h3 className="font-serif text-base text-gold">得到什么，放弃什么</h3><p className="mt-2 text-sm leading-relaxed text-parchment-dim">从特质库选中一项，在这里比较能力变化、点数和所需背景。</p></section>;
  const preview = previewCreationTrait(draft, trait.id);
  const selected = draft.traitIds.includes(trait.id);
  const learning = draft.learningTraitIds?.includes(trait.id) ?? false;
  const targets = draft.learningTraitIds ?? [];
  const current = calculateFinalAttributes(draft.attributes, draft.traitIds);
  const next = calculateFinalAttributes(draft.attributes, preview.traitIds);
  const costDelta = creationBudget(draft.attributes, preview.traitIds).total - creationBudget(draft.attributes, draft.traitIds).total;
  const effects = formatTraitRuleEffects(trait.rules);
  const requirement = creationTraitRequirement(trait, draft);
  const learningBlock = creationTraitBlock(trait, draft);
  return <section className="mb-5 border border-gold-deep/50 bg-ink-2 p-4" aria-label="特质比较">
    <div className="flex items-center gap-3"><GameIcon icon={trait.icon} className="h-14 w-14 shrink-0" /><div><h3 className="font-serif text-lg text-gold-bright">{trait.name}</h3><p className="mt-1 text-xs text-parchment-dim">{selected ? `已掌握 · ${TRAIT_SOURCES[traitSourceOf(draft, trait.id)].label} · 预览移除` : learning ? '成长方向 · 尚未掌握' : '比较后加入人物'}</p></div></div>
    <p className="mt-3 text-sm leading-relaxed text-parchment">{formatTraitDescription(trait.description, draft.name)}</p>
    {(selected || learning) && <TraitSourceLegend draft={draft} trait={trait} />}
    <p className="mt-3 text-xs leading-relaxed text-gold">{formatTraitModifiers(trait.modifiers) || '不直接改变六项能力'}</p>
    {!!effects.length && <ul className="mt-3 space-y-2 text-xs leading-relaxed text-parchment-dim">{effects.map((effect, index) => <li key={index}>{effect}</li>)}</ul>}
    {!preview.blocked && <div className="mt-4 space-y-1.5 border-y border-hairline py-3 text-xs">
      <div className="flex justify-between text-parchment"><span>{selected ? '移除后点数变化' : '加入后点数变化'}</span><strong className="text-gold">{costDelta > 0 ? '+' : ''}{costDelta}</strong></div>
      {CK3_SKILLS.filter((skill) => current[skill.key] !== next[skill.key]).map((skill) => <div key={skill.key} className="flex justify-between text-parchment-dim"><span>{skill.label}</span><span className="flex items-center gap-2">{current[skill.key]}<ArrowRight className="h-3 w-3" />{next[skill.key]}</span></div>)}
    </div>}
    {!!preview.replaces.length && <p className="mt-3 text-xs leading-relaxed text-gold">将替换：{preview.replaces.map((id) => CHARACTER_TRAITS.find((entry) => entry.id === id)?.name).join('、')}。其他手选特质保持不变。</p>}
    {preview.blocked && <p role="status" className="mt-3 text-xs leading-relaxed text-rubric-bright">{preview.blocked}</p>}
    {requirement && !preview.blocked && <p className="mt-3 text-xs leading-relaxed text-gold">{requirement}</p>}
    {traitNeedsBackground(trait) && !creationTraitBlock(trait, draft) && <label className="mt-3 block text-xs text-parchment-dim">公开往事<textarea className="creator-input mt-2 min-h-24 resize-y" value={draft.traitBackgrounds?.[trait.id] ?? ''} maxLength={400} placeholder="写清经历、关系及这项名声的由来。" onChange={(event) => onChange({ traitBackgrounds: { ...draft.traitBackgrounds, [trait.id]: event.target.value } })} /></label>}
    <button type="button" disabled={!!preview.blocked} onClick={() => onToggle(trait.id)} className="btn-decree mt-4 w-full justify-center text-sm disabled:opacity-40">{selected ? '移除此特质' : preview.replaces.length ? '替换并掌握' : '加入人物'}</button>
    {isLearningTarget(trait) && <div className="mt-4 border-t border-hairline pt-3"><h4 className="flex items-center gap-2 text-sm text-gold"><BookOpen className="h-4 w-4" />也可以在游戏中学习</h4><p className="mt-2 text-xs leading-relaxed text-parchment-dim">{learningRoute(trait)}</p><button type="button" disabled={!learning && (!!learningBlock || targets.length >= MAX_LEARNING_TARGETS)} onClick={() => onChange({ learningTraitIds: learning ? targets.filter((id) => id !== trait.id) : [...targets, trait.id], ...(selected && !learning ? { traitIds: draft.traitIds.filter((id) => id !== trait.id), backgroundTraitIds: (draft.backgroundTraitIds ?? []).filter((id) => id !== trait.id), ...(trait.category === 'education' ? { educationMode: 'manual' as const } : {}) } : {}) })} className="mt-3 w-full border border-gold-deep px-3 py-2 text-xs text-gold disabled:opacity-40">{learning ? '取消成长方向' : selected ? '改为成长方向（移除当前效果）' : `设为成长方向 · 不收费 · ${targets.length}/${MAX_LEARNING_TARGETS}`}</button></div>}
  </section>;
}
