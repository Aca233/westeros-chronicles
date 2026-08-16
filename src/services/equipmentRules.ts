import type { GearItem, InventoryItem } from '../types/game';

type GearDescriptor = Partial<Pick<GearItem, 'name' | 'slot' | 'slotName' | 'bonusText' | 'description'>>
  & Partial<Pick<InventoryItem, 'category'>>;

const TORSO_ARMOR_PATTERN = /板甲|重甲|锁子甲|锁甲|鳞甲|札甲|胸甲|皮甲|战甲|重铠|护甲/;
const HEAD_ARMOR_PATTERN = /战盔|头盔|覆面盔|桶盔|钢盔/;
const OFFHAND_ARMOR_PATTERN = /盾/;
const LEG_ARMOR_PATTERN = /护胫|战靴|甲靴/;

/** 识别会造成明显日常负担的战斗防具，用于体积与穿戴后果判断。 */
export function requiresBattlePreparation(item?: GearDescriptor | null): boolean {
  if (!item) return false;
  const text = `${item.name ?? ''} ${item.slotName ?? ''} ${item.bonusText ?? ''} ${item.description ?? ''}`;
  if (item.slot === 'torso') return TORSO_ARMOR_PATTERN.test(text);
  if (item.slot === 'head') return HEAD_ARMOR_PATTERN.test(text);
  if (item.slot === 'offhand') return OFFHAND_ARMOR_PATTERN.test(text);
  if (item.slot === 'legs') return LEG_ARMOR_PATTERN.test(text);
  return false;
}

export function getEquipmentWearNotice(item?: GearDescriptor | null): string | null {
  if (!requiresBattlePreparation(item)) return null;
  if (item?.slot === 'torso') return '重型战甲通常需要侍从协助穿戴；不能作为无代价的日常服装长期穿着。';
  return '战斗防具需要在叙事中写出实际取用与穿戴，不能从据点或车驾凭空转移到身上。';
}
