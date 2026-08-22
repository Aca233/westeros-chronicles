import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { useMapUiStore } from '../src/features/map/mapUiStore.ts';

const mapUiStore = readFileSync('src/features/map/mapUiStore.ts', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const characterWindow = readFileSync('src/components/Ck3CharacterWindow.tsx', 'utf8');
const characterAssetsTab = readFileSync('src/components/character-window/CharacterAssetsTab.tsx', 'utf8');
const assetSections = readFileSync('src/components/items/WorldAssetSections.tsx', 'utf8');
const itemManagement = readFileSync('src/components/items/ItemManagementPanel.tsx', 'utf8');
const itemCard = readFileSync('src/components/items/ItemCard.tsx', 'utf8');
const assetPresentation = readFileSync('src/components/items/worldAssetPresentation.ts', 'utf8');
const countyDetails = readFileSync('src/features/map/CountyWorldDetails.tsx', 'utf8');
const locationDetails = readFileSync('src/features/map/LocationDetails.tsx', 'utf8');
const mapSubjects = readFileSync('src/features/map/dynamicMapSubjects.ts', 'utf8');
const storyFeed = readFileSync('src/components/StoryFeed.tsx', 'utf8');
const timeline = readFileSync('src/components/TvTimelineModal.tsx', 'utf8');
let assetDrawer = '';
try { assetDrawer = readFileSync('src/components/items/WorldAssetDrawer.tsx', 'utf8'); } catch { /* RED: 文件尚未创建 */ }

test('抽屉状态支持打开资产并返回来源抽屉', () => {
  useMapUiStore.setState({
    activeDrawer: 'character', selectedAssetId: null, returnDrawer: null,
  });
  useMapUiStore.getState().openAsset('item:ice');
  assert.equal(useMapUiStore.getState().activeDrawer, 'asset');
  assert.equal(useMapUiStore.getState().selectedAssetId, 'item:ice');
  assert.equal(useMapUiStore.getState().returnDrawer, 'character');
  useMapUiStore.getState().returnFromAsset();
  assert.equal(useMapUiStore.getState().activeDrawer, 'character');
});

test('正文事实与实际时间线提供人物、地点和资产的只读跳转', () => {
  for (const source of [storyFeed, timeline]) {
    assert.match(source, /worldEventDisplays/);
    assert.match(source, /onOpenLocation/);
    assert.match(source, /onOpenAsset/);
    assert.match(source, /entity\.kind === 'character'/);
    assert.match(source, /entity\.kind === 'location'/);
    assert.match(source, /entity\.kind === 'asset'/);
  }
  assert.match(storyFeed, /onSelectCharacter/);
  assert.match(timeline, /onOpenCharacter/);
  assert.doesNotMatch(timeline, /enqueueWorldTransaction|ADVANCE_TIME|SET_DATE/);
});

test('人物、资产和地图入口通过统一回调互相跳转', () => {
  assert.match(mapUiStore, /'asset'/);
  assert.match(mapUiStore, /openAsset/);
  assert.match(app, /WorldAssetDrawer/);
  for (const label of ['法理所有者', '实际控制者', '当前保管者', '物理位置']) {
    assert.match(assetDrawer, new RegExp(label));
  }
  assert.match(assetDrawer, /selectWorldAssetView/);
  assert.match(characterWindow, /onOpenLocation/);
  assert.match(characterWindow, /onOpenAsset/);
  assert.match(assetSections, /onOpenCharacter/);
  assert.match(assetSections, /onOpenLocation/);
  assert.match(assetSections, /onOpenAsset/);
  assert.doesNotMatch(assetSections, /data-asset-card-details|assetEquipmentLabel|containedAssets/);
  assert.match(readFileSync('src/features/map/CountyDetails.tsx', 'utf8'), /CountyWorldDetails/);
  assert.match(countyDetails, /onSelectCharacter/);
  assert.match(countyDetails, /onOpenAsset/);
  assert.match(mapSubjects, /worldAssetId\.site\(site\.id\)/);
  assert.match(mapSubjects, /worldAssetId\.vehicle\(vehicle\.id\)/);
  assert.doesNotMatch(assetDrawer, />打开(?:人物卷宗|保管者卷宗|保管容器|所在地点)</);
  assert.match(assetDrawer, /relatedRecords/);
  assert.match(assetDrawer, /locationName/);
  assert.match(assetDrawer, /containedAssets/);
  assert.match(assetDrawer, /存放内容/);
  assert.match(assetDrawer, /data-stored-item-information/);
  assert.match(assetDrawer, /data-stored-item-attributes/);
  assert.match(assetDrawer, /compactEquipmentLabel/);
  assert.match(assetDrawer, /itemEffectLabels/);
  assert.match(assetDrawer, /耐久/);
  assert.match(assetDrawer, /材质/);
  assert.match(assetDrawer, /function StoredItemInformation/);
  assert.match(assetDrawer, /getWorldAssetDisplay\(asset, dossier\)/);
  assert.doesNotMatch(assetDrawer, /worldArtifacts/);
  assert.doesNotMatch(assetSections, /worldArtifacts/);
  for (const label of ['法理所有者', '实际控制者', '当前保管者', '装备状态']) {
    assert.match(assetDrawer, new RegExp(label));
  }
  assert.match(assetDrawer, /view\.asset\.kind === 'item'/);
  assert.match(assetPresentation, /无独立保管者/);
});


test('玩家物品与资产按存放地点组织且常用操作不藏进详情', () => {
  for (const label of ['随行物品', '当前地点', '随行载具', '远方资产']) {
    assert.match(itemManagement, new RegExp(label));
  }
  assert.match(itemManagement, /data-asset-location-tabs/);
  assert.match(itemManagement, /data-asset-overview/);
  assert.match(itemManagement, /onOpenAsset/);
  assert.match(itemManagement, /assetContext=/);
  assert.match(itemManagement, /assetCustodianLabel/);
  assert.doesNotMatch(itemManagement, /assetEquipmentLabel|>法理所有者<|>实际控制者<|>当前保管者<|>物理位置<|>装备状态</);
  assert.match(itemManagement, /itemContext/);
  assert.match(itemManagement, /assetName=\{card\.name\}/);
  assert.doesNotMatch(itemManagement, />打开地点<|>资产记录<|据点保管|载具保管/);
  assert.match(itemCard, /item\.actions\.map/);
  assert.match(itemCard, /取消操作/);
  assert.match(itemCard, /assetContext/);
  assert.match(characterWindow, /<CharacterAssetsTab[\s\S]*?dossier=\{dossier\}/);
  assert.match(characterAssetsTab, /<ItemManagementPanel[\s\S]*?dossier=\{dossier\}/);
  assert.doesNotMatch(characterAssetsTab, /<details[^>]*data-player-item-management[\s\S]*?<ItemManagementPanel/);
});
