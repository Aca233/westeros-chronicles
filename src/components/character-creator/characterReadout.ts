import { CK3_SKILLS, getCk3SkillRank, type Ck3SkillDefinition } from '../../data/ck3Skills';
import { CHARACTER_TRAITS, type CharacterTraitDefinition } from '../../data/characterTraits';
import type { LordAttributes } from '../../types/game';
import {
  suggestedBackgroundAttributes,
  type CharacterCreationDraft,
  type CharacterCreationValidation,
} from '../../features/characters/customCharacterStart';

/** 特质来源。派生自草稿本身，不新增存档字段。 */
export type TraitSourceId = 'innate' | 'background' | 'chosen' | 'growth';

export interface TraitSourceDefinition {
  id: TraitSourceId;
  label: string;
  short: string;
  hint: string;
  tone: 'gold' | 'parchment';
}

export const TRAIT_SOURCES: Record<TraitSourceId, TraitSourceDefinition> = {
  innate: { id: 'innate', label: '天生', short: '天生', hint: '先天与健康特质，来自出生和身体本身，不由背景改写。', tone: 'gold' },
  background: { id: 'background', label: '经历自带', short: '经历', hint: '由你选择的主要经历直接带来；手动调整教育后不再跟随经历变化。', tone: 'gold' },
  chosen: { id: 'chosen', label: '亲手所选', short: '自选', hint: '你在设计器里亲手加入的特质。', tone: 'parchment' },
  growth: { id: 'growth', label: '成长方向', short: '成长', hint: '当前尚未掌握，留待游戏中通过事件学习。', tone: 'parchment' },
};

/** 判断一项已选特质从何而来，用于在编辑器各处标注来源。 */
export function traitSourceOf(draft: CharacterCreationDraft, traitId: string): TraitSourceId {
  if (draft.learningTraitIds?.includes(traitId)) return 'growth';
  if (draft.backgroundTraitIds?.includes(traitId)) return 'background';
  const trait = CHARACTER_TRAITS.find((entry) => entry.id === traitId);
  return trait?.category === 'congenital' || trait?.category === 'health' ? 'innate' : 'chosen';
}

/** 统计各来源的特质数量，用于概览与左侧徽记。 */
export function traitSourceCounts(draft: CharacterCreationDraft): Record<TraitSourceId, number> {
  const counts: Record<TraitSourceId, number> = { innate: 0, background: 0, chosen: 0, growth: 0 };
  counts.growth = (draft.learningTraitIds ?? []).length;
  for (const id of draft.traitIds) counts[traitSourceOf(draft, id)] += 1;
  return counts;
}

export interface SkillReadout {
  definition: Ck3SkillDefinition;
  key: keyof LordAttributes;
  /** 背景建议值：出身、经历、生计与身份叠加出的起点。 */
  suggested: number;
  /** 当前基础值：背景建议加玩家手动调整，也是特质生效前的数值。 */
  base: number;
  /** 玩家相对建议值的手动调整量。 */
  manual: number;
  /** 已选特质带来的修正。 */
  traitDelta: number;
  /** 进入游戏时实际使用的数值。 */
  final: number;
  rank: string;
}

export function skillReadouts(draft: CharacterCreationDraft, finalAttributes: LordAttributes): SkillReadout[] {
  const suggested = suggestedBackgroundAttributes(draft);
  return CK3_SKILLS.map((definition) => {
    const base = draft.attributes[definition.key];
    const final = finalAttributes[definition.key];
    return {
      definition,
      key: definition.key,
      suggested: suggested[definition.key],
      base,
      manual: base - suggested[definition.key],
      traitDelta: final - base,
      final,
      rank: getCk3SkillRank(final),
    };
  });
}

function traitAttributeDelta(trait: CharacterTraitDefinition): number {
  return Object.values(trait.modifiers ?? {}).reduce((sum, value) => sum + (value ?? 0), 0);
}

export interface ReadoutHighlight {
  id: string;
  label: string;
  detail: string;
  tone: 'gold' | 'rubric' | 'plain';
}

export interface CharacterReadout {
  headline: string;
  summary: string;
  strengths: ReadoutHighlight[];
  weaknesses: ReadoutHighlight[];
  standing: { title: string; detail: string };
  risk: { level: '低' | '中' | '高'; detail: string };
  ties: string[];
}

export interface ReadoutLabels {
  roleLabel: string;
  originLabel: string;
  experienceLabel: string;
  livelihoodLabel: string;
  situationLabel: string;
  houseRecommended: boolean;
}

/**
 * 把已确认的开局事实归纳成一段可读的人物评价。
 * 只归纳草稿里确实存在的事实，不引入新的规则或隐藏数值。
 */
export function characterReadout(
  draft: CharacterCreationDraft,
  finalAttributes: LordAttributes,
  validation: CharacterCreationValidation,
  labels: ReadoutLabels,
): CharacterReadout {
  const readouts = skillReadouts(draft, finalAttributes);
  const selected = CHARACTER_TRAITS.filter((trait) => draft.traitIds.includes(trait.id));
  const place = draft.location?.name ?? '尚未选定的地点';

  const strengths: ReadoutHighlight[] = [];
  for (const trait of selected) {
    const delta = traitAttributeDelta(trait);
    if (delta <= 0) continue;
    strengths.push({
      id: `trait:${trait.id}`,
      label: trait.name,
      detail: `${TRAIT_SOURCES[traitSourceOf(draft, trait.id)].label} · 六项能力合计 +${delta}`,
      tone: 'gold',
    });
  }
  for (const skill of readouts) {
    if (skill.final < 12) continue;
    strengths.push({
      id: `skill:${skill.key}`,
      label: `${skill.definition.label} ${skill.rank}`,
      detail: `基础 ${skill.base}${skill.traitDelta !== 0 ? ` · 特质 ${formatDelta(skill.traitDelta)}` : ''} · 最终 ${skill.final}`,
      tone: 'plain',
    });
  }
  if (draft.house) {
    strengths.push({ id: 'house', label: `家族：${draft.house.houseName}`, detail: `${draft.house.dynastyName} · “${draft.house.houseWords}”`, tone: 'plain' });
  }
  if (draft.kinship) {
    strengths.push({
      id: 'kinship',
      label: draft.kinship.kind === 'cadet_branch' ? '原著旁支血缘' : '原著私生血缘',
      detail: `${draft.kinship.targetName}${draft.kinship.publiclyKnown ? ' · 身份公开' : ' · 身份未公开'}`,
      tone: 'gold',
    });
  }
  if (draft.relations.length > 0) {
    strengths.push({
      id: 'relations',
      label: `已建立 ${draft.relations.length} 段关系`,
      detail: draft.relations.map((relation) => relation.targetName).join('、'),
      tone: 'plain',
    });
  }

  const weaknesses: ReadoutHighlight[] = [];
  for (const trait of selected) {
    const delta = traitAttributeDelta(trait);
    if (delta >= 0) continue;
    weaknesses.push({
      id: `trait:${trait.id}`,
      label: trait.name,
      detail: `${TRAIT_SOURCES[traitSourceOf(draft, trait.id)].label} · 六项能力合计 ${delta}`,
      tone: 'rubric',
    });
  }
  for (const skill of readouts) {
    if (skill.final > 7) continue;
    weaknesses.push({
      id: `skill:${skill.key}`,
      label: `${skill.definition.label} ${skill.rank}`,
      detail: `最终 ${skill.final}，六项能力里最低的一档。`,
      tone: 'rubric',
    });
  }
  if (!draft.house) {
    weaknesses.push({
      id: 'no-house',
      label: '没有家族归属',
      detail: labels.houseRecommended ? '当前身份通常需要家族背景，但不会因此获得领地或继承权。' : '没有族语、纹章与宗族关系可以借用。',
      tone: labels.houseRecommended ? 'rubric' : 'plain',
    });
  }
  if (draft.relations.length === 0) {
    weaknesses.push({ id: 'no-relations', label: '没有可以投靠的人', detail: '开局不会有熟人、雇主或效忠对象，可以在「关系」里补上。', tone: 'plain' });
  }
  if (!draft.freeMode && validation.remainingDesignPoints < 0) {
    weaknesses.push({
      id: 'over-budget',
      label: `设计点超出 ${Math.abs(validation.remainingDesignPoints)} 点`,
      detail: `当前配置已用 ${validation.usedDesignPoints} 点；开启自由模式或减少分配后才能开局。`,
      tone: 'rubric',
    });
  }

  const bodySkills = readouts.filter((skill) => skill.key === 'martial' || skill.key === 'prowess');
  const canDefendSelf = bodySkills.some((skill) => skill.final >= 12);
  let riskScore = 0;
  if (!draft.house) riskScore += 1;
  if (draft.relations.length === 0) riskScore += 1;
  if (draft.role === 'commoner' || draft.role === 'traveler') riskScore += 1;
  if (!canDefendSelf) riskScore += 1;
  if (draft.kinship) riskScore -= 1;
  const level: '低' | '中' | '高' = riskScore <= 1 ? '低' : riskScore <= 2 ? '中' : '高';
  const riskReasons: string[] = [];
  if (!draft.house) riskReasons.push('没有家族');
  if (draft.relations.length === 0) riskReasons.push('没有可以求助的关系');
  if (!canDefendSelf) riskReasons.push('军事与勇武都不算好');
  if (draft.role === 'commoner' || draft.role === 'traveler') riskReasons.push(`${labels.roleLabel}身份本身没有靠山`);
  if (draft.kinship) riskReasons.push('原著血缘是一份可用的凭据');

  return {
    headline: `${draft.age} 岁的${labels.roleLabel}`,
    summary: `${labels.originLabel}出身，${labels.experienceLabel}，如今靠${labels.livelihoodLabel}过活；第一幕落在${place}。`,
    strengths: strengths.slice(0, 5),
    weaknesses: weaknesses.slice(0, 5),
    standing: { title: draft.house ? `${labels.roleLabel} · ${draft.house.houseName}` : `${labels.roleLabel} · 无家族`, detail: `${labels.originLabel} · ${labels.livelihoodLabel}` },
    risk: {
      level,
      detail: riskReasons.length > 0 ? `${riskReasons.join('、')}。` : '家族、关系与身手都还过得去，开局没有明显短板。',
    },
    ties: [
      `出身：${labels.originLabel}`,
      `经历：${labels.experienceLabel}`,
      `生计：${labels.livelihoodLabel}`,
      `处境：${labels.situationLabel} · ${place}`,
    ],
  };
}

export function formatDelta(value: number): string {
  return `${value > 0 ? '+' : ''}${value}`;
}
