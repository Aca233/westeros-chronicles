import { z } from 'zod';
import type {
  CharacterContentIndex,
  CharacterContentRecord,
  CharacterCreationContent,
  GameplayLocationDataset,
  HolderSummaryDataset,
  LivingWorldManifest,
  LivingWorldStartState,
  PlayableCharacterEntry,
  WorldLoadoutContent,
  WorldTerminology,
} from './types.ts';

const sha = z.string().regex(/^[a-f0-9]{64}$/i);
const localPath = z.string().regex(/^\/data\/world\/[a-z0-9_./-]+$/i).refine((value) => !value.includes('..'));
const characterId = z.string().regex(/^(agot|save):[^\s]+$/);
const location = z.object({ locationId: z.string().min(1), sceneLocation: z.string().min(1).optional() }).strict();
const equipmentPosition = z.union([
  z.object({ group: z.enum(['head', 'mainhand', 'offhand']) }).strict(),
  z.object({ group: z.literal('torso'), layer: z.enum(['garment', 'armor', 'outerwear']) }).strict(),
  z.object({ group: z.literal('legs'), layer: z.enum(['legwear', 'footwear']) }).strict(),
  z.object({ group: z.literal('accessories'), index: z.union([z.literal(0), z.literal(1), z.literal(2)]) }).strict(),
]);
const principal = z.union([
  z.object({ type: z.literal('character'), characterId }).strict(),
  z.object({ type: z.literal('dynasty'), dynastyId: z.string().min(1) }).strict(),
  z.object({ type: z.literal('title'), titleId: z.string().min(1) }).strict(),
]);
const custodian = z.union([
  z.object({ type: z.literal('character'), characterId }).strict(),
  z.object({ type: z.literal('asset'), assetId: z.string().min(1) }).strict(),
]);
const assetPlacement = z.union([
  z.object({ type: z.literal('character'), characterId }).strict(),
  z.object({ type: z.literal('location'), location }).strict(),
  z.object({ type: z.literal('asset'), assetId: z.string().min(1) }).strict(),
]);

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  worldId: z.literal('agot-298'),
  startDate: z.object({ year: z.literal(298), month: z.literal(5), day: z.literal(10) }).strict(),
  characterDatasetHash: sha,
  mapDatasetHash: sha,
  artifactDatasetHash: sha,
  artifactWorldStateHash: sha,
  contentHash: sha,
  paths: z.object({
    startState: localPath,
    playableCharacters: localPath,
    characterContentIndex: localPath,
    terminology: localPath,
    gameplayLocations: localPath,
    holderSummaries: localPath,
    ordinaryItems: localPath,
    loadouts: localPath,
    characterCreation: localPath,
  }).strict(),
}).strict();

const playableSchema = z.array(z.object({
  characterId,
  enabled: z.boolean(),
  difficulty: z.enum(['normal', 'hard', 'epic']),
  focus: z.array(z.string().trim().min(1)),
  card: z.object({
    title: z.string().trim().min(1),
    tagline: z.string().trim().min(1),
    background: z.string().trim().min(1),
    avatarIcon: z.string().trim().min(1),
  }).strict(),
}).strict());

const startStateSchema = z.object({
  schemaVersion: z.literal(1),
  characters: z.array(z.object({
    characterId,
    location,
    currentActivity: z.enum(['idle', 'travelling', 'imprisoned', 'missing']),
    aliveOverride: z.boolean().optional(),
    wounds: z.array(z.string()).optional(),
  }).strict()),
  titles: z.array(z.object({
    titleId: z.string().min(1),
    lawfulHolderId: characterId.nullable(),
    controllerId: characterId.nullable(),
    contestedByIds: z.array(characterId),
  }).strict()),
  assets: z.array(z.object({
    instanceId: z.string().min(1), definitionId: z.string().min(1), kind: z.enum(['item', 'site', 'vehicle']),
    lawfulOwner: principal.nullable(), controller: principal.nullable(), custodian: custodian.nullable(),
    placement: assetPlacement.nullable(), equippedPosition: equipmentPosition.nullable(),
    status: z.enum(['normal', 'stolen', 'inheritance_pending']),
    overrides: z.object({ customName: z.string().optional(), charges: z.number().int().nonnegative().optional(), renown: z.number().nonnegative().optional(), isHeirloom: z.boolean().optional() }).strict().optional(),
  }).strict()),
  sites: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(['armory', 'wardrobe', 'room', 'warehouse', 'stable', 'camp', 'other']),
    location,
    locationLabel: z.string().min(1),
    description: z.string().min(1),
    capacity: z.number().int().nonnegative().optional(),
  }).strict()),
  vehicles: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(['packhorse', 'wagon', 'ship', 'other']),
    location,
    locationLabel: z.string().min(1),
    capacity: z.number().int().nonnegative(),
    description: z.string().min(1),
  }).strict()),
}).strict();

const terminologySchema = z.object({
  schemaVersion: z.literal(1),
  cultures: z.record(z.string(), z.string()),
  faiths: z.record(z.string(), z.string()),
  relationships: z.record(z.string(), z.string()),
}).strict();

const gameplaySchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1), englishName: z.string().optional(),
    type: z.enum(['region', 'castle', 'city', 'town', 'village', 'port', 'ruin', 'landmark']),
    importance: z.number(), regionId: z.string().min(1), mapX: z.number(), mapY: z.number(),
    reasons: z.array(z.enum(['explicit', 'important-place', 'political-center', 'start-reference', 'event-reference', 'major-route-port'])).min(1),
  }).strict()),
  counts: z.object({
    total: z.number(),
    byReason: z.record(z.string(), z.number()),
  }).strict().optional(),
  config: z.object({
    schemaVersion: z.literal(1), include: z.array(z.string()), exclude: z.array(z.string()),
    rules: z.object({
      minimumImportance: z.number(),
      types: z.array(z.enum(['region', 'castle', 'city', 'town', 'village', 'port', 'ruin', 'landmark'])),
      includePoliticalCenters: z.boolean(), includeStartReferences: z.boolean(), includeEventReferences: z.boolean(), includeMajorRoutePorts: z.boolean(),
    }).strict(),
  }).strict(),
}).strict();

const holderDatasetSchema = z.object({ schemaVersion: z.literal(1), holders: z.array(z.object({
  id: characterId, name: z.string().min(1), dynastyId: z.string().nullable().optional(), alive: z.boolean(), titleIds: z.array(z.string()), displayLabel: z.string().min(1),
}).strict()) }).strict();

const contentIndexSchema = z.object({ schemaVersion: z.literal(1), shards: z.record(z.string(), localPath), characters: z.record(z.string(), z.string()) }).strict();
const characterContentSchema = z.object({ schemaVersion: z.literal(1), characterId, summary: z.string().optional(), publicRoles: z.array(z.string()).optional(), aliases: z.array(z.string()).optional(), appearance: z.string().optional(), personality: z.string().optional(), reputation: z.string().optional(), experiences: z.array(z.unknown()).optional(), notableRelations: z.array(z.unknown()).optional(), sources: z.array(z.string()) }).strict();
const loadoutSlotSchema = z.object({
  id: z.string().min(1),
  definitionId: z.string().min(1),
  position: equipmentPosition,
}).strict();
const loadoutsSchema = z.object({
  schemaVersion: z.literal(1),
  templates: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    ageGroup: z.enum(['infant', 'child', 'adult']),
    slots: z.array(loadoutSlotSchema),
  }).strict()),
  overrides: z.array(z.object({
    characterId,
    id: z.string().min(1),
    templateId: z.string().min(1).optional(),
    slots: z.array(loadoutSlotSchema).optional(),
    clearedPositions: z.array(equipmentPosition).optional(),
  }).strict()),
}).strict();

const creationOption = <T extends [string, ...string[]]>(ids: T) => z.object({
  id: z.enum(ids),
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
  impact: z.string().trim().min(1).optional(),
}).strict();

const characterCreationSchema = z.object({
  schemaVersion: z.literal(1),
  roles: z.array(creationOption(['commoner', 'traveler', 'retainer', 'knight', 'landless_noble'])),
  origins: z.array(creationOption(['smallfolk', 'town', 'household', 'minor_nobility'])),
  experiences: z.array(creationOption(['household_service', 'martial_training', 'trade_travel', 'academy_learning', 'wandering_life'])),
  livelihoods: z.array(creationOption(['day_labor', 'household_wage', 'guard_work', 'trade', 'scribe_work'])),
  situations: z.array(creationOption(['lodging', 'awaiting_work', 'arrival', 'making_living'])),
}).strict();

function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(`${label}格式无效：${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  return result.data;
}

export const parseLivingWorldManifest = (value: unknown): LivingWorldManifest => parse(manifestSchema, value, '世界内容清单');
export const parsePlayableCharacters = (value: unknown): PlayableCharacterEntry[] => parse(playableSchema, value, '可玩人物') as PlayableCharacterEntry[];
export const parseLivingWorldStartState = (value: unknown): LivingWorldStartState => parse(startStateSchema, value, '世界起点') as LivingWorldStartState;
export const parseWorldTerminology = (value: unknown): WorldTerminology => parse(terminologySchema, value, '世界术语');
export const parseGameplayLocationDataset = (value: unknown): GameplayLocationDataset => parse(gameplaySchema, value, '游戏地点');
export const parseHolderSummaryDataset = (value: unknown): HolderSummaryDataset => parse(holderDatasetSchema, value, '持有人摘要') as HolderSummaryDataset;
export const parseCharacterContentIndex = (value: unknown): CharacterContentIndex => parse(contentIndexSchema, value, '人物内容索引') as CharacterContentIndex;
export const parseCharacterContentShard = (value: unknown): Record<string, CharacterContentRecord> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('人物内容分片格式无效');
  const result: Record<string, CharacterContentRecord> = {};
  for (const [id, record] of Object.entries(value)) result[id] = parse(characterContentSchema, record, `人物内容 ${id}`) as CharacterContentRecord;
  return result;
};
export const parseCharacterCreationContent = (value: unknown): CharacterCreationContent => parse(characterCreationSchema, value, '人物创建选项') as CharacterCreationContent;
const itemEffectSchema = z.union([
  z.object({
    kind: z.literal('check_modifier'),
    domain: z.enum(['diplomacy', 'martial', 'stewardship', 'intrigue', 'learning', 'prowess', 'duel', 'battle']),
    value: z.number(), stackGroup: z.string().min(1), cap: z.number().optional(),
    condition: z.record(z.string(), z.unknown()).optional(), label: z.string().min(1),
  }).strict(),
  z.object({ kind: z.literal('action_unlock'), actionId: z.string().min(1), label: z.string().min(1), condition: z.record(z.string(), z.unknown()).optional() }).strict(),
  z.object({ kind: z.literal('protection'), zones: z.array(z.enum(['head', 'torso', 'arms', 'legs'])), damageTags: z.array(z.string()), value: z.number(), stackGroup: z.string().min(1), cap: z.number().optional(), label: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('social'), contextTags: z.array(z.string()), value: z.number(), stackGroup: z.string().min(1), cap: z.number().optional(), label: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('burden'), value: z.number(), stackGroup: z.string().min(1), cap: z.number().optional(), label: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('fatigue'), contextTags: z.array(z.string()), value: z.number(), stackGroup: z.string().min(1), cap: z.number().optional(), label: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('heat'), contextTags: z.array(z.string()), value: z.number(), stackGroup: z.string().min(1), cap: z.number().optional(), label: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('resource'), target: z.enum(['goldGain', 'recoverySpeed']), value: z.number(), stackGroup: z.string().min(1), cap: z.number().optional(), label: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('capacity'), categories: z.array(z.string()), units: z.number(), stackGroup: z.string().min(1), cap: z.number().optional(), label: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('narrative'), directive: z.string().min(1), condition: z.record(z.string(), z.unknown()).optional() }).strict(),
]);

const itemImageSchema = z.union([
  z.object({ type: z.literal('game'), icon: z.string().min(1) }).strict(),
  z.object({ type: z.literal('wiki'), path: z.string().min(1), fallbackIcon: z.string().min(1) }).strict(),
  z.object({ type: z.literal('asset'), path: z.string().min(1), fallbackIcon: z.string().min(1) }).strict(),
  z.object({ type: z.literal('library'), iconName: z.string().min(1) }).strict(),
]);

const itemDefinitionSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), description: z.string().min(1), roleplayText: z.string().min(1),
  category: z.enum(['weapon', 'armor', 'clothing', 'jewelry', 'tool', 'document', 'medicine', 'poison', 'supply', 'keepsake']),
  subcategory: z.string().min(1), tags: z.array(z.string()), material: z.string().min(1), image: itemImageSchema,
  baseQuality: z.enum(['rough', 'common', 'fine', 'masterwork', 'legendary']), rarity: z.enum(['common', 'uncommon', 'rare', 'unique', 'illustrious']),
  bulk: z.enum(['tiny', 'small', 'medium', 'large']), stackable: z.boolean(), maxStack: z.number().int().min(1),
  unique: z.boolean(), equippable: z.boolean(), allowedPositions: z.array(equipmentPosition),
  handedness: z.enum(['one', 'two']).optional(), baseValue: z.number().nonnegative(),
  effects: z.array(itemEffectSchema), provenance: z.record(z.string(), z.unknown()).optional(),
  contentSource: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const parseOrdinaryItems = (value: unknown) => parse(z.array(itemDefinitionSchema), value, '普通物品') as import('./types').OrdinaryItemContent[];
export const parseWorldLoadouts = (value: unknown): WorldLoadoutContent => {
  const parsed = parse(loadoutsSchema, value, 'NPC 装备') as { schemaVersion: 1; templates: unknown[]; overrides: unknown[] };
  return { templates: parsed.templates as WorldLoadoutContent['templates'], overrides: parsed.overrides as WorldLoadoutContent['overrides'] };
};
