import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/features/world/worldIntentResolver.ts';",
      "export { parseTurnResolutionOutput } from './src/services/turnResolution.ts';",
      "export { WORLD_INTENT_RESOLUTION_PROMPT } from './src/services/promptBuilder.ts';",
      "export { parseModelOutput, requestTurnResolutionCompletion } from './src/services/api.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'world-intent-resolver-runtime.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  parseUnresolvedWorldIntents,
  parseTurnResolutionOutput,
  parseModelOutput,
  requestTurnResolutionCompletion,
  resolveWorldIntent,
  resolveWorldIntents,
  WORLD_INTENT_RESOLUTION_PROMPT,
} = await import(url);

const PLAYER_ID = 'agot:Stark_3';
const locations = [
  { id: 'b_winterfell', name: '临冬城', englishName: 'Winterfell', type: 'castle', importance: 100, regionId: 'north', mapX: 10, mapY: 10 },
  { id: 'b_kings_landing', name: '君临', englishName: "King's Landing", type: 'city', importance: 100, regionId: 'crownlands', mapX: 50, mapY: 60 },
  { id: 'b_red_keep', name: '红堡', englishName: 'Red Keep', type: 'castle', importance: 100, regionId: 'crownlands', mapX: 51, mapY: 60 },
  { id: 'b_north_ford', name: '渡口', type: 'village', importance: 10, regionId: 'north', mapX: 12, mapY: 12 },
  { id: 'b_river_ford', name: '渡口', type: 'village', importance: 20, regionId: 'riverlands', mapX: 30, mapY: 30 },
];
const countyIdByLocationId = new Map([
  ['b_winterfell', 'c_winterfell'],
  ['b_north_ford', 'c_winterfell'],
  ['b_kings_landing', 'c_kings_landing'],
  ['b_red_keep', 'c_kings_landing'],
  ['b_river_ford', 'c_riverrun'],
]);
const context = {
  defaultActorId: PLAYER_ID,
  currentLocation: { locationId: 'b_winterfell' },
  locations,
  countyIdByLocationId,
  neighboringCountyIds: new Set(['c_dreadfort']),
  aliasesByLocationId: new Map([
    ['b_kings_landing', ['王都']],
  ]),
};

function unresolvedIntent(kind, evidenceText, extra = {}) {
  return { kind, evidenceText, ...extra };
}

test('提及、计划和明确出发保留不同语义且解析稳定地点', () => {
  const mention = resolveWorldIntent(
    unresolvedIntent('mention', '我想起了君临', { targetText: '君临' }),
    context,
  );
  const plan = resolveWorldIntent(
    unresolvedIntent('plan_travel', '我准备明日去君临', { targetText: '王都' }),
    context,
  );
  const start = resolveWorldIntent(
    unresolvedIntent('start_travel', '我骑马赶往君临', { targetId: 'b_kings_landing' }),
    context,
  );

  assert.equal(mention.kind, 'mention');
  assert.equal(plan.kind, 'plan_travel');
  assert.equal(start.kind, 'start_travel');
  assert.equal(mention.targetRef.location.locationId, 'b_kings_landing');
  assert.equal(plan.targetRef.location.locationId, 'b_kings_landing');
  assert.equal(start.targetRef.location.locationId, 'b_kings_landing');
  assert.equal(mention.actorId, PLAYER_ID);
});

test('明确时间流逝允许解析抵达，地点内部移动只改变场景', () => {
  const arrival = resolveWorldIntent(
    unresolvedIntent('arrive', '半个月后，我推开红堡议事厅的门', {
      targetText: '红堡',
      sceneLocation: '议事厅',
      elapsedTime: { days: 15 },
    }),
    context,
  );
  const inside = resolveWorldIntent(
    unresolvedIntent('move_inside_location', '我从大厅走进神木林', {
      targetText: '临冬城',
      sceneLocation: '神木林',
    }),
    context,
  );

  assert.equal(arrival.targetRef.location.locationId, 'b_red_keep');
  assert.equal(arrival.targetRef.location.sceneLocation, '议事厅');
  assert.equal(inside.targetRef.location.locationId, 'b_winterfell');
  assert.equal(inside.targetRef.location.sceneLocation, '神木林');
});

test('抵达必须有可验证旅程或明确时间流逝', () => {
  assert.throws(
    () => resolveWorldIntent(
      unresolvedIntent('arrive', '我已经到了君临', { targetText: '君临' }),
      context,
    ),
    /没有可验证的旅程或时间流逝/,
  );

  const verified = resolveWorldIntent(
    unresolvedIntent('arrive', '旅程已经抵达君临', { targetText: '君临' }),
    {
      ...context,
      activeJourney: {
        status: 'arrived',
        routePlan: { to: 'b_kings_landing' },
      },
    },
  );
  assert.equal(verified.targetRef.location.locationId, 'b_kings_landing');
});

test('同名地点优先当前伯爵领，但同分歧义必须拒绝', () => {
  const nearby = resolveWorldIntent(
    unresolvedIntent('mention', '渡口就在附近', { targetText: '渡口' }),
    context,
  );
  assert.equal(nearby.targetRef.location.locationId, 'b_north_ford');

  const ambiguousContext = {
    ...context,
    currentLocation: undefined,
    countyIdByLocationId: new Map(),
  };
  assert.throws(
    () => resolveWorldIntent(
      unresolvedIntent('arrive', '我到了渡口', { targetText: '渡口', elapsedTime: { days: 3 } }),
      ambiguousContext,
    ),
    /地点无法唯一解析/,
  );
});

test('批量解析保留成功意图并逐条记录失败', () => {
  const result = resolveWorldIntents([
    unresolvedIntent('mention', '我想起了君临', { targetText: '君临' }),
    unresolvedIntent('arrive', '我到了渡口', { targetText: '渡口', elapsedTime: { days: 3 } }),
    unresolvedIntent('start_travel', '我动身去红堡', { targetText: '红堡' }),
  ], {
    ...context,
    currentLocation: undefined,
    countyIdByLocationId: new Map(),
  });

  assert.deepEqual(result.resolved.map((intent) => intent.kind), ['mention', 'start_travel']);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].intent.kind, 'arrive');
  assert.match(result.rejected[0].reason, /地点无法唯一解析/);
});

test('模型地点意图结构拒绝未知类型、空证据和多余字段', () => {
  assert.deepEqual(parseUnresolvedWorldIntents([
    { kind: 'mention', targetText: '君临', evidenceText: '我想起了君临' },
  ]), [
    { kind: 'mention', targetText: '君临', evidenceText: '我想起了君临' },
  ]);

  assert.throws(
    () => parseUnresolvedWorldIntents([{ kind: 'teleport', targetText: '君临', evidenceText: '传送' }]),
    /未知的世界意图类型/,
  );
  assert.throws(
    () => parseUnresolvedWorldIntents([{ kind: 'mention', targetText: '君临', evidenceText: '   ' }]),
    /证据文本不能为空/,
  );
  assert.throws(
    () => parseUnresolvedWorldIntents([{ kind: 'mention', targetText: '君临', evidenceText: '提及君临', extra: true }]),
    /包含未知字段/,
  );
});

test('回合解析同时读取状态命令和结构化地点意图', () => {
  const draft = parseTurnResolutionOutput(`
    <resolution>决定明日动身。</resolution>
    <state_cmd>[{"type":"ADVANCE_TIME","days":1,"reason":"等待至次日"}]</state_cmd>
    <world_intent>[{"kind":"plan_travel","targetText":"君临","evidenceText":"我准备明日去君临"}]</world_intent>
  `);

  assert.equal(draft.outcomeSummary, '决定明日动身。');
  assert.equal(draft.stateCommands[0].type, 'ADVANCE_TIME');
  assert.equal(draft.worldIntents[0].kind, 'plan_travel');
  assert.equal(draft.worldIntents[0].targetText, '君临');
});

test('解析提示明确区分愿望、计划、出发、推进、抵达和内部移动', () => {
  for (const required of [
    'mention',
    'plan_travel',
    'start_travel',
    'advance_travel',
    'arrive',
    'move_inside_location',
    '愿望、计划和提及绝不等于出发',
    '即使主要行动是交谈、战斗、赠礼或调查',
  ]) {
    assert.match(WORLD_INTENT_RESOLUTION_PROMPT, new RegExp(required));
  }
});

test('地点意图协议不会泄漏到正文，离线解析也返回空意图数组', async () => {
  const parsed = parseModelOutput(
    '<world_intent>[{"kind":"mention","targetText":"君临","evidenceText":"提及君临"}]</world_intent>正文内容',
    1,
    '提及君临',
  );
  assert.equal(parsed.narrate, '正文内容');
  assert.doesNotMatch(parsed.narrate, /world_intent|mention/);

  const offline = await requestTurnResolutionCompletion(
    [{ role: 'user', content: '我想起了君临' }],
    { provider: 'deepseek', baseUrl: '', apiKey: '', model: '', temperature: 0.3 },
  );
  assert.match(offline, /<world_intent>\[\]<\/world_intent>/);
});
