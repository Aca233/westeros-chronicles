import { HOUSES } from '../../data/houses';
import { migrateLordIdentityData } from '../../data/characterTraits';
import { filterImportedCharacterTraits } from '../../data/importedCharacterTraitPolicy';
import { filterVisibleExperiences } from './characterSupplementSchema';
import { formatWorldCulture, formatWorldFaith } from '../world-content/terminology';
import type { CharacterContentRecord, WorldTerminology } from '../world-content/types';
import type {
  CharacterExperience,
  NotableNonKinRelation,
} from './characterSupplementTypes';
import type {
  BodyZoneKey,
  LordAttributes,
  LordProfile,
  WoundLevel,
} from '../../types/game';
import type {
  CharacterId,
  CharacterKinshipEntry,
  CharacterMemory,
  CharacterRelationship,
  ResolvedCharacter,
  StaticCharacterRecord,
} from './types';
import type { WorldLocationRef } from '../map/types';
import type { WorldEvent, CharacterWorldPatch } from '../world/worldRuntimeTypes';
import {
  EMPTY_CHARACTER_ASSET_GROUPS,
  type CharacterAssetGroups,
  type CharacterWorldView,
} from '../world/worldSelectors';

export const PLAYER_DOSSIER_ID = 'player' as const;
export type CharacterDossierId = typeof PLAYER_DOSSIER_ID | CharacterId;

export interface CharacterDossierRelations {
  spouseIds: CharacterId[];
  childIds: CharacterId[];
  siblingIds: CharacterId[];
  fatherId?: CharacterId;
  motherId?: CharacterId;
  relationships: CharacterRelationship[];
  notableRelations: Array<{ kind: string; targetId: CharacterId; description?: string; sourceUrl?: string }>;
}

interface CharacterDossierBase {
  id: CharacterDossierId;
  kind: 'player' | 'npc';
  name: string;
  dynastyName: string;
  dynastyId?: string;
  house: string;
  houseWords: string;
  houseSigil: string;
  title: string;
  titles: string[];
  age?: number;
  gender: string;
  culture: string;
  faith: string;
  location: string;
  alive: boolean;
  deathReason?: string;
  attributes: LordAttributes;
  traitIds: string[];
  hiddenModifierTraitIds: string[];
  statusTraitIds: string[];
  legacyTraits: string[];
  relations: CharacterDossierRelations;
  wounds: string[];
  woundLevels: Partial<Record<BodyZoneKey, WoundLevel>>;
  memories: CharacterMemory[];
  summary?: string;
  publicRoles?: string[];
  aliases?: string[];
  appearance?: string;
  personality?: string;
  reputation?: string;
  supplementExperiences?: CharacterExperience[];
  sourceUrls?: string[];
  worldCharacterId: CharacterId;
  worldLocation: WorldLocationRef | null;
  worldActivity: CharacterWorldPatch['currentActivity'];
  worldTitleIds: readonly string[];
  assetGroups: CharacterAssetGroups;
  worldEvents: readonly WorldEvent[];
}

export interface PlayerCharacterDossier extends CharacterDossierBase {
  id: typeof PLAYER_DOSSIER_ID;
  kind: 'player';
  player: LordProfile;
}

export interface NpcCharacterDossier extends CharacterDossierBase {
  id: CharacterId;
  kind: 'npc';
  character: ResolvedCharacter;
}

export type CharacterDossier = PlayerCharacterDossier | NpcCharacterDossier;

function uniqueEducationFirst(values: readonly string[]): string[] {
  const unique = [...new Set(values.filter(Boolean))];
  return [
    ...unique.filter((value) => value.startsWith('education_')),
    ...unique.filter((value) => !value.startsWith('education_')),
  ];
}

function parsedYear(date: string | null | undefined): number | undefined {
  const value = date?.split('.')[0];
  if (!value) return undefined;
  const year = Number(value);
  return Number.isFinite(year) ? year : undefined;
}

export function characterAgeAtYear(
  birthDate: string | null | undefined,
  currentYear: number,
  deathDate?: string | null,
  alive = true,
): number | undefined {
  const birthYear = parsedYear(birthDate);
  if (birthYear === undefined || !Number.isFinite(currentYear)) return undefined;
  const comparableCurrentYear = currentYear < 8000 ? currentYear + 8000 : currentYear;
  const rawDeathYear = alive ? undefined : parsedYear(deathDate);
  const deathYear = rawDeathYear;
  const effectiveYear = deathYear === undefined ? comparableCurrentYear : Math.min(comparableCurrentYear, deathYear);
  return Math.max(0, Math.floor(effectiveYear - birthYear));
}

export function characterDatasetYear(currentYear: number, birthDate: string | null | undefined): number {
  return currentYear < 8000 ? currentYear + 8000 : currentYear;
}

export function dynastySlug(dynastyId: string | null | undefined): string {
  return (dynastyId ?? '')
    .replace(/^dynn_/i, '')
    .replace(/_/g, ' ')
    .trim();
}

export function formatDynastyName(dynastyId: string | null | undefined): string {
  const slug = dynastySlug(dynastyId);
  if (!slug) return '家族未记录';
  const majorHouse = HOUSES.find((house) => house.id.toLowerCase() === slug.toLowerCase());
  return majorHouse?.name ?? `${slug}家族`;
}

function houseMetadata(dynastyId: string | null | undefined) {
  const slug = dynastySlug(dynastyId);
  const house = HOUSES.find((candidate) => candidate.id.toLowerCase() === slug.toLowerCase());
  return {
    name: house?.name ?? formatDynastyName(dynastyId),
    sigil: house?.sigil ?? slug,
    words: house?.words ?? '箴言未记录',
  };
}

export function createPlayerDossier(
  lord: LordProfile,
  currentYear = 298,
  worldCharacterId: CharacterId = lord.canonicalCharacterId ?? 'save:current:player',
  content?: CharacterContentRecord,
  terminology?: Pick<WorldTerminology, 'cultures' | 'faiths'>,
): PlayerCharacterDossier {
  const identifiedLord = migrateLordIdentityData(lord);
  const importedTraits = identifiedLord.importedTraitIds
    ? filterImportedCharacterTraits(identifiedLord.importedTraitIds, identifiedLord.age)
    : undefined;
  const supplement = identifiedLord.canonicalCharacterId ? content : undefined;
  const supplementExperiences = filterVisibleExperiences(supplement?.experiences, currentYear);
  const notableRelations = (supplement?.notableRelations ?? []).map((rel) => ({
    kind: rel.kind,
    targetId: rel.targetId,
    description: rel.description,
    sourceUrl: rel.sourceUrl,
  }));
  return {
    id: PLAYER_DOSSIER_ID,
    kind: 'player',
    name: identifiedLord.name,
    dynastyName: identifiedLord.dynastyName || identifiedLord.house,
    house: identifiedLord.house,
    houseWords: identifiedLord.houseWords,
    houseSigil: identifiedLord.houseSigil,
    title: identifiedLord.title,
    titles: identifiedLord.title ? [identifiedLord.title] : [],
    age: identifiedLord.age,
    gender: identifiedLord.gender,
    culture: formatWorldCulture(identifiedLord.culture, terminology),
    faith: formatWorldFaith(identifiedLord.faith, terminology),
    location: identifiedLord.locationLabel,
    alive: identifiedLord.overallStatus !== '阵亡',
    deathReason: identifiedLord.overallStatus === '阵亡' ? '人物已经死亡' : undefined,
    attributes: identifiedLord.attributes,
    traitIds: uniqueEducationFirst(importedTraits?.visibleTraitIds ?? identifiedLord.traitIds ?? []),
    hiddenModifierTraitIds: importedTraits?.hiddenModifierIds ?? [],
    statusTraitIds: importedTraits?.statusTraitIds ?? [],
    legacyTraits: [...(identifiedLord.traits ?? [])].filter((name) => !/^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(name.trim())),
    relations: { spouseIds: [], childIds: [], siblingIds: [], relationships: [], notableRelations },
    wounds: Object.values(identifiedLord.body).flatMap((zone) => typeof zone === 'object' && 'wounds' in zone ? zone.wounds : []),
    woundLevels: {
      head: identifiedLord.body.head.level,
      torso: identifiedLord.body.torso.level,
      arms: identifiedLord.body.arms.level,
      legs: identifiedLord.body.legs.level,
    },
    memories: [],
    summary: supplement?.summary,
    publicRoles: supplement?.publicRoles,
    aliases: supplement?.aliases,
    appearance: supplement?.appearance,
    personality: supplement?.personality,
    reputation: supplement?.reputation,
    supplementExperiences: supplementExperiences.length ? supplementExperiences : undefined,
    sourceUrls: supplement?.sources,
    worldCharacterId,
    worldLocation: { ...identifiedLord.location },
    worldActivity: 'idle',
    worldTitleIds: Object.freeze([]),
    assetGroups: EMPTY_CHARACTER_ASSET_GROUPS,
    worldEvents: Object.freeze([]),
    player: identifiedLord,
  };
}

export { formatWorldCulture, formatWorldFaith } from '../world-content/terminology';

function normalizeRelatedCharacterId(value: string): CharacterId | null {
  if (value.startsWith('agot:') || value.startsWith('save:')) return value as CharacterId;
  if (value.startsWith('character:') && value.length > 'character:'.length) return `agot:${value.slice('character:'.length)}`;
  return null;
}

export function createNpcDossier(
  character: ResolvedCharacter,
  currentYear: number,
  kinship: CharacterKinshipEntry = { spouseIds: character.spouseIds, childIds: [], siblingIds: [] },
  content?: CharacterContentRecord,
  terminology?: Pick<WorldTerminology, 'cultures' | 'faiths'>,
): NpcCharacterDossier {
  const house = houseMetadata(character.dynastyId);
  const title = character.titles[0] || '未持有封地';
  const age = characterAgeAtYear(character.birthDate, currentYear, character.deathDate, character.alive);
  const importedTraits = filterImportedCharacterTraits(character.traits, age);
  const supplement = content;
  const supplementExperiences = filterVisibleExperiences(supplement?.experiences, currentYear);

  const baseRelations = character.relations.flatMap((relation) => {
    const targetId = normalizeRelatedCharacterId(relation.target_id);
    return targetId ? [{ kind: relation.kind, targetId }] : [];
  });
  const suppRelations = (supplement?.notableRelations ?? []).map((rel) => ({
    kind: rel.kind,
    targetId: rel.targetId,
    description: rel.description,
    sourceUrl: rel.sourceUrl,
  }));

  const seenTargets = new Set<CharacterId>();
  const notableRelations: Array<{ kind: string; targetId: CharacterId; description?: string; sourceUrl?: string }> = [];
  for (const rel of suppRelations) {
    if (!seenTargets.has(rel.targetId)) {
      seenTargets.add(rel.targetId);
      notableRelations.push(rel);
    }
  }
  for (const rel of baseRelations) {
    if (!seenTargets.has(rel.targetId)) {
      seenTargets.add(rel.targetId);
      notableRelations.push(rel);
    }
  }

  return {
    id: character.id,
    kind: 'npc',
    name: character.name || character.nameKey || '姓名未记录',
    dynastyName: house.name,
    dynastyId: character.dynastyId || undefined,
    house: house.name,
    houseWords: house.words,
    houseSigil: house.sigil,
    title,
    titles: [...character.titles],
    age,
    gender: character.female === true ? '女性' : character.female === false ? '男性' : '性别未记录',
    culture: formatWorldCulture(character.cultureId, terminology),
    faith: formatWorldFaith(character.faithId, terminology),
    location: character.locationId || '所在地未记录',
    alive: character.alive,
    deathReason: character.deathReason || undefined,
    attributes: character.attributes,
    traitIds: uniqueEducationFirst(importedTraits.visibleTraitIds),
    hiddenModifierTraitIds: importedTraits.hiddenModifierIds,
    statusTraitIds: importedTraits.statusTraitIds,
    legacyTraits: [],
    relations: {
      spouseIds: [...new Set([...character.spouseIds, ...kinship.spouseIds])],
      childIds: [...kinship.childIds],
      siblingIds: [...kinship.siblingIds],
      fatherId: character.fatherId || kinship.fatherId || undefined,
      motherId: character.motherId || kinship.motherId || undefined,
      relationships: [...character.relationships],
      notableRelations,
    },
    wounds: [...character.wounds],
    woundLevels: { ...character.woundLevels },
    memories: [...character.memories],
    summary: supplement?.summary ?? '暂无可靠的公开生平摘要。',
    publicRoles: supplement?.publicRoles,
    aliases: supplement?.aliases,
    appearance: supplement?.appearance,
    personality: supplement?.personality,
    reputation: supplement?.reputation,
    supplementExperiences: supplementExperiences.length ? supplementExperiences : undefined,
    sourceUrls: supplement?.sources,
    worldCharacterId: character.id,
    worldLocation: character.locationId
      ? { locationId: character.locationId, ...(character.sceneLocation ? { sceneLocation: character.sceneLocation } : {}) }
      : null,
    worldActivity: 'idle',
    worldTitleIds: Object.freeze([...character.titleIds]),
    assetGroups: EMPTY_CHARACTER_ASSET_GROUPS,
    worldEvents: Object.freeze([]),
    character,
  };
}

export function attachCharacterWorldView<T extends CharacterDossier>(
  dossier: T,
  view: CharacterWorldView,
): T {
  return {
    ...dossier,
    worldLocation: view.location,
    worldActivity: view.activity,
    worldTitleIds: view.titleIds,
    assetGroups: view.assetGroups,
    worldEvents: view.events,
  };
}

export function relatedCharacterIds(dossier: CharacterDossier): CharacterId[] {
  return [...new Set([
    ...dossier.relations.spouseIds,
    ...dossier.relations.childIds,
    ...dossier.relations.siblingIds,
    dossier.relations.fatherId,
    dossier.relations.motherId,
    ...dossier.relations.notableRelations.map((relation) => relation.targetId),
    ...dossier.relations.relationships.map((relationship) => relationship.targetId),
  ].filter((id): id is CharacterId => Boolean(id)))];
}

export function relationRecordsById(records: readonly StaticCharacterRecord[]): ReadonlyMap<CharacterId, StaticCharacterRecord> {
  return new Map(records.map((record) => [record.id, record]));
}
