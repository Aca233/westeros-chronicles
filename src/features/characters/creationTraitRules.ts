import { CHARACTER_TRAITS, isDerivedInjuryTraitId, type CharacterTraitDefinition } from '../../data/characterTraits';
import { filterImportedCharacterTraits } from '../../data/importedCharacterTraitPolicy';
import type { LordAttributes } from '../../types/game';
import type { CharacterCreationDraft } from './customCharacterStart';

export const MAX_CREATION_REFUND = 100;
export const MAX_LEARNING_TARGETS = 2;
export type CreationTraitGroup = 'personality' | 'skills' | 'body' | 'identity';
export const CREATION_TRAIT_GROUPS: { id: CreationTraitGroup; label: string; description: string }[] = [
  { id: 'personality', label: '性格', description: '你习惯怎样与人和世界相处。不限数量，相容的性格都可以搭配，按标价花费或返还点数。' },
  { id: 'skills', label: '本事', description: '现在掌握，或留作成长方向。教育只能选择一种。' },
  { id: 'body', label: '身体与天赋', description: '优势消耗点数，缺陷有限返还。身体限制会进入实际行动。' },
  { id: 'identity', label: '身份与名声', description: '身份需要真实背景。有些身份暂不支持自创开局。' },
];

const UNSUPPORTED_IDENTITIES: Record<string, string> = {
  nightswatch: '守夜人的誓言、组织归属与长城开局尚未接通，暂不能作为自创身份。',
  dragonrider: '需要真实巨龙及驭龙关系；当前自创开局不能提供。',
  archmaester: '需要学城职位与组织事实；当前自创开局不能提供。',
  dragon_dreams: '可验证的梦境玩法尚未接通，暂不以属性加成代替龙梦。',
  greensight: '绿梦及其信息边界尚未接通，暂不能作为自创天赋。',
};
const EVERYDAY_REPUTATIONS = new Set(['uncouth', 'fashionable', 'fire_obsessed']);

export function creationTraitGroup(trait: CharacterTraitDefinition): CreationTraitGroup {
  if (trait.category === 'personality') return 'personality';
  if (trait.category === 'education' || trait.category === 'lifestyle') return 'skills';
  if (trait.category === 'health' || trait.category === 'congenital') return 'body';
  return 'identity';
}

export function creationTraitPrice(trait: CharacterTraitDefinition): number {
  return trait.cost;
}

export function traitNeedsBackground(trait: CharacterTraitDefinition): boolean {
  return trait.category === 'fame' && trait.id !== 'bastard' && !EVERYDAY_REPUTATIONS.has(trait.id);
}

export function creationTraitBlock(trait: CharacterTraitDefinition, draft: CharacterCreationDraft): string | undefined {
  if (isDerivedInjuryTraitId(trait.id)) return '当前伤势由身体系统记录，不能作为创建特质购买。';
  if (UNSUPPORTED_IDENTITIES[trait.id]) return UNSUPPORTED_IDENTITIES[trait.id];
  if (!filterImportedCharacterTraits([trait.id], draft.age).visibleTraitIds.includes(trait.id)) return '该特质不适用于当前年龄。';
  return undefined;
}

export function creationTraitRequirement(trait: CharacterTraitDefinition, draft: CharacterCreationDraft): string | undefined {
  if (trait.id === 'bastard' && draft.kinship?.kind !== 'bastard_child') return '请在「关系」中设置私生血缘及知情范围。';
  if (traitNeedsBackground(trait) && (draft.traitBackgrounds?.[trait.id]?.trim().length ?? 0) < 10) return '补充至少 10 字的具体往事。这项名声按公开背景写入开局，不改变原著人物的状态。';
  return undefined;
}

export function creationTraitsConflict(left: CharacterTraitDefinition, right: CharacterTraitDefinition): boolean {
  return left.id !== right.id && Boolean(
    (left.exclusiveGroup && left.exclusiveGroup === right.exclusiveGroup)
    || (left.category === 'education' && right.category === 'education')
    || left.incompatibleTraitIds?.includes(right.id) || right.incompatibleTraitIds?.includes(left.id),
  );
}

export function previewCreationTrait(draft: CharacterCreationDraft, traitId: string) {
  const trait = CHARACTER_TRAITS.find((entry) => entry.id === traitId);
  if (!trait) return { traitIds: draft.traitIds, replaces: [] as string[], blocked: '特质不存在。' };
  if (draft.traitIds.includes(traitId)) return { traitIds: draft.traitIds.filter((id) => id !== traitId), replaces: [] as string[], blocked: undefined };
  const blocked = creationTraitBlock(trait, draft);
  const replaces = CHARACTER_TRAITS.filter((entry) => draft.traitIds.includes(entry.id) && creationTraitsConflict(trait, entry)).map((entry) => entry.id);
  const kept = draft.traitIds.filter((id) => !replaces.includes(id));
  return { traitIds: [...kept, traitId], replaces, blocked };
}

export function creationAttributeCost(value: number): number {
  return (value < 8 ? (value - 8) * 5 : Math.max(0, Math.min(value, 12) - 8) * 5)
    + Math.max(0, Math.min(value, 16) - 12) * 10
    + Math.max(0, Math.min(value, 20) - 16) * 20
    + Math.max(0, value - 20) * 30;
}

export function creationBudget(attributes: LordAttributes, traitIds: readonly string[]) {
  const selected = CHARACTER_TRAITS.filter((trait) => traitIds.includes(trait.id));
  const attributeCosts = Object.values(attributes).map(creationAttributeCost);
  const abilities = attributeCosts.reduce((sum, value) => sum + Math.max(0, value), 0);
  const skills = selected.filter((trait) => creationTraitGroup(trait) === 'skills').reduce((sum, trait) => sum + Math.max(0, creationTraitPrice(trait)), 0);
  const body = selected.filter((trait) => creationTraitGroup(trait) === 'body').reduce((sum, trait) => sum + Math.max(0, creationTraitPrice(trait)), 0);
  const personality = selected.filter((trait) => trait.category === 'personality').reduce((sum, trait) => sum + Math.max(0, creationTraitPrice(trait)), 0);
  const identity = selected.filter((trait) => creationTraitGroup(trait) === 'identity').reduce((sum, trait) => sum + Math.max(0, creationTraitPrice(trait)), 0);
  const refunds = new Map<string, number>();
  for (const trait of selected) {
    if (creationTraitPrice(trait) >= 0) continue;
    const group = trait.exclusiveGroup ?? trait.id;
    refunds.set(group, Math.max(refunds.get(group) ?? 0, -creationTraitPrice(trait)));
  }
  const rawRefund = [...refunds.values()].reduce((sum, value) => sum + value, 0)
    + attributeCosts.reduce((sum, value) => sum + Math.max(0, -value), 0);
  const refund = Math.min(MAX_CREATION_REFUND, rawRefund);
  return { abilities, skills, body, personality, identity, rawRefund, refund, total: abilities + skills + body + personality + identity - refund };
}

export function isLearningTarget(trait: CharacterTraitDefinition): boolean {
  return creationTraitGroup(trait) === 'skills';
}

export function learningRoute(trait: CharacterTraitDefinition): string {
  return `以${trait.name}为方向寻找指导或实际练习；至少两个不同回合的已提交训练事件，或一次有证据的关键经历，才可提出成长机会。由玩家选择后获得特质，当前没有该特质效果。`;
}
