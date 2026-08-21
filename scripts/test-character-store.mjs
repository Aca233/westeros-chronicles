import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const stubs = {
  name: 'character-store-stubs',
  setup(api) {
    api.onResolve({ filter: /(?:services[\\/])?api$/ }, () => ({ path: 'api-stub', namespace: 'character-store' }));
    api.onResolve({ filter: /services[\\/]db$/ }, () => ({ path: 'db-stub', namespace: 'character-store' }));
    api.onResolve({ filter: /features[\\/]map[\\/]repository$/ }, () => ({ path: 'map-repository-stub', namespace: 'character-store' }));
    api.onLoad({ filter: /map-repository-stub/, namespace: 'character-store' }, () => ({
      loader: 'js',
      contents: `
        const locations = [
          { id: 'b_winterfell', name: '临冬城', mapX: 0, mapY: 0, importance: 100, type: 'castle' },
          { id: 'b_riverrun', name: '奔流城', mapX: 1, mapY: 0, importance: 80, type: 'castle' },
        ];
        export const mapRepository = {
          async loadSearchIndex() { return structuredClone(locations); },
          async loadSemanticMembership() { return []; },
        };
      `,
    }));
    api.onLoad({ filter: /api-stub/, namespace: 'character-store' }, () => ({
      loader: 'js',
      contents: `
        export async function requestTurnResolutionCompletion(messages) {
          globalThis.__characterStoreMessages = messages;
          if (globalThis.__characterStoreApiFails) throw new Error('模拟 API 失败');
          return '<resolution>规则解析完成。</resolution><state_cmd>' + JSON.stringify(globalThis.__characterStoreCommands || []) + '</state_cmd>';
        }
        export async function streamNarrativeCompletion() {
          if (globalThis.__characterStoreApiFails) throw new Error('模拟 API 失败');
          return '<narrate>人物状态已处理。</narrate><branch>1. 继续</branch>';
        }
        export function extractJsonArrayFromXml(raw, tag) {
          const open = '<' + tag + '>'; const close = '</' + tag + '>';
          const start = raw.indexOf(open); const end = raw.indexOf(close, start + open.length);
          return start >= 0 && end > start ? JSON.parse(raw.slice(start + open.length, end)) : [];
        }
        export function parseModelOutput(_raw, turnNumber, playerInput) {
          return { turnNumber, playerInput, think: '', narrate: '人物状态已处理。', branches: [], stateCommands: [] };
        }
      `,
    }));
    api.onLoad({ filter: /db-stub/, namespace: 'character-store' }, () => ({
      loader: 'js',
      contents: `
        export const db = {};
        export async function ensureTurnSnapshotBaseline() { return 'ready'; }
        export async function saveTurnSnapshot() {}
        export async function clearSaveData() {}
        export async function commitTurnAtomically(state, events) {
          if (globalThis.__characterStoreCommitFails) throw new Error('模拟原子提交失败');
          globalThis.__characterStoreCommits.push({ state: structuredClone(state), events: structuredClone(events) });
        }
        export async function rollbackLastTurn() { return globalThis.__characterStoreRollbackState || null; }
      `,
    }));
  },
};

const bundle = await build({
  entryPoints: ['src/store/useGameStore.ts'], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [stubs],
});
globalThis.alert = () => {};
globalThis.__characterStoreCommands = [];
globalThis.__characterStoreCommits = [];
globalThis.__characterStoreApiFails = false;
globalThis.__characterStoreCommitFails = false;
globalThis.__characterStoreRollbackState = null;
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { useGameStore } = await import(url);
const initial = structuredClone(useGameStore.getState().gameState);
const ARYA = 'agot:Arya_1';
const SANSA = 'agot:Sansa_1';

function reset() {
  globalThis.__characterStoreCommands = [];
  globalThis.__characterStoreCommits = [];
  globalThis.__characterStoreApiFails = false;
  globalThis.__characterStoreCommitFails = false;
  globalThis.__characterStoreRollbackState = null;
  useGameStore.setState({
    gameState: structuredClone(initial), isStreaming: false, streamingText: '', changesLog: [],
    pendingTransactions: [], characterTurnContext: null,
  });
}

function sceneContext() {
  return {
    promptContext: 'CHARACTER_SAFE_CONTEXT',
    characters: [
      { id: ARYA, alive: true, locationId: 'b_winterfell', traits: [], spouseIds: [], titles: [], wounds: [] },
      { id: SANSA, alive: true, locationId: 'b_winterfell', traits: [], spouseIds: [], titles: [], wounds: [] },
    ],
    currentLocationId: 'b_winterfell',
    presentCharacterIds: new Set([ARYA, SANSA]),
    knownLocationIds: new Set(['b_winterfell', 'b_riverrun']),
    eventHistory: [],
  };
}

test('成功响应逐条验证人物命令，并与回合一起提交后才更新 Store', async () => {
  reset();
  useGameStore.getState().setCharacterTurnContext(sceneContext());
  globalThis.__characterStoreCommands = [
    { type: 'MOVE_CHARACTER', characterId: ARYA, locationId: 'b_riverrun' },
    { type: 'KILL_CHARACTER', characterId: ARYA, cause: '不应发生' },
  ];
  const before = useGameStore.getState().gameState;
  await useGameStore.getState().submitAction('命令艾莉亚离开大厅', 'narrative');
  const after = useGameStore.getState();
  assert.equal(globalThis.__characterStoreCommits.length, 1);
  assert.equal(globalThis.__characterStoreCommits[0].events.length, 1);
  assert.equal(globalThis.__characterStoreCommits[0].events[0].event.type, 'MOVE');
  assert.equal(after.gameState.turnCount, before.turnCount + 1);
  assert.equal(after.gameState.worldCharacters.revision, before.worldCharacters.revision + 1);
  assert.ok(after.changesLog.some((line) => /KILL_CHARACTER/.test(line) && /不在场/.test(line)));
  assert.equal(after.characterTurnContext.characters.find((c) => c.id === ARYA).locationId, 'b_riverrun');
  const markerCount = globalThis.__characterStoreMessages.flatMap((m) => m.content.match(/CHARACTER_SAFE_CONTEXT/g) || []).length;
  assert.equal(markerCount, 1);
});

test('缺少场景上下文时人物命令安全拒绝但叙事回合仍可提交', async () => {
  reset();
  globalThis.__characterStoreCommands = [{ type: 'KILL_CHARACTER', characterId: ARYA, cause: '越权' }];
  await useGameStore.getState().submitAction('继续交谈', 'narrative');
  assert.equal(globalThis.__characterStoreCommits.length, 1);
  assert.deepEqual(globalThis.__characterStoreCommits[0].events, []);
  assert.ok(useGameStore.getState().changesLog.some((line) => /缺少当前场景人物上下文/.test(line)));
});

test('API 或原子提交失败时不推进回合、不写人物事件且不清队列', async () => {
  reset();
  const before = structuredClone(useGameStore.getState().gameState);
  globalThis.__characterStoreApiFails = true;
  const oldError = console.error; console.error = () => {};
  await useGameStore.getState().submitAction('失败请求', 'narrative');
  assert.equal(useGameStore.getState().gameState.turnCount, before.turnCount);
  assert.equal(globalThis.__characterStoreCommits.length, 0);

  globalThis.__characterStoreApiFails = false;
  globalThis.__characterStoreCommitFails = true;
  globalThis.__characterStoreCommands = [{ type: 'MOVE_CHARACTER', characterId: ARYA, locationId: 'b_riverrun' }];
  useGameStore.getState().setCharacterTurnContext(sceneContext());
  await useGameStore.getState().submitAction('提交失败', 'narrative');
  console.error = oldError;
  assert.equal(useGameStore.getState().gameState.turnCount, before.turnCount);
  assert.equal(useGameStore.getState().gameState.worldCharacters.revision, before.worldCharacters.revision);
  assert.equal(globalThis.__characterStoreCommits.length, 0);
});

test('回滚使用数据库返回的快照并丢弃陈旧场景上下文', async () => {
  reset();
  useGameStore.getState().setCharacterTurnContext(sceneContext());
  const restored = structuredClone(initial);
  restored.turnCount = 1;
  globalThis.__characterStoreRollbackState = restored;
  await useGameStore.getState().undoTurn();
  assert.equal(useGameStore.getState().gameState.turnCount, 1);
  assert.equal(useGameStore.getState().characterTurnContext, null);
});
