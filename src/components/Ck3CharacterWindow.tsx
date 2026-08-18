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
import { useCharacterDossier } from '../features/characters/useCharacterDossier';
import type { CharacterDossier, NpcCharacterDossier } from '../features/characters/characterDossier';
import type { CharacterId, StaticCharacterRecord } from '../features/characters/types';
import type { StoryTurn, WoundLevel } from '../types/game';
import { CharacterSheet } from './CharacterSheet';
import { CharacterSearch } from './CharacterSearch';
import { CoatOfArms } from './CoatOfArms';
import { CharacterPortrait } from './CharacterPortrait';
import { GameIcon, getHouseIconId } from './GameIcon';
import { ItemManagementPanel } from './items/ItemManagementPanel';
import { ItemImage } from './items/ItemImage';
import { ITEM_CATALOG } from '../data/itemDefinitions';
import { factsForCharacter, projectNpcAssets, projectNpcEquipment } from '../features/world/worldHistoryProjection';
import type { WorldArtifactState } from '../features/items/worldArtifacts';
import type { WorldHistoryState } from '../features/world/worldHistory';

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
}

export const Ck3CharacterWindow: React.FC<Ck3CharacterWindowProps> = ({
  selectedCharacterId = null,
  onSelectCharacter = () => undefined,
  canGoBack = false,
  onBack = () => undefined,
  onReturnToPlayer = () => undefined,
}) => {
  const turns = useGameStore((state) => state.gameState.turns);
  const worldArtifacts = useGameStore((state) => state.gameState.worldArtifacts);
  const worldHistory = useGameStore((state) => state.gameState.worldHistory);
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
                  houseIcon={houseIcon}
                  relatedRecords={relatedRecords}
                  onSelectCharacter={onSelectCharacter}
                />
              )}
              {activeTab === 'health' && (dossier.kind === 'player' ? <CharacterSheet embedded /> : <NpcHealthTab dossier={dossier} worldArtifacts={worldArtifacts} />)}
              {activeTab === 'history' && (dossier.kind === 'player' ? <PlayerHistoryTab turns={turns} /> : <NpcHistoryTab dossier={dossier} worldHistory={worldHistory} />)}
              {activeTab === 'inventory' && (dossier.kind === 'player' ? <PlayerInventoryTab /> : <NpcInventoryTab dossier={dossier} worldArtifacts={worldArtifacts} />)}
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
}: {
  dossier: CharacterDossier;
  houseIcon: ReturnType<typeof getHouseIconId>;
  canGoBack: boolean;
  onBack: () => void;
  onReturnToPlayer: () => void;
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
              <h2 className="mt-1 break-words font-serif text-[25px] font-black leading-[1.12] tracking-[0.04em] text-parchment">{dossier.name}</h2>
            </div>
          </div>

          <p className="mt-3 font-serif text-[12px] font-semibold leading-relaxed text-gold">
            {dossier.title}
            {dossier.age !== undefined && <span className="ml-2 font-mono text-[10px] font-normal text-parchment-faint">{dossier.age} 岁</span>}
            {!dossier.alive && <span className="ml-2 text-[10px] font-bold text-rubric">已故</span>}
          </p>
          <div className="mt-2.5 flex flex-col items-start gap-1 text-[10px] text-parchment-faint">
            <span>{dossier.house}</span>
            <span>{dossier.culture} · {dossier.faith}</span>
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0 text-gold-deep" /><span className="truncate">{dossier.location}</span>
            </span>
          </div>
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
          <div className="flex gap-1 overflow-x-auto pb-1" aria-label="人物特质列表">
            {displayedTraits.map((trait, index) => {
              const active = activeTraitId === trait.id;
              return (
                <button
                  key={trait.id}
                  type="button"
                  onClick={() => onTraitSelect(active ? null : trait.id)}
                  aria-pressed={active}
                  title={`${trait.name}:${formatTraitDescription(trait.description, dossier.name)}`}
                  className={`trait-chip relative flex w-[70px] shrink-0 flex-col items-center px-1 pb-1 pt-1.5 ${
                    active ? 'text-gold' : 'text-parchment-dim hover:text-parchment'
                  }`}
                >
                  {index === 0 && trait.category === 'education' && (
                    <span className="absolute left-0.5 top-0.5 z-10 bg-rubric px-1 text-[7px] leading-3 text-[#f6efdd]">教育</span>
                  )}
                  <GameIcon icon={trait.icon} className="h-11 w-11 shrink-0" />
                  <span className="mt-0.5 w-full truncate text-[9.5px] font-bold">{trait.name}</span>
                  {active && <span className="absolute inset-x-3 bottom-0 h-[1.5px] bg-gold" aria-hidden="true" />}
                </button>
              );
            })}
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

      {dossier.kind === 'player' ? (
        <section className="grid grid-cols-4" aria-label="资源与状态">
          <ResourceCell icon={<Coins className="h-3.5 w-3.5 text-gold-deep" />} value={dossier.player.goldDragons} label="金龙" />
          <ResourceCell icon={<Crown className="h-3.5 w-3.5 text-gold" />} value={dossier.player.prestige} label="威仪" />
          <ResourceCell icon={<Skull className="h-3.5 w-3.5 text-rubric" />} value={dossier.player.dread} label="恶名" />
          <ResourceCell icon={<HeartPulse className="h-3.5 w-3.5 text-emerald-700" />} value={dossier.player.overallStatus} label="健康" textValue />
        </section>
      ) : (
        <section className="grid grid-cols-3" aria-label="人物状态" data-npc-status>
          <ResourceCell icon={<HeartPulse className="h-3.5 w-3.5 text-emerald-700" />} value={dossier.alive ? '在世' : '已故'} label="状态" textValue />
          <ResourceCell icon={<Shield className="h-3.5 w-3.5 text-gold-deep" />} value={dossier.wounds.length} label="伤势" />
          <ResourceCell icon={<BookOpen className="h-3.5 w-3.5 text-gold-deep" />} value={dossier.memories.length} label="记忆" />
        </section>
      )}
    </div>
  );
}

function RelationsTab({
  dossier,
  houseIcon,
  relatedRecords,
  onSelectCharacter,
}: {
  dossier: CharacterDossier;
  houseIcon: ReturnType<typeof getHouseIconId>;
  relatedRecords: ReadonlyMap<CharacterId, StaticCharacterRecord>;
  onSelectCharacter: (characterId: CharacterId) => void;
}) {
  const gameState = useGameStore((state) => state.gameState);
  const { family, isLoading } = useVerifiedLordFamily(dossier.kind === 'player' ? gameState.lord : null, gameState.currentYear);
  const [showAllChildren, setShowAllChildren] = useState(false);
  useEffect(() => setShowAllChildren(false), [dossier.id]);
  const relationshipCards = dossier.kind === 'player'
    ? playerRelationshipCards(family)
    : npcRelationshipCards(dossier, relatedRecords);
  const spouseCards = relationshipCards.filter((card) => card.group === 'spouse');
  const childCards = relationshipCards.filter((card) => card.group === 'child');
  const siblingCards = relationshipCards.filter((card) => card.group === 'sibling');
  const parentCards = relationshipCards.filter((card) => card.group === 'parent');
  const notableCards = relationshipCards.filter((card) => card.group === 'notable');
  const visibleChildCards = showAllChildren ? childCards : childCards.slice(0, 8);

  const rows = (cards: readonly RelationshipCard[]) => (
    <ul className="divide-y divide-hairline/60">
      {cards.map(({ label, person, emptyText }, index) => (
        <RelationshipRow
          key={`${label}-${person?.id ?? index}`}
          label={label}
          person={person}
          emptyText={emptyText}
          isLoading={dossier.kind === 'player' && isLoading}
          onSelectCharacter={onSelectCharacter}
        />
      ))}
    </ul>
  );

  return (
    <div className="space-y-5 px-5 py-5">
      <SectionTitle title="关系与家族" subtitle="读取稳定人物档案并叠加当前存档事件,缺少依据的关系不会猜测" />
      <div className="flex items-center gap-3 border-y border-hairline/70 py-3">
        <div className="ck3-heraldry-frame flex h-14 w-12 shrink-0 items-center justify-center p-1">
          {dossier.kind === 'player' && dossier.player.coatOfArms ? <CoatOfArms design={dossier.player.coatOfArms} className="h-full" /> : <GameIcon icon={houseIcon} className="h-full w-full" />}
        </div>
        <div className="min-w-0">
          <h3 className="truncate font-serif text-[15px] font-bold text-parchment">{dossier.dynastyName}</h3>
          <p className="mt-0.5 truncate text-[10.5px] text-parchment-dim">{dossier.house}</p>
          <p className="mt-0.5 truncate text-[9.5px] italic text-parchment-faint">“{dossier.houseWords}”</p>
        </div>
      </div>
      <div className="space-y-4">
        <section aria-label="配偶">{rows(spouseCards)}</section>
        <section data-character-children aria-label="子女">
          <div className="flex items-center justify-between border-b border-hairline/70 pb-1.5">
            <p className="eyebrow">子女</p>
            <span className="font-mono text-[9px] text-parchment-faint">{childCards.length} 人</span>
          </div>
          {childCards.length > 0 ? rows(visibleChildCards) : <EmptyState label={isLoading ? '正在核对子女档案' : '档案未记录子女'} />}
          {childCards.length > 8 && (
            <button
              type="button"
              onClick={() => setShowAllChildren((value) => !value)}
              className="btn-ghost mt-1 !px-0 !text-[10px]"
            >
              {showAllChildren ? '收起子女' : `显示全部子女（${childCards.length}）`}
            </button>
          )}
        </section>
        <section data-character-siblings aria-label="兄弟姐妹">
          <div className="flex items-center justify-between border-b border-hairline/70 pb-1.5">
            <p className="eyebrow">兄弟姐妹</p>
            <span className="font-mono text-[9px] text-parchment-faint">{siblingCards.length} 人</span>
          </div>
          {siblingCards.length > 0 ? rows(siblingCards) : <EmptyState label={isLoading ? '正在核对亲属档案' : '档案未记录兄弟姐妹'} />}
        </section>
        <section aria-label="父母">{rows(parentCards)}</section>
        {notableCards.length > 0 && <section aria-label="重要关系">{rows(notableCards)}</section>}
      </div>
      <CharacterSearch onSelectCharacter={onSelectCharacter} />
      <EmptyState label={dossier.kind === 'player'
        ? family.subject ? '配偶、子女、兄弟姐妹与父母来自稳定人物档案；继承人、领主和重要关系将在有可靠规则数据后显示。' : '未能与稳定人物档案可靠对齐,当前不会虚构任何关系。'
        : '人物关系来自静态档案与当前存档事件,未记录的关系保持空白。'} />
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

function playerRelationshipCards(family: LordFamilyRecords): RelationshipCard[] {
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
  cards.push({ label: '继承人', group: 'notable' });
  cards.push({ label: '领主', group: 'notable' });
  cards.push({ label: '重要关系', group: 'notable' });
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
  dossier.relations.notableRelations.forEach((relation) => cards.push({ label: relationLabel(relation.kind), person: records.get(relation.targetId), group: 'notable' }));
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
      .then((result) => { if (!cancelled) setFamily(result); })
      .catch(() => { if (!cancelled) setFamily({}); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [lord?.canonicalCharacterId, lord?.name, lord?.house, lord?.houseSigil, lord?.age, currentYear]);

  return { family, isLoading };
}

function RelationshipRow({
  label,
  person,
  emptyText,
  isLoading,
  onSelectCharacter,
}: {
  label: string;
  person?: StaticCharacterRecord;
  emptyText?: string;
  isLoading: boolean;
  onSelectCharacter: (characterId: CharacterId) => void;
}) {
  const icon = person ? getDynastyHouseIcon(person.dynastyId) : null;
  const content = (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center">
        {person ? (
          <CharacterPortrait
            characterId={person.id}
            houseIcon={icon ?? 'artifact-crown'}
            alt={`${person.name}的肖像`}
            deceased={!person.alive}
            className="h-full w-full border border-hairline-bright"
          />
        ) : <UserRound className="h-5 w-5 stroke-1 text-parchment-faint" />}
      </div>
      <div className="min-w-0 flex-1">
        <span className="mr-2 text-[10px] tracking-wide text-gold-deep">{label}</span>
        <span className={`font-serif text-[12.5px] font-semibold ${person ? 'text-parchment' : 'text-parchment-faint'}`}>
          {person?.name || (isLoading ? '正在核对档案' : emptyText ?? '档案未记录')}
        </span>
      </div>
      {person && (
        <span className={`shrink-0 text-[9px] ${person.alive ? 'text-emerald-700' : 'text-parchment-faint'}`}>
          {person.alive ? '在世' : '已故'} · 查看
        </span>
      )}
    </>
  );
  const rowClass = 'flex w-full items-center gap-3 py-2.5 text-left transition-colors';
  return (
    <li>
      {person ? (
        <button type="button" data-character-card onClick={() => onSelectCharacter(person.id)} className={`${rowClass} hover:bg-ink-2/70`}>
          {content}
        </button>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
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

function PlayerHistoryTab({ turns }: { turns: StoryTurn[] }) {
  const recentTurns = turns.slice(-8).reverse();
  return (
    <div className="space-y-5 px-5 py-5">
      <SectionTitle title="记忆与经历" subtitle="从已发生的场景中整理" />
      {recentTurns.length > 0 ? (
        <ol className="flex flex-col">
          {recentTurns.map((turn) => (
            <li key={turn.id} className="border-b border-hairline/60 py-3 last:border-b-0">
              <div className="flex items-baseline justify-between gap-2">
                <strong className="font-mono text-[10px] tracking-wider text-gold">TURN {turn.turnNumber}</strong>
                <span className="text-[9px] text-parchment-faint">{turn.gameDate || '日期未记录'}</span>
              </div>
              <p className="mt-1 line-clamp-2 font-serif text-[11px] leading-relaxed text-parchment-dim">{turn.narrate || turn.playerInput}</p>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState label="尚无可记录的经历" />
      )}
    </div>
  );
}

function NpcHistoryTab({ dossier, worldHistory }: { dossier: NpcCharacterDossier; worldHistory: WorldHistoryState }) {
  const memories = [...dossier.memories].sort((a, b) => b.turn - a.turn || b.importance - a.importance);
  const worldFacts = factsForCharacter(worldHistory, dossier.id).slice().reverse();
  return (
    <div className="space-y-5 px-5 py-5">
      <SectionTitle title="记忆与经历" subtitle="只展示统一世界历史中已经提交的人物事实与记忆" />
      {worldFacts.length > 0 && (
        <ol className="flex flex-col" data-character-world-facts>
          {worldFacts.map((fact) => (
            <li key={fact.id} className="border-b border-hairline/60 py-3 last:border-b-0">
              <strong className="font-mono text-[10px] tracking-wider text-gold">{fact.date.year} AC · {fact.date.month}月{fact.date.day}日</strong>
              <p className="mt-1 font-serif text-[11px] font-semibold text-parchment">{fact.title}</p>
              <p className="mt-1 font-serif text-[10.5px] leading-relaxed text-parchment-dim">{fact.summary}</p>
            </li>
          ))}
        </ol>
      )}
      {memories.length > 0 ? (
        <ol className="flex flex-col">
          {memories.map((memory) => (
            <li key={memory.id} className="border-b border-hairline/60 py-3 last:border-b-0">
              <strong className="font-mono text-[10px] tracking-wider text-gold">TURN {memory.turn}</strong>
              <p className="mt-1 font-serif text-[11px] leading-relaxed text-parchment-dim">{memory.event}</p>
              {memory.attitude && <p className="mt-1 text-[9px] text-parchment-faint">态度:{memory.attitude}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState label="当前存档尚未记录此人的个人记忆" />
      )}
    </div>
  );
}

function NpcHealthTab({ dossier, worldArtifacts }: { dossier: NpcCharacterDossier; worldArtifacts: WorldArtifactState }) {
  const zones = [
    { id: 'head', label: '头部', muscles: ['head', 'neck'] },
    { id: 'torso', label: '躯干', muscles: ['chest', 'abs', 'obliques'] },
    { id: 'arms', label: '双臂与双手', muscles: ['biceps', 'triceps', 'forearm', 'front-deltoids'] },
    { id: 'legs', label: '双腿', muscles: ['quadriceps', 'abductors', 'calves', 'knees'] },
  ] as const;
  const bodyData: IExerciseData[] = zones.flatMap((zone) => {
    const level = dossier.woundLevels[zone.id] ?? 'intact';
    const frequency = level === 'critical' ? 3 : level === 'heavy' ? 2 : level === 'minor' ? 1 : 0;
    return frequency ? [{ name: zone.label, muscles: [...zone.muscles], frequency }] : [];
  });
  const equippedItems = projectNpcEquipment(dossier.character.items, worldArtifacts, dossier.id)
    .map((item) => ({ item, definition: ITEM_CATALOG.get(item.definitionId) }))
    .filter((entry) => Boolean(entry.definition));
  const groups = [
    { id: 'head', label: '头部' }, { id: 'torso', label: '躯干' }, { id: 'mainhand', label: '主手' },
    { id: 'offhand', label: '副手' }, { id: 'legs', label: '双腿' }, { id: 'accessories', label: '佩饰' },
  ] as const;
  const inGroup = (position: typeof equippedItems[number]['item']['equippedPosition'], group: string) => position?.group === group;
  return (
    <div className="space-y-4 px-5 py-5" data-npc-health>
      <SectionTitle title="健康与装备" subtitle="与玩家人物使用相同布局；其他人物档案为只读状态" />
      {!dossier.alive && <p className="border-l-2 border-rubric pl-3 font-serif text-[11px] text-rubric">此人物已经死亡{dossier.deathReason ? `:${dossier.deathReason}` : ''}</p>}
      <div className="grid gap-2 border border-hairline bg-gradient-to-b from-ink-2 via-ink-3 to-ink p-2.5 shadow-inner sm:grid-cols-[minmax(150px,0.75fr)_minmax(180px,1fr)]" data-npc-body-layout>
        <div className="relative min-h-[280px] overflow-hidden border border-hairline bg-ink/35">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#c9a45c_1px,transparent_1px)] [background-size:12px_12px]" />
          <div className="body-model absolute inset-0 flex items-center justify-center">
            <Model type="anterior" bodyColor="#2e2519" highlightedColors={['#d97706', '#b4432f', '#d4593f']} data={bodyData} style={{ width: '100%', height: '100%', maxHeight: '270px', maxWidth: '165px' }} svgStyle={{ filter: 'drop-shadow(0 0 3px rgba(234,201,126,0.55))' }} />
          </div>
        </div>
        <div className="grid content-start grid-cols-2 gap-1.5">
          {zones.map((zone) => { const level = dossier.woundLevels[zone.id] ?? 'intact'; return <div key={zone.id} data-body-zone={zone.id} className="border border-hairline bg-ink-2/55 px-2 py-2"><span className="flex items-center justify-between gap-2"><strong className="font-serif text-[11.5px] text-parchment">{zone.label}</strong><span className={`font-mono text-[10px] ${level === 'intact' ? 'text-gold-dim' : 'font-bold text-rubric'}`}>{woundLabel(level)}</span></span><span className="mt-1 block font-serif text-[10px] text-parchment-dim">{level === 'intact' ? '未记录创伤' : dossier.wounds.join(' · ') || '已记录伤势'}</span></div>; })}
          <div className="col-span-2 mt-1 border border-hairline bg-ink-3/35 px-2.5 py-2"><span className="eyebrow !text-[8px]">总体状态</span><p className="mt-1 font-serif text-[12px] font-semibold text-gold-bright">{dossier.alive ? (dossier.wounds.length ? '负伤' : '强健') : '阵亡'}</p></div>
        </div>
      </div>
      <section className="border-t border-hairline/60 pt-4" data-npc-equipment-state>
        <div className="mb-3 flex items-center justify-between"><p className="eyebrow">实际穿戴</p><Shield className="h-3.5 w-3.5 text-gold-deep" /></div>
        {equippedItems.length === 0 && <EmptyState label="当前没有记录此人实际穿戴的装备。名下物品、据点储藏与家族保管物不会显示在这里。" />}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3" data-npc-equipped-items>
          {groups.map((group) => { const entries = equippedItems.filter(({ item }) => inGroup(item.equippedPosition, group.id)); return <div key={group.id} data-equipment-group={group.id} className="min-h-24 border border-hairline bg-ink-2/60 p-2"><p className="mb-2 text-[9px] font-bold tracking-wider text-gold-dim">{group.label}</p>{entries.length ? entries.map(({ item, definition }) => definition && <article key={item.instanceId} className="flex items-center gap-2"><span className="h-11 w-11 shrink-0 border border-hairline p-1"><ItemImage image={definition.image} alt={definition.name} className="h-full w-full" /></span><strong className="line-clamp-2 font-serif text-[10.5px] text-parchment">{definition.name}</strong></article>) : <span className="text-[9px] text-parchment-faint">未装备</span>}</div>; })}
        </div>
      </section>
    </div>
  );
}

function woundLabel(level: WoundLevel): string {
  return level === 'minor' ? '轻创' : level === 'heavy' ? '重伤' : level === 'critical' ? '垂危' : '未记录创伤';
}

function PlayerInventoryTab() {
  return <div className="p-4 pb-8"><ItemManagementPanel /></div>;
}

function NpcInventoryTab({ dossier, worldArtifacts }: { dossier: NpcCharacterDossier; worldArtifacts: WorldArtifactState }) {
  const assets = projectNpcAssets(dossier.character.items, worldArtifacts, {
    characterId: dossier.id,
    titleIds: dossier.character.titleIds,
    dynastyId: dossier.character.dynastyId,
  }).flatMap((item) => {
    const definition = ITEM_CATALOG.get(item.definitionId);
    return definition ? [{ item, definition }] : [];
  });

  return (
    <div className="space-y-5 px-5 py-5" data-npc-inventory>
      <SectionTitle title="物品与资产" subtitle="展示能够确认的归属与保管记录，不等同于随身携带或实际穿戴" />
      {assets.length > 0 ? (
        <div className="grid gap-2" data-npc-assets>
          {assets.map(({ item, definition }) => definition && (
            <article key={item.instanceId} className="flex min-w-0 items-center gap-3 border border-hairline bg-ink-2/75 px-3 py-2.5" data-npc-asset={item.definitionId}>
              <span className="h-14 w-14 shrink-0 border border-hairline bg-ink-3/80 p-1">
                <ItemImage image={definition.image} alt={definition.name} className="h-full w-full" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="line-clamp-2 block font-serif text-[12.5px] text-parchment">{definition.name}</strong>
                <span className="mt-1 inline-block border border-gold-deep/60 px-1.5 py-0.5 text-[9px] text-gold-dim">{item.relation}</span>
                <span className="mt-1.5 line-clamp-2 block font-serif text-[10px] text-parchment-faint">{definition.description}</span>
              </span>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState label="当前没有能够确认归属或保管关系的物品与资产。" />
      )}
      <p className="border-l border-gold-deep/60 pl-3 font-serif text-[10px] leading-relaxed text-parchment-faint">
        这里不会根据身份猜测武器、盔甲或财产；具体记录仍严格区分名下所有、本人保管与当前穿戴。
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
