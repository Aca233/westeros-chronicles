import React, { useEffect, useRef, useState } from 'react';
import { Gift, X } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface ItemGiftDialogProps {
  itemName: string;
  onConfirm: (recipientId: string) => void;
  onClose: () => void;
}

/** 赠送受赠人录入:与物品选择对话框同源的卷宗式小窗 */
export const ItemGiftDialog: React.FC<ItemGiftDialogProps> = ({ itemName, onConfirm, onClose }) => {
  const [recipient, setRecipient] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = recipient.trim();

  useEffect(() => {
    inputRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const submit = () => {
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-gift-title"
      data-item-gift-dialog
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="panel-iron panel-pop w-full max-w-md overflow-hidden border border-gold-deep/70 shadow-[0_24px_80px_rgba(0,0,0,0.72)]">
        <header className="flex items-start gap-3 border-b border-hairline bg-ink-2/95 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-hairline-bright bg-ink-3 text-gold">
            <Gift className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="eyebrow">赠予物品</span>
            <h3 id="item-gift-title" className="mt-1 break-words font-serif text-base font-bold leading-snug text-gold-bright">
              将「{itemName}」赠予何人
            </h3>
            <p className="mt-1 break-words font-serif text-[11px] leading-relaxed text-parchment-dim">
              填入受赠人物的标识(如 agot: 档案编号或存档人物 ID)。加入队列后,下一次成功对话时完成赠予。
            </p>
          </span>
          <button type="button" onClick={onClose} aria-label="关闭赠予窗口" className="shrink-0 border border-hairline p-1.5 text-gold-dim transition-colors hover:border-gold-deep hover:text-gold-bright">
            <X className="h-4 w-4" />
          </button>
        </header>

        <form
          className="bg-ink/95 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label htmlFor="gift-recipient" className="mb-1.5 block font-serif text-[10.5px] tracking-[0.14em] text-gold">受赠人标识</label>
          <input
            ref={inputRef}
            id="gift-recipient"
            type="text"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="例如 agot:char_123 或存档人物标识"
            className="creator-input"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="item-action">取消</button>
            <button type="submit" disabled={!trimmed} className="item-action item-action--primary">
              确认赠予
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
};

export default ItemGiftDialog;
