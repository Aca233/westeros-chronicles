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

/**
 * 将已经确认的头衔事实转换为世界突变。
 * 这里只表达法理与控制的差异；授权、继承顺位和战争胜负应在上游裁定。
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
    case 'inherit_title':
    case 'settle_title_war':
      requireCharacter(context, intent.recipientId);
      return formalTransfer(intent.titleId, intent.recipientId);
    case 'revoke_title':
      requireCharacter(context, intent.holderId);
      if (title.lawfulHolderId !== intent.holderId) {
        throw new Error(`头衔 ${intent.titleId} 的法理持有人不符`);
      }
      return [
        { type: 'title.set-holder', titleId: intent.titleId, holderId: null },
        { type: 'title.set-controller', titleId: intent.titleId, controllerId: null, contestedByIds: [] },
      ];
  }
}
