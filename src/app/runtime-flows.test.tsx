import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { GameState } from '../types/game';
import type { SaveSlotMeta } from '../services/db';

const dbMocks = vi.hoisted(() => ({
  loadLatestGameState: vi.fn(),
  listSaveSlots: vi.fn(),
  importSaveData: vi.fn(),
  deleteSaveSlot: vi.fn(),
  saveTurnSnapshot: vi.fn(async () => 1),
  ensureTurnSnapshotBaseline: vi.fn(async () => 'ready' as const),
  commitTurnAtomically: vi.fn(async () => 1),
}));

const turnMocks = vi.hoisted(() => ({
  buildWorldTurnContext: vi.fn(),
  requestTurnResolution: vi.fn(),
  streamSettledNarrative: vi.fn(),
}));

vi.mock('../services/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/db')>();
  return {
    ...actual,
    loadLatestGameState: dbMocks.loadLatestGameState,
    listSaveSlots: dbMocks.listSaveSlots,
    importSaveData: dbMocks.importSaveData,
    deleteSaveSlot: dbMocks.deleteSaveSlot,
    saveTurnSnapshot: dbMocks.saveTurnSnapshot,
    ensureTurnSnapshotBaseline: dbMocks.ensureTurnSnapshotBaseline,
    commitTurnAtomically: dbMocks.commitTurnAtomically,
  };
});
vi.mock('../features/world/worldTurnContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/world/worldTurnContext')>();
  return { ...actual, buildWorldTurnContext: turnMocks.buildWorldTurnContext };
});
vi.mock('../services/turnResolution', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/turnResolution')>();
  return { ...actual, requestTurnResolution: turnMocks.requestTurnResolution };
});
vi.mock('../services/turnNarration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/turnNarration')>();
  return { ...actual, streamSettledNarrative: turnMocks.streamSettledNarrative };
});
vi.mock('../components/AmbientCanvas', () => ({ AmbientCanvas: () => null }));
vi.mock('../components/CursorGlow', () => ({ CursorGlow: () => null }));
vi.mock('../features/map/MapDrawer', () => ({ MapDrawer: () => <div>地图占位</div>, prewarmMapRuntime: vi.fn() }));
vi.mock('../components/Ck3CharacterWindow', () => ({
  Ck3CharacterWindow: ({ selectedCharacterId, onOpenAsset }: { selectedCharacterId?: string | null; onOpenAsset?: (id: string) => void }) => (
    <div>
      <span data-testid="dossier-character">{selectedCharacterId ?? 'player'}</span>
      <button type="button" onClick={() => onOpenAsset?.('artifact.generated.ice')}>寒冰</button>
    </div>
  ),
}));
vi.mock('../components/items/WorldAssetDrawer', () => ({
  WorldAssetDrawer: ({ assetId, onBack }: { assetId: string; onBack: () => void }) => (
    <div role="dialog" aria-label="资产详情">
      <span>{assetId}</span>
      <button type="button" onClick={onBack}>返回</button>
    </div>
  ),
}));

import { App } from '../App';
import { useGameStore } from '../store/useGameStore';
import { useMapUiStore } from '../features/map/mapUiStore';

const originalGameStoreState = useGameStore.getState();
const originalMapUiState = useMapUiStore.getState();

function stateWith(overrides: Partial<GameState> = {}): GameState {
  const state = structuredClone(originalGameStoreState.gameState);
  return { ...state, ...overrides };
}

function slotMetaWith(overrides: Partial<SaveSlotMeta> = {}): SaveSlotMeta {
  return {
    slotId: 'slot_test_1',
    name: '艾德·史塔克 · 史塔克家族',
    lordName: '艾德·史塔克',
    houseName: '史塔克家族',
    houseSigil: 'house-stark',
    scenarioId: 'ned_stark',
    dateLabel: '298 AC · 5月10日',
    turnCount: 1,
    isGameOver: false,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

function resetStores(): void {
  useGameStore.setState({
    ...originalGameStoreState,
    gameState: stateWith(),
    bootStatus: 'loading',
    bootError: null,
    isStreaming: false,
    turnStage: 'idle',
    streamingText: '',
    changesLog: [],
    isSettingsOpen: false,
    activeScreen: 'menu',
    menuView: 'title',
    activeSlotId: null,
    saveSlots: [],
    slotActionError: null,
    debugEnabled: false,
    lastModelRequestTrace: null,
  });
  useMapUiStore.setState({
    ...originalMapUiState,
    activeDrawer: null,
    selectedAssetId: null,
    assetSourceCharacterId: null,
    returnDrawer: null,
  });
}

/** 模拟"存在一个可继续的存档位"的启动环境,并返回该存档位元数据。 */
function mockBootableSlot(state: GameState = stateWith()): SaveSlotMeta {
  const meta = slotMetaWith();
  dbMocks.listSaveSlots.mockResolvedValue([meta]);
  dbMocks.loadLatestGameState.mockResolvedValue(state);
  return meta;
}

/** 从标题屏点"继续传奇"进入游戏,并等待 HUD 年份出现。 */
async function enterGameViaMenu(expectedYearLabel: string): Promise<void> {
  const continueButton = await screen.findByRole('button', { name: /继续传奇/ });
  await act(async () => {
    continueButton.click();
  });
  await screen.findByText(expectedYearLabel);
}

beforeEach(() => {
  resetStores();
  dbMocks.loadLatestGameState.mockReset();
  dbMocks.listSaveSlots.mockReset();
  dbMocks.importSaveData.mockReset();
  dbMocks.deleteSaveSlot.mockReset();
  dbMocks.saveTurnSnapshot.mockClear();
  dbMocks.ensureTurnSnapshotBaseline.mockClear();
  dbMocks.commitTurnAtomically.mockClear();
  turnMocks.buildWorldTurnContext.mockReset();
  turnMocks.requestTurnResolution.mockReset();
  turnMocks.streamSettledNarrative.mockReset();
});

describe('critical rendered runtime flows', () => {
  test('startup lands on the title screen and continue restores the save', async () => {
    let resolveSlots!: (slots: SaveSlotMeta[]) => void;
    dbMocks.listSaveSlots.mockReturnValue(new Promise<SaveSlotMeta[]>((resolve) => { resolveSlots = resolve; }));
    const restored = stateWith({ currentYear: 304, currentMonth: 2, currentDay: 3, turnCount: 7 });
    dbMocks.loadLatestGameState.mockResolvedValue(restored);

    render(<App />);
    expect(screen.getByRole('heading', { name: '正在整理卷轴架' })).toBeInTheDocument();

    resolveSlots([slotMetaWith({ turnCount: 7 })]);
    const continueButton = await screen.findByRole('button', { name: /继续传奇/ });
    expect(continueButton).toBeEnabled();

    await act(async () => {
      continueButton.click();
    });
    expect(await screen.findByText('304 AC')).toBeInTheDocument();
    expect(screen.getByText('回合')).toHaveTextContent('7');
  });

  test('importing a save creates a new slot and loads it without reloading', async () => {
    dbMocks.listSaveSlots.mockResolvedValue([]);
    const importedState = stateWith({ currentYear: 305, currentMonth: 6, currentDay: 9, turnCount: 12 });
    const importedMeta = slotMetaWith({ slotId: 'slot_imported', name: '丹妮莉丝 · 坦格利安家族', lordName: '丹妮莉丝', turnCount: 12 });
    dbMocks.importSaveData.mockResolvedValue(importedMeta);
    dbMocks.loadLatestGameState.mockResolvedValue(importedState);
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole('button', { name: '读取存档' }));
    const input = await waitFor(() => {
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
      expect(fileInput).not.toBeNull();
      return fileInput as HTMLInputElement;
    });
    await user.upload(input, new File(['{}'], 'save.json', { type: 'application/json' }));

    const loadButton = await screen.findByRole('button', { name: /载入/ });
    await user.click(loadButton);

    expect(await screen.findByText('305 AC')).toBeInTheDocument();
    expect(dbMocks.importSaveData).toHaveBeenCalledWith('{}');
    expect(dbMocks.loadLatestGameState).toHaveBeenCalledWith('slot_imported');
  });

  test('a character mention in story opens that character dossier', async () => {
    mockBootableSlot(stateWith({
      turns: [{
        id: 'turn_1',
        turnNumber: 1,
        playerInput: '开启测试世界',
        narrate: '凯特琳·徒利站在大厅里等候回信。',
        branches: ['继续'],
        stateCommands: [],
        gameDate: '征服历 298 AC · 5月10日',
        timestamp: 0,
      }],
    }));
    const user = userEvent.setup();

    render(<App />);
    await enterGameViaMenu('298 AC');
    await user.click(screen.getByRole('button', { name: '查看凯特琳·徒利的人物档案' }));

    expect(screen.getByRole('dialog', { name: '人物卷宗' })).toBeInTheDocument();
    expect(screen.getByTestId('dossier-character')).toHaveTextContent('agot:Tully_4');
  });

  test('asset detail returns to its source dossier', async () => {
    mockBootableSlot();
    const user = userEvent.setup();

    render(<App />);
    await enterGameViaMenu('298 AC');
    await user.click(screen.getByRole('button', { name: '打开人物卷宗' }));
    await user.click(screen.getByRole('button', { name: '寒冰' }));

    expect(screen.getByRole('dialog', { name: '资产详情' })).toHaveTextContent('artifact.generated.ice');
    await user.click(screen.getByRole('button', { name: '返回' }));
    expect(screen.getByRole('dialog', { name: '人物卷宗' })).toBeInTheDocument();
  });

  test('ordinary story action still completes when map context fails', async () => {
    mockBootableSlot();
    turnMocks.buildWorldTurnContext.mockRejectedValue(new Error('地图资料未能载入'));
    turnMocks.requestTurnResolution.mockResolvedValue({
      outcomeSummary: '守卫完成了换岗。',
      stateCommands: [],
      failureCommands: [],
      worldIntents: [],
      diceRequest: { roll: false, attribute: 'diplomacy', dc: 12, domain: 'diplomacy', reason: '普通对话，无需检定' },
    });
    turnMocks.streamSettledNarrative.mockImplementation(async (_messages, _config, turnNumber, playerInput, onChunk) => {
      onChunk('<narrate>守卫完成了换岗。</narrate>');
      return { turnNumber, playerInput, narrate: '守卫完成了换岗。', branches: ['继续巡视', '询问守卫', '返回大厅'], stateCommands: [] };
    });
    const user = userEvent.setup();

    render(<App />);
    await enterGameViaMenu('298 AC');
    await user.type(screen.getByRole('textbox'), '继续讨论守城安排');
    await user.click(screen.getByRole('button', { name: '提交御令' }));

    await waitFor(() => expect(useGameStore.getState().gameState.turnCount).toBe(2), { timeout: 10_000 });
    expect(await screen.findByText('守卫完成了换岗。', {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(dbMocks.commitTurnAtomically).toHaveBeenCalledOnce();
  });
});
