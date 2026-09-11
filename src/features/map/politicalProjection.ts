import { HOUSES } from '../../data/houses.ts'
import type { CharacterId } from '../characters/types'
import {
  compareWorldDates,
  type PoliticalWorldTransition,
  type WorldDate,
  type WorldHistoryState,
} from '../world/worldHistory.ts'
import type { SemanticMembership } from './types.ts'
import type { TitleWorldPatch, WorldEvent } from '../world/worldRuntimeTypes.ts'
import { selectVisibleWorldEvents, type WorldEventViewer } from '../world/worldEventVisibility.ts'

export interface StaticPoliticalTitle {
  baronyId: string
  countyId?: string
  duchyId?: string
  kingdomId?: string
  empireId?: string
  hegemonId?: string
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
  /** 男爵领所属王国头衔(k_*),用于王国级点击解析 */
  kingdomId?: string
  effectiveTitleId?: string
  holderId?: CharacterId
  /** 伯爵领主色槽对应的法理持有人，供伯爵领详情使用。 */
  countyHolderId?: CharacterId
  holderName?: string
  dynastyId?: string
  houseId?: string
  houseLabel?: string
  color: string
  sigil?: string
  /** 实际控制者；军事占领不得覆盖法理持有人。 */
  controllerId?: CharacterId
  controllerColor?: string
  isContested: boolean
  contestedByIds: CharacterId[]
  realmTitleId?: string
  realmHolderId?: CharacterId
  realmHouseId?: string
  realmHouseLabel?: string
  realmSigil?: string
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

function holderStyle(holder: PoliticalCharacter | undefined, holderId: CharacterId | undefined): Pick<PoliticalFeatureState, 'holderName' | 'dynastyId' | 'houseId' | 'houseLabel' | 'color' | 'sigil'> {
  if (!holderId) return { color: '#555952' }
  const houseId = normalizeHouseId(holder)
  const localHouse = houseId ? HOUSE_BY_ID.get(houseId) : undefined
  const houseLabel = localHouse && /[\u3400-\u9fff]/u.test(localHouse.name) ? localHouse.name : undefined
  return {
    ...(holder?.name ? { holderName: holder.name } : {}),
    ...(holder?.dynastyId ? { dynastyId: holder.dynastyId } : {}),
    ...(houseId ? { houseId } : {}),
    ...(houseLabel ? { houseLabel } : {}),
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
  if ((type === 'OCCUPY_TITLE' || type === 'OCCUPY_CHARACTER_TITLE') && holderId && titleId) {
    return { type: 'occupy-title', titleId, controllerId: holderId, visibility: 'public' }
  }
  return null
}

function datedTransitions(history: WorldHistoryState, worldEvents: readonly WorldEvent[]): DatedPoliticalTransition[] {
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
  }
  for (const event of worldEvents) {
    const titleId = event.subjectRefs.find((subject) => subject.type === 'title')?.titleId
    const holderId = event.actorIds[0]
      ?? event.subjectRefs.find((subject) => subject.type === 'character')?.characterId
    if (!titleId) continue
    const transition: DatedPoliticalTransition['transition'] | undefined =
      event.type === 'title.inherited' && holderId
        ? { type: 'inherit-title', titleId, holderId, visibility: event.visibility }
        : event.type === 'title.granted' && holderId
          ? { type: 'grant-title', titleId, holderId, visibility: event.visibility }
          : event.type === 'title.revoked'
            ? { type: 'revoke-title', titleId, ...(holderId ? { holderId } : {}), visibility: event.visibility }
            : event.type === 'title.war-result.formal' && holderId
              ? { type: 'war-result', titleId, holderId, formal: true, visibility: event.visibility }
              : event.type === 'title.occupied' && holderId
                ? { type: 'occupy-title', titleId, controllerId: holderId, visibility: event.visibility }
              : undefined
    if (transition) transitions.push({ date: event.date, eventId: event.id, transition })
  }
  return transitions.sort((left, right) => compareWorldDates(left.date, right.date) || left.eventId.localeCompare(right.eventId))
}

function applyTransition(
  holders: Map<string, CharacterId>,
  controllers: Map<string, CharacterId>,
  contestedByTitle: Map<string, CharacterId[]>,
  transition: DatedPoliticalTransition['transition'],
): void {
  if (transition.type === 'death') {
    for (const [titleId, holderId] of holders) {
      if (holderId === transition.holderId) {
        holders.delete(titleId)
        controllers.delete(titleId)
        contestedByTitle.delete(titleId)
      }
    }
    for (const [titleId, controllerId] of controllers) {
      if (controllerId === transition.holderId) controllers.delete(titleId)
    }
    for (const [titleId, ids] of contestedByTitle) {
      const remaining = ids.filter((id) => id !== transition.holderId)
      if (remaining.length) contestedByTitle.set(titleId, remaining)
      else contestedByTitle.delete(titleId)
    }
    return
  }
  if (transition.visibility === 'secret') return
  if (transition.type === 'war-result' && !transition.formal) return
  if (transition.type === 'occupy-title') {
    controllers.set(transition.titleId, transition.controllerId)
    const lawfulHolderId = holders.get(transition.titleId)
    if (lawfulHolderId && lawfulHolderId !== transition.controllerId) {
      contestedByTitle.set(transition.titleId, [lawfulHolderId])
    } else {
      contestedByTitle.delete(transition.titleId)
    }
    return
  }
  if (transition.type === 'revoke-title') {
    if (!transition.holderId || holders.get(transition.titleId) === transition.holderId) {
      holders.delete(transition.titleId)
      controllers.delete(transition.titleId)
      contestedByTitle.delete(transition.titleId)
    }
    return
  }
  holders.set(transition.titleId, transition.holderId)
  controllers.set(transition.titleId, transition.holderId)
  contestedByTitle.delete(transition.titleId)
}

function hierarchy(title: StaticPoliticalTitle): string[] {
  return [title.baronyId, title.countyId, title.duchyId, title.kingdomId, title.empireId, title.hegemonId]
    .filter((id): id is string => Boolean(id))
}

function politicalRealmHierarchy(title: StaticPoliticalTitle): string[] {
  return [title.hegemonId, title.empireId, title.kingdomId, title.duchyId, title.countyId, title.baronyId]
    .filter((id): id is string => Boolean(id))
}

export function attachPoliticalRealms(
  titles: readonly StaticPoliticalTitle[],
  memberships: readonly SemanticMembership[],
): StaticPoliticalTitle[] {
  const membershipByBaronyId = new Map(memberships.map((membership) => [membership.baronyId, membership]))
  return titles.map((title) => {
    const membership = membershipByBaronyId.get(title.baronyId)
    if (!membership) return { ...title }
    return {
      ...title,
      ...(membership.empireId ? { empireId: membership.empireId } : {}),
      ...(membership.hegemonId ? { hegemonId: membership.hegemonId } : {}),
    }
  })
}

export function projectPoliticalState(
  staticTitles: readonly StaticPoliticalTitle[],
  characters: PoliticalCharacterCollection,
  history: WorldHistoryState,
  atDate: WorldDate,
  worldEvents: readonly WorldEvent[] = [],
  titlePatches: Readonly<Record<string, TitleWorldPatch>> = {},
  viewer: WorldEventViewer = { kind: 'player' },
): PoliticalFeatureState[] {
  const characterValues = characterList(characters)
  const charactersById = characterIndex(characters)
  const holders = baselineHolders(characterValues)
  const controllers = new Map(holders)
  const contestedByTitle = new Map<string, CharacterId[]>()
  const visibleWorldEvents = selectVisibleWorldEvents(worldEvents, viewer)
  for (const event of datedTransitions(history, visibleWorldEvents)) {
    if (compareWorldDates(event.date, atDate) > 0) break
    applyTransition(holders, controllers, contestedByTitle, event.transition)
  }
  for (const [titleId, patch] of Object.entries(titlePatches)) {
    if (Object.prototype.hasOwnProperty.call(patch, 'lawfulHolderId')) {
      if (patch.lawfulHolderId) holders.set(titleId, patch.lawfulHolderId)
      else holders.delete(titleId)
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'controllerId')) {
      if (patch.controllerId) controllers.set(titleId, patch.controllerId)
      else controllers.delete(titleId)
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'contestedByIds')) {
      if (patch.contestedByIds?.length) contestedByTitle.set(titleId, [...patch.contestedByIds])
      else contestedByTitle.delete(titleId)
    }
  }

  const styleCache = new Map<CharacterId, ReturnType<typeof holderStyle>>()
  const styleForHolder = (holderId: CharacterId | undefined): ReturnType<typeof holderStyle> | undefined => {
    if (!holderId) return undefined
    let style = styleCache.get(holderId)
    if (!style) {
      style = holderStyle(charactersById.get(holderId), holderId)
      styleCache.set(holderId, style)
    }
    return style
  }
  return [...staticTitles]
    .sort((left, right) => left.baronyId.localeCompare(right.baronyId))
    .map((title) => {
      const effectiveTitleId = hierarchy(title).find((titleId) => holders.has(titleId))
      const holderId = effectiveTitleId ? holders.get(effectiveTitleId) : undefined
      const holder = holderId ? charactersById.get(holderId) : undefined
      const countyHolderTitleId = [title.countyId, title.duchyId, title.kingdomId, title.empireId, title.hegemonId]
        .find((titleId): titleId is string => Boolean(titleId && holders.has(titleId)))
      const countyHolderId = countyHolderTitleId ? holders.get(countyHolderTitleId) : holderId
      const controllerTitleId = [title.countyId, title.duchyId, title.kingdomId, title.empireId, title.hegemonId, title.baronyId]
        .find((titleId): titleId is string => Boolean(titleId && controllers.has(titleId)))
      const controllerId = controllerTitleId ? controllers.get(controllerTitleId) : undefined
      const controllerStyle = styleForHolder(controllerId)
      const contestedByIds = controllerTitleId ? [...(contestedByTitle.get(controllerTitleId) ?? [])] : []
      // Compare the controller with the lawful holder of that same title.
      // A county lord and their baron being different people is normal vassalage.
      const controllerLawfulHolderId = controllerTitleId ? holders.get(controllerTitleId) : undefined
      const isContested = contestedByIds.length > 0 || Boolean(controllerId && controllerLawfulHolderId && controllerId !== controllerLawfulHolderId)
      const realmTitleId = politicalRealmHierarchy(title).find((titleId) => holders.has(titleId))
      const realmHolderId = realmTitleId ? holders.get(realmTitleId) : undefined
      const realmHolder = realmHolderId ? charactersById.get(realmHolderId) : undefined
      const realmStyle = holderStyle(realmHolder, realmHolderId)
      return {
        titleId: title.baronyId,
        provinceId: title.provinceId,
        ...(title.kingdomId ? { kingdomId: title.kingdomId } : {}),
        ...(effectiveTitleId ? { effectiveTitleId } : {}),
        ...(holderId ? { holderId } : {}),
        ...(countyHolderId ? { countyHolderId } : {}),
        ...holderStyle(holder, holderId),
        ...(controllerId ? { controllerId } : {}),
        ...(controllerStyle ? { controllerColor: controllerStyle.color } : {}),
        isContested,
        contestedByIds,
        ...(realmTitleId ? { realmTitleId } : {}),
        ...(realmHolderId ? { realmHolderId } : {}),
        ...(realmStyle.houseId ? { realmHouseId: realmStyle.houseId } : {}),
        ...(realmStyle.houseLabel ? { realmHouseLabel: realmStyle.houseLabel } : {}),
        ...(realmStyle.sigil ? { realmSigil: realmStyle.sigil } : {}),
      }
    })
}

function stateFingerprint(state: PoliticalFeatureState | undefined): string {
  if (!state) return ''
  return [
    state.provinceId,
    state.effectiveTitleId ?? '',
    state.holderId ?? '',
    state.countyHolderId ?? '',
    state.dynastyId ?? '',
    state.houseId ?? '',
    state.houseLabel ?? '',
    state.color,
    state.sigil ?? '',
    state.controllerId ?? '',
    state.controllerColor ?? '',
    state.isContested ? '1' : '0',
    state.contestedByIds.join(','),
    state.realmTitleId ?? '',
    state.realmHolderId ?? '',
    state.realmHouseId ?? '',
    state.realmHouseLabel ?? '',
    state.realmSigil ?? '',
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
