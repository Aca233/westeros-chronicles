import type { CharacterId } from '../../domain/characterId';
import type { LordBodyCondition } from '../../types/game';
import { migrateLegacyBodyToHealth } from '../health/state';
import { validateWorldLocationRef } from '../map/locationResolver.ts';
import { validateWorldRuntimeState } from '../world/worldRuntimeState.ts';

export const ITEM_SAVE_FORMAT_VERSION = 11 as const;
export const PREVIOUS_SAVE_FORMAT_VERSION = 10 as const;
export const LEGACY_SAVE_FORMAT_VERSION = 9 as const;

const RESET_REQUIRED_MESSAGE = '存档格式无法安全迁移，请保留原档并重新选择可兼容的存档。';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLegacyBody(value: unknown): value is LordBodyCondition {
  if (!isRecord(value)) return false;
  for (const key of ['head', 'torso', 'arms', 'legs'] as const) {
    const zone = value[key];
    if (!isRecord(zone)
      || typeof zone.key !== 'string'
      || typeof zone.name !== 'string'
      || !['intact', 'minor', 'heavy', 'critical'].includes(String(zone.level))
      || !Array.isArray(zone.wounds)
      || !zone.wounds.every((entry) => typeof entry === 'string')) return false;
  }
  return typeof value.isBleeding === 'boolean'
    && typeof value.isPoisoned === 'boolean'
    && typeof value.isInfected === 'boolean';
}

function hasValidHealthState(value: unknown): boolean {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.characters)) return false;
  return Object.entries(value.characters).every(([characterId, health]) => {
    if (!characterId.trim() || !isRecord(health)
      || health.schemaVersion !== 1
      || health.characterId !== characterId
      || typeof health.alive !== 'boolean'
      || !['left', 'right'].includes(String(health.dominantHand))
      || !['exact', 'day_only'].includes(String(health.timePrecision))
      || !Array.isArray(health.injuries)
      || !isRecord(health.survival)
      || !isRecord(health.lastUpdatedAt)
      || !isRecord(health.lastUpdatedAt.date)
      || !Number.isInteger(health.lastUpdatedAt.minuteOfDay)) return false;
    const survival = health.survival;
    if (!['hunger', 'thirst', 'fatigue'].every((key) => typeof survival[key] === 'number' && Number.isFinite(survival[key] as number))) return false;
    return health.injuries.every((injury) => isRecord(injury)
      && typeof injury.id === 'string'
      && typeof injury.cause === 'string'
      && typeof injury.kind === 'string'
      && typeof injury.zone === 'string'
      && ['minor', 'heavy', 'critical'].includes(String(injury.severity))
      && isRecord(injury.treatment)
      && isRecord(injury.recovery));
  });
}

/**
 * A persisted baseline may be reused when its in-memory migrated projection
 * describes the exact visible run/revision. The raw stored snapshot is not
 * rewritten merely to make it reusable.
 */
export function isCompatibleTurnBaseline(snapshot: unknown, currentState: unknown): boolean {
  const migratedSnapshot = migrateSnapshotToCurrent(snapshot);
  if (!isRecord(migratedSnapshot)
    || migratedSnapshot.formatVersion !== ITEM_SAVE_FORMAT_VERSION
    || !Number.isInteger(migratedSnapshot.turnNumber)
    || !isRecord(migratedSnapshot.gameState)) return false;

  try {
    assertSupportedGameState(migratedSnapshot.gameState);
    assertSupportedGameState(currentState);
  } catch {
    return false;
  }

  const persisted = migratedSnapshot.gameState as Record<string, unknown>;
  const current = currentState as Record<string, unknown>;
  const persistedCharacters = persisted.worldCharacters;
  const currentCharacters = current.worldCharacters;
  const persistedRuntime = persisted.worldRuntime;
  const currentRuntime = current.worldRuntime;
  if (migratedSnapshot.turnNumber !== current.turnCount
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

/** Repair only the former revision-counter drift; never infer missing gameplay facts. */
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
    && (characterRevision === undefined || characterRevision === expectedRevision)) return gameState;

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
  saveFormatVersion: 11;
  lord: { items: { schemaVersion: 1 } };
  worldHistory: { schemaVersion: 1 };
  worldRuntime: { schemaVersion: 1 };
  health: { schemaVersion: 1 };
} {
  if (!isRecord(value)
    || value.saveFormatVersion !== ITEM_SAVE_FORMAT_VERSION
    || !Number.isInteger(value.currentMinute)
    || (value.currentMinute as number) < 0
    || (value.currentMinute as number) >= 1440
    || !['exact', 'day_only'].includes(String(value.currentTimePrecision))
    || !hasValidHealthState(value.health)
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
  version: 9 | 10 | 11;
  snapshots: unknown[];
  worldRuns?: unknown[];
  characterEvents?: unknown[];
} {
  if (!isRecord(value)
    || (value.version !== ITEM_SAVE_FORMAT_VERSION
      && value.version !== PREVIOUS_SAVE_FORMAT_VERSION
      && value.version !== LEGACY_SAVE_FORMAT_VERSION)) {
    throw new Error(RESET_REQUIRED_MESSAGE);
  }
  if (!Array.isArray(value.snapshots)) throw new Error('无效的存档格式：缺少快照列表');
}

/** Conservatively add v10 scene/roleplay ledgers without inferring facts from prose. */
function migrateGameStateV9ToV10(value: unknown): unknown {
  if (!isRecord(value) || value.saveFormatVersion !== LEGACY_SAVE_FORMAT_VERSION) return value;
  const lord = isRecord(value.lord) ? value.lord : undefined;
  const location = lord && validateWorldLocationRef(lord.location) ? lord.location : { locationId: 'b_unknown_westeros' };
  const turnCount = Number.isInteger(value.turnCount) ? value.turnCount as number : 1;
  const playerId = lord && typeof lord.canonicalCharacterId === 'string' ? lord.canonicalCharacterId : undefined;
  return {
    ...value,
    saveFormatVersion: PREVIOUS_SAVE_FORMAT_VERSION,
    activeScene: isRecord(value.activeScene) ? value.activeScene : {
      schemaVersion: 1,
      id: `scene:${location.locationId}:${typeof location.sceneLocation === 'string' && location.sceneLocation.trim() ? location.sceneLocation.trim() : 'unspecified'}`,
      revision: 0,
      location: { ...location },
      presentCharacterIds: playerId ? [playerId] : [],
      updatedTurn: turnCount,
    },
    roleplay: isRecord(value.roleplay) ? {
      ...value.roleplay,
      relationshipEvidence: Array.isArray(value.roleplay.relationshipEvidence) ? value.roleplay.relationshipEvidence : [],
      messages: Array.isArray(value.roleplay.messages) ? value.roleplay.messages : [],
      agendas: Array.isArray(value.roleplay.agendas) ? value.roleplay.agendas : [],
      projects: Array.isArray(value.roleplay.projects) ? value.roleplay.projects : [],
      growthOpportunities: Array.isArray(value.roleplay.growthOpportunities) ? value.roleplay.growthOpportunities : [],
    } : {
      schemaVersion: 1,
      revision: 0,
      socialEvents: [],
      commitments: [],
      knowledge: [],
      relationshipEvidence: [],
      messages: [],
      agendas: [],
      projects: [],
      growthOpportunities: [],
    },
  };
}

/**
 * v10 -> v11: add minute clock and authoritative detailed health. Old four-zone
 * wounds are kept as one unknown-side injury each; they are never duplicated
 * across left/right. The migration only reflects already-recorded disability
 * traits and never invents a new death or disability.
 */
function migrateGameStateV10ToV11(value: unknown): unknown {
  if (!isRecord(value) || value.saveFormatVersion !== PREVIOUS_SAVE_FORMAT_VERSION) return value;
  const lord = isRecord(value.lord) ? value.lord : undefined;
  if (!lord || !isLegacyBody(lord.body)) throw new Error(RESET_REQUIRED_MESSAGE);
  const year = Number.isInteger(value.currentYear) ? value.currentYear as number : 298;
  const month = Number.isInteger(value.currentMonth) ? value.currentMonth as number : 1;
  const day = Number.isInteger(value.currentDay) ? value.currentDay as number : 1;
  const runId = isRecord(value.worldCharacters) && typeof value.worldCharacters.runId === 'string'
    ? value.worldCharacters.runId
    : 'legacy';
  const playerId = (typeof lord.canonicalCharacterId === 'string'
    ? lord.canonicalCharacterId
    : `save:${runId}:player`) as CharacterId;
  const traitIds = Array.isArray(lord.traitIds)
    ? lord.traitIds.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const currentMinute = 12 * 60;
  const playerHealth = migrateLegacyBodyToHealth(
    playerId,
    lord.body,
    { date: { year, month, day }, minuteOfDay: currentMinute },
    { precision: 'day_only', traitIds },
  );
  return {
    ...value,
    saveFormatVersion: ITEM_SAVE_FORMAT_VERSION,
    currentMinute,
    currentTimePrecision: 'day_only',
    health: { schemaVersion: 1, characters: { [playerId]: playerHealth } },
  };
}

export function migrateGameStateToCurrent(value: unknown): unknown {
  return migrateGameStateV10ToV11(migrateGameStateV9ToV10(value));
}

export function migrateSnapshotToCurrent(value: unknown): unknown {
  if (!isRecord(value)
    || (value.formatVersion !== LEGACY_SAVE_FORMAT_VERSION && value.formatVersion !== PREVIOUS_SAVE_FORMAT_VERSION)) return value;
  return { ...value, formatVersion: ITEM_SAVE_FORMAT_VERSION, gameState: migrateGameStateToCurrent(value.gameState) };
}
