import type { CharacterDossier } from '../../features/characters/characterDossier';
import type { CharacterId, StaticCharacterRecord } from '../../features/characters/types';
import type { WoundLevel } from '../../types/game';
import { ItemManagementPanel } from '../items/ItemManagementPanel';
import { WorldAssetSections } from '../items/WorldAssetSections';
import { SectionTitle } from './CharacterOverview';

export function woundLabel(level: WoundLevel): string {
  return level === 'minor' ? '轻创' : level === 'heavy' ? '重伤' : level === 'critical' ? '垂危' : '未记录创伤';
}

export function CharacterAssetsTab({
  dossier,
  relatedRecords,
  onOpenCharacter,
  onOpenLocation,
  onOpenAsset,
}: {
  dossier: CharacterDossier;
  relatedRecords: ReadonlyMap<CharacterId, StaticCharacterRecord>;
  onOpenCharacter: (characterId: CharacterId) => void;
  onOpenLocation: (locationId: string) => void;
  onOpenAsset: (assetId: string) => void;
}) {
  return (
    <div className="space-y-5 px-5 py-5" data-character-world-assets>
      <SectionTitle
        title="物品与资产"
        subtitle={dossier.kind === 'player'
          ? '按随行、当前地点、载具与远方资产整理；法理所有、实际控制、直接保管、物理位置与装备状态分别记录'
          : '法理所有、实际控制、直接保管、物理位置与装备状态分别记录'}
      />
      {dossier.kind === 'player' ? (
        <ItemManagementPanel
          dossier={dossier}
          onOpenCharacter={onOpenCharacter}
          onOpenLocation={onOpenLocation}
          onOpenAsset={onOpenAsset}
        />
      ) : (
        <WorldAssetSections
          dossier={dossier}
          relatedRecords={relatedRecords}
          onOpenCharacter={onOpenCharacter}
          onOpenLocation={onOpenLocation}
          onOpenAsset={onOpenAsset}
        />
      )}
      <p className="border-l border-gold-deep/60 pl-3 font-serif text-[10px] leading-relaxed text-parchment-faint">
        实际穿戴只在“健康与装备”中显示；本页不会把远处名下资产误作随身携带。
      </p>
    </div>
  );
}
