import type { CoatOfArmsDesign } from '../data/heraldry';
import type { TraitCheckDomain } from '../services/traitEffectEngine';
import type { CheckOutcomeContract } from '../services/dicePolicy';
import type { ItemSystemState } from '../features/items/types';
import type { WorldArtifactState } from '../features/items/worldArtifactTypes';
import type { WorldHistoryState } from '../features/world/worldHistory';
import type { WorldRuntimeState } from '../features/world/worldRuntimeTypes';
import type { BodyZoneKey, WoundLevel } from '../domain/body';
import type { LordAttributes } from '../domain/character';
import type { CharacterId } from '../domain/characterId';
import type { CharacterBuildProfile } from '../domain/characterBuild';
import type { WorldLocationRef } from '../domain/worldLocation';
import type { StateCommand } from './stateCommand';
export type { StateCommand } from './stateCommand';
import type { ActiveJourney } from '../features/map/travel/types';
import type { ActiveSceneState } from '../features/world/sceneState';
import type { RoleplayState } from '../features/roleplay/types';
import type { HealthRuntimeState } from '../features/health/types';
import type { TimePrecision } from '../features/time/gameClock';
import type {
  CharacterCreationDraft,
  CustomCharacterOverlayState,
  OpeningFacts,
} from '../features/characters/customCharacterStart';
export type { BodyZoneKey, WoundLevel } from '../domain/body';
export type { LordAttributes } from '../domain/character';

export interface BodyZoneStatus {
  key: BodyZoneKey;
  name: string;        // "头部与咽喉", "胸膛与躯干", "双臂与双手", "双腿与下肢"
  level: WoundLevel;   // 完好 (intact) | 轻创 (minor) | 重创 (heavy) | 残废致命 (critical)
  wounds: string[];    // 具体伤痕: 如 ["右额刀痕", "锁骨骨裂"]
  isFatalZone: boolean;// 头部与躯干为致命要害
}

// 领主身体状态
export interface LordBodyCondition {
  head: BodyZoneStatus;
  torso: BodyZoneStatus;
  arms: BodyZoneStatus;
  legs: BodyZoneStatus;
  isBleeding: boolean;   // 持续失血
  isPoisoned: boolean;   // 身中剧毒
  isInfected: boolean;   // 伤口发炎
}

// 领主完整角色卡
export interface LordProfile {
  canonicalCharacterId?: CharacterId;
  name: string;
  house: string;
  houseWords: string;
  houseSigil: string;
  coatOfArms?: CoatOfArmsDesign;
  dynastyName?: string;
  title: string;
  age: number;
  gender: string;
  culture?: string;
  faith?: string;
  location: WorldLocationRef;
  /** Resolved display cache. Access rules must never compare this label. */
  locationLabel: string;
  
  // 身体部位与体魄
  body: LordBodyCondition;
  overallStatus: '强健' | '挂彩' | '负重伤' | '垂危' | '阵亡';

  // 新物品系统的唯一运行时状态。
  items: ItemSystemState;

  // 财富
  goldDragons: number;
  silverStags: number;

  // CK3 六项能力与特质
  attributes: LordAttributes;
  baseAttributes?: LordAttributes; // 未计入人物特质修正的基础值，用于防止重复叠加
  traits: string[];
  traitIds?: string[];
  importedTraitIds?: string[]; // 现成人物保留的完整离线原始特质，显示时按年龄与呈现策略投影
  /** 人物构筑方向：用于行动和叙事倾向，不替代六维属性。 */
  build?: CharacterBuildProfile;
}

// D20 跑团检定定义
export interface D20Check {
  id: string;
  attribute: keyof LordAttributes;
  attributeName: string;
  /** 旧存档可能没有这些方法构筑字段。 */
  secondaryAttribute?: keyof LordAttributes;
  secondaryAttributeName?: string;
  primaryAttributeValue?: number;
  secondaryAttributeValue?: number;
  effectiveAttribute?: number;
  methodReason?: string;
  /** 稳定的意图、目标、方法与当前条件签名，用于阻止条件不变时靠改写措辞重掷。 */
  attemptKey?: string;
  conditionKey?: string;
  reusedFromCheckId?: string;
  dc: number;
  roll: number;
  attributeModifier: number;
  equipmentModifier: number;
  equipmentModifierBreakdown: Array<{
    definitionId: string;
    instanceId: string;
    name: string;
    value: number;
    reason: string;
  }>;
  checkDomain: TraitCheckDomain;
  traitModifier: number;
  traitModifierBreakdown: Array<{ traitId: string; name: string; value: number }>;
  /** 旧检定记录没有身体结算字段，因此保持可选以兼容存档。 */
  healthModifier?: number;
  healthModifierBreakdown?: Array<{
    injuryId: string;
    label: string;
    value: number;
    capabilities: string[];
  }>;
  methodEdge?: {
    traitId: string;
    traitName: string;
    label: string;
    directive: string;
  };
  outcomeContract: CheckOutcomeContract;
  total: number;
  isNatural20: boolean;
  isNatural1: boolean;
  outcome?: 'strong_success' | 'success' | 'partial' | 'failure';
  margin?: number;
  success: boolean;
  actionText: string;
  resultDescription: string;
  timestamp: number;
}

// 故事回合
export interface StoryTurn {
  id: string;
  turnNumber: number;
  playerInput: string;
  think?: string;
  narrate: string;
  speak?: Array<{ speaker: string; text: string }>;
  branches: string[];
  stateCommands?: StateCommand[];
  diceCheck?: D20Check;
  gameDate?: string;
  timestamp: number;
}

export interface WorldCharacterStateRef {
  runId: string;
  datasetHash: string;
  revision: number;
}

// 游戏全局状态
export interface GameState {
  saveFormatVersion: 11;
  currentYear: number;
  currentMonth: number;
  currentDay: number;
  /** 日内分钟，0=00:00，1439=23:59。 */
  currentMinute: number;
  /** 旧档只有日期时保留 day_only，直到下一次经过程序结算的时间推进。 */
  currentTimePrecision: TimePrecision;
  currentSeason: string;
  turnCount: number;
  lord: LordProfile;
  turns: StoryTurn[];
  worldCharacters?: WorldCharacterStateRef;
  worldArtifacts: WorldArtifactState;
  worldHistory: WorldHistoryState;
  worldRuntime: WorldRuntimeState;
  /** 人物健康的权威状态；lord.body 仅为向旧界面/旧规则提供的兼容投影。 */
  health: HealthRuntimeState;
  activeScene?: ActiveSceneState;
  roleplay?: RoleplayState;
  /** 自创人物新局的可选扩展。旧存档没有这些字段时按空数据处理。 */
  characterCreationDraft?: CharacterCreationDraft;
  customCharacters?: CustomCharacterOverlayState;
  openingFacts?: OpeningFacts;
  activeJourney?: ActiveJourney;
  worldFlags: Record<string, boolean | string | number>;
  isGameOver: boolean;
  deathReason?: string;
}

// API 配置
export interface ApiConfig {
  provider: 'deepseek' | 'openai' | 'claude' | 'siliconflow' | 'custom';
  baseUrl: string;
  apiKey: string;
  model: string;
  fallbackModel?: string;
  temperature: number;
}

// 默认健康身体状态
export function createDefaultBody(): LordBodyCondition {
  return {
    head: { key: 'head', name: '头部与咽喉', level: 'intact', wounds: [], isFatalZone: true },
    torso: { key: 'torso', name: '胸膛与躯干', level: 'intact', wounds: [], isFatalZone: true },
    arms: { key: 'arms', name: '双臂与双手', level: 'intact', wounds: [], isFatalZone: false },
    legs: { key: 'legs', name: '双腿与下肢', level: 'intact', wounds: [], isFatalZone: false },
    isBleeding: false,
    isPoisoned: false,
    isInfected: false,
  };
}
