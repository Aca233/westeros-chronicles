import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Backpack,
  BookOpen,
  Coins,
  Crown,
  HeartPulse,
  MapPin,
  RotateCcw,
  ScrollText,
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
import { GameIcon, getHouseIconId } from './GameIcon';
import { ItemManagementPanel } from './items/ItemManagementPanel';

const TABS = [
  { id: 'relations', label: '关系与家族', icon: UsersRound },
  { id: 'health', label: '健康与装备', icon: HeartPulse },
  { id: 'history', label: '记忆与经历', icon: BookOpen },
  { id: 'inventory', label: '随身物品', icon: Backpack },
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
      className="ck3-character-window relative flex h-full w-full min-w-0 select-none flex-col overflow-hidden border border-hairline-bright/80 text-parchment"
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
              className="sticky top-0 z-20 flex h-[56px] border-y border-hairline bg-ink-2/95 px-1 backdrop-blur-sm"
              aria-label="人物档案页签"
            >
              {TABS.map(({ id, label, icon: Icon }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    aria-current={active ? 'page' : undefined}
                    className={`group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 transition-colors ${
                      active ? 'text-gold-bright' : 'text-parchment-faint hover:text-parchment-dim'
                    }`}
                    title={label}
                  >
                    <Icon className={`h-[18px] w-[18px] ${active ? 'drop-shadow-[0_0_5px_rgba(234,201,126,0.5)]' : ''}`} />
                    <span className="max-w-full truncate text-[10px] leading-none tracking-wide">{label}</span>
                    {active && <span className="absolute inset-x-4 bottom-0 h-px bg-gold shadow-[0_0_8px_#c9a45c]" aria-hidden="true" />}
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
              {activeTab === 'health' && (dossier.kind === 'player' ? <CharacterSheet embedded /> : <NpcHealthTab dossier={dossier} />)}
              {activeTab === 'history' && (dossier.kind === 'player' ? <PlayerHistoryTab turns={turns} /> : <NpcHistoryTab dossier={dossier} />)}
              {activeTab === 'inventory' && (dossier.kind === 'player' ? <PlayerInventoryTab /> : <NpcInventoryTab />)}
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
      <GameIcon icon="artifact-white-book" className="h-20 w-20 opacity-70" />
      <div>
        <h2 className="font-serif text-lg font-bold text-gold-bright">{status === 'loading' ? '正在核对人物档案' : '人物档案无法打开'}</h2>
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
    <header className="relative shrink-0 overflow-hidden px-4 pb-4 pt-5">
      <div
        data-character-identity-layout="split"
        className="grid grid-cols-[minmax(0,1fr)_132px] items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_168px] sm:gap-4"
      >
        <div className="min-w-0 text-left">
          {dossier.kind === 'npc' && (
            <div data-character-navigation className="mb-3 flex flex-wrap items-center justify-start gap-1.5">
              {canGoBack && (
                <button type="button" onClick={onBack} className="btn-ghost !px-2 !py-1 !text-[9px]">
                  <ArrowLeft className="h-3 w-3" />返回上一人物
                </button>
              )}
              <button type="button" onClick={onReturnToPlayer} className="btn-ghost !px-2 !py-1 !text-[9px]">
                <UserRound className="h-3 w-3" />回到自己
              </button>
            </div>
          )}

          <div className="flex items-start gap-3">
            <div className="ck3-heraldry-frame flex h-[62px] w-[54px] shrink-0 items-center justify-center bg-[#2b2417] p-1.5">
              {dossier.kind === 'player' && dossier.player.coatOfArms ? (
                <CoatOfArms design={dossier.player.coatOfArms} className="h-full" />
              ) : (
                <GameIcon icon={houseIcon} tone="raw" className="h-full w-full object-contain drop-shadow-[0_4px_5px_rgba(0,0,0,0.8)]" />
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
            {!dossier.alive && <span className="ml-2 border border-rubric/60 bg-rubric/20 px-1.5 py-0.5 text-[9px] text-rubric-bright">已故</span>}
          </p>
          <div className="mt-2.5 flex flex-col items-start gap-1 text-[10px] text-parchment-dim">
            <span>{dossier.house}</span>
            <span>{dossier.culture} · {dossier.faith}</span>
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0 text-gold-deep" /><span className="truncate">{dossier.location}</span>
            </span>
          </div>
        </div>

        <section
          data-character-portrait-side="right"
          className="ck3-portrait-frame ck3-portrait-frame--hero relative h-[188px] w-full self-start overflow-hidden bg-[radial-gradient(circle_at_50%_30%,#3d2f19_0%,#17110a_52%,#070503_100%)] sm:h-[210px]"
          aria-label="人物肖像"
        >
          <GameIcon icon={houseIcon} tone="raw" className="absolute left-1/2 top-[42%] h-36 w-36 -translate-x-1/2 -translate-y-1/2 opacity-[0.16] grayscale drop-shadow-[0_0_16px_rgba(201,164,92,0.35)] sm:h-44 sm:w-44" />
          <div className="absolute inset-x-0 bottom-0 h-[70%] bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.8))]" />
          <div className={`absolute inset-0 flex items-center justify-center pb-7 ${dossier.alive ? '' : 'opacity-60 grayscale'}`} aria-hidden="true">
            <div className="ck3-bust-silhouette">
              <span className="ck3-bust-silhouette__head" />
              <span className="ck3-bust-silhouette__neck" />
              <span className="ck3-bust-silhouette__body" />
            </div>
          </div>
          <div className="absolute inset-x-2 bottom-2 border-t border-gold-deep/50 pt-1.5 text-center sm:inset-x-3">
            <div className="truncate text-[10px] font-bold tracking-wide text-gold-bright">{dossier.house}</div>
            <div className="mt-0.5 truncate text-[8px] italic text-parchment-dim">“{dossier.houseWords}”</div>
          </div>
        </section>
      </div>
      <hr className="hairline mt-4" aria-hidden="true" />
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
    <div className="flex flex-col gap-4 p-4 pb-6">
      <section data-character-traits className="border-y border-hairline py-3" aria-label="人物特质">
        <div className="mb-2 flex items-center justify-between px-0.5">
          <PanelHeading icon={<ScrollText className="h-4 w-4" />} title="特质" />
          <span className="font-mono text-[9px] tracking-wider text-parchment-faint">{displayedTraits.length} 项 · 教育优先</span>
        </div>
        {displayedTraits.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto px-0.5 pb-1" aria-label="人物特质列表">
            {displayedTraits.map((trait, index) => {
              const active = activeTraitId === trait.id;
              return (
                <button
                  key={trait.id}
                  type="button"
                  onClick={() => onTraitSelect(active ? null : trait.id)}
                  aria-pressed={active}
                  title={`${trait.name}:${formatTraitDescription(trait.description, dossier.name)}`}
                  className={`relative flex w-[78px] shrink-0 flex-col items-center px-1 pb-1.5 pt-1 transition-all ${active ? 'bg-gold-deep/20 text-gold-bright ring-1 ring-inset ring-gold' : 'bg-ink-2/80 text-parchment-dim ring-1 ring-inset ring-hairline hover:bg-ink-3 hover:ring-gold-deep'}`}
                >
                  {index === 0 && trait.category === 'education' && <span className="absolute left-1 top-1 z-10 border border-rubric/60 bg-rubric px-1 text-[7px] leading-3 text-[#f6efdd]">教育</span>}
                  <GameIcon icon={trait.icon} className="h-14 w-14 shrink-0 drop-shadow-[0_3px_4px_rgba(0,0,0,0.8)]" />
                  <span className="mt-1 w-full truncate text-[10px] font-bold">{trait.name}</span>
                </button>
              );
            })}
          </div>
        ) : <EmptyState label="尚未记录人物特质" />}
      </section>

      <section aria-label="人物属性">
        <div className="grid grid-cols-6 gap-1.5">
          {CK3_SKILLS.map((skill) => {
            const value = dossier.attributes[skill.key] ?? 0;
            return (
              <div key={skill.key} className="group flex min-w-0 flex-col items-center border border-hairline bg-gradient-to-b from-ink-3/70 to-ink/80 pb-2 pt-1.5" title={`${skill.label}:${getCk3SkillRank(value)}`} aria-label={`${skill.label} ${value}`}>
                <GameIcon icon={skill.icon} className="h-[50px] w-[50px] shrink-0 drop-shadow-[0_3px_4px_rgba(0,0,0,0.75)] transition-transform duration-300 group-hover:scale-110" />
                <span className={`-mt-0.5 font-display text-[15px] font-bold leading-none ${getSkillValueColor(value)}`}>{value}</span>
              </div>
            );
          })}
        </div>
      </section>

      {dossier.kind === 'player' ? (
        <section className="grid grid-cols-4 border border-hairline bg-ink-2/70" aria-label="资源与状态">
          <ResourceCell icon={<Coins className="h-4 w-4 text-gold" />} value={dossier.player.goldDragons} label="金龙" />
          <ResourceCell icon={<Crown className="h-4 w-4 text-gold-bright" />} value={dossier.player.prestige} label="威仪" />
          <ResourceCell icon={<Skull className="h-4 w-4 text-rubric-bright" />} value={dossier.player.dread} label="恶名" />
          <ResourceCell icon={<HeartPulse className="h-4 w-4 text-emerald-700" />} value={dossier.player.overallStatus} label="健康" textValue />
        </section>
      ) : (
        <section className="grid grid-cols-4 border border-hairline bg-ink-2/70" aria-label="人物状态">
          <ResourceCell icon={<HeartPulse className="h-4 w-4 text-emerald-700" />} value={dossier.alive ? '在世' : '已故'} label="状态" textValue />
          <ResourceCell icon={<Crown className="h-4 w-4 text-gold-bright" />} value={dossier.titles.length} label="头衔" />
          <ResourceCell icon={<Shield className="h-4 w-4 text-gold-deep" />} value={dossier.wounds.length} label="伤势" />
          <ResourceCell icon={<BookOpen className="h-4 w-4 text-sea" />} value={dossier.memories.length} label="记忆" />
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
  const playerCards: Array<{ label: string; person?: StaticCharacterRecord }> = [
    { label: '配偶', person: family.spouse }, { label: '继承人' }, { label: '领主' },
    { label: '父亲', person: family.father }, { label: '母亲', person: family.mother }, { label: '重要关系' },
  ];
  const npcCards = dossier.kind === 'npc' ? npcRelationshipCards(dossier, relatedRecords) : [];
  const cards = dossier.kind === 'player' ? playerCards : npcCards;

  return (
    <div className="space-y-4 p-4 pb-8">
      <SectionTitle icon={<UsersRound />} title="关系与家族" subtitle="读取稳定人物档案并叠加当前存档事件，缺少依据的关系不会猜测" />
      <div className="border border-hairline-bright/70 bg-gradient-to-r from-ink-3 to-ink-2 p-3">
        <div className="flex items-center gap-3">
          <div className="h-16 w-14 shrink-0 border border-gold-deep/70 bg-[#2b2417] p-1">
            {dossier.kind === 'player' && dossier.player.coatOfArms ? <CoatOfArms design={dossier.player.coatOfArms} className="h-full" /> : <GameIcon icon={houseIcon} tone="raw" className="h-full w-full" />}
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-serif text-base font-bold text-gold-bright">{dossier.dynastyName}</h3>
            <p className="mt-1 truncate text-[11px] text-parchment-dim">{dossier.house}</p>
            <p className="mt-1 truncate text-[10px] italic text-parchment-faint">“{dossier.houseWords}”</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {cards.map(({ label, person }, index) => (
          <RelationshipPersonCard key={`${label}-${person?.id ?? index}`} label={label} person={person} isLoading={dossier.kind === 'player' && isLoading} onSelectCharacter={onSelectCharacter} />
        ))}
      </div>
      <CharacterSearch onSelectCharacter={onSelectCharacter} />
      <EmptyState label={dossier.kind === 'player'
        ? family.subject ? '配偶与父母来自稳定人物档案，继承人、领主和重要关系将在有可靠规则数据后显示。' : '未能与稳定人物档案可靠对齐，当前不会虚构任何关系。'
        : '人物关系来自静态档案与当前存档事件，未记录的关系保持空白。'} />
    </div>
  );
}

function npcRelationshipCards(dossier: NpcCharacterDossier, records: ReadonlyMap<CharacterId, StaticCharacterRecord>): Array<{ label: string; person?: StaticCharacterRecord }> {
  const cards: Array<{ label: string; person?: StaticCharacterRecord }> = [];
  dossier.relations.spouseIds.forEach((id) => cards.push({ label: '配偶', person: records.get(id) }));
  cards.push({ label: '父亲', person: dossier.relations.fatherId ? records.get(dossier.relations.fatherId) : undefined });
  cards.push({ label: '母亲', person: dossier.relations.motherId ? records.get(dossier.relations.motherId) : undefined });
  dossier.relations.notableRelations.forEach((relation) => cards.push({ label: relationLabel(relation.kind), person: records.get(relation.targetId) }));
  const existingIds = new Set(dossier.relations.notableRelations.map((relation) => relation.targetId));
  dossier.relations.relationships.filter((relation) => !existingIds.has(relation.targetId)).slice(0, 4).forEach((relation) => cards.push({ label: relation.kind ? relationLabel(relation.kind) : '重要关系', person: records.get(relation.targetId) }));
  while (cards.length < 6) cards.push({ label: cards.length === 0 ? '配偶' : '重要关系' });
  return cards.slice(0, 8);
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
    resolveLordFamilyRecords({ name: lord.name, house: lord.house, houseSigil: lord.houseSigil, age: lord.age, currentYear }, relationshipRepository)
      .then((result) => { if (!cancelled) setFamily(result); })
      .catch(() => { if (!cancelled) setFamily({}); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [lord?.name, lord?.house, lord?.houseSigil, lord?.age, currentYear]);

  return { family, isLoading };
}

function RelationshipPersonCard({
  label,
  person,
  isLoading,
  onSelectCharacter,
}: {
  label: string;
  person?: StaticCharacterRecord;
  isLoading: boolean;
  onSelectCharacter: (characterId: CharacterId) => void;
}) {
  const icon = person ? getDynastyHouseIcon(person.dynastyId) : null;
  const content = (
    <>
      <div className={`flex h-14 w-12 shrink-0 items-center justify-center border p-1 ${person ? 'border-gold-deep/70 bg-[#2b2417]' : 'border-hairline bg-ink-2'}`}>
        {icon ? <GameIcon icon={icon} tone="raw" className="h-full w-full" /> : <UserRound className="h-8 w-8 stroke-1 text-parchment-faint" />}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] tracking-wide text-gold-deep">{label}</div>
        <div className={`mt-1 truncate text-[12px] font-semibold ${person ? 'text-parchment' : 'text-parchment-faint'}`}>{person?.name || (isLoading ? '正在核对档案' : '档案未记录')}</div>
        {person && <div className={`mt-0.5 text-[9px] ${person.alive ? 'text-emerald-700' : 'text-parchment-faint'}`}>{person.alive ? '在世' : '已故'} · 点击查看</div>}
      </div>
    </>
  );
  const className = `flex h-[80px] w-full items-center gap-2.5 border px-2.5 text-left transition-colors ${person ? 'border-gold-deep/60 bg-ink-3/70 hover:border-gold hover:bg-ink-3' : 'border-hairline bg-ink-3/30'}`;
  return person ? <button type="button" data-character-card onClick={() => onSelectCharacter(person.id)} className={className}>{content}</button> : <div className={className}>{content}</div>;
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
    <div className="space-y-4 p-4 pb-8">
      <SectionTitle icon={<BookOpen />} title="记忆与经历" subtitle="从已发生的场景中整理" />
      {recentTurns.length > 0 ? (
        <ol className="relative ml-1.5 border-l border-hairline-bright/60 pl-5">
          {recentTurns.map((turn) => (
            <li key={turn.id} className="relative mb-4 border-b border-hairline pb-4 last:mb-0">
              <span className="absolute -left-[23.5px] top-1.5 h-2 w-2 rotate-45 border border-gold bg-ink" aria-hidden="true" />
              <div className="flex items-center justify-between gap-2"><strong className="font-mono text-[10px] tracking-wider text-gold">TURN {turn.turnNumber}</strong><span className="text-[9px] text-parchment-faint">{turn.gameDate || '日期未记录'}</span></div>
              <p className="mt-1.5 line-clamp-2 font-serif text-[11px] leading-relaxed text-parchment-dim">{turn.narrate || turn.playerInput}</p>
            </li>
          ))}
        </ol>
      ) : <EmptyState label="尚无可记录的经历" />}
    </div>
  );
}

function NpcHistoryTab({ dossier }: { dossier: NpcCharacterDossier }) {
  const memories = [...dossier.memories].sort((a, b) => b.turn - a.turn || b.importance - a.importance);
  return (
    <div className="space-y-4 p-4 pb-8">
      <SectionTitle icon={<BookOpen />} title="记忆与经历" subtitle="仅显示当前存档确实记录的人物记忆" />
      {memories.length > 0 ? (
        <ol className="relative ml-1.5 border-l border-hairline-bright/60 pl-5">
          {memories.map((memory) => (
            <li key={memory.id} className="relative mb-4 border-b border-hairline pb-4 last:mb-0">
              <span className="absolute -left-[23.5px] top-1.5 h-2 w-2 rotate-45 border border-gold bg-ink" aria-hidden="true" />
              <strong className="font-mono text-[10px] tracking-wider text-gold">TURN {memory.turn}</strong>
              <p className="mt-1.5 font-serif text-[11px] leading-relaxed text-parchment-dim">{memory.event}</p>
              {memory.attitude && <p className="mt-1 text-[9px] text-parchment-faint">态度：{memory.attitude}</p>}
            </li>
          ))}
        </ol>
      ) : <EmptyState label="当前存档尚未记录此人的个人记忆" />}
    </div>
  );
}

function NpcHealthTab({ dossier }: { dossier: NpcCharacterDossier }) {
  const zones = [
    { id: 'head', label: '头部与咽喉' }, { id: 'torso', label: '胸膛与躯干' },
    { id: 'arms', label: '双臂与双手' }, { id: 'legs', label: '双腿与下肢' },
  ] as const;
  return (
    <div className="space-y-4 p-4 pb-8" data-npc-health>
      <SectionTitle icon={<HeartPulse />} title="健康与装备" subtitle="伤势来自当前存档人物事件，未记录的装备不会凭空补全" />
      {!dossier.alive && <div className="border border-rubric/60 bg-rubric/10 p-3 font-serif text-[11px] text-rubric-bright">此人物已经死亡{dossier.deathReason ? `：${dossier.deathReason}` : ''}</div>}
      <div className="grid grid-cols-2 gap-2">
        {zones.map((zone) => {
          const level = dossier.woundLevels[zone.id] ?? 'intact';
          return (
            <div key={zone.id} className={`border p-3 ${woundTone(level)}`}>
              <div className="flex items-center gap-2"><Shield className="h-5 w-5" /><strong className="font-serif text-[11px]">{zone.label}</strong></div>
              <div className="mt-2 text-[9px]">{woundLabel(level)}</div>
            </div>
          );
        })}
      </div>
      {dossier.wounds.length > 0 ? (
        <div className="space-y-1 border-y border-hairline py-2">
          {dossier.wounds.map((wound) => <div key={wound} className="font-serif text-[10px] text-rubric-bright">{wound}</div>)}
        </div>
      ) : <EmptyState label="当前存档没有记录此人的伤势" />}
      <EmptyState label="装备档案未记录。NPC 不会借用玩家当前穿戴、据点仓储或运输工具中的物品。" />
    </div>
  );
}

function woundLabel(level: WoundLevel): string {
  return level === 'minor' ? '轻创' : level === 'heavy' ? '重伤' : level === 'critical' ? '垂危' : '未记录创伤';
}
function woundTone(level: WoundLevel): string {
  return level === 'critical' ? 'border-rubric text-rubric-bright bg-rubric/10' : level === 'heavy' ? 'border-rubric/70 text-rubric-bright bg-rubric/5' : level === 'minor' ? 'border-gold-deep text-gold bg-gold-deep/5' : 'border-hairline text-parchment-faint bg-ink-3/30';
}

function PlayerInventoryTab() {
  return <div className="p-4 pb-8"><ItemManagementPanel /></div>;
}

function NpcInventoryTab() {
  return (
    <div className="space-y-4 p-4 pb-8" data-npc-inventory>
      <SectionTitle icon={<Backpack />} title="随身物品" subtitle="只展示有可靠归属记录的物品" />
      <EmptyState label="此人的随身物品、据点储藏和运输工具没有可靠档案，因此保持未记录状态。" />
      <p className="border-l-2 border-gold-deep/70 bg-ink-3/30 px-3 py-2 font-serif text-[10px] leading-relaxed text-parchment-dim">这里不会复制玩家物品，也不会根据身份猜测武器、盔甲或财产。</p>
    </div>
  );
}

function TraitDetailOverlay({ trait, characterName, onClose }: { trait: ReturnType<typeof resolveCharacterTraits>[number]; characterName: string; onClose: () => void }) {
  const description = formatTraitDescription(trait.description, characterName);
  const effects = [formatTraitModifiers(trait.modifiers), ...formatTraitRuleEffects(trait.rules)].filter(Boolean);
  return (
    <div className="panel-iron absolute inset-x-3 bottom-3 z-30 border-gold-deep/80 p-3.5 scene-enter">
      <div className="flex gap-3">
        <GameIcon icon={trait.icon} className="h-16 w-16 shrink-0 drop-shadow-[0_4px_5px_rgba(0,0,0,0.9)]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2"><div><strong className="font-serif text-sm text-gold-bright">{trait.name}</strong><div className="mt-0.5 text-[9px] tracking-wider text-parchment-faint">{trait.isLegacy ? '旧存档标签' : TRAIT_CATEGORY_LABELS[trait.category]}</div></div><button type="button" onClick={onClose} className="btn-ghost !px-2 !py-0.5 !text-[10px]">关闭</button></div>
          <p className="mt-2 font-serif text-[11px] leading-relaxed text-parchment-dim">{description}</p>
          {effects.length > 0 && <p className="mt-2 font-mono text-[10px] leading-relaxed text-gold">{effects.join(' · ')}</p>}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return <div className="border-b border-hairline-bright/60 pb-2"><div className="flex items-center gap-2 text-gold [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}<h3 className="font-serif text-sm font-bold tracking-wide">{title}</h3></div><p className="mt-1 text-[10px] text-parchment-faint">{subtitle}</p></div>;
}
function PanelHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-gold">{icon}{title}</div>;
}
function ResourceCell({ icon, value, label, textValue = false }: { icon: React.ReactNode; value: number | string; label: string; textValue?: boolean }) {
  return <div className="flex min-w-0 items-center justify-center gap-1.5 border-r border-hairline px-1.5 py-2.5 last:border-r-0">{icon}<div className="min-w-0"><div className={`truncate font-mono font-bold text-parchment ${textValue ? 'text-[10px]' : 'text-[12px]'}`}>{value}</div><div className="text-[8px] tracking-widest text-parchment-faint">{label}</div></div></div>;
}
function StorageSummary({ icon, label, count, detail }: { icon: React.ReactNode; label: string; count: number; detail: string }) {
  return <div className="border border-hairline bg-ink-3/30 p-3"><div className="flex items-center gap-2 text-gold-deep">{icon}<strong className="text-[11px]">{label}</strong></div><div className="mt-2 font-display text-sm font-bold text-gold-bright">{count}</div><div className="mt-0.5 text-[9px] text-parchment-faint">{detail}</div></div>;
}
function EmptyState({ label }: { label: string }) {
  return <div className="border border-dashed border-hairline bg-ink-3/25 px-3 py-5 text-center font-serif text-[10px] leading-relaxed text-parchment-faint">{label}</div>;
}
function getSkillValueColor(value: number): string {
  if (value >= 25) return 'text-rubric';
  if (value >= 20) return 'text-sea';
  if (value >= 16) return 'text-emerald-700';
  if (value <= 4) return 'text-rubric-bright';
  return 'text-gold';
}
