import React, { useMemo } from 'react';
import { Backpack, MapPin, ScrollText, ShieldAlert, UserRound } from 'lucide-react';
import { ITEM_CATALOG } from '../data/itemDefinitions';
import { CK3_SKILLS } from '../data/ck3Skills';
import { resolveCharacterTraits } from '../data/characterTraits';
import { collectPendingConcerns } from './PendingConcerns';
import { useGameStore } from '../store/useGameStore';

const POSITION_LABELS = {
  head: '头部',
  torso: '躯干',
  mainhand: '主手',
  offhand: '副手',
  legs: '双腿',
  accessories: '配饰',
} as const;

export interface PlayerStatusRailProps {
  onOpenCharacter: () => void;
  onOpenLocation: () => void;
}

/**
 * 常驻栏只回答“此刻的我能依靠什么”。完整卷宗、仓储和人物百科仍按需打开，
 * 避免把自然语言角色扮演重新变成面板操作游戏。
 */
export const PlayerStatusRail: React.FC<PlayerStatusRailProps> = ({ onOpenCharacter, onOpenLocation }) => {
  const gameState = useGameStore((state) => state.gameState);
  const { lord } = gameState;
  const concerns = useMemo(() => {
    const all = collectPendingConcerns(gameState);
    const growth = all.filter((concern) => concern.startsWith('成长选择：'));
    const other = all.filter((concern) => !concern.startsWith('成长选择：'));
    return [...growth.slice(-1), ...other].slice(0, 3);
  }, [gameState]);
  const equipped = useMemo(() => Object.entries(lord.items.placements)
    .flatMap(([instanceId, placement]) => {
      if (placement.type !== 'equipped') return [];
      const instance = lord.items.instances[instanceId];
      if (!instance) return [];
      const definition = ITEM_CATALOG.get(instance.definitionId);
      return [{
        id: instanceId,
        name: instance.customName || definition?.name || instance.definitionId,
        position: POSITION_LABELS[placement.position.group],
      }];
    })
    .slice(0, 4), [lord.items]);
  const buildTraits = useMemo(() => {
    const resolved = resolveCharacterTraits(lord.traitIds ?? [], lord.traits ?? []);
    const methodTraits = resolved.flatMap((trait) => (trait.rules.methodEdges ?? []).map((edge, index) => ({
      id: `${trait.id}:${index}`,
      name: trait.name,
      edge: edge.label,
      detail: edge.directive,
    })));
    const fallback = resolved
      .filter((trait) => !(trait.rules.methodEdges?.length))
      .map((trait) => ({ id: trait.id, name: trait.name, edge: undefined, detail: trait.description }));
    return [...methodTraits, ...fallback].slice(0, 3);
  }, [lord.traitIds, lord.traits]);

  return (
    <aside
      className="relative z-20 hidden w-56 shrink-0 select-none flex-col border-r border-hairline/70 bg-ink-2/45 px-3 py-4 backdrop-blur-sm lg:flex"
      aria-label="我的角色"
      data-player-status-rail
    >
      <button
        type="button"
        onClick={onOpenCharacter}
        className="group border-b border-hairline pb-3 text-left"
        aria-label={`打开${lord.name}的完整角色面板`}
      >
        <span className="eyebrow flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />我的角色</span>
        <strong className="mt-2 block truncate font-serif text-base text-gold-bright group-hover:text-gold">{lord.name}</strong>
        <span className="mt-0.5 block truncate font-serif text-[11px] text-parchment-dim">{lord.title} · {lord.overallStatus}</span>
        <span className="mt-1 block font-mono text-[9px] text-parchment-faint">{lord.goldDragons} 金龙 · {lord.silverStags} 银鹿</span>
      </button>

      <button
        type="button"
        onClick={onOpenLocation}
        className="flex items-start gap-2 border-b border-hairline py-3 text-left text-[11px] leading-relaxed text-parchment-dim hover:text-gold"
        aria-label={`在地图查看${lord.locationLabel}`}
      >
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-deep" />
        <span><span className="eyebrow mb-1 block !text-[8px]">此刻所在</span>{lord.locationLabel}</span>
      </button>

      <section className="border-b border-hairline py-3" aria-label="六项能力">
        <p className="eyebrow mb-2">能力</p>
        <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
          {CK3_SKILLS.map((skill) => (
            <div key={skill.key} className="flex items-baseline justify-between gap-1 font-serif text-[10px] text-parchment-dim" title={skill.label}>
              <span>{skill.label}</span>
              <strong className="font-mono text-[11px] text-parchment">{lord.attributes[skill.key]}</strong>
            </div>
          ))}
        </div>
        <p className="mt-2 font-serif text-[9.5px] leading-relaxed text-parchment-faint">行动方法决定使用单项能力，或按主 70%／辅 30% 组合。</p>
      </section>

      <section className="border-b border-hairline py-3" aria-label="当前构筑">
        <p className="eyebrow mb-2 flex items-center gap-1.5"><ScrollText className="h-3 w-3" />当前构筑</p>
        {buildTraits.length ? (
          <ul className="space-y-1 font-serif text-[11px] text-parchment-dim">
            {buildTraits.map((trait) => (
              <li key={trait.id} className="border-l border-gold-deep/40 pl-2">
                <span className="block truncate text-parchment">{trait.name}</span>
                {trait.edge && <small className="block truncate text-[9px] text-gold" title={trait.detail}>方法优势：{trait.edge}</small>}
              </li>
            ))}
          </ul>
        ) : <p className="font-serif text-[10px] text-parchment-faint">尚无已记录特质</p>}
      </section>

      <section className="border-b border-hairline py-3" aria-label="当前装备">
        <p className="eyebrow mb-2 flex items-center gap-1.5"><Backpack className="h-3 w-3" />当前装备</p>
        {equipped.length ? (
          <ul className="space-y-1.5 font-serif text-[10.5px] text-parchment-dim">
            {equipped.map((item) => <li key={item.id} className="flex justify-between gap-2"><span className="truncate text-parchment">{item.name}</span><span className="shrink-0 text-parchment-faint">{item.position}</span></li>)}
          </ul>
        ) : <p className="font-serif text-[10px] text-parchment-faint">未装备重要物品</p>}
      </section>

      <section className="min-h-0 py-3" aria-label="未了之事">
        <p className="eyebrow mb-2 flex items-center gap-1.5"><ShieldAlert className="h-3 w-3" />未了之事</p>
        {concerns.length ? (
          <ul className="space-y-2 font-serif text-[10.5px] leading-relaxed text-parchment-dim">
            {concerns.map((concern) => <li key={concern} className="border-l border-rubric/60 pl-2">{concern}</li>)}
          </ul>
        ) : <p className="font-serif text-[10px] text-parchment-faint">当前没有迫近事项</p>}
      </section>

      <p className="mt-auto border-t border-hairline pt-3 font-serif text-[9.5px] leading-relaxed text-parchment-faint">
        直接在中央写下话语或行动；侧栏只提供你此刻能记得和取用的信息。
      </p>
    </aside>
  );
};
