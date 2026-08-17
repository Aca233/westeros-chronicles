import type { D20Check, LordAttributes } from '../types/game';
import {
  aggregateSelectedTraitEffects,
  getTraitCheckContributions,
} from '../data/characterTraits';
import type { ItemCatalog, ItemSystemState } from '../features/items/types';
import {
  aggregateEquippedItemEffects,
  getItemCheckModifier,
  getItemCheckModifierBreakdown,
} from '../features/items/effects';
import type { TraitCheckDomain } from './traitEffectEngine';
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
  return Math.max(-5, Math.min(10, Math.floor((attrValue - 10) / 2)));
}

export function inferCheckFromAction(
  actionText: string,
): { attribute: keyof LordAttributes; dc: number; domain: TraitCheckDomain } {
  const inferred = inferActionCheck(actionText);
  return { attribute: inferred.attribute, dc: inferred.dc, domain: inferred.domain };
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
): D20Check {
  const inferred = inferCheckFromAction(actionText);
  const attribute = attributeOverride || inferred.attribute;
  const dc = dcOverride !== undefined ? dcOverride : inferred.dc;
  const domain = domainOverride || inferred.domain;
  const roll = Math.floor(random() * 20) + 1;
  const attributeModifier = getAttributeModifier(attributes[attribute] ?? 0);

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
  const outcomeContract = buildOutcomeContract(actionText, domain);
  const isNatural20 = roll === 20;
  const isNatural1 = roll === 1;
  const total = roll + attributeModifier + equipmentModifier + traitModifier;
  const success = isNatural20 || (!isNatural1 && total >= dc);

  const traitText = traitModifier
    ? `，特质修正 ${traitModifier >= 0 ? '+' : ''}${traitModifier}`
    : '';
  const itemText = equipmentModifier
    ? `，物品修正 ${equipmentModifier >= 0 ? '+' : ''}${equipmentModifier}`
    : '';
  let resultDescription = '';
  if (isNatural20) resultDescription = '【自然 20】当前行动在现实与设定允许的范围内完成得更好。';
  else if (isNatural1) resultDescription = '【自然 1】当前行动在已有风险范围内失手，不会产生无关灾难。';
  else if (success) resultDescription = `【检定成功】总点数 ${total} >= 难度 DC ${dc}${itemText}${traitText}。`;
  else resultDescription = `【检定失败】总点数 ${total} < 难度 DC ${dc}${itemText}${traitText}。`;

  return {
    id: `check_${Date.now()}`,
    attribute,
    attributeName: ATTRIBUTE_NAMES[attribute],
    dc,
    roll,
    attributeModifier,
    equipmentModifier,
    equipmentModifierBreakdown,
    checkDomain: domain,
    traitModifier,
    traitModifierBreakdown,
    outcomeContract,
    total,
    isNatural20,
    isNatural1,
    success,
    actionText,
    resultDescription,
    timestamp: Date.now(),
  };
}
