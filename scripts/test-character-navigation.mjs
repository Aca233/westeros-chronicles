import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

async function bundleModule(entryPoint) {
  const bundle = await build({ entryPoints: [entryPoint], bundle: true, write: false, format: 'esm', platform: 'node' });
  const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
  return import(url);
}

const { characterNavigationReducer, initialCharacterNavigationState } = await bundleModule('src/features/characters/useCharacterNavigation.ts');

test('从玩家打开人物后可以逐层返回', () => {
  const first = characterNavigationReducer(initialCharacterNavigationState, { type: 'open', characterId: 'agot:a' });
  const second = characterNavigationReducer(first, { type: 'open', characterId: 'agot:b' });
  assert.deepEqual(second, { selectedCharacterId: 'agot:b', history: [null, 'agot:a'] });
  const back = characterNavigationReducer(second, { type: 'back' });
  assert.deepEqual(back, { selectedCharacterId: 'agot:a', history: [null] });
  assert.deepEqual(characterNavigationReducer(back, { type: 'back' }), initialCharacterNavigationState);
});

test('重复打开当前人物不会污染返回栈', () => {
  const state = characterNavigationReducer(initialCharacterNavigationState, { type: 'open', characterId: 'agot:a' });
  assert.equal(characterNavigationReducer(state, { type: 'open', characterId: 'agot:a' }), state);
});

test('回到自己会清空所有人物浏览历史', () => {
  const state = { selectedCharacterId: 'agot:b', history: [null, 'agot:a'] };
  assert.deepEqual(characterNavigationReducer(state, { type: 'player' }), initialCharacterNavigationState);
});
