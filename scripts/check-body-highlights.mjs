import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sheet = await readFile(join(root, 'src/components/CharacterSheet.tsx'), 'utf8');
const css = await readFile(join(root, 'src/index.css'), 'utf8');
const failures = [];

const count = (text, fragment) => text.split(fragment).length - 1;
if (!css.includes('.body-model .rbh polygon {') || !css.includes('stroke: rgba(200, 157, 84, 0.78)') || !css.includes('vector-effect: non-scaling-stroke')) {
  failures.push('The body silhouette does not have a persistent outline.');
}
if (count(sheet, "muscles: ['head', 'neck']") < 2) failures.push('Head highlighting does not include the neck for wounds and selection.');
if (!sheet.includes("muscles: ['biceps', 'triceps', 'forearm', 'front-deltoids']")) failures.push('Arm wound highlighting is missing an upper-arm muscle group.');
if (count(sheet, "muscles: ['quadriceps', 'abductors', 'calves', 'knees']") < 2) failures.push('Leg highlighting does not include the hip region for wounds and selection.');
if (!/m === 'biceps'.*m === 'triceps'.*m === 'forearm'.*m === 'front-deltoids'/.test(sheet)) failures.push('Clicking the triceps does not select an arm slot.');

for (const index of [7, 10, 14, 30, 33]) {
  if (!css.includes(`.body-model--mainhand .rbh polygon:nth-of-type(${index})`)) failures.push(`Main-hand highlight is missing polygon ${index}.`);
}
for (const index of [8, 9, 13, 31, 32]) {
  if (!css.includes(`.body-model--offhand .rbh polygon:nth-of-type(${index})`)) failures.push(`Off-hand highlight is missing polygon ${index}.`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Body-part highlight coverage is complete.');
