import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { build } from 'esbuild'

const contractSource = `
import type { CharacterId as DomainCharacterId } from './src/domain/characterId.ts';
import type { CharacterId as LegacyCharacterId } from './src/features/characters/types.ts';
import type { LordAttributes } from './src/domain/character.ts';
import type { BodyZoneKey, WoundLevel } from './src/domain/body.ts';
import type { WorldDate as DomainWorldDate } from './src/domain/worldDate.ts';
import type { WorldDate as LegacyWorldDate } from './src/features/world/worldHistory.ts';
import type { WorldLocationRef as DomainLocation } from './src/domain/worldLocation.ts';
import type { WorldLocationRef as LegacyLocation } from './src/features/map/types.ts';

const character: DomainCharacterId = 'agot:Stark_3';
const legacyCharacter: LegacyCharacterId = character;
const attributes: LordAttributes = { diplomacy: 1, martial: 2, stewardship: 3, intrigue: 4, learning: 5, prowess: 6 };
const zone: BodyZoneKey = 'head';
const wound: WoundLevel = 'minor';
const date: DomainWorldDate = { year: 298, month: 5, day: 10 };
const legacyDate: LegacyWorldDate = date;
const location: DomainLocation = { locationId: 'b_winterfell' };
const legacyLocation: LegacyLocation = location;
void [legacyCharacter, attributes, zone, wound, legacyDate, legacyLocation];
`

test('领域叶节点类型可直接导入且旧模块保持兼容 re-export', async () => {
  await build({
    stdin: { contents: contractSource, resolveDir: process.cwd(), sourcefile: 'domain-contract.ts', loader: 'ts' },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
  })

  const characterTypes = readFileSync('src/features/characters/types.ts', 'utf8')
  const worldHistory = readFileSync('src/features/world/worldHistory.ts', 'utf8')
  const mapTypes = readFileSync('src/features/map/types.ts', 'utf8')
  const gameTypes = readFileSync('src/types/game.ts', 'utf8')
  assert.match(characterTypes, /export type \{ CharacterId \} from ['"]\.\.\/\.\.\/domain\/characterId['"]/)
  assert.match(worldHistory, /export type \{ WorldDate, WorldDateAdvance \} from ['"]\.\.\/\.\.\/domain\/worldDate['"]/)
  assert.match(mapTypes, /export type \{ WorldLocationRef \} from ['"]\.\.\/\.\.\/domain\/worldLocation['"]/)
  assert.match(gameTypes, /export type \{ LordAttributes \} from ['"]\.\.\/domain\/character['"]/)
  assert.match(gameTypes, /export type \{ BodyZoneKey, WoundLevel \} from ['"]\.\.\/domain\/body['"]/)
})
