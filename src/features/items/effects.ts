import { getItemDefinition } from './catalog';
import type { TraitCheckDomain } from '../../services/traitEffectEngine';
import type { WoundLevel } from '../../types/game';
import type {
  ItemBodyZone,
  ItemCatalog,
  ItemDefinition,
  ItemEffect,
  ItemEffectCondition,
  ItemInstance,
  ItemSystemState,
} from './types';

export interface ActiveItemEffect {
  instanceId: string;
  definitionId: string;
  itemName: string;
  itemTags: readonly string[];
  effect: ItemEffect;
}

export interface AggregatedItemEffects {
  active: ActiveItemEffect[];
}

export interface ItemEffectContext {
  actionText: string;
  sceneTags: readonly string[];
}

export interface ItemCheckContext extends ItemEffectContext {
  domain: TraitCheckDomain;
}

export interface ItemCheckModifierBreakdown {
  definitionId: string;
  instanceId: string;
  name: string;
  value: number;
  reason: string;
  stackGroup: string;
}

interface NumericItemEffect extends ActiveItemEffect {
  effect: Extract<ItemEffect, { value: number; stackGroup: string }>;
}

export function aggregateEquippedItemEffects(
  state: ItemSystemState,
  catalog: ItemCatalog,
): AggregatedItemEffects {
  const active: ActiveItemEffect[] = [];
  for (const instance of Object.values(state.instances)) {
    const placement = state.placements[instance.instanceId];
    if (placement?.type !== 'equipped' || instance.durability <= 0) continue;
    const definition = getItemDefinition(catalog, instance.definitionId);
    for (const effect of definition.effects) {
      active.push(toActiveEffect(instance, definition, effect));
    }
  }
  return { active };
}

function toActiveEffect(instance: ItemInstance, definition: ItemDefinition, effect: ItemEffect): ActiveItemEffect {
  return {
    instanceId: instance.instanceId,
    definitionId: definition.id,
    itemName: instance.customName ?? definition.name,
    itemTags: definition.tags,
    effect,
  };
}

function matchesCondition(
  condition: ItemEffectCondition | undefined,
  sourceTags: readonly string[],
  context: ItemEffectContext,
): boolean {
  if (!condition) return true;
  if (condition.actionPatterns?.length
    && !condition.actionPatterns.some((pattern) => context.actionText.includes(pattern))) return false;
  if (condition.requiredSceneTags?.some((tag) => !context.sceneTags.includes(tag))) return false;
  if (condition.forbiddenSceneTags?.some((tag) => context.sceneTags.includes(tag))) return false;
  if (condition.requiredItemTags?.some((tag) => !sourceTags.includes(tag))) return false;
  return true;
}

function capForGroup(entries: readonly NumericItemEffect[]): number {
  const caps = entries
    .map((entry) => entry.effect.cap)
    .filter((cap): cap is number => cap !== undefined && Number.isFinite(cap));
  return caps.length > 0 ? Math.min(...caps.map(Math.abs)) : Number.POSITIVE_INFINITY;
}

function clampSigned(value: number, cap: number): number {
  return Math.max(-cap, Math.min(cap, value));
}

function sumCappedGroups(entries: readonly NumericItemEffect[]): number {
  const groups = new Map<string, NumericItemEffect[]>();
  for (const entry of entries) {
    const group = groups.get(entry.effect.stackGroup) ?? [];
    group.push(entry);
    groups.set(entry.effect.stackGroup, group);
  }
  let total = 0;
  for (const group of groups.values()) {
    total += clampSigned(group.reduce((sum, entry) => sum + entry.effect.value, 0), capForGroup(group));
  }
  return total;
}

function matchingCheckEffects(effects: AggregatedItemEffects, context: ItemCheckContext): NumericItemEffect[] {
  return effects.active.filter((entry): entry is NumericItemEffect => {
    const effect = entry.effect;
    return effect.kind === 'check_modifier'
      && effect.domain === context.domain
      && matchesCondition(effect.condition, entry.itemTags, context);
  });
}

export function getItemCheckModifier(effects: AggregatedItemEffects, context: ItemCheckContext): number {
  return sumCappedGroups(matchingCheckEffects(effects, context));
}

export function getItemCheckModifierBreakdown(
  effects: AggregatedItemEffects,
  context: ItemCheckContext,
): ItemCheckModifierBreakdown[] {
  const matched = matchingCheckEffects(effects, context);
  const groups = new Map<string, NumericItemEffect[]>();
  for (const entry of matched) {
    const group = groups.get(entry.effect.stackGroup) ?? [];
    group.push(entry);
    groups.set(entry.effect.stackGroup, group);
  }

  const breakdown: ItemCheckModifierBreakdown[] = [];
  for (const [stackGroup, group] of groups) {
    const cap = capForGroup(group);
    let runningTotal = 0;
    for (const entry of group) {
      const nextTotal = clampSigned(runningTotal + entry.effect.value, cap);
      const value = nextTotal - runningTotal;
      runningTotal = nextTotal;
      if (value === 0) continue;
      breakdown.push({
        definitionId: entry.definitionId,
        instanceId: entry.instanceId,
        name: entry.itemName,
        value,
        reason: entry.effect.label,
        stackGroup,
      });
    }
  }
  return breakdown;
}

export function getZoneProtection(
  effects: AggregatedItemEffects,
  zone: ItemBodyZone,
  damageTags: readonly string[],
): number {
  const matched = effects.active.filter((entry): entry is NumericItemEffect => {
    const effect = entry.effect;
    return effect.kind === 'protection'
      && effect.zones.includes(zone)
      && effect.damageTags.some((tag) => damageTags.includes(tag));
  });
  return Math.max(0, sumCappedGroups(matched));
}

export function mitigateWoundLevel(level: WoundLevel, protection: number): WoundLevel {
  if (protection < 3 || level === 'intact') return level;
  const levels: WoundLevel[] = ['intact', 'minor', 'heavy', 'critical'];
  const reductions = Math.floor(protection / 3);
  return levels[Math.max(0, levels.indexOf(level) - reductions)];
}

export function getEquipmentBurden(effects: AggregatedItemEffects): number {
  const burdens = effects.active.filter((entry): entry is NumericItemEffect => entry.effect.kind === 'burden');
  return Math.max(0, sumCappedGroups(burdens));
}

export function getUnlockedItemActions(
  effects: AggregatedItemEffects,
  context?: ItemEffectContext,
): string[] {
  const actions = effects.active
    .filter((entry) => entry.effect.kind === 'action_unlock'
      && (!context || matchesCondition(entry.effect.condition, entry.itemTags, context)))
    .map((entry) => (entry.effect as Extract<ItemEffect, { kind: 'action_unlock' }>).actionId);
  return [...new Set(actions)];
}

function contextWords(tags: readonly string[]): string {
  return tags.length > 0 ? `（适用于${tags.join('、')}场景）` : '';
}

function effectClause(effect: ItemEffect): string {
  switch (effect.kind) {
    case 'check_modifier':
      return `“${effect.label}”只在匹配的${effect.domain}行动中影响成败`;
    case 'action_unlock':
      return `允许采取“${effect.label}”行动`;
    case 'protection':
      return `“${effect.label}”覆盖${effect.zones.join('、')}，可抵御${effect.damageTags.join('、')}伤害`;
    case 'social':
      return `“${effect.label}”会改变${effect.contextTags.join('、')}场合中的身份判断`;
    case 'burden':
      return `“${effect.label}”会影响需要轻装与灵活性的行动`;
    case 'fatigue':
      return `“${effect.label}”会加快体力消耗${contextWords(effect.contextTags)}`;
    case 'heat':
      return `“${effect.label}”会加重闷热${contextWords(effect.contextTags)}`;
    case 'resource':
      return `“${effect.label}”只在相关资源变化实际发生时应用`;
    case 'capacity':
      return `“${effect.label}”只收纳${effect.categories.join('、')}类物品`;
    case 'narrative':
      return effect.directive;
  }
}

export function formatItemNarrativeDirectives(effects: AggregatedItemEffects): string[] {
  const seen = new Set<string>();
  const byItem = new Map<string, { name: string; clauses: string[] }>();
  for (const entry of effects.active) {
    const clause = effectClause(entry.effect);
    if (!clause) continue;
    const key = `${entry.itemName}::${clause}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let bucket = byItem.get(entry.itemName);
    if (!bucket) {
      bucket = { name: entry.itemName, clauses: [] };
      byItem.set(entry.itemName, bucket);
    }
    bucket.clauses.push(clause);
  }
  return [...byItem.values()].map((bucket) => `${bucket.name}：${bucket.clauses.join('；')}。`);
}
