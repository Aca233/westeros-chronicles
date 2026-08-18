import type { GameIconId } from '../components/GameIcon';
import type { LordAttributes } from '../types/game';
import { CK3_TRAIT_DESCRIPTIONS } from './ck3TraitDescriptions';
import { AGOT_TRAIT_DESCRIPTIONS } from './agotTraitDescriptions';
import { CHARACTER_TRAIT_RULES } from './characterTraitEffects';
import { IMPORTED_CHARACTER_TRAIT_DEFINITIONS } from './importedCharacterTraitDefinitions';
import {
  AggregatedTraitEffects,
  TraitCheckDomain,
  TraitRuleSet,
  aggregateTraitRuleEffects,
  formatSignedPercent,
} from '../services/traitEffectEngine';

export const DESIGN_POINT_LIMIT = 400;
export const MAX_PERSONALITY_TRAITS = 3;
export const MIN_CHARACTER_TRAIT_COUNT = 100;

export type TraitCategory = 'personality' | 'education' | 'lifestyle' | 'congenital' | 'health' | 'fame';
export type TraitSource = 'ck3' | 'agot';

export interface CharacterTraitDefinition {
  id: string;
  name: string;
  category: TraitCategory;
  description: string;
  cost: number;
  icon: GameIconId;
  modifiers: Partial<LordAttributes>;
  exclusiveGroup?: string;
  incompatibleTraitIds?: readonly string[];
  source?: TraitSource;
  rules: TraitRuleSet;
}

export type BaseCharacterTraitDefinition = Omit<CharacterTraitDefinition, 'rules'>;

export interface HouseIdentity {
  culture: string;
  faith: string;
}

export const TRAIT_CATEGORY_LABELS: Record<TraitCategory, string> = {
  personality: '性格特质',
  education: '教育特质',
  lifestyle: '生活方式',
  congenital: '先天特质',
  health: '健康特质',
  fame: '名声特质',
};

const CHARACTER_TRAIT_DEFINITIONS: readonly BaseCharacterTraitDefinition[] = [
  { id: 'brave', name: '勇敢', category: 'personality', cost: 40, icon: 'trait-brave', exclusiveGroup: 'courage',
    description: '在危险与战斗面前毫不退缩。', modifiers: { martial: 2, prowess: 3 } },
  { id: 'craven', name: '怯懦', category: 'personality', cost: -25, icon: 'trait-craven', exclusiveGroup: 'courage',
    description: '倾向避开危险与正面冲突。', modifiers: { martial: -2, prowess: -3 } },
  { id: 'calm', name: '冷静', category: 'personality', cost: 25, icon: 'trait-calm', exclusiveGroup: 'temper',
    description: '即使局势失控也能保持清醒。', modifiers: { diplomacy: 1, intrigue: 1 } },
  { id: 'wrathful', name: '暴怒', category: 'personality', cost: 15, icon: 'trait-wrathful', exclusiveGroup: 'temper',
    description: '怒火来得迅猛，也更愿意诉诸武力。', modifiers: { diplomacy: -1, martial: 2, prowess: 2 } },
  { id: 'chaste', name: '贞洁', category: 'personality', cost: 10, icon: 'trait-chaste', exclusiveGroup: 'desire',
    description: '克制肉欲并恪守礼法。', modifiers: { learning: 1 } },
  { id: 'lustful', name: '色欲', category: 'personality', cost: 5, icon: 'trait-lustful', exclusiveGroup: 'desire',
    description: '容易被欲望和情感牵引。', modifiers: { intrigue: 1 } },
  { id: 'compassionate', name: '慈悲', category: 'personality', cost: 20, icon: 'trait-compassionate', exclusiveGroup: 'empathy',
    description: '会顾念弱者与敌人的苦难。', modifiers: { diplomacy: 2, intrigue: -1 } },
  { id: 'callous', name: '冷酷', category: 'personality', cost: 10, icon: 'trait-callous', exclusiveGroup: 'empathy',
    description: '很少被他人的痛苦动摇。', modifiers: { intrigue: 2, diplomacy: -1 } },
  { id: 'sadistic', name: '虐待狂', category: 'personality', cost: 35, icon: 'trait-sadistic', exclusiveGroup: 'empathy',
    description: '以支配和折磨他人为乐。', modifiers: { intrigue: 2, prowess: 1 } },
  { id: 'content', name: '安于现状', category: 'personality', cost: -20, icon: 'trait-content', exclusiveGroup: 'ambition',
    description: '满足于已有地位，不热衷冒险扩张。', modifiers: { stewardship: 1, intrigue: -1 } },
  { id: 'ambitious', name: '野心勃勃', category: 'personality', cost: 65, icon: 'trait-ambitious', exclusiveGroup: 'ambition',
    description: '渴望权力、领地与不朽名声。', modifiers: { diplomacy: 1, martial: 1, stewardship: 1, intrigue: 1, learning: 1, prowess: 1 } },
  { id: 'diligent', name: '勤勉', category: 'personality', cost: 55, icon: 'trait-diligent', exclusiveGroup: 'effort',
    description: '用持续的劳动处理每一项职责。', modifiers: { diplomacy: 1, martial: 1, stewardship: 2, learning: 1 } },
  { id: 'lazy', name: '懒惰', category: 'personality', cost: -25, icon: 'trait-lazy', exclusiveGroup: 'effort',
    description: '能推迟的事务绝不会立刻处理。', modifiers: { stewardship: -2, learning: -1 } },
  { id: 'forgiving', name: '宽宏大量', category: 'personality', cost: 15, icon: 'trait-forgiving', exclusiveGroup: 'grudge',
    description: '愿意放下仇恨并给予第二次机会。', modifiers: { diplomacy: 2, intrigue: -1 } },
  { id: 'vengeful', name: '睚眦必报', category: 'personality', cost: 20, icon: 'trait-vengeful', exclusiveGroup: 'grudge',
    description: '不会忘记任何侮辱与背叛。', modifiers: { intrigue: 2, prowess: 1 } },
  { id: 'generous', name: '慷慨', category: 'personality', cost: 20, icon: 'trait-generous', exclusiveGroup: 'wealth',
    description: '愿意用财富换取忠诚与善意。', modifiers: { diplomacy: 3, stewardship: -1 } },
  { id: 'greedy', name: '贪婪', category: 'personality', cost: 15, icon: 'trait-greedy', exclusiveGroup: 'wealth',
    description: '把每枚硬币和每寸土地都视作机会。', modifiers: { stewardship: 2, diplomacy: -1 } },
  { id: 'gluttonous', name: '暴食', category: 'personality', cost: -15, icon: 'trait-gluttonous', exclusiveGroup: 'appetite',
    description: '沉迷宴席、美酒与无度享乐。', modifiers: { stewardship: -1, prowess: -1 } },
  { id: 'temperate', name: '节制', category: 'personality', cost: 25, icon: 'trait-temperate', exclusiveGroup: 'appetite',
    description: '饮食起居都保持严格克制。', modifiers: { stewardship: 2, learning: 1 } },
  { id: 'gregarious', name: '合群', category: 'personality', cost: 30, icon: 'trait-gregarious', exclusiveGroup: 'sociability',
    description: '享受宴会和交际，在人群中如鱼得水。', modifiers: { diplomacy: 3 } },
  { id: 'shy', name: '害羞', category: 'personality', cost: -20, icon: 'trait-shy', exclusiveGroup: 'sociability',
    description: '不喜公开交际，更愿意独自思考。', modifiers: { diplomacy: -2, learning: 1 } },
  { id: 'honest', name: '诚实', category: 'personality', cost: 25, icon: 'trait-honest', exclusiveGroup: 'honesty',
    description: '言行坦率，更容易获得他人的信任。', modifiers: { diplomacy: 2, intrigue: -2 } },
  { id: 'deceitful', name: '狡诈', category: 'personality', cost: 25, icon: 'trait-deceitful', exclusiveGroup: 'honesty',
    description: '善于伪装意图并操纵秘密。', modifiers: { diplomacy: -1, intrigue: 3 } },
  { id: 'humble', name: '谦逊', category: 'personality', cost: 10, icon: 'trait-humble', exclusiveGroup: 'pride',
    description: '不炫耀出身与成就。', modifiers: { diplomacy: 1 } },
  { id: 'arrogant', name: '傲慢', category: 'personality', cost: 5, icon: 'trait-arrogant', exclusiveGroup: 'pride',
    description: '坚信自身地位与判断高人一等。', modifiers: { diplomacy: -1, prowess: 1 } },
  { id: 'just', name: '公正', category: 'personality', cost: 35, icon: 'trait-just', exclusiveGroup: 'justice',
    description: '依照法律与承诺裁断争端。', modifiers: { stewardship: 2, learning: 1, intrigue: -1 } },
  { id: 'arbitrary', name: '专断', category: 'personality', cost: -10, icon: 'trait-arbitrary', exclusiveGroup: 'justice',
    description: '以一时好恶取代法律和传统。', modifiers: { intrigue: 1, stewardship: -1 } },
  { id: 'patient', name: '耐心', category: 'personality', cost: 30, icon: 'trait-patient', exclusiveGroup: 'patience',
    description: '愿意等待局势成熟后再行动。', modifiers: { intrigue: 2, learning: 1 } },
  { id: 'impatient', name: '急躁', category: 'personality', cost: -5, icon: 'trait-impatient', exclusiveGroup: 'patience',
    description: '厌恶等待并追求立刻见效。', modifiers: { diplomacy: -1, martial: 1 } },
  { id: 'trusting', name: '轻信他人', category: 'personality', cost: -15, icon: 'trait-trusting', exclusiveGroup: 'trust',
    description: '本能地相信誓言与善意。', modifiers: { diplomacy: 2, intrigue: -2 } },
  { id: 'paranoid', name: '多疑', category: 'personality', cost: 5, icon: 'trait-paranoid', exclusiveGroup: 'trust',
    description: '在每句耳语背后寻找阴谋。', modifiers: { intrigue: 3, diplomacy: -1 } },
  { id: 'zealous', name: '狂热', category: 'personality', cost: 25, icon: 'trait-zealous', exclusiveGroup: 'faith',
    description: '以坚定信仰解释世界与战争。', modifiers: { martial: 1, learning: 2 } },
  { id: 'cynical', name: '愤世嫉俗', category: 'personality', cost: 10, icon: 'trait-cynical', exclusiveGroup: 'faith',
    description: '怀疑教义、誓言和崇高动机。', modifiers: { intrigue: 2, learning: 1 } },
  { id: 'eccentric', name: '古怪', category: 'personality', cost: 5, icon: 'trait-eccentric',
    description: '以旁人难以预测的方式理解世界。', modifiers: { learning: 2, diplomacy: -1 } },
  { id: 'fickle', name: '多变', category: 'personality', cost: -10, icon: 'trait-fickle', exclusiveGroup: 'resolve',
    description: '立场和喜好会随着局势迅速变化。', modifiers: { diplomacy: 1, stewardship: -1 } },
  { id: 'stubborn', name: '固执', category: 'personality', cost: 15, icon: 'trait-stubborn', exclusiveGroup: 'resolve',
    description: '一旦做出决定就很难被说服。', modifiers: { stewardship: 2, diplomacy: -1 } },
  { id: 'education_diplomacy_1', name: '天真的安抚者', category: 'education', cost: 0, icon: 'trait-education-diplomacy-1', exclusiveGroup: 'education',
    description: '天真的安抚者代表第 1 级安抚者教育成果。', modifiers: { diplomacy: 1 } },
  { id: 'education_diplomacy_2', name: '合格的谈判者', category: 'education', cost: 20, icon: 'trait-education-diplomacy-2', exclusiveGroup: 'education',
    description: '合格的谈判者代表第 2 级谈判者教育成果。', modifiers: { diplomacy: 3 } },
  { id: 'education_diplomacy_3', name: '魅力非凡的谈判家', category: 'education', cost: 45, icon: 'trait-education-diplomacy-3', exclusiveGroup: 'education',
    description: '魅力非凡的谈判家代表第 3 级谈判家教育成果。', modifiers: { diplomacy: 6 } },
  { id: 'education_diplomacy_4', name: '幕后操控者', category: 'education', cost: 80, icon: 'trait-education-diplomacy-4', exclusiveGroup: 'education',
    description: '幕后操控者代表第 4 级操控者教育成果。', modifiers: { diplomacy: 8 } },
  { id: 'education_martial_1', name: '误入歧途的战士', category: 'education', cost: 0, icon: 'trait-education-martial-1', exclusiveGroup: 'education',
    description: '误入歧途的战士代表第 1 级的战士教育成果。', modifiers: { martial: 1 } },
  { id: 'education_martial_2', name: '坚强的战士', category: 'education', cost: 20, icon: 'trait-education-martial-2', exclusiveGroup: 'education',
    description: '坚强的战士代表第 2 级的战士教育成果。', modifiers: { martial: 3 } },
  { id: 'education_martial_3', name: '优秀战术家', category: 'education', cost: 45, icon: 'trait-education-martial-3', exclusiveGroup: 'education',
    description: '优秀战术家代表第 3 级战术家教育成果。', modifiers: { martial: 6 } },
  { id: 'education_martial_4', name: '天才军事家', category: 'education', cost: 80, icon: 'trait-education-martial-4', exclusiveGroup: 'education',
    description: '天才军事家代表第 4 级军事家教育成果。', modifiers: { martial: 8 } },
  { id: 'education_stewardship_1', name: '放纵的浪费者', category: 'education', cost: 0, icon: 'trait-education-stewardship-1', exclusiveGroup: 'education',
    description: '放纵的浪费者代表第 1 级浪费者教育成果。', modifiers: { stewardship: 1 } },
  { id: 'education_stewardship_2', name: '节俭的职员', category: 'education', cost: 20, icon: 'trait-education-stewardship-2', exclusiveGroup: 'education',
    description: '节俭的职员代表第 2 级的职员教育成果。', modifiers: { stewardship: 3 } },
  { id: 'education_stewardship_3', name: '财富创造者', category: 'education', cost: 45, icon: 'trait-education-stewardship-3', exclusiveGroup: 'education',
    description: '财富创造者代表第 3 级创造者教育成果。', modifiers: { stewardship: 6 } },
  { id: 'education_stewardship_4', name: '点石成金者', category: 'education', cost: 80, icon: 'trait-education-stewardship-4', exclusiveGroup: 'education',
    description: '点石成金者代表第 4 级成金者教育成果。', modifiers: { stewardship: 8 } },
  { id: 'education_intrigue_1', name: '业余阴谋家', category: 'education', cost: 0, icon: 'trait-education-intrigue-1', exclusiveGroup: 'education',
    description: '业余阴谋家代表第 1 级阴谋家教育成果。', modifiers: { intrigue: 1 } },
  { id: 'education_intrigue_2', name: '浮夸的谋士', category: 'education', cost: 20, icon: 'trait-education-intrigue-2', exclusiveGroup: 'education',
    description: '浮夸的谋士代表第 2 级的谋士教育成果。', modifiers: { intrigue: 3 } },
  { id: 'education_intrigue_3', name: '暗中策划者', category: 'education', cost: 45, icon: 'trait-education-intrigue-3', exclusiveGroup: 'education',
    description: '暗中策划者代表第 3 级策划者教育成果。', modifiers: { intrigue: 6 } },
  { id: 'education_intrigue_4', name: '难以捉摸的影子', category: 'education', cost: 80, icon: 'trait-education-intrigue-4', exclusiveGroup: 'education',
    description: '难以捉摸的影子代表第 4 级的影子教育成果。', modifiers: { intrigue: 8 } },
  { id: 'education_learning_1', name: '尽责的书吏', category: 'education', cost: 0, icon: 'trait-education-learning-1', exclusiveGroup: 'education',
    description: '尽责的书吏代表第 1 级的书吏教育成果。', modifiers: { learning: 1 } },
  { id: 'education_learning_2', name: '有洞察力的思想家', category: 'education', cost: 20, icon: 'trait-education-learning-2', exclusiveGroup: 'education',
    description: '有洞察力的思想家代表第 2 级思想家教育成果。', modifiers: { learning: 3 } },
  { id: 'education_learning_3', name: '明睿的智者', category: 'education', cost: 45, icon: 'trait-education-learning-3', exclusiveGroup: 'education',
    description: '明睿的智者代表第 3 级的智者教育成果。', modifiers: { learning: 6 } },
  { id: 'education_learning_4', name: '哲学大师', category: 'education', cost: 80, icon: 'trait-education-learning-4', exclusiveGroup: 'education',
    description: '哲学大师代表第 4 级学大师教育成果。', modifiers: { learning: 8 } },
  { id: 'diplomat', name: '外交家', category: 'lifestyle', cost: 55, icon: 'trait-diplomat',
    description: '精通同盟、礼仪与跨境谈判。', modifiers: { diplomacy: 4 } },
  { id: 'august', name: '贵不可言', category: 'lifestyle', cost: 60, icon: 'trait-august',
    description: '以威严和血统压服宫廷。', modifiers: { diplomacy: 3, martial: 1 } },
  { id: 'strategist', name: '军事家', category: 'lifestyle', cost: 60, icon: 'trait-strategist',
    description: '能够统筹战场、补给与军心。', modifiers: { martial: 5 } },
  { id: 'overseer', name: '监督者', category: 'lifestyle', cost: 45, icon: 'trait-overseer',
    description: '善于维持纪律和领地秩序。', modifiers: { martial: 3, stewardship: 2 } },
  { id: 'gallant', name: '侠义骑士', category: 'lifestyle', cost: 50, icon: 'trait-gallant',
    description: '将骑士荣誉与个人武艺融为一体。', modifiers: { martial: 2, prowess: 4 } },
  { id: 'architect', name: '建筑家', category: 'lifestyle', cost: 50, icon: 'trait-architect',
    description: '精通城堡、道路和大型工程。', modifiers: { stewardship: 5 } },
  { id: 'avaricious', name: '爱财如命', category: 'lifestyle', cost: 45, icon: 'trait-avaricious',
    description: '知道如何从每项权利中榨取收入。', modifiers: { stewardship: 4, intrigue: 1 } },
  { id: 'schemer', name: '阴谋家', category: 'lifestyle', cost: 55, icon: 'trait-schemer',
    description: '把秘密、钩子和人心编织成网。', modifiers: { intrigue: 5 } },
  { id: 'seducer', name: '勾引者', category: 'lifestyle', cost: 35, icon: 'trait-seducer',
    description: '善于洞察欲望并赢得亲密信任。', modifiers: { diplomacy: 2, intrigue: 3 } },
  { id: 'torturer', name: '拷打者', category: 'lifestyle', cost: 35, icon: 'trait-torturer',
    description: '通过恐惧与痛苦逼取秘密。', modifiers: { intrigue: 4, prowess: 1 } },
  { id: 'scholar', name: '学者', category: 'lifestyle', cost: 55, icon: 'trait-scholar',
    description: '拥有广博的历史、哲学和自然知识。', modifiers: { learning: 5 } },
  { id: 'theologian', name: '神学家', category: 'lifestyle', cost: 45, icon: 'trait-theologian',
    description: '通晓经文、教法与宗教辩论。', modifiers: { learning: 4, diplomacy: 1 } },
  { id: 'whole_of_body', name: '身心俱悉', category: 'lifestyle', cost: 65, icon: 'trait-whole-of-body',
    description: '精通保养、医理和长寿之道。', modifiers: { learning: 3, prowess: 3 } },
  { id: 'athletic', name: '健身者', category: 'lifestyle', cost: 35, icon: 'trait-athletic',
    description: '长期训练塑造了强韧体魄。', modifiers: { prowess: 4 } },
  { id: 'hunter', name: '猎人', category: 'lifestyle', cost: 30, icon: 'trait-hunter',
    description: '熟悉荒野、追踪和猎物习性。', modifiers: { martial: 2, prowess: 2 } },
  { id: 'physician', name: '医师', category: 'lifestyle', cost: 40, icon: 'trait-physician',
    description: '掌握诊断、草药与外科处理。', modifiers: { learning: 4 } },
  { id: 'beauty_good_1', name: '眉清目秀', category: 'congenital', cost: 30, icon: 'trait-beauty-good-1', exclusiveGroup: 'beauty',
    description: '眉清目秀是可遗传的第 1 级先天特质。', modifiers: { diplomacy: 2 } },
  { id: 'beauty_good_2', name: '漂亮', category: 'congenital', cost: 60, icon: 'trait-beauty-good-2', exclusiveGroup: 'beauty',
    description: '漂亮是可遗传的第 2 级先天特质。', modifiers: { diplomacy: 4 } },
  { id: 'beauty_good_3', name: '倾国倾城', category: 'congenital', cost: 100, icon: 'trait-beauty-good-3', exclusiveGroup: 'beauty',
    description: '倾国倾城是可遗传的第 3 级先天特质。', modifiers: { diplomacy: 6 } },
  { id: 'beauty_bad_1', name: '其貌不扬', category: 'congenital', cost: -15, icon: 'trait-beauty-bad-1', exclusiveGroup: 'beauty',
    description: '其貌不扬是可遗传的第 1 级先天特质。', modifiers: { diplomacy: -2 } },
  { id: 'beauty_bad_2', name: '丑陋', category: 'congenital', cost: -35, icon: 'trait-beauty-bad-2', exclusiveGroup: 'beauty',
    description: '丑陋是可遗传的第 2 级先天特质。', modifiers: { diplomacy: -4 } },
  { id: 'beauty_bad_3', name: '面目狰狞', category: 'congenital', cost: -60, icon: 'trait-beauty-bad-3', exclusiveGroup: 'beauty',
    description: '面目狰狞是可遗传的第 3 级先天特质。', modifiers: { diplomacy: -6 } },
  { id: 'intellect_good_1', name: '敏锐', category: 'congenital', cost: 40, icon: 'trait-intellect-good-1', exclusiveGroup: 'intellect',
    description: '敏锐是可遗传的第 1 级先天特质。', modifiers: { diplomacy: 1, martial: 1, stewardship: 1, intrigue: 1, learning: 1 } },
  { id: 'intellect_good_2', name: '聪慧', category: 'congenital', cost: 80, icon: 'trait-intellect-good-2', exclusiveGroup: 'intellect',
    description: '聪慧是可遗传的第 2 级先天特质。', modifiers: { diplomacy: 2, martial: 2, stewardship: 2, intrigue: 2, learning: 2 } },
  { id: 'intellect_good_3', name: '天才', category: 'congenital', cost: 160, icon: 'trait-intellect-good-3', exclusiveGroup: 'intellect',
    description: '天才是可遗传的第 3 级先天特质。', modifiers: { diplomacy: 3, martial: 3, stewardship: 3, intrigue: 3, learning: 3 } },
  { id: 'intellect_bad_1', name: '迟钝', category: 'congenital', cost: -20, icon: 'trait-intellect-bad-1', exclusiveGroup: 'intellect',
    description: '迟钝是可遗传的第 1 级先天特质。', modifiers: { diplomacy: -1, martial: -1, stewardship: -1, intrigue: -1, learning: -1 } },
  { id: 'intellect_bad_2', name: '愚笨', category: 'congenital', cost: -45, icon: 'trait-intellect-bad-2', exclusiveGroup: 'intellect',
    description: '愚笨是可遗传的第 2 级先天特质。', modifiers: { diplomacy: -2, martial: -2, stewardship: -2, intrigue: -2, learning: -2 } },
  { id: 'intellect_bad_3', name: '痴呆', category: 'congenital', cost: -80, icon: 'trait-intellect-bad-3', exclusiveGroup: 'intellect',
    description: '痴呆是可遗传的第 3 级先天特质。', modifiers: { diplomacy: -3, martial: -3, stewardship: -3, intrigue: -3, learning: -3 } },
  { id: 'physique_good_1', name: '健壮', category: 'congenital', cost: 35, icon: 'trait-physique-good-1', exclusiveGroup: 'physique',
    description: '健壮是可遗传的第 1 级先天特质。', modifiers: { prowess: 2 } },
  { id: 'physique_good_2', name: '强壮', category: 'congenital', cost: 70, icon: 'trait-physique-good-2', exclusiveGroup: 'physique',
    description: '强壮是可遗传的第 2 级先天特质。', modifiers: { prowess: 4 } },
  { id: 'physique_good_3', name: '海格力斯', category: 'congenital', cost: 120, icon: 'trait-physique-good-3', exclusiveGroup: 'physique',
    description: '海格力斯是可遗传的第 3 级先天特质。', modifiers: { prowess: 6 } },
  { id: 'physique_bad_1', name: '纤弱', category: 'congenital', cost: -20, icon: 'trait-physique-bad-1', exclusiveGroup: 'physique',
    description: '纤弱是可遗传的第 1 级先天特质。', modifiers: { prowess: -2 } },
  { id: 'physique_bad_2', name: '脆弱', category: 'congenital', cost: -45, icon: 'trait-physique-bad-2', exclusiveGroup: 'physique',
    description: '脆弱是可遗传的第 2 级先天特质。', modifiers: { prowess: -4 } },
  { id: 'physique_bad_3', name: '弱不禁风', category: 'congenital', cost: -75, icon: 'trait-physique-bad-3', exclusiveGroup: 'physique',
    description: '弱不禁风是可遗传的第 3 级先天特质。', modifiers: { prowess: -6 } },
  { id: 'fecund', name: '多产', category: 'congenital', cost: 50, icon: 'trait-fecund',
    description: '旺盛的生命力有利于繁衍后代。', modifiers: { prowess: 1 } },
  { id: 'pure_blooded', name: '纯血', category: 'congenital', cost: 80, icon: 'trait-pure-blooded',
    description: '罕见而稳定的血脉特征。', modifiers: { diplomacy: 1, learning: 1 } },
  { id: 'giant', name: '巨人', category: 'congenital', cost: 35, icon: 'trait-giant', exclusiveGroup: 'stature',
    description: '远超常人的高大身躯兼具力量与负担。', modifiers: { prowess: 6, diplomacy: -1 } },
  { id: 'dwarf', name: '侏儒', category: 'congenital', cost: -20, icon: 'trait-dwarf', exclusiveGroup: 'stature',
    description: '先天身材矮小，但并不妨碍才智。', modifiers: { prowess: -3, learning: 1 } },
  { id: 'wounded_1', name: '受伤', category: 'health', cost: -15, icon: 'trait-wounded-1', exclusiveGroup: 'wound',
    description: '尚未痊愈的轻伤影响行动。', modifiers: { prowess: -1 } },
  { id: 'wounded_2', name: '身受重伤', category: 'health', cost: -35, icon: 'trait-wounded-2', exclusiveGroup: 'wound',
    description: '严重创伤持续削弱身体。', modifiers: { prowess: -4, martial: -1 } },
  { id: 'wounded_3', name: '严重撕裂', category: 'health', cost: -60, icon: 'trait-wounded-3', exclusiveGroup: 'wound',
    description: '濒死伤势使战斗能力大幅下降。', modifiers: { prowess: -7, martial: -2 } },
  { id: 'ill', name: '患病', category: 'health', cost: -15, icon: 'trait-ill', exclusiveGroup: 'illness',
    description: '常见疾病带来发热和虚弱。', modifiers: { prowess: -2 } },
  { id: 'infirm', name: '体弱多病', category: 'health', cost: -40, icon: 'trait-infirm', exclusiveGroup: 'frailty',
    description: '长期衰弱损害身体与判断。', modifiers: { martial: -2, prowess: -4 } },
  { id: 'incapable', name: '无能', category: 'health', cost: -100, icon: 'trait-incapable', exclusiveGroup: 'frailty',
    description: '无法独立处理统治事务。', modifiers: { diplomacy: -5, martial: -5, stewardship: -5, intrigue: -5, learning: -5, prowess: -8 } },
  { id: 'cancer', name: '癌症', category: 'health', cost: -60, icon: 'trait-cancer', exclusiveGroup: 'illness',
    description: '恶性疾病缓慢侵蚀生命。', modifiers: { prowess: -5, learning: -1 } },
  { id: 'gout_ridden', name: '痛风', category: 'health', cost: -25, icon: 'trait-gout-ridden', exclusiveGroup: 'illness',
    description: '关节疼痛限制行动。', modifiers: { prowess: -3 } },
  { id: 'consumption', name: '肺痨', category: 'health', cost: -45, icon: 'trait-consumption', exclusiveGroup: 'illness',
    description: '咳血与虚弱长期折磨身体。', modifiers: { prowess: -4, martial: -1 } },
  { id: 'pneumonic', name: '肺炎', category: 'health', cost: -45, icon: 'trait-pneumonic', exclusiveGroup: 'illness',
    description: '严重感染妨碍呼吸与体力。', modifiers: { prowess: -5 } },
  { id: 'lovers_pox', name: '情人痘', category: 'health', cost: -15, icon: 'trait-lovers-pox', exclusiveGroup: 'illness',
    description: '明显皮疹损害健康与声誉。', modifiers: { diplomacy: -1, prowess: -1 } },
  { id: 'great_pox', name: '梅毒', category: 'health', cost: -55, icon: 'trait-great-pox', exclusiveGroup: 'illness',
    description: '顽固疾病损伤身体与神志。', modifiers: { diplomacy: -2, learning: -2, prowess: -3 } },
  { id: 'disfigured', name: '毁容', category: 'health', cost: -25, icon: 'trait-disfigured', exclusiveGroup: 'maiming',
    description: '严重伤痕永久改变了面容。', modifiers: { diplomacy: -3, prowess: 1 } },
  { id: 'blind', name: '失明', category: 'health', cost: -45, icon: 'trait-blind', exclusiveGroup: 'maiming',
    description: '失去视力后只能依靠其他感官。', modifiers: { prowess: -6, learning: 1 } },
  { id: 'one_eyed', name: '独眼', category: 'health', cost: -15, icon: 'trait-one-eyed', exclusiveGroup: 'maiming',
    description: '失去一只眼睛影响观察与距离判断。', modifiers: { prowess: -2 } },
  { id: 'one_legged', name: '独腿', category: 'health', cost: -30, icon: 'trait-one-legged', exclusiveGroup: 'maiming',
    description: '失去一条腿严重限制移动。', modifiers: { prowess: -5 } },
  { id: 'maimed', name: '残废', category: 'health', cost: -50, icon: 'trait-maimed', exclusiveGroup: 'maiming',
    description: '惨烈创伤留下永久残疾。', modifiers: { martial: -2, prowess: -6 } },
  { id: 'scarred', name: '伤疤', category: 'health', cost: 5, icon: 'trait-scarred',
    description: '显眼的旧伤证明曾经幸存。', modifiers: { prowess: 1 } },
  { id: 'adulterer', name: '通奸者', category: 'fame', cost: -10, icon: 'trait-adulterer', exclusiveGroup: 'sexual_reputation',
    description: '被世人认定违背婚姻誓言。', modifiers: { diplomacy: -1 } },
  { id: 'fornicator', name: '私通者', category: 'fame', cost: -5, icon: 'trait-fornicator', exclusiveGroup: 'sexual_reputation',
    description: '公开的婚外关系损害名誉。', modifiers: { diplomacy: -1 } },
  { id: 'murderer', name: '谋杀犯', category: 'fame', cost: -25, icon: 'trait-murderer',
    description: '背负蓄意杀人的恶名。', modifiers: { diplomacy: -2, intrigue: 1 } },
  { id: 'kinslayer_1', name: '家族弑亲者', category: 'fame', cost: -20, icon: 'trait-kinslayer-1', exclusiveGroup: 'kinslayer',
    description: '杀害远亲的罪名引发忌惮。', modifiers: { diplomacy: -1 } },
  { id: 'kinslayer_2', name: '宗族弑亲者', category: 'fame', cost: -40, icon: 'trait-kinslayer-2', exclusiveGroup: 'kinslayer',
    description: '杀害同宗近亲的罪名难以洗刷。', modifiers: { diplomacy: -3 } },
  { id: 'kinslayer_3', name: '弑亲者', category: 'fame', cost: -70, icon: 'trait-kinslayer-3', exclusiveGroup: 'kinslayer',
    description: '杀害至亲被视为最严重的禁忌。', modifiers: { diplomacy: -5, intrigue: 1 } },
  { id: 'excommunicated', name: '被绝罚', category: 'fame', cost: -35, icon: 'trait-excommunicated',
    description: '被信仰共同体逐出教门。', modifiers: { diplomacy: -3, learning: -1 } },
  { id: 'witch', name: '巫师', category: 'fame', cost: -10, icon: 'trait-witch',
    description: '秘密或公开研习被禁绝的仪式。', modifiers: { learning: 2, intrigue: 1 } },
  { id: 'cannibal', name: '食人者', category: 'fame', cost: -45, icon: 'trait-cannibal',
    description: '食用人肉的传闻令人恐惧。', modifiers: { diplomacy: -4, prowess: 2 } },
  { id: 'bastard', name: '私生子', category: 'fame', cost: -15, icon: 'trait-bastard', exclusiveGroup: 'legitimacy',
    description: '出生身份使继承权受到质疑。', modifiers: { diplomacy: -1 } },

  // AGOT Mod ruler-designer traits. Costs and skill modifiers follow the bundled mod definitions.
  { id: 'nightswatch', name: '守夜人', category: 'fame', cost: 0, icon: 'trait-agot-nightswatch',
    description: '已披上黑袍加入守夜人军团。', modifiers: { prowess: 2 } },
  { id: 'lifestyle_mariner', name: '航海大师', category: 'lifestyle', cost: 20, icon: 'trait-agot-mariner',
    description: '历经百次航行的资深航海大师。', modifiers: { martial: 1, prowess: 1 } },
  { id: 'authoritative', name: '威严', category: 'personality', cost: 15, icon: 'trait-agot-authoritative', incompatibleTraitIds: ['humble'],
    description: '声音很有分量，也让许多人感到恐惧。', modifiers: { diplomacy: 1, martial: 1 } },
  { id: 'rude', name: '粗鲁', category: 'personality', cost: -5, icon: 'trait-agot-rude', incompatibleTraitIds: ['compassionate', 'humble'],
    description: '心直口快，完全不顾他人的感受。', modifiers: { diplomacy: -1, intrigue: 2 } },
  { id: 'inquisitive', name: '好学', category: 'personality', cost: 20, icon: 'trait-agot-inquisitive', incompatibleTraitIds: ['zealous'],
    description: '着迷于世界中的奥秘。', modifiers: { intrigue: 1, learning: 2 } },
  { id: 'uncouth', name: '邋遢', category: 'fame', cost: -10, icon: 'trait-agot-uncouth', incompatibleTraitIds: ['fashionable'],
    description: '个人形象低于常人标准，却对此毫不在意。', modifiers: { diplomacy: -1 } },
  { id: 'one_handed', name: '独臂', category: 'health', cost: -15, icon: 'trait-agot-one-handed',
    description: '只有一只手。', modifiers: { prowess: -15 } },
  { id: 'scurvy', name: '坏血病', category: 'health', cost: -10, icon: 'trait-agot-scurvy',
    description: '长期饮食不当导致身体虚弱与出血。', modifiers: { diplomacy: -1, martial: -1, stewardship: -1, intrigue: -1, learning: -2, prowess: -20 } },
  { id: 'crippled', name: '残疾', category: 'health', cost: -40, icon: 'trait-agot-crippled',
    description: '已经瘫痪，大部分身体部位无法动弹。', modifiers: { diplomacy: -1, martial: -3, prowess: -30 } },
  { id: 'greyscale', name: '灰鳞病', category: 'health', cost: -30, icon: 'trait-agot-greyscale',
    description: '大面积皮肤龟裂剥落。', modifiers: { diplomacy: -5, prowess: -5 } },
  { id: 'burned', name: '烧伤', category: 'health', cost: 0, icon: 'trait-agot-burned',
    description: '烧焦的皮肉成了终生的伤疤。', modifiers: { diplomacy: -2 } },
  { id: 'mute', name: '失声者', category: 'health', cost: -15, icon: 'trait-agot-mute',
    description: '无法用声音表述任何想法。', modifiers: { diplomacy: -5, intrigue: 2 } },
  { id: 'half_blind', name: '半失明', category: 'health', cost: 10, icon: 'trait-agot-half-blind', incompatibleTraitIds: ['one_eyed', 'blind'],
    description: '一只眼睛失明了。', modifiers: { prowess: -2 } },
  { id: 'the_mark', name: '记号', category: 'congenital', cost: -5, icon: 'trait-agot-the-mark',
    description: '双手像青蛙一样有蹼。', modifiers: {} },
  { id: 'dragon_dreams', name: '龙梦', category: 'fame', cost: 100, icon: 'trait-agot-dragon-dreams',
    description: '被凶兆与未来可能的景象所扰。', modifiers: { intrigue: 4 } },
  { id: 'greensight', name: '绿之视野', category: 'fame', cost: 100, icon: 'trait-agot-greensight',
    description: '会做预示性的绿梦，得以窥视未来吉凶。', modifiers: { intrigue: 2 } },
  { id: 'fashionable', name: '时尚', category: 'fame', cost: 10, icon: 'trait-agot-fashionable', incompatibleTraitIds: ['uncouth'],
    description: '格外关注剪裁考究、设计优雅的服装。', modifiers: { diplomacy: 1 } },
  { id: 'fire_obsessed', name: '痴迷于火', category: 'fame', cost: 10, icon: 'trait-agot-fire-obsessed',
    description: '着迷于火焰的力量。', modifiers: { stewardship: -1, learning: 2 } },
  { id: 'freedman', name: '自由人', category: 'fame', cost: 0, icon: 'trait-agot-freedman',
    description: '曾经是奴隶，但现在已重获自由。', modifiers: { diplomacy: 2 } },
  { id: 'spider', name: '八爪蜘蛛', category: 'lifestyle', cost: 50, icon: 'trait-agot-spider',
    description: '掌控间谍网的大师。', modifiers: { diplomacy: 2, intrigue: 2 } },
  { id: 'dragonrider', name: '驭龙者', category: 'fame', cost: 200, icon: 'trait-agot-dragonrider',
    description: '极少数能够驯服并驾驭巨龙的人。', modifiers: { martial: 1 } },
  ...IMPORTED_CHARACTER_TRAIT_DEFINITIONS,
];

export const CHARACTER_TRAITS: readonly CharacterTraitDefinition[] = CHARACTER_TRAIT_DEFINITIONS.map((trait) => {
  const source: TraitSource = AGOT_TRAIT_DESCRIPTIONS[trait.id] ? 'agot' : 'ck3';
  const description = AGOT_TRAIT_DESCRIPTIONS[trait.id] ?? CK3_TRAIT_DESCRIPTIONS[trait.id] ?? trait.description;
  const configuredRules = CHARACTER_TRAIT_RULES[trait.id] ?? {};
  return {
    ...trait,
    source,
    description,
    rules: {
      ...configuredRules,
      roleplayDirectives: configuredRules.roleplayDirectives ?? [description],
    },
  };
});

export function aggregateSelectedTraitEffects(selectedTraitIds: readonly string[]): AggregatedTraitEffects {
  return aggregateTraitRuleEffects(
    CHARACTER_TRAITS.filter((trait) => selectedTraitIds.includes(trait.id)).map((trait) => trait.rules)
  );
}

export function getTraitCheckContributions(
  selectedTraitIds: readonly string[],
  domain: TraitCheckDomain
): Array<{ id: string; name: string; value: number }> {
  return CHARACTER_TRAITS
    .filter((trait) => selectedTraitIds.includes(trait.id) && trait.rules.checkModifiers?.[domain])
    .map((trait) => ({ id: trait.id, name: trait.name, value: trait.rules.checkModifiers?.[domain] ?? 0 }));
}

export function formatTraitRuleEffects(rules: TraitRuleSet): string[] {
  const multiplierLabels = {
    goldGain: '金币获得', prestigeGain: '威仪获得', dreadGain: '恶名获得',
  } as const;
  const resistanceLabels = { injury: '受伤抗性', disease: '疾病抗性', poison: '中毒抗性', bleeding: '失血抗性' } as const;
  const checkLabels: Record<TraitCheckDomain, string> = {
    duel: '决斗', battle: '战争', intrigue: '密谋', stewardship: '治理', diplomacy: '交涉', learning: '学识',
    medicine: '医疗', survival: '生存', intimidation: '恐吓', seduction: '勾引', resistFear: '抗拒恐惧',
  };
  const lines: string[] = [];
  for (const [key, value] of Object.entries(rules.multipliers ?? {}) as Array<[keyof typeof multiplierLabels, number]>) {
    lines.push(`${multiplierLabels[key]} ${formatSignedPercent(value)}`);
  }
  for (const [key, value] of Object.entries(rules.resistances ?? {}) as Array<[keyof typeof resistanceLabels, number]>) {
    lines.push(`${resistanceLabels[key]} ${formatSignedPercent(value)}`);
  }
  for (const [key, value] of Object.entries(rules.checkModifiers ?? {}) as Array<[TraitCheckDomain, number]>) {
    lines.push(`${checkLabels[key]}检定 ${value >= 0 ? '+' : ''}${value}`);
  }
  return lines;
}

const HOUSE_IDENTITIES: Record<string, HouseIdentity> = {
  stark: { culture: '北境人', faith: '旧神信仰' },
  lannister: { culture: '西境人', faith: '七神信仰' },
  targaryen: { culture: '高等瓦雷利亚人', faith: '七神信仰' },
  baratheon: { culture: '风暴地人', faith: '七神信仰' },
  tyrell: { culture: '河湾地人', faith: '七神信仰' },
  martell: { culture: '多恩人', faith: '七神信仰' },
  arryn: { culture: '谷地人', faith: '七神信仰' },
  greyjoy: { culture: '铁种', faith: '淹神信仰' },
  tully: { culture: '河间地人', faith: '七神信仰' },
};

export function getHouseIdentity(houseId: string): HouseIdentity {
  return HOUSE_IDENTITIES[houseId] ?? { culture: '安达尔人', faith: '七神信仰' };
}

type IdentityBearingLord = {
  houseSigil?: string;
  culture?: string;
  faith?: string;
};

/** 为经典家族旧档案补齐身份；自建家族和玩家明确填写的内容保持原样。 */
export function migrateLordIdentityData<T extends IdentityBearingLord>(lord: T): T {
  const houseId = lord.houseSigil?.replace(/^house[-_]/i, '').trim().toLowerCase();
  const identity = houseId ? HOUSE_IDENTITIES[houseId] : undefined;
  if (!identity) return lord;

  const culture = lord.culture?.trim();
  const faith = lord.faith?.trim();
  if (culture && faith) return lord;

  return {
    ...lord,
    culture: culture || identity.culture,
    faith: faith || identity.faith,
  };
}

export function calculateFinalAttributes(
  baseAttributes: LordAttributes,
  selectedTraitIds: readonly string[]
): LordAttributes {
  const result = { ...baseAttributes };
  for (const trait of CHARACTER_TRAITS) {
    if (!selectedTraitIds.includes(trait.id)) continue;
    for (const [key, modifier] of Object.entries(trait.modifiers) as Array<[keyof LordAttributes, number]>) {
      result[key] = Math.max(0, Math.min(100, result[key] + modifier));
    }
  }
  return result;
}

export function calculateDesignPointUsage(
  houseBaseAttributes: LordAttributes,
  allocatedAttributes: LordAttributes,
  selectedTraitIds: readonly string[],
  age: number
): number {
  const attributeCost = (Object.keys(houseBaseAttributes) as Array<keyof LordAttributes>)
    .reduce((total, key) => total + (allocatedAttributes[key] - houseBaseAttributes[key]) * 10, 0);
  const traitCost = CHARACTER_TRAITS
    .filter((trait) => selectedTraitIds.includes(trait.id))
    .reduce((total, trait) => total + trait.cost, 0);
  const ageCost = age <= 30 ? (30 - age) * 2 : -Math.min(30, Math.floor((age - 30) / 2));
  return attributeCost + traitCost + ageCost;
}

export function formatTraitDescription(description: string, characterName: string): string {
  const subject = characterName.trim() || '该角色';
  return description.split('该角色').join(subject);
}

export function formatTraitModifiers(modifiers: Partial<LordAttributes>): string {
  const labels: Record<keyof LordAttributes, string> = {
    diplomacy: '外交', martial: '军事', stewardship: '管理', intrigue: '谋略', learning: '学识', prowess: '勇武',
  };
  return (Object.entries(modifiers) as Array<[keyof LordAttributes, number]>)
    .map(([key, value]) => `${labels[key]} ${value >= 0 ? '+' : ''}${value}`)
    .join(' · ');
}

export function orderCharacterTraitsForDisplay<T extends { category: TraitCategory }>(traits: readonly T[]): T[] {
  const education = traits.filter((trait) => trait.category === 'education');
  const remaining = traits.filter((trait) => trait.category !== 'education');
  return [...education, ...remaining];
}

export interface ResolvedCharacterTrait extends CharacterTraitDefinition {
  isLegacy?: boolean;
}

/** 将正式特质 ID 与旧存档的纯文本标签合并为游戏内可显示的唯一特质列表。 */
export function resolveCharacterTraits(
  traitIds: readonly string[] = [],
  legacyTraitNames: readonly string[] = [],
): ResolvedCharacterTrait[] {
  const resolved: ResolvedCharacterTrait[] = [];
  const includedIds = new Set<string>();
  const includedNames = new Set<string>();

  for (const traitId of traitIds) {
    const trait = CHARACTER_TRAITS.find((entry) => entry.id === traitId);
    if (!trait || includedIds.has(trait.id)) continue;
    resolved.push(trait);
    includedIds.add(trait.id);
    includedNames.add(trait.name);
  }

  for (const legacyName of legacyTraitNames) {
    const name = legacyName.trim();
    if (!name || includedNames.has(name)) continue;
    const catalogTrait = CHARACTER_TRAITS.find((entry) => entry.name === name);
    if (catalogTrait) {
      if (!includedIds.has(catalogTrait.id)) {
        resolved.push(catalogTrait);
        includedIds.add(catalogTrait.id);
        includedNames.add(catalogTrait.name);
      }
      continue;
    }
    resolved.push({
      id: `legacy:${name}`,
      name,
      category: 'fame',
      description: '此特质来自旧存档，仍作为人物身份与角色扮演标签保留。',
      cost: 0,
      icon: 'trait-agot-authoritative',
      modifiers: {},
      source: 'ck3',
      rules: { roleplayDirectives: [`${name}会持续影响该角色的言行与名声。`] },
      isLegacy: true,
    });
    includedNames.add(name);
  }

  return orderCharacterTraitsForDisplay(resolved);
}

const LEGACY_TRAIT_ID_ALIASES: Readonly<Record<string, string>> = {
  '刚正不阿': 'honest',
  '战场老将': 'education_martial_3',
  '北境守护者': 'authoritative',
  '狼灵潜质': 'greensight',
  '坚毅勇决': 'brave',
  '守夜人誓约': 'nightswatch',
  '真龙血脉': 'dragon_dreams',
  '绝世美貌': 'beauty_good_3',
  '不焚者潜质': 'fire_obsessed',
  '流亡王嗣': 'ambitious',
};

type TraitBearingAttributes = {
  attributes: LordAttributes;
  baseAttributes?: LordAttributes;
  traits?: string[];
  traitIds?: string[];
};

/** 为旧存档补齐特质 ID；只有能确认尚未结算的旧预设才补算属性，避免自建角色重复叠加。 */
export function migrateLordTraitData<T extends TraitBearingAttributes>(lord: T): T {
  const existingIds = (lord.traitIds ?? []).filter((id) => CHARACTER_TRAITS.some((trait) => trait.id === id));
  const inferredIds = (lord.traits ?? []).map((name) => {
    const exact = CHARACTER_TRAITS.find((trait) => trait.name === name);
    return exact?.id ?? LEGACY_TRAIT_ID_ALIASES[name];
  }).filter((id): id is string => Boolean(id));
  const traitIds = [...new Set([...existingIds, ...inferredIds])];

  if (lord.baseAttributes) {
    const baseAttributes = { ...lord.baseAttributes };
    return {
      ...lord,
      traitIds,
      baseAttributes,
      attributes: calculateFinalAttributes(baseAttributes, traitIds),
    };
  }

  // 旧自建角色已有 traitIds 时，attributes 在旧版本中已经是最终值，不能再次加成。
  if (existingIds.length > 0 || traitIds.length === 0) {
    return { ...lord, traitIds };
  }

  // 旧预设只有文本标签，其 attributes 是未结算特质的基础值。
  const baseAttributes = { ...lord.attributes };
  return {
    ...lord,
    traitIds,
    baseAttributes,
    attributes: calculateFinalAttributes(baseAttributes, traitIds),
  };
}
