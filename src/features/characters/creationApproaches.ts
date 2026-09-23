import { CHARACTER_TRAITS, calculateFinalAttributes } from '../../data/characterTraits';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { inferActionCheck } from '../../services/dicePolicy';
import { performD20Check } from '../../services/diceEngine';
import { createEmptyItemSystem } from '../items/state';
import { createCustomCharacterItemState } from './customRulerStart';
import { itemPackageFor, type CharacterCreationDraft } from './customCharacterStart';

/** These are example intentions, not unlocked skills or commitments. All checks use the live engine. */
export const CREATION_APPROACHES = [
  { id: 'grapple', area: '交锋', label: '贴身压制', action: '与对手摔跤，贴身压制并控制持剑的手', condition: '需要接近对手；面对多人或无法近身的敌人，要重新判断机会。' },
  { id: 'read', area: '交锋', label: '看准破绽出手', action: '观察对手步法，寻找破绽后进攻', condition: '需要看清对手并有周旋的空间；这不代表你已经发现弱点。' },
  { id: 'feint', area: '交锋', label: '诱使对手出招', action: '虚晃一剑，诱使对手出招', condition: '对手的经验、地形与武器会影响实际机会。' },
  { id: 'talk', area: '交涉', label: '谈一份护卫差事', action: '与商队雇主交涉，谈判护卫差事的报酬', condition: '需要找到真实雇主；你的名声、装备和对方的需求仍会影响决定。' },
  { id: 'threat', area: '交涉', label: '以武力震慑', action: '展示武器威胁对方，试图让对方退让', condition: '需要可信的武力和实际武器；公开威胁可能留下敌意。' },
  { id: 'track', area: '谋生', label: '循踪找回走失牲畜', action: '追踪走失牲畜，辨认足迹', condition: '需要留下可辨认的踪迹；天气、时间与地面都会改变难度。' },
  { id: 'document', area: '谋生', label: '核验可疑文书', action: '检查文书，核验签名和印章', condition: '需要接触文书和可核验的线索；不会凭空知道真相。' },
  { id: 'heal', area: '谋生', label: '处理一处伤口', action: '诊断并包扎伤口，处理伤势', condition: '需要接触伤者及合适工具；严重伤病可能只能先稳定。' },
] as const;

export type CreationApproach = typeof CREATION_APPROACHES[number];

export function previewStartingItems(draft: CharacterCreationDraft) {
  if (!draft.location) return createEmptyItemSystem();
  return createCustomCharacterItemState({
    itemPackage: itemPackageFor(draft), location: { locationId: draft.location.locationId },
    locationLabel: draft.location.name, situation: draft.situation, hasHouse: Boolean(draft.house),
  });
}

export function approachTraitContributions(draft: CharacterCreationDraft, approach: CreationApproach) {
  const check = inferActionCheck(approach.action);
  return CHARACTER_TRAITS.filter((trait) => draft.traitIds.includes(trait.id)).map((trait) => {
    const primary = trait.modifiers[check.attribute] ?? 0;
    const secondary = check.secondaryAttribute ? trait.modifiers[check.secondaryAttribute] ?? 0 : 0;
    const attribute = (check.secondaryAttribute ? primary * 0.7 + secondary * 0.3 : primary) / 5;
    const direct = trait.rules.checkModifiers?.[check.domain] ?? 0;
    const edges = trait.rules.methodEdges?.filter((edge) => edge.domains.includes(check.domain)) ?? [];
    return { trait, contribution: Math.round((attribute + direct) * 100) / 100, edges };
  }).filter((entry) => entry.contribution !== 0 || entry.edges.length > 0);
}

export function previewCreationApproach(draft: CharacterCreationDraft, approach: CreationApproach) {
  const attributes = calculateFinalAttributes(draft.attributes, draft.traitIds);
  const items = previewStartingItems(draft);
  const check = inferActionCheck(approach.action);
  const counts = { strong_success: 0, success: 0, partial: 0, failure: 0 };
  let example: ReturnType<typeof performD20Check> | undefined;
  for (let face = 1; face <= 20; face += 1) {
    const result = performD20Check(approach.action, attributes, items, ITEM_CATALOG, draft.traitIds,
      check.attribute, check.dc, check.domain, undefined, () => (face - 0.5) / 20,
      { secondaryAttribute: check.secondaryAttribute });
    counts[result.outcome ?? 'failure'] += 1;
    if (face === 10) example = result;
  }
  return { counts, check, example: example!, contributions: approachTraitContributions(draft, approach) };
}
