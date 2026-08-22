import React from 'react';
import { AlertTriangle, Compass, Hourglass } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import type { GameState } from '../types/game';

// 中循环可见性：把跨回合的悬置线（旅程、伤势、待处理事务）聚成一条
// 常驻细条，让玩家不必翻卷宗和地图才知道"我还有什么事没了"。
export function collectPendingConcerns(gameState: GameState): string[] {
  const concerns: string[] = [];

  const { body, overallStatus } = gameState.lord;
  const woundedZones = [body.head, body.torso, body.arms, body.legs]
    .filter((zone) => zone.level !== 'intact');
  if (woundedZones.length) {
    const worst = woundedZones.some((zone) => zone.level === 'critical')
      ? '有致命重伤'
      : woundedZones.some((zone) => zone.level === 'heavy')
        ? '重伤未愈'
        : '有伤在身';
    concerns.push(`${worst}（${woundedZones.map((zone) => zone.name).join('、')}）`);
  }
  if (body.isBleeding) concerns.push('持续失血');
  if (body.isPoisoned) concerns.push('身中剧毒');
  if (body.isInfected) concerns.push('伤口发炎');
  if (overallStatus === '垂危') concerns.push('命悬一线');

  const journey = gameState.activeJourney;
  if (journey) {
    const destination = journey.locationLabels?.[journey.routePlan.to] ?? journey.routePlan.to;
    const motion = journey.status === 'paused' ? '旅程暂停' : `旅程第 ${journey.progressDays + 1} 天`;
    concerns.push(`${motion} → ${destination}`);
  }

  const pending = gameState.worldRuntime.pendingTransactions.filter((entry) => entry.status === 'pending');
  if (pending.length) concerns.push(`待处理事务 ×${pending.length}`);

  return concerns;
}

export const PendingConcerns: React.FC = () => {
  const gameState = useGameStore((state) => state.gameState);
  const concerns = collectPendingConcerns(gameState);
  if (!concerns.length) return null;
  return (
    <div
      className="flex items-center gap-2 border border-hairline bg-ink-2/60 px-3 py-1.5 font-mono text-xs text-parchment-dim"
      aria-label="未了之事"
      data-testid="pending-concerns"
    >
      <span className="flex items-center gap-1 text-gold/90" title="跨回合未了结的事项：伤势、旅程与排队中的事务">
        <Hourglass className="h-3.5 w-3.5" />
        未了之事
      </span>
      {concerns.map((concern) => (
        <span
          key={concern}
          className="flex items-center gap-1 border border-hairline px-1.5 py-0.5"
        >
          {concern.includes('旅程') && <Compass className="h-3 w-3 shrink-0" />}
          {(concern.includes('失血') || concern.includes('剧毒') || concern.includes('发炎') || concern.includes('致命') || concern.includes('重伤') || concern.includes('伤') || concern.includes('命悬')) && <AlertTriangle className="h-3 w-3 shrink-0 text-rubric-bright" />}
          {concern}
        </span>
      ))}
    </div>
  );
};
