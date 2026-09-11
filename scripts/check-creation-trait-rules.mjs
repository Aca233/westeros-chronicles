import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const compiled = await build({ stdin: { contents: `
  export * from './src/features/characters/creationTraitRules.ts';
  export * from './src/features/characters/customCharacterStart.ts';
  export { CHARACTER_TRAITS, calculateFinalAttributes } from './src/data/characterTraits.ts';
`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false });
const rules = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const trait = (id) => rules.CHARACTER_TRAITS.find((entry) => entry.id === id);
const baseline = rules.createDefaultCharacterCreationDraft();
const located = { ...baseline, location: { locationId: 'b_winterfell', name: '临冬城' } };
const emptyStats = { diplomacy: 8, martial: 8, stewardship: 8, intrigue: 8, learning: 8, prowess: 8 };

assert.equal(rules.creationBudget(emptyStats, ['ambitious', 'craven', 'honest']).total, 0, 'Personality is free, including negative-price traits');
assert.deepEqual([8, 12, 16, 20, 30].map(rules.creationAttributeCost), [0, 20, 60, 140, 440]);
assert.equal(rules.creationBudget({ ...emptyStats, prowess: 0 }, []).total, 0, 'Lowering a stat cannot mint points');
assert.ok(rules.creationBudget(emptyStats, rules.CHARACTER_TRAITS.filter((entry) => entry.cost < 0).map((entry) => entry.id)).refund <= 100);
assert.equal(rules.creationBudget(emptyStats, ['scurvy', 'crippled']).refund, 40, 'Overlapping ungrouped health penalties only refund the largest');
assert.equal(rules.creationTraitPrice(trait('kinslayer_3')), 0, 'Reputation cannot buy abilities');
assert.equal(rules.creationBudget(emptyStats, ['education_learning_2', 'education_learning_2']).skills, 20, 'Duplicate IDs cannot double-charge');
assert.ok(!baseline.traitIds.some((id) => trait(id).category === 'personality'), 'Background must not choose personality');

const chosen = { ...located, traitIds: ['honest', 'ambitious', 'brave', 'education_learning_2'], educationMode: 'manual', backgroundTraitIds: [] };
const full = rules.previewCreationTrait(chosen, 'patient');
assert.match(full.blocked, /已满/);
const replace = rules.previewCreationTrait(chosen, 'craven');
assert.equal(replace.blocked, undefined);
assert.deepEqual(replace.replaces, ['brave']);
assert.ok(replace.traitIds.includes('honest') && !replace.traitIds.includes('brave'));
const rebased = rules.rebaseDraftForBackground(chosen, { ...chosen, experience: 'martial_training' }).draft;
assert.deepEqual(new Set(rebased.traitIds), new Set(chosen.traitIds), 'Changing history preserves manually chosen education and personality');
const auto = rules.rebaseDraftForBackground(located, { ...located, experience: 'martial_training' }).draft;
assert.deepEqual(auto.traitIds, ['education_martial_2']);

const bounded = { ...located, attributes: { ...located.attributes, prowess: 30 }, attributeAdjustments: { prowess: 40 } };
const clamped = rules.rebaseDraftForBackground(bounded, { ...bounded, experience: 'martial_training' }).draft;
assert.equal(clamped.attributes.prowess, 30);
assert.equal(clamped.attributeAdjustments.prowess, 40, 'Clamping must preserve manual intent');

assert.match(rules.previewCreationTrait(located, 'dragonrider').blocked, /巨龙/);
assert.ok(rules.validateCharacterCreationDraft({ ...located, traitIds: ['dragonrider'], freeMode: true }).errors.some((entry) => entry.includes('巨龙')));
assert.ok(rules.validateCharacterCreationDraft({ ...located, traitIds: ['bastard'] }).errors.some((entry) => entry.includes('血缘')));
const reputed = { ...located, traitIds: ['murderer'], traitBackgrounds: { murderer: '曾在一场村庄冲突中杀死邻居，这件事已经公开。' } };
assert.equal(rules.validateCharacterCreationDraft(reputed).valid, true);
assert.ok(rules.resolveCharacterCreationDraft(reputed, 'run_test_traits').openingFacts.publicFacts.some((fact) => fact.includes('村庄冲突')));

const learner = { ...located, learningTraitIds: ['scholar'] };
assert.equal(rules.validateCharacterCreationDraft(learner).valid, true);
assert.equal(rules.validateCharacterCreationDraft(learner).usedDesignPoints, rules.validateCharacterCreationDraft(located).usedDesignPoints);
const resolved = rules.resolveCharacterCreationDraft(learner, 'run_test_learner');
assert.ok(!resolved.traitIds.includes('scholar'));
assert.deepEqual(resolved.attributes, rules.calculateFinalAttributes(located.attributes, located.traitIds));
assert.ok(resolved.openingFacts.backgroundFacts.some((fact) => fact.includes('尚未掌握')));
assert.equal(rules.validateCharacterCreationDraft({ ...located, learningTraitIds: ['brave'] }).valid, false);
assert.equal(rules.validateCharacterCreationDraft({ ...located, learningTraitIds: [located.traitIds[0]] }).valid, false);

const overBudget = { ...located, attributes: { diplomacy: 30, martial: 30, stewardship: 30, intrigue: 30, learning: 30, prowess: 30 } };
assert.equal(rules.validateCharacterCreationDraft(overBudget).valid, false);
assert.equal(rules.validateCharacterCreationDraft({ ...overBudget, freeMode: true }).valid, true);
assert.equal(rules.validateCharacterCreationDraft({ ...overBudget, traitIds: ['brave', 'craven'], freeMode: true }).valid, false);
console.log('Creation trait rules: budget, ownership, conflicts, identity facts, learning and resolution passed.');
