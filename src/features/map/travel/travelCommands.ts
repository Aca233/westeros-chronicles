import type { WorldDate } from '../../world/worldHistory'
import type { WorldLocationRef } from '../types'
import type { RoutePlan } from '../routing/types'
import type { ActiveJourney, TravelStateCommand } from './types'

export interface TravelCommandContext {
  currentLocation: WorldLocationRef
  currentDate: WorldDate
  knownLocationIds: ReadonlySet<string>
}

export interface RejectedTravelCommand {
  command: TravelStateCommand
  reason: string
}

export interface TravelCommandResult {
  journey?: ActiveJourney
  accepted: TravelStateCommand[]
  rejected: RejectedTravelCommand[]
}

const TRAVEL_COMMAND_TYPES = new Set<TravelStateCommand['type']>([
  'PLAN_TRAVEL',
  'START_TRAVEL',
  'PAUSE_TRAVEL',
  'RESUME_TRAVEL',
  'REROUTE_TRAVEL',
  'RETURN_TRAVEL',
  'ADVANCE_TRAVEL',
  'CANCEL_PLANNED_TRAVEL',
])

export function isTravelStateCommand(command: { type: string }): command is TravelStateCommand {
  return TRAVEL_COMMAND_TYPES.has(command.type as TravelStateCommand['type'])
}

function uniqueStrings<T extends string>(values: readonly T[] | undefined): T[] {
  return [...new Set(values ?? [])]
}

export function assertRoutePlanStartsAt(
  plan: RoutePlan,
  locationId: string,
  knownLocationIds: ReadonlySet<string>,
): void {
  if (!plan || plan.ok !== true) throw new Error('路线规划无效')
  if (plan.from !== locationId) throw new Error('路线必须从当前位置开始')
  if (!knownLocationIds.has(plan.from) || !knownLocationIds.has(plan.to)) throw new Error('路线端点不在地图地点索引中')
  if (!Number.isFinite(plan.totalDays) || plan.totalDays < 0) throw new Error('路线总时长无效')
  if (!Array.isArray(plan.legs)) throw new Error('路线缺少分段资料')

  let cursor = plan.from
  let totalDays = 0
  plan.legs.forEach((leg, index) => {
    if (leg.index !== index || leg.from !== cursor) throw new Error(`路线第 ${index + 1} 段不连续`)
    if (!knownLocationIds.has(leg.from) || !knownLocationIds.has(leg.to)) throw new Error(`路线第 ${index + 1} 段含有未知地点`)
    if (!Number.isFinite(leg.days) || leg.days <= 0) throw new Error(`路线第 ${index + 1} 段时长无效`)
    cursor = leg.to
    totalDays += leg.days
  })
  if (cursor !== plan.to) throw new Error('路线终点与最后一段不一致')
  if (Math.abs(totalDays - plan.totalDays) > 0.0001) throw new Error('路线总时长与分段不一致')
}

function createJourney(
  plan: RoutePlan,
  status: ActiveJourney['status'],
  context: TravelCommandContext,
  companions?: ActiveJourney['companions'],
  vehicleIds?: string[],
  locationLabels?: Record<string, string>,
): ActiveJourney {
  assertRoutePlanStartsAt(plan, context.currentLocation.locationId, context.knownLocationIds)
  return {
    routePlan: structuredClone(plan),
    currentLeg: plan.legs.length ? 0 : plan.legs.length,
    progressDays: 0,
    status: plan.legs.length ? status : 'arrived',
    companions: uniqueStrings(companions),
    vehicleIds: uniqueStrings(vehicleIds),
    startedAt: { ...context.currentDate },
    ...(locationLabels ? { locationLabels: { ...locationLabels } } : {}),
  }
}

export function applyTravelCommands(
  current: ActiveJourney | undefined,
  commands: readonly TravelStateCommand[],
  context: TravelCommandContext,
): TravelCommandResult {
  let journey = current ? structuredClone(current) : undefined
  const accepted: TravelStateCommand[] = []
  const rejected: RejectedTravelCommand[] = []

  for (const command of commands) {
    try {
      switch (command.type) {
        case 'PLAN_TRAVEL': {
          if (journey && journey.status !== 'planned' && journey.status !== 'arrived') throw new Error('当前已有进行中的旅程')
          journey = createJourney(command.routePlan, 'planned', context, command.companions, command.vehicleIds, command.locationLabels)
          if (journey.status === 'arrived') journey.status = 'planned'
          break
        }
        case 'START_TRAVEL': {
          const plan = command.routePlan ?? journey?.routePlan
          if (!plan) throw new Error('没有可开始的路线规划')
          if (journey && journey.status !== 'planned' && journey.status !== 'arrived') throw new Error('当前旅程已经开始')
          journey = createJourney(
            plan,
            'travelling',
            context,
            command.companions ?? journey?.companions,
            command.vehicleIds ?? journey?.vehicleIds,
            command.locationLabels ?? journey?.locationLabels,
          )
          break
        }
        case 'PAUSE_TRAVEL': {
          if (!journey || journey.status !== 'travelling') throw new Error('当前没有可暂停的旅程')
          journey.status = command.reason ? 'interrupted' : 'paused'
          if (command.reason) journey.interruptedBy = command.reason.trim()
          break
        }
        case 'RESUME_TRAVEL': {
          if (!journey || (journey.status !== 'paused' && journey.status !== 'interrupted')) throw new Error('当前没有可继续的旅程')
          journey.status = 'travelling'
          delete journey.interruptedBy
          break
        }
        case 'REROUTE_TRAVEL':
        case 'RETURN_TRAVEL': {
          if (!journey || journey.status === 'planned' || journey.status === 'arrived') throw new Error('当前没有可改道的旅程')
          const previous = journey
          journey = createJourney(command.routePlan, previous.status === 'paused' ? 'paused' : 'travelling', context, previous.companions, previous.vehicleIds, { ...previous.locationLabels, ...command.locationLabels })
          journey.startedAt = { ...previous.startedAt }
          break
        }
        case 'ADVANCE_TRAVEL': {
          if (!Number.isFinite(command.days) || command.days < 0) throw new Error('旅行推进时长无效')
          if (!journey || journey.status !== 'travelling') throw new Error('当前没有正在进行的旅程')
          break
        }
        case 'CANCEL_PLANNED_TRAVEL': {
          if (!journey || journey.status !== 'planned') throw new Error('只能取消尚未开始的路线规划')
          journey = undefined
          break
        }
      }
      accepted.push(command)
    } catch (error) {
      rejected.push({ command, reason: error instanceof Error ? error.message : '旅行命令无效' })
    }
  }

  return { journey, accepted, rejected }
}
