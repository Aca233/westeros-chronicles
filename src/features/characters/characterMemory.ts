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
  const important = ordered.filter((memory) => memory.importance >= limits.importantThreshold);
  const ordinary = ordered.filter((memory) => memory.importance < limits.importantThreshold);
  const ordinarySlots = Math.max(0, limits.maxDetailed - important.length);
  const retainedOrdinary = ordinary.slice(-ordinarySlots);
  const archived = ordinary.slice(0, Math.max(0, ordinary.length - retainedOrdinary.length));
  const result = [...important, ...retainedOrdinary];
  if (archived.length) {
    const first = archived[0];
    const last = archived[archived.length - 1];
    result.push({
      id: `summary:${first.characterId}:${first.turn}-${last.turn}`,
      characterId: first.characterId,
      turn: last.turn,
      event: `较早互动：${archived.map((memory) => memory.event).join('；')}`,
      importance: Math.max(...archived.map((memory) => memory.importance)),
      participants: [...new Set(archived.flatMap((memory) => memory.participants))],
      visibility: archived.some((memory) => memory.visibility !== 'public') ? 'player' : 'public',
    });
  }
  return result.sort((a, b) => a.turn - b.turn || a.id.localeCompare(b.id));
}
