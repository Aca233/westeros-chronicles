import type { CharacterId } from './types';

export interface CharacterExperience {
  id?: string;
  date: string;
  title: string;
  description: string;
  participantIds?: CharacterId[];
  visibility: 'public' | 'secret';
  sourceUrl: string;
}

export interface NotableNonKinRelation {
  targetId: CharacterId;
  kind: string;
  description?: string;
  sourceUrl?: string;
}

export interface CharacterDossierSupplement {
  characterId: CharacterId;
  summary?: string;
  publicRoles?: string[];
  aliases?: string[];
  appearance?: string;
  personality?: string;
  reputation?: string;
  experiences?: CharacterExperience[];
  notableRelations?: NotableNonKinRelation[];
  sourceUrls: string[];
}
