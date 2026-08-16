import type { CharacterCanonTier, CharacterId } from './types';

/** A resolved character candidate together with the scene-local facts used for ranking. */
export interface SceneCharacterCandidate {
  id: CharacterId;
  name: string;
  kind?: string;
  canonTier?: CharacterCanonTier;
  isTechnical?: boolean;
  isGenealogy?: boolean;
  isInteractive?: boolean;
  directlyNamed?: boolean;
  isCurrentSpeaker?: boolean;
  isPresent?: boolean;
  isEventParticipant?: boolean;
  hasStrongRelationship?: boolean;
  recentlyInteracted?: boolean;
  recentInteractionRank?: number;
  [key: string]: unknown;
}

export interface RecentInteraction {
  id: CharacterId;
  /** Smaller values mean more recent. */
  turnsAgo?: number;
}

export interface SceneSelectionInput {
  candidates: readonly SceneCharacterCandidate[];
  directlyNamedIds?: readonly CharacterId[];
  currentSpeakerId?: CharacterId | null;
  currentSpeakerIds?: readonly CharacterId[];
  presentCharacterIds?: readonly CharacterId[];
  eventParticipantIds?: readonly CharacterId[];
  strongRelationshipIds?: readonly CharacterId[];
  recentInteractionIds?: readonly CharacterId[];
  recentInteractions?: readonly RecentInteraction[];
}

export interface SceneSelectionResult {
  /** Full state cards sent to the model, normally capped at twelve. */
  full: SceneCharacterCandidate[];
  /** Relevant candidates that lost the full-card cap, sent as lightweight cards. */
  compact: SceneCharacterCandidate[];
  /** Number of eligible candidates represented by compact cards. */
  omittedCount: number;
}

const FULL_CARD_LIMIT = 12;
const DIRECT_MENTION_SCORE = 1_000;
const CURRENT_SPEAKER_SCORE = 900;
const PRESENT_SCORE = 400;
const EVENT_PARTICIPANT_SCORE = 300;
const STRONG_RELATIONSHIP_SCORE = 200;
const RECENT_INTERACTION_SCORE = 100;

interface ScoredCandidate {
  candidate: SceneCharacterCandidate;
  score: number;
  forceRetain: boolean;
}

function idsToSet(ids: readonly CharacterId[] | undefined): Set<CharacterId> {
  return new Set(ids ?? []);
}

function isTechnicalOrGenealogy(candidate: SceneCharacterCandidate): boolean {
  const kind = candidate.kind?.toLowerCase();
  const canonTier = candidate.canonTier;
  return candidate.isTechnical === true
    || candidate.isGenealogy === true
    || candidate.isInteractive === false
    || kind === 'technical'
    || kind === 'genealogy'
    || canonTier === 'genealogy';
}

function recentInteractionScores(input: SceneSelectionInput): Map<CharacterId, number> {
  const scores = new Map<CharacterId, number>();

  for (const [index, id] of (input.recentInteractionIds ?? []).entries()) {
    scores.set(id, Math.max(scores.get(id) ?? 0, RECENT_INTERACTION_SCORE - index));
  }

  for (const interaction of input.recentInteractions ?? []) {
    const recency = interaction.turnsAgo === undefined
      ? RECENT_INTERACTION_SCORE
      : Math.max(1, RECENT_INTERACTION_SCORE - Math.max(0, interaction.turnsAgo));
    scores.set(interaction.id, Math.max(scores.get(interaction.id) ?? 0, recency));
  }

  return scores;
}

function scoreCandidates(input: SceneSelectionInput): ScoredCandidate[] {
  const namedIds = idsToSet(input.directlyNamedIds);
  const speakerIds = idsToSet(input.currentSpeakerIds);
  if (input.currentSpeakerId) speakerIds.add(input.currentSpeakerId);
  const presentIds = idsToSet(input.presentCharacterIds);
  const eventParticipantIds = idsToSet(input.eventParticipantIds);
  const strongRelationshipIds = idsToSet(input.strongRelationshipIds);
  const recentScores = recentInteractionScores(input);
  const seenIds = new Set<CharacterId>();

  return input.candidates
    .filter((candidate) => !isTechnicalOrGenealogy(candidate))
    .filter((candidate) => {
      if (seenIds.has(candidate.id)) return false;
      seenIds.add(candidate.id);
      return true;
    })
    .map((candidate) => {
      const directlyNamed = namedIds.has(candidate.id) || candidate.directlyNamed === true;
      const currentSpeaker = speakerIds.has(candidate.id) || candidate.isCurrentSpeaker === true;
      const present = presentIds.has(candidate.id) || candidate.isPresent === true;
      const eventParticipant = eventParticipantIds.has(candidate.id) || candidate.isEventParticipant === true;
      const strongRelationship = strongRelationshipIds.has(candidate.id) || candidate.hasStrongRelationship === true;
      const recentInteraction = recentScores.get(candidate.id)
        ?? (candidate.recentlyInteracted === true ? RECENT_INTERACTION_SCORE : 0);
      const candidateRecentScore = candidate.recentInteractionRank === undefined
        ? recentInteraction
        : Math.max(1, RECENT_INTERACTION_SCORE - Math.max(0, candidate.recentInteractionRank));

      return {
        candidate,
        score: (directlyNamed ? DIRECT_MENTION_SCORE : 0)
          + (currentSpeaker ? CURRENT_SPEAKER_SCORE : 0)
          + (present ? PRESENT_SCORE : 0)
          + (eventParticipant ? EVENT_PARTICIPANT_SCORE : 0)
          + (strongRelationship ? STRONG_RELATIONSHIP_SCORE : 0)
          + candidateRecentScore,
        forceRetain: directlyNamed || currentSpeaker,
      };
    });
}

function compareScoredCandidates(left: ScoredCandidate, right: ScoredCandidate): number {
  if (right.score !== left.score) return right.score - left.score;
  return left.candidate.id < right.candidate.id ? -1 : left.candidate.id > right.candidate.id ? 1 : 0;
}

/**
 * Selects a deterministic, knowledge-safe cast for one scene.
 *
 * Direct mentions and active speakers are ledger-forced into `full`. If their
 * count exceeds the normal twelve-card budget, the budget is intentionally
 * overflowed for those forced cards; all other eligible candidates become
 * compact cards and are counted by `omittedCount`.
 */
export function selectSceneCharacters(input: SceneSelectionInput): SceneSelectionResult {
  const ranked = scoreCandidates(input).sort(compareScoredCandidates);
  const forced = ranked.filter((entry) => entry.forceRetain);

  let fullEntries: ScoredCandidate[];
  if (forced.length > FULL_CARD_LIMIT) {
    fullEntries = forced;
  } else {
    // Reserve the ledger budget for every forced character before considering
    // any scored, non-forced candidate. Ranking still controls their output order.
    const selectedIds = new Set(forced.map((entry) => entry.candidate.id));
    for (const entry of ranked) {
      if (entry.forceRetain) continue;
      if (selectedIds.size >= FULL_CARD_LIMIT) break;
      selectedIds.add(entry.candidate.id);
    }
    fullEntries = ranked.filter((entry) => selectedIds.has(entry.candidate.id));
  }

  const fullIds = new Set(fullEntries.map((entry) => entry.candidate.id));
  const compact = ranked
    .filter((entry) => !fullIds.has(entry.candidate.id))
    .map((entry) => entry.candidate);

  return {
    full: fullEntries.map((entry) => entry.candidate),
    compact,
    omittedCount: compact.length,
  };
}
