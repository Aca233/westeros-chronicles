import { create } from 'zustand';
import { GameState, StoryTurn, ApiConfig, D20Check } from '../types/game';
import type { LivingWorldNewGame } from '../features/world/createLivingWorldGame';
import type { CharacterCommandBatchBaseContext } from '../services/stateReducer';
import type { DiceMode } from '../services/dicePolicy';
import {
  saveTurnSnapshot,
  commitTurnAtomically,
  rollbackLastTurn,
  clearSaveData,
  ensureTurnSnapshotBaseline,
  loadLatestGameState,
  listSaveSlots,
  deleteSaveSlot,
  importSaveData,
  createSlotId,
  type SaveSlotMeta,
} from '../services/db';
import { stripEmoji, stripEmojiDeep } from '../services/textSanitizer';
import { normalizeCk3Attributes } from '../data/ck3Skills';
import { migrateLordIdentityData, migrateLordTraitData } from '../data/characterTraits';
import { ITEM_SAVE_FORMAT_VERSION, repairKnownTurnRevisionDrift } from '../features/items/saveVersion';
import { ITEM_CATALOG, preloadItemCatalog } from '../data/itemDefinitions';
import { preloadNpcLoadoutContent } from '../features/items/npcLoadoutContent';
import { AGOT_CHARACTER_DATASET_HASH, createInitialAgotArtifactWorldState } from '../features/items/worldArtifacts';
import { createWorldHistoryState, type WorldDate } from '../features/world/worldHistory';
import { createWorldRuntimeState } from '../features/world/worldRuntimeState';
import { createRiverlandsCrisisInitialEvents, createRiverlandsCrisisLivingWorld } from '../features/world/livingWorldScenario';
import { CANONICAL_TIMELINE } from '../data/generated/canonicalTimeline';
import { initializeCanonicalStates } from '../features/world/canonicalTimeline';
import type { CharacterId } from '../features/characters/types';
import type { PendingWorldTransaction } from '../features/world/worldRuntimeTypes';
import {
  cancelWorldTransaction as cancelQueuedWorldTransaction,
  enqueueWorldTransaction,
} from '../features/world/worldTransactionQueue';
import { readDebugEnabled, writeDebugEnabled } from '../features/debug/debugSettings';
import type { ModelRequestTrace } from '../features/debug/modelRequestTrace';
import { buildModelRequestTrace } from '../features/debug/modelRequestTrace';
import { createActiveScene, synchronizeActiveScene } from '../features/world/sceneState';
import { createRoleplayState, isRoleplayStateCommand, settleRoleplayCommands } from '../features/roleplay/state';
import { buildAttemptIdentity, findUnchangedFailedAttempt } from '../services/attemptPolicy';

export interface CharacterTurnContext extends CharacterCommandBatchBaseContext { promptContext?: string; }

export type MenuView = 'title' | 'new' | 'load';

interface GameStore {
  // 状态
  gameState: GameState;
  apiConfig: ApiConfig;
  isStreaming: boolean;
  turnStage: 'idle' | 'resolving' | 'settling' | 'narrating';
  streamingText: string;
  activeDiceCheck: D20Check | null;
  changesLog: string[];
  characterTurnContext: CharacterTurnContext | null;
  debugEnabled: boolean;
  lastModelRequestTrace: ModelRequestTrace | null;
  bootStatus: 'loading' | 'ready' | 'error';
  bootError: string | null;

  // 屏幕与存档位
  activeScreen: 'menu' | 'game';
  menuView: MenuView;
  activeSlotId: string | null;
  saveSlots: SaveSlotMeta[];
  slotActionError: string | null;

  // 模态弹窗状态
  isDiceModalOpen: boolean;
  isSettingsOpen: boolean;
  isCreatorOpen: boolean;
  creatorInitialTab: 'existing' | 'custom';
  isTvTimelineOpen: boolean;

  // 动作
  setApiConfig: (config: Partial<ApiConfig>) => void;
  setDebugEnabled: (enabled: boolean) => void;
  cancelCurrentTurn: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openCreator: (tab?: 'existing' | 'custom') => void;
  closeCreator: () => void;
  openTvTimeline: () => void;
  closeTvTimeline: () => void;
  closeDiceModal: () => void;
  queueWorldTransaction: (transaction: PendingWorldTransaction) => void;
  cancelWorldTransaction: (transactionId: string) => void;
  setCharacterTurnContext: (context: CharacterTurnContext | null) => void;
  hydrateSaveSlots: () => Promise<void>;
  refreshSaveSlots: () => Promise<void>;
  continueGame: (slotId?: string) => Promise<boolean>;
  enterMenu: (view?: MenuView) => boolean;
  setMenuView: (view: MenuView) => void;
  deleteSlot: (slotId: string) => Promise<void>;
  importSlot: (jsonString: string) => Promise<SaveSlotMeta | null>;
  resetStoredGame: () => Promise<void>;

  // 游戏核心流程
  startNewGame: (game: LivingWorldNewGame) => Promise<void>;
  submitAction: (actionText: string, diceMode?: DiceMode) => Promise<void>;
  undoTurn: () => Promise<void>;
}

// 默认 API 配置
const DEFAULT_API_CONFIG: ApiConfig = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  fallbackModel: '',
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

const AGOT_DATASET_HASH = AGOT_CHARACTER_DATASET_HASH;
function createWorldRunId(): string {
  return "run_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

const INITIAL_WORLD_DATE: WorldDate = { year: 298, month: 5, day: 10 };

function createInitialWorldHistory(startDate: WorldDate) {
  const history = createWorldHistoryState(startDate);
  history.canonical = initializeCanonicalStates(CANONICAL_TIMELINE, startDate);
  return history;
}

function formatWorldDate(date: WorldDate): string {
  return `征服历 ${date.year} AC · ${date.month}月${date.day}日`;
}

function createInitialGameState(): GameState {
  const startDate = { ...INITIAL_WORLD_DATE };
  return {
    saveFormatVersion: ITEM_SAVE_FORMAT_VERSION,
    currentYear: startDate.year,
    currentMonth: startDate.month,
    currentDay: startDate.day,
    currentSeason: '暮春',
    turnCount: 1,
    lord: {
      name: '尚未选择人物', house: '尚未选择家族', houseWords: '—', houseSigil: 'unknown', title: '尚未开始', age: 18,
      gender: '未指定', location: { locationId: 'b_unknown_westeros' }, locationLabel: '所在地未查明',
      body: { head: { key: 'head', name: '头部与咽喉', level: 'intact', wounds: [], isFatalZone: true }, torso: { key: 'torso', name: '胸膛与躯干', level: 'intact', wounds: [], isFatalZone: true }, arms: { key: 'arms', name: '双臂与双手', level: 'intact', wounds: [], isFatalZone: false }, legs: { key: 'legs', name: '双腿与下肢', level: 'intact', wounds: [], isFatalZone: false }, isBleeding: false, isPoisoned: false, isInfected: false },
      overallStatus: '强健', items: { schemaVersion: 1, instances: {}, placements: {}, sites: {}, vehicles: {} },
      goldDragons: 0, silverStags: 0,
      attributes: { diplomacy: 0, martial: 0, stewardship: 0, intrigue: 0, learning: 0, prowess: 0 }, traits: [], traitIds: [],
    },
    turns: [],
    worldCharacters: { runId: createWorldRunId(), datasetHash: AGOT_DATASET_HASH, revision: 0 },
    worldArtifacts: createInitialAgotArtifactWorldState(),
    worldHistory: createInitialWorldHistory(startDate),
    worldRuntime: createWorldRuntimeState(),
    activeScene: createActiveScene({ locationId: 'b_unknown_westeros' }, 1),
    roleplay: createRoleplayState(),
    worldFlags: {},
    isGameOver: false,
  };
}

const INITIAL_GAME_STATE = createInitialGameState();
let currentTurnController: AbortController | null = null;

/** 载入存档时对领主数据做与导入一致的净化与迁移。 */
function sanitizeRestoredState(restored: GameState): GameState {
  const state = stripEmojiDeep(restored);
  state.lord = migrateLordIdentityData(migrateLordTraitData(state.lord));
  state.lord.attributes = normalizeCk3Attributes(state.lord.attributes);
  if (state.lord.baseAttributes) state.lord.baseAttributes = normalizeCk3Attributes(state.lord.baseAttributes);
  state.activeScene = state.activeScene
    ? synchronizeActiveScene(state.activeScene, state.lord.location, state.turnCount, state.activeScene.presentCharacterIds)
    : createActiveScene(state.lord.location, state.turnCount);
  state.roleplay ??= createRoleplayState();
  return state;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: INITIAL_GAME_STATE,
  apiConfig: loadStoredApiConfig(),
  isStreaming: false,
  turnStage: 'idle',
  streamingText: '',
  activeDiceCheck: null,
  changesLog: [],
  characterTurnContext: null,
  debugEnabled: readDebugEnabled(),
  lastModelRequestTrace: null,
  bootStatus: 'loading',
  bootError: null,
  activeScreen: 'menu',
  menuView: 'title',
  activeSlotId: null,
  saveSlots: [],
  slotActionError: null,
  isDiceModalOpen: false,
  isSettingsOpen: false,
  isCreatorOpen: false,
  creatorInitialTab: 'existing',
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
  setDebugEnabled: (enabled) => {
    writeDebugEnabled(enabled);
    set({ debugEnabled: enabled, ...(enabled ? {} : { lastModelRequestTrace: null }) });
  },

  cancelCurrentTurn: () => {
    currentTurnController?.abort(new DOMException('玩家取消了当前回合', 'AbortError'));
  },
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  openCreator: (tab) => set({ isCreatorOpen: true, ...(tab ? { creatorInitialTab: tab } : {}) }),
  closeCreator: () => set({ isCreatorOpen: false }),
  openTvTimeline: () => set({ isTvTimelineOpen: true }),
  closeTvTimeline: () => set({ isTvTimelineOpen: false }),
  closeDiceModal: () => set({ isDiceModalOpen: false, activeDiceCheck: null }),

  queueWorldTransaction: (transaction) => {
    if (get().isStreaming) return;
    set((state) => ({
      gameState: {
        ...state.gameState,
        worldRuntime: {
          ...state.gameState.worldRuntime,
          pendingTransactions: enqueueWorldTransaction(
            state.gameState.worldRuntime.pendingTransactions,
            transaction,
          ),
        },
      },
    }));
  },
  cancelWorldTransaction: (transactionId) => {
    if (get().isStreaming) return;
    set((state) => ({
      gameState: {
        ...state.gameState,
        worldRuntime: {
          ...state.gameState.worldRuntime,
          pendingTransactions: cancelQueuedWorldTransaction(
            state.gameState.worldRuntime.pendingTransactions,
            transactionId,
          ),
        },
      },
    }));
  },
  setCharacterTurnContext: (context) => set({ characterTurnContext: context ? { ...context, characters: context.characters.map((character) => ({ ...character })), promptContext: context.promptContext ? stripEmoji(context.promptContext) : undefined } : null }),
  // 启动:只加载存档位摘要与物品目录,完整 GameState 留到玩家选择"继续/读档"时才载入
  hydrateSaveSlots: async () => {
    if (get().bootStatus === 'ready') return;
    set({ bootStatus: 'loading', bootError: null });
    try {
      const [slots] = await Promise.all([listSaveSlots(), preloadItemCatalog(), preloadNpcLoadoutContent()]);
      set({ saveSlots: slots, bootStatus: 'ready', bootError: null });
    } catch (error) {
      set({
        bootStatus: 'error',
        bootError: error instanceof Error ? error.message : '本地数据库读取失败',
      });
    }
  },
  refreshSaveSlots: async () => {
    try {
      set({ saveSlots: await listSaveSlots() });
    } catch {
      // 刷新失败保持原列表,菜单仍可用
    }
  },
  // 继续游戏:默认载入最近更新的存档位
  continueGame: async (slotId) => {
    const targetSlotId = slotId ?? get().saveSlots[0]?.slotId;
    if (!targetSlotId) return false;
    try {
      const restored = await loadLatestGameState(targetSlotId);
      if (!restored) throw new Error('该存档位没有任何已提交的回合。');
      const slot = get().saveSlots.find((entry) => entry.slotId === targetSlotId);
      set({
        gameState: sanitizeRestoredState(restored),
        activeSlotId: targetSlotId,
        activeScreen: 'game',
        bootStatus: 'ready',
        bootError: null,
        slotActionError: null,
        isStreaming: false,
        turnStage: 'idle',
        streamingText: '',
        characterTurnContext: null,
        changesLog: [`已恢复存档: ${slot?.name ?? targetSlotId}`],
      });
      return true;
    } catch (error) {
      set({ slotActionError: error instanceof Error ? error.message : '存档读取失败' });
      return false;
    }
  },
  // 回到主菜单;叙事生成中禁止离开,避免半途状态与界面脱钩
  enterMenu: (view) => {
    if (get().isStreaming) return false;
    set({
      activeScreen: 'menu',
      menuView: view ?? 'title',
      isSettingsOpen: false,
      isCreatorOpen: false,
      isTvTimelineOpen: false,
      slotActionError: null,
    });
    void get().refreshSaveSlots();
    return true;
  },
  setMenuView: (view) => set({ menuView: view, slotActionError: null }),
  deleteSlot: async (slotId) => {
    try {
      await deleteSaveSlot(slotId);
      set((state) => ({
        saveSlots: state.saveSlots.filter((entry) => entry.slotId !== slotId),
        slotActionError: null,
        ...(state.activeSlotId === slotId ? { activeSlotId: null } : {}),
      }));
    } catch (error) {
      set({ slotActionError: error instanceof Error ? error.message : '删除存档失败' });
    }
  },
  // 导入存档包为新的存档位,不触碰现有周目
  importSlot: async (jsonString) => {
    try {
      const meta = await importSaveData(jsonString);
      if (meta) set((state) => ({ saveSlots: [meta, ...state.saveSlots.filter((entry) => entry.slotId !== meta.slotId)], slotActionError: null }));
      return meta;
    } catch (error) {
      set({ slotActionError: error instanceof Error ? error.message : '存档导入失败' });
      return null;
    }
  },
  resetStoredGame: async () => {
    await clearSaveData();
    set({
      gameState: createInitialGameState(),
      activeSlotId: null,
      activeScreen: 'menu',
      menuView: 'title',
      bootStatus: 'ready',
      bootError: null,
      saveSlots: [],
      isStreaming: false,
      turnStage: 'idle',
      streamingText: '',
      characterTurnContext: null,
      changesLog: ['已清空本地存档'],
    });
  },

  // 开启新剧本:铸新的存档位,不再清空其他周目的进度
  startNewGame: async (game) => {
    await Promise.all([preloadItemCatalog(), preloadNpcLoadoutContent()]);
    const slotId = createSlotId();
    const scenarioId = game.legacyScenarioId ?? 'living-world';
    const startDate = { ...game.startDate };
    const startSeason = stripEmoji(game.season);
    const safeLord = migrateLordIdentityData(migrateLordTraitData(stripEmojiDeep(game.lord)));
    const opening = game.opening;
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
      worldCharacters: { runId: createWorldRunId(), datasetHash: game.characterDatasetHash || AGOT_DATASET_HASH, revision: 0 },
      worldArtifacts: structuredClone(game.worldArtifacts),
      worldHistory: createInitialWorldHistory(startDate),
      worldRuntime: createWorldRuntimeState({
        livingWorld: createRiverlandsCrisisLivingWorld(startDate),
        initialEvents: createRiverlandsCrisisInitialEvents(startDate),
      }),
      activeScene: createActiveScene(safeLord.location, 1),
      roleplay: createRoleplayState(),
      worldFlags: {},
      isGameOver: false,
    };

    await saveTurnSnapshot(slotId, newGameState, '剧本开局', scenarioId);

    const slotMeta: SaveSlotMeta = {
      slotId,
      name: `${safeLord.name} · ${safeLord.house}`,
      lordName: safeLord.name,
      houseName: safeLord.house,
      houseSigil: safeLord.houseSigil,
      scenarioId,
      dateLabel: `${startDate.year} AC · ${startDate.month}月${startDate.day}日`,
      turnCount: 1,
      isGameOver: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    set({
      gameState: newGameState,
      activeSlotId: slotId,
      activeScreen: 'game',
      saveSlots: [slotMeta, ...get().saveSlots],
      isCreatorOpen: false,
      changesLog: [`维斯特洛新传奇开启: ${safeLord.house} · ${safeLord.name}`],
      streamingText: '',
      isStreaming: false,
      turnStage: 'idle',
      characterTurnContext: null,
    });
  },

  // 提交领主行动
  submitAction: async (actionText: string, diceMode: DiceMode = 'auto') => {
    const { gameState: visibleGameState, apiConfig, isStreaming, characterTurnContext, activeSlotId, debugEnabled } = get();
    let gameState = repairKnownTurnRevisionDrift(visibleGameState);
    if (gameState !== visibleGameState) set({ gameState });
    const safeActionText = stripEmoji(actionText);
    const captureTrace = (trace: ModelRequestTrace) => {
      if (get().debugEnabled) set({ lastModelRequestTrace: trace });
    };
    if (isStreaming || gameState.isGameOver || !safeActionText || !activeSlotId) {
      if (debugEnabled) {
        captureTrace(buildModelRequestTrace({
          turnNumber: gameState.turnCount,
          status: 'blocked',
          offline: !apiConfig.apiKey.trim(),
          provider: apiConfig.provider,
          model: apiConfig.model,
          actionText: safeActionText || actionText,
          blockedReason: isStreaming
            ? '上一回合仍在进行，新的行动被忽略。'
            : gameState.isGameOver
              ? '传奇已终结，不能再提交行动。'
              : !safeActionText
                ? '行动文本为空。'
                : '当前没有已载入的存档位。',
        }));
      }
      return;
    }

    const submittedWorldTransactions = structuredClone(
      gameState.worldRuntime.pendingTransactions.filter((transaction) => transaction.status === 'pending'),
    );
    let diceCheck: D20Check | undefined = undefined;
    const turnController = new AbortController();
    currentTurnController = turnController;
    set({ isStreaming: true, turnStage: 'resolving', streamingText: '' });

    try {
      const [
        { performD20Check },
        { inferActionCheck, getRuleOwnedDc },
        { buildTurnResolutionMessages, prepareWorldTurn, requestTurnResolution, settleTurnDraft },
        { buildSettledNarrativeMessages, streamSettledNarrative },
        { buildWorldTurnContext, formatWorldTurnContext },
      ] = await Promise.all([
        import('../services/diceEngine'),
        import('../services/dicePolicy'),
        import('../services/turnResolution'),
        import('../services/turnNarration'),
        import('../features/world/worldTurnContext'),
        preloadItemCatalog(),
        preloadNpcLoadoutContent(),
      ]);
      // 先丢弃不兼容的测试快照并建立当前回合基线，避免生成完叙事才发现无法提交。
      await ensureTurnSnapshotBaseline(activeSlotId, gameState);

      let contextError: string | undefined;
      const automaticWorldContext = characterTurnContext
        ? null
        : await buildWorldTurnContext({ gameState, actionText: safeActionText }).catch((error: unknown) => {
          contextError = error instanceof Error ? error.message : String(error);
          console.warn(`自动人物上下文暂不可用：${contextError}`);
          return null;
        });
      const effectiveCharacterContext: CharacterCommandBatchBaseContext | undefined = characterTurnContext
        ?? automaticWorldContext?.characterCommandContext;
      const automaticPromptContext = automaticWorldContext ? formatWorldTurnContext(automaticWorldContext) : '';
      // 世界上下文以对象直传，由 buildChatMessages 统一格式化（拼装单一出入口）。
      const resolutionWorldContext = characterTurnContext?.promptContext ?? automaticWorldContext ?? '';
      const nextTurnNumber = gameState.turnCount + 1;

      // 第一阶段：判骰 + 规则解析合一。模型先提出判骰请求，再分别给出成功、部分成果与失败轨。
      // 此时不传 diceCheck（还没骰），diceContext 也不传（判骰说明已拼进 system）。
      const resolutionMessages = buildTurnResolutionMessages(
        gameState,
        safeActionText,
        undefined,
        undefined,
        submittedWorldTransactions,
        resolutionWorldContext,
      );
      captureTrace(buildModelRequestTrace({
        turnNumber: nextTurnNumber,
        status: 'resolving',
        offline: !apiConfig.apiKey.trim(),
        provider: apiConfig.provider,
        model: apiConfig.model,
        actionText: safeActionText,
        contextError,
        worldContext: {
          automatic: automaticPromptContext,
          resolutionPrompt: typeof resolutionWorldContext === 'string' ? resolutionWorldContext : automaticPromptContext,
        },
        ...(automaticWorldContext ? { contextManifest: { resolution: automaticWorldContext.manifest } } : {}),
        resolutionMessages,
      }));
      const draft = await requestTurnResolution(
        resolutionMessages,
        apiConfig,
        gameState,
        submittedWorldTransactions,
        turnController.signal,
      );
      if (turnController.signal.aborted) throw turnController.signal.reason;
      set({ turnStage: 'settling' });

      // 第二阶段：程序根据模型判骰结果掷骰。
      // narrative 模式永不骰；force 模式跳过模型判骰，程序直接按 inferActionCheck 掷骰。
      let diceRequest = draft.diceRequest;
      if (diceMode === 'narrative') {
        diceRequest = { ...diceRequest, roll: false };
      } else if (diceMode === 'force') {
        const inferred = inferActionCheck(safeActionText);
        diceRequest = {
          roll: true,
          attribute: inferred.attribute,
          ...(inferred.secondaryAttribute ? { secondaryAttribute: inferred.secondaryAttribute } : {}),
          dc: inferred.dc,
          domain: inferred.domain,
          reason: '玩家强制检定',
        };
      }
      if (diceRequest.roll) {
        const ruleOwnedDc = getRuleOwnedDc(safeActionText, diceRequest.domain, { overallStatus: gameState.lord.overallStatus });
        diceRequest = {
          ...diceRequest,
          dc: ruleOwnedDc,
          reason: `${diceRequest.reason}；DC ${ruleOwnedDc} 由程序规则根据行动方法、真实阻力与伤势校准，文本中自称的准备或协助不直接降低难度`,
        };
        const attemptIdentity = buildAttemptIdentity(gameState, safeActionText, diceRequest, {
          stateCommands: [
            ...(draft.strongSuccessCommands ?? []),
            ...(draft.stateCommands ?? []),
            ...(draft.partialCommands ?? []),
            ...(draft.failureCommands ?? []),
          ],
          worldIntents: [
            ...(draft.strongSuccessWorldIntents ?? []),
            ...(draft.worldIntents ?? []),
            ...(draft.partialWorldIntents ?? []),
            ...(draft.failureWorldIntents ?? []),
          ],
        });
        const unchangedFailure = findUnchangedFailedAttempt(gameState.turns, attemptIdentity);
        diceCheck = unchangedFailure
          ? {
              ...unchangedFailure,
              id: `check_reuse_${Date.now()}`,
              actionText: safeActionText,
              timestamp: Date.now(),
              reusedFromCheckId: unchangedFailure.id,
              resultDescription: `【沿用失败】行动目标、方法与可验证条件均未改变，不重新掷骰。沿用检定 ${unchangedFailure.id} 的失败结果；需要新的准备、代价、情报或实质不同的方法后才能重新裁定。`,
            }
          : performD20Check(
              safeActionText,
              gameState.lord.attributes,
              gameState.lord.items,
              ITEM_CATALOG,
              gameState.lord.traitIds ?? [],
              diceRequest.attribute,
              diceRequest.dc,
              diceRequest.domain,
              undefined,
              Math.random,
              {
                secondaryAttribute: diceRequest.secondaryAttribute,
                reason: diceRequest.reason,
                attemptKey: attemptIdentity.attemptKey,
                conditionKey: attemptIdentity.conditionKey,
              },
            );
        set({
          activeDiceCheck: diceCheck,
          isDiceModalOpen: true,
        });
      }
      // 第三阶段：按骰子结果选用对应版本的 state_cmd。
      const reusedUnchangedAttempt = Boolean(diceCheck?.reusedFromCheckId);
      const selectedDraft: import('../services/turn/resolutionTypes').TurnResolutionDraft = {
        outcomeSummary: reusedUnchangedAttempt
          ? '本次行动与此前失败尝试的目标、方法和可验证条件均未改变，因此沿用旧失败，不产生第二次掷骰或重复后果。'
          : draft.outcomeSummary,
        stateCommands: reusedUnchangedAttempt
          ? []
          : diceCheck
            ? (diceCheck.outcome === 'strong_success'
              ? (draft.strongSuccessCommands ?? draft.stateCommands)
              : diceCheck.outcome === 'partial'
                ? (draft.partialCommands ?? [])
                : diceCheck.success
                  ? draft.stateCommands
                  : draft.failureCommands)
            : draft.stateCommands,
        worldIntents: reusedUnchangedAttempt
          ? []
          : diceCheck
            ? (diceCheck.outcome === 'strong_success'
              ? (draft.strongSuccessWorldIntents ?? draft.worldIntents)
              : diceCheck.outcome === 'partial'
                ? (draft.partialWorldIntents ?? [])
                : diceCheck.success
                  ? draft.worldIntents
                  : draft.failureWorldIntents)
            : draft.worldIntents,
      };      const preparedWorld = await prepareWorldTurn({
        gameState,
        draft: selectedDraft,
        actionText: safeActionText,
        nextTurnNumber,
        pendingTransactions: submittedWorldTransactions,
        characterContext: effectiveCharacterContext ? { ...effectiveCharacterContext, roleplay: gameState.roleplay } : effectiveCharacterContext,
      });
      const settled = settleTurnDraft({
        gameState,
        actionText: safeActionText,
        nextTurnNumber,
        draft: selectedDraft,
        pendingTransactions: submittedWorldTransactions,
        characterContext: effectiveCharacterContext,
        diceCheck,
        preparedWorld,
      });

      const roleplayCommands = settled.acceptedCommands.filter(isRoleplayStateCommand);
      const playerCharacterId = (gameState.lord.canonicalCharacterId
        ?? `save:${gameState.worldCharacters?.runId ?? 'current'}:player`) as CharacterId;
      const knownEventTurns = new Map<string, number>();
      for (const turn of settled.worldHistory.turns) {
        for (const eventId of turn.eventIds) knownEventTurns.set(eventId, turn.turn);
      }
      for (const event of gameState.roleplay?.socialEvents ?? []) knownEventTurns.set(event.id, event.turn);
      const appliedGrowthChoices = settled.acceptedCommands.flatMap((command) => (
        (command.type === 'MODIFY_STAT' || command.type === 'ADD_TRAIT') && command.growthChoiceId && command.growthOptionId
          ? [{ opportunityId: command.growthChoiceId, optionId: command.growthOptionId }]
          : []
      ));
      const roleplayResult = settleRoleplayCommands(settled.roleplay ?? gameState.roleplay, roleplayCommands, {
        turn: nextTurnNumber,
        playerId: playerCharacterId,
        presentCharacterIds: Array.from(effectiveCharacterContext?.presentCharacterIds ?? []),
        currentDate: `${settled.nextDate.year}.${settled.nextDate.month}.${settled.nextDate.day}`,
        knownEventTurns,
        appliedGrowthChoices,
      });
      if (roleplayCommands.length || roleplayResult.changes.length) {
        const acceptedRoleplay = new Set(roleplayResult.accepted);
        settled.acceptedCommands = settled.acceptedCommands.filter((command) => (
          !isRoleplayStateCommand(command) || acceptedRoleplay.has(command)
        ));
        const roleplayRejections = roleplayResult.rejected.map((entry) => ({ type: entry.command.type, reason: entry.reason }));
        settled.rejectedCommands = [...settled.rejectedCommands, ...roleplayRejections];
        settled.changesLog = [...settled.changesLog, ...roleplayResult.changes];
        settled.worldHistory = {
          ...settled.worldHistory,
          turns: settled.worldHistory.turns.map((turn, index, turns) => index === turns.length - 1
            ? { ...turn, acceptedCommands: settled.acceptedCommands, rejectedCommands: settled.rejectedCommands }
            : turn),
        };
        settled.resolvedFacts = {
          ...settled.resolvedFacts,
          acceptedCommands: settled.acceptedCommands,
          changes: [...settled.resolvedFacts.changes, ...roleplayResult.changes],
        };
      }

      // 第二阶段只能根据程序已接受的事实生成正文。
      const committedContextState: GameState = {
        ...gameState,
        currentYear: settled.nextDate.year,
        currentMonth: settled.nextDate.month,
        currentDay: settled.nextDate.day,
        currentSeason: settled.nextSeason,
        lord: settled.updatedLord,
        worldHistory: settled.worldHistory,
        worldRuntime: settled.worldRuntime,
        activeJourney: settled.activeJourney,
        roleplay: roleplayResult.state,
      };
      const committedWorldContextObject = await buildWorldTurnContext({
        gameState: committedContextState,
        actionText: safeActionText,
      }).catch((error: unknown) => {
        if (!contextError) contextError = error instanceof Error ? error.message : String(error);
        return null;
      });
      const committedWorldContext = committedWorldContextObject
        ? formatWorldTurnContext(committedWorldContextObject)
        : '';
      const narrationPrompt = [settled.narrationContext, committedWorldContext].filter(Boolean).join('\n\n');
      const narrativeMessages = buildSettledNarrativeMessages({
        gameState: committedContextState,
        actionText: safeActionText,
        facts: settled.resolvedFacts,
        worldContext: narrationPrompt,
      });
      captureTrace(buildModelRequestTrace({
        turnNumber: nextTurnNumber,
        status: 'narrating',
        offline: !apiConfig.apiKey.trim(),
        provider: apiConfig.provider,
        model: apiConfig.model,
        actionText: safeActionText,
        contextError,
        worldContext: {
          automatic: automaticPromptContext,
          committed: committedWorldContext,
          resolutionPrompt: typeof resolutionWorldContext === 'string' ? resolutionWorldContext : automaticPromptContext,
          narrationPrompt,
        },
        contextManifest: {
          ...(automaticWorldContext ? { resolution: automaticWorldContext.manifest } : {}),
          ...(committedWorldContextObject ? { committed: committedWorldContextObject.manifest } : {}),
        },
        resolutionMessages,
        narrationMessages: narrativeMessages,
      }));
      if (turnController.signal.aborted) throw turnController.signal.reason;
      set({ turnStage: 'narrating' });
      const parsedTurn = await streamSettledNarrative(
        narrativeMessages,
        apiConfig,
        nextTurnNumber,
        safeActionText,
        (partial) => set({ streamingText: stripEmoji(partial) }),
        turnController.signal,
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
        worldRuntime: settled.worldRuntime,
        activeScene: synchronizeActiveScene(
          gameState.activeScene,
          settled.updatedLord.location,
          nextTurnNumber,
          Array.from(committedWorldContextObject?.characterCommandContext.presentCharacterIds ?? []),
        ),
        roleplay: roleplayResult.state,
        activeJourney: settled.activeJourney,
        isGameOver: settled.isFatalDeath,
        deathReason: settled.isFatalDeath ? '要害遭受致命创伤，领主陨落于维斯特洛的残酷权谋之中' : undefined,
      });

      if (turnController.signal.aborted) throw turnController.signal.reason;
      set({ turnStage: 'settling' });
      await commitTurnAtomically(
        activeSlotId,
        updatedGameState,
        settled.characterEvents,
        `回合 ${nextTurnNumber}: ${safeActionText.slice(0, 20)}`,
      );

      set({
        gameState: updatedGameState,
        isStreaming: false,
        turnStage: 'idle',
        streamingText: '',
        characterTurnContext: characterTurnContext
          ? { ...settled.characterContext, promptContext: characterTurnContext.promptContext }
          : null,
        changesLog: [
          ...settled.changesLog,
          diceCheck ? `检定结果: ${diceCheck.attributeName} ${diceCheck.outcome === 'strong_success' ? '优势成功' : diceCheck.outcome === 'partial' ? '部分成果' : diceCheck.success ? '成功' : '失败'} (总点数 ${diceCheck.total} vs DC ${diceCheck.dc})` : '',
        ].filter(Boolean),
        ...(get().lastModelRequestTrace ? {
          lastModelRequestTrace: { ...get().lastModelRequestTrace!, status: 'complete' as const },
        } : {}),
      });
    } catch (err) {
      const cancelled = turnController.signal.aborted || (err instanceof DOMException && err.name === 'AbortError');
      const previous = get().lastModelRequestTrace;
      if (previous && get().debugEnabled) {
        set({
          lastModelRequestTrace: {
            ...previous,
            status: cancelled ? previous.status : 'failed',
            ...(cancelled ? {} : { error: err instanceof Error ? err.message : String(err) }),
          },
        });
      }
      if (!cancelled) {
        console.error('提交行动出错:', err);
        alert(`叙事生成遇到错误: ${err instanceof Error ? err.message : String(err)}`);
      }
      set({
        isStreaming: false,
        turnStage: 'idle',
        streamingText: '',
        ...(cancelled ? { changesLog: ['当前回合已取消，世界状态未改变'] } : {}),
      });
    } finally {
      if (currentTurnController === turnController) currentTurnController = null;
    }
  },

  // 撤回上一回合 (时光机)
  undoTurn: async () => {
    const { isStreaming, activeSlotId } = get();
    if (isStreaming || !activeSlotId) return;

    const previousState = await rollbackLastTurn(activeSlotId);
    if (previousState) {
      set({
        gameState: sanitizeRestoredState(previousState),
        saveSlots: get().saveSlots.map((slot) => slot.slotId === activeSlotId
          ? { ...slot, turnCount: previousState.turnCount, dateLabel: `${previousState.currentYear} AC · ${previousState.currentMonth}月${previousState.currentDay}日`, updatedAt: Date.now() }
          : slot),
        changesLog: ['时光倒流: 已回退到上一回合决策点'],
        characterTurnContext: null,
      });
    } else {
      alert('已到达剧本起点，无法继续回退。');
    }
  },
}));
