import React from 'react';
import { Header } from './components/Header';
import { Ck3CharacterWindow } from './components/Ck3CharacterWindow';
import { StoryFeed } from './components/StoryFeed';
import { ActionDock } from './components/ActionDock';
import { DiceModal } from './components/DiceModal';
import { SettingsModal } from './components/SettingsModal';
import { CharacterCreator } from './components/CharacterCreator';
import { useGameStore } from './store/useGameStore';
import { Activity } from 'lucide-react';
import { stripEmoji } from './services/textSanitizer';

export const App: React.FC = () => {
  const { changesLog } = useGameStore();

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0a0908] text-[#e6ded1] overflow-hidden select-text">
      {/* 顶部极简状态栏 */}
      <Header />

      {/* 状态变动提示浮条 (若最近有数值变动) */}
      {changesLog.length > 0 && (
        <div className="bg-[#17130f] border-b border-[#33271d] px-4 py-1 flex items-center justify-center gap-3 text-[11px] font-serif text-[#c89d54] overflow-x-auto whitespace-nowrap scrollbar-none">
          <Activity className="w-3.5 h-3.5 shrink-0" />
          {changesLog.slice(-3).map((log, i) => (
            <span key={i} className="animate-in fade-in">
              {stripEmoji(log)}
            </span>
          ))}
        </div>
      )}

      {/* 主工作区：左侧 280px 领主角色卡 + 右侧长卷叙事与底部控制坞 */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* CK3 风格人物窗口：宽屏常驻，健康、装备与物品收纳到页签。 */}
        <div className="hidden lg:flex h-full w-[430px] xl:w-[480px] 2xl:w-[520px] shrink-0">
          <Ck3CharacterWindow />
        </div>

        {/* 右侧：小说叙事流 + 底部行动坞 */}
        <section className="flex-1 flex flex-col h-full overflow-hidden bg-[#0c0a08] relative">
          <StoryFeed />
          <ActionDock />
        </section>
      </main>

      {/* 模态弹窗系统 */}
      <DiceModal />
      <SettingsModal />
      <CharacterCreator />
    </div>
  );
};

export default App;
