import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Ck3CharacterWindow } from './components/Ck3CharacterWindow';
import { WorldAssetDrawer } from './components/items/WorldAssetDrawer';
import { StoryFeed } from './components/StoryFeed';
import { ActionDock } from './components/ActionDock';
import { DiceModal } from './components/DiceModal';
import { SettingsModal } from './components/SettingsModal';
import { CharacterCreator } from './components/CharacterCreator';
import { TvTimelineModal } from './components/TvTimelineModal';
import { AmbientCanvas } from './components/AmbientCanvas';
import { CursorGlow } from './components/CursorGlow';
import { useGameStore } from './store/useGameStore';
import { X } from 'lucide-react';
import { stripEmoji } from './services/textSanitizer';
import { useCharacterNavigation } from './features/characters/useCharacterNavigation';
import type { CharacterId } from './features/characters/types';
import { useMapUiStore } from './features/map/mapUiStore';

// 地图抽屉按需分包:MapLibre 不进首屏,首次打开时才加载
const MapDrawer = lazy(() => import('./features/map/MapDrawer').then((module) => ({ default: module.MapDrawer })));

export const App: React.FC = () => {
  const { changesLog, isTvTimelineOpen, closeTvTimeline, bootStatus, bootError, hydrateGameState, resetStoredGame } = useGameStore();
  const [booted, setBooted] = useState(false);
  const characterNavigation = useCharacterNavigation();
  const activeDrawer = useMapUiStore((state) => state.activeDrawer);
  const openCharacterDrawer = useMapUiStore((state) => state.openCharacterDrawer);
  const closeDrawer = useMapUiStore((state) => state.closeDrawer);
  const toggleCharacter = useMapUiStore((state) => state.toggleCharacter);
  const toggleMap = useMapUiStore((state) => state.toggleMap);
  const openMap = useMapUiStore((state) => state.openMap);
  const dismissMapContext = useMapUiStore((state) => state.dismissMapContext);
  const openAsset = useMapUiStore((state) => state.openAsset);
  const returnFromAsset = useMapUiStore((state) => state.returnFromAsset);
  const selectedAssetId = useMapUiStore((state) => state.selectedAssetId);
  const assetSourceCharacterId = useMapUiStore((state) => state.assetSourceCharacterId);

  useEffect(() => {
    void hydrateGameState();
  }, [hydrateGameState]);

  // 点击正文中的人名:打开对应卷宗;卷宗收于抽屉,两端都自动拉出
  const openStoryCharacter = useCallback((characterId: CharacterId) => {
    characterNavigation.openCharacter(characterId);
    openCharacterDrawer();
  }, [characterNavigation.openCharacter, openCharacterDrawer]);
  const openDossierAsset = useCallback((assetId: string) => {
    openAsset(assetId, characterNavigation.selectedCharacterId);
  }, [characterNavigation.selectedCharacterId, openAsset]);

  // 全局快捷键:/ 聚焦命令行;C 开合卷宗;Esc 收起卷宗
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        document.getElementById('command-input')?.focus();
      }
      if ((e.key === 'c' || e.key === 'C') && !typing) {
        toggleCharacter();
      }
      if ((e.key === 'm' || e.key === 'M') && !typing) {
        toggleMap();
      }
      if (e.key === 'Escape') {
        // 物品选择/赠予对话框浮在卷宗之上:Esc 先关最上层,卷宗保持
        const itemDialogOpen = document.querySelector('[data-item-choice-dialog], [data-item-gift-dialog]');
        if (!itemDialogOpen) {
          if (activeDrawer === 'map' && dismissMapContext()) return;
          closeDrawer();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeDrawer, closeDrawer, dismissMapContext, toggleCharacter, toggleMap]);

  // 浏览器空闲时预热地图分包,首次开图无需等待下载
  useEffect(() => {
    const warm = () => {
      void import('./features/map/MapDrawer').then((module) => module.prewarmMapRuntime());
    };
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(warm);
      return () => window.cancelIdleCallback(idleId);
    }
    const timeoutId = window.setTimeout(warm, 2000);
    return () => window.clearTimeout(timeoutId);
  }, []);

  if (bootStatus !== 'ready') {
    return (
      <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-ink px-6 text-parchment">
        <AmbientCanvas />
        <div className="relative z-10 max-w-md border border-hairline bg-ink-2/90 p-6 text-center shadow-2xl">
          <p className="eyebrow">维斯特洛编年史</p>
          <h1 className="mt-3 font-serif text-xl font-bold text-parchment">
            {bootStatus === 'loading' ? '正在恢复世界' : '存档无法载入'}
          </h1>
          <p className="mt-3 font-serif text-xs leading-relaxed text-parchment-dim">
            {bootStatus === 'loading' ? '正在核对最近一次已提交的回合与世界账本。' : bootError}
          </p>
          {bootStatus === 'error' && (
            <button type="button" className="btn-decree mt-5 !px-5 !py-2 !text-xs" onClick={() => void resetStoredGame()}>
              重置不兼容存档
            </button>
          )}
        </div>
      </div>
    );
  }

  const dossierWindow = (
    <Ck3CharacterWindow
      selectedCharacterId={characterNavigation.selectedCharacterId}
      onSelectCharacter={characterNavigation.openCharacter}
      canGoBack={characterNavigation.canGoBack}
      onBack={characterNavigation.goBack}
      onReturnToPlayer={characterNavigation.returnToPlayer}
      onOpenLocation={(locationId) => openMap({ kind: 'location', locationId })}
      onOpenAsset={openDossierAsset}
    />
  );

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-ink text-parchment select-text">
      {/* 氛围层:余烬与尘埃、烛光、暗角、纸尘 */}
      <AmbientCanvas />
      <CursorGlow />
      <div className="grain" aria-hidden="true" />

      {/* 开机揭幕 */}
      {!booted && (
        <div className="boot-veil" aria-hidden="true" onAnimationEnd={() => setBooted(true)} />
      )}

      {/* 细顶栏:题名、纪年与铜件 */}
      <Header />

      {/* 局势速递:无缝走马灯 */}
      {changesLog.length > 0 && (
        <div className="ticker relative z-20 flex items-center gap-4 border-b border-hairline/50 bg-ink-2/50 px-4 py-1.5 text-[11px] backdrop-blur-sm">
          <span className="eyebrow shrink-0">局势</span>
          <div className="ticker-mask">
            <div className="ticker-track">
              {[0, 1].map((copy) => (
                <span key={copy} className="ticker-chunk" aria-hidden={copy === 1}>
                  {changesLog.slice(-4).map((log, i) => (
                    <span key={i} className="ticker-item">{stripEmoji(log)}</span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 舞台:一整列文字 */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col">
        <StoryFeed onSelectCharacter={openStoryCharacter} onOpenLocation={(location) => openMap({ kind: 'location', locationId: location.locationId })} onOpenAsset={openAsset} />
        <ActionDock />
      </main>

      {/* 地图竖签(左缘) */}
      {activeDrawer === null && (
        <button
          type="button"
          onClick={toggleMap}
          className="map-tab fixed left-0 top-1/2 z-30 -translate-y-1/2"
          aria-label="打开维斯特洛地图"
          title="维斯特洛地图(按 M)"
        >
          维斯特洛地图
        </button>
      )}

      {/* 卷宗竖签(右缘) */}
      {activeDrawer === null && (
        <button
          type="button"
          onClick={openCharacterDrawer}
          className="dossier-tab fixed right-0 top-1/2 z-30 -translate-y-1/2"
          aria-label="打开人物卷宗"
          title="人物卷宗(按 C)"
        >
          人物卷宗
        </button>
      )}

      {/* 卷宗抽屉 */}
      {activeDrawer === 'character' && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="人物卷宗">
          <div className="modal-backdrop absolute inset-0" onClick={closeDrawer} />
          <div className="drawer-enter absolute right-0 top-0 flex h-full w-[92vw] max-w-[460px] flex-col border-l border-hairline-bright bg-ink shadow-[-32px_0_80px_rgba(0,0,0,0.45)]">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-hairline/70 px-4 select-none">
              <span className="eyebrow">人物卷宗</span>
              <button
                type="button"
                onClick={closeDrawer}
                className="btn-ghost !px-1.5"
                aria-label="收起人物卷宗"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">{dossierWindow}</div>
          </div>
        </div>
      )}

      {activeDrawer === 'map' && (
        <Suspense fallback={null}>
          <MapDrawer onSelectCharacter={openStoryCharacter} />
        </Suspense>
      )}

      {activeDrawer === 'asset' && selectedAssetId && (
        <WorldAssetDrawer
          assetId={selectedAssetId}
          sourceCharacterId={assetSourceCharacterId}
          onBack={returnFromAsset}
          onClose={closeDrawer}
          onOpenCharacter={openStoryCharacter}
          onOpenLocation={(locationId) => openMap({ kind: 'location', locationId })}
          onOpenAsset={openAsset}
        />
      )}

      {/* 模态弹窗系统 */}
      <DiceModal />
      <SettingsModal />
      <CharacterCreator />
      <TvTimelineModal
        isOpen={isTvTimelineOpen}
        onClose={closeTvTimeline}
        onOpenCharacter={(characterId) => { closeTvTimeline(); openStoryCharacter(characterId); }}
        onOpenLocation={(location) => { closeTvTimeline(); openMap({ kind: 'location', locationId: location.locationId }); }}
        onOpenAsset={(assetId) => { closeTvTimeline(); openAsset(assetId); }}
      />
    </div>
  );
};

export default App;
