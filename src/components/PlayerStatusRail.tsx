import React, { useMemo, useState } from 'react';
import { Backpack, HeartPulse, Landmark, MapPin, ScrollText, UsersRound } from 'lucide-react';
import { CK3_SKILLS } from '../data/ck3Skills';
import { resolveCharacterTraits } from '../data/characterTraits';
import { useCharacterDossier } from '../features/characters/useCharacterDossier';
import type { CharacterId } from '../features/characters/types';
import { useGameStore } from '../store/useGameStore';
import { CharacterPortrait } from './CharacterPortrait';
import { CoatOfArms } from './CoatOfArms';
import { GameIcon, getHouseIconId } from './GameIcon';
import { CharacterAssetsTab } from './character-window/CharacterAssetsTab';
import { CharacterAttributeHoverCard } from './character-window/CharacterAttributeHoverCard';
import { CharacterRelationsTab } from './character-window/CharacterRelationsTab';
import { CharacterTraitHoverCard } from './character-window/CharacterTraitHoverCard';
import { PlayerAffairsTab } from './character-window/PlayerAffairsTab';
import { HealthAndEquipmentPanel } from './items/HealthAndEquipmentPanel';

const PLAYER_TABS = [
  { id: 'relations', label: '关系', icon: UsersRound },
  { id: 'health', label: '身体装备', icon: HeartPulse },
  { id: 'assets', label: '资产', icon: Backpack },
  { id: 'affairs', label: '事务', icon: ScrollText },
] as const;

type PlayerTab = (typeof PLAYER_TABS)[number]['id'];

export interface PlayerStatusRailProps {
  onSelectCharacter: (characterId: CharacterId) => void;
  onOpenLocation: (locationId: string) => void;
  onOpenAsset: (assetId: string) => void;
}

/**
 * 玩家自己的完整人物信息常驻左侧。核心身份、六维与全部可见特质固定在头部；
 * 关系、身体装备、资产与事务通过页签切换，不再维护一套重复的“摘要角色卡”。
 */
export const PlayerStatusRail: React.FC<PlayerStatusRailProps> = ({
  onSelectCharacter,
  onOpenLocation,
  onOpenAsset,
}) => {
  const gameState = useGameStore((state) => state.gameState);
  const { lord, worldCharacters } = gameState;
  const { dossier, relatedRecords } = useCharacterDossier(null);
  const [activeTab, setActiveTab] = useState<PlayerTab>('relations');

  const displayedTraits = useMemo(
    () => dossier ? resolveCharacterTraits(dossier.traitIds, dossier.legacyTraits) : [],
    [dossier],
  );


  if (!dossier || dossier.kind !== 'player') return null;

  const houseIcon = getHouseIconId(dossier.houseSigil || dossier.house || 'artifact-crown');
  const roles = dossier.publicRoles?.length ? dossier.publicRoles : [dossier.title];
  const lands = dossier.titles.length ? dossier.titles : [dossier.title || '未持有领地'];

  return (
    <aside
      className="relative z-20 hidden w-[360px] shrink-0 select-none flex-col overflow-hidden border-r border-hairline/70 bg-ink-2/55 backdrop-blur-sm lg:flex xl:w-[400px]"
      aria-label="我的人物信息"
      data-player-status-rail
      data-player-character-panel
    >
      <header className="shrink-0 border-b border-hairline/80 bg-ink-2/80 px-4 pb-3 pt-3">
        <div className="flex items-start gap-3">
          <div className="relative h-[88px] w-[76px] shrink-0 overflow-hidden border border-hairline-bright bg-ink-3/80">
            <CharacterPortrait
              characterId={dossier.worldCharacterId}
              houseIcon={houseIcon}
              alt={`${dossier.name}的肖像`}
              priority
              deceased={!dossier.alive}
              className="h-full w-full"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="ck3-heraldry-frame flex h-10 w-9 shrink-0 items-center justify-center p-1">
                {dossier.player.coatOfArms ? (
                  <CoatOfArms design={dossier.player.coatOfArms} className="h-full" />
                ) : (
                  <GameIcon icon={houseIcon} className="h-full w-full object-contain" />
                )}
              </div>
              <div className="min-w-0">
                <p className="eyebrow !text-[8px]">{dossier.dynastyName}</p>
                <h2 className="break-words font-serif text-[21px] font-black leading-tight tracking-[0.035em] text-parchment">
                  {dossier.name}
                </h2>
              </div>
            </div>
            <p className="mt-1.5 font-serif text-[11px] font-semibold leading-relaxed text-gold">{dossier.title}</p>
            <p className="mt-1 font-serif text-[9.5px] leading-relaxed text-parchment-faint">
              {dossier.house} · {dossier.age ?? '年龄未记录'}{typeof dossier.age === 'number' ? ' 岁' : ''} · {dossier.gender}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-y border-hairline/60 py-2 font-serif text-[10px] leading-relaxed">
          <IdentityFact label="身份" value={dossier.name} />
          <IdentityFact label="头衔" value={dossier.title} />
          <IdentityFact label="家族" value={dossier.house} />
          <IdentityFact label="年龄" value={typeof dossier.age === 'number' ? `${dossier.age} 岁` : '未记录'} />
          <IdentityFact label="文化" value={dossier.culture} />
          <IdentityFact label="信仰" value={dossier.faith} />
          <IdentityFact label="职位" value={roles.join(' · ')} />
          <IdentityFact label="领地" value={lands.join(' · ')} icon={<Landmark className="mt-0.5 h-3 w-3 shrink-0 text-gold-deep" />} />
          <button
            type="button"
            onClick={() => dossier.worldLocation && onOpenLocation(dossier.worldLocation.locationId)}
            disabled={!dossier.worldLocation}
            className="col-span-2 flex items-start gap-1.5 text-left text-parchment-dim transition-colors enabled:hover:text-gold disabled:cursor-default"
          >
            <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-gold-deep" />
            <span><span className="mr-1.5 text-parchment-faint">所在</span>{dossier.location}</span>
          </button>
        </div>

        <section className="mt-3" aria-label="六项能力">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="eyebrow !text-[8px]">六维</span>
            <span className="font-mono text-[8px] text-parchment-faint">完整属性</span>
          </div>
          <div className="grid grid-cols-6 gap-1">
            {CK3_SKILLS.map((skill) => {
              const value = dossier.attributes[skill.key] ?? 0;
              return (
                <CharacterAttributeHoverCard
                  key={skill.key}
                  skill={skill}
                  value={value}
                  baseValue={dossier.player.baseAttributes?.[skill.key]}
                  traits={displayedTraits}
                  items={dossier.player.items}
                >
                  <GameIcon icon={skill.icon} className="h-8 w-8" />
                  <strong className="font-display text-[13px] leading-none text-gold">{value}</strong>
                  <span className="mt-0.5 text-[8px] text-parchment-faint">{skill.label}</span>
                </CharacterAttributeHoverCard>
              );
            })}
          </div>
        </section>

        <section className="mt-3" aria-label="全部人物特质">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="eyebrow !text-[8px]">全部特质</span>
            <span className="font-mono text-[8px] text-parchment-faint">{displayedTraits.length} 项</span>
          </div>
          {displayedTraits.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {displayedTraits.map((trait) => (
                <CharacterTraitHoverCard key={trait.id} trait={trait} characterName={dossier.name} className="h-8 w-8">
                  <GameIcon icon={trait.icon} className="h-8 w-8 shrink-0 transition-transform duration-150 group-hover:scale-110 group-focus-visible:scale-110" />
                </CharacterTraitHoverCard>
              ))}
            </div>          ) : (
            <p className="font-serif text-[9.5px] italic text-parchment-faint">尚未记录人物特质</p>
          )}
        </section>
      </header>

      <nav className="grid shrink-0 grid-cols-4 border-b border-hairline/80 bg-ink/95" aria-label="我的人物信息页签">
        {PLAYER_TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={active ? 'page' : undefined}
              data-active={active}
              className={`flex min-w-0 items-center justify-center gap-1 border-r border-hairline/50 px-1 py-2 font-serif text-[9.5px] transition-colors last:border-r-0 ${
                active
                  ? 'bg-gold-deep/15 text-gold'
                  : 'text-parchment-faint hover:bg-ink-3/60 hover:text-parchment'
              }`}
            >
              <Icon className="h-3 w-3 shrink-0" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto" data-player-character-tab={activeTab}>
        {activeTab === 'relations' && (
          <CharacterRelationsTab
            dossier={dossier}
            relatedRecords={relatedRecords}
            onSelectCharacter={onSelectCharacter}
            lord={lord}
            currentYear={gameState.currentYear}
            worldCharacters={worldCharacters}
            worldHistory={gameState.worldHistory}
            worldRuntime={gameState.worldRuntime}
            roleplay={gameState.roleplay}
          />
        )}
        {activeTab === 'health' && <HealthAndEquipmentPanel dossier={dossier} embedded />}
        {activeTab === 'assets' && (
          <CharacterAssetsTab
            dossier={dossier}
            relatedRecords={relatedRecords}
            onOpenCharacter={onSelectCharacter}
            onOpenLocation={onOpenLocation}
            onOpenAsset={onOpenAsset}
          />
        )}
        {activeTab === 'affairs' && <PlayerAffairsTab gameState={gameState} />}
      </div>

    </aside>
  );
};

function IdentityFact({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-1.5">
      {icon}
      <span className="shrink-0 text-parchment-faint">{label}</span>
      <span className="min-w-0 break-words text-parchment-dim">{value || '未记录'}</span>
    </div>
  );
}
