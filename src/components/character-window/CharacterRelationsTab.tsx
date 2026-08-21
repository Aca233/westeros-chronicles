import { useEffect, useState } from 'react';
import type { CharacterDossier } from '../../features/characters/characterDossier';
import type { CharacterId, StaticCharacterRecord } from '../../features/characters/types';
import type { WorldHistoryState } from '../../features/world/worldHistory';
import type { WorldRuntimeState } from '../../features/world/worldRuntimeTypes';
import type { LordProfile, WorldCharacterStateRef } from '../../types/game';
import { CharacterPortrait } from '../CharacterPortrait';
import { CharacterSearch } from '../CharacterSearch';
import { getHouseIconId } from '../GameIcon';
import { EmptyState, SectionTitle } from './CharacterOverview';
import { npcRelationshipCards, playerRelationshipCards, type RelationshipCard } from './relationshipCards';
import { useVerifiedLordFamily } from './useVerifiedLordFamily';

export function CharacterRelationsTab({
  dossier,
  relatedRecords,
  onSelectCharacter,
  lord,
  currentYear,
  worldCharacters,
  worldHistory,
  worldRuntime,
}: {
  dossier: CharacterDossier;
  relatedRecords: ReadonlyMap<CharacterId, StaticCharacterRecord>;
  onSelectCharacter: (characterId: CharacterId) => void;
  lord: LordProfile;
  currentYear: number;
  worldCharacters: WorldCharacterStateRef | undefined;
  worldHistory: WorldHistoryState;
  worldRuntime: WorldRuntimeState;
}) {
  const { family, isLoading } = useVerifiedLordFamily(
    dossier.kind === 'player' ? lord : null,
    currentYear,
    worldCharacters,
    worldHistory,
    worldRuntime,
  );
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
