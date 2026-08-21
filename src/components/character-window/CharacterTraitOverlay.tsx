import { formatTraitDescription, formatTraitModifiers, formatTraitRuleEffects, resolveCharacterTraits, TRAIT_CATEGORY_LABELS } from '../../data/characterTraits';
import { GameIcon } from '../GameIcon';

export function CharacterTraitOverlay({
  trait,
  characterName,
  onClose,
}: {
  trait: ReturnType<typeof resolveCharacterTraits>[number];
  characterName: string;
  onClose: () => void;
}) {
  const description = formatTraitDescription(trait.description, characterName);
  const effects = [formatTraitModifiers(trait.modifiers), ...formatTraitRuleEffects(trait.rules)].filter(Boolean);

  return (
    <div className="panel-iron scene-enter absolute inset-x-3 bottom-3 z-30 p-4">
      <div className="flex gap-3">
        <GameIcon icon={trait.icon} className="h-14 w-14 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <strong className="font-serif text-sm text-parchment">{trait.name}</strong>
              <div className="mt-0.5 text-[9px] tracking-wider text-parchment-faint">{trait.isLegacy ? '旧存档标签' : TRAIT_CATEGORY_LABELS[trait.category]}</div>
            </div>
            <button type="button" onClick={onClose} className="btn-ghost !px-1 !py-0 !text-[10px]">关闭</button>
          </div>
          <p className="mt-2 font-serif text-[11px] leading-relaxed text-parchment-dim">{description}</p>
          {effects.length > 0 && <p className="mt-2 font-mono text-[10px] leading-relaxed text-gold">{effects.join(' · ')}</p>}
        </div>
      </div>
    </div>
  );
}
