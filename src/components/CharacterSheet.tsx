import React, { useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import {
  Coins,
  Crown,
  Swords,
  Sparkles,
  HeartPulse,
  Package,
  Biohazard,
  Brain,
  Droplets,
  FlaskConical,
  Footprints,
  Heart,
  Leaf,
  PawPrint,
  ScrollText,
  Shield,
  Skull,
  Warehouse,
  MapPin,
  Ship,
} from 'lucide-react';
import { GearItem, WoundLevel, InventoryItem, EquippedGearSlot, ItemContainerRef, PendingEquipmentAction } from '../types/game';
import Model, { IExerciseData, IMuscleStats, Muscle } from 'react-body-highlighter';
import { GameIcon, GameIconId, getGearIconId, getHouseIconId, getInventoryIconId } from './GameIcon';
import { CoatOfArms } from './CoatOfArms';
import { CK3_SKILLS, getCk3SkillRank } from '../data/ck3Skills';
import { formatTraitDescription, formatTraitModifiers, formatTraitRuleEffects, resolveCharacterTraits, TRAIT_CATEGORY_LABELS } from '../data/characterTraits';
import { getEquipmentWearNotice } from '../services/equipmentRules';
import { getAccessibleStorageSites, getAccessibleTransports, getUsedCapacity } from '../services/itemCustody';

export const CharacterSheet: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { gameState, unequipGear, queueEquipmentAction, pendingEquipmentActions, isStreaming } = useGameStore();
  const { lord } = gameState;
  const { body, gear } = lord;
  const carriedItems = lord.carriedItems || gear.inventory || gear.pouch || [];
  const accessibleStorageSites = getAccessibleStorageSites(lord);
  const accessibleTransports = getAccessibleTransports(lord);
  const remoteStorageSites = (lord.storageSites || []).filter((site) => !accessibleStorageSites.some((entry) => entry.id === site.id));
  const displayedTraits = resolveCharacterTraits(lord.traitIds ?? [], lord.traits ?? []);
  const knownItems = [
    ...carriedItems,
    ...(lord.storageSites || []).flatMap((site) => site.items),
    ...(lord.transports || []).flatMap((vehicle) => vehicle.items),
  ];

  // 当前选中与悬停检视的部位/装备槽
  const [activeSlot, setActiveSlot] = useState<string | null>('torso');
  const [activeTraitId, setActiveTraitId] = useState<string | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);

  // 优先取悬停目标，否则取选中目标
  const currentTarget = hoveredSlot || activeSlot;
  const activeTrait = displayedTraits.find((trait) => trait.id === activeTraitId) ?? null;

  // 伤情数据与当前选中部位高亮数据 (频率 4 为当前瞄准的金色发光色)
  const bodyHighlighterData: IExerciseData[] = [];

  const getFreq = (level: WoundLevel) => {
    if (level === 'critical') return 3; // 红色
    if (level === 'heavy') return 2;    // 橙色
    if (level === 'minor') return 1;    // 黄色
    return 0;
  };

  // 1. 基础伤情着色
  if (body.head.level !== 'intact') {
    bodyHighlighterData.push({
      name: `头部伤情`,
      muscles: ['head', 'neck'],
      frequency: getFreq(body.head.level),
    });
  }

  if (body.torso.level !== 'intact') {
    bodyHighlighterData.push({
      name: `躯干伤情`,
      muscles: ['chest', 'abs', 'obliques'],
      frequency: getFreq(body.torso.level),
    });
  }

  if (body.arms.level !== 'intact') {
    bodyHighlighterData.push({
      name: `双臂伤情`,
      muscles: ['biceps', 'triceps', 'forearm', 'front-deltoids'],
      frequency: getFreq(body.arms.level),
    });
  }

  if (body.legs.level !== 'intact') {
    bodyHighlighterData.push({
      name: `下肢伤情`,
      muscles: ['quadriceps', 'abductors', 'calves', 'knees'],
      frequency: getFreq(body.legs.level),
    });
  }

  // 2. 当前瞄准/选中的部位精确发光
  if (currentTarget === 'head') {
    bodyHighlighterData.push({ name: '头部瞄准', muscles: ['head', 'neck'], frequency: 4 });
  } else if (currentTarget === 'torso') {
    // 躯干重甲：胸腹肌肉群发光
    bodyHighlighterData.push({ name: '躯干瞄准', muscles: ['chest', 'abs', 'obliques'], frequency: 4 });
  } else if (currentTarget === 'mainhand' || currentTarget === 'offhand') {
    // 手臂高亮由下方的单侧样式处理。组件会把同名肌群的左右两侧一起着色，
    // 因此这里不能再把 biceps / forearm 写入数据，否则主手与副手都会同时发光。
  } else if (currentTarget === 'legs') {
    // 下肢护胫：大腿与小腿肌肉发光
    bodyHighlighterData.push({ name: '下肢护胫', muscles: ['quadriceps', 'abductors', 'calves', 'knees'], frequency: 4 });
  }

  // 点击人体肌肉部位触发对应插槽高亮
  const handleMuscleClick = (stats?: IMuscleStats) => {
    if (!stats || !stats.muscle) return;
    const m = stats.muscle as string;
    if (m === 'head') setActiveSlot('head');
    else if (m === 'trapezius' || m === 'neck') setActiveSlot('head');
    else if (m === 'chest' || m === 'abs' || m === 'obliques') setActiveSlot('torso');
    else if (m === 'biceps' || m === 'triceps' || m === 'forearm' || m === 'front-deltoids') setActiveSlot('mainhand');
    else if (m === 'quadriceps' || m === 'calves' || m === 'knees' || m === 'adductor' || m === 'abductors') setActiveSlot('legs');
  };

  // ═════════════════════════════════════════════════════════════════════════
  //  动态指针连线绝对到达坐标 (百分比坐标系统 0 - 100)
  // ═════════════════════════════════════════════════════════════════════════
  const pointerConfigs: Record<
    string,
    {
      startX: number;
      startY: number;
      midX: number;
      midY: number;
      endX: number;
      endY: number;
    }
  > = {
    // 头部卡片位于左上侧，避免遮挡人体轮廓
    head: {
      startX: 30,
      startY: 11,
      midX: 42,
      midY: 10,
      endX: 50,
      endY: 10,
    },
    // 胸膛：从右上侧战甲按钮直连胸部核心
    torso: {
      startX: 70,
      startY: 11,
      midX: 62,
      midY: 36,
      endX: 50,
      endY: 36,
    },
    // 副手：从右侧副手按钮直连左前臂高亮区域
    offhand: {
      startX: 70,
      startY: 50,
      midX: 65,
      midY: 46,
      endX: 61,
      endY: 46,
    },
    // 主手：从左侧主手按钮直连右前臂高亮区域
    mainhand: {
      startX: 30,
      startY: 50,
      midX: 34,
      midY: 47,
      endX: 39,
      endY: 46,
    },
    // 下肢：从右侧护胫按钮直连画面右侧膝部高亮区域
    legs: {
      startX: 70,
      startY: 89,
      midX: 62,
      midY: 79,
      endX: 56,
      endY: 74,
    },
  };

  const activePointer = currentTarget ? pointerConfigs[currentTarget] : null;

  return (
    <aside className={`${embedded ? 'w-full overflow-visible bg-transparent p-2' : 'h-full w-full overflow-y-auto border-r border-hairline bg-ink p-3.5'} flex select-none flex-col gap-3 font-serif text-parchment scrollbar-thin`}>
      {/* 独立人物栏保留旧身份卡；嵌入 CK3 窗口时只显示健康、装备与物品功能。 */}
      {!embedded && (
      <div className="panel-iron relative shrink-0 overflow-hidden p-3.5">
        {lord.coatOfArms ? (
          <CoatOfArms design={lord.coatOfArms} muted className="absolute right-1 -bottom-3 w-20 pointer-events-none" />
        ) : (
          <GameIcon
            icon={getHouseIconId(lord.houseSigil || lord.house)}
            className="absolute right-1 -bottom-3 w-24 h-24 opacity-10 pointer-events-none blur-[0.5px]"
          />
        )}

        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-gold-deep/60 bg-[#2b2417] p-1">
            {lord.coatOfArms ? (
              <CoatOfArms design={lord.coatOfArms} className="h-full" />
            ) : (
              <GameIcon icon={getHouseIconId(lord.houseSigil || lord.house)} tone="raw" className="w-full h-full drop-shadow-md" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-serif text-base font-bold leading-tight tracking-wide text-gold-bright">
              {lord.house}
            </h2>
            <p className="truncate font-serif text-xs italic text-gold-deep">
              "{lord.houseWords}"
            </p>
          </div>
        </div>

        <div className="mt-1.5 flex items-center justify-between border-t border-hairline pt-2 text-xs">
          <div>
            <span className="font-serif text-sm font-bold text-parchment">{lord.name}</span>
            <span className="ml-2 font-mono text-parchment-dim">({lord.age} 岁 · {lord.gender})</span>
          </div>
          <span className="max-w-[140px] truncate font-serif text-gold">{lord.title}</span>
        </div>

        {/* 随身金币与声望 */}
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-hairline pt-2 font-mono text-xs">
          <div className="flex items-center justify-between border border-hairline bg-ink-2/70 px-2.5 py-1.5">
            <span className="flex items-center gap-1.5 font-bold text-gold-bright">
              <Coins className="h-4 w-4 text-gold" />
              {lord.goldDragons} <span className="text-[11px] font-normal text-parchment-dim">金龙</span>
            </span>
            <span className="text-[11px] text-parchment-faint">{lord.silverStags} 银鹿</span>
          </div>

          <div className="flex items-center justify-between border border-hairline bg-ink-2/70 px-2.5 py-1.5">
            <span className="flex items-center gap-1.5 font-bold text-gold-bright">
              <Crown className="h-4 w-4 text-gold" />
              {lord.prestige} <span className="text-[11px] font-normal text-parchment-dim">威仪</span>
            </span>
            <span className="text-[11px] text-rubric-bright">{lord.dread} 恶名</span>
          </div>
        </div>

        {/* CK3 六项角色能力 */}
        <div className="mt-2 grid grid-cols-6 gap-1 border-t border-hairline pt-2 text-center font-serif">
          {CK3_SKILLS.map((skill) => (
            <CompactStatCell
              key={skill.key}
              label={skill.label}
              val={lord.attributes[skill.key] ?? 0}
              icon={skill.icon}
            />
          ))}
        </div>


        {/* 游戏内人物特质：使用 CK3 / AGOT 正式图标，点击后展开说明与规则效果。 */}
        <div data-character-traits className="mt-2 border-t border-hairline pt-2 font-serif">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-gold">
              <ScrollText className="h-3.5 w-3.5" />人物特质
            </span>
            <span className="font-mono text-[9px] text-parchment-faint">{displayedTraits.length} 项</span>
          </div>
          {displayedTraits.length > 0 ? (
            <>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin" aria-label="人物特质列表">
                {displayedTraits.map((trait) => {
                  const selected = activeTraitId === trait.id;
                  const description = formatTraitDescription(trait.description, lord.name);
                  return (
                    <button
                      key={trait.id}
                      type="button"
                      onClick={() => setActiveTraitId(selected ? null : trait.id)}
                      title={`${trait.name}：${description}`}
                      aria-pressed={selected}
                      className={`flex w-[58px] shrink-0 flex-col items-center gap-1 border px-1 py-1.5 transition-colors ${
                        selected
                          ? 'border-gold bg-gold-deep/20 shadow-[inset_0_0_12px_rgba(201,164,92,0.16)]'
                          : 'border-hairline bg-ink-3/40 hover:border-gold-deep hover:bg-ink-2'
                      }`}
                    >
                      <GameIcon icon={trait.icon} className="w-11 h-11 shrink-0" />
                      <span className={`w-full truncate text-[9px] font-bold ${selected ? 'text-gold-bright' : 'text-parchment-dim'}`}>
                        {trait.name}
                      </span>
                    </button>
                  );
                })}
              </div>
              {activeTrait && (
                <div className="mt-2 border border-hairline-bright bg-ink-3/50 px-2.5 py-2 text-[10px] leading-relaxed">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-[11px] text-gold-bright">{activeTrait.name}</strong>
                    <span className="text-parchment-faint">{activeTrait.isLegacy ? '旧存档标签' : TRAIT_CATEGORY_LABELS[activeTrait.category]}</span>
                  </div>
                  <p className="mt-1 text-parchment-dim">{formatTraitDescription(activeTrait.description, lord.name)}</p>
                  {(formatTraitModifiers(activeTrait.modifiers) || formatTraitRuleEffects(activeTrait.rules).length > 0) && (
                    <p className="mt-1 text-gold">
                      {[formatTraitModifiers(activeTrait.modifiers), ...formatTraitRuleEffects(activeTrait.rules)].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="border border-hairline bg-ink-3/40 py-3 text-center text-[10px] text-parchment-faint">
              尚未记录人物特质
            </div>
          )}
        </div>
      </div>
      )}

      {/* 模块 2： 纵向拉长版人体解剖图与【直连到达指示线 + 独立部位精准发光】 */}
      <div className="panel-iron flex shrink-0 flex-col gap-2 p-3">

        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow">健康与装备</p>
          <HeartPulse className="h-3.5 w-3.5 text-gold-deep" />
        </div>

        {/* 异常状态提示条 */}
        {(body.isBleeding || body.isPoisoned || body.isInfected) && (
          <div className="flex flex-wrap gap-1.5 border border-rubric/50 bg-ink-3/50 p-1.5 text-xs">
            {body.isBleeding && <span className="flex items-center gap-1 font-bold text-rubric-bright animate-pulse"><Droplets className="w-3.5 h-3.5" />持续大出血</span>}
            {body.isPoisoned && <span className="flex items-center gap-1 font-bold text-rubric animate-pulse"><Skull className="w-3.5 h-3.5" />身中剧毒</span>}
            {body.isInfected && <span className="flex items-center gap-1 font-bold text-gold-bright"><Biohazard className="w-3.5 h-3.5" />伤口发炎</span>}
          </div>
        )}

        {/* 核心工坊：三行架构 + SVG 绝对直连到达指示线 */}
        <div className="relative flex h-[320px] flex-col justify-between overflow-hidden border border-hairline bg-gradient-to-b from-ink-2 via-ink-3 to-ink p-2.5 shadow-inner">
          {/* 背景微弱坐标网格 */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#c9a45c_1px,transparent_1px)] [background-size:12px_12px] pointer-events-none" />

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/*  全程直连到达指示线层 (Direct Pointer Line to Exact Target) */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <svg
            viewBox="0 0 100 100"
            className="absolute inset-0 w-full h-full pointer-events-none z-20"
            preserveAspectRatio="none"
          >
            <defs>
              <filter id="gold-line-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {activePointer && (
              <g className="transition-all duration-200">
                {/* 1. 全程直达动态折线 (直接从插槽边缘连入人体部位内部) */}
                <polyline
                  points={`${activePointer.startX},${activePointer.startY} ${activePointer.midX},${activePointer.midY} ${activePointer.endX},${activePointer.endY}`}
                  fill="none"
                  stroke="#eac97e"
                  strokeWidth="1.2"
                  strokeDasharray="2 1"
                  filter="url(#gold-line-glow)"
                  className="animate-pulse"
                />

                {/* 2. 插槽端发射点 */}
                <circle
                  cx={activePointer.startX}
                  cy={activePointer.startY}
                  r="1.2"
                  fill="#c9a45c"
                  stroke="#fff"
                  strokeWidth="0.4"
                  filter="url(#gold-line-glow)"
                />

                {/* 3. 人体部位端落点准星微光点 (到达目标内部) */}
                <circle
                  cx={activePointer.endX}
                  cy={activePointer.endY}
                  r="1.8"
                  fill="#ffffff"
                  stroke="#eac97e"
                  strokeWidth="0.8"
                  filter="url(#gold-line-glow)"
                />
              </g>
            )}
          </svg>

          {/* 中央绝对居中的人体解剖模型 (高度 300px) */}
          <div
            className={`body-model absolute inset-0 flex items-center justify-center pointer-events-auto filter brightness-95 contrast-125 ${
              currentTarget === 'mainhand'
                ? 'body-model--mainhand'
                : currentTarget === 'offhand'
                  ? 'body-model--offhand'
                  : ''
            }`}
          >
            <Model
              type="anterior"
              bodyColor="#2e2519"
              highlightedColors={['#d97706', '#b4432f', '#d4593f', '#eac97e']} // 4号索引为当前选中的金色发光高亮
              data={bodyHighlighterData}
              onClick={handleMuscleClick}
              style={{ width: '100%', height: '100%', maxHeight: '300px', maxWidth: '170px' }}
              svgStyle={{
                filter:
                  currentTarget
                    ? 'drop-shadow(0 0 8px rgba(234, 201, 126, 0.5)) drop-shadow(0 4px 12px rgba(0,0,0,0.9))'
                    : 'drop-shadow(0 4px 12px rgba(0,0,0,0.9))',
                transition: 'filter 0.2s ease',
              }}
            />
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* 第 1 行：头部战盔与躯干重甲 */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <div data-slot-row="top" className="flex items-center justify-between z-10 w-full relative">
            <LinkedGearCard
              zoneName="头部"
              fleshIcon={<Brain className="w-3 h-3" />}
              gearIcon="gear-helmet"
              gearItem={gear.head}
              woundLevel={body.head.level}
              fallbackName="未戴战盔"
              isActive={activeSlot === 'head'}
              isHovered={hoveredSlot === 'head'}
              onMouseEnter={() => setHoveredSlot('head')}
              onMouseLeave={() => setHoveredSlot(null)}
              onClick={() => setActiveSlot(activeSlot === 'head' ? null : 'head')}
            />

            <LinkedGearCard
              zoneName="胸膛"
              fleshIcon={<Heart className="w-3 h-3" />}
              gearIcon="gear-armor"
              gearItem={gear.torso}
              woundLevel={body.torso.level}
              fallbackName="无躯干铠"
              isActive={activeSlot === 'torso'}
              isHovered={hoveredSlot === 'torso'}
              onMouseEnter={() => setHoveredSlot('torso')}
              onMouseLeave={() => setHoveredSlot(null)}
              onClick={() => setActiveSlot(activeSlot === 'torso' ? null : 'torso')}
            />
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* 第 2 行：主手与副手 */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <div data-slot-row="weapons" className="flex items-center justify-between z-10 w-full relative">
            <LinkedGearCard
              zoneName="主手"
              fleshIcon={<Swords className="w-3 h-3" />}
              gearIcon="gear-sword"
              gearItem={gear.mainhand}
              woundLevel={body.arms.level}
              fallbackName="空手"
              isWeapon
              isActive={activeSlot === 'mainhand'}
              isHovered={hoveredSlot === 'mainhand'}
              onMouseEnter={() => setHoveredSlot('mainhand')}
              onMouseLeave={() => setHoveredSlot(null)}
              onClick={() => setActiveSlot(activeSlot === 'mainhand' ? null : 'mainhand')}
            />

            <LinkedGearCard
              zoneName="副手"
              fleshIcon={<Shield className="w-3 h-3" />}
              gearIcon="gear-armor"
              gearItem={gear.offhand}
              fallbackName="副手无装备"
              isActive={activeSlot === 'offhand'}
              isHovered={hoveredSlot === 'offhand'}
              onMouseEnter={() => setHoveredSlot('offhand')}
              onMouseLeave={() => setHoveredSlot(null)}
              onClick={() => setActiveSlot(activeSlot === 'offhand' ? null : 'offhand')}
            />
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* 第 3 行：下肢护胫 */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <div className="flex items-center justify-end z-10 w-full relative">
            <LinkedGearCard
              zoneName="下肢"
              fleshIcon={<Footprints className="w-3 h-3" />}
              gearIcon="gear-chainmail"
              gearItem={gear.legs}
              woundLevel={body.legs.level}
              fallbackName="熟皮长靴"
              isActive={activeSlot === 'legs'}
              isHovered={hoveredSlot === 'legs'}
              onMouseEnter={() => setHoveredSlot('legs')}
              onMouseLeave={() => setHoveredSlot(null)}
              onClick={() => setActiveSlot(activeSlot === 'legs' ? null : 'legs')}
            />
          </div>
        </div>

        {/* 伴兽与地点储藏；随身物品集中在人物卷宗的独立页签。 */}
        <div className="flex flex-col gap-2 border-t border-hairline pt-2">
          {gear.companion && (
            <button
              type="button"
              onClick={() => setActiveSlot(activeSlot === 'companion' ? null : 'companion')}
              className={`flex w-full items-center justify-between border px-2.5 py-1.5 text-left transition-colors ${
                activeSlot === 'companion'
                  ? 'border-gold bg-ink-3 ring-1 ring-inset ring-gold/60'
                  : 'border-hairline bg-ink-3/40 hover:border-gold-deep'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate">
                <GameIcon icon="companion-wolf" className="w-6 h-6 shrink-0" />
                <span className="truncate font-serif text-xs font-semibold text-gold-bright">{gear.companion.name}</span>
              </div>
              <span className="shrink-0 font-mono text-[10px] text-emerald-700">{gear.companion.bonus}</span>
            </button>
          )}

          {accessibleStorageSites.map((site) => (
            <CustodySection
              key={site.id}
              title={site.name}
              icon={<Warehouse className="w-3.5 h-3.5" />}
              meta={`${site.items.length} 件 · 当前可用`}
              description={site.description}
              emptyText="此处没有存放物品"
              items={site.items}
              targetPrefix={`site_${site.id}`}
              activeSlot={activeSlot}
              onInspect={setActiveSlot}
              from={{ type: 'site', id: site.id }}
              pendingEquipmentActions={pendingEquipmentActions}
              onQueueEquip={queueEquipmentAction}
              isStreaming={isStreaming}
            />
          ))}

          {accessibleTransports.map((vehicle) => (
            <CustodySection
              key={vehicle.id}
              title={vehicle.name}
              icon={<Ship className="w-3.5 h-3.5" />}
              meta={`${getUsedCapacity(vehicle.items)} / ${vehicle.capacity} 格`}
              description={vehicle.description}
              emptyText="运输工具当前没有装载物品"
              items={vehicle.items}
              targetPrefix={`vehicle_${vehicle.id}`}
              activeSlot={activeSlot}
              onInspect={setActiveSlot}
              from={{ type: 'vehicle', id: vehicle.id }}
              pendingEquipmentActions={pendingEquipmentActions}
              onQueueEquip={queueEquipmentAction}
              isStreaming={isStreaming}
            />
          ))}

          {remoteStorageSites.length > 0 && (
            <div className="border border-hairline bg-ink-3/40 px-2.5 py-2">
              <div className="flex items-center gap-1 font-serif text-[11px] font-bold text-parchment-dim">
                <MapPin className="w-3.5 h-3.5" />远方储藏
              </div>
              <div className="mt-1 space-y-1">
                {remoteStorageSites.map((site) => (
                  <div key={site.id} className="flex items-center justify-between gap-2 text-[10px] text-parchment-faint">
                    <span className="truncate">{site.name}</span>
                    <span className="shrink-0">{site.location} · {site.items.length} 件</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 动态插槽检视卡 */}
        {currentTarget && (
          <div className="border border-gold/70 bg-ink/95 p-2.5 font-serif text-xs shadow-xl animate-in fade-in">
            <SlotInspectionDetails
              slotKey={currentTarget}
              body={body}
              gear={gear}
              knownItems={knownItems}
              onUnequip={(slot) => unequipGear(slot as any)}
            />
          </div>
        )}
      </div>
    </aside>
  );
};

function CustodySection({
  title,
  icon,
  meta,
  description,
  emptyText,
  items,
  targetPrefix,
  activeSlot,
  onInspect,
  from,
  pendingEquipmentActions,
  onUse,
  onQueueEquip,
  allowUse = false,
  isStreaming = false,
}: {
  title: string;
  icon: React.ReactNode;
  meta: string;
  description?: string;
  emptyText: string;
  items: InventoryItem[];
  targetPrefix: string;
  activeSlot: string | null;
  onInspect: (value: string | null) => void;
  from: ItemContainerRef;
  pendingEquipmentActions: PendingEquipmentAction[];
  onUse?: (itemId: string) => void;
  onQueueEquip?: (item: InventoryItem, from: ItemContainerRef, sourceLabel: string) => void;
  allowUse?: boolean;
  isStreaming?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 border border-hairline bg-ink-2/60 p-2.5 shadow-inner">
      <div className="flex items-center justify-between gap-2 border-b border-hairline pb-1 font-serif text-xs">
        <span className="flex min-w-0 items-center gap-1 font-bold text-gold">
          {icon}<span className="truncate">{title}</span>
        </span>
        <span className="shrink-0 font-mono text-[10px] text-parchment-faint">{meta}</span>
      </div>
      {description && <p className="text-[9.5px] leading-snug text-parchment-faint">{description}</p>}
      <div className="flex flex-col gap-1.5">
        {items.length ? items.map((item) => {
          const target = `item_${targetPrefix}__${item.id}`;
          const canUse = allowUse && (item.category === '药草' || item.category === '毒物') && onUse;
          const canEquip = (item.category === '武器' || item.category === '防具' || Boolean(item.slot)) && onQueueEquip;
          const isQueued = pendingEquipmentActions.some((action) => {
            if (action.itemId !== item.id || action.from.type !== from.type) return false;
            if (action.from.type === 'carried' || from.type === 'carried') return true;
            return action.from.id === from.id;
          });
          const equipLabel = item.slot === 'mainhand' || item.slot === 'offhand' ? '装备' : '穿上';
          return (
            <div key={`${targetPrefix}_${item.id}`} className="group flex items-center justify-between border border-hairline bg-ink/70 p-2 text-xs transition-colors hover:border-gold-deep hover:bg-ink-3/60">
              <div className="mr-2 flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-1 truncate font-serif text-[11.5px] font-semibold text-parchment group-hover:text-gold-bright">
                  <InventoryCategoryIcon item={item} />
                  <span className="truncate">{item.name}</span>
                  <span className="ml-1 font-mono text-[10px] text-gold">x{item.quantity}</span>
                </div>
                <p className="mt-0.5 truncate font-serif text-[10px] text-parchment-faint">{item.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {canUse && <button type="button" onClick={() => onUse(item.id)} className="border border-hairline-bright bg-ink-3 px-2 py-1 font-serif text-[10.5px] font-bold text-parchment transition-colors hover:border-gold hover:text-gold-bright">使用</button>}
                {canEquip && <button type="button" onClick={() => onQueueEquip(item, from, title)} disabled={isQueued || isStreaming} title={isQueued ? '已加入下一次对话的待执行队列' : '将在下一次对话生成完成后生效'} className="border border-gold/60 bg-gold-deep/20 px-2 py-1 font-serif text-[10.5px] font-bold text-gold-bright transition-colors hover:bg-gold-deep/35 disabled:cursor-not-allowed disabled:opacity-40">{isQueued ? '已排队' : equipLabel}</button>}
                {!canEquip && !allowUse && <span className="border border-hairline bg-ink-3/40 px-1.5 py-0.5 text-[9.5px] text-parchment-faint">存放</span>}
                <button type="button" onClick={() => onInspect(activeSlot === target ? null : target)} className="border border-hairline bg-ink-3/50 px-1.5 py-1 font-serif text-[10.5px] text-parchment-dim transition-colors hover:border-gold-deep hover:text-parchment">检视</button>
              </div>
            </div>
          );
        }) : (
          <div className="border border-hairline/60 bg-ink-3/30 py-2 text-center font-serif text-xs italic text-parchment-faint">{emptyText}</div>
        )}
      </div>
    </div>
  );
}

// 连线式人体部位装备卡片 (Linked Gear Card)
function LinkedGearCard({
  zoneName,
  fleshIcon,
  gearIcon,
  gearItem,
  woundLevel,
  fallbackName,
  isWeapon = false,
  isActive,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  zoneName: string;
  fleshIcon: React.ReactNode;
  gearIcon: GameIconId;
  gearItem?: GearItem;
  woundLevel?: WoundLevel;
  fallbackName: string;
  isWeapon?: boolean;
  isActive: boolean;
  isHovered?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClick: () => void;
}) {
  const woundBorder = woundLevel === 'critical'
    ? 'border-rubric-bright bg-rubric-deep/30 text-rubric-bright animate-pulse'
    : woundLevel === 'heavy'
    ? 'border-rubric bg-rubric-deep/20 text-rubric-bright'
    : woundLevel === 'minor'
    ? 'border-gold-deep bg-gold-deep/10 text-gold-bright'
    : 'border-gold-deep bg-gold-deep/20 text-parchment';

  const isHighlighted = isActive || isHovered;
  const displayedGearIcon = gearItem ? getGearIconId(gearItem.icon, gearItem.slot) : gearIcon;

  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      className={`flex w-[108px] flex-col justify-center border p-2 text-left shadow-sm transition-all duration-150 ${
        isHighlighted
          ? 'border-gold-bright bg-ink-3 shadow-lg ring-1 ring-inset ring-gold scale-[1.03]'
          : `${woundBorder} hover:border-gold hover:bg-ink-3`
      }`}
    >
      {/* 顶部部位名 + 创伤指示 */}
      <div className="mb-1 flex items-center justify-between font-mono text-[11px] leading-none text-parchment-dim">
        <span className="flex items-center gap-1 font-serif font-bold text-gold-bright">
          <span>{fleshIcon}</span> {zoneName}
        </span>
        {woundLevel && woundLevel !== 'intact' ? (
          <span className="h-2 w-2 bg-rubric-bright animate-ping" />
        ) : (
          <span className="text-[10px] text-emerald-700">完好</span>
        )}
      </div>

      {/* 装备名称 */}
      <div className="flex items-center gap-1 truncate font-serif text-xs font-bold leading-tight text-parchment">
        <GameIcon icon={displayedGearIcon} className="w-5 h-5 shrink-0 drop-shadow" />
        <span className="truncate">{gearItem ? gearItem.name : fallbackName}</span>
      </div>
    </button>
  );
}

// 选中详情检视卡片
function SlotInspectionDetails({
  slotKey,
  body,
  gear,
  knownItems,
  onUnequip,
}: {
  slotKey: string;
  body: any;
  gear: any;
  knownItems: InventoryItem[];
  onUnequip?: (slot: EquippedGearSlot) => void;
}) {
  if (slotKey === 'head') {
    return (
      <div className="flex flex-col gap-1.5 text-xs">
        <div className="flex items-center justify-between font-bold text-gold-bright">
          <span className="flex items-center gap-1"><Brain className="w-3.5 h-3.5" />头部与咽喉 (致命要害)</span>
          <span className="text-rubric-bright">伤情: 【{getWoundLabel(body.head.level)}】</span>
        </div>
        <p className="text-xs text-parchment-dim">
          创痕记录: {body.head.wounds.length ? body.head.wounds.join(' · ') : '骨骼完好无创口'}
        </p>
        <div className="flex items-center justify-between border-t border-hairline pt-1">
          <p className="mr-2 truncate text-xs text-parchment">
            <span className="text-gold">配备头盔:</span> {gear.head ? `${gear.head.name} (${gear.head.bonusText || '防护要害'})` : '未佩戴头盔 (要害暴露)'}
          </p>
          {gear.head && onUnequip && (
            <button
              type="button"
              onClick={() => onUnequip('head')}
              className="shrink-0 border border-rubric/60 bg-rubric-deep/25 px-2 py-0.5 text-[10.5px] text-rubric-bright transition-colors hover:bg-rubric-deep/50 hover:text-parchment"
              title="卸下头盔并收存到当前可用地点"
            >
              卸下
            </button>
          )}
        </div>
      </div>
    );
  }

  if (slotKey === 'torso') {
    return (
      <div className="flex flex-col gap-1.5 text-xs">
        <div className="flex items-center justify-between font-bold text-gold-bright">
          <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" />胸膛与躯干 (致命要害)</span>
          <span className="text-rubric-bright">伤情: 【{getWoundLabel(body.torso.level)}】</span>
        </div>
        <p className="text-xs text-parchment-dim">
          创痕记录: {body.torso.wounds.length ? body.torso.wounds.join(' · ') : '胸肋与脏腑完好'}
        </p>
        <div className="flex items-center justify-between border-t border-hairline pt-1">
          <p className="mr-2 truncate text-xs text-parchment">
            <span className="text-gold">当前穿着:</span> <strong className="text-gold-bright">{gear.torso.name}</strong> ({gear.torso.condition || '完好'})
          </p>
          {gear.torso && gear.torso.name !== '贴身亚麻衫' && onUnequip && (
            <button
              type="button"
              onClick={() => onUnequip('torso')}
              className="shrink-0 border border-rubric/60 bg-rubric-deep/25 px-2 py-0.5 text-[10.5px] text-rubric-bright transition-colors hover:bg-rubric-deep/50 hover:text-parchment"
              title="换下当前衣甲并收存到当前可用地点"
            >
              卸下
            </button>
          )}
        </div>
      </div>
    );
  }

  if (slotKey === 'mainhand') {
    return (
      <div className="flex flex-col gap-1.5 text-xs">
        <div className="flex items-center justify-between font-bold text-gold-bright">
          <span className="flex items-center gap-1"><Swords className="w-3.5 h-3.5" />主手与佩剑及双臂</span>
          <span className="text-gold">臂力: 【{getWoundLabel(body.arms.level)}】</span>
        </div>
        <div className="flex items-center justify-between">
          <p className="mr-2 truncate text-xs text-parchment">
            当前武器: <strong className="text-gold-bright">{gear.mainhand.name}</strong> ({gear.mainhand.bonusText})
          </p>
          {gear.mainhand && gear.mainhand.name !== '徒手空拳' && onUnequip && (
            <button
              type="button"
              onClick={() => onUnequip('mainhand')}
              className="shrink-0 border border-rubric/60 bg-rubric-deep/25 px-2 py-0.5 text-[10.5px] text-rubric-bright transition-colors hover:bg-rubric-deep/50 hover:text-parchment"
              title="收起佩剑并归入随身物品"
            >
              卸下
            </button>
          )}
        </div>
        <p className="text-[11px] text-parchment-dim">{gear.mainhand.description}</p>
      </div>
    );
  }

  if (slotKey === 'offhand') {
    return (
      <div className="flex flex-col gap-1.5 text-xs">
        <div className="flex items-center justify-between font-bold text-gold-bright">
          <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" />左手副手与防御大盾</span>
        </div>
        <div className="flex items-center justify-between">
          <p className="mr-2 truncate text-xs text-parchment">
            {gear.offhand ? `${gear.offhand.name} (${gear.offhand.condition || '完好'}) · ${gear.offhand.bonusText || '格挡偏斜'}` : '副手无装备 (双手持握或轻装)'}
          </p>
          {gear.offhand && onUnequip && (
            <button
              type="button"
              onClick={() => onUnequip('offhand')}
              className="shrink-0 border border-rubric/60 bg-rubric-deep/25 px-2 py-0.5 text-[10.5px] text-rubric-bright transition-colors hover:bg-rubric-deep/50 hover:text-parchment"
              title="卸下副手装备并收存到当前可用地点"
            >
              卸下
            </button>
          )}
        </div>
      </div>
    );
  }

  if (slotKey === 'legs') {
    return (
      <div className="flex flex-col gap-1.5 text-xs">
        <div className="flex items-center justify-between font-bold text-gold-bright">
          <span className="flex items-center gap-1"><Footprints className="w-3.5 h-3.5" />双腿下肢与足部穿着</span>
          <span className="text-gold">机动: 【{getWoundLabel(body.legs.level)}】</span>
        </div>
        <p className="text-xs text-parchment-dim">
          创痕记录: {body.legs.wounds.length ? body.legs.wounds.join(' · ') : '下肢稳健敏捷'}
        </p>
        <div className="flex items-center justify-between border-t border-hairline pt-1">
          <p className="mr-2 truncate text-xs text-parchment">
            <span className="text-gold">足部:</span> {gear.legs ? gear.legs.name : '精工熟皮长靴'}
          </p>
          {gear.legs && onUnequip && (
            <button
              type="button"
              onClick={() => onUnequip('legs')}
              className="shrink-0 border border-rubric/60 bg-rubric-deep/25 px-2 py-0.5 text-[10.5px] text-rubric-bright transition-colors hover:bg-rubric-deep/50 hover:text-parchment"
              title="换下足部装备并收存到当前可用地点"
            >
              卸下
            </button>
          )}
        </div>
      </div>
    );
  }

  if (slotKey === 'companion') {
    return (
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex items-center justify-between font-bold text-gold-bright">
          <span className="flex items-center gap-1"><PawPrint className="w-3.5 h-3.5" />通灵伴兽 / 战兽</span>
        </div>
        {gear.companion ? (
          <div>
            <p className="text-xs font-semibold text-emerald-700">{gear.companion.name} ({gear.companion.bonus})</p>
            <p className="text-[11px] text-parchment-dim">{gear.companion.description}</p>
          </div>
        ) : (
          <p className="text-xs text-parchment-dim">暂无伴兽</p>
        )}
      </div>
    );
  }

  if (slotKey.startsWith('item_')) {
    const itemId = slotKey.split('__').pop() || slotKey.replace('item_', '');
    const item = knownItems.find((entry) => entry.id === itemId);
    if (item) {
      return (
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex items-center justify-between font-bold text-gold-bright">
            <span className="flex items-center gap-1"><InventoryCategoryIcon item={item} />{item.name}</span>
            <span className="font-mono text-[11px] text-gold">数量: x{item.quantity}</span>
          </div>
          <p className="text-xs text-parchment">{item.description}</p>
          <p className="border-t border-hairline pt-1 text-[11px] text-parchment-dim">
            类别: <span className="text-gold-bright">{item.category}</span>
          </p>
          {getEquipmentWearNotice(item.gearData || item) && (
            <p className="border border-gold-deep/50 bg-gold-deep/10 px-2 py-1.5 text-[11px] leading-relaxed text-gold-bright/80">
              {getEquipmentWearNotice(item.gearData || item)}
            </p>
          )}
        </div>
      );
    }
  }

  return null;
}

// 辅助函数
function getWoundLabel(level: WoundLevel): string {
  const map: Record<WoundLevel, string> = {
    intact: '完好',
    minor: '轻创',
    heavy: '重创',
    critical: '残废致命',
  };
  return map[level] || '完好';
}

// CK3 风格能力单元格
function CompactStatCell({ label, val, icon }: { label: string; val: number; icon: GameIconId }) {
  const rank = getCk3SkillRank(val);
  const valueColor = val >= 25
    ? 'text-rubric'
    : val >= 20
      ? 'text-emerald-700'
      : val >= 16
        ? 'text-emerald-700'
        : val <= 4
          ? 'text-rubric-bright'
          : 'text-gold-bright';

  return (
    <div
      className="flex flex-col items-center justify-center border border-hairline bg-ink-2/70 px-0.5 py-1 transition-colors hover:border-gold-deep"
      title={`${label}：${rank}`}
    >
      <GameIcon icon={icon} className="w-12 h-12 shrink-0 drop-shadow-md" />
      <span className={`font-display font-bold text-xs leading-none -mt-1 ${valueColor}`}>{val}</span>
    </div>
  );
}

function InventoryCategoryIcon({ item }: { item: InventoryItem }) {
  const gameIcon = getInventoryIconId(item.category, item.name);
  if (gameIcon) {
    return <GameIcon icon={gameIcon} className="w-5 h-5 shrink-0 drop-shadow" />;
  }

  if (item.category === '药草') return <Leaf className="w-3.5 h-3.5 text-emerald-700 shrink-0" />;
  if (item.category === '毒物') return <FlaskConical className="w-3.5 h-3.5 text-rubric-bright shrink-0" />;
  if (item.category === '文书' || item.category === '信物') return <ScrollText className="w-3.5 h-3.5 text-gold shrink-0" />;
  return <Package className="w-3.5 h-3.5 text-parchment-dim shrink-0" />;
}
