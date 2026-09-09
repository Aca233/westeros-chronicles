import { build } from 'esbuild';
const bundle = await build({
  stdin: { contents: [
    "export { applyStateCommands } from './src/services/stateReducer.ts';",
    "export { createEmptyItemSystem, createItemInstance } from './src/features/items/state.ts';",
    "export { createDefaultBody } from './src/types/game.ts';",
    "export { planTitleIntent } from './src/features/world/worldTitleRules.ts';",
    "export { createWorldBaselineSnapshot } from './src/features/world/worldBaseline.ts';",
    "export { createWorldRuntimeState } from './src/features/world/worldRuntimeState.ts';",
    "export { getAttributeModifier } from './src/services/diceEngine.ts';",
    "export { ITEM_CATALOG, preloadItemCatalog } from './src/data/itemDefinitions.ts';",
    "export { applyItemActions } from './src/features/items/actions.ts';",
  ].join('\n'), resolveDir: process.cwd(), sourcefile: 'gameplay-audit-entry.ts', loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
try {
  const m = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  await m.preloadItemCatalog();
  const makeLord = () => ({name:'审视夹具',house:'测试',houseWords:'测试',houseSigil:'unknown',title:'测试',age:24,gender:'男',location:{locationId:'b_winterfell'},locationLabel:'临冬城',body:m.createDefaultBody(),overallStatus:'强健',items:m.createEmptyItemSystem(),goldDragons:100,silverStags:0,attributes:{diplomacy:10,martial:10,stewardship:10,intrigue:10,learning:10,prowess:10},traits:[],traitIds:[]});
  const wounded = makeLord(); wounded.body.arms.level='heavy'; wounded.body.arms.wounds=['旧重伤'];
  const injured = m.applyStateCommands(wounded,[{type:'INJURE_ZONE',zone:'arms',level:'minor',woundText:'新擦伤'}],()=>0.99);
  const greedy=makeLord(); greedy.traitIds=['greedy'];
  const refunded=m.applyStateCommands(greedy,[{type:'MODIFY_GOLD',goldDragons:-100},{type:'MODIFY_GOLD',goldDragons:100}],()=>0.99);
  const traits=m.applyStateCommands(makeLord(),[{type:'ADD_TRAIT',trait:'brave'}],()=>0.99).updatedLord;
  const ids=['agot:test_a','agot:test_b'];
  const baseline=m.createWorldBaselineSnapshot({characters:ids.map(id=>({id,alive:true,location:{locationId:'b_winterfell'}})),titles:[{id:'c_test',lawfulHolderId:ids[1],controllerId:ids[1],contestedByIds:[]}],assets:[],knownLocationIds:['b_winterfell']});
  const title=m.planTitleIntent({kind:'grant_title',actorId:ids[0],recipientId:ids[0],titleId:'c_test',evidenceText:'夹具自行宣布册封'}, {baseline,runtime:m.createWorldRuntimeState()});
  const medicine=[...m.ITEM_CATALOG.values()].find(d=>d.category==='medicine' && d.bulk!=='large');
  let useResult;
  if(medicine){const state=m.createEmptyItemSystem();state.instances.probe=m.createItemInstance(m.ITEM_CATALOG,medicine.id,'probe');state.placements.probe={type:'carried'};const r=m.applyItemActions(state,[{kind:'use',instanceId:'probe'}],{actorId:'probe',actorLocation:{locationId:'b_winterfell'},gameDate:'298.5.10'},m.ITEM_CATALOG);useResult={definition:medicine.id,ok:r.ok,resultKeys:Object.keys(r),instanceRemaining:Boolean(r.state.instances.probe)};}
  console.log(JSON.stringify({scope:'isolated runtime function probes, not complete model-driven playthrough',injury:{before:'heavy',after:injured.updatedLord.body.arms.level,wounds:injured.updatedLord.body.arms.wounds},refund:{before:100,after:refunded.updatedLord.goldDragons},addTrait:{traits:traits.traits,traitIds:traits.traitIds},titleProposalWithoutAuthority:{mutationTypes:title.map(v=>v.type)},attributes:[10,20,30,60,100].map(v=>({attribute:v,modifier:m.getAttributeModifier(v),dc14Success:[...Array(20)].map((_,i)=>i+1).filter(r=>r===20||(r!==1&&r+m.getAttributeModifier(v)>=14)).length/20})),medicine:useResult},null,2));
} catch(error) {console.error(error.message);process.exitCode=1;}
