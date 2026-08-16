import type { CharacterId, CharacterKnowledge } from './types';

export interface KnowledgeViewerContext {
  viewerId: CharacterId | 'player';
  knownFactIds: ReadonlySet<string>;
}

function dateValue(raw?: string): number | undefined {
  if (!raw) return undefined;
  const [year, month, day] = raw.split('.').map(Number);
  return Number.isFinite(year + month + day) ? year * 10000 + month * 100 + day : undefined;
}

export function visibleFacts(
  facts: readonly CharacterKnowledge[],
  viewer: KnowledgeViewerContext,
  currentDate: string,
): CharacterKnowledge[] {
  const now = dateValue(currentDate) ?? Number.POSITIVE_INFINITY;
  return facts.filter((fact) => {
    const from = dateValue(fact.validFrom);
    const to = dateValue(fact.validTo);
    if (from !== undefined && from > now) return false;
    if (to !== undefined && to < now) return false;
    if (fact.visibility === 'system') return false;
    if (fact.visibility === 'public') return true;
    if (fact.visibility === 'player') return viewer.viewerId === 'player' || viewer.knownFactIds.has(fact.id);
    if (fact.visibility === 'restricted') return fact.knownBy?.includes(viewer.viewerId as CharacterId) ?? false;
    return viewer.knownFactIds.has(fact.id);
  });
}
