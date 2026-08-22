import { HOUSES } from '../../data/houses';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { resolveCharacterTraits } from '../../data/characterTraits';
import { filterImportedCharacterTraits } from '../../data/importedCharacterTraitPolicy';
import { createItemInstance, createEmptyItemSystem, validateItemSystem } from '../items/state';
import type { ItemSystemState } from '../items/types';
import type { WorldArtifactState } from '../items/worldArtifacts';
import type { LordProfile } from '../../types/game';
import { createDefaultBody } from '../../types/game';
import { characterAgeAtYear, dynastySlug, formatDynastyName } from './characterDossier';
import { formatWorldCulture, formatWorldFaith } from '../world-content/terminology';
import type { WorldTerminology } from '../world-content/types';
import type { ResolvedCharacter } from './types';
import {
  UNKNOWN_WESTEROS_LOCATION_ID,
  createWorldLocationRef,
  fallbackLocationLabel,
} from '../map/locationResolver';

export function createLordFromExistingCharacter(
  character: ResolvedCharacter,
  artifacts: WorldArtifactState,
  currentYear = 298,
  startItems?: ItemSystemState,
  terminology?: Pick<WorldTerminology, 'cultures' | 'faiths'>,
): LordProfile {
  const items = startItems
    ? {
        schemaVersion: startItems.schemaVersion,
        instances: { ...startItems.instances },
        placements: { ...startItems.placements },
        sites: { ...startItems.sites },
        vehicles: { ...startItems.vehicles },
      }
    : createEmptyItemSystem();
  const slug = dynastySlug(character.dynastyId);
  const house = HOUSES.find((entry) => entry.id.toLowerCase() === slug.toLowerCase());
  const location = createWorldLocationRef(
    character.locationId ?? UNKNOWN_WESTEROS_LOCATION_ID,
    character.locationId ? undefined : house?.seat,
  );
  const locationLabel = character.locationId
    ? (house?.seat ?? fallbackLocationLabel(location))
    : fallbackLocationLabel(location);
  const add = (instanceId: string, definitionId: string, placement: any) => {
    if (items.instances[instanceId] || !ITEM_CATALOG.has(definitionId)) return;
    items.instances[instanceId] = createItemInstance(ITEM_CATALOG, definitionId, instanceId);
    items.placements[instanceId] = placement;
  };
  if (!startItems) {
    for (const item of character.items) {
      if (item.custody.type !== 'character' || item.custody.characterId !== character.id) continue;
      add(item.instanceId, item.definitionId, item.equippedPosition ? { type: 'equipped', position: { ...item.equippedPosition } } : { type: 'carried' });
    }
  }
  const startDefinitionIds = new Set(startItems ? Object.values(startItems.instances).map((instance) => instance.definitionId) : []);
  const holdingSiteId = `existing:${character.rawId}:holdings`;
  for (const artifact of Object.values(artifacts.artifacts)) {
    if (artifact.placement.type !== 'character' || artifact.placement.characterId !== character.id) continue;
    if (startDefinitionIds.has(artifact.definitionId)) continue;
    if (!artifact.equipped && !items.sites[holdingSiteId]) items.sites[holdingSiteId] = {
      id: holdingSiteId, name: '人物保管处', type: 'room', location: { ...location }, locationLabel,
      description: '开局时由该人物保管、但并未实际穿戴的物品。', capacity: 40,
    };
    add(artifact.instanceId, artifact.definitionId, artifact.equipped ? { type: 'equipped', position: { group: 'mainhand' } } : { type: 'site', siteId: holdingSiteId });
  }
  validateItemSystem(items, ITEM_CATALOG);
  const age = characterAgeAtYear(character.birthDate, currentYear, character.deathDate, character.alive) ?? 18;
  const importedTraits = filterImportedCharacterTraits(character.traits, age);
  const traits = resolveCharacterTraits(importedTraits.visibleTraitIds, []);
  return {
    canonicalCharacterId: character.id,
    name: character.name,
    house: house?.name ?? formatDynastyName(character.dynastyId),
    dynastyName: formatDynastyName(character.dynastyId),
    houseWords: house?.words ?? '箴言未记录',
    houseSigil: house?.sigil ?? slug,
    title: character.titles[0] ?? '未持有封地',
    age,
    gender: '性别未记录',
    culture: formatWorldCulture(character.cultureId, terminology),
    faith: formatWorldFaith(character.faithId, terminology),
    location,
    locationLabel,
    body: createDefaultBody(),
    overallStatus: '强健',
    items,
    goldDragons: 100,
    silverStags: 100,
    prestige: character.titles.length ? 80 : 20,
    dread: 0,
    attributes: { ...character.attributes },
    baseAttributes: { ...character.baseAttributes } as LordProfile['baseAttributes'],
    traits: traits.map((trait) => trait.name),
    traitIds: traits.map((trait) => trait.id),
    importedTraitIds: [...character.traits],
  };
}
