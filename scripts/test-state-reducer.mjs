import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

// Bundle the reducer so Node can execute its TypeScript/TSX dependency graph exactly as Vite does.
const bundle = await build({
  entryPoints: ['src/services/stateReducer.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  logLevel: 'silent',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { applyStateCommands } = await import(moduleUrl);

const gearItem = (id, slot) => ({
  id,
  name: id,
  slot,
  slotName: slot,
  quality: '普通',
  condition: '完好坚固',
  bonusText: '',
  description: '',
  icon: 'gear-sword',
});

const createLord = (traitIds = []) => ({
  name: '测试角色',
  house: '测试家族',
  houseWords: '测试箴言',
  houseSigil: 'house-stark',
  title: '测试领主',
  age: 24,
  gender: '男',
  location: '临冬城',
  overallStatus: '强健',
  body: {
    head: { key: 'head', name: '头部与咽喉', level: 'intact', wounds: [], isFatalZone: true },
    torso: { key: 'torso', name: '胸膛与躯干', level: 'intact', wounds: [], isFatalZone: true },
    arms: { key: 'arms', name: '双臂与双手', level: 'intact', wounds: [], isFatalZone: false },
    legs: { key: 'legs', name: '双腿与下肢', level: 'intact', wounds: [], isFatalZone: false },
    isBleeding: false,
    isPoisoned: false,
    isInfected: false,
  },
  gear: {
    torso: gearItem('亚麻衫', 'torso'),
    mainhand: gearItem('徒手空拳', 'mainhand'),
    inventory: [],
  },
  goldDragons: 1000,
  silverStags: 100,
  prestige: 0,
  dread: 0,
  attributes: { diplomacy: 10, martial: 10, stewardship: 10, intrigue: 10, learning: 10, prowess: 10 },
  traits: [],
  traitIds,
});

test('贪婪只放大金币收益，不放大支出', () => {
  const gain = applyStateCommands(createLord(['greedy']), [{ type: 'MODIFY_GOLD', goldDragons: 100 }]);
  assert.equal(gain.updatedLord.goldDragons, 1120);

  const spending = applyStateCommands(createLord(['greedy']), [{ type: 'MODIFY_GOLD', goldDragons: -100 }]);
  assert.equal(spending.updatedLord.goldDragons, 900);
});

test('受伤抗性触发时将伤势降低一级', () => {
  const result = applyStateCommands(
    createLord(['brave']),
    [{ type: 'INJURE_ZONE', zone: 'arms', level: 'heavy', woundText: '手臂受创' }],
    () => 0.05,
  );
  assert.equal(result.updatedLord.body.arms.level, 'minor');
  assert.match(result.changesLog.join('\n'), /受伤抗性生效/);
});

test('抗性未触发时保留原始伤势', () => {
  const result = applyStateCommands(
    createLord(['brave']),
    [{ type: 'INJURE_ZONE', zone: 'arms', level: 'heavy', woundText: '手臂受创' }],
    () => 0.5,
  );
  assert.equal(result.updatedLord.body.arms.level, 'heavy');
});

test('AI 不能把未进入物品栏的装备凭空替换到当前装备栏', () => {
  const lord = createLord();
  const result = applyStateCommands(lord, [{
    type: 'EQUIP_GEAR',
    slot: 'mainhand',
    item: gearItem('凭空出现的宝剑', 'mainhand'),
  }]);
  assert.equal(result.updatedLord.gear.mainhand.id, '徒手空拳');
  assert.match(result.changesLog.join('\n'), /拒绝装备|必须先归入/);
});

test('新装备先进入物品栏后才能成为当前装备', () => {
  const newSword = { ...gearItem('合法获得的宝剑', 'mainhand'), name: '合法获得的宝剑' };
  const result = applyStateCommands(createLord(), [
    {
      type: 'ADD_INVENTORY_ITEM',
      item: {
        id: newSword.id,
        name: newSword.name,
        category: '武器',
        quantity: 1,
        description: newSword.description,
        icon: newSword.icon,
        slot: 'mainhand',
        gearData: newSword,
      },
    },
    { type: 'EQUIP_FROM_INVENTORY', itemId: newSword.id, slot: 'mainhand' },
  ]);
  assert.equal(result.updatedLord.gear.mainhand.name, '合法获得的宝剑');
  assert.equal(result.updatedLord.carriedItems.some((item) => item.id === newSword.id), false);
});

test('当前据点的战斗装备无需整备标记即可穿上', () => {
  const armor = {
    ...gearItem('armor_test', 'torso'),
    name: '精锻锁子重甲',
    slotName: '躯干战甲',
    icon: 'gear-armor',
  };
  const lord = createLord();
  lord.location = '临冬城 · 内院';
  lord.carriedItems = [];
  lord.storageSites = [{ id: 'armory', name: '临冬城军械库', type: 'armory', location: '临冬城', description: '', items: [
    { id: armor.id, name: armor.name, category: '防具', quantity: 1, description: '', slot: 'torso', gearData: armor, size: 'large' },
  ] }];
  const result = applyStateCommands(lord, [{ type: 'EQUIP_ITEM', itemId: armor.id, from: { type: 'site', id: 'armory' }, slot: 'torso' }]);
  assert.equal(result.updatedLord.gear.torso.name, '精锻锁子重甲');
  assert.equal(result.updatedLord.storageSites[0].items.some((item) => item.id === armor.id), false);
  assert.equal(result.updatedLord.storageSites[0].items.some((item) => item.id === '亚麻衫'), true);
});

test('只能从角色当前所在据点取用大件装备', () => {
  const armor = {
    ...gearItem('winterfell_armor', 'torso'),
    name: '临冬城重板甲',
    slotName: '躯干战甲',
    icon: 'gear-armor',
  };
  const lord = createLord();
  lord.location = '君临 · 红堡';
  lord.carriedItems = [];
  lord.storageSites = [{
    id: 'winterfell_armory',
    name: '临冬城军械库',
    type: 'armory',
    location: '临冬城',
    description: '临冬城的军械储藏。',
    items: [{ id: armor.id, name: armor.name, category: '防具', quantity: 1, description: '', slot: 'torso', gearData: armor, size: 'large' }],
  }];
  const result = applyStateCommands(lord, [{
    type: 'EQUIP_ITEM',
    itemId: armor.id,
    from: { type: 'site', id: 'winterfell_armory' },
    slot: 'torso',
  }]);
  assert.equal(result.updatedLord.gear.torso.id, '亚麻衫');
  assert.match(result.changesLog.join('\n'), /不在当前地点|无法取用/);
});

test('自然语言动作完成后可从当前据点穿戴战甲', () => {
  const armor = {
    ...gearItem('winterfell_armor_local', 'torso'),
    name: '临冬城重板甲',
    slotName: '躯干战甲',
    icon: 'gear-armor',
  };
  const lord = createLord();
  lord.location = '临冬城 · 神木林';
  lord.carriedItems = [];
  lord.storageSites = [{
    id: 'winterfell_armory',
    name: '临冬城军械库',
    type: 'armory',
    location: '临冬城',
    description: '临冬城的军械储藏。',
    items: [{ id: armor.id, name: armor.name, category: '防具', quantity: 1, description: '', slot: 'torso', gearData: armor, size: 'large' }],
  }];
  const result = applyStateCommands(lord, [{
    type: 'EQUIP_ITEM',
    itemId: armor.id,
    from: { type: 'site', id: 'winterfell_armory' },
    slot: 'torso',
  }]);
  assert.equal(result.updatedLord.gear.torso.name, '临冬城重板甲');
  assert.equal(result.updatedLord.storageSites[0].items.some((item) => item.id === armor.id), false);
  assert.equal(result.updatedLord.storageSites[0].items.some((item) => item.id === '亚麻衫'), true);
});

test('属性变化同步更新基础属性，避免后续特质结算重复或丢失', () => {
  const lord = createLord();
  lord.baseAttributes = { ...lord.attributes };
  const beforeBase = lord.baseAttributes.martial;
  const beforeFinal = lord.attributes.martial;
  const result = applyStateCommands(lord, [{ type: 'MODIFY_STAT', stat: 'martial', delta: 2, reason: '战术历练' }]);
  assert.equal(result.updatedLord.baseAttributes.martial, beforeBase + 2);
  assert.equal(result.updatedLord.attributes.martial, beforeFinal + 2);
});
