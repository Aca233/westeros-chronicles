import React, { useEffect, useMemo, useState } from 'react';
import {
  Backpack,
  BookOpen,
  Coins,
  Crown,
  HeartPulse,
  Landmark,
  MapPin,
  Package,
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
import { getUsedCapacity } from '../services/itemCustody';
import { resolveLordFamilyRecords, type LordFamilyRecords } from '../features/characters/lordRelationshipResolver';
import { StaticCharacterRepository } from '../features/characters/staticCharacterRepository';
import type { StaticCharacterRecord } from '../features/characters/types';
import { CharacterSheet } from './CharacterSheet';
import { CoatOfArms } from './CoatOfArms';
import { GameIcon, getHouseIconId, getInventoryIconId } from './GameIcon';

const TABS = [
  { id: 'relations', label: '关系与家族', icon: UsersRound },
  { id: 'health', label: '健康与装备', icon: HeartPulse },
  { id: 'history', label: '记忆与经历', icon: BookOpen },
  { id: 'inventory', label: '随身物品', icon: Backpack },
] as const;

type CharacterTab = (typeof TABS)[number]['id'];

const relationshipRepository = new StaticCharacterRepository();


export const Ck3CharacterWindow: React.FC = () => {
  const { gameState } = useGameStore();
  const { lord, turns } = gameState;
  const [activeTab, setActiveTab] = useState<CharacterTab>('relations');
  const [activeTraitId, setActiveTraitId] = useState<string | null>(null);
  const displayedTraits = useMemo(
    () => resolveCharacterTraits(lord.traitIds ?? [], lord.traits ?? []),
    [lord.traitIds, lord.traits],
  );
  const selectedTrait = displayedTraits.find((trait) => trait.id === activeTraitId) ?? null;
  const houseIcon = getHouseIconId(lord.houseSigil || lord.house);

  return (
    <aside
      data-ck3-character-window
      className="ck3-character-window relative flex h-full w-full min-w-0 flex-col overflow-hidden border-r border-[#6e5737] bg-[#100d0a] text-[#ded3c2] shadow-[8px_0_28px_rgba(0,0,0,0.55)] select-none"
      aria-label={`${lord.name}的人物窗口`}
    >
      <div className="ck3-ornament-line" aria-hidden="true" />
      <IdentityHeader houseIcon={houseIcon} />

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <OverviewTab
          displayedTraits={displayedTraits}
          activeTraitId={activeTraitId}
          onTraitSelect={setActiveTraitId}
          houseIcon={houseIcon}
        />

        <nav
          data-character-lower-tabs
          className="sticky top-0 z-20 flex h-[58px] border-y border-[#574329] bg-[#17120e]/[0.98] px-1 shadow-[0_4px_12px_rgba(0,0,0,0.45),inset_0_1px_rgba(255,226,167,0.07)] backdrop-blur-sm"
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
                className={`group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 border-x border-transparent px-1 transition-colors ${
                  active
                    ? 'border-[#765b35] bg-[linear-gradient(180deg,#3a2c1d_0%,#241a12_100%)] text-[#f3d594]'
                    : 'text-[#8f8373] hover:bg-[#211912] hover:text-[#d2bd94]'
                }`}
                title={label}
              >
                <Icon className={`h-5 w-5 ${active ? 'drop-shadow-[0_0_4px_rgba(229,190,108,0.45)]' : ''}`} />
                <span className="max-w-full truncate text-[10px] leading-none">{label}</span>
                {active && <span className="absolute inset-x-3 bottom-0 h-px bg-[#e0b766] shadow-[0_0_6px_#b7863f]" />}
              </button>
            );
          })}
        </nav>

        <div className="min-h-[240px]">
          {activeTab === 'relations' && <RelationsTab houseIcon={houseIcon} />}
          {activeTab === 'health' && <CharacterSheet embedded />}
          {activeTab === 'history' && <HistoryTab turns={turns} />}
          {activeTab === 'inventory' && <InventoryTab />}
        </div>
      </div>

      {selectedTrait && <TraitDetailOverlay trait={selectedTrait} onClose={() => setActiveTraitId(null)} />}
    </aside>
  );
};

function IdentityHeader({ houseIcon }: { houseIcon: ReturnType<typeof getHouseIconId> }) {
  const { gameState } = useGameStore();
  const { lord } = gameState;

  return (
    <header className="relative shrink-0 overflow-hidden bg-[linear-gradient(105deg,#19130e_0%,#241a11_52%,#120e0b_100%)] px-3 pb-3 pt-4">
      <GameIcon icon={houseIcon} className="pointer-events-none absolute -right-5 -top-9 h-40 w-40 opacity-[0.055] grayscale" />
      <div className="relative flex items-center gap-3">
        <div className="ck3-heraldry-frame flex h-[78px] w-[70px] shrink-0 items-center justify-center bg-black/45 p-1.5">
          {lord.coatOfArms ? (
            <CoatOfArms design={lord.coatOfArms} className="h-full" />
          ) : (
            <GameIcon icon={houseIcon} className="h-full w-full object-contain drop-shadow-[0_4px_5px_rgba(0,0,0,0.8)]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate font-serif text-xl font-bold tracking-wide text-[#f0d18e] drop-shadow-[0_2px_2px_#000]">
                {lord.name}
              </h2>
              <p className="mt-0.5 truncate text-[13px] font-semibold text-[#c5a66c]">{lord.title}</p>
            </div>
            <span className="mt-1 shrink-0 border border-[#5d472c] bg-black/35 px-2 py-0.5 font-mono text-[11px] text-[#bcae9b]">
              {lord.age} 岁
            </span>
          </div>
          <p className="mt-1 truncate text-[11px] text-[#938474]">
            {lord.dynastyName || lord.house} · {lord.house}
          </p>
          <div className="mt-2 flex min-w-0 items-center gap-2 text-[10px] text-[#b5a693]">
            <span className="truncate border-l border-[#8b693b] pl-2">{lord.culture || '文化未记录'}</span>
            <span className="truncate border-l border-[#8b693b] pl-2">{lord.faith || '信仰未记录'}</span>
            <span className="flex min-w-0 items-center gap-1 truncate border-l border-[#8b693b] pl-2">
              <MapPin className="h-3 w-3 shrink-0 text-[#b98b47]" />{lord.location}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

function OverviewTab({
  displayedTraits,
  activeTraitId,
  onTraitSelect,
  houseIcon,
}: {
  displayedTraits: ReturnType<typeof resolveCharacterTraits>;
  activeTraitId: string | null;
  onTraitSelect: (traitId: string | null) => void;
  houseIcon: ReturnType<typeof getHouseIconId>;
}) {
  const { gameState } = useGameStore();
  const { lord } = gameState;

  return (
    <div className="flex flex-col gap-3 p-3 pb-6">
      <section className="ck3-portrait-frame ck3-portrait-frame--hero relative mx-auto h-[225px] w-[72%] min-w-[250px] max-w-[340px] overflow-hidden bg-[radial-gradient(circle_at_50%_32%,#493720_0%,#1b140e_48%,#080605_100%)]" aria-label="人物肖像">
        <GameIcon icon={houseIcon} className="absolute left-1/2 top-[42%] h-52 w-52 -translate-x-1/2 -translate-y-1/2 opacity-[0.16] grayscale drop-shadow-[0_0_16px_rgba(201,157,84,0.35)]" />
        <div className="absolute inset-x-0 bottom-0 h-[70%] bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.78))]" />
        <div className="absolute inset-0 flex items-center justify-center pb-7" aria-hidden="true">
          <div className="ck3-bust-silhouette">
            <span className="ck3-bust-silhouette__head" />
            <span className="ck3-bust-silhouette__neck" />
            <span className="ck3-bust-silhouette__body" />
          </div>
        </div>
        <div className="absolute inset-x-5 bottom-3 border-t border-[#7d6039]/60 pt-2 text-center">
          <div className="truncate text-[12px] font-bold text-[#e2c787]">{lord.house}</div>
          <div className="mt-0.5 truncate text-[9px] italic text-[#8f806f]">“{lord.houseWords}”</div>
        </div>
      </section>

      <section data-character-traits className="border-y border-[#4a3928] bg-black/20 py-2.5" aria-label="人物特质">
        <div className="mb-2 flex items-center justify-between px-1">
          <PanelHeading icon={<ScrollText className="h-4 w-4" />} title="特质" />
          <span className="font-mono text-[9px] text-[#6f6254]">{displayedTraits.length} 项 · 教育特质优先</span>
        </div>
        {displayedTraits.length > 0 ? (
          <div className="flex gap-2.5 overflow-x-auto px-1 pb-1 scrollbar-thin" aria-label="人物特质列表">
            {displayedTraits.map((trait, index) => {
              const active = activeTraitId === trait.id;
              return (
                <button
                  key={trait.id}
                  type="button"
                  onClick={() => onTraitSelect(active ? null : trait.id)}
                  aria-pressed={active}
                  title={`${trait.name}：${formatTraitDescription(trait.description, lord.name)}`}
                  className={`relative flex w-[80px] shrink-0 flex-col items-center px-1 pb-1.5 pt-1 transition-colors ${
                    active
                      ? 'bg-[#352719] text-[#f3d594] ring-1 ring-inset ring-[#c5954d]'
                      : 'bg-[#17120e] text-[#b9ad9d] ring-1 ring-inset ring-[#3d3023] hover:bg-[#241a12] hover:ring-[#8b6737]'
                  }`}
                >
                  {index === 0 && trait.category === 'education' && (
                    <span className="absolute left-1 top-1 z-10 border border-[#91703f] bg-[#17110c]/95 px-1 text-[7px] leading-3 text-[#d9b86f]">教育</span>
                  )}
                  <GameIcon icon={trait.icon} className="h-16 w-16 shrink-0 drop-shadow-[0_3px_4px_rgba(0,0,0,0.8)]" />
                  <span className="mt-0.5 w-full truncate text-[10px] font-bold">{trait.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState label="尚未记录人物特质" />
        )}
      </section>

      <section aria-label="人物属性">
        <div className="grid grid-cols-6 gap-1.5">
          {CK3_SKILLS.map((skill) => {
            const value = lord.attributes[skill.key] ?? 0;
            return (
              <div
                key={skill.key}
                className="group flex min-w-0 flex-col items-center border-x border-[#3b2d21] bg-[linear-gradient(180deg,rgba(35,27,20,0.68),rgba(10,8,7,0.72))] pb-2 pt-1"
                title={`${skill.label}：${getCk3SkillRank(value)}`}
                aria-label={`${skill.label} ${value}`}
              >
                <GameIcon icon={skill.icon} className="h-[52px] w-[52px] shrink-0 drop-shadow-[0_3px_4px_rgba(0,0,0,0.75)] transition-transform group-hover:scale-105" />
                <span className={`-mt-0.5 font-mono text-[15px] font-bold leading-none ${getSkillValueColor(value)}`}>{value}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-4 border border-[#3e3124] bg-[#15110e]" aria-label="资源与状态">
        <ResourceCell icon={<Coins className="h-4 w-4 text-[#cf9f45]" />} value={lord.goldDragons} label="金龙" />
        <ResourceCell icon={<Crown className="h-4 w-4 text-[#d7b15e]" />} value={lord.prestige} label="威仪" />
        <ResourceCell icon={<Skull className="h-4 w-4 text-[#a9584d]" />} value={lord.dread} label="恶名" />
        <ResourceCell icon={<HeartPulse className="h-4 w-4 text-[#8eb391]" />} value={lord.overallStatus} label="健康" textValue />
      </section>
    </div>
  );
}

function RelationsTab({ houseIcon }: { houseIcon: ReturnType<typeof getHouseIconId> }) {
  const { gameState } = useGameStore();
  const { lord, currentYear } = gameState;
  const { family, isLoading } = useVerifiedLordFamily(lord, currentYear);
  const relationCards: Array<{ label: string; person?: StaticCharacterRecord }> = [
    { label: '配偶', person: family.spouse },
    { label: '继承人' },
    { label: '领主' },
    { label: '父亲', person: family.father },
    { label: '母亲', person: family.mother },
    { label: '重要关系' },
  ];

  return (
    <div className="space-y-4 p-4 pb-8">
      <SectionTitle icon={<UsersRound />} title="关系与家族" subtitle="优先读取稳定 AGOT 人物档案；缺少规则依据的关系不会猜测" />
      <div className="border border-[#5a4429] bg-[linear-gradient(100deg,#251b12,#15100c)] p-3">
        <div className="flex items-center gap-3">
          <div className="h-16 w-14 shrink-0 border border-[#755a36] bg-black/35 p-1">
            {lord.coatOfArms ? <CoatOfArms design={lord.coatOfArms} className="h-full" /> : <GameIcon icon={houseIcon} className="h-full w-full" />}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-[#e5c579]">{lord.dynastyName || lord.house}</h3>
            <p className="mt-1 truncate text-[11px] text-[#aa9a85]">{lord.house}</p>
            <p className="mt-1 truncate text-[10px] italic text-[#776b5b]">“{lord.houseWords}”</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {relationCards.map(({ label, person }) => (
          <RelationshipPersonCard key={label} label={label} person={person} isLoading={isLoading} />
        ))}
      </div>
      <EmptyState label={family.subject
        ? '配偶与父母来自稳定人物档案；继承人、领主和重要关系将在有可靠规则数据后显示。'
        : '未能与稳定人物档案可靠对齐；当前不会虚构任何关系。'} />
    </div>
  );
}

function useVerifiedLordFamily(
  lord: ReturnType<typeof useGameStore.getState>['gameState']['lord'],
  currentYear: number,
): { family: LordFamilyRecords; isLoading: boolean } {
  const [family, setFamily] = useState<LordFamilyRecords>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    resolveLordFamilyRecords({
      name: lord.name,
      house: lord.house,
      houseSigil: lord.houseSigil,
      age: lord.age,
      currentYear,
    }, relationshipRepository)
      .then((result) => {
        if (!cancelled) setFamily(result);
      })
      .catch(() => {
        if (!cancelled) setFamily({});
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [lord.name, lord.house, lord.houseSigil, lord.age, currentYear]);

  return { family, isLoading };
}

function RelationshipPersonCard({
  label,
  person,
  isLoading,
}: {
  label: string;
  person?: StaticCharacterRecord;
  isLoading: boolean;
}) {
  const icon = person ? getDynastyHouseIcon(person.dynastyId) : null;
  return (
    <div className={`flex h-[82px] items-center gap-2 border px-2.5 transition-colors ${person ? 'border-[#6a5030] bg-[#1d160f]' : 'border-[#382c21] bg-black/20'}`}>
      <div className={`flex h-14 w-12 shrink-0 items-center justify-center border p-1 ${person ? 'border-[#765a35] bg-black/40' : 'border-[#4a3928] bg-[#17120e]'}`}>
        {icon ? <GameIcon icon={icon} className="h-full w-full" /> : <UserRound className="h-8 w-8 stroke-1 text-[#665c50]" />}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-[#9d835b]">{label}</div>
        <div className={`mt-1 truncate text-[12px] font-semibold ${person ? 'text-[#d8c39d]' : 'text-[#6f665b]'}`}>
          {person?.name || (isLoading ? '正在核对档案' : '档案未记录')}
        </div>
        {person && <div className={`mt-0.5 text-[9px] ${person.alive ? 'text-[#77967a]' : 'text-[#786d62]'}`}>{person.alive ? '在世' : '已故'}</div>}
      </div>
    </div>
  );
}

function getDynastyHouseIcon(dynastyId: string | null | undefined): ReturnType<typeof getHouseIconId> | null {
  const dynasty = (dynastyId ?? '').toLowerCase();
  for (const name of ['stark', 'lannister', 'targaryen', 'baratheon', 'tyrell', 'martell', 'arryn', 'greyjoy', 'tully']) {
    if (dynasty.includes(name)) return getHouseIconId(name);
  }
  return null;
}

function HistoryTab({ turns }: { turns: ReturnType<typeof useGameStore.getState>['gameState']['turns'] }) {
  const recentTurns = turns.slice(-8).reverse();

  return (
    <div className="space-y-4 p-4 pb-8">
      <SectionTitle icon={<BookOpen />} title="记忆与经历" subtitle="从已发生的叙事回合中整理" />
      {recentTurns.length > 0 ? (
        <ol className="relative ml-2 border-l border-[#594329] pl-5">
          {recentTurns.map((turn) => (
            <li key={turn.id} className="relative mb-4 border-b border-[#2e251d] pb-4 last:mb-0">
              <span className="absolute -left-[25px] top-1 h-2 w-2 rotate-45 border border-[#bd8f48] bg-[#241a11]" />
              <div className="flex items-center justify-between gap-2">
                <strong className="text-[11px] text-[#d7ba79]">第 {turn.turnNumber} 回合</strong>
                <span className="text-[9px] text-[#776b5e]">{turn.gameDate || '日期未记录'}</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-[#a99d8c]">{turn.narrate || turn.playerInput}</p>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState label="尚无可记录的经历" />
      )}
    </div>
  );
}

function InventoryTab() {
  const { gameState } = useGameStore();
  const { lord } = gameState;
  const carriedItems = lord.carriedItems || lord.gear.inventory || lord.gear.pouch || [];
  const storageSites = lord.storageSites || [];
  const transports = lord.transports || [];

  return (
    <div className="space-y-4 p-4 pb-8">
      <SectionTitle icon={<Backpack />} title="随身物品" subtitle={`${getUsedCapacity(carriedItems)} / 8 格 · 仅携带便于随身保管的小件`} />
      {carriedItems.length > 0 ? (
        <div className="divide-y divide-[#31271f] border-y border-[#4a3928]">
          {carriedItems.map((item) => {
            const icon = getInventoryIconId(item.category, item.name);
            return (
              <div key={item.id} className="flex items-center gap-3 bg-black/15 px-2 py-2.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-[#4b3928] bg-[#17120e]">
                  {icon ? <GameIcon icon={icon} className="h-9 w-9" /> : <Package className="h-6 w-6 text-[#927b57]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="truncate text-[12px] text-[#d9c6a7]">{item.name}</strong>
                    <span className="font-mono text-[10px] text-[#b58c4e]">x{item.quantity}</span>
                  </div>
                  <p className="mt-1 truncate text-[10px] text-[#766c60]">{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState label="没有随身携带的物品" />
      )}

      <div className="grid grid-cols-2 gap-2">
        <StorageSummary icon={<Landmark className="h-5 w-5" />} label="据点储藏" count={storageSites.length} detail={`${storageSites.reduce((sum, site) => sum + site.items.length, 0)} 件物品`} />
        <StorageSummary icon={<Shield className="h-5 w-5" />} label="运输工具" count={transports.length} detail={`${transports.reduce((sum, vehicle) => sum + vehicle.items.length, 0)} 件物品`} />
      </div>
      <p className="border-l-2 border-[#6d5230] bg-black/20 px-3 py-2 text-[10px] leading-relaxed text-[#877b6d]">
        穿戴、卸下、使用物品和地点仓储仍可在“健康与装备”页签中操作；穿戴会在下一次对话完成后生效。
      </p>
    </div>
  );
}

function TraitDetailOverlay({
  trait,
  onClose,
}: {
  trait: ReturnType<typeof resolveCharacterTraits>[number];
  onClose: () => void;
}) {
  const { gameState } = useGameStore();
  const description = formatTraitDescription(trait.description, gameState.lord.name);
  const effects = [formatTraitModifiers(trait.modifiers), ...formatTraitRuleEffects(trait.rules)].filter(Boolean);

  return (
    <div className="absolute inset-x-3 bottom-3 z-30 border border-[#a37b3f] bg-[#120e0b]/[0.98] p-3 shadow-[0_8px_28px_rgba(0,0,0,0.85),inset_0_0_20px_rgba(164,117,52,0.08)]">
      <div className="flex gap-3">
        <GameIcon icon={trait.icon} className="h-16 w-16 shrink-0 drop-shadow-[0_4px_5px_rgba(0,0,0,0.9)]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <strong className="text-sm text-[#efd18b]">{trait.name}</strong>
              <div className="mt-0.5 text-[9px] text-[#8e7a60]">{trait.isLegacy ? '旧存档标签' : TRAIT_CATEGORY_LABELS[trait.category]}</div>
            </div>
            <button type="button" onClick={onClose} className="border border-[#4b3928] px-2 py-0.5 text-[10px] text-[#9e907f] hover:border-[#8a683c] hover:text-[#e0c793]">关闭</button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[#b9ad9d]">{description}</p>
          {effects.length > 0 && <p className="mt-2 text-[10px] leading-relaxed text-[#c09151]">{effects.join(' · ')}</p>}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="border-b border-[#5b4429] pb-2">
      <div className="flex items-center gap-2 text-[#dcbf7d] [&>svg]:h-5 [&>svg]:w-5">{icon}<h3 className="text-sm font-bold tracking-wide">{title}</h3></div>
      <p className="mt-1 text-[10px] text-[#756a5d]">{subtitle}</p>
    </div>
  );
}

function PanelHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-[#b99155]">{icon}{title}</div>;
}

function ResourceCell({ icon, value, label, textValue = false }: { icon: React.ReactNode; value: number | string; label: string; textValue?: boolean }) {
  return (
    <div className="flex min-w-0 items-center justify-center gap-1.5 border-r border-[#3e3124] px-1.5 py-2 last:border-r-0">
      {icon}
      <div className="min-w-0">
        <div className={`truncate font-mono font-bold text-[#d7c3a1] ${textValue ? 'text-[10px]' : 'text-[12px]'}`}>{value}</div>
        <div className="text-[8px] text-[#75695b]">{label}</div>
      </div>
    </div>
  );
}

function StorageSummary({ icon, label, count, detail }: { icon: React.ReactNode; label: string; count: number; detail: string }) {
  return (
    <div className="border border-[#3a2e23] bg-black/20 p-3">
      <div className="flex items-center gap-2 text-[#a98a59]">{icon}<strong className="text-[11px]">{label}</strong></div>
      <div className="mt-2 font-mono text-sm text-[#d1b579]">{count}</div>
      <div className="mt-0.5 text-[9px] text-[#756a5d]">{detail}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="border border-dashed border-[#3d3025] bg-black/15 px-3 py-5 text-center text-[10px] leading-relaxed text-[#70675c]">{label}</div>;
}

function getSkillValueColor(value: number): string {
  if (value >= 25) return 'text-amber-300';
  if (value >= 20) return 'text-cyan-300';
  if (value >= 16) return 'text-emerald-300';
  if (value <= 4) return 'text-red-400';
  return 'text-[#f1d694]';
}
