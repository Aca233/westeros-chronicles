import type { CharacterId } from '../../domain/characterId';
import type { WorldDate } from '../../domain/worldDate';
import type { WoundLevel } from '../../domain/body';
import type { ActionActivity, TimePrecision } from '../time/gameClock';

export const ANATOMICAL_ZONES = [
  'head',
  'chest',
  'abdomen',
  'left_arm',
  'right_arm',
  'left_hand',
  'right_hand',
  'left_leg',
  'right_leg',
  'left_foot',
  'right_foot',
] as const;

export type AnatomicalZoneKey = typeof ANATOMICAL_ZONES[number];
export type MigratedUnknownZone = 'unknown_torso' | 'unknown_upper_limb' | 'unknown_lower_limb';
export type InjuryZone = AnatomicalZoneKey | MigratedUnknownZone;
export type InjuryKind = 'cut_puncture' | 'blunt' | 'fracture' | 'burn' | 'disease' | 'poison' | 'disability';
export type InjurySeverity = Exclude<WoundLevel, 'intact'>;
export type InfectionState = 'none' | 'risk' | 'infected';
export type RecoveryStage = 'acute' | 'stabilized' | 'recovering' | 'healed' | 'permanent';
export type TreatmentKind = 'first_aid' | 'definitive' | 'immobilize';
export type DominantHand = 'left' | 'right';
export type HealthCapabilityKey = 'left_grip' | 'right_grip' | 'two_hand_coordination' | 'walk' | 'run' | 'sight' | 'hearing' | 'consciousness';

export interface HealthMoment {
  date: WorldDate;
  minuteOfDay: number;
}

export interface InjuryTreatmentState {
  firstAid: boolean;
  definitive: boolean;
  immobilized: boolean;
  bleedingControlled: boolean;
  lastTreatmentAt?: HealthMoment;
  lastTreatmentKind?: TreatmentKind;
  healerId?: CharacterId;
  treatmentQuality?: number;
}

export interface InjuryRecoveryState {
  stage: RecoveryStage;
  progress: number;
  untreatedMinutes: number;
  bleedingMinutes: number;
}

export interface CharacterInjury {
  id: string;
  kind: InjuryKind;
  zone: InjuryZone;
  cause: string;
  severity: InjurySeverity;
  bleeding: 0 | 1 | 2 | 3;
  pain: 0 | 1 | 2 | 3;
  infection: InfectionState;
  createdAt: HealthMoment;
  treatment: InjuryTreatmentState;
  recovery: InjuryRecoveryState;
  permanentEffect?: string;
  hiddenFromPlayer?: boolean;
}

export interface SurvivalState {
  hunger: number;
  thirst: number;
  fatigue: number;
  lastMealAt?: HealthMoment;
  lastDrinkAt?: HealthMoment;
  lastSleepAt?: HealthMoment;
}

export interface CharacterHealthState {
  schemaVersion: 1;
  characterId: CharacterId;
  dominantHand: DominantHand;
  alive: boolean;
  deathReason?: string;
  injuries: CharacterInjury[];
  survival: SurvivalState;
  lastUpdatedAt: HealthMoment;
  timePrecision: TimePrecision;
}

export interface HealthRuntimeState {
  schemaVersion: 1;
  characters: Record<CharacterId, CharacterHealthState>;
}

export interface CapabilityReason {
  injuryId: string;
  label: string;
  penalty: number;
}

export interface HealthCapability {
  key: HealthCapabilityKey;
  score: number;
  reasons: CapabilityReason[];
}

export type HealthCapabilities = Record<HealthCapabilityKey, HealthCapability>;

export interface HealthAdvanceContext {
  activity: ActionActivity;
  sleep?: boolean;
}

export interface HealthTreatmentCommand {
  type: 'TREAT_INJURY';
  characterId?: CharacterId;
  injuryId: string;
  treatment: TreatmentKind;
  supplyInstanceId?: string;
  healerId?: CharacterId;
  environment?: 'field' | 'shelter' | 'clean';
}

export interface HealthHitCommand {
  type: 'APPLY_HIT';
  characterId?: CharacterId;
  zone: AnatomicalZoneKey;
  injuryKind: Exclude<InjuryKind, 'disease' | 'poison' | 'disability'>;
  severity: InjurySeverity;
  cause: string;
  damageTags?: string[];
  sourceItemId?: string;
}

export interface SurvivalConsumeCommand {
  type: 'CONSUME_SURVIVAL';
  characterId?: CharacterId;
  resource: 'food' | 'water';
  instanceId?: string;
}

export interface RestCommand {
  type: 'REST';
  characterId?: CharacterId;
  minutes: number;
  sleep?: boolean;
}

export type HealthStateCommand = HealthTreatmentCommand | HealthHitCommand | SurvivalConsumeCommand | RestCommand;
