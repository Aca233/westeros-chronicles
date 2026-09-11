import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Backpack, BookOpen, HeartPulse, RotateCcw, UserRound, UsersRound } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { resolveCharacterTraits } from '../data/characterTraits';
import { useCharacterDossier } from '../features/characters/useCharacterDossier';
import type { CharacterId } from '../features/characters/types';
import { playerWorldEventViewer } from '../features/world/worldEventVisibility';
import { hiddenWorldEventIdsForPlayer, selectWorldEventsForView } from '../features/debug/worldEventDebug';
import { useWorldEventDisplays } from '../features/world/useWorldEventDisplays';
import { GameIcon, getHouseIconId } from './GameIcon';
import { HealthAndEquipmentPanel } from './items/HealthAndEquipmentPanel';
import { CharacterAssetsTab } from './character-window/CharacterAssetsTab';
import { CharacterHistoryTab } from './character-window/CharacterHistoryTab';
import { CharacterIdentityHeader } from './character-window/CharacterIdentityHeader';
import { CharacterOverview } from './character-window/CharacterOverview';
import { CharacterRelationsTab } from './character-window/CharacterRelationsTab';

import { CharacterDirectoryBar } from './character-window/CharacterDirectoryBar';
import { CharacterCurrentTab } from './character-window/CharacterCurrentTab';

const TABS = [
  { id: 'overview', label: '眼下', icon: UserRound },
  { id: 'history', label: '往事', icon: BookOpen },
  { id: 'relations', label: '关系', icon: UsersRound },
  { id: 'profile', label: '能力', icon: UserRound, playerOnly: true },
  { id: 'health', label: '身体装备', icon: HeartPulse, playerOnly: true },
  { id: 'inventory', label: '行囊', icon: Backpack, playerOnly: true },
] as const;

type CharacterTab = (typeof TABS)[number]['id'];


export interface Ck3CharacterWindowProps {
  selectedCharacterId?: CharacterId | null;
  onSelectCharacter?: (characterId: CharacterId) => void;
  canGoBack?: boolean;
  onBack?: () => void;
  onReturnToPlayer?: () => void;
  onOpenLocation?: (locationId: string) => void;
  onOpenAsset?: (assetId: string) => void;
}

export const Ck3CharacterWindow: React.FC<Ck3CharacterWindowProps> = ({
  selectedCharacterId = null,
  onSelectCharacter = () => undefined,
  canGoBack = false,
  onBack = () => undefined,
  onReturnToPlayer = () => undefined,
  onOpenLocation = () => undefined,
  onOpenAsset = () => undefined,
}) => {
  const gameState = useGameStore((state) => state.gameState);
  const turns = gameState.turns;
  const worldEvents = useGameStore((state) => state.gameState.worldRuntime.events);
  const lord = useGameStore((state) => state.gameState.lord);
  const worldCharacters = useGameStore((state) => state.gameState.worldCharacters);
  const debugEnabled = useGameStore((state) => state.debugEnabled);
  const eventViewer = useMemo(() => playerWorldEventViewer({ lord, worldCharacters }), [lord.canonicalCharacterId, worldCharacters?.runId]);
  const visibleWorldEvents = useMemo(
    () => selectWorldEventsForView(worldEvents, eventViewer, debugEnabled),
    [debugEnabled, eventViewer, worldEvents],
  );
  const hiddenWorldEventIds = useMemo(
    () => debugEnabled ? hiddenWorldEventIdsForPlayer(worldEvents, eventViewer) : new Set<string>(),
    [debugEnabled, eventViewer, worldEvents],
  );
  const worldEventDisplays = useWorldEventDisplays(visibleWorldEvents, gameState);
  const { dossier, relatedRecords, status, error, reload } = useCharacterDossier(selectedCharacterId);
  const [activeTab, setActiveTab] = useState<CharacterTab>('overview');


  useEffect(() => {

    setActiveTab('overview');
  }, [dossier?.id]);

  const displayedTraits = useMemo(
    () => dossier ? resolveCharacterTraits(dossier.traitIds, dossier.legacyTraits) : [],
    [dossier],
  );

  const houseIcon = getHouseIconId(dossier?.houseSigil || dossier?.house || 'artifact-crown');

  return (
    <aside
      data-ck3-character-window
      data-character-kind={dossier?.kind ?? status}
      className="ck3-character-window relative flex h-full w-full min-w-0 select-none flex-col overflow-hidden text-parchment"
      aria-label={dossier ? `${dossier.name}的人物窗口` : '人物窗口'}
    >
      <div className="ck3-ornament-line" aria-hidden="true" />
      {status !== 'ready' || !dossier ? (
        <DossierLoadState
          status={status}
          error={error}
          canGoBack={canGoBack}
          onBack={onBack}
          onReturnToPlayer={onReturnToPlayer}
          onReload={reload}
        />
      ) : (
        <>
          <CharacterIdentityHeader
            dossier={dossier}
            houseIcon={houseIcon}
            canGoBack={canGoBack}
            onBack={onBack}
            onReturnToPlayer={onReturnToPlayer}
          />

          <div className="min-h-0 flex-1 overflow-y-auto">
            <CharacterDirectoryBar onSelectCharacter={onSelectCharacter} />
            <nav
              data-character-lower-tabs
              className="sticky top-0 z-20 flex border-b border-hairline/80 bg-ink/95 px-3 backdrop-blur-sm"
              aria-label="人物档案页签"
            >
              {TABS.filter((tab) => !('playerOnly' in tab) || !tab.playerOnly || dossier.kind === 'player').map(({ id, label }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    aria-current={active ? 'page' : undefined}
                    data-active={active}
                    className="text-tab min-w-0 flex-1 truncate"
                    title={label}
                  >
                    {label}
                  </button>
                );
              })}
            </nav>

            <div className="min-h-[240px]">
              {activeTab === 'overview' && (
                <CharacterCurrentTab dossier={dossier} gameState={gameState} onOpenLocation={onOpenLocation} />
              )}
              {activeTab === 'profile' && (
                <CharacterOverview
                  dossier={dossier}
                  displayedTraits={displayedTraits}


                />
              )}
              {activeTab === 'relations' && (
                <CharacterRelationsTab
                  dossier={dossier}
                  relatedRecords={relatedRecords}
                  onSelectCharacter={onSelectCharacter}
                  lord={lord}
                  currentYear={gameState.currentYear}
                  worldCharacters={worldCharacters}
                  worldHistory={gameState.worldHistory}
                  worldRuntime={gameState.worldRuntime}
                  roleplay={gameState.roleplay}
                />
              )}
              {activeTab === 'health' && <HealthAndEquipmentPanel dossier={dossier} embedded />}
              {activeTab === 'history' && <CharacterHistoryTab dossier={dossier} turns={turns} worldEvents={visibleWorldEvents} worldEventDisplays={worldEventDisplays} hiddenWorldEventIds={hiddenWorldEventIds} />}
              {activeTab === 'inventory' && (
                <CharacterAssetsTab
                  dossier={dossier}
                  relatedRecords={relatedRecords}
                  onOpenCharacter={onSelectCharacter}
                  onOpenLocation={onOpenLocation}
                  onOpenAsset={onOpenAsset}
                />
              )}
            </div>
          </div>


        </>
      )}
    </aside>
  );
};

function DossierLoadState({
  status,
  error,
  canGoBack,
  onBack,
  onReturnToPlayer,
  onReload,
}: {
  status: 'loading' | 'error' | 'ready';
  error: string | null;
  canGoBack: boolean;
  onBack: () => void;
  onReturnToPlayer: () => void;
  onReload: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <GameIcon icon="artifact-white-book" className="h-16 w-16 opacity-70" />
      <div>
        <h2 className="font-serif text-base font-bold text-parchment">{status === 'loading' ? '正在核对人物档案' : '人物档案无法打开'}</h2>
        <p className="mt-2 max-w-xs font-serif text-[11px] leading-relaxed text-parchment-faint">
          {status === 'loading' ? '正在读取稳定 AGOT 人物资料与当前存档中的动态经历。' : error || '人物档案读取失败。'}
        </p>
      </div>
      {status === 'error' && (
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onReload} className="btn-ghost"><RotateCcw className="h-3.5 w-3.5" />重新读取</button>
          {canGoBack && <button type="button" onClick={onBack} className="btn-ghost"><ArrowLeft className="h-3.5 w-3.5" />返回</button>}
          <button type="button" onClick={onReturnToPlayer} className="btn-ghost"><UserRound className="h-3.5 w-3.5" />回到自己</button>
        </div>
      )}
    </div>
  );
}
