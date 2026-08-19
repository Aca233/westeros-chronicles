import type { KnowledgeLevel } from './types'

export type RegisteredMapIntelType =
  | 'character-location'
  | 'garrison'
  | 'asset'
  | 'road-closure'
  | 'identity'
  | 'death'
  | 'event'

export interface MapIntelSubject {
  id: string
  type: string
  regionId?: string
  qualitativeDescription?: string
  [field: string]: unknown
}

export interface MapIntelRecord<TSubject extends MapIntelSubject = MapIntelSubject> {
  level: KnowledgeLevel
  learnedAt?: string
  source?: string
  value?: Partial<TSubject>
}

export interface VisibleMapSubject {
  id: string
  type: RegisteredMapIntelType
  intelLevel: Exclude<KnowledgeLevel, 'unknown'>
  learnedAt?: string
  source?: string
  stale?: true
  debug?: true
  regionId?: string
  qualitativeDescription?: string
  [field: string]: unknown
}

const PUBLIC_FIELD_WHITELISTS: Record<RegisteredMapIntelType, readonly string[]> = {
  'character-location': [
    'characterId', 'name', 'locationId', 'sceneLocation', 'regionId', 'qualitativeDescription',
  ],
  garrison: [
    'titleId', 'locationId', 'regionId', 'count', 'quality', 'qualitativeDescription',
  ],
  asset: [
    'assetId', 'name', 'assetType', 'custodianId', 'locationId', 'regionId', 'qualitativeDescription',
  ],
  'road-closure': [
    'edgeId', 'from', 'to', 'locationId', 'regionId', 'closed', 'reason', 'qualitativeDescription',
  ],
  identity: [
    'characterId', 'claimedName', 'trueIdentity', 'regionId', 'qualitativeDescription',
  ],
  death: [
    'characterId', 'name', 'dead', 'date', 'cause', 'regionId', 'qualitativeDescription',
  ],
  event: [
    'eventId', 'locationId', 'regionId', 'title', 'description', 'date', 'qualitativeDescription',
  ],
}

function isRegisteredType(type: string): type is RegisteredMapIntelType {
  return Object.prototype.hasOwnProperty.call(PUBLIC_FIELD_WHITELISTS, type)
}

function isSafePublicValue(value: unknown): boolean {
  if (value === null) return true
  if (['string', 'number', 'boolean'].includes(typeof value)) return true
  return Array.isArray(value) && value.every((entry) => entry === null || ['string', 'number', 'boolean'].includes(typeof entry))
}

function pickPublicFields(
  source: Partial<MapIntelSubject>,
  type: RegisteredMapIntelType,
): Record<string, unknown> {
  return Object.fromEntries(PUBLIC_FIELD_WHITELISTS[type].flatMap((field) => {
    const value = source[field]
    return value === undefined || !isSafePublicValue(value) ? [] : [[field, value]]
  }))
}

function metadata(
  knowledge: MapIntelRecord,
): Pick<VisibleMapSubject, 'learnedAt' | 'source'> {
  return {
    ...(knowledge.learnedAt ? { learnedAt: knowledge.learnedAt } : {}),
    ...(knowledge.source ? { source: knowledge.source } : {}),
  }
}

export function filterMapIntelligence<TSubject extends MapIntelSubject>(
  subject: TSubject,
  knowledge: MapIntelRecord<TSubject>,
  now: string,
  debug: boolean,
): VisibleMapSubject | null {
  if (!subject || typeof subject.id !== 'string' || !isRegisteredType(subject.type)) return null

  const type = subject.type
  if (debug) {
    return {
      ...subject,
      type,
      intelLevel: 'confirmed',
      debug: true,
      ...metadata(knowledge),
    }
  }
  if (knowledge.level === 'unknown') return null

  if (knowledge.level === 'rumored') {
    const snapshot: Partial<MapIntelSubject> = knowledge.value ?? {}
    const regionId = typeof snapshot.regionId === 'string' ? snapshot.regionId : undefined
    const qualitativeDescription = typeof snapshot.qualitativeDescription === 'string'
      ? snapshot.qualitativeDescription
      : undefined
    return {
      id: subject.id,
      type,
      intelLevel: 'rumored',
      ...(regionId ? { regionId } : {}),
      ...(qualitativeDescription ? { qualitativeDescription } : {}),
    }
  }

  if (knowledge.level === 'stale') {
    const snapshot: Partial<MapIntelSubject> = knowledge.value ?? {}
    return {
      id: subject.id,
      type,
      intelLevel: 'stale',
      ...pickPublicFields(snapshot, type),
      ...metadata(knowledge),
      stale: true,
    }
  }

  void now
  return {
    id: subject.id,
    type,
    intelLevel: 'confirmed',
    ...pickPublicFields(subject, type),
    ...metadata(knowledge),
  }
}
