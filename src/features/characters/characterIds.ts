import type { CharacterId } from './types';

const SEGMENT_PATTERN = /^[^\s:]+$/;

function assertSegment(value: string, label: string): string {
  const normalized = value.trim();
  if (!SEGMENT_PATTERN.test(normalized)) throw new Error(`${label}不能为空且不能包含空白或冒号`);
  return normalized;
}

export function agotCharacterId(rawId: string): CharacterId {
  return `agot:${assertSegment(rawId, 'AGOT 人物 ID')}`;
}

export function saveCharacterId(saveId: string, localId: string): CharacterId {
  return `save:${assertSegment(saveId, '存档 ID')}:${assertSegment(localId, '人物 ID')}`;
}

export function isCharacterId(value: string): value is CharacterId {
  if (value.startsWith('agot:')) return SEGMENT_PATTERN.test(value.slice(5));
  if (!value.startsWith('save:')) return false;
  const segments = value.split(':');
  return segments.length === 3 && SEGMENT_PATTERN.test(segments[1]) && SEGMENT_PATTERN.test(segments[2]);
}
