import type { CharacterId } from '../../domain/characterId';
import type { WorldLocationRef } from '../../domain/worldLocation';
import type { LordAttributes } from '../../types/game';
import type { CoatOfArmsDesign } from '../../data/heraldry';
import {
  CHARACTER_TRAITS,
  DESIGN_POINT_LIMIT,
  MAX_PERSONALITY_TRAITS,
  calculateFinalAttributes,
  isDerivedInjuryTraitId,
} from '../../data/characterTraits';
import { filterImportedCharacterTraits } from '../../data/importedCharacterTraitPolicy';
import { creationBudget, creationTraitBlock, creationTraitRequirement, isLearningTarget, learningRoute, MAX_LEARNING_TARGETS } from './creationTraitRules';

export const CUSTOM_START_DATE = { year: 298, month: 5, day: 10 } as const;
export const CUSTOM_START_MINUTE = 8 * 60;

export type CustomIdentityRole = 'commoner' | 'traveler' | 'retainer' | 'knight' | 'landless_noble';
export type CustomOrigin = 'smallfolk' | 'town' | 'household' | 'minor_nobility';
export type CustomExperience = 'household_service' | 'martial_training' | 'trade_travel' | 'academy_learning' | 'wandering_life';
export type CustomLivelihood = 'day_labor' | 'household_wage' | 'guard_work' | 'trade' | 'scribe_work';
export type CustomRelationKind = 'acquaintance' | 'employer' | 'fealty';
export type CustomKinshipKind = 'cadet_branch' | 'bastard_child';
export type CustomSituationKind = 'lodging' | 'awaiting_work' | 'arrival' | 'making_living';
export type CustomItemPackage = 'commoner' | 'traveler' | 'retainer' | 'knight' | 'scholar';

export interface CharacterCreationCatalogOption<T extends string> {
  id: T;
  label: string;
  description: string;
  impact?: string;
}

export interface CharacterCreationCatalog {
  schemaVersion: 1;
  roles: CharacterCreationCatalogOption<CustomIdentityRole>[];
  origins: CharacterCreationCatalogOption<CustomOrigin>[];
  experiences: CharacterCreationCatalogOption<CustomExperience>[];
  livelihoods: CharacterCreationCatalogOption<CustomLivelihood>[];
  situations: CharacterCreationCatalogOption<CustomSituationKind>[];
}

export const DEFAULT_CHARACTER_CREATION_CATALOG: CharacterCreationCatalog = {
  schemaVersion: 1,
  roles: [
    { id: 'commoner', label: '平民', description: '没有封地或贵族身份，以劳动、手艺与地方关系立足。', impact: '最低初始钱财；家族与纹章均可留空。' },
    { id: 'traveler', label: '旅人', description: '常年在道路、港口与客栈之间移动。', impact: '偏重随身补给、维修工具与机动性。' },
    { id: 'retainer', label: '家臣', description: '受雇于某个家宅、商号或贵族家庭。', impact: '适合建立雇主关系，并获得稳定但有限的盘缠。' },
    { id: 'knight', label: '骑士', description: '受过正式武艺训练、拥有身份声望，但没有自己的封地。', impact: '获得普通骑士武备，不获得领地或原著唯一武器。' },
    { id: 'landless_noble', label: '无地贵族', description: '出身贵族却没有可直接支配的领地。', impact: '家族身份更重要，初始钱财略高但没有封臣与领地产权。' },
  ],
  origins: [
    { id: 'smallfolk', label: '乡野人家', description: '在村庄、庄园或农舍中长大。', impact: '体魄与务实能力略有优势。' },
    { id: 'town', label: '城镇街巷', description: '熟悉市场、码头、手工业与人情往来。', impact: '外交与经营能力略有优势。' },
    { id: 'household', label: '家宅附属', description: '成长于较大的家宅、城堡或商人院落。', impact: '管事、礼仪与察言观色更熟练。' },
    { id: 'minor_nobility', label: '没落小贵族', description: '保留贵族教育与姓氏，却没有足以安身的产业。', impact: '学习与社交基础较好；不会自动获得土地。' },
  ],
  experiences: [
    { id: 'household_service', label: '家宅侍奉', description: '做过侍从、管事助手、贴身仆役或家宅差使。', impact: '建议勤勉；偏管事与交际。' },
    { id: 'martial_training', label: '武艺训练', description: '长期接受武器、骑乘、护卫或军伍训练。', impact: '建议勇敢与武艺教育；偏军事与勇武。' },
    { id: 'trade_travel', label: '商旅谋生', description: '随商队、船队或市场买卖积累经验。', impact: '建议合群；偏经营、交涉与旅行装备。' },
    { id: 'academy_learning', label: '书院学习', description: '在学士、修士、书记或私人教师身边系统学习。', impact: '建议耐心与学习教育；获得普通书册而非唯一藏品。' },
    { id: 'wandering_life', label: '漂泊生活', description: '长期没有固定住处，在道路与陌生聚落中求生。', impact: '偏洞察、勇武与轻装出行。' },
  ],
  livelihoods: [
    { id: 'day_labor', label: '零工与手艺', description: '靠短工、手艺或季节性劳动过活。', impact: '钱少但没有固定雇主。' },
    { id: 'household_wage', label: '家宅薪俸', description: '靠长期家宅服务领取食宿或薪俸。', impact: '较适合家臣与雇主关系。' },
    { id: 'guard_work', label: '护卫差事', description: '靠护卫、巡逻、押运或武艺吃饭。', impact: '钱财中等，骑士与武艺经历装备更完整。' },
    { id: 'trade', label: '商旅买卖', description: '靠货运、跑商、引路或中间交易谋生。', impact: '盘缠较多，旅人更容易拥有驮运工具。' },
    { id: 'scribe_work', label: '书记与教习', description: '靠读写、记账、抄写或教学换取收入。', impact: '书院出身获得普通书册与书写用品倾向。' },
  ],
  situations: [
    { id: 'lodging', label: '借宿', description: '目前暂住在他人的屋檐、客房或租来的床位。', impact: '存在一处有限的临时储藏位置。' },
    { id: 'awaiting_work', label: '候差', description: '已经来到此地，正在等候工作、雇主或下一班差事。', impact: '眼前没有被程序强制指定的危机或任务。' },
    { id: 'arrival', label: '抵达', description: '刚到此地，尚未决定下一步如何落脚。', impact: '大多数物品仍在身上或随行载具中。' },
    { id: 'making_living', label: '谋生', description: '已在本地短期谋生，但尚未形成稳定产业。', impact: '可以从熟悉的日常环境开始第一幕。' },
  ],
};

export interface CreationHouseDraft {
  houseId: string;
  houseName: string;
  dynastyName: string;
  houseWords: string;
  houseSigil: string;
  coatOfArms?: CoatOfArmsDesign;
}

export interface CreationRelationDraft {
  kind: CustomRelationKind;
  targetId: CharacterId;
  targetName: string;
  targetAge?: number;
  targetLocationId?: string;
}

export interface CreationKinshipDraft {
  kind: CustomKinshipKind;
  targetId: CharacterId;
  targetName: string;
  targetAge?: number;
  targetLocationId?: string;
  publiclyKnown: boolean;
  knowerIds: CharacterId[];
}

export interface CharacterCreationDraft {
  schemaVersion: 1;
  selectionRulesVersion?: 2;
  /** 成长方向不是已掌握特质，不参与开局效果与计费。 */
  learningTraitIds?: string[];
  traitBackgrounds?: Record<string, string>;
  educationMode?: 'background' | 'manual';
  attributeAdjustments?: Partial<LordAttributes>;
  role: CustomIdentityRole;
  name: string;
  age: number;
  gender: '男' | '女';
  culture: string;
  faith: string;
  house?: CreationHouseDraft;
  origin: CustomOrigin;
  experience: CustomExperience;
  livelihood: CustomLivelihood;
  attributes: LordAttributes;
  traitIds: string[];
  /** 由当前主要经历自动授予的特质。单独记录来源，切换背景时可保留玩家手选特质。 */
  backgroundTraitIds?: string[];
  /** 玩家主动取消过的背景授予特质；背景变化时不强行加回。 */
  suppressedBackgroundTraitIds?: string[];
  freeMode: boolean;
  relations: CreationRelationDraft[];
  kinship?: CreationKinshipDraft;
  situation: CustomSituationKind;
  location?: {
    locationId: string;
    name: string;
    regionId?: string;
    type?: string;
  };
}

export interface CustomRelationshipFact {
  id: string;
  kind: CustomRelationKind | CustomKinshipKind;
  participantIds: CharacterId[];
  summary: string;
  publiclyKnown: boolean;
  heardByIds: CharacterId[];
  source: 'background';
  lineage?: {
    parentId: CharacterId;
    childId: CharacterId;
    legitimacy: 'recognized' | 'bastard';
  };
}

export interface CustomCharacterRuntimeRecord {
  id: CharacterId;
  name: string;
  fictional: true;
  birthYear: number;
  ageAtStart: number;
  gender: string;
  role: CustomIdentityRole;
  culture: string;
  faith: string;
  houseName?: string;
  dynastyName?: string;
  houseSigil?: string;
  location: WorldLocationRef;
  attributes: LordAttributes;
  traitIds: string[];
  relationIds: string[];
}

export interface CustomCharacterOverlayState {
  schemaVersion: 1;
  records: Record<CharacterId, CustomCharacterRuntimeRecord>;
  relationships: CustomRelationshipFact[];
}

export interface OpeningCharacterFact {
  id: CharacterId;
  name: string;
  role: 'player' | 'present_npc' | 'related_npc';
}

export interface OpeningFacts {
  schemaVersion: 1;
  date: typeof CUSTOM_START_DATE;
  minuteOfDay: number;
  playerId: CharacterId;
  playerName: string;
  roleLabel: string;
  location: WorldLocationRef;
  locationLabel: string;
  situationKind: CustomSituationKind;
  situationLabel: string;
  situationSummary: string;
  backgroundFacts: string[];
  knownRelationships: CustomRelationshipFact[];
  presentCharacters: OpeningCharacterFact[];
  privateFacts: string[];
  publicFacts: string[];
}

export interface ResolvedCustomStart {
  schemaVersion: 1;
  runId: string;
  playerId: CharacterId;
  draft: CharacterCreationDraft;
  roleLabel: string;
  title: string;
  houseName: string;
  dynastyName: string;
  houseWords: string;
  houseSigil: string;
  coatOfArms?: CoatOfArmsDesign;
  location: WorldLocationRef;
  locationLabel: string;
  baseAttributes: LordAttributes;
  attributes: LordAttributes;
  traitIds: string[];
  goldDragons: number;
  silverStags: number;
  itemPackage: CustomItemPackage;
  relationshipFacts: CustomRelationshipFact[];
  characterOverlay: CustomCharacterOverlayState;
  openingFacts: OpeningFacts;
}

export interface CharacterCreationValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  usedDesignPoints: number;
  remainingDesignPoints: number;
  budget: ReturnType<typeof creationBudget>;
}

const ROLE_LABELS: Record<CustomIdentityRole, string> = {
  commoner: '平民',
  traveler: '旅人',
  retainer: '家臣',
  knight: '骑士',
  landless_noble: '无地贵族',
};

const ROLE_TITLES: Record<CustomIdentityRole, string> = {
  commoner: '无头衔',
  traveler: '无地旅人',
  retainer: '受雇家臣',
  knight: '无地骑士',
  landless_noble: '无地贵族',
};

const EXPERIENCE_BASE: Record<CustomExperience, LordAttributes> = {
  household_service: { diplomacy: 11, martial: 8, stewardship: 13, intrigue: 10, learning: 9, prowess: 8 },
  martial_training: { diplomacy: 8, martial: 14, stewardship: 9, intrigue: 8, learning: 8, prowess: 14 },
  trade_travel: { diplomacy: 12, martial: 8, stewardship: 14, intrigue: 10, learning: 9, prowess: 9 },
  academy_learning: { diplomacy: 10, martial: 7, stewardship: 11, intrigue: 8, learning: 15, prowess: 7 },
  wandering_life: { diplomacy: 9, martial: 11, stewardship: 9, intrigue: 12, learning: 8, prowess: 12 },
};

const EXPERIENCE_TRAITS: Record<CustomExperience, string[]> = {
  household_service: ['education_stewardship_2'],
  martial_training: ['education_martial_2'],
  trade_travel: ['education_diplomacy_2'],
  academy_learning: ['education_learning_2'],
  wandering_life: [],
};

interface BackgroundTraitAffinityRule {
  traitId: string;
  score: number;
  reason: string;
}

export interface BackgroundTraitRecommendation {
  traitId: string;
  score: number;
  reasons: string[];
  grantedByBackground: boolean;
}

const ROLE_TRAIT_AFFINITY: Record<CustomIdentityRole, BackgroundTraitAffinityRule[]> = {
  commoner: [
    { traitId: 'humble', score: 2, reason: '平民身份' },
    { traitId: 'diligent', score: 1, reason: '平民身份' },
  ],
  traveler: [
    { traitId: 'patient', score: 2, reason: '旅人身份' },
    { traitId: 'gregarious', score: 1, reason: '旅人身份' },
  ],
  retainer: [
    { traitId: 'diligent', score: 2, reason: '家臣身份' },
    { traitId: 'honest', score: 1, reason: '家臣身份' },
  ],
  knight: [
    { traitId: 'brave', score: 3, reason: '骑士身份' },
    { traitId: 'just', score: 1, reason: '骑士身份' },
    { traitId: 'education_martial_2', score: 1, reason: '骑士身份' },
  ],
  landless_noble: [
    { traitId: 'ambitious', score: 2, reason: '无地贵族身份' },
    { traitId: 'gregarious', score: 1, reason: '无地贵族身份' },
    { traitId: 'education_diplomacy_2', score: 1, reason: '无地贵族身份' },
  ],
};

const ORIGIN_TRAIT_AFFINITY: Record<CustomOrigin, BackgroundTraitAffinityRule[]> = {
  smallfolk: [
    { traitId: 'humble', score: 2, reason: '乡野平民出身' },
    { traitId: 'diligent', score: 1, reason: '乡野平民出身' },
  ],
  town: [
    { traitId: 'gregarious', score: 2, reason: '城镇出身' },
    { traitId: 'greedy', score: 1, reason: '城镇出身' },
  ],
  household: [
    { traitId: 'patient', score: 2, reason: '家宅侍奉出身' },
    { traitId: 'honest', score: 1, reason: '家宅侍奉出身' },
  ],
  minor_nobility: [
    { traitId: 'ambitious', score: 2, reason: '小贵族出身' },
    { traitId: 'education_diplomacy_1', score: 1, reason: '小贵族出身' },
  ],
};

const LIVELIHOOD_TRAIT_AFFINITY: Record<CustomLivelihood, BackgroundTraitAffinityRule[]> = {
  day_labor: [{ traitId: 'diligent', score: 2, reason: '靠日工谋生' }],
  household_wage: [
    { traitId: 'diligent', score: 2, reason: '领取家宅薪俸' },
    { traitId: 'patient', score: 1, reason: '领取家宅薪俸' },
  ],
  guard_work: [
    { traitId: 'brave', score: 2, reason: '护卫生计' },
    { traitId: 'education_martial_1', score: 1, reason: '护卫生计' },
  ],
  trade: [
    { traitId: 'gregarious', score: 2, reason: '贸易生计' },
    { traitId: 'greedy', score: 1, reason: '贸易生计' },
  ],
  scribe_work: [
    { traitId: 'patient', score: 2, reason: '书记生计' },
    { traitId: 'education_learning_1', score: 1, reason: '书记生计' },
  ],
};

const EXPERIENCE_TRAIT_AFFINITY: Record<CustomExperience, BackgroundTraitAffinityRule[]> = {
  household_service: [{ traitId: 'diligent', score: 3, reason: '家宅服役经历' }],
  martial_training: [
    { traitId: 'brave', score: 3, reason: '武艺训练经历' },
    { traitId: 'education_martial_2', score: 3, reason: '武艺训练经历' },
  ],
  trade_travel: [{ traitId: 'gregarious', score: 3, reason: '商旅经历' }],
  academy_learning: [
    { traitId: 'patient', score: 3, reason: '学院学习经历' },
    { traitId: 'education_learning_2', score: 3, reason: '学院学习经历' },
  ],
  wandering_life: [
    { traitId: 'patient', score: 3, reason: '漂泊经历' },
    { traitId: 'brave', score: 1, reason: '漂泊经历' },
  ],
};

const ORIGIN_BONUS: Record<CustomOrigin, Partial<LordAttributes>> = {
  smallfolk: { stewardship: 1, prowess: 1 },
  town: { diplomacy: 1, stewardship: 1 },
  household: { diplomacy: 1, intrigue: 1 },
  minor_nobility: { diplomacy: 1, learning: 1 },
};

const LIVELIHOOD_BONUS: Record<CustomLivelihood, Partial<LordAttributes>> = {
  day_labor: { prowess: 1 },
  household_wage: { stewardship: 1 },
  guard_work: { martial: 1, prowess: 1 },
  trade: { diplomacy: 1, stewardship: 1 },
  scribe_work: { learning: 1 },
};

const ROLE_BONUS: Record<CustomIdentityRole, Partial<LordAttributes>> = {
  commoner: {},
  traveler: { intrigue: 1 },
  retainer: { stewardship: 1 },
  knight: { martial: 1, prowess: 1 },
  landless_noble: { diplomacy: 1 },
};

const cloneAttributes = (value: LordAttributes): LordAttributes => ({ ...value });
const clampStat = (value: number): number => Math.max(0, Math.min(30, Math.round(value)));

export function suggestedBackgroundAttributes(draft: Pick<CharacterCreationDraft, 'experience' | 'origin' | 'livelihood' | 'role'>): LordAttributes {
  const result = cloneAttributes(EXPERIENCE_BASE[draft.experience]);
  for (const bonus of [ORIGIN_BONUS[draft.origin], LIVELIHOOD_BONUS[draft.livelihood], ROLE_BONUS[draft.role]]) {
    for (const [key, value] of Object.entries(bonus) as Array<[keyof LordAttributes, number]>) result[key] = clampStat(result[key] + value);
  }
  return result;
}

export function suggestedBackgroundTraitIds(experience: CustomExperience): string[] {
  return [...EXPERIENCE_TRAITS[experience]];
}

/** 汇总身份、出身、经历和生计对人物特质的契合度；不额外重复施加属性加成。 */
export function backgroundTraitRecommendations(
  draft: Pick<CharacterCreationDraft, 'role' | 'origin' | 'experience' | 'livelihood' | 'age'>,
): BackgroundTraitRecommendation[] {
  const merged = new Map<string, BackgroundTraitRecommendation>();
  const granted = new Set(suggestedBackgroundTraitIds(draft.experience));
  const rules = [
    ...ROLE_TRAIT_AFFINITY[draft.role],
    ...ORIGIN_TRAIT_AFFINITY[draft.origin],
    ...EXPERIENCE_TRAIT_AFFINITY[draft.experience],
    ...LIVELIHOOD_TRAIT_AFFINITY[draft.livelihood],
  ];
  for (const rule of rules) {
    if (!legalTraitIdsForAge([rule.traitId], draft.age).traitIds.includes(rule.traitId)) continue;
    const current = merged.get(rule.traitId) ?? {
      traitId: rule.traitId,
      score: 0,
      reasons: [],
      grantedByBackground: granted.has(rule.traitId),
    };
    current.score += rule.score;
    if (!current.reasons.includes(rule.reason)) current.reasons.push(rule.reason);
    current.grantedByBackground ||= granted.has(rule.traitId);
    merged.set(rule.traitId, current);
  }
  return [...merged.values()].sort((a, b) => b.score - a.score || a.traitId.localeCompare(b.traitId));
}

function traitConflict(leftId: string, rightId: string): boolean {
  if (leftId === rightId) return false;
  const left = CHARACTER_TRAITS.find((entry) => entry.id === leftId);
  const right = CHARACTER_TRAITS.find((entry) => entry.id === rightId);
  if (!left || !right) return false;
  return Boolean(
    (left.exclusiveGroup && left.exclusiveGroup === right.exclusiveGroup)
    || left.incompatibleTraitIds?.includes(rightId)
    || right.incompatibleTraitIds?.includes(leftId),
  );
}

export function legalTraitIdsForAge(traitIds: readonly string[], age: number): { traitIds: string[]; removed: string[] } {
  const result: string[] = [];
  const removed: string[] = [];
  for (const id of traitIds) {
    if (result.includes(id)) continue;
    const trait = CHARACTER_TRAITS.find((entry) => entry.id === id);
    if (!trait || isDerivedInjuryTraitId(id) || !filterImportedCharacterTraits([id], age).visibleTraitIds.includes(id)) {
      removed.push(id);
      continue;
    }
    if (result.some((selected) => traitConflict(selected, id))) {
      removed.push(id);
      continue;
    }
    if (trait.category === 'personality') {
      const personalityCount = result.filter((selected) => CHARACTER_TRAITS.find((entry) => entry.id === selected)?.category === 'personality').length;
      if (personalityCount >= MAX_PERSONALITY_TRAITS) {
        removed.push(id);
        continue;
      }
    }
    result.push(id);
  }
  return { traitIds: result, removed };
}

export function rebaseDraftForBackground(
  previous: CharacterCreationDraft,
  nextBackground: Pick<CharacterCreationDraft, 'role' | 'origin' | 'experience' | 'livelihood'>,
): { draft: CharacterCreationDraft; invalidated: string[] } {
  const oldBase = suggestedBackgroundAttributes(previous);
  const provisional = { ...previous, ...nextBackground };
  const nextBase = suggestedBackgroundAttributes(provisional);
  const invalidated: string[] = [];
  const attributes = cloneAttributes(nextBase);
  for (const key of Object.keys(attributes) as Array<keyof LordAttributes>) {
    const manualDelta = previous.attributeAdjustments?.[key] ?? previous.attributes[key] - oldBase[key];
    const rebased = nextBase[key] + manualDelta;
    attributes[key] = clampStat(rebased);
    if (attributes[key] !== rebased) invalidated.push(`${key} 的手动调整超出 0—30，已截断`);
  }
  const previousBackgroundTraitIds = new Set((previous.backgroundTraitIds ?? []).filter((id) => CHARACTER_TRAITS.find((trait) => trait.id === id)?.category === 'education'));
  const suppressedBackgroundTraitIds = new Set(previous.suppressedBackgroundTraitIds ?? []);
  const manualTraitIds = previous.traitIds.filter((id) => !previousBackgroundTraitIds.has(id));
  const manualEducation = previous.educationMode === 'manual' || manualTraitIds.some((id) => CHARACTER_TRAITS.find((trait) => trait.id === id)?.category === 'education');
  const nextBackgroundTraitIds = (manualEducation ? [] : suggestedBackgroundTraitIds(provisional.experience))
    .filter((id) => !suppressedBackgroundTraitIds.has(id));
  const legal = legalTraitIdsForAge([...manualTraitIds, ...nextBackgroundTraitIds], previous.age);
  for (const removed of legal.removed) {
    const name = CHARACTER_TRAITS.find((entry) => entry.id === removed)?.name ?? removed;
    invalidated.push(`特质“${name}”与新的配置或年龄不相容，已移除`);
  }
  return {
    draft: {
      ...provisional,
      attributes,
      attributeAdjustments: Object.fromEntries(Object.keys(attributes).map((key) => [key, previous.attributeAdjustments?.[key as keyof LordAttributes] ?? previous.attributes[key as keyof LordAttributes] - oldBase[key as keyof LordAttributes]])),
      traitIds: legal.traitIds,
      backgroundTraitIds: nextBackgroundTraitIds.filter((id) => legal.traitIds.includes(id)),
      suppressedBackgroundTraitIds: [...suppressedBackgroundTraitIds],
    },
    invalidated,
  };
}

export function createDefaultCharacterCreationDraft(): CharacterCreationDraft {
  const shell: CharacterCreationDraft = {
    schemaVersion: 1,
    selectionRulesVersion: 2,
    learningTraitIds: [],
    traitBackgrounds: {},
    educationMode: 'background',
    role: 'commoner',
    name: '无名旅者',
    age: 24,
    gender: '男',
    culture: '安达尔人',
    faith: '七神信仰',
    origin: 'smallfolk',
    experience: 'household_service',
    livelihood: 'day_labor',
    attributes: { diplomacy: 0, martial: 0, stewardship: 0, intrigue: 0, learning: 0, prowess: 0 },
    traitIds: [],
    backgroundTraitIds: [],
    suppressedBackgroundTraitIds: [],
    freeMode: false,
    relations: [],
    situation: 'arrival',
  };
  shell.attributes = suggestedBackgroundAttributes(shell);
  shell.traitIds = suggestedBackgroundTraitIds(shell.experience);
  shell.backgroundTraitIds = [...shell.traitIds];
  return shell;
}

function economyFor(draft: CharacterCreationDraft): { gold: number; silver: number } {
  const roleGold: Record<CustomIdentityRole, number> = { commoner: 0, traveler: 1, retainer: 1, knight: 5, landless_noble: 8 };
  const roleSilver: Record<CustomIdentityRole, number> = { commoner: 18, traveler: 28, retainer: 36, knight: 42, landless_noble: 60 };
  const livelihoodGold: Record<CustomLivelihood, number> = { day_labor: 0, household_wage: 0, guard_work: 1, trade: 3, scribe_work: 1 };
  const livelihoodSilver: Record<CustomLivelihood, number> = { day_labor: 4, household_wage: 10, guard_work: 12, trade: 18, scribe_work: 9 };
  return { gold: roleGold[draft.role] + livelihoodGold[draft.livelihood], silver: roleSilver[draft.role] + livelihoodSilver[draft.livelihood] };
}

function itemPackageFor(draft: CharacterCreationDraft): CustomItemPackage {
  if (draft.role === 'knight' || draft.experience === 'martial_training' && draft.livelihood === 'guard_work') return 'knight';
  if (draft.experience === 'academy_learning' || draft.livelihood === 'scribe_work') return 'scholar';
  if (draft.role === 'traveler' || draft.experience === 'trade_travel' || draft.experience === 'wandering_life') return 'traveler';
  if (draft.role === 'retainer' || draft.livelihood === 'household_wage') return 'retainer';
  return 'commoner';
}

function situationSummary(draft: CharacterCreationDraft): string {
  const place = draft.location?.name ?? '所选地点';
  switch (draft.situation) {
    case 'lodging': return `你暂时借宿在${place}，有一处只能放个人物品的临时储藏位置。`;
    case 'awaiting_work': return `你正在${place}候差，眼下没有已经替你接受的任务或承诺。`;
    case 'arrival': return `你刚刚抵达${place}，还没有决定下一步去处或长期安排。`;
    case 'making_living': return `你正在${place}靠当前生计谋生，日子尚未稳定下来。`;
  }
}

function localOpeningNpc(draft: CharacterCreationDraft, runId: string, location: WorldLocationRef): CustomCharacterRuntimeRecord {
  const bySituation: Record<CustomSituationKind, { name: string; age: number; role: CustomIdentityRole }> = {
    lodging: { name: '玛拉', age: 38, role: 'commoner' },
    awaiting_work: { name: '哈罗德', age: 34, role: 'retainer' },
    arrival: { name: '托姆', age: 29, role: 'traveler' },
    making_living: { name: '梅格', age: 31, role: 'commoner' },
  };
  const profile = bySituation[draft.situation];
  return {
    id: `save:${runId}:local:1` as CharacterId,
    name: profile.name,
    fictional: true,
    birthYear: CUSTOM_START_DATE.year - profile.age,
    ageAtStart: profile.age,
    gender: profile.name === '玛拉' || profile.name === '梅格' ? '女' : '男',
    role: profile.role,
    culture: draft.culture,
    faith: draft.faith,
    location: { ...location },
    attributes: { diplomacy: 8, martial: 7, stewardship: 9, intrigue: 8, learning: 7, prowess: 8 },
    traitIds: [],
    relationIds: [],
  };
}

export function validateCharacterCreationDraft(draft: CharacterCreationDraft): CharacterCreationValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const name = draft.name.trim();
  if (!name) errors.push('姓名不能为空');
  if (!Number.isInteger(draft.age) || draft.age < 16 || draft.age > 100) errors.push('年龄必须在 16—100 岁之间');
  if (!draft.culture.trim()) errors.push('必须选择文化');
  if (!draft.faith.trim()) errors.push('必须选择信仰');
  if (!draft.location?.locationId || !draft.location.name.trim()) errors.push('必须选择有效的真实地点');
  for (const [key, value] of Object.entries(draft.attributes) as Array<[keyof LordAttributes, number]>) {
    if (!Number.isInteger(value) || value < 0 || value > 30) errors.push(`${key} 必须是 0—30 的整数`);
  }
  const legal = legalTraitIdsForAge(draft.traitIds, draft.age);
  if (legal.removed.length) errors.push('存在年龄不适用、互斥或超过性格上限的特质');
  for (const trait of CHARACTER_TRAITS.filter((entry) => draft.traitIds.includes(entry.id))) {
    const issue = creationTraitBlock(trait, draft) ?? creationTraitRequirement(trait, draft);
    if (issue) errors.push(`${trait.name}：${issue}`);
  }
  if (new Set(draft.traitIds).size !== draft.traitIds.length) errors.push('存在重复特质');
  const learningTargets = draft.learningTraitIds ?? [];
  if (learningTargets.length > MAX_LEARNING_TARGETS || new Set(learningTargets).size !== learningTargets.length) errors.push('最多设置两个不同的成长方向');
  for (const id of learningTargets) {
    const target = CHARACTER_TRAITS.find((trait) => trait.id === id);
    if (!target || !isLearningTarget(target) || creationTraitBlock(target, draft) || draft.traitIds.includes(id)) errors.push('成长方向必须是尚未掌握、适用于当前年龄的本事');
  }
  const uniqueTargets = new Set<string>();
  for (const relation of draft.relations) {
    if (!relation.targetId || !relation.targetName.trim()) errors.push('关系人物引用无效');
    const key = `${relation.kind}:${relation.targetId}`;
    if (uniqueTargets.has(key)) errors.push('存在重复的初始关系');
    uniqueTargets.add(key);
  }
  if (draft.kinship) {
    if (!String(draft.kinship.targetId).startsWith('agot:')) errors.push('旁支或私生血亲必须连接到原著静态人物');
    if (draft.kinship.targetAge !== undefined) {
      const requiredGap = draft.kinship.kind === 'cadet_branch' ? 32 : 16;
      if (draft.kinship.targetAge - draft.age < requiredGap) {
        errors.push(draft.kinship.kind === 'cadet_branch'
          ? '旁支年代冲突：新增旁支至少需要一代中间亲属，原著人物与玩家年龄差必须达到 32 岁'
          : '亲子年代冲突：所选原著人物在玩家出生时不足 16 岁');
      }
    }
    if (draft.kinship.knowerIds.includes(`save:pending:player` as CharacterId)) warnings.push('玩家本人无需重复加入私生身份知情者');
  }
  const budget = creationBudget(draft.attributes, draft.traitIds);
  const usedDesignPoints = budget.total;
  if (!draft.freeMode && usedDesignPoints > DESIGN_POINT_LIMIT) errors.push(`设计点数超出 ${DESIGN_POINT_LIMIT} 点预算`);
  if (draft.role === 'commoner' && draft.house) warnings.push('平民可以保留家族背景，但不会因此自动获得贵族权利');
  return { valid: errors.length === 0, errors, warnings, budget, usedDesignPoints, remainingDesignPoints: DESIGN_POINT_LIMIT - usedDesignPoints };
}

export function resolveCharacterCreationDraft(draft: CharacterCreationDraft, runId: string): ResolvedCustomStart {
  const validation = validateCharacterCreationDraft(draft);
  if (!validation.valid) throw new Error(validation.errors.join('；'));
  if (!/^run_[a-z0-9_]+$/i.test(runId)) throw new Error('无效的本周目运行 ID');
  const location = { locationId: draft.location!.locationId, sceneLocation: DEFAULT_CHARACTER_CREATION_CATALOG.situations.find((entry) => entry.id === draft.situation)?.label };
  const locationLabel = `${draft.location!.name} · ${location.sceneLocation}`;
  const playerId = `save:${runId}:player` as CharacterId;
  const baseAttributes = suggestedBackgroundAttributes(draft);
  const attributes = calculateFinalAttributes(draft.attributes, draft.traitIds);
  const economy = economyFor(draft);
  const roleLabel = ROLE_LABELS[draft.role];
  const houseName = draft.house?.houseName || '无家族';
  const dynastyName = draft.house?.dynastyName || houseName;
  const relationshipFacts: CustomRelationshipFact[] = draft.relations.map((relation, index) => ({
    id: `start:${runId}:relation:${index}`,
    kind: relation.kind,
    participantIds: [playerId, relation.targetId],
    summary: relation.kind === 'acquaintance'
      ? `${draft.name}与${relation.targetName}在开局前已经相识。`
      : relation.kind === 'employer'
        ? `${relation.targetName}是${draft.name}当前或近期的雇主。`
        : `${draft.name}已经向${relation.targetName}承担个人效忠关系，但这不授予土地或继承权。`,
    publiclyKnown: true,
    heardByIds: [playerId, relation.targetId],
    source: 'background' as const,
  }));
  let kinBridge: CustomCharacterRuntimeRecord | undefined;
  if (draft.kinship) {
    const heardByIds = [...new Set<CharacterId>([playerId, draft.kinship.targetId, ...draft.kinship.knowerIds])];
    if (draft.kinship.kind === 'bastard_child') {
      relationshipFacts.push({
        id: `start:${runId}:kinship`,
        kind: draft.kinship.kind,
        participantIds: [playerId, draft.kinship.targetId],
        summary: `${draft.name}被设定为${draft.kinship.targetName}的私生子女；这是本周目的架空亲属设定。`,
        publiclyKnown: draft.kinship.publiclyKnown,
        heardByIds,
        source: 'background',
        lineage: { parentId: draft.kinship.targetId, childId: playerId, legitimacy: 'bastard' },
      });
    } else {
      const bridgeId = `save:${runId}:kin:1` as CharacterId;
      const bridgeAge = draft.age + 16;
      kinBridge = {
        id: bridgeId,
        name: `${draft.kinship.targetName}旁支亲属`,
        fictional: true,
        birthYear: CUSTOM_START_DATE.year - bridgeAge,
        ageAtStart: bridgeAge,
        gender: '男',
        role: 'landless_noble',
        culture: draft.culture,
        faith: draft.faith,
        ...(draft.house ? { houseName, dynastyName, houseSigil: draft.house.houseSigil } : {}),
        location: { locationId: draft.kinship.targetLocationId ?? draft.location!.locationId },
        attributes: { diplomacy: 9, martial: 8, stewardship: 10, intrigue: 8, learning: 9, prowess: 8 },
        traitIds: [],
        relationIds: [`start:${runId}:kinship:root`, `start:${runId}:kinship:player`],
      };
      relationshipFacts.push(
        {
          id: `start:${runId}:kinship:root`,
          kind: 'cadet_branch',
          participantIds: [draft.kinship.targetId, bridgeId],
          summary: `${kinBridge.name}是${draft.kinship.targetName}在本周目新增的旁支子女。`,
          publiclyKnown: true,
          heardByIds: [...new Set<CharacterId>([...heardByIds, bridgeId])],
          source: 'background',
          lineage: { parentId: draft.kinship.targetId, childId: bridgeId, legitimacy: 'recognized' },
        },
        {
          id: `start:${runId}:kinship:player`,
          kind: 'cadet_branch',
          participantIds: [bridgeId, playerId],
          summary: `${draft.name}是${kinBridge.name}的子女，因此通过一条可解析的新增亲属链连接到${draft.kinship.targetName}的原著家族。`,
          publiclyKnown: true,
          heardByIds: [...new Set<CharacterId>([...heardByIds, bridgeId])],
          source: 'background',
          lineage: { parentId: bridgeId, childId: playerId, legitimacy: 'recognized' },
        },
      );
    }
  }
  const record: CustomCharacterRuntimeRecord = {
    id: playerId,
    name: draft.name.trim(),
    fictional: true,
    birthYear: CUSTOM_START_DATE.year - draft.age,
    ageAtStart: draft.age,
    gender: draft.gender,
    role: draft.role,
    culture: draft.culture,
    faith: draft.faith,
    ...(draft.house ? { houseName, dynastyName, houseSigil: draft.house.houseSigil } : {}),
    location: { ...location },
    attributes: { ...attributes },
    traitIds: [...draft.traitIds],
    relationIds: relationshipFacts.map((entry) => entry.id),
  };
  const localNpc = localOpeningNpc(draft, runId, location);
  const privateFacts = relationshipFacts.filter((entry) => !entry.publiclyKnown).map((entry) => `${entry.summary} 仅限知情者，不得让无关 NPC 凭空知晓。`);
  const publicFacts = [
    ...CHARACTER_TRAITS.filter((trait) => draft.traitIds.includes(trait.id) && draft.traitBackgrounds?.[trait.id]?.trim()).map((trait) => `${trait.name}的公开背景：${draft.traitBackgrounds![trait.id].trim()}`),
    `${draft.name}是${roleLabel}，没有由创建器自动授予的封地。`,
    `${draft.name}目前位于${draft.location!.name}。`,
    ...relationshipFacts.filter((entry) => entry.publiclyKnown).map((entry) => entry.summary),
  ];
  return {
    schemaVersion: 1,
    runId,
    playerId,
    draft: structuredClone(draft),
    roleLabel,
    title: ROLE_TITLES[draft.role],
    houseName,
    dynastyName,
    houseWords: draft.house?.houseWords || '—',
    houseSigil: draft.house?.houseSigil || 'unknown',
    ...(draft.house?.coatOfArms ? { coatOfArms: structuredClone(draft.house.coatOfArms) } : {}),
    location,
    locationLabel,
    baseAttributes,
    attributes,
    traitIds: [...draft.traitIds],
    goldDragons: economy.gold,
    silverStags: economy.silver,
    itemPackage: itemPackageFor(draft),
    relationshipFacts,
    characterOverlay: {
      schemaVersion: 1,
      records: {
        [playerId]: record,
        [localNpc.id]: localNpc,
        ...(kinBridge ? { [kinBridge.id]: kinBridge } : {}),
      } as Record<CharacterId, CustomCharacterRuntimeRecord>,
      relationships: relationshipFacts,
    },
    openingFacts: {
      schemaVersion: 1,
      date: { ...CUSTOM_START_DATE },
      minuteOfDay: CUSTOM_START_MINUTE,
      playerId,
      playerName: draft.name.trim(),
      roleLabel,
      location: { ...location },
      locationLabel,
      situationKind: draft.situation,
      situationLabel: location.sceneLocation || '当前处境',
      situationSummary: situationSummary(draft),
      backgroundFacts: [
        ...(draft.learningTraitIds ?? []).map((id) => CHARACTER_TRAITS.find((trait) => trait.id === id)).filter((trait): trait is NonNullable<typeof trait> => Boolean(trait)).map((trait) => `计划学习（尚未掌握）：${learningRoute(trait)}`),
        `出身：${DEFAULT_CHARACTER_CREATION_CATALOG.origins.find((entry) => entry.id === draft.origin)?.label ?? draft.origin}`,
        `主要经历：${DEFAULT_CHARACTER_CREATION_CATALOG.experiences.find((entry) => entry.id === draft.experience)?.label ?? draft.experience}`,
        `当前生计：${DEFAULT_CHARACTER_CREATION_CATALOG.livelihoods.find((entry) => entry.id === draft.livelihood)?.label ?? draft.livelihood}`,
      ],
      knownRelationships: structuredClone(relationshipFacts),
      presentCharacters: [
        { id: playerId, name: draft.name.trim(), role: 'player' },
        { id: localNpc.id, name: localNpc.name, role: 'present_npc' },
      ],
      privateFacts,
      publicFacts,
    },
  };
}

export function createCustomRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
