import { NPC_LOADOUT_TEMPLATES } from '../../data/npcLoadoutTemplates';
import { NPC_LOADOUT_OVERRIDES } from '../../data/npcLoadoutOverrides';
import type { EquipmentPosition } from '../items/types';
import type { CharacterEventEnvelope } from './characterEventTypes';
import type {
  CharacterItemRecord,
  StaticCharacterLoadoutProfile,
  StaticCharacterRecord,
} from './types';

function isSamePosition(a: EquipmentPosition, b: EquipmentPosition): boolean {
  if (a.group !== b.group) return false;
  if (a.group === 'torso' && b.group === 'torso') return a.layer === b.layer;
  if (a.group === 'legs' && b.group === 'legs') return a.layer === b.layer;
  if (a.group === 'accessories' && b.group === 'accessories') return a.index === b.index;
  return true;
}

export function expandBaselineLoadout(
  character: StaticCharacterRecord,
  profile: StaticCharacterLoadoutProfile | undefined,
): CharacterItemRecord[] {
  if (!profile) return [];
  const registeredOverride = NPC_LOADOUT_OVERRIDES[character.id];
  const override = profile.overrideId
    ? registeredOverride?.id === profile.overrideId ? registeredOverride : undefined
    : undefined;
  if (profile.overrideId && !override) {
    throw new Error(`人物装束覆盖不存在或不匹配：${character.id}/${profile.overrideId}`);
  }
  const templateId = override?.templateId ?? profile.templateId;
  const template = NPC_LOADOUT_TEMPLATES[templateId];
  if (!template) throw new Error(`人物装束模板不存在：${templateId}`);

  let resolvedSlots = [...template.slots];

  if (override?.clearedPositions && override.clearedPositions.length > 0) {
    resolvedSlots = resolvedSlots.filter(
      (slot) => !override.clearedPositions!.some((pos) => isSamePosition(slot.position, pos)),
    );
  }

  if (override?.slots && override.slots.length > 0) {
    for (const overrideSlot of override.slots) {
      const existingIndex = resolvedSlots.findIndex((s) => isSamePosition(s.position, overrideSlot.position));
      if (existingIndex >= 0) {
        resolvedSlots[existingIndex] = overrideSlot;
      } else {
        resolvedSlots.push(overrideSlot);
      }
    }
  }

  const source = override ? ('curated_override' as const) : ('baseline_template' as const);
  return resolvedSlots.map((slot) => ({
    instanceId: `npc:${character.rawId}:baseline:${slot.id}`,
    definitionId: slot.definitionId,
    ownerId: character.id,
    custody: { type: 'character' as const, characterId: character.id },
    equippedPosition: { ...slot.position },
    source,
  })).sort((left, right) => left.instanceId.localeCompare(right.instanceId));
}


export function projectCharacterItems(
  baseline: readonly CharacterItemRecord[],
  envelopes: readonly CharacterEventEnvelope[],
): CharacterItemRecord[] {
  const items = new Map(baseline.map((item) => [item.instanceId, structuredClone(item)]));
  for (const envelope of [...envelopes].sort((left, right) => left.turn - right.turn || left.sequence - right.sequence)) {
    const event = envelope.event;
    if (event.type === 'ITEM_ACQUIRE' || event.type === 'ITEM_TRANSFER_IN') {
      items.set(event.item.instanceId, structuredClone(event.item));
    } else if (event.type === 'ITEM_EQUIP') {
      const item = items.get(event.instanceId);
      if (item) items.set(event.instanceId, { ...item, equippedPosition: { ...event.position } });
    } else if (event.type === 'ITEM_UNEQUIP') {
      const item = items.get(event.instanceId);
      if (item) {
        const { equippedPosition: _equippedPosition, ...unequipped } = item;
        items.set(event.instanceId, unequipped);
      }
    } else if (event.type === 'ITEM_TRANSFER_OUT' || event.type === 'ITEM_LOSE') {
      items.delete(event.instanceId);
    }
  }
  return [...items.values()].sort((left, right) => left.instanceId.localeCompare(right.instanceId));
}
