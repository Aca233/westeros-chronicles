/**
 * 人物构筑倾向。
 *
 * 与六维属性不同：构筑描述角色在长期故事中的行为倾向，
 * 不直接修改基础属性，而作为行动、事件和叙事决策的额外上下文。
 */
export type CharacterBuildId =
  | 'warrior'
  | 'schemer'
  | 'ruler'
  | 'scholar'
  | 'survivor'
  | 'balanced';

export interface CharacterBuildProfile {
  id: CharacterBuildId;
  name: string;
  description: string;
  preferredDomains: string[];
  actionTags: string[];
}

export const CHARACTER_BUILDS: Record<CharacterBuildId, CharacterBuildProfile> = {
  warrior: { id: 'warrior', name: '武勇之路', description: '偏向正面冲突、荣誉和战场表现。', preferredDomains: ['battle', 'duel', 'intimidation'], actionTags: ['combat', 'honor', 'risk'] },
  schemer: { id: 'schemer', name: '阴谋之路', description: '偏向情报、谋划和隐秘手段。', preferredDomains: ['intrigue', 'seduction'], actionTags: ['secret', 'plot', 'manipulation'] },
  ruler: { id: 'ruler', name: '统治之路', description: '偏向治理、外交和资源管理。', preferredDomains: ['diplomacy', 'stewardship'], actionTags: ['politics', 'governance', 'authority'] },
  scholar: { id: 'scholar', name: '求知之路', description: '偏向知识、研究和发现。', preferredDomains: ['learning', 'medicine'], actionTags: ['research', 'knowledge'] },
  survivor: { id: 'survivor', name: '求生之路', description: '偏向环境适应、旅行和危机处理。', preferredDomains: ['survival'], actionTags: ['travel', 'endurance'] },
  balanced: { id: 'balanced', name: '均衡之路', description: '没有明显偏向的成长方向。', preferredDomains: [], actionTags: [] },
};
