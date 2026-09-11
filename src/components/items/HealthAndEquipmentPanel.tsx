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



  resolveCharacterTraits,
  type CharacterTraitDefinition,
} from '../../data/characterTraits';
import type { CharacterDossier } from '../../features/characters/characterDossier';
import type { CharacterId } from '../../domain/characterId';
import { type AnatomicalZoneKey, type CharacterInjury, type InjurySeverity } from '../../features/health/types';
import { ANATOMICAL_ZONE_LABELS, deriveHealthCapabilities } from '../../features/health/state';
import { visibleCharacterHealth } from '../../features/health/visibility';
import type { EquipmentGroup, EquipmentPosition } from '../../features/items/types';
import { useThemeMode } from '../../hooks/useThemeMode';
import { useGameStore } from '../../store/useGameStore';
import type { BodyZoneKey, WoundLevel } from '../../types/game';
import { GameIcon } from '../GameIcon';
import { CharacterTraitHoverCard } from '../character-window/CharacterTraitHoverCard';
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

const INJURY_KIND_LABELS: Record<CharacterInjury['kind'], string> = {
  cut_puncture: '割刺伤', blunt: '挫伤', fracture: '骨折', burn: '烧伤', disease: '疾病', poison: '中毒', disability: '永久残疾',
};
const RECOVERY_LABELS: Record<CharacterInjury['recovery']['stage'], string> = {
  acute: '急性期', stabilized: '已稳定', recovering: '恢复中', healed: '已恢复', permanent: '永久状态',
};
const SEVERITY_ORDER: Record<InjurySeverity, number> = { minor: 1, heavy: 2, critical: 3 };
function maxInjuryLevel(injuries: readonly CharacterInjury[]): WoundLevel {
  const active = injuries.filter((injury) => injury.recovery.stage !== 'healed');
  if (!active.length) return 'intact';
  const severity = active.reduce<InjurySeverity>((best, injury) => SEVERITY_ORDER[injury.severity] > SEVERITY_ORDER[best] ? injury.severity : best, 'minor');
  return severity;
}
type BodyDisplayRegionKey = 'head' | 'torso' | 'left_upper' | 'right_upper' | 'left_lower' | 'right_lower';

const BODY_DISPLAY_REGIONS: ReadonlyArray<{ key: BodyDisplayRegionKey; label: string; zones: readonly AnatomicalZoneKey[] }> = [
  { key: 'head', label: '头部', zones: ['head'] },
  { key: 'torso', label: '躯干', zones: ['chest', 'abdomen'] },
  { key: 'left_upper', label: '左臂', zones: ['left_arm', 'left_hand'] },
  { key: 'right_upper', label: '右臂', zones: ['right_arm', 'right_hand'] },
  { key: 'left_lower', label: '左腿', zones: ['left_leg', 'left_foot'] },
  { key: 'right_lower', label: '右腿', zones: ['right_leg', 'right_foot'] },
];

function coarseHighlightZone(zone: string | null): 'head' | 'torso' | 'arms' | 'legs' | null {
  if (!zone) return null;
  if (zone === 'head') return 'head';
  if (zone === 'chest' || zone === 'abdomen' || zone === 'torso') return 'torso';
  if (zone.includes('upper') || zone.includes('arm') || zone.includes('hand') || zone === 'mainhand' || zone === 'offhand') return 'arms';
  if (zone.includes('lower') || zone.includes('leg') || zone.includes('foot') || zone === 'legs') return 'legs';
  return null;
}

function bodyModelSelectionClass(zone: string | null): string {
  if (zone === 'mainhand') return 'body-model--right-upper';
  if (zone === 'offhand') return 'body-model--left-upper';
  if (zone === 'left_upper') return 'body-model--right-upper';
  if (zone === 'right_upper') return 'body-model--left-upper';
  if (zone === 'left_lower') return 'body-model--right-lower';
  if (zone === 'right_lower') return 'body-model--left-lower';
  return '';
}


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
  const { gameState, debugEnabled } = useGameStore();
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<BodyDisplayRegionKey>('head');
  const viewerId = (gameState.lord.canonicalCharacterId ?? `save:${gameState.worldCharacters?.runId ?? 'current'}:player`) as CharacterId;
  const detailedHealth = useMemo(
    () => visibleCharacterHealth(gameState.health, dossier.worldCharacterId, viewerId, { debug: debugEnabled }),
    [gameState.health, dossier.worldCharacterId, viewerId, debugEnabled],
  );
  const capabilities = useMemo(() => detailedHealth ? deriveHealthCapabilities(detailedHealth) : null, [detailedHealth]);


  // 解析人物长期健康特质（伤残、长期病痛、身体状态）
  const healthTraits = useMemo(() => {
    const allTraits = resolveCharacterTraits(
      dossier.traitIds ?? [],
      dossier.legacyTraits ?? [],
    );
    return allTraits.filter(isHealthCategoryTrait);
  }, [dossier.traitIds, dossier.legacyTraits]);


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

    if (!detailedHealth) {
      if (woundLevels.head !== 'intact') data.push({ name: '头部伤情', muscles: ['head', 'neck'], frequency: getFreq(woundLevels.head) });
      if (woundLevels.torso !== 'intact') data.push({ name: '躯干伤情', muscles: ['chest', 'abs', 'obliques'], frequency: getFreq(woundLevels.torso) });
      if (woundLevels.arms !== 'intact') data.push({ name: '双臂伤情', muscles: ['biceps', 'triceps', 'forearm', 'front-deltoids'], frequency: getFreq(woundLevels.arms) });
      if (woundLevels.legs !== 'intact') data.push({ name: '下肢伤情', muscles: ['quadriceps', 'abductors', 'calves', 'knees'], frequency: getFreq(woundLevels.legs) });
    } else {
      const active = detailedHealth.injuries.filter((injury) => injury.recovery.stage !== 'healed');
      const headLevel = maxInjuryLevel(active.filter((injury) => injury.zone === 'head'));
      const torsoLevel = maxInjuryLevel(active.filter((injury) => injury.zone === 'chest' || injury.zone === 'abdomen'));
      if (headLevel !== 'intact') data.push({ name: '头部伤情', muscles: ['head', 'neck'], frequency: getFreq(headLevel) });
      if (torsoLevel !== 'intact') data.push({ name: '躯干伤情', muscles: ['chest', 'abs', 'obliques'], frequency: getFreq(torsoLevel) });
    }

    const exactSelection = hoveredZone ?? selectedRegion;
    const coarse = coarseHighlightZone(exactSelection);
    if (coarse === 'head') {
      data.push({ name: '头部选中', muscles: ['head', 'neck'], frequency: 4 });
    } else if (coarse === 'torso') {
      data.push({ name: '躯干选中', muscles: ['chest', 'abs', 'obliques'], frequency: 4 });
    }
    return data;
  }, [detailedHealth, woundLevels, hoveredZone, selectedRegion]);

  // 急性身体状态以 CharacterHealthState 为权威；旧 body 仅作无详细状态时的兼容回退。
  const isPlayer = dossier.kind === 'player';
  const playerBody = isPlayer ? dossier.player.body : null;
  const visibleInjuries = detailedHealth?.injuries ?? [];
  const activeInjuries = visibleInjuries.filter((injury) => injury.recovery.stage !== 'healed');
  const isBleeding = detailedHealth
    ? activeInjuries.some((injury) => injury.bleeding > 0 && !injury.treatment.bleedingControlled)
    : Boolean(playerBody?.isBleeding);
  const isPoisoned = detailedHealth ? activeInjuries.some((injury) => injury.kind === 'poison') : Boolean(playerBody?.isPoisoned);
  const isInfected = detailedHealth ? activeInjuries.some((injury) => injury.infection === 'infected') : Boolean(playerBody?.isInfected);

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

  const playerEquipmentNamesByGroup = useMemo(() => {
    const groups = new Map<EquipmentGroup, string[]>();
    if (!isPlayer) return groups;
    for (const [instanceId, placement] of Object.entries(gameState.lord.items.placements)) {
      if (placement.type !== 'equipped') continue;
      const instance = gameState.lord.items.instances[instanceId];
      if (!instance) continue;
      const definition = ITEM_CATALOG.get(instance.definitionId);
      const name = instance.customName || definition?.name;
      if (!name) continue;
      const names = groups.get(placement.position.group) ?? [];
      names.push(name);
      groups.set(placement.position.group, names);
    }
    return groups;
  }, [gameState.lord.items, isPlayer]);

  const npcEquipmentNamesByGroup = useMemo(() => {
    const groups = new Map<EquipmentGroup, string[]>();
    for (const entry of npcEquippedItems) {
      const group = entry.item.equippedPosition?.group;
      const name = entry.definition?.name;
      if (!group || !name) continue;
      const names = groups.get(group) ?? [];
      names.push(name);
      groups.set(group, names);
    }
    return groups;
  }, [npcEquippedItems]);

  const dominantHand = detailedHealth?.dominantHand ?? 'right';
  const equipmentGroupsForRegion = (region: BodyDisplayRegionKey): EquipmentGroup[] => {
    if (region === 'head') return ['head'];
    if (region === 'torso') return ['torso'];
    if (region === 'left_upper') return [dominantHand === 'left' ? 'mainhand' : 'offhand'];
    if (region === 'right_upper') return [dominantHand === 'right' ? 'mainhand' : 'offhand'];
    return ['legs'];
  };

  const equipmentNamesForGroups = (groups: readonly EquipmentGroup[]) => {
    const source = isPlayer ? playerEquipmentNamesByGroup : npcEquipmentNamesByGroup;
    return [...new Set(groups.flatMap((group) => source.get(group) ?? []))];
  };

  const overallStatusText = useMemo(() => {
    if (detailedHealth && !detailedHealth.alive) return '已阵亡';
    if (!dossier.alive) return '已阵亡';
    if (isPlayer && dossier.player.overallStatus) return dossier.player.overallStatus;
    if (activeInjuries.some((injury) => injury.severity === 'critical')) return '生命垂危';
    if (activeInjuries.some((injury) => injury.severity === 'heavy')) return '负有重创';
    if (activeInjuries.length || dossier.wounds.length) return '轻度负伤';
    return '状态良好';
  }, [detailedHealth, dossier.alive, isPlayer, dossier, activeInjuries]);

  const regionCards = BODY_DISPLAY_REGIONS.map((region) => {
    const injuries = activeInjuries.filter((injury) => region.zones.includes(injury.zone as AnatomicalZoneKey));
    const equipmentGroups = equipmentGroupsForRegion(region.key);
    const equipmentNames = equipmentNamesForGroups(equipmentGroups);
    return { ...region, level: maxInjuryLevel(injuries), injuries, equipmentGroups, equipmentNames };
  });

  const migratedUnknownInjuries = activeInjuries.filter((injury) => injury.zone.startsWith('unknown_'));
  const draftTreatment = (injury: CharacterInjury) => {
    if (!isPlayer) return;
    window.dispatchEvent(new CustomEvent('agot:prefill-action', { detail: { text: `我准备处理【${ANATOMICAL_ZONE_LABELS[injury.zone]} · ${injury.cause}】（injuryId:${injury.id}）。请根据伤病类型、当前可访问医疗物资、治疗者能力和环境，选择合理的急救、固定或正式处理，并结算实际耗时；如果关键物资不足，不要替我购买或消耗不存在的物品。` } }));
  };

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

      {/* 身体与装备只保留一套部位层级：右侧单列，当前部位原地展开。 */}
      <section className="space-y-2" data-body-trauma-section data-body-equipment-unified>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="eyebrow">身体与装备</span>
            <p className="mt-0.5 font-serif text-[9.5px] text-parchment-faint">选择一个部位查看伤病和该处实际穿戴</p>
          </div>
          <div className="flex items-baseline gap-2 border-l border-hairline pl-2.5">
            <span className="font-serif text-[9px] text-parchment-faint">总体</span>
            <strong className="font-serif text-[11.5px] text-gold-bright">{overallStatusText}</strong>
          </div>
        </div>

        <div className="grid gap-2 border border-hairline bg-ink-3/35 p-2 sm:grid-cols-[minmax(120px,0.58fr)_minmax(0,1.42fr)]">
          <div className="relative min-h-[260px] overflow-hidden border border-hairline bg-ink/35">
            <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(#c9a45c_1px,transparent_1px)] [background-size:12px_12px]" />
            <div className={`body-model absolute inset-0 flex items-center justify-center ${bodyModelSelectionClass(hoveredZone ?? selectedRegion)}`}>
              <Model
                type="anterior"
                bodyColor={bodyFill}
                highlightedColors={['#d97706', '#b4432f', '#d4593f', '#eac97e']}
                data={bodyHighlighterData}
                style={{ width: '100%', height: '100%', maxHeight: '250px', maxWidth: '150px' }}
                svgStyle={{ filter: bodyShadow }}
              />
            </div>
          </div>

          <div className="overflow-hidden border border-hairline bg-ink-2/45">
            {regionCards.map(({ key, label, level, injuries, equipmentGroups, equipmentNames }) => {
              const selected = selectedRegion === key;
              const equipmentSummary = equipmentNames.length ? equipmentNames.join('、') : '未装备';
              const woundSummary = injuries.length
                ? injuries.map((injury) => `${INJURY_KIND_LABELS[injury.kind]} · ${injury.cause}`).join('；')
                : '无未愈伤病';
              return (
                <div
                  key={key}
                  data-body-region={key}
                  onMouseEnter={() => setHoveredZone(key)}
                  onMouseLeave={() => setHoveredZone(null)}
                  className={`border-b border-hairline/70 last:border-b-0 ${selected ? 'bg-gold-deep/10' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedRegion(key)}
                    className="grid w-full grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-parchment/[0.035] focus-visible:outline focus-visible:outline-1 focus-visible:outline-gold-deep"
                  >
                    <strong className={`font-serif text-[11.5px] ${selected ? 'text-gold-bright' : 'text-parchment'}`}>{label}</strong>
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-parchment-dim">
                        <Shield className="h-3 w-3 shrink-0 text-gold-deep" />
                        <span className="truncate">{equipmentSummary}</span>
                      </span>
                      {injuries.length > 0 && (
                        <span className="mt-0.5 block truncate font-serif text-[9px] text-rubric">{woundSummary}</span>
                      )}
                    </span>
                    <span className={`min-w-[34px] text-right font-mono text-[9.5px] font-semibold ${level === 'intact' ? 'text-gold-dim' : 'text-rubric'}`}>
                      {WOUND_LEVEL_LABELS[level]}
                    </span>
                  </button>

                  {selected && (
                    <div className="border-t border-hairline/60 bg-ink/20 px-2.5 pb-2.5 pt-2" data-selected-body-region-detail>
                      <div className="space-y-1.5" data-selected-region-injuries>
                        {injuries.length ? injuries.map((injury) => (
                          <div key={injury.id} className="border-l-2 border-rubric/70 bg-rubric/[0.035] py-1.5 pl-2 pr-1" data-injury-id={injury.id}>
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <strong className="font-serif text-[10.5px] text-parchment">{ANATOMICAL_ZONE_LABELS[injury.zone]} · {INJURY_KIND_LABELS[injury.kind]}</strong>
                              <span className="font-mono text-[8.5px] text-parchment-faint">{RECOVERY_LABELS[injury.recovery.stage]} · {Math.round(injury.recovery.progress)}%</span>
                            </div>
                            <p className="mt-0.5 text-[9.5px] leading-relaxed text-parchment-dim">{injury.cause}</p>
                            <p className="mt-0.5 font-mono text-[8.5px] text-parchment-faint">出血 {injury.bleeding}/3 · 疼痛 {injury.pain}/3 · {injury.infection === 'infected' ? '已感染' : injury.infection === 'risk' ? '感染风险' : '无感染'}</p>
                            {isPlayer && injury.recovery.stage !== 'permanent' && (
                              <button type="button" onClick={() => draftTreatment(injury)} className="item-action item-action--primary mt-1.5 !py-0.5">安排处理</button>
                            )}
                          </div>
                        )) : (
                          <p className="font-serif text-[9.5px] text-parchment-faint">该部位没有未愈伤病。</p>
                        )}
                      </div>

                      <div className="mt-2 border-t border-hairline/60 pt-2" data-selected-region-equipment>
                        {isPlayer ? (
                          <EquipmentPanel
                            body={dossier.player.body}
                            focusedGroup={hoveredZone}
                            onGroupFocus={(group) => setHoveredZone(group ? key : null)}
                            visibleGroups={equipmentGroups}
                            showStatusSummary={false}
                            showWoundBadge={false}
                            compact
                          />
                        ) : (
                          <NpcUnifiedEquipmentGrid
                            items={npcEquippedItems}
                            focusedGroup={hoveredZone}
                            onGroupHover={(group) => setHoveredZone(group ? key : null)}
                            visibleGroups={equipmentGroups}
                            showExplanation={false}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {migratedUnknownInjuries.length > 0 && (
          <div className="border-l-2 border-gold-deep/60 bg-ink-3/30 px-2.5 py-1.5 text-[9.5px] text-parchment-dim">旧档侧别未确定：{migratedUnknownInjuries.map((injury) => `${ANATOMICAL_ZONE_LABELS[injury.zone]} · ${injury.cause}`).join('；')}</div>
        )}

        {isPlayer && detailedHealth && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-hairline/70 bg-ink-3/25 px-2.5 py-1.5 font-serif text-[9.5px] text-parchment-faint" data-survival-needs>
            <span>饥饿 <strong className="font-mono text-parchment-dim">{Math.round(detailedHealth.survival.hunger)}</strong></span>
            <span>口渴 <strong className="font-mono text-parchment-dim">{Math.round(detailedHealth.survival.thirst)}</strong></span>
            <span>疲劳 <strong className="font-mono text-parchment-dim">{Math.round(detailedHealth.survival.fatigue)}</strong></span>
            {capabilities && <span className="min-w-0 flex-1 text-right" data-health-capabilities>握持 左 {capabilities.left_grip.score} / 右 {capabilities.right_grip.score} · 行走 {capabilities.walk.score} · 奔跑 {capabilities.run.score}</span>}
          </div>
        )}

        <div className="border-t border-hairline/70 pt-2" data-accessory-equipment-section>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-serif text-[10px] font-bold tracking-[0.12em] text-parchment-dim">佩饰与全身负担</span>
            <span className="font-serif text-[9px] text-parchment-faint">独立于肢体伤势</span>
          </div>
          {isPlayer ? (
            <EquipmentPanel
              body={dossier.player.body}
              focusedGroup={hoveredZone}
              onGroupFocus={(group) => setHoveredZone(group)}
              visibleGroups={['accessories']}
              showStatusSummary
              showWoundBadge={false}
              compact
            />
          ) : (
            <NpcUnifiedEquipmentGrid
              items={npcEquippedItems}
              focusedGroup={hoveredZone}
              onGroupHover={(group) => setHoveredZone(group)}
              visibleGroups={['accessories']}
            />
          )}
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
              {healthTraits.map((trait) => (
                <CharacterTraitHoverCard key={trait.id} trait={trait} characterName={dossier.name} className="h-9 w-9">
                  <GameIcon icon={trait.icon} className="h-9 w-9 shrink-0 transition-transform duration-150 group-hover:scale-110 group-focus-visible:scale-110" />
                </CharacterTraitHoverCard>
              ))}
            </div>
          </div>        ) : (
          <div className="border border-hairline bg-ink-3/30 px-3 py-2 text-center text-[10.5px] text-parchment-faint">
            未记录长期疾病、肢体残缺或严重疤痕
          </div>
        )}
      </section>


    </div>
  );
};

function NpcUnifiedEquipmentGrid({
  items,
  focusedGroup,
  onGroupHover,
  visibleGroups,
  showExplanation = true,
}: {
  items: ReadonlyEquipmentEntry[];
  focusedGroup: string | null;
  onGroupHover: (group: EquipmentGroup | null) => void;
  visibleGroups?: readonly EquipmentGroup[];
  showExplanation?: boolean;
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
        {NPC_GROUP_ORDER.filter(({ group }) => !visibleGroups || visibleGroups.includes(group)).map(({ group, label }) => {
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

      {showExplanation && <p className="border-l border-gold-deep/60 pl-3 font-serif text-[10px] leading-relaxed text-parchment-faint">
        实际穿戴只展示已明确占用装备槽位的衣物、护甲、兵刃与首饰；名下所有、本人保管、据点储藏和家族资产不会显示在这里。
      </p>}
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
