import React from 'react';
import { useGameStore } from '../store/useGameStore';
import { Settings, PlusCircle, RotateCcw, Calendar, Clock, Hourglass } from 'lucide-react';
import { GameIcon } from './GameIcon';

export const Header: React.FC = () => {
  const { gameState, isStreaming, openSettings, openCreator, undoTurn } = useGameStore();
  const { currentYear, currentMonth, currentDay, currentSeason, turnCount } = gameState;

  return (
    <header className="h-12 bg-[#0e0c0a]/95 border-b border-[#33271d] px-4 md:px-6 flex items-center justify-between z-30 backdrop-blur-md select-none shrink-0">
      {/* 左侧：游戏标题 */}
      <div className="flex items-center gap-2">
        <GameIcon icon="gear-sword" className="w-7 h-7 drop-shadow-md" />
        <h1 className="font-serif font-bold text-[#e5be6c] tracking-wider text-sm md:text-base">
          维斯特洛编年史
        </h1>
        <span className="text-[10px] text-[#8a652a] font-serif hidden sm:inline-block tracking-widest uppercase">
          Chronicles of Westeros
        </span>
      </div>

      {/* 中间：只保留时间、时节与回合纪年信息 */}
      <div className="flex items-center gap-2 md:gap-4 bg-[#17130f] px-3.5 py-1 rounded-full border border-[#33271d] shadow-inner text-xs font-serif">
        {/* 纪年与具体日期 */}
        <div className="flex items-center gap-1.5 text-[#e6ded1]">
          <Calendar className="w-3.5 h-3.5 text-[#c89d54]" />
          <span className="font-bold tracking-wide">
            征服历 {currentYear} AC · {currentMonth || 10}月{currentDay || 15}日
          </span>
        </div>

        <div className="w-[1px] h-3 bg-[#33271d]" />

        {/* 时节 */}
        <div className="flex items-center gap-1.5 text-[#e5be6c]">
          <Clock className="w-3.5 h-3.5 text-[#8a652a]" />
          <span className="italic">{currentSeason}</span>
        </div>

        <div className="w-[1px] h-3 bg-[#33271d]" />

        {/* 回合数 */}
        <div className="flex items-center gap-1 text-[#a89f91] font-mono">
          <Hourglass className="w-3.5 h-3.5 text-[#c89d54]" />
          <span>第 <strong className="text-[#e5be6c]">{turnCount}</strong> 回合</span>
        </div>
      </div>

      {/* 右侧：系统功能按钮组 */}
      <div className="flex items-center gap-2">
        {/* 回退上一回合 */}
        <button
          onClick={undoTurn}
          disabled={isStreaming || turnCount <= 1}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-[#1c1813] hover:bg-[#2b241c] text-[#a89f91] hover:text-[#e6ded1] border border-[#33271d] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          title="回退到上一回合决策"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden md:inline">撤回</span>
        </button>

        {/* 开启新剧本 */}
        <button
          onClick={openCreator}
          disabled={isStreaming}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-[#1c1813] hover:bg-[#2b241c] text-[#c89d54] hover:text-[#e5be6c] border border-[#33271d] transition-all disabled:opacity-40"
          title="选择新剧本或自创领主"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span className="hidden md:inline">新剧本</span>
        </button>

        {/* 设置 */}
        <button
          onClick={openSettings}
          className="p-1 rounded bg-[#1c1813] hover:bg-[#2b241c] text-[#a89f91] hover:text-[#e6ded1] border border-[#33271d] transition-all"
          title="大模型 API 设置"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
