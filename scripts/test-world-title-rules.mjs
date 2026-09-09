import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/features/world/worldTitleRules.ts';",
      "export * from './src/features/world/worldBaseline.ts';",
      "export * from './src/features/world/worldRuntimeState.ts';",
    ].join('\n'),
    resolveDir: process.cwd(), sourcefile: 'world-title-rules-runtime.ts', loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { createWorldBaselineSnapshot, createWorldRuntimeState, planTitleIntent } = await import(url);

const STARK = 'agot:Stark_3';
const BOLTON = 'agot:Bolton_4';
const KING = 'agot:Baratheon_1';
const HEIR = 'agot:Stark_7';
const TITLE_ID = 'c_winterfell';
const baseline = createWorldBaselineSnapshot({
  characters: [
    { id: STARK, alive: true, location: { locationId: 'c_winterfell' } },
    { id: BOLTON, alive: true, location: { locationId: 'c_winterfell' } },
    { id: KING, alive: true, location: { locationId: 'c_kings_landing' } },
    { id: HEIR, alive: true, location: { locationId: 'c_winterfell' } },
  ],
  titles: [{ id: TITLE_ID, lawfulHolderId: STARK, controllerId: STARK, contestedByIds: [] }],
  assets: [],
  knownLocationIds: ['c_winterfell', 'c_kings_landing'],
});
const context = { baseline, runtime: createWorldRuntimeState() };
const mutationOf = (mutations, type) => mutations.find((mutation) => mutation.type === type);

test('军事占领只改变实际控制，不改变法理持有人', () => {
  const occupation = planTitleIntent({
    kind: 'occupy_title', titleId: TITLE_ID, actorId: BOLTON,
    evidenceText: '我军已经控制临冬城',
  }, context);
  assert.equal(mutationOf(occupation, 'title.set-holder'), undefined);
  assert.equal(mutationOf(occupation, 'title.set-controller').controllerId, BOLTON);
  assert.deepEqual(mutationOf(occupation, 'title.set-controller').contestedByIds, [STARK]);
});

test('正式册封同步法理和实际控制，并清空争议', () => {
  const grant = planTitleIntent({
    kind: 'grant_title', titleId: TITLE_ID, actorId: STARK, recipientId: HEIR,
    evidenceText: '当前持有人正式转让头衔',
  }, context);
  assert.equal(mutationOf(grant, 'title.set-holder').holderId, HEIR);
  assert.equal(mutationOf(grant, 'title.set-controller').controllerId, HEIR);
  assert.deepEqual(mutationOf(grant, 'title.set-controller').contestedByIds, []);
});

test('继承要求前任已死亡，撤销与战争结算要求当前权威', () => {
  const inheritanceContext = { baseline, runtime: createWorldRuntimeState() };
  inheritanceContext.runtime.characters[STARK] = { alive: false };
  const inheritance = planTitleIntent({
    kind: 'inherit_title', titleId: TITLE_ID, actorId: HEIR, recipientId: HEIR,
    evidenceText: '依继承法继承临冬城',
  }, inheritanceContext);
  assert.equal(mutationOf(inheritance, 'title.set-holder').holderId, HEIR);
  assert.equal(mutationOf(inheritance, 'title.set-controller').controllerId, HEIR);

  const revocation = planTitleIntent({
    kind: 'revoke_title', titleId: TITLE_ID, actorId: STARK, holderId: STARK,
    evidenceText: '当前持有人放弃封地',
  }, context);
  assert.equal(mutationOf(revocation, 'title.set-holder').holderId, null);
  assert.equal(mutationOf(revocation, 'title.set-controller').controllerId, null);
  assert.deepEqual(mutationOf(revocation, 'title.set-controller').contestedByIds, []);

  const settlement = planTitleIntent({
    kind: 'settle_title_war', titleId: TITLE_ID, actorId: STARK, recipientId: BOLTON,
    evidenceText: '战争以正式和约结算',
  }, context);
  assert.equal(mutationOf(settlement, 'title.set-holder').holderId, BOLTON);
  assert.equal(mutationOf(settlement, 'title.set-controller').controllerId, BOLTON);
  assert.deepEqual(mutationOf(settlement, 'title.set-controller').contestedByIds, []);
});

test('拒绝未知人物、未知头衔和与当前法理持有人不符的撤销', () => {
  assert.throws(() => planTitleIntent({
    kind: 'occupy_title', titleId: 'c_unknown', actorId: BOLTON, evidenceText: '占领未知头衔',
  }, context), /头衔不存在/);
  assert.throws(() => planTitleIntent({
    kind: 'occupy_title', titleId: TITLE_ID, actorId: 'agot:Unknown_1', evidenceText: '未知人物占领',
  }, context), /人物不存在/);
  assert.throws(() => planTitleIntent({
    kind: 'revoke_title', titleId: TITLE_ID, actorId: STARK, holderId: BOLTON,
    evidenceText: '撤销并非由此人持有的头衔',
  }, context), /法理持有人不符/);
  assert.throws(() => planTitleIntent({
    kind: 'grant_title', titleId: TITLE_ID, actorId: KING, recipientId: HEIR,
    evidenceText: '没有可验证授权却试图册封',
  }, context), /无权处置/);
  assert.throws(() => planTitleIntent({
    kind: 'inherit_title', titleId: TITLE_ID, actorId: HEIR, recipientId: HEIR,
    evidenceText: '前任仍在世时直接继承',
  }, context), /仍然在世/);
});
