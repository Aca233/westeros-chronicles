import type { CharacterId } from '../../domain/characterId';
import type { LordAttributes } from '../../domain/character';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { aggregateEquippedItemEffects, getEquipmentBurden } from '../items/effects';
import { getItemDefinition } from '../items/catalog';
import { consumeItemInstance } from '../items/consumption';
import { validateItemSystem } from '../items/state';
import type { ItemCatalog, ItemSystemState } from '../items/types';
import { sameWorldLocation } from '../map/locationResolver';
import type { WorldLocationRef } from '../map/types';
import { advanceGameMoment, absoluteGameMinute, type ActionActivity, type GameMoment } from '../time/gameClock';
import { HEALTH_SIMULATION_CONFIG, type HealthSimulationConfig } from './config';
import { ANATOMICAL_ZONE_LABELS, deriveHealthCapabilities } from './state';
import type {
  AnatomicalZoneKey,
  CharacterHealthState,
  CharacterInjury,
  HealthHitCommand,
  HealthTreatmentCommand,
  InjurySeverity,
  SurvivalConsumeCommand,
  TreatmentKind,
} from './types';

export interface HealthSettlementContext {
  characterId: CharacterId;
  location: WorldLocationRef;
  items: ItemSystemState;
  attributes?: LordAttributes;
  catalog?: ItemCatalog;
  config?: HealthSimulationConfig;
  moment: GameMoment;
}

export interface HealthSettlementResult {
  health: CharacterHealthState;
  items: ItemSystemState;
  changes: string[];
  interrupted: boolean;
  interruptionReason?: string;
  elapsedMinutes: number;
}

interface ProtectionResult {
  value: number;
  instanceIds: string[];
  labels: string[];
}

const severityIndex: Record<InjurySeverity, number> = { minor: 1, heavy: 2, critical: 3 };
const severityLabels: Record<InjurySeverity, string> = { minor: '轻创', heavy: '重创', critical: '危重' };

function cloneHealth(state: CharacterHealthState): CharacterHealthState {
  return structuredClone(state);
}

function cloneItems(state: ItemSystemState): ItemSystemState {
  return structuredClone(state);
}

function clampNeed(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function healthZoneAliases(zone: AnatomicalZoneKey): string[] {
  if (zone === 'head') return ['head'];
  if (zone === 'chest' || zone === 'abdomen') return [zone, 'torso'];
  if (zone === 'left_arm' || zone === 'right_arm' || zone === 'left_hand' || zone === 'right_hand') return [zone, 'arms'];
  return [zone, 'legs'];
}

function protectionForHit(
  items: ItemSystemState,
  zone: AnatomicalZoneKey,
  damageTags: readonly string[],
  catalog: ItemCatalog,
): ProtectionResult {
  const aliases = new Set(healthZoneAliases(zone));
  const groups = new Map<string, Array<{ value: number; cap?: number; instanceId: string; label: string }>>();
  for (const instance of Object.values(items.instances)) {
    const placement = items.placements[instance.instanceId];
    if (placement?.type !== 'equipped' || instance.durability <= 0) continue;
    const definition = getItemDefinition(catalog, instance.definitionId);
    for (const effect of definition.effects) {
      if (effect.kind !== 'protection') continue;
      if (!effect.zones.some((covered) => aliases.has(covered))) continue;
      if (damageTags.length && !effect.damageTags.some((tag) => damageTags.includes(tag))) continue;
      const group = groups.get(effect.stackGroup) ?? [];
      group.push({ value: effect.value, cap: effect.cap, instanceId: instance.instanceId, label: instance.customName ?? definition.name });
      groups.set(effect.stackGroup, group);
    }
  }
  let value = 0;
  const instanceIds = new Set<string>();
  const labels = new Set<string>();
  for (const group of groups.values()) {
    const raw = group.reduce((sum, entry) => sum + entry.value, 0);
    const caps = group.map((entry) => entry.cap).filter((cap): cap is number => Number.isFinite(cap));
    const cap = caps.length ? Math.min(...caps.map(Math.abs)) : Number.POSITIVE_INFINITY;
    value += Math.max(-cap, Math.min(cap, raw));
    group.forEach((entry) => {
      instanceIds.add(entry.instanceId);
      labels.add(entry.label);
    });
  }
  return { value: Math.max(0, value), instanceIds: [...instanceIds], labels: [...labels] };
}

function mitigateSeverity(severity: InjurySeverity, protection: number): InjurySeverity | null {
  const remaining = severityIndex[severity] - Math.floor(Math.max(0, protection) / 3);
  if (remaining <= 0) return null;
  return remaining === 1 ? 'minor' : remaining === 2 ? 'heavy' : 'critical';
}

function baseBleeding(kind: HealthHitCommand['injuryKind'], severity: InjurySeverity): 0 | 1 | 2 | 3 {
  if (kind === 'blunt' || kind === 'burn') return 0;
  if (kind === 'fracture') return severity === 'critical' ? 1 : 0;
  return severity === 'minor' ? 1 : severity === 'heavy' ? 2 : 3;
}

function basePain(severity: InjurySeverity): 1 | 2 | 3 {
  return severity === 'minor' ? 1 : severity === 'heavy' ? 2 : 3;
}

function injuryId(characterId: CharacterId, moment: GameMoment, zone: AnatomicalZoneKey, count: number): string {
  return `injury:${characterId}:${absoluteGameMinute(moment)}:${zone}:${count}`;
}

function damageArmor(items: ItemSystemState, instanceIds: readonly string[], severity: InjurySeverity): ItemSystemState {
  if (!instanceIds.length) return items;
  const next = cloneItems(items);
  const damage = severity === 'minor' ? 1 : severity === 'heavy' ? 3 : 6;
  for (const id of new Set(instanceIds)) {
    const instance = next.instances[id];
    if (instance) instance.durability = Math.max(0, instance.durability - damage);
  }
  return next;
}

export function applyHealthHit(
  healthState: CharacterHealthState,
  command: HealthHitCommand,
  context: HealthSettlementContext,
): HealthSettlementResult {
  if (!healthState.alive) throw new Error('死亡人物不能再次结算受击');
  if (!command.cause?.trim()) throw new Error('命中伤害必须说明原因');
  const catalog = context.catalog ?? ITEM_CATALOG;
  const damageTags = command.damageTags?.filter(Boolean) ?? ['physical'];
  const protection = protectionForHit(context.items, command.zone, damageTags, catalog);
  const actualSeverity = mitigateSeverity(command.severity, protection.value);
  const changes: string[] = [];
  const nextHealth = cloneHealth(healthState);
  let nextItems = damageArmor(context.items, protection.instanceIds, command.severity);
  if (!actualSeverity) {
    changes.push(`${ANATOMICAL_ZONE_LABELS[command.zone]}受到冲击，但${protection.labels.join('、') || '当前防护'}吸收了足以避免形成伤口的伤害。`);
    return { health: nextHealth, items: nextItems, changes, interrupted: false, elapsedMinutes: 0 };
  }
  const injury: CharacterInjury = {
    id: injuryId(context.characterId, context.moment, command.zone, nextHealth.injuries.length),
    kind: command.injuryKind,
    zone: command.zone,
    cause: command.cause.trim(),
    severity: actualSeverity,
    bleeding: baseBleeding(command.injuryKind, actualSeverity),
    pain: basePain(actualSeverity),
    infection: command.injuryKind === 'burn' || command.injuryKind === 'cut_puncture' ? 'risk' : 'none',
    createdAt: { date: { ...context.moment.date }, minuteOfDay: context.moment.minuteOfDay },
    treatment: { firstAid: false, definitive: false, immobilized: false, bleedingControlled: false },
    recovery: { stage: 'acute', progress: 0, untreatedMinutes: 0, bleedingMinutes: 0 },
  };
  nextHealth.injuries.push(injury);
  changes.push(`${ANATOMICAL_ZONE_LABELS[command.zone]}形成${severityLabels[actualSeverity]}：${injury.cause}${protection.value ? `（防护 ${protection.value} 已结算一次）` : ''}`);
  if (actualSeverity === 'critical' && (command.zone === 'head' || command.zone === 'chest') && protection.value === 0) {
    nextHealth.alive = false;
    nextHealth.deathReason = `致命${ANATOMICAL_ZONE_LABELS[command.zone]}创伤：${injury.cause}`;
    changes.push(nextHealth.deathReason);
  }
  const interrupted = !nextHealth.alive || injury.bleeding >= 3;
  return {
    health: nextHealth,
    items: nextItems,
    changes,
    interrupted,
    ...(interrupted ? { interruptionReason: nextHealth.deathReason ?? '伤口出现大量失血，需要立即处理' } : {}),
    elapsedMinutes: 0,
  };
}

function placementAccessible(items: ItemSystemState, instanceId: string, location: WorldLocationRef): boolean {
  const placement = items.placements[instanceId];
  if (!placement) return false;
  if (placement.type === 'carried') return true;
  if (placement.type === 'site') {
    const site = items.sites[placement.siteId];
    return Boolean(site && sameWorldLocation(site.location, location));
  }
  if (placement.type === 'vehicle') {
    const vehicle = items.vehicles[placement.vehicleId];
    return Boolean(vehicle && sameWorldLocation(vehicle.location, location));
  }
  return false;
}

export function treatmentSupplySupports(treatment: TreatmentKind, injury: CharacterInjury, tags: readonly string[]): boolean {
  if (treatment === 'first_aid') return tags.includes('bandage') || tags.includes('injury');
  if (treatment === 'immobilize') return injury.kind === 'fracture' && (tags.includes('bandage') || tags.includes('medicine') || tags.includes('repair'));
  if (injury.kind === 'poison') return tags.includes('antidote') || tags.includes('poison');
  if (injury.kind === 'disease' || injury.infection === 'infected') return tags.includes('medicine') || tags.includes('cleaning');
  return tags.includes('medicine') || tags.includes('injury');
}

function treatmentSupplyMatches(command: HealthTreatmentCommand, injury: CharacterInjury, tags: readonly string[]): boolean {
  return treatmentSupplySupports(command.treatment, injury, tags);
}

function treatmentQuality(command: HealthTreatmentCommand, context: HealthSettlementContext, definitionQuality: string): number {
  const learning = context.attributes?.learning ?? 0;
  const skill = Math.max(0, Math.min(30, learning));
  const item = definitionQuality === 'legendary' ? 30 : definitionQuality === 'masterwork' ? 24 : definitionQuality === 'fine' ? 18 : definitionQuality === 'common' ? 12 : 6;
  const environment = command.environment === 'clean' ? 20 : command.environment === 'shelter' ? 10 : 0;
  return Math.min(100, 30 + skill + item + environment);
}

export function applyInjuryTreatment(
  healthState: CharacterHealthState,
  command: HealthTreatmentCommand,
  context: HealthSettlementContext,
): HealthSettlementResult {
  const nextHealth = cloneHealth(healthState);
  const injury = nextHealth.injuries.find((entry) => entry.id === command.injuryId);
  if (!injury || injury.recovery.stage === 'healed') throw new Error('指定伤病不存在或已经痊愈');
  if (!command.supplyInstanceId) throw new Error('治疗必须指定实际可取用的医疗物资');
  const instance = context.items.instances[command.supplyInstanceId];
  if (!instance) throw new Error('治疗物资实例不存在');
  if (!placementAccessible(context.items, command.supplyInstanceId, context.location)) throw new Error('治疗物资当前不可访问');
  const catalog = context.catalog ?? ITEM_CATALOG;
  const definition = getItemDefinition(catalog, instance.definitionId);
  if (!treatmentSupplyMatches(command, injury, definition.tags)) throw new Error(`【${definition.name}】不适用于这项处理`);

  // All validation happens before consumption. A rejected treatment consumes nothing.
  const nextItems = consumeItemInstance(context.items, command.supplyInstanceId);
  const quality = treatmentQuality(command, context, instance.quality);
  injury.treatment.lastTreatmentAt = { date: { ...context.moment.date }, minuteOfDay: context.moment.minuteOfDay };
  injury.treatment.lastTreatmentKind = command.treatment;
  injury.treatment.healerId = command.healerId ?? context.characterId;
  injury.treatment.treatmentQuality = quality;
  if (command.treatment === 'first_aid') {
    injury.treatment.firstAid = true;
    injury.treatment.bleedingControlled = injury.bleeding > 0;
    injury.recovery.stage = injury.kind === 'fracture' ? 'acute' : 'stabilized';
  } else if (command.treatment === 'immobilize') {
    if (injury.kind !== 'fracture') throw new Error('只有骨折需要固定');
    injury.treatment.immobilized = true;
    injury.recovery.stage = 'stabilized';
  } else {
    injury.treatment.definitive = true;
    if (injury.kind === 'fracture' && !injury.treatment.immobilized) {
      injury.recovery.stage = 'acute';
    } else {
      injury.recovery.stage = 'recovering';
    }
    if (injury.infection === 'infected' && quality >= 65) injury.infection = 'risk';
  }
  return {
    health: nextHealth,
    items: nextItems,
    changes: [`对${ANATOMICAL_ZONE_LABELS[injury.zone]}伤病“${injury.cause}”完成${command.treatment === 'first_aid' ? '急救' : command.treatment === 'immobilize' ? '固定' : '正式处理'}；伤势等级没有被即时降低。`],
    interrupted: false,
    elapsedMinutes: 0,
  };
}

function findSurvivalSupply(
  items: ItemSystemState,
  resource: 'food' | 'water',
  location: WorldLocationRef,
  catalog: ItemCatalog,
  requestedId?: string,
): string | undefined {
  const candidates = requestedId ? [requestedId] : Object.keys(items.instances).sort();
  return candidates.find((id) => {
    const instance = items.instances[id];
    if (!instance || !placementAccessible(items, id, location)) return false;
    return getItemDefinition(catalog, instance.definitionId).tags.includes(resource);
  });
}

export function consumeSurvivalResource(
  healthState: CharacterHealthState,
  command: SurvivalConsumeCommand,
  context: HealthSettlementContext,
): HealthSettlementResult {
  const catalog = context.catalog ?? ITEM_CATALOG;
  const instanceId = findSurvivalSupply(context.items, command.resource, context.location, catalog, command.instanceId);
  if (!instanceId) throw new Error(command.resource === 'food' ? '当前可取用范围内没有食物' : '当前可取用范围内没有饮水');
  const nextHealth = cloneHealth(healthState);
  const nextItems = consumeItemInstance(context.items, instanceId);
  const name = getItemDefinition(catalog, context.items.instances[instanceId].definitionId).name;
  if (command.resource === 'food') {
    nextHealth.survival.hunger = clampNeed(nextHealth.survival.hunger - (context.config ?? HEALTH_SIMULATION_CONFIG).mealRelief);
    nextHealth.survival.lastMealAt = { date: { ...context.moment.date }, minuteOfDay: context.moment.minuteOfDay };
  } else {
    nextHealth.survival.thirst = clampNeed(nextHealth.survival.thirst - (context.config ?? HEALTH_SIMULATION_CONFIG).drinkRelief);
    nextHealth.survival.lastDrinkAt = { date: { ...context.moment.date }, minuteOfDay: context.moment.minuteOfDay };
  }
  return {
    health: nextHealth,
    items: nextItems,
    changes: [`自动${command.resource === 'food' ? '进食' : '饮水'}并消耗【${name}】1 份。`],
    interrupted: false,
    elapsedMinutes: 0,
  };
}

function escalateSeverity(severity: InjurySeverity): InjurySeverity {
  return severity === 'minor' ? 'heavy' : 'critical';
}

function advanceInjuriesOneMinute(state: CharacterHealthState, config: HealthSimulationConfig): string[] {
  const changes: string[] = [];
  for (const injury of state.injuries) {
    if (injury.recovery.stage === 'healed' || injury.recovery.stage === 'permanent') continue;
    injury.recovery.untreatedMinutes += 1;
    if (injury.bleeding > 0 && !injury.treatment.bleedingControlled) {
      injury.recovery.bleedingMinutes += 1;
      const bleeding = injury.bleeding as 1 | 2 | 3;
      const threshold = config.injuries[injury.kind].uncontrolledBleedingEscalationMinutes[bleeding];
      if (injury.recovery.bleedingMinutes > 0 && injury.recovery.bleedingMinutes % threshold === 0) {
        if (injury.severity === 'critical') {
          state.alive = false;
          state.deathReason = `未控制的失血导致死亡：${injury.cause}`;
          changes.push(state.deathReason);
        } else {
          injury.severity = escalateSeverity(injury.severity);
          injury.pain = Math.min(3, injury.pain + 1) as 1 | 2 | 3;
          changes.push(`${ANATOMICAL_ZONE_LABELS[injury.zone]}伤势因持续失血恶化为${severityLabels[injury.severity]}。`);
        }
      }
    }
    if (injury.infection === 'risk' && injury.recovery.untreatedMinutes === config.injuries[injury.kind].infectionRiskAfterMinutes) {
      injury.infection = 'infected';
      changes.push(`${ANATOMICAL_ZONE_LABELS[injury.zone]}伤口出现感染。`);
    }
    const canRecover = injury.recovery.stage === 'recovering'
      && (injury.kind !== 'fracture' || injury.treatment.immobilized)
      && (injury.bleeding === 0 || injury.treatment.bleedingControlled)
      && injury.infection !== 'infected';
    if (canRecover) {
      const total = config.injuries[injury.kind].recoveryMinutes[injury.severity];
      if (Number.isFinite(total) && total > 0) {
        injury.recovery.progress = Math.min(100, injury.recovery.progress + (100 / total));
        if (injury.recovery.progress >= 100) {
          injury.recovery.stage = 'healed';
          changes.push(`${ANATOMICAL_ZONE_LABELS[injury.zone]}伤病“${injury.cause}”已经恢复。`);
        }
      }
    }
  }
  return changes;
}

function activityFatigueRate(activity: ActionActivity, items: ItemSystemState, catalog: ItemCatalog, config: HealthSimulationConfig): number {
  const burden = getEquipmentBurden(aggregateEquippedItemEffects(items, catalog));
  return config.fatiguePerHour[activity] * (1 + Math.max(0, burden) * 0.08);
}

function interruptionReason(state: CharacterHealthState, config: HealthSimulationConfig): string | undefined {
  if (!state.alive) return state.deathReason ?? '人物已经死亡';
  if (state.survival.thirst >= config.incapacitation.thirst) return '严重缺水，无法继续长时间行动';
  if (state.survival.fatigue >= config.incapacitation.fatigue) return '疲劳已达到无法安全继续行动的程度';
  const capabilities = deriveHealthCapabilities(state);
  if (capabilities.consciousness.score < config.incapacitation.consciousness) return '清醒程度过低，行动被迫中断';
  if (state.injuries.some((injury) => injury.bleeding >= 3 && !injury.treatment.bleedingControlled)) return '出现未控制的大量失血，需要立即处理';
  return undefined;
}

export function advanceCharacterHealth(
  healthState: CharacterHealthState,
  minutes: number,
  activity: ActionActivity,
  context: HealthSettlementContext,
  options: { sleep?: boolean; autoConsume?: boolean } = {},
): HealthSettlementResult {
  if (!Number.isInteger(minutes) || minutes < 0) throw new Error('健康推进时长必须是非负整数分钟');
  const config = context.config ?? HEALTH_SIMULATION_CONFIG;
  const catalog = context.catalog ?? ITEM_CATALOG;
  let health = cloneHealth(healthState);
  let items = cloneItems(context.items);
  const changes: string[] = [];
  let elapsed = 0;
  for (; elapsed < minutes; elapsed += 1) {
    if (!health.alive) break;
    health.survival.hunger = clampNeed(health.survival.hunger + config.hungerPerHour / 60);
    health.survival.thirst = clampNeed(health.survival.thirst + config.thirstPerHour / 60);
    if (options.sleep) {
      health.survival.fatigue = clampNeed(health.survival.fatigue - config.sleepRecoveryPerHour / 60);
    } else {
      health.survival.fatigue = clampNeed(health.survival.fatigue + activityFatigueRate(activity, items, catalog, config) / 60);
    }
    changes.push(...advanceInjuriesOneMinute(health, config));

    const minuteMoment = advanceGameMoment(context.moment, elapsed + 1);
    if (options.autoConsume !== false && health.survival.thirst >= config.autoDrinkThreshold) {
      const water = findSurvivalSupply(items, 'water', context.location, catalog);
      if (water) {
        const result = consumeSurvivalResource(health, { type: 'CONSUME_SURVIVAL', resource: 'water', instanceId: water }, { ...context, items, moment: minuteMoment });
        health = result.health;
        items = result.items;
        changes.push(...result.changes);
      }
    }
    if (options.autoConsume !== false && health.survival.hunger >= config.autoEatThreshold) {
      const food = findSurvivalSupply(items, 'food', context.location, catalog);
      if (food) {
        const result = consumeSurvivalResource(health, { type: 'CONSUME_SURVIVAL', resource: 'food', instanceId: food }, { ...context, items, moment: minuteMoment });
        health = result.health;
        items = result.items;
        changes.push(...result.changes);
      }
    }
    const reason = interruptionReason(health, config);
    if (reason) {
      elapsed += 1;
      health.lastUpdatedAt = { date: { ...minuteMoment.date }, minuteOfDay: minuteMoment.minuteOfDay };
      health.timePrecision = 'exact';
      validateItemSystem(items, catalog);
      return { health, items, changes: [...new Set(changes)], interrupted: true, interruptionReason: reason, elapsedMinutes: elapsed };
    }
  }
  const finalMoment = advanceGameMoment(context.moment, elapsed);
  health.lastUpdatedAt = { date: { ...finalMoment.date }, minuteOfDay: finalMoment.minuteOfDay };
  health.timePrecision = 'exact';
  if (options.sleep && elapsed >= 60) health.survival.lastSleepAt = { date: { ...finalMoment.date }, minuteOfDay: finalMoment.minuteOfDay };
  validateItemSystem(items, catalog);
  return { health, items, changes: [...new Set(changes)], interrupted: elapsed < minutes, ...(elapsed < minutes ? { interruptionReason: health.deathReason ?? '健康状态要求中断行动' } : {}), elapsedMinutes: elapsed };
}

export function validateHeldEquipmentAgainstHealth(state: CharacterHealthState, position: 'mainhand' | 'offhand', twoHanded: boolean): string | undefined {
  const capabilities = deriveHealthCapabilities(state);
  const targetHand = position === 'mainhand' ? state.dominantHand : state.dominantHand === 'right' ? 'left' : 'right';
  const grip = targetHand === 'right' ? capabilities.right_grip : capabilities.left_grip;
  if (grip.score < 25) return `${targetHand === 'right' ? '右手' : '左手'}握持能力不足：${grip.reasons.map((entry) => entry.label).join('；')}`;
  if (twoHanded && capabilities.two_hand_coordination.score < 40) {
    return `双手协作能力不足：${capabilities.two_hand_coordination.reasons.map((entry) => entry.label).join('；')}`;
  }
  return undefined;
}
