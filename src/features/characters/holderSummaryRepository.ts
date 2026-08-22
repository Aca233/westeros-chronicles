import { worldContentRepository } from '../world-content/repository';
import type { HolderSummary } from '../world-content/types';
import type { CharacterEventEnvelope } from './characterEventTypes';
import { resolveCharacter } from './characterProjector';
import type { CharacterId, ResolvedCharacter, StaticCharacterRecord } from './types';

/**
 * Background title holders stay out of the simulated roster. This repository
 * exposes their lightweight summaries for political display and explicit
 * direct-interaction paths only.
 */
export class HolderSummaryRepository {
  private holdersPromise?: Promise<HolderSummary[]>;

  constructor(
    private readonly loadSummaries: () => Promise<HolderSummary[]> = () => worldContentRepository.loadHolderSummaries(),
  ) {}

  private loadAll(): Promise<HolderSummary[]> {
    this.holdersPromise ??= this.loadSummaries();
    return this.holdersPromise;
  }

  async get(id: CharacterId | string): Promise<HolderSummary | undefined> {
    const holders = await this.loadAll();
    return holders.find((summary) => summary.id === id);
  }

  async findByTitleIds(titleIds: readonly string[]): Promise<HolderSummary[]> {
    const wanted = new Set(titleIds);
    if (wanted.size === 0) return [];
    const holders = await this.loadAll();
    return holders.filter((summary) => summary.titleIds.some((titleId) => wanted.has(titleId)));
  }
}

/**
 * Materializes one summary into a full character shape for an explicit,
 * player-driven interaction. The archive record supplies structure and the
 * summary stays authoritative for display facts; nothing here feeds the
 * automatic world pulse.
 */
export function materializeHolderSummary(
  summary: HolderSummary,
  archiveRecord: StaticCharacterRecord,
  events: readonly CharacterEventEnvelope[] = [],
): ResolvedCharacter {
  const resolved = resolveCharacter(archiveRecord, events, {
    datasetVersion: 'holder-summary',
    currentYear: 8298,
  });
  return {
    ...resolved,
    id: summary.id,
    name: summary.name,
    ...(summary.dynastyId ? { dynastyId: summary.dynastyId } : {}),
    alive: summary.alive,
    titleIds: [...summary.titleIds],
    titles: [...summary.titleIds],
  };
}
