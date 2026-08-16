import type { CharacterId, CharacterSearchHit, StaticCharacterRecord } from './types';

export interface LordRelationshipIdentity {
  name: string;
  house: string;
  houseSigil?: string;
  age?: number;
  currentYear?: number;
}

export interface LordFamilyRecords {
  subject?: StaticCharacterRecord;
  spouse?: StaticCharacterRecord;
  father?: StaticCharacterRecord;
  mother?: StaticCharacterRecord;
}

export interface LordRelationshipRepository {
  search(query: string, filters?: { includeGenealogy?: boolean; limit?: number }): Promise<CharacterSearchHit[]>;
  get(id: CharacterId): Promise<StaticCharacterRecord | undefined>;
  getMany(ids: readonly CharacterId[]): Promise<StaticCharacterRecord[]>;
}

const DYNASTY_HINTS: ReadonlyArray<{ needles: readonly string[]; dynasty: string }> = [
  { needles: ['house-stark', '史塔克', '雪诺', 'stark'], dynasty: 'stark' },
  { needles: ['house-targaryen', '坦格利安', 'targaryen'], dynasty: 'targaryen' },
  { needles: ['house-lannister', '兰尼斯特', 'lannister'], dynasty: 'lannister' },
  { needles: ['house-baratheon', '拜拉席恩', 'baratheon'], dynasty: 'baratheon' },
  { needles: ['house-tyrell', '提利尔', 'tyrell'], dynasty: 'tyrell' },
  { needles: ['house-martell', '马泰尔', 'martell'], dynasty: 'martell' },
  { needles: ['house-arryn', '艾林', 'arryn'], dynasty: 'arryn' },
  { needles: ['house-greyjoy', '葛雷乔伊', 'greyjoy'], dynasty: 'greyjoy' },
  { needles: ['house-tully', '徒利', 'tully'], dynasty: 'tully' },
];

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('zh-CN');
}

function inferDynastyHint(identity: LordRelationshipIdentity): string | null {
  const source = normalize(`${identity.house} ${identity.houseSigil ?? ''}`);
  return DYNASTY_HINTS.find((entry) => entry.needles.some((needle) => source.includes(normalize(needle))))?.dynasty ?? null;
}

function givenName(fullName: string): string {
  return fullName.split(/[·・•\s]/u).map((part) => part.trim()).find(Boolean) ?? fullName.trim();
}

function isNameMatch(fullName: string, hit: CharacterSearchHit): boolean {
  const full = normalize(fullName);
  const first = normalize(givenName(fullName));
  const hitName = normalize(hit.name);
  return hitName === full || hitName === first || (hitName.length >= 2 && full.includes(hitName));
}

function scoreHit(identity: LordRelationshipIdentity, hit: CharacterSearchHit, dynastyHint: string | null): number {
  if (!isNameMatch(identity.name, hit)) return Number.NEGATIVE_INFINITY;
  let score = 100;
  const hitDynasty = normalize(hit.dynastyId);
  if (dynastyHint && hitDynasty.includes(dynastyHint)) score += 180;
  if (hit.alive) score += 35;
  if (hit.canonTier === 'canon') score += 25;
  else if (hit.canonTier === 'semicanon') score += 12;
  else if (hit.canonTier === 'genealogy') score -= 80;

  if (Number.isFinite(identity.age) && Number.isFinite(identity.currentYear) && Number.isFinite(hit.birthYear)) {
    const expectedBirthYear = Number(identity.currentYear) - Number(identity.age);
    const difference = Math.abs(Number(hit.birthYear) - expectedBirthYear);
    score += Math.max(-40, 50 - difference * 3);
  }
  return score;
}

/**
 * 将当前领主与稳定 AGOT 人物 ID 对齐，仅返回数据集中能够证明的配偶与父母。
 * 继承人、领主和重要关系需要独立规则来源，不能在此猜测。
 */
export async function resolveLordFamilyRecords(
  identity: LordRelationshipIdentity,
  repository: LordRelationshipRepository,
): Promise<LordFamilyRecords> {
  const query = givenName(identity.name);
  if (!query) return {};
  const dynastyHint = inferDynastyHint(identity);
  const hits = await repository.search(query, { includeGenealogy: false, limit: 80 });
  const ranked = hits
    .map((hit) => ({ hit, score: scoreHit(identity, hit, dynastyHint) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score || a.hit.id.localeCompare(b.hit.id));
  const best = ranked[0]?.hit;
  if (!best) return {};
  if (dynastyHint && !normalize(best.dynastyId).includes(dynastyHint)) return {};

  const subject = await repository.get(best.id);
  if (!subject) return {};
  const relativeIds = [...new Set([
    ...(subject.spouseIds ?? []),
    subject.fatherId,
    subject.motherId,
  ].filter((id): id is CharacterId => Boolean(id)))];
  const relatives = new Map((await repository.getMany(relativeIds)).map((record) => [record.id, record]));
  const spouse = (subject.spouseIds ?? [])
    .map((id) => relatives.get(id))
    .filter((record): record is StaticCharacterRecord => Boolean(record))
    .sort((a, b) => Number(b.alive) - Number(a.alive) || a.id.localeCompare(b.id))[0];

  return {
    subject,
    ...(spouse ? { spouse } : {}),
    ...(subject.fatherId && relatives.get(subject.fatherId) ? { father: relatives.get(subject.fatherId) } : {}),
    ...(subject.motherId && relatives.get(subject.motherId) ? { mother: relatives.get(subject.motherId) } : {}),
  };
}
