import { stripEmoji } from '../../services/textSanitizer';
import type { SceneCharacterCandidate, SceneSelectionResult } from './sceneCharacterSelector';
import { visibleFacts, visibleMemories, type KnowledgeViewerContext } from './characterKnowledge';
import { relationshipSummary } from './characterRelationships';
import type {
  CharacterKnowledge,
  CharacterMemory,
  CharacterRelationship,
  KnowledgeVisibility,
} from './types';

/**
 * A scene candidate enriched only with fields that are safe to consider for an
 * AI prompt. Static records and resolved characters must never be serialized.
 */
export interface CharacterPromptCandidate extends SceneCharacterCandidate {
  publicIdentity?: string;
  role?: string;
  locationName?: string;
  relationToViewer?: string | CharacterRelationship;
  visibleTraits?: readonly string[];
  /** Goals are knowledge records so visibility and time bounds cannot be skipped. */
  currentGoals?: readonly CharacterKnowledge[];
  knowledge?: readonly CharacterKnowledge[];
  memories?: readonly CharacterMemory[];
  /** 生死状态必须进入提示词，否则模型会把已故人物当成在场角色继续写。 */
  alive?: boolean;
  deathDate?: string | null;
}

/** Structurally compatible with SceneSelectionResult while preserving its order. */
export interface CharacterPromptSelection {
  full: readonly CharacterPromptCandidate[];
  compact: readonly CharacterPromptCandidate[];
  omittedCount?: number;
}

const KNOWLEDGE_VISIBILITIES = new Set<KnowledgeVisibility>([
  'public',
  'player',
  'restricted',
  'rumor',
  'secret',
  'system',
]);

/** Neutralizes XML-like protocol delimiters while retaining readable text. */
function neutralizeProtocolDelimiters(value: string): string {
  return value.replace(/</g, '＜').replace(/>/g, '＞');
}

function singleLine(value: unknown): string {
  if (typeof value !== 'string') return '';
  const oneLine = value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
  return neutralizeProtocolDelimiters(stripEmoji(oneLine));
}

function safeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map(singleLine).filter(Boolean);
}

function isValidCharacterDate(value: string): boolean {
  const match = /^(\d{1,6})\.(\d{1,2})\.(\d{1,2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isSafeInteger(year) || month < 1 || month > 12 || day < 1) return false;

  const leapYear = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function isKnowledge(value: unknown): value is CharacterKnowledge {
  if (!value || typeof value !== 'object') return false;
  const fact = value as Partial<CharacterKnowledge>;
  return typeof fact.id === 'string'
    && typeof fact.field === 'string'
    && typeof fact.value === 'string'
    && typeof fact.visibility === 'string'
    && KNOWLEDGE_VISIBILITIES.has(fact.visibility as KnowledgeVisibility)
    && (fact.validFrom === undefined || (
      typeof fact.validFrom === 'string' && isValidCharacterDate(fact.validFrom)
    ))
    && (fact.validTo === undefined || (
      typeof fact.validTo === 'string' && isValidCharacterDate(fact.validTo)
    ))
    && (fact.knownBy === undefined || (
      Array.isArray(fact.knownBy) && fact.knownBy.every((id) => typeof id === 'string')
    ));
}

function visibleKnowledgeLines(
  values: unknown,
  viewer: KnowledgeViewerContext,
  currentDate: string,
): string[] {
  // An invalid viewer date must not turn into the infinity fallback used by the
  // lower-level projector, because that could expose future records.
  if (!isValidCharacterDate(currentDate) || !Array.isArray(values)) return [];
  const safeFacts = values.filter(isKnowledge);

  return visibleFacts(safeFacts, viewer, currentDate)
    .slice(0, 4)
    .map((fact) => {
      const field = singleLine(fact.field);
      const value = singleLine(fact.value);
      return field && value ? `${field}：${value}` : '';
    })
    .filter(Boolean);
}

function isMemory(value: unknown): value is CharacterMemory {
  if (!value || typeof value !== 'object') return false;
  const memory = value as Partial<CharacterMemory>;
  return typeof memory.id === 'string'
    && typeof memory.characterId === 'string'
    && typeof memory.event === 'string'
    && typeof memory.visibility === 'string'
    && KNOWLEDGE_VISIBILITIES.has(memory.visibility as KnowledgeVisibility)
    && Array.isArray(memory.participants)
    && memory.participants.every((id) => typeof id === 'string');
}

function visibleMemoryLines(
  candidate: CharacterPromptCandidate,
  viewer: KnowledgeViewerContext,
): string[] {
  if (!Array.isArray(candidate.memories)) return [];
  return candidate.memories
    .filter(isMemory)
    .filter((memory) => visibleMemories([memory], viewer).length > 0)
    .sort((left, right) => right.importance - left.importance || right.turn - left.turn)
    .slice(0, 3)
    .map((memory) => singleLine(memory.event))
    .filter(Boolean);
}

function relationText(value: CharacterPromptCandidate['relationToViewer']): string {
  if (typeof value === 'string') return singleLine(value);
  if (!value || typeof value !== 'object') return '';
  return singleLine(relationshipSummary(value));
}

/**
 * 生死是一等叙事事实：不写出来，模型就会把已故人物当作可交谈的在场角色。
 * 只输出存亡与死亡日期；死因与凶手可能属于未获知的秘密，不进提示词。
 */
function lifeStatusText(candidate: CharacterPromptCandidate): string {
  if (typeof candidate.alive !== 'boolean') return '';
  if (candidate.alive) return '在世';
  const date = singleLine(candidate.deathDate ?? '');
  return date ? `已故（卒于 ${date} AC），不可作为在场角色出现` : '已故，不可作为在场角色出现';
}

function appendOptionalLine(lines: string[], label: string, value: string): void {
  if (value) lines.push(`- ${label}: ${value}`);
}

function appendOptionalList(lines: string[], label: string, values: readonly string[]): void {
  if (values.length) lines.push(`- ${label}: ${values.join('；')}`);
}

function formatFullCard(
  candidate: CharacterPromptCandidate,
  viewer: KnowledgeViewerContext,
  currentDate: string,
): string {
  const lines = ['##### 完整人物'];
  appendOptionalLine(lines, '稳定人物 ID', singleLine(candidate.id));
  appendOptionalLine(lines, '姓名', singleLine(candidate.name));
  appendOptionalLine(lines, '公开身份', singleLine(candidate.publicIdentity) || singleLine(candidate.role));
  appendOptionalLine(lines, '存亡', lifeStatusText(candidate));
  appendOptionalLine(lines, '地点', singleLine(candidate.locationName));
  appendOptionalLine(lines, '关系', relationText(candidate.relationToViewer));
  appendOptionalList(lines, '特质', safeStringList(candidate.visibleTraits).slice(0, 6));
  appendOptionalList(lines, '目标', visibleKnowledgeLines(candidate.currentGoals, viewer, currentDate));
  appendOptionalList(lines, '记忆', visibleMemoryLines(candidate, viewer));
  appendOptionalList(lines, '知识', visibleKnowledgeLines(candidate.knowledge, viewer, currentDate));
  return lines.join('\n');
}

function formatCompactCard(candidate: CharacterPromptCandidate): string {
  const lines = ['##### 轻量人物'];
  appendOptionalLine(lines, '稳定人物 ID', singleLine(candidate.id));
  appendOptionalLine(lines, '姓名', singleLine(candidate.name));
  appendOptionalLine(lines, '角色', singleLine(candidate.role));
  appendOptionalLine(lines, '存亡', lifeStatusText(candidate));
  appendOptionalLine(lines, '地点', singleLine(candidate.locationName));
  appendOptionalLine(lines, '关系', relationText(candidate.relationToViewer));
  return lines.join('\n');
}

/**
 * Formats only the already selected cast. It neither loads the character
 * repository nor expands/reorders the selector result.
 */
export function buildCharacterPromptSlice(
  selection: CharacterPromptSelection | SceneSelectionResult,
  viewer: KnowledgeViewerContext,
  currentDate: string,
): string {
  const lines = [
    '### 【当前场景人物上下文】',
    '- 以下内容只代表玩家在当前时间可见的信息，不得补全秘密、系统真相或原著未来。',
    '- 叙事必须使用人物中文名；state_cmd 必须使用对应的稳定人物 ID。',
  ];

  if (selection.full.length) {
    lines.push('', '#### 【完整人物卡】');
    for (const candidate of selection.full) {
      lines.push(formatFullCard(candidate as CharacterPromptCandidate, viewer, currentDate));
    }
  }

  if (selection.compact.length) {
    lines.push('', '#### 【轻量人物卡】');
    for (const candidate of selection.compact) {
      lines.push(formatCompactCard(candidate as CharacterPromptCandidate));
    }
  }

  return lines.join('\n');
}
