import type { WorldTerminology } from './types';

function humanizeSnakeCase(value: string): string {
  return value.replace(/_/g, ' ');
}

function formatTerminologyLabel(
  value: string | null | undefined,
  labels: Readonly<Record<string, string>> | undefined,
  emptyLabel: string,
): string {
  if (!value) return emptyLabel;
  const label = labels?.[value];
  if (label) return label;
  if (/\p{Script=Han}/u.test(value)) return value;
  return humanizeSnakeCase(value);
}

export function formatWorldCulture(
  cultureId: string | null | undefined,
  terminology: Pick<WorldTerminology, 'cultures'> | undefined,
): string {
  return formatTerminologyLabel(cultureId, terminology?.cultures, '文化未记录');
}

export function formatWorldFaith(
  faithId: string | null | undefined,
  terminology: Pick<WorldTerminology, 'faiths'> | undefined,
): string {
  return formatTerminologyLabel(faithId, terminology?.faiths, '信仰未记录');
}

export function formatWorldRelationship(
  kind: string | null | undefined,
  terminology: Pick<WorldTerminology, 'relationships'> | undefined,
): string {
  return formatTerminologyLabel(kind, terminology?.relationships, '关系未记录');
}
