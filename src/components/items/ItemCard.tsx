import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ItemAction } from '../../features/items/types';
import type { ItemCardModel } from '../../features/items/viewModel';
import { ItemDetail } from './ItemDetail';
import { ItemImage } from './ItemImage';

export interface ItemCardProps {
  item: ItemCardModel;
  compact?: boolean;
  defaultExpanded?: boolean;
  /** 已排队待结算的动作名,如「穿上」;传入后卡片显示待生效徽标 */
  pendingNote?: string;
  onAction?: (item: ItemCardModel, action: ItemCardModel['actions'][number]) => void;
}

const QUALITY_CLASS: Record<ItemCardModel['quality'], string> = {
  rough: 'border-stone-700/60',
  common: 'border-hairline-bright',
  fine: 'border-sky-700/55',
  masterwork: 'border-violet-700/55',
  legendary: 'border-gold/75 shadow-[inset_0_0_18px_rgba(156,117,47,0.1)]',
};

/** 主操作(穿戴/使用/更换)描金,危险操作(丢弃)朱红,其余素色 */
function actionVariant(kind: ItemAction['kind']): string {
  if (kind === 'equip' || kind === 'use' || kind === 'unequip') return ' item-action--primary';
  if (kind === 'discard') return ' item-action--danger';
  return '';
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  compact = false,
  defaultExpanded = false,
  pendingNote,
  onAction,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <article className={`overflow-hidden border bg-ink-2/75 ${QUALITY_CLASS[item.quality]} ${pendingNote ? 'border-l-2 border-l-gold' : ''}`} data-item-instance={item.instanceId}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`item-detail-${item.instanceId}`}
        onClick={() => setExpanded((value) => !value)}
        className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-parchment/[0.035]"
      >
        <span className={`shrink-0 border border-hairline bg-ink-3/75 p-1 ${compact ? 'h-12 w-12' : 'h-16 w-16'}`}>
          <ItemImage image={item.image} alt={item.name} className="h-full w-full" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block break-words font-serif text-[12.5px] font-bold leading-snug text-parchment" title={item.name}>{item.name}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-parchment-faint">
            <span>{item.quantityLabel}</span>
            <span>{item.durabilityLabel}</span>
            <span>{item.bulkLabel}</span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <span className="line-clamp-2 block break-words font-serif text-[10px] leading-relaxed text-gold-dim" title={item.locationLabel}>{item.locationLabel}</span>
            {pendingNote && <span className="pending-chip">待生效 · {pendingNote}</span>}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gold-dim transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {item.actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-hairline px-3 py-2">
          {item.actions.map((action) => (
            <button
              type="button"
              key={`${action.kind}-${action.label}`}
              disabled={Boolean(action.disabledReason)}
              title={action.disabledReason}
              onClick={(event) => {
                event.stopPropagation();
                if (!action.disabledReason) onAction?.(item, action);
              }}
              className={`item-action${actionVariant(action.kind)}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {expanded && <div id={`item-detail-${item.instanceId}`}><ItemDetail item={item} /></div>}
    </article>
  );
};

export type ItemCardActionKind = ItemAction['kind'];
