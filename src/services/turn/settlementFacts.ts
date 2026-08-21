import type { CharacterId } from '../../features/characters/types';
import { isCharacterStateCommand } from '../stateReducer';
import { createWorldLocationRef } from '../../features/map/locationResolver';
import type { MapLocationSearchEntry, WorldLocationRef } from '../../features/map/types';
import { isTravelStateCommand } from '../../features/map/travel/travelCommands';
import type { TravelStateCommand } from '../../features/map/travel/types';
import type { WorldDate, WorldEventFact } from '../../features/world/worldHistory';
import type { WorldEvent, WorldEventSource } from '../../features/world/worldRuntimeTypes';
import type { GameState, StateCommand } from '../../types/game';
import { stripEmoji } from '../textSanitizer';

function commandParticipantIds(command: StateCommand): CharacterId[] {
  const raw = command as unknown as Record<string, unknown>;
  return [...new Set(['characterId', 'sourceCharacterId', 'fromCharacterId', 'toCharacterId', 'spouseId', 'targetCharacterId', 'targetId', 'recipientId', 'killerId']
    .map((key) => raw[key])
    .filter((value): value is CharacterId => typeof value === 'string' && (value.startsWith('agot:') || value.startsWith('save:'))))];
}

function factSource(command: StateCommand): WorldEventFact['source'] {
  if (isTravelStateCommand(command)) return 'system';
  if (command.type.startsWith('ITEM_')) return 'item';
  if (isCharacterStateCommand(command)) return 'character';
  return 'player';
}

function commandFactLocation(command: StateCommand, currentLocation: WorldLocationRef, resolvedLocation: WorldLocationRef): WorldLocationRef {
  if (command.type === 'CHANGE_LOCATION' || command.type === 'MOVE_CHARACTER') {
    return createWorldLocationRef(command.locationId, command.sceneLocation);
  }
  if (isTravelStateCommand(command)) return { ...resolvedLocation };
  return { ...currentLocation };
}

export function travelFactText(command: TravelStateCommand, resolvedLocation: WorldLocationRef): { title: string; summary: string } {
  const labels = 'locationLabels' in command ? command.locationLabels : undefined;
  const plan = 'routePlan' in command ? command.routePlan : undefined;
  const from = plan ? labels?.[plan.from] ?? plan.from : undefined;
  const to = plan ? labels?.[plan.to] ?? plan.to : undefined;
  switch (command.type) {
    case 'PLAN_TRAVEL': return { title: '路线已经规划', summary: `已规划从${from}前往${to}的路线，尚未出发。` };
    case 'START_TRAVEL': return { title: '旅程已经开始', summary: plan ? `队伍从${from}启程前往${to}。` : '队伍按已规划的路线启程。' };
    case 'PAUSE_TRAVEL': return command.reason
      ? { title: '旅程被迫中断', summary: `队伍因${command.reason}停下。` }
      : { title: '旅程已经暂停', summary: '队伍暂时停止赶路。' };
    case 'RESUME_TRAVEL': return { title: '旅程继续', summary: '队伍重新上路。' };
    case 'REROUTE_TRAVEL': return { title: '旅程已经改道', summary: `队伍从${from}改道前往${to}。` };
    case 'RETURN_TRAVEL': return { title: '队伍开始返回', summary: `队伍从${from}沿新路线返回${to}。` };
    case 'ADVANCE_TRAVEL': return {
      title: '旅程继续推进',
      summary: `旅程随世界时间推进 ${command.days} 天，当前权威地点为${resolvedLocation.locationId}。`,
    };
    case 'CANCEL_PLANNED_TRAVEL': return { title: '路线规划已经取消', summary: '尚未开始的旅程已经取消。' };
  }
}

export function commandFacts(
  commands: readonly StateCommand[],
  turn: number,
  date: WorldDate,
  currentLocation: WorldLocationRef,
  resolvedLocation: WorldLocationRef,
  playerId?: CharacterId,
  travelParticipants: readonly CharacterId[] = [],
): WorldEventFact[] {
  return commands
    .filter((command) => command.type !== 'ADVANCE_TIME' && command.type !== 'SET_DATE')
    .map((command, index) => {
      const isTravel = isTravelStateCommand(command)
      const participantIds = isTravel
        ? [...new Set([...(playerId ? [playerId] : []), ...travelParticipants])]
        : commandParticipantIds(command).length
          ? commandParticipantIds(command)
          : playerId ? [playerId] : []
      const travelText = isTravel ? travelFactText(command, resolvedLocation) : undefined
      return {
        id: `command:${turn}:${index}:${command.type}`,
        turn,
        date: { ...date },
        source: factSource(command),
        kind: command.type === 'KILL_CHARACTER'
          ? 'character.death'
          : command.type === 'ADVANCE_TRAVEL'
            ? 'travel.progress'
            : `command.${command.type.toLowerCase()}`,
        title: travelText?.title ?? `已确认命令：${command.type}`,
        summary: travelText?.summary ?? `程序已接受并结算 ${command.type}。`,
        participantIds,
        commandTypes: [command.type],
        location: commandFactLocation(command, currentLocation, resolvedLocation),
      }
    })
}
function worldEventSource(source: WorldEventFact['source']): WorldEventSource {
  if (source === 'player') return 'player_input';
  if (source === 'item') return 'ui_action';
  if (source === 'character') return 'ai_resolution';
  return 'system_rule';
}

export function worldEventFromFact(fact: WorldEventFact, transactionId: string): WorldEvent {
  return {
    id: fact.id,
    transactionId,
    turn: fact.turn,
    date: { ...fact.date },
    type: fact.kind,
    actorIds: [...fact.participantIds],
    subjectRefs: [
      ...fact.participantIds.map((characterId) => ({ type: 'character' as const, characterId })),
      ...(fact.political ? [{ type: 'title' as const, titleId: fact.political.titleId }] : []),
    ],
    ...(fact.location ? { location: { ...fact.location } } : {}),
    reason: fact.summary,
    source: worldEventSource(fact.source),
    ...(fact.canonicalEventId ? { canonicalEventId: fact.canonicalEventId } : {}),
    visibility: fact.political?.visibility ?? 'public',
  };
}

export function deriveSeason(month: number): string {
  if (month <= 3) return '新春之兆 (初春)';
  if (month <= 6) return '烈阳盛夏 (盛夏)';
  if (month <= 9) return '丰收残秋 (初秋)';
  return '凛冬将至 (晚秋与寒冬)';
}

export function playerCharacterId(gameState: GameState): CharacterId {
  return gameState.lord.canonicalCharacterId
    ?? `save:${gameState.worldCharacters?.runId ?? 'current'}:player` as CharacterId;
}

export function worldEventAsFact(event: WorldEvent): WorldEventFact {
  const location = event.location
    ?? event.subjectRefs.find((subject) => subject.type === 'location')?.location;
  return {
    id: event.id,
    turn: event.turn,
    date: { ...event.date },
    source: event.source === 'ui_action' ? 'item' : event.source === 'system_rule' ? 'system' : 'player',
    kind: event.type,
    title: event.type.startsWith('travel.') ? '旅程状态更新' : '世界状态更新',
    summary: stripEmoji(event.reason),
    participantIds: [...event.actorIds],
    commandTypes: [],
    ...(location ? { location: { ...location } } : {}),
  };
}

export function committedNarrationContext(
  location: WorldLocationRef,
  locations: readonly MapLocationSearchEntry[],
  events: readonly WorldEvent[],
  rejectionLines: readonly string[] = [],
): string {
  const locationName = locations.find((entry) => entry.id === location.locationId)?.name ?? '所在地未查明';
  const place = location.sceneLocation ? `${locationName} · ${stripEmoji(location.sceneLocation)}` : locationName;
  const eventLines = events.slice(-12).map((event) => `- ${stripEmoji(event.reason)}`);
  return stripEmoji([
    '【程序已提交的世界状态】',
    `- 当前地点：${place}`,
    ...(eventLines.length ? ['- 本回合世界事件：', ...eventLines] : []),
    ...(rejectionLines.length ? ['- 未执行的世界意图：', ...rejectionLines.map((line) => `- ${line}`)] : []),
  ].join('\n')).replace(/\bb_[a-z0-9_]+\b/gi, '已验证地点');
}
