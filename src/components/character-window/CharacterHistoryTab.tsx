import type { CharacterDossier, NpcCharacterDossier, PlayerCharacterDossier } from '../../features/characters/characterDossier';
import type { CharacterExperience } from '../../features/characters/characterSupplementTypes';
import type { WorldEventDisplay } from '../../features/world/worldDisplayResolver';
import { factsForCharacter } from '../../features/world/worldHistoryProjection';
import type { WorldEvent } from '../../features/world/worldRuntimeTypes';
import { extractNarrativeContent } from '../../services/modelProtocol';
import type { StoryTurn } from '../../types/game';
import { EmptyState, SectionTitle } from './CharacterOverview';

function CharacterNarrativeProfile({ dossier }: { dossier: CharacterDossier }) {
  const hasNarrative = Boolean(
    (dossier.publicRoles && dossier.publicRoles.length > 0) ||
    dossier.appearance ||
    dossier.personality ||
    dossier.reputation
  );
  if (!hasNarrative) return null;

  return (
    <section className="space-y-3 rounded border border-hairline/80 bg-ink-2/60 p-3.5" aria-label="个人生平概述" data-character-narrative-profile>
      {dossier.publicRoles && dossier.publicRoles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-character-public-roles>
          <span className="eyebrow !text-[9.5px]">公开身份:</span>
          {dossier.publicRoles.map((role) => (
            <span key={role} className="rounded border border-gold-deep/30 bg-gold-deep/15 px-1.5 py-0.5 font-serif text-[10.5px] font-semibold text-gold">
              {role}
            </span>
          ))}
        </div>
      )}
      {dossier.appearance && (
        <div data-character-appearance>
          <span className="eyebrow !text-[9.5px]">外貌特征:</span>
          <p className="mt-0.5 font-serif text-[11px] leading-relaxed text-parchment-dim">{dossier.appearance}</p>
        </div>
      )}
      {dossier.personality && (
        <div data-character-personality>
          <span className="eyebrow !text-[9.5px]">性格作风:</span>
          <p className="mt-0.5 font-serif text-[11px] leading-relaxed text-parchment-dim">{dossier.personality}</p>
        </div>
      )}
      {dossier.reputation && (
        <div data-character-reputation>
          <span className="eyebrow !text-[9.5px]">声誉风评:</span>
          <p className="mt-0.5 font-serif text-[11px] leading-relaxed text-parchment-dim">{dossier.reputation}</p>
        </div>
      )}
    </section>
  );
}

function CharacterExperiencesList({ experiences }: { experiences?: CharacterExperience[] }) {
  if (!experiences || experiences.length === 0) return null;
  return (
    <div className="space-y-3" data-character-historical-experiences>
      <div className="border-b border-hairline/70 pb-1">
        <p className="eyebrow">重要历史经历</p>
      </div>
      <ol className="flex flex-col">
        {experiences.map((exp, idx) => (
          <li key={`${exp.date}-${exp.title}-${idx}`} className="border-b border-hairline/60 py-3 last:border-b-0">
            <strong className="font-mono text-[10px] tracking-wider text-gold">{exp.date} AC</strong>
            <p className="mt-1 font-serif text-[11.5px] font-semibold text-parchment">{exp.title}</p>
            <p className="mt-1 font-serif text-[10.5px] leading-relaxed text-parchment-dim">{exp.description}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CharacterSourceLinks({ sources }: { sources?: string[] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="border-t border-hairline/50 pt-2 text-[9.5px] text-parchment-faint" data-character-source-links>
      <span className="eyebrow !text-[9px]">参考资料: </span>
      {sources.map((url, i) => (
        <span key={url}>
          {i > 0 && ' · '}
          <a href={url} target="_blank" rel="noreferrer" className="text-gold-dim hover:text-gold hover:underline">
            来源 {i + 1}
          </a>
        </span>
      ))}
    </div>
  );
}

function PlayerHistoryTab({ turns, dossier }: { turns: StoryTurn[]; dossier: PlayerCharacterDossier }) {
  const recentTurns = turns.slice(-8).reverse();
  const hasNarrative = Boolean(
    (dossier.publicRoles && dossier.publicRoles.length > 0) ||
    dossier.appearance ||
    dossier.personality ||
    dossier.reputation
  );
  const hasExperiences = Boolean(dossier.supplementExperiences && dossier.supplementExperiences.length > 0);

  return (
    <div className="space-y-5 px-5 py-5">
      <SectionTitle title="记忆与经历" subtitle="从已发生的场景与人物卷宗中整理" />
      <CharacterNarrativeProfile dossier={dossier} />
      <CharacterExperiencesList experiences={dossier.supplementExperiences} />
      {recentTurns.length > 0 ? (
        <div className="space-y-3">
          {hasExperiences && (
            <div className="border-b border-hairline/70 pb-1">
              <p className="eyebrow">近期剧情经历</p>
            </div>
          )}
          <ol className="flex flex-col">
            {recentTurns.map((turn) => (
              <li key={turn.id} className="border-b border-hairline/60 py-3 last:border-b-0">
                <div className="flex items-baseline justify-between gap-2">
                  <strong className="font-mono text-[10px] tracking-wider text-gold">TURN {turn.turnNumber}</strong>
                  <span className="text-[9px] text-parchment-faint">{turn.gameDate || '日期未记录'}</span>
                </div>
                <p className="mt-1 line-clamp-2 font-serif text-[11px] leading-relaxed text-parchment-dim">{extractNarrativeContent(turn.narrate) || turn.playerInput}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        !hasNarrative && !hasExperiences && <EmptyState label="尚无可记录的经历" />
      )}
      <CharacterSourceLinks sources={dossier.sourceUrls} />
    </div>
  );
}

function NpcHistoryTab({ dossier, worldEvents, worldEventDisplays }: { dossier: NpcCharacterDossier; worldEvents: readonly WorldEvent[]; worldEventDisplays: ReadonlyMap<string, WorldEventDisplay> }) {
  const memories = [...dossier.memories].sort((a, b) => b.turn - a.turn || b.importance - a.importance);
  const worldFacts = factsForCharacter(worldEvents, dossier.id).slice().reverse();
  const hasNarrative = Boolean(
    (dossier.publicRoles && dossier.publicRoles.length > 0) ||
    dossier.appearance ||
    dossier.personality ||
    dossier.reputation
  );
  const hasExperiences = Boolean(dossier.supplementExperiences && dossier.supplementExperiences.length > 0);

  return (
    <div className="space-y-5 px-5 py-5">
      <SectionTitle title="记忆与经历" subtitle="展示人物公开履历、生平记忆与世界历史记录" />
      <CharacterNarrativeProfile dossier={dossier} />
      <CharacterExperiencesList experiences={dossier.supplementExperiences} />
      {worldFacts.length > 0 && (
        <div className="space-y-3">
          <div className="border-b border-hairline/70 pb-1">
            <p className="eyebrow">世界事实记录</p>
          </div>
          <ol className="flex flex-col" data-character-world-facts>
            {worldFacts.map((fact) => (
              <li key={fact.id} className="border-b border-hairline/60 py-3 last:border-b-0">
                <strong className="font-mono text-[10px] tracking-wider text-gold">{fact.date.year} AC · {fact.date.month}月{fact.date.day}日</strong>
                <p className="mt-1 font-serif text-[11px] font-semibold text-parchment">{worldEventDisplays.get(fact.id)?.title ?? fact.reason}</p>
                {worldEventDisplays.get(fact.id)?.entities.length ? (
                  <p className="mt-1 font-serif text-[10.5px] leading-relaxed text-gold-dim">{worldEventDisplays.get(fact.id)!.entities.map((entity) => entity.label).join(' · ')}</p>
                ) : null}
                {worldEventDisplays.get(fact.id) && (
                  <details className="mt-1 text-[9px] text-parchment-faint/70">
                    <summary className="cursor-pointer select-none">技术记录</summary>
                    <p>{worldEventDisplays.get(fact.id)!.audit.eventType} · {worldEventDisplays.get(fact.id)!.audit.source} · {worldEventDisplays.get(fact.id)!.audit.transactionId}</p>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      {memories.length > 0 ? (
        <div className="space-y-3">
          <div className="border-b border-hairline/70 pb-1">
            <p className="eyebrow">个人记忆</p>
          </div>
          <ol className="flex flex-col">
            {memories.map((memory) => (
              <li key={memory.id} className="border-b border-hairline/60 py-3 last:border-b-0">
                <strong className="font-mono text-[10px] tracking-wider text-gold">TURN {memory.turn}</strong>
                <p className="mt-1 font-serif text-[11px] leading-relaxed text-parchment-dim">{memory.event}</p>
                {memory.attitude && <p className="mt-1 text-[9px] text-parchment-faint">态度:{memory.attitude}</p>}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        !hasNarrative && !hasExperiences && worldFacts.length === 0 && (
          <EmptyState label="当前存档尚未记录此人的个人记忆" />
        )
      )}
      <CharacterSourceLinks sources={dossier.sourceUrls} />
    </div>
  );
}


export function CharacterHistoryTab({ dossier, turns, worldEvents, worldEventDisplays }: {
  dossier: CharacterDossier;
  turns: StoryTurn[];
  worldEvents: readonly WorldEvent[];
  worldEventDisplays: ReadonlyMap<string, WorldEventDisplay>;
}) {
  return dossier.kind === 'player'
    ? <PlayerHistoryTab turns={turns} dossier={dossier} />
    : <NpcHistoryTab dossier={dossier} worldEvents={worldEvents} worldEventDisplays={worldEventDisplays} />;
}
