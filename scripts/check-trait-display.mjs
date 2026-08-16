import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');
const [sheet, traits, presets, creator, db, types] = await Promise.all([
  read('src/components/CharacterSheet.tsx'),
  read('src/data/characterTraits.ts'),
  read('src/data/presets.ts'),
  read('src/components/CharacterCreator.tsx'),
  read('src/services/db.ts'),
  read('src/types/game.ts'),
]);
const failures = [];
const requireMarker = (source, marker, message) => { if (!source.includes(marker)) failures.push(message); };
requireMarker(sheet, 'data-character-traits', 'The in-game character sheet has no trait panel.');
requireMarker(sheet, '<GameIcon icon={trait.icon}', 'The in-game trait panel does not use game trait icons.');
requireMarker(sheet, 'formatTraitRuleEffects(activeTrait.rules)', 'Trait rule effects are not inspectable in game.');
requireMarker(traits, 'function resolveCharacterTraits', 'Legacy and catalog traits are not resolved for display.');
requireMarker(traits, 'isLegacy: true', 'Legacy save traits have no display fallback.');
for (const presetId of ['ned_stark', 'jon_snow', 'daenerys_targaryen']) {
  requireMarker(presets, `id: '${presetId}'`, `Missing preset: ${presetId}`);
}
if ((presets.match(/traitIds:/g) || []).length < 3) failures.push('Not every preset has formal trait IDs.');
requireMarker(traits, 'function orderCharacterTraitsForDisplay', 'Education traits do not have a stable first-position ordering helper.');
requireMarker(traits, 'function migrateLordTraitData', 'Legacy saves do not migrate trait IDs and attribute bonuses safely.');
requireMarker(presets, 'attributes: calculateFinalAttributes(baseAttributes', 'Preset trait attribute modifiers are not included in final attributes.');
requireMarker(creator, 'orderCharacterTraitsForDisplay(CHARACTER_TRAITS.filter', 'The ruler designer does not keep education traits first.');
requireMarker(creator, 'baseAttributes: { ...customAttributes }', 'Custom rulers do not retain unmodified base attributes.');
requireMarker(db, 'migrateLordTraitData(ensureItemCustody', 'Imported saves do not migrate legacy trait data.');
requireMarker(types, 'baseAttributes?: LordAttributes', 'Lord profiles cannot distinguish base and final attributes.');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('In-game trait display and preset trait IDs are connected.');
