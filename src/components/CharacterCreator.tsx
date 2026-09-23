import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Crown,
  Landmark,
  MapPin,
  Minus,
  Palette,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { HOUSES } from '../data/houses';
import {
  CHARACTER_TRAITS,
  DESIGN_POINT_LIMIT,
  calculateFinalAttributes,
  orderCharacterTraitsForDisplay,
} from '../data/characterTraits';
import type { LordAttributes } from '../types/game';
import type { CharacterId } from '../features/characters/types';
import type { GameplayLocationEntry } from '../features/world-content/types';
import { dossierRepository } from '../features/characters/useCharacterDossier';
import { characterAgeAtYear } from '../features/characters/characterDossier';
import { worldContentRepository } from '../features/world-content/repository';
import { CharacterSearch } from './CharacterSearch';
import { CharacterPortrait } from './CharacterPortrait';
import { TraitWorkbench } from './character-creator/TraitWorkbench';
import { previewCreationTrait } from '../features/characters/creationTraitRules';
import { CoatOfArms } from './CoatOfArms';
import { CREATOR_PANELS, type CreatorPanel } from './character-creator/creatorTypes';
import { AttributeBoard, CharacterReadoutPanel, CreatorTraitSummary, TraitSourceTag } from './character-creator/CharacterReadoutPanel';
import { CreationLifePanel } from './character-creator/CreationLifePanel';
import { isItemCatalogPreloaded, preloadItemCatalog } from '../data/itemDefinitions';
import { characterReadout, skillReadouts, traitSourceOf, TRAIT_SOURCES } from './character-creator/characterReadout';
import { GameIcon, getHouseIconId, type GameIconId } from './GameIcon';
import {
  DEFAULT_COAT_OF_ARMS,
  HERALDRY_COLORS,
  HERALDRY_EMBLEMS,
  HERALDRY_PATTERNS,
  HERALDRY_SHIELDS,
  type CoatOfArmsDesign,
} from '../data/heraldry';
import { stripEmoji } from '../services/textSanitizer';
import { generateCustomOpening, type OpeningGenerationProgress } from '../services/openingGeneration';
import { createCustomLivingWorldGame, prepareCustomOpeningFacts } from '../features/world/createLivingWorldGame';
import {
  DEFAULT_CHARACTER_CREATION_CATALOG,
  backgroundTraitRecommendations,
  createCustomRunId,
  createDefaultCharacterCreationDraft,
  legalTraitIdsForAge,
  rebaseDraftForBackground,
  resolveCharacterCreationDraft,
  suggestedBackgroundAttributes,
  validateCharacterCreationDraft,
  type CharacterCreationDraft,
  type CreationKinshipDraft,
  type CreationRelationDraft,
  type CustomExperience,
  type CustomIdentityRole,
  type CustomLivelihood,
  type CustomOrigin,
  type CustomRelationKind,
  type CustomSituationKind,
} from '../features/characters/customCharacterStart';

const ROLE_HOUSE_REQUIRED = new Set<CustomIdentityRole>(['retainer', 'knight', 'landless_noble']);

export const CharacterCreator: React.FC = () => {
  const { isCreatorOpen, closeCreator, startNewGame, apiConfig, openSettings } = useGameStore();
  const [draft, setDraft] = useState<CharacterCreationDraft>(() => createDefaultCharacterCreationDraft());
  const [inspectedTraitId, setInspectedTraitId] = useState<string | null>(null);
  const [previousDraft, setPreviousDraft] = useState<CharacterCreationDraft | null>(null);
  const [locations, setLocations] = useState<GameplayLocationEntry[]>([]);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [localCandidates, setLocalCandidates] = useState<LocalCandidate[]>([]);
  const [candidateState, setCandidateState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [invalidated, setInvalidated] = useState<string[]>([]);
  const [relationKind, setRelationKind] = useState<CustomRelationKind>('acquaintance');
  const [kinshipKind, setKinshipKind] = useState<'none' | 'cadet_branch' | 'bastard_child'>('none');
  const [activePanel, setActivePanel] = useState<CreatorPanel>('life');
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>(() => isItemCatalogPreloaded() ? 'ready' : 'loading');
  const [catalogEpoch, setCatalogEpoch] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<OpeningGenerationProgress | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [resolvedRunId, setResolvedRunId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const submitEpochRef = useRef(0);

  useEffect(() => {
    if (!isCreatorOpen) return;
    let cancelled = false;
    worldContentRepository.loadGameplayLocations()
      .then((entries) => {
        if (cancelled) return;
        setLocations(entries);
        setLocationError(null);
        setDraft((current) => current.location || entries.length === 0 ? current : {
          ...current,
          location: toDraftLocation(recommendLocations(entries, current)[0] ?? entries[0]),
        });
      })
      .catch((reason: unknown) => {
        if (!cancelled) setLocationError(reason instanceof Error ? reason.message : '地点资料读取失败');
      });
    return () => { cancelled = true; };
  }, [isCreatorOpen]);

  useEffect(() => {
    if (!isCreatorOpen || isItemCatalogPreloaded()) {
      if (isItemCatalogPreloaded()) setCatalogState('ready');
      return;
    }
    let cancelled = false;
    setCatalogState('loading');
    preloadItemCatalog()
      .then(() => { if (!cancelled) setCatalogState('ready'); })
      .catch(() => { if (!cancelled) setCatalogState('error'); });
    return () => { cancelled = true; };
  }, [isCreatorOpen, catalogEpoch]);

  useEffect(() => {
    if (!isCreatorOpen) return;
    const locationId = draft.location?.locationId;
    if (!locationId) { setLocalCandidates([]); setCandidateState('idle'); return; }
    let cancelled = false;
    setCandidateState('loading');
    const timer = setTimeout(() => {
      loadLocalCandidates(locationId)
        .then((entries) => { if (!cancelled) { setLocalCandidates(entries); setCandidateState('ready'); } })
        .catch(() => { if (!cancelled) { setLocalCandidates([]); setCandidateState('error'); } });
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isCreatorOpen, draft.location?.locationId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const validation = useMemo(() => validateCharacterCreationDraft(draft), [draft]);
  const recommendedLocations = useMemo(() => recommendLocations(locations, draft), [locations, draft]);
  const visibleLocations = useMemo(() => {
    const query = locationQuery.trim().toLocaleLowerCase('zh-CN');
    if (!query) return recommendedLocations.slice(0, 12);
    return locations.filter((entry) => `${entry.name} ${entry.englishName ?? ''} ${entry.regionId}`.toLocaleLowerCase('zh-CN').includes(query)).slice(0, 20);
  }, [locationQuery, locations, recommendedLocations]);
  const selectedTraits = useMemo(() => orderCharacterTraitsForDisplay(CHARACTER_TRAITS.filter((trait) => draft.traitIds.includes(trait.id))), [draft.traitIds]);
  const finalAttributes = useMemo(() => calculateFinalAttributes(draft.attributes, draft.traitIds), [draft.attributes, draft.traitIds]);
  const traitRecommendations = useMemo(
    () => backgroundTraitRecommendations(draft),
    [draft.age, draft.experience, draft.livelihood, draft.origin, draft.role],
  );
  const recommendedTraitCards = useMemo(() => traitRecommendations
    .slice(0, 8)
    .map((recommendation) => ({ recommendation, trait: CHARACTER_TRAITS.find((entry) => entry.id === recommendation.traitId) }))
    .filter((entry): entry is typeof entry & { trait: NonNullable<typeof entry.trait> } => Boolean(entry.trait)), [traitRecommendations]);
  const role = DEFAULT_CHARACTER_CREATION_CATALOG.roles.find((entry) => entry.id === draft.role)!;
  const origin = DEFAULT_CHARACTER_CREATION_CATALOG.origins.find((entry) => entry.id === draft.origin)!;
  const experience = DEFAULT_CHARACTER_CREATION_CATALOG.experiences.find((entry) => entry.id === draft.experience)!;
  const livelihood = DEFAULT_CHARACTER_CREATION_CATALOG.livelihoods.find((entry) => entry.id === draft.livelihood)!;
  const situation = DEFAULT_CHARACTER_CREATION_CATALOG.situations.find((entry) => entry.id === draft.situation)!;
  const skillReadoutList = useMemo(() => skillReadouts(draft, finalAttributes), [draft, finalAttributes]);
  const readout = useMemo(() => characterReadout(draft, finalAttributes, validation, {
    roleLabel: role.label,
    originLabel: origin.label,
    experienceLabel: experience.label,
    livelihoodLabel: livelihood.label,
    situationLabel: situation.label,
    houseRecommended: ROLE_HOUSE_REQUIRED.has(draft.role),
  }), [draft, finalAttributes, validation, role.label, origin.label, experience.label, livelihood.label, situation.label]);
  const panelStatus = useMemo(() => creatorPanelStatus(draft), [draft]);

  if (!isCreatorOpen) return null;

  const updateBackground = (patch: Partial<Pick<CharacterCreationDraft, 'role' | 'origin' | 'experience' | 'livelihood'>>) => {
    setPreviousDraft(structuredClone(draft));
    setDraft((current) => {
      const next = rebaseDraftForBackground(current, {
        role: patch.role ?? current.role,
        origin: patch.origin ?? current.origin,
        experience: patch.experience ?? current.experience,
        livelihood: patch.livelihood ?? current.livelihood,
      });
      setInvalidated(next.invalidated);
      return {
        ...next.draft,
      };
    });
    setResolvedRunId(null);
  };

  const setAge = (age: number) => {
    const safeAge = Math.max(16, Math.min(100, Math.round(age)));
    setDraft((current) => {
      const legal = legalTraitIdsForAge(current.traitIds, safeAge);
      setInvalidated(legal.removed.map((id) => `特质 ${CHARACTER_TRAITS.find((trait) => trait.id === id)?.name ?? id} 不适用于当前年龄，已移除`));
      return {
        ...current,
        age: safeAge,
        traitIds: legal.traitIds,
        backgroundTraitIds: (current.backgroundTraitIds ?? []).filter((id) => legal.traitIds.includes(id)),
      };
    });
    setResolvedRunId(null);
  };

  const toggleTrait = (traitId: string) => {
    if (isSubmitting) return;
    const preview = previewCreationTrait(draft, traitId);
    setInspectedTraitId(traitId);
    if (preview.blocked) { setInvalidated([preview.blocked]); return; }
    setPreviousDraft(structuredClone(draft));
    const isEducation = CHARACTER_TRAITS.find((trait) => trait.id === traitId)?.category === 'education';
    setDraft({ ...draft, traitIds: preview.traitIds,
      backgroundTraitIds: (draft.backgroundTraitIds ?? []).filter((id) => id !== traitId && preview.traitIds.includes(id)),
      learningTraitIds: (draft.learningTraitIds ?? []).filter((id) => !preview.traitIds.includes(id)),
      ...(isEducation ? { educationMode: 'manual' } : {}),
    });
    setInvalidated(preview.replaces.map((id) => `已替换 ${CHARACTER_TRAITS.find((trait) => trait.id === id)?.name ?? id}，可撤销本次操作。`));
    setResolvedRunId(null);
  };

  const changeTraitDraft = (patch: Partial<CharacterCreationDraft>) => {
    if (isSubmitting) return;
    setPreviousDraft(structuredClone(draft));
    setDraft((current) => ({ ...current, ...patch }));
    setResolvedRunId(null);
  };

  const chooseHouse = (houseId: string) => {
    const house = HOUSES.find((entry) => entry.id === houseId);
    if (!house) return;
    setDraft((current) => ({
      ...current,
      house: {
        houseId: house.id,
        houseName: house.name,
        dynastyName: house.name,
        houseWords: house.words,
        houseSigil: house.sigil,
      },
    }));
    setResolvedRunId(null);
  };

  const createCustomHouse = () => {
    setDraft((current) => ({
      ...current,
      house: {
        houseId: 'save:custom-house',
        houseName: current.house?.houseName || '新家族',
        dynastyName: current.house?.dynastyName || '新宗族',
        houseWords: current.house?.houseWords || '尚无箴言',
        houseSigil: 'custom-coat-of-arms',
        coatOfArms: current.house?.coatOfArms ?? { ...DEFAULT_COAT_OF_ARMS },
      },
    }));
    setResolvedRunId(null);
  };

  const selectRelationTarget = async (targetId: CharacterId) => {
    try {
      const record = await dossierRepository.get(targetId);
      if (!record?.born || !record.alive || record.canonTier === 'genealogy') throw new Error('该人物不适合作为当前关系候选');
      const targetAge = characterAgeAtYear(record.birthDate, 298, record.deathDate, record.alive);
      const targetLocationId = await worldContentRepository.loadStartState()
        .then((state) => state.characters.find((entry) => entry.characterId === targetId)?.location.locationId)
        .catch(() => undefined);
      const relation: CreationRelationDraft = {
        kind: relationKind,
        targetId,
        targetName: record.name,
        ...(targetAge !== undefined ? { targetAge } : {}),
        ...(targetLocationId ? { targetLocationId } : {}),
      };
      setDraft((current) => ({
        ...current,
        relations: [...current.relations.filter((entry) => !(entry.kind === relation.kind && entry.targetId === relation.targetId)), relation],
      }));
      setResolvedRunId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取关系人物');
    }
  };

  const selectKinshipTarget = async (targetId: CharacterId) => {
    if (kinshipKind === 'none') return;
    try {
      const record = await dossierRepository.get(targetId);
      if (!record?.born || record.canonTier === 'genealogy') throw new Error('请选择有稳定原著档案的人物');
      const targetLocationId = await worldContentRepository.loadStartState()
        .then((state) => state.characters.find((entry) => entry.characterId === targetId)?.location.locationId)
        .catch(() => undefined);
      const kinship: CreationKinshipDraft = {
        kind: kinshipKind,
        targetId,
        targetName: record.name,
        ...(characterAgeAtYear(record.birthDate, 298, record.deathDate, record.alive) !== undefined
          ? { targetAge: characterAgeAtYear(record.birthDate, 298, record.deathDate, record.alive) }
          : {}),
        ...(targetLocationId ? { targetLocationId } : {}),
        publiclyKnown: kinshipKind === 'cadet_branch',
        knowerIds: [],
      };
      setDraft((current) => ({ ...current, kinship }));
      setResolvedRunId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取亲属人物');
    }
  };

  const handleStart = async () => {
    if (isSubmitting) return;
    const currentValidation = validateCharacterCreationDraft(draft);
    if (!currentValidation.valid) {
      setError(currentValidation.errors.join('；'));
      return;
    }
    const epoch = ++submitEpochRef.current;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setSubmitting(true);
    setError(null);
    setProgress({ phase: 'requesting', partialText: '' });
    try {
      const runId = resolvedRunId ?? createCustomRunId();
      const resolved = resolveCharacterCreationDraft(draft, runId);
      if (!resolvedRunId) setResolvedRunId(runId);
      const openingFacts = await prepareCustomOpeningFacts(resolved);
      const preparedResolved = { ...resolved, openingFacts };
      const opening = await generateCustomOpening(openingFacts, apiConfig, {
        signal: controller.signal,
        onProgress: (next) => { if (submitEpochRef.current === epoch) setProgress(next); },
      });
      if (controller.signal.aborted || submitEpochRef.current !== epoch) return;
      const game = await createCustomLivingWorldGame(preparedResolved, opening);
      if (controller.signal.aborted || submitEpochRef.current !== epoch) return;
      await startNewGame(game);
    } catch (reason) {
      if (controller.signal.aborted || submitEpochRef.current !== epoch) return;
      setError(reason instanceof Error ? reason.message : '无法创建人物开局');
    } finally {
      if (submitEpochRef.current === epoch) {
        setSubmitting(false);
        setProgress(null);
      }
    }
  };

  const cancelGeneration = () => {
    submitEpochRef.current += 1;
    abortRef.current?.abort(new DOMException('玩家取消了开场生成', 'AbortError'));
    abortRef.current = null;
    setSubmitting(false);
    setProgress(null);
    setError('已取消开场生成。人物草案与已分配的开局事实保持不变，可直接重试。');
  };

  const changeAttribute = (key: keyof LordAttributes, delta: number) => {
    setDraft((current) => ({
      ...current,
      attributeAdjustments: { ...current.attributeAdjustments, [key]: Math.max(0, Math.min(30, current.attributes[key] + delta)) - suggestedBackgroundAttributes(current)[key] },
      attributes: {
        ...current.attributes,
        [key]: Math.max(0, Math.min(30, current.attributes[key] + delta)),
      },
    }));
    setResolvedRunId(null);
  };

  const resetEditor = () => {
    if (isSubmitting) return;
    const next = createDefaultCharacterCreationDraft();
    if (locations.length > 0) next.location = toDraftLocation(recommendLocations(locations, next)[0] ?? locations[0]);
    setDraft(next);
    setPreviousDraft(null);
    setInspectedTraitId(null);
    setLocationQuery('');
    setInvalidated([]);
    setRelationKind('acquaintance');
    setKinshipKind('none');
    setActivePanel('life');
    setError(null);
    setProgress(null);
    setResolvedRunId(null);
  };

  const previewHouse = draft.house ? HOUSES.find((house) => house.id === draft.house?.houseId) : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-2 md:p-4 creator-v2" data-character-creation-flow data-character-editor-layout>
      <div className="panel-iron relative flex h-[96vh] w-full max-w-[1680px] flex-col overflow-hidden scene-enter">
        <div className="ck3-ornament-line" />

        <header className="shrink-0 border-b border-hairline bg-gradient-to-r from-ink-3 via-ink-2 to-ink-3 px-4 py-3 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Crown className="h-6 w-6 shrink-0 text-gold" />
              <div className="min-w-0">
                <p className="eyebrow hidden sm:block">Ruler Designer · Westeros 298 AC</p>
                <h1 className="truncate font-serif text-lg font-bold text-gold-bright md:text-xl">人物设计器</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className={`border px-3 py-1.5 text-xs ${validation.remainingDesignPoints < 0 ? 'border-rubric text-rubric-bright' : 'border-gold-deep/70 text-parchment-dim'}`}>
                <span className="mr-2 text-parchment-faint">设计点</span>
                <strong className="font-display text-base text-gold-bright">{validation.remainingDesignPoints}</strong>
                <span className="ml-2 text-parchment-faint">/ {DESIGN_POINT_LIMIT}</span>
              </div>
              {previousDraft && <button type="button" disabled={isSubmitting} onClick={() => { setDraft(previousDraft); setPreviousDraft(null); setResolvedRunId(null); setInvalidated([]); }} className="btn-ghost text-xs">撤销</button>}
              <button type="button" onClick={resetEditor} disabled={isSubmitting} className="btn-ghost text-xs"><RotateCcw className="h-3.5 w-3.5" />重置</button>
              <button type="button" onClick={closeCreator} aria-label="关闭人物创建器" className="btn-ghost"><X className="h-4 w-4" /></button>
            </div>
          </div>
        </header>

        <div {...({ inert: isSubmitting ? '' : undefined } as React.HTMLAttributes<HTMLDivElement>)} className="creator-body min-h-0 flex-1 grid grid-cols-1 overflow-y-auto lg:grid-cols-[310px_minmax(0,1fr)] lg:overflow-hidden">
          <aside className="border-b border-hairline bg-gradient-to-b from-ink-3 via-ink-2 to-ink p-3 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <div className="creator-dossier-portrait relative min-h-[96px] overflow-hidden border border-hairline bg-ink bg-[radial-gradient(circle_at_30%_45%,rgba(201,164,92,0.18),transparent_55%)]">
              <div className="absolute inset-y-0 left-4 flex items-center"><UserRound className="h-16 w-16 text-gold-deep/45" strokeWidth={0.8} /></div>
              <div className="absolute right-3 top-3 flex h-14 w-14 items-center justify-center border border-gold-deep/70 bg-ink-3/95 p-1.5 shadow-lg">
                {draft.house?.coatOfArms ? <CoatOfArms design={draft.house.coatOfArms} className="h-full" /> : previewHouse ? <GameIcon icon={getHouseIconId(previewHouse.sigil)} className="h-full w-full" /> : <ShieldCheck className="h-10 w-10 text-gold-deep/50" />}
              </div>
              <span className="absolute bottom-2 left-24 right-20 truncate font-display text-[10px] tracking-[0.15em] text-gold-deep">{draft.house?.dynastyName || '无宗族'}</span>
            </div>

            <div className="border-x border-b border-hairline bg-ink-2/55 px-3 py-4 text-center">
              <h2 className="font-serif text-2xl font-bold text-gold-bright">{draft.name || '未命名角色'}</h2>
              <p className="mt-1 text-xs text-parchment-dim">{role.label} · {draft.gender} · {draft.age} 岁</p>
              <p className="mt-2 text-xs italic text-parchment-faint">“{draft.house?.houseWords || '命运尚未写定'}”</p>
              <p className="mt-2 border-t border-hairline pt-2 text-[10px] leading-relaxed text-parchment-faint">{readout.headline}：{origin.label}出身，{livelihood.label}为生。</p>
            </div>

            <nav className="mt-3 grid grid-cols-2 border-l border-t border-hairline sm:grid-cols-4 lg:grid-cols-2" aria-label="人物档案栏目">
              {CREATOR_PANELS.map(({ id, label, note, icon: Icon }) => {
                const active = activePanel === id;
                const status = panelStatus[id];
                return <button key={id} type="button" onClick={() => setActivePanel(id)} aria-pressed={active} title={note} data-creator-panel={id} data-panel-status={status.tone} className={`flex min-w-0 items-center gap-2 border-b border-r border-hairline px-3 py-2 text-left transition-colors ${active ? 'bg-gold-deep/20 text-gold-bright' : 'text-parchment-dim hover:bg-ink-2 hover:text-parchment'}`}><Icon className={`h-4 w-4 shrink-0 ${active ? 'text-gold' : 'text-parchment-faint'}`} /><span className="min-w-0 flex-1"><strong className="block truncate font-serif text-xs">{label}</strong><span className={`block truncate text-[9px] ${status.tone === 'done' ? 'text-gold-deep' : status.tone === 'todo' ? 'text-rubric-bright' : 'text-parchment-faint'}`}>{status.text}</span></span></button>;
              })}
            </nav>

            <div className="creator-dossier-details mt-4 space-y-2 border-y border-hairline py-3 text-xs">
              <IdentityLine icon={<Users className="h-3.5 w-3.5" />} label="家族" value={draft.house?.houseName || '无'} />
              <IdentityLine icon={<BookOpen className="h-3.5 w-3.5" />} label="文化" value={draft.culture || '未指定'} />
              <IdentityLine icon={<Landmark className="h-3.5 w-3.5" />} label="信仰" value={draft.faith || '未指定'} />
              <IdentityLine icon={<MapPin className="h-3.5 w-3.5" />} label="地点" value={draft.location?.name || '未选择'} />
            </div>

            <div className="creator-dossier-traits mt-4">
              <SectionTitle>人物特质</SectionTitle>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {selectedTraits.length > 0 ? selectedTraits.slice(0, 11).map((trait) => (
                  <button key={trait.id} type="button" onClick={() => { setInspectedTraitId(trait.id); setActivePanel('traits'); }} title={`${trait.name} · ${TRAIT_SOURCES[traitSourceOf(draft, trait.id)].label}`} data-trait-source-tile={traitSourceOf(draft, trait.id)} className={`group relative aspect-square border bg-ink/60 p-1 transition-colors hover:border-gold ${traitSourceOf(draft, trait.id) === 'background' ? 'border-gold-deep/70' : 'border-hairline'}`}>
                    <GameIcon icon={trait.icon} className="h-full w-full" />
                    <span className="absolute inset-x-0 top-0 flex justify-end p-0.5"><TraitSourceTag draft={draft} traitId={trait.id} /></span>
                    <span className="absolute inset-x-0 bottom-0 truncate bg-ink/90 px-0.5 text-[8px] text-parchment-dim">{trait.name}</span>
                  </button>
                )) : <button type="button" onClick={() => setActivePanel('traits')} className="col-span-4 border border-dashed border-hairline px-3 py-4 text-xs text-parchment-faint">添加人物特质</button>}
                {selectedTraits.length > 11 && <button type="button" onClick={() => setActivePanel('traits')} className="flex aspect-square flex-col items-center justify-center border border-dashed border-hairline bg-ink/40 text-[10px] text-parchment-faint hover:border-gold-deep hover:text-parchment-dim"><span className="font-display text-base text-gold">+{selectedTraits.length - 11}</span><span>其余</span></button>}
              </div>
              <div className="mt-3"><CreatorTraitSummary draft={draft} readouts={skillReadoutList} /></div>
            </div>

            <div className="creator-dossier-opening mt-5">
              <SectionTitle>开局摘要</SectionTitle>
              <div className="mt-3 space-y-2 text-xs leading-relaxed text-parchment-faint">
                <div>身世：<span className="text-parchment-dim">{origin.label} · {experience.label}</span></div>
                <div>生计：<span className="text-parchment-dim">{livelihood.label}</span></div>
                <div>处境：<span className="text-parchment-dim">{situation.label}</span></div>
                {draft.relations.length > 0 && <div>关系：<span className="text-parchment-dim">{draft.relations.map((entry) => entry.targetName).join('、')}</span></div>}
                {draft.kinship && <div className="text-gold">架空亲属：{draft.kinship.targetName}</div>}
              </div>
            </div>

            <div className="mt-4 border border-hairline bg-ink/45 p-3 text-xs" aria-label="设计点数简要">
              <div className="flex items-end justify-between"><span className="text-parchment-faint">剩余设计点</span><strong className={`font-display text-xl ${validation.remainingDesignPoints < 0 ? 'text-rubric-bright' : 'text-gold-bright'}`}>{validation.remainingDesignPoints}</strong></div>
              <div className="mt-2 h-1 bg-ink-3"><div className="h-full bg-gold-deep" style={{ width: `${Math.max(0, Math.min(100, validation.usedDesignPoints / DESIGN_POINT_LIMIT * 100))}%` }} /></div>
              <p className="mt-2 text-[10px] text-parchment-faint">支出 {validation.usedDesignPoints + validation.budget.refund} · 返还 {validation.budget.refund}/{validation.budget.rawRefund}</p>
            </div>
          </aside>

          <main className="min-w-0 bg-ink-2 lg:flex lg:min-h-0 lg:flex-col">
            <nav className="sticky top-0 z-20 flex shrink-0 overflow-x-auto border-b border-hairline bg-ink-3/95 lg:hidden" aria-label="移动端人物档案栏目">
              {CREATOR_PANELS.map(({ id, label }) => <button key={`mobile:${id}`} type="button" onClick={() => setActivePanel(id)} aria-pressed={activePanel === id} className={`shrink-0 border-r border-hairline px-4 py-2.5 text-xs ${activePanel === id ? 'bg-gold-deep/25 text-gold-bright' : 'text-parchment-dim'}`}>{label}</button>)}
            </nav>
            <div className="min-h-0 flex-1 p-4 md:p-5 lg:overflow-y-auto">
              {activePanel === 'life' && <>
                <CreationLifePanel draft={draft} roleLabel={role.label} originLabel={origin.label} experienceLabel={experience.label} livelihoodLabel={livelihood.label} situationLabel={situation.label} catalogState={catalogState} onRetryCatalog={() => setCatalogEpoch((value) => value + 1)} onEdit={setActivePanel} />
                <details className="mt-4 border border-hairline bg-ink/35 p-4" data-creator-abilities>
                  <summary className="cursor-pointer font-serif text-base text-gold">调整六项能力</summary>
                  <p className="mt-2 text-xs leading-relaxed text-parchment-faint">能力决定人物做事时依靠什么。展开后可逐项调整；低于 8 的点数会返还预算。</p>
                  <AttributeBoard readouts={skillReadoutList} onChange={changeAttribute} />
                </details>
                <div className="mt-4"><CharacterReadoutPanel draft={draft} validation={validation} readout={readout} /></div>
              </>}

              {activePanel === 'identity' && <section>
                <div className="mb-5"><p className="eyebrow">Identity</p><h2 className="mt-1 font-serif text-2xl text-gold-bright">身份与年龄</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-parchment-dim">先确定你在维斯特洛是什么人。身份影响身世建议、地点推荐与关系语境，但不会替你决定性格。</p></div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" aria-label="开局身份">
                  {DEFAULT_CHARACTER_CREATION_CATALOG.roles.map((entry) => <ChoiceCard key={entry.id} active={draft.role === entry.id} title={entry.label} description={entry.description} onClick={() => updateBackground({ role: entry.id })} />)}
                </div>
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Field label="姓名"><input value={draft.name} onChange={(event) => { setDraft((current) => ({ ...current, name: stripEmoji(event.target.value) })); setResolvedRunId(null); }} className="creator-input" maxLength={40} /></Field>
                  <Field label="性别"><div className="grid grid-cols-2 border border-hairline">{(['男', '女'] as const).map((gender) => <button key={gender} type="button" onClick={() => { setDraft((current) => ({ ...current, gender })); setResolvedRunId(null); }} className={`py-2.5 font-serif text-sm transition-colors ${draft.gender === gender ? 'bg-gold-deep/25 text-gold-bright' : 'bg-ink/40 text-parchment-faint hover:text-parchment-dim'}`}>{gender}</button>)}</div></Field>
                  <Field label="年龄"><Stepper value={draft.age} min={16} max={100} onChange={setAge} /></Field>
                  <Field label="文化"><input value={draft.culture} onChange={(event) => { setDraft((current) => ({ ...current, culture: stripEmoji(event.target.value) })); setResolvedRunId(null); }} className="creator-input" /></Field>
                  <Field label="信仰"><input value={draft.faith} onChange={(event) => { setDraft((current) => ({ ...current, faith: stripEmoji(event.target.value) })); setResolvedRunId(null); }} className="creator-input" /></Field>
                </div>
              </section>}

              {activePanel === 'house' && <section>
                <div className="mb-5"><p className="eyebrow">Dynasty & Heraldry</p><h2 className="mt-1 font-serif text-2xl text-gold-bright">家族与纹章</h2><p className="mt-2 text-sm leading-relaxed text-parchment-dim">选择原著家族，创建自己的宗族，或以无家族身份进入世界。</p></div>
                {draft.role === 'commoner' && <div className="mb-4 border border-hairline bg-ink/40 p-3 text-xs leading-relaxed text-parchment-faint">平民可以没有家族、族语和纹章；手动添加家族也不会自动获得贵族权利。</div>}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                  {HOUSES.map((house) => <button key={house.id} type="button" onClick={() => chooseHouse(house.id)} title={`${house.name}：${house.description}`} className={`min-w-0 border p-3 flex items-center gap-2 text-left transition-colors ${draft.house?.houseId === house.id ? 'border-gold bg-gold-deep/20 text-gold-bright' : 'border-hairline bg-ink/40 text-parchment-dim hover:border-hairline-bright'}`}><GameIcon icon={getHouseIconId(house.sigil)} className="h-11 w-11 shrink-0" /><span className="min-w-0"><span className="block truncate text-sm font-bold">{house.name.replace('家族', '')}</span><span className="block truncate text-xs text-parchment-faint">{house.region}</span></span></button>)}
                  <button type="button" onClick={createCustomHouse} className={`min-w-0 border p-3 flex items-center gap-2 text-left transition-colors ${draft.house?.houseId === 'save:custom-house' ? 'border-gold bg-gold-deep/20 text-gold-bright' : 'border-gold-deep/50 bg-ink-3 text-gold hover:border-gold'}`}><Palette className="h-9 w-9 shrink-0" /><span><span className="block text-sm font-bold">创建新家族</span><span className="block text-xs text-parchment-faint">自定义纹章</span></span></button>
                  <button type="button" onClick={() => { setDraft((current) => ({ ...current, house: undefined })); setResolvedRunId(null); }} className="border border-hairline bg-ink/40 p-3 text-sm text-parchment-faint hover:border-hairline-bright">不设家族</button>
                </div>
                {ROLE_HOUSE_REQUIRED.has(draft.role) && !draft.house && <p className="mt-3 text-xs leading-relaxed text-rubric-bright">此身份通常需要家族归属，但不会因此获得领地或继承权。</p>}
                {draft.house?.houseId === 'save:custom-house' && <div className="mt-5 max-w-3xl border border-hairline bg-ink/35 p-4"><CustomHouseEditor draft={draft} setDraft={setDraft} onDraftChanged={() => setResolvedRunId(null)} /></div>}
              </section>}

              {activePanel === 'background' && <section>
                <div className="mb-5"><p className="eyebrow">Background</p><h2 className="mt-1 font-serif text-2xl text-gold-bright">身世与生计</h2><p className="mt-2 text-sm leading-relaxed text-parchment-dim">决定人物来自哪里、经历过什么，以及如今靠什么在世界中立足。</p></div>
                <div className="space-y-5">
                  <ChoiceGroup title="出身" entries={DEFAULT_CHARACTER_CREATION_CATALOG.origins} value={draft.origin} onChoose={(id) => updateBackground({ origin: id as CustomOrigin })} />
                  <ChoiceGroup title="主要经历" entries={DEFAULT_CHARACTER_CREATION_CATALOG.experiences} value={draft.experience} onChoose={(id) => updateBackground({ experience: id as CustomExperience })} />
                  <ChoiceGroup title="当前生计" entries={DEFAULT_CHARACTER_CREATION_CATALOG.livelihoods} value={draft.livelihood} onChoose={(id) => updateBackground({ livelihood: id as CustomLivelihood })} />
                </div>
                <div className="mt-5 border border-gold-deep/40 bg-ink/55 p-4" data-background-trait-links>
                  <div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 font-serif text-base font-bold text-gold"><Sparkles className="h-4 w-4" />身世关联特质</h3><p className="mt-1 text-xs leading-relaxed text-parchment-dim">性格始终由你选择。教育可由经历带入；手动调整教育后，切换经历不会覆盖它。</p><button type="button" onClick={() => { const cleared = { ...draft, educationMode: 'background' as const, traitIds: draft.traitIds.filter((id) => CHARACTER_TRAITS.find((trait) => trait.id === id)?.category !== 'education'), backgroundTraitIds: [], suppressedBackgroundTraitIds: [] }; const rebased = rebaseDraftForBackground(cleared, cleared).draft; changeTraitDraft(rebased); }} className="mt-2 text-xs text-gold underline underline-offset-4">让教育重新跟随经历</button></div><span className="shrink-0 font-display text-xs text-gold-deep">TOP {recommendedTraitCards.length}</span></div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{recommendedTraitCards.map(({ recommendation, trait }) => { const selected = draft.traitIds.includes(trait.id); const backgroundGranted = draft.backgroundTraitIds?.includes(trait.id) ?? false; return <button key={`background:${trait.id}`} type="button" onClick={() => toggleTrait(trait.id)} className={`relative flex items-center gap-2 border p-2.5 text-left transition-colors ${selected ? 'border-gold bg-gold-deep/15' : 'border-gold-deep/30 bg-ink-2/45 hover:border-gold-deep'}`}><GameIcon icon={trait.icon} className="h-10 w-10 shrink-0" /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-xs font-bold text-parchment">{trait.name}</span><span className={`shrink-0 text-[8px] ${backgroundGranted ? 'text-gold-bright' : 'text-gold-deep'}`}>{backgroundGranted ? '经历自带' : selected ? TRAIT_SOURCES[traitSourceOf(draft, trait.id)].label : recommendation.score >= 5 ? '高度契合' : '可以选'}</span></span><span className="mt-1 block line-clamp-2 text-[9px] leading-relaxed text-parchment-faint">{recommendation.reasons.join(' · ')}</span></span>{selected && <Check className="absolute right-1 top-1 h-3 w-3 text-gold-bright" />}</button>; })}</div>
                </div>
                {invalidated.length > 0 && <div className="mt-3 border border-rubric/50 bg-rubric/5 p-3 text-xs text-rubric-bright">{invalidated.map((message) => <div key={message}>• {message}</div>)}</div>}
              </section>}

              {activePanel === 'relations' && <section>
                <div className="mb-5"><p className="eyebrow">Relations</p><h2 className="mt-1 font-serif text-2xl text-gold-bright">关系（可选）</h2><p className="mt-2 text-sm leading-relaxed text-parchment-dim">把人物放进已有世界：熟人、雇主、效忠对象，以及与原著家族的旁支或私生关系。</p></div>
                <div className="grid gap-5 xl:grid-cols-2">
                  <div className="border border-hairline bg-ink/35 p-4"><h3 className="font-serif text-base font-bold text-parchment">社会关系</h3><div className="mt-3 grid grid-cols-3 border border-hairline">{(['acquaintance', 'employer', 'fealty'] as const).map((kind) => <button key={kind} type="button" onClick={() => setRelationKind(kind)} className={`py-2.5 text-xs ${relationKind === kind ? 'bg-gold-deep/25 text-gold' : 'bg-ink text-parchment-faint'}`}>{relationLabel(kind)}</button>)}</div><div className="mt-3 border border-hairline bg-ink/25 p-2.5" data-local-candidates>
                    <div className="flex items-center justify-between gap-2"><h4 className="text-xs text-gold-deep">本地可以结识的人</h4><span className="truncate text-[10px] text-parchment-faint">{draft.location?.name ?? '尚未选定地点'}</span></div>
                    {candidateState === 'loading' && <p className="mt-2 text-[10px] text-parchment-faint">正在读取同地人物档案…</p>}
                    {candidateState === 'error' && <p className="mt-2 text-[10px] text-rubric-bright">人物档案读取失败，可以直接搜索。</p>}
                    {candidateState === 'ready' && localCandidates.length === 0 && <p className="mt-2 text-[10px] leading-relaxed text-parchment-faint">这个地方暂时没有可用的原著人物档案；换一座城镇，或直接在下方搜索全世界的活人。</p>}
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">{localCandidates.map((character) => (
                      <article key={character.id} className="flex items-center gap-2 border border-hairline bg-ink/60 p-2">
                        <CharacterPortrait characterId={character.id} houseIcon={character.houseIcon} alt={`${character.name}的肖像`} className="h-11 w-11 shrink-0 border border-hairline-bright" />
                        <div className="min-w-0 flex-1">
                          <h5 className="truncate font-serif text-xs text-gold">{character.name}</h5>
                          <p className="truncate text-[10px] text-parchment-faint">{character.age !== undefined ? `${character.age} 岁` : '年龄未知'} · 同住{character.locationName}</p>
                          <button type="button" onClick={() => void selectRelationTarget(character.id)} className="mt-1 text-[10px] text-gold underline underline-offset-2">设为{relationLabel(relationKind)}</button>
                        </div>
                      </article>
                    ))}</div>
                  </div>
                  <div className="mt-3"><CharacterSearch aliveOnly onSelectCharacter={(id) => void selectRelationTarget(id)} /></div><div className="mt-3 space-y-2">{draft.relations.map((relation, index) => <RelationRow key={`${relation.kind}:${relation.targetId}`} text={`${relationLabel(relation.kind)} · ${relation.targetName}`} onRemove={() => { setDraft((current) => ({ ...current, relations: current.relations.filter((_, i) => i !== index) })); setResolvedRunId(null); }} />)}</div></div>
                  <div className="border border-hairline bg-ink/35 p-4"><h3 className="font-serif text-base font-bold text-parchment">原著家族新增亲属</h3><p className="mt-1 text-xs leading-relaxed text-parchment-faint">只创建架空关系，不替换原著人物，也不自动获得领地或继承权。</p><div className="mt-3 grid grid-cols-3 border border-hairline">{(['none', 'cadet_branch', 'bastard_child'] as const).map((kind) => <button key={kind} type="button" onClick={() => { setKinshipKind(kind); if (kind === 'none') { setDraft((current) => ({ ...current, kinship: undefined })); setResolvedRunId(null); } }} className={`py-2.5 text-xs ${kinshipKind === kind ? 'bg-gold-deep/25 text-gold' : 'bg-ink text-parchment-faint'}`}>{kind === 'none' ? '不设置' : kind === 'cadet_branch' ? '新增旁支' : '私生子女'}</button>)}</div>{kinshipKind !== 'none' && <div className="mt-3"><CharacterSearch onSelectCharacter={(id) => void selectKinshipTarget(id)} /></div>}{draft.kinship && <div className="mt-3 border border-gold-deep/50 bg-ink p-3 text-xs text-parchment-dim"><div className="flex items-center justify-between"><span>{draft.kinship.kind === 'cadet_branch' ? '旁支连接' : '私生亲属'} · {draft.kinship.targetName}</span><button type="button" onClick={() => { setDraft((current) => ({ ...current, kinship: undefined })); setKinshipKind('none'); setResolvedRunId(null); }}><X className="h-3.5 w-3.5" /></button></div>{draft.kinship.kind === 'bastard_child' && <div className="mt-3 space-y-2"><label className="flex items-center gap-2"><input type="checkbox" checked={draft.kinship.publiclyKnown} onChange={(event) => { setDraft((current) => current.kinship ? ({ ...current, kinship: { ...current.kinship, publiclyKnown: event.target.checked } }) : current); setResolvedRunId(null); }} />身份公开</label>{draft.relations.length > 0 && <div className="flex flex-wrap gap-1.5">{draft.relations.map((relation) => { const checked = draft.kinship?.knowerIds.includes(relation.targetId) ?? false; return <label key={`knower:${relation.targetId}`} className="flex items-center gap-1 border border-hairline px-2 py-1"><input type="checkbox" checked={checked} onChange={(event) => { setDraft((current) => current.kinship ? ({ ...current, kinship: { ...current.kinship, knowerIds: event.target.checked ? [...new Set([...current.kinship.knowerIds, relation.targetId])] : current.kinship.knowerIds.filter((id) => id !== relation.targetId) } }) : current); setResolvedRunId(null); }} />{relation.targetName}</label>; })}</div>}</div>}</div>}</div>
                </div>
              </section>}

              {activePanel === 'traits' && <TraitWorkbench draft={draft} inspectedId={inspectedTraitId} onInspect={setInspectedTraitId} onToggle={toggleTrait} onChange={changeTraitDraft} catalogState={catalogState} onRetryCatalog={() => setCatalogEpoch((value) => value + 1)} />}

              {activePanel === 'situation' && <section>
                <div className="mb-5"><p className="eyebrow">Starting Situation</p><h2 className="mt-1 font-serif text-2xl text-gold-bright">开局处境</h2><p className="mt-2 text-sm leading-relaxed text-parchment-dim">决定第一幕开始时你正在做什么，以及故事从维斯特洛的哪里落笔。</p></div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{DEFAULT_CHARACTER_CREATION_CATALOG.situations.map((entry) => <ChoiceCard key={entry.id} active={draft.situation === entry.id} title={entry.label} description={entry.description} impact={entry.impact} onClick={() => { setDraft((current) => ({ ...current, situation: entry.id })); setResolvedRunId(null); }} />)}</div>
                <div className="mt-6 border border-hairline bg-ink/35 p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-serif text-base font-bold text-parchment">开局地点</h3><p className="mt-1 text-xs text-parchment-faint">按身份、经历和已选关系推荐。</p></div>{draft.location && <span className="text-xs text-gold"><MapPin className="mr-1 inline h-3.5 w-3.5" />{draft.location.name}</span>}</div><label className="relative mt-3 block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-parchment-faint" /><input className="creator-input pl-9" value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} placeholder="搜索城镇、城堡、港口或地区" /></label>{locationError && <p className="mt-2 text-xs text-rubric-bright">{locationError}</p>}<div className="mt-3 grid max-h-[46vh] gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">{visibleLocations.map((entry) => <button key={entry.id} type="button" onClick={() => { setDraft((current) => ({ ...current, location: toDraftLocation(entry) })); setResolvedRunId(null); }} className={`border p-3 text-left transition-colors ${draft.location?.locationId === entry.id ? 'border-gold bg-gold-deep/20' : 'border-hairline bg-ink/60 hover:border-gold-deep'}`}><span className="block font-serif text-sm text-parchment">{entry.name}</span><span className="mt-1 block text-xs text-parchment-faint">{entry.type} · {entry.regionId}</span></button>)}</div></div>
              </section>}
            </div>
          </main>
        </div>

        <footer className="shrink-0 border-t border-hairline bg-ink px-4 py-3 md:px-6">
          {progress && <div className="mb-3 flex flex-wrap items-center gap-3 border border-gold-deep/50 bg-ink-2 p-2 text-xs text-gold"><Sparkles className="h-3.5 w-3.5" /><span>{progress.phase === 'requesting' ? '正在准备第一幕' : progress.phase === 'streaming' ? '正在演绎第一幕' : '正在校验人物与地点引用'}</span>{progress.partialText && <span className="min-w-0 flex-1 truncate text-parchment-faint">{stripOpeningTags(progress.partialText).slice(-240)}</span>}<button type="button" onClick={cancelGeneration} className="btn-ghost !py-1 text-xs">取消生成</button></div>}
          {error && <div className="mb-3 flex flex-wrap items-center gap-2 border border-rubric/50 bg-rubric/5 p-2 text-xs text-rubric-bright"><span className="min-w-0 flex-1">{error}</span><button type="button" onClick={() => void handleStart()} disabled={isSubmitting} className="btn-ghost !py-1 text-xs">重试同一开局</button><button type="button" onClick={openSettings} className="btn-ghost !py-1 text-xs">模型设置</button></div>}
          <div className="flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center"><div className={`flex items-center gap-2 text-xs ${validation.valid ? 'text-parchment-faint' : 'text-rubric-bright'}`}><ShieldCheck className="h-4 w-4" />{validation.valid ? `人物可用 · 剩余 ${validation.remainingDesignPoints} 点 · 第一幕生成并保存成功后进入游戏` : validation.errors.join('；')}</div><button type="button" onClick={() => void handleStart()} disabled={!validation.valid || isSubmitting} className="btn-decree min-w-40 justify-center">{isSubmitting ? '正在生成并保存第一幕' : '以此身份开始'}</button></div>
        </footer>
      </div>
    </div>
  );
};

function recommendLocations(entries: GameplayLocationEntry[], draft: CharacterCreationDraft): GameplayLocationEntry[] {
  const preferredTypes = draft.role === 'traveler' || draft.experience === 'trade_travel'
    ? new Set(['port', 'city', 'town', 'castle'])
    : draft.role === 'knight' || draft.role === 'retainer' || draft.role === 'landless_noble'
      ? new Set(['castle', 'city', 'town'])
      : new Set(['town', 'city', 'castle', 'village']);
  const relatedLocationIds = new Set([
    ...draft.relations.flatMap((relation) => relation.targetLocationId ? [relation.targetLocationId] : []),
    ...(draft.kinship?.targetLocationId ? [draft.kinship.targetLocationId] : []),
  ]);
  return [...entries].sort((a, b) => Number(relatedLocationIds.has(b.id)) - Number(relatedLocationIds.has(a.id))
    || Number(preferredTypes.has(b.type)) - Number(preferredTypes.has(a.type))
    || b.importance - a.importance);
}

function toDraftLocation(entry: GameplayLocationEntry): NonNullable<CharacterCreationDraft['location']> {
  return { locationId: entry.id, name: entry.name, regionId: entry.regionId, type: entry.type };
}

interface LocalCandidate {
  id: CharacterId;
  name: string;
  age?: number;
  houseIcon: GameIconId;
  locationName: string;
}

/** 读取与开局地点相同的已建档原著人物，作为关系的就近候选。 */
async function loadLocalCandidates(locationId: string): Promise<LocalCandidate[]> {
  const state = await worldContentRepository.loadStartState();
  const nameById = new Map((await worldContentRepository.loadGameplayLocations()).map((entry) => [entry.id, entry.name]));
  const here = state.characters
    .filter((entry) => entry.location.locationId === locationId && entry.aliveOverride !== false)
    .slice(0, 24);
  const resolved = await Promise.all(here.map(async (entry): Promise<LocalCandidate | undefined> => {
    const dossier = await dossierRepository.get(entry.characterId).catch(() => undefined);
    if (!dossier?.born || !dossier.alive || dossier.canonTier === 'genealogy') return undefined;
    return {
      id: dossier.id,
      name: dossier.name,
      age: characterAgeAtYear(dossier.birthDate, 298, dossier.deathDate, dossier.alive),
      houseIcon: getHouseIconId((dossier.dynastyId ?? '').replace(/^dynn_/i, '').toLowerCase()),
      locationName: nameById.get(locationId) ?? '此地',
    } satisfies LocalCandidate;
  }));
  return resolved.filter((entry): entry is LocalCandidate => Boolean(entry)).slice(0, 6);
}

interface PanelStatus {
  text: string;
  tone: 'done' | 'todo' | 'optional';
}

/** 每个栏目当前的完成情况，用于导航上的状态提示。 */
function creatorPanelStatus(draft: CharacterCreationDraft): Record<CreatorPanel, PanelStatus> {
  const identityReady = draft.name.trim().length > 0 && draft.culture.trim().length > 0 && draft.faith.trim().length > 0;
  return {
    life: draft.location ? { text: '查看全貌', tone: 'done' } : { text: '尚缺地点', tone: 'todo' },
    identity: identityReady ? { text: '已确定', tone: 'done' } : { text: '待填写', tone: 'todo' },
    house: draft.house
      ? { text: draft.house.houseName, tone: 'done' }
      : ROLE_HOUSE_REQUIRED.has(draft.role) ? { text: '建议补上', tone: 'todo' } : { text: '可以没有', tone: 'optional' },
    background: { text: '已选定', tone: 'done' },
    relations: draft.relations.length > 0 ? { text: `${draft.relations.length} 段关系`, tone: 'done' } : { text: '可选', tone: 'optional' },
    traits: draft.traitIds.length > 0 ? { text: `${draft.traitIds.length} 项特质`, tone: 'done' } : { text: '尚未选择', tone: 'optional' },
    situation: draft.location ? { text: '地点已定', tone: 'done' } : { text: '待选地点', tone: 'todo' },
  };
}

function relationLabel(kind: CustomRelationKind): string {
  return kind === 'acquaintance' ? '熟人' : kind === 'employer' ? '雇主' : '效忠';
}

function stripOpeningTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 border-b border-hairline pb-2"><span className="h-4 w-1 bg-gold-deep" /><h3 className="font-serif text-xs font-bold uppercase tracking-[0.18em] text-gold">{children}</h3></div>;
}

function IdentityLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-2"><span className="text-gold-deep">{icon}</span><span>{label}</span><span className="ml-auto max-w-[150px] truncate text-right text-parchment-dim">{value}</span></div>;
}

function ChoiceCard({ active, title, description, impact, onClick }: { active: boolean; title: string; description: string; impact?: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`border p-3 text-left transition-colors ${active ? 'border-gold bg-gold-deep/20' : 'border-hairline bg-ink-2/45 hover:border-hairline-bright'}`}><span className="flex items-center justify-between font-serif text-sm font-bold text-gold-bright">{title}{active && <Check className="h-3.5 w-3.5" />}</span><span className="mt-1 block text-[10px] leading-relaxed text-parchment-dim">{description}</span>{impact && <span className="mt-2 block text-[9px] leading-relaxed text-gold-deep">{impact}</span>}</button>;
}

function ChoiceGroup<T extends string>({ title, entries, value, onChoose }: { title: string; entries: Array<{ id: T; label: string; description: string; impact?: string }>; value: T; onChoose: (id: T) => void }) {
  return <section><h3 className="mb-2 font-serif text-sm font-bold text-gold">{title}</h3><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{entries.map((entry) => <ChoiceCard key={entry.id} active={value === entry.id} title={entry.label} description={entry.description} impact={entry.impact} onClick={() => onChoose(entry.id)} />)}</div></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5 text-[10px] tracking-wider text-parchment-faint"><span>{label}</span>{children}</label>;
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <div className="flex border border-hairline bg-ink"><button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="creator-step-button"><Minus className="h-3.5 w-3.5" /></button><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="min-w-0 flex-1 bg-transparent text-center font-mono text-sm text-parchment outline-none" /><button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="creator-step-button"><Plus className="h-3.5 w-3.5" /></button></div>;
}

function CustomHouseEditor({ draft, setDraft, onDraftChanged }: { draft: CharacterCreationDraft; setDraft: React.Dispatch<React.SetStateAction<CharacterCreationDraft>>; onDraftChanged: () => void }) {
  if (!draft.house) return null;
  const coatOfArms = draft.house.coatOfArms ?? DEFAULT_COAT_OF_ARMS;
  const updateHouseField = (key: 'houseName' | 'dynastyName' | 'houseWords', value: string) => {
    setDraft((current) => current.house ? ({ ...current, house: { ...current.house, [key]: stripEmoji(value) } }) : current);
    onDraftChanged();
  };
  const updateCoat = <K extends keyof CoatOfArmsDesign>(key: K, value: CoatOfArmsDesign[K]) => {
    setDraft((current) => current.house ? ({ ...current, house: { ...current.house, coatOfArms: { ...(current.house.coatOfArms ?? DEFAULT_COAT_OF_ARMS), [key]: value } } }) : current);
    onDraftChanged();
  };
  return <div className="mt-3 space-y-3 border-t border-hairline pt-3"><Field label="家族名称"><input className="creator-input" value={draft.house.houseName} onChange={(event) => updateHouseField('houseName', event.target.value)} /></Field><Field label="宗族名称"><input className="creator-input" value={draft.house.dynastyName} onChange={(event) => updateHouseField('dynastyName', event.target.value)} /></Field><Field label="家族箴言"><input className="creator-input" value={draft.house.houseWords} onChange={(event) => updateHouseField('houseWords', event.target.value)} /></Field><div className="grid grid-cols-2 gap-2"><Field label="盾形"><select className="creator-input" value={coatOfArms.shield} onChange={(event) => updateCoat('shield', event.target.value as CoatOfArmsDesign['shield'])}>{HERALDRY_SHIELDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field><Field label="底纹"><select className="creator-input" value={coatOfArms.pattern} onChange={(event) => updateCoat('pattern', event.target.value as CoatOfArmsDesign['pattern'])}>{HERALDRY_PATTERNS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field></div><Field label="徽记"><select className="creator-input" value={coatOfArms.emblem} onChange={(event) => updateCoat('emblem', event.target.value as CoatOfArmsDesign['emblem'])}>{HERALDRY_EMBLEMS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field><ColorPicker label="主色" value={coatOfArms.primaryColor} onChange={(value) => updateCoat('primaryColor', value)} /><ColorPicker label="副色" value={coatOfArms.secondaryColor} onChange={(value) => updateCoat('secondaryColor', value)} /><ColorPicker label="徽记色" value={coatOfArms.emblemColor} onChange={(value) => updateCoat('emblemColor', value)} /><div className="flex items-center justify-center border border-hairline bg-ink p-2"><CoatOfArms design={coatOfArms} className="h-24" /></div><p className="text-[8px] leading-relaxed text-parchment-faint">纹章只代表家族身份，不会自动创建领地或继承权。</p></div>;
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div><span className="text-[9px] text-parchment-faint">{label}</span><div className="mt-1 flex flex-wrap gap-1">{HERALDRY_COLORS.map((color) => <button key={color} type="button" onClick={() => onChange(color)} aria-label={`${label} ${color}`} className={`h-5 w-5 border ${value === color ? 'border-gold-bright ring-1 ring-gold' : 'border-black/60'}`} style={{ backgroundColor: color }} />)}</div></div>;
}

function RelationRow({ text, onRemove }: { text: string; onRemove: () => void }) {
  return <div className="flex items-center justify-between border border-hairline bg-ink px-3 py-2 text-[10px] text-parchment-dim"><span>{text}</span><button type="button" onClick={onRemove}><X className="h-3.5 w-3.5" /></button></div>;
}
