import { HOUSES } from '../../data/houses.ts'
import type { CharacterId } from '../characters/types'
import {
  compareWorldDates,
  type PoliticalWorldTransition,
  type WorldDate,
  type WorldHistoryState,
} from '../world/worldHistory.ts'

export interface StaticPoliticalTitle {
  baronyId: string
  countyId?: string
  duchyId?: string
  kingdomId?: string
  provinceId: number
}

export interface PoliticalCharacter {
  id: CharacterId
  name?: string
  dynastyId?: string | null
  houseId?: string | null
  houseColor?: string
  houseSigil?: string
  titleIds?: readonly string[]
  alive?: boolean
}

export interface PoliticalFeatureState {
  titleId: string
  provinceId: number
  effectiveTitleId?: string
  holderId?: CharacterId
  holderName?: string
  dynastyId?: string
  houseId?: string
  color: string
  sigil?: string
}

type PoliticalCharacterCollection =
  | readonly PoliticalCharacter[]
  | ReadonlyMap<string, PoliticalCharacter>
  | Readonly<Record<string, PoliticalCharacter>>

interface DatedPoliticalTransition {
  date: WorldDate
  eventId: string
  transition:
    | PoliticalWorldTransition
    | { type: 'death'; holderId: CharacterId }
}

const MAJOR_HOUSE_COLORS: Record<string, string> = {
  stark: '#6f7f75',
  lannister: '#9b624f',
  targaryen: '#80545c',
  baratheon: '#8f7b51',
  tyrell: '#66845b',
  martell: '#a77a53',
  arryn: '#788895',
  greyjoy: '#52686d',
  tully: '#547682',
}

const HOUSE_BY_ID = new Map(HOUSES.map((house) => [house.id, house]))

function characterList(characters: PoliticalCharacterCollection): PoliticalCharacter[] {
  if (Array.isArray(characters)) return [...characters]
  if (characters instanceof Map) return [...characters.values()]
  return Object.values(characters)
}

function characterIndex(characters: PoliticalCharacterCollection): Map<CharacterId, PoliticalCharacter> {
  return new Map(characterList(characters).map((character) => [character.id, character]))
}

function normalizeHouseId(character: PoliticalCharacter | undefined): string | undefined {
  if (!character) return undefined
  const explicit = character.houseId?.trim().toLowerCase()
  if (explicit) return explicit
  const dynasty = character.dynastyId?.replace(/^dynn_/i, '').trim().toLowerCase()
  if (!dynasty) return undefined
  const exact = HOUSES.find((house) => house.id === dynasty)
  if (exact) return exact.id
  const contained = HOUSES.find((house) => dynasty.includes(house.id))
  return contained?.id ?? dynasty
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const section = hue / 60
  const intermediate = chroma * (1 - Math.abs(section % 2 - 1))
  const [red, green, blue] = section < 1 ? [chroma, intermediate, 0]
    : section < 2 ? [intermediate, chroma, 0]
      : section < 3 ? [0, chroma, intermediate]
        : section < 4 ? [0, intermediate, chroma]
          : section < 5 ? [intermediate, 0, chroma]
            : [chroma, 0, intermediate]
  const match = lightness - chroma / 2
  return `#${[red, green, blue].map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0')).join('')}`
}

function deterministicPoliticalColor(identity: string): string {
  const hash = hashString(identity)
  const hue = hash % 360
  const saturation = 0.24 + ((hash >>> 9) % 9) / 100
  const lightness = 0.4 + ((hash >>> 17) % 9) / 100
  return hslToHex(hue, saturation, lightness)
}

function holderStyle(holder: PoliticalCharacter | undefined, holderId: CharacterId | undefined): Pick<PoliticalFeatureState, 'holderName' | 'dynastyId' | 'houseId' | 'color' | 'sigil'> {
  if (!holderId) return { color: '#555952' }
  const houseId = normalizeHouseId(holder)
  const localHouse = houseId ? HOUSE_BY_ID.get(houseId) : undefined
  return {
    ...(holder?.name ? { holderName: holder.name } : {}),
    ...(holder?.dynastyId ? { dynastyId: holder.dynastyId } : {}),
    ...(houseId ? { houseId } : {}),
    color: holder?.houseColor
      ?? (houseId ? MAJOR_HOUSE_COLORS[houseId] : undefined)
      ?? deterministicPoliticalColor(houseId ?? holderId),
    ...(holder?.houseSigil
      ? { sigil: holder.houseSigil }
      : localHouse ? { sigil: localHouse.sigil } : {}),
  }
}

function baselineHolders(characters: readonly PoliticalCharacter[]): Map<string, CharacterId> {
  const holders = new Map<string, CharacterId>()
  for (const character of [...characters].sort((left, right) => left.id.localeCompare(right.id))) {
    for (const titleId of [...(character.titleIds ?? [])].sort()) {
      if (!holders.has(titleId)) holders.set(titleId, character.id)
    }
  }
  return holders
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  return typeof record[field] === 'string' && record[field] ? record[field] as string : undefined
}

function characterIdField(record: Record<string, unknown>, field: string): CharacterId | undefined {
  const value = stringField(record, field)
  return value?.startsWith('agot:') || value?.startsWith('save:') ? value as CharacterId : undefined
}

function commandTransition(command: unknown): DatedPoliticalTransition['transition'] | null {
  if (!command || typeof command !== 'object') return null
  const record = command as Record<string, unknown>
  const type = stringField(record, 'type')
  const holderId = characterIdField(record, 'characterId') ?? characterIdField(record, 'holderId')
  const titleId = stringField(record, 'titleId')
  if ((type === 'GRANT_CHARACTER_TITLE' || type === 'GRANT_TITLE') && holderId && titleId) {
    return { type: 'grant-title', titleId, holderId, visibility: 'public' }
  }
  if ((type === 'REVOKE_CHARACTER_TITLE' || type === 'REVOKE_TITLE') && titleId) {
    return { type: 'revoke-title', titleId, ...(holderId ? { holderId } : {}), visibility: 'public' }
  }
  if ((type === 'CHARACTER_DIE' || type === 'DIE') && holderId) return { type: 'death', holderId }
  if (type === 'INHERIT_TITLE' && holderId && titleId) {
    return { type: 'inherit-title', titleId, holderId, visibility: 'public' }
  }
  if ((type === 'WAR_TITLE_RESULT' || type === 'WAR_RESULT') && holderId && titleId) {
    return { type: 'war-result', titleId, holderId, formal: record.formal === true, visibility: 'public' }
  }
  return null
}

function datedTransitions(history: WorldHistoryState): DatedPoliticalTransition[] {
  const transitions: DatedPoliticalTransition[] = []
  for (const turn of history.turns) {
    for (const [index, command] of turn.acceptedCommands.entries()) {
      const transition = commandTransition(command)
      if (!transition) continue
      const commandRecord = command as unknown as Record<string, unknown>
      transitions.push({
        date: turn.resolvedOn,
        eventId: stringField(commandRecord, 'commandId') ?? `${turn.turn}:command:${index.toString().padStart(4, '0')}`,
        transition,
      })
    }
    for (const fact of turn.facts) {
      if (!fact.political) continue
      transitions.push({ date: fact.date, eventId: fact.id, transition: fact.political })
    }
  }
  return transitions.sort((left, right) => compareWorldDates(left.date, right.date) || left.eventId.localeCompare(right.eventId))
}

function applyTransition(holders: Map<string, CharacterId>, transition: DatedPoliticalTransition['transition']): void {
  if (transition.type === 'death') {
    for (const [titleId, holderId] of holders) {
      if (holderId === transition.holderId) holders.delete(titleId)
    }
    return
  }
  if (transition.visibility === 'secret') return
  if (transition.type === 'war-result' && !transition.formal) return
  if (transition.type === 'revoke-title') {
    if (!transition.holderId || holders.get(transition.titleId) === transition.holderId) holders.delete(transition.titleId)
    return
  }
  holders.set(transition.titleId, transition.holderId)
}

function hierarchy(title: StaticPoliticalTitle): string[] {
  return [title.baronyId, title.countyId, title.duchyId, title.kingdomId]
    .filter((id): id is string => Boolean(id))
}

export function projectPoliticalState(
  staticTitles: readonly StaticPoliticalTitle[],
  characters: PoliticalCharacterCollection,
  history: WorldHistoryState,
  atDate: WorldDate,
): PoliticalFeatureState[] {
  const characterValues = characterList(characters)
  const charactersById = characterIndex(characters)
  const holders = baselineHolders(characterValues)
  for (const event of datedTransitions(history)) {
    if (compareWorldDates(event.date, atDate) > 0) break
    applyTransition(holders, event.transition)
  }

  return [...staticTitles]
    .sort((left, right) => left.baronyId.localeCompare(right.baronyId))
    .map((title) => {
      const effectiveTitleId = hierarchy(title).find((titleId) => holders.has(titleId))
      const holderId = effectiveTitleId ? holders.get(effectiveTitleId) : undefined
      const holder = holderId ? charactersById.get(holderId) : undefined
      return {
        titleId: title.baronyId,
        provinceId: title.provinceId,
        ...(effectiveTitleId ? { effectiveTitleId } : {}),
        ...(holderId ? { holderId } : {}),
        ...holderStyle(holder, holderId),
      }
    })
}

function stateFingerprint(state: PoliticalFeatureState | undefined): string {
  if (!state) return ''
  return [
    state.provinceId,
    state.effectiveTitleId ?? '',
    state.holderId ?? '',
    state.dynastyId ?? '',
    state.houseId ?? '',
    state.color,
    state.sigil ?? '',
  ].join('|')
}

export function changedTitleIds(
  previous: readonly PoliticalFeatureState[],
  next: readonly PoliticalFeatureState[],
): string[] {
  const previousById = new Map(previous.map((state) => [state.titleId, state]))
  const nextById = new Map(next.map((state) => [state.titleId, state]))
  return [...new Set([...previousById.keys(), ...nextById.keys()])]
    .filter((titleId) => stateFingerprint(previousById.get(titleId)) !== stateFingerprint(nextById.get(titleId)))
    .sort()
}
