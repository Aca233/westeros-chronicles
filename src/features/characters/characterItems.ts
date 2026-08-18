import { NPC_LOADOUT_TEMPLATES } from '../../data/npcLoadoutTemplates';
import type { CharacterEventEnvelope } from './characterEventStore';
import type {
  CharacterItemRecord,
  StaticCharacterLoadoutProfile,
  StaticCharacterRecord,
} from './types';

export function expandBaselineLoadout(
  character: StaticCharacterRecord,
  profile: StaticCharacterLoadoutProfile | undefined,
): CharacterItemRecord[] {
  if (!profile) return [];
  const template = NPC_LOADOUT_TEMPLATES[profile.templateId];
  if (!template) throw new Error(`人物装束模板不存在：${profile.templateId}`);
  const source = profile.overrideId ? 'curated_override' as const : 'baseline_template' as const;
  return template.slots.map((slot) => ({
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
