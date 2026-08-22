import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');
const [types, traitsSrc, creator, diceModal, storyFeed, dice, reducer, prompt, store, rulesSrc, importedRulesSrc] = await Promise.all([
  read('src/types/game.ts'),
  read('src/data/characterTraits.ts'),
  read('src/components/CharacterCreator.tsx'),
  read('src/components/DiceModal.tsx'),
  read('src/components/StoryFeed.tsx'),
  read('src/services/diceEngine.ts'),
  read('src/services/stateReducer.ts'),
  read('src/services/promptBuilder.ts'),
  read('src/store/useGameStore.ts'),
  read('src/data/characterTraitEffects.ts').catch(() => ''),
  read('src/data/importedCharacterTraitEffects.ts').catch(() => ''),
]);

const failures = [];
const requireMarker = (source, marker, message) => { if (!source.includes(marker)) failures.push(message); };
requireMarker(types, 'traitIds?: string[]', 'LordProfile does not persist trait IDs.');
requireMarker(types, 'traitModifier: number', 'D20Check does not record trait modifiers.');
requireMarker(traitsSrc, 'aggregateSelectedTraitEffects', 'Trait catalog cannot aggregate selected effects.');
requireMarker(rulesSrc, 'CHARACTER_TRAIT_RULES', 'Trait rule data is missing.');
requireMarker(creator, 'formatTraitRuleEffects', 'Creator does not display non-attribute trait effects.');
requireMarker(diceModal, 'traitModifierBreakdown', 'Dice modal does not display the trait modifier breakdown.');
requireMarker(storyFeed, 'traitModifierBreakdown', 'Story feed does not preserve the trait modifier breakdown.');
requireMarker(dice, 'traitModifier', 'D20 engine does not apply trait modifiers.');
requireMarker(reducer, 'applyPositiveMultiplier', 'State reducer does not apply trait resource multipliers.');
requireMarker(reducer, 'didTraitResistanceTrigger', 'State reducer does not apply trait resistances.');
requireMarker(prompt, '叙事模式', 'D20-off narrative trait guidance is missing.');
requireMarker(prompt, '禁止重新计算', 'Prompt does not forbid AI from recalculating resolved effects.');
requireMarker(store, 'gameState.lord.traitIds', 'Store does not pass trait IDs into D20 resolution.');

const bundle = await build({
  stdin: {
    contents: `
      export { CHARACTER_TRAITS } from './src/data/characterTraits.ts';
      export { IMPORTED_CHARACTER_TRAIT_DEFINITIONS } from './src/data/importedCharacterTraitDefinitions.ts';
      export { CHARACTER_TRAIT_RULES } from './src/data/characterTraitEffects.ts';
      export { IMPORTED_CHARACTER_TRAIT_RULES } from './src/data/importedCharacterTraitEffects.ts';
    `,
    resolveDir: process.cwd(),
    sourcefile: 'trait-audit.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  CHARACTER_TRAITS,
  IMPORTED_CHARACTER_TRAIT_DEFINITIONS,
  CHARACTER_TRAIT_RULES,
  IMPORTED_CHARACTER_TRAIT_RULES,
} = await import(moduleUrl);

const ALLOWED_CHECK_DOMAINS = new Set([
  'duel',
  'battle',
  'intrigue',
  'stewardship',
  'diplomacy',
  'learning',
  'medicine',
  'survival',
  'intimidation',
  'seduction',
  'resistFear',
]);

const ALLOWED_MULTIPLIER_TARGETS = new Set([
  'goldGain',
]);

const ALLOWED_RESISTANCE_TARGETS = new Set([
  'injury',
  'disease',
  'poison',
  'bleeding',
]);

const ALLOWED_RULE_KEYS = new Set([
  'multipliers',
  'resistances',
  'checkModifiers',
  'roleplayDirectives',
]);

const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const containsChinese = (text) => /\p{Script=Han}/u.test(text);
const findDuplicates = (values) => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
const readRuleLiteralIds = (source, variableName, fileName) => {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let objectLiteral;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === variableName
      && node.initializer
      && ts.isObjectLiteralExpression(node.initializer)
    ) {
      objectLiteral = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!objectLiteral) {
    failures.push(`Cannot locate ${variableName} object literal in ${fileName}.`);
    return [];
  }
  return objectLiteral.properties.flatMap((property) => {
    if (!ts.isPropertyAssignment(property)) return [];
    const name = property.name;
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return [name.text];
    failures.push(`Unsupported computed rule key in ${fileName}: ${name.getText(sourceFile)}`);
    return [];
  });
};

const catalogTraitIdList = CHARACTER_TRAITS.map((trait) => trait.id);
const importedTraitIdList = IMPORTED_CHARACTER_TRAIT_DEFINITIONS.map((trait) => trait.id);
const allCatalogTraitIds = new Set(catalogTraitIdList);
const importedTraitIds = new Set(importedTraitIdList);
const baseRuleLiteralIds = readRuleLiteralIds(rulesSrc, 'CHARACTER_TRAIT_RULES', 'src/data/characterTraitEffects.ts');
const importedRuleLiteralIds = readRuleLiteralIds(importedRulesSrc, 'IMPORTED_CHARACTER_TRAIT_RULES', 'src/data/importedCharacterTraitEffects.ts');

for (const id of findDuplicates(catalogTraitIdList)) failures.push(`Duplicate visible trait ID: ${id}`);
for (const id of findDuplicates(importedTraitIdList)) failures.push(`Duplicate imported trait definition ID: ${id}`);
for (const id of findDuplicates(baseRuleLiteralIds)) failures.push(`Duplicate base trait rule ID in source: ${id}`);
for (const id of findDuplicates(importedRuleLiteralIds)) failures.push(`Duplicate imported trait rule ID in source: ${id}`);
const importedRuleIdSet = new Set(importedRuleLiteralIds);
for (const id of baseRuleLiteralIds) {
  if (importedRuleIdSet.has(id)) failures.push(`Trait rule ID is declared in both base and imported rule tables: ${id}`);
}

// 1. 每个正式可见特质都有显式规则
for (const traitId of allCatalogTraitIds) {
  if (!CHARACTER_TRAIT_RULES[traitId]) {
    failures.push(`Visible trait ${traitId} is missing an explicit TraitRuleSet in CHARACTER_TRAIT_RULES.`);
  }
}
for (const traitId of importedTraitIds) {
  if (!IMPORTED_CHARACTER_TRAIT_RULES[traitId]) {
    failures.push(`Imported trait ${traitId} is missing an explicit TraitRuleSet in IMPORTED_CHARACTER_TRAIT_RULES.`);
  }
}

// 2. 不存在未知规则 ID
for (const ruleId of Object.keys(CHARACTER_TRAIT_RULES)) {
  if (!allCatalogTraitIds.has(ruleId)) {
    failures.push(`Unknown rule ID in CHARACTER_TRAIT_RULES: ${ruleId}`);
  }
}
for (const ruleId of Object.keys(IMPORTED_CHARACTER_TRAIT_RULES)) {
  if (!importedTraitIds.has(ruleId)) {
    failures.push(`Unknown rule ID in IMPORTED_CHARACTER_TRAIT_RULES: ${ruleId}`);
  }
}

// 3. 每个新增特质至少有一条非空中文 RP 指令
for (const trait of IMPORTED_CHARACTER_TRAIT_DEFINITIONS) {
  const rule = IMPORTED_CHARACTER_TRAIT_RULES[trait.id];
  const directives = rule?.roleplayDirectives ?? [];
  if (!directives.length) {
    failures.push(`Imported trait ${trait.id} has no roleplayDirectives.`);
  } else {
    for (const directive of directives) {
      if (typeof directive !== 'string' || !directive.trim()) {
        failures.push(`Imported trait ${trait.id} contains an empty roleplay directive.`);
      } else if (!containsChinese(directive)) {
        failures.push(`Imported trait ${trait.id} roleplay directive lacks Chinese text: "${directive}".`);
      }
    }
  }
}

// 4-9. 严格数值与合法性检查（针对新增导入特质规则）
for (const [id, rule] of Object.entries(IMPORTED_CHARACTER_TRAIT_RULES)) {
  for (const key of Object.keys(rule)) {
    if (!ALLOWED_RULE_KEYS.has(key)) failures.push(`Imported trait ${id} uses unsupported rule field: ${key}`);
  }
  if (rule.checkModifiers) {
    for (const [domain, value] of Object.entries(rule.checkModifiers)) {
      if (!ALLOWED_CHECK_DOMAINS.has(domain)) {
        failures.push(`Imported trait ${id} uses invalid check domain: ${domain}`);
      }
      if (typeof value !== 'number' || !Number.isInteger(value) || value < -5 || value > 5) {
        failures.push(`Imported trait ${id} checkModifier for ${domain} must be an integer between -5 and 5, got ${value}`);
      }
    }
  }
  if (rule.multipliers) {
    for (const [target, value] of Object.entries(rule.multipliers)) {
      if (!ALLOWED_MULTIPLIER_TARGETS.has(target)) {
        failures.push(`Imported trait ${id} uses invalid multiplier target: ${target}`);
      }
      if (typeof value !== 'number' || !Number.isFinite(value) || value < -0.30 || value > 0.30) {
        failures.push(`Imported trait ${id} multiplier for ${target} must be a finite number between -0.30 and 0.30, got ${value}`);
      }
    }
  }
  if (rule.resistances) {
    for (const [target, value] of Object.entries(rule.resistances)) {
      if (!ALLOWED_RESISTANCE_TARGETS.has(target)) {
        failures.push(`Imported trait ${id} uses invalid resistance target: ${target}`);
      }
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 0.25) {
        failures.push(`Imported trait ${id} resistance for ${target} must be a finite number between 0 and 0.25, got ${value}`);
      }
    }
  }
}

// 全量规则的通用健全性与无 Emoji 检查
for (const [id, rule] of Object.entries(CHARACTER_TRAIT_RULES)) {
  for (const key of Object.keys(rule)) {
    if (!ALLOWED_RULE_KEYS.has(key)) failures.push(`Trait ${id} uses unsupported rule field: ${key}`);
  }
  if (rule.checkModifiers) {
    for (const [domain, value] of Object.entries(rule.checkModifiers)) {
      if (!ALLOWED_CHECK_DOMAINS.has(domain)) {
        failures.push(`Trait ${id} uses invalid check domain: ${domain}`);
      }
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        failures.push(`Trait ${id} checkModifier for ${domain} must be an integer: ${value}`);
      }
    }
  }
  if (rule.multipliers) {
    for (const [target, value] of Object.entries(rule.multipliers)) {
      if (!ALLOWED_MULTIPLIER_TARGETS.has(target)) {
        failures.push(`Trait ${id} uses invalid multiplier target: ${target}`);
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        failures.push(`Trait ${id} multiplier for ${target} is not a finite number: ${value}`);
      }
    }
  }
  if (rule.resistances) {
    for (const [target, value] of Object.entries(rule.resistances)) {
      if (!ALLOWED_RESISTANCE_TARGETS.has(target)) {
        failures.push(`Trait ${id} uses invalid resistance target: ${target}`);
      }
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        failures.push(`Trait ${id} resistance for ${target} must be non-negative: ${value}`);
      }
    }
  }
  if (rule.roleplayDirectives) {
    for (const directive of rule.roleplayDirectives) {
      if (typeof directive !== 'string' || !directive.trim()) {
        failures.push(`Trait ${id} has empty roleplay directive`);
      } else if (emojiRegex.test(directive)) {
        failures.push(`Trait ${id} directive contains emoji: ${directive}`);
      }
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Trait effect engine verified: all ${allCatalogTraitIds.size} visible traits have explicit rules (${importedTraitIds.size} imported traits audited).`);
