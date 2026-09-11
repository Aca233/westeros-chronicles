import type { WorldDate } from '../../domain/worldDate';

export const MINUTES_PER_DAY = 24 * 60;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;

export type TimePrecision = 'exact' | 'day_only';
export type ActionPhaseKind = 'preparation' | 'action' | 'travel' | 'treatment' | 'rest' | 'other';
export type ActionActivity = 'resting' | 'light' | 'walking' | 'strenuous';

export interface GameMoment {
  date: WorldDate;
  minuteOfDay: number;
}

export interface ActionPhaseDraft {
  kind: ActionPhaseKind;
  durationMinutes: number;
  reason: string;
  activity?: ActionActivity;
  sleep?: boolean;
}

function assertMinuteOfDay(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value >= MINUTES_PER_DAY) {
    throw new Error(`日内分钟无效：${value}`);
  }
}

export function worldDateOrdinal(date: WorldDate): number {
  return date.year * DAYS_PER_YEAR + (date.month - 1) * DAYS_PER_MONTH + date.day - 1;
}

export function worldDateFromOrdinal(ordinal: number): WorldDate {
  if (!Number.isInteger(ordinal) || ordinal < 0) throw new Error(`世界日期序号无效：${ordinal}`);
  const year = Math.floor(ordinal / DAYS_PER_YEAR);
  const dayOfYear = ordinal - year * DAYS_PER_YEAR;
  return {
    year,
    month: Math.floor(dayOfYear / DAYS_PER_MONTH) + 1,
    day: dayOfYear % DAYS_PER_MONTH + 1,
  };
}

export function absoluteGameMinute(moment: GameMoment): number {
  assertMinuteOfDay(moment.minuteOfDay);
  return worldDateOrdinal(moment.date) * MINUTES_PER_DAY + moment.minuteOfDay;
}

export function gameMomentFromAbsoluteMinute(value: number): GameMoment {
  if (!Number.isInteger(value) || value < 0) throw new Error(`游戏时刻无效：${value}`);
  const ordinal = Math.floor(value / MINUTES_PER_DAY);
  return {
    date: worldDateFromOrdinal(ordinal),
    minuteOfDay: value % MINUTES_PER_DAY,
  };
}

export function advanceGameMoment(moment: GameMoment, minutes: number): GameMoment {
  if (!Number.isInteger(minutes) || minutes < 0) throw new Error(`行动耗时必须是非负整数分钟：${minutes}`);
  return gameMomentFromAbsoluteMinute(absoluteGameMinute(moment) + minutes);
}

export function normalizeActionPhases(phases: readonly ActionPhaseDraft[] | undefined): ActionPhaseDraft[] {
  if (!phases?.length) return [];
  if (phases.length > 12) throw new Error('单回合行动阶段不能超过 12 段');
  return phases.map((phase, index) => {
    if (!phase || typeof phase !== 'object') throw new Error(`行动阶段 ${index + 1} 无效`);
    if (!Number.isInteger(phase.durationMinutes) || phase.durationMinutes < 0 || phase.durationMinutes > 30 * MINUTES_PER_DAY) {
      throw new Error(`行动阶段 ${index + 1} 耗时无效`);
    }
    const reason = phase.reason?.trim();
    if (!reason) throw new Error(`行动阶段 ${index + 1} 缺少耗时依据`);
    return { ...phase, reason };
  });
}

export function totalActionMinutes(phases: readonly ActionPhaseDraft[] | undefined): number {
  return normalizeActionPhases(phases).reduce((sum, phase) => sum + phase.durationMinutes, 0);
}

export function formatMinuteOfDay(minuteOfDay: number): string {
  assertMinuteOfDay(minuteOfDay);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
