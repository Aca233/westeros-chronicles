import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/data/generated/canonicalTimeline.ts';",
      "export * from './src/features/world/canonicalTimeline.ts';",
      "export * from './src/data/presets.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'canonical-timeline-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  CANONICAL_TIMELINE,
  PRESET_SCENARIOS,
  initializeCanonicalStates,
  resolveDueCanonicalEvents,
} = await import(moduleUrl);

assert.equal(CANONICAL_TIMELINE.length, 54);
assert.equal(new Set(CANONICAL_TIMELINE.map((event) => event.id)).size, 54);
for (let index = 1; index < CANONICAL_TIMELINE.length; index += 1) {
  const left = CANONICAL_TIMELINE[index - 1].date;
  const right = CANONICAL_TIMELINE[index].date;
  const leftOrdinal = left.year * 360 + left.month * 30 + left.day;
  const rightOrdinal = right.year * 360 + right.month * 30 + right.day;
  assert.ok(leftOrdinal <= rightOrdinal, `${CANONICAL_TIMELINE[index].id} must not move backward`);
}
assert.ok(CANONICAL_TIMELINE.every((event) => event.participants.every((participant) => participant.name)));

const expectedPresets = new Map([
  ['ned_stark', { canonicalCharacterId: 'agot:Stark_3', startDate: { year: 298, month: 5, day: 10 } }],
  ['jon_snow', { canonicalCharacterId: 'agot:Stark_7', startDate: { year: 298, month: 6, day: 1 } }],
  ['daenerys_targaryen', { canonicalCharacterId: 'agot:Targaryen_9', startDate: { year: 298, month: 5, day: 10 } }],
]);
for (const preset of PRESET_SCENARIOS) {
  assert.deepEqual(
    { canonicalCharacterId: preset.canonicalCharacterId, startDate: preset.startDate },
    expectedPresets.get(preset.id),
  );
}

const fixture = [
  { id: 'past', date: { year: 298, month: 5, day: 5 }, title: '过去', summary: '', region: '', category: 'intrigue', participants: [], fatalities: [], consequences: [] },
  { id: 'due', date: { year: 298, month: 5, day: 15 }, title: '到期', summary: '', region: '', category: 'intrigue', participants: [{ name: '甲', characterId: 'agot:test_1' }], fatalities: [], consequences: [] },
  { id: 'future', date: { year: 298, month: 6, day: 1 }, title: '未来', summary: '', region: '', category: 'intrigue', participants: [], fatalities: [], consequences: [] },
];
const initial = initializeCanonicalStates(fixture, { year: 298, month: 5, day: 10 });
assert.equal(initial.past.status, 'historical');
assert.equal(initial.due.status, 'scheduled');
assert.equal(initial.future.status, 'scheduled');

const occurred = resolveDueCanonicalEvents(
  { schemaVersion: 1, startDate: { year: 298, month: 5, day: 10 }, canonical: initial, turns: [] },
  fixture,
  { year: 298, month: 5, day: 10 },
  { year: 298, month: 5, day: 20 },
  [],
);
assert.equal(occurred.transitions.length, 1);
assert.equal(occurred.transitions[0].status, 'occurred');
assert.equal(occurred.history.canonical.due.status, 'occurred');
assert.equal(initial.due.status, 'scheduled', 'scheduler must not mutate previous state');

const diverged = resolveDueCanonicalEvents(
  { schemaVersion: 1, startDate: { year: 298, month: 5, day: 10 }, canonical: initial, turns: [] },
  fixture,
  { year: 298, month: 5, day: 10 },
  { year: 298, month: 5, day: 20 },
  [{ id: 'death', turn: 2, date: { year: 298, month: 5, day: 12 }, source: 'character', kind: 'character.death', title: '甲死亡', summary: '', participantIds: ['agot:test_1'], commandTypes: ['KILL_CHARACTER'] }],
);
assert.equal(diverged.history.canonical.due.status, 'diverged');
assert.match(diverged.history.canonical.due.reason, /关键人物/);

const moved = resolveDueCanonicalEvents(
  { schemaVersion: 1, startDate: { year: 298, month: 5, day: 10 }, canonical: initial, turns: [] },
  fixture,
  { year: 298, month: 5, day: 10 },
  { year: 298, month: 5, day: 20 },
  [{ id: 'move', turn: 2, date: { year: 298, month: 5, day: 12 }, source: 'character', kind: 'command.move_character', title: '甲离开原地', summary: '', participantIds: ['agot:test_1'], commandTypes: ['MOVE_CHARACTER'] }],
);
assert.equal(moved.history.canonical.due.status, 'diverged');
assert.match(moved.history.canonical.due.reason, /地点|条件/);

const replaced = resolveDueCanonicalEvents(
  { schemaVersion: 1, startDate: { year: 298, month: 5, day: 10 }, canonical: initial, turns: [] },
  fixture,
  { year: 298, month: 5, day: 10 },
  { year: 298, month: 5, day: 20 },
  [{ id: 'replacement', turn: 2, date: { year: 298, month: 5, day: 12 }, source: 'system', kind: 'timeline.replaced', title: '新的世界事件取代旧节点', summary: '旧节点不再发生。', participantIds: ['agot:test_1'], commandTypes: [], canonicalEventId: 'due' }],
);
assert.equal(replaced.history.canonical.due.status, 'suppressed');
assert.match(replaced.history.canonical.due.reason, /取代/);

console.log('Canonical timeline tests passed.');
