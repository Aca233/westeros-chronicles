const PROTOCOL_TAG_NAMES = [
  'think',
  'thought',
  'reasoning',
  'narrate',
  'speak',
  'branch',
  'choice',
  'option',
  'state_cmd',
  'world_intent',
] as const;

const PROTOCOL_NAME_PATTERN = PROTOCOL_TAG_NAMES.join('|');
const COMPLETE_PROTOCOL_TAG = new RegExp(`</?(?:${PROTOCOL_NAME_PATTERN})\\b[^>]*>`, 'gi');
const NON_NARRATIVE_SECTION = new RegExp(
  `<(?:think|thought|reasoning|branch|state_cmd|world_intent)\\b[^>]*>[\\s\\S]*?(?:<\\/(?:think|thought|reasoning|branch|state_cmd|world_intent)\\s*>|$)`,
  'gi',
);

/** Normalize only markup forms used by the model protocol; ordinary prose entities stay untouched. */
export function normalizeModelProtocolMarkup(rawText: string): string {
  return rawText
    .replace(
      /&lt;(\/?(?:think|thought|reasoning|narrate|speak|branch|choice|option|state_cmd|world_intent)\b[^&<>]*?)&gt;/gi,
      '<$1>',
    )
    .replace(/\\(?=<\/?(?:think|thought|reasoning|narrate|speak|branch|choice|option|state_cmd|world_intent)\b)/gi, '');
}

function removeTrailingPartialProtocolTag(text: string): string {
  const rawOpening = text.lastIndexOf('<');
  const encodedOpening = text.toLowerCase().lastIndexOf('&lt;');
  const opening = Math.max(rawOpening, encodedOpening);
  if (opening < 0) return text;

  const encoded = opening === encodedOpening && encodedOpening > rawOpening;
  if (encoded ? text.toLowerCase().indexOf('&gt;', opening) >= 0 : text.indexOf('>', opening) >= 0) return text;
  const fragment = text.slice(opening + (encoded ? 4 : 1)).replace(/^\/?\s*/, '').toLowerCase();
  if (!fragment || PROTOCOL_TAG_NAMES.some((name) => name.startsWith(fragment) || fragment.startsWith(name))) {
    return text.slice(0, opening);
  }
  return text;
}

function stripProtocolMarkup(text: string): string {
  return removeTrailingPartialProtocolTag(text.replace(COMPLETE_PROTOCOL_TAG, '')).trim();
}


/** Extract private reasoning for the existing expandable streaming preview without exposing its tags. */
export function extractThinkingContent(rawText: string): string {
  const normalized = normalizeModelProtocolMarkup(rawText);
  const match = normalized.match(/<(?:think|thought|reasoning)\b[^>]*>([\s\S]*?)(?:<\/(?:think|thought|reasoning)\s*>|$)/i);
  return stripProtocolMarkup(match?.[1] ?? '');
}

/** Extract clean prose from a complete or malformed model response. */
export function extractNarrativeContent(rawText: string): string {
  const normalized = normalizeModelProtocolMarkup(rawText);
  const opening = /<narrate\b[^>]*>/i.exec(normalized);
  if (opening) {
    const bodyStart = opening.index + opening[0].length;
    const remainder = normalized.slice(bodyStart);
    const closingIndex = remainder.search(/<\/narrate\s*>/i);
    const nextSectionIndex = remainder.search(/<(?:branch|state_cmd|world_intent|think|thought|reasoning)\b/i);
    const cutAt = [closingIndex, nextSectionIndex].filter((index) => index >= 0);
    const body = cutAt.length ? remainder.slice(0, Math.min(...cutAt)) : remainder;
    return stripProtocolMarkup(body);
  }

  return stripProtocolMarkup(normalized.replace(NON_NARRATIVE_SECTION, ''));
}

/** Hide protocol framing while a response is still arriving chunk by chunk. */
export function extractStreamingNarrativeContent(rawText: string): string {
  const normalized = normalizeModelProtocolMarkup(rawText);
  if (/<narrate\b[^>]*>/i.test(normalized)) return extractNarrativeContent(normalized);

  const withoutCompletedSections = normalized.replace(NON_NARRATIVE_SECTION, '');
  const withoutPartialTag = removeTrailingPartialProtocolTag(withoutCompletedSections);
  if (/<(?:think|thought|reasoning)\b/i.test(normalized) && !withoutPartialTag.trim()) return '';
  return stripProtocolMarkup(withoutPartialTag);
}
