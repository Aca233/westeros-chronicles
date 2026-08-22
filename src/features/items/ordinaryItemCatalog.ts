import { createItemCatalog } from './catalog';
import type { ItemDefinition } from './types';
import { WorldContentRepository, type FetchJson } from '../world-content/repository';

// Minimal ambient declarations so the browser-only tsconfig accepts the
// offline Node fallback below without pulling in @types/node.
declare const process: { versions?: { node?: string }; cwd(): string } | undefined;
const NODE_FS_SPECIFIER = 'node:fs/promises';
const NODE_PATH_SPECIFIER = 'node:path';

export interface OrdinaryItemCatalogLoader {
  (): Promise<readonly ItemDefinition[]>;
}

export function createOrdinaryItemCatalogLoader(fetchJson: FetchJson): OrdinaryItemCatalogLoader {
  const repository = new WorldContentRepository(fetchJson);
  let cached: readonly ItemDefinition[] | null = null;
  let pending: Promise<readonly ItemDefinition[]> | null = null;
  return async () => {
    if (cached) return cached;
    pending ??= repository.loadOrdinaryItems().then((items) => {
      cached = items as readonly ItemDefinition[];
      return cached;
    });
    try {
      return await pending;
    } catch (error) {
      pending = null;
      throw error;
    }
  };
}

/**
 * Loads the ordinary item declarations compiled from content/world. Rule
 * code (effects executors, capacity, equipment algorithms) never changes;
 * only the declarations are data-driven now.
 */
export const loadOrdinaryItemDefinitions: OrdinaryItemCatalogLoader = createOrdinaryItemCatalogLoader(
  async (path) => {
    const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
    if (isNode) {
      // Offline scripts and tests read the compiled output directly; they
      // always run from the repository root.
      const { readFile } = await import(NODE_FS_SPECIFIER);
      const { join } = await import(NODE_PATH_SPECIFIER);
      return JSON.parse(await readFile(join(process.cwd(), 'public', path), 'utf8'));
    }
    const response = await fetch(path);
    if (!response.ok) throw new Error(`世界内容读取失败：${response.status} ${path}`);
    return response.json();
  },
);

export function createOrdinaryItemCatalog(definitions: readonly ItemDefinition[]): Map<string, ItemDefinition> {
  return createItemCatalog(definitions) as Map<string, ItemDefinition>;
}
