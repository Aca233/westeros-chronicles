import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/services/turnResolution.ts';",
      "export { parseTurnResolutionOutput as directParseTurnResolutionOutput, buildTurnResolutionMessages as directBuildTurnResolutionMessages, requestTurnResolution as directRequestTurnResolution } from './src/services/turn/resolutionProtocol.ts';",
      "export * from './src/services/turnNarration.ts';",
      "export { streamNarrativeCompletion } from './src/services/api.ts';",
      "export * from './src/data/presets.ts';",
      "export * from './src/features/items/worldArtifacts.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'turn-pipeline-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  PRESET_SCENARIOS,
  buildSettledNarrativeMessages,
  buildTurnResolutionMessages,
  directBuildTurnResolutionMessages,
  directParseTurnResolutionOutput,
  directRequestTurnResolution,
  parseTurnResolutionOutput,
  requestTurnResolution,
  createInitialAgotArtifactWorldState,
  settleTurnDraft,
  streamNarrativeCompletion,
} = await import(url);

assert.equal(typeof settleTurnDraft, 'function');
assert.equal(parseTurnResolutionOutput, directParseTurnResolutionOutput);
assert.equal(buildTurnResolutionMessages, directBuildTurnResolutionMessages);
assert.equal(requestTurnResolution, directRequestTurnResolution);

const lord = structuredClone(PRESET_SCENARIOS[0].initialLord);
const gameState = {
  saveFormatVersion: 9,
  currentYear: 298, currentMonth: 5, currentDay: 10, currentSeason: '暮春', turnCount: 1,
  lord, turns: [],
  worldCharacters: { runId: 'run_test', datasetHash: 'f'.repeat(64), revision: 0 },
  worldArtifacts: createInitialAgotArtifactWorldState(),
  worldHistory: { schemaVersion: 1, startDate: { year: 298, month: 5, day: 10 }, canonical: {}, turns: [] },
  worldRuntime: { schemaVersion: 1, revision: 0, characters: {}, titles: {}, assets: {}, events: [], pendingTransactions: [] },
  worldFlags: {}, isGameOver: false,
};
const ARYA = 'agot:Arya_1';
const SANSA = 'agot:Sansa_1';
const context = {
  characters: [
    { id: ARYA, alive: true, locationId: 'b_winterfell', traits: [], spouseIds: [], titles: [], wounds: [] },
    { id: SANSA, alive: true, locationId: 'b_red_keep', traits: [], spouseIds: [], titles: [], wounds: [] },
  ],
  currentLocationId: 'b_winterfell',
  presentCharacterIds: [ARYA],
  knownLocationIds: ['b_winterfell', 'b_red_keep'],
};
const settled = settleTurnDraft({
  gameState,
  actionText: '要求两人立刻结婚并伤害珊莎',
  nextTurnNumber: 2,
  draft: {
    outcomeSummary: '两人已经结婚，珊莎也受了伤。',
    stateCommands: [
      { type: 'MODIFY_PRESTIGE', delta: 1 },
      { type: 'MARRY_CHARACTERS', characterId: ARYA, spouseId: SANSA },
      { type: 'INJURE_CHARACTER', characterId: SANSA, zone: 'arms', level: 'minor', woundText: '手臂擦伤' },
    ],
  },
  pendingTransactions: [],
  characterContext: context,
  timeline: [],
});
assert.deepEqual(settled.acceptedCommands.map((command) => command.type), ['MODIFY_PRESTIGE']);
assert.deepEqual(settled.rejectedCommands.map((entry) => entry.type), ['MARRY_CHARACTERS', 'INJURE_CHARACTER']);
assert.equal(settled.characterEvents.length, 0);
assert.equal(settled.updatedLord.prestige, lord.prestige + 1);
assert.equal(settled.worldHistory.turns.length, 1);
assert.deepEqual(settled.worldHistory.turns[0].acceptedCommands.map((command) => command.type), ['MODIFY_PRESTIGE']);
assert.equal(settled.worldRuntime.revision, settled.worldHistory.turns.length);
assert.equal(settled.transactionId.startsWith('turn:'), true);


const rejectedOnly = settleTurnDraft({
  gameState,
  actionText: '要求远在君临的珊莎立刻受伤',
  nextTurnNumber: 2,
  draft: {
    outcomeSummary: '珊莎受了伤。',
    stateCommands: [
      { type: 'INJURE_CHARACTER', characterId: SANSA, zone: 'arms', level: 'minor', woundText: '手臂擦伤' },
    ],
  },
  pendingTransactions: [],
  characterContext: context,
  timeline: [],
});
assert.equal(rejectedOnly.worldHistory.turns.length, 1);
assert.equal(rejectedOnly.worldRuntime.revision, 1);
assert.equal(rejectedOnly.worldRuntime.revision, rejectedOnly.worldHistory.turns.length);

const messages = buildSettledNarrativeMessages({
  gameState,
  actionText: '要求两人立刻结婚并伤害珊莎',
  facts: settled.resolvedFacts,
  recentTurns: [],
});
const prompt = messages.map((message) => message.content).join('\n');
assert.match(prompt, /MODIFY_PRESTIGE/);
assert.doesNotMatch(prompt, /MARRY_CHARACTERS|INJURE_CHARACTER|两人已经结婚|珊莎也受了伤/);
assert.match(prompt, /只能叙述程序已确认的事实/);

const offlineRaw = await streamNarrativeCompletion(messages, {
  provider: 'deepseek', baseUrl: '', apiKey: '', model: '', temperature: 0.7,
}, () => {});
assert.match(offlineRaw, /<narrate>[\s\S]*<\/narrate>/);
assert.doesNotMatch(offlineRaw, /<state_cmd>|MARRY_CHARACTERS|INJURE_CHARACTER/);
assert.match(offlineRaw, /MODIFY_PRESTIGE|威仪/);

console.log('Turn pipeline tests passed.');
