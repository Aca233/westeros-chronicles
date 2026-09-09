import type { CharacterId } from '../../domain/characterId';
import { CHARACTER_TRAITS } from '../../data/characterTraits';
import { stripEmoji } from '../../services/textSanitizer';
import type { Commitment, GrowthOption, RelationshipEvidence, RoleplayState, RoleplayStateCommand, SocialEvent } from './types';

export function createRoleplayState(): RoleplayState {
  return { schemaVersion: 1, revision: 0, socialEvents: [], commitments: [], knowledge: [], relationshipEvidence: [], messages: [], agendas: [], projects: [], growthOpportunities: [] };
}

export function isRoleplayStateCommand(command: { type: string }): command is RoleplayStateCommand {
  return ['RECORD_SOCIAL_BEAT', 'SEND_MESSAGE', 'SCHEDULE_NPC_AGENDA', 'RESOLVE_NPC_AGENDA', 'DELEGATE_PROJECT', 'RESOLVE_PROJECT', 'OFFER_GROWTH_CHOICE', 'CLAIM_GROWTH_CHOICE'].includes(command.type);
}

function validDate(value: string | undefined): boolean {
  if (value === undefined) return true;
  const match = /^(\d{1,6})\.(\d{1,2})\.(\d{1,2})$/.exec(value);
  return Boolean(match && Number(match[2]) >= 1 && Number(match[2]) <= 12 && Number(match[3]) >= 1 && Number(match[3]) <= 31);
}

export interface RoleplaySettlementContext {
  turn: number;
  playerId: CharacterId;
  presentCharacterIds: readonly CharacterId[];
  currentDate: string;
  knownEventTurns?: ReadonlyMap<string, number>;
  appliedGrowthChoices?: readonly { opportunityId: string; optionId: string }[];
}

export interface RoleplaySettlementResult {
  state: RoleplayState;
  accepted: RoleplayStateCommand[];
  rejected: Array<{ command: RoleplayStateCommand; reason: string }>;
  changes: string[];
}

export function settleRoleplayCommands(
  source: RoleplayState | undefined,
  commands: readonly RoleplayStateCommand[],
  context: RoleplaySettlementContext,
): RoleplaySettlementResult {
  const state = structuredClone(source ?? createRoleplayState());
  state.relationshipEvidence ??= [];
  state.messages ??= [];
  state.agendas ??= [];
  state.projects ??= [];
  state.growthOpportunities ??= [];
  const relationshipEvidence = state.relationshipEvidence;
  const messages = state.messages;
  const agendas = state.agendas;
  const projects = state.projects;
  const growthOpportunities = state.growthOpportunities;
  const accepted: RoleplayStateCommand[] = [];
  const rejected: RoleplaySettlementResult['rejected'] = [];
  const changes: string[] = [];
  const allowed = new Set<CharacterId>([context.playerId, ...context.presentCharacterIds]);
  const acts = new Set(['request', 'accept', 'reject', 'conditional', 'promise', 'disclose', 'fulfill', 'break']);

  for (const message of messages) {
    if (message.status !== 'in_transit' || compareDate(message.arrivesOn, context.currentDate) > 0) continue;
    message.status = 'delivered';
    message.deliveredTurn = context.turn;
    for (const characterId of message.recipientIds) {
      state.knowledge.push({ id: `knowledge:${message.id}:${characterId}`, characterId, claim: message.summary, sourceEventId: message.id, learnedTurn: context.turn });
    }
    if (message.senderId === context.playerId || message.recipientIds.includes(context.playerId)) changes.push(`消息送达：${message.summary}`);
  }
  for (const agenda of agendas) {
    if (agenda.status === 'scheduled' && compareDate(agenda.dueDate, context.currentDate) <= 0) {
      agenda.status = 'due';
      if (agenda.heardByIds.includes(context.playerId)) changes.push(`议程到期：${agenda.summary}`);
    }
  }
  for (const project of projects) {
    if (project.status === 'active' && compareDate(project.dueDate, context.currentDate) <= 0) {
      project.status = 'due';
      if (project.ownerId === context.playerId) changes.push(`委派到期：${project.objective}`);
    }
  }

  commands.forEach((command, sequence) => {
    const reject = (reason: string) => rejected.push({ command, reason });
    if (command.type === 'SEND_MESSAGE') {
      const summary = typeof command.summary === 'string' ? stripEmoji(command.summary).trim().slice(0, 240) : '';
      if (command.senderId !== context.playerId) return reject('当前玩家回合只能主动发送自己的消息');
      if (!Array.isArray(command.recipientIds) || !command.recipientIds.length || command.recipientIds.some((id) => id === command.senderId)) return reject('消息必须有其他收件人');
      if (!summary) return reject('消息缺少可追溯摘要');
      if (!Number.isInteger(command.travelDays) || command.travelDays < 0 || command.travelDays > 365) return reject('消息路程必须是 0—365 天整数');
      const id = `message:${context.turn}:${sequence}`;
      const arrivesOn = addDays(context.currentDate, command.travelDays);
      messages.push({ id, senderId: command.senderId, recipientIds: [...new Set(command.recipientIds)], summary, sentTurn: context.turn, sentDate: context.currentDate, arrivesOn, status: command.travelDays === 0 ? 'delivered' : 'in_transit', ...(command.travelDays === 0 ? { deliveredTurn: context.turn } : {}) });
      if (command.travelDays === 0) {
        for (const characterId of command.recipientIds) state.knowledge.push({ id: `knowledge:${id}:${characterId}`, characterId, claim: summary, sourceEventId: id, learnedTurn: context.turn });
      }
      accepted.push(command);
      changes.push(command.travelDays === 0 ? `消息送达：${summary}` : `消息启程：${summary}（预计 ${arrivesOn}）`);
      return;
    }
    if (command.type === 'SCHEDULE_NPC_AGENDA') {
      const summary = typeof command.summary === 'string' ? stripEmoji(command.summary).trim().slice(0, 240) : '';
      const targets = Array.isArray(command.targetIds) ? [...new Set(command.targetIds)] : [];
      if (!allowed.has(command.actorId)) return reject('议程发起者不在当前可验证场景');
      if (!summary || !validDate(command.dueDate)) return reject('议程必须有摘要和合法日期');
      const heardByIds = command.visibility === 'public' ? [...allowed].sort() : [...new Set([command.actorId, ...targets])].sort();
      if (!heardByIds.includes(context.playerId)) return reject('当前解析器不能创建玩家不知道的私有议程');
      agendas.push({ id: `agenda:${context.turn}:${sequence}`, actorId: command.actorId, targetIds: targets, summary, dueDate: command.dueDate, visibility: command.visibility, heardByIds, status: compareDate(command.dueDate, context.currentDate) <= 0 ? 'due' : 'scheduled' });
      accepted.push(command);
      changes.push(`安排议程：${summary}（${command.dueDate}）`);
      return;
    }
    if (command.type === 'RESOLVE_NPC_AGENDA') {
      const agenda = agendas.find((entry) => entry.id === command.agendaId);
      const summary = typeof command.summary === 'string' ? stripEmoji(command.summary).trim().slice(0, 240) : '';
      if (!agenda || agenda.status !== 'due') return reject('议程不存在或尚未到期');
      if (agenda.actorId !== command.actorId || !allowed.has(command.actorId)) return reject('只有当前在场的议程人物可以处理该议程');
      if (!summary) return reject('议程处理缺少摘要');
      agenda.status = 'resolved';
      agenda.resolvedTurn = context.turn;
      accepted.push(command);
      changes.push(`议程进展：${summary}`);
      return;
    }
    if (command.type === 'DELEGATE_PROJECT') {
      const objective = typeof command.objective === 'string' ? stripEmoji(command.objective).trim().slice(0, 240) : '';
      const consent = state.socialEvents.find((event) => event.id === command.consentEventId);
      if (command.ownerId !== context.playerId || !allowed.has(command.assigneeId) || command.assigneeId === command.ownerId) return reject('委派双方必须是玩家与当前在场的其他人物');
      if (!objective || !validDate(command.dueDate) || !command.exchangeId?.trim()) return reject('委派必须有目标、合法期限和交涉 ID');
      if (!consent || consent.act !== 'accept' || consent.actorId !== command.assigneeId || !consent.targetIds.includes(command.ownerId) || consent.exchangeId !== command.exchangeId) return reject('委派必须引用受任者对同一交涉的明确接受事件');
      projects.push({ id: `project:${context.turn}:${sequence}`, ownerId: command.ownerId, assigneeId: command.assigneeId, objective, dueDate: command.dueDate, consentEventId: command.consentEventId, exchangeId: command.exchangeId.trim().slice(0, 80), status: compareDate(command.dueDate, context.currentDate) <= 0 ? 'due' : 'active', createdTurn: context.turn });
      accepted.push(command);
      changes.push(`完成委派：${objective}（期限 ${command.dueDate}）`);
      return;
    }
    if (command.type === 'RESOLVE_PROJECT') {
      const project = projects.find((entry) => entry.id === command.projectId);
      const summary = typeof command.summary === 'string' ? stripEmoji(command.summary).trim().slice(0, 240) : '';
      if (!project || (project.status !== 'active' && project.status !== 'due')) return reject('委派不存在或已经结束');
      if (project.assigneeId !== command.assigneeId || !allowed.has(command.assigneeId)) return reject('只有当前在场的受任者可以报告委派结果');
      if (!summary || !['success', 'partial', 'failed'].includes(command.outcome)) return reject('委派结果必须有合法结局与摘要');
      project.status = command.outcome === 'failed' ? 'failed' : 'resolved';
      project.resolvedTurn = context.turn;
      project.outcomeSummary = summary;
      relationshipEvidence.push({ id: `relationship:${project.id}:resolved`, turn: context.turn, participantIds: [project.ownerId, project.assigneeId], sourceEventId: project.id, summary, impact: command.outcome === 'success' ? 'positive' : command.outcome === 'failed' ? 'negative' : 'neutral', heardByIds: [project.ownerId, project.assigneeId] });
      accepted.push(command);
      changes.push(`委派结果：${summary}`);
      return;
    }
    if (command.type === 'OFFER_GROWTH_CHOICE') {
      const summary = typeof command.summary === 'string' ? stripEmoji(command.summary).trim().slice(0, 240) : '';
      const evidenceEventIds = Array.isArray(command.evidenceEventIds)
        ? [...new Set(command.evidenceEventIds.map((id) => typeof id === 'string' ? id.trim() : '').filter(Boolean))].slice(0, 8)
        : [];
      const knownEventTurns = context.knownEventTurns ?? new Map<string, number>();
      if (!summary) return reject('成长机会缺少可追溯摘要');
      if (command.basis !== 'training' && command.basis !== 'experience') return reject('成长机会来源不合法');
      if (!evidenceEventIds.length || evidenceEventIds.some((id) => !knownEventTurns.has(id))) return reject('成长机会必须引用已经提交的事件 ID');
      if (command.basis === 'training') {
        const distinctTurns = new Set(evidenceEventIds.map((id) => knownEventTurns.get(id)).filter((turn): turn is number => Number.isInteger(turn)));
        if (distinctTurns.size < 2) return reject('训练成长必须由至少两个不同回合的既有事件支持');
      }
      if ((growthOpportunities ?? []).filter((entry) => entry.status === 'open').length >= 3) return reject('未选择的成长机会已达到上限，请先作出选择');
      const options = Array.isArray(command.options) ? command.options : [];
      if (options.length < 2 || options.length > 3) return reject('成长机会必须提供 2—3 个不同方向');
      const optionIds = new Set<string>();
      const validOptions: GrowthOption[] = [];
      for (const option of options) {
        const id = typeof option?.id === 'string' ? option.id.trim().slice(0, 60) : '';
        const label = typeof option?.label === 'string' ? stripEmoji(option.label).trim().slice(0, 80) : '';
        if (!id || !label || optionIds.has(id)) return reject('成长选项必须有唯一 ID 和名称');
        optionIds.add(id);
        if (option.effect?.kind === 'stat') {
          if (!['diplomacy', 'martial', 'stewardship', 'intrigue', 'learning', 'prowess'].includes(option.effect.stat) || option.effect.delta !== 1) {
            return reject('属性成长每次只能让 CK3 六属性中的一项 +1');
          }
          validOptions.push({ id, label, effect: { kind: 'stat', stat: option.effect.stat, delta: 1 } });
        } else if (option.effect?.kind === 'trait') {
          const traitId = typeof option.effect.traitId === 'string' ? option.effect.traitId.trim() : '';
          if (!traitId || !CHARACTER_TRAITS.some((trait) => trait.id === traitId)) return reject('成长特质必须使用已登记的特质 ID');
          validOptions.push({ id, label, effect: { kind: 'trait', traitId } });
        } else return reject('成长选项效果不合法');
      }
      const duplicate = growthOpportunities.find((entry) => entry.status === 'open'
        && entry.summary === summary
        && entry.evidenceEventIds.join('|') === evidenceEventIds.join('|'));
      if (duplicate) return reject('相同证据已经产生过未选择的成长机会');
      const id = `growth:${context.turn}:${sequence}`;
      growthOpportunities.push({ id, basis: command.basis, summary, evidenceEventIds, options: validOptions, offeredTurn: context.turn, status: 'open' });
      accepted.push(command);
      changes.push(`出现成长选择：${summary}`);
      return;
    }
    if (command.type === 'CLAIM_GROWTH_CHOICE') {
      if (command.actorId !== context.playerId) return reject('只有玩家本人可以确认自己的成长方向');
      const opportunity = growthOpportunities.find((entry) => entry.id === command.opportunityId);
      if (!opportunity || opportunity.status !== 'open') return reject('成长机会不存在或已经使用');
      const option = opportunity.options.find((entry) => entry.id === command.optionId);
      if (!option) return reject('成长选项不存在');
      const applied = (context.appliedGrowthChoices ?? []).some((entry) => entry.opportunityId === command.opportunityId && entry.optionId === command.optionId);
      if (!applied) return reject('成长选择缺少已通过规则结算的对应永久变更');
      opportunity.status = 'claimed';
      opportunity.claimedOptionId = option.id;
      opportunity.claimedTurn = context.turn;
      accepted.push(command);
      changes.push(`确认成长方向：${option.label}`);
      return;
    }
    const summary = typeof command.summary === 'string' ? stripEmoji(command.summary).trim().slice(0, 240) : '';
    const targets = Array.isArray(command.targetIds) ? [...new Set(command.targetIds)] : [];
    if (!acts.has(command.act)) return reject('社会行为类型不合法');
    if (!allowed.has(command.actorId)) return reject('发起者不在当前可交流场景');
    if (!targets.length || targets.some((id) => !allowed.has(id) || id === command.actorId)) return reject('社会行为对象必须是当前场景中的其他人物');
    if (!summary) return reject('社会行为缺少可追溯摘要');
    if (command.visibility !== 'private' && command.visibility !== 'public') return reject('社会行为受众不合法');
    if (!validDate(command.dueDate)) return reject('承诺期限必须使用 年.月.日');

    const exchangeId = command.exchangeId?.trim().slice(0, 80);
    if (['request', 'conditional', 'accept', 'reject'].includes(command.act) && !exchangeId) {
      return reject('请求、反提议与答复必须使用交涉 ID');
    }
    if (command.act === 'conditional' && exchangeId) {
      const request = [...state.socialEvents].reverse().find((event) => event.exchangeId === exchangeId
        && event.act === 'request'
        && event.targetIds.includes(command.actorId)
        && targets.includes(event.actorId));
      if (!request) return reject('反提议必须回应同一交涉中的明确请求');
    }
    if ((command.act === 'accept' || command.act === 'reject') && exchangeId) {
      const offer = [...state.socialEvents].reverse().find((event) => event.exchangeId === exchangeId
        && (event.act === 'request' || event.act === 'conditional')
        && event.targetIds.includes(command.actorId)
        && targets.includes(event.actorId));
      if (!offer) return reject('接受或拒绝必须回应同一交涉中的请求或反提议');
    }

    let commitment: Commitment | undefined;
    if (command.act === 'promise') {
      const eventId = `social:${context.turn}:${sequence}`;
      commitment = {
        id: `commitment:${context.turn}:${sequence}`,
        debtorId: command.actorId,
        creditorIds: targets,
        terms: summary,
        createdTurn: context.turn,
        ...(command.dueDate ? { dueDate: command.dueDate } : {}),
        status: 'open',
        sourceEventId: eventId,
      };
    }
    if (command.act === 'fulfill' || command.act === 'break') {
      commitment = state.commitments.find((entry) => entry.id === command.commitmentId);
      if (!commitment || commitment.status !== 'open') return reject('要处理的承诺不存在或已经结束');
      if (commitment.debtorId !== command.actorId) return reject('只有承诺人可以履行或违背该承诺');
    }

    const event: SocialEvent = {
      id: `social:${context.turn}:${sequence}`,
      turn: context.turn,
      act: command.act,
      actorId: command.actorId,
      targetIds: targets,
      summary,
      visibility: command.visibility,
      heardByIds: command.visibility === 'public' ? [...allowed].sort() : [...new Set([command.actorId, ...targets])].sort(),
      ...(exchangeId ? { exchangeId } : {}),
      ...(commitment ? { commitmentId: commitment.id } : {}),
    };
    if (!event.heardByIds.includes(context.playerId)) return reject('当前回合解析器不能记录玩家未听见的私下互动');
    state.socialEvents.push(event);
    const impact: RelationshipEvidence['impact'] = command.act === 'fulfill' || command.act === 'accept'
      ? 'positive'
      : command.act === 'break'
        ? 'negative'
        : command.act === 'promise'
          ? 'obligation'
          : 'neutral';
    relationshipEvidence.push({ id: `relationship:${event.id}`, turn: context.turn, participantIds: [command.actorId, ...targets], sourceEventId: event.id, summary, impact, heardByIds: [...event.heardByIds] });
    if (command.act === 'promise' && commitment) state.commitments.push(commitment);
    if ((command.act === 'fulfill' || command.act === 'break') && commitment) {
      commitment.status = command.act === 'fulfill' ? 'fulfilled' : 'broken';
      commitment.resolvedTurn = context.turn;
    }
    if (command.act === 'disclose') {
      for (const characterId of event.heardByIds) {
        state.knowledge.push({
          id: `knowledge:${event.id}:${characterId}`,
          characterId,
          claim: summary,
          sourceEventId: event.id,
          learnedTurn: context.turn,
        });
      }
    }
    accepted.push(command);
    changes.push(command.act === 'promise' ? `新增承诺：${summary}` : `社会进展：${summary}`);
  });

  if (accepted.length || changes.length) state.revision += 1;
  return { state, accepted, rejected, changes };
}

function parseDate(value: string): [number, number, number] {
  const [year, month, day] = value.split('.').map(Number);
  return [year || 0, month || 1, day || 1];
}

function compareDate(left: string, right: string): number {
  const a = parseDate(left);
  const b = parseDate(right);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function addDays(value: string, days: number): string {
  let [year, month, day] = parseDate(value);
  day += days;
  while (day > 30) { day -= 30; month += 1; }
  while (month > 12) { month -= 12; year += 1; }
  return `${year}.${month}.${day}`;
}

function dueLabel(dueDate: string | undefined, currentDate?: string): string {
  if (!dueDate) return '';
  const overdue = currentDate && dueDate.localeCompare(currentDate, undefined, { numeric: true }) < 0;
  return `；期限 ${dueDate}${overdue ? '（已逾期，尚未自动判定违约）' : ''}`;
}

export function formatRoleplayContext(state: RoleplayState | undefined, viewerId: CharacterId, currentDate?: string): string {
  if (!state) return '';
  const openCommitments = roleplayCommitmentsForViewer(state, viewerId).slice(-6);
  const recentEvents = state.socialEvents.filter((event) => event.heardByIds.includes(viewerId)).slice(-6);
  const messages = (state.messages ?? []).filter((message) => message.senderId === viewerId || message.recipientIds.includes(viewerId)).slice(-4);
  const agendas = (state.agendas ?? []).filter((agenda) => agenda.heardByIds.includes(viewerId) && agenda.status !== 'resolved' && agenda.status !== 'cancelled').slice(-4);
  const projects = (state.projects ?? []).filter((project) => project.ownerId === viewerId || project.assigneeId === viewerId).slice(-4);
  const growthOpportunities = (state.growthOpportunities ?? []).filter((entry) => entry.status === 'open').slice(-3);
  const lines = [
    '### 【社会关系账本】',
    ...(openCommitments.length
      ? openCommitments.map((entry) => `- 未履行承诺 [${entry.id}]：${entry.terms}${dueLabel(entry.dueDate, currentDate)}`)
      : ['- 当前没有与玩家直接相关的未履行承诺。']),
    ...recentEvents.map((event) => `- 已知互动 [${event.id};${event.act};发起者 ${event.actorId};对象 ${event.targetIds.join(',')}${event.exchangeId ? `;交涉 ${event.exchangeId}` : ''}]：${event.summary}`),
    ...messages.map((message) => `- 消息 [${message.id};${message.status}]：${message.summary}；预计/实际送达 ${message.arrivesOn}`),
    ...agendas.map((agenda) => `- 人物议程 [${agenda.id};${agenda.status}]：${agenda.summary}；日期 ${agenda.dueDate}`),
    ...projects.map((project) => `- 委派 [${project.id};${project.status};受任者 ${project.assigneeId}]：${project.objective}；期限 ${project.dueDate}`),
    ...growthOpportunities.map((entry) => `- 成长机会 [${entry.id};${entry.basis}]：${entry.summary}；可选 ${entry.options.map((option) => `${option.id}=${option.label}`).join(' / ')}`),
  ];
  return lines.join('\n');
}

export function relationshipEvidenceForViewer(state: RoleplayState | undefined, viewerId: CharacterId, otherId?: CharacterId): RelationshipEvidence[] {
  return (state?.relationshipEvidence ?? []).filter((entry) => entry.heardByIds.includes(viewerId)
    && entry.participantIds.includes(viewerId)
    && (!otherId || entry.participantIds.includes(otherId)));
}

export function roleplayCommitmentsForViewer(state: RoleplayState | undefined, viewerId: CharacterId): Commitment[] {
  if (!state) return [];
  return state.commitments.filter((entry) => entry.status === 'open'
    && (entry.debtorId === viewerId || entry.creditorIds.includes(viewerId)));
}

export function openSocialOffersForViewer(state: RoleplayState | undefined, viewerId: CharacterId): SocialEvent[] {
  if (!state) return [];
  const latestByExchange = new Map<string, SocialEvent>();
  for (const event of state.socialEvents) {
    if (!event.exchangeId || !event.heardByIds.includes(viewerId)) continue;
    latestByExchange.set(event.exchangeId, event);
  }
  return [...latestByExchange.values()].filter((event) => event.act === 'conditional' && event.targetIds.includes(viewerId));
}
