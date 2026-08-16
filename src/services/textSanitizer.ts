const EMOJI_PATTERN = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0E\uFE0F\u200D\u20E3]/gu;
const EXTRA_SPACES_PATTERN = /[ \t]{2,}/g;

export function stripEmoji(value: string): string {
  return value
    .replace(EMOJI_PATTERN, '')
    .replace(EXTRA_SPACES_PATTERN, ' ')
    .replace(/ +([，。！？；：、])/g, '$1')
    .trim();
}

export function stripEmojiDeep<T>(value: T): T {
  if (typeof value === 'string') return stripEmoji(value) as T;
  if (Array.isArray(value)) return value.map((item) => stripEmojiDeep(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, stripEmojiDeep(item)])
    ) as T;
  }
  return value;
}
