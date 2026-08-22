import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const storeStubs = {
  name: 'debug-model-trace-stubs',
  setup(api) {
    api.onResolve({ filter: /(?:services[\\/])?api$/ }, () => ({ path: 'api-stub', namespace: 'debug-trace' }));
    api.onResolve({ filter: /services[\\/]db$/ }, () => ({ path: 'db-stub', namespace: 'debug-trace' }));
    api.onResolve({ filter: /features[\\/]map[\\/]repository$/ }, () => ({ path: 'map-repository-stub', namespace: 'debug-trace' }));
    api.onLoad({ filter: /map-repository-stub/, namespace: 'debug-trace' }, () => ({
      loader: 'js',
      contents: `
        const locations = [
          { id: 'b_winterfell', name: '临冬城', mapX: 0, mapY: 0, importance: 100, type: 'castle' },
        ];
        export const mapRepository = {
          async loadSearchIndex() { return structuredClone(locations); },
          async loadSemanticMembership() { return []; },
        };
      `,
    }));
    api.onLoad({ filter: /api-stub/, namespace: 'debug-trace' }, () => ({
      loader: 'js',
      contents: `
        export async function requestTurnResolutionCompletion(messages) {
          globalThis.__debugResolutionMessages = structuredClone(messages);
          return '<resolution>规则结算完成。</resolution><state_cmd>[]</state_cmd>';
        }
        export async function streamNarrativeCompletion(messages, _config, onChunk) {
          globalThis.__debugNarrativeMessages = structuredClone(messages);
          onChunk?.('本回合正文');
          return '<narrate>本回合正文只叙述已确认事实。</narrate><branch>继续</branch>';
        }
        export function extractJsonArrayFromXml(raw, tag) {
          const open = '<' + tag + '>'; const close = '</' + tag + '>';
          const start = raw.indexOf(open); const end = raw.indexOf(close, start + open.length);
          return start >= 0 && end > start ? JSON.parse(raw.slice(start + open.length, end)) : [];
        }
        export function parseModelOutput(_raw, turnNumber, playerInput) {
          return { turnNumber, playerInput, think: '', narrate: '本回合正文只叙述已确认事实。', branches: ['继续'], stateCommands: [] };
        }
      `,
    }));
    api.onLoad({ filter: /db-stub/, namespace: 'debug-trace' }, () => ({
      loader: 'js',
      contents: `
        export const db = {};
        export async function loadLatestGameState() { return null; }
        export async function listSaveSlots() { return []; }
        export async function importSaveData() { return null; }
        export async function deleteSaveSlot() {}
        export function createSlotId() { return 'slot_debug'; }
        export async function ensureTurnSnapshotBaseline() { return 'ready'; }
        export async function saveTurnSnapshot() { return 1; }
        export async function clearSaveData() {}
        export async function commitTurnAtomically(_slotId, state) {
          globalThis.__debugSnapshots.push(structuredClone(state));
        }
        export async function rollbackLastTurn() { return null; }
      `,
    }));
  },
};

const storeBundle = await build({
  stdin: {
    contents: "export * from './src/store/useGameStore.ts'; export { preloadItemCatalog } from './src/data/itemDefinitions.ts'; export { buildTurnResolutionMessages } from './src/services/turn/resolutionProtocol.ts'; export { buildSettledNarrativeMessages } from './src/services/turnNarration.ts';",
    resolveDir: process.cwd(),
    sourcefile: 'debug-model-trace-store-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [storeStubs],
});
const storeUrl = `data:text/javascript;base64,${Buffer.from(storeBundle.outputFiles[0].text).toString('base64')}`;
const storeModule = await import(storeUrl);
await storeModule.preloadItemCatalog();
const { useGameStore, buildTurnResolutionMessages, buildSettledNarrativeMessages } = storeModule;

const fixtureBundle = await build({
  entryPoints: ['scripts/fixtures/living-world-test.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const fixtureUrl = `data:text/javascript;base64,${Buffer.from(fixtureBundle.outputFiles[0].text).toString('base64')}`;
const fixtureModule = await import(fixtureUrl);
await fixtureModule.ordinaryCatalogReady;
const { createLivingWorldTestLord } = fixtureModule;

test('debug 开启时追踪实际发出的解析和叙事消息，且不含 apiKey', async () => {
  globalThis.__debugSnapshots = [];
  globalThis.__debugResolutionMessages = [];
  globalThis.__debugNarrativeMessages = [];
  const state = structuredClone(useGameStore.getState().gameState);
  state.lord = structuredClone(createLivingWorldTestLord());
  state.turns = [{
    id: 'turn_1',
    turnNumber: 1,
    playerInput: '开启测试世界',
    narrate: '测试世界已经开始。',
    branches: ['继续'],
    stateCommands: [],
    gameDate: '征服历 298 AC · 5月10日',
    timestamp: 0,
  }];
  useGameStore.setState({
    gameState: state,
    apiConfig: { ...useGameStore.getState().apiConfig, apiKey: 'sk-should-never-appear' },
    debugEnabled: true,
    lastModelRequestTrace: null,
    isStreaming: false,
    turnStage: 'idle',
    streamingText: '',
    characterTurnContext: {
      promptContext: '场景人物：艾莉亚。',
      characters: [],
      currentLocationId: 'b_winterfell',
      presentCharacterIds: new Set(),
      knownLocationIds: new Set(['b_winterfell']),
    },
    activeSlotId: 'slot_debug',
  });

  await useGameStore.getState().submitAction('询问守卫今晚的换岗安排', 'narrative');

  const trace = useGameStore.getState().lastModelRequestTrace;
  assert.ok(trace, 'debug 开启后必须留下模型请求追踪');
  assert.equal(trace.status, 'complete');
  assert.equal(trace.offline, false, '填写了 Key 时不得标成离线演示');
  assert.equal(trace.resolution.messages.length, globalThis.__debugResolutionMessages.length);
  assert.deepEqual(trace.resolution.messages.map((message) => message.content), globalThis.__debugResolutionMessages.map((message) => message.content));
  assert.deepEqual(trace.narration.messages.map((message) => message.content), globalThis.__debugNarrativeMessages.map((message) => message.content));
  assert.equal(JSON.stringify(trace).includes('sk-should-never-appear'), false);
  assert.equal(JSON.stringify(trace).includes('apiKey'), false);
  assert.equal(JSON.stringify(globalThis.__debugSnapshots.at(-1)).includes('lastModelRequestTrace'), false);
  assert.equal(JSON.stringify(globalThis.__debugSnapshots.at(-1)).includes('debugEnabled'), false);

  const rebuiltResolution = buildTurnResolutionMessages(
    state,
    '询问守卫今晚的换岗安排',
    undefined,
    { mode: 'narrative', decision: { shouldRoll: false, isImpossible: false, reason: '测试', attribute: 'diplomacy', dc: 10, domain: 'diplomacy' } },
    [],
    '场景人物：艾莉亚。',
  );
  assert.equal(trace.resolution.messages[0].content, rebuiltResolution[0].content);

  const rebuiltNarration = buildSettledNarrativeMessages({
    gameState: useGameStore.getState().gameState,
    actionText: '询问守卫今晚的换岗安排',
    facts: {
      acceptedCommands: [],
      changes: [],
      facts: [],
      resolvedOn: { year: 298, month: 5, day: 10 },
    },
    worldContext: trace.worldContext.narrationPrompt,
  });
  assert.equal(trace.narration.messages[0].content, rebuiltNarration[0].content);
});

test('被忽略的提交会留下拦截原因', async () => {
  useGameStore.setState({
    debugEnabled: true,
    lastModelRequestTrace: null,
    isStreaming: true,
    activeSlotId: 'slot_debug',
  });
  await useGameStore.getState().submitAction('在流式中再次提交', 'narrative');
  const blocked = useGameStore.getState().lastModelRequestTrace;
  assert.ok(blocked);
  assert.equal(blocked.status, 'blocked');
  assert.match(blocked.blockedReason ?? '', /上一回合仍在进行/);
});

test('debug 关闭时不保留模型请求正文', async () => {
  globalThis.__debugSnapshots = [];
  useGameStore.getState().setDebugEnabled(false);
  assert.equal(useGameStore.getState().lastModelRequestTrace, null);
  await useGameStore.getState().submitAction('再问一次守卫', 'narrative');
  assert.equal(useGameStore.getState().lastModelRequestTrace, null);
});
