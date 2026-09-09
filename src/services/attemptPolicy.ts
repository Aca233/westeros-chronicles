import type { GameState, StateCommand, StoryTurn } from '../types/game';
import type { DiceRequest } from './turn/diceRequest';
import { inferActionCheck } from './dicePolicy';
import { sameWorldLocation } from '../features/map/locationResolver';

export interface AttemptIdentity {
  attemptKey: string;
  conditionKey: string;
}

interface AttemptDraftLike {
  stateCommands?: readonly StateCommand[];
  worldIntents?: readonly unknown[];
}

const ATTEMPT_SIGNATURE_FIELDS = new Set([
  'targetId', 'targetText', 'targetIds', 'recipientId', 'characterId', 'spouseId',
  'sellerId', 'buyerId', 'assigneeId', 'assetId', 'titleId', 'holderId', 'commitmentId',
  'exchangeId', 'agendaId', 'projectId', 'definitionId',
  'instanceId', 'toolInstanceId', 'travelMode', 'routePreference', 'viaText', 'companionIds',
  'vehicleIds', 'silverCost', 'silverPrice', 'goldDragons', 'silverStags', 'quantity', 'dueDate',
]);

function collectAttemptSignature(value: unknown, out: string[], depth = 0): void {
  if (depth > 4 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectAttemptSignature(entry, out, depth + 1));
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (ATTEMPT_SIGNATURE_FIELDS.has(key)) {
      if (typeof entry === 'string' && entry.trim()) out.push(`${key}:${entry.trim()}`);
      else if (typeof entry === 'number' && Number.isFinite(entry)) out.push(`${key}:${entry}`);
      else if (typeof entry === 'boolean') out.push(`${key}:${entry}`);
      else if (Array.isArray(entry)) entry.forEach((item) => {
        if (typeof item === 'string' && item.trim()) out.push(`${key}:${item.trim()}`);
        else if (typeof item === 'number' && Number.isFinite(item)) out.push(`${key}:${item}`);
      });
      continue;
    }
    if (key === 'targetRef' || key === 'location' || key === 'placement' || key === 'position') {
      collectAttemptSignature(entry, out, depth + 1);
    }
  }
}

function accessibleItemSignature(gameState: GameState): string[] {
  const { items } = gameState.lord;
  return Object.values(items.instances).flatMap((instance) => {
    const placement = items.placements[instance.instanceId];
    if (!placement || placement.type === 'character' || placement.type === 'lost') return [];
    if (placement.type === 'site') {
      const site = items.sites[placement.siteId];
      if (!site || !sameWorldLocation(site.location, gameState.lord.location)) return [];
    }
    if (placement.type === 'vehicle') {
      const vehicle = items.vehicles[placement.vehicleId];
      if (!vehicle || !sameWorldLocation(vehicle.location, gameState.lord.location)) return [];
    }
    const position = placement.type === 'equipped' ? JSON.stringify(placement.position) : placement.type;
    return [`${instance.instanceId}:${instance.definitionId}:${instance.quantity}:${instance.charges ?? '-'}:${instance.durability}:${position}`];
  }).sort();
}

export function buildAttemptIdentity(
  gameState: GameState,
  actionText: string,
  diceRequest: DiceRequest,
  draft: AttemptDraftLike,
): AttemptIdentity {
  const inferred = inferActionCheck(actionText);
  const signatureParts: string[] = [];
  collectAttemptSignature(draft.stateCommands ?? [], signatureParts);
  collectAttemptSignature(draft.worldIntents ?? [], signatureParts);
  const targetKey = [...new Set(signatureParts)].sort().join('|') || 'no-structured-target';
  const attemptKey = [
    inferred.intentLabel,
    diceRequest.domain,
    diceRequest.attribute,
    diceRequest.secondaryAttribute ?? '-',
    targetKey,
  ].join('::');

  const body = gameState.lord.body;
  const relatedSocial = (gameState.roleplay?.socialEvents ?? [])
    .filter((event) => signatureParts.some((target) => target.endsWith(`:${event.actorId}`)
      || event.targetIds.some((id) => target.endsWith(`:${id}`))))
    .slice(-6)
    .map((event) => event.id);
  const conditionKey = JSON.stringify({
    location: gameState.lord.location,
    scene: [...(gameState.activeScene?.presentCharacterIds ?? [])].sort(),
    attributes: {
      primary: gameState.lord.attributes[diceRequest.attribute],
      secondary: diceRequest.secondaryAttribute ? gameState.lord.attributes[diceRequest.secondaryAttribute] : undefined,
    },
    body: {
      overall: gameState.lord.overallStatus,
      head: body.head.level,
      torso: body.torso.level,
      arms: body.arms.level,
      legs: body.legs.level,
      bleeding: body.isBleeding,
      poisoned: body.isPoisoned,
      infected: body.isInfected,
    },
    traits: [...(gameState.lord.traitIds ?? [])].sort(),
    items: accessibleItemSignature(gameState),
    relatedSocial,
  });
  return { attemptKey, conditionKey };
}

export function findUnchangedFailedAttempt(
  turns: readonly StoryTurn[],
  identity: AttemptIdentity,
): StoryTurn['diceCheck'] | undefined {
  for (let index = turns.length - 1; index >= 0 && index >= turns.length - 12; index -= 1) {
    const check = turns[index]?.diceCheck;
    if (!check || check.outcome !== 'failure') continue;
    if (check.attemptKey === identity.attemptKey && check.conditionKey === identity.conditionKey) return check;
  }
  return undefined;
}
