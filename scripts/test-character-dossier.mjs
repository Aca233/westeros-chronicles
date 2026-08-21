import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { build } from 'esbuild';

async function bundleModule(entryPoint) {
  const bundle = await build({ entryPoints: [entryPoint], bundle: true, write: false, format: 'esm', platform: 'node' });
  const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
  return import(url);
}

const { characterAgeAtYear, characterDatasetYear, createNpcDossier, createPlayerDossier, dynastySlug, relatedCharacterIds } = await bundleModule('src/features/characters/characterDossier.ts');
const { resolveCharacter } = await bundleModule('src/features/characters/characterProjector.ts');
const { migrateLordIdentityData } = await bundleModule('src/data/characterTraits.ts');
const { PRESET_SCENARIOS } = await bundleModule('src/data/presets.ts');
const { projectResolvedCharacterWorldFacts } = await bundleModule('src/features/world/characterWorldFacts.ts');
const { projectLordFamilyRecords, projectRelationshipCharacter } = await bundleModule('src/features/characters/characterRelationshipProjection.ts');

const attributes = { diplomacy: 11, martial: 12, stewardship: 13, intrigue: 14, learning: 15, prowess: 16 };

function resolved(overrides = {}) {
  return {
    id: 'agot:test_person', rawId: 'test_person', canonTier: 'canon', name: '艾莉亚', nameKey: 'Arya',
    dynastyId: 'dynn_Stark', fatherId: 'agot:father', motherId: 'agot:mother', cultureId: 'northman', faithId: 'old_gods',
    born: true, alive: true, birthDate: '8289.1.1', deathDate: null, deathReason: null, killerId: null,
    baseAttributes: attributes, attributes, traits: ['brave', 'education_intrigue_3', 'brave'], spouseIds: ['agot:spouse'], relations: [{ kind: 'friend', target_id: 'character:friend_1' }],
    hasDna: true, source: { file: 'test.txt', line: 1 }, locationId: 'winterfell', titleIds: ['e_the_north'], titles: ['北境'], wounds: ['左臂刀伤'],
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

test('时间线历史死亡覆盖错误的 AGOT 在世标记', () => {
  const jonArryn = resolved({
    id: 'agot:Arryn_3',
    name: '琼恩',
    dynastyId: 'dynn_Arryn',
    birthDate: '8219.1.1',
    alive: true,
    titleIds: ['c_the_eyrie'],
    titles: ['鹰巢城'],
    locationId: undefined,
  });
  const projected = projectResolvedCharacterWorldFacts(jonArryn, {
    history: {
      startDate: { year: 298, month: 5, day: 10 },
      canonical: { evt_298_04_01: { eventId: 'evt_298_04_01', status: 'historical' } },
      turns: [],
    },
    runtime: { characters: {} },
    timeline: [{
      id: 'evt_298_04_01', date: { year: 298, month: 4, day: 5 }, title: '前首相离奇暴毙',
      summary: '琼恩·艾林在君临死亡。', region: '君临', category: 'death', participants: [],
      fatalities: [{ name: '琼恩·艾林', characterId: 'agot:Arryn_3' }], consequences: [],
    }],
    mapLocations: [
      { id: 'b_the_eyrie', name: '鹰巢城', importance: 95, mapX: 1, mapY: 1, regionId: 'vale', type: 'castle' },
    ],
    memberships: [
      { locationId: 'b_the_eyrie', baronyId: 'b_the_eyrie', countyId: 'c_the_eyrie', realmId: 'e_the_vale' },
    ],
  });
  assert.equal(projected.alive, false);
  assert.equal(projected.deathDate, '8298.4.5');
  assert.equal(projected.locationId, 'b_the_red_keep');
});

test('关系卡人物与本人卷宗使用同一套死亡投影', () => {
  const jonArryn = resolved({
    id: 'agot:Arryn_3',
    name: '琼恩',
    alive: true,
  });
  const options = {
    history: {
      startDate: { year: 298, month: 5, day: 10 },
      canonical: { evt_298_04_01: { eventId: 'evt_298_04_01', status: 'historical' } },
      turns: [],
    },
    runtime: { characters: {} },
    timeline: [{
      id: 'evt_298_04_01', date: { year: 298, month: 4, day: 5 }, title: '前首相离奇暴毙',
      summary: '琼恩·艾林在君临死亡。', region: '君临', category: 'death', participants: [],
      fatalities: [{ name: '琼恩·艾林', characterId: 'agot:Arryn_3' }], consequences: [],
    }],
  };
  const canonicalDeath = projectRelationshipCharacter(jonArryn, [], options);
  assert.equal(canonicalDeath.alive, false);
  assert.equal(canonicalDeath.deathDate, '8298.4.5');

  const runtimeDeath = projectRelationshipCharacter(resolved({ id: 'agot:test_runtime' }), [{
    id: 'death', runId: 'run', characterId: 'agot:test_runtime', turn: 1, sequence: 0, timestamp: 1,
    event: { type: 'DIE', cause: '战死' },
  }], { ...options, history: { ...options.history, canonical: {} }, timeline: [] });
  assert.equal(runtimeDeath.alive, false);
  assert.equal(runtimeDeath.deathReason, '战死');
});

test('玩家家族关系卡也投影亲属的存档死亡状态', async () => {
  const father = resolved({ id: 'agot:father', name: '父亲', alive: true });
  const family = { father, children: [], siblings: [], spouses: [] };
  const projected = await projectLordFamilyRecords(
    family,
    async (characterId) => characterId === father.id ? [{
      id: 'father-death', runId: 'run', characterId, turn: 2, sequence: 0, timestamp: 2,
      event: { type: 'DIE', cause: '战死' },
    }] : [],
    {
      history: { startDate: { year: 298, month: 5, day: 10 }, canonical: {}, turns: [] },
      runtime: { characters: {} },
      timeline: [],
    },
  );
  assert.equal(projected.father.alive, false);
  assert.equal(projected.father.deathReason, '战死');
});

test('当前所在地只使用场景基线与运行时移动，不以领地或家族驻地冒充', () => {
  const mapLocations = [
    { id: 'b_the_eyrie', name: '鹰巢城', importance: 95, mapX: 1, mapY: 1, regionId: 'vale', type: 'castle' },
    { id: 'b_casterly_rock', name: '凯岩城', importance: 95, mapX: 2, mapY: 2, regionId: 'west', type: 'castle' },
    { id: 'b_winterfell', name: '临冬城', importance: 100, mapX: 3, mapY: 3, regionId: 'north', type: 'castle' },
  ];
  const baseOptions = {
    history: { startDate: { year: 298, month: 5, day: 10 }, canonical: {}, turns: [] },
    timeline: [],
    mapLocations,
    memberships: [],
  };
  const catelyn = projectResolvedCharacterWorldFacts(resolved({ id: 'agot:Tully_4', locationId: undefined, titleIds: [], dynastyId: 'dynn_Tully' }), {
    ...baseOptions, runtime: { characters: {} },
  });
  assert.equal(catelyn.locationId, 'b_winterfell');

  const tyrion = projectResolvedCharacterWorldFacts(resolved({ id: 'agot:Lannister_8', locationId: undefined, titleIds: [], dynastyId: 'dynn_Lannister' }), {
    ...baseOptions, runtime: { characters: {} },
  });
  assert.equal(tyrion.locationId, 'b_winterfell');

  const unrelatedLannister = projectResolvedCharacterWorldFacts(resolved({ id: 'agot:Lannister_test', locationId: undefined, titleIds: [], dynastyId: 'dynn_Lannister' }), {
    ...baseOptions, runtime: { characters: {} },
  });
  assert.equal(unrelatedLannister.locationId, undefined, '不能把家族驻地当成当前所在地');

  const moved = projectResolvedCharacterWorldFacts(tyrion, {
    ...baseOptions, runtime: { characters: { [tyrion.id]: { location: { locationId: 'b_casterly_rock' } } } },
  });
  assert.equal(moved.locationId, 'b_casterly_rock');
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
  assert.equal(dossier.title, '北境');
  assert.equal('player' in dossier, false, 'NPC 不得携带玩家档案和玩家物品入口');
});


test('NPC 卷宗保留全部反向子女关系且相关人物加载不截断', () => {
  const childIds = Array.from({ length: 10 }, (_, index) => `agot:child_${index}`);
  const dossier = createNpcDossier(resolved(), 298, { spouseIds: ['agot:spouse'], childIds, siblingIds: [] });
  assert.deepEqual(dossier.relations.childIds, childIds);
  const related = relatedCharacterIds(dossier);
  assert.equal(childIds.every((id) => related.includes(id)), true);
  assert.equal(new Set(related).size, related.length);
});

test('NPC 卷宗保留共同父母推导出的全部兄弟姐妹', () => {
  const siblingIds = ['agot:sibling_a', 'agot:sibling_b'];
  const dossier = createNpcDossier(resolved(), 298, {
    fatherId: 'agot:father', motherId: 'agot:mother', spouseIds: [], childIds: [], siblingIds,
  });
  assert.deepEqual(dossier.relations.siblingIds, siblingIds);
  assert.equal(siblingIds.every((id) => relatedCharacterIds(dossier).includes(id)), true);
});

test('无实际领地的人物明确显示未持有封地', () => {
  const dossier = createNpcDossier(resolved({ titleIds: [], titles: [] }), 298);
  assert.equal(dossier.title, '未持有封地');
  assert.deepEqual(dossier.titles, []);
});

test('玩家与 NPC 卷宗都暴露统一世界地点、头衔、资产和事件字段', () => {
  const npc = createNpcDossier(resolved(), 298);
  assert.equal(npc.worldCharacterId, npc.id);
  assert.deepEqual(npc.worldTitleIds, npc.character.titleIds);
  assert.ok(npc.assetGroups);
  assert.deepEqual(npc.worldEvents, []);

  const player = createPlayerDossier(structuredClone(PRESET_SCENARIOS[0].initialLord), 298, 'save:test:player');
  assert.equal(player.worldCharacterId, 'save:test:player');
  assert.deepEqual(player.worldLocation, player.player.location);
  assert.ok(player.assetGroups);
});

test('按内部头衔 ID 剥夺时同步删除本地化显示名称', () => {
  const base = resolved();
  const events = [
    { id: 'revoke', runId: 'run_1', characterId: base.id, turn: 1, sequence: 0, timestamp: 1, event: { type: 'REVOKE_TITLE', titleId: 'e_the_north' } },
  ];
  const projected = resolveCharacter(base, events, { datasetVersion: 'test', currentYear: 8298 });
  assert.deepEqual(projected.titleIds, []);
  assert.deepEqual(projected.titles, []);
});


test('存档人物事件会投影到同一套 NPC 人物栏', () => {
  const base = resolved({ spouseIds: [], titleIds: [], titles: [], wounds: [], woundLevels: {}, memories: [] });
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

test('玩家卷宗不把内部英文特质 ID 当作旧特质名称展示', () => {
  const lord = structuredClone(PRESET_SCENARIOS[0].initialLord);
  lord.culture = 'northman';
  lord.faith = 'old_gods_wnw';
  lord.traits = [...lord.traits, 'education_martial_prowess_3', 'family_first'];
  lord.traitIds = [...(lord.traitIds ?? []), 'education_martial_prowess_3', 'family_first'];
  const dossier = createPlayerDossier(lord);
  assert.equal(dossier.culture, '北境人');
  assert.equal(dossier.faith, '森林旧神');
  assert.equal(dossier.legacyTraits.includes('education_martial_prowess_3'), false);
  assert.equal(dossier.legacyTraits.includes('family_first'), false);
});


test('NPC 特质按年龄与呈现策略投影且不会暴露辅助 ID', () => {
  const adult = createNpcDossier(resolved({
    birthDate: '8270.1.1',
    traits: ['education_martial_3', 'education_martial_prowess_3', 'rowdy', 'knight', 'family_first'],
  }), 298);
  assert.deepEqual(adult.traitIds, ['education_martial_3', 'knight', 'family_first']);
  assert.deepEqual(adult.hiddenModifierTraitIds, ['education_martial_prowess_3']);
  assert.deepEqual(adult.statusTraitIds, ['knight']);

  const child = createNpcDossier(resolved({ birthDate: '8288.1.1', traits: ['rowdy'] }), 298);
  assert.deepEqual(child.traitIds, ['rowdy']);
});

test('现成人物成为玩家后仍由完整原始特质按年龄投影', () => {
  const lord = structuredClone(PRESET_SCENARIOS[0].initialLord);
  lord.age = 30;
  lord.importedTraitIds = ['education_martial_3', 'education_martial_prowess_2', 'rowdy', 'knight'];
  lord.traitIds = ['education_martial_3', 'rowdy', 'knight'];
  const dossier = createPlayerDossier(lord);
  assert.deepEqual(dossier.traitIds, ['education_martial_3', 'knight']);
  assert.deepEqual(dossier.hiddenModifierTraitIds, ['education_martial_prowess_2']);
  assert.deepEqual(dossier.statusTraitIds, ['knight']);
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

const { CHARACTER_DOSSIER_SUPPLEMENTS, getCharacterDossierSupplement } = await bundleModule('src/data/generated/characterDossierSupplements.ts');
const {
  filterVisibleExperiences,
  deduplicateExperiences,
  validateCharacterSupplement,
  validateNotableRelation,
} = await bundleModule('src/features/characters/characterSupplementSchema.ts');
const { default: searchIndex } = await import('../public/data/agot-characters/search-index.json', { with: { type: 'json' } });
const searchIndexMap = new Map(searchIndex.map((c) => [c.id, c]));
const rawSupplementModules = await Promise.all([
  import('./data/character-dossier/raw_supplements_part1.mjs'),
  import('./data/character-dossier/raw_supplements_part2.mjs'),
  import('./data/character-dossier/raw_supplements_part3.mjs'),
  import('./data/character-dossier/raw_supplements_part4.mjs'),
  import('./data/character-dossier/raw_supplements_part5.mjs'),
]);
const rawSupplements = rawSupplementModules.flatMap((module, index) => (
  module.RAW_SUPPLEMENTS ?? module[`RAW_SUPPLEMENTS_PART${index + 1}`]
));

test('原始补充资料声明的主体姓名与基础人物 ID 一致', () => {
  assert.equal(rawSupplements.length, Object.keys(CHARACTER_DOSSIER_SUPPLEMENTS).length);
  for (const supplement of rawSupplements) {
    const character = searchIndexMap.get(supplement.characterId);
    assert.ok(character, `人物 ID ${supplement.characterId} 在基础数据中不存在`);
    assert.equal(
      supplement.subjectNameKey,
      character.nameKey,
      `人物 ${supplement.characterId} 的姓名声明与基础数据不一致`,
    );
    for (const relation of supplement.notableRelations ?? []) {
      assert.equal(
        relation.targetNameKey,
        searchIndexMap.get(relation.targetId)?.nameKey,
        `人物 ${supplement.characterId} 的关系目标 ${relation.targetId} 身份不一致`,
      );
    }
    for (const experience of supplement.experiences ?? []) {
      assert.deepEqual(
        experience.participantNameKeys,
        (experience.participantIds ?? []).map((id) => searchIndexMap.get(id)?.nameKey),
        `人物 ${supplement.characterId} 的经历参与者身份不一致：${experience.title}`,
      );
    }
  }
});

test('补充资料库包含至少 100 名重要人物且所有 ID 均在基础数据索引中存在', () => {
  const count = Object.keys(CHARACTER_DOSSIER_SUPPLEMENTS).length;
  assert.ok(count >= 100, `补充资料人物数量不足 100: 当前为 ${count}`);
  for (const [id, supplement] of Object.entries(CHARACTER_DOSSIER_SUPPLEMENTS)) {
    assert.equal(id, supplement.characterId);
    assert.ok(searchIndexMap.has(id), `人物 ID ${id} 在 search-index.json 中不存在`);
  }
});

test('所有人物简介长度在 50-120 字且无多余字段', () => {
  for (const [id, supplement] of Object.entries(CHARACTER_DOSSIER_SUPPLEMENTS)) {
    assert.ok(supplement.summary, `人物 ${id} 缺少简介`);
    const len = supplement.summary.length;
    assert.ok(len >= 50 && len <= 120, `人物 ${id} 简介长度不符合 50-120 字: 实际为 ${len} 字`);
    // Check validation passes
    const validated = validateCharacterSupplement(supplement);
    assert.equal(validated.characterId, id);
  }
});

test('经历年份必须 <= 298 AC，过滤后不含超前年份且 secret 经历默认过滤', () => {
  for (const [id, supplement] of Object.entries(CHARACTER_DOSSIER_SUPPLEMENTS)) {
    for (const exp of supplement.experiences ?? []) {
      const year = Number(exp.date.split('.')[0]);
      assert.ok(year <= 298 || (year >= 8000 && year <= 8298), `人物 ${id} 经历包含超前年份 ${exp.date}`);
    }
  }

  const testExperiences = [
    { date: '8283', title: '篡夺者战争', description: '历史经历', visibility: 'public' },
    { date: '8298', title: '当前经历', description: '开局经历', visibility: 'public' },
    { date: '8299', title: '未来经历', description: '未来经历', visibility: 'public' },
    { date: '8283', title: '秘密血统', description: '隐秘经历', visibility: 'secret' },
  ];
  const filteredDefault = filterVisibleExperiences(testExperiences, 298);
  assert.equal(filteredDefault.length, 2);
  assert.deepEqual(filteredDefault.map((e) => e.title), ['篡夺者战争', '当前经历']);

  const filteredWithSecret = filterVisibleExperiences(testExperiences, 298, true);
  assert.equal(filteredWithSecret.length, 3);
  assert.deepEqual(filteredWithSecret.map((e) => e.title), ['篡夺者战争', '秘密血统', '当前经历']);
});

test('非亲属关系 targetId 存在于 search-index.json 且来源 URL 格式正确', () => {
  for (const [id, supplement] of Object.entries(CHARACTER_DOSSIER_SUPPLEMENTS)) {
    for (const rel of supplement.notableRelations ?? []) {
      assert.ok(searchIndexMap.has(rel.targetId), `人物 ${id} 的非亲属关系 ${rel.targetId} 不存在`);
      if (rel.sourceUrl) {
        assert.match(rel.sourceUrl, /^https?:\/\//, `人物 ${id} 关系的 sourceUrl 格式不正确: ${rel.sourceUrl}`);
      }
    }
    for (const url of supplement.sourceUrls ?? []) {
      assert.match(url, /^https?:\/\//, `人物 ${id} 的 sourceUrl 格式不正确: ${url}`);
    }
  }
});

test('补充资料只绑定 298 AC 开局仍存活的目标人物', () => {
  for (const [id] of Object.entries(CHARACTER_DOSSIER_SUPPLEMENTS)) {
    assert.equal(searchIndexMap.get(id)?.alive, true, `人物 ${id} 在开局已经死亡，疑似绑定了错误 ID`);
  }
});

test('非亲属关系不得重复人物、指向自身或混入基础亲属关系', async () => {
  assert.throws(() => validateNotableRelation(
    { targetId: 'agot:test_person', kind: '自己' },
    'agot:test_person',
  ), /不能指向人物自身/);

  assert.throws(() => validateCharacterSupplement({
    characterId: 'agot:test_person',
    sourceUrls: ['https://awoiaf.westeros.org/index.php/Test'],
    notableRelations: [
      { targetId: 'agot:friend', kind: '朋友' },
      { targetId: 'agot:friend', kind: '盟友' },
    ],
  }), /重复/);

  const kinshipById = new Map();
  for (const filename of await readdir(new URL('../public/data/agot-characters/kinship/', import.meta.url))) {
    if (!filename.endsWith('.json')) continue;
    const shard = JSON.parse(await readFile(new URL(`../public/data/agot-characters/kinship/${filename}`, import.meta.url), 'utf8'));
    for (const [id, kinship] of Object.entries(shard)) kinshipById.set(id, kinship);
  }

  for (const [id, supplement] of Object.entries(CHARACTER_DOSSIER_SUPPLEMENTS)) {
    const kinship = kinshipById.get(id) ?? {};
    const kinIds = new Set([
      kinship.fatherId,
      kinship.motherId,
      ...(kinship.spouseIds ?? []),
      ...(kinship.childIds ?? []),
      ...(kinship.siblingIds ?? []),
    ].filter(Boolean));
    for (const relation of supplement.notableRelations ?? []) {
      assert.equal(kinIds.has(relation.targetId), false,
        `人物 ${id} 把亲属 ${relation.targetId} 填入了非亲属关系`);
    }
  }
});

test('资料来源只接受项目允许的冰火维基域名', () => {
  assert.throws(() => validateCharacterSupplement({
    characterId: 'agot:test_person',
    sourceUrls: ['https://example.com/wiki/Test'],
  }), /(?:来源 URL 无效|无效 sourceUrl)/);
  assert.throws(() => validateCharacterSupplement({
    characterId: 'agot:test_person',
    sourceUrls: ['https://awoiaf.westeros.org.evil.example/wiki/Test'],
  }), /(?:来源 URL 无效|无效 sourceUrl)/);
});

test('静态开局资料不包含 298 AC 年内未来事件或已知秘密', () => {
  const forbiddenPublicSnippets = [
    '见不得光的隐秘私情',
    '雪诺大人',
    '白狼',
    '丈夫死后',
    '遗孀兼谷地摄政夫人',
    '于 298 年骤然病逝',
    '未公开的私生子',
    '暗中向君临传递情报',
    '暗中操纵的迷恋者',
    '跨海密谋生死伙伴',
    '效忠的幕后主子',
    '未相认的生父',
    '生死挚友与保护者',
    '仇视针对的刺头新兵',
    '与马王卓戈洽谈联姻',
  ];

  for (const [id, supplement] of Object.entries(CHARACTER_DOSSIER_SUPPLEMENTS)) {
    for (const exp of supplement.experiences ?? []) {
      assert.notEqual(exp.date, '8298', `人物 ${id} 的静态资料包含开局日之后才可能发生的 298 AC 事件`);
    }
    const publicText = [
      supplement.summary,
      ...(supplement.publicRoles ?? []),
      ...(supplement.aliases ?? []),
      supplement.appearance,
      supplement.personality,
      supplement.reputation,
      ...(supplement.notableRelations ?? []).flatMap((relation) => [relation.kind, relation.description]),
      ...(supplement.experiences ?? [])
        .filter((experience) => experience.visibility === 'public')
        .flatMap((experience) => [experience.title, experience.description]),
    ].filter(Boolean).join('\n');
    for (const snippet of forbiddenPublicSnippets) {
      assert.equal(publicText.includes(snippet), false, `人物 ${id} 的公开资料泄露了秘密或未来信息：${snippet}`);
    }
  }
});

test('经历去重逻辑正常运作', () => {
  const duplicates = [
    { date: '8283', title: '赫伦堡比武会', description: '经历描述 A' },
    { date: '8283', title: '赫伦堡比武会', description: '经历描述 B' },
    { date: '8289', title: '葛雷乔伊叛乱', description: '经历描述 C' },
  ];
  const deduped = deduplicateExperiences(duplicates);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].title, '赫伦堡比武会');
  assert.equal(deduped[1].title, '葛雷乔伊叛乱');
});

test('现成人物成为玩家后沿用同一份卷宗补充资料', () => {
  const existingLord = structuredClone(PRESET_SCENARIOS[0].initialLord);
  existingLord.canonicalCharacterId = 'agot:Stark_3';
  const dossier = createPlayerDossier(existingLord, 298);
  assert.equal(dossier.summary, CHARACTER_DOSSIER_SUPPLEMENTS['agot:Stark_3'].summary);
  assert.ok(dossier.supplementExperiences?.length > 0);
  assert.ok(dossier.relations.notableRelations.some((relation) => relation.targetId === 'agot:Baratheon_2'));
  assert.ok(relatedCharacterIds(dossier).includes('agot:Baratheon_2'));

  const customLord = structuredClone(existingLord);
  delete customLord.canonicalCharacterId;
  const customDossier = createPlayerDossier(customLord, 298);
  assert.equal(customDossier.summary, undefined);
  assert.deepEqual(customDossier.relations.notableRelations, []);
});

test('NPC 卷宗正确合并叙事补充资料层', () => {
  const nedResolved = resolved({ id: 'agot:Stark_3', name: '艾德·史塔克' });
  const dossier = createNpcDossier(nedResolved, 298);
  assert.ok(dossier.summary, '艾德·史塔克卷宗应包含简介');
  assert.ok(dossier.aliases && dossier.aliases.length > 0, '艾德·史塔克卷宗应包含别名');
  assert.ok(dossier.appearance, '艾德·史塔克卷宗应包含外貌');
  assert.ok(dossier.personality, '艾德·史塔克卷宗应包含性格');
  assert.ok(dossier.reputation, '艾德·史塔克卷宗应包含声誉');
  assert.ok(dossier.supplementExperiences && dossier.supplementExperiences.length > 0, '艾德·史塔克卷宗应包含经历');
  assert.ok(dossier.relations.notableRelations.length > 0, '艾德·史塔克卷宗应包含非亲属关系');
});
