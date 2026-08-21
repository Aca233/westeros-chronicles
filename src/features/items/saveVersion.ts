import { validateWorldLocationRef } from '../map/locationResolver.ts';
import { validateWorldRuntimeState } from '../world/worldRuntimeState.ts';

export const ITEM_SAVE_FORMAT_VERSION = 9 as const;

const RESET_REQUIRED_MESSAGE = '测试版存档格式已更新，请重置测试存档后重新开始。';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}


/**
 * A persisted baseline may be reused only when it describes the exact in-memory
 * run and committed revision that is about to advance. Old test saves are not
 * migrated; callers can discard them and seed the visible current state.
 */
export function isCompatibleTurnBaseline(snapshot: unknown, currentState: unknown): boolean {
  if (!isRecord(snapshot)
    || snapshot.formatVersion !== ITEM_SAVE_FORMAT_VERSION
    || !Number.isInteger(snapshot.turnNumber)
    || !isRecord(snapshot.gameState)) return false;

  try {
    assertSupportedGameState(snapshot.gameState);
    assertSupportedGameState(currentState);
  } catch {
    return false;
  }

  const persisted = snapshot.gameState as Record<string, unknown>;
  const current = currentState as Record<string, unknown>;
  const persistedCharacters = persisted.worldCharacters;
  const currentCharacters = current.worldCharacters;
  const persistedRuntime = persisted.worldRuntime;
  const currentRuntime = current.worldRuntime;
  if (snapshot.turnNumber !== current.turnCount
    || persisted.turnCount !== current.turnCount
    || !isRecord(persistedCharacters)
    || !isRecord(currentCharacters)
    || persistedCharacters.runId !== currentCharacters.runId
    || persistedCharacters.datasetHash !== currentCharacters.datasetHash
    || persistedCharacters.revision !== currentCharacters.revision
    || !isRecord(persistedRuntime)
    || !isRecord(currentRuntime)
    || persistedRuntime.revision !== currentRuntime.revision) return false;

  return true;
}


/**
 * Repair the revision-only drift produced by the former turn resolver, which
 * could append a valid ledger turn without advancing the runtime counter.
 * This is deliberately narrow: future counters or structurally inconsistent
 * story/ledger lengths are left untouched and rejected by the commit guard.
 */
export function repairKnownTurnRevisionDrift<T extends {
  saveFormatVersion: number;
  turnCount: number;
  turns: readonly unknown[];
  worldHistory: { turns: readonly unknown[] };
  worldRuntime: { revision: number };
  worldCharacters?: { revision: number };
}>(gameState: T): T {
  const expectedRevision = gameState.worldHistory?.turns?.length;
  if (gameState.saveFormatVersion !== ITEM_SAVE_FORMAT_VERSION
    || !Number.isInteger(gameState.turnCount)
    || !Array.isArray(gameState.turns)
    || !Number.isInteger(expectedRevision)
    || expectedRevision !== gameState.turnCount - 1
    || gameState.turns.length !== gameState.turnCount
    || !Number.isInteger(gameState.worldRuntime?.revision)
    || gameState.worldRuntime.revision < 0
    || gameState.worldRuntime.revision > expectedRevision
    || (gameState.worldCharacters !== undefined
      && (!Number.isInteger(gameState.worldCharacters.revision)
        || gameState.worldCharacters.revision < 0
        || gameState.worldCharacters.revision > expectedRevision))) {
    return gameState;
  }

  const characterRevision = gameState.worldCharacters?.revision;
  if (gameState.worldRuntime.revision === expectedRevision
    && (characterRevision === undefined || characterRevision === expectedRevision)) {
    return gameState;
  }

  return {
    ...gameState,
    worldRuntime: { ...gameState.worldRuntime, revision: expectedRevision },
    ...(gameState.worldCharacters
      ? { worldCharacters: { ...gameState.worldCharacters, revision: expectedRevision } }
      : {}),
  };
}

function hasValidContainerLocations(items: Record<string, unknown>): boolean {
  if (!isRecord(items.sites) || !isRecord(items.vehicles)) return false;
  return [...Object.values(items.sites), ...Object.values(items.vehicles)].every((container) =>
    isRecord(container)
    && validateWorldLocationRef(container.location)
    && typeof container.locationLabel === 'string'
    && Boolean(container.locationLabel.trim()));
}


function hasValidActiveJourney(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)
    || !isRecord(value.routePlan)
    || !Array.isArray(value.routePlan.legs)
    || !validateWorldLocationRef({ locationId: value.routePlan.from })
    || !validateWorldLocationRef({ locationId: value.routePlan.to })
    || !Number.isInteger(value.currentLeg)
    || (value.currentLeg as number) < 0
    || (value.currentLeg as number) > value.routePlan.legs.length
    || typeof value.progressDays !== 'number'
    || !Number.isFinite(value.progressDays)
    || value.progressDays < 0
    || !['planned', 'travelling', 'paused', 'interrupted', 'arrived'].includes(String(value.status))
    || !Array.isArray(value.companions)
    || !value.companions.every((id) => typeof id === 'string' && Boolean(id))
    || !Array.isArray(value.vehicleIds)
    || !value.vehicleIds.every((id) => typeof id === 'string' && Boolean(id))
    || !isRecord(value.startedAt)
    || !Number.isInteger(value.startedAt.year)
    || !Number.isInteger(value.startedAt.month)
    || !Number.isInteger(value.startedAt.day)) return false;
  if (value.interruptedBy !== undefined && (typeof value.interruptedBy !== 'string' || !value.interruptedBy.trim())) return false;
  if (value.locationLabels !== undefined && (!isRecord(value.locationLabels)
    || !Object.values(value.locationLabels).every((label) => typeof label === 'string' && Boolean(label.trim())))) return false;
  return value.routePlan.legs.every((leg, index) => isRecord(leg)
    && leg.index === index
    && validateWorldLocationRef({ locationId: leg.from })
    && validateWorldLocationRef({ locationId: leg.to })
    && typeof leg.days === 'number'
    && Number.isFinite(leg.days)
    && leg.days > 0);
}

export function assertSupportedGameState(value: unknown): asserts value is {
  saveFormatVersion: 9;
  lord: { items: { schemaVersion: 1 } };
  worldHistory: { schemaVersion: 1 };
  worldRuntime: { schemaVersion: 1 };
} {
  if (!isRecord(value)
    || value.saveFormatVersion !== ITEM_SAVE_FORMAT_VERSION
    || !isRecord(value.lord)
    || !validateWorldLocationRef(value.lord.location)
    || typeof value.lord.locationLabel !== 'string'
    || !value.lord.locationLabel.trim()
    || !isRecord(value.lord.items)
    || value.lord.items.schemaVersion !== 1
    || !hasValidContainerLocations(value.lord.items)
    || !hasValidActiveJourney(value.activeJourney)
    || !isRecord(value.worldHistory)
    || value.worldHistory.schemaVersion !== 1) {
    throw new Error(RESET_REQUIRED_MESSAGE);
  }
  try {
    validateWorldRuntimeState(value.worldRuntime);
  } catch {
    throw new Error(RESET_REQUIRED_MESSAGE);
  }
}

export function assertSupportedSaveEnvelope(value: unknown): asserts value is {
  version: 9;
  snapshots: unknown[];
  worldRuns?: unknown[];
  characterEvents?: unknown[];
} {
  if (!isRecord(value) || value.version !== ITEM_SAVE_FORMAT_VERSION) {
    throw new Error(RESET_REQUIRED_MESSAGE);
  }
  if (!Array.isArray(value.snapshots)) throw new Error('无效的存档格式：缺少快照列表');
}
