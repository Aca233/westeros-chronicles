import React, { useEffect } from 'react';
import { Backpack, Castle, Truck, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { ItemImageRef } from '../../features/items/types';
import { ItemImage } from './ItemImage';

export type ItemChoiceIcon = 'carried' | 'site' | 'vehicle';

export interface ItemChoiceOption {
  id: string;
  title: string;
  subtitle?: string;
  detail?: string;
  image?: ItemImageRef;
  icon?: ItemChoiceIcon;
}

export interface ItemChoiceDialogProps {
  title: string;
  description: string;
  options: readonly ItemChoiceOption[];
  emptyMessage: string;
  onChoose: (id: string) => void;
  onClose: () => void;
}

const CHOICE_ICONS = {
  carried: Backpack,
  site: Castle,
  vehicle: Truck,
} as const;

export const ItemChoiceDialog: React.FC<ItemChoiceDialogProps> = ({
  title,
  description,
  options,
  emptyMessage,
  onChoose,
  onClose,
}) => {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-choice-title"
      data-item-choice-dialog
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="panel-iron panel-pop flex max-h-[min(78vh,720px)] w-full max-w-xl flex-col overflow-hidden border border-gold-deep/70 shadow-[0_24px_80px_rgba(0,0,0,0.72)]">
        <header className="flex items-start gap-3 border-b border-hairline bg-ink-2/95 px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="eyebrow">物品选择</span>
            <h3 id="item-choice-title" className="mt-1 break-words font-serif text-base font-bold leading-snug text-gold-bright" title={title}>{title}</h3>
            <p className="mt-1 break-words font-serif text-[11px] leading-relaxed text-parchment-dim">{description}</p>
          </span>
          <button type="button" onClick={onClose} aria-label="关闭选择窗口" className="shrink-0 border border-hairline p-1.5 text-gold-dim transition-colors hover:border-gold-deep hover:text-gold-bright">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-ink/95 p-2.5 sm:p-3">
          {options.length > 0 ? (
            <div className="space-y-2" role="list">
              {options.map((option) => {
                const Icon = option.icon ? CHOICE_ICONS[option.icon] : undefined;
                return (
                  <button
                    type="button"
                    key={option.id}
                    data-item-choice-option={option.id}
                    onClick={() => onChoose(option.id)}
                    className="group flex w-full items-center gap-3 border border-hairline bg-ink-2/75 p-2.5 text-left transition-colors hover:border-gold hover:bg-gold-deep/10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-gold"
                    role="listitem"
                  >
                    {option.image ? (
                      <span className="h-14 w-14 shrink-0 border border-hairline-bright bg-ink-3 p-1 transition-colors group-hover:border-gold-deep">
                        <ItemImage image={option.image} alt={option.title} className="h-full w-full" />
                      </span>
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center border border-hairline-bright bg-ink-3 text-gold transition-colors group-hover:border-gold-deep">
                        {Icon && <Icon className="h-6 w-6" />}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <strong className="block break-words font-serif text-[12.5px] leading-snug text-parchment" title={option.title}>{option.title}</strong>
                      {option.subtitle && <span className="mt-1 block break-words font-mono text-[10px] leading-relaxed text-gold-dim">{option.subtitle}</span>}
                      {option.detail && <span className="mt-0.5 block break-words font-serif text-[10.5px] leading-relaxed text-parchment-dim" title={option.detail}>{option.detail}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="border border-dashed border-hairline px-4 py-10 text-center font-serif text-[11px] leading-relaxed text-parchment-faint">{emptyMessage}</div>
          )}
        </div>

        <footer className="flex justify-end border-t border-hairline bg-ink-2/95 px-4 py-2.5">
          <button type="button" onClick={onClose} className="border border-hairline-bright px-3 py-1.5 font-serif text-[10px] text-parchment-dim transition-colors hover:border-gold-deep hover:text-parchment">取消</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
};
