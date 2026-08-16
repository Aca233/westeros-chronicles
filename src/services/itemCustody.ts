import type { InventoryItem, ItemContainerRef, LordProfile, StorageSite, TransportStorage } from '../types/game';
import { requiresBattlePreparation } from './equipmentRules';

export const DEFAULT_CARRIED_CAPACITY = 8;

export function getLocationRoot(location: string): string {
  return String(location || '').split('·')[0].trim();
}

export function isContainerAccessible(currentLocation: string, containerLocation: string): boolean {
  const current = String(currentLocation || '').trim();
  const stored = String(containerLocation || '').trim();
  if (!current || !stored) return false;
  const currentRoot = getLocationRoot(current);
  const storedRoot = getLocationRoot(stored);
  return current.includes(stored) || stored.includes(currentRoot) || currentRoot === storedRoot;
}

export function inferItemSize(item: InventoryItem): NonNullable<InventoryItem['size']> {
  if (item.size) return item.size;
  if (item.category === '坐骑') return 'large';
  if (requiresBattlePreparation(item.gearData || item)) return 'large';
  if (item.category === '防具') return 'medium';
  if (item.category === '武器' && /巨剑|长枪|骑枪|长弓|战斧/.test(item.name)) return 'medium';
  if (item.category === '药草' || item.category === '毒物' || item.category === '文书') return 'tiny';
  return 'small';
}

export function getItemBulk(item: InventoryItem): number {
  const size = inferItemSize(item);
  if (size === 'tiny') return 0;
  if (size === 'small') return 1;
  if (size === 'medium') return 2;
  return 4;
}

export function getUsedCapacity(items: readonly InventoryItem[]): number {
  return items.reduce((total, item) => total + getItemBulk(item) * Math.max(1, item.quantity || 1), 0);
}

export function getAccessibleStorageSites(lord: LordProfile): StorageSite[] {
  return (lord.storageSites || []).filter((site) => isContainerAccessible(lord.location, site.location));
}

export function getAccessibleTransports(lord: LordProfile): TransportStorage[] {
  return (lord.transports || []).filter((vehicle) => isContainerAccessible(lord.location, vehicle.location));
}

export function ensureItemCustody(lord: LordProfile): LordProfile {
  if (!lord.storageSites) lord.storageSites = [];
  if (!lord.transports) lord.transports = [];

  if (!lord.carriedItems) {
    const legacyItems = lord.gear.inventory || lord.gear.pouch || [];
    const carried: InventoryItem[] = [];
    const stored: InventoryItem[] = [];
    for (const item of legacyItems) {
      const normalized = { ...item, size: inferItemSize(item) };
      if (normalized.size === 'large' || requiresBattlePreparation(normalized.gearData || normalized)) stored.push(normalized);
      else carried.push(normalized);
    }
    lord.carriedItems = carried;
    if (stored.length) {
      lord.storageSites.push({
        id: 'legacy_local_storage',
        name: `${getLocationRoot(lord.location) || '当前据点'}储藏处`,
        type: 'warehouse',
        location: getLocationRoot(lord.location) || lord.location,
        description: '由旧存档物品栏迁移而来的本地储藏。',
        items: stored,
      });
    }
  }

  delete lord.gear.inventory;
  delete lord.gear.pouch;
  return lord;
}

export function resolveContainerItems(
  lord: LordProfile,
  ref: ItemContainerRef,
): { items?: InventoryItem[]; label: string; capacity?: number; accessible: boolean } {
  ensureItemCustody(lord);
  if (ref.type === 'carried') {
    return { items: lord.carriedItems || [], label: '随身物品', capacity: DEFAULT_CARRIED_CAPACITY, accessible: true };
  }
  if (ref.type === 'site') {
    const site = (lord.storageSites || []).find((entry) => entry.id === ref.id);
    if (!site) return { label: '未知据点', accessible: false };
    return {
      items: site.items,
      label: site.name,
      accessible: isContainerAccessible(lord.location, site.location),
    };
  }
  const vehicle = (lord.transports || []).find((entry) => entry.id === ref.id);
  if (!vehicle) return { label: '未知运输工具', accessible: false };
  return {
    items: vehicle.items,
    label: vehicle.name,
    capacity: vehicle.capacity,
    accessible: isContainerAccessible(lord.location, vehicle.location),
  };
}

export function canContainerAccept(
  ref: ItemContainerRef,
  currentItems: readonly InventoryItem[],
  item: InventoryItem,
  quantity = 1,
  capacity?: number,
): boolean {
  if (ref.type === 'carried' && inferItemSize(item) === 'large') return false;
  if (capacity === undefined) return true;
  return getUsedCapacity(currentItems) + getItemBulk(item) * quantity <= capacity;
}
