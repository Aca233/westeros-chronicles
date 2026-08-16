import type { LordAttributes } from '../../types/game';
import type { StaticCharacterRecord } from './types';

const SKILLS: Array<keyof LordAttributes> = ['diplomacy', 'martial', 'stewardship', 'intrigue', 'learning', 'prowess'];
const EDUCATION_SKILL: Record<string, keyof LordAttributes> = {
  diplomacy: 'diplomacy', martial: 'martial', stewardship: 'stewardship',
  intrigue: 'intrigue', learning: 'learning', prowess: 'prowess',
};

function hash32(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function birthYear(record: StaticCharacterRecord): number | undefined {
  const raw = record.birthDate?.split('.')[0];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function generateMissingBaseAttributes(
  record: StaticCharacterRecord,
  datasetVersion: string,
  currentYear = 8298,
): LordAttributes {
  const generated = {} as LordAttributes;
  const age = birthYear(record) === undefined ? 25 : Math.max(0, currentYear - birthYear(record)!);
  for (const [index, skill] of SKILLS.entries()) {
    const seed = hash32(`${datasetVersion}:${record.id}:${skill}`);
    let value = 5 + (seed % 8);
    if (age < 8) value = Math.min(value, 3);
    else if (age < 16) value = Math.min(value, 7);
    else if (age >= 50 && skill === 'learning') value += 1;
    else if (age >= 60 && skill === 'prowess') value -= 2;
    const education = record.traits.find((trait) => trait.startsWith(`education_${skill}_`));
    if (education) value += Math.max(1, Number(education.match(/_(\d+)$/)?.[1] ?? 1));
    if (skill === 'prowess') {
      const martialProwess = record.traits.find((trait) => trait.startsWith('education_martial_prowess_'));
      if (martialProwess) value += Math.max(1, Number(martialProwess.match(/_(\d+)$/)?.[1] ?? 1));
    }
    generated[skill] = Math.max(0, Math.min(30, Math.round(value + (index === seed % SKILLS.length ? 1 : 0))));
  }
  for (const skill of SKILLS) {
    const explicit = record.baseAttributes[skill];
    if (typeof explicit === 'number' && Number.isFinite(explicit)) generated[skill] = Math.max(0, Math.min(30, Math.round(explicit)));
  }
  return generated;
}
