import { ApiConfig, StoryTurn, StateCommand, GameState, ItemContainerRef, InventoryItem, PendingEquipmentAction } from '../types/game';
import { stripEmoji } from './textSanitizer';
import { getAccessibleStorageSites, getAccessibleTransports } from './itemCustody';

// 解析模型输出的 XML 结构化标签 (小说流全融合 + 深度思考全捕获)
export function parseModelOutput(
  rawText: string,
  turnNumber: number,
  playerInput: string
): Omit<StoryTurn, 'id' | 'timestamp'> {
  const safeRawText = stripEmoji(rawText);
  let think = '';
  const thinkMatch =
    safeRawText.match(/<think>([\s\S]*?)<\/think>/i) ||
    safeRawText.match(/<thought>([\s\S]*?)<\/thought>/i) ||
    safeRawText.match(/<reasoning>([\s\S]*?)<\/reasoning>/i);

  if (thinkMatch) {
    think = thinkMatch[1].trim();
  }

  let narrate = '';
  const narrateMatch = safeRawText.match(/<narrate>([\s\S]*?)<\/narrate>/i);
  if (narrateMatch) {
    narrate = narrateMatch[1].trim();
  } else {
    // 兜底：如果模型没有返回 narrate 标签，去除其他标签后作为正文
    narrate = safeRawText
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
      .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
      .replace(/<branch>[\s\S]*?<\/branch>/gi, '')
      .replace(/<state_cmd>[\s\S]*?<\/state_cmd>/gi, '')
      .trim();
  }

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
    const lines = branchMatch[1]
      .split('\n')
      .map((l) => l.replace(/^\d+[\.、\s\-]+/, '').trim())
      .filter(Boolean);
    branches.push(...lines.slice(0, 4));
  }

  if (branches.length === 0) {
    branches.push(
      '拔出佩剑，以凛冬守护者的强硬威严震慑全场',
      '不动声色，令学士暗中翻阅各大家族的密报档案',
      '召集封臣与重装骑士，立刻布防城隘以防不测'
    );
  }

  // 强健解析 state_cmd
  const stateCommands: StateCommand[] = extractJsonArrayFromXml(safeRawText, 'state_cmd');

  return {
    turnNumber,
    playerInput: stripEmoji(playerInput),
    think,
    narrate,
    branches,
    stateCommands,
  };
}

// 强健的 JSON 数组提取器 (容忍 Markdown 代码块、单行注释、末尾逗号等各种 LLM 瑕疵)
function extractJsonArrayFromXml(rawText: string, tagName: string): any[] {
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

// 离线智能模拟器（未配置 API Key 时提供动态语义解析与 800+ 字小说）
export function generateOfflineDemoResponse(
  playerInput: string,
  turnNumber: number,
  gameState?: GameState,
  pendingEquipmentActions: PendingEquipmentAction[] = [],
): Omit<StoryTurn, 'id' | 'timestamp'> {
  playerInput = stripEmoji(playerInput);
  const stateCommands: StateCommand[] = [];
  let dynamicNarrate = '';
  const think = `AI 幕后推演 (Turn ${turnNumber}): 领主下达指令【${playerInput}】。系统判定其行动意图，并动态推演战备变化与封臣反应。`;

  const availableItems: Array<{ item: InventoryItem; from: ItemContainerRef; label: string }> = gameState
    ? [
        ...(gameState.lord.carriedItems || []).map((item) => ({ item, from: { type: 'carried' } as ItemContainerRef, label: '随身行囊' })),
        ...getAccessibleStorageSites(gameState.lord).flatMap((site) => site.items.map((item) => ({ item, from: { type: 'site', id: site.id } as ItemContainerRef, label: site.name }))),
        ...getAccessibleTransports(gameState.lord).flatMap((vehicle) => vehicle.items.map((item) => ({ item, from: { type: 'vehicle', id: vehicle.id } as ItemContainerRef, label: vehicle.name }))),
      ]
    : [];

  // 离线模式同样只会取用当前地点真实存在的装备，不会生成著名武器或战甲。
  if (/头盔|战盔|面盔|披甲|穿甲|战甲|盔甲|全副武装|盾牌|大盾|护胫/i.test(playerInput)) {
    const wantsFullLoadout = /披甲|穿甲|战甲|盔甲|全副武装/i.test(playerInput);
    const requestedSlots = wantsFullLoadout
      ? ['torso', 'head', 'offhand', 'legs']
      : /头盔|战盔|面盔/i.test(playerInput)
        ? ['head']
        : /盾牌|大盾/i.test(playerInput)
          ? ['offhand']
          : ['legs'];
    const selected = requestedSlots
      .map((slot) => availableItems.find((entry) => entry.item.slot === slot))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    for (const entry of selected) {
      stateCommands.push({
        type: 'EQUIP_ITEM',
        itemId: entry.item.id,
        from: entry.from,
        slot: entry.item.slot,
      });
    }
    if (selected.length) {
      const names = selected.map((entry) => `【${entry.item.name}】`).join('、');
      const sourceNames = [...new Set(selected.map((entry) => entry.label))].join('与');
      dynamicNarrate = `你并未使用什么刻板口令，只是把意思交代清楚。侍从立刻明白了你的打算，快步赶往${sourceNames}。片刻后，木箱与铁扣在石室中依次开启，${names}被逐件送到近前。

穿戴并非眨眼之间完成。侍从先整理内衬，再依次扣紧皮带、系索与金属搭扣；沉重部件落到肩背时，冷铁的重量随之压实。待最后一处系扣检查完毕，你才真正进入适合短时作战的状态。`;
    } else {
      dynamicNarrate = `侍从听懂了你的意思，却没有立刻应声照办。他查过身边行囊、当前据点和附近车驾后，低声禀报道：“大人，您要的战具不在这里。若要取用，只能先回到存放它的地方，或命人用马车送来。”

远方仓库里的东西不会因为一句命令凭空出现在眼前。眼下能做的，只是根据现有衣着和武器重新安排计划。`;
    }
  }
  else if (/拔剑|佩剑|换剑|取剑|长剑|匕首|兵器/i.test(playerInput)) {
    const weapon = availableItems.find((entry) => entry.item.category === '武器' && entry.item.slot === 'mainhand');
    if (weapon) {
      stateCommands.push({ type: 'EQUIP_ITEM', itemId: weapon.item.id, from: weapon.from, slot: 'mainhand' });
      dynamicNarrate = `你话音刚落，近旁的人便领会了意图，从${weapon.label}取来【${weapon.item.name}】。剑鞘与革带在手中调整妥当，金属护手映出壁炉的暗红火光。你将它佩到腰间，拇指轻抵剑格；随着一声短促的摩擦声，剑锋出鞘寸许，又稳稳归位。`;
    } else {
      dynamicNarrate = `你下意识按向腰侧，却没有让一柄不存在的武器凭空出现。当前地点、随身行囊和附近车驾中都没有可供替换的兵器；若要取剑，必须先找到真实存放它的地方。`;
    }
  }
  else if (/药|草药|地图|密信|钥匙|物品|毒/i.test(playerInput)) {
    const item: InventoryItem = /地图|密信/i.test(playerInput)
      ? { id: `item_${Date.now()}_letter`, name: '封蜡羊皮文书', category: '文书', quantity: 1, size: 'tiny', description: '刚刚合法取得并随身收好的羊皮文书。', icon: 'artifact-white-book' }
      : { id: `item_${Date.now()}_herb`, name: '包扎药草小包', category: '药草', quantity: 1, size: 'tiny', description: '可以随身携带的一小包止血药草。' };
    stateCommands.push({ type: 'ADD_ITEM', item, to: { type: 'carried' } });
    dynamicNarrate = `对方将【${item.name}】交到你手中。它体积不大，被仔细包好后收入随身皮囊，并没有占据多少地方。侍从复述了用途与禁忌，确认你已经真正接过物品后才退到一旁。`;
  }
  // 4. 默认经典小说章节
  else {
    const currentClothing = gameState?.lord.gear.torso.name || '厚实的日常外衣';
    dynamicNarrate = `风雪在古老的城垛间发出如狼嗥般的尖啸，刺骨寒气掠过石墙与窗缝。\n\n你理了理身上的【${currentClothing}】，大步走入烛火摇曳的领主大厅。沉重的橡木长桌两侧，披坚执锐的北境封臣与骑士们纷纷停下了低语，数十双警惕而深邃的眼睛齐刷刷地注视着你。壁炉里的泥煤木柴噼啪爆裂，喷吐出带着松脂与焦苦气味的青烟，火光将众人拉长的阴影投射在粗粝的花岗岩石墙上。\n\n“公爵大人！”罗德利克教头快步迎了上来，皮靴踏在冰冷的青石板上发出沉重坚实的回响。他抹了一把胡须上凝结的白霜，右手习惯性地按在佩剑护手上，粗重地喘着白汽低声道：“国王陛下的前锋旗队已经穿过了避冬市镇！劳勃陛下的金冠宝冠雄鹿旗在暴风雪里猎猎翻卷，但他身后的兰尼斯特随行卫队……足足有三百精骑，全部披挂着耀眼的猩红斗篷与镀金板甲。”\n\n鲁温学士压低了嗓音，走到你身侧：“大人，君临局势风云变幻，各方势力都在注视着我们的一举一动，请您定夺接下来的家族方略！”`;
    stateCommands.push({ type: 'MODIFY_PRESTIGE', delta: 5 });
  }

  if (pendingEquipmentActions.length) {
    const queuedNarrative = pendingEquipmentActions.map((action) => {
      const handling = action.slot === 'mainhand' || action.slot === 'offhand'
        ? '取出后调整到惯用的位置'
        : '取出后逐一理顺衬层、系带与扣件';
      return `侍从从${action.sourceLabel}取来【${action.itemName}】，${handling}。当最后一处细节确认妥当，这件装备才真正穿戴在你身上。`;
    }).join('\n\n');
    dynamicNarrate = `${queuedNarrative}\n\n${dynamicNarrate}`;
  }

  // 推进时间
  stateCommands.push({ type: 'ADVANCE_TIME', days: 1, reason: '大厅军令交接与战备整肃' });

  return {
    turnNumber,
    playerInput,
    think,
    narrate: dynamicNarrate,
    branches: [
      '拔剑出鞘发表誓师演说，确立你在家族中的绝对领袖权威',
      '令学士仔细分析各大家族的联姻与密谋动向，谋定而后动',
      '巡视城堡粮仓与兵营，下令立刻操练骑士并囤积越冬粮草'
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
  pendingEquipmentActions: PendingEquipmentAction[] = [],
): Promise<string> {
  // 如果未配置 API Key，走离线 Demo
  if (!config.apiKey || config.apiKey.trim() === '') {
    // 模拟打字机流式输出
    return new Promise((resolve) => {
      const demo = generateOfflineDemoResponse(
        messages[messages.length - 1].content.slice(0, 30),
        Math.floor(messages.length / 2) + 1,
        gameState,
        pendingEquipmentActions,
      );
      const rawText = [
        `<think>\n${demo.think}\n</think>`,
        `<narrate>\n${demo.narrate}\n</narrate>`,
        `<branch>\n${demo.branches.map((b, i) => `${i + 1}. ${b}`).join('\n')}\n</branch>`,
        `<state_cmd>\n${JSON.stringify(demo.stateCommands || [])}\n</state_cmd>`,
      ].join('\n\n');

      let current = '';
      let index = 0;
      const timer = setInterval(() => {
        if (index < rawText.length) {
          current += rawText[index];
          onChunk(current);
          index += 6; // 每次输出几个字，模拟自然打字机
        } else {
          clearInterval(timer);
          resolve(rawText);
        }
      }, 25);
    });
  }

  // 线上 API 请求
  const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = config.model || 'gpt-4o';
  const temperature = config.temperature ?? 0.7;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: 3000,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '网络请求失败');
    throw new Error(`API 接口错误 (${response.status}): ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法创建流式读取器');
  }

  const decoder = new TextDecoder('utf-8');
  let accumulatedReasoning = '';
  let accumulatedContent = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;

      const dataStr = trimmed.replace(/^data:\s*/, '');
      if (dataStr === '[DONE]') break;

      try {
        const json = JSON.parse(dataStr);
        const delta = json.choices?.[0]?.delta;
        if (delta) {
          // 兼容 DeepSeek Reasoner、SiliconFlow R1、OpenAI o1/o3 的推理字段
          const reasoning =
            delta.reasoning_content ||
            delta.reasoning ||
            delta.thought ||
            delta.thinking ||
            '';
          const content = delta.content || '';

          if (reasoning) {
            accumulatedReasoning += reasoning;
          }
          if (content) {
            accumulatedContent += content;
          }

          let fullStream = '';
          if (accumulatedReasoning) {
            fullStream = `<think>\n${accumulatedReasoning}\n</think>\n\n${accumulatedContent}`;
          } else {
            fullStream = accumulatedContent;
          }

          onChunk(fullStream);
        }
      } catch {
        // 忽略畸形 JSON 分片
      }
    }
  }

  if (accumulatedReasoning && !accumulatedContent.includes('<think>')) {
    return `<think>\n${accumulatedReasoning}\n</think>\n\n${accumulatedContent}`;
  }
  return accumulatedContent;
}

// 动态拉取服务商可用模型列表
export async function fetchAvailableModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`拉取模型失败 (${response.status}): ${errorText || '未知错误'}`);
  }

  const data = await response.json();
  if (Array.isArray(data.data)) {
    return data.data
      .map((m: { id: string }) => m.id)
      .filter((id: string) => !id.includes('whisper') && !id.includes('embedding') && !id.includes('tts') && !id.includes('dall-e'));
  }
  return [];
}
