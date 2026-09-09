import { build } from 'esbuild';
import assert from 'node:assert/strict';
const bundle = await build({stdin:{contents:[
  "export * from './src/features/items/state.ts';",
  "export * from './src/features/items/equipment.ts';",
  "export * from './src/features/items/itemValidation.ts';",
  "export * from './src/features/items/actionChoices.ts';",
  "export * from './src/features/world/worldAssetRules.ts';",
  "export * from './src/features/world/worldBaseline.ts';",
  "export * from './src/features/world/worldRuntimeState.ts';",
  "export * from './src/features/world/worldProjection.ts';",
  "export * from './src/features/world/worldTransactions.ts';",
  "export * from './src/features/world/worldTransactionQueue.ts';",
  "export * from './src/data/itemDefinitions.ts';",
].join('\n'),resolveDir:process.cwd(),sourcefile:'storage-equipment-probes.ts',loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
const m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
await m.preloadItemCatalog();
const actor='agot:probe_visitor', ruler='agot:probe_ruler';
const location={locationId:'b_winterfell',sceneLocation:'庭院'};
const storageLocation={locationId:'b_winterfell',sceneLocation:'上锁的卧房'};
const gear=[...m.ITEM_CATALOG.values()].find(x=>x.equippable && x.bulk==='small' && !x.unique && !x.effects.some(e=>e.kind==='capacity'));
assert.ok(gear);
const instance=m.createItemInstance(m.ITEM_CATALOG,gear.id,'probe_gear');
const site={id:'probe_room',name:'借住房间',type:'room',location:storageLocation,locationLabel:'临冬城',description:'测试夹具',capacity:24};
const baseAssets=[
  {id:'site:probe_room',kind:'site',lawfulOwner:null,controller:null,custodian:null,placement:{type:'location',location:storageLocation},equippedPosition:null,status:'normal'},
  {id:'item:probe_gear',kind:'item',definitionId:gear.id,lawfulOwner:{type:'character',characterId:actor},controller:{type:'character',characterId:actor},custodian:{type:'asset',assetId:'site:probe_room'},placement:{type:'asset',assetId:'site:probe_room'},equippedPosition:null,status:'normal'},
];
const baseline=m.createWorldBaselineSnapshot({characters:[{id:actor,alive:true,location},{id:ruler,alive:true,location}],titles:[{id:'b_winterfell',lawfulHolderId:ruler,controllerId:ruler,contestedByIds:[]}],assets:baseAssets,knownLocationIds:['b_winterfell','b_white_harbor']});
const runtime=m.createWorldRuntimeState();
const state=m.createEmptyItemSystem();state.sites[site.id]=site;state.instances.probe_gear=instance;state.placements.probe_gear={type:'site',siteId:site.id};
const choice=m.getEquipmentReplacementChoices({state,catalog:m.ITEM_CATALOG,currentLocation:location,positions:gear.allowedPositions,excludedIds:[]});
const equipped=m.equipItem(state,m.ITEM_CATALOG,'probe_gear',gear.allowedPositions[0],{currentLocation:location,displacedTo:{type:'carried'}});
let worldPlanError;
const converted=m.itemActionToWorldIntent({kind:'equip',instanceId:'probe_gear',position:gear.allowedPositions[0],displacedTo:{type:'carried'}},actor,'从借住房间拿出衣物');
try {m.planAssetIntent(converted.intents[0],{baseline,runtime});}catch(error){worldPlanError=error.message;}
assert.equal(choice.length,1);assert.equal(equipped.placements.probe_gear.type,'equipped');assert.match(worldPlanError,/不在人物直接保管范围/);
const projected=m.projectWorldAsset(baseline,runtime,'site:probe_room');
assert.deepEqual(projected.lawfulOwner,{type:'title',titleId:'b_winterfell'});
const created=m.planCreateSiteIntent({kind:'create_site',actorId:actor,siteType:'warehouse',name:'临时寄存',evidenceText:'在此放下物品'}, {baseline,runtime,itemSites:state.sites,idSeed:'probe:create:warehouse',locationLabel:'临冬城'});
assert.equal(created.capacity,150);
let remoteError;
try {m.equipItem(state,m.ITEM_CATALOG,'probe_gear',gear.allowedPositions[0],{currentLocation:{locationId:'b_white_harbor'},displacedTo:{type:'carried'}});}catch(error){remoteError=error.message;}
assert.match(remoteError,/不在当前地点/);

const actualCapacityDefinitions=[...m.ITEM_CATALOG.values()].filter(x=>x.effects.some(e=>e.kind==='capacity'));
// No such item exists in the loaded catalog today; this probes a latent rule using an explicit synthetic definition.
const bag={...gear,id:'probe.capacity-bag',name:'收纳能力测试夹具',bulk:'small',equippable:false,allowedPositions:[],effects:[{kind:'capacity',categories:['supply'],units:4,stackGroup:'probe.bag',cap:4,label:'测试收纳'}]};
const testCatalog=new Map(m.ITEM_CATALOG);testCatalog.set(bag.id,bag);
const bagState=m.createEmptyItemSystem();
bagState.instances.bag=m.createItemInstance(testCatalog,bag.id,'bag',{durability:0});bagState.placements.bag={type:'carried'};
const capEffect=bag.effects.find(e=>e.kind==='capacity');
const payload={...gear,id:'probe.payload',name:'容量夹具',category:capEffect.categories[0],effects:[],equippable:false,allowedPositions:[],stackable:true,maxStack:100,bulk:'small'};
testCatalog.set(payload.id,payload);
bagState.instances.payload=m.createItemInstance(testCatalog,payload.id,'payload',{quantity:9});bagState.placements.payload={type:'carried'};
const brokenBagAccepted=m.canContainerAccept(bagState,testCatalog,{type:'carried'});
const noBag=structuredClone(bagState);delete noBag.instances.bag;delete noBag.placements.bag;
const withoutBagAccepted=m.canContainerAccept(noBag,testCatalog,{type:'carried'});
assert.equal(brokenBagAccepted,true);assert.equal(withoutBagAccepted,false);

const captures=[{instanceId:'probe_gear',siteId:site.id}];
const access=m.siteAccessEventDrafts(captures,actor,baseline,runtime);
assert.equal(access[0].visibility,'public');
const transaction={id:'probe-equip',turn:1,source:'player_input',reason:'仅验证结算器源仓库事件捕获',intents:[],mutations:[],eventDrafts:[{type:'probe',actorIds:[actor],subjectRefs:[],reason:'局部夹具',visibility:'public'}],itemCommands:[{type:'ITEM_EQUIP',instanceId:'probe_gear',position:gear.allowedPositions[0],displacedTo:{type:'carried'}}]};
// This intentionally isolates the commit layer; the regular queued UI path rejects earlier.
const commit=m.commitWorldTransaction({runtime,items:state,date:{year:298,month:5,day:10}},baseline,transaction);
assert.equal(commit.ok,true);
assert.equal(commit.state.runtime.events.filter(x=>x.type==='site.access').length,0);
console.log(JSON.stringify({scope:'isolated pure runtime probes; no save writes or model requests',
  localWarehouseEquip:{definition:gear.id,listedByUi:true,itemLayerAccepted:true,queuedWorldPlanError:worldPlanError},
  roomBoundary:{actorScene:location.sceneLocation,storageScene:storageLocation.sceneLocation,treatedAccessible:true},
  siteOwnership:{explicitOwner:null,projectedOwner:projected.lawfulOwner},
  createWarehouse:{capacity:created.capacity,requiresOnlyCharacterLocationAndUniqueId:true},
  remoteEquip:{rejected:true,reason:remoteError},
  brokenCapacityItem:{scope:'synthetic fixture, not a current playable item',actualCapacityDefinitions:actualCapacityDefinitions.length,definition:bag.id,durability:0,displayRawCarry:m.getUsedCarryUnits(bagState,testCatalog),baseCapacity:8,acceptedWithBrokenBag:brokenBagAccepted,acceptedWithoutBag:withoutBagAccepted},
  siteAccess:{transferCaptureVisibility:access[0].visibility,equipCommitAccessEventCount:0,scope:'commit layer only; queued UI path rejects at planning'},
},null,2));
