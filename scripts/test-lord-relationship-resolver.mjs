import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/features/characters/lordRelationshipResolver.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { resolveLordFamilyRecords } = await import(moduleUrl);

const records = new Map([
  ['agot:Stark_3', { id: 'agot:Stark_3', name: '艾德', dynastyId: 'dynn_Stark', alive: true, fatherId: 'agot:Stark_1', motherId: 'agot:Stark_127', spouseIds: ['agot:Tully_4'] }],
  ['agot:Stark_1', { id: 'agot:Stark_1', name: '瑞卡德', dynastyId: 'dynn_Stark', alive: false, spouseIds: [] }],
  ['agot:Stark_127', { id: 'agot:Stark_127', name: '莱亚拉', dynastyId: 'dynn_Stark', alive: false, spouseIds: [] }],
  ['agot:Tully_4', { id: 'agot:Tully_4', name: '凯特琳', dynastyId: 'dynn_Tully', alive: true, spouseIds: ['agot:Stark_3'] }],
  ['agot:Banks_1', { id: 'agot:Banks_1', name: '艾德', dynastyId: 'dynn_Banks', alive: false, spouseIds: [] }],
]);

const hits = [
  { id: 'agot:Banks_1', name: '艾德', dynastyId: 'dynn_Banks', alive: false, canonTier: 'genealogy', born: true },
  { id: 'agot:Stark_3', name: '艾德', dynastyId: 'dynn_Stark', alive: true, canonTier: 'canon', born: true, birthYear: 263 },
];

const repository = {
  async search() { return hits; },
  async get(id) { return records.get(id); },
  async getMany(ids) { return ids.map((id) => records.get(id)).filter(Boolean); },
  async getKinship(id) {
    const record = records.get(id);
    return {
      fatherId: record?.fatherId,
      motherId: record?.motherId,
      spouseIds: record?.spouseIds ?? [],
      childIds: [],
      siblingIds: [],
    };
  },
};

test('按姓名、家族和年龄锁定正确的 AGOT 人物，而不是同名祖先', async () => {
  const family = await resolveLordFamilyRecords({ name: '艾德·史塔克', house: '史塔克家族', houseSigil: 'house-stark', age: 35, currentYear: 298 }, repository);
  assert.equal(family.subject?.id, 'agot:Stark_3');
});

test('只返回数据中可验证的配偶与父母', async () => {
  const family = await resolveLordFamilyRecords({ name: '艾德·史塔克', house: '史塔克家族', houseSigil: 'house-stark', age: 35, currentYear: 298 }, repository);
  assert.equal(family.spouse?.name, '凯特琳');
  assert.equal(family.father?.name, '瑞卡德');
  assert.equal(family.mother?.name, '莱亚拉');
});

test('找不到可靠人物时返回空结果，不虚构关系', async () => {
  const emptyRepository = { ...repository, async search() { return []; } };
  const family = await resolveLordFamilyRecords({ name: '自建领主', house: '自建家族', age: 22, currentYear: 298 }, emptyRepository);
  assert.deepEqual(family, {});
});


test('现成人物使用稳定 ID 读取公开父亲与兄弟姐妹而不再按姓名猜测', async () => {
  const directRecords = new Map([
    ['agot:Stark_7', { id: 'agot:Stark_7', name: '琼恩', dynastyId: 'dynn_Stark', alive: true, fatherId: 'agot:Stark_3', spouseIds: [] }],
    ['agot:Stark_3', records.get('agot:Stark_3')],
    ['agot:Stark_6', { id: 'agot:Stark_6', name: '罗柏', dynastyId: 'dynn_Stark', alive: true, spouseIds: [] }],
    ['agot:Stark_8', { id: 'agot:Stark_8', name: '珊莎', dynastyId: 'dynn_Stark', alive: true, spouseIds: [] }],
  ]);
  const directRepository = {
    async search() { return []; },
    async get(id) { return directRecords.get(id); },
    async getMany(ids) { return ids.map((id) => directRecords.get(id)).filter(Boolean); },
    async getKinship(id) {
      if (id === 'agot:Stark_7') return { fatherId: 'agot:Stark_3', spouseIds: [], childIds: [], siblingIds: ['agot:Stark_6', 'agot:Stark_8'] };
      return { spouseIds: [], childIds: [], siblingIds: [] };
    },
  };
  const family = await resolveLordFamilyRecords({
    canonicalCharacterId: 'agot:Stark_7', name: '琼恩', house: '史塔克家族', age: 15, currentYear: 298,
  }, directRepository);
  assert.equal(family.subject?.id, 'agot:Stark_7');
  assert.equal(family.father?.id, 'agot:Stark_3');
  assert.deepEqual(family.siblings?.map((record) => record.id), ['agot:Stark_6', 'agot:Stark_8']);
  assert.equal(family.mother, undefined);
});
