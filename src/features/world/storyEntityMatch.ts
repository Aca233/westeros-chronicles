import type { EntityInfo } from '../../data/entities';

export interface StoryEntityMatch {
  index: number;
  keyword: string;
  entity: EntityInfo;
}

function findSingleStoryEntity(text: string, entities: readonly EntityInfo[]): StoryEntityMatch | null {
  let match: StoryEntityMatch | null = null;
  for (const entity of entities) {
    for (const keyword of entity.keywords) {
      const index = text.indexOf(keyword);
      if (index < 0) continue;
      if (!match || index < match.index || (index === match.index && keyword.length > match.keyword.length)) {
        match = { index, keyword, entity };
      }
    }
  }
  return match;
}

function sameStoryEntity(left: EntityInfo, right: EntityInfo): boolean {
  if (left.category !== right.category) return false;
  if (left.characterId || right.characterId) return left.characterId === right.characterId;
  if (left.location || right.location) return left.location?.locationId === right.location?.locationId;
  return left.name === right.name;
}

export function findNextStoryEntity(text: string, entities: readonly EntityInfo[]): StoryEntityMatch | null {
  const first = findSingleStoryEntity(text, entities);
  if (!first) return null;

  let keyword = first.keyword;
  let suffix = text.slice(first.index + keyword.length);
  while (suffix) {
    const adjacent = findSingleStoryEntity(suffix, entities);
    if (!adjacent || adjacent.index !== 0 || !sameStoryEntity(first.entity, adjacent.entity)) break;
    keyword += adjacent.keyword;
    suffix = suffix.slice(adjacent.keyword.length);
  }

  return { ...first, keyword };
}
