import Dexie, { Table } from 'dexie';
import type { GameState } from '../types/game';
import type { CharacterEventEnvelope, CharacterEventInput } from '../features/characters/characterEventStore';
import type { CharacterId } from '../features/characters/types';
import {
  ITEM_SAVE_FORMAT_VERSION,
  assertSupportedGameState,
  assertSupportedSaveEnvelope,
} from '../features/items/saveVersion';

export interface GameSnapshot {
  id?: number;
  formatVersion: typeof ITEM_SAVE_FORMAT_VERSION;
  turnNumber: number;
  timestamp: number;
  gameState: GameState;
  summaryNote?: string;
}

export interface WorldRunRecord { runId: string; datasetHash: string; revision: number; createdAt: number; }
export interface CharacterStateCacheRecord { runId: string; characterId: CharacterId; revision: number; state: unknown; }

export class GotDatabase extends Dexie {
  snapshots!: Table<GameSnapshot, number>;
  worldRuns!: Table<WorldRunRecord, string>;
  characterEvents!: Table<CharacterEventEnvelope, [string, string]>;
  characterStateCache!: Table<CharacterStateCacheRecord, [string, CharacterId]>;

  constructor() {
    super('GotWesterosDatabase');
    this.version(1).stores({ snapshots: '++id, turnNumber, timestamp' });
    this.version(2).stores({
      snapshots: '++id, turnNumber, timestamp',
      worldRuns: '&runId, datasetHash, revision',
      characterEvents: '&[runId+id], [runId+turn], [runId+characterId], runId, turn, characterId',
      characterStateCache: '&[runId+characterId], runId, characterId, revision',
    });
  }
}

export const db = new GotDatabase();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function assertSupportedSnapshot(snapshot: unknown): asserts snapshot is GameSnapshot {
  if (typeof snapshot !== 'object' || snapshot === null
    || (snapshot as { formatVersion?: unknown }).formatVersion !== ITEM_SAVE_FORMAT_VERSION) {
    throw new Error('测试版存档格式已更新，请重置测试存档后重新开始。');
  }
  assertSupportedGameState((snapshot as { gameState?: unknown }).gameState);
}

async function upsertWorldRun(gameState: GameState): Promise<void> {
  const ref = gameState.worldCharacters;
  if (!ref) return;
  const existing = await db.worldRuns.get(ref.runId);
  await db.worldRuns.put({ runId: ref.runId, datasetHash: ref.datasetHash, revision: ref.revision, createdAt: existing?.createdAt ?? Date.now() });
}

export async function saveTurnSnapshot(gameState: GameState, summaryNote?: string): Promise<number> {
  assertSupportedGameState(gameState);
  return db.transaction('rw', db.snapshots, db.worldRuns, async () => {
    await upsertWorldRun(gameState);
    return db.snapshots.add({ formatVersion: ITEM_SAVE_FORMAT_VERSION, turnNumber: gameState.turnCount, timestamp: Date.now(), gameState: clone(gameState), summaryNote });
  });
}

export async function commitTurnAtomically(
  gameState: GameState,
  characterEvents: readonly CharacterEventInput[],
  summaryNote?: string,
): Promise<number> {
  assertSupportedGameState(gameState);
  const ref = gameState.worldCharacters;
  if (characterEvents.length && !ref) throw new Error('人物事件缺少世界运行标识，无法提交');
  return db.transaction('rw', db.snapshots, db.worldRuns, db.characterEvents, db.characterStateCache, async () => {
    if (ref) {
      for (const [sequence, input] of characterEvents.entries()) {
        const key: [string, string] = [ref.runId, input.id];
        const existing = await db.characterEvents.get(key);
        const row: CharacterEventEnvelope = { ...input, runId: ref.runId, turn: gameState.turnCount, sequence, timestamp: input.timestamp ?? Date.now() };
        if (existing) {
          const same = existing.turn === row.turn && existing.characterId === row.characterId
            && JSON.stringify(existing.event) === JSON.stringify(row.event);
          if (!same) throw new Error(`人物事件 ID 冲突：${ref.runId}/${input.id}`);
          continue;
        }
        await db.characterEvents.add(row);
      }
      if (characterEvents.length) await db.characterStateCache.where('runId').equals(ref.runId).delete();
      await upsertWorldRun(gameState);
    }
    return db.snapshots.add({ formatVersion: ITEM_SAVE_FORMAT_VERSION, turnNumber: gameState.turnCount, timestamp: Date.now(), gameState: clone(gameState), summaryNote });
  });
}

export async function getRecentSnapshots(limit = 10): Promise<GameSnapshot[]> {
  const snapshots = await db.snapshots.orderBy('turnNumber').reverse().limit(limit).toArray();
  snapshots.forEach(assertSupportedSnapshot);
  return snapshots;
}

export async function rollbackLastTurn(): Promise<GameState | null> {
  return db.transaction('rw', db.snapshots, db.worldRuns, db.characterEvents, db.characterStateCache, async () => {
    const all = await db.snapshots.orderBy('turnNumber').reverse().toArray();
    if (all.length < 2) return null;
    const current = all[0];
    const previous = all[1];
    assertSupportedSnapshot(current);
    assertSupportedSnapshot(previous);
    if (current.id) await db.snapshots.delete(current.id);
    const ref = current.gameState.worldCharacters ?? previous.gameState.worldCharacters;
    if (ref) {
      const newer = await db.characterEvents.where('runId').equals(ref.runId).and((row) => row.turn > previous.turnNumber).toArray();
      if (newer.length) await db.characterEvents.bulkDelete(newer.map((row) => [row.runId, row.id] as [string, string]));
      await db.characterStateCache.where('runId').equals(ref.runId).delete();
      const restoredRef = previous.gameState.worldCharacters;
      if (restoredRef) {
        const existing = await db.worldRuns.get(restoredRef.runId);
        await db.worldRuns.put({ ...restoredRef, createdAt: existing?.createdAt ?? Date.now() });
      } else await db.worldRuns.delete(ref.runId);
    }
    assertSupportedGameState(previous.gameState);
    return clone(previous.gameState);
  });
}

export async function exportSaveData(): Promise<string> {
  const [snapshots, worldRuns, characterEvents] = await Promise.all([
    db.snapshots.toArray(), db.worldRuns.toArray(), db.characterEvents.toArray(),
  ]);
  snapshots.forEach(assertSupportedSnapshot);
  return JSON.stringify({ version: ITEM_SAVE_FORMAT_VERSION, exportedAt: new Date().toISOString(), snapshots, worldRuns, characterEvents }, null, 2);
}

export async function importSaveData(jsonString: string): Promise<GameState | null> {
  try {
    const parsed: unknown = JSON.parse(jsonString);
    assertSupportedSaveEnvelope(parsed);
    parsed.snapshots.forEach(assertSupportedSnapshot);
    const snapshots = parsed.snapshots as GameSnapshot[];
    const worldRuns = Array.isArray(parsed.worldRuns) ? parsed.worldRuns as WorldRunRecord[] : [];
    const characterEvents = Array.isArray(parsed.characterEvents) ? parsed.characterEvents as CharacterEventEnvelope[] : [];
    await db.transaction('rw', db.snapshots, db.worldRuns, db.characterEvents, db.characterStateCache, async () => {
      await Promise.all([db.snapshots.clear(), db.worldRuns.clear(), db.characterEvents.clear(), db.characterStateCache.clear()]);
      await db.snapshots.bulkAdd(snapshots);
      if (worldRuns.length) await db.worldRuns.bulkAdd(worldRuns);
      if (characterEvents.length) await db.characterEvents.bulkAdd(characterEvents);
    });
    const latest = await db.snapshots.orderBy('turnNumber').reverse().first();
    if (!latest) return null;
    assertSupportedSnapshot(latest);
    return latest.gameState;
  } catch (err) {
    console.error('导入存档失败:', err);
    throw err;
  }
}

export async function clearSaveData(): Promise<void> {
  await db.transaction('rw', db.snapshots, db.worldRuns, db.characterEvents, db.characterStateCache, async () => {
    await Promise.all([db.snapshots.clear(), db.worldRuns.clear(), db.characterEvents.clear(), db.characterStateCache.clear()]);
  });
}
