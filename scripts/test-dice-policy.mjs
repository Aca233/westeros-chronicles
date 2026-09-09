import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOutcomeContract, evaluateDiceRequirement } from '../src/services/dicePolicy.ts';

test('auto mode rolls only for uncertain actions with meaningful failure', () => {
  assert.equal(evaluateDiceRequirement('我尝试潜入守卫把守的档案室').shouldRoll, true);
  assert.equal(evaluateDiceRequirement('我拔剑与敌方骑士决斗').shouldRoll, true);
  assert.equal(evaluateDiceRequirement('我坐下喝一杯水').shouldRoll, false);
  assert.equal(evaluateDiceRequirement('我向学士询问今天的天气').shouldRoll, false);
  assert.equal(evaluateDiceRequirement('我去军械库穿上自己的战甲').shouldRoll, false);
  assert.equal(evaluateDiceRequirement('我拔剑练习劈砍木桩').shouldRoll, false);
});

test('clearly impossible actions never receive a roll', () => {
  const decision = evaluateDiceRequirement('我凭空召唤一条巨龙并一剑劈开城墙');
  assert.equal(decision.shouldRoll, false);
  assert.equal(decision.isImpossible, true);
});

test('auto mode identifies the primary actionable intent instead of matching any later keyword', () => {
  const infiltration = evaluateDiceRequirement('我先潜入重兵把守的档案室，再寻找刺杀目标的证据');
  assert.equal(infiltration.shouldRoll, true);
  assert.equal(infiltration.domain, 'intrigue');
  assert.equal(infiltration.attribute, 'intrigue');

  const intimidation = evaluateDiceRequirement('我用腰间佩剑威胁守卫放我进去');
  assert.equal(intimidation.domain, 'intimidation');
  assert.equal(intimidation.attribute, 'diplomacy');
});

test('具体方法可以选择主辅属性，普通单项行动不强塞辅属性', () => {
  const forged = evaluateDiceRequirement('我仿写一份假的通行许可，骗过守卫');
  assert.equal(forged.shouldRoll, true);
  assert.equal(forged.attribute, 'intrigue');
  assert.equal(forged.secondaryAttribute, 'learning');

  const hiddenClimb = evaluateDiceRequirement('我悄悄攀上后墙，尽量不惊动巡逻');
  assert.equal(hiddenClimb.attribute, 'prowess');
  assert.equal(hiddenClimb.secondaryAttribute, 'intrigue');

  const duel = evaluateDiceRequirement('我拔剑与敌方骑士决斗');
  assert.equal(duel.attribute, 'prowess');
  assert.equal(duel.secondaryAttribute, undefined);
});

test('context changes DC without changing whether the action uses a visible roll', () => {
  const normal = evaluateDiceRequirement('我潜入档案室');
  const guarded = evaluateDiceRequirement('我潜入重兵把守且警戒严密的档案室');
  const assisted = evaluateDiceRequirement('我在内应协助并提前准备后潜入档案室');
  assert.equal(normal.dc, 15);
  assert.ok(guarded.dc > normal.dc);
  assert.ok(assisted.dc < normal.dc);

  const healthy = evaluateDiceRequirement('我与敌方骑士决斗', { overallStatus: '强健' });
  const badlyWounded = evaluateDiceRequirement('我与敌方骑士决斗', { overallStatus: '负重伤' });
  assert.ok(badlyWounded.dc > healthy.dc);
});

test('ordinary wording does not suppress a genuinely opposed action', () => {
  const decision = evaluateDiceRequirement('我告诉守卫，我要说服他打开上锁的档案室');
  assert.equal(decision.shouldRoll, true);
  assert.equal(decision.domain, 'diplomacy');
});

test('outcome contract limits dice to the declared action', () => {
  const contract = buildOutcomeContract('说服守卫让我进入档案室', 'diplomacy');
  assert.match(contract.successOutcome, /守卫|说服|行动目标/);
  assert.match(contract.failureOutcome, /拒绝|未能/);
  assert.ok(contract.forbiddenEscalations.includes('不得凭空引入与当前行动无关的追杀、死亡或世界事件'));
  assert.match(contract.criticalSuccessLimit, /合理边界/);
  assert.match(contract.criticalFailureLimit, /直接相关/);
});
