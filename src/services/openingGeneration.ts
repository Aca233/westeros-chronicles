import type { OpeningFacts } from '../features/characters/customCharacterStart';
import type { StoryOpening } from '../features/world/createLivingWorldGame';
import type { ApiConfig } from '../types/game';
import { parseModelOutput } from './api';
import { configForModelRole, modelRolePolicy } from './modelRuntime/profiles';
import { requestModelCompletion } from './modelProviders';

interface OpeningMeta {
  locationId: string;
  characterIds: string[];
}

export interface OpeningGenerationProgress {
  phase: 'requesting' | 'streaming' | 'validating';
  partialText: string;
}

function extractOpeningMeta(raw: string): OpeningMeta {
  const match = raw.match(/<opening_meta>\s*([\s\S]*?)\s*<\/opening_meta>/i);
  if (!match) throw new Error('开场结构校验失败：缺少 opening_meta');
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].replace(/```(?:json)?/gi, '').replace(/```/g, '').trim());
  } catch {
    throw new Error('开场结构校验失败：opening_meta 不是合法 JSON');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('开场结构校验失败：opening_meta 无效');
  const record = parsed as Record<string, unknown>;
  if (typeof record.locationId !== 'string' || !Array.isArray(record.characterIds)
    || record.characterIds.some((id) => typeof id !== 'string')) {
    throw new Error('开场结构校验失败：地点或人物引用字段无效');
  }
  return { locationId: record.locationId, characterIds: [...new Set(record.characterIds as string[])] };
}

function validateOpening(raw: string, facts: OpeningFacts): StoryOpening {
  if (/<state_cmd\b/i.test(raw)) throw new Error('开场结构校验失败：第一幕不得包含状态命令');
  const meta = extractOpeningMeta(raw);
  if (meta.locationId !== facts.location.locationId) throw new Error('开场地点引用与程序确定的地点不一致');
  const allowedIds = new Set(facts.presentCharacters.map((entry) => entry.id));
  if (meta.characterIds.some((id) => !allowedIds.has(id as never))) throw new Error('开场包含不在场的人物引用');
  if (!meta.characterIds.includes(facts.playerId)) throw new Error('开场人物引用缺少玩家');

  const parsed = parseModelOutput(raw, 1, '');
  const narrate = parsed.narrate.trim();
  const compactLength = narrate.replace(/\s/g, '').length;
  if (compactLength < 300 || compactLength > 900) throw new Error('第一幕长度异常；应以约 400—700 字为目标');
  if (!/<branch>[\s\S]*?<\/branch>/i.test(raw)) throw new Error('开场结构校验失败：缺少行动提示');
  const branches = [...new Set(parsed.branches.map((branch) => branch.trim()).filter(Boolean))];
  if (branches.length < 2 || branches.length > 3) throw new Error('第一幕必须提供 2—3 条行动提示');
  if (branches.some((branch) => branch.length > 100)) throw new Error('开场行动提示过长');
  if (/(?:你|玩家)(?:已经)?(?:说(?:道|出)?|回答|答应|承诺|决定|下定决心|心想|想道|打算|发誓)/u.test(narrate)) {
    throw new Error('第一幕代写了玩家的台词、动机、承诺或决定');
  }
  return { narrate, branches, stateCommands: undefined } as StoryOpening;
}

function buildOpeningMessages(facts: OpeningFacts): Array<{ role: string; content: string }> {
  const present = facts.presentCharacters.map((entry) => `- ${entry.name} [${entry.id}]：${entry.role}`).join('\n');
  const knownRelations = facts.knownRelationships.length
    ? facts.knownRelationships.map((entry) => `- ${entry.summary}；知情者=${entry.heardByIds.join(', ')}；公开=${entry.publiclyKnown ? '是' : '否'}`).join('\n')
    : '- 无额外初始关系';
  const privateFacts = facts.privateFacts.length ? facts.privateFacts.map((fact) => `- ${fact}`).join('\n') : '- 无';
  const publicFacts = facts.publicFacts.map((fact) => `- ${fact}`).join('\n');
  const background = facts.backgroundFacts.map((fact) => `- ${fact}`).join('\n');
  const exactCharacterIds = JSON.stringify(facts.presentCharacters.map((entry) => entry.id));

  return [
    {
      role: 'system',
      content: [
        '你只负责演绎一个已经由程序确定事实的角色扮演第一幕，不负责创建或修改游戏状态。',
        '正文目标约 400—700 个中文字符，包含可感知的场景细节和适量 NPC 互动，并停在玩家可以行动的位置。',
        '严禁代写玩家的台词、内心动机、承诺、选择、决定或已经采取的主动行动。可以描述玩家看到、听到、感觉到什么。',
        '不得授予土地、继承权、原著唯一物品、凭空关系、任务或强制危机。不得让不知道私密事实的 NPC 泄露该事实。',
        '只能使用“在场人物”中的具名人物；不要把远方关系人物写成突然在场。',
        '不得输出 <state_cmd> 或任何状态修改命令。',
        '输出必须严格包含：<opening_meta> 单行 JSON、<narrate> 正文、<branch> 2—3 条行动提示。不要输出其他标签。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '【程序锁定的开场事实】',
        `日期：征服历 ${facts.date.year} 年 ${facts.date.month} 月 ${facts.date.day} 日`,
        `时间：${String(Math.floor(facts.minuteOfDay / 60)).padStart(2, '0')}:${String(facts.minuteOfDay % 60).padStart(2, '0')}`,
        `玩家：${facts.playerName} [${facts.playerId}]，身份=${facts.roleLabel}`,
        `地点：${facts.locationLabel} [${facts.location.locationId}]`,
        `眼前处境：${facts.situationSummary}`,
        '身世事实：', background,
        '公开事实：', publicFacts,
        '初始关系：', knownRelations,
        '私密事实（仅按知情者范围处理）：', privateFacts,
        '在场人物：', present,
        '',
        '【严格输出格式】',
        `<opening_meta>{"locationId":"${facts.location.locationId}","characterIds":${exactCharacterIds}}</opening_meta>`,
        '<narrate>在这里写第一幕正文。</narrate>'.replace('\narrate>', '</narrate>'),
        '<branch>\n1. 行动提示\n2. 行动提示\n3. 行动提示\n</branch>',
      ].join('\n'),
    },
  ];
}

export async function generateCustomOpening(
  facts: OpeningFacts,
  config: ApiConfig,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: OpeningGenerationProgress) => void;
  } = {},
): Promise<StoryOpening> {
  if (!config.apiKey?.trim() || !config.baseUrl?.trim() || !config.model?.trim()) {
    throw new Error('尚未配置可用模型。请先打开设置填写 API 地址、密钥并选择模型。');
  }
  if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('开场生成已取消', 'AbortError');
  options.onProgress?.({ phase: 'requesting', partialText: '' });
  const roleConfig = configForModelRole(config, 'narrator');
  const raw = await requestModelCompletion({
    config: roleConfig,
    messages: buildOpeningMessages(facts),
    stream: true,
    maxTokens: Math.min(1800, modelRolePolicy(config, 'narrator').maxTokens),
    timeoutMs: 90_000,
    signal: options.signal,
    onChunk: (partialText) => options.onProgress?.({ phase: 'streaming', partialText }),
  });
  if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('开场生成已取消', 'AbortError');
  options.onProgress?.({ phase: 'validating', partialText: raw });
  return validateOpening(raw, facts);
}
