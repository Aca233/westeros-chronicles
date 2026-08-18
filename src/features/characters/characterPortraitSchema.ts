import type { CharacterId, CharacterPortraitRef, CharacterPortraitShard } from './types';

const LOCAL_PORTRAIT_PATH = /^\/assets\/character-portraits\/[a-z0-9][a-z0-9._-]*\.webp$/i;
const FOCAL_POINT = /^(?:100|\d{1,2})%\s+(?:100|\d{1,2})%$/;

export function parseCharacterPortraitShard(value: unknown): CharacterPortraitShard {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('人物头像分片格式无效');
  const result: CharacterPortraitShard = {};
  for (const [rawId, rawRef] of Object.entries(value)) {
    if (!rawId.startsWith('agot:') || !rawRef || typeof rawRef !== 'object' || Array.isArray(rawRef)) {
      throw new Error(`人物头像条目无效：${rawId}`);
    }
    const candidate = rawRef as Record<string, unknown>;
    if (candidate.characterId !== rawId
      || typeof candidate.assetPath !== 'string'
      || !LOCAL_PORTRAIT_PATH.test(candidate.assetPath)
      || typeof candidate.attributionId !== 'string'
      || !candidate.attributionId.trim()
      || (candidate.focalPoint !== undefined && (typeof candidate.focalPoint !== 'string' || !FOCAL_POINT.test(candidate.focalPoint)))) {
      throw new Error(`人物头像映射无效：${rawId}`);
    }
    const ref: CharacterPortraitRef = {
      characterId: rawId as CharacterId,
      assetPath: candidate.assetPath,
      attributionId: candidate.attributionId,
      ...(candidate.focalPoint ? { focalPoint: candidate.focalPoint } : {}),
    };
    result[rawId as CharacterId] = ref;
  }
  return result;
}
