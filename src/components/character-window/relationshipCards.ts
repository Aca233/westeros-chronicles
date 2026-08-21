import type { NpcCharacterDossier, PlayerCharacterDossier } from '../../features/characters/characterDossier';
import type { LordFamilyRecords } from '../../features/characters/lordRelationshipResolver';
import type { CharacterId, StaticCharacterRecord } from '../../features/characters/types';

export interface RelationshipCard {
  label: string;
  person?: StaticCharacterRecord;
  emptyText?: string;
  group: 'spouse' | 'child' | 'sibling' | 'parent' | 'notable';
}

export function isJonSnow(characterId: CharacterId | undefined): boolean {
  return characterId === 'agot:Stark_7';
}

export function playerRelationshipCards(
  family: LordFamilyRecords,
  dossier?: PlayerCharacterDossier,
  records?: ReadonlyMap<CharacterId, StaticCharacterRecord>,
): RelationshipCard[] {
  const cards: RelationshipCard[] = [];
  const spouses = family.spouses ?? (family.spouse ? [family.spouse] : []);
  if (spouses.length === 0) cards.push({ label: '配偶', group: 'spouse' });
  spouses.forEach((person) => cards.push({ label: '配偶', person, group: 'spouse' }));
  (family.children ?? []).forEach((person) => cards.push({ label: '子女', person, group: 'child' }));
  (family.siblings ?? []).forEach((person) => cards.push({ label: '兄弟姐妹', person, group: 'sibling' }));
  cards.push({ label: '父亲', person: family.father, group: 'parent' });
  cards.push({
    label: '母亲',
    person: family.mother,
    emptyText: isJonSnow(family.subject?.id) ? '当前时间线未公开' : undefined,
    group: 'parent',
  });
  if (dossier?.relations?.notableRelations && dossier.relations.notableRelations.length > 0 && records) {
    dossier.relations.notableRelations.forEach((relation) =>
      cards.push({ label: relationLabel(relation.kind), person: records.get(relation.targetId), emptyText: relation.description, group: 'notable' })
    );
  } else {
    cards.push({ label: '继承人', group: 'notable' });
    cards.push({ label: '领主', group: 'notable' });
    cards.push({ label: '重要关系', group: 'notable' });
  }
  return cards;
}

export function npcRelationshipCards(dossier: NpcCharacterDossier, records: ReadonlyMap<CharacterId, StaticCharacterRecord>): RelationshipCard[] {
  const cards: RelationshipCard[] = [];
  if (dossier.relations.spouseIds.length === 0) cards.push({ label: '配偶', group: 'spouse' });
  dossier.relations.spouseIds.forEach((id) => cards.push({ label: '配偶', person: records.get(id), group: 'spouse' }));
  dossier.relations.childIds.forEach((id) => cards.push({ label: '子女', person: records.get(id), group: 'child' }));
  dossier.relations.siblingIds.forEach((id) => cards.push({ label: '兄弟姐妹', person: records.get(id), group: 'sibling' }));
  cards.push({ label: '父亲', person: dossier.relations.fatherId ? records.get(dossier.relations.fatherId) : undefined, group: 'parent' });
  cards.push({
    label: '母亲',
    person: dossier.relations.motherId ? records.get(dossier.relations.motherId) : undefined,
    emptyText: isJonSnow(dossier.id) ? '当前时间线未公开' : undefined,
    group: 'parent',
  });
  dossier.relations.notableRelations.forEach((relation) =>
    cards.push({ label: relationLabel(relation.kind), person: records.get(relation.targetId), emptyText: relation.description, group: 'notable' })
  );
  const existingIds = new Set(dossier.relations.notableRelations.map((relation) => relation.targetId));
  dossier.relations.relationships
    .filter((relation) => !existingIds.has(relation.targetId))
    .slice(0, 4)
    .forEach((relation) => cards.push({ label: relation.kind ? relationLabel(relation.kind) : '重要关系', person: records.get(relation.targetId), group: 'notable' }));
  return cards;
}

export function relationLabel(kind: string): string {
  const labels: Record<string, string> = { lover: '恋人', friend: '朋友', rival: '仇敌', nemesis: '死敌', guardian: '监护人' };
  return labels[kind] ?? kind.replace(/_/g, ' ');
}
