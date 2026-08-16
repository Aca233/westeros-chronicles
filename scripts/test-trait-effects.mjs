import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateTraitRuleEffects,
  applyPositiveMultiplier,
  didTraitResistanceTrigger,
  describeNarrativeAdvantage,
} from '../src/services/traitEffectEngine.ts';

test('trait effects stack and clamp by rule category', () => {
  const result = aggregateTraitRuleEffects([
    {
      multipliers: { goldGain: 1.5, stressGain: -0.5 },
      resistances: { injury: 0.5 },
      checkModifiers: { duel: 7 },
      eventWeights: { acceptDuel: 2 },
      roleplayDirectives: ['直面危险'],
    },
    {
      multipliers: { goldGain: 1, stressGain: -0.5 },
      resistances: { injury: 0.5 },
      checkModifiers: { duel: 7 },
      eventWeights: { acceptDuel: 3 },
      roleplayDirectives: ['直面危险', '不轻易退缩'],
    },
  ]);

  assert.equal(result.multipliers.goldGain, 2);
  assert.equal(result.multipliers.stressGain, -0.8);
  assert.equal(result.resistances.injury, 0.75);
  assert.equal(result.checkModifiers.duel, 10);
  assert.equal(result.eventWeights.acceptDuel, 5);
  assert.deepEqual(result.roleplayDirectives, ['直面危险', '不轻易退缩']);
});

test('resource multipliers affect gains but never amplify spending', () => {
  assert.equal(applyPositiveMultiplier(100, 0.25), 125);
  assert.equal(applyPositiveMultiplier(-100, 0.25), -100);
  assert.equal(applyPositiveMultiplier(3, -0.2), 2);
});

test('resistance uses a frontend roll with explicit boundaries', () => {
  assert.equal(didTraitResistanceTrigger(0.25, 0.1), true);
  assert.equal(didTraitResistanceTrigger(0.25, 0.25), false);
  assert.equal(didTraitResistanceTrigger(0, 0), false);
});

test('D20-off guidance is qualitative and does not resolve success', () => {
  assert.equal(describeNarrativeAdvantage(-4), '严重劣势');
  assert.equal(describeNarrativeAdvantage(-2), '明显劣势');
  assert.equal(describeNarrativeAdvantage(-1), '轻微劣势');
  assert.equal(describeNarrativeAdvantage(0), '无额外影响');
  assert.equal(describeNarrativeAdvantage(1), '轻微优势');
  assert.equal(describeNarrativeAdvantage(3), '明显优势');
  assert.equal(describeNarrativeAdvantage(4), '显著优势');
});
