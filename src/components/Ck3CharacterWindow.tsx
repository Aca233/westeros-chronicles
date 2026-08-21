import React, { useEffect, useMemo, useState } from 'react';
import Model, { type IExerciseData } from 'react-body-highlighter';
import {
  ArrowLeft,
  Backpack,
  BookOpen,
  Coins,
  Crown,
  HeartPulse,
  MapPin,
  RotateCcw,
  Shield,
  Skull,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { CK3_SKILLS, getCk3SkillRank } from '../data/ck3Skills';
import {
  formatTraitDescription,
  formatTraitModifiers,
  formatTraitRuleEffects,
  resolveCharacterTraits,
  TRAIT_CATEGORY_LABELS,
} from '../data/characterTraits';
import { resolveLordFamilyRecords, type LordFamilyRecords } from '../features/characters/lordRelationshipResolver';
import { StaticCharacterRepository } from '../features/characters/staticCharacterRepository';
import { dossierEventStore, useCharacterDossier } from '../features/characters/useCharacterDossier';
import { projectLordFamilyRecords } from '../features/characters/characterRelationshipProjection';
import type { CharacterDossier, NpcCharacterDossier, PlayerCharacterDossier } from '../features/characters/characterDossier';
import type { CharacterExperience } from '../features/characters/characterSupplementTypes';
import type { CharacterId, StaticCharacterRecord } from '../features/characters/types';
import type { StoryTurn, WoundLevel } from '../types/game';
import { CharacterSearch } from './CharacterSearch';
import { CoatOfArms } from './CoatOfArms';
import { CharacterPortrait } from './CharacterPortrait';
import { GameIcon, getHouseIconId } from './GameIcon';
import { ItemManagementPanel } from './items/ItemManagementPanel';
import { HealthAndEquipmentPanel } from './items/HealthAndEquipmentPanel';
import { WorldAssetSections } from './items/WorldAssetSections';
import { factsForCharacter } from '../features/world/worldHistoryProjection';
import type { WorldEvent } from '../features/world/worldRuntimeTypes';
import { playerWorldEventViewer, selectVisibleWorldEvents } from '../features/world/worldEventVisibility';
import { useWorldEventDisplays } from '../features/world/useWorldEventDisplays';
import type { WorldEventDisplay } from '../features/world/worldDisplayResolver';
import { CANONICAL_TIMELINE } from '../data/generated/canonicalTimeline';
import { extractNarrativeContent } from '../services/modelProtocol';

const TABS = [
  { id: 'relations', label: '关系与家族', icon: UsersRound },
  { id: 'health', label: '健康与装备', icon: HeartPulse },
  { id: 'history', label: '记忆与经历', icon: BookOpen },
  { id: 'inventory', label: '物品与资产', icon: Backpack },
] as const;

type CharacterTab = (typeof TABS)[number]['id'];

const relationshipRepository = new StaticCharacterRepository();

export interface Ck3CharacterWindowProps {
  selectedCharacterId?: CharacterId | null;
  onSelectCharacter?: (characterId: CharacterId) => void;
  canGoBack?: boolean;
  onBack?: () => void;
  onReturnToPlayer?: () => void;
  onOpenLocation?: (locationId: string) => void;
  onOpenAsset?: (assetId: string) => void;
}

export const Ck3CharacterWindow: React.FC<Ck3CharacterWindowProps> = ({
  selectedCharacterId = null,
  onSelectCharacter = () => undefined,
  canGoBack = false,
  onBack = () => undefined,
  onReturnToPlayer = () => undefined,
  onOpenLocation = () => undefined,
  onOpenAsset = () => undefined,
}) => {
  const gameState = useGameStore((state) => state.gameState);
  const turns = gameState.turns;
  const worldEvents = useGameStore((state) => state.gameState.worldRuntime.events);
  const lord = useGameStore((state) => state.gameState.lord);
  const worldCharacters = useGameStore((state) => state.gameState.worldCharacters);
  const visibleWorldEvents = useMemo(
    () => selectVisibleWorldEvents(worldEvents, playerWorldEventViewer({ lord, worldCharacters })),
    [lord.canonicalCharacterId, worldCharacters?.runId, worldEvents],
  );
  const worldEventDisplays = useWorldEventDisplays(visibleWorldEvents, gameState);
  const { dossier, relatedRecords, status, error, reload } = useCharacterDossier(selectedCharacterId);
  const [activeTab, setActiveTab] = useState<CharacterTab>('relations');
  const [activeTraitId, setActiveTraitId] = useState<string | null>(null);

  useEffect(() => setActiveTraitId(null), [dossier?.id]);

  const displayedTraits = useMemo(
    () => dossier ? resolveCharacterTraits(dossier.traitIds, dossier.legacyTraits) : [],
    [dossier],
  );
  const selectedTrait = displayedTraits.find((trait) => trait.id === activeTraitId) ?? null;
  const houseIcon = getHouseIconId(dossier?.houseSigil || dossier?.house || 'artifact-crown');

  return (
    <aside
      data-ck3-character-window
      data-character-kind={dossier?.kind ?? status}
      className="ck3-character-window relative flex h-full w-full min-w-0 select-none flex-col overflow-hidden text-parchment"
      aria-label={dossier ? `${dossier.name}的人物窗口` : '人物窗口'}
    >
      <div className="ck3-ornament-line" aria-hidden="true" />
      {status !== 'ready' || !dossier ? (
        <DossierLoadState
          status={status}
          error={error}
          canGoBack={canGoBack}
          onBack={onBack}
          onReturnToPlayer={onReturnToPlayer}
          onReload={reload}
        />
      ) : (
        <>
          <IdentityHeader
            dossier={dossier}
            houseIcon={houseIcon}
            canGoBack={canGoBack}
            onBack={onBack}
            onReturnToPlayer={onReturnToPlayer}
            onOpenLocation={onOpenLocation}
          />

          <div className="min-h-0 flex-1 overflow-y-auto">
            <OverviewTab
              dossier={dossier}
              displayedTraits={displayedTraits}
              activeTraitId={activeTraitId}
              onTraitSelect={setActiveTraitId}
            />

            <nav
              data-character-lower-tabs
              className="sticky top-0 z-20 flex border-b border-hairline/80 bg-ink/95 px-3 backdrop-blur-sm"
              aria-label="人物档案页签"
            >
              {TABS.map(({ id, label }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    aria-current={active ? 'page' : undefined}
                    data-active={active}
                    className="text-tab min-w-0 flex-1 truncate"
                    title={label}
                  >
                    {label}
                  </button>
                );
              })}
            </nav>

            <div className="min-h-[240px]">
              {activeTab === 'relations' && (
                <RelationsTab
                  dossier={dossier}
                  relatedRecords={relatedRecords}
                  onSelectCharacter={onSelectCharacter}
                />
              )}
              {activeTab === 'health' && <HealthAndEquipmentPanel dossier={dossier} embedded />}
              {activeTab === 'history' && (dossier.kind === 'player' ? <PlayerHistoryTab turns={turns} dossier={dossier} /> : <NpcHistoryTab dossier={dossier} worldEvents={visibleWorldEvents} worldEventDisplays={worldEventDisplays} />)}
              {activeTab === 'inventory' && (
                <CharacterAssetsTab
                  dossier={dossier}
                  relatedRecords={relatedRecords}
                  onOpenCharacter={onSelectCharacter}
                  onOpenLocation={onOpenLocation}
                  onOpenAsset={onOpenAsset}
                />
              )}
            </div>
          </div>

          {selectedTrait && <TraitDetailOverlay trait={selectedTrait} characterName={dossier.name} onClose={() => setActiveTraitId(null)} />}
        </>
      )}
    </aside>
  );
};

function DossierLoadState({
  status,
  error,
  canGoBack,
  onBack,
  onReturnToPlayer,
  onReload,
}: {
  status: 'loading' | 'error' | 'ready';
  error: string | null;
  canGoBack: boolean;
  onBack: () => void;
  onReturnToPlayer: () => void;
  onReload: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <GameIcon icon="artifact-white-book" className="h-16 w-16 opacity-70" />
      <div>
        <h2 className="font-serif text-base font-bold text-parchment">{status === 'loading' ? '正在核对人物档案' : '人物档案无法打开'}</h2>
        <p className="mt-2 max-w-xs font-serif text-[11px] leading-relaxed text-parchment-faint">
          {status === 'loading' ? '正在读取稳定 AGOT 人物资料与当前存档中的动态经历。' : error || '人物档案读取失败。'}
        </p>
      </div>
      {status === 'error' && (
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onReload} className="btn-ghost"><RotateCcw className="h-3.5 w-3.5" />重新读取</button>
          {canGoBack && <button type="button" onClick={onBack} className="btn-ghost"><ArrowLeft className="h-3.5 w-3.5" />返回</button>}
          <button type="button" onClick={onReturnToPlayer} className="btn-ghost"><UserRound className="h-3.5 w-3.5" />回到自己</button>
        </div>
      )}
    </div>
  );
}

function IdentityHeader({
  dossier,
  houseIcon,
  canGoBack,
  onBack,
  onReturnToPlayer,
  onOpenLocation,
}: {
  dossier: CharacterDossier;
  houseIcon: ReturnType<typeof getHouseIconId>;
  canGoBack: boolean;
  onBack: () => void;
  onReturnToPlayer: () => void;
  onOpenLocation: (locationId: string) => void;
}) {
  return (
    <header className="relative shrink-0 px-4 pb-5 pt-5">
      <div
        data-character-identity-layout="split"
        className="grid grid-cols-[minmax(0,1fr)_132px] items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_168px] sm:gap-4"
      >
        <div className="min-w-0 text-left">
          {dossier.kind === 'npc' && (
            <div data-character-navigation className="mb-3 flex flex-wrap items-center justify-start gap-1.5">
              {canGoBack && (
                <button type="button" onClick={onBack} className="btn-ghost !px-2 !py-1 !text-[10px]">
                  <ArrowLeft className="h-3 w-3" />返回上一人物
                </button>
              )}
              <button type="button" onClick={onReturnToPlayer} className="btn-ghost !px-2 !py-1 !text-[10px]">
                <UserRound className="h-3 w-3" />回到自己
              </button>
            </div>
          )}

          <div className="flex items-start gap-3">
            <div className="ck3-heraldry-frame flex h-[62px] w-[54px] shrink-0 items-center justify-center p-1.5">
              {dossier.kind === 'player' && dossier.player.coatOfArms ? (
                <CoatOfArms design={dossier.player.coatOfArms} className="h-full" />
              ) : (
                <GameIcon icon={houseIcon} className="h-full w-full object-contain" />
              )}
            </div>
            <div className="min-w-0 pt-0.5">
              <p className="eyebrow">{dossier.dynastyName}</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <h2 className="break-words font-serif text-[25px] font-black leading-[1.12] tracking-[0.04em] text-parchment">{dossier.name}</h2>
                {dossier.aliases && dossier.aliases.length > 0 && (
                  <span data-character-aliases className="font-serif text-[11px] italic text-gold-deep/90">
                    （{dossier.aliases.join('、')}）
                  </span>
                )}
              </div>
            </div>
          </div>

          <p className="mt-3 font-serif text-[12px] font-semibold leading-relaxed text-gold">
            {dossier.title}
            {dossier.age !== undefined && <span className="ml-2 font-mono text-[10px] font-normal text-parchment-faint">{dossier.age} 岁</span>}
            {dossier.kind === 'npc' ? (
              <span data-npc-status className={`ml-2 inline-flex items-center gap-1 text-[10px] font-semibold ${dossier.alive ? 'text-emerald-700' : 'text-rubric'}`}>
                <span className={`h-1 w-1 rounded-full ${dossier.alive ? 'bg-emerald-700' : 'bg-rubric'}`} aria-hidden="true" />
                {dossier.alive ? '在世' : '已故'}
              </span>
            ) : (
              !dossier.alive && <span className="ml-2 text-[10px] font-bold text-rubric">已故</span>
            )}
          </p>
          <div className="mt-2.5 flex flex-col items-start gap-1 text-[10px] text-parchment-faint">
            <span>{dossier.house}</span>
            <span>{dossier.culture} · {dossier.faith}</span>
            <button
              type="button"
              disabled={!dossier.worldLocation}
              onClick={() => dossier.worldLocation && onOpenLocation(dossier.worldLocation.locationId)}
              className="inline-flex min-w-0 items-center gap-1 text-left transition-colors enabled:hover:text-gold disabled:cursor-default"
            >
              <MapPin className="h-3 w-3 shrink-0 text-gold-deep" /><span className="truncate">{dossier.location}</span>
            </button>
          </div>
          {dossier.summary && (
            <p data-character-summary className="mt-3 border-l-2 border-gold-deep/50 pl-2.5 font-serif text-[11px] leading-relaxed text-parchment-dim">
              {dossier.summary}
            </p>
          )}
          <div className="identity-rule !mx-0 !mt-4 !w-full" aria-hidden="true"><span className="divider-gem" /></div>
        </div>

        <section
          data-character-portrait-side="right"
          className="ck3-portrait-frame ck3-portrait-frame--hero relative h-[188px] w-full self-start overflow-hidden sm:h-[210px]"
          aria-label="人物肖像"
        >
          <div className="portrait-glow absolute inset-0" />
          <CharacterPortrait
            characterId={dossier.kind === 'npc' ? dossier.id : dossier.player.canonicalCharacterId}
            houseIcon={houseIcon}
            alt={`${dossier.name}的肖像`}
            priority
            deceased={!dossier.alive}
            className="h-full w-full pb-7"
          />
          <div className="absolute inset-x-2 bottom-2 border-t border-gold-deep/40 pt-1.5 text-center sm:inset-x-3">
            <div className="portrait-caption-house truncate text-[10px] font-bold tracking-wide">{dossier.house}</div>
            <div className="portrait-caption-words mt-0.5 truncate text-[8px] italic">“{dossier.houseWords}”</div>
          </div>
        </section>
      </div>
    </header>
  );
}

function OverviewTab({
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

function RelationsTab({
  dossier,
  relatedRecords,
  onSelectCharacter,
}: {
  dossier: CharacterDossier;
  relatedRecords: ReadonlyMap<CharacterId, StaticCharacterRecord>;
  onSelectCharacter: (characterId: CharacterId) => void;
}) {
  const gameState = useGameStore((state) => state.gameState);
  const { family, isLoading } = useVerifiedLordFamily(dossier.kind === 'player' ? gameState.lord : null, gameState.currentYear);
  const [showAllChildren, setShowAllChildren] = useState(false);
  useEffect(() => setShowAllChildren(false), [dossier.id]);
  const relationshipCards = dossier.kind === 'player'
    ? playerRelationshipCards(family, dossier, relatedRecords)
    : npcRelationshipCards(dossier, relatedRecords);
  const byGroup = (group: RelationshipCard['group']) => relationshipCards.filter((card) => card.group === group);

  // 族谱次序:配偶 → 子女 → 父母 → 兄弟姐妹 → 重要关系
  const groupSections: Array<{
    key: RelationshipCard['group'];
    title: string;
    cards: RelationshipCard[];
    showLabel?: boolean;
    marker?: 'data-character-children' | 'data-character-siblings';
  }> = [
    { key: 'spouse', title: '配偶', cards: byGroup('spouse') },
    { key: 'child', title: '子女', cards: byGroup('child'), marker: 'data-character-children' },
    { key: 'parent', title: '父母', cards: byGroup('parent'), showLabel: true },
    { key: 'sibling', title: '兄弟姐妹', cards: byGroup('sibling'), marker: 'data-character-siblings' },
    { key: 'notable', title: '重要关系', cards: byGroup('notable'), showLabel: true },
  ];

  // 空关系合并为一行小字注记,不再每个槽位占一整行
  const renderEmptyNotes = (cards: RelationshipCard[]) => {
    const noted = cards.filter((card) => card.emptyText);
    const plain = cards.filter((card) => !card.emptyText);
    return (
      <ul>
        {noted.map((card) => (
          <li key={card.label} className="relation-empty">
            <span className="relation-empty-label">{card.label}</span>
            <span>{card.emptyText}</span>
          </li>
        ))}
        {plain.length > 0 && (
          <li className="relation-empty">
            <span className="relation-empty-label">{plain.map((card) => card.label).join(' · ')}</span>
            <span>{dossier.kind === 'player' && isLoading ? '正在核对档案' : '档案未记录'}</span>
          </li>
        )}
      </ul>
    );
  };

  return (
    <div className="space-y-5 px-5 py-5">
      <SectionTitle title="关系与家族" subtitle="读取稳定人物档案并叠加当前存档事件,缺少依据的关系不会猜测" />
      <div className="space-y-5">
        {groupSections.map(({ key, title, cards, showLabel, marker }) => {
          if (key === 'notable' && cards.length === 0) return null;
          const realCards = cards.filter((card): card is RelationshipCard & { person: StaticCharacterRecord } => Boolean(card.person));
          const emptyCards = cards.filter((card) => !card.person);
          const isChildren = key === 'child';
          const shownCards = isChildren && !showAllChildren ? realCards.slice(0, 8) : realCards;
          return (
            <section key={key} aria-label={title} {...(marker ? { [marker]: true } : {})}>
              <div className="flex items-center justify-between border-b border-hairline/70 pb-1.5">
                <p className="eyebrow">{title}</p>
                {realCards.length > 0 && <span className="font-mono text-[9.5px] text-parchment-faint">{realCards.length} 人</span>}
              </div>
              {realCards.length > 0 && (
                <ul className="grid grid-cols-2 gap-1.5 pt-2">
                  {shownCards.map(({ label, person }, index) => (
                    <RelationshipRow
                      key={`${label}-${person?.id ?? index}`}
                      label={label}
                      person={person}
                      showLabel={showLabel}
                      onSelectCharacter={onSelectCharacter}
                    />
                  ))}
                </ul>
              )}
              {isChildren && realCards.length > 8 && (
                <button
                  type="button"
                  onClick={() => setShowAllChildren((value) => !value)}
                  className="btn-ghost mt-1 !px-0 !text-[10px]"
                >
                  {showAllChildren ? '收起子女' : `显示全部子女（${realCards.length}）`}
                </button>
              )}
              {emptyCards.length > 0 && renderEmptyNotes(emptyCards)}
              {cards.length === 0 && (
                <EmptyState label={dossier.kind === 'player' && isLoading ? '正在核对亲属档案' : '档案未记录'} />
              )}
            </section>
          );
        })}
      </div>
      <CharacterSearch onSelectCharacter={onSelectCharacter} />
      <p className="border-t border-hairline/60 pt-3 text-center font-serif text-[10px] italic leading-relaxed text-parchment-faint">
        {dossier.kind === 'player'
          ? '亲属来自稳定人物档案,缺少依据的关系不予虚构。'
          : '关系来自静态档案与当前存档事件,未记录的关系保持空白。'}
      </p>
    </div>
  );
}

interface RelationshipCard {
  label: string;
  person?: StaticCharacterRecord;
  emptyText?: string;
  group: 'spouse' | 'child' | 'sibling' | 'parent' | 'notable';
}

function isJonSnow(characterId: CharacterId | undefined): boolean {
  return characterId === 'agot:Stark_7';
}

function playerRelationshipCards(
  family: LordFamilyRecords,
  dossier?: PlayerCharacterDossier,
  records?: ReadonlyMap<CharacterId, StaticCharacterRecord>,
): RelationshipCard[] {
  const cards: RelationshipCard[] = [];
  const spouses = family.spouses ?? (family.spouse ? [family.spouse] : []);
  if (spouses.length === 0) cards.push({ label: '配偶', group: 'spouse' });
  spouses.forEach((person) => cards.push({ label: '配偶', person, group: 'spouse' }));
  (family.children ?? []).forEach((person) => cards.push({ label: '子女', person, group: 'child' }));
  (family.siblings ?? []).forEach((person) => cards.push({ label: '兄弟姐妹', person, group: 'sibling' }));
  cards.push({ label: '父亲', person: family.father, group: 'parent' });
  cards.push({
    label: '母亲',
    person: family.mother,
    emptyText: isJonSnow(family.subject?.id) ? '当前时间线未公开' : undefined,
    group: 'parent',
  });
  if (dossier?.relations?.notableRelations && dossier.relations.notableRelations.length > 0 && records) {
    dossier.relations.notableRelations.forEach((relation) =>
      cards.push({ label: relationLabel(relation.kind), person: records.get(relation.targetId), emptyText: relation.description, group: 'notable' })
    );
  } else {
    cards.push({ label: '继承人', group: 'notable' });
    cards.push({ label: '领主', group: 'notable' });
    cards.push({ label: '重要关系', group: 'notable' });
  }
  return cards;
}

function npcRelationshipCards(dossier: NpcCharacterDossier, records: ReadonlyMap<CharacterId, StaticCharacterRecord>): RelationshipCard[] {
  const cards: RelationshipCard[] = [];
  if (dossier.relations.spouseIds.length === 0) cards.push({ label: '配偶', group: 'spouse' });
  dossier.relations.spouseIds.forEach((id) => cards.push({ label: '配偶', person: records.get(id), group: 'spouse' }));
  dossier.relations.childIds.forEach((id) => cards.push({ label: '子女', person: records.get(id), group: 'child' }));
  dossier.relations.siblingIds.forEach((id) => cards.push({ label: '兄弟姐妹', person: records.get(id), group: 'sibling' }));
  cards.push({ label: '父亲', person: dossier.relations.fatherId ? records.get(dossier.relations.fatherId) : undefined, group: 'parent' });
  cards.push({
    label: '母亲',
    person: dossier.relations.motherId ? records.get(dossier.relations.motherId) : undefined,
    emptyText: isJonSnow(dossier.id) ? '当前时间线未公开' : undefined,
    group: 'parent',
  });
  dossier.relations.notableRelations.forEach((relation) =>
    cards.push({ label: relationLabel(relation.kind), person: records.get(relation.targetId), emptyText: relation.description, group: 'notable' })
  );
  const existingIds = new Set(dossier.relations.notableRelations.map((relation) => relation.targetId));
  dossier.relations.relationships
    .filter((relation) => !existingIds.has(relation.targetId))
    .slice(0, 4)
    .forEach((relation) => cards.push({ label: relation.kind ? relationLabel(relation.kind) : '重要关系', person: records.get(relation.targetId), group: 'notable' }));
  return cards;
}

function relationLabel(kind: string): string {
  const labels: Record<string, string> = { lover: '恋人', friend: '朋友', rival: '仇敌', nemesis: '死敌', guardian: '监护人' };
  return labels[kind] ?? kind.replace(/_/g, ' ');
}

function useVerifiedLordFamily(
  lord: ReturnType<typeof useGameStore.getState>['gameState']['lord'] | null,
  currentYear: number,
): { family: LordFamilyRecords; isLoading: boolean } {
  const worldCharacters = useGameStore((state) => state.gameState.worldCharacters);
  const worldHistory = useGameStore((state) => state.gameState.worldHistory);
  const worldRuntime = useGameStore((state) => state.gameState.worldRuntime);
  const [family, setFamily] = useState<LordFamilyRecords>({});
  const [isLoading, setIsLoading] = useState(Boolean(lord));

  useEffect(() => {
    let cancelled = false;
    if (!lord) {
      setFamily({});
      setIsLoading(false);
      return () => { cancelled = true; };
    }
    setIsLoading(true);
    resolveLordFamilyRecords({
      canonicalCharacterId: lord.canonicalCharacterId,
      name: lord.name,
      house: lord.house,
      houseSigil: lord.houseSigil,
      age: lord.age,
      currentYear,
    }, relationshipRepository)
      .then((result) => projectLordFamilyRecords(
        result,
        (characterId) => worldCharacters
          ? dossierEventStore.eventsForCharacter(worldCharacters.runId, characterId)
          : Promise.resolve([]),
        { history: worldHistory, runtime: worldRuntime, timeline: CANONICAL_TIMELINE },
      ))
      .then((result) => { if (!cancelled) setFamily(result); })
      .catch(() => { if (!cancelled) setFamily({}); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [
    lord?.canonicalCharacterId,
    lord?.name,
    lord?.house,
    lord?.houseSigil,
    lord?.age,
    currentYear,
    worldCharacters?.runId,
    worldCharacters?.revision,
    worldHistory,
    worldRuntime.revision,
  ]);

  return { family, isLoading };
}

function RelationshipRow({
  label,
  person,
  showLabel = false,
  onSelectCharacter,
}: {
  label: string;
  person: StaticCharacterRecord;
  /** 父母(父亲/母亲)与重要关系(仇敌/恋人等)需要各自称谓;其余组与组头重复,省略 */
  showLabel?: boolean;
  onSelectCharacter: (characterId: CharacterId) => void;
}) {
  const icon = getDynastyHouseIcon(person.dynastyId);
  return (
    <li>
      <button
        type="button"
        data-character-card
        onClick={() => onSelectCharacter(person.id)}
        className="relation-tile group"
        title={`查看${person.name}的人物档案`}
      >
        <CharacterPortrait
          characterId={person.id}
          houseIcon={icon ?? 'artifact-crown'}
          alt={`${person.name}的肖像`}
          deceased={!person.alive}
          className="h-9 w-8 shrink-0 border border-hairline-bright transition-colors group-hover:border-gold-deep"
        />
        <span className="min-w-0 flex-1">
          <span className="relation-name block truncate font-serif text-[12px] font-semibold text-parchment transition-colors">
            {person.name}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[9px] text-parchment-faint">
            {showLabel && <span className="tracking-[0.1em] text-gold-deep">{label}</span>}
            <span className={`h-1 w-1 rounded-full ${person.alive ? 'bg-emerald-700' : 'bg-parchment-faint'}`} aria-hidden="true" />
            {person.alive ? '在世' : '已故'}
          </span>
        </span>
      </button>
    </li>
  );
}

function getDynastyHouseIcon(dynastyId: string | null | undefined): ReturnType<typeof getHouseIconId> | null {
  const dynasty = (dynastyId ?? '').toLowerCase();
  for (const name of ['stark', 'lannister', 'targaryen', 'baratheon', 'tyrell', 'martell', 'arryn', 'greyjoy', 'tully']) {
    if (dynasty.includes(name)) return getHouseIconId(name);
  }
  return null;
}

function CharacterNarrativeProfile({ dossier }: { dossier: CharacterDossier }) {
  const hasNarrative = Boolean(
    (dossier.publicRoles && dossier.publicRoles.length > 0) ||
    dossier.appearance ||
    dossier.personality ||
    dossier.reputation
  );
  if (!hasNarrative) return null;

  return (
    <section className="space-y-3 rounded border border-hairline/80 bg-ink-2/60 p-3.5" aria-label="个人生平概述" data-character-narrative-profile>
      {dossier.publicRoles && dossier.publicRoles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-character-public-roles>
          <span className="eyebrow !text-[9.5px]">公开身份:</span>
          {dossier.publicRoles.map((role) => (
            <span key={role} className="rounded border border-gold-deep/30 bg-gold-deep/15 px-1.5 py-0.5 font-serif text-[10.5px] font-semibold text-gold">
              {role}
            </span>
          ))}
        </div>
      )}
      {dossier.appearance && (
        <div data-character-appearance>
          <span className="eyebrow !text-[9.5px]">外貌特征:</span>
          <p className="mt-0.5 font-serif text-[11px] leading-relaxed text-parchment-dim">{dossier.appearance}</p>
        </div>
      )}
      {dossier.personality && (
        <div data-character-personality>
          <span className="eyebrow !text-[9.5px]">性格作风:</span>
          <p className="mt-0.5 font-serif text-[11px] leading-relaxed text-parchment-dim">{dossier.personality}</p>
        </div>
      )}
      {dossier.reputation && (
        <div data-character-reputation>
          <span className="eyebrow !text-[9.5px]">声誉风评:</span>
          <p className="mt-0.5 font-serif text-[11px] leading-relaxed text-parchment-dim">{dossier.reputation}</p>
        </div>
      )}
    </section>
  );
}

function CharacterExperiencesList({ experiences }: { experiences?: CharacterExperience[] }) {
  if (!experiences || experiences.length === 0) return null;
  return (
    <div className="space-y-3" data-character-historical-experiences>
      <div className="border-b border-hairline/70 pb-1">
        <p className="eyebrow">重要历史经历</p>
      </div>
      <ol className="flex flex-col">
        {experiences.map((exp, idx) => (
          <li key={`${exp.date}-${exp.title}-${idx}`} className="border-b border-hairline/60 py-3 last:border-b-0">
            <strong className="font-mono text-[10px] tracking-wider text-gold">{exp.date} AC</strong>
            <p className="mt-1 font-serif text-[11.5px] font-semibold text-parchment">{exp.title}</p>
            <p className="mt-1 font-serif text-[10.5px] leading-relaxed text-parchment-dim">{exp.description}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CharacterSourceLinks({ sources }: { sources?: string[] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="border-t border-hairline/50 pt-2 text-[9.5px] text-parchment-faint" data-character-source-links>
      <span className="eyebrow !text-[9px]">参考资料: </span>
      {sources.map((url, i) => (
        <span key={url}>
          {i > 0 && ' · '}
          <a href={url} target="_blank" rel="noreferrer" className="text-gold-dim hover:text-gold hover:underline">
            来源 {i + 1}
          </a>
        </span>
      ))}
    </div>
  );
}

function PlayerHistoryTab({ turns, dossier }: { turns: StoryTurn[]; dossier: PlayerCharacterDossier }) {
  const recentTurns = turns.slice(-8).reverse();
  const hasNarrative = Boolean(
    (dossier.publicRoles && dossier.publicRoles.length > 0) ||
    dossier.appearance ||
    dossier.personality ||
    dossier.reputation
  );
  const hasExperiences = Boolean(dossier.supplementExperiences && dossier.supplementExperiences.length > 0);

  return (
    <div className="space-y-5 px-5 py-5">
      <SectionTitle title="记忆与经历" subtitle="从已发生的场景与人物卷宗中整理" />
      <CharacterNarrativeProfile dossier={dossier} />
      <CharacterExperiencesList experiences={dossier.supplementExperiences} />
      {recentTurns.length > 0 ? (
        <div className="space-y-3">
          {hasExperiences && (
            <div className="border-b border-hairline/70 pb-1">
              <p className="eyebrow">近期剧情经历</p>
            </div>
          )}
          <ol className="flex flex-col">
            {recentTurns.map((turn) => (
              <li key={turn.id} className="border-b border-hairline/60 py-3 last:border-b-0">
                <div className="flex items-baseline justify-between gap-2">
                  <strong className="font-mono text-[10px] tracking-wider text-gold">TURN {turn.turnNumber}</strong>
                  <span className="text-[9px] text-parchment-faint">{turn.gameDate || '日期未记录'}</span>
                </div>
                <p className="mt-1 line-clamp-2 font-serif text-[11px] leading-relaxed text-parchment-dim">{extractNarrativeContent(turn.narrate) || turn.playerInput}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        !hasNarrative && !hasExperiences && <EmptyState label="尚无可记录的经历" />
      )}
      <CharacterSourceLinks sources={dossier.sourceUrls} />
    </div>
  );
}

function NpcHistoryTab({ dossier, worldEvents, worldEventDisplays }: { dossier: NpcCharacterDossier; worldEvents: readonly WorldEvent[]; worldEventDisplays: ReadonlyMap<string, WorldEventDisplay> }) {
  const memories = [...dossier.memories].sort((a, b) => b.turn - a.turn || b.importance - a.importance);
  const worldFacts = factsForCharacter(worldEvents, dossier.id).slice().reverse();
  const hasNarrative = Boolean(
    (dossier.publicRoles && dossier.publicRoles.length > 0) ||
    dossier.appearance ||
    dossier.personality ||
    dossier.reputation
  );
  const hasExperiences = Boolean(dossier.supplementExperiences && dossier.supplementExperiences.length > 0);

  return (
    <div className="space-y-5 px-5 py-5">
      <SectionTitle title="记忆与经历" subtitle="展示人物公开履历、生平记忆与世界历史记录" />
      <CharacterNarrativeProfile dossier={dossier} />
      <CharacterExperiencesList experiences={dossier.supplementExperiences} />
      {worldFacts.length > 0 && (
        <div className="space-y-3">
          <div className="border-b border-hairline/70 pb-1">
            <p className="eyebrow">世界事实记录</p>
          </div>
          <ol className="flex flex-col" data-character-world-facts>
            {worldFacts.map((fact) => (
              <li key={fact.id} className="border-b border-hairline/60 py-3 last:border-b-0">
                <strong className="font-mono text-[10px] tracking-wider text-gold">{fact.date.year} AC · {fact.date.month}月{fact.date.day}日</strong>
                <p className="mt-1 font-serif text-[11px] font-semibold text-parchment">{worldEventDisplays.get(fact.id)?.title ?? fact.reason}</p>
                {worldEventDisplays.get(fact.id)?.entities.length ? (
                  <p className="mt-1 font-serif text-[10.5px] leading-relaxed text-gold-dim">{worldEventDisplays.get(fact.id)!.entities.map((entity) => entity.label).join(' · ')}</p>
                ) : null}
                {worldEventDisplays.get(fact.id) && (
                  <details className="mt-1 text-[9px] text-parchment-faint/70">
                    <summary className="cursor-pointer select-none">技术记录</summary>
                    <p>{worldEventDisplays.get(fact.id)!.audit.eventType} · {worldEventDisplays.get(fact.id)!.audit.source} · {worldEventDisplays.get(fact.id)!.audit.transactionId}</p>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      {memories.length > 0 ? (
        <div className="space-y-3">
          <div className="border-b border-hairline/70 pb-1">
            <p className="eyebrow">个人记忆</p>
          </div>
          <ol className="flex flex-col">
            {memories.map((memory) => (
              <li key={memory.id} className="border-b border-hairline/60 py-3 last:border-b-0">
                <strong className="font-mono text-[10px] tracking-wider text-gold">TURN {memory.turn}</strong>
                <p className="mt-1 font-serif text-[11px] leading-relaxed text-parchment-dim">{memory.event}</p>
                {memory.attitude && <p className="mt-1 text-[9px] text-parchment-faint">态度:{memory.attitude}</p>}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        !hasNarrative && !hasExperiences && worldFacts.length === 0 && (
          <EmptyState label="当前存档尚未记录此人的个人记忆" />
        )
      )}
      <CharacterSourceLinks sources={dossier.sourceUrls} />
    </div>
  );
}


function woundLabel(level: WoundLevel): string {
  return level === 'minor' ? '轻创' : level === 'heavy' ? '重伤' : level === 'critical' ? '垂危' : '未记录创伤';
}

function CharacterAssetsTab({
  dossier,
  relatedRecords,
  onOpenCharacter,
  onOpenLocation,
  onOpenAsset,
}: {
  dossier: CharacterDossier;
  relatedRecords: ReadonlyMap<CharacterId, StaticCharacterRecord>;
  onOpenCharacter: (characterId: CharacterId) => void;
  onOpenLocation: (locationId: string) => void;
  onOpenAsset: (assetId: string) => void;
}) {
  return (
    <div className="space-y-5 px-5 py-5" data-character-world-assets>
      <SectionTitle
        title="物品与资产"
        subtitle={dossier.kind === 'player'
          ? '按随行、当前地点、载具与远方资产整理；法理所有、实际控制、直接保管、物理位置与装备状态分别记录'
          : '法理所有、实际控制、直接保管、物理位置与装备状态分别记录'}
      />
      {dossier.kind === 'player' ? (
        <ItemManagementPanel
          dossier={dossier}
          onOpenCharacter={onOpenCharacter}
          onOpenLocation={onOpenLocation}
          onOpenAsset={onOpenAsset}
        />
      ) : (
        <WorldAssetSections
          dossier={dossier}
          relatedRecords={relatedRecords}
          onOpenCharacter={onOpenCharacter}
          onOpenLocation={onOpenLocation}
          onOpenAsset={onOpenAsset}
        />
      )}
      <p className="border-l border-gold-deep/60 pl-3 font-serif text-[10px] leading-relaxed text-parchment-faint">
        实际穿戴只在“健康与装备”中显示；本页不会把远处名下资产误作随身携带。
      </p>
    </div>
  );
}

function TraitDetailOverlay({
  trait,
  characterName,
  onClose,
}: {
  trait: ReturnType<typeof resolveCharacterTraits>[number];
  characterName: string;
  onClose: () => void;
}) {
  const description = formatTraitDescription(trait.description, characterName);
  const effects = [formatTraitModifiers(trait.modifiers), ...formatTraitRuleEffects(trait.rules)].filter(Boolean);

  return (
    <div className="panel-iron scene-enter absolute inset-x-3 bottom-3 z-30 p-4">
      <div className="flex gap-3">
        <GameIcon icon={trait.icon} className="h-14 w-14 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <strong className="font-serif text-sm text-parchment">{trait.name}</strong>
              <div className="mt-0.5 text-[9px] tracking-wider text-parchment-faint">{trait.isLegacy ? '旧存档标签' : TRAIT_CATEGORY_LABELS[trait.category]}</div>
            </div>
            <button type="button" onClick={onClose} className="btn-ghost !px-1 !py-0 !text-[10px]">关闭</button>
          </div>
          <p className="mt-2 font-serif text-[11px] leading-relaxed text-parchment-dim">{description}</p>
          {effects.length > 0 && <p className="mt-2 font-mono text-[10px] leading-relaxed text-gold">{effects.join(' · ')}</p>}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
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

function StorageSummary({ icon, label, count, detail }: { icon: React.ReactNode; label: string; count: number; detail: string }) {
  return (
    <div className="border border-hairline/70 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-gold-deep">{icon}<strong className="text-[10px] tracking-wide">{label}</strong></div>
      <div className="mt-1.5 font-display text-sm font-bold text-parchment">{count}</div>
      <div className="mt-0.5 text-[9px] text-parchment-faint">{detail}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="py-4 text-center font-serif text-[10px] italic leading-relaxed text-parchment-faint">{label}</p>;
}

function getSkillValueColor(value: number): string {
  if (value >= 25) return 'text-rubric';
  if (value >= 20) return 'text-emerald-700';
  if (value >= 16) return 'text-emerald-700';
  if (value <= 4) return 'text-rubric';
  return 'text-gold';
}
