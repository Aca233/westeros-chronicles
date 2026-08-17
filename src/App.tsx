import React, { useCallback, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Ck3CharacterWindow } from './components/Ck3CharacterWindow';
import { StoryFeed } from './components/StoryFeed';
import { ActionDock } from './components/ActionDock';
import { DiceModal } from './components/DiceModal';
import { SettingsModal } from './components/SettingsModal';
import { CharacterCreator } from './components/CharacterCreator';
import { AmbientCanvas } from './components/AmbientCanvas';
import { CursorGlow } from './components/CursorGlow';
import { useGameStore } from './store/useGameStore';
import { X } from 'lucide-react';
import { stripEmoji } from './services/textSanitizer';
import { useCharacterNavigation } from './features/characters/useCharacterNavigation';
import type { CharacterId } from './features/characters/types';

export const App: React.FC = () => {
  const { changesLog } = useGameStore();
  const [isDossierOpen, setDossierOpen] = useState(false);
  const [booted, setBooted] = useState(false);
  const characterNavigation = useCharacterNavigation();

  // 点击正文中的人名:打开对应卷宗;卷宗收于抽屉,两端都自动拉出
  const openStoryCharacter = useCallback((characterId: CharacterId) => {
    characterNavigation.openCharacter(characterId);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setDossierOpen(true); // 移动端:点击人物后自动打开人物抽屉
    } else {
      setDossierOpen(true); // 桌面端:同样以抽屉呈现卷宗
    }
  }, [characterNavigation.openCharacter]);

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
        setDossierOpen((open) => !open);
      }
      if (e.key === 'Escape') {
        // 物品选择/赠予对话框浮在卷宗之上:Esc 先关最上层,卷宗保持
        const itemDialogOpen = document.querySelector('[data-item-choice-dialog], [data-item-gift-dialog]');
        if (!itemDialogOpen) setDossierOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const dossierWindow = (
    <Ck3CharacterWindow
      selectedCharacterId={characterNavigation.selectedCharacterId}
      onSelectCharacter={characterNavigation.openCharacter}
      canGoBack={characterNavigation.canGoBack}
      onBack={characterNavigation.goBack}
      onReturnToPlayer={characterNavigation.returnToPlayer}
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
        <StoryFeed onSelectCharacter={openStoryCharacter} />
        <ActionDock />
      </main>

      {/* 卷宗竖签(右缘) */}
      {!isDossierOpen && (
        <button
          type="button"
          onClick={() => setDossierOpen(true)}
          className="dossier-tab fixed right-0 top-1/2 z-30 -translate-y-1/2"
          aria-label="打开人物卷宗"
          title="人物卷宗(按 C)"
        >
          人物卷宗
        </button>
      )}

      {/* 卷宗抽屉 */}
      {isDossierOpen && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="人物卷宗">
          <div className="modal-backdrop absolute inset-0" onClick={() => setDossierOpen(false)} />
          <div className="drawer-enter absolute right-0 top-0 flex h-full w-[92vw] max-w-[460px] flex-col border-l border-hairline-bright bg-ink shadow-[-32px_0_80px_rgba(0,0,0,0.45)]">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-hairline/70 px-4 select-none">
              <span className="eyebrow">人物卷宗</span>
              <button
                type="button"
                onClick={() => setDossierOpen(false)}
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

      {/* 模态弹窗系统 */}
      <DiceModal />
      <SettingsModal />
      <CharacterCreator />
    </div>
  );
};

export default App;
