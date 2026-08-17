import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const panelPath = join(root, 'src/components/items/EquipmentPanel.tsx');
const sheetPath = join(root, 'src/components/CharacterSheet.tsx');
const failures = [];
let panel = '';
try { panel = await readFile(panelPath, 'utf8'); } catch { failures.push('EquipmentPanel.tsx is missing.'); }
const sheet = await readFile(sheetPath, 'utf8');
const expectedOrder = "['head', 'torso', 'mainhand', 'offhand', 'feet', 'accessories']";
if (panel && !panel.includes(expectedOrder)) failures.push('Equipment group order is not fixed to the six approved groups.');
if (panel && !panel.includes('data-equipment-group={group.group}')) failures.push('Equipment groups lack data-equipment-group markers.');
if (panel && !panel.includes('data-hand-pair')) failures.push('Main hand and off hand are not wrapped in data-hand-pair.');
if (panel && !panel.includes("['服装', '护甲', '外披']")) failures.push('Torso layers are not represented inside the torso group.');
if (panel && !panel.includes('ACCESSORY_POSITION_COUNT = 3')) failures.push('Accessories do not expose exactly three positions.');
const forbiddenCloakMarker = ['data-equipment-group="', 'cloak', '"'].join('');
if (panel.includes(forbiddenCloakMarker) || panel.includes('肩部') || panel.includes('独立披风')) failures.push('A forbidden shoulder or independent cloak group remains.');
if (!sheet.includes('<EquipmentPanel')) failures.push('CharacterSheet does not embed EquipmentPanel.');
if (sheet.includes('LinkedGearCard') || sheet.includes('SlotInspectionDetails') || sheet.includes('CustodySection')) failures.push('Legacy equipment or custody UI remains in CharacterSheet.');
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('Six-group equipment UI structure is correct.');
