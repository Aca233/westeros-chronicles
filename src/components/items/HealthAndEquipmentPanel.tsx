import React, { useMemo, useState } from 'react';
import {
  Biohazard,
  Droplets,
  HeartPulse,
  Shield,
  Skull,
} from 'lucide-react';
import Model, { type IExerciseData } from 'react-body-highlighter';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import {
  formatTraitDescription,
  formatTraitModifiers,
  formatTraitRuleEffects,
  resolveCharacterTraits,
  type CharacterTraitDefinition,
} from '../../data/characterTraits';
import type { CharacterDossier } from '../../features/characters/characterDossier';
import type { EquipmentGroup, EquipmentPosition } from '../../features/items/types';
import { useThemeMode } from '../../hooks/useThemeMode';
import type { BodyZoneKey, WoundLevel } from '../../types/game';
import { GameIcon } from '../GameIcon';
import { EquipmentPanel } from './EquipmentPanel';
import { ItemImage } from './ItemImage';

export interface HealthAndEquipmentPanelProps {
  dossier: CharacterDossier;
  embedded?: boolean;
}

const WOUND_LEVEL_LABELS: Record<WoundLevel, string> = {
  intact: '完好',
  minor: '轻创',
  heavy: '重创',
  critical: '危重',
};

const NPC_GROUP_ORDER: { group: EquipmentGroup; label: string }[] = [
  { group: 'head', label: '头部' },
  { group: 'torso', label: '躯干' },
  { group: 'mainhand', label: '主手' },
  { group: 'offhand', label: '副手' },
  { group: 'legs', label: '双腿' },
  { group: 'accessories', label: '佩饰' },
];

const TORSO_LAYERS = [
  { layer: 'garment' as const, label: '服装' },
  { layer: 'armor' as const, label: '护甲' },
  { layer: 'outerwear' as const, label: '外披' },
];

const LEG_LAYERS = [
  { layer: 'legwear' as const, label: '腿部' },
  { layer: 'footwear' as const, label: '足部' },
];

interface ReadonlyEquipmentItem {
  instanceId: string;
  definitionId: string;
  relation: '当前穿戴';
  equippedPosition?: EquipmentPosition;
  source: string;
}

interface ReadonlyEquipmentEntry {
  item: ReadonlyEquipmentItem;
  definition: ReturnType<typeof ITEM_CATALOG.get>;
}

function isHealthCategoryTrait(trait: CharacterTraitDefinition): boolean {
  if (trait.category === 'health') return true;
  const id = trait.id.toLowerCase();
  return (
    id.startsWith('wounded') ||
    id.startsWith('scarred') ||
    id.startsWith('maimed') ||
    id.startsWith('one_') ||
    id.startsWith('blind') ||
    id.startsWith('crippled') ||
    id.startsWith('infirm') ||
    id.startsWith('incapable') ||
    id.startsWith('ill') ||
    id.startsWith('disfigured') ||
    id.startsWith('clubfooted') ||
    id.startsWith('dwarf') ||
    id.startsWith('giant') ||
    id.startsWith('hunchbacked')
  );
}

export const HealthAndEquipmentPanel: React.FC<HealthAndEquipmentPanelProps> = ({
  dossier,
  embedded = false,
}) => {
  const theme = useThemeMode();
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const [activeHealthTraitId, setActiveHealthTraitId] = useState<string | null>(null);

  // 解析人物长期健康特质（伤残、长期病痛、身体状态）
  const healthTraits = useMemo(() => {
    const allTraits = resolveCharacterTraits(
      dossier.traitIds ?? [],
      dossier.legacyTraits ?? [],
    );
    return allTraits.filter(isHealthCategoryTrait);
  }, [dossier.traitIds, dossier.legacyTraits]);

  const activeHealthTrait = useMemo(
    () => healthTraits.find((t) => t.id === activeHealthTraitId) ?? null,
    [healthTraits, activeHealthTraitId],
  );

  // 四个身体部位的创伤等级
  const woundLevels: Record<BodyZoneKey, WoundLevel> = useMemo(() => {
    return {
      head: dossier.woundLevels.head ?? 'intact',
      torso: dossier.woundLevels.torso ?? 'intact',
      arms: dossier.woundLevels.arms ?? 'intact',
      legs: dossier.woundLevels.legs ?? 'intact',
    };
  }, [dossier.woundLevels]);

  // 人体模型着色与高亮
  const bodyFill = theme === 'night' ? '#2e2519' : '#cdb889';
  const bodyShadow = hoveredZone
    ? 'drop-shadow(0 0 4px rgba(234,201,126,0.8))'
    : theme === 'night'
      ? 'drop-shadow(0 2px 3px rgba(0,0,0,0.75))'
      : 'drop-shadow(0 2px 3px rgba(74,58,32,0.32))';

  const bodyHighlighterData: IExerciseData[] = useMemo(() => {
    const data: IExerciseData[] = [];
    const getFreq = (level: WoundLevel) => {
      if (level === 'critical') return 3;
      if (level === 'heavy') return 2;
      if (level === 'minor') return 1;
      return 0;
    };

    if (woundLevels.head !== 'intact') {
      data.push({ name: '头部伤情', muscles: ['head', 'neck'], frequency: getFreq(woundLevels.head) });
    }
    if (woundLevels.torso !== 'intact') {
      data.push({ name: '躯干伤情', muscles: ['chest', 'abs', 'obliques'], frequency: getFreq(woundLevels.torso) });
    }
    if (woundLevels.arms !== 'intact') {
      data.push({ name: '双臂伤情', muscles: ['biceps', 'triceps', 'forearm', 'front-deltoids'], frequency: getFreq(woundLevels.arms) });
    }
    if (woundLevels.legs !== 'intact') {
      data.push({ name: '下肢伤情', muscles: ['quadriceps', 'abductors', 'calves', 'knees'], frequency: getFreq(woundLevels.legs) });
    }

    if (hoveredZone === 'head') {
      data.push({ name: '头部选中', muscles: ['head', 'neck'], frequency: 4 });
    } else if (hoveredZone === 'torso') {
      data.push({ name: '躯干选中', muscles: ['chest', 'abs', 'obliques'], frequency: 4 });
    } else if (hoveredZone === 'arms' || hoveredZone === 'mainhand' || hoveredZone === 'offhand') {
      data.push({ name: '双臂选中', muscles: ['biceps', 'triceps', 'forearm', 'front-deltoids'], frequency: 4 });
    } else if (hoveredZone === 'legs') {
      data.push({ name: '下肢选中', muscles: ['quadriceps', 'abductors', 'calves', 'knees'], frequency: 4 });
    }
    return data;
  }, [woundLevels, hoveredZone]);

  // 急性身体状态
  const isPlayer = dossier.kind === 'player';
  const playerBody = isPlayer ? dossier.player.body : null;
  const isBleeding = Boolean(playerBody?.isBleeding);
  const isPoisoned = Boolean(playerBody?.isPoisoned);
  const isInfected = Boolean(playerBody?.isInfected);

  // 玩家与 NPC 共用世界选择器已经判定的“实际穿戴”关系；此处只补显示定义。
  const npcEquippedItems = useMemo(() => {
    if (dossier.kind !== 'npc') return [];
    const ordinaryById = new Map(dossier.character.items.map((item) => [item.instanceId, item]));
    return dossier.assetGroups.equipment.flatMap((asset): ReadonlyEquipmentEntry[] => {
      const isWorldItem = asset.id.startsWith('world-item:');
      const instanceId = asset.id.slice(isWorldItem ? 'world-item:'.length : 'item:'.length);
      const ordinary = ordinaryById.get(instanceId);
      const definitionId = ordinary?.definitionId ?? asset.definitionId;
      const definition = definitionId ? ITEM_CATALOG.get(definitionId) : undefined;
      if (!definitionId || !definition) return [];
      return [{
        item: {
          instanceId,
          definitionId,
          relation: '当前穿戴',
          ...(asset.equippedPosition ? { equippedPosition: { ...asset.equippedPosition } } : {}),
          source: ordinary?.source ?? 'world_artifact',
        },
        definition,
      }];
    });
  }, [dossier]);

  const overallStatusText = useMemo(() => {
    if (!dossier.alive) return '已阵亡';
    if (isPlayer && dossier.player.overallStatus) return dossier.player.overallStatus;
    const hasCritical = Object.values(woundLevels).some((l) => l === 'critical');
    if (hasCritical) return '生命垂危';
    const hasHeavy = Object.values(woundLevels).some((l) => l === 'heavy');
    if (hasHeavy) return '负有重创';
    const hasMinor = Object.values(woundLevels).some((l) => l === 'minor') || dossier.wounds.length > 0;
    if (hasMinor) return '轻度负伤';
    return '状态良好';
  }, [dossier.alive, isPlayer, dossier, woundLevels]);

  const zoneCards = [
    { key: 'head' as const, label: '头部', level: woundLevels.head, wounds: playerBody?.head.wounds ?? (woundLevels.head !== 'intact' ? dossier.wounds : []) },
    { key: 'torso' as const, label: '躯干', level: woundLevels.torso, wounds: playerBody?.torso.wounds ?? (woundLevels.torso !== 'intact' ? dossier.wounds : []) },
    { key: 'arms' as const, label: '双臂与双手', level: woundLevels.arms, wounds: playerBody?.arms.wounds ?? (woundLevels.arms !== 'intact' ? dossier.wounds : []) },
    { key: 'legs' as const, label: '双腿与足部', level: woundLevels.legs, wounds: playerBody?.legs.wounds ?? (woundLevels.legs !== 'intact' ? dossier.wounds : []) },
  ];

  return (
    <div
      className={`flex flex-col gap-4 font-serif text-parchment ${
        embedded ? 'p-1' : 'panel-iron p-4'
      }`}
      data-health-and-equipment-panel
      data-character-health
      data-npc-health={dossier.kind === 'npc' ? true : undefined}
      data-npc-equipment-state={dossier.kind === 'npc' ? true : undefined}
    >
      {/* 顶部标题与健康标志 */}
      <div className="flex items-center justify-between gap-2 border-b border-hairline/80 pb-2">
        <div>
          <h3 className="font-serif text-sm font-bold tracking-wide text-gold-bright">健康与装备</h3>
          <p className="font-serif text-[10.5px] text-parchment-dim">
            {isPlayer ? '当前控制领主身体健康与实际穿戴' : '人物身体创伤、长期病残与当前实际穿戴（只读）'}
          </p>
        </div>
        <HeartPulse className="h-4 w-4 text-gold-deep" />
      </div>

      {/* 死亡告示 */}
      {!dossier.alive && (
        <div className="flex items-center gap-2 border-l-4 border-rubric bg-rubric/10 px-3 py-2 text-xs text-rubric-bright">
          <Skull className="h-4 w-4 shrink-0 text-rubric" />
          <span>此人物已故{dossier.deathReason ? `：${dossier.deathReason}` : ''}</span>
        </div>
      )}

      {/* 急性状态 */}
      {(isBleeding || isPoisoned || isInfected) && (
        <div className="flex flex-wrap gap-2 border border-rubric/60 bg-ink-3/70 p-2 text-xs">
          {isBleeding && (
            <span className="flex animate-pulse items-center gap-1 font-bold text-rubric-bright">
              <Droplets className="h-3.5 w-3.5" /> 持续大出血
            </span>
          )}
          {isPoisoned && (
            <span className="flex animate-pulse items-center gap-1 font-bold text-rubric">
              <Skull className="h-3.5 w-3.5" /> 身中剧毒
            </span>
          )}
          {isInfected && (
            <span className="flex items-center gap-1 font-bold text-gold-bright">
              <Biohazard className="h-3.5 w-3.5" /> 伤口发炎
            </span>
          )}
        </div>
      )}

      {/* 人体创伤模型与四个区域伤情卡片 */}
      <section className="space-y-2" data-body-trauma-section>
        <div className="flex items-center justify-between">
          <span className="eyebrow">身体创伤与伤势</span>
          <span className="font-mono text-[10px] text-parchment-faint">4 个身体区域</span>
        </div>

        <div className="grid gap-2 border border-hairline bg-gradient-to-b from-ink-2 via-ink-3 to-ink p-3 shadow-inner sm:grid-cols-[minmax(150px,0.75fr)_minmax(180px,1fr)]">
          {/* 左侧人体高亮 */}
          <div className="relative min-h-[280px] overflow-hidden border border-hairline bg-ink/40">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#c9a45c_1px,transparent_1px)] [background-size:12px_12px]" />
            <div className={`body-model absolute inset-0 flex items-center justify-center ${hoveredZone === 'mainhand' ? 'body-model--mainhand' : hoveredZone === 'offhand' ? 'body-model--offhand' : ''}`}>
              <Model
                type="anterior"
                bodyColor={bodyFill}
                highlightedColors={['#d97706', '#b4432f', '#d4593f', '#eac97e']}
                data={bodyHighlighterData}
                style={{ width: '100%', height: '100%', maxHeight: '270px', maxWidth: '165px' }}
                svgStyle={{ filter: bodyShadow }}
              />
            </div>
          </div>

          {/* 右侧四个区域状态卡片 */}
          <div className="grid content-start grid-cols-2 gap-1.5">
            {zoneCards.map(({ key, label, level, wounds }) => {
              const isHovered = hoveredZone === key;
              const hasWounds = wounds && wounds.length > 0;
              const woundSummary = hasWounds ? wounds.join(' · ') : level !== 'intact' ? '已受创' : '未记录创伤';
              return (
                <div
                  key={key}
                  data-body-zone={key}
                  onMouseEnter={() => setHoveredZone(key)}
                  onMouseLeave={() => setHoveredZone(null)}
                  className={`border px-2.5 py-2 text-left transition-colors ${
                    isHovered ? 'border-gold bg-gold-deep/15' : 'border-hairline bg-ink-2/60 hover:border-gold-deep/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <strong className="font-serif text-[11.5px] text-parchment">{label}</strong>
                    <span
                      className={`font-mono text-[10px] font-semibold ${
                        level === 'intact' ? 'text-gold-dim' : 'text-rubric'
                      }`}
                    >
                      {WOUND_LEVEL_LABELS[level]}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 font-serif text-[10px] leading-relaxed text-parchment-dim">
                    {woundSummary}
                  </p>
                </div>
              );
            })}

            {/* 总体状态卡 */}
            <div className="col-span-2 mt-1 flex items-center justify-between border border-hairline bg-ink-3/50 px-3 py-2">
              <span className="eyebrow !text-[9px]">总体状态</span>
              <strong className="font-serif text-[12px] text-gold-bright">{overallStatusText}</strong>
            </div>
          </div>
        </div>
      </section>

      {/* 长期健康特质、残疾与疤痕 */}
      <section className="space-y-2 border-t border-hairline/70 pt-3" data-health-traits-section>
        <div className="flex items-center justify-between">
          <span className="eyebrow">长期身体状态与特质</span>
          <span className="font-mono text-[10px] text-parchment-faint">
            {healthTraits.length > 0 ? `${healthTraits.length} 项记录` : '无特殊病残'}
          </span>
        </div>

        {healthTraits.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2" aria-label="长期健康特质列表">
              {healthTraits.map((trait) => {
                const isSelected = activeHealthTraitId === trait.id;
                const desc = formatTraitDescription(trait.description, dossier.name);
                return (
                  <button
                    key={trait.id}
                    type="button"
                    onClick={() => setActiveHealthTraitId(isSelected ? null : trait.id)}
                    title={`${trait.name}：${desc}`}
                    aria-pressed={isSelected}
                    className={`flex items-center gap-1.5 border px-2.5 py-1 text-left transition-colors ${
                      isSelected
                        ? 'border-gold bg-gold-deep/20 shadow-[inset_0_0_10px_rgba(201,164,92,0.15)]'
                        : 'border-hairline bg-ink-2/60 hover:border-gold-deep hover:bg-ink-2'
                    }`}
                  >
                    <GameIcon icon={trait.icon} className="h-6 w-6 shrink-0" />
                    <span
                      className={`font-serif text-[11px] font-semibold ${
                        isSelected ? 'text-gold-bright' : 'text-parchment'
                      }`}
                    >
                      {trait.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {activeHealthTrait && (
              <div className="border border-hairline-bright bg-ink-3/60 p-3 text-[11px] leading-relaxed">
                <div className="flex items-center justify-between gap-2 border-b border-hairline pb-1.5">
                  <strong className="text-gold-bright">{activeHealthTrait.name}</strong>
                  <span className="text-[10px] text-parchment-faint">长期健康特质</span>
                </div>
                <p className="mt-1.5 text-parchment-dim">
                  {formatTraitDescription(activeHealthTrait.description, dossier.name)}
                </p>
                {(formatTraitModifiers(activeHealthTrait.modifiers) ||
                  formatTraitRuleEffects(activeHealthTrait.rules).length > 0) && (
                  <p className="mt-1.5 font-mono text-[10px] text-gold">
                    {[
                      formatTraitModifiers(activeHealthTrait.modifiers),
                      ...formatTraitRuleEffects(activeHealthTrait.rules),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="border border-hairline bg-ink-3/30 px-3 py-2 text-center text-[10.5px] text-parchment-faint">
            未记录长期疾病、肢体残缺或严重疤痕
          </div>
        )}
      </section>

      {/* 实际穿戴装备区 */}
      <section className="space-y-2 border-t border-hairline/70 pt-3" data-actual-equipment-section>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="eyebrow">实际穿戴</span>
            <Shield className="h-3.5 w-3.5 text-gold-deep" />
          </div>
          <span className="font-serif text-[10px] text-parchment-faint">
            {isPlayer ? '支持槽位更换与延迟排队' : '只读显示'}
          </span>
        </div>

        {isPlayer ? (
          /* 玩家：交互式 EquipmentPanel */
          <EquipmentPanel
            body={dossier.player.body}
            focusedGroup={hoveredZone}
            onGroupFocus={(group) => setHoveredZone(group)}
          />
        ) : (
          /* NPC：同一套视觉规制的只读 6 组展示 */
          <NpcUnifiedEquipmentGrid
            items={npcEquippedItems}
            focusedGroup={hoveredZone}
            onGroupHover={(group) => setHoveredZone(group)}
          />
        )}
      </section>
    </div>
  );
};

function NpcUnifiedEquipmentGrid({
  items,
  focusedGroup,
  onGroupHover,
}: {
  items: ReadonlyEquipmentEntry[];
  focusedGroup: string | null;
  onGroupHover: (group: EquipmentGroup | null) => void;
}) {
  const [activeItemDetailId, setActiveItemDetailId] = useState<string | null>(null);

  const getItemAtPosition = (predicate: (pos: EquipmentPosition | undefined) => boolean) => {
    return items.find(({ item }) => predicate(item.equippedPosition));
  };

  const selectedItemDetail = useMemo(() => {
    if (!activeItemDetailId) return null;
    return items.find(({ item }) => item.instanceId === activeItemDetailId) ?? null;
  }, [items, activeItemDetailId]);

  return (
    <div className="space-y-3" data-npc-equipment-unified>
      <div className="grid grid-cols-2 gap-2.5" data-hand-pair>
        {NPC_GROUP_ORDER.map(({ group, label }) => {
          const isFocused = focusedGroup === group;
          return (
            <div
              key={group}
              data-equipment-group={group}
              data-hand-side={group === 'mainhand' || group === 'offhand' ? group : undefined}
              onMouseEnter={() => onGroupHover(group)}
              onMouseLeave={() => onGroupHover(null)}
              className={`border p-2.5 transition-colors ${
                isFocused ? 'border-gold bg-gold-deep/15' : 'border-hairline bg-ink-2/65 hover:border-gold-deep/50'
              }`}
            >
              <div className="mb-2 flex items-center justify-between border-b border-hairline/60 pb-1">
                <span className="font-serif text-[11px] font-bold text-gold-bright">{label}</span>
              </div>

              {/* 头部 */}
              {group === 'head' && (
                <SingleSlotSlotView
                  slotLabel="头盔/帽子"
                  entry={getItemAtPosition((pos) => pos?.group === 'head')}
                  onSelect={(id) => setActiveItemDetailId(id === activeItemDetailId ? null : id)}
                  isSelected={activeItemDetailId === getItemAtPosition((pos) => pos?.group === 'head')?.item.instanceId}
                />
              )}

              {/* 躯干 3 层 */}
              {group === 'torso' && (
                <div className="space-y-1.5">
                  {TORSO_LAYERS.map(({ layer, label: layerLabel }) => {
                    const entry = getItemAtPosition((pos) => pos?.group === 'torso' && pos.layer === layer);
                    return (
                      <SingleSlotSlotView
                        key={layer}
                        slotLabel={layerLabel}
                        entry={entry}
                        onSelect={(id) => setActiveItemDetailId(id === activeItemDetailId ? null : id)}
                        isSelected={Boolean(entry && activeItemDetailId === entry.item.instanceId)}
                      />
                    );
                  })}
                </div>
              )}

              {/* 主手 */}
              {group === 'mainhand' && (
                <SingleSlotSlotView
                  slotLabel="主手武器/持握物"
                  entry={getItemAtPosition((pos) => pos?.group === 'mainhand')}
                  onSelect={(id) => setActiveItemDetailId(id === activeItemDetailId ? null : id)}
                  isSelected={activeItemDetailId === getItemAtPosition((pos) => pos?.group === 'mainhand')?.item.instanceId}
                />
              )}

              {/* 副手 */}
              {group === 'offhand' && (
                <SingleSlotSlotView
                  slotLabel="副手/盾牌/持握物"
                  entry={getItemAtPosition((pos) => pos?.group === 'offhand')}
                  onSelect={(id) => setActiveItemDetailId(id === activeItemDetailId ? null : id)}
                  isSelected={activeItemDetailId === getItemAtPosition((pos) => pos?.group === 'offhand')?.item.instanceId}
                />
              )}

              {/* 双腿 2 层 */}
              {group === 'legs' && (
                <div className="space-y-1.5">
                  {LEG_LAYERS.map(({ layer, label: layerLabel }) => {
                    const entry = getItemAtPosition((pos) => pos?.group === 'legs' && pos.layer === layer);
                    return (
                      <SingleSlotSlotView
                        key={layer}
                        slotLabel={layerLabel}
                        entry={entry}
                        onSelect={(id) => setActiveItemDetailId(id === activeItemDetailId ? null : id)}
                        isSelected={Boolean(entry && activeItemDetailId === entry.item.instanceId)}
                      />
                    );
                  })}
                </div>
              )}

              {/* 佩饰 3 槽 */}
              {group === 'accessories' && (
                <div className="space-y-1.5">
                  {[0, 1, 2].map((idx) => {
                    const entry = getItemAtPosition((pos) => pos?.group === 'accessories' && pos.index === idx);
                    return (
                      <SingleSlotSlotView
                        key={idx}
                        slotLabel={`佩饰 ${idx + 1}`}
                        entry={entry}
                        onSelect={(id) => setActiveItemDetailId(id === activeItemDetailId ? null : id)}
                        isSelected={Boolean(entry && activeItemDetailId === entry.item.instanceId)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <div className="border border-hairline bg-ink-3/30 px-3 py-2 text-center text-[10.5px] text-parchment-faint">
          当前没有记录此人实际穿戴的装备。名下物品、据点储藏与家族保管物不会显示在这里。
        </div>
      )}

      {/* 选中的装备详情抽屉/卡片 */}
      {selectedItemDetail?.definition && (
        <div className="border border-hairline-bright bg-ink-3/70 p-3 text-[11px] leading-relaxed">
          <div className="flex items-center justify-between border-b border-hairline pb-1.5">
            <div className="flex items-center gap-2">
              <strong className="text-gold-bright">{selectedItemDetail.definition.name}</strong>
              <span className="border border-gold-deep/60 px-1 py-0.2 text-[9px] text-gold-dim">
                {selectedItemDetail.definition.subcategory}
              </span>
            </div>
            <span className="text-[10px] text-parchment-faint">
              {selectedItemDetail.item.relation}
            </span>
          </div>
          <p className="mt-2 text-parchment-dim">{selectedItemDetail.definition.description}</p>
          {selectedItemDetail.definition.roleplayText && (
            <p className="mt-1.5 italic text-parchment-faint">“{selectedItemDetail.definition.roleplayText}”</p>
          )}
          {selectedItemDetail.definition.provenance?.origin && (
            <p className="mt-1 text-[10px] text-gold-dim">
              来源：{selectedItemDetail.definition.provenance.origin}
            </p>
          )}
        </div>
      )}

      <p className="border-l border-gold-deep/60 pl-3 font-serif text-[10px] leading-relaxed text-parchment-faint">
        实际穿戴只展示已明确占用装备槽位的衣物、护甲、兵刃与首饰；名下所有、本人保管、据点储藏和家族资产不会显示在这里。
      </p>
    </div>
  );
}

function SingleSlotSlotView({
  slotLabel,
  entry,
  onSelect,
  isSelected,
}: {
  slotLabel: string;
  entry?: ReadonlyEquipmentEntry;
  onSelect: (id: string) => void;
  isSelected: boolean;
}) {
  if (!entry?.definition) {
    return (
      <div className="flex items-center justify-between border border-hairline/40 bg-ink-3/25 px-2 py-1.5 text-[10px] text-parchment-faint">
        <span>{slotLabel}</span>
        <span className="italic">未装备</span>
      </div>
    );
  }

  const { item, definition } = entry;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.instanceId)}
      className={`flex w-full items-center gap-2 border px-2 py-1.5 text-left transition-colors ${
        isSelected
          ? 'border-gold bg-gold-deep/20 shadow-[inset_0_0_8px_rgba(201,164,92,0.12)]'
          : 'border-hairline bg-ink-3/60 hover:border-gold-deep/70 hover:bg-ink-2'
      }`}
    >
      <span className="h-8 w-8 shrink-0 border border-hairline bg-ink p-0.5">
        <ItemImage image={definition.image} alt={definition.name} className="h-full w-full" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <strong className="truncate font-serif text-[11px] text-parchment">{definition.name}</strong>
          <span className="shrink-0 text-[9px] text-gold-dim">{slotLabel}</span>
        </div>
      </div>
    </button>
  );
}
