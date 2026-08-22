import type { CharacterId } from '../characters/types';
import { WorldContentRepository, type FetchJson } from '../world-content/repository';
import type {
  NpcLoadoutOverrideContent,
  NpcLoadoutTemplateContent,
} from '../world-content/types';

declare const process: { versions?: { node?: string }; cwd(): string } | undefined;
const NODE_FS_SPECIFIER = 'node:fs/promises';
const NODE_PATH_SPECIFIER = 'node:path';

export interface NpcLoadoutContent {
  templates: ReadonlyMap<string, NpcLoadoutTemplateContent>;
  overrides: ReadonlyMap<CharacterId, NpcLoadoutOverrideContent>;
}

export type NpcLoadoutContentLoader = () => Promise<NpcLoadoutContent>;

function toContentMaps(value: { templates: readonly NpcLoadoutTemplateContent[]; overrides: readonly NpcLoadoutOverrideContent[] }): NpcLoadoutContent {
  return {
    templates: new Map(value.templates.map((template) => [template.id, template])),
    overrides: new Map(value.overrides.map((override) => [override.characterId, override])),
  };
}

export function createNpcLoadoutContentLoader(fetchJson: FetchJson): NpcLoadoutContentLoader {
  const repository = new WorldContentRepository(fetchJson);
  let cached: NpcLoadoutContent | null = null;
  let pending: Promise<NpcLoadoutContent> | null = null;
  return async () => {
    if (cached) return cached;
    pending ??= repository.loadLoadouts().then((content) => {
      cached = toContentMaps(content);
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

export const loadNpcLoadoutContent: NpcLoadoutContentLoader = createNpcLoadoutContentLoader(
  async (path) => {
    const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
    if (isNode) {
      const { readFile } = await import(NODE_FS_SPECIFIER);
      const { join } = await import(NODE_PATH_SPECIFIER);
      return JSON.parse(await readFile(join(process.cwd(), 'public', path), 'utf8'));
    }
    const response = await fetch(path);
    if (!response.ok) throw new Error(`世界内容读取失败：${response.status} ${path}`);
    return response.json();
  },
);

let npcLoadoutContent: NpcLoadoutContent = {
  templates: new Map(),
  overrides: new Map(),
};
let npcLoadoutPreload: Promise<NpcLoadoutContent> | null = null;

export function getNpcLoadoutContent(): NpcLoadoutContent {
  return npcLoadoutContent;
}

export function replaceNpcLoadoutContent(content: NpcLoadoutContent): void {
  npcLoadoutContent = content;
}

export function preloadNpcLoadoutContent(): Promise<NpcLoadoutContent> {
  if (npcLoadoutPreload) return npcLoadoutPreload;
  npcLoadoutPreload = loadNpcLoadoutContent().then((content) => {
    npcLoadoutContent = content;
    return content;
  }).catch((error) => {
    npcLoadoutPreload = null;
    throw error;
  });
  return npcLoadoutPreload;
}
