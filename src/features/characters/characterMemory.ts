import type { CharacterMemory } from './types';

export interface MemoryCompactionLimits {
  maxDetailed: number;
  importantThreshold: number;
}

export function compactMemories(
  memories: readonly CharacterMemory[],
  limits: MemoryCompactionLimits,
): CharacterMemory[] {
  const ordered = [...memories].sort((a, b) => a.turn - b.turn || a.id.localeCompare(b.id));
  const retainedIds = new Set(ordered
    .map((memory, index) => ({ memory, index }))
    .sort((left, right) => Number(right.memory.importance >= limits.importantThreshold)
      - Number(left.memory.importance >= limits.importantThreshold)
      || right.memory.importance - left.memory.importance
      || right.index - left.index)
    .slice(0, Math.max(0, limits.maxDetailed))
    .map(({ memory }) => memory.id));
  const result = ordered.filter((memory) => retainedIds.has(memory.id));
  const archived = ordered.filter((memory) => !retainedIds.has(memory.id));
  const archiveGroups = new Map<string, CharacterMemory[]>();
  for (const memory of archived) {
    const audience = memory.visibility === 'restricted'
      ? [...new Set([memory.characterId, ...memory.participants])].sort().join(',')
      : memory.characterId;
    const key = `${memory.visibility}|${audience}`;
    archiveGroups.set(key, [...(archiveGroups.get(key) ?? []), memory]);
  }
  for (const [groupKey, group] of archiveGroups) {
    const first = group[0];
    const last = group[group.length - 1];
    const short = (value: string) => value.length > 90 ? `${value.slice(0, 89)}…` : value;
    result.push({
      id: `summary:${first.characterId}:${first.turn}-${last.turn}:${groupKey}`,
      characterId: first.characterId,
      turn: last.turn,
      event: group.length === 1
        ? `较早互动：${short(first.event)}`
        : `较早互动共 ${group.length} 次；最早：${short(first.event)}；最近：${short(last.event)}`,
      importance: Math.max(...group.map((memory) => memory.importance)),
      participants: [...new Set(group.flatMap((memory) => memory.participants))],
      visibility: first.visibility,
    });
  }
  return result.sort((a, b) => a.turn - b.turn || a.id.localeCompare(b.id));
}
