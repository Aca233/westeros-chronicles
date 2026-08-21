import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['scripts/fixtures/world-travel-linkage-entry.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  commitWorldTransaction,
  createWorldBaselineSnapshot,
  createWorldRuntimeState,
  planExplicitArrivalTransaction,
  planJourneyTransaction,
  projectWorldCharacter,
  resolveAssetMapLocation,
} = await import(moduleUrl);

const PLAYER = 'agot:Stark_3';
const COMPANION = 'agot:Snow_1';

function baseline() {
  return createWorldBaselineSnapshot({
    characters: [
      { id: PLAYER, alive: true, location: { locationId: 'b_winterfell' } },
      { id: COMPANION, alive: true, location: { locationId: 'b_winterfell' } },
    ],
    titles: [],
    assets: [
      {
        id: 'vehicle:wagon', kind: 'vehicle',
        lawfulOwner: { type: 'character', characterId: PLAYER },
        controller: { type: 'character', characterId: PLAYER },
        custodian: null,
        placement: { type: 'location', location: { locationId: 'b_winterfell' } },
        equippedPosition: null, status: 'normal',
      },
      {
        id: 'item:book', kind: 'item',
        lawfulOwner: { type: 'character', characterId: PLAYER },
        controller: { type: 'character', characterId: PLAYER },
        custodian: { type: 'asset', assetId: 'vehicle:wagon' },
        placement: { type: 'asset', assetId: 'vehicle:wagon' },
        equippedPosition: null, status: 'normal',
      },
    ],
    knownLocationIds: ['b_winterfell', 'b_castle_black'],
  });
}

function state() {
  return {
    runtime: createWorldRuntimeState(),
    items: { schemaVersion: 1, instances: {}, placements: {}, sites: {}, vehicles: {} },
    journey: {
      routePlan: {
        ok: true, id: 'winterfell-castle-black', from: 'b_winterfell', to: 'b_castle_black',
        preference: 'fastest', travelMode: 'horse', via: [], season: 'summer',
        legs: [{ index: 0, edgeId: 'road', from: 'b_winterfell', to: 'b_castle_black', distance: 100, days: 2, cost: 0, risk: 0.1, roadLevel: 'major', crossing: 'land', seasonTags: [], fromPoint: { mapX: 0, mapY: 0 }, toPoint: { mapX: 1, mapY: 1 } }],
        totalDistance: 100, totalDays: 2, totalCost: 0, totalRisk: 0.1, graphHash: 'a'.repeat(64),
      },
      currentLeg: 0, progressDays: 0, status: 'travelling', companions: [COMPANION], vehicleIds: ['wagon'],
      startedAt: { year: 298, month: 5, day: 10 },
    },
    date: { year: 298, month: 5, day: 10 },
  };
}

function arrivalPatch(companionId = COMPANION) {
  return {
    journey: { ...structuredClone(state().journey), currentLeg: 1, progressDays: 0, status: 'arrived' },
    playerLocation: { locationId: 'b_castle_black' },
    vehicleLocations: { wagon: { locationId: 'b_castle_black' } },
    characterMoves: [{ characterId: companionId, locationId: 'b_castle_black' }],
    reachedLocationIds: ['b_castle_black'],
    elapsedDays: 2,
    changed: true,
  };
}

test('抵达事务原子移动玩家、同行者、车辆，并让车内物品随容器解析位置', () => {
  const base = baseline();
  const input = state();
  const tx = planJourneyTransaction(arrivalPatch(), {
    playerId: PLAYER,
    turn: 2,
    transactionId: 'tx:travel:arrival',
    source: 'ui_action',
    reason: '队伍抵达黑城堡',
    currentDate: { year: 298, month: 5, day: 10 },
  });
  const result = commitWorldTransaction(input, base, tx);
  assert.equal(result.ok, true);
  assert.equal(projectWorldCharacter(base, result.state.runtime, PLAYER).location.locationId, 'b_castle_black');
  assert.equal(projectWorldCharacter(base, result.state.runtime, COMPANION).location.locationId, 'b_castle_black');
  assert.deepEqual(resolveAssetMapLocation(base, result.state.runtime, 'vehicle:wagon'), { locationId: 'b_castle_black' });
  assert.deepEqual(resolveAssetMapLocation(base, result.state.runtime, 'item:book'), { locationId: 'b_castle_black' });
  assert.equal(result.state.date.day, 12);
  assert.equal(result.state.runtime.revision, 1);
  assert.equal(result.state.journey.status, 'arrived');
});

test('未知同行者使整笔旅行拒绝，玩家、车辆和日期均不发生部分变化', () => {
  const base = baseline();
  const input = state();
  const tx = planJourneyTransaction(arrivalPatch('agot:Missing_1'), {
    playerId: PLAYER,
    turn: 2,
    transactionId: 'tx:travel:invalid-companion',
    source: 'ui_action',
    reason: '错误的同行者名单',
    currentDate: { year: 298, month: 5, day: 10 },
  });
  const result = commitWorldTransaction(input, base, tx);
  assert.equal(result.ok, false);
  assert.equal(result.state, input);
  assert.equal(projectWorldCharacter(base, input.runtime, PLAYER).location.locationId, 'b_winterfell');
  assert.deepEqual(resolveAssetMapLocation(base, input.runtime, 'vehicle:wagon'), { locationId: 'b_winterfell' });
  assert.deepEqual(input.date, { year: 298, month: 5, day: 10 });
});


function explicitWorld() {
  return {
    playerLocation: { locationId: 'b_winterfell' },
    vehicles: {
      wagon: {
        id: 'wagon', name: '北境马车', type: 'wagon',
        location: { locationId: 'b_winterfell' }, locationLabel: '临冬城', capacity: 10, description: '',
      },
    },
    itemPlacements: { book: { type: 'vehicle', vehicleId: 'wagon' } },
    knownLocationIds: new Set(['b_winterfell', 'b_castle_black']),
    characters: [{ id: COMPANION, alive: true, locationId: 'b_winterfell' }],
  };
}

function routePlan() {
  return structuredClone(state().journey.routePlan);
}

function travelContext(id) {
  return {
    playerId: PLAYER,
    turn: 2,
    transactionId: id,
    source: 'player_input',
    reason: '玩家明确叙述旅行时间与抵达事实',
    currentDate: { year: 298, month: 5, day: 10 },
  };
}

test('显式跳时在时间充足时抵达，时间不足但明确出发时只推进合法进度', () => {
  const arrived = planExplicitArrivalTransaction({
    world: explicitWorld(), routePlan: routePlan(), declaredElapsedDays: 5,
    assertedDeparture: true, assertedArrival: true, companions: [COMPANION], vehicleIds: ['wagon'],
  }, travelContext('tx:explicit:arrival'));
  assert.equal(arrived.nextJourney.status, 'arrived');
  assert.deepEqual(arrived.dateAdvance, { days: 5 });
  assert.ok(arrived.mutations.some((mutation) => mutation.type === 'character.move' && mutation.characterId === PLAYER && mutation.location.locationId === 'b_castle_black'));

  const partial = planExplicitArrivalTransaction({
    world: explicitWorld(), routePlan: routePlan(), declaredElapsedDays: 1,
    assertedDeparture: true, assertedArrival: true, companions: [COMPANION], vehicleIds: ['wagon'],
  }, travelContext('tx:explicit:partial'));
  assert.equal(partial.nextJourney.status, 'travelling');
  assert.equal(partial.nextJourney.progressDays, 1);
  assert.deepEqual(partial.dateAdvance, { days: 1 });
  assert.ok(partial.mutations.some((mutation) => mutation.type === 'character.move' && mutation.characterId === PLAYER && mutation.location.locationId === 'b_winterfell'));
});

test('只有抵达断言、没有有效出发事实且时间不足时拒绝瞬移', () => {
  assert.throws(() => planExplicitArrivalTransaction({
    world: explicitWorld(), routePlan: routePlan(), declaredElapsedDays: 1,
    assertedDeparture: false, assertedArrival: true, companions: [COMPANION], vehicleIds: ['wagon'],
  }, travelContext('tx:explicit:invalid')), /不能直接抵达/);
});
