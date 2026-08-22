import type { CharacterId } from '../characters/types';
import { SITE_TEMPLATES, SITE_TYPE_LABELS, type ItemStorageSite } from '../items/types';
import { stripEmoji } from '../../services/textSanitizer';
import type { WorldAssetBaseline, WorldBaselineSnapshot } from './worldBaseline';
import { projectWorldAsset, projectWorldCharacter, resolveAssetMapLocation } from './worldProjection';
import { worldAssetId } from './worldAssetId';
import type {
  AssetPlacement,
  AssetWorldIntent,
  WorldCustodianRef,
  WorldIntent,
  WorldMutation,
  WorldRuntimeState,
} from './worldRuntimeTypes';

export interface WorldAssetRuleContext {
  baseline: WorldBaselineSnapshot;
  runtime: WorldRuntimeState;
}

function requireCharacter(context: WorldAssetRuleContext, characterId: CharacterId): void {
  if (!projectWorldCharacter(context.baseline, context.runtime, characterId)) throw new Error(`人物不存在：${characterId}`);
}

function requireAsset(context: WorldAssetRuleContext, assetId: string): WorldAssetBaseline {
  const asset = projectWorldAsset(context.baseline, context.runtime, assetId);
  if (!asset) throw new Error(`资产不存在：${assetId}`);
  return asset;
}

function directCharacterRef(characterId: CharacterId): { type: 'character'; characterId: CharacterId } {
  return { type: 'character', characterId };
}

function custodianForPlacement(placement: AssetPlacement | null): WorldCustodianRef | null {
  if (placement?.type === 'character') return { type: 'character', characterId: placement.characterId };
  if (placement?.type === 'asset') return { type: 'asset', assetId: placement.assetId };
  return null;
}

function requireContainerTarget(context: WorldAssetRuleContext, placement: AssetPlacement): void {
  if (placement.type === 'character') requireCharacter(context, placement.characterId);
  if (placement.type === 'location' && !context.baseline.knownLocationIds.has(placement.location.locationId)) {
    throw new Error(`地点不存在：${placement.location.locationId}`);
  }
  if (placement.type === 'asset') requireAsset(context, placement.assetId);
}

function isDirectlyHeldBy(asset: WorldAssetBaseline, characterId: CharacterId): boolean {
  return asset.placement?.type === 'character'
    && asset.placement.characterId === characterId
    && asset.custodian?.type === 'character'
    && asset.custodian.characterId === characterId;
}

function requireDirectCustody(asset: WorldAssetBaseline, characterId: CharacterId): void {
  if (!isDirectlyHeldBy(asset, characterId)) {
    throw new Error(`资产 ${asset.id} 不在人物直接保管范围`);
  }
}

function requireSameMapLocation(context: WorldAssetRuleContext, asset: WorldAssetBaseline, actorId: CharacterId): void {
  const actor = projectWorldCharacter(context.baseline, context.runtime, actorId);
  if (!actor?.location) throw new Error(`人物 ${actorId} 的所在地未确认`);
  const assetLocation = resolveAssetMapLocation(context.baseline, context.runtime, asset.id);
  if (!assetLocation || assetLocation.locationId !== actor.location.locationId) {
    throw new Error(`资产 ${asset.id} 不在人物可接触地点`);
  }
}

export function planAssetIntent(
  intent: AssetWorldIntent,
  context: WorldAssetRuleContext,
): WorldMutation[] {
  requireCharacter(context, intent.actorId);
  const asset = requireAsset(context, intent.assetId);

  switch (intent.kind) {
    case 'gift_asset': {
      requireDirectCustody(asset, intent.actorId);
      requireCharacter(context, intent.recipientId);
      const recipient = directCharacterRef(intent.recipientId);
      return [
        { type: 'asset.set-lawful-owner', assetId: intent.assetId, owner: recipient },
        { type: 'asset.set-controller', assetId: intent.assetId, controller: recipient },
        { type: 'asset.set-custodian', assetId: intent.assetId, custodian: recipient },
        { type: 'asset.place', assetId: intent.assetId, placement: recipient },
        { type: 'asset.set-status', assetId: intent.assetId, status: 'normal' },
      ];
    }
    case 'steal_asset': {
      requireSameMapLocation(context, asset, intent.actorId);
      const thief = directCharacterRef(intent.actorId);
      return [
        { type: 'asset.set-controller', assetId: intent.assetId, controller: thief },
        { type: 'asset.set-custodian', assetId: intent.assetId, custodian: thief },
        { type: 'asset.place', assetId: intent.assetId, placement: thief },
        { type: 'asset.set-status', assetId: intent.assetId, status: 'stolen' },
      ];
    }
    case 'transfer_asset': {
      requireDirectCustody(asset, intent.actorId);
      requireContainerTarget(context, intent.placement);
      return [
        { type: 'asset.set-custodian', assetId: intent.assetId, custodian: custodianForPlacement(intent.placement) },
        { type: 'asset.place', assetId: intent.assetId, placement: intent.placement },
      ];
    }
    case 'equip_asset':
      requireDirectCustody(asset, intent.actorId);
      return [{ type: 'asset.equip', assetId: intent.assetId, characterId: intent.actorId, position: { ...intent.position } }];
    case 'unequip_asset':
      requireDirectCustody(asset, intent.actorId);
      requireContainerTarget(context, intent.placement);
      return [
        { type: 'asset.unequip', assetId: intent.assetId },
        { type: 'asset.set-custodian', assetId: intent.assetId, custodian: custodianForPlacement(intent.placement) },
        { type: 'asset.place', assetId: intent.assetId, placement: intent.placement },
      ];
  }
}

export interface CreateSiteRuleContext extends WorldAssetRuleContext {
  itemSites: Readonly<Record<string, unknown>>;
  idSeed: string;
  locationLabel: string;
}

/** 模型提议、引擎落成：按模板补默认容量与命名，建在行动人物当前所在地。 */
export function planCreateSiteIntent(
  intent: Extract<WorldIntent, { kind: 'create_site' }>,
  context: CreateSiteRuleContext,
): ItemStorageSite {
  requireCharacter(context, intent.actorId);
  const actor = projectWorldCharacter(context.baseline, context.runtime, intent.actorId);
  if (!actor?.location) throw new Error(`人物 ${intent.actorId} 的所在地未确认，不能创建据点`);
  const template = SITE_TEMPLATES[intent.siteType];
  const label = SITE_TYPE_LABELS[intent.siteType];
  const name = stripEmoji(intent.name ?? '').trim() || label;
  const id = context.idSeed.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  if (!id) throw new Error('据点 ID 生成失败');
  if (context.baseline.assets.has(worldAssetId.site(id)) || context.itemSites[id]) {
    throw new Error(`据点已存在：${id}`);
  }
  return {
    id,
    name,
    type: intent.siteType,
    location: { ...actor.location },
    locationLabel: context.locationLabel,
    description: stripEmoji(intent.evidenceText).slice(0, 80) || `${name}：本回合经行动确立的储藏处。`,
    capacity: template.defaultCapacity,
  };
}

export function planCharacterDeathAssets(
  deadCharacterId: CharacterId,
  context: WorldAssetRuleContext,
): WorldMutation[] {  const character = projectWorldCharacter(context.baseline, context.runtime, deadCharacterId);
  if (!character) throw new Error(`人物不存在：${deadCharacterId}`);
  if (!character.location) throw new Error(`人物 ${deadCharacterId} 的死亡地点未确认`);

  const mutations: WorldMutation[] = [];
  const assetIds = new Set([...context.baseline.assets.keys(), ...Object.keys(context.runtime.assets)]);
  for (const assetId of assetIds) {
    const asset = projectWorldAsset(context.baseline, context.runtime, assetId);
    if (!asset || asset.placement?.type !== 'character' || asset.placement.characterId !== deadCharacterId) continue;
    if (asset.equippedPosition) mutations.push({ type: 'asset.unequip', assetId });
    mutations.push(
      { type: 'asset.set-custodian', assetId, custodian: null },
      { type: 'asset.place', assetId, placement: { type: 'location', location: { ...character.location } } },
    );
    if (asset.lawfulOwner?.type === 'character' && asset.lawfulOwner.characterId === deadCharacterId) {
      mutations.push({ type: 'asset.set-status', assetId, status: 'inheritance_pending' });
    }
  }
  return mutations;
}
