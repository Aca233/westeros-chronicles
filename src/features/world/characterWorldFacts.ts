import type { ResolvedCharacter } from '../characters/types';
import type { MapLocationSearchEntry } from '../map/types';
import type { WorldCharacterStartRecord } from '../world-content/types';
import type { CanonicalTimelineEvent } from './canonicalTimeline';
import type { CanonicalEventState } from './worldHistory';
import type { CharacterWorldPatch } from './worldRuntimeTypes';
import { projectStartCharacterFacts } from './worldStartState';

export interface CharacterWorldFactsOptions {
  history: {
    startDate?: { year: number; month: number; day: number };
    canonical: Readonly<Record<string, CanonicalEventState>>;
  };
  runtime: { characters: Readonly<Record<string, CharacterWorldPatch>> };
  timeline: readonly CanonicalTimelineEvent[];
  mapLocations: readonly MapLocationSearchEntry[];
  startCharacters?: readonly WorldCharacterStartRecord[];
}

export type CharacterLifeFactsOptions = Pick<CharacterWorldFactsOptions, 'history' | 'runtime' | 'timeline' | 'startCharacters'>;

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

export function projectCharacterLifeFacts<T extends CharacterLifeRecord>(
  character: T,
  options: CharacterLifeFactsOptions,
): T {
  const runtimePatch = options.runtime.characters[character.id];
  const startRecord = options.startCharacters?.find((record) => record.characterId === character.id);
  const death = historicalDeath(character.id, options.history, options.timeline);
  const alive = death ? false : runtimePatch?.alive ?? startRecord?.aliveOverride ?? character.alive;
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
 * The fixed start record from the compiled world content overrides imported
 * base facts; a committed runtime patch wins over both. An already historical
 * canon death overrides an erroneous alive flag in imported data.
 */
export function projectResolvedCharacterWorldFacts(
  character: ResolvedCharacter,
  options: CharacterWorldFactsOptions,
): ResolvedCharacter {
  const startMerged = projectStartCharacterFacts(
    character,
    { characters: options.startCharacters ?? [] },
    options.runtime,
  );
  return projectCharacterLifeFacts(startMerged, options);
}

export function characterWorldLocationLabel(
  character: Pick<ResolvedCharacter, 'locationId' | 'sceneLocation'>,
  locations: readonly MapLocationSearchEntry[],
): string {
  if (!character.locationId) return '所在地未记录';
  const name = locations.find((location) => location.id === character.locationId)?.name ?? character.locationId;
  return character.sceneLocation ? `${name} · ${character.sceneLocation}` : name;
}
