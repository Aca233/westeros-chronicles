import type {
  EquipmentPosition,
  ItemCatalog,
  ItemDefinition,
} from './types';

const TORSO_LAYERS = new Set(['garment', 'armor', 'outerwear']);
const LEG_LAYERS = new Set(['legwear', 'footwear']);
const SIMPLE_GROUPS = new Set(['head', 'mainhand', 'offhand']);

function isValidPosition(position: EquipmentPosition): boolean {
  if (SIMPLE_GROUPS.has(position.group)) return true;
  if (position.group === 'torso') return TORSO_LAYERS.has(position.layer);
  if (position.group === 'legs') return LEG_LAYERS.has(position.layer);
  if (position.group === 'accessories') return position.index === 0 || position.index === 1 || position.index === 2;
  return false;
}

function validateDefinition(definition: ItemDefinition): void {
  if (!definition.id.trim()) throw new Error('物品定义 ID 不能为空');
  if (!definition.name.trim()) throw new Error(`物品定义 ${definition.id} 缺少名称`);
  if (definition.unique && definition.stackable) throw new Error(`唯一物品不能堆叠：${definition.id}`);
  if (!Number.isInteger(definition.maxStack) || definition.maxStack < 1) {
    throw new Error(`物品最大堆叠数无效：${definition.id}`);
  }
  if (definition.stackable && definition.maxStack <= 1) {
    throw new Error(`可堆叠物品的最大堆叠数必须大于 1：${definition.id}`);
  }
  if (!definition.stackable && definition.maxStack !== 1) {
    throw new Error(`不可堆叠物品的最大堆叠数必须为 1：${definition.id}`);
  }
  if (definition.equippable && definition.allowedPositions.length === 0) {
    throw new Error(`可装备物品必须声明装备位置：${definition.id}`);
  }
  if (!definition.equippable && definition.allowedPositions.length > 0) {
    throw new Error(`不可装备物品不能声明装备位置：${definition.id}`);
  }
  if (definition.allowedPositions.some((position) => !isValidPosition(position))) {
    throw new Error(`物品声明了无效装备位置：${definition.id}`);
  }
  if (definition.handedness && !definition.allowedPositions.some((position) => position.group === 'mainhand' || position.group === 'offhand')) {
    throw new Error(`非手持物品不能声明单双手要求：${definition.id}`);
  }
  if (!Number.isFinite(definition.baseValue) || definition.baseValue < 0) {
    throw new Error(`物品基础价值无效：${definition.id}`);
  }
}

export function createItemCatalog(definitions: readonly ItemDefinition[]): ItemCatalog {
  const entries = new Map<string, ItemDefinition>();
  for (const definition of definitions) {
    validateDefinition(definition);
    if (entries.has(definition.id)) throw new Error(`重复物品定义：${definition.id}`);
    entries.set(definition.id, definition);
  }
  return entries;
}

export function getItemDefinition(catalog: ItemCatalog, definitionId: string): ItemDefinition {
  const definition = catalog.get(definitionId);
  if (!definition) throw new Error(`未知物品定义：${definitionId}`);
  return definition;
}
