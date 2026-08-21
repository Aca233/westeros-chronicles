import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { GameState } from '../types/game';

const dbMocks = vi.hoisted(() => ({
  loadLatestGameState: vi.fn(),
  importSaveData: vi.fn(),
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
    importSaveData: dbMocks.importSaveData,
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
  });
  useMapUiStore.setState({
    ...originalMapUiState,
    activeDrawer: null,
    selectedAssetId: null,
    assetSourceCharacterId: null,
    returnDrawer: null,
  });
}

beforeEach(() => {
  resetStores();
  dbMocks.loadLatestGameState.mockReset();
  dbMocks.importSaveData.mockReset();
  dbMocks.ensureTurnSnapshotBaseline.mockClear();
  dbMocks.commitTurnAtomically.mockClear();
  turnMocks.buildWorldTurnContext.mockReset();
  turnMocks.requestTurnResolution.mockReset();
  turnMocks.streamSettledNarrative.mockReset();
});

describe('critical rendered runtime flows', () => {
  test('startup waits for hydration and renders the restored save', async () => {
    let resolveSave!: (state: GameState) => void;
    dbMocks.loadLatestGameState.mockReturnValue(new Promise<GameState>((resolve) => { resolveSave = resolve; }));
    const restored = stateWith({ currentYear: 304, currentMonth: 2, currentDay: 3, turnCount: 7 });

    render(<App />);
    expect(screen.getByRole('heading', { name: '正在恢复世界' })).toBeInTheDocument();

    resolveSave(restored);
    expect(await screen.findByText('304 AC')).toBeInTheDocument();
    expect(screen.getByText('回合')).toHaveTextContent('7');
  });

  test('importing a save replaces the rendered store without reloading', async () => {
    dbMocks.loadLatestGameState.mockResolvedValue(null);
    const imported = stateWith({ currentYear: 305, currentMonth: 6, currentDay: 9, turnCount: 12 });
    dbMocks.importSaveData.mockResolvedValue(imported);
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText('298 AC');
    await user.click(screen.getByRole('button', { name: '设置' }));
    await screen.findByRole('dialog', { name: '大模型 API 与游戏设置' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['{}'], 'save.json', { type: 'application/json' }));

    expect(await screen.findByText('305 AC')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '大模型 API 与游戏设置' })).not.toBeInTheDocument();
    expect(dbMocks.importSaveData).toHaveBeenCalledWith('{}');
  });

  test('a character mention in story opens that character dossier', async () => {
    dbMocks.loadLatestGameState.mockResolvedValue(null);
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText('298 AC');
    await user.click(screen.getByRole('button', { name: '查看凯特琳·徒利的人物档案' }));

    expect(screen.getByRole('dialog', { name: '人物卷宗' })).toBeInTheDocument();
    expect(screen.getByTestId('dossier-character')).toHaveTextContent('agot:Tully_4');
  });

  test('asset detail returns to its source dossier', async () => {
    dbMocks.loadLatestGameState.mockResolvedValue(null);
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText('298 AC');
    await user.click(screen.getByRole('button', { name: '打开人物卷宗' }));
    await user.click(screen.getByRole('button', { name: '寒冰' }));

    expect(screen.getByRole('dialog', { name: '资产详情' })).toHaveTextContent('artifact.generated.ice');
    await user.click(screen.getByRole('button', { name: '返回' }));
    expect(screen.getByRole('dialog', { name: '人物卷宗' })).toBeInTheDocument();
  });

  test('ordinary story action still completes when map context fails', async () => {
    dbMocks.loadLatestGameState.mockResolvedValue(null);
    turnMocks.buildWorldTurnContext.mockRejectedValue(new Error('地图资料未能载入'));
    turnMocks.requestTurnResolution.mockResolvedValue({
      outcomeSummary: '守卫完成了换岗。',
      stateCommands: [],
      worldIntents: [],
    });
    turnMocks.streamSettledNarrative.mockImplementation(async (_messages, _config, turnNumber, playerInput, onChunk) => {
      onChunk('<narrate>守卫完成了换岗。</narrate>');
      return { turnNumber, playerInput, narrate: '守卫完成了换岗。', branches: ['继续巡视', '询问守卫', '返回大厅'], stateCommands: [] };
    });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText('298 AC');
    await user.type(screen.getByRole('textbox'), '继续讨论守城安排');
    await user.click(screen.getByRole('button', { name: '提交御令' }));

    await waitFor(() => expect(useGameStore.getState().gameState.turnCount).toBe(2), { timeout: 10_000 });
    expect(await screen.findByText('守卫完成了换岗。', {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(dbMocks.commitTurnAtomically).toHaveBeenCalledOnce();
  });
});
