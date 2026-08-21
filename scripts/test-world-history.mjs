import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/features/world/worldHistory.ts';",
      "export * from './src/store/useGameStore.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'world-history-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  advanceWorldDate,
  appendWorldTurn,
  compareWorldDates,
  createWorldHistoryState,
  setWorldDateForward,
  useGameStore,
} = await import(moduleUrl);

assert.equal(compareWorldDates({ year: 298, month: 5, day: 10 }, { year: 298, month: 5, day: 10 }), 0);
assert.equal(compareWorldDates({ year: 298, month: 5, day: 9 }, { year: 298, month: 5, day: 10 }), -1);
assert.equal(compareWorldDates({ year: 299, month: 1, day: 1 }, { year: 298, month: 12, day: 30 }), 1);
assert.deepEqual(
  advanceWorldDate({ year: 298, month: 12, day: 29 }, { days: 3 }),
  { year: 299, month: 1, day: 2 },
);
assert.deepEqual(
  advanceWorldDate({ year: 298, month: 11, day: 30 }, { months: 2, years: 1 }),
  { year: 300, month: 1, day: 30 },
);
assert.throws(
  () => advanceWorldDate({ year: 298, month: 5, day: 10 }, { days: -1 }),
  /不能倒退/,
);
assert.deepEqual(
  setWorldDateForward({ year: 298, month: 5, day: 10 }, { month: 6 }),
  { year: 298, month: 6, day: 10 },
);
assert.throws(
  () => setWorldDateForward({ year: 298, month: 5, day: 10 }, { month: 4 }),
  /不能倒退/,
);

const first = createWorldHistoryState({ year: 298, month: 5, day: 10 });
const second = createWorldHistoryState({ year: 298, month: 5, day: 10 });
first.canonical.example = { eventId: 'example', status: 'scheduled' };
assert.deepEqual(second.canonical, {});

const turn = {
  turn: 2,
  action: '与劳勃交谈',
  startedOn: { year: 298, month: 5, day: 10 },
  resolvedOn: { year: 298, month: 5, day: 10 },
  acceptedCommands: [],
  rejectedCommands: [],
  eventIds: [],
  canonicalTransitions: [],
};
const appended = appendWorldTurn(second, turn);
assert.equal(appended.turns.length, 1);
assert.equal('facts' in appended.turns[0], false, '世界账本不得持久化重复事实');
assert.deepEqual(appended.turns[0].eventIds, []);
assert.equal(second.turns.length, 0, 'appendWorldTurn must not mutate the previous snapshot');
assert.throws(() => appendWorldTurn(appended, turn), /回合.*已存在/);

const gameState = useGameStore.getState().gameState;
assert.deepEqual(gameState.worldHistory.startDate, {
  year: gameState.currentYear,
  month: gameState.currentMonth,
  day: gameState.currentDay,
});
assert.deepEqual(gameState.worldHistory.turns, []);

console.log('World history tests passed.');
