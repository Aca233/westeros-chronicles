import type { StoryTurn } from '../types/game';
import { stripEmoji } from './textSanitizer';

export const RECENT_CONTEXT_TURN_LIMIT = 2;

export function recentContextTurns(turns: readonly StoryTurn[]): readonly StoryTurn[] {
  return turns.slice(-RECENT_CONTEXT_TURN_LIMIT);
}

export function compactNarrative(value: string, maxCharacters = 900): string {
  const text = stripEmoji(value).trim();
  if (text.length <= maxCharacters) return text;
  const headLength = Math.min(240, Math.floor(maxCharacters * 0.3));
  const tailLength = maxCharacters - headLength - 1;
  return `${text.slice(0, headLength).trimEnd()}…${text.slice(-tailLength).trimStart()}`;
}
