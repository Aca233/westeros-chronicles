import type { CharacterId } from '../../domain/characterId';
import type { EquipmentPosition, ItemStateCommand, ItemStorageSite, ItemStorageSiteType, ItemSystemState } from '../items/types';
import type { WorldLocationRef } from '../../domain/worldLocation';
import type { ActiveJourney, TravelStateCommand } from '../map/travel/types';
import type { RoutePreference, TravelMode } from '../map/types';
import type { WorldDate, WorldDateAdvance } from '../../domain/worldDate';
import type { LivingWorldState } from './livingWorldContracts';

export type WorldPrincipalRef =
  | { type: 'character'; characterId: CharacterId }
  | { type: 'dynasty'; dynastyId: string }
  | { type: 'title'; titleId: string };
export type WorldCustodianRef = { type: 'character'; characterId: CharacterId } | { type: 'asset'; assetId: string };
export type WorldSubjectRef = WorldPrincipalRef | { type: 'asset'; assetId: string } | { type: 'location'; location: WorldLocationRef };
export type AssetPlacement = { type: 'character'; characterId: CharacterId } | { type: 'location'; location: WorldLocationRef } | { type: 'asset'; assetId: string };
export interface CharacterWorldPatch { alive?: boolean; location?: WorldLocationRef | null; currentActivity?: 'idle' | 'travelling' | 'imprisoned' | 'missing'; }
export interface TitleWorldPatch { lawfulHolderId?: CharacterId | null; controllerId?: CharacterId | null; contestedByIds?: CharacterId[]; }
export interface AssetWorldPatch { kind: 'item' | 'site' | 'vehicle'; lawfulOwner?: WorldPrincipalRef | null; controller?: WorldPrincipalRef | null; custodian?: WorldCustodianRef | null; placement?: AssetPlacement | null; equippedPosition?: EquipmentPosition | null; status?: 'normal' | 'stolen' | 'inheritance_pending'; }
export type TravelWorldIntentKind = 'plan_travel'|'start_travel'|'pause_travel'|'resume_travel'|'reroute_travel'|'return_travel'|'advance_travel'|'arrive'|'cancel_travel'|'move_inside_location';
export type TravelWorldIntent = { [K in TravelWorldIntentKind]: { kind: K; actorId: CharacterId; targetRef?: WorldSubjectRef; elapsedTime?: WorldDateAdvance; routePreference?: RoutePreference; travelMode?: TravelMode; via?: WorldLocationRef[]; companionIds?: CharacterId[]; vehicleIds?: string[]; evidenceText: string } }[TravelWorldIntentKind];
export type LivingWorldIntentKind = 'investigate_situation'|'negotiate_access'|'escort_transport'|'reroute_transport'|'request_relief'|'delegate_relief';
export type LivingWorldIntent = { kind:LivingWorldIntentKind; actorId:CharacterId; situationId?:string; actionId?:string; assigneeId?:CharacterId; targetRef?:WorldSubjectRef; evidenceText:string };
export type WorldIntent =
  | { kind:'mention'; actorId:CharacterId; targetRef?:WorldSubjectRef; evidenceText:string }
  | TravelWorldIntent
  | LivingWorldIntent
  | { kind:'gift_asset'; actorId:CharacterId; assetId:string; recipientId:CharacterId; evidenceText:string }
  | { kind:'steal_asset'; actorId:CharacterId; assetId:string; evidenceText:string }
  | { kind:'inherit_asset'; actorId:CharacterId; assetId:string; recipientId:CharacterId; evidenceText:string }
  | { kind:'transfer_asset'; actorId:CharacterId; assetId:string; placement:AssetPlacement; evidenceText:string }
  | { kind:'equip_asset'; actorId:CharacterId; assetId:string; position:EquipmentPosition; evidenceText:string }
  | { kind:'unequip_asset'; actorId:CharacterId; assetId:string; placement:AssetPlacement; evidenceText:string }
  | { kind:'grant_title'|'inherit_title'|'settle_title_war'; actorId:CharacterId; titleId:string; recipientId:CharacterId; evidenceText:string }
  | { kind:'revoke_title'; actorId:CharacterId; titleId:string; holderId:CharacterId; evidenceText:string }
  | { kind:'occupy_title'; actorId:CharacterId; titleId:string; evidenceText:string }
  | { kind:'create_site'; actorId:CharacterId; siteType:ItemStorageSiteType; name?:string; evidenceText:string };
export type WorldEventSource = 'player_input'|'ui_action'|'ai_resolution'|'system_rule';
export interface WorldEvent { id:string; transactionId:string; turn:number; date:WorldDate; type:string; actorIds:CharacterId[]; subjectRefs:WorldSubjectRef[]; location?:WorldLocationRef; reason:string; source:WorldEventSource; canonicalEventId?:string; visibility:'public'|'secret'; knownBy?:CharacterId[]; causeEventIds?:string[]; claimedCauseEventIds?:string[]; causeSource?:{type:'rule'|'action'|'canonical'|'claim';id:string}; affectedRefs?:WorldSubjectRef[]; knowledgeBasis?:Array<{characterId:CharacterId;kind:'witness'|'message'|'public_record';sourceEventId?:string}>; occurredAt?:WorldDate; }
export interface PendingWorldTransaction { id:string; status:'pending'|'committed'|'rejected'|'cancelled'; source:'ui_action'|'player_input'; conflictKeys:string[]; intents:WorldIntent[]; itemCommands?:ItemStateCommand[]; travelCommands?:TravelStateCommand[]; rejectionReason?:string; }
export interface WorldRuntimeState { schemaVersion:1; revision:number; characters:Record<CharacterId,CharacterWorldPatch>; titles:Record<string,TitleWorldPatch>; assets:Record<string,AssetWorldPatch>; events:WorldEvent[]; pendingTransactions:PendingWorldTransaction[]; livingWorld?:LivingWorldState; }
export type AssetWorldIntent = Extract<WorldIntent,{kind:'gift_asset'|'steal_asset'|'inherit_asset'|'transfer_asset'|'equip_asset'|'unequip_asset'}>;
export type WorldMutation =
 | {type:'character.move';characterId:CharacterId;location:WorldLocationRef;activity?:CharacterWorldPatch['currentActivity']}
 | {type:'character.set-alive';characterId:CharacterId;alive:boolean}
 | {type:'title.set-holder';titleId:string;holderId:CharacterId|null}
 | {type:'title.set-controller';titleId:string;controllerId:CharacterId|null;contestedByIds?:CharacterId[]}
 | {type:'asset.set-lawful-owner';assetId:string;owner:WorldPrincipalRef|null}
 | {type:'asset.set-controller';assetId:string;controller:WorldPrincipalRef|null}
 | {type:'asset.set-custodian';assetId:string;custodian:WorldCustodianRef|null}
 | {type:'asset.place';assetId:string;placement:AssetPlacement|null}
 | {type:'asset.equip';assetId:string;characterId:CharacterId;position:EquipmentPosition}
 | {type:'asset.unequip';assetId:string}
 | {type:'asset.set-status';assetId:string;status:AssetWorldPatch['status']}
 | {type:'asset.delete-runtime-patch';assetId:string};
export interface WorldCommitSlice { runtime:WorldRuntimeState; items:ItemSystemState; journey?:ActiveJourney; date:WorldDate; }
export interface WorldTransaction { id:string; turn:number; source:WorldEvent['source']; reason:string; intents:WorldIntent[]; mutations:WorldMutation[]; dateAdvance?:WorldDateAdvance; itemCommands?:ItemStateCommand[]; siteCreations?:ItemStorageSite[]; nextJourney?:ActiveJourney|null; eventDrafts:Array<Omit<WorldEvent,'id'|'transactionId'|'turn'|'date'|'source'>>; }
export type WorldTransactionResult = {ok:true;state:WorldCommitSlice;transactionId:string;duplicate:boolean;events:WorldEvent[]} | {ok:false;state:WorldCommitSlice;transactionId:string;reason:string};
