import { create } from 'zustand';
import { GameState, LordProfile, StoryTurn, ApiConfig, D20Check, InventoryItem, ItemContainerRef, PendingEquipmentAction } from '../types/game';
import { PRESET_SCENARIOS } from '../data/presets';
import { applyStateCommands, isCharacterStateCommand, validateCharacterCommandBatch, type CharacterCommandBatchBaseContext } from '../services/stateReducer';
import { performD20Check } from '../services/diceEngine';
import { DiceMode, evaluateDiceRequirement } from '../services/dicePolicy';
import { buildChatMessages } from '../services/promptBuilder';
import { streamChatCompletion, parseModelOutput } from '../services/api';
import { saveTurnSnapshot, commitTurnAtomically, rollbackLastTurn, clearSaveData } from '../services/db';
import { stripEmoji, stripEmojiDeep } from '../services/textSanitizer';
import { normalizeCk3Attributes } from '../data/ck3Skills';
import { migrateLordIdentityData, migrateLordTraitData } from '../data/characterTraits';
import { ensureItemCustody } from '../services/itemCustody';
import { createPendingEquipmentAction, enqueueEquipmentAction, mergePendingEquipmentCommands, removeSubmittedEquipmentActions } from '../services/equipmentQueue';

export interface CharacterTurnContext extends CharacterCommandBatchBaseContext { promptContext?: string; }

interface GameStore {
  // 状态
  gameState: GameState;
  apiConfig: ApiConfig;
  isStreaming: boolean;
  streamingText: string;
  activeDiceCheck: D20Check | null;
  changesLog: string[];
  pendingEquipmentActions: PendingEquipmentAction[];
  characterTurnContext: CharacterTurnContext | null;
  
  // 模态弹窗状态
  isDiceModalOpen: boolean;
  isSettingsOpen: boolean;
  isCreatorOpen: boolean;

  // 动作
  setApiConfig: (config: Partial<ApiConfig>) => void;
  setStreaming: (isStreaming: boolean) => void;
  openSettings: () => void;
  closeSettings: () => void;
  openCreator: () => void;
  closeCreator: () => void;
  closeDiceModal: () => void;
  queueEquipmentAction: (item: InventoryItem, from: ItemContainerRef, sourceLabel: string) => void;
  cancelEquipmentAction: (actionId: string) => void;
  setCharacterTurnContext: (context: CharacterTurnContext | null) => void;

  // 游戏核心流程
  startNewGame: (lord: LordProfile, opening: { think?: string; narrate: string; speak?: Array<{ speaker: string; text: string }>; branches: string[] }) => Promise<void>;
  submitAction: (actionText: string, diceMode?: DiceMode) => Promise<void>;
  undoTurn: () => Promise<void>;
  useInventoryItem: (itemId: string) => void;
  usePouchItem: (itemId: string) => void;
  unequipGear: (slot: keyof LordProfile['gear']) => void;
  equipFromInventory: (itemId: string, slot?: keyof LordProfile['gear']) => void;
}

// 默认 API 配置
const DEFAULT_API_CONFIG: ApiConfig = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.7,
};

function loadStoredApiConfig(): ApiConfig {
  try {
    const saved = localStorage.getItem('got_api_config');
    if (saved) {
      return { ...DEFAULT_API_CONFIG, ...JSON.parse(saved) };
    }
  } catch {
    // 忽略错误
  }
  return DEFAULT_API_CONFIG;
}

const defaultPreset = PRESET_SCENARIOS[0];
const AGOT_DATASET_HASH = 'bad838f66b60701ce38662f148e63bd8551fdb8711eacb4fd507d356194d1652';
function createWorldRunId(): string {
  return "run_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

const INITIAL_GAME_STATE: GameState = {
  currentYear: 298,
  currentMonth: 10,
  currentDay: 15,
  currentSeason: '凛冬将至 (晚秋)',
  turnCount: 1,
  lord: defaultPreset.initialLord,
  turns: [
    {
      id: 'turn_1',
      turnNumber: 1,
      playerInput: '开启维斯特洛传奇',
      think: defaultPreset.initialOpening.think,
      narrate: defaultPreset.initialOpening.narrate,
      branches: defaultPreset.initialOpening.branches,
      gameDate: '征服历 298 AC · 10月15日',
      timestamp: Date.now(),
    },
  ],
  worldCharacters: { runId: createWorldRunId(), datasetHash: AGOT_DATASET_HASH, revision: 0 },
  worldFlags: {},
  isGameOver: false,
};

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: INITIAL_GAME_STATE,
  apiConfig: loadStoredApiConfig(),
  isStreaming: false,
  streamingText: '',
  activeDiceCheck: null,
  changesLog: [],
  pendingEquipmentActions: [],
  characterTurnContext: null,
  isDiceModalOpen: false,
  isSettingsOpen: false,
  isCreatorOpen: false,

  setApiConfig: (config) => {
    const updated = { ...get().apiConfig, ...config };
    set({ apiConfig: updated });
    try {
      localStorage.setItem('got_api_config', JSON.stringify(updated));
    } catch {
      // 忽略
    }
  },

  setStreaming: (isStreaming) => set({ isStreaming }),
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  openCreator: () => set({ isCreatorOpen: true }),
  closeCreator: () => set({ isCreatorOpen: false }),
  closeDiceModal: () => set({ isDiceModalOpen: false, activeDiceCheck: null }),

  // 装备点击只进入队列；当前装备会在下一次叙事成功返回后更新。
  queueEquipmentAction: (item, from, sourceLabel) => {
    if (get().isStreaming) return;
    const action = createPendingEquipmentAction(item, from, sourceLabel);
    set((state) => ({
      pendingEquipmentActions: enqueueEquipmentAction(state.pendingEquipmentActions, action),
    }));
  },
  setCharacterTurnContext: (context) => set({ characterTurnContext: context ? { ...context, characters: context.characters.map((character) => ({ ...character })), promptContext: context.promptContext ? stripEmoji(context.promptContext) : undefined } : null }),
  cancelEquipmentAction: (actionId) => {
    if (get().isStreaming) return;
    set((state) => ({
      pendingEquipmentActions: state.pendingEquipmentActions.filter((action) => action.id !== actionId),
    }));
  },

  // 使用随身物品
  useInventoryItem: (itemId: string) => {
    const { gameState } = get();
    const { updatedLord, changesLog } = applyStateCommands(gameState.lord, [
      { type: 'USE_CARRIED_ITEM', itemId },
    ]);

    set({
      gameState: { ...gameState, lord: updatedLord },
      changesLog: [...get().changesLog, ...changesLog],
    });
  },
  usePouchItem: (itemId: string) => {
    get().useInventoryItem(itemId);
  },

  // 卸下身上装备并按体积分配至随身或当前据点
  unequipGear: (slot: keyof LordProfile['gear']) => {
    const { gameState } = get();
    const { updatedLord, changesLog } = applyStateCommands(gameState.lord, [
      { type: 'UNEQUIP_GEAR', slot: slot as any },
    ]);

    set({
      gameState: { ...gameState, lord: updatedLord },
      changesLog: [...get().changesLog, ...changesLog],
    });
  },

  // 旧界面动作兼容：从随身物品选择装备时也进入下一回合队列。
  equipFromInventory: (itemId: string) => {
    const { gameState } = get();
    const item = (gameState.lord.carriedItems || []).find((entry) => entry.id === itemId);
    if (item) get().queueEquipmentAction(item, { type: 'carried' }, '随身物品');
  },

  // 开启新剧本
  startNewGame: async (lord, opening) => {
    await clearSaveData();
    const safeLord = migrateLordIdentityData(migrateLordTraitData(ensureItemCustody(stripEmojiDeep(lord))));
    safeLord.attributes = normalizeCk3Attributes(safeLord.attributes);
    if (safeLord.baseAttributes) safeLord.baseAttributes = normalizeCk3Attributes(safeLord.baseAttributes);
    const newTurn: StoryTurn = {
      id: `turn_${Date.now()}`,
      turnNumber: 1,
      playerInput: '开启维斯特洛传奇',
      think: opening.think ? stripEmoji(opening.think) : undefined,
      narrate: stripEmoji(opening.narrate),
      branches: opening.branches.map(stripEmoji),
      gameDate: '征服历 298 AC · 10月15日',
      timestamp: Date.now(),
    };

    const newGameState: GameState = {
      currentYear: 298,
      currentMonth: 10,
      currentDay: 15,
      currentSeason: '凛冬将至 (晚秋)',
      turnCount: 1,
      lord: safeLord,
      turns: [newTurn],
      worldCharacters: { runId: createWorldRunId(), datasetHash: AGOT_DATASET_HASH, revision: 0 },
      worldFlags: {},
      isGameOver: false,
    };

    await saveTurnSnapshot(newGameState, '剧本开局');

    set({
      gameState: newGameState,
      isCreatorOpen: false,
      changesLog: [`维斯特洛新传奇开启: ${safeLord.house} · ${safeLord.name}`],
      streamingText: '',
      isStreaming: false,
      pendingEquipmentActions: [],
      characterTurnContext: null,
    });
  },

  // 提交领主行动
  submitAction: async (actionText: string, diceMode: DiceMode = 'auto') => {
    const { gameState, apiConfig, isStreaming, pendingEquipmentActions, characterTurnContext } = get();
    const safeActionText = stripEmoji(actionText);
    if (isStreaming || gameState.isGameOver || !safeActionText) return;

    const submittedEquipmentActions = [...pendingEquipmentActions];
    let diceCheck: D20Check | undefined = undefined;

    // 1. 只有存在真实风险的行动才进行 D20 检定；叙事模式永不隐藏掷骰。
    const diceDecision = evaluateDiceRequirement(safeActionText, { overallStatus: gameState.lord.overallStatus });
    const shouldRoll = !diceDecision.isImpossible && (diceMode === 'force' || (diceMode === 'auto' && diceDecision.shouldRoll));
    if (shouldRoll) {
      diceCheck = performD20Check(
        safeActionText,
        gameState.lord.attributes,
        gameState.lord.gear,
        gameState.lord.traitIds ?? [],
        diceDecision.attribute,
        diceDecision.dc,
        diceDecision.domain,
      );
      set({
        activeDiceCheck: diceCheck,
        isDiceModalOpen: true,
      });
    }

    set({ isStreaming: true, streamingText: '' });

    try {
      // 2. 组装 Prompt
      const messages = buildChatMessages(gameState, safeActionText, diceCheck, { mode: diceMode, decision: diceDecision }, submittedEquipmentActions, characterTurnContext?.promptContext);

      // 3. 流式请求
      const rawOutput = await streamChatCompletion(
        messages,
        apiConfig,
        (partial) => {
          set({ streamingText: stripEmoji(partial) });
        },
        undefined,
        gameState,
        submittedEquipmentActions,
      );

      // 4. 解析结构化标签
      const nextTurnNumber = gameState.turnCount + 1;
      const parsedTurn = parseModelOutput(rawOutput, nextTurnNumber, safeActionText);

      // 5. 确定性状态结算
      const stateCommands = mergePendingEquipmentCommands(submittedEquipmentActions, parsedTurn.stateCommands || []);
      const characterBatch = validateCharacterCommandBatch(stateCommands, characterTurnContext ?? undefined, nextTurnNumber);
      const lordCommands = stateCommands.filter((command) => !isCharacterStateCommand(command));
      const { updatedLord, changesLog, isFatalDeath } = applyStateCommands(gameState.lord, lordCommands);
      changesLog.push(...characterBatch.rejected.map((entry) => '人物命令拒绝 [' + entry.command.type + ']: ' + stripEmoji(entry.reason)));

      //  LLM 驱动的动态时间与历法演化 (完全由模型根据剧情耗时精准裁定)
      let nextDay = gameState.currentDay || 15;
      let nextMonth = gameState.currentMonth || 10;
      let nextYear = gameState.currentYear || 298;
      let nextSeason = gameState.currentSeason || '凛冬将至 (晚秋)';

      // 检索模型输出的时间流逝指令
      const advanceTimeCmd = stateCommands.find((c) => c.type === 'ADVANCE_TIME') as
        | { type: 'ADVANCE_TIME'; days?: number; months?: number; years?: number; season?: string; reason?: string }
        | undefined;
      const setDateCmd = stateCommands.find((c) => c.type === 'SET_DATE') as
        | { type: 'SET_DATE'; year?: number; month?: number; day?: number; season?: string; reason?: string }
        | undefined;

      if (setDateCmd) {
        if (setDateCmd.year !== undefined) nextYear = setDateCmd.year;
        if (setDateCmd.month !== undefined) nextMonth = setDateCmd.month;
        if (setDateCmd.day !== undefined) nextDay = setDateCmd.day;
        if (setDateCmd.season) nextSeason = stripEmoji(setDateCmd.season);
        if (setDateCmd.reason) changesLog.push(`时间变迁: ${stripEmoji(setDateCmd.reason)}`);
      } else if (advanceTimeCmd) {
        nextDay += advanceTimeCmd.days || 0;
        nextMonth += advanceTimeCmd.months || 0;
        nextYear += advanceTimeCmd.years || 0;
        if (advanceTimeCmd.season) nextSeason = stripEmoji(advanceTimeCmd.season);

        // 跨月与跨年处理 (维斯特洛历法每月30日，每年12月)
        while (nextDay > 30) {
          nextDay -= 30;
          nextMonth += 1;
        }
        while (nextMonth > 12) {
          nextMonth -= 12;
          nextYear += 1;
        }

        if (advanceTimeCmd.reason) {
          const durationStr = [
            advanceTimeCmd.years ? `${advanceTimeCmd.years}年` : '',
            advanceTimeCmd.months ? `${advanceTimeCmd.months}月` : '',
            advanceTimeCmd.days ? `${advanceTimeCmd.days}日` : '',
          ].filter(Boolean).join('');
          changesLog.push(`时间流逝 (${durationStr || '片段时光'}): ${stripEmoji(advanceTimeCmd.reason)}`);
        }
      }

      // 如果模型未主动指定季节，按月份推演
      if (!advanceTimeCmd?.season && !setDateCmd?.season) {
        if (nextMonth >= 1 && nextMonth <= 3) nextSeason = '新春之兆 (初春)';
        else if (nextMonth >= 4 && nextMonth <= 6) nextSeason = '烈阳盛夏 (盛夏)';
        else if (nextMonth >= 7 && nextMonth <= 9) nextSeason = '丰收残秋 (初秋)';
        else nextSeason = '凛冬将至 (晚秋与寒冬)';
      }

      const turnDate = `征服历 ${nextYear} AC · ${nextMonth}月${nextDay}日`;

      const finalTurn: StoryTurn = {
        ...parsedTurn,
        id: `turn_${Date.now()}`,
        diceCheck,
        stateCommands,
        gameDate: turnDate,
        timestamp: Date.now(),
      };
      const currentWorldRef = gameState.worldCharacters ?? {
        runId: createWorldRunId(),
        datasetHash: AGOT_DATASET_HASH,
        revision: 0,
      };

      const updatedGameState = stripEmojiDeep<GameState>({
        ...gameState,
        currentYear: nextYear,
        currentMonth: nextMonth,
        currentDay: nextDay,
        currentSeason: nextSeason,
        turnCount: nextTurnNumber,
        lord: updatedLord,
        turns: [...gameState.turns, finalTurn],
        worldCharacters: { ...currentWorldRef, revision: currentWorldRef.revision + 1 },
        isGameOver: isFatalDeath,
        deathReason: isFatalDeath ? '要害遭受致命创伤，领主陨落于维斯特洛的残酷权谋之中' : undefined,
      });

      // 6. 快照与人物事件先原子提交；提交失败时不改变 Zustand 或装备队列。
      await commitTurnAtomically(
        updatedGameState,
        characterBatch.events,
        `回合 ${nextTurnNumber}: ${safeActionText.slice(0, 20)}`,
      );

      set({
        gameState: updatedGameState,
        isStreaming: false,
        streamingText: '',
        pendingEquipmentActions: removeSubmittedEquipmentActions(get().pendingEquipmentActions, submittedEquipmentActions),
        characterTurnContext: characterTurnContext
          ? { ...characterBatch.context, promptContext: characterTurnContext.promptContext }
          : null,
        changesLog: [
          ...changesLog,
          diceCheck ? `检定结果: ${diceCheck.attributeName} ${diceCheck.success ? '成功' : '失败'} (总点数 ${diceCheck.total} vs DC ${diceCheck.dc})` : ''
        ].filter(Boolean),
      });
    } catch (err) {
      console.error('提交行动出错:', err);
      set({ isStreaming: false, streamingText: '' });
      alert(`叙事生成遇到错误: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  // 撤回上一回合 (时光机)
  undoTurn: async () => {
    const { isStreaming } = get();
    if (isStreaming) return;

    const previousState = await rollbackLastTurn();
    if (previousState) {
      const restoredState = stripEmojiDeep(previousState);
      restoredState.lord = migrateLordIdentityData(migrateLordTraitData(ensureItemCustody(restoredState.lord)));
      restoredState.lord.attributes = normalizeCk3Attributes(restoredState.lord.attributes);
      if (restoredState.lord.baseAttributes) restoredState.lord.baseAttributes = normalizeCk3Attributes(restoredState.lord.baseAttributes);
      set({
        gameState: restoredState,
        changesLog: ['时光倒流: 已回退到上一回合决策点'],
        pendingEquipmentActions: [],
        characterTurnContext: null,
      });
    } else {
      alert('已到达剧本起点，无法继续回退。');
    }
  },
}));
