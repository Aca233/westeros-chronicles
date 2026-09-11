import type { D20Check, LordAttributes } from '../types/game';
import {
  aggregateSelectedTraitEffects,
  getTraitCheckContributions,
  getTraitMethodEdges,
} from '../data/characterTraits';
import type { ItemCatalog, ItemSystemState } from '../features/items/types';
import {
  aggregateEquippedItemEffects,
  getItemCheckModifier,
  getItemCheckModifierBreakdown,
} from '../features/items/effects';
import type { TraitCheckDomain } from './traitEffectEngine';
import type { CharacterHealthState } from '../features/health/types';
import { deriveHealthCheckEffects } from '../features/health/checkEffects';
import { buildOutcomeContract, inferActionCheck } from './dicePolicy';

export const ATTRIBUTE_NAMES: Record<keyof LordAttributes, string> = {
  diplomacy: '外交 (Diplomacy)',
  martial: '军事 (Martial)',
  stewardship: '管理 (Stewardship)',
  intrigue: '谋略 (Intrigue)',
  learning: '学识 (Learning)',
  prowess: '勇武 (Prowess)',
};

export function getAttributeModifier(attrValue: number): number {
  return Math.round((Math.max(0, attrValue) / 5) * 100) / 100;
}

export function getEffectiveAttribute(
  attributes: LordAttributes,
  primary: keyof LordAttributes,
  secondary?: keyof LordAttributes,
): number {
  const primaryValue = Math.max(0, attributes[primary] ?? 0);
  if (!secondary || secondary === primary) return primaryValue;
  const secondaryValue = Math.max(0, attributes[secondary] ?? 0);
  return Math.round((primaryValue * 0.7 + secondaryValue * 0.3) * 10) / 10;
}

export function inferCheckFromAction(
  actionText: string,
): { attribute: keyof LordAttributes; secondaryAttribute?: keyof LordAttributes; dc: number; domain: TraitCheckDomain } {
  const inferred = inferActionCheck(actionText);
  return {
    attribute: inferred.attribute,
    ...(inferred.secondaryAttribute ? { secondaryAttribute: inferred.secondaryAttribute } : {}),
    dc: inferred.dc,
    domain: inferred.domain,
  };
}

/**
 * Turns the player's natural-language action into broad, deterministic scene facts.
 * These tags only gate authored item effects; they never add a hidden random modifier.
 */
export function inferItemSceneTags(actionText: string, domain: TraitCheckDomain): string[] {
  const tags = new Set<string>();
  const addWhen = (pattern: RegExp, ...values: string[]) => {
    if (pattern.test(actionText)) values.forEach((value) => tags.add(value));
  };

  if (domain === 'duel' || domain === 'battle') tags.add('combat');
  if (domain === 'duel') tags.add('melee');
  addWhen(/决斗|近身|挥砍|刺击|格挡|搏斗|交战|厮杀|拔剑|持剑|挥剑|持刀|挥刀|长矛|战斧/i, 'combat', 'melee');
  addWhen(/射箭|弓箭|弩|放箭|远射/i, 'combat', 'ranged');
  addWhen(/宫廷|朝会|觐见|宴会|舞会|谈判|议事|法庭|婚礼|加冕/i, 'court');
  addWhen(/旅行|赶路|道路|路边|远行|跋涉|行军|宿营|营地|马车|骑马|航行/i, 'travel');
  addWhen(/炎热|酷热|闷热|盛夏|沙漠|多恩|烈日|火炉/i, 'warm', 'hot');
  addWhen(/温暖|暖和|夏日/i, 'warm');
  addWhen(/寒冷|严寒|冰雪|暴雪|寒冬|长城以北/i, 'cold');
  addWhen(/潜行|隐匿|悄悄|无声|偷窃|开锁/i, 'stealth');
  return [...tags];
}

export function performD20Check(
  actionText: string,
  attributes: LordAttributes,
  items: ItemSystemState,
  catalog: ItemCatalog,
  traitIds: readonly string[] = [],
  attributeOverride?: keyof LordAttributes,
  dcOverride?: number,
  domainOverride?: TraitCheckDomain,
  sceneTags?: readonly string[],
  random: () => number = Math.random,
  method?: {
    secondaryAttribute?: keyof LordAttributes;
    reason?: string;
    attemptKey?: string;
    conditionKey?: string;
  },
  health?: CharacterHealthState,
): D20Check {
  const inferred = inferCheckFromAction(actionText);
  const attribute = attributeOverride || inferred.attribute;
  const secondaryAttribute = method
    ? method.secondaryAttribute
    : inferred.secondaryAttribute;
  const dc = dcOverride !== undefined ? dcOverride : inferred.dc;
  const domain = domainOverride || inferred.domain;
  const roll = Math.floor(random() * 20) + 1;
  const primaryAttributeValue = Math.max(0, attributes[attribute] ?? 0);
  const secondaryAttributeValue = secondaryAttribute === undefined
    ? undefined
    : Math.max(0, attributes[secondaryAttribute] ?? 0);
  const effectiveAttribute = getEffectiveAttribute(attributes, attribute, secondaryAttribute);
  const attributeModifier = getAttributeModifier(effectiveAttribute);

  const itemEffects = aggregateEquippedItemEffects(items, catalog);
  const itemContext = {
    actionText,
    domain,
    sceneTags: sceneTags ?? inferItemSceneTags(actionText, domain),
  };
  const equipmentModifier = getItemCheckModifier(itemEffects, itemContext);
  const equipmentModifierBreakdown = getItemCheckModifierBreakdown(itemEffects, itemContext)
    .map(({ definitionId, instanceId, name, value, reason }) => ({
      definitionId,
      instanceId,
      name,
      value,
      reason,
    }));

  const effects = aggregateSelectedTraitEffects(traitIds);
  const traitModifier = effects.checkModifiers[domain] ?? 0;
  const traitModifierBreakdown = getTraitCheckContributions(traitIds, domain)
    .map(({ id, name, value }) => ({ traitId: id, name, value }));
  const healthEffects = deriveHealthCheckEffects(health, actionText, domain);
  const healthModifier = healthEffects.modifier;
  const healthModifierBreakdown = healthEffects.breakdown;
  const availableMethodEdges = getTraitMethodEdges(traitIds, domain);
  const outcomeContract = buildOutcomeContract(actionText, domain);
  const isNatural20 = roll === 20;
  const isNatural1 = roll === 1;
  const total = Math.round((roll + attributeModifier + equipmentModifier + traitModifier + healthModifier) * 100) / 100;
  const margin = Math.round((total - dc) * 100) / 100;
  const rolledOutcome: NonNullable<D20Check['outcome']> = margin >= 5
    ? 'strong_success'
    : margin >= 0
      ? 'success'
      : margin >= -3
        ? 'partial'
        : 'failure';
  const activatedMethodEdge = rolledOutcome === 'failure'
    ? availableMethodEdges.find((edge) => margin >= -edge.maxMiss)
    : undefined;
  const outcome: NonNullable<D20Check['outcome']> = activatedMethodEdge ? 'partial' : rolledOutcome;
  const success = outcome === 'strong_success' || outcome === 'success';

  const traitText = traitModifier
    ? `，特质修正 ${traitModifier >= 0 ? '+' : ''}${traitModifier}`
    : '';
  const itemText = equipmentModifier
    ? `，物品修正 ${equipmentModifier >= 0 ? '+' : ''}${equipmentModifier}`
    : '';
  const healthText = healthModifier
    ? `，身体状态 ${healthModifier >= 0 ? '+' : ''}${healthModifier}`
    : '';
  let resultDescription = '';
  const methodText = secondaryAttribute
    ? `${ATTRIBUTE_NAMES[attribute]} 70% + ${ATTRIBUTE_NAMES[secondaryAttribute]} 30% = 有效能力 ${effectiveAttribute}`
    : `${ATTRIBUTE_NAMES[attribute]} = 有效能力 ${effectiveAttribute}`;
  if (outcome === 'strong_success') resultDescription = `【优势成功】${methodText}；总点数 ${total} 超过难度 DC ${dc} 达 5 点，可获得一个与当前行动直接相关的小优势${itemText}${traitText}${healthText}。`;
  else if (outcome === 'success') resultDescription = `【检定成功】${methodText}；总点数 ${total} >= 难度 DC ${dc}${itemText}${traitText}${healthText}。`;
  else if (outcome === 'partial' && activatedMethodEdge) resultDescription = `【部分成果·${activatedMethodEdge.label}】${methodText}；原检定失败，但专长改变了失败后还能保住的东西：${activatedMethodEdge.directive}${itemText}${traitText}${healthText}。`;
  else if (outcome === 'partial') resultDescription = `【部分成果】${methodText}；总点数 ${total} 距难度 DC ${dc} 不超过 3 点，只能取得有限进展、接受相关代价，或面对一个条件机会${itemText}${traitText}${healthText}。`;
  else resultDescription = `【检定失败】${methodText}；总点数 ${total} 距难度 DC ${dc} 超过 3 点${itemText}${traitText}${healthText}。`;

  return {
    id: `check_${Date.now()}`,
    attribute,
    attributeName: ATTRIBUTE_NAMES[attribute],
    ...(secondaryAttribute ? {
      secondaryAttribute,
      secondaryAttributeName: ATTRIBUTE_NAMES[secondaryAttribute],
      secondaryAttributeValue,
    } : {}),
    primaryAttributeValue,
    effectiveAttribute,
    ...(method?.reason?.trim() ? { methodReason: method.reason.trim() } : {}),
    ...(method?.attemptKey ? { attemptKey: method.attemptKey } : {}),
    ...(method?.conditionKey ? { conditionKey: method.conditionKey } : {}),
    dc,
    roll,
    attributeModifier,
    equipmentModifier,
    equipmentModifierBreakdown,
    checkDomain: domain,
    traitModifier,
    traitModifierBreakdown,
    healthModifier,
    healthModifierBreakdown,
    ...(activatedMethodEdge ? { methodEdge: {
      traitId: activatedMethodEdge.traitId,
      traitName: activatedMethodEdge.traitName,
      label: activatedMethodEdge.label,
      directive: activatedMethodEdge.directive,
    } } : {}),
    outcomeContract,
    total,
    isNatural20,
    isNatural1,
    outcome,
    margin,
    success,
    actionText,
    resultDescription,
    timestamp: Date.now(),
  };
}
