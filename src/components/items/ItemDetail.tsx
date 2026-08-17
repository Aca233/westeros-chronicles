import React from 'react';
import type { ItemCardModel } from '../../features/items/viewModel';

export interface ItemDetailProps {
  item: ItemCardModel;
}

export const ItemDetail: React.FC<ItemDetailProps> = ({ item }) => (
  <div className="border-t border-hairline bg-ink-3/25 px-3 pb-3 pt-2.5 text-left">
    <p className="font-serif text-[11px] leading-relaxed text-parchment-dim">{item.description}</p>
    {item.roleplayText && (
      <p className="mt-2 border-l border-gold-deep/70 pl-2 font-serif text-[10.5px] italic leading-relaxed text-parchment-faint">
        {item.roleplayText}
      </p>
    )}

    {item.primaryEffects.length > 0 && (
      <div className="mt-3">
        <p className="eyebrow !text-[8px]">规则与场景效果</p>
        <ul className="mt-1.5 space-y-1 font-mono text-[9.5px] leading-relaxed text-parchment-dim">
          {item.primaryEffects.map((effect) => <li key={effect}>— {effect}</li>)}
        </ul>
      </div>
    )}

    {item.provenanceLines.length > 0 && (
      <div className="mt-3">
        <p className="eyebrow !text-[8px]">来历与归属</p>
        <ul className="mt-1.5 space-y-1 font-serif text-[9.5px] leading-relaxed text-parchment-faint">
          {item.provenanceLines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>
    )}

    {item.history.length > 0 && (
      <div className="mt-3">
        <p className="eyebrow !text-[8px]">物品经历</p>
        <ol className="mt-1.5 space-y-1 border-l border-hairline pl-2 font-serif text-[9.5px] leading-relaxed text-parchment-faint">
          {item.history.slice().reverse().map((entry) => (
            <li key={entry.id}><span className="text-gold-dim">{entry.date}</span> · {entry.summary}</li>
          ))}
        </ol>
      </div>
    )}
  </div>
);
