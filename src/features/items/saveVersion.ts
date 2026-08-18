export const ITEM_SAVE_FORMAT_VERSION = 6 as const;

const RESET_REQUIRED_MESSAGE = '测试版存档格式已更新，请重置测试存档后重新开始。';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function assertSupportedGameState(value: unknown): asserts value is {
  saveFormatVersion: 6;
  lord: { items: { schemaVersion: 1 } };
  worldHistory: { schemaVersion: 1 };
} {
  if (!isRecord(value)
    || value.saveFormatVersion !== ITEM_SAVE_FORMAT_VERSION
    || !isRecord(value.lord)
    || !isRecord(value.lord.items)
    || value.lord.items.schemaVersion !== 1
    || !isRecord(value.worldHistory)
    || value.worldHistory.schemaVersion !== 1) {
    throw new Error(RESET_REQUIRED_MESSAGE);
  }
}

export function assertSupportedSaveEnvelope(value: unknown): asserts value is {
  version: 6;
  snapshots: unknown[];
  worldRuns?: unknown[];
  characterEvents?: unknown[];
} {
  if (!isRecord(value) || value.version !== ITEM_SAVE_FORMAT_VERSION) {
    throw new Error(RESET_REQUIRED_MESSAGE);
  }
  if (!Array.isArray(value.snapshots)) throw new Error('无效的存档格式：缺少快照列表');
}
