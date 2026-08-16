import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const dependencyStubs = {
  name: 'equipment-queue-store-stubs',
  setup(buildApi) {
    buildApi.onResolve({ filter: /services[\\/]api$/ }, () => ({ path: 'api-stub', namespace: 'queue-test' }));
    buildApi.onResolve({ filter: /services[\\/]db$/ }, () => ({ path: 'db-stub', namespace: 'queue-test' }));
    buildApi.onLoad({ filter: /api-stub/, namespace: 'queue-test' }, () => ({
      loader: 'js',
      contents: `
        export async function streamChatCompletion() {
          if (globalThis.__equipmentQueueRequestShouldFail) throw new Error('模拟生成失败');
          return '<narrate>装备动作已在本轮叙事中完成。</narrate>';
        }
        export function parseModelOutput(_raw, turnNumber, playerInput) {
          return { turnNumber, playerInput, think: '', narrate: '装备动作已在本轮叙事中完成。', branches: [], stateCommands: [] };
        }
      `,
    }));
    buildApi.onLoad({ filter: /db-stub/, namespace: 'queue-test' }, () => ({
      loader: 'js',
      contents: `
        export async function saveTurnSnapshot() {}
        export async function commitTurnAtomically() {}
        export async function rollbackLastTurn() { return null; }
        export async function clearSaveData() {}
      `,
    }));
  },
};

const bundle = await build({
  entryPoints: ['src/store/useGameStore.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [dependencyStubs],
});

globalThis.alert = () => {};
globalThis.__equipmentQueueRequestShouldFail = false;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { useGameStore } = await import(moduleUrl);

test('点击装备只排队，下一次对话成功后才真正穿上', async () => {
  const before = useGameStore.getState();
  const armory = before.gameState.lord.storageSites.find((site) => site.id === 'winterfell_armory');
  const armor = armory.items.find((item) => item.slot === 'torso');
  const oldTorsoName = before.gameState.lord.gear.torso.name;

  before.queueEquipmentAction(armor, { type: 'site', id: armory.id }, armory.name);
  assert.equal(useGameStore.getState().gameState.lord.gear.torso.name, oldTorsoName);
  assert.equal(useGameStore.getState().pendingEquipmentActions.length, 1);

  await useGameStore.getState().submitAction('继续听取鲁温学士的禀报', 'narrative');
  assert.equal(useGameStore.getState().gameState.lord.gear.torso.name, armor.name);
  assert.equal(useGameStore.getState().pendingEquipmentActions.length, 0);
});

test('下一次对话生成失败时保留装备队列且不改变装备', async () => {
  const before = useGameStore.getState();
  const armory = before.gameState.lord.storageSites.find((site) => site.id === 'winterfell_armory');
  const helmet = armory.items.find((item) => item.slot === 'head');
  const oldHeadName = before.gameState.lord.gear.head?.name;

  before.queueEquipmentAction(helmet, { type: 'site', id: armory.id }, armory.name);
  globalThis.__equipmentQueueRequestShouldFail = true;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await useGameStore.getState().submitAction('继续当前谈话', 'narrative');
  } finally {
    console.error = originalConsoleError;
    globalThis.__equipmentQueueRequestShouldFail = false;
  }

  assert.equal(useGameStore.getState().gameState.lord.gear.head?.name, oldHeadName);
  assert.equal(useGameStore.getState().pendingEquipmentActions.length, 1);
  assert.equal(useGameStore.getState().pendingEquipmentActions[0].itemId, helmet.id);
});
