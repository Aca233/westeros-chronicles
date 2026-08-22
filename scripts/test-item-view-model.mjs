import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/features/items/viewModel.ts';",
      "export * from './scripts/fixtures/living-world-items.ts';",
      "export * from './src/data/itemDefinitions.ts';",
    ].join('\n'),
    resolveDir: process.cwd(), sourcefile: 'item-view-model-entry.ts', loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const viewModule = await import(url);
await viewModule.preloadItemCatalog();
const { buildItemCardModels, buildEquipmentGroupModels, createNedItemState, ITEM_CATALOG } = viewModule;

function stateWithEveryCustodyTab() {
  const state = createNedItemState();
  state.sites.remote_vault = { id: 'remote_vault', name: '君临旧宅', type: 'room', location: { locationId: 'b_red_keep' }, locationLabel: '君临 · 红堡', description: '远方储藏' };
  state.vehicles.supply_wagon = { id: 'supply_wagon', name: '随行辎重车', type: 'wagon', location: { locationId: 'b_winterfell' }, locationLabel: '临冬城', capacity: 24, description: '随行运输' };
  state.placements['ned.poppy_milk'] = { type: 'site', siteId: 'remote_vault' };
  state.placements['ned.castle_sword'] = { type: 'vehicle', vehicleId: 'supply_wagon' };
  return state;
}

const tabs = ['carried', 'current-site', 'vehicle', 'remote-site'];

test('每个收纳实例只出现在一个保管页签且远方据点独立', () => {
  const state = stateWithEveryCustodyTab();
  const byTab = Object.fromEntries(tabs.map((tab) => [tab, buildItemCardModels({ state, catalog: ITEM_CATALOG, currentLocation: { locationId: 'b_winterfell', sceneLocation: '领主厅' }, pendingActions: [], tab })]));
  const ids = tabs.flatMap((tab) => byTab[tab].map((card) => card.instanceId));
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(byTab['current-site'].every((card) => !card.locationLabel.includes('君临')));
  assert.deepEqual(byTab['remote-site'].map((card) => card.instanceId), ['ned.poppy_milk']);
  assert.deepEqual(byTab.vehicle.map((card) => card.instanceId), ['ned.castle_sword']);
});

test('六组顺序固定且躯干、双腿与佩饰摘要聚合内部位置', () => {
  const state = createNedItemState();
  const groups = buildEquipmentGroupModels({ state, catalog: ITEM_CATALOG, pendingActions: [] });
  assert.deepEqual(groups.map((group) => group.group), ['head', 'torso', 'mainhand', 'offhand', 'legs', 'accessories']);
  const torso = groups.find((group) => group.group === 'torso');
  assert.deepEqual(torso.positions.map((position) => position.label), ['服装', '护甲', '外披']);
  assert.match(torso.summary, /北境羊毛束腰衣/);
  assert.match(torso.summary, /灰狼皮大氅/);
  const legs = groups.find((group) => group.group === 'legs');
  assert.deepEqual(legs.positions.map((position) => position.label), ['腿部', '足部']);
  assert.match(legs.summary, /北境羊毛马裤/);
  assert.match(legs.summary, /北境熟皮骑行靴/);
  const accessories = groups.find((group) => group.group === 'accessories');
  assert.equal(accessories.positions.length, 3);
  assert.equal(accessories.items.length, 1);
  assert.match(accessories.summary, /临冬城公爵印章/);
});

test('卡片只暴露最多三条主要效果并标记待执行动作', () => {
  const state = createNedItemState();
  state.placements['ned.chainmail'] = { type: 'equipped', position: { group: 'torso', layer: 'armor' } };
  const pendingActions = [{ id: 'pending', action: { kind: 'repair', instanceId: 'ned.chainmail', amount: 5 }, instanceId: 'ned.chainmail', itemName: '城堡精制锁子甲', image: { type: 'game', icon: 'gear-chainmail' }, label: '修理锁甲', conflictKey: 'item:ned.chainmail:repair' }];
  const groups = buildEquipmentGroupModels({ state, catalog: ITEM_CATALOG, pendingActions });
  const chainmail = groups.flatMap((group) => group.items).find((card) => card.instanceId === 'ned.chainmail');
  assert.ok(chainmail.primaryEffects.length <= 3);
  assert.ok(chainmail.primaryEffects.some((line) => line.includes('铆接锁环防护')));
  assert.ok(chainmail.actions.every((action) => action.disabledReason?.includes('待执行')));
  assert.match(chainmail.durabilityLabel, /100/);
});


test('普通物品卡不从实例旧字段显示法理归属', () => {
  const state = createNedItemState();
  const legacyOwnershipKey = ['lawful', 'ControllerId'].join('');
  state.instances['ned.ice'][legacyOwnershipKey] = 'house_stark';
  const cards = buildEquipmentGroupModels({ state, catalog: ITEM_CATALOG, pendingActions: [] })
    .flatMap((group) => group.items);
  const ice = cards.find((card) => card.instanceId === 'ned.ice');
  assert.ok(ice);
  assert.equal(ice.provenanceLines.some((line) => line.includes('合法归属')), false);
});
