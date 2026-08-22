import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/features/items/npcLoadoutContent.ts'],
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { createNpcLoadoutContentLoader } = await import(url);

const fixture = new Map([
  ['/data/world/manifest.json', JSON.parse(await readFile('public/data/world/manifest.json', 'utf8'))],
  ['/data/world/loadouts.json', JSON.parse(await readFile('public/data/world/loadouts.json', 'utf8'))],
]);
const loadNpcLoadoutContent = createNpcLoadoutContentLoader(async (path) => {
  const value = fixture.get(path);
  if (value === undefined) throw new Error(`fixture 缺少 ${path}`);
  return value;
});

test('迁移后模板和覆盖保持稳定 ID 与槽位', async () => {
  const content = await loadNpcLoadoutContent();
  assert.equal(content.templates.get('northern_noble')?.ageGroup, 'adult');
  assert.equal(content.overrides.get('agot:Stark_3')?.templateId, 'northern_noble');
  assert.equal(content.overrides.get('agot:Stark_3')?.id, 'eddard_stark_daily');
  assert.ok(content.templates.get('northern_noble')?.slots.some((slot) => slot.position.group === 'torso' && slot.position.layer === 'garment'));
});

const validTemplate = {
  id: 'test_template',
  name: '测试模板',
  ageGroup: 'adult',
  slots: [{ id: 'garment', definitionId: 'clothing.common_linen_tunic', position: { group: 'torso', layer: 'garment' } }],
};
const validOverride = {
  characterId: 'agot:Stark_3',
  id: 'test_override',
  templateId: 'northern_noble',
};

test('编译器拒绝未知模板、未知人物和未知物品', async () => {
  const { compileWorldContent } = await import('./world-content/compiler.mjs');
  const { mkdir, mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  async function writeJson(path, value) {
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
  const rootDir = await mkdtemp(join(tmpdir(), 'agot-world-loadouts-'));
  const contentDir = join(rootDir, 'content', 'world');
  const outputDir = join(rootDir, 'public', 'data', 'world');
  await writeJson(join(contentDir, 'manifest.json'), {
    schemaVersion: 1, worldId: 'agot-298', startDate: { year: 298, month: 5, day: 10 },
    characterDataset: 'agot-characters', mapDataset: 'agot-map', artifactDataset: 'agot-artifacts',
  });
  await writeJson(join(contentDir, 'playable-characters.json'), []);
  await writeJson(join(contentDir, 'start-state', 'characters.json'), []);
  await writeJson(join(contentDir, 'start-state', 'titles.json'), []);
  await writeJson(join(contentDir, 'start-state', 'assets.json'), { schemaVersion: 1, instances: [], sites: [], vehicles: [] });
  await writeJson(join(contentDir, 'locations', 'gameplay-locations.json'), {
    schemaVersion: 1, include: [], exclude: [],
    rules: { minimumImportance: 45, types: ['castle'], includePoliticalCenters: true, includeStartReferences: true, includeEventReferences: true, includeMajorRoutePorts: true },
  });
  for (const name of ['cultures', 'faiths', 'relationships']) {
    await writeJson(join(contentDir, 'terminology', `${name}.json`), { schemaVersion: 1, labels: {} });
  }
  await writeJson(join(contentDir, 'items', 'ordinary-items.json'), {
    schemaVersion: 1,
    items: [{
      id: 'clothing.common_linen_tunic',
      name: '亚麻短衣',
      description: '测试用短衣。',
      roleplayText: '一件只用于编译校验的短衣。',
      category: 'clothing',
      subcategory: 'tunic',
      tags: [],
      image: { type: 'game', icon: 'tunic' },
      material: '亚麻',
      baseQuality: 'common',
      rarity: 'common',
      bulk: 'small',
      stackable: false,
      maxStack: 1,
      unique: false,
      equippable: true,
      allowedPositions: [{ group: 'torso', layer: 'garment' }],
      baseValue: 1,
      effects: [],
    }],
  });
  await writeJson(join(contentDir, 'items', 'loadout-templates.json'), { schemaVersion: 1, templates: [validTemplate] });
  await writeJson(join(rootDir, 'public', 'data', 'agot-characters', 'manifest.json'), {
    schemaVersion: 2, datasetHash: 'characters-hash', source: { sourceId: '2962333032' }, shards: [],
  });
  await writeJson(join(rootDir, 'public', 'data', 'agot-characters', 'search-index.json'), [{ id: 'agot:Stark_3', shard: '00' }]);
  await writeJson(join(rootDir, 'public', 'data', 'agot-characters', 'holder-summaries.json'), { schemaVersion: 1, holders: [] });
  await writeJson(join(rootDir, 'public', 'data', 'agot-map', 'manifest.json'), {
    schemaVersion: 4, datasetHash: 'map-hash', paths: { searchIndex: '/data/agot-map/location-search-index.json' },
  });
  await writeJson(join(rootDir, 'public', 'data', 'agot-map', 'location-search-index.json'), []);
  await writeJson(join(rootDir, 'public', 'data', 'agot-map', 'semantic', 'membership.json'), []);
  await mkdir(join(rootDir, 'public', 'data', 'agot-map', 'routes'), { recursive: true });
  await writeJson(join(rootDir, 'public', 'data', 'items', 'agot-artifact-world-state.json'), {
    schemaVersion: 1, artifactDatasetHash: 'artifacts-hash', characterDatasetHash: 'characters-hash', datasetHash: 'artifact-world-hash', artifacts: {},
  });

  const overridesPath = join(contentDir, 'items', 'loadout-overrides.json');
  await writeJson(overridesPath, { schemaVersion: 1, overrides: [{ ...validOverride, templateId: 'missing' }] });
  await assert.rejects(compileWorldContent({ rootDir, contentDir, outputDir }), /模板不存在/);
  await writeJson(overridesPath, { schemaVersion: 1, overrides: [{ ...validOverride, characterId: 'agot:missing', templateId: 'test_template' }] });
  await assert.rejects(compileWorldContent({ rootDir, contentDir, outputDir }), /人物不存在/);
  await writeJson(overridesPath, { schemaVersion: 1, overrides: [{ ...validOverride, templateId: 'test_template', slots: [{ id: 'garment', definitionId: 'item.missing', position: { group: 'torso', layer: 'garment' } }] }] });
  await assert.rejects(compileWorldContent({ rootDir, contentDir, outputDir }), /物品不存在/);
});
