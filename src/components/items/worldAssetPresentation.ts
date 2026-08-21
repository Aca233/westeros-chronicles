import type { CharacterId } from '../../features/characters/types.ts';
import type { EquipmentPosition, ItemDefinition, ItemEffect } from '../../features/items/types.ts';
import type { WorldAssetBaseline } from '../../features/world/worldBaseline.ts';
import type { WorldPrincipalRef } from '../../features/world/worldRuntimeTypes.ts';

const GROUP_LABELS = {
  head: '头部',
  mainhand: '主手',
  offhand: '副手',
} as const;

const TORSO_LABELS = {
  garment: '躯干服装',
  armor: '躯干护甲',
  outerwear: '外披',
} as const;

const LEG_LABELS = {
  legwear: '腿部服装',
  footwear: '足部',
} as const;

export function equipmentPositionLabel(position: EquipmentPosition): string {
  if (position.group === 'torso') return TORSO_LABELS[position.layer];
  if (position.group === 'legs') return LEG_LABELS[position.layer];
  if (position.group === 'accessories') return `佩饰 ${position.index + 1}`;
  return GROUP_LABELS[position.group];
}

export function assetPrincipalLabel(
  principal: WorldPrincipalRef | null,
  characterNames: ReadonlyMap<CharacterId, string>,
): string {
  if (!principal) return '未记录';
  if (principal.type === 'character') return characterNames.get(principal.characterId) ?? '人物姓名未能解析';
  if (principal.type === 'dynasty') return '相关家族';
  return '相关头衔';
}

export function assetCustodianLabel(
  asset: WorldAssetBaseline,
  characterNames: ReadonlyMap<CharacterId, string>,
  assetNames: ReadonlyMap<string, string>,
): string {
  const { custodian } = asset;
  if (!custodian) return asset.kind === 'item' ? '未记录保管者' : '无独立保管者';
  if (custodian.type === 'character') return characterNames.get(custodian.characterId) ?? '人物姓名未能解析';
  return assetNames.get(custodian.assetId) ?? '保管容器名称未能解析';
}

export function assetEquipmentLabel(
  asset: WorldAssetBaseline,
  characterNames: ReadonlyMap<CharacterId, string>,
  assetNames: ReadonlyMap<string, string>,
): string | null {
  if (asset.kind !== 'item') return null;
  if (asset.equippedPosition) {
    const wearer = asset.placement?.type === 'character'
      ? characterNames.get(asset.placement.characterId) ?? '人物姓名未能解析'
      : '穿戴者未能解析';
    return `${wearer} · ${equipmentPositionLabel(asset.equippedPosition)}`;
  }
  if (asset.placement?.type === 'asset') {
    return `存放于${assetNames.get(asset.placement.assetId) ?? '名称未能解析的资产'}`;
  }
  if (asset.placement?.type === 'character') {
    return `由${characterNames.get(asset.placement.characterId) ?? '人物姓名未能解析'}携带`;
  }
  return '当前未装备';
}

export function compactEquipmentLabel(
  asset: WorldAssetBaseline,
  definition: Pick<ItemDefinition, 'equippable' | 'allowedPositions'>,
  characterNames: ReadonlyMap<CharacterId, string>,
): string {
  if (asset.kind !== 'item') return '不适用';
  if (asset.equippedPosition) {
    const wearer = asset.placement?.type === 'character'
      ? characterNames.get(asset.placement.characterId) ?? '人物姓名未能解析'
      : '穿戴者未能解析';
    return `已装备：${wearer} · ${equipmentPositionLabel(asset.equippedPosition)}`;
  }
  if (!definition.equippable || definition.allowedPositions.length === 0) return '不可装备';
  return `未装备 · 可装备：${[...new Set(definition.allowedPositions.map(equipmentPositionLabel))].join(' / ')}`;
}

const EFFECT_KIND_LABELS: Record<Exclude<ItemEffect['kind'], 'narrative'>, string> = {
  check_modifier: '检定',
  action_unlock: '行动',
  protection: '防护',
  social: '身份',
  burden: '负担',
  fatigue: '疲劳',
  heat: '闷热',
  resource: '资源',
  capacity: '收纳',
};

export function itemEffectLabels(effects: readonly ItemEffect[], limit = 3): string[] {
  return effects.flatMap((effect) => {
    if (effect.kind === 'narrative') return [];
    if (effect.kind === 'action_unlock') return [`${EFFECT_KIND_LABELS[effect.kind]} · ${effect.label}`];
    if (effect.kind === 'capacity') return [`${EFFECT_KIND_LABELS[effect.kind]} · ${effect.label} +${effect.units}`];
    const signed = effect.value === 0 ? '' : ` ${effect.value > 0 ? '+' : ''}${effect.value}`;
    return [`${EFFECT_KIND_LABELS[effect.kind]} · ${effect.label}${signed}`];
  }).slice(0, limit);
}

export function containedAssets(
  containerAssetId: string,
  assets: readonly WorldAssetBaseline[],
): WorldAssetBaseline[] {
  return assets
    .filter((asset) => asset.kind === 'item'
      && asset.placement?.type === 'asset'
      && asset.placement.assetId === containerAssetId)
    .sort((left, right) => left.id.localeCompare(right.id));
}
