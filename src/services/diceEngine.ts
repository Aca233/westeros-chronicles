import { LordAttributes, LordGearSlots, D20Check } from '../types/game';
import {
  aggregateSelectedTraitEffects,
  getTraitCheckContributions,
} from '../data/characterTraits';
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
  actionText: string
): { attribute: keyof LordAttributes; dc: number; domain: TraitCheckDomain } {
  const inferred = inferActionCheck(actionText);
  return { attribute: inferred.attribute, dc: inferred.dc, domain: inferred.domain };
}

export function performD20Check(
  actionText: string,
  attributes: LordAttributes,
  gear: LordGearSlots,
  traitIds: readonly string[] = [],
  attributeOverride?: keyof LordAttributes,
  dcOverride?: number,
  domainOverride?: TraitCheckDomain,
): D20Check {
  const inferred = inferCheckFromAction(actionText);
  const attribute = attributeOverride || inferred.attribute;
  const dc = dcOverride !== undefined ? dcOverride : inferred.dc;
  const domain = domainOverride || inferred.domain;
  const roll = Math.floor(Math.random() * 20) + 1;
  const attributeModifier = getAttributeModifier(attributes[attribute] ?? 0);

  let equipmentBonus = 0;
  if (attribute === 'prowess' && gear.mainhand) {
    if (gear.mainhand.quality === '瓦雷利亚古钢') equipmentBonus = 5;
    else if (gear.mainhand.quality === '大师精铸') equipmentBonus = 3;
    else equipmentBonus = 1;
  }

  const effects = aggregateSelectedTraitEffects(traitIds);
  const traitModifier = effects.checkModifiers[domain] ?? 0;
  const traitModifierBreakdown = getTraitCheckContributions(traitIds, domain)
    .map(({ id, name, value }) => ({ traitId: id, name, value }));
  const outcomeContract = buildOutcomeContract(actionText, domain);
  const isNatural20 = roll === 20;
  const isNatural1 = roll === 1;
  const total = roll + attributeModifier + equipmentBonus + traitModifier;
  const success = isNatural20 || (!isNatural1 && total >= dc);

  const traitText = traitModifier
    ? `，特质修正 ${traitModifier >= 0 ? '+' : ''}${traitModifier}`
    : '';
  let resultDescription = '';
  if (isNatural20) resultDescription = '【自然 20】当前行动在现实与设定允许的范围内完成得更好。';
  else if (isNatural1) resultDescription = '【自然 1】当前行动在已有风险范围内失手，不会产生无关灾难。';
  else if (success) resultDescription = `【检定成功】总点数 ${total} >= 难度 DC ${dc}${traitText}。`;
  else resultDescription = `【检定失败】总点数 ${total} < 难度 DC ${dc}${traitText}。`;

  return {
    id: `check_${Date.now()}`,
    attribute,
    attributeName: ATTRIBUTE_NAMES[attribute],
    dc,
    roll,
    attributeModifier,
    equipmentBonus,
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
