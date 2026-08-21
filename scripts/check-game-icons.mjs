import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const registryPath = join(projectRoot, 'src', 'components', 'GameIcon.tsx');
const registrySource = await readFile(registryPath, 'utf8');
const entries = [...registrySource.matchAll(/^\s*'([^']+)':\s*'\/assets\/game-icons\/([^']+)'/gm)];
const registeredIds = new Set(entries.map((match) => match[1]));
const failures = [];
const traitSource = await readFile(join(projectRoot, 'src', 'data', 'characterTraits.ts'), 'utf8');

if (!entries.length) failures.push('Game icon registry is empty.');

for (const [, id, fileName] of entries) {
  try {
    await access(join(projectRoot, 'public', 'assets', 'game-icons', fileName));
  } catch {
    failures.push(`Missing asset for ${id}: public/assets/game-icons/${fileName}`);
  }
}

const traitIconIds = new Set([...traitSource.matchAll(/icon:\s*'(trait-[^']+)'/g)].map((match) => match[1]));
for (const iconId of traitIconIds) {
  try {
    await access(join(projectRoot, 'public', 'assets', 'game-icons', `${iconId}.webp`));
  } catch {
    failures.push(`Missing CK3 trait asset: public/assets/game-icons/${iconId}.webp`);
  }
}

for (const relativePath of ['src/data/entities.ts', 'src/data/houses.ts', 'content/world/playable-characters.json']) {
  const source = await readFile(join(projectRoot, relativePath), 'utf8');
  for (const match of source.matchAll(/(?:icon|sigil|avatarIcon|houseSigil):\s*'([^']+)'/g)) {
    if (!registeredIds.has(match[1])) failures.push(`Unknown game icon ID in ${relativePath}: ${match[1]}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

const uniqueIconCount = new Set([...registeredIds, ...traitIconIds]).size;
console.log(`Validated ${uniqueIconCount} unique game icon assets, including ${traitIconIds.size} CK3 trait icons.`);
