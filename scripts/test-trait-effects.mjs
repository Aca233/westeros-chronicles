import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `
      export {
        aggregateTraitRuleEffects,
        applyPositiveMultiplier,
        didTraitResistanceTrigger,
        describeNarrativeAdvantage,
      } from './src/services/traitEffectEngine.ts';
      export { aggregateSelectedTraitEffects, CHARACTER_TRAITS } from './src/data/characterTraits.ts';
      export { IMPORTED_CHARACTER_TRAIT_DEFINITIONS } from './src/data/importedCharacterTraitDefinitions.ts';
      export { CHARACTER_TRAIT_RULES } from './src/data/characterTraitEffects.ts';
      export { IMPORTED_CHARACTER_TRAIT_RULES } from './src/data/importedCharacterTraitEffects.ts';
    `,
    resolveDir: process.cwd(),
    sourcefile: 'trait-effects-test-bundle.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  aggregateTraitRuleEffects,
  applyPositiveMultiplier,
  didTraitResistanceTrigger,
  describeNarrativeAdvantage,
  aggregateSelectedTraitEffects,
  CHARACTER_TRAITS,
  IMPORTED_CHARACTER_TRAIT_DEFINITIONS,
  CHARACTER_TRAIT_RULES,
  IMPORTED_CHARACTER_TRAIT_RULES,
} = await import(moduleUrl);

test('trait effects stack and clamp by rule category', () => {
  const result = aggregateTraitRuleEffects([
    {
      multipliers: { goldGain: 1.5 },
      resistances: { injury: 0.5 },
      checkModifiers: { duel: 7 },
      roleplayDirectives: ['直面危险'],
    },
    {
      multipliers: { goldGain: 1 },
      resistances: { injury: 0.5 },
      checkModifiers: { duel: 7 },
      roleplayDirectives: ['直面危险', '不轻易退缩'],
    },
  ]);

  assert.equal(result.multipliers.goldGain, 2);
  assert.equal(result.resistances.injury, 0.75);
  assert.equal(result.checkModifiers.duel, 10);
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

// 新增特质规则可以被 aggregateSelectedTraitEffects 聚合
test('trait rules contain only mechanics that are consumed by the current game', () => {
  const allowedMultiplierTargets = new Set(['goldGain', 'prestigeGain', 'dreadGain']);
  for (const [traitId, rule] of Object.entries(CHARACTER_TRAIT_RULES)) {
    assert.equal(rule.eventWeights, undefined, `${traitId} still defines unused eventWeights`);
    for (const target of Object.keys(rule.multipliers ?? {})) {
      assert.ok(allowedMultiplierTargets.has(target), `${traitId} still defines unused multiplier ${target}`);
    }
  }
});

test('imported trait rules can be aggregated by aggregateSelectedTraitEffects', () => {
  const aggregated = aggregateSelectedTraitEffects(['knight', 'maester_historical', 'lifestyle_physician']);
  assert.equal(aggregated.checkModifiers.duel, 2);
  assert.equal(aggregated.checkModifiers.learning, 5);
  assert.equal(aggregated.checkModifiers.medicine, 5);
  assert.equal(aggregated.resistances.disease, undefined);
  assert.equal(aggregated.multipliers.prestigeGain, 0.1);
  assert.ok(aggregated.roleplayDirectives.length >= 3);
});

// knight 对 duel 有合理正修正，但不达到 +5
test('knight grants a reasonable positive duel check modifier below +5', () => {
  const knightRule = IMPORTED_CHARACTER_TRAIT_RULES['knight'];
  assert.ok(knightRule, 'knight rule exists');
  const duelMod = knightRule.checkModifiers?.duel ?? 0;
  assert.ok(duelMod > 0 && duelMod < 5, `knight duel modifier ${duelMod} should be > 0 and < 5`);
});

// 学识与医疗训练提供检定能力，但不会让人物肉体天然免疫疾病或毒素
test('knowledge traits improve relevant checks without unconditional biological resistance', () => {
  const maesterRule = IMPORTED_CHARACTER_TRAIT_RULES['maester_historical'];
  const physicianRule = IMPORTED_CHARACTER_TRAIT_RULES['lifestyle_physician'];
  const herbalistRule = IMPORTED_CHARACTER_TRAIT_RULES['lifestyle_herbalist'];
  assert.ok(maesterRule, 'maester_historical rule exists');
  assert.ok(physicianRule, 'lifestyle_physician rule exists');
  assert.ok(herbalistRule, 'lifestyle_herbalist rule exists');
  assert.ok((maesterRule.checkModifiers?.learning ?? 0) > 0, 'learning modifier should be positive');
  assert.ok((maesterRule.checkModifiers?.medicine ?? 0) > 0, 'medicine modifier should be positive');
  assert.equal(maesterRule.resistances?.disease, undefined);
  assert.equal(physicianRule.resistances?.disease, undefined);
  assert.equal(herbalistRule.resistances?.poison, undefined);
});

// 社会身份或外貌事实不应凭空生成无条件的战斗、求生或威吓能力
test('identity and appearance traits avoid unrelated unconditional check modifiers', () => {
  assert.equal(IMPORTED_CHARACTER_TRAIT_RULES['wild_oat']?.checkModifiers?.survival, undefined);
  assert.equal(IMPORTED_CHARACTER_TRAIT_RULES['disinherited']?.checkModifiers?.intimidation, undefined);
  assert.equal(IMPORTED_CHARACTER_TRAIT_RULES['tourney_participant']?.checkModifiers?.intimidation, undefined);
  assert.deepEqual(IMPORTED_CHARACTER_TRAIT_RULES['heterochromia_eyes']?.checkModifiers ?? {}, {});
});

// 仪式、皮肤症状和无视疼痛不会在受伤或感染结算时降低实际伤情
test('ritual and symptoms do not become unconditional physical resistance', () => {
  assert.equal(IMPORTED_CHARACTER_TRAIT_RULES['drowned_man']?.resistances?.disease, undefined);
  assert.equal(IMPORTED_CHARACTER_TRAIT_RULES['scaly']?.resistances?.injury, undefined);
  assert.equal(IMPORTED_CHARACTER_TRAIT_RULES['berserker']?.resistances?.injury, undefined);
});

// 五项传奇教育只在各自对应领域提供 +5 检定修正
test('legendary education traits only grant +5 in their matching domain', () => {
  const expectedDomains = {
    education_diplomacy_5: 'diplomacy',
    education_martial_5: 'battle',
    education_stewardship_5: 'stewardship',
    education_intrigue_5: 'intrigue',
    education_learning_5: 'learning',
  };
  for (const [traitId, domain] of Object.entries(expectedDomains)) {
    const rule = IMPORTED_CHARACTER_TRAIT_RULES[traitId];
    assert.ok(rule, `${traitId} rule exists`);
    assert.deepEqual(rule.checkModifiers, { [domain]: 5 });
  }
});

// twin 不应获得无条件 duel、battle、intrigue 加成
test('twin does not grant unconditional duel, battle, or intrigue check modifiers', () => {
  const twinRule = IMPORTED_CHARACTER_TRAIT_RULES['twin'];
  assert.ok(twinRule, 'twin rule exists');
  assert.equal(twinRule.checkModifiers?.duel, undefined);
  assert.equal(twinRule.checkModifiers?.battle, undefined);
  assert.equal(twinRule.checkModifiers?.intrigue, undefined);
});

// sickly 不应拥有正 disease resistance
test('sickly does not grant positive disease resistance', () => {
  const sicklyRule = IMPORTED_CHARACTER_TRAIT_RULES['sickly'];
  assert.ok(sicklyRule, 'sickly rule exists');
  const diseaseRes = sicklyRule.resistances?.disease ?? 0;
  assert.ok(diseaseRes <= 0, `sickly disease resistance should be <= 0, got ${diseaseRes}`);
});

// infertile 只保留继承与婚姻方面的 RP 约束，不伪造尚不存在的生育系统
test('infertile remains roleplay-only without unrelated mechanics', () => {
  const infertileRule = IMPORTED_CHARACTER_TRAIT_RULES['infertile'];
  assert.ok(infertileRule, 'infertile rule exists');
  assert.equal(infertileRule.multipliers, undefined);
  assert.equal(infertileRule.checkModifiers, undefined);
  assert.ok((infertileRule.roleplayDirectives?.length ?? 0) > 0);
});

// 所有童年特质的任一骰子修正绝对值不超过 1
test('childhood trait check modifiers do not exceed +/-1 in magnitude', () => {
  for (const traitId of ['rowdy', 'bossy', 'charming', 'pensive', 'curious']) {
    const rule = IMPORTED_CHARACTER_TRAIT_RULES[traitId];
    assert.ok(rule, `${traitId} rule exists`);
    for (const [domain, value] of Object.entries(rule.checkModifiers ?? {})) {
      assert.ok(Math.abs(value) <= 1, `${traitId} modifier for ${domain} (${value}) exceeds 1`);
    }
  }
});

// 所有 96 个新增可见特质都有规则和中文 RP 指令
test('all 96 imported visible traits have explicit rules and Chinese RP directives', () => {
  assert.equal(IMPORTED_CHARACTER_TRAIT_DEFINITIONS.length, 96);
  for (const trait of IMPORTED_CHARACTER_TRAIT_DEFINITIONS) {
    const rule = IMPORTED_CHARACTER_TRAIT_RULES[trait.id];
    assert.ok(rule, `Missing rule for imported trait: ${trait.id}`);
    const directives = rule.roleplayDirectives ?? [];
    assert.ok(directives.length >= 1, `Trait ${trait.id} must have at least one roleplay directive`);
    for (const directive of directives) {
      assert.ok(typeof directive === 'string' && directive.trim().length > 0, `Empty directive in ${trait.id}`);
      assert.ok(/\p{Script=Han}/u.test(directive), `Directive for ${trait.id} must contain Chinese`);
    }
  }
});
