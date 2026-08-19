import { LordProfile, StateCommand, BodyZoneKey, WoundLevel } from '../types/game';
import { stripEmoji } from './textSanitizer';
import { normalizeCk3Attributes } from '../data/ck3Skills';
import { aggregateSelectedTraitEffects } from '../data/characterTraits';
import { applyPositiveMultiplier, didTraitResistanceTrigger } from './traitEffectEngine';
import type { CharacterEvent, CharacterId, CharacterRelationship } from '../features/characters/types';
import type { CharacterCommandContext, CharacterState, CharacterStateCommand, ValidatedCharacterEventInput } from '../features/characters/characterCommands';
import { validateCharacterCommand } from '../features/characters/characterCommandValidator';
import { applyItemActions, type ItemActionContext } from '../features/items/actions';
import { ITEM_CATALOG } from '../data/itemDefinitions';
import type { ItemAction, ItemStateCommand } from '../features/items/types';
import { aggregateEquippedItemEffects, getZoneProtection, mitigateWoundLevel } from '../features/items/effects';
import { createWorldLocationRef, fallbackLocationLabel, sameWorldLocation } from '../features/map/locationResolver';


// 重新计算领主综合身体状态
function evaluateOverallStatus(lord: LordProfile): '强健' | '挂彩' | '负重伤' | '垂危' | '阵亡' {
  const body = lord.body;

  // 致命要害（头部或胸膛）致命受创 -> 阵亡
  if (body.head.level === 'critical' || body.torso.level === 'critical') {
    return '阵亡';
  }

  // 头部或胸膛重创，或身中剧毒/持续大出血 -> 垂危
  if (
    body.head.level === 'heavy' ||
    body.torso.level === 'heavy' ||
    body.isPoisoned ||
    (body.isBleeding && (body.arms.level === 'critical' || body.legs.level === 'critical'))
  ) {
    return '垂危';
  }

  // 肢体残废/重创或持续流血/感染 -> 负重伤
  if (
    body.arms.level === 'critical' ||
    body.legs.level === 'critical' ||
    body.arms.level === 'heavy' ||
    body.legs.level === 'heavy' ||
    body.isBleeding ||
    body.isInfected
  ) {
    return '负重伤';
  }

  // 有局部轻微伤
  const hasMinor = Object.values(body).some(
    (b) => typeof b === 'object' && 'level' in b && (b.level === 'minor' || b.wounds.length > 0)
  );
  if (hasMinor) {
    return '挂彩';
  }

  return '强健';
}

const ITEM_COMMAND_TYPES = new Set([
  'ITEM_CREATE', 'ITEM_EQUIP', 'ITEM_UNEQUIP', 'ITEM_USE', 'ITEM_TRANSFER', 'ITEM_GIFT',
  'ITEM_DISCARD', 'ITEM_REPAIR', 'ITEM_DAMAGE', 'ITEM_SPLIT', 'ITEM_MERGE', 'ITEM_MARK_HEIRLOOM',
]);

function isItemStateCommand(command: StateCommand): command is ItemStateCommand {
  return ITEM_COMMAND_TYPES.has(command.type);
}

function itemCommandToAction(command: ItemStateCommand): ItemAction {
  switch (command.type) {
    case 'ITEM_CREATE': return { kind: 'acquire', instance: command.instance, placement: command.placement, historyType: command.historyType };
    case 'ITEM_EQUIP': return { kind: 'equip', instanceId: command.instanceId, position: command.position, displacedTo: command.displacedTo };
    case 'ITEM_UNEQUIP': return { kind: 'unequip', instanceId: command.instanceId, to: command.to };
    case 'ITEM_USE': return { kind: 'use', instanceId: command.instanceId, quantity: command.quantity };
    case 'ITEM_TRANSFER': return { kind: 'transfer', instanceId: command.instanceId, to: command.to, quantity: command.quantity, newInstanceId: command.newInstanceId };
    case 'ITEM_GIFT': return { kind: 'gift', instanceId: command.instanceId, recipientId: command.recipientId, quantity: command.quantity, newInstanceId: command.newInstanceId };
    case 'ITEM_DISCARD': return { kind: 'discard', instanceId: command.instanceId, quantity: command.quantity, newInstanceId: command.newInstanceId };
    case 'ITEM_REPAIR': return { kind: 'repair', instanceId: command.instanceId, amount: command.amount };
    case 'ITEM_DAMAGE': return { kind: 'damage', instanceId: command.instanceId, amount: command.amount, reason: command.reason };
    case 'ITEM_SPLIT': return { kind: 'split', instanceId: command.instanceId, quantity: command.quantity, newInstanceId: command.newInstanceId, to: command.to };
    case 'ITEM_MERGE': return { kind: 'merge', sourceInstanceId: command.sourceInstanceId, targetInstanceId: command.targetInstanceId };
    case 'ITEM_MARK_HEIRLOOM': return { kind: 'mark_heirloom', instanceId: command.instanceId, houseId: command.houseId };
  }
}

function inferDamageTags(text: string): string[] {
  const tags = new Set<string>();
  if (/剑|刀|刃|劈|砍|斩|割|抓|slashing/i.test(text)) tags.add('slashing');
  if (/刺|箭|矛|枪|弩|贯穿|piercing/i.test(text)) tags.add('piercing');
  if (/锤|撞|砸|棍|钝|坠落|blunt/i.test(text)) tags.add('blunt');
  if (/火|烧|烫|灼|fire/i.test(text)) tags.add('fire');
  return [...tags];
}

function createItemActionContext(lord: LordProfile): ItemActionContext {
  return {
    actorId: `lord:${lord.name}`,
    actorLocation: lord.location,
    gameDate: '当前回合',
    accessibleSiteIds: new Set(Object.values(lord.items.sites).filter((site) => sameWorldLocation(site.location, lord.location)).map((site) => site.id)),
    accessibleVehicleIds: new Set(Object.values(lord.items.vehicles).filter((vehicle) => sameWorldLocation(vehicle.location, lord.location)).map((vehicle) => vehicle.id)),
  };
}

// 纯前端确定性数值结算 Reducer
export function applyStateCommands(
  lord: LordProfile,
  commands: StateCommand[],
  random: () => number = Math.random
): { updatedLord: LordProfile; changesLog: string[]; isFatalDeath: boolean } {
  const next: LordProfile = JSON.parse(JSON.stringify(lord));
  next.attributes = normalizeCk3Attributes(next.attributes);
  const changesLog: string[] = [];
  const traitEffects = aggregateSelectedTraitEffects(next.traitIds ?? []);
  let isFatalDeath = false;

  const itemCommands = commands.filter(isItemStateCommand);
  if (itemCommands.length > 0) {
    const itemResult = applyItemActions(next.items, itemCommands.map(itemCommandToAction), createItemActionContext(next), ITEM_CATALOG);
    if (itemResult.ok) {
      next.items = itemResult.state;
      changesLog.push(...itemResult.log.map((entry) => `[物品] ${entry}`));
    } else {
      changesLog.push(`[物品] 批次未结算：${itemResult.error}`);
    }
  }

  for (const cmd of commands) {
    if (isItemStateCommand(cmd)) continue;
    switch (cmd.type) {
      //  局部肢体受创
      case 'INJURE_ZONE': {
        const zone = next.body[cmd.zone];
        if (!zone) break;

        const levels: WoundLevel[] = ['intact', 'minor', 'heavy', 'critical'];
        const damageTags = cmd.damageTags?.length
          ? [...new Set(cmd.damageTags)]
          : inferDamageTags(`${cmd.reason ?? ''} ${cmd.woundText}`);
        const equippedEffects = aggregateEquippedItemEffects(next.items, ITEM_CATALOG);
        const protection = getZoneProtection(equippedEffects, cmd.zone, damageTags);
        let effectiveLevel = mitigateWoundLevel(cmd.level, protection);

        if (effectiveLevel !== cmd.level) {
          const matchingArmor = equippedEffects.active.filter((entry) => entry.effect.kind === 'protection'
            && entry.effect.zones.includes(cmd.zone)
            && entry.effect.damageTags.some((tag) => damageTags.includes(tag)));
          const armorNames = [...new Set(matchingArmor.map((entry) => entry.itemName))];
          for (const instanceId of new Set(matchingArmor.map((entry) => entry.instanceId))) {
            const instance = next.items.instances[instanceId];
            if (instance) instance.durability = Math.max(0, instance.durability - 5);
          }
          changesLog.push(` 护甲减伤: ${armorNames.join('、') || '当前防护'}将伤势由【${cmd.level}】减轻为【${effectiveLevel}】，耐久受损`);
        }

        const beforeTraitResistance = effectiveLevel;
        const injuryResistance = traitEffects.resistances.injury ?? 0;
        if (didTraitResistanceTrigger(injuryResistance, random())) {
          effectiveLevel = levels[Math.max(0, levels.indexOf(effectiveLevel) - 1)];
          changesLog.push(` 特质抵抗: 受伤抗性生效，伤势由【${beforeTraitResistance}】减轻为【${effectiveLevel}】`);
        }

        zone.level = effectiveLevel;
        if (effectiveLevel !== 'intact' && cmd.woundText && !zone.wounds.includes(cmd.woundText)) {
          zone.wounds.push(stripEmoji(cmd.woundText));
        }

        const levelNames: Record<WoundLevel, string> = {
          intact: '完好', minor: '轻创擦伤', heavy: '严重创伤', critical: '残废致命',
        };
        changesLog.push(` 部位受创: [${zone.name}] 伤情变为【${levelNames[effectiveLevel]}】${effectiveLevel !== 'intact' && cmd.woundText ? ` · ${cmd.woundText}` : ''}`);

        if (zone.isFatalZone && effectiveLevel === 'critical') {
          isFatalDeath = true;
          changesLog.push(` 致命重创! [${zone.name}] 遭受致命打击，领主阵亡！`);
        }
        break;
      }

      //  伤口包扎治疗
      case 'HEAL_ZONE': {
        if (cmd.zone === 'all') {
          (Object.keys(next.body) as BodyZoneKey[]).forEach((k) => {
            const z = next.body[k];
            if (z && typeof z === 'object' && 'level' in z) {
              if (z.level === 'heavy') z.level = 'minor';
              else if (z.level === 'minor') z.level = 'intact';
            }
          });
          changesLog.push(` 伤势好转: 全身各处伤口得到妥善包扎处理`);
        } else {
          const z = next.body[cmd.zone];
          if (z) {
            z.level = cmd.level || 'intact';
            if (cmd.clearWound) {
              z.wounds = z.wounds.filter((w) => w !== cmd.clearWound);
            }
            changesLog.push(` 创口调理: [${z.name}] 伤势有所缓解`);
          }
        }
        break;
      }

      //  异常体态 (失血/剧毒/感染)
      case 'SET_BLEEDING': {
        if (cmd.value && didTraitResistanceTrigger(traitEffects.resistances.bleeding ?? 0, random())) {
          changesLog.push(' 特质抵抗: 失血抗性生效，出血未形成持续状态');
          break;
        }
        next.body.isBleeding = cmd.value;
        changesLog.push(cmd.value ? ' 持续失血: 伤口正在渗血' : ' 伤口止血: 渗血已止住');
        break;
      }

      case 'SET_POISONED': {
        if (cmd.value && didTraitResistanceTrigger(traitEffects.resistances.poison ?? 0, random())) {
          changesLog.push(' 特质抵抗: 中毒抗性生效，毒素未能形成持续影响');
          break;
        }
        next.body.isPoisoned = cmd.value;
        changesLog.push(cmd.value ? ' 异状入侵: 身中剧毒侵蚀！' : ' 毒素清除: 毒性已解');
        break;
      }

      case 'SET_INFECTED': {
        if (cmd.value && didTraitResistanceTrigger(traitEffects.resistances.disease ?? 0, random())) {
          changesLog.push(' 特质抵抗: 疾病抗性生效，感染未能形成持续影响');
          break;
        }
        next.body.isInfected = cmd.value;
        changesLog.push(cmd.value ? ' 伤口发炎: 创口发炎并伴随高热' : ' 高热退去: 伤口炎症消退');
        break;
      }

      //  金币收支
      case 'MODIFY_GOLD': {
        if (cmd.goldDragons !== undefined) {
          const goldDelta = applyPositiveMultiplier(cmd.goldDragons, traitEffects.multipliers.goldGain);
          next.goldDragons = Math.max(0, next.goldDragons + goldDelta);
          changesLog.push(
            goldDelta >= 0 ? ` 获得金龙: +${goldDelta}` : ` 支出金龙: ${goldDelta}`
          );
        }
        if (cmd.silverStags !== undefined) {
          const silverDelta = applyPositiveMultiplier(cmd.silverStags, traitEffects.multipliers.goldGain);
          next.silverStags = Math.max(0, next.silverStags + silverDelta);
          changesLog.push(
            silverDelta >= 0 ? ` 获得银鹿: +${silverDelta}` : ` 支出银鹿: ${silverDelta}`
          );
        }
        break;
      }

      //  属性与声望
      case 'MODIFY_STAT': {
        const oldVal = next.attributes[cmd.stat] ?? 0;
        next.attributes[cmd.stat] = Math.max(0, Math.min(100, oldVal + cmd.delta));
        if (next.baseAttributes) {
          const oldBaseVal = next.baseAttributes[cmd.stat] ?? 0;
          next.baseAttributes[cmd.stat] = Math.max(0, Math.min(100, oldBaseVal + cmd.delta));
        }
        changesLog.push(
          ` 属性变动 [${cmd.stat}]: ${cmd.delta >= 0 ? '+' : ''}${cmd.delta} (${oldVal} -> ${next.attributes[cmd.stat]})`
        );
        break;
      }

      case 'MODIFY_PRESTIGE': {
        const prestigeDelta = applyPositiveMultiplier(cmd.delta, traitEffects.multipliers.prestigeGain);
        next.prestige = Math.max(0, next.prestige + prestigeDelta);
        changesLog.push(` 领主威仪: ${prestigeDelta >= 0 ? '+' : ''}${prestigeDelta} (当前 ${next.prestige})`);
        break;
      }

      case 'MODIFY_DREAD': {
        const dreadDelta = applyPositiveMultiplier(cmd.delta, traitEffects.multipliers.dreadGain);
        next.dread = Math.max(0, next.dread + dreadDelta);
        changesLog.push(` 战场恶名: ${dreadDelta >= 0 ? '+' : ''}${dreadDelta} (当前 ${next.dread})`);
        break;
      }

      case 'ADD_TRAIT': {
        if (!next.traits.includes(cmd.trait)) {
          next.traits.push(stripEmoji(cmd.trait));
          changesLog.push(` 获得特质: 【${cmd.trait}】`);
        }
        break;
      }

      case 'CHANGE_LOCATION': {
        next.location = createWorldLocationRef(cmd.locationId, cmd.sceneLocation ? stripEmoji(cmd.sceneLocation) : undefined);
        next.locationLabel = fallbackLocationLabel(next.location);
        changesLog.push(` 抵达地点: 【${next.locationLabel}】`);
        break;
      }

      case 'CHANGE_TITLE': {
        next.title = stripEmoji(cmd.title);
        changesLog.push(` 获得新头衔: 【${cmd.title}】`);
        break;
      }
    }
  }

  next.overallStatus = evaluateOverallStatus(next);
  if (next.overallStatus === '阵亡') {
    isFatalDeath = true;
  }

  return { updatedLord: next, changesLog: changesLog.map(stripEmoji), isFatalDeath };
}

const CHARACTER_COMMAND_TYPES = new Set<string>([
  'SET_CHARACTER_RELATIONSHIP', 'ADD_CHARACTER_TRAIT', 'REMOVE_CHARACTER_TRAIT', 'MOVE_CHARACTER',
  'INJURE_CHARACTER', 'HEAL_CHARACTER', 'KILL_CHARACTER', 'MARRY_CHARACTERS', 'DIVORCE_CHARACTERS',
  'ADD_CHARACTER_MEMORY', 'GRANT_CHARACTER_TITLE', 'REVOKE_CHARACTER_TITLE',
  'CHARACTER_ITEM_ACQUIRE', 'CHARACTER_ITEM_EQUIP', 'CHARACTER_ITEM_UNEQUIP',
  'CHARACTER_ITEM_TRANSFER', 'CHARACTER_ITEM_LOSE',
]);

export function isCharacterStateCommand(command: StateCommand): command is CharacterStateCommand {
  return CHARACTER_COMMAND_TYPES.has(command.type);
}

export interface CharacterCommandBatchBaseContext {
  characters: readonly CharacterState[];
  currentLocationId?: string;
  presentCharacterIds?: ReadonlySet<CharacterId> | readonly CharacterId[];
  knownLocationIds?: ReadonlySet<string> | readonly string[];
  eventHistory?: readonly { characterId: CharacterId; event: { type: string } }[];
}

export interface CharacterCommandBatchResult {
  events: ValidatedCharacterEventInput[];
  rejected: Array<{ command: CharacterStateCommand; reason: string; commandSequence: number }>;
  context: CharacterCommandBatchBaseContext;
}

function applyEventToCharacter(character: CharacterState, event: CharacterEvent): CharacterState {
  switch (event.type) {
    case 'MOVE': return { ...character, locationId: event.locationId, sceneLocation: event.sceneLocation };
    case 'DIE': return { ...character, alive: false, deathReason: event.cause };
    case 'ADD_TRAIT': return { ...character, traits: [...new Set([...(character.traits ?? []), event.traitId])] };
    case 'REMOVE_TRAIT': return { ...character, traits: (character.traits ?? []).filter((id) => id !== event.traitId) };
    case 'MARRY': return { ...character, spouseIds: [...new Set([...(character.spouseIds ?? []), event.spouseId])] };
    case 'DIVORCE': return { ...character, spouseIds: (character.spouseIds ?? []).filter((id) => id !== event.spouseId) };
    case 'GRANT_TITLE': return { ...character, titles: [...new Set([...(character.titles ?? character.titleIds ?? []), event.titleId])] };
    case 'REVOKE_TITLE': return { ...character, titles: (character.titles ?? character.titleIds ?? []).filter((id) => id !== event.titleId) };
    case 'INJURE': return { ...character, wounds: [...new Set([...(character.wounds ?? []), event.woundText])] };
    case 'HEAL': return { ...character, wounds: event.zone === 'all' && !event.clearWound ? [] : (character.wounds ?? []).filter((wound) => wound !== event.clearWound) };
    case 'SET_RELATIONSHIP': {
      const relationships = [...(character.relationships ?? [])];
      const index = relationships.findIndex((value) => value.targetId === event.relationship.targetId);
      if (index < 0) relationships.push(event.relationship);
      else relationships[index] = event.relationship;
      return { ...character, relationships };
    }
    case 'ADD_MEMORY': return character;
    case 'ITEM_ACQUIRE':
    case 'ITEM_TRANSFER_IN': {
      const items = [...(character.items ?? []).filter((item) => item.instanceId !== event.item.instanceId), structuredClone(event.item)];
      return { ...character, items };
    }
    case 'ITEM_EQUIP': return {
      ...character,
      items: (character.items ?? []).map((item) => item.instanceId === event.instanceId
        ? { ...item, equippedPosition: { ...event.position } }
        : item),
    };
    case 'ITEM_UNEQUIP': return {
      ...character,
      items: (character.items ?? []).map((item) => {
        if (item.instanceId !== event.instanceId) return item;
        const { equippedPosition: _equippedPosition, ...unequipped } = item;
        return unequipped;
      }),
    };
    case 'ITEM_TRANSFER_OUT':
    case 'ITEM_LOSE': return { ...character, items: (character.items ?? []).filter((item) => item.instanceId !== event.instanceId) };
  }
}

export function validateCharacterCommandBatch(
  commands: readonly StateCommand[],
  base: CharacterCommandBatchBaseContext | undefined,
  currentTurn: number,
): CharacterCommandBatchResult {
  const characterEntries = commands
    .map((command, commandSequence) => ({ command, commandSequence }))
    .filter((entry): entry is { command: CharacterStateCommand; commandSequence: number } => isCharacterStateCommand(entry.command));
  if (!characterEntries.length) return { events: [], rejected: [], context: base ?? { characters: [] } };
  if (!base) {
    return {
      events: [],
      rejected: characterEntries.map(({ command, commandSequence }) => ({ command, commandSequence, reason: '缺少当前场景人物上下文，人物命令未执行' })),
      context: { characters: [] },
    };
  }

  let characters: CharacterState[] = base.characters.map((character) => ({
    ...character,
    items: character.items?.map((item) => structuredClone(item)),
  }));
  let eventHistory = [...(base.eventHistory ?? [])];
  let present = base.presentCharacterIds ? new Set(base.presentCharacterIds) : undefined;
  const events: ValidatedCharacterEventInput[] = [];
  const rejected: CharacterCommandBatchResult['rejected'] = [];

  for (const { command, commandSequence } of characterEntries) {
    const result = validateCharacterCommand(command, {
      ...base,
      characters,
      presentCharacterIds: present,
      eventHistory,
      currentTurn,
      commandSequence,
    } satisfies CharacterCommandContext);
    if (!result.ok) {
      rejected.push({ command, commandSequence, reason: result.reason });
      continue;
    }
    for (const input of result.events) {
      const index = characters.findIndex((character) => character.id === input.characterId);
      if (index >= 0) characters[index] = applyEventToCharacter(characters[index], input.event);
      eventHistory.push({ characterId: input.characterId, event: input.event });
      if (present && input.event.type === 'MOVE' && base.currentLocationId && input.event.locationId !== base.currentLocationId) {
        present.delete(input.characterId);
      }
    }
    events.push(...result.events);
  }

  return {
    events,
    rejected,
    context: { ...base, characters, eventHistory, presentCharacterIds: present },
  };
}
