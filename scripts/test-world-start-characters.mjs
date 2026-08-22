import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/features/world/worldStartState.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { getStartCharacterState, projectStartCharacterFacts } = await import(moduleUrl);

const sourceCharacters = JSON.parse(await readFile('content/world/start-state/characters.json', 'utf8'));
const startState = { schemaVersion: 1, characters: sourceCharacters, titles: [], assets: [], sites: [], vehicles: [] };
const baseJon = {
  id: 'agot:Stark_7', rawId: 'Stark_7', canonTier: 'canon', name: '琼恩', born: true, alive: true,
  baseAttributes: {}, attributes: { diplomacy: 0, martial: 0, stewardship: 0, intrigue: 0, learning: 0, prowess: 0 },
  traits: [], spouseIds: [], relations: [], titleIds: [], titles: [], wounds: [], woundLevels: {}, relationships: [],
  memories: [], knowledge: [], items: [], hasDna: true, source: { file: 'fixture', line: 1 },
};

function characterFromViewpoint(_playerId, characterId) {
  const character = characterId === baseJon.id ? structuredClone(baseJon) : { ...structuredClone(baseJon), id: characterId };
  return projectStartCharacterFacts(character, startState, { characters: {} });
}

test('开局人物位置来自统一起点且与玩家视角无关', () => {
  const nedWorldJon = characterFromViewpoint('agot:Stark_3', 'agot:Stark_7');
  const danyWorldJon = characterFromViewpoint('agot:Targaryen_9', 'agot:Stark_7');
  assert.deepEqual(
    { locationId: nedWorldJon.locationId, ...(nedWorldJon.sceneLocation ? { sceneLocation: nedWorldJon.sceneLocation } : {}) },
    { locationId: 'b_winterfell' },
  );
  assert.equal(danyWorldJon.locationId, nedWorldJon.locationId);
  assert.equal(getStartCharacterState('agot:Stark_7', startState)?.currentActivity, 'idle');
});

test('已提交移动与活动覆盖固定起点位置', () => {
  const projected = projectStartCharacterFacts(baseJon, startState, {
    characters: {
      'agot:Stark_7': { location: { locationId: 'b_castle_black' }, currentActivity: 'travelling' },
    },
  });
  assert.equal(projected.locationId, 'b_castle_black');
  assert.equal(projected.currentActivity, 'travelling');
});

test('起点状态覆盖基础事实但不覆盖已提交生死状态', () => {
  const localState = {
    ...startState,
    characters: [{
      characterId: 'agot:Stark_7', location: { locationId: 'b_winterfell' }, currentActivity: 'idle',
      aliveOverride: true, wounds: ['开局旧伤'],
    }],
  };
  const projected = projectStartCharacterFacts({ ...baseJon, alive: false, wounds: ['资料伤势'] }, localState, {
    characters: { 'agot:Stark_7': { alive: false } },
  });
  assert.equal(projected.alive, false);
  assert.deepEqual(projected.wounds, ['开局旧伤']);
});
