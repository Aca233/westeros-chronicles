export type ImportedTraitPresentation = 'display' | 'hidden_modifier' | 'childhood_only' | 'status';

export interface ImportedCharacterTraitPolicy {
  id: string;
  presentation: ImportedTraitPresentation;
  replacementId?: string;
}

export interface FilteredImportedCharacterTraits {
  visibleTraitIds: string[];
  hiddenModifierIds: string[];
  statusTraitIds: string[];
}

const DISPLAY_TRAIT_IDS = [
  'twin',
  'strong',
  'lifestyle_blademaster',
  'lifestyle_poet',
  'lifestyle_hunter',
  'drunkard',
  'dull',
  'shrewd',
  'lifestyle_mystic',
  'disloyal',
  'lifestyle_reveler',
  'depressed_1',
  'loyal',
  'lunatic_1',
  'reckless',
  'celibate',
  'inbred',
  'hunchbacked',
  'administrator',
  'family_first',
  'sickly',
  'unyielding_defender',
  'military_engineer',
  'infertile',
  'organizer',
  'cautious_leader',
  'clubfooted',
  'stuttering',
  'scaly',
  'lisping',
  'weak',
  'aggressive_attacker',
  'heterochromia_eyes',
  'profligate',
  'albino',
  'possessed_1',
  'flexible_leader',
  'hashishiyah',
  'contrite',
  'forder',
  'lifestyle_physician',
  'lifestyle_wayfarer',
  'depressed_genetic',
  'lifestyle_gardener',
  'irritable',
  'gallowsbait',
  'flagellant',
  'logistician',
  'education_stewardship_5',
  'reclusive',
  'lunatic_genetic',
  'comfort_eater',
  'education_martial_5',
  'lifestyle_herbalist',
  'education_learning_5',
  'education_intrigue_5',
  'possessed_genetic',
  'deviant',
  'education_diplomacy_5',
  'wheezing',
  'berserker',
  'wilderness',
  'rakish',
] as const;

const CHILDHOOD_TRAIT_IDS = ['rowdy', 'bossy', 'charming', 'pensive', 'curious'] as const;

const STATUS_TRAIT_IDS = [
  'knight',
  'maester_historical',
  'nightswatch_historical',
  'septon',
  'tourney_participant',
  'widowed',
  'refusing_marriage',
  'archmaester',
  'disputed_heritage',
  'wild_oat',
  'viking',
  'disinherited',
  'reaver',
  'adventurer_follower',
  'faith_warrior',
  'legitimized_bastard',
  'red_priest',
  'child_of_concubine_male',
  'silent_sister',
  'drowned_man',
  'deserter',
  'order_member',
  'heresiarch',
  'beardless_eunuch',
  'devoted',
  'child_of_concubine_female',
  'bearded_priest',
  'shieldmaiden',
  'holy_warrior',
] as const;

const HIDDEN_MODIFIER_TRAIT_IDS = [
  'education_martial_prowess_1',
  'education_martial_prowess_2',
  'education_martial_prowess_3',
  'education_martial_prowess_4',
  'education_martial_prowess_5',
  'education_republican_knowledge_1',
  'education_republican_knowledge_2',
  'education_republican_knowledge_3',
  'education_republican_knowledge_4',
  'education_republican_knowledge_5',
  'line_of_char',
  'ruin',
  'unknown',
] as const;

const REPLACEMENT_IDS: Readonly<Record<string, string>> = {
  nightswatch_historical: 'nightswatch',
};

export const IMPORTED_CHARACTER_TRAIT_POLICIES: readonly ImportedCharacterTraitPolicy[] = [
  ...DISPLAY_TRAIT_IDS.map((id) => ({ id, presentation: 'display' as const, replacementId: REPLACEMENT_IDS[id] })),
  ...CHILDHOOD_TRAIT_IDS.map((id) => ({ id, presentation: 'childhood_only' as const })),
  ...STATUS_TRAIT_IDS.map((id) => ({ id, presentation: 'status' as const, replacementId: REPLACEMENT_IDS[id] })),
  ...HIDDEN_MODIFIER_TRAIT_IDS.map((id) => ({ id, presentation: 'hidden_modifier' as const })),
];

const IMPORTED_CHARACTER_TRAIT_POLICY_BY_ID = new Map(
  IMPORTED_CHARACTER_TRAIT_POLICIES.map((policy) => [policy.id, policy] as const),
);

function pushUnique(target: string[], included: Set<string>, value: string): void {
  if (included.has(value)) return;
  included.add(value);
  target.push(value);
}

/**
 * 将离线人物数据中的原始特质投影为可见特质与规则层元数据。
 * 未在策略表中的正式目录特质默认显示；年龄未知时保留童年特质，避免误删资料。
 */
export function filterImportedCharacterTraits(
  traitIds: readonly string[],
  age: number | undefined,
): FilteredImportedCharacterTraits {
  const visibleTraitIds: string[] = [];
  const hiddenModifierIds: string[] = [];
  const statusTraitIds: string[] = [];
  const visibleIncluded = new Set<string>();
  const hiddenIncluded = new Set<string>();
  const statusIncluded = new Set<string>();

  for (const rawTraitId of traitIds) {
    const traitId = rawTraitId.trim();
    if (!traitId) continue;
    const policy = IMPORTED_CHARACTER_TRAIT_POLICY_BY_ID.get(traitId);
    const presentation = policy?.presentation ?? 'display';
    const resolvedTraitId = policy?.replacementId ?? traitId;

    if (presentation === 'hidden_modifier') {
      pushUnique(hiddenModifierIds, hiddenIncluded, traitId);
      continue;
    }
    if (presentation === 'childhood_only' && age !== undefined && age >= 16) continue;

    pushUnique(visibleTraitIds, visibleIncluded, resolvedTraitId);
    if (presentation === 'status') pushUnique(statusTraitIds, statusIncluded, resolvedTraitId);
  }

  return { visibleTraitIds, hiddenModifierIds, statusTraitIds };
}
