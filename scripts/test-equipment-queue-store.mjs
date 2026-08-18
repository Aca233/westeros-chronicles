import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const dependencyStubs = {
  name: 'item-queue-store-stubs',
  setup(buildApi) {
    buildApi.onResolve({ filter: /(?:services[\\/])?api$/ }, () => ({ path: 'api-stub', namespace: 'queue-test' }));
    buildApi.onResolve({ filter: /services[\\/]db$/ }, () => ({ path: 'db-stub', namespace: 'queue-test' }));
    buildApi.onLoad({ filter: /api-stub/, namespace: 'queue-test' }, () => ({
      loader: 'js',
      contents: `
        export async function requestTurnResolutionCompletion() {
          if (globalThis.__itemQueueRequestShouldFail) throw new Error('模拟生成失败');
          return '<resolution>物品动作可执行。</resolution><state_cmd>[]</state_cmd>';
        }
        export async function streamNarrativeCompletion() {
          if (globalThis.__itemQueueRequestShouldFail) throw new Error('模拟生成失败');
          return '<narrate>物品动作已在本轮叙事中完成。</narrate><branch>1. 继续</branch>';
        }
        export function extractJsonArrayFromXml(raw, tag) {
          const open = '<' + tag + '>'; const close = '</' + tag + '>';
          const start = raw.indexOf(open); const end = raw.indexOf(close, start + open.length);
          return start >= 0 && end > start ? JSON.parse(raw.slice(start + open.length, end)) : [];
        }
        export function parseModelOutput(_raw, turnNumber, playerInput) {
          return { turnNumber, playerInput, think: '', narrate: '物品动作已在本轮叙事中完成。', branches: [], stateCommands: [] };
        }
      `,
    }));
    buildApi.onLoad({ filter: /db-stub/, namespace: 'queue-test' }, () => ({
      loader: 'js',
      contents: `
        export const db = {};
        export async function saveTurnSnapshot() {}
        export async function commitTurnAtomically() {}
        export async function rollbackLastTurn() { return null; }
        export async function clearSaveData() {}
      `,
    }));
  },
};

const bundle = await build({ entryPoints: ['src/store/useGameStore.ts'], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [dependencyStubs] });
globalThis.alert = () => {};
globalThis.__itemQueueRequestShouldFail = false;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { useGameStore } = await import(moduleUrl);

function resetQueue() {
  useGameStore.setState({ pendingItemActions: [], isStreaming: false, streamingText: '' });
}

test('装备、转移和使用可同时排队，成功回复后统一结算', async () => {
  resetQueue();
  const before = useGameStore.getState();
  const originalHerbCharges = before.gameState.lord.items.instances['ned.staunching_herbs'].charges;
  before.queueItemAction({ kind: 'equip', instanceId: 'ned.chainmail', position: { group: 'torso', layer: 'armor' }, displacedTo: { type: 'site', siteId: 'winterfell_armory' } });
  before.queueItemAction({ kind: 'transfer', instanceId: 'ned.castle_sword', to: { type: 'carried' } });
  before.queueItemAction({ kind: 'use', instanceId: 'ned.staunching_herbs' });
  assert.equal(useGameStore.getState().pendingItemActions.length, 3);
  assert.deepEqual(useGameStore.getState().gameState.lord.items.placements['ned.chainmail'], { type: 'site', siteId: 'winterfell_armory' });

  await useGameStore.getState().submitAction('继续听取鲁温学士的禀报', 'narrative');
  const after = useGameStore.getState();
  assert.deepEqual(after.gameState.lord.items.placements['ned.chainmail'], { type: 'equipped', position: { group: 'torso', layer: 'armor' } });
  assert.deepEqual(after.gameState.lord.items.placements['ned.castle_sword'], { type: 'carried' });
  assert.equal(after.gameState.lord.items.instances['ned.staunching_herbs'].charges, originalHerbCharges - 1);
  assert.equal(after.pendingItemActions.length, 0);
});

test('生成失败会保留物品队列和完整物品状态', async () => {
  resetQueue();
  const before = useGameStore.getState();
  const originalItems = structuredClone(before.gameState.lord.items);
  before.queueItemAction({ kind: 'repair', instanceId: 'ned.castle_sword', amount: 10 });
  const queuedSnapshot = structuredClone(useGameStore.getState().pendingItemActions);
  globalThis.__itemQueueRequestShouldFail = true;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await useGameStore.getState().submitAction('继续当前谈话', 'narrative');
  } finally {
    console.error = originalConsoleError;
    globalThis.__itemQueueRequestShouldFail = false;
  }
  assert.deepEqual(useGameStore.getState().gameState.lord.items, originalItems);
  assert.deepEqual(useGameStore.getState().pendingItemActions, queuedSnapshot);
});
