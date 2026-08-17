import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

async function bundleModule(entryPoint) {
  const bundle = await build({ entryPoints: [entryPoint], bundle: true, write: false, format: 'esm', platform: 'node' });
  const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
  return import(url);
}

const { characterAgeAtYear, characterDatasetYear, createNpcDossier, createPlayerDossier, dynastySlug } = await bundleModule('src/features/characters/characterDossier.ts');
const { resolveCharacter } = await bundleModule('src/features/characters/characterProjector.ts');
const { migrateLordIdentityData } = await bundleModule('src/data/characterTraits.ts');
const { PRESET_SCENARIOS } = await bundleModule('src/data/presets.ts');

const attributes = { diplomacy: 11, martial: 12, stewardship: 13, intrigue: 14, learning: 15, prowess: 16 };

function resolved(overrides = {}) {
  return {
    id: 'agot:test_person', rawId: 'test_person', canonTier: 'canon', name: '艾莉亚', nameKey: 'Arya',
    dynastyId: 'dynn_Stark', fatherId: 'agot:father', motherId: 'agot:mother', cultureId: 'northman', faithId: 'old_gods',
    born: true, alive: true, birthDate: '8289.1.1', deathDate: null, deathReason: null, killerId: null,
    baseAttributes: attributes, attributes, traits: ['brave', 'education_intrigue_3', 'brave'], spouseIds: ['agot:spouse'], relations: [{ kind: 'friend', target_id: 'character:friend_1' }],
    hasDna: true, source: { file: 'test.txt', line: 1 }, locationId: 'winterfell', titles: ['lady'], wounds: ['左臂刀伤'],
    woundLevels: { arms: 'minor' }, relationships: [], memories: [], knowledge: [], ...overrides,
  };
}

test('年龄以资料中的纪年计算，已故人物停在死亡年份', () => {
  assert.equal(characterAgeAtYear('8289.1.1', 298), 9);
  assert.equal(characterAgeAtYear('8250.1.1', 298, '8280.1.1', false), 30);
  assert.equal(characterAgeAtYear('6204.1.1', 298, '6260.1.1', false), 56);
  assert.equal(characterDatasetYear(298, '8289.1.1'), 8298);
  assert.equal(characterAgeAtYear(null, 298), undefined);
});

test('NPC 人物栏教育特质固定第一且动态资料完整投影', () => {
  const dossier = createNpcDossier(resolved(), 298);
  assert.equal(dossier.kind, 'npc');
  assert.equal(dossier.age, 9);
  assert.equal(dossier.house, '史塔克家族');
  assert.deepEqual(dossier.traitIds, ['education_intrigue_3', 'brave']);
  assert.deepEqual(dossier.woundLevels, { arms: 'minor' });
  assert.deepEqual(dossier.relations.spouseIds, ['agot:spouse']);
  assert.deepEqual(dossier.relations.notableRelations, [{ kind: 'friend', targetId: 'agot:friend_1' }]);
  assert.equal(dossier.location, 'winterfell');
  assert.equal('player' in dossier, false, 'NPC 不得携带玩家档案和玩家物品入口');
});


test('存档人物事件会投影到同一套 NPC 人物栏', () => {
  const base = resolved({ spouseIds: [], titles: [], wounds: [], woundLevels: {}, memories: [] });
  const memory = { id: 'memory_1', characterId: base.id, turn: 4, event: '在临冬城立下誓言', importance: 4, participants: [], visibility: 'public' };
  const events = [
    { id: 'move', runId: 'run_1', characterId: base.id, turn: 2, sequence: 0, timestamp: 1, event: { type: 'MOVE', locationId: 'kings_landing' } },
    { id: 'wound', runId: 'run_1', characterId: base.id, turn: 3, sequence: 0, timestamp: 2, event: { type: 'INJURE', zone: 'torso', level: 'heavy', woundText: '胸口箭伤' } },
    { id: 'marry', runId: 'run_1', characterId: base.id, turn: 4, sequence: 0, timestamp: 3, event: { type: 'MARRY', spouseId: 'agot:new_spouse' } },
    { id: 'title', runId: 'run_1', characterId: base.id, turn: 4, sequence: 1, timestamp: 4, event: { type: 'GRANT_TITLE', titleId: '临冬城守护' } },
    { id: 'memory', runId: 'run_1', characterId: base.id, turn: 4, sequence: 2, timestamp: 5, event: { type: 'ADD_MEMORY', memory } },
  ];
  const projected = resolveCharacter(base, events, { datasetVersion: 'test', currentYear: 8298 });
  const dossier = createNpcDossier(projected, 298);
  assert.equal(dossier.location, 'kings_landing');
  assert.equal(dossier.title, '临冬城守护');
  assert.equal(dossier.woundLevels.torso, 'heavy');
  assert.deepEqual(dossier.relations.spouseIds, ['agot:new_spouse']);
  assert.deepEqual(dossier.memories.map((entry) => entry.id), ['memory_1']);
});

test('未知家族仍保留可读名称而不是伪造主要家族', () => {
  const dossier = createNpcDossier(resolved({ dynastyId: 'dynn_Flint_of_Widows_Watch' }), 298);
  assert.equal(dynastySlug(dossier.dynastyId), 'Flint of Widows Watch');
  assert.equal(dossier.house, 'Flint of Widows Watch家族');
});

test('所有经典开局人物都显示可靠的文化与信仰', () => {
  for (const preset of PRESET_SCENARIOS) {
    const dossier = createPlayerDossier(preset.initialLord);
    assert.notEqual(dossier.culture, '文化未记录', `${preset.id} 缺少文化`);
    assert.notEqual(dossier.faith, '信仰未记录', `${preset.id} 缺少信仰`);
  }
});

test('旧存档只补齐已知家族身份且不会覆盖自建内容', () => {
  assert.deepEqual(
    migrateLordIdentityData({ houseSigil: 'house-stark' }),
    { houseSigil: 'house-stark', culture: '北境人', faith: '旧神信仰' },
  );
  assert.deepEqual(
    migrateLordIdentityData({ houseSigil: 'custom-wolf', culture: '山地氏族', faith: '旧神信仰' }),
    { houseSigil: 'custom-wolf', culture: '山地氏族', faith: '旧神信仰' },
  );
});
