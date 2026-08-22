import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';
import { stableJson } from './hash.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

const bundle = await build({
  stdin: {
    contents: [
      "export { NPC_LOADOUT_TEMPLATES } from './src/data/npcLoadoutTemplates.ts';",
      "export { NPC_LOADOUT_OVERRIDES } from './src/data/npcLoadoutOverrides.ts';",
    ].join('\n'),
    resolveDir: root,
    sourcefile: 'migrate-npc-loadouts-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { NPC_LOADOUT_TEMPLATES, NPC_LOADOUT_OVERRIDES } = await import(moduleUrl);

if (!NPC_LOADOUT_TEMPLATES || Object.keys(NPC_LOADOUT_TEMPLATES).length === 0) {
  console.error('npcLoadoutTemplates.ts 已空或不存在；迁移已完成，无需再次执行。');
  process.exitCode = 1;
  process.exit();
}

const templates = Object.values(NPC_LOADOUT_TEMPLATES)
  .map((template) => structuredClone(template))
  .sort((left, right) => left.id.localeCompare(right.id));
const overrides = Object.entries(NPC_LOADOUT_OVERRIDES)
  .map(([characterId, override]) => ({ characterId, ...structuredClone(override) }))
  .sort((left, right) => left.characterId.localeCompare(right.characterId) || left.id.localeCompare(right.id));

const outputDir = join(root, 'content', 'world', 'items');
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, 'loadout-templates.json'), stableJson({ schemaVersion: 1, templates }), 'utf8');
await writeFile(join(outputDir, 'loadout-overrides.json'), stableJson({ schemaVersion: 1, overrides }), 'utf8');
console.log(`已迁移 ${templates.length} 个装备模板、${overrides.length} 条人物覆盖。`);
