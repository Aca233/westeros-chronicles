import { createItemCatalog } from '../features/items/catalog';
import type { ItemDefinition } from '../features/items/types';
import { CURATED_ARTIFACT_DEFINITIONS } from '../features/items/curatedArtifacts';
import { loadOrdinaryItemDefinitions } from '../features/items/ordinaryItemCatalog';

const SYSTEM_ITEM_DEFINITIONS: ItemDefinition[] = [{
  id: 'tool.field_repair_kit',
  name: '随身维护工具卷',
  description: '磨石、细锉、小锤、针线和备用皮条组成的维护工具，适合处理旅途中的常见磨损。',
  roleplayText: '它只能修复普通磨损；严重断裂、精密工艺和瓦雷利亚钢仍需合适的工匠与工坊。',
  category: 'tool',
  subcategory: 'repair_kit',
  tags: ['repair', 'maintenance', 'smithing', 'sewing'],
  image: { type: 'library', iconName: 'tool' },
  material: '精钢、磨石、亚麻线与熟皮',
  baseQuality: 'common',
  rarity: 'common',
  bulk: 'small',
  stackable: false,
  maxStack: 1,
  unique: false,
  equippable: false,
  allowedPositions: [],
  baseValue: 12,
  effects: [
    { kind: 'action_unlock', actionId: 'repair_item', label: '维护受损装备' },
    { kind: 'narrative', directive: '维护工具需要时间和材料费，不能在战斗中瞬间恢复耐久。' },
  ],
}];

/**
 * Compatibility facade for the item catalog assembly. Ordinary item
 * declarations live in content/world (compiled to /data/world), curated
 * story artifacts stay in code, and generated AGOT artifacts load lazily
 * from the offline import pipeline output.
 */
export const ITEM_DEFINITIONS: ItemDefinition[] = [...SYSTEM_ITEM_DEFINITIONS, ...CURATED_ARTIFACT_DEFINITIONS];
export const ITEM_CATALOG = createItemCatalog(ITEM_DEFINITIONS) as Map<string, ItemDefinition>;

let itemCatalogPreload: Promise<void> | null = null;
let itemCatalogLoaded = false;

/** Load the compiled ordinary items and generated artifacts into the catalog. */
export function preloadItemCatalog(): Promise<void> {
  if (itemCatalogPreload) return itemCatalogPreload;
  itemCatalogPreload = Promise.all([
    loadOrdinaryItemDefinitions(),
    import('./generated/agotArtifactDefinitions').then((module) => module.AGOT_ARTIFACT_DEFINITIONS),
  ]).then(([ordinary, artifacts]) => {
    const completeDefinitions = [...ordinary, ...SYSTEM_ITEM_DEFINITIONS, ...CURATED_ARTIFACT_DEFINITIONS, ...artifacts];
    const completeCatalog = createItemCatalog(completeDefinitions);
    ITEM_DEFINITIONS.splice(0, ITEM_DEFINITIONS.length, ...completeDefinitions);
    ITEM_CATALOG.clear();
    for (const [id, definition] of completeCatalog) ITEM_CATALOG.set(id, definition);
    itemCatalogLoaded = true;
  }).catch((error) => {
    itemCatalogPreload = null;
    throw error;
  });
  return itemCatalogPreload;
}

export function isItemCatalogPreloaded(): boolean {
  return itemCatalogLoaded;
}
