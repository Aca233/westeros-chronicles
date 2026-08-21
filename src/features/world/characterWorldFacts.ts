import type { ResolvedCharacter } from '../characters/types';
import type { MapLocationSearchEntry } from '../map/types';
import type { CanonicalTimelineEvent } from './canonicalTimeline';
import type { CanonicalEventState } from './worldHistory';
import type { CharacterWorldPatch } from './worldRuntimeTypes';

export interface CharacterWorldFactsOptions {
  history: {
    startDate?: { year: number; month: number; day: number };
    canonical: Readonly<Record<string, CanonicalEventState>>;
  };
  runtime: { characters: Readonly<Record<string, CharacterWorldPatch>> };
  timeline: readonly CanonicalTimelineEvent[];
  mapLocations: readonly MapLocationSearchEntry[];
}

export type CharacterLifeFactsOptions = Pick<CharacterWorldFactsOptions, 'history' | 'runtime' | 'timeline'>;

interface CharacterLifeRecord {
  id: string;
  alive: boolean;
  deathDate?: string | null;
  deathReason?: string | null;
}

function datasetDate(event: CanonicalTimelineEvent): string {
  const year = event.date.year < 8000 ? event.date.year + 8000 : event.date.year;
  return `${year}.${event.date.month}.${event.date.day}`;
}

function historicalDeath(
  characterId: string,
  history: CharacterWorldFactsOptions['history'],
  timeline: readonly CanonicalTimelineEvent[],
): CanonicalTimelineEvent | undefined {
  return timeline.find((event) => {
    const state = history.canonical[event.id];
    if (state?.status !== 'historical' && state?.status !== 'occurred') return false;
    return event.fatalities.some((person) => person.characterId === characterId);
  });
}

const OPENING_SNAPSHOT_DATE = { year: 298, month: 5, day: 10 } as const;

/**
 * Public physical positions at the supplied 298 AC opening. These are scene
 * facts, not legal seats or family homes. A character remains here until a
 * committed MOVE_CHARACTER/world transaction supplies a newer location.
 */
const OPENING_CHARACTER_LOCATIONS: Readonly<Record<string, string>> = Object.freeze({
  // Winterfell household and Stark children.
  'agot:Stark_3': 'b_winterfell',
  'agot:Tully_4': 'b_winterfell',
  'agot:Stark_6': 'b_winterfell',
  'agot:Stark_7': 'b_winterfell',
  'agot:Stark_8': 'b_winterfell',
  'agot:Stark_9': 'b_winterfell',
  'agot:Stark_10': 'b_winterfell',
  'agot:Stark_11': 'b_winterfell',
  'agot:Greyjoy_14': 'b_winterfell',
  'agot:Stark_hh_1': 'b_winterfell',
  'agot:Cassel_3': 'b_winterfell',
  'agot:Cassel_4': 'b_winterfell',
  'agot:Tully_hh_4': 'b_winterfell',

  // Royal progress at Winterfell in the opening scene.
  'agot:Baratheon_2': 'b_winterfell',
  'agot:Lannister_6': 'b_winterfell',
  'agot:Lannister_7': 'b_winterfell',
  'agot:Lannister_8': 'b_winterfell',
  'agot:Baratheon_5': 'b_winterfell',
  'agot:Baratheon_6': 'b_winterfell',
  'agot:Baratheon_7': 'b_winterfell',
  'agot:Clegane_4': 'b_winterfell',
  'agot:Payne_6': 'b_winterfell',

  // Other unambiguous public positions relevant to the opening.
  'agot:Arryn_3': 'b_the_red_keep',
  'agot:Tully_6': 'b_the_eyrie',
  'agot:Arryn_8': 'b_the_eyrie',
  'agot:Lannister_1': 'b_casterly_rock',
  'agot:Baelish_2': 'b_the_red_keep',
  'agot:Eunuch_1': 'b_the_red_keep',
  'agot:Pycelle_1': 'b_the_red_keep',
});

function isOpeningSnapshot(history: CharacterWorldFactsOptions['history']): boolean {
  const startDate = history.startDate;
  return Boolean(startDate
    && startDate.year === OPENING_SNAPSHOT_DATE.year
    && startDate.month === OPENING_SNAPSHOT_DATE.month
    && startDate.day === OPENING_SNAPSHOT_DATE.day);
}

function openingLocation(characterId: string, history: CharacterWorldFactsOptions['history']): string | undefined {
  return isOpeningSnapshot(history) ? OPENING_CHARACTER_LOCATIONS[characterId] : undefined;
}

export function projectCharacterLifeFacts<T extends CharacterLifeRecord>(
  character: T,
  options: CharacterLifeFactsOptions,
): T {
  const runtimePatch = options.runtime.characters[character.id];
  const death = historicalDeath(character.id, options.history, options.timeline);
  const alive = death ? false : runtimePatch?.alive ?? character.alive;
  return {
    ...character,
    alive,
    ...(death
      ? { deathDate: datasetDate(death), deathReason: death.title }
      : runtimePatch?.alive === false && !character.deathReason
        ? { deathReason: '人物已经死亡' }
        : {}),
  };
}

/**
 * Projects the authoritative character facts shared by prompts and dossiers.
 * Runtime movement wins over the dated opening snapshot; legal holdings and
 * family homes are never treated as current physical locations. An already
 * historical canon death overrides an erroneous alive flag in imported data.
 */
export function projectResolvedCharacterWorldFacts(
  character: ResolvedCharacter,
  options: CharacterWorldFactsOptions,
): ResolvedCharacter {
  const runtimePatch = options.runtime.characters[character.id];
  const projectedLife = projectCharacterLifeFacts(character, options);
  const baselineLocationId = openingLocation(character.id, options.history);
  const location = runtimePatch?.location
    ?? (character.locationId
      ? { locationId: character.locationId, ...(character.sceneLocation ? { sceneLocation: character.sceneLocation } : {}) }
      : baselineLocationId ? { locationId: baselineLocationId } : undefined);

  return {
    ...projectedLife,
    ...(location
      ? {
          locationId: location.locationId,
          ...(location.sceneLocation ? { sceneLocation: location.sceneLocation } : {}),
        }
      : {}),
  };
}

export function characterWorldLocationLabel(
  character: Pick<ResolvedCharacter, 'locationId' | 'sceneLocation'>,
  locations: readonly MapLocationSearchEntry[],
): string {
  if (!character.locationId) return '所在地未记录';
  const name = locations.find((location) => location.id === character.locationId)?.name ?? character.locationId;
  return character.sceneLocation ? `${name} · ${character.sceneLocation}` : name;
}
