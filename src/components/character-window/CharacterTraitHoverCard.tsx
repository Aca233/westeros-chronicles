import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  formatTraitDescription,
  formatTraitModifiers,
  formatTraitRuleEffects,
  resolveCharacterTraits,
  TRAIT_CATEGORY_LABELS,
} from '../../data/characterTraits';
import { GameIcon } from '../GameIcon';

type ResolvedTrait = ReturnType<typeof resolveCharacterTraits>[number];

export function CharacterTraitHoverCard({
  trait,
  characterName,
  children,
  className = '',
}: {
  trait: ResolvedTrait;
  characterName: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const description = formatTraitDescription(trait.description, characterName);
  const effects = [formatTraitModifiers(trait.modifiers), ...formatTraitRuleEffects(trait.rules)].filter(Boolean);

  const open = (target: HTMLElement) => setAnchor(target.getBoundingClientRect());
  const close = () => setAnchor(null);

  let tooltip: React.ReactNode = null;
  if (anchor && typeof document !== 'undefined' && typeof window !== 'undefined') {
    const width = Math.min(336, window.innerWidth - 24);
    const estimatedHeight = 210;
    const gap = 10;
    const left = anchor.right + gap + width <= window.innerWidth - 12
      ? anchor.right + gap
      : Math.max(12, anchor.left - width - gap);
    const top = Math.max(12, Math.min(anchor.top - 10, window.innerHeight - estimatedHeight - 12));

    tooltip = createPortal(
      <div
        role="tooltip"
        className="panel-iron pointer-events-none fixed z-[100] p-3 shadow-[0_18px_48px_rgba(0,0,0,0.58)]"
        style={{ left, top, width }}
      >
        <div className="flex items-start gap-3">
          <GameIcon icon={trait.icon} className="h-12 w-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <strong className="font-serif text-[14px] text-parchment">{trait.name}</strong>
            <div className="mt-0.5 text-[9px] tracking-[0.12em] text-parchment-faint">
              {trait.isLegacy ? '旧存档标签' : TRAIT_CATEGORY_LABELS[trait.category]}
            </div>
            <p className="mt-2 font-serif text-[11px] leading-relaxed text-parchment-dim">{description}</p>
            {effects.length > 0 && (
              <p className="mt-2 border-t border-hairline/70 pt-2 font-mono text-[10px] leading-relaxed text-gold">
                {effects.join(' · ')}
              </p>
            )}
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <>
      <span
        className={`group inline-flex cursor-help items-center justify-center outline-none ${className}`}
        tabIndex={0}
        aria-label={`${trait.name}，悬停查看详情`}
        onMouseEnter={(event) => open(event.currentTarget)}
        onMouseLeave={close}
        onFocus={(event) => open(event.currentTarget)}
        onBlur={close}
      >
        {children}
      </span>
      {tooltip}
    </>
  );
}
