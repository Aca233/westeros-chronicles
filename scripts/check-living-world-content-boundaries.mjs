import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const ROOT = resolve('.');
const SRC = resolve('src');

function normalized(file) {
  return relative(ROOT, file).replaceAll('\\', '/');
}

function walk(directory, files = []) {
  for (const name of readdirSync(directory)) {
    const path = resolve(directory, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (/\.(?:ts|tsx|mjs|js)$/.test(name)) files.push(path);
  }
  return files;
}

const failures = [];
function report(file, rule, detail) {
  failures.push(`${typeof file === 'string' ? file : normalized(file)}: ${rule}: ${detail}`);
}

const forbidden = [
  ['src/data/presets.ts', /./],
  ['src/features/world/characterWorldFacts.ts', /OPENING_CHARACTER_LOCATIONS|OPENING_SNAPSHOT_DATE/],
  ['src/features/characters/characterDossier.ts', /CULTURE_LABELS|FAITH_LABELS|characterDossierSupplements/],
  ['src/data/itemDefinitions.ts', /id:\s*['"]clothing\.|id:\s*['"]weapon\./],
];

for (const [relativePath, pattern] of forbidden) {
  const path = resolve(ROOT, relativePath);
  if (!existsSync(path)) continue;
  const text = readFileSync(path, 'utf8');
  if (pattern.test(text)) {
    report(relativePath, '禁止的世界内容硬编码', pattern.source);
  }
}

const deletedTables = [
  'src/data/presets.ts',
  'src/data/itemPresetState.ts',
  'src/data/npcLoadoutTemplates.ts',
  'src/data/npcLoadoutOverrides.ts',
  'src/data/generated/characterDossierSupplements.ts',
];
for (const relativePath of deletedTables) {
  if (existsSync(resolve(ROOT, relativePath))) {
    report(relativePath, '已迁出的内容表不得回到运行时代码', 'file exists');
  }
}

const srcFiles = walk(SRC);
for (const file of srcFiles) {
  const text = readFileSync(file, 'utf8');
  if (/PRESET_SCENARIOS/.test(text)) {
    report(file, '禁止的世界内容硬编码', 'PRESET_SCENARIOS');
  }
}

if (failures.length) {
  console.error('活世界内容边界检查失败：');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`活世界内容边界检查通过：检查 ${srcFiles.length} 个运行时源文件。`);
