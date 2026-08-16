import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');
const [types, traits, creator, diceModal, storyFeed, dice, reducer, prompt, store, rules] = await Promise.all([
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
]);

const failures = [];
const requireMarker = (source, marker, message) => { if (!source.includes(marker)) failures.push(message); };
requireMarker(types, 'traitIds?: string[]', 'LordProfile does not persist trait IDs.');
requireMarker(types, 'traitModifier: number', 'D20Check does not record trait modifiers.');
requireMarker(traits, 'aggregateSelectedTraitEffects', 'Trait catalog cannot aggregate selected effects.');
requireMarker(rules, 'CHARACTER_TRAIT_RULES', 'Trait rule data is missing.');
requireMarker(creator, 'formatTraitRuleEffects', 'Creator does not display non-attribute trait effects.');
requireMarker(diceModal, 'traitModifierBreakdown', 'Dice modal does not display the trait modifier breakdown.');
requireMarker(storyFeed, 'traitModifierBreakdown', 'Story feed does not preserve the trait modifier breakdown.');
requireMarker(dice, 'traitModifier', 'D20 engine does not apply trait modifiers.');
requireMarker(reducer, 'applyPositiveMultiplier', 'State reducer does not apply trait resource multipliers.');
requireMarker(reducer, 'didTraitResistanceTrigger', 'State reducer does not apply trait resistances.');
requireMarker(prompt, '叙事模式', 'D20-off narrative trait guidance is missing.');
requireMarker(prompt, '禁止重新计算', 'Prompt does not forbid AI from recalculating resolved effects.');
requireMarker(store, 'gameState.lord.traitIds', 'Store does not pass trait IDs into D20 resolution.');

const traitCatalogBlock = traits.match(/const CHARACTER_TRAIT_DEFINITIONS:[\s\S]*?= \[([\s\S]*?)\n\];\n\nexport const CHARACTER_TRAITS/)?.[1] ?? '';
const traitIds = [...traitCatalogBlock.matchAll(/\{ id: '([^']+)'/g)].map((match) => match[1]);
const configuredRuleIds = new Set([...rules.matchAll(/^  ([a-zA-Z0-9_]+): r\(/gm)].map((match) => match[1]));
const missingRuleIds = traitIds.filter((id) => !configuredRuleIds.has(id));
if (missingRuleIds.length) failures.push(`Traits without explicit gameplay rules: ${missingRuleIds.join(', ')}`);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Trait effect engine is connected to rules, checks, state, UI, and RP prompts.');
