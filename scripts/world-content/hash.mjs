import { createHash } from 'node:crypto';

function sortRecursively(value) {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortRecursively(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(sortRecursively(value), null, 2)}\n`;
}

export function sha256Json(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}
