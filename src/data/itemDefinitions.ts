import { createItemCatalog } from '../features/items/catalog';
import type { ItemDefinition } from '../features/items/types';
import { CURATED_ARTIFACT_DEFINITIONS } from '../features/items/curatedArtifacts';
import { loadOrdinaryItemDefinitions } from '../features/items/ordinaryItemCatalog';

/**
 * Compatibility facade for the item catalog assembly. Ordinary item
 * declarations live in content/world (compiled to /data/world), curated
 * story artifacts stay in code, and generated AGOT artifacts load lazily
 * from the offline import pipeline output.
 */
export const ITEM_DEFINITIONS: ItemDefinition[] = [...CURATED_ARTIFACT_DEFINITIONS];
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
    const completeDefinitions = [...ordinary, ...CURATED_ARTIFACT_DEFINITIONS, ...artifacts];
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
