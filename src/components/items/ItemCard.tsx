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
  onAction?: (item: ItemCardModel, action: ItemCardModel['actions'][number]) => void;
}

const QUALITY_CLASS: Record<ItemCardModel['quality'], string> = {
  rough: 'border-stone-700/60',
  common: 'border-hairline-bright',
  fine: 'border-sky-700/55',
  masterwork: 'border-violet-700/55',
  legendary: 'border-gold/75 shadow-[inset_0_0_18px_rgba(156,117,47,0.1)]',
};

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  compact = false,
  defaultExpanded = false,
  onAction,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <article className={`overflow-hidden border bg-ink-2/75 ${QUALITY_CLASS[item.quality]}`} data-item-instance={item.instanceId}>
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
          <span className="block truncate font-serif text-[12px] font-bold text-parchment">{item.name}</span>
          <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[9px] text-parchment-faint">
            <span>{item.quantityLabel}</span>
            <span>{item.durabilityLabel}</span>
            <span>{item.bulkLabel}</span>
          </span>
          <span className="mt-1 block truncate font-serif text-[9.5px] text-gold-dim">{item.locationLabel}</span>
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
              className="border border-hairline-bright px-2 py-1 font-serif text-[9.5px] text-parchment-dim transition-colors hover:border-gold-deep hover:text-parchment disabled:cursor-not-allowed disabled:opacity-40"
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
