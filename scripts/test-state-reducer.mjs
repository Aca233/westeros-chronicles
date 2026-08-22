import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: "export * from './src/services/stateReducer.ts'; export * from './scripts/fixtures/living-world-items.ts'; export { preloadItemCatalog } from './src/data/itemDefinitions.ts';",
    resolveDir: process.cwd(), sourcefile: 'state-reducer-entry.ts', loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  logLevel: 'silent',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const reducerModule = await import(moduleUrl);
await reducerModule.preloadItemCatalog();
const { applyStateCommands, createNedItemState } = reducerModule;

const createLord = (traitIds = []) => ({
  name: '测试角色', house: '测试家族', houseWords: '测试箴言', houseSigil: 'house-stark', title: '测试领主', age: 24, gender: '男',
  location: { locationId: 'b_winterfell' }, locationLabel: '临冬城', overallStatus: '强健',
  body: {
    head: { key: 'head', name: '头部与咽喉', level: 'intact', wounds: [], isFatalZone: true },
    torso: { key: 'torso', name: '胸膛与躯干', level: 'intact', wounds: [], isFatalZone: true },
    arms: { key: 'arms', name: '双臂与双手', level: 'intact', wounds: [], isFatalZone: false },
    legs: { key: 'legs', name: '双腿与下肢', level: 'intact', wounds: [], isFatalZone: false },
    isBleeding: false, isPoisoned: false, isInfected: false,
  },
  items: createNedItemState(),
  goldDragons: 1000, silverStags: 100, prestige: 0, dread: 0,
  attributes: { diplomacy: 10, martial: 10, stewardship: 10, intrigue: 10, learning: 10, prowess: 10 },
  traits: [], traitIds,
});

const chainmailEquip = { type: 'ITEM_EQUIP', instanceId: 'ned.chainmail', position: { group: 'torso', layer: 'armor' }, displacedTo: { type: 'site', siteId: 'winterfell_armory' } };

test('贪婪只放大金币收益，不放大支出', () => {
  assert.equal(applyStateCommands(createLord(['greedy']), [{ type: 'MODIFY_GOLD', goldDragons: 100 }]).updatedLord.goldDragons, 1120);
  assert.equal(applyStateCommands(createLord(['greedy']), [{ type: 'MODIFY_GOLD', goldDragons: -100 }]).updatedLord.goldDragons, 900);
});

test('受伤抗性触发时将伤势降低一级', () => {
  const result = applyStateCommands(createLord(['brave']), [{ type: 'INJURE_ZONE', zone: 'arms', level: 'heavy', woundText: '手臂受创' }], () => 0.05);
  assert.equal(result.updatedLord.body.arms.level, 'minor');
  assert.match(result.changesLog.join('\n'), /受伤抗性生效/);
});

test('抗性未触发时保留原始伤势', () => {
  const result = applyStateCommands(createLord(['brave']), [{ type: 'INJURE_ZONE', zone: 'arms', level: 'heavy', woundText: '手臂受创' }], () => 0.5);
  assert.equal(result.updatedLord.body.arms.level, 'heavy');
});

test('不存在的物品实例不能凭空装备', () => {
  const lord = createLord();
  const before = structuredClone(lord.items);
  const result = applyStateCommands(lord, [{ ...chainmailEquip, instanceId: 'missing.sword' }]);
  assert.deepEqual(result.updatedLord.items, before);
  assert.match(result.changesLog.join('\n'), /批次未结算|不存在/);
});

test('当前据点的战斗装备无需额外整备即可穿上', () => {
  const result = applyStateCommands(createLord(), [chainmailEquip]);
  assert.deepEqual(result.updatedLord.items.placements['ned.chainmail'], { type: 'equipped', position: { group: 'torso', layer: 'armor' } });
});

test('只能从角色当前所在据点取用大件装备', () => {
  const lord = createLord();
  lord.location = { locationId: 'b_red_keep', sceneLocation: '王座厅' };
  lord.locationLabel = '君临 · 红堡 · 王座厅';
  const result = applyStateCommands(lord, [chainmailEquip]);
  assert.deepEqual(result.updatedLord.items.placements['ned.chainmail'], { type: 'site', siteId: 'winterfell_armory' });
  assert.match(result.changesLog.join('\n'), /批次未结算|不在当前地点/);
});

test('一个回合的物品命令失败时保持整个物品状态', () => {
  const lord = createLord();
  const before = structuredClone(lord.items);
  const result = applyStateCommands(lord, [chainmailEquip, { type: 'ITEM_USE', instanceId: 'missing.medicine' }]);
  assert.deepEqual(result.updatedLord.items, before);
});

test('属性变化同步更新基础属性，避免后续特质结算重复或丢失', () => {
  const lord = createLord();
  lord.baseAttributes = { ...lord.attributes };
  const result = applyStateCommands(lord, [{ type: 'MODIFY_STAT', stat: 'martial', delta: 2, reason: '战术历练' }]);
  assert.equal(result.updatedLord.baseAttributes.martial, 12);
  assert.equal(result.updatedLord.attributes.martial, 12);
});
