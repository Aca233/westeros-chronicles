import { HOUSES } from '../../data/houses';
import { CHARACTER_DOSSIER_SUPPLEMENTS } from '../../data/characterDossierSupplements';
import type { EntityInfo } from '../../data/entities';
import type { CharacterSearchHit } from '../characters/types';
import type { MapLocationSearchEntry } from '../map/types';

const ROLE_SUFFIXES = [
  '国王之手', '总司令', '王太后', '王后', '国王', '公爵夫人', '公爵', '伯爵', '夫人',
  '王子', '公主', '领主', '学士', '教头', '爵士', '骑士', '首相', '司令',
] as const;

function dynastyName(dynastyId: string | null | undefined): string | undefined {
  const slug = (dynastyId ?? '').replace(/^dynn_/i, '').replace(/_/g, ' ').trim();
  if (!slug) return undefined;
  const house = HOUSES.find((candidate) => candidate.id.toLocaleLowerCase('zh-CN') === slug.toLocaleLowerCase('zh-CN'));
  return house?.name.replace(/家族$/, '') || undefined;
}

function usableKeyword(value: string, text: string): boolean {
  const keyword = value.trim();
  return keyword.length >= 2 && text.includes(keyword);
}

function characterKeywords(
  text: string,
  hit: CharacterSearchHit,
  sameNameCount: number,
): string[] {
  const supplement = CHARACTER_DOSSIER_SUPPLEMENTS[hit.id];
  const keywords = new Set<string>();
  if (sameNameCount === 1 && usableKeyword(hit.name, text)) keywords.add(hit.name);
  const house = dynastyName(hit.dynastyId);
  if (house) {
    const fullName = `${hit.name}·${house}`;
    if (usableKeyword(fullName, text)) keywords.add(fullName);
  }
  for (const alias of supplement?.aliases ?? []) {
    if (usableKeyword(alias, text)) keywords.add(alias);
  }
  for (const role of supplement?.publicRoles ?? []) {
    for (const suffix of ROLE_SUFFIXES) {
      if (!role.includes(suffix)) continue;
      const roleName = `${hit.name}${suffix}`;
      if (usableKeyword(roleName, text)) keywords.add(roleName);
    }
  }
  return [...keywords].sort((left, right) => right.length - left.length || left.localeCompare(right, 'zh-CN'));
}

function locationAliases(location: MapLocationSearchEntry): string[] {
  const aliases = new Set<string>([location.name]);
  for (const part of location.name.split(/[·/]/).map((value) => value.trim())) {
    if (part.length >= 2) aliases.add(part);
  }
  return [...aliases];
}

export function supplementMentionedCharacterIds(text: string): string[] {
  return Object.values(CHARACTER_DOSSIER_SUPPLEMENTS).flatMap((supplement) =>
    (supplement.aliases ?? []).some((alias) => usableKeyword(alias, text)) ? [supplement.characterId] : []);
}

export function buildStoryMentionEntities(
  text: string,
  characterHits: readonly CharacterSearchHit[],
  locations: readonly MapLocationSearchEntry[],
): EntityInfo[] {
  const nameCounts = new Map<string, number>();
  for (const hit of characterHits) nameCounts.set(hit.name, (nameCounts.get(hit.name) ?? 0) + 1);

  const characterEntities = characterHits.flatMap((hit) => {
    const keywords = characterKeywords(text, hit, nameCounts.get(hit.name) ?? 1);
    if (!keywords.length) return [];
    const supplement = CHARACTER_DOSSIER_SUPPLEMENTS[hit.id];
    return [{
      keywords,
      name: hit.name,
      category: 'character' as const,
      characterId: hit.id,
      icon: 'artifact-crown',
      tag: supplement?.publicRoles?.join(' · ') || dynastyName(hit.dynastyId) || '人物档案',
      description: supplement?.summary || '该人物已收录于当前世界人物档案。',
    }];
  });

  const claimedLocationAliases = new Set<string>();
  const locationEntities = [...locations]
    .sort((left, right) => right.importance - left.importance || left.id.localeCompare(right.id))
    .flatMap((location) => {
      const keywords = locationAliases(location)
        .filter((keyword) => usableKeyword(keyword, text))
        .filter((keyword) => {
          if (claimedLocationAliases.has(keyword)) return false;
          claimedLocationAliases.add(keyword);
          return true;
        });
      if (!keywords.length) return [];
      return [{
        keywords,
        name: location.name,
        category: 'location' as const,
        location: { locationId: location.id },
        icon: 'location-hightower',
        tag: '地图地点',
        description: '点击可在维斯特洛地图中定位该地点。',
      }];
    });

  return [...characterEntities, ...locationEntities];
}

export { findNextStoryEntity } from './storyEntityMatch';
