import { validateWorldLocationRef } from '../map/locationResolver.ts';

export const ITEM_SAVE_FORMAT_VERSION = 7 as const;

const RESET_REQUIRED_MESSAGE = '测试版存档格式已更新，请重置测试存档后重新开始。';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
  saveFormatVersion: 7;
  lord: { items: { schemaVersion: 1 } };
  worldHistory: { schemaVersion: 1 };
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
}

export function assertSupportedSaveEnvelope(value: unknown): asserts value is {
  version: 7;
  snapshots: unknown[];
  worldRuns?: unknown[];
  characterEvents?: unknown[];
} {
  if (!isRecord(value) || value.version !== ITEM_SAVE_FORMAT_VERSION) {
    throw new Error(RESET_REQUIRED_MESSAGE);
  }
  if (!Array.isArray(value.snapshots)) throw new Error('无效的存档格式：缺少快照列表');
}
