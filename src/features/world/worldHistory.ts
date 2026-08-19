import type { CharacterId } from '../characters/types';
import type { WorldLocationRef } from '../map/types';
import type { StateCommand } from '../../types/game';

export interface WorldDate {
  year: number;
  month: number;
  day: number;
}

export interface WorldDateAdvance {
  days?: number;
  months?: number;
  years?: number;
}

export type CanonicalEventStatus = 'historical' | 'scheduled' | 'occurred' | 'diverged' | 'suppressed';

export interface CanonicalEventState {
  eventId: string;
  status: CanonicalEventStatus;
  resolvedOn?: WorldDate;
  reason?: string;
}

export interface WorldEventFact {
  id: string;
  turn: number;
  date: WorldDate;
  source: 'player' | 'character' | 'item' | 'timeline' | 'system';
  kind: string;
  title: string;
  summary: string;
  participantIds: CharacterId[];
  commandTypes: string[];
  location?: WorldLocationRef;
  canonicalEventId?: string;
}

export interface RejectedWorldCommand {
  type: string;
  reason: string;
}

export interface WorldTurnRecord {
  turn: number;
  action: string;
  startedOn: WorldDate;
  resolvedOn: WorldDate;
  acceptedCommands: StateCommand[];
  rejectedCommands: RejectedWorldCommand[];
  facts: WorldEventFact[];
  canonicalTransitions: CanonicalEventState[];
}

export interface WorldHistoryState {
  schemaVersion: 1;
  startDate: WorldDate;
  canonical: Record<string, CanonicalEventState>;
  turns: WorldTurnRecord[];
}

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) throw new Error(`${label}必须是整数`);
}

export function assertWorldDate(date: WorldDate): void {
  assertInteger(date.year, '年份');
  assertInteger(date.month, '月份');
  assertInteger(date.day, '日期');
  if (date.month < 1 || date.month > 12) throw new Error(`月份超出范围：${date.month}`);
  if (date.day < 1 || date.day > 30) throw new Error(`日期超出范围：${date.day}`);
}

export function compareWorldDates(left: WorldDate, right: WorldDate): -1 | 0 | 1 {
  assertWorldDate(left);
  assertWorldDate(right);
  const leftOrdinal = left.year * 360 + (left.month - 1) * 30 + left.day - 1;
  const rightOrdinal = right.year * 360 + (right.month - 1) * 30 + right.day - 1;
  return leftOrdinal < rightOrdinal ? -1 : leftOrdinal > rightOrdinal ? 1 : 0;
}

function nonNegativeInteger(value: number | undefined, label: string): number {
  const normalized = value ?? 0;
  assertInteger(normalized, label);
  if (normalized < 0) throw new Error(`时间不能倒退：${label}=${normalized}`);
  return normalized;
}

export function advanceWorldDate(date: WorldDate, advance: WorldDateAdvance): WorldDate {
  assertWorldDate(date);
  const days = nonNegativeInteger(advance.days, '日');
  const months = nonNegativeInteger(advance.months, '月');
  const years = nonNegativeInteger(advance.years, '年');
  const ordinal = date.year * 360 + (date.month - 1) * 30 + date.day - 1
    + years * 360 + months * 30 + days;
  const year = Math.floor(ordinal / 360);
  const dayOfYear = ordinal - year * 360;
  return {
    year,
    month: Math.floor(dayOfYear / 30) + 1,
    day: dayOfYear % 30 + 1,
  };
}

export function setWorldDateForward(current: WorldDate, patch: Partial<WorldDate>): WorldDate {
  const candidate = {
    year: patch.year ?? current.year,
    month: patch.month ?? current.month,
    day: patch.day ?? current.day,
  };
  assertWorldDate(candidate);
  if (compareWorldDates(candidate, current) < 0) {
    throw new Error(`时间不能倒退：${current.year}.${current.month}.${current.day} -> ${candidate.year}.${candidate.month}.${candidate.day}`);
  }
  return candidate;
}

export function createWorldHistoryState(startDate: WorldDate): WorldHistoryState {
  assertWorldDate(startDate);
  return {
    schemaVersion: 1,
    startDate: { ...startDate },
    canonical: {},
    turns: [],
  };
}

export function appendWorldTurn(history: WorldHistoryState, turn: WorldTurnRecord): WorldHistoryState {
  if (history.turns.some((entry) => entry.turn === turn.turn)) throw new Error(`世界历史回合 ${turn.turn} 已存在`);
  const previous = history.turns.length ? history.turns[history.turns.length - 1] : undefined;
  if (previous && turn.turn <= previous.turn) throw new Error(`世界历史回合必须递增：${turn.turn}`);
  if (compareWorldDates(turn.startedOn, history.startDate) < 0
    || compareWorldDates(turn.resolvedOn, turn.startedOn) < 0
    || (previous && compareWorldDates(turn.startedOn, previous.resolvedOn) < 0)) {
    throw new Error(`世界历史日期不能倒退：回合 ${turn.turn}`);
  }
  return {
    ...history,
    canonical: { ...history.canonical },
    turns: [...history.turns, JSON.parse(JSON.stringify(turn)) as WorldTurnRecord],
  };
}
