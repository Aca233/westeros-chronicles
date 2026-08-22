import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SaveSlotMeta } from '../services/db';
import type { GameState } from '../types/game';

const livingWorldMocks = vi.hoisted(() => ({
  loadPlayableCharacterCards: vi.fn(),
  createLivingWorldGame: vi.fn(),
}));

vi.mock('../features/world/createLivingWorldGame', () => ({
  loadPlayableCharacterCards: livingWorldMocks.loadPlayableCharacterCards,
  createLivingWorldGame: livingWorldMocks.createLivingWorldGame,
}));

const dbMocks = vi.hoisted(() => ({
  loadLatestGameState: vi.fn(),
  listSaveSlots: vi.fn(),
  importSaveData: vi.fn(),
  deleteSaveSlot: vi.fn(async () => undefined),
  saveTurnSnapshot: vi.fn(async (_slotId: string, _gameState: GameState, _summaryNote?: string, _scenarioId?: string) => 1),
  ensureTurnSnapshotBaseline: vi.fn(async () => 'ready' as const),
  commitTurnAtomically: vi.fn(async () => 1),
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
vi.mock('../components/AmbientCanvas', () => ({ AmbientCanvas: () => null }));
vi.mock('../components/CursorGlow', () => ({ CursorGlow: () => null }));
vi.mock('../features/map/MapDrawer', () => ({ MapDrawer: () => <div>地图占位</div>, prewarmMapRuntime: vi.fn() }));
vi.mock('../components/Ck3CharacterWindow', () => ({
  Ck3CharacterWindow: () => <div data-testid="dossier-character">player</div>,
}));

import { App } from '../App';
import { useGameStore } from '../store/useGameStore';

const originalGameStoreState = useGameStore.getState();

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
    bootStatus: 'loading',
    bootError: null,
    isStreaming: false,
    activeScreen: 'menu',
    menuView: 'title',
    activeSlotId: null,
    saveSlots: [],
    slotActionError: null,
    debugEnabled: false,
    lastModelRequestTrace: null,
    isSettingsOpen: false,
  });
}

beforeEach(() => {
  resetStores();
  dbMocks.loadLatestGameState.mockReset();
  dbMocks.listSaveSlots.mockReset();
  dbMocks.importSaveData.mockReset();
  dbMocks.deleteSaveSlot.mockClear();
  dbMocks.saveTurnSnapshot.mockClear();
  livingWorldMocks.loadPlayableCharacterCards.mockReset();
  livingWorldMocks.createLivingWorldGame.mockReset();
  const card = {
    characterId: 'agot:Stark_3', enabled: true, difficulty: 'normal', focus: ['审视处境'],
    card: { title: '北境之狼', tagline: '凛冬将至。', background: '共同世界起点。', avatarIcon: 'house-stark' },
    characterName: '艾德·史塔克', houseName: '史塔克家族', subtitle: '征服历 298 AC · 统一世界',
  };
  livingWorldMocks.loadPlayableCharacterCards.mockResolvedValue([card]);
  livingWorldMocks.createLivingWorldGame.mockResolvedValue({
    lord: originalGameStoreState.gameState.lord,
    opening: { narrate: '统一世界开始。', branches: ['查看当前处境'] },
    worldId: 'agot-298', startDate: { year: 298, month: 5, day: 10 }, season: '暮春',
    worldStartState: { schemaVersion: 1, characters: [], titles: [], assets: [], sites: [], vehicles: [] },
    worldArtifacts: originalGameStoreState.gameState.worldArtifacts,
    characterDatasetHash: 'a'.repeat(64),
  });
});

describe('main menu flows', () => {
  test('settings can enable the debug overlay and model-request tab', async () => {
    dbMocks.listSaveSlots.mockResolvedValue([]);
    window.localStorage.removeItem('westeros-debug');
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole('button', { name: /设置/ }));
    const toggle = await screen.findByRole('checkbox', { name: '开发调试' });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByLabelText('开发调试面板')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(useGameStore.getState().debugEnabled).toBe(true);
    expect(window.localStorage.getItem('westeros-debug')).toBe('1');
    expect(await screen.findByLabelText('开发调试面板')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '模型请求' }));
    expect(screen.getByText(/还没有捕获到模型请求/)).toBeInTheDocument();
  });

  test('title screen renders and continue stays disabled without saves', async () => {
    dbMocks.listSaveSlots.mockResolvedValue([]);

    render(<App />);

    expect(await screen.findByRole('heading', { name: '维斯特洛' })).toBeInTheDocument();
    const continueButton = screen.getByRole('button', { name: /继续传奇/ });
    expect(continueButton).toBeDisabled();
    expect(screen.getByRole('button', { name: '开创新局' })).toBeEnabled();
  });

  test('starting a living-world viewpoint creates its own slot and enters the game', async () => {
    dbMocks.listSaveSlots.mockResolvedValue([]);
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole('button', { name: '开创新局' }));

    expect(await screen.findByText('北境之狼')).toBeInTheDocument();
    const startButtons = screen.getAllByRole('button', { name: '以此视角开始' });
    await user.click(startButtons[0]);

    expect(await screen.findByText('298 AC')).toBeInTheDocument();
    expect(dbMocks.saveTurnSnapshot).toHaveBeenCalledOnce();
    const [slotId, savedState, note, scenarioId] = dbMocks.saveTurnSnapshot.mock.calls[0];
    expect(typeof slotId).toBe('string');
    expect(livingWorldMocks.createLivingWorldGame).toHaveBeenCalledWith('agot:Stark_3');
    expect(savedState.currentYear).toBe(298);
    expect(savedState.turnCount).toBe(1);
    expect(note).toBe('剧本开局');
    expect(scenarioId).toBe('living-world');

    const { activeScreen, activeSlotId } = useGameStore.getState();
    expect(activeScreen).toBe('game');
    expect(activeSlotId).toBe(slotId);
  });

  test('load screen lists slots and deletion needs inline confirmation', async () => {
    const slotA = slotMetaWith();
    const slotB = slotMetaWith({ slotId: 'slot_test_2', name: '琼恩·雪诺 · 守夜人军团', lordName: '琼恩·雪诺' });
    dbMocks.listSaveSlots.mockResolvedValue([slotA, slotB]);
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole('button', { name: /读取存档/ }));

    expect(await screen.findByText('艾德·史塔克 · 史塔克家族')).toBeInTheDocument();
    expect(screen.getByText('琼恩·雪诺 · 守夜人军团')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '删除存档 艾德·史塔克 · 史塔克家族' }));
    expect(dbMocks.deleteSaveSlot).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '确认删除' }));
    expect(dbMocks.deleteSaveSlot).toHaveBeenCalledWith('slot_test_1');
    await screen.findByText('琼恩·雪诺 · 守夜人军团');
    expect(screen.queryByText('艾德·史塔克 · 史塔克家族')).not.toBeInTheDocument();
  });

  test('returning to the menu from the game keeps the save listed', async () => {
    const slotA = slotMetaWith({ turnCount: 3, dateLabel: '299 AC · 3月2日' });
    dbMocks.listSaveSlots.mockResolvedValue([slotA]);
    dbMocks.loadLatestGameState.mockResolvedValue(structuredClone(originalGameStoreState.gameState));
    const user = userEvent.setup();

    render(<App />);
    await user.click(await screen.findByRole('button', { name: /继续传奇/ }));
    expect(await screen.findByText('298 AC')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '主菜单' }));

    expect(await screen.findByRole('button', { name: /继续传奇/ })).toBeEnabled();
    expect(dbMocks.listSaveSlots.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('enterMenu is refused while a turn is streaming', () => {
    useGameStore.setState({ activeScreen: 'game', isStreaming: true });
    expect(useGameStore.getState().enterMenu()).toBe(false);
    expect(useGameStore.getState().activeScreen).toBe('game');

    useGameStore.setState({ isStreaming: false });
    expect(useGameStore.getState().enterMenu()).toBe(true);
    expect(useGameStore.getState().activeScreen).toBe('menu');
    expect(useGameStore.getState().menuView).toBe('title');
  });
});
