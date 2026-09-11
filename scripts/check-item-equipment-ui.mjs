import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const panelPath = join(root, 'src/components/items/EquipmentPanel.tsx');
const sheetPath = join(root, 'src/components/CharacterSheet.tsx');
const managerPath = join(root, 'src/components/items/ItemManagementPanel.tsx');
const dialogPath = join(root, 'src/components/items/ItemChoiceDialog.tsx');
const itemCardPath = join(root, 'src/components/items/ItemCard.tsx');
const storePath = join(root, 'src/store/useGameStore.ts');
const actionDockPath = join(root, 'src/components/ActionDock.tsx');
const failures = [];
let panel = '';
let manager = '';
let dialog = '';
try { panel = await readFile(panelPath, 'utf8'); } catch { failures.push('EquipmentPanel.tsx is missing.'); }
try { manager = await readFile(managerPath, 'utf8'); } catch { failures.push('ItemManagementPanel.tsx is missing.'); }
try { dialog = await readFile(dialogPath, 'utf8'); } catch { failures.push('ItemChoiceDialog.tsx is missing.'); }
const sheet = await readFile(sheetPath, 'utf8');
const itemCard = await readFile(itemCardPath, 'utf8');
const store = await readFile(storePath, 'utf8');
const actionDock = await readFile(actionDockPath, 'utf8');
const expectedOrder = "['head', 'torso', 'mainhand', 'offhand', 'legs', 'accessories']";
if (panel && !panel.includes(expectedOrder)) failures.push('Equipment group order is not fixed to the six approved groups.');
if (panel && !panel.includes('data-equipment-group={group.group}')) failures.push('Equipment groups lack data-equipment-group markers.');
if (panel && !/<button\s+type="button"\s+data-equipment-toggle=\{group\.group\}[\s\S]*?<ItemImage[\s\S]*?<ChevronDown[\s\S]*?<\/button>/.test(panel)) failures.push('Equipment group image, summary, and chevron are not one full-width toggle target.');
if (panel && !panel.includes('data-hand-pair')) failures.push('Main hand and off hand are not wrapped in data-hand-pair.');
if (panel && !panel.includes("['服装', '护甲', '外披']")) failures.push('Torso layers are not represented inside the torso group.');
if (panel && !panel.includes("['腿部', '足部']")) failures.push('The legs group does not contain separate legwear and footwear positions.');
if (panel && !panel.includes('ACCESSORY_POSITION_COUNT = 3')) failures.push('Accessories do not expose exactly three positions.');
if (panel && (!panel.includes('<ItemChoiceDialog') || !panel.includes('getEquipmentReplacementChoices'))) failures.push('Equipment replacement does not open a candidate choice dialog.');
if (panel.includes('findReplacement(')) failures.push('Equipment replacement still selects the first compatible item directly.');
if (manager && (!manager.includes('<ItemChoiceDialog') || !manager.includes('getTransferDestinationChoices'))) failures.push('Item transfer does not open a destination choice dialog.');
if (manager.includes('function transferDestination(')) failures.push('Item transfer still selects the first destination directly.');
if (dialog && !dialog.includes('data-item-choice-dialog')) failures.push('The shared item choice dialog lacks its stable UI marker.');
if (dialog && !dialog.includes('break-words')) failures.push('Choice dialog text does not wrap long words.');
if (panel.includes('<PendingItemActionList') || manager.includes('<PendingItemActionList')) failures.push('The dossier still renders a separate pending-action banner instead of cancelling in place.');
if (!panel.includes('agot:prefill-action') || !manager.includes('agot:prefill-action')) failures.push('Item UI does not write equipment/item intentions into the central action draft.');
if (panel.includes('queueWorldTransaction') || manager.includes('queueWorldTransaction') || panel.includes('queueItemAction') || manager.includes('queueItemAction')) failures.push('Item UI still directly queues item/world mutations instead of using the central action draft.');
if (/^\s*pendingItemActions:\s*/m.test(store) || /^\s*queueItemAction:\s*/m.test(store)) failures.push('Zustand still owns a parallel item-action queue.');
if (actionDock.includes('data-item-action-queue') || actionDock.includes('待执行 ×')) failures.push('ActionDock still renders a separate global cancellation area.');
if (!itemCard.includes('onCancelPending') || !itemCard.includes('取消操作')) failures.push('Pending item cards do not replace their original action area with an in-place cancel button.');
if (manager && (!manager.includes('onCancelPending=') || !manager.includes('cancelItemAction(pending.id)'))) failures.push('The dossier item tab does not connect card-level cancellation to the queued action.');
if (panel && (!panel.includes('pendingReplacement') || !panel.includes('cancelItemAction(pendingReplacement.id)'))) failures.push('The equipment replacement button does not become an in-place cancel control.');
if (manager && (!manager.includes('treatmentSupplySupports') || !manager.includes('injuryId:') || !manager.includes('supplyInstanceId:'))) failures.push('Treatment choices are not grounded in detailed injury ids and concrete supply instances.');
if (manager.includes("choice.startsWith('zone:')") || manager.includes('lord.body[zone]')) failures.push('Treatment UI still targets the legacy four-zone body projection.');
if (/item\.name\}[^\n]*truncate|item\.locationLabel\}[^\n]*truncate/.test(itemCard)) failures.push('Item card names or locations are still forced into a clipped single line.');
const forbiddenCloakMarker = ['data-equipment-group="', 'cloak', '"'].join('');
if (panel.includes(forbiddenCloakMarker) || panel.includes('肩部') || panel.includes('独立披风')) failures.push('A forbidden shoulder or independent cloak group remains.');
if (!sheet.includes('<EquipmentPanel')) failures.push('CharacterSheet does not embed EquipmentPanel.');
if (sheet.includes("group === 'accessories') setHoveredSlot(null)") || !sheet.includes('setHoveredSlot(group);')) failures.push('Equipment hover focus is discarded instead of feeding back on the equipment group.');
if (sheet.includes('LinkedGearCard') || sheet.includes('SlotInspectionDetails') || sheet.includes('CustodySection')) failures.push('Legacy equipment or custody UI remains in CharacterSheet.');
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('Six-group equipment UI and explicit item choices are correct.');
