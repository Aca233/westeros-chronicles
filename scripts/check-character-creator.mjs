import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const failures = [];
const read = async (relativePath) => {
  try {
    return await readFile(join(root, relativePath), 'utf8');
  } catch {
    failures.push(`Missing required creator file: ${relativePath}`);
    return '';
  }
};

const creator = await read('src/components/CharacterCreator.tsx');
const traits = await read('src/data/characterTraits.ts');
const promptBuilder = await read('src/services/promptBuilder.ts');
const heraldry = await read('src/data/heraldry.ts');
const coatOfArms = await read('src/components/CoatOfArms.tsx');
const gameTypes = await read('src/types/game.ts');
const officialTraitDescriptions = await read('src/data/ck3TraitDescriptions.ts');
const agotTraitDescriptions = await read('src/data/agotTraitDescriptions.ts');

for (const marker of ['统治者设计器', '设计点数', '文化', '信仰', '性格特质', '教育特质', '先天特质', '健康特质', '完成统治者设计']) {
  if (!creator.includes(marker) && !traits.includes(marker)) failures.push(`Creator is missing: ${marker}`);
}
if (!creator.includes('data-creator-layout="ck3"')) failures.push('Creator does not use the CK3 three-column layout.');
if (!creator.includes('selectedTraitIds')) failures.push('Creator does not track selected traits.');
if (!creator.includes('calculateFinalAttributes')) failures.push('Creator does not apply trait modifiers to final skills.');
if (!creator.includes('DESIGN_POINT_LIMIT')) failures.push('Creator does not enforce the design-point limit.');
if (!promptBuilder.includes("lord.culture || '未指定'") || !promptBuilder.includes("lord.faith || '未指定'")) {
  failures.push('Character culture and faith are missing from the story state slice.');
}
if (!promptBuilder.includes("lord.dynastyName || lord.house") || !promptBuilder.includes('lord.houseWords')) {
  failures.push('Custom dynasty and house words are missing from the story state slice.');
}

const agotTraitIds = [
  'nightswatch', 'lifestyle_mariner', 'authoritative', 'rude', 'inquisitive', 'uncouth',
  'one_handed', 'scurvy', 'crippled', 'greyscale', 'burned', 'mute', 'half_blind', 'the_mark',
  'dragon_dreams', 'greensight', 'fashionable', 'fire_obsessed', 'freedman', 'spider', 'dragonrider',
];

const traitDefinitionCount = [...traits.matchAll(/\bid:\s*'[^']+'/g)].length;
if (traitDefinitionCount < 100) failures.push(`Trait catalog has only ${traitDefinitionCount} entries; at least 100 are required.`);
const officialDescriptionCount = [...officialTraitDescriptions.matchAll(/^\s*'[^']+':\s*'/gm)].length;
if (officialDescriptionCount + agotTraitIds.length < traitDefinitionCount) failures.push(`Only ${officialDescriptionCount} CK3 and ${agotTraitIds.length} AGOT descriptions cover ${traitDefinitionCount} traits.`);
if (!traits.includes('CK3_TRAIT_DESCRIPTIONS')) failures.push('Trait catalog is not using CK3 official descriptions.');
if (!traits.includes('function formatTraitDescription') || !creator.includes('formatTraitDescription(trait.description, customName)')) {
  failures.push('CK3 descriptions are not adapted to the custom ruler name.');
}
if (/\[ROOT|\[CHARACTER|#(?:EMP|P|N|bold)|#!|@[A-Za-z_]+!/.test(officialTraitDescriptions + agotTraitDescriptions)) {
  failures.push('Trait descriptions still contain Paradox formatting or character-script markers.');
}


for (const traitId of agotTraitIds) {
  if (!traits.includes(`id: '${traitId}'`)) failures.push(`AGOT ruler trait is missing: ${traitId}`);
  if (!agotTraitDescriptions.includes(`  ${traitId}:`)) failures.push(`AGOT localization is missing: ${traitId}`);
}
if (creator.includes("agot: 'AGOT 特质'")) failures.push('AGOT traits must be merged into the standard CK3 categories, not shown in a separate tab.');

for (const category of ['personality', 'education', 'lifestyle', 'congenital', 'health', 'fame']) {
  if (!traits.includes(`category: '${category}'`)) failures.push(`Trait catalog is missing category: ${category}`);
}
for (const helper of ['calculateFinalAttributes', 'calculateDesignPointUsage', 'getHouseIdentity']) {
  if (!traits.includes(`function ${helper}`)) failures.push(`Trait rules are missing helper: ${helper}`);
}


for (const marker of ['traitSearch', '搜索特质', '创建新家族', 'customHouseName', 'customDynastyName', '纹章编辑', 'CoatOfArms']) {
  if (!creator.includes(marker)) failures.push(`Expanded ruler designer is missing: ${marker}`);
}
for (const marker of ['CoatOfArmsDesign', 'HERALDRY_PATTERNS', 'HERALDRY_EMBLEMS']) {
  if (!heraldry.includes(marker)) failures.push(`Heraldry model is missing: ${marker}`);
}
if (!coatOfArms.includes('export const CoatOfArms')) failures.push('Shared coat-of-arms renderer is missing.');
if (!gameTypes.includes('coatOfArms?: CoatOfArmsDesign')) failures.push('LordProfile does not persist a custom coat of arms.');

for (const icon of ['trait-agot-dragonrider.webp', 'trait-agot-dragon-dreams.webp', 'trait-agot-greensight.webp', 'trait-agot-nightswatch.webp']) {
  try {
    await access(join(root, 'public/assets/game-icons', icon));
  } catch {
    failures.push(`Missing AGOT trait icon: ${icon}`);
  }
}

for (const icon of ['trait-brave.webp', 'trait-education-martial.webp', 'trait-intellect.webp', 'trait-infirm.webp']) {
  try {
    await access(join(root, 'public/assets/game-icons', icon));
  } catch {
    failures.push(`Missing CK3 trait icon: ${icon}`);
  }
}


const creatorEarlyReturnIndex = creator.indexOf('if (!isCreatorOpen) return null');
const creatorEffectIndex = creator.indexOf('useEffect(() =>');
if (creatorEffectIndex < 0 || creatorEarlyReturnIndex < 0 || creatorEffectIndex > creatorEarlyReturnIndex) failures.push('人物创建器在条件返回之后调用 Hook，打开新局会触发 Hook 顺序错误。');

if (creator.includes('PRESET_SCENARIOS') || creator.includes('经典原著剧本') || creator.includes("tab === 'preset'")) failures.push('开局创建器仍保留固定剧本预设。');
for (const marker of ['data-existing-character-start', 'data-recommended-characters', 'RECOMMENDED_CHARACTER_IDS', '<CharacterSearch', 'aliveOnly', '自定义统治者']) {
  if (!creator.includes(marker)) failures.push(`现成人物开局缺少 ${marker}。`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('CK3 ruler designer structure is complete.');
