import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const failures = [];
const read = (path) => readFile(join(root, path), 'utf8');
let manager = '';
try { manager = await read('src/components/items/ItemManagementPanel.tsx'); } catch { failures.push('ItemManagementPanel.tsx is missing.'); }

for (const marker of ["id: 'carried'", "id: 'current-site'", "id: 'vehicle'", "id: 'remote-site'", 'data-custody-tab={tab.id}']) {
  if (manager && !manager.includes(marker)) failures.push(`Item management is missing custody marker ${marker}.`);
}
for (const marker of ['data-item-search', 'data-item-category-filter', 'data-item-sort', '<ItemCard', 'agot:prefill-action']) {
  if (manager && !manager.includes(marker)) failures.push(`Item management is missing ${marker}.`);
}
if (manager.includes('queueItemAction') || manager.includes('queueWorldTransaction')) {
  failures.push('Item management still bypasses the central action draft by directly queueing item/world actions.');
}
for (const marker of ['treatmentSupplySupports', 'injuryId:', 'supplyInstanceId:', 'TREATMENT_LABELS']) {
  if (manager && !manager.includes(marker)) failures.push(`Detailed treatment drafting is missing ${marker}.`);
}
if (manager.includes("choice.startsWith('zone:')") || manager.includes('lord.body[zone]')) {
  failures.push('Item treatment still targets legacy four-zone body state instead of a concrete injuryId.');
}
for (const option of ['当前位置', '类别', '品质', '耐久', '名称']) {
  if (manager && !manager.includes(option)) failures.push(`Item sorting is missing ${option}.`);
}

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}
const forbidden = [
  ['Inventory', 'Item'], ['Gear', 'Item'], ['Lord', 'GearSlots'], ['carried', 'Items'], ['gear', '.inventory'], ['gear', '.pouch'],
  ['Pending', 'EquipmentAction'], ['EQUIP_', 'GEAR'], ['EQUIP_FROM_', 'INVENTORY'], ['ADD_INVENTORY_', 'ITEM'],
  ['USE_INVENTORY_', 'ITEM'], ['ADD_POUCH_', 'ITEM'], ['USE_POUCH_', 'ITEM'],
].map((parts) => parts.join(''));
for (const file of await sourceFiles(join(root, 'src'))) {
  const source = await readFile(file, 'utf8');
  for (const token of forbidden) if (source.includes(token)) failures.push(`${file.slice(root.length + 1)} still contains ${token}.`);
  if (/(?:>|title=["'])\s*检视\s*(?:<|["'])/.test(source)) failures.push(`${file.slice(root.length + 1)} still renders a standalone inspect action.`);
}
try { await access(join(root, 'src/services/equipmentQueue.ts')); failures.push('Legacy equipment queue still exists.'); } catch {}
try { await access(join(root, 'src/services/itemCustody.ts')); failures.push('Legacy item custody service still exists.'); } catch {}
try { await access(join(root, 'src/services/equipmentRules.ts')); failures.push('Legacy equipment rules service still exists.'); } catch {}

if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('Centralized item management is authoritative and legacy item code is absent.');
