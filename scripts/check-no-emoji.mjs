import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const targets = [join(projectRoot, 'src'), join(projectRoot, 'public'), join(projectRoot, 'index.html')];
const emojiPattern = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0E\uFE0F\u200D\u20E3]/gu;
const sourceExtensions = new Set(['.ts', '.tsx', '.css', '.html', '.json', '.md']);
const failures = [];

async function scanFile(path) {
  if (!sourceExtensions.has(extname(path))) return;
  const text = await readFile(path, 'utf8');
  text.split(/\r?\n/).forEach((line, index) => {
    const matches = [...line.matchAll(emojiPattern)];
    if (matches.length) {
      failures.push(`${relative(projectRoot, path)}:${index + 1}: ${matches.map((match) => match[0]).join(' ')}`);
    }
  });
}

async function scan(path) {
  const details = await stat(path);
  if (details.isFile()) {
    await scanFile(path);
    return;
  }

  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) await scan(child);
    else await scanFile(child);
  }
}

for (const target of targets) await scan(target);

if (failures.length) {
  console.error(`Found emoji in first-party files (${failures.length} lines):`);
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('No emoji found in first-party source or public metadata.');
