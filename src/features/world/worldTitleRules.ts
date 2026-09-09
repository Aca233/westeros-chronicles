import type { CharacterId } from '../characters/types';
import type { WorldBaselineSnapshot, WorldTitleBaseline } from './worldBaseline';
import { projectWorldCharacter, projectWorldTitle } from './worldProjection';
import type { WorldIntent, WorldMutation, WorldRuntimeState } from './worldRuntimeTypes';

export type TitleWorldIntent = Extract<WorldIntent, {
  kind: 'grant_title' | 'inherit_title' | 'revoke_title' | 'occupy_title' | 'settle_title_war';
}>;

export interface WorldTitleRuleContext {
  baseline: WorldBaselineSnapshot;
  runtime: WorldRuntimeState;
}

function requireCharacter(context: WorldTitleRuleContext, characterId: CharacterId): void {
  if (!projectWorldCharacter(context.baseline, context.runtime, characterId)) {
    throw new Error(`人物不存在：${characterId}`);
  }
}

function requireTitle(context: WorldTitleRuleContext, titleId: string): WorldTitleBaseline {
  const title = projectWorldTitle(context.baseline, context.runtime, titleId);
  if (!title) throw new Error(`头衔不存在：${titleId}`);
  return title;
}

function formalTransfer(titleId: string, recipientId: CharacterId): WorldMutation[] {
  return [
    { type: 'title.set-holder', titleId, holderId: recipientId },
    { type: 'title.set-controller', titleId, controllerId: recipientId, contestedByIds: [] },
  ];
}

function requireCurrentTitleAuthority(title: WorldTitleBaseline, actorId: CharacterId): void {
  if (title.lawfulHolderId !== actorId && title.controllerId !== actorId) {
    throw new Error(`人物 ${actorId} 当前无权处置头衔 ${title.id}`);
  }
}

/**
 * 将已经确认的头衔事实转换为世界突变。
 * 这里只执行可由当前权威状态验证的变更；无法验证的上级封建权与继承顺位必须拒绝。
 */
export function planTitleIntent(
  intent: TitleWorldIntent,
  context: WorldTitleRuleContext,
): WorldMutation[] {
  requireCharacter(context, intent.actorId);
  const title = requireTitle(context, intent.titleId);

  switch (intent.kind) {
    case 'occupy_title': {
      const contestedByIds = [...new Set([
        ...title.contestedByIds,
        ...(title.lawfulHolderId ? [title.lawfulHolderId] : []),
      ])].filter((characterId) => characterId !== intent.actorId);
      return [{
        type: 'title.set-controller',
        titleId: intent.titleId,
        controllerId: intent.actorId,
        contestedByIds,
      }];
    }
    case 'grant_title':
      requireCharacter(context, intent.recipientId);
      requireCurrentTitleAuthority(title, intent.actorId);
      return formalTransfer(intent.titleId, intent.recipientId);
    case 'inherit_title': {
      requireCharacter(context, intent.recipientId);
      if (intent.actorId !== intent.recipientId) throw new Error('继承必须由继承人本人承接');
      if (!title.lawfulHolderId) throw new Error(`头衔 ${intent.titleId} 没有可验证的前任持有人`);
      const formerHolder = projectWorldCharacter(context.baseline, context.runtime, title.lawfulHolderId);
      if (!formerHolder || formerHolder.alive) throw new Error(`头衔 ${intent.titleId} 的前任持有人仍然在世`);
      return formalTransfer(intent.titleId, intent.recipientId);
    }
    case 'settle_title_war':
      requireCharacter(context, intent.recipientId);
      if (title.controllerId !== intent.actorId) throw new Error(`人物 ${intent.actorId} 未实际控制头衔 ${title.id}`);
      return formalTransfer(intent.titleId, intent.recipientId);
    case 'revoke_title':
      requireCharacter(context, intent.holderId);
      requireCurrentTitleAuthority(title, intent.actorId);
      if (title.lawfulHolderId !== intent.holderId) {
        throw new Error(`头衔 ${intent.titleId} 的法理持有人不符`);
      }
      return [
        { type: 'title.set-holder', titleId: intent.titleId, holderId: null },
        { type: 'title.set-controller', titleId: intent.titleId, controllerId: null, contestedByIds: [] },
      ];
  }
}
