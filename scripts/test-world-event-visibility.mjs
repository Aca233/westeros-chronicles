import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: "export * from './src/features/world/worldEventVisibility.ts';",
    resolveDir: process.cwd(),
    sourcefile: 'world-event-visibility-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { selectVisibleWorldEvents, playerWorldEventViewer } = await import(url);

const playerId = 'agot:player';
const events = [
  { id: 'public', visibility: 'public', knownBy: [] },
  { id: 'known-secret', visibility: 'secret', knownBy: [playerId] },
  { id: 'hidden-secret', visibility: 'secret', knownBy: ['agot:other'] },
  { id: 'legacy-secret', visibility: 'secret' },
  { id: 'invalid-visibility', visibility: 'private', knownBy: [playerId] },
].map((partial, index) => ({
  transactionId: 'tx',
  turn: index + 1,
  date: { year: 298, month: 5, day: 10 + index },
  type: 'test.event',
  actorIds: [],
  subjectRefs: [],
  reason: partial.id,
  source: 'system_rule',
  ...partial,
}));

const playerVisible = selectVisibleWorldEvents(events, { kind: 'player', characterId: playerId });
assert.deepEqual(playerVisible.map((event) => event.id), ['public', 'known-secret']);
assert.notEqual(playerVisible, events, 'selector must return a new array');
assert.deepEqual(events.map((event) => event.id), ['public', 'known-secret', 'hidden-secret', 'legacy-secret', 'invalid-visibility'], 'authoritative ledger must remain unchanged');

assert.deepEqual(
  selectVisibleWorldEvents(events, { kind: 'player' }).map((event) => event.id),
  ['public'],
  'an unidentified player may only see public events',
);
assert.deepEqual(
  selectVisibleWorldEvents(events, { kind: 'system' }).map((event) => event.id),
  events.map((event) => event.id),
  'system projections retain the complete authoritative ledger',
);
assert.deepEqual(
  playerWorldEventViewer({ lord: { canonicalCharacterId: undefined }, worldCharacters: { runId: 'run-7' } }),
  { kind: 'player', characterId: 'save:run-7:player' },
);

const integrationFiles = [
  'src/components/StoryFeed.tsx',
  'src/components/Ck3CharacterWindow.tsx',
  'src/components/TvTimelineModal.tsx',
  'src/features/map/politicalProjection.ts',
  'src/features/world/worldTurnContext.ts',
];
for (const file of integrationFiles) {
  const source = await readFile(file, 'utf8');
  assert.match(source, /selectVisibleWorldEvents/, `${file} must use the shared visibility selector`);
}
const mapDrawerSource = await readFile('src/features/map/MapDrawer.tsx', 'utf8');
assert.match(mapDrawerSource, /playerWorldEventViewer/, 'MapDrawer must supply the current player viewer to political projection');

console.log('World event visibility tests passed.');
