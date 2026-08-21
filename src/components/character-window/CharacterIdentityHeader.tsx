import { ArrowLeft, MapPin, UserRound } from 'lucide-react';
import type { CharacterDossier } from '../../features/characters/characterDossier';
import { CharacterPortrait } from '../CharacterPortrait';
import { CoatOfArms } from '../CoatOfArms';
import { GameIcon, getHouseIconId } from '../GameIcon';

export function CharacterIdentityHeader({
  dossier,
  houseIcon,
  canGoBack,
  onBack,
  onReturnToPlayer,
  onOpenLocation,
}: {
  dossier: CharacterDossier;
  houseIcon: ReturnType<typeof getHouseIconId>;
  canGoBack: boolean;
  onBack: () => void;
  onReturnToPlayer: () => void;
  onOpenLocation: (locationId: string) => void;
}) {
  return (
    <header className="relative shrink-0 px-4 pb-5 pt-5">
      <div
        data-character-identity-layout="split"
        className="grid grid-cols-[minmax(0,1fr)_132px] items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_168px] sm:gap-4"
      >
        <div className="min-w-0 text-left">
          {dossier.kind === 'npc' && (
            <div data-character-navigation className="mb-3 flex flex-wrap items-center justify-start gap-1.5">
              {canGoBack && (
                <button type="button" onClick={onBack} className="btn-ghost !px-2 !py-1 !text-[10px]">
                  <ArrowLeft className="h-3 w-3" />返回上一人物
                </button>
              )}
              <button type="button" onClick={onReturnToPlayer} className="btn-ghost !px-2 !py-1 !text-[10px]">
                <UserRound className="h-3 w-3" />回到自己
              </button>
            </div>
          )}

          <div className="flex items-start gap-3">
            <div className="ck3-heraldry-frame flex h-[62px] w-[54px] shrink-0 items-center justify-center p-1.5">
              {dossier.kind === 'player' && dossier.player.coatOfArms ? (
                <CoatOfArms design={dossier.player.coatOfArms} className="h-full" />
              ) : (
                <GameIcon icon={houseIcon} className="h-full w-full object-contain" />
              )}
            </div>
            <div className="min-w-0 pt-0.5">
              <p className="eyebrow">{dossier.dynastyName}</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <h2 className="break-words font-serif text-[25px] font-black leading-[1.12] tracking-[0.04em] text-parchment">{dossier.name}</h2>
                {dossier.aliases && dossier.aliases.length > 0 && (
                  <span data-character-aliases className="font-serif text-[11px] italic text-gold-deep/90">
                    （{dossier.aliases.join('、')}）
                  </span>
                )}
              </div>
            </div>
          </div>

          <p className="mt-3 font-serif text-[12px] font-semibold leading-relaxed text-gold">
            {dossier.title}
            {dossier.age !== undefined && <span className="ml-2 font-mono text-[10px] font-normal text-parchment-faint">{dossier.age} 岁</span>}
            {dossier.kind === 'npc' ? (
              <span data-npc-status className={`ml-2 inline-flex items-center gap-1 text-[10px] font-semibold ${dossier.alive ? 'text-emerald-700' : 'text-rubric'}`}>
                <span className={`h-1 w-1 rounded-full ${dossier.alive ? 'bg-emerald-700' : 'bg-rubric'}`} aria-hidden="true" />
                {dossier.alive ? '在世' : '已故'}
              </span>
            ) : (
              !dossier.alive && <span className="ml-2 text-[10px] font-bold text-rubric">已故</span>
            )}
          </p>
          <div className="mt-2.5 flex flex-col items-start gap-1 text-[10px] text-parchment-faint">
            <span>{dossier.house}</span>
            <span>{dossier.culture} · {dossier.faith}</span>
            <button
              type="button"
              disabled={!dossier.worldLocation}
              onClick={() => dossier.worldLocation && onOpenLocation(dossier.worldLocation.locationId)}
              className="inline-flex min-w-0 items-center gap-1 text-left transition-colors enabled:hover:text-gold disabled:cursor-default"
            >
              <MapPin className="h-3 w-3 shrink-0 text-gold-deep" /><span className="truncate">{dossier.location}</span>
            </button>
          </div>
          {dossier.summary && (
            <p data-character-summary className="mt-3 border-l-2 border-gold-deep/50 pl-2.5 font-serif text-[11px] leading-relaxed text-parchment-dim">
              {dossier.summary}
            </p>
          )}
          <div className="identity-rule !mx-0 !mt-4 !w-full" aria-hidden="true"><span className="divider-gem" /></div>
        </div>

        <section
          data-character-portrait-side="right"
          className="ck3-portrait-frame ck3-portrait-frame--hero relative h-[188px] w-full self-start overflow-hidden sm:h-[210px]"
          aria-label="人物肖像"
        >
          <div className="portrait-glow absolute inset-0" />
          <CharacterPortrait
            characterId={dossier.kind === 'npc' ? dossier.id : dossier.player.canonicalCharacterId}
            houseIcon={houseIcon}
            alt={`${dossier.name}的肖像`}
            priority
            deceased={!dossier.alive}
            className="h-full w-full pb-7"
          />
          <div className="absolute inset-x-2 bottom-2 border-t border-gold-deep/40 pt-1.5 text-center sm:inset-x-3">
            <div className="portrait-caption-house truncate text-[10px] font-bold tracking-wide">{dossier.house}</div>
            <div className="portrait-caption-words mt-0.5 truncate text-[8px] italic">“{dossier.houseWords}”</div>
          </div>
        </section>
      </div>
    </header>
  );
}
