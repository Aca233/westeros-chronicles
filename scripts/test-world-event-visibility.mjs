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
const debugBundle = await build({
  stdin: {
    contents: "export * from './src/features/debug/worldEventDebug.ts';",
    resolveDir: process.cwd(),
    sourcefile: 'world-event-debug-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const debugUrl = `data:text/javascript;base64,${Buffer.from(debugBundle.outputFiles[0].text).toString('base64')}`;
const { selectVisibleWorldEvents, playerWorldEventViewer } = await import(url);
const { selectWorldEventsForView, hiddenWorldEventIdsForPlayer } = await import(debugUrl);

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

assert.deepEqual(
  selectWorldEventsForView(events, { kind: 'player', characterId: playerId }, false).map((event) => event.id),
  ['public', 'known-secret'],
);
assert.deepEqual(
  selectWorldEventsForView(events, { kind: 'player', characterId: playerId }, true).map((event) => event.id),
  events.map((event) => event.id),
);
assert.deepEqual(
  [...hiddenWorldEventIdsForPlayer(events, { kind: 'player', characterId: playerId })].sort(),
  ['hidden-secret', 'invalid-visibility', 'legacy-secret'],
);

const playerUiFiles = [
  'src/components/StoryFeed.tsx',
  'src/components/Ck3CharacterWindow.tsx',
  'src/components/TvTimelineModal.tsx',
];
for (const file of playerUiFiles) {
  const source = await readFile(file, 'utf8');
  assert.match(source, /selectWorldEventsForView/, `${file} must use the shared visibility selector`);
}
const politicalSource = await readFile('src/features/map/politicalProjection.ts', 'utf8');
assert.match(politicalSource, /selectVisibleWorldEvents/, 'politicalProjection must use the shared visibility selector');
const worldTurnContextSource = await readFile('src/features/world/worldTurnContext.ts', 'utf8');
assert.match(worldTurnContextSource, /selectVisibleWorldEvents/, 'worldTurnContext must use the shared visibility selector');
assert.match(worldTurnContextSource, /playerWorldEventViewer\(gameState\)/, 'LLM context must stay on the player viewer');
assert.doesNotMatch(worldTurnContextSource, /selectWorldEventsForView|kind: 'system'|debugEnabled/, 'LLM context must not receive debug x-ray');
const mapDrawerSource = await readFile('src/features/map/MapDrawer.tsx', 'utf8');
assert.match(mapDrawerSource, /playerWorldEventViewer/, 'MapDrawer must supply the current player viewer to political projection');
assert.match(mapDrawerSource, /debugEnabled \? \{ kind: 'system' \} : playerWorldEventViewer/, 'MapDrawer may x-ray only when debug is enabled');

console.log('World event visibility tests passed.');
