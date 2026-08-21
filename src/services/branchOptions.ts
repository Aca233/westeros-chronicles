function cleanBranchOption(value: string): string {
  return value
    .replace(/<\/?choice\b[^>]*>/gi, '')
    .replace(/<\/?(?:option|item)\b[^>]*>/gi, '')
    .replace(/^\s*(?:[-*•]\s*)?(?:\(?\d{1,2}\)?[.、:：）)]\s*)?/, '')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseBranchOptions(content: string): string[] {
  const nestedChoices = [...content.matchAll(/<choice\b[^>]*>([\s\S]*?)<\/choice\s*>/gi)]
    .map((match) => cleanBranchOption(match[1]))
    .filter(Boolean);
  if (nestedChoices.length > 0) return nestedChoices.slice(0, 4);

  return content
    .replace(/\r/g, '')
    .split(/\n+|\s+(?=[1-4]\s*[.、）)]\s+)/)
    .map(cleanBranchOption)
    .filter(Boolean)
    .slice(0, 4);
}

export function normalizeBranchOptions(options: readonly string[]): string[] {
  return options.flatMap(parseBranchOptions).slice(0, 4);
}
