import { MapPin, MessageSquareText, ScrollText, UsersRound } from 'lucide-react';
import type { CharacterId } from '../../domain/characterId';
import type { CharacterDossier } from '../../features/characters/characterDossier';
import type { GameState } from '../../types/game';
import { openSocialOffersForViewer, relationshipEvidenceForViewer } from '../../features/roleplay/state';
import { EmptyState, SectionTitle } from './CharacterOverview';

interface CurrentEntry {
  id: string;
  label: string;
  detail?: string;
}

function playerCharacterId(gameState: GameState): CharacterId {
  return (gameState.lord.canonicalCharacterId
    ?? `save:${gameState.worldCharacters?.runId ?? 'current'}:player`) as CharacterId;
}

function currentEntries(dossier: CharacterDossier, gameState: GameState): CurrentEntry[] {
  const roleplay = gameState.roleplay;
  if (!roleplay) return [];
  const viewerId = playerCharacterId(gameState);
  const subjectId = dossier.worldCharacterId;
  const knownSocialIds = new Set(roleplay.socialEvents
    .filter((event) => event.heardByIds.includes(viewerId))
    .map((event) => event.id));
  const entries: CurrentEntry[] = [];

  openSocialOffersForViewer(roleplay, viewerId)
    .filter((entry) => entry.actorId === subjectId || entry.targetIds.includes(subjectId))
    .slice(-3)
    .forEach((entry) => entries.push({
      id: entry.id,
      label: `待回应的条件：${entry.summary}`,
      detail: `交涉 ${entry.exchangeId}`,
    }));

  roleplay.commitments
    .filter((entry) => entry.status === 'open'
      && knownSocialIds.has(entry.sourceEventId)
      && (entry.debtorId === subjectId || entry.creditorIds.includes(subjectId)))
    .slice(-4)
    .forEach((entry) => entries.push({
      id: entry.id,
      label: entry.debtorId === subjectId ? `待履行：${entry.terms}` : `等待对方履行：${entry.terms}`,
      detail: entry.dueDate ? `期限 ${entry.dueDate}` : '未约定期限',
    }));

  (roleplay.messages ?? [])
    .filter((entry) => (entry.senderId === viewerId || entry.recipientIds.includes(viewerId))
      && (entry.senderId === subjectId || entry.recipientIds.includes(subjectId)))
    .slice(-3)
    .forEach((entry) => entries.push({
      id: entry.id,
      label: `${entry.status === 'in_transit' ? '在途消息' : '已送达消息'}：${entry.summary}`,
      detail: entry.arrivesOn,
    }));

  (roleplay.agendas ?? [])
    .filter((entry) => entry.heardByIds.includes(viewerId)
      && entry.status !== 'resolved'
      && entry.status !== 'cancelled'
      && (entry.actorId === subjectId || entry.targetIds.includes(subjectId)))
    .slice(-3)
    .forEach((entry) => entries.push({
      id: entry.id,
      label: `${entry.status === 'due' ? '现在需要回应' : '已约定'}：${entry.summary}`,
      detail: entry.dueDate,
    }));

  (roleplay.projects ?? [])
    .filter((entry) => (entry.ownerId === viewerId || entry.assigneeId === viewerId)
      && (entry.ownerId === subjectId || entry.assigneeId === subjectId)
      && !['resolved', 'failed', 'cancelled'].includes(entry.status))
    .slice(-3)
    .forEach((entry) => entries.push({
      id: entry.id,
      label: `${entry.status === 'due' ? '委派到期' : '委派进行中'}：${entry.objective}`,
      detail: `期限 ${entry.dueDate}`,
    }));

  return entries.slice(-8);
}

function recentInteractions(dossier: CharacterDossier, gameState: GameState): CurrentEntry[] {
  const viewerId = playerCharacterId(gameState);
  const subjectId = dossier.worldCharacterId;
  return (gameState.roleplay?.socialEvents ?? [])
    .filter((event) => event.heardByIds.includes(viewerId)
      && (event.actorId === subjectId || event.targetIds.includes(subjectId)))
    .slice(-3)
    .reverse()
    .map((event) => ({ id: event.id, label: event.summary, detail: `第 ${event.turn} 回合` }));
}

export function CharacterCurrentTab({
  dossier,
  gameState,
  onOpenLocation,
}: {
  dossier: CharacterDossier;
  gameState: GameState;
  onOpenLocation: (locationId: string) => void;
}) {
  const viewerId = playerCharacterId(gameState);
  const subjectId = dossier.worldCharacterId;
  const isPlayer = dossier.kind === 'player';
  const presentIds = gameState.activeScene?.presentCharacterIds ?? [];
  const isPresent = isPlayer || presentIds.includes(subjectId);
  const otherPeopleCount = presentIds.filter((id) => id !== viewerId).length;
  const entries = currentEntries(dossier, gameState);
  const interactions = recentInteractions(dossier, gameState);
  const allSharedEvidence = isPlayer ? [] : relationshipEvidenceForViewer(gameState.roleplay, viewerId, subjectId);
  const sharedEvidence = allSharedEvidence.slice(-4).reverse();
  const sceneName = gameState.activeScene?.location.sceneLocation || gameState.lord.location.sceneLocation || '具体场所未记录';
  // 位置是"处境"不是"身份"：只在眼下这一处显示，并且使用权威世界位置，避免与旧存档字段互相矛盾。
  const locationId = dossier.worldLocation?.locationId;
  const canLocate = Boolean(locationId) && isPresent;
  // 在场者一律用当前场景名，避免与静态档案里的地点互相矛盾；不在场者不读后台实时位置。
  const displayedLocation = canLocate
    ? (gameState.activeScene?.location.sceneLocation || dossier.location || '所在地未记录')
    : '所在地未确认';
  const displayedScene = canLocate
    ? (isPlayer ? sceneName : '与你在同一场景')
    : (isPlayer ? sceneName : '离场后不读取后台实时位置；请依据消息、会面或可追溯情报确认');
  const latestSharedEvidence = sharedEvidence[0];
  // 计数必须用完整列表：sharedEvidence 已截断，用它反推会少报。
  const remainingSharedEvidence = Math.max(0, allSharedEvidence.length - 1);

  return (
    <div className="space-y-5 px-5 pb-6 pt-4" aria-label="眼下情况">
      <SectionTitle title="眼下" subtitle="只列当前可确认、仍能回应并会影响下一步的事情" />

      <section aria-label="当前场景">
        <button
          type="button"
          onClick={() => locationId && onOpenLocation(locationId)}
          disabled={!canLocate}
          className="w-full border border-hairline bg-ink-2/60 p-3 text-left transition-colors enabled:hover:border-gold-deep/60 disabled:cursor-default"
        >
          <span className="flex items-center gap-1.5 text-[9px] tracking-wider text-gold-deep"><MapPin className="h-3 w-3" />当前位置</span>
          <strong className="mt-1 block truncate font-serif text-[11px] text-parchment">{displayedLocation}</strong>
          <span className="mt-0.5 block truncate text-[9px] text-parchment-faint">{displayedScene}</span>
        </button>
      </section>

      <section aria-label="在场情况">
        <div className="flex items-center justify-between border-b border-hairline pb-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-gold"><UsersRound className="h-3.5 w-3.5" />在场</span>
          <span className="text-[9px] text-parchment-faint">{isPlayer ? `${otherPeopleCount} 名其他人物` : isPresent ? '与你同场' : '不在当前场景'}</span>
        </div>
        <p className="py-2.5 font-serif text-[11px] leading-relaxed text-parchment-dim">
          {isPlayer
            ? (otherPeopleCount ? '当前场景已有可直接交谈的人物；可从上方人物目录查看。' : '当前没有其他已确认在场的人物。提及某人不会自动把对方算作在场。')
            : (isPresent ? `${dossier.name}就在当前场景，可以直接观察、交谈或回应。` : `${dossier.name}目前不在你所在的场景；只能依据已知消息行动。`)}
        </p>
      </section>

      <section aria-label="当前事务">
        <div className="flex items-center gap-1.5 border-b border-hairline pb-2 text-[10px] font-bold tracking-[0.14em] text-gold"><ScrollText className="h-3.5 w-3.5" />未了事项</div>
        {entries.length ? entries.map((entry) => (
          <div key={entry.id} className="border-b border-hairline/60 py-2.5 last:border-0">
            <p className="font-serif text-[11px] leading-relaxed text-parchment-dim">{entry.label}</p>
            {entry.detail && <span className="mt-0.5 block text-[9px] text-parchment-faint">{entry.detail}</span>}
          </div>
        )) : <EmptyState label="当前没有已记录的承诺、消息、议程或委派。它们会在实际对话与行动后出现在这里。" />}
      </section>

      <section aria-label="最近互动">
        <div className="flex items-center gap-1.5 border-b border-hairline pb-2 text-[10px] font-bold tracking-[0.14em] text-gold"><MessageSquareText className="h-3.5 w-3.5" />最近互动</div>
        {interactions.length ? interactions.map((entry) => (
          <div key={entry.id} className="border-l border-gold-deep/50 py-1 pl-3 mt-2">
            <p className="font-serif text-[11px] leading-relaxed text-parchment-dim">{entry.label}</p>
            <span className="text-[9px] text-parchment-faint">{entry.detail}</span>
          </div>
        )) : <EmptyState label={isPlayer ? '本周目还没有形成可追溯的社会互动记录。' : `你与${dossier.name}还没有可追溯的当面互动。`} />}
      </section>
      {!isPlayer && (
        <section aria-label="你们之间">
          <div className="flex items-center justify-between border-b border-hairline pb-2">
            <span className="text-[10px] font-bold tracking-[0.14em] text-gold">你们之间</span>
            <span className="text-[9px] text-parchment-faint">最近一次 · 完整经历见“关系”</span>
          </div>
          {latestSharedEvidence ? (
            <>
              <div key={latestSharedEvidence.id} className="border-l border-gold-deep/50 py-1 pl-3 mt-2">
                <p className="font-serif text-[11px] leading-relaxed text-parchment-dim">{latestSharedEvidence.summary}</p>
                <span className="text-[9px] text-parchment-faint">第 {latestSharedEvidence.turn} 回合 · 依据 {latestSharedEvidence.sourceEventId}</span>
              </div>
              {remainingSharedEvidence > 0 && (
                <p className="mt-2 font-serif text-[10px] text-parchment-faint">另有 {remainingSharedEvidence} 条共同经历，见“关系”页。</p>
              )}
            </>
          ) : <EmptyState label="你们之间还没有形成可追溯的共同经历。" />}
        </section>
      )}
    </div>
  );
}
