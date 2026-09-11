import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const failures = [];
const read = async (relativePath) => {
  try {
    return await readFile(join(root, relativePath), 'utf8');
  } catch {
    failures.push(`Missing required custom-start file: ${relativePath}`);
    return '';
  }
};

const creator = [
  await read('src/components/CharacterCreator.tsx'),
  await read('src/components/character-creator/TraitWorkbench.tsx'),
  await read('src/components/character-creator/CharacterReadoutPanel.tsx'),
  await read('src/components/character-creator/characterReadout.ts'),
].join('\n');
const customStart = await read('src/features/characters/customCharacterStart.ts');
const opening = await read('src/services/openingGeneration.ts');
const livingWorld = await read('src/features/world/createLivingWorldGame.ts');
const store = await read('src/store/useGameStore.ts');
const gameTypes = await read('src/types/game.ts');
const repository = await read('src/features/world-content/repository.ts');
const schemas = await read('src/features/world-content/schemas.ts');
const compiler = await read('scripts/world-content/compiler.mjs');
const creationContent = await read('content/world/character-creation.json');
const dossier = await read('src/features/characters/useCharacterDossier.ts');
const promptBuilder = await read('src/services/promptBuilder.ts');
const mainMenu = await read('src/components/menu/MainMenu.tsx');
const loadGame = await read('src/components/menu/LoadGameScreen.tsx');

for (const marker of ['人物设计器', '身份', '身世与生计', '人物特质', '关系（可选）', '开局处境', '六项能力', 'data-character-editor-layout']) {
  if (!creator.includes(marker)) failures.push(`Single-page character editor is missing marker: ${marker}`);
}
for (const phasedUi of ['const STEPS', 'setStep(', '>下一步<', '>上一步<']) {
  if (creator.includes(phasedUi)) failures.push(`Forced step-by-step creator UI remains: ${phasedUi}`);
}
for (const legacy of ['选择现成人物', '高级沙盒设计器', "tab === 'existing'", 'RECOMMENDED_CHARACTER_IDS', "id: 'landed'"]) {
  if (creator.includes(legacy)) failures.push(`Legacy ruler/existing-character new-game UI remains: ${legacy}`);
}
if (!mainMenu.includes("onClick={() => openCreator('custom')}") || mainMenu.includes('NewGameScreen')) failures.push('Main menu new-game entry still routes through the legacy NewGameScreen.');
if (!loadGame.includes("onClick={() => openCreator('custom')}")) failures.push('Empty save-list new-game entry does not open the character editor.');
if (!mainMenu.includes("menuView !== 'load'") || mainMenu.includes("menuView === 'new' && <NewGameScreen")) failures.push('Legacy menuView=new rendering is still reachable from the main menu shell.');
if (!store.includes("const opensCreator = view === 'new'") || !store.includes("if (view === 'new')")) failures.push('Legacy new-game aliases do not redirect into the character editor.');
for (const role of ['commoner', 'traveler', 'retainer', 'knight', 'landless_noble']) {
  if (!customStart.includes(`'${role}'`) || !creationContent.includes(`"${role}"`)) failures.push(`Custom start role missing: ${role}`);
}
for (const situation of ['lodging', 'awaiting_work', 'arrival', 'making_living']) {
  if (!customStart.includes(`'${situation}'`) || !creationContent.includes(`"${situation}"`)) failures.push(`Situation missing: ${situation}`);
}
for (const model of ['CharacterCreationDraft', 'ResolvedCustomStart', 'OpeningFacts']) {
  if (!customStart.includes(`interface ${model}`)) failures.push(`Creation model missing: ${model}`);
}
for (const behavior of ['DESIGN_POINT_LIMIT', 'freeMode', 'MAX_PERSONALITY_TRAITS', 'legalTraitIdsForAge', 'rebaseDraftForBackground', '0—30']) {
  if (!customStart.includes(behavior) && !creator.includes(behavior)) failures.push(`Advanced editor rule missing: ${behavior}`);
}
if (!customStart.includes('backgroundTraitRecommendations') || !customStart.includes('backgroundTraitIds?:') || !customStart.includes('suppressedBackgroundTraitIds?:')) failures.push('Background and character traits are not source-tracked and linked.');
if (!creator.includes('data-background-trait-links') || !creator.includes('educationMode') || !creator.includes('经历自带')) failures.push('Creator does not expose background-trait recommendations and explicit education ownership.');
for (const marker of ['三个性格位置', '特质比较', 'previewCreationTrait', '成长方向', '公开往事', '设计点数明细']) {
  if (!creator.includes(marker)) failures.push(`Trait workbench missing: ${marker}`);
}
for (const marker of ['data-creator-readout', 'data-creator-attributes', 'data-trait-source', 'traitSourceOf', 'skillReadouts', '背景建议', '特质修正']) {
  if (!creator.includes(marker)) failures.push(`Character readout missing: ${marker}`);
}
for (const marker of ['天生', '经历自带', '亲手所选', '成长方向']) {
  if (!creator.includes(marker)) failures.push(`Trait provenance label missing: ${marker}`);
}
if (!creator.includes("advanced") || !creator.includes('data-creator-advanced')) failures.push('Developer-facing numbers are not collapsed behind an advanced section.');
for (const marker of ['data-local-candidates', '<CharacterPortrait characterId={character.id}']) {
  if (!creator.includes(marker)) failures.push(`Local relation candidates missing: ${marker}`);
}
for (const relation of ['acquaintance', 'employer', 'fealty', 'cadet_branch', 'bastard_child', 'publiclyKnown', 'knowerIds']) {
  if (!customStart.includes(relation) || !creator.includes(relation) && !['knowerIds'].includes(relation)) failures.push(`Relationship/kinship support missing: ${relation}`);
}
if (!creator.includes('knowerIds.includes') || !creator.includes('knowerIds: event.target.checked')) failures.push('Bastard identity does not expose scoped additional knowers.');
if (!creator.includes('relatedLocationIds') || !creator.includes('relation.targetLocationId')) failures.push('Situation recommendations do not prioritize places related to selected relationships.');
if (!customStart.includes('save:${runId}:player') || !customStart.includes('save:${runId}:local:1')) failures.push('Custom character overlay does not use save: character IDs.');
if (!dossier.includes('customCharacters?.records[selectedCharacterId]')) failures.push('Character dossier does not resolve save: overlay characters.');
if (!dossier.includes('attachCustomRelationshipFacts') || !dossier.includes('loadRelatedRecordsIncludingOverlay')) failures.push('Custom overlay relationships are not projected into dossier relationship displays.');
if (!customStart.includes('save:${runId}:kin:1') || !customStart.includes('lineage: { parentId:')) failures.push('Cadet/bastard kinship does not produce a parseable lineage chain.');
if (!customStart.includes('年龄差必须达到 32 岁')) failures.push('Cadet-branch generation does not validate the extra generation age gap.');
if (!promptBuilder.includes('自创人物开局事实') || !promptBuilder.includes('知情者=${fact.heardByIds.join')) failures.push('Subsequent model context does not retain custom background and knowledge scopes.');

if (!repository.includes('loadCharacterCreation') || !repository.includes('manifest.paths.characterCreation')) failures.push('World repository does not load character-creation content.');
if (!schemas.includes('parseCharacterCreationContent')) failures.push('Character-creation content schema is missing.');
if (!compiler.includes("'character-creation.json'")) failures.push('World content compiler does not emit character-creation.json.');

for (const marker of ['generateCustomOpening', 'AbortSignal', 'state_cmd', '2—3', '400—700']) {
  if (!opening.includes(marker) && !creator.includes(marker)) failures.push(`Opening generation requirement missing: ${marker}`);
}
if (!creator.includes('abortRef.current?.abort') || !creator.includes('submitEpochRef')) failures.push('Creator is missing cancel/late-response protection.');
if (!creator.includes('resolvedRunId ?? createCustomRunId()')) failures.push('Retry does not reuse the same resolved run identity.');
if (!creator.includes('await startNewGame(game)')) failures.push('Creator does not await save/entry completion.');
if (!store.includes("await saveTurnSnapshot(slotId, newGameState, '剧本开局'")) failures.push('New game does not persist before entering the game screen.');
const saveIndex = store.indexOf("await saveTurnSnapshot(slotId, newGameState, '剧本开局'");
const enterIndex = store.indexOf("activeScreen: 'game'", saveIndex);
if (saveIndex < 0 || enterIndex < 0 || enterIndex < saveIndex) failures.push('Game screen can be entered before opening snapshot persistence.');

if (!livingWorld.includes('createCustomLivingWorldGame(\n  resolved: ResolvedCustomStart')) failures.push('createCustomLivingWorldGame does not accept ResolvedCustomStart.');
if (livingWorld.includes("createCustomLivingWorldGame(\n  lord:")) failures.push('Custom game creation still accepts component-built LordProfile.');
if (!livingWorld.includes('createCustomCharacterItemState')) failures.push('Custom game creation does not centralize item package placement.');
if (!livingWorld.includes('relationshipEvidence') || !livingWorld.includes('roleplay.knowledge')) failures.push('Initial relationship facts are not copied into roleplay state.');
if (!livingWorld.includes('presentCharacterIds')) failures.push('Initial scene does not explicitly control present characters.');
if (!livingWorld.includes('prepareCustomOpeningFacts') || !creator.includes('prepareCustomOpeningFacts(resolved)')) failures.push('Opening generation is not prepared from the same program-resolved people and location facts used by the final scene.');

for (const optionalField of ['characterCreationDraft?:', 'customCharacters?:', 'openingFacts?:']) {
  if (!gameTypes.includes(optionalField)) failures.push(`Backward-compatible optional save extension missing: ${optionalField}`);
}

const creatorEarlyReturnIndex = creator.indexOf('if (!isCreatorOpen) return null');
const creatorEffectIndex = creator.indexOf('useEffect(() =>');
if (creatorEffectIndex < 0 || creatorEarlyReturnIndex < 0 || creatorEffectIndex > creatorEarlyReturnIndex) failures.push('Creator calls Hooks after its conditional return.');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Custom character single-page editor and start pipeline are complete.');
