import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/features/world/worldAssetRules.ts';",
      "export * from './src/features/world/worldBaseline.ts';",
      "export * from './src/features/world/worldRuntimeState.ts';",
    ].join('\n'),
    resolveDir: process.cwd(), sourcefile: 'world-asset-rules-runtime.ts', loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { createWorldBaselineSnapshot, createWorldRuntimeState, planAssetIntent, planCharacterDeathAssets } = await import(url);

const EDDARD = 'agot:Stark_3';
const JON = 'agot:Stark_7';
const THIEF = 'agot:Bolton_4';
const baseline = createWorldBaselineSnapshot({
  characters: [
    { id: EDDARD, alive: true, location: { locationId: 'b_winterfell' } },
    { id: JON, alive: true, location: { locationId: 'b_winterfell' } },
    { id: THIEF, alive: true, location: { locationId: 'b_winterfell' } },
  ],
  titles: [],
  assets: [
    { id: 'ice', kind: 'item', lawfulOwner: { type: 'character', characterId: EDDARD }, controller: { type: 'character', characterId: EDDARD }, custodian: { type: 'character', characterId: EDDARD }, placement: { type: 'character', characterId: EDDARD }, equippedPosition: { group: 'mainhand' }, status: 'normal' },
    { id: 'cloak', kind: 'item', lawfulOwner: { type: 'character', characterId: EDDARD }, controller: { type: 'character', characterId: EDDARD }, custodian: { type: 'character', characterId: EDDARD }, placement: { type: 'character', characterId: EDDARD }, equippedPosition: null, status: 'normal' },
    { id: 'wagon', kind: 'vehicle', lawfulOwner: { type: 'character', characterId: EDDARD }, controller: { type: 'character', characterId: EDDARD }, custodian: null, placement: { type: 'location', location: { locationId: 'b_winterfell' } }, equippedPosition: null, status: 'normal' },
    { id: 'book', kind: 'item', lawfulOwner: { type: 'character', characterId: EDDARD }, controller: { type: 'character', characterId: EDDARD }, custodian: { type: 'asset', assetId: 'wagon' }, placement: { type: 'asset', assetId: 'wagon' }, equippedPosition: null, status: 'normal' },
  ],
  knownLocationIds: ['b_winterfell'],
});
const context = { baseline, runtime: createWorldRuntimeState() };
const mutationTypes = (mutations) => mutations.map((mutation) => mutation.type);
const mutationOf = (mutations, type) => mutations.find((mutation) => mutation.type === type);

test('赠礼同步所有关系，偷窃保留法理所有权', () => {
  const gift = planAssetIntent({ kind: 'gift_asset', actorId: EDDARD, assetId: 'cloak', recipientId: JON, evidenceText: '把斗篷赠给琼恩' }, context);
  assert.deepEqual(mutationTypes(gift), [
    'asset.set-lawful-owner',
    'asset.set-controller',
    'asset.set-custodian',
    'asset.place',
    'asset.set-status',
  ]);
  assert.deepEqual(mutationOf(gift, 'asset.set-lawful-owner').owner, { type: 'character', characterId: JON });

  const theft = planAssetIntent({ kind: 'steal_asset', actorId: THIEF, assetId: 'cloak', evidenceText: '偷走斗篷' }, context);
  assert.equal(mutationOf(theft, 'asset.set-lawful-owner'), undefined);
  assert.deepEqual(mutationOf(theft, 'asset.set-controller').controller, { type: 'character', characterId: THIEF });
  assert.equal(mutationOf(theft, 'asset.set-status').status, 'stolen');
});

test('普通转移只改变直接保管和位置', () => {
  const transfer = planAssetIntent({ kind: 'transfer_asset', actorId: EDDARD, assetId: 'cloak', placement: { type: 'asset', assetId: 'wagon' }, evidenceText: '放入马车' }, context);
  assert.deepEqual(mutationTypes(transfer), ['asset.set-custodian', 'asset.place']);
  assert.deepEqual(mutationOf(transfer, 'asset.set-custodian').custodian, { type: 'asset', assetId: 'wagon' });
});

test('装备要求资产正由行动人物直接保管', () => {
  const equip = planAssetIntent({ kind: 'equip_asset', actorId: EDDARD, assetId: 'cloak', position: { group: 'torso', layer: 'outerwear' }, evidenceText: '披上斗篷' }, context);
  assert.deepEqual(mutationOf(equip, 'asset.equip').position, { group: 'torso', layer: 'outerwear' });
  assert.throws(() => planAssetIntent({ kind: 'equip_asset', actorId: JON, assetId: 'cloak', position: { group: 'torso', layer: 'outerwear' }, evidenceText: '远程披上斗篷' }, context), /不在人物直接保管范围/);
});

test('死亡只处理直接携带物，卸下装备并等待继承', () => {
  const death = planCharacterDeathAssets(EDDARD, context);
  assert.ok(death.some((mutation) => mutation.type === 'asset.unequip' && mutation.assetId === 'ice'));
  assert.ok(death.some((mutation) => mutation.type === 'asset.set-status' && mutation.assetId === 'ice' && mutation.status === 'inheritance_pending'));
  assert.ok(death.some((mutation) => mutation.type === 'asset.place' && mutation.assetId === 'cloak' && mutation.placement.type === 'location'));
  assert.equal(death.some((mutation) => mutation.assetId === 'book'), false, '车内物品继续留在马车容器中');
});
