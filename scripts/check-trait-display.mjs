import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFile(join(root, path), 'utf8');
const [sheet, traitOverlay, traits, creator, customStart, db, types] = await Promise.all([
  read('src/components/character-window/CharacterOverview.tsx'),
  read('src/components/character-window/CharacterTraitOverlay.tsx'),
  read('src/data/characterTraits.ts'),
  read('src/components/CharacterCreator.tsx'),
  read('src/features/characters/customCharacterStart.ts'),
  read('src/services/db.ts'),
  read('src/types/game.ts'),
]);
const failures = [];
const requireMarker = (source, marker, message) => { if (!source.includes(marker)) failures.push(message); };
requireMarker(sheet, 'data-character-traits', 'The in-game character sheet has no trait panel.');
requireMarker(sheet, '<GameIcon icon={trait.icon}', 'The in-game trait panel does not use game trait icons.');
requireMarker(traitOverlay, 'formatTraitRuleEffects(trait.rules)', 'Trait rule effects are not inspectable in game.');
requireMarker(traits, 'function resolveCharacterTraits', 'Legacy and catalog traits are not resolved for display.');
requireMarker(traits, 'isLegacy: true', 'Legacy save traits have no display fallback.');
requireMarker(traits, 'function orderCharacterTraitsForDisplay', 'Education traits do not have a stable first-position ordering helper.');
requireMarker(traits, 'function migrateLordTraitData', 'Legacy saves do not migrate trait IDs and attribute bonuses safely.');
requireMarker(traits, 'calculateFinalAttributes', 'Trait attribute modifiers are not available to character projection.');
requireMarker(creator, 'orderCharacterTraitsForDisplay(CHARACTER_TRAITS.filter', 'The ruler designer does not keep education traits first.');
requireMarker(customStart, 'baseAttributes,', 'Custom rulers do not retain unmodified base attributes.');
requireMarker(db, 'assertSupportedSnapshot', 'Save loading does not reject unsupported test saves explicitly.');
requireMarker(types, 'baseAttributes?: LordAttributes', 'Lord profiles cannot distinguish base and final attributes.');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('In-game trait display and living-world trait IDs are connected.');
