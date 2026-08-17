import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const skills = ['diplomacy', 'martial', 'stewardship', 'intrigue', 'learning', 'prowess'];
const failures = [];

const types = await readFile(join(root, 'src/types/game.ts'), 'utf8');
const attributesBlock = types.match(/export interface LordAttributes\s*\{([\s\S]*?)\}/)?.[1] ?? '';
for (const skill of skills) {
  if (!new RegExp(`\\b${skill}\\s*:`).test(attributesBlock)) failures.push(`LordAttributes is missing ${skill}.`);
}

const diceEngine = await readFile(join(root, 'src/services/diceEngine.ts'), 'utf8');
const dicePolicy = await readFile(join(root, 'src/services/dicePolicy.ts'), 'utf8');
if (!diceEngine.includes('inferActionCheck(actionText)')) failures.push('Dice engine does not use the shared action inference policy.');
if (!/label:\s*'个人战斗'[^}]*attribute:\s*'prowess'/.test(dicePolicy)) failures.push('Personal combat is not mapped to prowess.');
if (!/label:\s*'战争指挥'[^}]*attribute:\s*'martial'/.test(dicePolicy)) failures.push('Army command is not mapped to martial.');

const skillDefinitions = await readFile(join(root, 'src/data/ck3Skills.ts'), 'utf8');
for (const skill of skills) {
  if (!skillDefinitions.includes(`key: '${skill}'`)) failures.push(`CK3 skill definitions are missing ${skill}.`);
  if (!skillDefinitions.includes(`icon: 'skill-${skill}'`)) failures.push(`CK3 skill definitions are missing the ${skill} icon.`);
}

const characterSheet = await readFile(join(root, 'src/components/CharacterSheet.tsx'), 'utf8');
if (!characterSheet.includes('CK3_SKILLS.map')) failures.push('Character sheet does not render the shared CK3 skill definitions.');
const compactStatCell = characterSheet.match(/function CompactStatCell[\s\S]*?\n\}/)?.[0] ?? '';
if (!compactStatCell.includes('h-12 w-12')) failures.push('Character sheet CK3 skill icons are not large enough.');
if (!compactStatCell.includes('text-xs')) failures.push('Character sheet CK3 skill values are not compact enough.');
if (compactStatCell.includes('>{label}</span>')) failures.push('Character sheet still renders redundant skill labels below the icons.');
if (characterSheet.includes('zoneName="肩背"') || characterSheet.includes("slotKey === 'cloak'")) {
  failures.push('Character sheet still renders the shoulder slot.');
}
if (!characterSheet.includes('<EquipmentPanel body={body}')) failures.push('Character sheet does not use the authoritative six-group equipment panel.');
const equipmentPanel = await readFile(join(root, 'src/components/items/EquipmentPanel.tsx'), 'utf8');
if (!equipmentPanel.includes("['head', 'torso', 'mainhand', 'offhand', 'legs', 'accessories']")) failures.push('Equipment groups are not in the approved order.');
if (!equipmentPanel.includes('data-hand-pair')) failures.push('Main-hand and off-hand are not arranged symmetrically.');


const characterCreator = await readFile(join(root, 'src/components/CharacterCreator.tsx'), 'utf8');
if (!characterCreator.includes('CK3_SKILLS.map')) failures.push('Character creator does not render all six CK3 skills.');
if (!characterCreator.includes('handleStatChange(skill.key, 1)')) failures.push('Character creator does not allocate CK3 skills one point at a time.');

const stateReducer = await readFile(join(root, 'src/services/stateReducer.ts'), 'utf8');
if (!stateReducer.includes('normalizeCk3Attributes(next.attributes)')) failures.push('State reducer does not normalize CK3 attributes.');

const promptBuilder = await readFile(join(root, 'src/services/promptBuilder.ts'), 'utf8');
if (!promptBuilder.includes('CK3 六项能力')) failures.push('Prompt does not describe the CK3 six-skill system.');
if (!promptBuilder.includes('lord.attributes.prowess')) failures.push('Prompt state slice is missing prowess.');

const iconImporter = await readFile(join(root, 'scripts/import-game-icons.py'), 'utf8');
if (!iconImporter.includes('save(name, icon, allow_upscale=True)')) failures.push('CK3 skill icons are not enlarged for legible UI rendering.');

for (const skill of skills) {
  try {
    await access(join(root, `public/assets/game-icons/skill-${skill}.webp`));
  } catch {
    failures.push(`Missing CK3 skill asset: skill-${skill}.webp`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('CK3 six-skill system is complete.');
