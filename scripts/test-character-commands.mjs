import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

async function bundleModule(entryPoint) {
  const bundle = await build({
    stdin: {
      contents: `export * from './${entryPoint}'; export { preloadItemCatalog } from './src/data/itemDefinitions.ts';`,
      resolveDir: process.cwd(),
      sourcefile: 'character-commands-test-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  });
  const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
  const module = await import(url);
  await module.preloadItemCatalog();
  return module;
}

const { validateCharacterCommand } = await bundleModule('src/features/characters/characterCommandValidator.ts');
const { validateCharacterCommandBatch, isCharacterStateCommand } = await bundleModule('src/services/stateReducer.ts');
const { InMemoryCharacterEventStore, appendCharacterEventRows, projectCharacterEvents } = await bundleModule('src/features/characters/characterEventStore.ts');
const { resolveCharacter } = await bundleModule('src/features/characters/characterProjector.ts');

const ARYA = 'agot:Arya_1';
const SANSA = 'agot:Sansa_1';
const JON = 'save:run_1:Jon_1';
const WINTERFELL = 'b_winterfell';
const RIVERLANDS = 'b_riverlands';

function character(id, overrides = {}) {
  return {
    id,
    alive: true,
    locationId: WINTERFELL,
    traits: [],
    spouseIds: [],
    titles: [],
    wounds: [],
    items: [],
    ...overrides,
  };
}

function context(overrides = {}) {
  return {
    characters: [character(ARYA), character(SANSA), character(JON)],
    currentLocationId: WINTERFELL,
    presentCharacterIds: new Set([ARYA, SANSA]),
    knownLocationIds: new Set([WINTERFELL, RIVERLANDS]),
    currentTurn: 1,
    commandSequence: 0,
    ...overrides,
  };
}

function assertRejected(result, reason) {
  assert.equal(result.ok, false);
  assert.deepEqual(result.events, []);
  assert.match(result.reason, reason);
}



test('人物普通物品命令生成严格区分穿戴与保管的事件', () => {
  const tunic = {
    instanceId: 'npc:Arya_1:story:tunic-1',
    definitionId: 'clothing.common_linen_tunic',
    ownerId: ARYA,
    custody: { type: 'character', characterId: ARYA },
    equippedPosition: { group: 'torso', layer: 'garment' },
    source: 'story_event',
  };
  const itemContext = context({
    characters: [character(ARYA, { items: [tunic] }), character(SANSA), character(JON)],
  });

  const equip = validateCharacterCommand({
    type: 'CHARACTER_ITEM_EQUIP', characterId: ARYA, instanceId: tunic.instanceId,
    position: { group: 'torso', layer: 'garment' },
  }, itemContext);
  assert.equal(equip.ok, true);
  assert.deepEqual(equip.events[0].event, {
    type: 'ITEM_EQUIP', instanceId: tunic.instanceId, position: { group: 'torso', layer: 'garment' },
  });

  const unequip = validateCharacterCommand({
    type: 'CHARACTER_ITEM_UNEQUIP', characterId: ARYA, instanceId: tunic.instanceId,
  }, itemContext);
  assert.equal(unequip.ok, true);
  assert.deepEqual(unequip.events[0].event, { type: 'ITEM_UNEQUIP', instanceId: tunic.instanceId });

  const lose = validateCharacterCommand({
    type: 'CHARACTER_ITEM_LOSE', characterId: ARYA, instanceId: tunic.instanceId,
  }, itemContext);
  assert.equal(lose.ok, true);
  assert.deepEqual(lose.events[0].event, { type: 'ITEM_LOSE', instanceId: tunic.instanceId });
});

test('人物获得物品验证定义与实例 ID，且新物品不自动穿戴', () => {
  const acquire = validateCharacterCommand({
    type: 'CHARACTER_ITEM_ACQUIRE', characterId: ARYA,
    definitionId: 'clothing.common_linen_tunic', instanceId: 'npc:Arya_1:story:tunic-2',
  }, context());
  assert.equal(acquire.ok, true);
  assert.deepEqual(acquire.events[0].event, {
    type: 'ITEM_ACQUIRE',
    item: {
      instanceId: 'npc:Arya_1:story:tunic-2',
      definitionId: 'clothing.common_linen_tunic',
      ownerId: ARYA,
      custody: { type: 'character', characterId: ARYA },
      source: 'story_event',
    },
  });
  assert.equal('equippedPosition' in acquire.events[0].event.item, false);

  assertRejected(validateCharacterCommand({
    type: 'CHARACTER_ITEM_ACQUIRE', characterId: ARYA,
    definitionId: 'missing.definition', instanceId: 'npc:Arya_1:story:missing',
  }, context()), /物品定义|不存在/);

  assertRejected(validateCharacterCommand({
    type: 'CHARACTER_ITEM_ACQUIRE', characterId: ARYA,
    definitionId: 'clothing.common_linen_tunic', instanceId: 'duplicate-instance',
  }, context({ characters: [character(ARYA, { items: [{
    instanceId: 'duplicate-instance', definitionId: 'clothing.common_linen_tunic', ownerId: ARYA,
    custody: { type: 'character', characterId: ARYA }, source: 'story_event',
  }] }), character(SANSA), character(JON)] })), /实例.*已经存在|重复/);
});

test('人物穿戴命令拒绝未知实例、错误槽位和非本人保管物品', () => {
  const footwear = {
    instanceId: 'npc:Arya_1:story:shoes', definitionId: 'footwear.leather_turnshoes', ownerId: ARYA,
    custody: { type: 'character', characterId: ARYA }, source: 'story_event',
  };
  const itemContext = context({ characters: [character(ARYA, { items: [footwear] }), character(SANSA), character(JON)] });
  assertRejected(validateCharacterCommand({
    type: 'CHARACTER_ITEM_EQUIP', characterId: ARYA, instanceId: 'unknown-item',
    position: { group: 'legs', layer: 'footwear' },
  }, itemContext), /物品实例不存在/);
  assertRejected(validateCharacterCommand({
    type: 'CHARACTER_ITEM_EQUIP', characterId: ARYA, instanceId: footwear.instanceId,
    position: { group: 'head' },
  }, itemContext), /装备位置|槽位/);

  const heldBySansa = { ...footwear, custody: { type: 'character', characterId: SANSA } };
  assertRejected(validateCharacterCommand({
    type: 'CHARACTER_ITEM_EQUIP', characterId: ARYA, instanceId: footwear.instanceId,
    position: { group: 'legs', layer: 'footwear' },
  }, context({ characters: [character(ARYA, { items: [heldBySansa] }), character(SANSA), character(JON)] })), /保管|不在人物手中/);
});

test('人物物品转移原子生成转出与转入事件，并拒绝非保管人转移', () => {
  const item = {
    instanceId: 'npc:Arya_1:story:cloak', definitionId: 'clothing.plain_wool_cloak', ownerId: ARYA,
    custody: { type: 'character', characterId: ARYA }, equippedPosition: { group: 'torso', layer: 'outerwear' },
    source: 'story_event',
  };
  const itemContext = context({ characters: [character(ARYA, { items: [item] }), character(SANSA), character(JON)] });
  const transfer = validateCharacterCommand({
    type: 'CHARACTER_ITEM_TRANSFER', fromCharacterId: ARYA, toCharacterId: SANSA, instanceId: item.instanceId,
  }, itemContext);
  assert.equal(transfer.ok, true);
  assert.deepEqual(transfer.events, [
    { id: '1:0:0', characterId: ARYA, event: { type: 'ITEM_TRANSFER_OUT', instanceId: item.instanceId } },
    { id: '1:0:1', characterId: SANSA, event: { type: 'ITEM_TRANSFER_IN', item: {
      instanceId: item.instanceId, definitionId: item.definitionId, ownerId: SANSA,
      custody: { type: 'character', characterId: SANSA }, source: 'story_event',
    } } },
  ]);

  const siteItem = { ...item, custody: { type: 'site', siteId: 'winterfell-wardrobe' } };
  assertRejected(validateCharacterCommand({
    type: 'CHARACTER_ITEM_TRANSFER', fromCharacterId: ARYA, toCharacterId: SANSA, instanceId: item.instanceId,
  }, context({ characters: [character(ARYA, { items: [siteItem] }), character(SANSA), character(JON)] })), /保管|不在人物手中/);
});

test('同批人物物品命令看见前序结果，且不会落入玩家 ITEM 命令路径', () => {
  const commands = [
    { type: 'CHARACTER_ITEM_ACQUIRE', characterId: ARYA, definitionId: 'clothing.common_linen_tunic', instanceId: 'batch-tunic' },
    { type: 'CHARACTER_ITEM_EQUIP', characterId: ARYA, instanceId: 'batch-tunic', position: { group: 'torso', layer: 'garment' } },
  ];
  assert.equal(isCharacterStateCommand(commands[0]), true);
  assert.equal(commands[0].type.startsWith('ITEM_'), false);
  const batch = validateCharacterCommandBatch(commands, context(), 3);
  assert.deepEqual(batch.rejected, []);
  assert.equal(batch.events.length, 2);
  assert.deepEqual(batch.context.characters.find((entry) => entry.id === ARYA).items, [{
    instanceId: 'batch-tunic', definitionId: 'clothing.common_linen_tunic', ownerId: ARYA,
    custody: { type: 'character', characterId: ARYA }, source: 'story_event',
    equippedPosition: { group: 'torso', layer: 'garment' },
  }]);
});

test('拒绝不存在人物的移动命令并返回中文原因', () => {
  const result = validateCharacterCommand({
    type: 'MOVE_CHARACTER',
    characterId: 'agot:Missing_1',
    locationId: RIVERLANDS,
  }, context());

  assertRejected(result, /人物不存在/);
});

test('拒绝已死亡人物的伤势命令且不产生事件', () => {
  const result = validateCharacterCommand({
    type: 'INJURE_CHARACTER',
    characterId: ARYA,
    zone: 'torso',
    level: 'heavy',
    woundText: '胸口贯穿伤',
  }, context({
    characters: [character(ARYA, { alive: false, deathReason: '战死' }), character(SANSA), character(JON)],
  }));

  assertRejected(result, /已死亡/);
});

test('拒绝不在场的婚姻命令且不产生单边事件', () => {
  const result = validateCharacterCommand({
    type: 'MARRY_CHARACTERS',
    characterId: ARYA,
    spouseId: JON,
  }, context());

  assertRejected(result, /不在场/);
});

test('允许合法移动并生成一个稳定人物事件', () => {
  const result = validateCharacterCommand({
    type: 'MOVE_CHARACTER',
    characterId: ARYA,
    locationId: RIVERLANDS,
    sceneLocation: '渡口营地',
    reason: '奉命前往河间地',
  }, context());

  assert.equal(result.ok, true);
  assert.equal(result.reason, undefined);
  assert.deepEqual(result.events, [{
    id: '1:0:0',
    characterId: ARYA,
    event: { type: 'MOVE', locationId: RIVERLANDS, sceneLocation: '渡口营地', reason: '奉命前往河间地' },
  }]);
});

test('允许合法死亡但拒绝重复死亡', () => {
  const death = validateCharacterCommand({
    type: 'KILL_CHARACTER',
    characterId: ARYA,
    cause: '决斗中被杀',
    killerId: SANSA,
  }, context());
  assert.equal(death.ok, true);
  assert.equal(death.events.length, 1);
  assert.deepEqual(death.events[0].event, {
    type: 'DIE',
    cause: '决斗中被杀',
    killerId: SANSA,
  });

  const duplicate = validateCharacterCommand({
    type: 'KILL_CHARACTER',
    characterId: ARYA,
    cause: '重复记载',
  }, context({
    characters: [character(ARYA, { alive: false }), character(SANSA), character(JON)],
  }));
  assertRejected(duplicate, /已经死亡|已死亡/);
});

test('合法婚姻生成双方互惠事件', () => {
  const result = validateCharacterCommand({
    type: 'MARRY_CHARACTERS',
    characterId: ARYA,
    spouseId: SANSA,
    reason: '政治联姻',
  }, context());

  assert.equal(result.ok, true);
  assert.equal(result.events.length, 2);
  assert.deepEqual(result.events.map(({ characterId, event }) => ({ characterId, event })), [
    { characterId: ARYA, event: { type: 'MARRY', spouseId: SANSA, reason: '政治联姻' } },
    { characterId: SANSA, event: { type: 'MARRY', spouseId: ARYA, reason: '政治联姻' } },
  ]);
});

test('婚姻已存在时拒绝并保证没有部分互惠事件', () => {
  const result = validateCharacterCommand({
    type: 'MARRY_CHARACTERS',
    characterId: ARYA,
    spouseId: SANSA,
  }, context({
    characters: [
      character(ARYA, { spouseIds: [SANSA] }),
      character(SANSA, { spouseIds: [ARYA] }),
      character(JON),
    ],
  }));

  assertRejected(result, /已经是配偶|婚姻已存在/);
});

test('支持关系、特质、伤势、记忆与头衔命令', () => {
  const commands = [
    {
      type: 'SET_CHARACTER_RELATIONSHIP',
      sourceCharacterId: ARYA,
      targetCharacterId: SANSA,
      relationship: { kind: 'sibling', opinion: 20, trust: 10, fear: 0, respect: 30, attraction: 0, obligation: 5 },
    },
    { type: 'ADD_CHARACTER_TRAIT', characterId: ARYA, traitId: 'brave' },
    { type: 'REMOVE_CHARACTER_TRAIT', characterId: ARYA, traitId: 'brave' },
    { type: 'INJURE_CHARACTER', characterId: ARYA, zone: 'arm', level: 'minor', woundText: '前臂擦伤' },
    { type: 'ADD_CHARACTER_MEMORY', characterId: ARYA, memory: { event: '目睹城门失守', importance: 3, participants: [SANSA], visibility: 'player' } },
    { type: 'GRANT_CHARACTER_TITLE', characterId: ARYA, titleId: 'lady_of_winterfell' },
    { type: 'REVOKE_CHARACTER_TITLE', characterId: ARYA, titleId: 'lady_of_winterfell' },
  ];

  for (const command of commands) {
    const commandContext = command.type === 'REMOVE_CHARACTER_TRAIT'
      ? context({ characters: [character(ARYA, { traits: ['brave'] }), character(SANSA), character(JON)] })
      : command.type === 'REVOKE_CHARACTER_TITLE'
        ? context({ characters: [character(ARYA, { titles: ['lady_of_winterfell'] }), character(SANSA), character(JON)] })
        : context();
    const result = validateCharacterCommand(command, commandContext);
    assert.equal(result.ok, true, command.type);
    assert.equal(result.events.length, 1, command.type);
  }
});

test('拒绝目标人物不在当前地点的关系命令且不产生事件', () => {
  const result = validateCharacterCommand({
    type: 'SET_CHARACTER_RELATIONSHIP',
    sourceCharacterId: ARYA,
    targetCharacterId: JON,
    relationship: { kind: 'ally', opinion: 10, trust: 10, fear: 0, respect: 10, attraction: 0, obligation: 0 },
  }, context({
    characters: [character(ARYA), character(SANSA), character(JON, { locationId: RIVERLANDS })],
    presentCharacterIds: new Set([ARYA]),
  }));

  assertRejected(result, /不在场/);
});

test('畸形的 location、trait、memory、cause 输入返回拒绝而不是抛异常', () => {
  const malformedCommands = [
    [{ type: 'MOVE_CHARACTER', characterId: ARYA, locationId: null }, /地点|格式/],
    [{ type: 'ADD_CHARACTER_TRAIT', characterId: ARYA, traitId: null }, /特质|格式/],
    [{ type: 'ADD_CHARACTER_MEMORY', characterId: ARYA, memory: null }, /记忆|格式/],
    [{ type: 'KILL_CHARACTER', characterId: ARYA, cause: null }, /死亡|格式/],
  ];

  for (const [command, reason] of malformedCommands) {
    let result;
    assert.doesNotThrow(() => { result = validateCharacterCommand(command, context()); });
    assertRejected(result, reason);
  }
});

test('人物移动拒绝自由文本地点、非法地点 ID 与未知地点 ID', () => {
  assertRejected(validateCharacterCommand({
    type: 'MOVE_CHARACTER', characterId: ARYA, location: '河间地', locationId: RIVERLANDS,
  }, context()), /自由文本|地图地点 ID/);
  assertRejected(validateCharacterCommand({
    type: 'MOVE_CHARACTER', characterId: ARYA, locationId: '河间地',
  }, context()), /地图地点 ID/);
  assertRejected(validateCharacterCommand({
    type: 'MOVE_CHARACTER', characterId: ARYA, locationId: 'b_missing_location',
  }, context()), /不存在/);
});

test('快照仍存活但事件历史已有 DIE 时拒绝重复死亡', () => {
  const result = validateCharacterCommand({
    type: 'KILL_CHARACTER',
    characterId: ARYA,
    cause: '重复死亡记载',
  }, context({
    eventHistory: [{ characterId: ARYA, event: { type: 'DIE' } }],
  }));

  assertRejected(result, /重复|已经死亡/);
});

test('合法 save:*:* 人物可以执行状态命令', () => {
  const result = validateCharacterCommand({
    type: 'MOVE_CHARACTER',
    characterId: JON,
    locationId: RIVERLANDS,
    commandId: 'save-move-1',
  }, context({ presentCharacterIds: new Set([ARYA, SANSA, JON]) }));

  assert.equal(result.ok, true);
  assert.deepEqual(result.events, [{
    id: '1:0:0',
    characterId: JON,
    event: { type: 'MOVE', locationId: RIVERLANDS },
  }]);
});

test('合法离婚生成双方互惠事件和稳定事件 ID', () => {
  const result = validateCharacterCommand({
    type: 'DIVORCE_CHARACTERS',
    characterId: ARYA,
    spouseId: SANSA,
    reason: '双方协议解除',
    commandId: 'divorce-1',
  }, context({
    characters: [
      character(ARYA, { spouseIds: [SANSA] }),
      character(SANSA, { spouseIds: [ARYA] }),
      character(JON),
    ],
  }));

  assert.equal(result.ok, true);
  assert.deepEqual(result.events, [
    { id: '1:0:0', characterId: ARYA, event: { type: 'DIVORCE', spouseId: SANSA, reason: '双方协议解除' } },
    { id: '1:0:1', characterId: SANSA, event: { type: 'DIVORCE', spouseId: ARYA, reason: '双方协议解除' } },
  ]);
});

test('第三方配偶导致婚姻命令原子拒绝', () => {
  const result = validateCharacterCommand({
    type: 'MARRY_CHARACTERS',
    characterId: ARYA,
    spouseId: SANSA,
  }, context({
    characters: [
      character(ARYA, { spouseIds: [JON] }),
      character(SANSA),
      character(JON, { spouseIds: [ARYA] }),
    ],
  }));

  assertRejected(result, /其他配偶|婚姻已存在/);
});

test('拒绝人物与自身建立关系', () => {
  const result = validateCharacterCommand({
    type: 'SET_CHARACTER_RELATIONSHIP',
    sourceCharacterId: ARYA,
    targetCharacterId: ARYA,
    relationship: { kind: 'self', opinion: 0, trust: 0, fear: 0, respect: 0, attraction: 0, obligation: 0 },
  }, context());

  assertRejected(result, /自己|自身/);
});

test('关系数值必须是有限 number，合法数值按既有范围规范化', () => {
  for (const field of ['opinion', 'trust', 'fear', 'respect', 'attraction', 'obligation']) {
    const relationship = { kind: 'ally', opinion: 1, trust: 2, fear: 3, respect: 4, attraction: 5, obligation: 6 };
    relationship[field] = NaN;
    const result = validateCharacterCommand({
      type: 'SET_CHARACTER_RELATIONSHIP',
      sourceCharacterId: ARYA,
      targetCharacterId: SANSA,
      relationship,
    }, context());
    assertRejected(result, /关系|数值|number|有限/);
  }

  for (const value of [Infinity, '10', null]) {
    const result = validateCharacterCommand({
      type: 'SET_CHARACTER_RELATIONSHIP',
      sourceCharacterId: ARYA,
      targetCharacterId: SANSA,
      relationship: { kind: 'ally', opinion: value, trust: 0, fear: 0, respect: 0, attraction: 0, obligation: 0 },
    }, context());
    assertRejected(result, /关系|数值|number|有限/);
  }

  const normalized = validateCharacterCommand({
    type: 'SET_CHARACTER_RELATIONSHIP',
    sourceCharacterId: ARYA,
    targetCharacterId: SANSA,
    relationship: { kind: 'ally', opinion: 999, trust: -5, fear: 101, respect: 40.8, attraction: 10.4, obligation: -999 },
  }, context());
  assert.equal(normalized.ok, true);
  assert.deepEqual(normalized.events[0].event.relationship, {
    sourceId: ARYA,
    targetId: SANSA,
    kind: 'ally',
    opinion: 100,
    trust: 0,
    fear: 100,
    respect: 41,
    attraction: 10,
    obligation: -100,
  });
});

test('伤势、治疗和死亡命令默认要求人物在场', () => {
  const absentContext = context({ presentCharacterIds: new Set([SANSA]) });
  const commands = [
    { type: 'INJURE_CHARACTER', characterId: ARYA, zone: 'torso', level: 'heavy', woundText: '胸口创伤' },
    { type: 'HEAL_CHARACTER', characterId: ARYA, zone: 'torso', level: 'minor' },
    { type: 'KILL_CHARACTER', characterId: ARYA, cause: '远方战死' },
  ];
  for (const command of commands) {
    assertRejected(validateCharacterCommand(command, absentContext), /不在当前地点或不在场/);
  }
});

test('事件包含完整内容且系统生成稳定身份', () => {
  const memory = {
    id: 'memory-1',
    turn: 7,
    event: '共同守住城门',
    attitude: '信任增加',
    importance: 5,
    participants: [SANSA],
    visibility: 'player',
  };
  const result = validateCharacterCommand({
    type: 'ADD_CHARACTER_MEMORY',
    characterId: ARYA,
    memory,
    commandId: 'memory-command-1',
  }, context());

  assert.equal(result.ok, true);
  assert.deepEqual(result.events, [{
    id: '1:0:0',
    characterId: ARYA,
    event: { type: 'ADD_MEMORY', memory: { ...memory, id: '1:0:memory', characterId: ARYA } },
  }]);
});

test('事件 ID 使用 turn/sequence，重试稳定且不依赖 commandId 唯一', () => {
  const command = { type: 'MOVE_CHARACTER', characterId: ARYA, locationId: RIVERLANDS, commandId: 'same-ai-id' };
  const retryA = validateCharacterCommand(command, context({ currentTurn: 10, commandSequence: 2 }));
  const retryB = validateCharacterCommand(command, context({ currentTurn: 10, commandSequence: 2 }));
  const nextSequence = validateCharacterCommand(command, context({ currentTurn: 10, commandSequence: 3 }));
  const nextTurn = validateCharacterCommand(command, context({ currentTurn: 11, commandSequence: 2 }));
  const repeatedIdDifferentSequence = validateCharacterCommand(command, context({ currentTurn: 11, commandSequence: 3 }));

  assert.equal(retryA.ok, true);
  assert.equal(retryB.ok, true);
  assert.equal(nextSequence.ok, true);
  assert.equal(nextTurn.ok, true);
  assert.equal(repeatedIdDifferentSequence.ok, true);
  assert.equal(retryA.events[0].id, retryB.events[0].id);
  assert.notEqual(retryA.events[0].id, nextSequence.events[0].id);
  assert.notEqual(retryA.events[0].id, nextTurn.events[0].id);
  assert.notEqual(nextTurn.events[0].id, repeatedIdDifferentSequence.events[0].id);
});

test('自动记忆 ID 从 canonical command identity 派生且跨回合/同回合唯一', () => {
  const command = {
    type: 'ADD_CHARACTER_MEMORY',
    characterId: ARYA,
    memory: { event: '同一件事', importance: 2 },
    commandId: 'same-ai-id',
  };
  const sameRetry = validateCharacterCommand(command, context({ currentTurn: 20, commandSequence: 4 }));
  const sameRetryAgain = validateCharacterCommand(command, context({ currentTurn: 20, commandSequence: 4 }));
  const sameTurnNext = validateCharacterCommand(command, context({ currentTurn: 20, commandSequence: 5 }));
  const nextTurn = validateCharacterCommand(command, context({ currentTurn: 21, commandSequence: 4 }));

  assert.equal(sameRetry.ok, true);
  assert.equal(sameRetryAgain.ok, true);
  assert.equal(sameTurnNext.ok, true);
  assert.equal(nextTurn.ok, true);
  assert.equal(sameRetry.events[0].event.memory.id, sameRetryAgain.events[0].event.memory.id);
  assert.notEqual(sameRetry.events[0].event.memory.id, sameTurnNext.events[0].event.memory.id);
  assert.notEqual(sameRetry.events[0].event.memory.id, nextTurn.events[0].event.memory.id);
});

test('验证事件可直接 append，并投影婚姻、离婚、头衔和伤势治疗', async () => {
  const base = {
    id: ARYA,
    rawId: 'Arya_1',
    canonTier: 'canon',
    name: '艾莉亚',
    born: true,
    alive: true,
    baseAttributes: {},
    traits: [],
    spouseIds: [],
    relations: [],
    hasDna: true,
    source: { file: 'fixture.txt', line: 1 },
  };
  const marry = validateCharacterCommand({
    type: 'MARRY_CHARACTERS', characterId: ARYA, spouseId: SANSA, reason: '联姻', commandId: 'projection-marry',
  }, context({ currentTurn: 30, commandSequence: 0 }));
  const grant = validateCharacterCommand({
    type: 'GRANT_CHARACTER_TITLE', characterId: ARYA, titleId: 'lady_of_winterfell', commandId: 'projection-title',
  }, context({ currentTurn: 30, commandSequence: 1 }));
  const revoke = validateCharacterCommand({
    type: 'REVOKE_CHARACTER_TITLE', characterId: ARYA, titleId: 'lady_of_winterfell', commandId: 'projection-revoke',
  }, context({
    characters: [character(ARYA, { titles: ['lady_of_winterfell'] }), character(SANSA), character(JON)],
    currentTurn: 30,
    commandSequence: 2,
  }));
  const injure = validateCharacterCommand({
    type: 'INJURE_CHARACTER', characterId: ARYA, zone: 'torso', level: 'heavy', woundText: '胸口创伤', commandId: 'projection-injure',
  }, context({ currentTurn: 30, commandSequence: 3 }));
  const heal = validateCharacterCommand({
    type: 'HEAL_CHARACTER', characterId: ARYA, zone: 'torso', level: 'minor', clearWound: '胸口创伤', commandId: 'projection-heal',
  }, context({ currentTurn: 30, commandSequence: 4 }));
  const divorce = validateCharacterCommand({
    type: 'DIVORCE_CHARACTERS', characterId: ARYA, spouseId: SANSA, reason: '解除', commandId: 'projection-divorce',
  }, context({
    characters: [character(ARYA, { spouseIds: [SANSA] }), character(SANSA, { spouseIds: [ARYA] }), character(JON)],
    currentTurn: 31,
    commandSequence: 0,
  }));

  for (const result of [marry, grant, revoke, injure, heal, divorce]) assert.equal(result.ok, true);
  const store = new InMemoryCharacterEventStore();
  await store.append('projection-run', 30, [marry.events[0], grant.events[0], revoke.events[0], injure.events[0], heal.events[0]]);
  await store.append('projection-run', 31, divorce.events);
  const projected = projectCharacterEvents(base, await store.eventsForCharacter('projection-run', ARYA));

  assert.deepEqual(projected.spouseIds, []);
  assert.deepEqual(projected.titleIds, []);
  assert.deepEqual(projected.titles, []);
  assert.deepEqual(projected.wounds, []);
  assert.equal(projected.woundLevels.torso, 'minor');
});

test('killer 必须存在、存活且在场', () => {
  const absentKiller = validateCharacterCommand({
    type: 'KILL_CHARACTER', characterId: ARYA, cause: '暗杀', killerId: JON,
  }, context());
  assertRejected(absentKiller, /不在当前地点或不在场/);

  const deadKiller = validateCharacterCommand({
    type: 'KILL_CHARACTER', characterId: ARYA, cause: '暗杀', killerId: JON,
  }, context({
    characters: [character(ARYA), character(SANSA), character(JON, { alive: false })],
    presentCharacterIds: new Set([ARYA, JON]),
  }));
  assertRejected(deadKiller, /已死亡/);
});

test('缺少 presence evidence 的在场命令明确拒绝', () => {
  const noPresenceEvidence = context({ currentLocationId: undefined, presentCharacterIds: undefined });
  for (const command of [
    { type: 'MOVE_CHARACTER', characterId: ARYA, locationId: RIVERLANDS },
    { type: 'INJURE_CHARACTER', characterId: ARYA, zone: 'torso', level: 'minor', woundText: '擦伤' },
    { type: 'HEAL_CHARACTER', characterId: ARYA, zone: 'torso', level: 'intact' },
    { type: 'KILL_CHARACTER', characterId: ARYA, cause: '战死' },
  ]) {
    assertRejected(validateCharacterCommand(command, noPresenceEvidence), /缺少在场信息/);
  }
});

test('复用权威 isCharacterId，拒绝空白 agot/save ID', () => {
  for (const id of ['agot: ', 'agot:\t', 'save: :local', 'save:run: ', 'save::local']) {
    const result = validateCharacterCommand({ type: 'ADD_CHARACTER_TRAIT', characterId: id, traitId: 'brave' }, context());
    assertRejected(result, /人物 ID/);
  }
});

test('MOVE reason、关系嵌套 sourceId/targetId 和第三方离婚状态严格拒绝', () => {
  const badReason = validateCharacterCommand({
    type: 'MOVE_CHARACTER', characterId: ARYA, locationId: RIVERLANDS, reason: [],
  }, context());
  assertRejected(badReason, /原因|reason|字符串/);

  const badRelationshipPayload = validateCharacterCommand({
    type: 'SET_CHARACTER_RELATIONSHIP',
    sourceCharacterId: ARYA,
    targetCharacterId: SANSA,
    relationship: { sourceId: ARYA, targetId: SANSA, opinion: 0, trust: 0, fear: 0, respect: 0, attraction: 0, obligation: 0 },
  }, context());
  assertRejected(badRelationshipPayload, /sourceId|targetId|不得包含/);

  const thirdPartyDivorce = validateCharacterCommand({
    type: 'DIVORCE_CHARACTERS', characterId: ARYA, spouseId: SANSA,
  }, context({
    characters: [
      character(ARYA, { spouseIds: [SANSA, JON] }),
      character(SANSA, { spouseIds: [ARYA] }),
      character(JON, { spouseIds: [ARYA] }),
    ],
  }));
  assertRejected(thirdPartyDivorce, /其他配偶|单配偶/);
});

test('错误数组、字符串、undefined、枚举和嵌套上下文均安全拒绝', () => {
  const malformedContexts = [
    { ...context(), characters: null },
    { ...context(), characters: 'not-characters' },
    { ...context(), characters: [null] },
    { ...context(), presentCharacterIds: 'not-array-or-set' },
    { ...context(), knownLocationIds: [RIVERLANDS, 42] },
    { ...context(), currentTurn: undefined },
    { ...context(), commandSequence: undefined },
    { ...context(), eventHistory: [{ characterId: ARYA, event: null }] },
    { ...context(), characters: [character(ARYA, { relationships: [{ opinion: 1 }] }), character(SANSA), character(JON)] },
  ];
  const commands = [
    { type: 'MOVE_CHARACTER', characterId: ARYA, locationId: RIVERLANDS },
    { type: 'INJURE_CHARACTER', characterId: ARYA, zone: 'invalid-zone', level: 'minor', woundText: '伤' },
    { type: 'ADD_CHARACTER_MEMORY', characterId: ARYA, memory: { event: '记忆', importance: 1, visibility: 'invalid' } },
  ];
  for (const malformedContext of malformedContexts) {
    for (const command of commands) {
      let result;
      assert.doesNotThrow(() => { result = validateCharacterCommand(command, malformedContext); });
      assert.equal(result.ok, false);
      assert.deepEqual(result.events, []);
      assert.equal(typeof result.reason, 'string');
      assert.ok(result.reason.trim().length > 0);
      assert.match(result.reason, /[\u4e00-\u9fff]/);
    }
  }
});

test('canonical 事件 ID 只由 turn/sequence/suffix 决定', () => {
  const sameSlot = [
    validateCharacterCommand({ type: 'MOVE_CHARACTER', characterId: ARYA, locationId: RIVERLANDS, commandId: 'one' }, context({ currentTurn: 40, commandSequence: 1 })),
    validateCharacterCommand({ type: 'MOVE_CHARACTER', characterId: SANSA, locationId: WINTERFELL, commandId: 'two' }, context({ currentTurn: 40, commandSequence: 1 })),
    validateCharacterCommand({ type: 'ADD_CHARACTER_TRAIT', characterId: ARYA, traitId: 'brave', commandId: 'three' }, context({ currentTurn: 40, commandSequence: 1 })),
  ];
  sameSlot.forEach((result) => assert.equal(result.ok, true));
  assert.equal(sameSlot[0].events[0].id, '40:1:0');
  assert.equal(sameSlot[0].events[0].id, sameSlot[1].events[0].id);
  assert.equal(sameSlot[1].events[0].id, sameSlot[2].events[0].id);

  const unsafeTurn = validateCharacterCommand({ type: 'MOVE_CHARACTER', characterId: ARYA, locationId: RIVERLANDS }, context({ currentTurn: Number.MAX_SAFE_INTEGER + 1 }));
  const unsafeSequence = validateCharacterCommand({ type: 'MOVE_CHARACTER', characterId: ARYA, locationId: RIVERLANDS }, context({ commandSequence: Number.MAX_SAFE_INTEGER + 1 }));
  assertRejected(unsafeTurn, /currentTurn|安全整数|非负整数/);
  assertRejected(unsafeSequence, /commandSequence|安全整数|非负整数/);
});

test('显式 memory.id 不参与系统身份，自动 ID 只依赖 turn/sequence', () => {
  const first = validateCharacterCommand({
    type: 'ADD_CHARACTER_MEMORY', characterId: ARYA,
    memory: { id: 'ai-memory-a', event: '事件 A', importance: 1 },
    commandId: 'ai-command-a',
  }, context({ currentTurn: 41, commandSequence: 1 }));
  const retry = validateCharacterCommand({
    type: 'ADD_CHARACTER_MEMORY', characterId: ARYA,
    memory: { id: 'ai-memory-b', event: '事件 B', importance: 5 },
    commandId: 'ai-command-b',
  }, context({ currentTurn: 41, commandSequence: 1 }));
  const next = validateCharacterCommand({
    type: 'ADD_CHARACTER_MEMORY', characterId: ARYA,
    memory: { id: 'ai-memory-c', event: '事件 C', importance: 1 },
    commandId: 'ai-command-c',
  }, context({ currentTurn: 41, commandSequence: 2 }));

  assert.equal(first.ok, true);
  assert.equal(retry.ok, true);
  assert.equal(next.ok, true);
  assert.equal(first.events[0].id, '41:1:0');
  assert.equal(first.events[0].event.memory.id, '41:1:memory');
  assert.equal(first.events[0].event.memory.id, retry.events[0].event.memory.id);
  assert.notEqual(first.events[0].event.memory.id, next.events[0].event.memory.id);
});

test('InMemory 与共享 writer 对重复事件幂等、冲突抛错且不覆盖首次行', async () => {
  const input = {
    id: 'append-only-1',
    characterId: ARYA,
    event: { type: 'MOVE', locationId: WINTERFELL },
    timestamp: 100,
  };
  const store = new InMemoryCharacterEventStore();
  await store.append('append-run', 7, [input]);
  await store.append('append-run', 7, [{ ...input, timestamp: 200 }]);
  const firstRow = (await store.eventsForCharacter('append-run', ARYA))[0];
  assert.equal(firstRow.timestamp, 100);
  assert.equal(firstRow.sequence, 0);

  await assert.rejects(
    store.append('append-run', 8, [input]),
    /冲突|collision|conflict/,
  );
  assert.equal((await store.eventsForCharacter('append-run', ARYA)).length, 1);

  const rows = new Map();
  const fakeTable = {
    async get(key) { return rows.get(key.join(':')); },
    async add(row) { rows.set(`${row.runId}:${row.id}`, row); },
  };
  await appendCharacterEventRows(fakeTable, 'fake-run', 3, [input]);
  await appendCharacterEventRows(fakeTable, 'fake-run', 3, [{ ...input, timestamp: 999 }]);
  assert.equal(rows.get('fake-run:append-only-1').timestamp, 100);
  await assert.rejects(
    appendCharacterEventRows(fakeTable, 'fake-run', 4, [input]),
    /冲突|collision|conflict/,
  );
  assert.equal(rows.get('fake-run:append-only-1').turn, 3);
  assert.equal(rows.get('fake-run:append-only-1').event.locationId, WINTERFELL);

  const atomicStore = new InMemoryCharacterEventStore();
  await atomicStore.append('atomic-run', 1, [{ ...input, id: 'existing' }]);
  await assert.rejects(atomicStore.append('atomic-run', 2, [
    { ...input, id: 'must-not-partially-append' },
    { ...input, id: 'existing' },
  ]), /冲突/);
  assert.deepEqual(await atomicStore.eventsForCharacter('atomic-run', ARYA), [
    { ...input, id: 'existing', runId: 'atomic-run', turn: 1, sequence: 0 },
  ]);
});

test('关系按 targetId upsert，ResolvedCharacter 暴露动态字段且旧事件仍投影', async () => {
  const base = {
    id: ARYA,
    rawId: 'Arya_1', canonTier: 'canon', name: '艾莉亚', born: true, alive: true,
    baseAttributes: {}, traits: ['old_trait'], spouseIds: [], relations: [], hasDna: true,
    source: { file: 'fixture.txt', line: 1 },
  };
  const events = [
    { id: 'move', characterId: ARYA, event: { type: 'MOVE', locationId: RIVERLANDS } },
    { id: 'trait-add', characterId: ARYA, event: { type: 'ADD_TRAIT', traitId: 'new_trait' } },
    { id: 'trait-remove', characterId: ARYA, event: { type: 'REMOVE_TRAIT', traitId: 'old_trait' } },
    { id: 'relation-a', characterId: ARYA, event: { type: 'SET_RELATIONSHIP', relationship: { sourceId: ARYA, targetId: SANSA, kind: 'ally', opinion: 1, trust: 2, fear: 3, respect: 4, attraction: 5, obligation: 6 } } },
    { id: 'relation-b', characterId: ARYA, event: { type: 'SET_RELATIONSHIP', relationship: { sourceId: ARYA, targetId: SANSA, kind: 'friend', opinion: 10, trust: 20, fear: 30, respect: 40, attraction: 50, obligation: 60 } } },
    { id: 'memory', characterId: ARYA, event: { type: 'ADD_MEMORY', memory: { id: 'memory-1', characterId: ARYA, turn: 1, event: '旧记忆', importance: 2, participants: [SANSA], visibility: 'player' } } },
    { id: 'kill', characterId: JON, event: { type: 'DIE', cause: '战死' } },
  ];
  const store = new InMemoryCharacterEventStore();
  await store.append('projection-regression', 1, events);
  const aryaEvents = await store.eventsForCharacter('projection-regression', ARYA);
  const projected = projectCharacterEvents(base, aryaEvents);
  assert.equal(projected.locationId, RIVERLANDS);
  assert.deepEqual(projected.traits, ['new_trait']);
  assert.equal(projected.relationships.length, 1);
  assert.equal(projected.relationships[0].kind, 'friend');

  const resolved = resolveCharacter(base, aryaEvents, { datasetVersion: 'fixture', currentYear: 300 });
  assert.equal(resolved.memories.length, 1);
  assert.equal(resolved.relationships[0].targetId, SANSA);
  assert.ok(Array.isArray(resolved.titles));
  assert.ok(Array.isArray(resolved.wounds));
  assert.ok(resolved.woundLevels);
});

test('HEAL all 且未指定 clearWound 时清空全部伤口文本', async () => {
  const base = {
    id: ARYA, rawId: 'Arya_1', canonTier: 'canon', name: '艾莉亚', born: true, alive: true,
    baseAttributes: {}, traits: [], spouseIds: [], relations: [], hasDna: true,
    source: { file: 'fixture.txt', line: 1 },
  };
  const store = new InMemoryCharacterEventStore();
  await store.append('heal-all-run', 1, [
    { id: 'injure-head', characterId: ARYA, event: { type: 'INJURE', zone: 'head', level: 'heavy', woundText: '头部伤口' } },
    { id: 'injure-arm', characterId: ARYA, event: { type: 'INJURE', zone: 'arms', level: 'minor', woundText: '手臂伤口' } },
    { id: 'heal-all', characterId: ARYA, event: { type: 'HEAL', zone: 'all', level: 'minor' } },
  ]);
  const projected = projectCharacterEvents(base, await store.eventsForCharacter('heal-all-run', ARYA));
  assert.deepEqual(projected.wounds, []);
  assert.equal(projected.woundLevels.head, 'minor');
  assert.equal(projected.woundLevels.arms, 'minor');
});
