import { HOUSES } from '../../data/houses';
import { migrateLordIdentityData } from '../../data/characterTraits';
import { filterImportedCharacterTraits } from '../../data/importedCharacterTraitPolicy';
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

export const PLAYER_DOSSIER_ID = 'player' as const;
export type CharacterDossierId = typeof PLAYER_DOSSIER_ID | CharacterId;

export interface CharacterDossierRelations {
  spouseIds: CharacterId[];
  childIds: CharacterId[];
  siblingIds: CharacterId[];
  fatherId?: CharacterId;
  motherId?: CharacterId;
  relationships: CharacterRelationship[];
  notableRelations: Array<{ kind: string; targetId: CharacterId }>;
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

export function createPlayerDossier(lord: LordProfile): PlayerCharacterDossier {
  const identifiedLord = migrateLordIdentityData(lord);
  const importedTraits = identifiedLord.importedTraitIds
    ? filterImportedCharacterTraits(identifiedLord.importedTraitIds, identifiedLord.age)
    : undefined;
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
    culture: formatCharacterCulture(identifiedLord.culture),
    faith: formatCharacterFaith(identifiedLord.faith),
    location: identifiedLord.locationLabel,
    alive: identifiedLord.overallStatus !== '阵亡',
    deathReason: identifiedLord.overallStatus === '阵亡' ? '人物已经死亡' : undefined,
    attributes: identifiedLord.attributes,
    traitIds: uniqueEducationFirst(importedTraits?.visibleTraitIds ?? identifiedLord.traitIds ?? []),
    hiddenModifierTraitIds: importedTraits?.hiddenModifierIds ?? [],
    statusTraitIds: importedTraits?.statusTraitIds ?? [],
    legacyTraits: [...(identifiedLord.traits ?? [])].filter((name) => !/^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(name.trim())),
    relations: { spouseIds: [], childIds: [], siblingIds: [], relationships: [], notableRelations: [] },
    wounds: Object.values(identifiedLord.body).flatMap((zone) => typeof zone === 'object' && 'wounds' in zone ? zone.wounds : []),
    woundLevels: {
      head: identifiedLord.body.head.level,
      torso: identifiedLord.body.torso.level,
      arms: identifiedLord.body.arms.level,
      legs: identifiedLord.body.legs.level,
    },
    memories: [],
    player: identifiedLord,
  };
}

const CULTURE_LABELS: Readonly<Record<string, string>> = {
  riverman_main: '河间人', reachman: '河湾人', stormlander_main: '风暴地人', westerman_main: '西境人',
  northman: '北境人', valeman_main: '谷地人', marcher: '边疆地人', ironborn: '铁种', crownlander: '王领人',
  stone_dornish: '石人多恩人', sand_dornish: '沙地多恩人', salt_dornish: '盐人多恩人',
  braavosi: '布拉佛斯人', pentoshi: '潘托斯人', myrish: '密尔人', qohorik: '科霍尔人', norvoshi: '诺佛斯人',
  first_man: '先民', high_valyrian: '高等瓦雷利亚人', valyrian: '瓦雷利亚人',
};

const FAITH_LABELS: Readonly<Record<string, string>> = {
  fots_seven: '七神信仰', fots_axe: '战斧七神', fots_oldnew: '新旧诸神',
  old_gods_wnw: '森林旧神', old_gods_btw_sas: '长城外旧神', old_gods_btw_pnv: '远北旧神',
  drowned_god: '淹神信仰', rhllor_fc: '拉赫洛信仰', mother_rhoyne: '洛恩母亲',
  valyrian_pan_freehold: '瓦雷利亚诸神', fc_pan_blackgoat: '黑山羊信仰',
  fc_pan_braavos: '布拉佛斯诸神', fc_pan_pentos: '潘托斯诸神',
};

function localizedRecordLabel(value: string | null | undefined, labels: Readonly<Record<string, string>>, fallback: string, untranslated: string): string {
  if (!value) return fallback;
  return labels[value] ?? (/\p{Script=Han}/u.test(value) ? value : untranslated);
}

export function formatCharacterCulture(value: string | null | undefined): string {
  return localizedRecordLabel(value, CULTURE_LABELS, '文化未记录', '其他文化');
}

export function formatCharacterFaith(value: string | null | undefined): string {
  return localizedRecordLabel(value, FAITH_LABELS, '信仰未记录', '其他信仰');
}

function normalizeRelatedCharacterId(value: string): CharacterId | null {
  if (value.startsWith('agot:') || value.startsWith('save:')) return value as CharacterId;
  if (value.startsWith('character:') && value.length > 'character:'.length) return `agot:${value.slice('character:'.length)}`;
  return null;
}

export function createNpcDossier(
  character: ResolvedCharacter,
  currentYear: number,
  kinship: CharacterKinshipEntry = { spouseIds: character.spouseIds, childIds: [], siblingIds: [] },
): NpcCharacterDossier {
  const house = houseMetadata(character.dynastyId);
  const title = character.titles[0] || '未持有封地';
  const age = characterAgeAtYear(character.birthDate, currentYear, character.deathDate, character.alive);
  const importedTraits = filterImportedCharacterTraits(character.traits, age);
  const notableRelations = character.relations.flatMap((relation) => {
    const targetId = normalizeRelatedCharacterId(relation.target_id);
    return targetId ? [{ kind: relation.kind, targetId }] : [];
  });
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
    gender: '性别未记录',
    culture: formatCharacterCulture(character.cultureId),
    faith: formatCharacterFaith(character.faithId),
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
    character,
  };
}

export function relatedCharacterIds(dossier: CharacterDossier): CharacterId[] {
  if (dossier.kind === 'player') return [];
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
