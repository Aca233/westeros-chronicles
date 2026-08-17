import type { CoatOfArmsDesign } from '../data/heraldry';
import type { TraitCheckDomain } from '../services/traitEffectEngine';
import type { CheckOutcomeContract } from '../services/dicePolicy';
import type { CharacterStateCommand } from '../features/characters/characterCommands';
import type { ItemStateCommand, ItemSystemState } from '../features/items/types';

// CK3 同款六项角色能力。常见角色通常位于 0 - 30 区间，数值允许因加成继续提高。
export interface LordAttributes {
  diplomacy: number;   // 外交：谈判、结盟、说服
  martial: number;     // 军事：统兵、战术、战争
  stewardship: number; // 管理：税收、领地、后勤
  intrigue: number;    // 谋略：密谋、侦破、暗杀
  learning: number;    // 学识：历史、医术、神学
  prowess: number;     // 勇武：决斗、个人战斗、体魄
}

// 自然身体部位 (头颅、躯干、双臂、双腿)
export type BodyZoneKey = 'head' | 'torso' | 'arms' | 'legs';

// 部位创伤等级
export type WoundLevel = 'intact' | 'minor' | 'heavy' | 'critical';

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

// 部位对应装备项
export interface GearItem {
  id: string;
  name: string;
  slot: 'head' | 'torso' | 'mainhand' | 'offhand' | 'legs' | 'cloak' | 'accessory';
  slotName: string;      // "头部战盔", "躯干战甲", "主手武器", "副手盾牌", "下肢护胫", "披风斗篷", "佩饰信物"
  type?: string;         // "双手巨剑", "长剑", "板甲" 等
  quality: '粗制' | '精良' | '大师精铸' | '瓦雷利亚古钢';
  condition?: '完好坚固' | '受损磨损' | '严重破损' | '完全碎裂';
  bonusText: string;     // 如 "削铁如泥 · 破甲极高" 或 "提供重型胸腹防护"
  description: string;
  icon: string;
}

// 随身补给与重要信物 / 物品栏槽位
export type EquippedGearSlot = Exclude<GearItem['slot'], 'accessory'>;

export type ItemSize = 'tiny' | 'small' | 'medium' | 'large';

export interface InventoryItem {
  id: string;
  name: string;
  category: '药草' | '毒物' | '文书' | '信物' | '工具' | '奇物' | '防具' | '武器' | '补给' | '坐骑';
  quantity: number;
  description: string;
  icon?: string;
  slot?: EquippedGearSlot;
  gearData?: GearItem;
  size?: ItemSize;
}


export interface StorageSite {
  id: string;
  name: string;
  type: 'armory' | 'wardrobe' | 'room' | 'warehouse' | 'stable' | 'camp' | 'other';
  location: string;
  description: string;
  items: InventoryItem[];
}

export interface TransportStorage {
  id: string;
  name: string;
  type: 'packhorse' | 'wagon' | 'ship' | 'other';
  location: string;
  capacity: number;
  description: string;
  items: InventoryItem[];
}

export type ItemContainerRef =
  | { type: 'carried' }
  | { type: 'site'; id: string }
  | { type: 'vehicle'; id: string };


// 兼容别名
export type PouchItem = InventoryItem;

// 领主全身装备栏 (与身体部位 1:1 挂钩)
export interface LordGearSlots {
  head?: GearItem;             // 头部装备 (战盔/风帽/冠冕)
  torso: GearItem;             // 躯干装备 (重板甲/锁子甲/丝绸长袍)
  mainhand: GearItem;          // 主手武器 (巨剑/长剑/龙晶匕首)
  offhand?: GearItem;          // 副手装备 (鸢形大盾/短刀/火把)
  legs?: GearItem;             // 腿部装备 (精钢护胫马靴/熟皮长靴)
  cloak?: GearItem;            // 披风/斗篷 (纯黑守夜人斗篷/狼皮大氅)
  companion?: {                // 通灵战兽/坐骑
    name: string;
    type: string;
    bonus: string;
    description: string;
  };
  inventory?: InventoryItem[];  // 旧存档兼容字段，新系统使用 LordProfile.carriedItems
  pouch?: InventoryItem[];      // 旧存档兼容字段
}

// 领主完整角色卡
export interface LordProfile {
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
  location: string;
  
  // 身体部位与体魄
  body: LordBodyCondition;
  overallStatus: '强健' | '挂彩' | '负重伤' | '垂危' | '阵亡';

  // 新物品系统的唯一运行时状态。
  items: ItemSystemState;

  // 临时脚手架：Tasks 7-12 期间仅供旧界面编译，禁止读取或写回 items。
  gear: LordGearSlots;

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

  // 物品归属：随身小件、固定据点和可移动运输工具互相独立。
  carriedItems?: InventoryItem[];
  storageSites?: StorageSite[];
  transports?: TransportStorage[];
}

// 状态指令
export type StateCommand =
  | { type: 'INJURE_ZONE'; zone: BodyZoneKey; level: WoundLevel; woundText: string; reason?: string }
  | { type: 'HEAL_ZONE'; zone: BodyZoneKey | 'all'; level?: WoundLevel; clearWound?: string }
  | { type: 'SET_BLEEDING'; value: boolean }
  | { type: 'SET_POISONED'; value: boolean }
  | { type: 'SET_INFECTED'; value: boolean }
  | { type: 'SET_GEAR_CONDITION'; slot: EquippedGearSlot; condition: GearItem['condition'] }
  | { type: 'EQUIP_GEAR'; slot: EquippedGearSlot; item: GearItem }
  | { type: 'UNEQUIP_GEAR'; slot: EquippedGearSlot; moveToInventory?: boolean; to?: ItemContainerRef }
  | { type: 'EQUIP_FROM_INVENTORY'; itemId: string; slot?: EquippedGearSlot }
  | { type: 'USE_CARRIED_ITEM'; itemId: string }
  | { type: 'ADD_CARRIED_ITEM'; item: InventoryItem }
  | { type: 'ADD_ITEM'; item: InventoryItem; to: ItemContainerRef }
  | { type: 'EQUIP_ITEM'; itemId: string; from: ItemContainerRef; slot?: EquippedGearSlot }
  | { type: 'TRANSFER_ITEM'; itemId: string; from: ItemContainerRef; to: ItemContainerRef; quantity?: number }
  | { type: 'ADD_TRANSPORT'; transport: TransportStorage }
  | { type: 'MOVE_TRANSPORT'; transportId: string; location: string }
  | { type: 'USE_INVENTORY_ITEM'; itemId: string }
  | { type: 'ADD_INVENTORY_ITEM'; item: InventoryItem }
  | { type: 'USE_POUCH_ITEM'; itemId: string }
  | { type: 'ADD_POUCH_ITEM'; item: InventoryItem }
  | { type: 'MODIFY_GOLD'; goldDragons?: number; silverStags?: number; reason?: string }
  | { type: 'MODIFY_STAT'; stat: keyof LordAttributes; delta: number; reason?: string }
  | { type: 'MODIFY_PRESTIGE'; delta: number }
  | { type: 'MODIFY_DREAD'; delta: number }
  | { type: 'ADD_TRAIT'; trait: string }
  | { type: 'CHANGE_LOCATION'; location: string }
  | { type: 'CHANGE_TITLE'; title: string }
  | { type: 'ADVANCE_TIME'; days?: number; months?: number; years?: number; season?: string; reason?: string }
  | { type: 'SET_DATE'; year?: number; month?: number; day?: number; season?: string; reason?: string }
  | ItemStateCommand
  | CharacterStateCommand;

// D20 跑团检定定义
export interface D20Check {
  id: string;
  attribute: keyof LordAttributes;
  attributeName: string;
  dc: number;
  roll: number;
  attributeModifier: number;
  equipmentBonus: number;
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
  saveFormatVersion: 4;
  currentYear: number;
  currentMonth: number;
  currentDay: number;
  currentSeason: string;
  turnCount: number;
  lord: LordProfile;
  turns: StoryTurn[];
  worldCharacters?: WorldCharacterStateRef;
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
