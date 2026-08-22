import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/features/world-content/terminology.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { formatWorldCulture, formatWorldFaith, formatWorldRelationship } = await import(moduleUrl);

const terminology = JSON.parse(await readFile('public/data/world/terminology.json', 'utf8'));
const terms = { cultures: terminology.cultures, faiths: terminology.faiths, relationships: terminology.relationships };

test('共享术语解析已知值并安全回退未知值', () => {
  assert.equal(formatWorldCulture('northman', terms), '北境人');
  assert.equal(formatWorldCulture('ironborn', terms), '铁种');
  assert.equal(formatWorldFaith('old_gods_wnw', terms), '森林旧神');
  assert.equal(formatWorldFaith('fots_seven', terms), '七神信仰');
  assert.equal(formatWorldRelationship('friend', terms), '朋友');
  assert.equal(formatWorldRelationship('lover', terms), '恋人');
  assert.equal(formatWorldCulture('custom_culture', terms), 'custom culture');
  assert.equal(formatWorldFaith('custom_faith', terms), 'custom faith');
  assert.equal(formatWorldRelationship('blood_brother', terms), 'blood brother');
  assert.equal(formatWorldCulture(null, terms), '文化未记录');
  assert.equal(formatWorldFaith(undefined, terms), '信仰未记录');
  assert.equal(formatWorldRelationship('', terms), '关系未记录');
});

async function readWorldContentText() {
  const chunks = [await readFile('content/world/terminology/cultures.json', 'utf8')];
  const charactersDir = 'content/world/characters';
  for (const name of (await readdir(charactersDir)).filter((entry) => entry.endsWith('.json'))) {
    chunks.push(await readFile(`${charactersDir}/${name}`, 'utf8'));
  }
  return chunks.join('\n');
}

test('人物内容和术语源不包含固定界面标签', async () => {
  const source = await readWorldContentText();
  for (const label of ['关系与家族', '健康与装备', '点击查看']) {
    assert.doesNotMatch(source, new RegExp(label), `内容源不得包含界面标签：${label}`);
  }
});
