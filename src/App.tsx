import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Ck3CharacterWindow } from './components/Ck3CharacterWindow';
import { StoryFeed } from './components/StoryFeed';
import { ActionDock } from './components/ActionDock';
import { DiceModal } from './components/DiceModal';
import { SettingsModal } from './components/SettingsModal';
import { CharacterCreator } from './components/CharacterCreator';
import { useGameStore } from './store/useGameStore';
import { UserRound, X } from 'lucide-react';
import { stripEmoji } from './services/textSanitizer';
import { useCharacterNavigation } from './features/characters/useCharacterNavigation';

export const App: React.FC = () => {
  const { changesLog } = useGameStore();
  const [isDossierOpen, setDossierOpen] = useState(false);
  const characterNavigation = useCharacterNavigation();

  // 全局快捷键:/ 聚焦命令行;Esc 收起移动端卷宗
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        document.getElementById('command-input')?.focus();
      }
      if (e.key === 'Escape') setDossierOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-ink text-parchment select-text">
      {/* 桌面:海图刻线、流云投影、纸尘、边缘旧化 */}
      <div className="map-atmosphere" aria-hidden="true" />
      <div className="map-edge-burn" aria-hidden="true" />

      {/* 罗盘玫瑰刻线(桌角装饰) */}
      <svg
        className="pointer-events-none fixed -bottom-16 -right-16 z-0 h-72 w-72 text-gold-deep/40"
        viewBox="0 0 200 200"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
      >
        <circle cx="100" cy="100" r="92" strokeWidth="1" />
        <circle cx="100" cy="100" r="70" strokeWidth="0.75" />
        <circle cx="100" cy="100" r="8" strokeWidth="1" />
        <path d="M100 8 L108 88 L100 100 L92 88 Z" fill="currentColor" stroke="none" opacity="0.7" />
        <path d="M100 192 L108 112 L100 100 L92 112 Z" strokeWidth="0.75" />
        <path d="M8 100 L88 92 L100 100 L88 108 Z" strokeWidth="0.75" />
        <path d="M192 100 L112 92 L100 100 L112 108 Z" strokeWidth="0.75" />
        <path d="M100 30 v-14 M100 170 v14 M30 100 h-14 M170 100 h14" strokeWidth="1" />
      </svg>

      {/* 图例框与铜件(浮于桌面,不再是顶栏) */}
      <Header />

      {/* 桌面陈设:纸页叙事 + 档案夹 + 写字台 */}
      <main className="relative z-10 flex h-full min-h-0">
        <section className="relative flex h-full min-w-0 flex-1 flex-col">
          {/* 局势速递:浮于纸页上方的小纸条 */}
          {changesLog.length > 0 && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
              <div className="scene-enter flex items-center gap-3 whitespace-nowrap border border-hairline-bright/70 bg-ink-2/95 px-4 py-1.5 text-[11px] shadow-[0_6px_16px_rgba(74,58,32,0.25)]">
                <span className="eyebrow shrink-0">局势</span>
                {changesLog.slice(-3).map((log, i) => (
                  <span key={i} className="font-serif text-parchment-dim">
                    {stripEmoji(log)}
                  </span>
                ))}
              </div>
            </div>
          )}
          <StoryFeed />
          <ActionDock />
        </section>

        {/* 档案夹:黄铜图钉按在桌上的领主卷宗 */}
        <div className="relative hidden w-[440px] shrink-0 py-5 pr-5 lg:block xl:w-[490px] 2xl:w-[540px]">
          <div className="relative h-full -rotate-[0.7deg] shadow-[10px_18px_44px_rgba(74,58,32,0.4)]">
            {/* 黄铜图钉 */}
            <span
              className="absolute -top-2 left-1/2 z-40 h-5 w-5 -translate-x-1/2 rounded-full"
              style={{
                background: 'radial-gradient(circle at 34% 30%, #e8c87e, #b08a3c 55%, #6b4e1a)',
                boxShadow: '0 3px 6px rgba(74,58,32,0.5), inset 0 -2px 3px rgba(0,0,0,0.3)',
              }}
              aria-hidden="true"
            />
            <Ck3CharacterWindow
              selectedCharacterId={characterNavigation.selectedCharacterId}
              onSelectCharacter={characterNavigation.openCharacter}
              canGoBack={characterNavigation.canGoBack}
              onBack={characterNavigation.goBack}
              onReturnToPlayer={characterNavigation.returnToPlayer}
            />
          </div>
        </div>
      </main>

      {/* 移动端:火漆浮钮唤出领主卷宗 */}
      <button
        type="button"
        onClick={() => setDossierOpen(true)}
        className="btn-decree fixed bottom-24 right-4 z-30 !h-12 !w-12 !rounded-full !p-0 lg:hidden"
        aria-label="打开人物档案"
        title="人物档案"
      >
        <UserRound className="h-5 w-5" />
      </button>

      {isDossierOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="人物档案">
          <div className="modal-backdrop absolute inset-0" onClick={() => setDossierOpen(false)} />
          <div className="scene-enter absolute right-0 top-0 h-full w-[88vw] max-w-[420px] border-l border-hairline-bright bg-ink shadow-[-16px_0_44px_rgba(74,58,32,0.45)]">
            <button
              type="button"
              onClick={() => setDossierOpen(false)}
              className="btn-ghost absolute right-3 top-3 z-50 !bg-ink-2/95 !px-2"
              aria-label="收起人物档案"
            >
              <X className="h-4 w-4" />
            </button>
            <Ck3CharacterWindow
              selectedCharacterId={characterNavigation.selectedCharacterId}
              onSelectCharacter={characterNavigation.openCharacter}
              canGoBack={characterNavigation.canGoBack}
              onBack={characterNavigation.goBack}
              onReturnToPlayer={characterNavigation.returnToPlayer}
            />
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
