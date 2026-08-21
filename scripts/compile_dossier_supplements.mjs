import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';

import { RAW_SUPPLEMENTS as part1 } from './data/character-dossier/raw_supplements_part1.mjs';
import { RAW_SUPPLEMENTS_PART2 as part2 } from './data/character-dossier/raw_supplements_part2.mjs';
import { RAW_SUPPLEMENTS_PART3 as part3 } from './data/character-dossier/raw_supplements_part3.mjs';
import { RAW_SUPPLEMENTS_PART4 as part4 } from './data/character-dossier/raw_supplements_part4.mjs';
import { RAW_SUPPLEMENTS_PART5 as part5 } from './data/character-dossier/raw_supplements_part5.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

// Import schema validator
const schemaBundle = await build({
  entryPoints: [join(root, 'src/features/characters/characterSupplementSchema.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const schemaUrl = `data:text/javascript;base64,${Buffer.from(schemaBundle.outputFiles[0].text).toString('base64')}`;
const { validateCharacterSupplement } = await import(schemaUrl);

// Read search index
const searchIndex = JSON.parse(await readFile(join(root, 'public/data/agot-characters/search-index.json'), 'utf8'));
const searchIndexMap = new Map(searchIndex.map((c) => [c.id, c]));

const kinshipMap = new Map();
const kinshipDir = join(root, 'public/data/agot-characters/kinship');
for (const filename of await readdir(kinshipDir)) {
  if (!filename.endsWith('.json')) continue;
  const shard = JSON.parse(await readFile(join(kinshipDir, filename), 'utf8'));
  for (const [characterId, kinship] of Object.entries(shard)) {
    kinshipMap.set(characterId, kinship);
  }
}

const allSupplements = [...part1, ...part2, ...part3, ...part4, ...part5];
console.log(`Total raw supplement records: ${allSupplements.length}`);

// Check unique IDs
const seenIds = new Set();
const validatedMap = {};

for (const rawRecord of allSupplements) {
  const { subjectNameKey, ...rawSupplement } = rawRecord;
  const raw = {
    ...rawSupplement,
    ...(rawSupplement.notableRelations ? {
      notableRelations: rawSupplement.notableRelations.map(({ targetNameKey, ...relation }) => {
        const target = searchIndexMap.get(relation.targetId);
        if (!target || target.nameKey !== targetNameKey) {
          throw new Error(
            `Relation identity mismatch for ${rawSupplement.characterId}: ${relation.targetId} expected '${targetNameKey}', dataset has '${target?.nameKey}'`,
          );
        }
        return relation;
      }),
    } : {}),
    ...(rawSupplement.experiences ? {
      experiences: rawSupplement.experiences.map(({ participantNameKeys, ...experience }) => {
        const participantIds = experience.participantIds ?? [];
        if (!Array.isArray(participantNameKeys) || participantNameKeys.length !== participantIds.length) {
          throw new Error(`Experience participant identity list mismatch for ${rawSupplement.characterId}: ${experience.title}`);
        }
        participantIds.forEach((participantId, index) => {
          const participant = searchIndexMap.get(participantId);
          if (!participant || participant.nameKey !== participantNameKeys[index]) {
            throw new Error(
              `Experience participant identity mismatch for ${rawSupplement.characterId}: ${participantId} expected '${participantNameKeys[index]}', dataset has '${participant?.nameKey}'`,
            );
          }
        });
        return experience;
      }),
    } : {}),
  };
  if (seenIds.has(raw.characterId)) {
    throw new Error(`Duplicate supplement characterId: ${raw.characterId}`);
  }
  seenIds.add(raw.characterId);

  const character = searchIndexMap.get(raw.characterId);
  if (!character) {
    throw new Error(`Supplement references non-existent character in dataset: ${raw.characterId}`);
  }
  if (!character.alive) {
    throw new Error(`Supplement subject is not alive at the 298 AC start: ${raw.characterId}`);
  }
  if (typeof subjectNameKey !== 'string' || subjectNameKey !== character.nameKey) {
    throw new Error(
      `Supplement subject identity mismatch: ${raw.characterId} expected nameKey '${subjectNameKey}', dataset has '${character.nameKey}'`,
    );
  }

  // Validate via schema
  const validated = validateCharacterSupplement(raw);

  // Validate all notableRelation targetIds exist and are genuinely non-kin.
  const kinship = kinshipMap.get(raw.characterId) ?? {};
  const kinIds = new Set([
    kinship.fatherId,
    kinship.motherId,
    ...(kinship.spouseIds ?? []),
    ...(kinship.childIds ?? []),
    ...(kinship.siblingIds ?? []),
  ].filter(Boolean));
  for (const rel of validated.notableRelations ?? []) {
    if (!searchIndexMap.has(rel.targetId)) {
      throw new Error(`Character ${raw.characterId} has invalid notableRelation targetId: ${rel.targetId}`);
    }
    if (kinIds.has(rel.targetId)) {
      throw new Error(`Character ${raw.characterId} lists kin ${rel.targetId} as a non-kin relation`);
    }
  }

  // Validate all participantIds exist
  for (const exp of validated.experiences ?? []) {
    for (const pId of exp.participantIds ?? []) {
      if (!searchIndexMap.has(pId)) {
        throw new Error(`Character ${raw.characterId} experience '${exp.title}' has invalid participantId: ${pId}`);
      }
    }
  }

  validatedMap[validated.characterId] = validated;
}

console.log(`Successfully validated ${Object.keys(validatedMap).length} character supplements!`);

// Generate TypeScript source code
const tsHeader = `// Generated character dossier narrative supplement dataset
// Curated public-at-start profiles for 100+ canon and important characters
import type { CharacterId } from '../../features/characters/types';
import type { CharacterDossierSupplement } from '../../features/characters/characterSupplementTypes';

export const CHARACTER_DOSSIER_SUPPLEMENTS: Record<CharacterId, CharacterDossierSupplement> = ${JSON.stringify(validatedMap, null, 2)} as const;

export function getCharacterDossierSupplement(characterId: CharacterId | string | null | undefined): CharacterDossierSupplement | undefined {
  if (!characterId || typeof characterId !== 'string') return undefined;
  return CHARACTER_DOSSIER_SUPPLEMENTS[characterId as CharacterId];
}
`;

await writeFile(join(root, 'src/data/generated/characterDossierSupplements.ts'), tsHeader, 'utf8');
console.log('Written to src/data/generated/characterDossierSupplements.ts successfully!');
