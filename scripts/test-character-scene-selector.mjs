import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

async function bundleModule(entryPoint) {
  const bundle = await build({ entryPoints: [entryPoint], bundle: true, write: false, format: 'esm', platform: 'node' });
  const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
  return import(url);
}

const { selectSceneCharacters } = await bundleModule('src/features/characters/sceneCharacterSelector.ts');

function character(id, overrides = {}) {
  return { id, name: id, ...overrides };
}

const overloadedScene = {
  candidates: [
    character('agot:Zed'),
    character('agot:Named', { role: '被点名者' }),
    character('agot:Speaker', { role: '当前发言者' }),
    ...Array.from({ length: 11 }, (_, index) => character(`agot:Present_${String(index + 1).padStart(2, '0')}`, { isPresent: true })),
    character('agot:technical_dummy', { kind: 'technical', isPresent: true }),
    character('agot:Ancestor_1', { canonTier: 'genealogy', isPresent: true }),
  ],
  directlyNamedIds: ['agot:Named'],
  currentSpeakerId: 'agot:Speaker',
};

test('directly named and speaking characters survive the twelve-card cap', () => {
  const result = selectSceneCharacters(overloadedScene);

  assert.equal(result.full.length, 12);
  assert.ok(result.full.some((candidate) => candidate.id === 'agot:Named'));
  assert.ok(result.full.some((candidate) => candidate.id === 'agot:Speaker'));
  assert.equal(result.full.some((candidate) => candidate.id === 'agot:technical_dummy'), false);
  assert.equal(result.full.some((candidate) => candidate.id === 'agot:Ancestor_1'), false);
  assert.equal(result.omittedCount, result.compact.length);
});

test('equal relevance is ordered by stable character ID, independent of input order', () => {
  const input = {
    candidates: [character('agot:char_c'), character('agot:char_a'), character('agot:char_b')],
    presentCharacterIds: ['agot:char_a', 'agot:char_b', 'agot:char_c'],
  };
  const shuffled = { ...input, candidates: [...input.candidates].reverse() };

  const first = selectSceneCharacters(input);
  const second = selectSceneCharacters(shuffled);

  assert.deepEqual(first.full.map((candidate) => candidate.id), ['agot:char_a', 'agot:char_b', 'agot:char_c']);
  assert.deepEqual(second.full.map((candidate) => candidate.id), first.full.map((candidate) => candidate.id));
});

test('direct mentions and the current speaker are force-retained even when they exceed twelve', () => {
  const directlyNamedIds = Array.from({ length: 12 }, (_, index) => `agot:Named_${String(index + 1).padStart(2, '0')}`);
  const candidates = directlyNamedIds.map((id) => character(id));
  candidates.push(character('agot:Speaker'));
  candidates.push(character('agot:ordinary'));

  const result = selectSceneCharacters({
    candidates,
    directlyNamedIds,
    currentSpeakerId: 'agot:Speaker',
  });

  assert.equal(result.full.length, 13);
  assert.deepEqual(result.full.map((candidate) => candidate.id), [...directlyNamedIds, 'agot:Speaker']);
  assert.deepEqual(result.compact.map((candidate) => candidate.id), ['agot:ordinary']);
  assert.equal(result.omittedCount, 1);
});



test('the current speaker is retained before filling the remaining budget', () => {
  const ordinaryIds = Array.from({ length: 12 }, (_, index) => `agot:ordinary_${String(index + 1).padStart(2, '0')}`);
  const result = selectSceneCharacters({
    candidates: [
      ...ordinaryIds.map((id) => character(id)),
      character('agot:speaker_late'),
    ],
    currentSpeakerId: 'agot:speaker_late',
    presentCharacterIds: ordinaryIds,
    eventParticipantIds: ordinaryIds,
    strongRelationshipIds: ordinaryIds,
    recentInteractionIds: ordinaryIds,
  });

  assert.equal(result.full.length, 12);
  assert.ok(result.full.some((candidate) => candidate.id === 'agot:speaker_late'));
  assert.equal(result.omittedCount, 1);
});

test('a directly named character is retained even when its stable ID sorts last', () => {
  const ordinaryIds = Array.from({ length: 12 }, (_, index) => `agot:ordinary_${String(index + 1).padStart(2, '0')}`);
  const namedId = 'agot:zzzz_named';
  const result = selectSceneCharacters({
    candidates: [
      ...ordinaryIds.map((id) => character(id, { recentlyInteracted: true })),
      character(namedId),
    ],
    directlyNamedIds: [namedId],
    presentCharacterIds: ordinaryIds,
    eventParticipantIds: ordinaryIds,
    strongRelationshipIds: ordinaryIds,
  });

  assert.equal(result.full.length, 12);
  assert.ok(result.full.some((candidate) => candidate.id === namedId));
  assert.equal(result.omittedCount, 1);
});

test('excluded technical and genealogy candidates do not affect compact or omitted counts during overflow', () => {
  const eligibleIds = Array.from({ length: 13 }, (_, index) => `agot:eligible_${String(index + 1).padStart(2, '0')}`);
  const result = selectSceneCharacters({
    candidates: [
      ...eligibleIds.map((id) => character(id)),
      character('agot:technical_overflow', { kind: 'technical' }),
      character('agot:genealogy_overflow', { canonTier: 'genealogy' }),
    ],
  });

  assert.equal(result.full.length, 12);
  assert.deepEqual(result.compact.map((candidate) => candidate.id), ['agot:eligible_13']);
  assert.equal(result.omittedCount, 1);
  assert.equal(result.compact.some((candidate) => candidate.id === 'agot:technical_overflow'), false);
  assert.equal(result.compact.some((candidate) => candidate.id === 'agot:genealogy_overflow'), false);
});

test('relevance tiers order presence, event, relationship, and recent interaction deterministically', () => {
  const result = selectSceneCharacters({
    candidates: [
      character('agot:none'),
      character('agot:recent', { recentlyInteracted: true }),
      character('agot:relationship', { hasStrongRelationship: true }),
      character('agot:event'),
      character('agot:present'),
    ],
    presentCharacterIds: ['agot:present'],
    eventParticipantIds: ['agot:event'],
    strongRelationshipIds: ['agot:relationship'],
    recentInteractionIds: ['agot:recent'],
  });

  assert.deepEqual(result.full.map((candidate) => candidate.id), [
    'agot:present',
    'agot:event',
    'agot:relationship',
    'agot:recent',
    'agot:none',
  ]);
});

test('technical and genealogy candidates are excluded from full and compact cards', () => {
  const result = selectSceneCharacters({
    candidates: [
      character('agot:technical', { kind: 'technical', isPresent: true }),
      character('agot:ancestor', { canonTier: 'genealogy', isPresent: true }),
      character('agot:ordinary'),
      character('agot:overflow'),
    ],
    presentCharacterIds: ['agot:technical', 'agot:ancestor', 'agot:ordinary', 'agot:overflow'],
  });

  assert.deepEqual(result.full.map((candidate) => candidate.id), ['agot:ordinary', 'agot:overflow']);
  assert.equal(result.compact.some((candidate) => candidate.id === 'agot:technical'), false);
  assert.equal(result.full.some((candidate) => candidate.id === 'agot:ancestor'), false);
  assert.equal(result.compact.some((candidate) => candidate.id === 'agot:ancestor'), false);
});
