import React, { useMemo, useState } from 'react';
import { Bug, Copy, X } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { playerWorldEventViewer, selectVisibleWorldEvents } from '../world/worldEventVisibility';
import type { ModelRequestTrace, TracedChatMessage } from './modelRequestTrace';

type DebugTab = 'inspector' | 'xray' | 'model';

function copyText(value: string): void {
  void navigator.clipboard?.writeText(value).catch(() => undefined);
}

function formatMessages(messages: readonly TracedChatMessage[]): string {
  return messages.map((message) => `## ${roleLabel(message.role)}（${message.role}）(${message.chars})\n${message.content}`).join('\n\n');
}

function roleLabel(role: string): string {
  if (role === 'system') return '游戏规则';
  if (role === 'user') return '当前问题';
  if (role === 'assistant') return '上一回合的回答';
  return role;
}

function MessageList({ title, bundle }: { title: string; bundle: ModelRequestTrace['resolution'] }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-serif text-[12px] text-gold">{title} · {bundle.chars} 字</h4>
        <button type="button" className="btn-ghost !px-2 !py-1 !text-[10px]" onClick={() => copyText(formatMessages(bundle.messages))}>
          <Copy className="h-3 w-3" />复制
        </button>
      </div>
      {bundle.messages.map((message, index) => (
        <details key={`${message.role}-${index}`} className="border border-hairline/70 bg-ink-2/60 p-2" open={message.role !== 'system'}>
          <summary className="cursor-pointer select-none font-mono text-[10px] text-parchment-dim">
            {roleLabel(message.role)}（{message.role}）· {message.chars} 字
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-parchment-faint">{message.content}</pre>
        </details>
      ))}
    </section>
  );
}

export const DebugOverlay: React.FC = () => {
  const debugEnabled = useGameStore((state) => state.debugEnabled);
  const setDebugEnabled = useGameStore((state) => state.setDebugEnabled);
  const gameState = useGameStore((state) => state.gameState);
  const turnStage = useGameStore((state) => state.turnStage);
  const isStreaming = useGameStore((state) => state.isStreaming);
  const changesLog = useGameStore((state) => state.changesLog);
  const lastModelRequestTrace = useGameStore((state) => state.lastModelRequestTrace);
  const [tab, setTab] = useState<DebugTab>('inspector');
  const [collapsed, setCollapsed] = useState(false);

  const viewer = useMemo(() => playerWorldEventViewer(gameState), [gameState.lord.canonicalCharacterId, gameState.worldCharacters?.runId]);
  const playerVisibleEvents = useMemo(
    () => selectVisibleWorldEvents(gameState.worldRuntime.events, viewer),
    [gameState.worldRuntime.events, viewer],
  );
  const hiddenEvents = useMemo(() => {
    const visibleIds = new Set(playerVisibleEvents.map((event) => event.id));
    return gameState.worldRuntime.events.filter((event) => !visibleIds.has(event.id));
  }, [gameState.worldRuntime.events, playerVisibleEvents]);

  if (!debugEnabled) return null;

  const pending = gameState.worldRuntime.pendingTransactions.filter((entry) => entry.status === 'pending');
  const rejected = gameState.worldRuntime.pendingTransactions.filter((entry) => entry.status === 'rejected');
  const runtimeCharacters = Object.entries(gameState.worldRuntime.characters);
  const runtimeAssets = Object.entries(gameState.worldRuntime.assets);
  const tabLabel = { inspector: '检查器', xray: '透视', model: '模型请求' } as const;

  const visibleText = tab === 'model' && lastModelRequestTrace
    ? [
      `回合 ${lastModelRequestTrace.turnNumber}`,
      `${lastModelRequestTrace.offline ? '离线演示' : '在线'} · ${lastModelRequestTrace.provider} · ${lastModelRequestTrace.model}`,
      lastModelRequestTrace.contextError ? `上下文失败：${lastModelRequestTrace.contextError}` : '',
      '【自动世界切片】',
      lastModelRequestTrace.worldContext.automatic || '（空）',
      '【结算后世界切片】',
      lastModelRequestTrace.worldContext.committed || '（空）',
      '【解析请求】',
      formatMessages(lastModelRequestTrace.resolution.messages),
      '【叙事请求】',
      formatMessages(lastModelRequestTrace.narration.messages),
    ].filter(Boolean).join('\n\n')
    : tab === 'xray'
      ? [
        ...hiddenEvents.map((event) => `${event.id} · ${event.visibility} · ${event.reason}`),
        ...runtimeCharacters.map(([id, patch]) => `${id} @ ${patch.location?.locationId ?? '无地点'} · ${patch.currentActivity ?? 'idle'}`),
        ...runtimeAssets.map(([id, patch]) => `${id} · ${patch.kind} · ${patch.custodian && 'characterId' in patch.custodian ? patch.custodian.characterId : '无保管人'}`),
      ].join('\n')
      : [
        `阶段 ${turnStage}${isStreaming ? ' · 流式中' : ''}`,
        `${gameState.lord.canonicalCharacterId ?? '未选择人物'} @ ${gameState.lord.location.locationId}`,
        `run ${gameState.worldCharacters?.runId ?? '无'} · ${gameState.worldCharacters?.datasetHash ?? '无'} · r${gameState.worldCharacters?.revision ?? 0}`,
        `事件 公开 ${gameState.worldRuntime.events.filter((event) => event.visibility === 'public').length} / 秘密 ${gameState.worldRuntime.events.filter((event) => event.visibility === 'secret').length} / 玩家可见 ${playerVisibleEvents.length}`,
        ...changesLog.slice(-6),
      ].join('\n');

  return (
    <aside
      className="pointer-events-auto fixed bottom-3 left-3 z-[60] w-[min(92vw,28rem)] border border-gold-deep/50 bg-ink/95 shadow-2xl"
      aria-label="开发调试面板"
      data-debug-overlay
    >
      <header className="flex items-center justify-between gap-2 border-b border-hairline/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Bug className="h-3.5 w-3.5 shrink-0 text-gold" />
          <p className="truncate font-serif text-[12px] font-bold text-parchment">开发调试</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="btn-ghost !px-2 !py-1 !text-[10px]" onClick={() => copyText(visibleText)}>
            <Copy className="h-3 w-3" />复制
          </button>
          <button type="button" className="btn-ghost !px-2 !py-1 !text-[10px]" onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? '展开' : '收起'}
          </button>
          <button type="button" className="btn-ghost !px-1.5" aria-label="关闭开发调试" onClick={() => setDebugEnabled(false)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>
      {!collapsed && (
        <div className="max-h-[min(70vh,32rem)] overflow-y-auto p-3">
          <div className="mb-3 grid grid-cols-3 gap-1">
            {(Object.keys(tabLabel) as DebugTab[]).map((id) => (
              <button
                key={id}
                type="button"
                className={`border px-2 py-1 font-serif text-[11px] ${tab === id ? 'border-gold bg-gold-deep/20 text-gold-bright' : 'border-hairline text-parchment-dim'}`}
                onClick={() => setTab(id)}
              >
                {tabLabel[id]}
              </button>
            ))}
          </div>

          {tab === 'inspector' && (
            <dl className="space-y-1.5 font-mono text-[10.5px] leading-relaxed text-parchment-faint">
              <div>阶段 {turnStage}{isStreaming ? ' · 流式中' : ''}</div>
              <div>存档版本 {gameState.saveFormatVersion} · 回合 {gameState.turnCount} · {gameState.currentYear}.{gameState.currentMonth}.{gameState.currentDay}</div>
              <div>人物 {gameState.lord.canonicalCharacterId ?? '未选择'} · {gameState.lord.name}</div>
              <div>地点 {gameState.lord.location.locationId} · {gameState.lord.locationLabel}</div>
              <div>run {gameState.worldCharacters?.runId ?? '无'}</div>
              <div>dataset {gameState.worldCharacters?.datasetHash ?? '无'} · r{gameState.worldCharacters?.revision ?? 0}</div>
              <div>事件 公开 {gameState.worldRuntime.events.filter((event) => event.visibility === 'public').length} / 秘密 {gameState.worldRuntime.events.filter((event) => event.visibility === 'secret').length} / 玩家可见 {playerVisibleEvents.length} / 隐藏 {hiddenEvents.length}</div>
              <div>待处理 {pending.length} · 已拒绝 {rejected.length}</div>
              {pending.map((entry) => <div key={entry.id}>pending {entry.id} · {entry.source}</div>)}
              {rejected.map((entry) => <div key={entry.id}>rejected {entry.id} · {entry.rejectionReason ?? '无原因'}</div>)}
              {changesLog.slice(-6).map((entry, index) => <div key={`${entry}-${index}`}>局势 {entry}</div>)}
            </dl>
          )}

          {tab === 'xray' && (
            <div className="space-y-3 font-mono text-[10.5px] leading-relaxed text-parchment-faint">
              <section>
                <h4 className="mb-1 font-serif text-[12px] text-gold">被过滤的世界事件</h4>
                {hiddenEvents.length === 0 && <p>当前没有对玩家隐藏的事件。</p>}
                {hiddenEvents.map((event) => (
                  <p key={event.id} data-debug-hidden-event={event.id}>
                    {event.id} · {event.visibility} · {event.reason}
                  </p>
                ))}
              </section>
              <section>
                <h4 className="mb-1 font-serif text-[12px] text-gold">runtime 人物位置</h4>
                {runtimeCharacters.length === 0 && <p>没有人物 runtime 覆盖。</p>}
                {runtimeCharacters.map(([id, patch]) => (
                  <p key={id}>{id} · {patch.location?.locationId ?? '无地点'} · {patch.currentActivity ?? 'idle'}</p>
                ))}
              </section>
              <section>
                <h4 className="mb-1 font-serif text-[12px] text-gold">runtime 资产保管</h4>
                {runtimeAssets.length === 0 && <p>没有资产 runtime 覆盖。</p>}
                {runtimeAssets.map(([id, patch]) => (
                  <p key={id}>
                    {id} · {patch.kind} · {patch.custodian && 'characterId' in patch.custodian ? patch.custodian.characterId : '无保管人'}
                  </p>
                ))}
              </section>
            </div>
          )}

          {tab === 'model' && (
            <div className="space-y-3">
              {!lastModelRequestTrace && <p className="font-serif text-[11px] text-parchment-dim">还没有捕获到模型请求。点一条分支或提交一句御令后，规则解析消息会立刻出现；叙事消息会在结算完成后补上。</p>}
              {lastModelRequestTrace && (
                <>
                  <p className="font-mono text-[10.5px] text-parchment-faint">
                    回合 {lastModelRequestTrace.turnNumber} · {lastModelRequestTrace.status} · {lastModelRequestTrace.offline ? '离线演示' : '在线'} · {lastModelRequestTrace.provider} · {lastModelRequestTrace.model}
                  </p>
                  {lastModelRequestTrace.actionText && (
                    <p className="font-serif text-[11px] text-parchment-dim">行动：{lastModelRequestTrace.actionText}</p>
                  )}
                  {lastModelRequestTrace.blockedReason && (
                    <p className="font-serif text-[11px] text-rubric">未发出：{lastModelRequestTrace.blockedReason}</p>
                  )}
                  {lastModelRequestTrace.error && (
                    <p className="font-serif text-[11px] text-rubric">请求失败：{lastModelRequestTrace.error}</p>
                  )}
                  {lastModelRequestTrace.contextError && (
                    <p className="font-serif text-[11px] text-rubric">上下文失败：{lastModelRequestTrace.contextError}</p>
                  )}
                  {lastModelRequestTrace.status === 'resolving' && lastModelRequestTrace.resolution.messages.length > 0 && (
                    <p className="font-serif text-[11px] text-gold">规则解析请求已发出，正在等待模型返回。</p>
                  )}
                  <details className="border border-hairline/70 bg-ink-2/60 p-2">
                    <summary className="cursor-pointer select-none font-serif text-[11px] text-gold">自动世界切片</summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-parchment-faint">{lastModelRequestTrace.worldContext.automatic || '（空）'}</pre>
                  </details>
                  <details className="border border-hairline/70 bg-ink-2/60 p-2">
                    <summary className="cursor-pointer select-none font-serif text-[11px] text-gold">结算后世界切片</summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-parchment-faint">{lastModelRequestTrace.worldContext.committed || '（空）'}</pre>
                  </details>
                  <MessageList title="规则解析请求" bundle={lastModelRequestTrace.resolution} />
                  <MessageList title="已结算叙事请求" bundle={lastModelRequestTrace.narration} />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
