import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assetCustodianLabel,
  assetEquipmentLabel,
  compactEquipmentLabel,
  containedAssets,
  itemEffectLabels,
} from '../src/components/items/worldAssetPresentation.ts';

const EDDARD = 'agot:Stark_3';
const characterNames = new Map([[EDDARD, '艾德·史塔克']]);
const assetNames = new Map([
  ['site:winterfell-armory', '临冬城军械库'],
  ['item:sword', '城堡锻造手半剑'],
  ['item:helm', '史塔克狼首战盔'],
]);

const site = {
  id: 'site:winterfell-armory', kind: 'site', lawfulOwner: { type: 'character', characterId: EDDARD },
  controller: { type: 'character', characterId: EDDARD }, custodian: null,
  placement: { type: 'location', location: { locationId: 'b_winterfell' } }, equippedPosition: null, status: 'normal',
};
const storedSword = {
  id: 'item:sword', kind: 'item', lawfulOwner: { type: 'character', characterId: EDDARD },
  controller: { type: 'character', characterId: EDDARD }, custodian: { type: 'asset', assetId: site.id },
  placement: { type: 'asset', assetId: site.id }, equippedPosition: null, status: 'normal',
};
const equippedHelm = {
  id: 'item:helm', kind: 'item', lawfulOwner: { type: 'character', characterId: EDDARD },
  controller: { type: 'character', characterId: EDDARD }, custodian: { type: 'character', characterId: EDDARD },
  placement: { type: 'character', characterId: EDDARD }, equippedPosition: { group: 'head' }, status: 'normal',
};

test('据点与载具不伪造装备状态，空保管关系有准确语义', () => {
  assert.equal(assetEquipmentLabel(site, characterNames, assetNames), null);
  assert.equal(assetCustodianLabel(site, characterNames, assetNames), '无独立保管者');
});

test('物品装备与保管状态显示准确人物、槽位和容器名', () => {
  assert.equal(assetEquipmentLabel(equippedHelm, characterNames, assetNames), '艾德·史塔克 · 头部');
  assert.equal(assetEquipmentLabel(storedSword, characterNames, assetNames), '存放于临冬城军械库');
  assert.equal(assetCustodianLabel(storedSword, characterNames, assetNames), '临冬城军械库');
});

test('据点存放内容只返回直接存放其中的物品', () => {
  assert.deepEqual(containedAssets(site.id, [site, storedSword, equippedHelm]).map((asset) => asset.id), ['item:sword']);
});

test('紧凑物品信息区分存放位置与装备能力并显示数值属性', () => {
  const swordDefinition = {
    equippable: true,
    allowedPositions: [{ group: 'mainhand' }],
    effects: [
      { kind: 'check_modifier', domain: 'duel', value: 2, stackGroup: 'duel.weapon', label: '平衡剑身' },
      { kind: 'burden', value: 1, stackGroup: 'weapon.burden', label: '手半剑重量' },
      { kind: 'narrative', directive: '可用于巡逻和操练。' },
    ],
  };
  assert.equal(compactEquipmentLabel(storedSword, swordDefinition, characterNames), '未装备 · 可装备：主手');
  assert.equal(compactEquipmentLabel(equippedHelm, { ...swordDefinition, allowedPositions: [{ group: 'head' }] }, characterNames), '已装备：艾德·史塔克 · 头部');
  assert.deepEqual(itemEffectLabels(swordDefinition.effects), ['检定 · 平衡剑身 +2', '负担 · 手半剑重量 +1']);
});
