import type { CharacterEventEnvelope } from './characterEventTypes';
import { projectCharacterEvents } from './characterEventProjection';
import type { CharacterId, StaticCharacterRecord } from './types';
import type { LordFamilyRecords } from './lordRelationshipResolver';
import {
  projectCharacterLifeFacts,
  type CharacterLifeFactsOptions,
} from '../world/characterWorldFacts';

export function projectRelationshipCharacter(
  record: StaticCharacterRecord,
  events: readonly CharacterEventEnvelope[],
  options: CharacterLifeFactsOptions,
): StaticCharacterRecord {
  return projectCharacterLifeFacts(projectCharacterEvents(record, events), options);
}

export async function projectRelationshipRecords(
  records: readonly StaticCharacterRecord[],
  eventsForCharacter: (characterId: CharacterId) => Promise<readonly CharacterEventEnvelope[]>,
  options: CharacterLifeFactsOptions,
): Promise<ReadonlyMap<CharacterId, StaticCharacterRecord>> {
  const projected = await Promise.all(records.map(async (record) => [
    record.id,
    projectRelationshipCharacter(record, await eventsForCharacter(record.id), options),
  ] as const));
  return new Map(projected);
}

export async function projectLordFamilyRecords(
  family: LordFamilyRecords,
  eventsForCharacter: (characterId: CharacterId) => Promise<readonly CharacterEventEnvelope[]>,
  options: CharacterLifeFactsOptions,
): Promise<LordFamilyRecords> {
  const records = [
    family.subject,
    family.spouse,
    ...(family.spouses ?? []),
    ...(family.children ?? []),
    ...(family.siblings ?? []),
    family.father,
    family.mother,
  ].filter((record): record is StaticCharacterRecord => Boolean(record));
  const uniqueRecords = [...new Map(records.map((record) => [record.id, record])).values()];
  const projected = await projectRelationshipRecords(uniqueRecords, eventsForCharacter, options);
  const get = (record: StaticCharacterRecord | undefined) => record ? projected.get(record.id) : undefined;
  const spouses = family.spouses
    ?.map((record) => get(record))
    .filter((record): record is StaticCharacterRecord => Boolean(record))
    .sort((left, right) => Number(right.alive) - Number(left.alive) || left.id.localeCompare(right.id));
  const spouse = spouses?.[0] ?? get(family.spouse);
  return {
    ...family,
    subject: get(family.subject),
    spouse,
    spouses,
    children: family.children?.map((record) => get(record)).filter((record): record is StaticCharacterRecord => Boolean(record)),
    siblings: family.siblings?.map((record) => get(record)).filter((record): record is StaticCharacterRecord => Boolean(record)),
    father: get(family.father),
    mother: get(family.mother),
  };
}
