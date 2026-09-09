import { ApiConfig, StoryTurn, StateCommand, GameState } from '../types/game';
import { pendingItemActionsFromWorldTransactions } from '../features/items/itemActionQueue';
import type { PendingWorldTransaction } from '../features/world/worldRuntimeTypes';
import { configForModelRole, modelRolePolicy } from './modelRuntime/profiles';
import { stripEmoji } from './textSanitizer';
import { ITEM_CATALOG } from '../data/itemDefinitions';
import { getItemDefinition } from '../features/items/catalog';
import type { EquipmentPosition, ItemPlacement } from '../features/items/types';
import { sameWorldLocation } from '../features/map/locationResolver';
import { parseBranchOptions } from './branchOptions';
import { extractNarrativeContent, normalizeModelProtocolMarkup } from './modelProtocol';
import { getResolvedModelAlias, listProviderModels, requestModelCompletion } from './modelProviders';

// 解析模型输出的 XML 结构化标签 (小说流全融合 + 深度思考全捕获)
export function parseModelOutput(
  rawText: string,
  turnNumber: number,
  playerInput: string
): Omit<StoryTurn, 'id' | 'timestamp'> {
  const safeRawText = normalizeModelProtocolMarkup(stripEmoji(rawText));
  let narrate = extractNarrativeContent(safeRawText);

  // 如果某些模型依然输出了 <speak> 标签，将其无缝融入小说叙事流中，杜绝孤立卡片
  const speakRegex = /<speak(?:\s+speaker=["']([^"']*)["'])?>([\s\S]*?)<\/speak>/gi;
  let sMatch;
  const legacySpeaks: string[] = [];
  while ((sMatch = speakRegex.exec(safeRawText)) !== null) {
    const speaker = sMatch[1] ? sMatch[1].trim() : '在场人物';
    const text = sMatch[2].trim();
    if (!narrate.includes(text)) {
      legacySpeaks.push(`【${speaker}】凝视着你，沉声说道：“${text}”`);
    }
  }
  if (legacySpeaks.length > 0) {
    narrate = `${narrate}\n\n${legacySpeaks.join('\n\n')}`;
  }

  const branches: string[] = [];
  const branchMatch = safeRawText.match(/<branch>([\s\S]*?)<\/branch>/i);
  if (branchMatch) {
    branches.push(...parseBranchOptions(branchMatch[1]));
  }

  if (branches.length === 0) {
    branches.push(
      '观察眼前人的反应，暂不作出新的承诺',
      '追问对方的条件、证据与真正顾虑',
      '结束当前交谈，保留稍后再决定的余地'
    );
  }

  // 强健解析 state_cmd（丢弃缺少字符串 type 的畸形元素，防止下游 .startsWith 崩溃）
  const stateCommands: StateCommand[] = extractJsonArrayFromXml(safeRawText, 'state_cmd').filter(hasStateCommandType);

  return {
    turnNumber,
    playerInput: stripEmoji(playerInput),
    narrate,
    branches,
    stateCommands,
  };
}

// 强健的 JSON 数组提取器 (容忍 Markdown 代码块、单行注释、末尾逗号等各种 LLM 瑕疵)
export function extractJsonArrayFromXml(rawText: string, tagName: string): any[] {
  const match = rawText.match(new RegExp(`<${tagName}>([\\s\\S]*?)(?:<\\/${tagName}>|$)`, 'i'));
  if (!match) return [];

  let content = match[1].trim();
  content = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  content = content.replace(/\/\/.*$/gm, '');
  const start = content.indexOf('[');
  const end = content.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    content = content.substring(start, end + 1);
  }
  content = content.replace(/,\s*([\]}])/g, '$1');

  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const objMatches = content.match(/\{[\s\S]*?\}/g);
    if (objMatches) {
      const results: any[] = [];
      for (const objStr of objMatches) {
        try {
          const cleanObj = objStr.replace(/,\s*\}/g, '}');
          results.push(JSON.parse(cleanObj));
        } catch {}
      }
      return results;
    }
  }
  return [];
}

// 模型偶尔会把缺少 type 字段的畸形对象混进 state_cmd 数组；下游多处用
// command.type.startsWith(...) 判分支，undefined 会导致崩溃。这里在解析出口统一过滤。
function hasStateCommandType(command: unknown): command is StateCommand {
  return typeof (command as { type?: unknown })?.type === 'string';
}

// 离线智能模拟器（未配置 API Key 时提供动态语义解析与 800+ 字小说）
export function generateOfflineDemoResponse(
  playerInput: string,
  turnNumber: number,
  gameState?: GameState,
  pendingTransactions: PendingWorldTransaction[] = [],
): Omit<StoryTurn, 'id' | 'timestamp'> {
  const pendingItemActions = gameState
    ? pendingItemActionsFromWorldTransactions(pendingTransactions, gameState.lord.items, ITEM_CATALOG)
    : [];
  playerInput = stripEmoji(playerInput);
  const stateCommands: StateCommand[] = [];
  let dynamicNarrate = '';

  const availableItems = gameState
    ? Object.values(gameState.lord.items.instances).flatMap((instance) => {
        const placement = gameState.lord.items.placements[instance.instanceId];
        if (placement.type === 'equipped' || placement.type === 'character' || placement.type === 'lost') return [];
        let label = '随身行囊';
        if (placement.type === 'site') {
          const site = gameState.lord.items.sites[placement.siteId];
          if (!site || !sameWorldLocation(site.location, gameState.lord.location)) return [];
          label = site.name;
        }
        if (placement.type === 'vehicle') {
          const vehicle = gameState.lord.items.vehicles[placement.vehicleId];
          if (!vehicle || !sameWorldLocation(vehicle.location, gameState.lord.location)) return [];
          label = vehicle.name;
        }
        return [{ instance, definition: getItemDefinition(ITEM_CATALOG, instance.definitionId), placement, label }];
      })
    : [];
  const localSite = gameState
    ? Object.values(gameState.lord.items.sites).find((site) => sameWorldLocation(site.location, gameState.lord.location))
    : undefined;
  const displacedTo: ItemPlacement = localSite ? { type: 'site', siteId: localSite.id } : { type: 'carried' };

  // 离线模式只引用目录定义和当前可访问实例，不构造临时装备对象。
  if (/头盔|战盔|面盔|披甲|穿甲|战甲|盔甲|全副武装|盾牌|大盾|护胫/i.test(playerInput)) {
    const wantsFullLoadout = /披甲|穿甲|战甲|盔甲|全副武装/i.test(playerInput);
    const requestedGroups = wantsFullLoadout
      ? ['torso', 'head', 'offhand', 'legs']
      : /头盔|战盔|面盔/i.test(playerInput)
        ? ['head']
        : /盾牌|大盾/i.test(playerInput)
          ? ['offhand']
          : ['legs'];
    const selected = requestedGroups.flatMap((group) => {
      const entry = availableItems.find((candidate) => candidate.definition.allowedPositions.some((position) => position.group === group));
      if (!entry) return [];
      const position = entry.definition.allowedPositions.find((candidate) => candidate.group === group) as EquipmentPosition;
      return [{ ...entry, position }];
    });
    for (const entry of selected) {
      stateCommands.push({ type: 'ITEM_EQUIP', instanceId: entry.instance.instanceId, position: entry.position, displacedTo });
    }
    if (selected.length) {
      const names = selected.map((entry) => `【${entry.instance.customName ?? entry.definition.name}】`).join('、');
      const sourceNames = [...new Set(selected.map((entry) => entry.label))].join('与');
      dynamicNarrate = `你把意思交代清楚后，侍从快步赶往${sourceNames}。木箱和铁扣依次开启，${names}被逐件送到近前。穿戴并非眨眼完成：内衬先被理顺，随后才是皮带、系索和金属搭扣。待最后一处扣件检查妥当，装备才真正落到你的身上。`;
    } else {
      dynamicNarrate = '侍从查过随身行囊、当前据点和附近车驾，没有找到符合要求且能够立刻取用的战具。远方储藏不会因一句命令凭空出现在眼前。';
    }
  } else if (/拔剑|佩剑|换(?:一把|一柄)?剑|取剑|长剑|匕首|兵器/i.test(playerInput)) {
    const weapon = availableItems.find((entry) => entry.definition.category === 'weapon' && entry.definition.allowedPositions.some((position) => position.group === 'mainhand'));
    if (weapon) {
      stateCommands.push({ type: 'ITEM_EQUIP', instanceId: weapon.instance.instanceId, position: { group: 'mainhand' }, displacedTo });
      dynamicNarrate = `侍从从${weapon.label}取来【${weapon.instance.customName ?? weapon.definition.name}】。剑鞘和革带调整妥当后，你才将它置于惯用位置；这一变化将在叙事成功结束后由物品状态统一结算。`;
    } else {
      dynamicNarrate = '你下意识按向腰侧，却没有让一柄不存在的武器凭空出现。当前可访问物品中没有合适兵器。';
    }
  } else if (/药|草药|包扎|治疗|止血|伤口/i.test(playerInput)) {
    const medicine = availableItems.find((entry) => entry.definition.category === 'medicine');
    if (medicine) {
      const damagedZone = gameState
        ? (['head', 'torso', 'arms', 'legs'] as const).find((zone) => gameState.lord.body[zone].level !== 'intact')
        : undefined;
      if (damagedZone) {
        stateCommands.push({ type: 'TREAT_WOUND', instanceId: medicine.instance.instanceId, zone: damagedZone });
        dynamicNarrate = `你取出【${medicine.instance.customName ?? medicine.definition.name}】，清理并包扎创处。物资会实际消耗，伤情至多缓解一级。`;
      } else {
        dynamicNarrate = `你取出【${medicine.instance.customName ?? medicine.definition.name}】检查妥当；身上没有需要处理的已记录创伤，因此没有消耗它。`;
      }
    } else {
      dynamicNarrate = '当前随身行囊、据点和同行车驾中没有可用药物，叙事不会临时创造一份。';
    }
  } else if (/地图|密信|钥匙|物品/i.test(playerInput)) {
    dynamicNarrate = '你检查了当前可访问物品，没有发现与要求相符的现成实例。若要取得新的文书或钥匙，必须由明确剧情来源使用已登记的目录定义创建，不能由一句含糊描述凭空生成。';
  } else {
    const currentClothing = gameState
      ? Object.values(gameState.lord.items.instances).flatMap((instance) => {
          const placement = gameState.lord.items.placements[instance.instanceId];
          if (placement.type !== 'equipped' || placement.position.group !== 'torso') return [];
          const definition = getItemDefinition(ITEM_CATALOG, instance.definitionId);
          return definition.category === 'clothing' ? [instance.customName ?? definition.name] : [];
        })[0] ?? '厚实的日常外衣'
      : '厚实的日常外衣';
    dynamicNarrate = `风雪在古老城垛间发出低沉尖啸，冷气掠过石墙和窗缝。你理了理身上的【${currentClothing}】，走入烛火摇曳的大厅。封臣们停下低语，等待你给出下一道命令；任何武器、衣物或药品的变化都必须来自当前真实物品状态。`;
  }


  if (pendingItemActions.length) {
    const queuedNarrative = pendingItemActions
      .map((action) => `你已经决定${action.label}【${action.itemName}】；叙事会自然表现过程，实际状态只在本次回复成功后统一结算。`)
      .join('\n\n');
    dynamicNarrate = `${queuedNarrative}\n\n${dynamicNarrate}`;
  }

  return {
    turnNumber,
    playerInput,
    narrate: dynamicNarrate,
    branches: [
      '观察眼前人物对这次行动的直接反应',
      '追问当前局势中仍未解决的问题',
      '暂缓决定，先检查自己实际掌握的资源与身份权限'
    ],
    stateCommands,
  };
}

// 流式请求主函数
export async function streamChatCompletion(
  messages: Array<{ role: string; content: string }>,
  config: ApiConfig,
  onChunk: (partialText: string) => void,
  signal?: AbortSignal,
  gameState?: GameState,
  pendingTransactions: PendingWorldTransaction[] = [],
): Promise<string> {
  if (!config.apiKey || config.apiKey.trim() === '') {
    const demo = generateOfflineDemoResponse(
      messages[messages.length - 1].content.slice(0, 30),
      Math.floor(messages.length / 2) + 1,
      gameState,
      pendingTransactions,
    );
    const rawText = [
      `<narrate>\n${demo.narrate}\n</narrate>`,
      `<branch>\n${demo.branches.map((branch, index) => `${index + 1}. ${branch}`).join('\n')}\n</branch>`,
      `<state_cmd>\n${JSON.stringify(demo.stateCommands || [])}\n</state_cmd>`,
    ].join('\n\n');
    return streamOfflineText(rawText, onChunk, signal, 6, 25);
  }

  return requestModelCompletion({
    config: configForModelRole(config, 'narrator'),
    messages,
    stream: true,
    maxTokens: modelRolePolicy(config, 'narrator').maxTokens,
    onChunk,
    signal,
  });
}

export async function requestTurnResolutionCompletion(
  messages: Array<{ role: string; content: string }>,
  config: ApiConfig,
  gameState?: GameState,
  pendingTransactions: PendingWorldTransaction[] = [],
  signal?: AbortSignal,
  role: 'resolver' | 'repair' = 'resolver',
): Promise<string> {
  if (!config.apiKey || config.apiKey.trim() === '') {
    if (signal?.aborted) throw signal.reason ?? new DOMException('规则解析已取消', 'AbortError');
    const demo = generateOfflineDemoResponse(
      messages[messages.length - 1]?.content.slice(0, 120) ?? '',
      (gameState?.turnCount ?? 0) + 1,
      gameState,
      pendingTransactions,
    );
    return JSON.stringify({
      schemaVersion: 2,
      resolution: '程序离线解析了当前行动，最终事实仍以命令验证结果为准。',
      diceRequest: { roll: false, attribute: 'diplomacy', dc: 12, domain: 'diplomacy', reason: '离线模式直接使用本地规则结算' },
      outcomes: { deterministic: { stateCommands: demo.stateCommands ?? [], worldIntents: [] } },
    });
  }
  const output = await requestModelCompletion({
    config: configForModelRole(config, role),
    messages,
    stream: false,
    maxTokens: modelRolePolicy(config, role).maxTokens,
    signal,
  });
  return output;
}

function offlineSettledNarrative(messages: Array<{ role: string; content: string }>): string {
  const userMessage = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  const action = userMessage.match(/【玩家行动】\s*([\s\S]*?)\s*【程序已确认】/)?.[1]?.trim() || '继续当前行动';
  const confirmed = userMessage.split('【程序已确认】')[1]?.split('请严格根据以上事实写正文')[0] ?? '';
  const lines = confirmed.split('\n').map((line) => line.trim()).filter(Boolean);
  const valueOf = (prefix: string) => lines.find((line) => line.startsWith(prefix))?.slice(prefix.length).trim();
  const date = valueOf('- 日期：') ?? '当前日期';
  const dice = valueOf('- D20：') ?? '本回合没有额外检定';
  const changes = valueOf('- 状态变化：');
  const worldFacts = lines
    .filter((line) => line.startsWith('- ')
      && !['- 日期：', '- D20：', '- 接受命令：', '- 状态变化：'].some((prefix) => line.startsWith(prefix)))
    .filter((line) => !/没有额外世界事件/.test(line))
    .map((line) => line.replace(/^-\s*/, ''));

  const paragraphs = [
    `${date}，你把自己的决定付诸行动：“${action}”`,
    dice.includes('没有 D20 检定') ? '这一步没有需要交给骰子的真实风险，结果由已经确认的现场条件直接决定。' : `检定结果已经落定：${dice}。`,
  ];
  if (changes && !/无数值变化/.test(changes)) paragraphs.push(`${changes.replace(/[；。]+$/, '')}。`);
  if (worldFacts.length) paragraphs.push(worldFacts.map((fact) => `${fact.replace(/[。]+$/, '')}。`).join(''));
  paragraphs.push('场景只沿着这些已经成立的结果继续，没有额外的命运转折被凭空加入。');

  return [
    `<narrate>${paragraphs.join('\n\n')}</narrate>`,
    '<branch>\n1. 观察在场人物对结果的直接反应\n2. 追问当前局势中仍未解决的问题\n3. 根据已经发生的变化采取下一步行动\n</branch>',
  ].join('\n\n');
}

async function streamOfflineText(
  rawText: string,
  onChunk: (partialText: string) => void,
  signal?: AbortSignal,
  chunkSize = 12,
  delayMs = 4,
): Promise<string> {
  let index = 0;
  let current = '';
  while (index < rawText.length) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('叙事生成已取消', 'AbortError');
    current += rawText.slice(index, index + chunkSize);
    index += chunkSize;
    onChunk(current);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return rawText;
}

export async function streamNarrativeCompletion(
  messages: Array<{ role: string; content: string }>,
  config: ApiConfig,
  onChunk: (partialText: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (!config.apiKey || config.apiKey.trim() === '') {
    return streamOfflineText(offlineSettledNarrative(messages), onChunk, signal);
  }
  return requestModelCompletion({
    config: configForModelRole(config, 'narrator'),
    messages,
    stream: true,
    maxTokens: modelRolePolicy(config, 'narrator').maxTokens,
    onChunk,
    signal,
  });
}

// 动态拉取所选服务商可用模型列表
export async function fetchAvailableModels(config: ApiConfig, signal?: AbortSignal): Promise<string[]> {
  const models = await listProviderModels(config, signal);
  return models.filter((id) => !id.includes('whisper') && !id.includes('embedding') && !id.includes('tts') && !id.includes('dall-e'));
}

export function resolvedModelForConfig(config: ApiConfig): string | null {
  return getResolvedModelAlias(config);
}
