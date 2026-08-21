import type { CoatOfArmsDesign } from '../data/heraldry';
import type { TraitCheckDomain } from '../services/traitEffectEngine';
import type { CheckOutcomeContract } from '../services/dicePolicy';
import type { CharacterStateCommand } from '../features/characters/characterCommands';
import type { ItemStateCommand, ItemSystemState } from '../features/items/types';
import type { WorldArtifactState } from '../features/items/worldArtifacts';
import type { WorldHistoryState } from '../features/world/worldHistory';
import type { WorldRuntimeState } from '../features/world/worldRuntimeTypes';
import type { BodyZoneKey, WoundLevel } from '../domain/body';
import type { LordAttributes } from '../domain/character';
import type { CharacterId } from '../domain/characterId';
import type { WorldLocationRef } from '../domain/worldLocation';
export type { BodyZoneKey, WoundLevel } from '../domain/body';
export type { LordAttributes } from '../domain/character';
import type { ActiveJourney, TravelStateCommand } from '../features/map/travel/types';

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

  // 财富与声望
  goldDragons: number;
  silverStags: number;
  prestige: number; // 威仪
  dread: number;    // 恶名
  
  // CK3 六项能力与特质
  attributes: LordAttributes;
  baseAttributes?: LordAttributes; // 未计入人物特质修正的基础值，用于防止重复叠加
  traits: string[];
  traitIds?: string[];
  importedTraitIds?: string[]; // 现成人物保留的完整离线原始特质，显示时按年龄与呈现策略投影
}

// 状态指令
export type StateCommand =
  | { type: 'INJURE_ZONE'; zone: BodyZoneKey; level: WoundLevel; woundText: string; reason?: string; damageTags?: string[] }
  | { type: 'HEAL_ZONE'; zone: BodyZoneKey | 'all'; level?: WoundLevel; clearWound?: string }
  | { type: 'SET_BLEEDING'; value: boolean }
  | { type: 'SET_POISONED'; value: boolean }
  | { type: 'SET_INFECTED'; value: boolean }
  | { type: 'MODIFY_GOLD'; goldDragons?: number; silverStags?: number; reason?: string }
  | { type: 'MODIFY_STAT'; stat: keyof LordAttributes; delta: number; reason?: string }
  | { type: 'MODIFY_PRESTIGE'; delta: number }
  | { type: 'MODIFY_DREAD'; delta: number }
  | { type: 'ADD_TRAIT'; trait: string }
  | { type: 'CHANGE_LOCATION'; locationId: string; sceneLocation?: string }
  | { type: 'CHANGE_TITLE'; title: string }
  | { type: 'ADVANCE_TIME'; days?: number; months?: number; years?: number; season?: string; reason?: string }
  | { type: 'SET_DATE'; year?: number; month?: number; day?: number; season?: string; reason?: string }
  | ItemStateCommand
  | CharacterStateCommand
  | TravelStateCommand;

// D20 跑团检定定义
export interface D20Check {
  id: string;
  attribute: keyof LordAttributes;
  attributeName: string;
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
  outcomeContract: CheckOutcomeContract;
  total: number;
  isNatural20: boolean;
  isNatural1: boolean;
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
  saveFormatVersion: 9;
  currentYear: number;
  currentMonth: number;
  currentDay: number;
  currentSeason: string;
  turnCount: number;
  lord: LordProfile;
  turns: StoryTurn[];
  worldCharacters?: WorldCharacterStateRef;
  worldArtifacts: WorldArtifactState;
  worldHistory: WorldHistoryState;
  worldRuntime: WorldRuntimeState;
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
