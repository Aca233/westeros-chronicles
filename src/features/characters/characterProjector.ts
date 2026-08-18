import { calculateFinalAttributes } from '../../data/characterTraits';
import type { CharacterEventEnvelope } from './characterEventStore';
import { projectCharacterEvents } from './characterEventStore';
import { generateMissingBaseAttributes } from './attributeGenerator';
import { expandBaselineLoadout, projectCharacterItems } from './characterItems';
import type { ResolvedCharacter, StaticCharacterLoadoutProfile, StaticCharacterRecord } from './types';

export interface CharacterProjectionContext {
  datasetVersion: string;
  currentYear: number;
  loadoutProfile?: StaticCharacterLoadoutProfile;
}

function orderTraitIds(traits: readonly string[]): string[] {
  const unique = [...new Set(traits)];
  return [
    ...unique.filter((trait) => trait.startsWith('education_')),
    ...unique.filter((trait) => !trait.startsWith('education_')),
  ];
}

export function resolveCharacter(
  staticRecord: StaticCharacterRecord,
  events: readonly CharacterEventEnvelope[],
  context: CharacterProjectionContext,
): ResolvedCharacter {
  const eventState = projectCharacterEvents(staticRecord, events);
  const traits = orderTraitIds(eventState.traits);
  const baseAttributes = generateMissingBaseAttributes(eventState, context.datasetVersion, context.currentYear);
  return {
    ...eventState,
    traits,
    baseAttributes,
    attributes: calculateFinalAttributes(baseAttributes, traits),
    memories: events.flatMap((entry) => entry.event.type === 'ADD_MEMORY' ? [entry.event.memory] : []),
    knowledge: [],
    items: projectCharacterItems(expandBaselineLoadout(staticRecord, context.loadoutProfile), events),
  };
}
