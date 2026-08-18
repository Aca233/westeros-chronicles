import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

async function bundleModule(entryPoint) {
  const bundle = await build({ entryPoints: [entryPoint], bundle: true, write: false, format: 'esm', platform: 'node' });
  const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
  return import(url);
}

const { parseCharacterPortraitShard } = await bundleModule('src/features/characters/characterPortraitSchema.ts');
const { CharacterPortraitRepository, portraitShardForId } = await bundleModule('src/features/characters/characterPortraitRepository.ts');

test('portrait schema accepts local WebP refs and rejects unsafe mappings', () => {
  const parsed = parseCharacterPortraitShard({
    'agot:Stark_7': {
      characterId: 'agot:Stark_7',
      assetPath: '/assets/character-portraits/agot-stark-7-abcd.webp',
      attributionId: 'awoiaf:Jon_Snow',
      focalPoint: '50% 18%',
    },
  });
  assert.equal(parsed['agot:Stark_7']?.focalPoint, '50% 18%');
  assert.deepEqual(parseCharacterPortraitShard({}), {});
  assert.throws(() => parseCharacterPortraitShard({
    'agot:Stark_7': { characterId: 'agot:Other', assetPath: '/assets/character-portraits/x.webp', attributionId: 'x' },
  }), /头像/);
  assert.throws(() => parseCharacterPortraitShard({
    'agot:Stark_7': { characterId: 'agot:Stark_7', assetPath: 'https://example.com/x.webp', attributionId: 'x' },
  }), /头像/);
});

test('portrait repository hashes IDs, caches shards, and returns copies', async () => {
  const shard = await portraitShardForId('agot:Stark_7');
  const calls = [];
  const repository = new CharacterPortraitRepository('/portraits', async (path) => {
    calls.push(path);
    return {
      'agot:Stark_7': {
        characterId: 'agot:Stark_7', assetPath: '/assets/character-portraits/jon.webp', attributionId: 'awoiaf:Jon_Snow',
      },
    };
  });
  const first = await repository.get('agot:Stark_7');
  const second = await repository.get('agot:Stark_7');
  assert.equal(calls[0], `/portraits/shards/${shard}.json`);
  assert.equal(calls.length, 1);
  assert.notEqual(first, second);
  assert.equal(await repository.get('save:run:child'), undefined);
});
