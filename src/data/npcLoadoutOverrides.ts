import type { CharacterId } from '../features/characters/types';

export interface NpcLoadoutOverride {
  id: string;
  templateId: string;
}

export const NPC_LOADOUT_OVERRIDES: Partial<Record<CharacterId, NpcLoadoutOverride>> = {
  'agot:Stark_3': { id: 'eddard_stark_daily', templateId: 'northern_noble' },
  'agot:Tully_4': { id: 'catelyn_stark_daily', templateId: 'northern_noble' },
};
