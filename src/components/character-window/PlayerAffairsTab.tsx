import type { ReactNode } from 'react';
import { CalendarDays, Hourglass, MessageSquareText, ScrollText, Sparkles, Waypoints } from 'lucide-react';
import type { CharacterId } from '../../domain/characterId';
import { openSocialOffersForViewer, roleplayCommitmentsForViewer } from '../../features/roleplay/state';
import type { PendingWorldTransaction } from '../../features/world/worldRuntimeTypes';
import type { GameState } from '../../types/game';
import { CHARACTER_TRAITS } from '../../data/characterTraits';
import { learningRoute } from '../../features/characters/creationTraitRules';
import { EmptyState, SectionTitle } from './CharacterOverview';

export function PlayerAffairsTab({ gameState }: { gameState: GameState }) {
  const playerId = (gameState.lord.canonicalCharacterId
    ?? `save:${gameState.worldCharacters?.runId ?? 'current'}:player`) as CharacterId;
  const roleplay = gameState.roleplay;
  const learningTargets = CHARACTER_TRAITS.filter((trait) => gameState.characterCreationDraft?.learningTraitIds?.includes(trait.id));
  const commitments = roleplayCommitmentsForViewer(roleplay, playerId);
  const offers = openSocialOffersForViewer(roleplay, playerId);
  const messages = (roleplay?.messages ?? [])
    .filter((entry) => entry.senderId === playerId || entry.recipientIds.includes(playerId))
    .filter((entry) => entry.status === 'in_transit' || entry.status === 'delivered')
    .slice()
    .reverse();
  const agendas = (roleplay?.agendas ?? [])
    .filter((entry) => entry.heardByIds.includes(playerId))
    .filter((entry) => entry.status !== 'resolved' && entry.status !== 'cancelled')
    .slice()
    .reverse();
  const projects = (roleplay?.projects ?? [])
    .filter((entry) => entry.ownerId === playerId || entry.assigneeId === playerId)
    .filter((entry) => !['resolved', 'failed', 'cancelled'].includes(entry.status))
    .slice()
    .reverse();
  const growth = (roleplay?.growthOpportunities ?? [])
    .filter((entry) => entry.status === 'open')
    .slice()
    .reverse();
  const pendingTransactions = gameState.worldRuntime.pendingTransactions.filter((entry) => entry.status === 'pending');
  const journey = gameState.activeJourney;
  const hasAnything = Boolean(
    journey
      || commitments.length
      || offers.length
      || messages.length
      || agendas.length
      || projects.length
      || growth.length
      || learningTargets.length
      || pendingTransactions.length,
  );

  return (
    <div className="space-y-5 px-5 py-5" aria-label="当前事务">
      <SectionTitle title="事务" subtitle="完整列出仍在进行、等待回应或尚未结算的个人事项" />
      {learningTargets.length > 0 && <AffairSection title="成长方向" icon={<Sparkles className="h-3.5 w-3.5" />} count={learningTargets.length}>
        {learningTargets.map((trait) => {
          const mastered = gameState.lord.traitIds?.includes(trait.id);
          const opportunity = growth.find((entry) => entry.options.some((option) => option.effect.kind === 'trait' && option.effect.traitId === trait.id));
          return <AffairEntry key={trait.id} title={`${trait.name} · ${mastered ? '已掌握' : opportunity ? '已有成长机会，等待选择' : '尚在积累经历'}`} detail={mastered ? '这一方向已经成为人物的实际特质。' : learningRoute(trait)} />;
        })}
      </AffairSection>}

      <section className="grid grid-cols-2 gap-2" aria-label="当前时点">
        <div className="border border-hairline bg-ink-2/60 p-3">
          <span className="flex items-center gap-1.5 text-[9px] tracking-wider text-gold-deep"><CalendarDays className="h-3 w-3" />当前时点</span>
          <strong className="mt-1 block font-serif text-[11px] text-parchment">{gameState.currentYear} AC · {gameState.currentMonth}月{gameState.currentDay}日</strong>
          <span className="mt-0.5 block text-[9px] text-parchment-faint">{gameState.currentSeason}</span>
        </div>
        <div className="border border-hairline bg-ink-2/60 p-3">
          <span className="flex items-center gap-1.5 text-[9px] tracking-wider text-gold-deep"><Hourglass className="h-3 w-3" />待结算</span>
          <strong className="mt-1 block font-serif text-[11px] text-parchment">{pendingTransactions.length} 项</strong>
          <span className="mt-0.5 block text-[9px] text-parchment-faint">世界状态事务队列</span>
        </div>
      </section>

      {journey && (
        <AffairSection title="旅程" icon={<Waypoints className="h-3.5 w-3.5" />}>
          <AffairEntry
            title={`${journey.status === 'paused' ? '旅程暂停' : '旅程进行中'} · 第 ${journey.progressDays + 1} 天`}
            detail={`${journey.locationLabels?.[journey.routePlan.from] ?? journey.routePlan.from} → ${journey.locationLabels?.[journey.routePlan.to] ?? journey.routePlan.to}`}
          />
        </AffairSection>
      )}

      {offers.length > 0 && (
        <AffairSection title="待回应条件" icon={<MessageSquareText className="h-3.5 w-3.5" />} count={offers.length}>
          {offers.map((entry) => <AffairEntry key={entry.id} title={entry.summary} detail={`交涉 ${entry.exchangeId}`} />)}
        </AffairSection>
      )}

      {commitments.length > 0 && (
        <AffairSection title="承诺" icon={<ScrollText className="h-3.5 w-3.5" />} count={commitments.length}>
          {commitments.map((entry) => (
            <AffairEntry
              key={entry.id}
              title={entry.terms}
              detail={`${entry.debtorId === playerId ? '由你履行' : '等待对方履行'}${entry.dueDate ? ` · 期限 ${entry.dueDate}` : ' · 未约定期限'}`}
            />
          ))}
        </AffairSection>
      )}

      {agendas.length > 0 && (
        <AffairSection title="议程" icon={<CalendarDays className="h-3.5 w-3.5" />} count={agendas.length}>
          {agendas.map((entry) => (
            <AffairEntry key={entry.id} title={entry.summary} detail={`${entry.status === 'due' ? '现在需要回应' : '已经约定'}${entry.dueDate ? ` · ${entry.dueDate}` : ''}`} />
          ))}
        </AffairSection>
      )}

      {projects.length > 0 && (
        <AffairSection title="委派与计划" icon={<Hourglass className="h-3.5 w-3.5" />} count={projects.length}>
          {projects.map((entry) => (
            <AffairEntry key={entry.id} title={entry.objective} detail={`${entry.status === 'due' ? '已经到期' : '进行中'} · 期限 ${entry.dueDate}`} />
          ))}
        </AffairSection>
      )}

      {messages.length > 0 && (
        <AffairSection title="消息" icon={<MessageSquareText className="h-3.5 w-3.5" />} count={messages.length}>
          {messages.map((entry) => (
            <AffairEntry key={entry.id} title={entry.summary} detail={entry.status === 'in_transit' ? `在途 · 预计 ${entry.arrivesOn}` : `已送达 · ${entry.arrivesOn}`} />
          ))}
        </AffairSection>
      )}

      {growth.length > 0 && (
        <AffairSection title="成长机会" icon={<Sparkles className="h-3.5 w-3.5" />} count={growth.length}>
          {growth.map((entry) => (
            <AffairEntry key={entry.id} title={entry.summary} detail={entry.options.map((option) => option.label).join(' / ')} />
          ))}
        </AffairSection>
      )}

      {pendingTransactions.length > 0 && (
        <AffairSection title="待结算事务" icon={<Hourglass className="h-3.5 w-3.5" />} count={pendingTransactions.length}>
          {pendingTransactions.map((entry) => (
            <AffairEntry
              key={entry.id}
              title={pendingTransactionTitle(entry)}
              detail={`来源：${entry.source === 'player_input' ? '自然语言行动' : '界面操作'} · ${entry.id}`}
            />
          ))}
        </AffairSection>
      )}

      {!hasAnything && <EmptyState label="当前没有仍在进行、等待回应或尚未结算的事务。" />}
    </div>
  );
}

function pendingTransactionTitle(entry: PendingWorldTransaction): string {
  const intentKinds = [...new Set(entry.intents.map((intent) => intent.kind))];
  if (intentKinds.length) return intentKinds.join(' · ');
  if (entry.travelCommands?.length) return `旅行命令 ×${entry.travelCommands.length}`;
  if (entry.itemCommands?.length) return `物品命令 ×${entry.itemCommands.length}`;
  return '世界状态事务';
}

function AffairSection({ title, icon, count, children }: { title: string; icon: ReactNode; count?: number; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="flex items-center justify-between border-b border-hairline/70 pb-1.5">
        <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-gold">{icon}{title}</span>
        {typeof count === 'number' && <span className="font-mono text-[9px] text-parchment-faint">{count} 项</span>}
      </div>
      <div className="divide-y divide-hairline/60">{children}</div>
    </section>
  );
}

function AffairEntry({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="py-2.5">
      <p className="font-serif text-[11px] leading-relaxed text-parchment-dim">{title}</p>
      {detail && <p className="mt-0.5 font-serif text-[9px] leading-relaxed text-parchment-faint">{detail}</p>}
    </div>
  );
}
