import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GOT_DICE_REQUEST_PROMPT,
  ResolutionProtocolError,
  parseDiceResolutionOutput,
} from '../src/services/turn/diceRequest.ts';

const noRoll = ({ state = '[]', world = '[]' } = {}) => `<resolution>日常行动。</resolution>
<dice_request>{"roll":false,"attribute":"diplomacy","dc":12,"domain":"diplomacy","reason":"普通行动"}</dice_request>
<state_cmd>${state}</state_cmd>
<world_intent>${world}</world_intent>`;

const roll = ({ success = '[]', failure = '[]', successWorld = '[]', failureWorld = '[]' } = {}) => `
<resolution>需要检定。</resolution>
<dice_request>{"roll":true,"attribute":"prowess","dc":14,"domain":"duel","reason":"存在真实对抗"}</dice_request>
<state_cmd_success>${success}</state_cmd_success>
<state_cmd_failure>${failure}</state_cmd_failure>
<world_intent_success>${successWorld}</world_intent_success>
<world_intent_failure>${failureWorld}</world_intent_failure>`;

test('判骰提示要求状态和世界意图双轨且不含小说创作指令', () => {
  assert.doesNotMatch(GOT_DICE_REQUEST_PROMPT, /600\s*~\s*1200/);
  assert.match(GOT_DICE_REQUEST_PROMPT, /duel.*prowess/);
  assert.match(GOT_DICE_REQUEST_PROMPT, /DC 夹在 8-20 之间/);
  assert.match(GOT_DICE_REQUEST_PROMPT, /主属性 70% \+ 辅属性 30%/);
  assert.match(GOT_DICE_REQUEST_PROMPT, /world_intent_success/);
  assert.match(GOT_DICE_REQUEST_PROMPT, /空数组/);
});

test('roll:false 只解析普通状态命令和世界意图', () => {
  const parsed = parseDiceResolutionOutput(noRoll({
    state: '[{"type":"ADVANCE_TIME","days":1,"reason":"交谈"}]',
    world: '[{"kind":"mention","targetText":"君临","evidenceText":"提及君临"}]',
  }));
  assert.equal(parsed.diceRequest.roll, false);
  assert.equal(parsed.successCommands[0].type, 'ADVANCE_TIME');
  assert.equal(parsed.failureCommands.length, 0);
  assert.equal(parsed.worldIntents[0].kind, 'mention');
  assert.deepEqual(parsed.successWorldIntents, []);
  assert.deepEqual(parsed.failureWorldIntents, []);
});

test('roll:true 的状态命令和世界意图严格按结果分轨', () => {
  const parsed = parseDiceResolutionOutput(roll({
    success: '[{"type":"INJURE_ZONE","zone":"torso","level":"minor","woundText":"敌人被划伤"}]',
    failure: '[{"type":"INJURE_ZONE","zone":"arms","level":"minor","woundText":"自身中剑"}]',
    successWorld: '[{"kind":"mention","targetText":"胜利","evidenceText":"赢得决斗"}]',
    failureWorld: '[{"kind":"mention","targetText":"失败","evidenceText":"输掉决斗"}]',
  }));
  assert.equal(parsed.successCommands[0].zone, 'torso');
  assert.equal(parsed.failureCommands[0].zone, 'arms');
  assert.equal(parsed.successWorldIntents[0].targetText, '胜利');
  assert.equal(parsed.failureWorldIntents[0].targetText, '失败');
  assert.deepEqual(parsed.worldIntents, []);
});

test('roll:true 允许任一结果轨合法地没有变化', () => {
  const parsed = parseDiceResolutionOutput(roll());
  assert.deepEqual(parsed.successCommands, []);
  assert.deepEqual(parsed.failureCommands, []);
  assert.deepEqual(parsed.successWorldIntents, []);
  assert.deepEqual(parsed.failureWorldIntents, []);
});

test('缺失 dice_request 会拒绝整份结算', () => {
  assert.throws(
    () => parseDiceResolutionOutput('<state_cmd>[]</state_cmd><world_intent>[]</world_intent>'),
    ResolutionProtocolError,
  );
});

test('字符串 false、非法领域和空 reason 都会拒绝', () => {
  for (const request of [
    '{"roll":"false","dc":12,"domain":"diplomacy","reason":"普通行动"}',
    '{"roll":true,"dc":12,"domain":"fishing","reason":"钓鱼"}',
    '{"roll":true,"dc":12,"domain":"duel","reason":""}',
  ]) {
    assert.throws(
      () => parseDiceResolutionOutput(`<dice_request>${request}</dice_request>`),
      ResolutionProtocolError,
    );
  }
});

test('DC 被夹在 8-20 之间，模型按具体方法提交合法属性', () => {
  const high = parseDiceResolutionOutput(roll().replace('"dc":14', '"dc":99').replace('"attribute":"prowess"', '"attribute":"learning"'));
  const low = parseDiceResolutionOutput(roll().replace('"dc":14', '"dc":2'));
  assert.equal(high.diceRequest.dc, 20);
  assert.equal(high.diceRequest.attribute, 'learning');
  assert.equal(low.diceRequest.dc, 8);
});

test('可选辅属性被保留，非法或重复属性会拒绝', () => {
  const combined = parseDiceResolutionOutput(roll().replace('"attribute":"prowess"', '"attribute":"prowess","secondaryAttribute":"martial"'));
  assert.equal(combined.diceRequest.attribute, 'prowess');
  assert.equal(combined.diceRequest.secondaryAttribute, 'martial');
  for (const replacement of [
    '"attribute":"magic"',
    '"attribute":"prowess","secondaryAttribute":"magic"',
    '"attribute":"prowess","secondaryAttribute":"prowess"',
  ]) {
    assert.throws(
      () => parseDiceResolutionOutput(roll().replace('"attribute":"prowess"', replacement)),
      ResolutionProtocolError,
    );
  }
});

test('roll:true 缺任一结果标签时拒绝，绝不回退另一轨', () => {
  assert.throws(
    () => parseDiceResolutionOutput(roll().replace('<state_cmd_failure>[]</state_cmd_failure>', '')),
    /state_cmd_failure/,
  );
  assert.throws(
    () => parseDiceResolutionOutput(roll().replace('<world_intent_failure>[]</world_intent_failure>', '')),
    /world_intent_failure/,
  );
});

test('畸形命令和损坏 JSON 会拒绝整份结算', () => {
  assert.throws(
    () => parseDiceResolutionOutput(noRoll({ state: '[{"type":"ADVANCE_TIME"},{}]' })),
    /缺少字符串 type/,
  );
  assert.throws(
    () => parseDiceResolutionOutput(noRoll({ world: '[{"kind":"mention",}]' })),
    /JSON 解析失败/,
  );
});
