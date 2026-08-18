import type { BodyZoneKey, WoundLevel } from '../../types/game';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import type { EquipmentPosition } from '../items/types';
import { normalizeRelationship } from './characterRelationships';
import { isCharacterId } from './characterIds';
import type { CharacterId, CharacterItemRecord, CharacterRelationship, KnowledgeVisibility } from './types';
import {
  type CharacterCommandContext,
  type CharacterState,
  type CharacterStateCommand,
  type CharacterCommandValidationResult,
  type ValidatedCharacterEventInput,
  eventInput,
  canonicalCharacterCommandIdentity,
} from './characterCommands';

export type { CharacterCommandContext, CharacterState, CharacterStateCommand } from './characterCommands';
export type ValidationResult<T> =
  | { ok: true; events: T; reason?: undefined }
  | { ok: false; events: []; reason: string };

type RuntimeRecord = Record<string, unknown>;
type ValidatedContext = Omit<CharacterCommandContext, 'characters'> & { characters: CharacterState[] };

const COMMAND_TYPES = new Set([
  'SET_CHARACTER_RELATIONSHIP',
  'ADD_CHARACTER_TRAIT',
  'REMOVE_CHARACTER_TRAIT',
  'MOVE_CHARACTER',
  'INJURE_CHARACTER',
  'HEAL_CHARACTER',
  'KILL_CHARACTER',
  'MARRY_CHARACTERS',
  'DIVORCE_CHARACTERS',
  'ADD_CHARACTER_MEMORY',
  'GRANT_CHARACTER_TITLE',
  'REVOKE_CHARACTER_TITLE',
  'CHARACTER_ITEM_ACQUIRE',
  'CHARACTER_ITEM_EQUIP',
  'CHARACTER_ITEM_UNEQUIP',
  'CHARACTER_ITEM_TRANSFER',
  'CHARACTER_ITEM_LOSE',
]);
const PRESENCE_REQUIRED_COMMANDS = new Set([
  'MOVE_CHARACTER',
  'INJURE_CHARACTER',
  'HEAL_CHARACTER',
  'KILL_CHARACTER',
  'MARRY_CHARACTERS',
  'DIVORCE_CHARACTERS',
]);
const ZONE_ALIASES: Record<string, BodyZoneKey> = {
  head: 'head',
  torso: 'torso',
  arms: 'arms',
  arm: 'arms',
  legs: 'legs',
  leg: 'legs',
};
const LEVELS = new Set<WoundLevel>(['intact', 'minor', 'heavy', 'critical']);
const VISIBILITIES = new Set<KnowledgeVisibility>(['public', 'player', 'restricted', 'rumor', 'secret', 'system']);
const RELATIONSHIP_NUMBER_FIELDS = ['opinion', 'trust', 'fear', 'respect', 'attraction', 'obligation'] as const;

function isRecord(value: unknown): value is RuntimeRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value: RuntimeRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function fail(reason: string): CharacterCommandValidationResult {
  return { ok: false, events: [], reason };
}

function success(events: ValidatedCharacterEventInput[]): CharacterCommandValidationResult {
  return { ok: true, events };
}

function isRuntimeCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && value.trim() === value && isCharacterId(value);
}

function validateStringArray(value: unknown, label: string, ids = false): string | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim() || (ids && !isRuntimeCharacterId(item)))) {
    return `${label}必须是合法的字符串数组`;
  }
  return undefined;
}

function validateRelationshipShape(value: unknown, label: string, requireIds = false): string | undefined {
  if (!isRecord(value)) return `${label}必须是对象`;
  if (!requireIds && (hasOwn(value, 'sourceId') || hasOwn(value, 'targetId'))) return `${label}不得包含 sourceId 或 targetId`;
  if (requireIds && !isRuntimeCharacterId(value.sourceId)) return `${label}.sourceId 不是合法人物 ID`;
  if (requireIds && !isRuntimeCharacterId(value.targetId)) return `${label}.targetId 不是合法人物 ID`;
  if (hasOwn(value, 'kind') && value.kind !== undefined && typeof value.kind !== 'string') return `${label}.kind 必须是字符串`;
  for (const field of RELATIONSHIP_NUMBER_FIELDS) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
      return `${label}.${field} 必须是有限 number`;
    }
  }
  return undefined;
}

function isEquipmentPosition(value: unknown): value is EquipmentPosition {
  if (!isRecord(value) || typeof value.group !== 'string') return false;
  if (value.group === 'head' || value.group === 'mainhand' || value.group === 'offhand') {
    return Object.keys(value).every((key) => key === 'group');
  }
  if (value.group === 'torso') return (value.layer === 'garment' || value.layer === 'armor' || value.layer === 'outerwear');
  if (value.group === 'legs') return value.layer === 'legwear' || value.layer === 'footwear';
  if (value.group === 'accessories') return value.index === 0 || value.index === 1 || value.index === 2;
  return false;
}

function samePosition(left: EquipmentPosition, right: EquipmentPosition): boolean {
  if (left.group !== right.group) return false;
  if (left.group === 'torso' && right.group === 'torso') return left.layer === right.layer;
  if (left.group === 'legs' && right.group === 'legs') return left.layer === right.layer;
  if (left.group === 'accessories' && right.group === 'accessories') return left.index === right.index;
  return left.group === 'head' || left.group === 'mainhand' || left.group === 'offhand';
}

function validateCharacterItemRecord(value: unknown): value is CharacterItemRecord {
  if (!isRecord(value)) return false;
  if (typeof value.instanceId !== 'string' || !value.instanceId.trim()) return false;
  if (typeof value.definitionId !== 'string' || !value.definitionId.trim()) return false;
  if (!isRuntimeCharacterId(value.ownerId)) return false;
  if (!isRecord(value.custody) || typeof value.custody.type !== 'string') return false;
  if (value.custody.type === 'character') {
    if (!isRuntimeCharacterId(value.custody.characterId)) return false;
  } else if (value.custody.type === 'site') {
    if (typeof value.custody.siteId !== 'string' || !value.custody.siteId.trim()) return false;
  } else return false;
  if (value.equippedPosition !== undefined && !isEquipmentPosition(value.equippedPosition)) return false;
  return value.source === 'baseline_template' || value.source === 'curated_override' || value.source === 'story_event';
}

function validateCharacterState(value: unknown, label: string): value is CharacterState {
  if (!isRecord(value)) return false;
  if (!isRuntimeCharacterId(value.id) || typeof value.alive !== 'boolean') return false;
  if (hasOwn(value, 'locationId') && value.locationId !== null && value.locationId !== undefined
    && (typeof value.locationId !== 'string' || !value.locationId.trim())) return false;
  if (hasOwn(value, 'deathReason') && value.deathReason !== null && value.deathReason !== undefined && typeof value.deathReason !== 'string') return false;
  for (const [key, name, ids] of [
    ['traits', '人物特质', false],
    ['spouseIds', '配偶 ID', true],
    ['titles', '人物头衔', false],
    ['titleIds', '人物头衔 ID', false],
    ['wounds', '人物伤势', false],
  ] as const) {
    if (hasOwn(value, key) && value[key] !== undefined && validateStringArray(value[key], `${label}.${name}`, ids)) return false;
  }
  if (hasOwn(value, 'items') && value.items !== undefined) {
    if (!Array.isArray(value.items) || value.items.some((item) => !validateCharacterItemRecord(item))) return false;
    if (new Set(value.items.map((item) => item.instanceId)).size !== value.items.length) return false;
  }
  if (hasOwn(value, 'relationships') && value.relationships !== undefined) {
    if (!Array.isArray(value.relationships)) return false;
    if (value.relationships.some((relationship) => Boolean(validateRelationshipShape(relationship, `${label}.relationships`, true)))) return false;
  }
  return true;
}

function validateContext(input: unknown): { context?: ValidatedContext; reason?: string } {
  if (!isRecord(input)) return { reason: '人物命令上下文必须是对象' };
  if (!hasOwn(input, 'characters')) return { reason: '人物命令上下文缺少 characters' };

  const characters: CharacterState[] = [];
  const seen = new Set<CharacterId>();
  const addCharacter = (value: unknown, key?: unknown): string | undefined => {
    const label = `人物上下文${key === undefined ? '' : `[${String(key)}]`}`;
    if (!validateCharacterState(value, label)) return `${label}结构不合法`;
    const character = value;
    if (key !== undefined && (!isRuntimeCharacterId(key) || key !== character.id)) return `${label}的 Map key 与人物 ID 不一致`;
    if (seen.has(character.id)) return `人物上下文包含重复人物 ${character.id}`;
    seen.add(character.id);
    characters.push(character);
    return undefined;
  };

  if (input.characters instanceof Map) {
    for (const [key, value] of input.characters.entries()) {
      const reason = addCharacter(value, key);
      if (reason) return { reason };
    }
  } else if (Array.isArray(input.characters)) {
    for (const value of input.characters) {
      const reason = addCharacter(value);
      if (reason) return { reason };
    }
  } else if (isRecord(input.characters)) {
    for (const [key, value] of Object.entries(input.characters)) {
      const reason = addCharacter(value, key);
      if (reason) return { reason };
    }
  } else {
    return { reason: '人物命令上下文的 characters 必须是数组、Map 或对象' };
  }

  if (typeof input.currentTurn !== 'number' || !Number.isSafeInteger(input.currentTurn) || input.currentTurn < 0) {
    return { reason: '人物命令上下文必须提供非负整数 currentTurn' };
  }
  if (typeof input.commandSequence !== 'number' || !Number.isSafeInteger(input.commandSequence) || input.commandSequence < 0) {
    return { reason: '人物命令上下文必须提供非负整数 commandSequence' };
  }
  if (hasOwn(input, 'currentLocationId') && input.currentLocationId !== undefined
    && (typeof input.currentLocationId !== 'string' || !input.currentLocationId.trim())) {
    return { reason: '当前地点 ID 必须是字符串' };
  }
  if (hasOwn(input, 'presentCharacterIds') && input.presentCharacterIds !== undefined) {
    if (input.presentCharacterIds instanceof Set) {
      if ([...input.presentCharacterIds].some((id) => !isRuntimeCharacterId(id))) return { reason: '在场人物 ID 集合结构不合法' };
    } else {
      const reason = validateStringArray(input.presentCharacterIds, '在场人物 ID', true);
      if (reason) return { reason };
    }
  }
  if (hasOwn(input, 'knownLocationIds') && input.knownLocationIds !== undefined) {
    if (input.knownLocationIds instanceof Set) {
      if ([...input.knownLocationIds].some((id) => typeof id !== 'string' || !id.trim())) return { reason: '已知地点 ID 集合结构不合法' };
    } else {
      const reason = validateStringArray(input.knownLocationIds, '已知地点 ID');
      if (reason) return { reason };
    }
  }
  if (hasOwn(input, 'eventHistory') && input.eventHistory !== undefined) {
    if (!Array.isArray(input.eventHistory)) return { reason: '人物事件历史必须是数组' };
    for (const entry of input.eventHistory) {
      if (!isRecord(entry) || !isRuntimeCharacterId(entry.characterId) || !isRecord(entry.event) || typeof entry.event.type !== 'string' || !entry.event.type.trim()) {
        return { reason: '人物事件历史结构不合法' };
      }
    }
  }

  return {
    context: {
      ...input,
      characters,
    } as ValidatedContext,
  };
}

function findCharacter(context: ValidatedContext, id: CharacterId): CharacterState | undefined {
  return context.characters.find((character) => character.id === id);
}

function isPresent(character: CharacterState, context: ValidatedContext): boolean {
  if (context.presentCharacterIds) {
    return context.presentCharacterIds instanceof Set
      ? context.presentCharacterIds.has(character.id)
      : [...context.presentCharacterIds].includes(character.id);
  }
  return context.currentLocationId === undefined || character.locationId === context.currentLocationId;
}

function requireCharacter(context: ValidatedContext, id: unknown): CharacterState | string {
  if (!isRuntimeCharacterId(id)) return '人物 ID 格式不合法';
  return findCharacter(context, id) ?? '人物不存在';
}

function requireAlive(character: CharacterState): string | undefined {
  return character.alive ? undefined : '人物已死亡，不能执行该状态命令';
}

function requirePresenceEvidence(context: ValidatedContext): string | undefined {
  return context.presentCharacterIds === undefined && context.currentLocationId === undefined
    ? '缺少在场信息，无法验证人物是否在场'
    : undefined;
}

function requirePresent(characters: CharacterState[], context: ValidatedContext): string | undefined {
  const evidence = requirePresenceEvidence(context);
  if (evidence) return evidence;
  const absent = characters.find((character) => !isPresent(character, context));
  return absent ? `人物 ${absent.id} 不在当前地点或不在场` : undefined;
}

function hasSpouse(character: CharacterState, spouseId: CharacterId): boolean {
  return (character.spouseIds ?? []).includes(spouseId);
}

function titlesOf(character: CharacterState): string[] {
  return character.titles ?? character.titleIds ?? [];
}

function itemOf(character: CharacterState, instanceId: string): CharacterItemRecord | undefined {
  return (character.items ?? []).find((item) => item.instanceId === instanceId);
}

function requireItemInCustody(character: CharacterState, instanceId: unknown): CharacterItemRecord | string {
  if (typeof instanceId !== 'string' || !instanceId.trim()) return '物品实例 ID 必须是非空字符串';
  const item = itemOf(character, instanceId);
  if (!item) return '物品实例不存在';
  if (item.custody.type !== 'character' || item.custody.characterId !== character.id) return '物品不在该人物手中保管';
  return item;
}

function itemInstanceExists(context: ValidatedContext, instanceId: string): boolean {
  return context.characters.some((character) => (character.items ?? []).some((item) => item.instanceId === instanceId));
}

function normalizeZone(zone: unknown): BodyZoneKey | undefined {
  return typeof zone === 'string' ? ZONE_ALIASES[zone] : undefined;
}

function requiredString(command: RuntimeRecord, key: string, label: string): string | undefined {
  const value = command[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function optionalString(command: RuntimeRecord, key: string, label: string): string | undefined | null {
  if (!hasOwn(command, key) || command[key] === undefined) return undefined;
  return typeof command[key] === 'string' && command[key].trim() ? command[key] : null;
}

function requireNumberEnum(value: unknown, label: string): WoundLevel | undefined {
  return typeof value === 'string' && LEVELS.has(value as WoundLevel) ? value as WoundLevel : undefined;
}

function relationshipEvent(
  sourceId: CharacterId,
  targetId: CharacterId,
  input: RuntimeRecord,
): CharacterRelationship | string {
  if (!isRecord(input)) return '关系必须是对象';
  const shapeReason = validateRelationshipShape(input, '关系');
  if (shapeReason) return shapeReason;
  const kind = input.kind === undefined ? undefined : input.kind as string;
  const raw: CharacterRelationship = {
    sourceId,
    targetId,
    ...(kind === undefined ? {} : { kind }),
    opinion: input.opinion as number,
    trust: input.trust as number,
    fear: input.fear as number,
    respect: input.respect as number,
    attraction: input.attraction as number,
    obligation: input.obligation as number,
  };
  return normalizeRelationship(raw);
}

function hasDied(context: ValidatedContext, id: CharacterId): boolean {
  return context.eventHistory?.some((entry) => entry.characterId === id && entry.event.type === 'DIE') ?? false;
}

function validateCharacterCommandUnsafe(commandInput: unknown, context: ValidatedContext): CharacterCommandValidationResult {
  if (!isRecord(commandInput)) return fail('人物命令必须是对象');
  if (typeof commandInput.type !== 'string' || !COMMAND_TYPES.has(commandInput.type)) return fail('人物命令类型不合法');
  if (hasOwn(commandInput, 'commandId') && commandInput.commandId !== undefined
    && (typeof commandInput.commandId !== 'string' || !commandInput.commandId.trim())) return fail('命令 ID 必须是非空字符串');

  if (commandInput.type === 'SET_CHARACTER_RELATIONSHIP') {
    const source = requireCharacter(context, commandInput.sourceCharacterId);
    const target = requireCharacter(context, commandInput.targetCharacterId);
    if (typeof source === 'string') return fail(source);
    if (typeof target === 'string') return fail(target);
    if (source.id === target.id) return fail('人物不能与自己建立关系');
    const relationship = relationshipEvent(source.id, target.id, commandInput.relationship as RuntimeRecord);
    if (typeof relationship === 'string') return fail(relationship);
    const dead = requireAlive(source) ?? requireAlive(target);
    if (dead) return fail(dead);
    const absent = requirePresent([source, target], context);
    if (absent) return fail(absent);
    return success([eventInput(commandInput as CharacterStateCommand, context, source.id, {
      type: 'SET_RELATIONSHIP', relationship,
    })]);
  }

  if (commandInput.type === 'CHARACTER_ITEM_TRANSFER') {
    const source = requireCharacter(context, commandInput.fromCharacterId);
    const target = requireCharacter(context, commandInput.toCharacterId);
    if (typeof source === 'string') return fail(source);
    if (typeof target === 'string') return fail(target);
    if (source.id === target.id) return fail('不能把物品转移给同一人物');
    const dead = requireAlive(source) ?? requireAlive(target);
    if (dead) return fail(dead);
    const absent = requirePresent([source, target], context);
    if (absent) return fail(absent);
    const item = requireItemInCustody(source, commandInput.instanceId);
    if (typeof item === 'string') return fail(item);
    if (itemInstanceExists({ ...context, characters: context.characters.filter((character) => character.id !== source.id) }, item.instanceId)) {
      return fail(`目标人物已有相同物品实例 ${item.instanceId}`);
    }
    const transferred: CharacterItemRecord = {
      ...item,
      ownerId: target.id,
      custody: { type: 'character', characterId: target.id },
      source: 'story_event',
    };
    delete transferred.equippedPosition;
    return success([
      eventInput(commandInput as CharacterStateCommand, context, source.id, { type: 'ITEM_TRANSFER_OUT', instanceId: item.instanceId }, '0'),
      eventInput(commandInput as CharacterStateCommand, context, target.id, { type: 'ITEM_TRANSFER_IN', item: transferred }, '1'),
    ]);
  }

  const subject = requireCharacter(context, commandInput.characterId);
  if (typeof subject === 'string') return fail(subject);
  const dead = requireAlive(subject);
  if (dead) return fail(dead);

  if (PRESENCE_REQUIRED_COMMANDS.has(commandInput.type)) {
    const absent = requirePresent([subject], context);
    if (absent) return fail(absent);
  }

  switch (commandInput.type) {
    case 'CHARACTER_ITEM_ACQUIRE': {
      const definitionId = requiredString(commandInput, 'definitionId', '物品定义 ID');
      const instanceId = requiredString(commandInput, 'instanceId', '物品实例 ID');
      if (!definitionId) return fail('物品定义 ID 必须是非空字符串');
      if (!instanceId) return fail('物品实例 ID 必须是非空字符串');
      if (!ITEM_CATALOG.has(definitionId)) return fail(`物品定义 ${definitionId} 不存在`);
      if (itemInstanceExists(context, instanceId)) return fail(`物品实例 ${instanceId} 已经存在，不能重复获得`);
      return success([eventInput(commandInput as CharacterStateCommand, context, subject.id, {
        type: 'ITEM_ACQUIRE',
        item: {
          instanceId,
          definitionId,
          ownerId: subject.id,
          custody: { type: 'character', characterId: subject.id },
          source: 'story_event',
        },
      })]);
    }
    case 'CHARACTER_ITEM_EQUIP': {
      const item = requireItemInCustody(subject, commandInput.instanceId);
      if (typeof item === 'string') return fail(item);
      if (!isEquipmentPosition(commandInput.position)) return fail('装备位置结构不合法');
      const definition = ITEM_CATALOG.get(item.definitionId);
      if (!definition) return fail(`物品定义 ${item.definitionId} 不存在`);
      if (!definition.equippable || !definition.allowedPositions.some((position) => samePosition(position, commandInput.position as EquipmentPosition))) {
        return fail(`物品不能装备到指定槽位`);
      }
      const occupied = (subject.items ?? []).find((candidate) => candidate.instanceId !== item.instanceId
        && candidate.equippedPosition && samePosition(candidate.equippedPosition, commandInput.position as EquipmentPosition));
      if (occupied) return fail(`装备槽位已被物品 ${occupied.instanceId} 占用`);
      return success([eventInput(commandInput as CharacterStateCommand, context, subject.id, {
        type: 'ITEM_EQUIP', instanceId: item.instanceId, position: { ...commandInput.position } as EquipmentPosition,
      })]);
    }
    case 'CHARACTER_ITEM_UNEQUIP': {
      const item = requireItemInCustody(subject, commandInput.instanceId);
      if (typeof item === 'string') return fail(item);
      if (!item.equippedPosition) return fail('物品当前未穿戴');
      return success([eventInput(commandInput as CharacterStateCommand, context, subject.id, { type: 'ITEM_UNEQUIP', instanceId: item.instanceId })]);
    }
    case 'CHARACTER_ITEM_LOSE': {
      const item = requireItemInCustody(subject, commandInput.instanceId);
      if (typeof item === 'string') return fail(item);
      return success([eventInput(commandInput as CharacterStateCommand, context, subject.id, { type: 'ITEM_LOSE', instanceId: item.instanceId })]);
    }
    case 'MOVE_CHARACTER': {
      const locationId = requiredString(commandInput, 'locationId', '目标地点');
      if (!locationId) return fail('目标地点必须是非空字符串');
      const reason = optionalString(commandInput, 'reason', '移动原因');
      if (reason === null) return fail('移动原因必须是非空字符串');
      if (context.knownLocationIds) {
        const known = context.knownLocationIds instanceof Set
          ? context.knownLocationIds.has(locationId)
          : [...context.knownLocationIds].includes(locationId);
        if (!known) return fail(`目标地点 ${locationId} 不存在`);
      }
      return success([eventInput(commandInput as CharacterStateCommand, context, subject.id, { type: 'MOVE', locationId, ...(reason === undefined ? {} : { reason }) })]);
    }
    case 'ADD_CHARACTER_TRAIT': {
      const traitId = requiredString(commandInput, 'traitId', '特质 ID');
      if (!traitId) return fail('特质 ID 必须是非空字符串');
      if ((subject.traits ?? []).includes(traitId)) return fail(`人物已经拥有特质 ${traitId}`);
      return success([eventInput(commandInput as CharacterStateCommand, context, subject.id, { type: 'ADD_TRAIT', traitId })]);
    }
    case 'REMOVE_CHARACTER_TRAIT': {
      const traitId = requiredString(commandInput, 'traitId', '特质 ID');
      if (!traitId) return fail('特质 ID 必须是非空字符串');
      if (!(subject.traits ?? []).includes(traitId)) return fail(`人物没有特质 ${traitId}`);
      return success([eventInput(commandInput as CharacterStateCommand, context, subject.id, { type: 'REMOVE_TRAIT', traitId })]);
    }
    case 'INJURE_CHARACTER': {
      const zone = normalizeZone(commandInput.zone);
      const level = requireNumberEnum(commandInput.level, '伤势等级');
      const woundText = requiredString(commandInput, 'woundText', '伤势描述');
      if (!zone) return fail('伤势部位枚举值不合法');
      if (!level) return fail('伤势等级枚举值不合法');
      if (!woundText) return fail('伤势描述必须是非空字符串');
      return success([eventInput(commandInput as CharacterStateCommand, context, subject.id, {
        type: 'INJURE', zone, level, woundText,
      })]);
    }
    case 'HEAL_CHARACTER': {
      let zone: BodyZoneKey | 'all' = 'all';
      if (hasOwn(commandInput, 'zone') && commandInput.zone !== undefined) {
        if (commandInput.zone === 'all') zone = 'all';
        else {
          const normalizedZone = normalizeZone(commandInput.zone);
          if (!normalizedZone) return fail('治疗部位枚举值不合法');
          zone = normalizedZone;
        }
      }
      let level: WoundLevel | undefined;
      if (hasOwn(commandInput, 'level') && commandInput.level !== undefined) {
        level = requireNumberEnum(commandInput.level, '伤势等级');
        if (!level) return fail('伤势等级枚举值不合法');
      }
      const clearWound = optionalString(commandInput, 'clearWound', '要清除的伤口');
      if (clearWound === null) return fail('要清除的伤口必须是非空字符串');
      return success([eventInput(commandInput as CharacterStateCommand, context, subject.id, {
        type: 'HEAL', zone, ...(level === undefined ? {} : { level }), ...(clearWound === undefined ? {} : { clearWound }),
      })]);
    }
    case 'KILL_CHARACTER': {
      if (hasDied(context, subject.id)) return fail('人物已经死亡，不能重复记录死亡事件');
      const cause = requiredString(commandInput, 'cause', '死亡原因');
      if (!cause) return fail('死亡原因必须是非空字符串');
      let killerId: CharacterId | undefined;
      if (hasOwn(commandInput, 'killerId') && commandInput.killerId !== undefined) {
        if (!isRuntimeCharacterId(commandInput.killerId)) return fail('凶手人物 ID 格式不合法');
        const killer = requireCharacter(context, commandInput.killerId);
        if (typeof killer === 'string') return fail(killer);
        if (!killer.alive) return fail('凶手人物已死亡');
        const killerAbsent = requirePresent([killer], context);
        if (killerAbsent) return fail(killerAbsent);
        killerId = commandInput.killerId;
      }
      return success([eventInput(commandInput as CharacterStateCommand, context, subject.id, {
        type: 'DIE', cause, ...(killerId === undefined ? {} : { killerId }),
      })]);
    }
    case 'MARRY_CHARACTERS':
    case 'DIVORCE_CHARACTERS': {
      const spouse = requireCharacter(context, commandInput.spouseId);
      if (typeof spouse === 'string') return fail(spouse);
      if (spouse.id === subject.id) return fail('人物不能与自己建立婚姻');
      const reason = optionalString(commandInput, 'reason', '婚姻原因');
      if (reason === null) return fail('婚姻原因必须是非空字符串');
      const spouseDead = requireAlive(spouse);
      if (spouseDead) return fail(spouseDead);
      const absent = requirePresent([subject, spouse], context);
      if (absent) return fail(absent);
      if (commandInput.type === 'MARRY_CHARACTERS') {
        if (hasSpouse(subject, spouse.id) || hasSpouse(spouse, subject.id)) return fail('婚姻已存在，不能重复建立');
        if ((subject.spouseIds ?? []).some((id) => id !== spouse.id) || (spouse.spouseIds ?? []).some((id) => id !== subject.id)) {
          return fail('婚姻双方已有其他配偶');
        }
        return success([
          eventInput(commandInput as CharacterStateCommand, context, subject.id, { type: 'MARRY', spouseId: spouse.id, ...(reason === undefined ? {} : { reason }) }, '0'),
          eventInput(commandInput as CharacterStateCommand, context, spouse.id, { type: 'MARRY', spouseId: subject.id, ...(reason === undefined ? {} : { reason }) }, '1'),
        ]);
      }
      if ((subject.spouseIds ?? []).some((id) => id !== spouse.id) || (spouse.spouseIds ?? []).some((id) => id !== subject.id)) {
        return fail('婚姻双方已有其他配偶，不能解除异常婚姻状态');
      }
      if (!hasSpouse(subject, spouse.id) || !hasSpouse(spouse, subject.id)) return fail('婚姻关系不是双方互惠，不能解除');
      return success([
        eventInput(commandInput as CharacterStateCommand, context, subject.id, { type: 'DIVORCE', spouseId: spouse.id, ...(reason === undefined ? {} : { reason }) }, '0'),
        eventInput(commandInput as CharacterStateCommand, context, spouse.id, { type: 'DIVORCE', spouseId: subject.id, ...(reason === undefined ? {} : { reason }) }, '1'),
      ]);
    }
    case 'ADD_CHARACTER_MEMORY': {
      if (!isRecord(commandInput.memory)) return fail('记忆必须是对象');
      const memory = commandInput.memory;
      const event = requiredString(memory, 'event', '记忆事件');
      if (!event) return fail('记忆事件必须是非空字符串');
      if (typeof memory.importance !== 'number' || !Number.isFinite(memory.importance) || memory.importance < 1) return fail('记忆重要性必须是有限正数');
      const attitude = optionalString(memory, 'attitude', '记忆态度');
      if (attitude === null) return fail('记忆态度必须是非空字符串');
      const visibility = memory.visibility === undefined ? 'system' : memory.visibility;
      if (typeof visibility !== 'string' || !VISIBILITIES.has(visibility as KnowledgeVisibility)) return fail('记忆可见性枚举值不合法');
      if (hasOwn(memory, 'participants') && memory.participants !== undefined) {
        const participantsReason = validateStringArray(memory.participants, '记忆参与者', true);
        if (participantsReason) return fail(participantsReason);
      }
      const participants = (memory.participants ?? []) as CharacterId[];
      for (const participantId of participants) {
        const participant = requireCharacter(context, participantId);
        if (typeof participant === 'string') return fail(participant);
      }
      if (hasOwn(memory, 'turn') && memory.turn !== undefined
        && (typeof memory.turn !== 'number' || !Number.isInteger(memory.turn) || memory.turn < 0)) return fail('记忆回合必须是非负整数');
      if (hasOwn(memory, 'id') && memory.id !== undefined && (typeof memory.id !== 'string' || !memory.id.trim())) return fail('记忆 ID 必须是非空字符串');
      const normalizedMemory = {
        id: canonicalCharacterCommandIdentity(commandInput as CharacterStateCommand, context, 'memory'),
        characterId: subject.id,
        turn: memory.turn === undefined ? context.currentTurn ?? 0 : memory.turn as number,
        event,
        ...(attitude === undefined ? {} : { attitude }),
        importance: memory.importance as number,
        participants,
        visibility: visibility as KnowledgeVisibility,
      };
      return success([eventInput(commandInput as CharacterStateCommand, context, subject.id, { type: 'ADD_MEMORY', memory: normalizedMemory })]);
    }
    case 'GRANT_CHARACTER_TITLE': {
      const titleId = requiredString(commandInput, 'titleId', '头衔 ID');
      if (!titleId) return fail('头衔 ID 必须是非空字符串');
      if (titlesOf(subject).includes(titleId)) return fail(`人物已经拥有头衔 ${titleId}`);
      return success([eventInput(commandInput as CharacterStateCommand, context, subject.id, { type: 'GRANT_TITLE', titleId })]);
    }
    case 'REVOKE_CHARACTER_TITLE': {
      const titleId = requiredString(commandInput, 'titleId', '头衔 ID');
      if (!titleId) return fail('头衔 ID 必须是非空字符串');
      if (!titlesOf(subject).includes(titleId)) return fail(`人物没有头衔 ${titleId}`);
      return success([eventInput(commandInput as CharacterStateCommand, context, subject.id, { type: 'REVOKE_TITLE', titleId })]);
    }
    default:
      return fail('人物命令类型不合法');
  }
}

export function validateCharacterCommand(command: unknown, contextInput: unknown): CharacterCommandValidationResult {
  try {
    const contextResult = validateContext(contextInput);
    if (!contextResult.context) return fail(contextResult.reason ?? '人物命令上下文结构不合法');
    return validateCharacterCommandUnsafe(command, contextResult.context);
  } catch {
    return fail('人物命令输入结构不合法，无法执行');
  }
}

export function validateCharacterCommandEvents(
  command: unknown,
  context: unknown,
): ValidationResult<ValidatedCharacterEventInput[]> {
  return validateCharacterCommand(command, context);
}
