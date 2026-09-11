import { LordProfile, StateCommand, BodyZoneKey, WoundLevel } from '../types/game';
import { stripEmoji } from './textSanitizer';
import { normalizeCk3Attributes } from '../data/ck3Skills';
import { calculateFinalAttributes, CHARACTER_TRAITS, isDerivedInjuryTraitId } from '../data/characterTraits';
import type { CharacterEvent, CharacterId, CharacterRelationship } from '../features/characters/types';
import type { CharacterCommandContext, CharacterState, CharacterStateCommand, ValidatedCharacterEventInput } from '../features/characters/characterCommands';
import type { RoleplayState } from '../features/roleplay/types';
import { validateCharacterCommand } from '../features/characters/characterCommandValidator';
import { applyItemActions, validateItemAction, type ItemActionContext } from '../features/items/actions';
import { ITEM_CATALOG } from '../data/itemDefinitions';
import { getItemDefinition } from '../features/items/catalog';
import { createItemInstance } from '../features/items/state';
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
  void random;
  const next: LordProfile = JSON.parse(JSON.stringify(lord));
  next.attributes = normalizeCk3Attributes(next.attributes);
  const changesLog: string[] = [];
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
          const itemContext = createItemActionContext(next);
          if (cmd.level === 'heavy' || cmd.level === 'critical') {
            const damageAmount = cmd.level === 'critical' ? 25 : 15;
            for (const instanceId of new Set(matchingArmor.map((entry) => entry.instanceId))) {
              const instance = next.items.instances[instanceId];
              if (instance) {
                instance.durability = Math.max(0, instance.durability - damageAmount);
                instance.history.push({
                  id: `${instanceId}:damaged:${instance.history.length}`,
                  type: 'damaged',
                  date: itemContext.gameDate,
                  summary: `因承受【${cmd.level}】冲击而受损`,
                  actorId: itemContext.actorId,
                });
              }
            }
          }
          changesLog.push(` 护甲减伤: ${armorNames.join('、') || '当前防护'}将伤势由【${cmd.level}】减轻为【${effectiveLevel}】`);
        }

        const previousLevel = zone.level;
        const resolvedLevel = levels[Math.max(levels.indexOf(previousLevel), levels.indexOf(effectiveLevel))];
        zone.level = resolvedLevel;
        if (effectiveLevel !== 'intact' && cmd.woundText && !zone.wounds.includes(cmd.woundText)) {
          zone.wounds.push(stripEmoji(cmd.woundText));
        }

        const levelNames: Record<WoundLevel, string> = {
          intact: '完好', minor: '轻创擦伤', heavy: '严重创伤', critical: '残废致命',
        };
        changesLog.push(` 部位受创: [${zone.name}] 伤情变为【${levelNames[resolvedLevel]}】${effectiveLevel !== 'intact' && cmd.woundText ? ` · ${cmd.woundText}` : ''}`);

        if (zone.isFatalZone && previousLevel !== 'critical' && resolvedLevel === 'critical') {
          isFatalDeath = true;
          changesLog.push(` 致命重创! [${zone.name}] 遭受致命打击，领主阵亡！`);
        }
        break;
      }

      //  伤口包扎治疗
      case 'HEAL_ZONE': {
        changesLog.push(' 治疗未执行: 必须使用 TREAT_WOUND 并消耗当前可访问的医疗或补给物品');
        break;
      }

      case 'TREAT_WOUND': {
        const instance = next.items.instances[cmd.instanceId];
        if (!instance) {
          changesLog.push(` 治疗未执行: 医疗物品不存在【${cmd.instanceId}】`);
          break;
        }
        const definition = getItemDefinition(ITEM_CATALOG, instance.definitionId);
        if (definition.category !== 'medicine') {
          changesLog.push(` 治疗未执行: 【${definition.name}】不是医疗物品`);
          break;
        }
        const tags = new Set(definition.tags);
        const zone = cmd.zone ? next.body[cmd.zone] : undefined;
        const canTreatWound = Boolean(zone && zone.level !== 'intact' && (tags.has('bandage') || tags.has('injury')));
        const canClearCondition = cmd.clearCondition === 'bleeding'
          ? next.body.isBleeding && (tags.has('bleeding') || tags.has('bandage'))
          : cmd.clearCondition === 'poisoned'
            ? next.body.isPoisoned && (tags.has('antidote') || tags.has('poison'))
            : cmd.clearCondition === 'infected'
              ? next.body.isInfected && tags.has('infection')
              : false;
        if (!canTreatWound && !canClearCondition) {
          changesLog.push(` 治疗未执行: 【${definition.name}】与当前指定伤势或异常状态不匹配`);
          break;
        }
        const treatment = applyItemActions(
          next.items,
          [{ kind: 'use', instanceId: cmd.instanceId, quantity: 1 }],
          createItemActionContext(next),
          ITEM_CATALOG,
        );
        if (!treatment.ok) {
          changesLog.push(` 治疗未执行: ${treatment.error}`);
          break;
        }
        next.items = treatment.state;
        const levels: WoundLevel[] = ['intact', 'minor', 'heavy', 'critical'];
        if (canTreatWound && zone) {
          const currentIndex = levels.indexOf(zone.level);
          zone.level = levels[Math.max(0, currentIndex - 1)];
          if (cmd.clearWound) zone.wounds = zone.wounds.filter((wound) => wound !== cmd.clearWound);
        }
        if (cmd.clearCondition === 'bleeding') next.body.isBleeding = false;
        if (cmd.clearCondition === 'poisoned') next.body.isPoisoned = false;
        if (cmd.clearCondition === 'infected') next.body.isInfected = false;
        changesLog.push(` 使用【${definition.name}】完成治疗${canTreatWound && zone ? `，[${zone.name}]伤势缓解一级` : ''}${canClearCondition ? `，${cmd.clearCondition === 'bleeding' ? '失血得到控制' : cmd.clearCondition === 'poisoned' ? '毒性得到处理' : '感染得到处理'}` : ''}`);
        break;
      }

      case 'REPAIR_ITEM': {
        const target = next.items.instances[cmd.instanceId];
        const tool = next.items.instances[cmd.toolInstanceId];
        if (!target || !tool) {
          changesLog.push(' 修理未执行: 目标物品或维护工具不存在');
          break;
        }
        const targetDefinition = getItemDefinition(ITEM_CATALOG, target.definitionId);
        const toolDefinition = getItemDefinition(ITEM_CATALOG, tool.definitionId);
        const validTool = toolDefinition.category === 'tool'
          && toolDefinition.tags.some((tag) => ['repair', 'maintenance', 'smithing', 'sewing'].includes(tag));
        if (!validTool) {
          changesLog.push(` 修理未执行: 【${toolDefinition.name}】不是维护工具`);
          break;
        }
        if (!Number.isInteger(cmd.amount) || cmd.amount < 1 || cmd.amount > 40
          || !Number.isInteger(cmd.silverCost) || cmd.silverCost < 1
          || !Number.isInteger(cmd.days) || cmd.days < 1 || cmd.days > 30) {
          changesLog.push(' 修理未执行: 修理量、费用或耗时不合法');
          break;
        }
        if (next.silverStags < cmd.silverCost) {
          changesLog.push(` 修理未执行: 需要 ${cmd.silverCost} 银鹿，当前只有 ${next.silverStags}`);
          break;
        }
        const itemContext = createItemActionContext(next);
        try {
          validateItemAction(next.items, { kind: 'use', instanceId: cmd.toolInstanceId, quantity: 1 }, itemContext, ITEM_CATALOG);
        } catch (error) {
          changesLog.push(` 修理未执行: ${error instanceof Error ? error.message : '维护工具当前不可用'}`);
          break;
        }
        const repaired = applyItemActions(next.items, [{ kind: 'repair', instanceId: cmd.instanceId, amount: cmd.amount }], itemContext, ITEM_CATALOG);
        if (!repaired.ok) {
          changesLog.push(` 修理未执行: ${repaired.error}`);
          break;
        }
        next.items = repaired.state;
        next.silverStags -= cmd.silverCost;
        changesLog.push(` 使用【${toolDefinition.name}】维护【${targetDefinition.name}】，支付 ${cmd.silverCost} 银鹿，耗时 ${cmd.days} 天`);
        break;
      }

      case 'BUY_CATALOG_ITEM': {
        let definition;
        try { definition = getItemDefinition(ITEM_CATALOG, cmd.definitionId); }
        catch { changesLog.push(' 交易未执行: 商品定义不存在'); break; }
        if (definition.unique) {
          changesLog.push(' 交易未执行: 唯一物品不能通过普通商品交易创建');
          break;
        }
        if (!Number.isInteger(cmd.silverCost) || cmd.silverCost < 1 || next.silverStags < cmd.silverCost) {
          changesLog.push(` 交易未执行: 银鹿不足或价格不合法（需要 ${cmd.silverCost}）`);
          break;
        }
        if (!cmd.instanceId.trim() || next.items.instances[cmd.instanceId]) {
          changesLog.push(' 交易未执行: 商品实例 ID 为空或已经存在');
          break;
        }
        const acquired = applyItemActions(next.items, [{
          kind: 'acquire',
          instance: createItemInstance(ITEM_CATALOG, cmd.definitionId, cmd.instanceId),
          placement: cmd.placement,
          historyType: 'acquired',
        }], createItemActionContext(next), ITEM_CATALOG);
        if (!acquired.ok) {
          changesLog.push(` 交易未执行: ${acquired.error}`);
          break;
        }
        next.items = acquired.state;
        next.silverStags -= cmd.silverCost;
        changesLog.push(` 向${cmd.sellerId}购买【${definition.name}】，支付 ${cmd.silverCost} 银鹿`);
        break;
      }

      case 'SELL_ITEM': {
        const instance = next.items.instances[cmd.instanceId];
        if (!instance || !Number.isInteger(cmd.silverPrice) || cmd.silverPrice < 1) {
          changesLog.push(' 交易未执行: 出售物品不存在或价格不合法');
          break;
        }
        if (next.items.placements[cmd.instanceId]?.type === 'equipped') {
          changesLog.push(' 交易未执行: 必须先明确卸下装备及其去向');
          break;
        }
        const definition = getItemDefinition(ITEM_CATALOG, instance.definitionId);
        const sold = applyItemActions(next.items, [{ kind: 'gift', instanceId: cmd.instanceId, recipientId: cmd.buyerId }], createItemActionContext(next), ITEM_CATALOG);
        if (!sold.ok) {
          changesLog.push(` 交易未执行: ${sold.error}`);
          break;
        }
        next.items = sold.state;
        next.silverStags += cmd.silverPrice;
        changesLog.push(` 将【${definition.name}】售予${cmd.buyerId}，收入 ${cmd.silverPrice} 银鹿`);
        break;
      }

      //  异常体态 (失血/剧毒/感染)
      case 'SET_BLEEDING': {
        if (!cmd.value) {
          changesLog.push(' 止血未执行: 必须通过 TREAT_WOUND 消耗医疗或补给物品');
          break;
        }
        next.body.isBleeding = cmd.value;
        changesLog.push(cmd.value ? ' 持续失血: 伤口正在渗血' : ' 伤口止血: 渗血已止住');
        break;
      }

      case 'SET_POISONED': {
        if (!cmd.value) {
          changesLog.push(' 解毒未执行: 必须通过 TREAT_WOUND 消耗医疗或补给物品');
          break;
        }
        next.body.isPoisoned = cmd.value;
        changesLog.push(cmd.value ? ' 异状入侵: 身中剧毒侵蚀！' : ' 毒素清除: 毒性已解');
        break;
      }

      case 'SET_INFECTED': {
        if (!cmd.value) {
          changesLog.push(' 感染治疗未执行: 必须通过 TREAT_WOUND 消耗医疗或补给物品');
          break;
        }
        next.body.isInfected = cmd.value;
        changesLog.push(cmd.value ? ' 伤口发炎: 创口发炎并伴随高热' : ' 高热退去: 伤口炎症消退');
        break;
      }

      //  金币收支（余额不足时拒绝支出，不透支）
      case 'MODIFY_GOLD': {
        const reason = cmd.reason ? `（${cmd.reason}）` : '';
        if (cmd.goldDragons !== undefined) {
          const goldDelta = Math.round(cmd.goldDragons);
          if (goldDelta < 0 && next.goldDragons + goldDelta < 0) {
            changesLog.push(` 金龙不足，支出未执行: 需 ${Math.abs(goldDelta)}，仅有 ${next.goldDragons}${reason}`);
          } else {
            next.goldDragons = Math.max(0, next.goldDragons + goldDelta);
            changesLog.push(
              goldDelta >= 0 ? ` 获得金龙: +${goldDelta}${reason}` : ` 支出金龙: ${goldDelta}${reason}`
            );
          }
        }
        if (cmd.silverStags !== undefined) {
          const silverDelta = Math.round(cmd.silverStags);
          if (silverDelta < 0 && next.silverStags + silverDelta < 0) {
            changesLog.push(` 银鹿不足，支出未执行: 需 ${Math.abs(silverDelta)}，仅有 ${next.silverStags}${reason}`);
          } else {
            next.silverStags = Math.max(0, next.silverStags + silverDelta);
            changesLog.push(
              silverDelta >= 0 ? ` 获得银鹿: +${silverDelta}${reason}` : ` 支出银鹿: ${silverDelta}${reason}`
            );
          }
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


      case 'ADD_TRAIT': {
        const trait = CHARACTER_TRAITS.find((entry) => entry.id === cmd.trait);
        if (!trait) {
          changesLog.push(` 特质未添加: 未知特质 ID【${cmd.trait}】`);
          break;
        }
        if (isDerivedInjuryTraitId(trait.id)) {
          changesLog.push(` 特质未添加: 【${trait.name}】由身体伤势系统自动派生，请使用 APPLY_HIT 记录具体伤势`);
          break;
        }
        if ((next.traitIds ?? []).includes(trait.id)) break;
        next.traitIds = [...(next.traitIds ?? []), trait.id];
        next.traits = [...new Set([...(next.traits ?? []), trait.name])];
        if (next.baseAttributes) next.attributes = calculateFinalAttributes(next.baseAttributes, next.traitIds);
        else {
          for (const [key, value] of Object.entries(trait.modifiers)) {
            const attribute = key as keyof typeof next.attributes;
            next.attributes[attribute] = Math.max(0, Math.min(100, next.attributes[attribute] + (value ?? 0)));
          }
        }
        changesLog.push(` 获得特质: 【${trait.name}】`);
        break;
      }

      case 'CHANGE_LOCATION': {
        next.location = createWorldLocationRef(cmd.locationId, cmd.sceneLocation ? stripEmoji(cmd.sceneLocation) : undefined);
        next.locationLabel = fallbackLocationLabel(next.location);
        changesLog.push(` 抵达地点: 【${next.locationLabel}】`);
        break;
      }

      case 'CHANGE_TITLE': {
        changesLog.push(' 头衔未变更: 必须通过受权的世界头衔事务结算');
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
  roleplay?: RoleplayState;
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
  const memorySubjects = new Set<CharacterId>();

  for (const { command, commandSequence } of characterEntries) {
    if (command.type === 'ADD_CHARACTER_MEMORY' && memorySubjects.has(command.characterId)) {
      rejected.push({ command, commandSequence, reason: '同一人物每回合最多新增一条记忆' });
      continue;
    }
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
    if (command.type === 'ADD_CHARACTER_MEMORY') memorySubjects.add(command.characterId);
    events.push(...result.events);
  }

  return {
    events,
    rejected,
    context: { ...base, characters, eventHistory, presentCharacterIds: present },
  };
}
