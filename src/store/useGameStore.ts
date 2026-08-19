import { create } from 'zustand';
import { GameState, LordProfile, StoryTurn, ApiConfig, D20Check } from '../types/game';
import { PRESET_SCENARIOS } from '../data/presets';
import type { CharacterCommandBatchBaseContext } from '../services/stateReducer';
import { performD20Check } from '../services/diceEngine';
import { DiceMode, evaluateDiceRequirement } from '../services/dicePolicy';
import { buildTurnResolutionMessages, requestTurnResolution, settleTurnDraft } from '../services/turnResolution';
import { buildSettledNarrativeMessages, streamSettledNarrative } from '../services/turnNarration';
import { saveTurnSnapshot, commitTurnAtomically, rollbackLastTurn, clearSaveData } from '../services/db';
import { stripEmoji, stripEmojiDeep } from '../services/textSanitizer';
import { normalizeCk3Attributes } from '../data/ck3Skills';
import { migrateLordIdentityData, migrateLordTraitData } from '../data/characterTraits';
import { ITEM_SAVE_FORMAT_VERSION } from '../features/items/saveVersion';
import {
  cancelItemAction as cancelQueuedItemAction,
  createPendingItemAction,
  enqueueItemAction,
  removeSubmittedItemActions,
  type PendingItemAction,
} from '../features/items/itemActionQueue';
import type { ItemAction } from '../features/items/types';
import { ITEM_CATALOG } from '../data/itemDefinitions';
import { getItemDefinition } from '../features/items/catalog';
import { AGOT_CHARACTER_DATASET_HASH, createInitialAgotArtifactWorldState } from '../features/items/worldArtifacts';
import { createWorldHistoryState, type WorldDate } from '../features/world/worldHistory';
import { CANONICAL_TIMELINE } from '../data/generated/canonicalTimeline';
import { initializeCanonicalStates } from '../features/world/canonicalTimeline';
import type { CharacterId } from '../features/characters/types';
import { buildWorldTurnContext, formatWorldTurnContext } from '../features/world/worldTurnContext';
import type { TravelStateCommand } from '../features/map/travel/types';

export interface CharacterTurnContext extends CharacterCommandBatchBaseContext { promptContext?: string; }

export interface NewGameWorldSetup {
  startDate?: WorldDate;
  season?: string;
  canonicalCharacterId?: CharacterId;
}

interface GameStore {
  // 状态
  gameState: GameState;
  apiConfig: ApiConfig;
  isStreaming: boolean;
  streamingText: string;
  activeDiceCheck: D20Check | null;
  changesLog: string[];
  pendingItemActions: PendingItemAction[];
  pendingTravelCommand: TravelStateCommand | null;
  characterTurnContext: CharacterTurnContext | null;
  
  // 模态弹窗状态
  isDiceModalOpen: boolean;
  isSettingsOpen: boolean;
  isCreatorOpen: boolean;
  isTvTimelineOpen: boolean;

  // 动作
  setApiConfig: (config: Partial<ApiConfig>) => void;
  setStreaming: (isStreaming: boolean) => void;
  openSettings: () => void;
  closeSettings: () => void;
  openCreator: () => void;
  closeCreator: () => void;
  openTvTimeline: () => void;
  closeTvTimeline: () => void;
  closeDiceModal: () => void;
  queueItemAction: (action: ItemAction) => void;
  cancelItemAction: (actionId: string) => void;
  queueTravelCommand: (command: TravelStateCommand) => void;
  cancelTravelCommand: () => void;
  setCharacterTurnContext: (context: CharacterTurnContext | null) => void;

  // 游戏核心流程
  startNewGame: (lord: LordProfile, opening: { think?: string; narrate: string; speak?: Array<{ speaker: string; text: string }>; branches: string[] }, worldSetup?: NewGameWorldSetup) => Promise<void>;
  submitAction: (actionText: string, diceMode?: DiceMode) => Promise<void>;
  undoTurn: () => Promise<void>;
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
const AGOT_DATASET_HASH = AGOT_CHARACTER_DATASET_HASH;
function createWorldRunId(): string {
  return "run_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

const DEFAULT_CUSTOM_WORLD_DATE: WorldDate = { year: 298, month: 10, day: 15 };
const INITIAL_WORLD_DATE: WorldDate = { ...defaultPreset.startDate };

function createInitialWorldHistory(startDate: WorldDate) {
  const history = createWorldHistoryState(startDate);
  history.canonical = initializeCanonicalStates(CANONICAL_TIMELINE, startDate);
  return history;
}

function formatWorldDate(date: WorldDate): string {
  return `征服历 ${date.year} AC · ${date.month}月${date.day}日`;
}

const INITIAL_GAME_STATE: GameState = {
  saveFormatVersion: ITEM_SAVE_FORMAT_VERSION,
  currentYear: INITIAL_WORLD_DATE.year,
  currentMonth: INITIAL_WORLD_DATE.month,
  currentDay: INITIAL_WORLD_DATE.day,
  currentSeason: defaultPreset.season,
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
      gameDate: formatWorldDate(INITIAL_WORLD_DATE),
      timestamp: Date.now(),
    },
  ],
  worldCharacters: { runId: createWorldRunId(), datasetHash: AGOT_DATASET_HASH, revision: 0 },
  worldArtifacts: createInitialAgotArtifactWorldState(),
  worldHistory: createInitialWorldHistory(INITIAL_WORLD_DATE),
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
  pendingItemActions: [],
  pendingTravelCommand: null,
  characterTurnContext: null,
  isDiceModalOpen: false,
  isSettingsOpen: false,
  isCreatorOpen: false,
  isTvTimelineOpen: false,

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
  openTvTimeline: () => set({ isTvTimelineOpen: true }),
  closeTvTimeline: () => set({ isTvTimelineOpen: false }),
  closeDiceModal: () => set({ isDiceModalOpen: false, activeDiceCheck: null }),

  queueItemAction: (action) => {
    if (get().isStreaming) return;
    const instanceId = action.kind === 'acquire'
      ? action.instance.instanceId
      : action.kind === 'merge'
        ? action.sourceInstanceId
        : action.instanceId;
    const instance = action.kind === 'acquire' ? action.instance : get().gameState.lord.items.instances[instanceId];
    if (!instance) return;
    const definition = getItemDefinition(ITEM_CATALOG, instance.definitionId);
    const verb: Record<ItemAction['kind'], string> = {
      acquire: '收下', equip: '穿上', unequip: '卸下', use: '使用', transfer: '转移', gift: '赠送',
      discard: '丢弃', repair: '修理', damage: '受损', split: '拆分', merge: '合并', mark_heirloom: '立为传家宝',
    };
    const pending = createPendingItemAction(action, {
      itemName: instance.customName ?? definition.name,
      image: definition.image,
      label: verb[action.kind],
    });
    set((state) => ({ pendingItemActions: enqueueItemAction(state.pendingItemActions, pending) }));
  },
  setCharacterTurnContext: (context) => set({ characterTurnContext: context ? { ...context, characters: context.characters.map((character) => ({ ...character })), promptContext: context.promptContext ? stripEmoji(context.promptContext) : undefined } : null }),
  cancelItemAction: (actionId) => {
    if (get().isStreaming) return;
    set((state) => ({ pendingItemActions: cancelQueuedItemAction(state.pendingItemActions, actionId) }));
  },
  queueTravelCommand: (command) => {
    if (get().isStreaming) return;
    set({ pendingTravelCommand: structuredClone(command) });
  },
  cancelTravelCommand: () => {
    if (get().isStreaming) return;
    set({ pendingTravelCommand: null });
  },

  // 开启新剧本
  startNewGame: async (lord, opening, worldSetup) => {
    await clearSaveData();
    const startDate = worldSetup?.startDate ? { ...worldSetup.startDate } : { ...DEFAULT_CUSTOM_WORLD_DATE };
    const startSeason = stripEmoji(worldSetup?.season ?? '凛冬将至 (晚秋)');
    const safeLord = migrateLordIdentityData(migrateLordTraitData(stripEmojiDeep(lord)));
    if (worldSetup?.canonicalCharacterId) safeLord.canonicalCharacterId = worldSetup.canonicalCharacterId;
    safeLord.attributes = normalizeCk3Attributes(safeLord.attributes);
    if (safeLord.baseAttributes) safeLord.baseAttributes = normalizeCk3Attributes(safeLord.baseAttributes);
    const newTurn: StoryTurn = {
      id: `turn_${Date.now()}`,
      turnNumber: 1,
      playerInput: '开启维斯特洛传奇',
      think: opening.think ? stripEmoji(opening.think) : undefined,
      narrate: stripEmoji(opening.narrate),
      branches: opening.branches.map(stripEmoji),
      gameDate: formatWorldDate(startDate),
      timestamp: Date.now(),
    };

    const newGameState: GameState = {
      saveFormatVersion: ITEM_SAVE_FORMAT_VERSION,
      currentYear: startDate.year,
      currentMonth: startDate.month,
      currentDay: startDate.day,
      currentSeason: startSeason,
      turnCount: 1,
      lord: safeLord,
      turns: [newTurn],
      worldCharacters: { runId: createWorldRunId(), datasetHash: AGOT_DATASET_HASH, revision: 0 },
      worldArtifacts: createInitialAgotArtifactWorldState(),
      worldHistory: createInitialWorldHistory(startDate),
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
      pendingItemActions: [],
      pendingTravelCommand: null,
      characterTurnContext: null,
    });
  },

  // 提交领主行动
  submitAction: async (actionText: string, diceMode: DiceMode = 'auto') => {
    const { gameState, apiConfig, isStreaming, pendingItemActions, pendingTravelCommand, characterTurnContext } = get();
    const safeActionText = stripEmoji(actionText);
    if (isStreaming || gameState.isGameOver || !safeActionText) return;

    const submittedItemActions = [...pendingItemActions];
    const submittedTravelCommand = pendingTravelCommand ? structuredClone(pendingTravelCommand) : null;
    let diceCheck: D20Check | undefined = undefined;

    // 1. 只有存在真实风险的行动才进行 D20 检定；叙事模式永不隐藏掷骰。
    const diceDecision = evaluateDiceRequirement(safeActionText, { overallStatus: gameState.lord.overallStatus });
    const shouldRoll = !diceDecision.isImpossible && (diceMode === 'force' || (diceMode === 'auto' && diceDecision.shouldRoll));
    if (shouldRoll) {
      diceCheck = performD20Check(
        safeActionText,
        gameState.lord.attributes,
        gameState.lord.items,
        ITEM_CATALOG,
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
      const automaticWorldContext = characterTurnContext
        ? null
        : await buildWorldTurnContext({ gameState, actionText: safeActionText }).catch((error: unknown) => {
          console.warn(`自动人物上下文暂不可用：${error instanceof Error ? error.message : String(error)}`);
          return null;
        });
      const effectiveCharacterContext: CharacterCommandBatchBaseContext | undefined = characterTurnContext
        ?? automaticWorldContext?.characterCommandContext;
      const automaticPromptContext = automaticWorldContext ? formatWorldTurnContext(automaticWorldContext) : '';
      const combinedPromptContext = [automaticPromptContext, characterTurnContext?.promptContext].filter(Boolean).join('\n\n');
      const nextTurnNumber = gameState.turnCount + 1;

      // 第一阶段只解析规则与命令，不生成最终正文。
      const resolutionMessages = buildTurnResolutionMessages(
        gameState,
        safeActionText,
        diceCheck,
        { mode: diceMode, decision: diceDecision },
        submittedItemActions,
        combinedPromptContext,
      );
      const draft = await requestTurnResolution(
        resolutionMessages,
        apiConfig,
        gameState,
        submittedItemActions,
      );
      const settled = settleTurnDraft({
        gameState,
        actionText: safeActionText,
        nextTurnNumber,
        draft,
        pendingItemActions: submittedItemActions,
        pendingTravelCommands: submittedTravelCommand ? [submittedTravelCommand] : [],
        characterContext: effectiveCharacterContext,
        diceCheck,
      });

      // 第二阶段只能根据程序已接受的事实生成正文。
      const narrativeMessages = buildSettledNarrativeMessages({
        gameState,
        actionText: safeActionText,
        facts: settled.resolvedFacts,
      });
      const parsedTurn = await streamSettledNarrative(
        narrativeMessages,
        apiConfig,
        nextTurnNumber,
        safeActionText,
        (partial) => set({ streamingText: stripEmoji(partial) }),
      );
      const turnDate = formatWorldDate(settled.nextDate);
      const finalTurn: StoryTurn = {
        ...parsedTurn,
        id: `turn_${Date.now()}`,
        diceCheck,
        stateCommands: settled.acceptedCommands,
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
        currentYear: settled.nextDate.year,
        currentMonth: settled.nextDate.month,
        currentDay: settled.nextDate.day,
        currentSeason: settled.nextSeason,
        turnCount: nextTurnNumber,
        lord: settled.updatedLord,
        turns: [...gameState.turns, finalTurn],
        worldCharacters: { ...currentWorldRef, revision: currentWorldRef.revision + 1 },
        worldHistory: settled.worldHistory,
        activeJourney: settled.activeJourney,
        isGameOver: settled.isFatalDeath,
        deathReason: settled.isFatalDeath ? '要害遭受致命创伤，领主陨落于维斯特洛的残酷权谋之中' : undefined,
      });

      await commitTurnAtomically(
        updatedGameState,
        settled.characterEvents,
        `回合 ${nextTurnNumber}: ${safeActionText.slice(0, 20)}`,
      );

      set({
        gameState: updatedGameState,
        isStreaming: false,
        streamingText: '',
        pendingItemActions: removeSubmittedItemActions(get().pendingItemActions, submittedItemActions),
        pendingTravelCommand: null,
        characterTurnContext: characterTurnContext
          ? { ...settled.characterContext, promptContext: characterTurnContext.promptContext }
          : null,
        changesLog: [
          ...settled.changesLog,
          diceCheck ? `检定结果: ${diceCheck.attributeName} ${diceCheck.success ? '成功' : '失败'} (总点数 ${diceCheck.total} vs DC ${diceCheck.dc})` : '',
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
      restoredState.lord = migrateLordIdentityData(migrateLordTraitData(restoredState.lord));
      restoredState.lord.attributes = normalizeCk3Attributes(restoredState.lord.attributes);
      if (restoredState.lord.baseAttributes) restoredState.lord.baseAttributes = normalizeCk3Attributes(restoredState.lord.baseAttributes);
      set({
        gameState: restoredState,
        changesLog: ['时光倒流: 已回退到上一回合决策点'],
        pendingItemActions: [],
        pendingTravelCommand: null,
        characterTurnContext: null,
      });
    } else {
      alert('已到达剧本起点，无法继续回退。');
    }
  },
}));
