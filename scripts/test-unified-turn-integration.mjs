import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const storeStubs = {
  name: 'unified-turn-integration-stubs',
  setup(api) {
    api.onResolve({ filter: /(?:services[\\/])?api$/ }, () => ({ path: 'api-stub', namespace: 'unified-turn' }));
    api.onResolve({ filter: /services[\\/]db$/ }, () => ({ path: 'db-stub', namespace: 'unified-turn' }));
    api.onLoad({ filter: /api-stub/, namespace: 'unified-turn' }, () => ({
      loader: 'js',
      contents: `
        export async function requestTurnResolutionCompletion(messages) {
          globalThis.__unifiedResolutionMessages = structuredClone(messages);
          if (globalThis.__unifiedResolutionFails) throw new Error('模拟规则解析失败');
          return '<resolution>规则结算完成。</resolution><state_cmd>' + JSON.stringify(globalThis.__unifiedCommands || []) + '</state_cmd>';
        }
        export async function streamNarrativeCompletion(messages, _config, onChunk) {
          globalThis.__unifiedNarrativeMessages = structuredClone(messages);
          if (globalThis.__unifiedNarrativeFails) throw new Error('模拟正文生成失败');
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
    api.onLoad({ filter: /db-stub/, namespace: 'unified-turn' }, () => ({
      loader: 'js',
      contents: `
        export const db = {};
        export async function saveTurnSnapshot(state, summaryNote) {
          globalThis.__unifiedSnapshots.push({ state: structuredClone(state), summaryNote });
        }
        export async function clearSaveData() {
          globalThis.__unifiedSnapshots = [];
          globalThis.__unifiedCharacterEvents = [];
        }
        export async function commitTurnAtomically(state, events, summaryNote) {
          if (globalThis.__unifiedCommitFails) throw new Error('模拟原子提交失败');
          globalThis.__unifiedSnapshots.push({ state: structuredClone(state), summaryNote });
          globalThis.__unifiedCharacterEvents.push(...events.map((event, sequence) => ({
            ...structuredClone(event),
            turn: state.turnCount,
            sequence,
            runId: state.worldCharacters.runId,
          })));
        }
        export async function rollbackLastTurn() {
          if (globalThis.__unifiedSnapshots.length < 2) return null;
          globalThis.__unifiedSnapshots.pop();
          const previous = globalThis.__unifiedSnapshots.at(-1).state;
          globalThis.__unifiedCharacterEvents = globalThis.__unifiedCharacterEvents.filter((event) => event.turn <= previous.turnCount);
          return structuredClone(previous);
        }
      `,
    }));
  },
};

const storeBundle = await build({
  entryPoints: ['src/store/useGameStore.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [storeStubs],
});

globalThis.alert = () => {};
globalThis.__unifiedSnapshots = [];
globalThis.__unifiedCharacterEvents = [];
globalThis.__unifiedCommands = [];
globalThis.__unifiedResolutionMessages = [];
globalThis.__unifiedNarrativeMessages = [];
globalThis.__unifiedResolutionFails = false;
globalThis.__unifiedNarrativeFails = false;
globalThis.__unifiedCommitFails = false;

const storeUrl = `data:text/javascript;base64,${Buffer.from(storeBundle.outputFiles[0].text).toString('base64')}`;
const { useGameStore } = await import(storeUrl);
const pristine = structuredClone(useGameStore.getState().gameState);

const ARYA = 'agot:Stark_9';
const SANSA = 'agot:Stark_8';
const DEAD_BRANDON = 'agot:Stark_2';

function sceneContext() {
  return {
    promptContext: '场景人物：艾莉亚、珊莎与已故的布兰登。',
    characters: [
      { id: ARYA, alive: true, locationId: 'winterfell', traits: [], spouseIds: [], titles: [], wounds: [], relationships: [], items: [] },
      { id: SANSA, alive: true, locationId: 'winterfell', traits: [], spouseIds: [], titles: [], wounds: [], relationships: [], items: [] },
      { id: DEAD_BRANDON, alive: false, locationId: 'winterfell', traits: [], spouseIds: [], titles: [], wounds: [], relationships: [], items: [], deathReason: '早已身亡' },
    ],
    currentLocationId: 'winterfell',
    presentCharacterIds: new Set([ARYA, SANSA, DEAD_BRANDON]),
    knownLocationIds: new Set(['winterfell']),
    eventHistory: [{ characterId: DEAD_BRANDON, event: { type: 'DIE' } }],
  };
}

function resetAtCanonBoundary() {
  const state = structuredClone(pristine);
  state.currentYear = 298;
  state.currentMonth = 5;
  state.currentDay = 14;
  state.currentSeason = '暮春';
  state.turnCount = 1;
  state.turns = [{ ...state.turns[0], turnNumber: 1 }];
  state.worldHistory.turns = [];
  state.worldCharacters.revision = 0;
  globalThis.__unifiedSnapshots = [{ state: structuredClone(state), summaryNote: '测试开局' }];
  globalThis.__unifiedCharacterEvents = [];
  globalThis.__unifiedCommands = [];
  globalThis.__unifiedResolutionMessages = [];
  globalThis.__unifiedNarrativeMessages = [];
  globalThis.__unifiedResolutionFails = false;
  globalThis.__unifiedNarrativeFails = false;
  globalThis.__unifiedCommitFails = false;
  useGameStore.setState({
    gameState: state,
    isStreaming: false,
    streamingText: '',
    changesLog: [],
    pendingItemActions: [],
    pendingTravelCommand: null,
    characterTurnContext: null,
    activeDiceCheck: null,
    isDiceModalOpen: false,
  });
  useGameStore.getState().setCharacterTurnContext(sceneContext());
  return structuredClone(state);
}

function travelRoute(from, to = 'b_test_destination') {
  return {
    ok: true,
    id: `route_${from}_${to}`,
    from,
    to,
    preference: 'fastest',
    travelMode: 'horse',
    via: [],
    season: 'summer',
    legs: [{
      index: 0, edgeId: `${from}>${to}`, from, to, distance: 40, days: 1, cost: 1, risk: 0.05,
      roadLevel: 'major', crossing: 'land', seasonTags: [],
      fromPoint: { mapX: 0, mapY: 0 }, toPoint: { mapX: 1, mapY: 0 },
    }],
    totalDistance: 40,
    totalDays: 1,
    totalCost: 1,
    totalRisk: 0.05,
    graphHash: 'a'.repeat(64),
  };
}

function relationshipCommand() {
  return {
    type: 'SET_CHARACTER_RELATIONSHIP',
    sourceCharacterId: ARYA,
    targetCharacterId: SANSA,
    relationship: {
      kind: 'sibling',
      opinion: 35,
      trust: 25,
      fear: 0,
      respect: 20,
      attraction: 0,
      obligation: 15,
    },
  };
}

test('一个行动把 D20、装备、人物关系、拒绝命令、日期和原作节点提交为同一回合', async () => {
  resetAtCanonBoundary();
  globalThis.__unifiedCommands = [
    relationshipCommand(),
    { type: 'KILL_CHARACTER', characterId: DEAD_BRANDON, cause: '不可能的重复死亡' },
    { type: 'ADVANCE_TIME', days: 1, reason: '交谈与整装耗时' },
  ];
  useGameStore.getState().queueItemAction({
    kind: 'equip',
    instanceId: 'ned.chainmail',
    position: { group: 'torso', layer: 'armor' },
    displacedTo: { type: 'site', siteId: 'winterfell_armory' },
  });

  const originalRandom = Math.random;
  Math.random = () => 0.9;
  try {
    await useGameStore.getState().submitAction('我一边攀上湿滑城墙，一边询问艾莉亚与珊莎近来的关系', 'force');
  } finally {
    Math.random = originalRandom;
  }

  const current = useGameStore.getState();
  assert.equal(globalThis.__unifiedSnapshots.length, 2, '成功回合只新增一个快照');
  assert.equal(current.gameState.turnCount, 2);
  assert.equal(current.gameState.turns.at(-1).turnNumber, 2);
  assert.ok(current.gameState.turns.at(-1).diceCheck, '强制检定结果必须随故事回合保存');
  assert.deepEqual(current.gameState.lord.items.placements['ned.chainmail'], {
    type: 'equipped', position: { group: 'torso', layer: 'armor' },
  });
  assert.equal(current.pendingItemActions.length, 0, '原子提交成功后才消费装备队列');

  const historyTurn = current.gameState.worldHistory.turns.at(-1);
  assert.equal(historyTurn.turn, 2);
  assert.deepEqual(historyTurn.resolvedOn, { year: 298, month: 5, day: 15 });
  assert.deepEqual(
    current.gameState.turns.at(-1).stateCommands,
    historyTurn.acceptedCommands,
    '正文回合与世界账本必须保存同一组接受命令',
  );
  assert.ok(historyTurn.acceptedCommands.some((command) => command.type === 'ITEM_EQUIP'));
  assert.ok(historyTurn.acceptedCommands.some((command) => command.type === 'SET_CHARACTER_RELATIONSHIP'));
  assert.ok(historyTurn.rejectedCommands.some((command) => command.type === 'KILL_CHARACTER' && /死亡/.test(command.reason)));
  assert.equal(current.gameState.worldHistory.canonical.evt_298_05_10.status, 'occurred');
  assert.ok(historyTurn.facts.some((fact) => fact.canonicalEventId === 'evt_298_05_10'));

  assert.equal(globalThis.__unifiedCharacterEvents.length, 1);
  assert.equal(globalThis.__unifiedCharacterEvents[0].event.type, 'SET_RELATIONSHIP');
  const relationshipFact = historyTurn.facts.find((fact) => fact.commandTypes.includes('SET_CHARACTER_RELATIONSHIP'));
  assert.deepEqual(new Set(relationshipFact.participantIds), new Set([ARYA, SANSA]), '关系事实必须链接关系双方');

  const narrativePrompt = globalThis.__unifiedNarrativeMessages.map((message) => message.content).join('\n');
  assert.match(narrativePrompt, /SET_CHARACTER_RELATIONSHIP/);
  assert.match(narrativePrompt, /ITEM_EQUIP/);
  assert.doesNotMatch(narrativePrompt, /KILL_CHARACTER|不可能的重复死亡/);
});

test('人物普通物品事件随成功回合原子提交并推进人物修订号', async () => {
  resetAtCanonBoundary();
  globalThis.__unifiedCommands = [{
    type: 'CHARACTER_ITEM_ACQUIRE', characterId: ARYA,
    definitionId: 'clothing.common_linen_tunic', instanceId: 'story:arya:tunic',
  }];
  await useGameStore.getState().submitAction('艾莉亚收下了一件日常束腰衣', 'off');

  const current = useGameStore.getState();
  assert.equal(current.gameState.worldCharacters.revision, 1);
  assert.equal(globalThis.__unifiedCharacterEvents.length, 1);
  assert.deepEqual(globalThis.__unifiedCharacterEvents[0].event, {
    type: 'ITEM_ACQUIRE', item: {
      instanceId: 'story:arya:tunic', definitionId: 'clothing.common_linen_tunic', ownerId: ARYA,
      custody: { type: 'character', characterId: ARYA }, source: 'story_event',
    },
  });
});

test('排队出发只在下一次成功对话后建立旅程', async () => {
  const before = resetAtCanonBoundary();
  const origin = before.lord.location.locationId;
  useGameStore.getState().setCharacterTurnContext({
    ...sceneContext(),
    currentLocationId: origin,
    knownLocationIds: new Set([origin, 'b_test_destination']),
  });
  useGameStore.getState().queueTravelCommand({
    type: 'START_TRAVEL',
    routePlan: travelRoute(origin),
    companions: [],
    vehicleIds: [],
  });
  assert.equal(useGameStore.getState().gameState.activeJourney, undefined, '点击出发不能立即移动世界状态');

  await useGameStore.getState().submitAction('召集队伍，准备沿大道启程', 'off');

  const current = useGameStore.getState();
  assert.equal(current.pendingTravelCommand, null);
  assert.equal(current.gameState.activeJourney.status, 'travelling');
  assert.equal(current.gameState.activeJourney.routePlan.to, 'b_test_destination');
  assert.equal(current.gameState.lord.location.locationId, origin, '没有时间流逝时仍停留在起点');
  assert.ok(current.gameState.worldHistory.turns[0].acceptedCommands.some((command) => command.type === 'START_TRAVEL'));
});

test('正文失败时保留排队出发且不建立旅程', async () => {
  const before = resetAtCanonBoundary();
  const origin = before.lord.location.locationId;
  useGameStore.getState().setCharacterTurnContext({
    ...sceneContext(),
    currentLocationId: origin,
    knownLocationIds: new Set([origin, 'b_test_destination']),
  });
  const command = { type: 'START_TRAVEL', routePlan: travelRoute(origin), companions: [], vehicleIds: [] };
  useGameStore.getState().queueTravelCommand(command);
  globalThis.__unifiedNarrativeFails = true;
  const originalError = console.error;
  console.error = () => {};
  try {
    await useGameStore.getState().submitAction('召集队伍，准备沿大道启程', 'off');
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(useGameStore.getState().gameState, before);
  assert.deepEqual(useGameStore.getState().pendingTravelCommand, command);
  assert.equal(globalThis.__unifiedSnapshots.length, 1);
});

test('正文失败不产生快照、人物事件或队列消费', async () => {
  const before = resetAtCanonBoundary();
  globalThis.__unifiedCommands = [relationshipCommand(), { type: 'CHARACTER_ITEM_ACQUIRE', characterId: ARYA, definitionId: 'clothing.common_linen_tunic', instanceId: 'story:arya:rollback-tunic' }, { type: 'ADVANCE_TIME', days: 1 }];
  useGameStore.getState().queueItemAction({
    kind: 'equip',
    instanceId: 'ned.chainmail',
    position: { group: 'torso', layer: 'armor' },
    displacedTo: { type: 'site', siteId: 'winterfell_armory' },
  });
  const queued = structuredClone(useGameStore.getState().pendingItemActions);
  globalThis.__unifiedNarrativeFails = true;
  const originalError = console.error;
  console.error = () => {};
  try {
    await useGameStore.getState().submitAction('尝试攀爬城墙并与艾莉亚交谈', 'force');
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(useGameStore.getState().gameState, before);
  assert.deepEqual(useGameStore.getState().pendingItemActions, queued);
  assert.equal(globalThis.__unifiedSnapshots.length, 1);
  assert.equal(globalThis.__unifiedCharacterEvents.length, 0);
});

test('数据库原子提交失败时 Store、人物事件与装备队列保持原样', async () => {
  const before = resetAtCanonBoundary();
  globalThis.__unifiedCommands = [relationshipCommand(), { type: 'ADVANCE_TIME', days: 1 }];
  useGameStore.getState().queueItemAction({
    kind: 'equip',
    instanceId: 'ned.chainmail',
    position: { group: 'torso', layer: 'armor' },
    displacedTo: { type: 'site', siteId: 'winterfell_armory' },
  });
  const queued = structuredClone(useGameStore.getState().pendingItemActions);
  globalThis.__unifiedCommitFails = true;
  const originalError = console.error;
  console.error = () => {};
  try {
    await useGameStore.getState().submitAction('攀上城墙后与艾莉亚交谈', 'force');
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(useGameStore.getState().gameState, before);
  assert.deepEqual(useGameStore.getState().pendingItemActions, queued);
  assert.equal(globalThis.__unifiedSnapshots.length, 1);
  assert.equal(globalThis.__unifiedCharacterEvents.length, 0);
});

test('回滚同步恢复世界账本、人物事件、装备状态与回合号', async () => {
  const before = resetAtCanonBoundary();
  globalThis.__unifiedCommands = [relationshipCommand(), { type: 'ADVANCE_TIME', days: 1 }];
  useGameStore.getState().queueItemAction({
    kind: 'equip',
    instanceId: 'ned.chainmail',
    position: { group: 'torso', layer: 'armor' },
    displacedTo: { type: 'site', siteId: 'winterfell_armory' },
  });
  await useGameStore.getState().submitAction('攀上城墙后与艾莉亚交谈', 'force');
  assert.equal(globalThis.__unifiedCharacterEvents.length, 1);
  await useGameStore.getState().undoTurn();

  const restored = useGameStore.getState().gameState;
  assert.deepEqual(restored, before);
  assert.equal(restored.worldHistory.turns.length, 0);
  assert.equal(globalThis.__unifiedSnapshots.length, 1);
  assert.equal(globalThis.__unifiedCharacterEvents.length, 0);
  assert.equal(useGameStore.getState().characterTurnContext, null);
});

const dbBundle = await build({
  entryPoints: ['src/services/db.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const dbUrl = `data:text/javascript;base64,${Buffer.from(dbBundle.outputFiles[0].text).toString('base64')}`;
const dbModule = await import(dbUrl);

test('数据库只接受同一世界中连续的下一回合快照', () => {
  assert.equal(typeof dbModule.assertTurnSuccessor, 'function', '数据库必须验证前后快照连续性');
  const previous = resetAtCanonBoundary();
  const next = structuredClone(previous);
  next.turnCount = 2;
  next.turns.push({ ...next.turns[0], id: 'turn_2', turnNumber: 2, stateCommands: [] });
  next.worldHistory.turns.push({
    turn: 2,
    action: '测试',
    startedOn: { year: 298, month: 5, day: 14 },
    resolvedOn: { year: 298, month: 5, day: 15 },
    acceptedCommands: [],
    rejectedCommands: [],
    facts: [],
    canonicalTransitions: [],
  });
  next.currentDay = 15;
  next.worldCharacters.revision = 1;
  dbModule.assertTurnSuccessor(previous, next);

  const skipped = structuredClone(next);
  skipped.turnCount = 3;
  assert.throws(() => dbModule.assertTurnSuccessor(previous, skipped), /连续/);
});

test('数据库提交前拒绝故事回合、世界账本与快照回合号分叉', () => {
  assert.equal(typeof dbModule.assertTurnCommitConsistency, 'function', '数据库必须导出统一回合一致性检查');
  const valid = resetAtCanonBoundary();
  valid.turnCount = 2;
  valid.turns.push({ ...valid.turns[0], id: 'turn_2', turnNumber: 2 });
  valid.worldHistory.turns.push({
    turn: 2,
    action: '测试',
    startedOn: { year: 298, month: 5, day: 14 },
    resolvedOn: { year: 298, month: 5, day: 15 },
    acceptedCommands: [],
    rejectedCommands: [],
    facts: [],
    canonicalTransitions: [],
  });
  valid.currentDay = 15;
  valid.worldCharacters.revision = 1;
  dbModule.assertTurnCommitConsistency(valid, []);

  const broken = structuredClone(valid);
  broken.worldHistory.turns[0].turn = 3;
  assert.throws(() => dbModule.assertTurnCommitConsistency(broken, []), /世界账本回合/);
});
