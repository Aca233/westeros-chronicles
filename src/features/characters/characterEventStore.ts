import { db } from '../../services/db';
import type { CharacterId } from '../../domain/characterId';
import { appendCharacterEventRows } from './characterEventProjection';
import type { CharacterEventEnvelope, CharacterEventInput, CharacterEventStore } from './characterEventTypes';

export type {
  CharacterEventEnvelope,
  CharacterEventInput,
  CharacterEventProjection,
  CharacterEventRowWriter,
  CharacterEventStore,
} from './characterEventTypes';
export { appendCharacterEventRows, projectCharacterEvents, sameCharacterEventContent } from './characterEventProjection';

export class InMemoryCharacterEventStore implements CharacterEventStore {
  private readonly events = new Map<string, CharacterEventEnvelope>();

  async append(runId: string, turn: number, events: readonly CharacterEventInput[]): Promise<void> {
    await appendCharacterEventRows({
      get: async ([storedRunId, id]) => this.events.get(`${storedRunId}:${id}`),
      add: async (row) => { this.events.set(`${row.runId}:${row.id}`, row); },
    }, runId, turn, events);
  }

  async eventsForCharacter(runId: string, characterId: CharacterId): Promise<CharacterEventEnvelope[]> {
    return [...this.events.values()]
      .filter((entry) => entry.runId === runId && entry.characterId === characterId)
      .sort((a, b) => a.turn - b.turn || a.sequence - b.sequence);
  }

  async truncateAfter(runId: string, turn: number): Promise<CharacterId[]> {
    const affected = new Set<CharacterId>();
    for (const [key, entry] of this.events) {
      if (entry.runId === runId && entry.turn > turn) {
        affected.add(entry.characterId);
        this.events.delete(key);
      }
    }
    return [...affected];
  }
}

export class DexieCharacterEventStore implements CharacterEventStore {
  async append(runId: string, turn: number, events: readonly CharacterEventInput[]): Promise<void> {
    await db.transaction('rw', db.characterEvents, async () => {
      await appendCharacterEventRows({
        get: async (key) => db.characterEvents.get(key),
        add: async (row) => { await db.characterEvents.add(row); },
      }, runId, turn, events);
    });
  }

  async eventsForCharacter(runId: string, characterId: CharacterId): Promise<CharacterEventEnvelope[]> {
    const rows = await db.characterEvents.where('[runId+characterId]').equals([runId, characterId]).toArray();
    return rows.sort((a, b) => a.turn - b.turn || a.sequence - b.sequence);
  }

  async truncateAfter(runId: string, turn: number): Promise<CharacterId[]> {
    const rows = await db.characterEvents.where('runId').equals(runId).and((row) => row.turn > turn).toArray();
    await db.characterEvents.bulkDelete(rows.map((row) => [row.runId, row.id]));
    return [...new Set(rows.map((row) => row.characterId))];
  }
}
