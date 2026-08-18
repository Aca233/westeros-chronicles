import React, { useEffect, useState } from 'react';
import { CharacterPortraitRepository } from '../features/characters/characterPortraitRepository';
import type { CharacterId, CharacterPortraitRef } from '../features/characters/types';
import { CameoPortrait } from './CameoPortrait';
import { GameIcon, type GameIconId } from './GameIcon';

const portraitRepository = new CharacterPortraitRepository();

export interface CharacterPortraitProps {
  characterId?: CharacterId | null;
  houseIcon: GameIconId;
  alt: string;
  className?: string;
  priority?: boolean;
  deceased?: boolean;
}

export const CharacterPortrait: React.FC<CharacterPortraitProps> = ({
  characterId,
  houseIcon,
  alt,
  className = '',
  priority = false,
  deceased = false,
}) => {
  const [portrait, setPortrait] = useState<CharacterPortraitRef | undefined>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPortrait(undefined);
    setFailed(false);
    if (!characterId) return () => { cancelled = true; };
    portraitRepository.get(characterId)
      .then((next) => { if (!cancelled) setPortrait(next); })
      .catch(() => { if (!cancelled) setPortrait(undefined); });
    return () => { cancelled = true; };
  }, [characterId]);

  const showImage = Boolean(portrait && !failed);
  return (
    <span
      data-character-portrait={showImage ? 'image' : 'fallback'}
      className={`relative block overflow-hidden bg-ink-2 ${deceased ? 'grayscale' : ''} ${className}`}
    >
      {!showImage && (
        <span className="absolute inset-0" aria-hidden="true">
          <GameIcon
            icon={houseIcon}
            tone="raw"
            className="absolute left-1/2 top-[42%] h-[82%] w-[82%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.16] grayscale"
          />
          <span className="absolute inset-0 flex items-center justify-center p-[8%] opacity-90">
            <CameoPortrait className="h-full w-full" />
          </span>
        </span>
      )}
      {portrait && !failed && (
        <img
          src={portrait.assetPath}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: portrait.focalPoint ?? '50% 20%' }}
        />
      )}
    </span>
  );
};

export { portraitRepository };
