import Dexie, { Table } from 'dexie';
import type { GameState } from '../types/game';
import type { CharacterEventEnvelope, CharacterEventInput } from '../features/characters/characterEventTypes';
import type { CharacterId } from '../domain/characterId';
import {
  ITEM_SAVE_FORMAT_VERSION,
  assertSupportedGameState,
  assertSupportedSaveEnvelope,
  isCompatibleTurnBaseline,
  repairKnownTurnRevisionDrift,
} from '../features/items/saveVersion';

export interface GameSnapshot {
  id?: number;
  slotId: string;
  formatVersion: typeof ITEM_SAVE_FORMAT_VERSION;
  turnNumber: number;
  timestamp: number;
  gameState: GameState;
  summaryNote?: string;
}

/** 存档位摘要:主菜单列表只需轻量元数据,不必加载完整 GameState。 */
export interface SaveSlotMeta {
  slotId: string;
  name: string;
  lordName: string;
  houseName: string;
  houseSigil?: string;
  scenarioId?: string;
  dateLabel: string;
  turnCount: number;
  isGameOver: boolean;
  createdAt: number;
  updatedAt: number;
}

export function createSlotId(): string {
  return `slot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function createImportedRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function slotMetaFromGameState(
  slotId: string,
  gameState: GameState,
  timestamps: { createdAt?: number; updatedAt: number },
  scenarioId?: string,
): SaveSlotMeta {
  const lord = gameState.lord;
  return {
    slotId,
    name: `${lord.name} · ${lord.house}`,
    lordName: lord.name,
    houseName: lord.house,
    houseSigil: lord.houseSigil,
    scenarioId,
    dateLabel: `${gameState.currentYear} AC · ${gameState.currentMonth}月${gameState.currentDay}日`,
    turnCount: gameState.turnCount,
    isGameOver: gameState.isGameOver,
    createdAt: timestamps.createdAt ?? timestamps.updatedAt,
    updatedAt: timestamps.updatedAt,
  };
}

export interface WorldRunRecord { runId: string; datasetHash: string; revision: number; createdAt: number; }
export interface CharacterStateCacheRecord { runId: string; characterId: CharacterId; revision: number; state: unknown; }

const CHARACTER_COMMAND_TYPES = new Set([
  'SET_CHARACTER_RELATIONSHIP', 'ADD_CHARACTER_TRAIT', 'REMOVE_CHARACTER_TRAIT',
  'MOVE_CHARACTER', 'INJURE_CHARACTER', 'HEAL_CHARACTER', 'KILL_CHARACTER',
  'MARRY_CHARACTERS', 'DIVORCE_CHARACTERS', 'ADD_CHARACTER_MEMORY',
  'GRANT_CHARACTER_TITLE', 'REVOKE_CHARACTER_TITLE',
]);

const TRAVEL_COMMAND_TYPES = new Set([
  'START_TRAVEL', 'REROUTE_TRAVEL', 'RETURN_TRAVEL', 'ADVANCE_TRAVEL',
]);

function sameDate(
  left: { year: number; month: number; day: number },
  right: { year: number; month: number; day: number },
): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

/**
 * Persisted projections are only useful when they describe the same committed
 * turn. Keep this guard beside the transaction boundary so malformed callers
 * cannot store a story, ledger, character events, and date that disagree.
 */
export function assertTurnCommitConsistency(
  gameState: GameState,
  characterEvents?: readonly CharacterEventInput[],
): void {
  if (!Number.isInteger(gameState.turnCount) || gameState.turnCount < 1) {
    throw new Error(`无效的当前回合号：${gameState.turnCount}`);
  }
  if (gameState.turns.length !== gameState.turnCount) {
    throw new Error(`故事回合数量与当前回合号不一致：${gameState.turns.length}/${gameState.turnCount}`);
  }
  gameState.turns.forEach((turn, index) => {
    const expected = index + 1;
    if (turn.turnNumber !== expected) throw new Error(`故事回合号不连续：期望 ${expected}，实际 ${turn.turnNumber}`);
  });

  const history = gameState.worldHistory;
  const expectedHistoryLength = gameState.turnCount - 1;
  if (history.turns.length !== expectedHistoryLength) {
    throw new Error(`世界账本回合数量与当前回合号不一致：${history.turns.length}/${expectedHistoryLength}`);
  }
  const worldEventsById = new Map(gameState.worldRuntime.events.map((event) => [event.id, event]));
  history.turns.forEach((turn, index) => {
    const expected = index + 2;
    if (turn.turn !== expected) throw new Error(`世界账本回合号不连续：期望 ${expected}，实际 ${turn.turn}`);
    if (new Set(turn.eventIds).size !== turn.eventIds.length) {
      throw new Error(`世界账本回合 ${turn.turn} 含有重复事件引用`);
    }
    for (const eventId of turn.eventIds) {
      const event = worldEventsById.get(eventId);
      if (!event) throw new Error(`世界账本引用的世界事件不存在：${eventId}`);
      if (event.turn !== turn.turn) throw new Error(`世界账本回合 ${turn.turn} 含有其他回合的事件`);
    }
  });

  const latestHistory = history.turns.length ? history.turns[history.turns.length - 1] : undefined;
  const expectedDate = latestHistory?.resolvedOn ?? history.startDate;
  const currentDate = { year: gameState.currentYear, month: gameState.currentMonth, day: gameState.currentDay };
  if (!sameDate(currentDate, expectedDate)) {
    throw new Error(`当前日期与世界账本不一致：${currentDate.year}.${currentDate.month}.${currentDate.day}`);
  }
  if (latestHistory) {
    const latestStory = gameState.turns.length ? gameState.turns[gameState.turns.length - 1] : undefined;
    if (!latestStory || JSON.stringify(latestStory.stateCommands ?? []) !== JSON.stringify(latestHistory.acceptedCommands)) {
      throw new Error(`故事回合与世界账本回合 ${latestHistory.turn} 的接受命令不一致`);
    }
  }

  if (gameState.worldCharacters && gameState.worldCharacters.revision !== history.turns.length) {
    throw new Error(`人物世界修订号与世界账本不一致：${gameState.worldCharacters.revision}/${history.turns.length}`);
  }
  if (gameState.worldRuntime.revision !== history.turns.length) {
    throw new Error(`世界运行时修订号与世界账本不一致：${gameState.worldRuntime.revision}/${history.turns.length}`);
  }

  if (characterEvents !== undefined) {
    const acceptedCharacterCommands = latestHistory?.acceptedCommands
      .filter((command) => CHARACTER_COMMAND_TYPES.has(command.type)) ?? [];
    const hasTravelCommand = latestHistory?.acceptedCommands
      .some((command) => TRAVEL_COMMAND_TYPES.has(command.type)) ?? false;
    if (acceptedCharacterCommands.length > 0 && characterEvents.length === 0) {
      throw new Error('人物事件与世界账本中的人物命令不一致');
    }
    if (acceptedCharacterCommands.length === 0 && characterEvents.length > 0 && !hasTravelCommand) {
      throw new Error('人物事件缺少对应的人物或旅行命令');
    }
    const identityPrefix = `${gameState.turnCount}:`;
    const identities = new Set<string>();
    characterEvents.forEach((event) => {
      if (!event.id.startsWith(identityPrefix)) throw new Error(`人物事件 ${event.id} 不属于回合 ${gameState.turnCount}`);
      if (identities.has(event.id)) throw new Error(`人物事件 ID 重复：${event.id}`);
      identities.add(event.id);
    });
  }
}

export function assertTurnSuccessor(previous: GameState, next: GameState): void {
  const previousRunId = previous.worldCharacters?.runId;
  const nextRunId = next.worldCharacters?.runId;
  if (!previousRunId || previousRunId !== nextRunId) {
    throw new Error('前后快照不属于同一世界运行');
  }
  if (next.turnCount !== previous.turnCount + 1) {
    throw new Error(`快照回合必须连续：${previous.turnCount} -> ${next.turnCount}`);
  }
  if (next.worldHistory.turns.length !== previous.worldHistory.turns.length + 1) {
    throw new Error('世界账本没有随下一回合连续推进');
  }
  const previousRevision = previous.worldCharacters?.revision;
  const nextRevision = next.worldCharacters?.revision;
  if (previousRevision === undefined || nextRevision !== previousRevision + 1) {
    throw new Error(`人物世界修订号必须连续：${previousRevision ?? '无'} -> ${nextRevision ?? '无'}`);
  }
  if (next.worldRuntime.revision !== previous.worldRuntime.revision + 1) {
    throw new Error(`世界运行时修订号必须连续：${previous.worldRuntime.revision} -> ${next.worldRuntime.revision}`);
  }
}

export class GotDatabase extends Dexie {
  snapshots!: Table<GameSnapshot, number>;
  saveSlots!: Table<SaveSlotMeta, string>;
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
    // v3:多存档位。快照按 slotId 归属,新增轻量槽位元数据表;旧单链自动迁移为首个存档位。
    this.version(3).stores({
      snapshots: '++id, slotId, turnNumber, timestamp, [slotId+turnNumber]',
      saveSlots: '&slotId, updatedAt',
    }).upgrade(async (tx) => {
      const snapshotsTable = tx.table('snapshots');
      const legacy = (await snapshotsTable.toArray() as GameSnapshot[]).filter((snapshot) => snapshot.slotId == null);
      if (!legacy.length) return;
      const slotId = createSlotId();
      await Promise.all(legacy
        .filter((snapshot) => snapshot.id != null)
        .map((snapshot) => snapshotsTable.update(snapshot.id as number, { slotId })));
      const latest = legacy.reduce((left, right) => (right.turnNumber > left.turnNumber ? right : left));
      await tx.table('saveSlots').put(slotMetaFromGameState(slotId, latest.gameState, { updatedAt: latest.timestamp || Date.now() }));
    });
  }
}

export const db = new GotDatabase();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function slotChain(slotId: string) {
  return db.snapshots.where('[slotId+turnNumber]').between(
    [slotId, Dexie.minKey], [slotId, Dexie.maxKey], true, true,
  );
}

async function latestSnapshotOf(slotId: string): Promise<GameSnapshot | undefined> {
  return slotChain(slotId).reverse().first();
}

async function upsertSlotMeta(slotId: string, gameState: GameState, scenarioId?: string): Promise<SaveSlotMeta> {
  const existing = await db.saveSlots.get(slotId);
  const meta = slotMetaFromGameState(slotId, gameState, { createdAt: existing?.createdAt, updatedAt: Date.now() }, scenarioId ?? existing?.scenarioId);
  await db.saveSlots.put(meta);
  return meta;
}

/** 删除一个存档位的完整快照链及其 runId 关联的人物事件与缓存,不影响其他存档位。 */
async function purgeSlotChain(slotId: string): Promise<void> {
  const snapshots = await slotChain(slotId).toArray();
  const runIds = new Set(snapshots
    .map((snapshot) => snapshot.gameState.worldCharacters?.runId)
    .filter((runId): runId is string => Boolean(runId)));
  await db.snapshots.where('slotId').equals(slotId).delete();
  await db.saveSlots.delete(slotId);
  for (const runId of runIds) {
    await db.characterEvents.where('runId').equals(runId).delete();
    await db.characterStateCache.where('runId').equals(runId).delete();
    await db.worldRuns.delete(runId);
  }
}

function assertSupportedSnapshot(snapshot: unknown): asserts snapshot is GameSnapshot {
  if (typeof snapshot !== 'object' || snapshot === null
    || (snapshot as { formatVersion?: unknown }).formatVersion !== ITEM_SAVE_FORMAT_VERSION) {
    throw new Error('测试版存档格式已更新，请重置测试存档后重新开始。');
  }
  assertSupportedGameState((snapshot as { gameState?: unknown }).gameState);
  const supported = snapshot as GameSnapshot;
  if (supported.turnNumber !== supported.gameState.turnCount) {
    throw new Error(`快照回合号与游戏状态不一致：${supported.turnNumber}/${supported.gameState.turnCount}`);
  }
  assertTurnCommitConsistency(supported.gameState);
}

/** Validate and detach a persisted snapshot before exposing it to live state. */
export function gameStateFromSnapshot(snapshot: unknown): GameState {
  if (typeof snapshot !== 'object' || snapshot === null
    || (snapshot as { formatVersion?: unknown }).formatVersion !== ITEM_SAVE_FORMAT_VERSION) {
    throw new Error('测试版存档格式已更新，请重置测试存档后重新开始。');
  }
  const candidate = snapshot as GameSnapshot;
  const repairedState = repairKnownTurnRevisionDrift(candidate.gameState);
  const repairedSnapshot: GameSnapshot = { ...candidate, gameState: repairedState };
  assertSupportedSnapshot(repairedSnapshot);
  return clone(repairedState);
}

/** 列出全部存档位,按最近更新排序。 */
export async function listSaveSlots(): Promise<SaveSlotMeta[]> {
  return db.saveSlots.orderBy('updatedAt').reverse().toArray();
}

/** Load the newest committed state of a slot without mutating or deleting persisted data. */
export async function loadLatestGameState(slotId: string): Promise<GameState | null> {
  const latest = await latestSnapshotOf(slotId);
  return latest ? gameStateFromSnapshot(latest) : null;
}

async function upsertWorldRun(gameState: GameState): Promise<void> {
  const ref = gameState.worldCharacters;
  if (!ref) return;
  const existing = await db.worldRuns.get(ref.runId);
  await db.worldRuns.put({ runId: ref.runId, datasetHash: ref.datasetHash, revision: ref.revision, createdAt: existing?.createdAt ?? Date.now() });
}


/**
 * Keep the persisted predecessor aligned with the state the player can see.
 * Test builds deliberately do not migrate old save formats: an incompatible,
 * missing, or foreign baseline is discarded (scoped to this slot only) before
 * any model request starts.
 */
export async function ensureTurnSnapshotBaseline(slotId: string, gameState: GameState): Promise<'ready' | 'reset'> {
  assertSupportedGameState(gameState);
  assertTurnCommitConsistency(gameState);

  return db.transaction('rw', db.snapshots, db.saveSlots, db.worldRuns, db.characterEvents, db.characterStateCache, async () => {
    const latest = await latestSnapshotOf(slotId);
    if (latest && isCompatibleTurnBaseline(latest, gameState)) {
      try {
        assertSupportedSnapshot(latest);
        return 'ready' as const;
      } catch {
        // A current-version but internally inconsistent test snapshot is stale.
      }
    }

    await purgeSlotChain(slotId);
    await upsertWorldRun(gameState);
    await db.snapshots.add({
      slotId,
      formatVersion: ITEM_SAVE_FORMAT_VERSION,
      turnNumber: gameState.turnCount,
      timestamp: Date.now(),
      gameState: clone(gameState),
      summaryNote: '自动重建测试存档基线',
    });
    await upsertSlotMeta(slotId, gameState);
    return 'reset' as const;
  });
}

export async function saveTurnSnapshot(
  slotId: string,
  gameState: GameState,
  summaryNote?: string,
  scenarioId?: string,
): Promise<number> {
  assertSupportedGameState(gameState);
  assertTurnCommitConsistency(gameState);
  return db.transaction('rw', db.snapshots, db.saveSlots, db.worldRuns, async () => {
    await upsertWorldRun(gameState);
    const snapshotId = await db.snapshots.add({ slotId, formatVersion: ITEM_SAVE_FORMAT_VERSION, turnNumber: gameState.turnCount, timestamp: Date.now(), gameState: clone(gameState), summaryNote });
    await upsertSlotMeta(slotId, gameState, scenarioId);
    return snapshotId;
  });
}

export async function commitTurnAtomically(
  slotId: string,
  gameState: GameState,
  characterEvents: readonly CharacterEventInput[],
  summaryNote?: string,
): Promise<number> {
  assertSupportedGameState(gameState);
  assertTurnCommitConsistency(gameState, characterEvents);
  const ref = gameState.worldCharacters;
  if (characterEvents.length && !ref) throw new Error('人物事件缺少世界运行标识，无法提交');
  return db.transaction('rw', db.snapshots, db.saveSlots, db.worldRuns, db.characterEvents, db.characterStateCache, async () => {
    const previousSnapshot = await latestSnapshotOf(slotId);
    if (!previousSnapshot) throw new Error('缺少前一回合快照，无法原子提交');
    assertSupportedSnapshot(previousSnapshot);
    assertTurnSuccessor(previousSnapshot.gameState, gameState);
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
    const snapshotId = await db.snapshots.add({ slotId, formatVersion: ITEM_SAVE_FORMAT_VERSION, turnNumber: gameState.turnCount, timestamp: Date.now(), gameState: clone(gameState), summaryNote });
    await upsertSlotMeta(slotId, gameState);
    return snapshotId;
  });
}

export async function getRecentSnapshots(slotId: string, limit = 10): Promise<GameSnapshot[]> {
  const snapshots = await slotChain(slotId).reverse().limit(limit).toArray();
  snapshots.forEach(assertSupportedSnapshot);
  return snapshots;
}

export async function rollbackLastTurn(slotId: string): Promise<GameState | null> {
  return db.transaction('rw', db.snapshots, db.saveSlots, db.worldRuns, db.characterEvents, db.characterStateCache, async () => {
    const all = await slotChain(slotId).toArray();
    if (all.length < 2) return null;
    const current = all[all.length - 1];
    const previous = all[all.length - 2];
    assertSupportedSnapshot(current);
    assertSupportedSnapshot(previous);
    assertTurnSuccessor(previous.gameState, current.gameState);
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
    await upsertSlotMeta(slotId, previous.gameState);
    return clone(previous.gameState);
  });
}

export async function deleteSaveSlot(slotId: string): Promise<void> {
  await db.transaction('rw', db.snapshots, db.saveSlots, db.worldRuns, db.characterEvents, db.characterStateCache, async () => {
    await purgeSlotChain(slotId);
  });
}

export async function exportSaveData(slotId: string): Promise<string> {
  const [snapshots, worldRuns, characterEvents] = await Promise.all([
    slotChain(slotId).toArray(),
    db.worldRuns.toArray(),
    db.characterEvents.toArray(),
  ]);
  snapshots.sort((left, right) => left.turnNumber - right.turnNumber);
  snapshots.forEach(assertSupportedSnapshot);
  const runIds = new Set(snapshots
    .map((snapshot) => snapshot.gameState.worldCharacters?.runId)
    .filter((runId): runId is string => Boolean(runId)));
  return JSON.stringify({
    version: ITEM_SAVE_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    slotId,
    snapshots,
    worldRuns: worldRuns.filter((record) => runIds.has(record.runId)),
    characterEvents: characterEvents.filter((envelope) => runIds.has(envelope.runId)),
  }, null, 2);
}

/**
 * 导入存档为一个新的存档位,不影响现有周目。导入链会被铸上新的 runId,
 * 避免与库中已有运行的人物事件键冲突;旧版(单链)导出包同样兼容。
 */
export async function importSaveData(jsonString: string): Promise<SaveSlotMeta | null> {
  try {
    const parsed: unknown = JSON.parse(jsonString);
    assertSupportedSaveEnvelope(parsed);
    if (parsed.snapshots.length === 0) throw new Error('存档包中没有可用的快照');
    parsed.snapshots.forEach(assertSupportedSnapshot);
    const slotId = createSlotId();
    const importedRunId = createImportedRunId();
    const snapshots = clone(parsed.snapshots as GameSnapshot[]).map((snapshot) => ({
      ...snapshot,
      id: undefined,
      slotId,
      gameState: {
        ...snapshot.gameState,
        worldCharacters: snapshot.gameState.worldCharacters
          ? { ...snapshot.gameState.worldCharacters, runId: importedRunId }
          : undefined,
      },
    }));
    const rewriteRunId = <T extends { runId: string }>(rows: T[]): T[] => rows.map((row) => ({ ...row, runId: importedRunId }));
    const worldRuns = Array.isArray(parsed.worldRuns) ? rewriteRunId(clone(parsed.worldRuns as WorldRunRecord[])) : [];
    const characterEvents = Array.isArray(parsed.characterEvents) ? rewriteRunId(clone(parsed.characterEvents as CharacterEventEnvelope[])) : [];
    await db.transaction('rw', db.snapshots, db.saveSlots, db.worldRuns, db.characterEvents, db.characterStateCache, async () => {
      await db.snapshots.bulkAdd(snapshots);
      if (worldRuns.length) await db.worldRuns.bulkPut(worldRuns);
      if (characterEvents.length) await db.characterEvents.bulkPut(characterEvents);
    });
    const latest = snapshots.reduce((left, right) => (right.turnNumber > left.turnNumber ? right : left));
    return upsertSlotMeta(slotId, latest.gameState);
  } catch (err) {
    console.error('导入存档失败:', err);
    throw err;
  }
}

export async function clearSaveData(): Promise<void> {
  await db.transaction('rw', db.snapshots, db.saveSlots, db.worldRuns, db.characterEvents, db.characterStateCache, async () => {
    await Promise.all([db.snapshots.clear(), db.saveSlots.clear(), db.worldRuns.clear(), db.characterEvents.clear(), db.characterStateCache.clear()]);
  });
}
