import type { CharacterId } from '../../domain/characterId';
import type { LordBodyCondition, BodyZoneStatus } from '../../types/game';
import type { WoundLevel } from '../../domain/body';
import type { GameMoment, TimePrecision } from '../time/gameClock';
import type {
  AnatomicalZoneKey,
  CharacterHealthState,
  CharacterInjury,
  HealthCapabilities,
  HealthCapabilityKey,
  HealthRuntimeState,
  InjuryKind,
  InjurySeverity,
  InjuryZone,
} from './types';

const LEVEL_INDEX: Record<WoundLevel, number> = { intact: 0, minor: 1, heavy: 2, critical: 3 };
const LEVELS: WoundLevel[] = ['intact', 'minor', 'heavy', 'critical'];

export const ANATOMICAL_ZONE_LABELS: Record<AnatomicalZoneKey | 'unknown_torso' | 'unknown_upper_limb' | 'unknown_lower_limb', string> = {
  head: '头部',
  chest: '胸部',
  abdomen: '腹部',
  left_arm: '左臂',
  right_arm: '右臂',
  left_hand: '左手',
  right_hand: '右手',
  left_leg: '左腿',
  right_leg: '右腿',
  left_foot: '左足',
  right_foot: '右足',
  unknown_torso: '躯干（旧档部位未细分）',
  unknown_upper_limb: '上肢（旧档侧别未知）',
  unknown_lower_limb: '下肢（旧档侧别未知）',
};

function healthMoment(moment: GameMoment) {
  return { date: { ...moment.date }, minuteOfDay: moment.minuteOfDay };
}

export function createHealthyCharacterHealthState(
  characterId: CharacterId,
  moment: GameMoment,
  dominantHand: 'left' | 'right' = 'right',
  precision: TimePrecision = 'exact',
): CharacterHealthState {
  return {
    schemaVersion: 1,
    characterId,
    dominantHand,
    alive: true,
    injuries: [],
    survival: { hunger: 0, thirst: 0, fatigue: 0 },
    lastUpdatedAt: healthMoment(moment),
    timePrecision: precision,
  };
}

export function createHealthRuntimeState(): HealthRuntimeState {
  return { schemaVersion: 1, characters: {} };
}

function legacyZoneFor(zone: InjuryZone): 'head' | 'torso' | 'arms' | 'legs' {
  if (zone === 'head') return 'head';
  if (zone === 'chest' || zone === 'abdomen' || zone === 'unknown_torso') return 'torso';
  if (zone === 'left_arm' || zone === 'right_arm' || zone === 'left_hand' || zone === 'right_hand' || zone === 'unknown_upper_limb') return 'arms';
  return 'legs';
}

function maxLevel(injuries: readonly CharacterInjury[]): WoundLevel {
  let max = 0;
  for (const injury of injuries) {
    if (injury.recovery.stage === 'healed') continue;
    max = Math.max(max, LEVEL_INDEX[injury.severity]);
  }
  return LEVELS[max];
}

function zoneStatus(key: 'head' | 'torso' | 'arms' | 'legs', name: string, fatal: boolean, injuries: readonly CharacterInjury[]): BodyZoneStatus {
  return {
    key,
    name,
    level: maxLevel(injuries),
    wounds: injuries.filter((injury) => injury.recovery.stage !== 'healed').map((injury) => `${ANATOMICAL_ZONE_LABELS[injury.zone]}：${injury.cause}`),
    isFatalZone: fatal,
  };
}

export function projectLegacyBodyFromHealth(state: CharacterHealthState): LordBodyCondition {
  const grouped = { head: [] as CharacterInjury[], torso: [] as CharacterInjury[], arms: [] as CharacterInjury[], legs: [] as CharacterInjury[] };
  for (const injury of state.injuries) grouped[legacyZoneFor(injury.zone)].push(injury);
  return {
    head: zoneStatus('head', '头部与咽喉', true, grouped.head),
    torso: zoneStatus('torso', '胸膛与躯干', true, grouped.torso),
    arms: zoneStatus('arms', '双臂与双手', false, grouped.arms),
    legs: zoneStatus('legs', '双腿与下肢', false, grouped.legs),
    isBleeding: state.injuries.some((injury) => injury.recovery.stage !== 'healed' && injury.bleeding > 0 && !injury.treatment.bleedingControlled),
    isPoisoned: state.injuries.some((injury) => injury.recovery.stage !== 'healed' && injury.kind === 'poison'),
    isInfected: state.injuries.some((injury) => injury.recovery.stage !== 'healed' && injury.infection === 'infected'),
  };
}

function migratedInjury(
  characterId: CharacterId,
  zone: InjuryZone,
  severity: InjurySeverity,
  cause: string,
  index: number,
  moment: GameMoment,
  kind: InjuryKind = 'cut_puncture',
): CharacterInjury {
  return {
    id: `migrated:${characterId}:${zone}:${index}`,
    kind,
    zone,
    cause: cause || '旧存档记录的伤势',
    severity,
    bleeding: 0,
    pain: severity === 'minor' ? 1 : severity === 'heavy' ? 2 : 3,
    infection: 'none',
    createdAt: healthMoment(moment),
    treatment: { firstAid: false, definitive: false, immobilized: false, bleedingControlled: true },
    recovery: { stage: 'stabilized', progress: 0, untreatedMinutes: 0, bleedingMinutes: 0 },
  };
}

function permanentDisabilityFromTrait(traitId: string): { zone: InjuryZone; severity: InjurySeverity; cause: string } | undefined {
  const id = traitId.toLowerCase();
  if (id === 'one_eyed') return { zone: 'head', severity: 'minor', cause: '独眼' };
  if (id === 'half_blind') return { zone: 'head', severity: 'minor', cause: '半失明' };
  if (id === 'blind') return { zone: 'head', severity: 'critical', cause: '失明' };
  if (id.startsWith('one_leg')) return { zone: 'unknown_lower_limb', severity: 'critical', cause: '独腿' };
  if (id.startsWith('one_hand')) return { zone: 'unknown_upper_limb', severity: 'critical', cause: '独臂' };
  if (id === 'maimed') return { zone: 'unknown_torso', severity: 'critical', cause: '永久残疾' };
  if (id === 'crippled') return { zone: 'unknown_torso', severity: 'critical', cause: '瘫痪' };
  if (id.startsWith('disfigur')) return { zone: 'head', severity: 'minor', cause: '毁容' };
  if (id.startsWith('deaf')) return { zone: 'head', severity: 'critical', cause: '失聪' };
  return undefined;
}

export function migrateLegacyBodyToHealth(
  characterId: CharacterId,
  body: LordBodyCondition,
  moment: GameMoment,
  options: { precision?: TimePrecision; dominantHand?: 'left' | 'right'; traitIds?: readonly string[] } = {},
): CharacterHealthState {
  const state = createHealthyCharacterHealthState(characterId, moment, options.dominantHand ?? 'right', options.precision ?? 'day_only');
  const mappings: Array<{ zone: InjuryZone; level: WoundLevel; wounds: string[] }> = [
    { zone: 'head', level: body.head.level, wounds: body.head.wounds },
    { zone: 'unknown_torso', level: body.torso.level, wounds: body.torso.wounds },
    { zone: 'unknown_upper_limb', level: body.arms.level, wounds: body.arms.wounds },
    { zone: 'unknown_lower_limb', level: body.legs.level, wounds: body.legs.wounds },
  ];
  let index = 0;
  for (const entry of mappings) {
    if (entry.level === 'intact' && !entry.wounds.length) continue;
    const severity = entry.level === 'intact' ? 'minor' : entry.level;
    const causes = entry.wounds.length ? entry.wounds : ['旧存档记录的伤势'];
    for (const cause of causes) state.injuries.push(migratedInjury(characterId, entry.zone, severity, cause, index++, moment));
  }
  if (body.isPoisoned) state.injuries.push(migratedInjury(characterId, 'unknown_torso', 'heavy', '旧存档记录的中毒状态', index++, moment, 'poison'));
  if (body.isInfected) {
    const injury = migratedInjury(characterId, 'unknown_torso', 'heavy', '旧存档记录的感染状态', index++, moment, 'disease');
    injury.infection = 'infected';
    state.injuries.push(injury);
  }
  if (body.isBleeding && state.injuries.length) {
    const first = state.injuries[0];
    first.bleeding = 1;
    first.treatment.bleedingControlled = false;
  }
  for (const traitId of options.traitIds ?? []) {
    const disability = permanentDisabilityFromTrait(traitId);
    if (!disability) continue;
    state.injuries.push({
      ...migratedInjury(characterId, disability.zone, disability.severity, disability.cause, index++, moment, 'disability'),
      permanentEffect: traitId,
      recovery: { stage: 'permanent', progress: 0, untreatedMinutes: 0, bleedingMinutes: 0 },
    });
  }
  return state;
}

function penaltyForSeverity(severity: InjurySeverity): number {
  return severity === 'minor' ? 15 : severity === 'heavy' ? 35 : 65;
}

function capabilityTargets(injury: CharacterInjury): HealthCapabilityKey[] {
  const permanentEffect = injury.kind === 'disability' ? injury.permanentEffect?.toLowerCase() : undefined;
  if (permanentEffect === 'one_eyed' || permanentEffect === 'half_blind' || permanentEffect === 'blind') return ['sight'];
  if (permanentEffect?.startsWith('one_leg')) return ['walk', 'run'];
  if (permanentEffect?.startsWith('one_hand') && injury.zone === 'unknown_upper_limb') return ['two_hand_coordination'];
  if (permanentEffect === 'maimed') return ['two_hand_coordination', 'walk', 'run'];
  if (permanentEffect === 'crippled') return ['left_grip', 'right_grip', 'two_hand_coordination', 'walk', 'run'];
  if (permanentEffect?.startsWith('disfigur')) return [];
  if (permanentEffect?.startsWith('deaf')) return ['hearing'];

  const zone = injury.zone;
  if (zone === 'left_hand' || zone === 'left_arm') return ['left_grip', 'two_hand_coordination'];
  if (zone === 'right_hand' || zone === 'right_arm') return ['right_grip', 'two_hand_coordination'];
  if (zone === 'unknown_upper_limb') return ['left_grip', 'right_grip', 'two_hand_coordination'];
  if (zone === 'left_leg' || zone === 'right_leg' || zone === 'left_foot' || zone === 'right_foot' || zone === 'unknown_lower_limb') return ['walk', 'run'];
  if (zone === 'head') return ['sight', 'hearing', 'consciousness'];
  if (zone === 'chest' || zone === 'abdomen' || zone === 'unknown_torso') return ['run', 'consciousness'];
  return [];
}

export function deriveHealthCapabilities(state: CharacterHealthState): HealthCapabilities {
  const keys: HealthCapabilityKey[] = ['left_grip', 'right_grip', 'two_hand_coordination', 'walk', 'run', 'sight', 'hearing', 'consciousness'];
  const capabilities = Object.fromEntries(keys.map((key) => [key, { key, score: state.alive ? 100 : 0, reasons: [] }])) as unknown as HealthCapabilities;
  for (const injury of state.injuries) {
    if (injury.recovery.stage === 'healed') continue;
    const basePenalty = penaltyForSeverity(injury.severity);
    for (const key of capabilityTargets(injury)) {
      const capability = capabilities[key];
      const penalty = Math.min(capability.score, basePenalty + (injury.kind === 'disability' ? 25 : 0));
      capability.score = Math.max(0, capability.score - penalty);
      capability.reasons.push({ injuryId: injury.id, label: `${ANATOMICAL_ZONE_LABELS[injury.zone]}：${injury.cause}`, penalty });
    }
  }
  capabilities.two_hand_coordination.score = Math.min(capabilities.two_hand_coordination.score, capabilities.left_grip.score, capabilities.right_grip.score);
  capabilities.run.score = Math.min(capabilities.run.score, capabilities.walk.score);
  const survivalPenalty = Math.max(0, state.survival.thirst - 70) + Math.max(0, state.survival.fatigue - 80);
  if (survivalPenalty > 0) capabilities.consciousness.score = Math.max(0, capabilities.consciousness.score - survivalPenalty);
  return capabilities;
}
