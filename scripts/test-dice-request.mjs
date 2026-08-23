import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDiceResolutionOutput, GOT_DICE_REQUEST_PROMPT } from '../src/services/turn/diceRequest.ts';

test('判骰说明不含小说创作指令和 state_cmd 示例', () => {
  assert.doesNotMatch(GOT_DICE_REQUEST_PROMPT, /600 ~ 1200/);
  assert.doesNotMatch(GOT_DICE_REQUEST_PROMPT, /600~1200/);
  // 判骰阶段不回放完整 state_cmd 示例数组（只在 GOT_CONSTITUTION_PROMPT 里）
  assert.doesNotMatch(GOT_DICE_REQUEST_PROMPT, /<state_cmd>\s*\n\s*\[/);
  // 应包含领域映射表和 DC 规则
  assert.match(GOT_DICE_REQUEST_PROMPT, /duel.*prowess/);
  assert.match(GOT_DICE_REQUEST_PROMPT, /DC 夹在 8-20 之间/);
});

test('roll:false 的输出解析为不检定，命令走单轨 state_cmd', () => {
  const raw = `<resolution>日常行动。</resolution>
<dice_request>
{ "roll": false, "attribute": "diplomacy", "dc": 12, "domain": "diplomacy", "reason": "普通问候" }
</dice_request>
<state_cmd>
[{ "type": "ADVANCE_TIME", "days": 1, "reason": "交谈" }]
</state_cmd>
<world_intent>[]</world_intent>`;
  const parsed = parseDiceResolutionOutput(raw);
  assert.equal(parsed.diceRequest.roll, false);
  assert.equal(parsed.diceRequest.attribute, 'diplomacy');
  assert.equal(parsed.diceRequest.dc, 12);
  assert.equal(parsed.diceRequest.domain, 'diplomacy');
  assert.equal(parsed.successCommands.length, 1);
  assert.equal(parsed.successCommands[0].type, 'ADVANCE_TIME');
  assert.equal(parsed.failureCommands.length, 0);
});

test('roll:true 的输出解析为双轨命令', () => {
  const raw = `<resolution>与骑士决斗。</resolution>
<dice_request>
{ "roll": true, "attribute": "prowess", "dc": 14, "domain": "duel", "reason": "真实战斗阻力" }
</dice_request>
<state_cmd_success>
[{ "type": "INJURE_ZONE", "zone": "torso", "level": "minor", "woundText": "骑士被划伤" }]
</state_cmd_success>
<state_cmd_failure>
[{ "type": "INJURE_ZONE", "zone": "arms", "level": "minor", "woundText": "自身右臂中剑" }]
</state_cmd_failure>
<world_intent>[]</world_intent>`;
  const parsed = parseDiceResolutionOutput(raw);
  assert.equal(parsed.diceRequest.roll, true);
  assert.equal(parsed.diceRequest.attribute, 'prowess');
  assert.equal(parsed.diceRequest.dc, 14);
  assert.equal(parsed.diceRequest.domain, 'duel');
  assert.equal(parsed.successCommands.length, 1);
  assert.equal(parsed.successCommands[0].zone, 'torso');
  assert.equal(parsed.failureCommands.length, 1);
  assert.equal(parsed.failureCommands[0].zone, 'arms');
});

test('头衔意图被 resolver 接受而非拒绝', () => {
  const raw = `<resolution>册封封臣。</resolution>
<state_cmd>[]</state_cmd>
<world_intent>
[
  { "kind": "grant_title", "actorId": "agot:Stark_3", "titleId": "b_the_north", "recipientId": "agot:Stark_5", "evidenceText": "艾德将北境封臣之权授予罗柏" },
  { "kind": "occupy_title", "actorId": "agot:Lannister_2", "titleId": "b_harrenhal", "evidenceText": "兰尼斯特军占领赫伦堡" }
]
</world_intent>`;
  const parsed = parseDiceResolutionOutput(raw);
  assert.equal(parsed.worldIntents.length, 2);
  assert.equal(parsed.worldIntents[0].kind, 'grant_title');
  assert.equal(parsed.worldIntents[1].kind, 'occupy_title');
});

test('revoke_title 意图要求 holderId 字段', () => {
  const raw = `<resolution>剥夺头衔。</resolution>
<state_cmd>[]</state_cmd>
<world_intent>
[
  { "kind": "revoke_title", "actorId": "agot:Stark_3", "titleId": "b_winterfell", "holderId": "agot:Stark_5", "evidenceText": "收回罗柏的临冬城封地" }
]
</world_intent>`;
  const parsed = parseDiceResolutionOutput(raw);
  assert.equal(parsed.worldIntents.length, 1);
  assert.equal(parsed.worldIntents[0].kind, 'revoke_title');
});

test('无 dice_request 标签时默认不检定', () => {
  const raw = `<resolution>继续行动。</resolution>
<state_cmd>
[{ "type": "ADVANCE_TIME", "days": 1, "reason": "行进" }]
</state_cmd>
<world_intent>[]</world_intent>`;
  const parsed = parseDiceResolutionOutput(raw);
  assert.equal(parsed.diceRequest.roll, false);
  assert.equal(parsed.diceRequest.reason, '模型未输出判骰结果，默认不检定');
  assert.equal(parsed.successCommands.length, 1);
});

test('模型给出的非法 domain 被回退为 diplomacy', () => {
  const raw = `<dice_request>
{ "roll": true, "domain": "fishing", "dc": 15 }
</dice_request>
<state_cmd_success>[]</state_cmd_success>
<state_cmd_failure>[]</state_cmd_failure>
<world_intent>[]</world_intent>`;
  const parsed = parseDiceResolutionOutput(raw);
  assert.equal(parsed.diceRequest.domain, 'diplomacy');
  assert.equal(parsed.diceRequest.attribute, 'diplomacy');
});

test('DC 被夹在 8-20 之间', () => {
  const tooHigh = `<dice_request>
{ "roll": true, "dc": 99, "domain": "duel" }
</dice_request>
<state_cmd_success>[]</state_cmd_success>
<state_cmd_failure>[]</state_cmd_failure>
<world_intent>[]</world_intent>`;
  const parsedHigh = parseDiceResolutionOutput(tooHigh);
  assert.equal(parsedHigh.diceRequest.dc, 20);

  const tooLow = `<dice_request>
{ "roll": true, "dc": 2, "domain": "duel" }
</dice_request>
<state_cmd_success>[]</state_cmd_success>
<state_cmd_failure>[]</state_cmd_failure>
<world_intent>[]</world_intent>`;
  const parsedLow = parseDiceResolutionOutput(tooLow);
  assert.equal(parsedLow.diceRequest.dc, 8);
});

test('roll:true 但双轨都为空时回退到普通 state_cmd', () => {
  const raw = `<dice_request>
{ "roll": true, "dc": 14, "domain": "duel" }
</dice_request>
<state_cmd>
[{ "type": "INJURE_ZONE", "zone": "torso", "level": "minor", "woundText": "受伤" }]
</state_cmd>
<world_intent>[]</world_intent>`;
  const parsed = parseDiceResolutionOutput(raw);
  assert.equal(parsed.diceRequest.roll, true);
  assert.equal(parsed.successCommands.length, 1);
  assert.equal(parsed.failureCommands.length, 1);
  // 回退时两边都用同一个 state_cmd
  assert.deepEqual(parsed.successCommands, parsed.failureCommands);
});

test('缺少 type 字段的畸形命令被丢弃，不致下游 startsWith 崩溃', () => {
  const raw = `<resolution>行动。</resolution>
<state_cmd>
[{ "type": "ADVANCE_TIME", "days": 1 }, { "zone": "torso" }, {}]
</state_cmd>
<world_intent>[]</world_intent>`;
  const parsed = parseDiceResolutionOutput(raw);
  assert.equal(parsed.successCommands.length, 1);
  assert.equal(parsed.successCommands[0].type, 'ADVANCE_TIME');
});

test('双轨 state_cmd 中畸形元素同样被过滤', () => {
  const raw = `<dice_request>
{ "roll": true, "dc": 14, "domain": "duel" }
</dice_request>
<state_cmd_success>
[{ "type": "INJURE_ZONE", "zone": "torso", "level": "minor", "woundText": "划伤" }, { "no_type": true }]
</state_cmd_success>
<state_cmd_failure>
[{}, { "type": "INJURE_ZONE", "zone": "arms", "level": "minor", "woundText": "中剑" }]
</state_cmd_failure>
<world_intent>[]</world_intent>`;
  const parsed = parseDiceResolutionOutput(raw);
  assert.equal(parsed.successCommands.length, 1);
  assert.equal(parsed.successCommands[0].zone, 'torso');
  assert.equal(parsed.failureCommands.length, 1);
  assert.equal(parsed.failureCommands[0].zone, 'arms');
});

test('头衔意图被 resolver 接受而非拒绝', () => {
  const raw = `<resolution>册封封臣。</resolution>
<state_cmd>[]</state_cmd>
<world_intent>
[
  { "kind": "grant_title", "actorId": "agot:Stark_3", "titleId": "b_the_north", "recipientId": "agot:Stark_5", "evidenceText": "艾德将北境封臣之权授予罗柏" },
  { "kind": "occupy_title", "actorId": "agot:Lannister_2", "titleId": "b_harrenhal", "evidenceText": "兰尼斯特军占领赫伦堡" }
]
</world_intent>`;
  const parsed = parseDiceResolutionOutput(raw);
  assert.equal(parsed.worldIntents.length, 2);
  assert.equal(parsed.worldIntents[0].kind, 'grant_title');
  assert.equal(parsed.worldIntents[1].kind, 'occupy_title');
});

test('revoke_title 意图要求 holderId 字段', () => {
  const raw = `<resolution>剥夺头衔。</resolution>
<state_cmd>[]</state_cmd>
<world_intent>
[
  { "kind": "revoke_title", "actorId": "agot:Stark_3", "titleId": "b_winterfell", "holderId": "agot:Stark_5", "evidenceText": "收回罗柏的临冬城封地" }
]
</world_intent>`;
  const parsed = parseDiceResolutionOutput(raw);
  assert.equal(parsed.worldIntents.length, 1);
  assert.equal(parsed.worldIntents[0].kind, 'revoke_title');
});
