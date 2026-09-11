import type { CharacterId } from '../../domain/characterId';
import type { GameState, LordProfile, StateCommand } from '../../types/game';
import {
  advanceCharacterHealth,
  applyHealthHit,
  applyInjuryTreatment,
  consumeSurvivalResource,
  type HealthSettlementContext,
} from '../../features/health/engine';
import { createHealthyCharacterHealthState, migrateLegacyBodyToHealth, projectLegacyBodyFromHealth } from '../../features/health/state';
import type { CharacterHealthState, HealthRuntimeState, HealthStateCommand } from '../../features/health/types';
import { advanceGameMoment, normalizeActionPhases, type ActionPhaseDraft, type GameMoment } from '../../features/time/gameClock';
import type { ItemSystemState } from '../../features/items/types';

export interface PlayerHealthTurnResult {
  health: HealthRuntimeState;
  playerHealth: CharacterHealthState;
  items: ItemSystemState;
  lord: LordProfile;
  finalMoment: GameMoment;
  elapsedMinutes: number;
  changes: string[];
  appliedCommands: HealthStateCommand[];
  interrupted: boolean;
  interruptionReason?: string;
  isFatalDeath: boolean;
}

export interface NpcHealthTurnResult {
  health: HealthRuntimeState;
  items: ItemSystemState;
  changes: string[];
  appliedCommands: HealthStateCommand[];
  deadCharacterIds: CharacterId[];
}

function playerId(gameState: GameState): CharacterId {
  return (gameState.lord.canonicalCharacterId
    ?? `save:${gameState.worldCharacters?.runId ?? 'current'}:player`) as CharacterId;
}

function isHealthCommand(command: StateCommand): command is HealthStateCommand {
  return command.type === 'APPLY_HIT'
    || command.type === 'TREAT_INJURY'
    || command.type === 'CONSUME_SURVIVAL'
    || command.type === 'REST';
}

function commandTargetsPlayer(command: HealthStateCommand, id: CharacterId): boolean {
  return !command.characterId || command.characterId === id;
}

function activeInjury(state: CharacterHealthState): boolean {
  return state.injuries.some((injury) => injury.recovery.stage !== 'healed');
}

function ensurePlayerHealth(gameState: GameState, id: CharacterId, moment: GameMoment): CharacterHealthState {
  const existing = gameState.health.characters[id];
  if (existing) return structuredClone(existing);
  return migrateLegacyBodyToHealth(
    id,
    gameState.lord.body,
    moment,
    { precision: gameState.currentTimePrecision, traitIds: gameState.lord.traitIds },
  );
}

function phaseActivity(phase: ActionPhaseDraft): 'resting' | 'light' | 'walking' | 'strenuous' {
  if (phase.activity) return phase.activity;
  if (phase.kind === 'rest') return 'resting';
  if (phase.kind === 'travel') return 'walking';
  if (phase.kind === 'action') return 'strenuous';
  return 'light';
}

function phaseForCommand(command: HealthStateCommand): ActionPhaseDraft['kind'] {
  if (command.type === 'TREAT_INJURY') return 'treatment';
  if (command.type === 'REST') return 'rest';
  if (command.type === 'CONSUME_SURVIVAL') return 'preparation';
  return 'action';
}

function applyCommand(
  health: CharacterHealthState,
  items: ItemSystemState,
  command: HealthStateCommand,
  context: HealthSettlementContext,
) {
  switch (command.type) {
    case 'APPLY_HIT': return applyHealthHit(health, command, context);
    case 'TREAT_INJURY': return applyInjuryTreatment(health, command, context);
    case 'CONSUME_SURVIVAL': return consumeSurvivalResource(health, command, context);
    case 'REST': return { health, items, changes: [] as string[], interrupted: false, elapsedMinutes: 0 };
  }
}

function clippedPhases(phases: readonly ActionPhaseDraft[], maximumMinutes: number): ActionPhaseDraft[] {
  let remaining = maximumMinutes;
  const result: ActionPhaseDraft[] = [];
  for (const phase of phases) {
    if (remaining <= 0) break;
    const durationMinutes = Math.min(phase.durationMinutes, remaining);
    result.push({ ...phase, durationMinutes });
    remaining -= durationMinutes;
  }
  return result;
}

/**
 * Settle only the player's detailed health/survival state. It is pure: callers
 * decide whether the result is committed, so model retries and failed world
 * transactions cannot consume food, bandages, durability, or time.
 */
export function settlePlayerHealthTurn(input: {
  gameState: GameState;
  lord: LordProfile;
  items: ItemSystemState;
  commands: readonly StateCommand[];
  phases?: readonly ActionPhaseDraft[];
  plannedMinutes: number;
  travelActive?: boolean;
}): PlayerHealthTurnResult {
  const id = playerId(input.gameState);
  const startMoment: GameMoment = {
    date: {
      year: input.gameState.currentYear,
      month: input.gameState.currentMonth,
      day: input.gameState.currentDay,
    },
    minuteOfDay: input.gameState.currentMinute,
  };
  let health = ensurePlayerHealth(input.gameState, id, startMoment);
  let items = structuredClone(input.items);
  const changes: string[] = [];
  let elapsedMinutes = 0;
  let interrupted = false;
  let interruptionReason: string | undefined;
  const pending = input.commands.filter(isHealthCommand).filter((command) => commandTargetsPlayer(command, id));
  const handled = new Set<HealthStateCommand>();
  const explicit = normalizeActionPhases(input.phases);
  const restCommand = pending.find((command): command is Extract<HealthStateCommand, { type: 'REST' }> => command.type === 'REST');
  let phases = explicit.length
    ? explicit
    : restCommand
      ? [{ kind: 'rest' as const, durationMinutes: restCommand.minutes, activity: 'resting' as const, sleep: restCommand.sleep, reason: restCommand.sleep ? '安排睡眠休整' : '安排休整' }]
      : input.plannedMinutes > 0
        ? [{ kind: input.travelActive ? 'travel' as const : 'other' as const, durationMinutes: input.plannedMinutes, activity: input.travelActive ? 'walking' as const : 'light' as const, reason: input.travelActive ? '旅程耗时' : '行动耗时' }]
        : [];
  const phaseTotal = phases.reduce((sum, phase) => sum + phase.durationMinutes, 0);
  if (phaseTotal < input.plannedMinutes) {
    phases = [...phases, {
      kind: input.travelActive ? 'travel' : 'other',
      durationMinutes: input.plannedMinutes - phaseTotal,
      activity: input.travelActive ? 'walking' : 'light',
      reason: '补足程序已确认的行动耗时',
    }];
  }
  phases = clippedPhases(phases, input.plannedMinutes);

  for (const phase of phases) {
    if (interrupted) break;
    const phaseStart = advanceGameMoment(startMoment, elapsedMinutes);
    const advanced = advanceCharacterHealth(
      health,
      phase.durationMinutes,
      phaseActivity(phase),
      {
        characterId: id,
        location: input.lord.location,
        items,
        attributes: input.lord.attributes,
        moment: phaseStart,
      },
      { sleep: phase.kind === 'rest' && phase.sleep === true, autoConsume: true },
    );
    health = advanced.health;
    items = advanced.items;
    elapsedMinutes += advanced.elapsedMinutes;
    changes.push(...advanced.changes);
    if (advanced.interrupted) {
      interrupted = true;
      interruptionReason = advanced.interruptionReason;
      break;
    }

    const commandMoment = advanceGameMoment(startMoment, elapsedMinutes);
    for (const command of pending) {
      if (handled.has(command) || command.type === 'REST' || phaseForCommand(command) !== phase.kind) continue;
      const result = applyCommand(health, items, command, {
        characterId: id,
        location: input.lord.location,
        items,
        attributes: input.lord.attributes,
        moment: commandMoment,
      });
      health = result.health;
      items = result.items;
      changes.push(...result.changes);
      handled.add(command);
      if (result.interrupted) {
        interrupted = true;
        interruptionReason = result.interruptionReason;
        break;
      }
    }
  }

  if (!interrupted) {
    const commandMoment = advanceGameMoment(startMoment, elapsedMinutes);
    for (const command of pending) {
      if (handled.has(command) || command.type === 'REST') continue;
      const result = applyCommand(health, items, command, {
        characterId: id,
        location: input.lord.location,
        items,
        attributes: input.lord.attributes,
        moment: commandMoment,
      });
      health = result.health;
      items = result.items;
      changes.push(...result.changes);
      handled.add(command);
      if (result.interrupted) {
        interrupted = true;
        interruptionReason = result.interruptionReason;
        break;
      }
    }
  }

  if (restCommand && elapsedMinutes > 0) handled.add(restCommand);
  const finalMoment = advanceGameMoment(startMoment, elapsedMinutes);
  health.lastUpdatedAt = { date: { ...finalMoment.date }, minuteOfDay: finalMoment.minuteOfDay };
  health.timePrecision = elapsedMinutes > 0 ? 'exact' : input.gameState.currentTimePrecision;
  const runtime: HealthRuntimeState = structuredClone(input.gameState.health);
  runtime.characters[id] = health;
  const lord: LordProfile = {
    ...input.lord,
    body: projectLegacyBodyFromHealth(health),
    overallStatus: !health.alive ? '阵亡' : input.lord.overallStatus,
    items,
  };
  return {
    health: runtime,
    playerHealth: health,
    items,
    lord,
    finalMoment,
    elapsedMinutes,
    changes: [...new Set(changes)],
    appliedCommands: [...handled],
    interrupted,
    ...(interruptionReason ? { interruptionReason } : {}),
    isFatalDeath: !health.alive,
  };
}

/**
 * NPCs are advanced only when relevant to this turn: present in the scene,
 * explicitly targeted by a health command, or already carrying an unresolved
 * injury. They never auto-consume supplies, so this cannot invent access to
 * off-screen food or water or turn into a whole-world minute simulation.
 */
export function settleNpcHealthTurn(input: {
  gameState: GameState;
  health: HealthRuntimeState;
  items: ItemSystemState;
  commands: readonly StateCommand[];
  phases?: readonly ActionPhaseDraft[];
  elapsedMinutes: number;
  presentCharacterIds?: ReadonlySet<CharacterId> | readonly CharacterId[];
}): NpcHealthTurnResult {
  const player = playerId(input.gameState);
  const present = new Set<CharacterId>(input.presentCharacterIds ?? []);
  const npcCommands = input.commands
    .filter(isHealthCommand)
    .filter((command): command is HealthStateCommand & { characterId: CharacterId } => Boolean(command.characterId && command.characterId !== player));
  const explicitTargets = new Set(npcCommands.map((command) => command.characterId));
  const candidates = new Set<CharacterId>([
    ...present,
    ...explicitTargets,
    ...Object.entries(input.health.characters)
      .filter(([id, state]) => id !== player && activeInjury(state))
      .map(([id]) => id as CharacterId),
  ]);
  candidates.delete(player);
  if (!candidates.size) {
    return { health: structuredClone(input.health), items: structuredClone(input.items), changes: [], appliedCommands: [], deadCharacterIds: [] };
  }

  const startMoment: GameMoment = {
    date: { year: input.gameState.currentYear, month: input.gameState.currentMonth, day: input.gameState.currentDay },
    minuteOfDay: input.gameState.currentMinute,
  };
  const normalized = normalizeActionPhases(input.phases);
  const phases = clippedPhases(
    normalized.length
      ? normalized
      : input.elapsedMinutes > 0
        ? [{ kind: 'other' as const, durationMinutes: input.elapsedMinutes, activity: 'light' as const, reason: 'NPC 按本回合实际耗时推进' }]
        : [],
    input.elapsedMinutes,
  );
  const runtime = structuredClone(input.health);
  let items = structuredClone(input.items);
  const changes: string[] = [];
  const appliedCommands: HealthStateCommand[] = [];
  const deadCharacterIds: CharacterId[] = [];

  for (const id of candidates) {
    const targetedCommands = npcCommands.filter((command) => command.characterId === id);
    if (targetedCommands.length && !present.has(id)) throw new Error(`不能对不在当前场景的人物结算身体操作：${id}`);
    let state = runtime.characters[id]
      ? structuredClone(runtime.characters[id])
      : createHealthyCharacterHealthState(id, startMoment, 'right', input.gameState.currentTimePrecision);
    const handled = new Set<HealthStateCommand>();
    let elapsed = 0;
    for (const phase of phases) {
      if (!state.alive) break;
      const phaseStart = advanceGameMoment(startMoment, elapsed);
      const advanced = advanceCharacterHealth(state, phase.durationMinutes, phaseActivity(phase), {
        characterId: id,
        location: input.gameState.lord.location,
        items,
        moment: phaseStart,
      }, { sleep: phase.kind === 'rest' && phase.sleep === true, autoConsume: false });
      state = advanced.health;
      items = advanced.items;
      elapsed += advanced.elapsedMinutes;
      changes.push(...advanced.changes.map((entry) => `${id}：${entry}`));
      if (advanced.interrupted || !state.alive) break;
      const commandMoment = advanceGameMoment(startMoment, elapsed);
      for (const command of targetedCommands) {
        if (handled.has(command) || command.type === 'REST' || phaseForCommand(command) !== phase.kind) continue;
        const result = applyCommand(state, items, command, { characterId: id, location: input.gameState.lord.location, items, moment: commandMoment });
        state = result.health;
        items = result.items;
        changes.push(...result.changes.map((entry) => `${id}：${entry}`));
        handled.add(command);
        appliedCommands.push(command);
        if (result.interrupted || !state.alive) break;
      }
    }
    if (state.alive) {
      const commandMoment = advanceGameMoment(startMoment, elapsed);
      for (const command of targetedCommands) {
        if (handled.has(command) || command.type === 'REST') continue;
        const result = applyCommand(state, items, command, { characterId: id, location: input.gameState.lord.location, items, moment: commandMoment });
        state = result.health;
        items = result.items;
        changes.push(...result.changes.map((entry) => `${id}：${entry}`));
        handled.add(command);
        appliedCommands.push(command);
        if (result.interrupted || !state.alive) break;
      }
    }
    const finalMoment = advanceGameMoment(startMoment, elapsed);
    state.lastUpdatedAt = { date: { ...finalMoment.date }, minuteOfDay: finalMoment.minuteOfDay };
    if (elapsed > 0) state.timePrecision = 'exact';
    runtime.characters[id] = state;
    if (!state.alive) deadCharacterIds.push(id);
  }
  return {
    health: runtime,
    items,
    changes: [...new Set(changes)],
    appliedCommands,
    deadCharacterIds: [...new Set(deadCharacterIds)],
  };
}
