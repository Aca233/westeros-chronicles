import { ITEM_CATALOG, preloadItemCatalog } from '../../src/data/itemDefinitions';
import { createInitialLivingWorldItems } from '../../src/features/world/worldStartState';
import worldStartState from '../../public/data/world/start-state.json';

/**
 * Test-facing helpers that project the compiled unified world start assets,
 * replacing the retired per-preset code factories. Ordinary items load from
 * the compiled world content, so bundles must await this before reading
 * ITEM_CATALOG.
 */
export const ordinaryCatalogReady = preloadItemCatalog();

export const createNedItemState = () => createInitialLivingWorldItems('agot:Stark_3', worldStartState, ITEM_CATALOG);
export const createJonItemState = () => createInitialLivingWorldItems('agot:Stark_7', worldStartState, ITEM_CATALOG);
export const createDaenerysItemState = () => createInitialLivingWorldItems('agot:Targaryen_9', worldStartState, ITEM_CATALOG);
export { worldStartState };
