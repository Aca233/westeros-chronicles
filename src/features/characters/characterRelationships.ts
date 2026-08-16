import type { CharacterRelationship } from './types';

function clamp(value: number, minimum: number, maximum: number): number {
  const safe = Number.isFinite(value) ? Math.round(value) : 0;
  return Math.max(minimum, Math.min(maximum, safe));
}

export function normalizeRelationship(relationship: CharacterRelationship): CharacterRelationship {
  return {
    ...relationship,
    opinion: clamp(relationship.opinion, -100, 100),
    trust: clamp(relationship.trust, 0, 100),
    fear: clamp(relationship.fear, 0, 100),
    respect: clamp(relationship.respect, 0, 100),
    attraction: clamp(relationship.attraction, 0, 100),
    obligation: clamp(relationship.obligation, -100, 100),
  };
}

export function relationshipSummary(input: CharacterRelationship): string {
  const relationship = normalizeRelationship(input);
  const parts = [
    `好感 ${relationship.opinion}`,
    `信任 ${relationship.trust}`,
    `恐惧 ${relationship.fear}`,
    `尊敬 ${relationship.respect}`,
  ];
  if (relationship.attraction) parts.push(`吸引 ${relationship.attraction}`);
  if (relationship.obligation) parts.push(`人情 ${relationship.obligation}`);
  return parts.join(' · ');
}
