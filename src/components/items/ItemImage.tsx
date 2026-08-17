import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Footprints,
  Gem,
  Hammer,
  PackageOpen,
  ScrollText,
  Shield,
  Shirt,
  Sword,
  TestTube,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import type { ItemImageRef } from '../../features/items/types';
import { GameIcon, getSafeGameIconId } from '../GameIcon';

const LIBRARY_ICONS: Record<string, LucideIcon> = {
  sword: Sword,
  shield: Shield,
  clothing: Shirt,
  footwear: Footprints,
  jewelry: Gem,
  tool: Hammer,
  document: ScrollText,
  book: BookOpen,
  medicine: TestTube,
  supply: Utensils,
  package: PackageOpen,
};

export interface ItemImageProps {
  image: ItemImageRef;
  alt?: string;
  className?: string;
  decorative?: boolean;
}

export const ItemImage: React.FC<ItemImageProps> = ({
  image,
  alt = '',
  className = '',
  decorative = false,
}) => {
  const [wikiFailed, setWikiFailed] = useState(false);
  useEffect(() => setWikiFailed(false), [image]);

  if (image.type === 'game' || (image.type === 'wiki' && wikiFailed)) {
    const icon = image.type === 'game' ? image.icon : image.fallbackIcon;
    return (
      <GameIcon
        icon={getSafeGameIconId(icon)}
        tone="raw"
        decorative={decorative}
        alt={alt}
        className={className}
      />
    );
  }

  if (image.type === 'wiki') {
    return (
      <img
        src={image.path}
        alt={decorative ? '' : alt}
        aria-hidden={decorative || undefined}
        draggable={false}
        onError={() => setWikiFailed(true)}
        className={`select-none object-contain ${className}`}
      />
    );
  }

  const Icon = LIBRARY_ICONS[image.iconName.toLowerCase()] ?? PackageOpen;
  return <Icon aria-hidden={decorative || undefined} aria-label={decorative ? undefined : alt} className={className} strokeWidth={1.45} />;
};
