// v26 lunar regression: run after the implementation agent announces READY.
// Pure VM + generated HTML assertions; this does NOT verify rendered DOM/CSS colors.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=require('./load-game.cjs').source;
const ctx=vm.createContext({performance:{now:()=>0},Date,console,document:{getElementById:()=>({})},localStorage:{setItem(){}}});
require('./load-game.cjs').loadGame(ctx);
const run=s=>vm.runInContext(s,ctx),json=s=>JSON.parse(run(`JSON.stringify(${s})`));
const reset=(s='')=>run(`gameState=freshState();${s}`),near=(a,b,m='')=>assert.ok(Math.abs(a-b)<1e-7,`${m}: ${a} != ${b}`);
let passed=0,failed=0;function test(name,fn){try{fn();passed++;console.log('PASS '+name)}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack)}}
run('updateUI=()=>{};keyAction=()=>{checkUnlocks()}');
const nav=run('Object.hasOwn(BUILDINGS,"navigationBeacon")?"navigationBeacon":"navBeacon"');
const moon=(extra='')=>reset('gameState.tech=Object.keys(TECHNOLOGIES).filter(t=>!["spaceBroadcasting","globalObservationCalibration","anomalyMapping","fieldConstraintTheory","dimensionBeaconDeployment","accessPointBeacon","hydrogenRecovery","icebreakingPlan","interstellarScoutPlan","interstellarCalibration","crispr16","geothermalFurnace","advancedMetalRefining","helium3ExtractionOptimization","spaceControlTower","hyperspaceMiningSurvey","gasCloudAccretion","highTechFarmPlatform","fusionPower","largeMiningShips","dimensionPioneer","highTechFactory","higherDimensionalStorage","e710ResearchStation","ripperOverclock","overclocking13","superMetal","grapheneProcessing","nanoArmor","nanoExoskeleton","aiDataCenter","aiCementWorkshop","advancedAdamantiteProcessing","advancedGrapheneProcessing","advancedConcrete","nanoAlloy","virtualReality","virtualTraining","virtualEntertainment","aerogel","plasmaResearch","plasmaMining","energyShield","stellarForge","penroseTheory","massEjector","gravityConversion","stabilizeBlackHole","exoticRunaway","alienSettlement","unifiedPlan","worldUnification"].includes(t));gameState.buildings.moonBase=1;gameState.resources.oil=100;gameState.buildings.solarSatellite=10;'+extra);
const rich=()=>run('for(const r of Object.keys(RESOURCES))gameState.resources[r]=1e9;gameState.resources.energy=0');

test('v26 lunar technology exact tiers, costs, prerequisite and queue gates',()=>{
 assert.ok(run('CONFIG.version')>=26);
 const specs={moonExploration:[['spaceflight'],{knowledge:160000}], [nav]:[['moonExploration'],{knowledge:170000}],helium3Storage:[['moonExploration'],{knowledge:150000,alloy:1000}],breederReactor:[['nuclearEnergy','moonExploration'],{knowledge:175000,iridium:2000,alloy:2000}]};
 for(const [id,[pre,cost]] of Object.entries(specs)){
  reset(`gameState.tech=${JSON.stringify(pre)};gameState.buildings.helium3Mine=1;checkUnlocks()`);
  assert.equal(run(`techTier('${id}')`),12,id);assert.deepEqual(json(`TECHNOLOGIES.${id}.cost`),cost,id);
  if(id!=='helium3Storage')assert.deepEqual(json(`TECHNOLOGIES.${id}.pre`).sort(),pre.slice().sort(),id);
  assert.equal(run(`techUnlocked('${id}')`),true,id);assert.deepEqual(json(`techCost('${id}')`),cost,id);assert.deepEqual(json(`queueCost('tech','${id}')`),cost,id);
  if(id!=='helium3Storage')for(const p of pre){reset(`gameState.tech=${JSON.stringify(pre.filter(x=>x!==p))}`);assert.equal(run(`techUnlocked('${id}')`),false,id+' missing '+p)}
 }
 reset('gameState.tech=Object.keys(TECHNOLOGIES).filter(t=>!["spaceBroadcasting","globalObservationCalibration","anomalyMapping","fieldConstraintTheory","dimensionBeaconDeployment","accessPointBeacon","hydrogenRecovery","icebreakingPlan","interstellarScoutPlan","interstellarCalibration","crispr16","geothermalFurnace","advancedMetalRefining","helium3ExtractionOptimization","spaceControlTower","hyperspaceMiningSurvey","gasCloudAccretion","highTechFarmPlatform","fusionPower","largeMiningShips","dimensionPioneer","highTechFactory","higherDimensionalStorage","e710ResearchStation","ripperOverclock","overclocking13","superMetal","grapheneProcessing","nanoArmor","nanoExoskeleton","aiDataCenter","aiCementWorkshop","advancedAdamantiteProcessing","advancedGrapheneProcessing","advancedConcrete","nanoAlloy","virtualReality","virtualTraining","virtualEntertainment","aerogel","plasmaResearch","plasmaMining","energyShield","stellarForge","penroseTheory","massEjector","gravityConversion","stabilizeBlackHole","exoticRunaway","alienSettlement","unifiedPlan","worldUnification"].includes(t)).filter(t=>t!=="helium3Storage")');assert.equal(run('techUnlocked("helium3Storage")'),false,'helium resource required');
 run('gameState.buildings.helium3Mine=1;gameState.stoppedBuildings.helium3Mine=1;checkUnlocks()');assert.equal(run('techUnlocked("helium3Storage")'),true,'stopped mine still unlocks technology');
});
test('exact construction prices, scales, manual and queued costs',()=>{
 const specs=[['moonBase',{cash:10000,metal:3000,titanium:2000,polymer:1000,oil:3000},1.18],[nav,{cash:15000,copper:2000,aluminum:2000,oil:4000,iridium:1000},1.18],['iridiumMine',{cash:10000,titanium:2000,alloy:1000},1.20],['helium3Mine',{cash:10000,aluminum:3000,metal:2000,alloy:2000},1.18],['orbitalFuelDepot',{cash:10000,oil:3000,metal:1000},1.18]];
 for(const [id,cost,scale] of specs){moon();assert.deepEqual(json(`BUILDINGS.${id}.cost`),cost,id);assert.equal(run(`workerCapacity('${id}')`),0,id);
  const calculatedScale=scale;
  for(const r of Object.keys(cost))assert.equal(run(`buildingCostScale('${id}','${r}')`),calculatedScale,id);
  for(const n of [0,1,5]){run(`gameState.buildings.${id}=${n}`);const expected=Object.fromEntries(Object.entries(cost).map(([r,v])=>[r,Math.ceil(v*calculatedScale**n)]));assert.deepEqual(json(`costFor('${id}')`),expected,id);assert.deepEqual(json(`queueCost('build','${id}')`),expected,id)}
  moon();rich();const before=json('gameState.resources'),price=json(`costFor('${id}')`),count=run(`gameState.buildings.${id}`);run(`buyBuilding('${id}')`);assert.equal(run(`gameState.buildings.${id}`),count+1);for(const [r,v]of Object.entries(price))near(run(`gameState.resources.${r}`),before[r]-v,id+' '+r);
 }
 assert.deepEqual(json('buildingInput("moonBase")'),{oil:2,energy:4});assert.deepEqual(json(`buildingInput('${nav}')`),{energy:2});assert.equal(run('BUILDINGS.orbitalFuelDepot.tech'),'helium3Storage');
 assert.equal(run('TECHNOLOGIES.moonExploration.name'),'月球勘探');assert.equal(run('TECHNOLOGIES.breederReactor.name'),'增殖核反应堆');assert.equal(run(`TECHNOLOGIES.${nav}.name`),'导航灯塔');
});
test('both lunar mines require moon technology AND constructed base, including manual purchases',()=>{
 for(const id of ['iridiumMine','helium3Mine']){reset('gameState.tech=Object.keys(TECHNOLOGIES).filter(t=>!["spaceBroadcasting","globalObservationCalibration","anomalyMapping","fieldConstraintTheory","dimensionBeaconDeployment","accessPointBeacon","hydrogenRecovery","icebreakingPlan","interstellarScoutPlan","interstellarCalibration","crispr16","geothermalFurnace","advancedMetalRefining","helium3ExtractionOptimization","spaceControlTower","hyperspaceMiningSurvey","gasCloudAccretion","highTechFarmPlatform","fusionPower","largeMiningShips","dimensionPioneer","highTechFactory","higherDimensionalStorage","e710ResearchStation","ripperOverclock","overclocking13","superMetal","grapheneProcessing","nanoArmor","nanoExoskeleton","aiDataCenter","aiCementWorkshop","advancedAdamantiteProcessing","advancedGrapheneProcessing","advancedConcrete","nanoAlloy","virtualReality","virtualTraining","virtualEntertainment","aerogel","plasmaResearch","plasmaMining","energyShield","stellarForge","penroseTheory","massEjector","gravityConversion","stabilizeBlackHole","exoticRunaway","alienSettlement","unifiedPlan","worldUnification"].includes(t))');assert.equal(run(`purchaseAllowed('build','${id}')`),false);rich();run(`buyBuilding('${id}')`);assert.equal(run(`gameState.buildings.${id}`),0);
  run('gameState.buildings.moonBase=1;gameState.stoppedBuildings.moonBase=1');assert.equal(run(`purchaseAllowed('build','${id}')`),true);
  run('gameState.tech=gameState.tech.filter(t=>t!=="moonExploration")');assert.equal(run(`purchaseAllowed('build','${id}')`),false);
 }
});
test('lunar resources unlock only from their constructed mine, remain sticky and query is pure',()=>{
 for(const [r,id]of [['iridium','iridiumMine'],['helium3','helium3Mine']]){moon(`gameState.buildings.${nav}=1`);assert.equal(run(`RESOURCES.${r}.cap`),100);assert.equal(run(`resourceUnlocked('${r}')`),false);
  run(`gameState.buildings.${id}=1;gameState.stoppedBuildings.${id}=1`);const before=json('gameState');assert.equal(run(`resourceUnlocked('${r}')`),true);assert.deepEqual(json('gameState'),before,'unlock query must not mutate');run('checkUnlocks()');assert.ok(json('gameState.unlockedResources').includes(r));run(`gameState.buildings.${id}=0;gameState.stoppedBuildings.${id}=0`);assert.equal(run(`resourceUnlocked('${r}')`),true);
 }
 reset();assert.equal(run('resourceUnlocked("iridium")||resourceUnlocked("helium3")'),false);assert.deepEqual(json('gameState.unlockedResources'),[]);
});
test('broad resource construction gates and technology conjunctions are pure',()=>{
 reset();for(const r of ['wood','food','stone','cash'])assert.equal(run(`resourceUnlocked('${r}')`),true,r);
 const specs=[['iron','mine'],['copper','mine'],['coal','coalMine'],['cement','cementWorkshop'],['metal','smelter'],['oil','refinery'],['alloy','factory'],['polymer','factory','polymer'],['titanium','smelter','titaniumSmelting'],['uranium','coalMine','nuclearEnergy'],['aluminum','metalRefinery']];
 for(const [r,id,tech]of specs){reset('gameState.tech=Object.keys(TECHNOLOGIES).filter(t=>!["spaceBroadcasting","globalObservationCalibration","anomalyMapping","fieldConstraintTheory","dimensionBeaconDeployment","accessPointBeacon","hydrogenRecovery","icebreakingPlan","interstellarScoutPlan","interstellarCalibration","crispr16","geothermalFurnace","advancedMetalRefining","helium3ExtractionOptimization","spaceControlTower","hyperspaceMiningSurvey","gasCloudAccretion","highTechFarmPlatform","fusionPower","largeMiningShips","dimensionPioneer","highTechFactory","higherDimensionalStorage","e710ResearchStation","ripperOverclock","overclocking13","superMetal","grapheneProcessing","nanoArmor","nanoExoskeleton","aiDataCenter","aiCementWorkshop","advancedAdamantiteProcessing","advancedGrapheneProcessing","advancedConcrete","nanoAlloy","virtualReality","virtualTraining","virtualEntertainment","aerogel","plasmaResearch","plasmaMining","energyShield","stellarForge","penroseTheory","massEjector","gravityConversion","stabilizeBlackHole","exoticRunaway","alienSettlement","unifiedPlan","worldUnification"].includes(t))');assert.equal(run(`resourceUnlocked('${r}')`),false,r+' tech alone');run(`gameState.buildings.${id}=1;gameState.stoppedBuildings.${id}=1`);const before=json('gameState');assert.equal(run(`resourceUnlocked('${r}')`),true,r);assert.deepEqual(json('gameState'),before,r+' query pure');if(tech){reset(`gameState.buildings.${id}=1`);assert.equal(run(`resourceUnlocked('${r}')`),false,r+' missing technology')}}
 reset('gameState.soldiers=1');assert.equal(run('resourceUnlocked("fur")'),false,'soldiers alone not construction');for(const id of json('Object.keys(BUILDINGS).filter(id=>BUILDINGS[id].soldierCap)')){reset(`gameState.buildings.${id}=1`);assert.equal(run('resourceUnlocked("fur")'),true,id)}
});
test('one paid base provides two whole supports with iridium priority',()=>{
 moon('gameState.buildings.iridiumMine=3;gameState.buildings.helium3Mine=2');near(run('production().rates.iridium'),.1);near(run('production().rates.helium3'),0);near(run('production().rates.oil'),-2);
 run('gameState.stoppedBuildings.iridiumMine=2');near(run('production().rates.iridium'),.05);near(run('production().rates.helium3'),.2);near(run('production().rates.oil'),-2);
 run(`gameState.buildings.${nav}=1`);near(run('production().rates.helium3'),.4);near(run('production().rates.oil'),-2);
 run('gameState.stoppedBuildings.iridiumMine=3;gameState.stoppedBuildings.helium3Mine=2');near(run('production().rates.iridium'),0);near(run('production().rates.helium3'),0);near(run('production().rates.oil'),-2,'unused capacity still maintains base');
});
test('full paid maintenance units with dt, no fractional base or mine output and no duplicate consumption',()=>{
 for(const dt of [.25,1,2,5])for(const funded of [0,1,2]){moon('gameState.buildings.moonBase=3;gameState.buildings.iridiumMine=10');run(`gameState.resources.oil=${(funded+.4)*2*dt}`);near(run(`production(${dt}).rates.oil`),-funded*2,`dt=${dt} funded=${funded}`);near(run(`production(${dt}).rates.iridium`),funded*.1);near(run(`production(${dt}).pool.oil`),.8*dt);near(run(`production(${dt}).power.generated`),50);near(run(`production(${dt}).power.used`),funded*4,'固定供给下维护按整座扣除且与dt无关');}
 moon('gameState.buildings.iridiumMine=1;gameState.resources.oil=0');near(run('production().rates.iridium'),0);near(run('production().rates.oil'),0);assert.equal(run('gameState.stoppedBuildings.iridiumMine'),0,'existing enabled unsupported stays enabled');
 run('gameState.resources.oil=100;gameState.stoppedBuildings.moonBase=1');near(run('production().rates.iridium'),0);near(run('production().rates.oil'),0);
});
test('supported whole mines receive normal multipliers but particle/happiness do not multiply oil input',()=>{
 moon('gameState.buildings.iridiumMine=1;gameState.buildings.helium3Mine=1;gameState.population=30;gameState.buildings.communityCenter=2;gameState.prestige.particles=100');
 for(const [r,base]of [['iridium',.05],['helium3',.2]])near(run(`production().rates.${r}`),run(`${base}*multiplier(currentHappiness(),'${r}')*particleMultiplier('${r}')`),r);
 near(run('production().rates.oil'),-2);near(run('production().inputUnits.moonBase'),1);
});
test('new unsupported mines auto-stop; manual enabling preserves enabled state without output',()=>{
 moon('gameState.resources.oil=0');rich();run('gameState.stoppedBuildings.moonBase=1;buyBuilding("iridiumMine")');assert.equal(run('gameState.stoppedBuildings.iridiumMine'),1);assert.equal(run('resourceUnlocked("iridium")'),true);run('toggleBuilding("iridiumMine",1)');assert.equal(run('gameState.stoppedBuildings.iridiumMine'),0);near(run('production().rates.iridium'),0);run('toggleBuilding("iridiumMine",-1)');assert.equal(run('gameState.stoppedBuildings.iridiumMine'),1);
 moon();rich();run('buyBuildingBatch("iridiumMine",3)');assert.equal(run('gameState.buildings.iridiumMine'),3);assert.equal(run('gameState.stoppedBuildings.iridiumMine'),1);near(run('production().rates.iridium'),.1);
});
test('active funded base capacity and ground/orbital storage stack correctly',()=>{
 moon('gameState.buildings.iridiumMine=1;gameState.buildings.helium3Mine=1');assert.equal(run('storageCap("iridium")'),200);assert.equal(run('canAssignContainer("iridium")'),true);assert.equal(run('canAssignContainer("helium3")'),false);
 run('gameState.resources.oil=0');assert.equal(run('storageCap("iridium")'),100);run('gameState.resources.oil=100;gameState.stoppedBuildings.moonBase=1');assert.equal(run('storageCap("iridium")'),100);
 run('gameState.stoppedBuildings.moonBase=0;gameState.containers=2;gameState.containerAssignments.iridium=2');near(run('storageCap("iridium")'),run('200+2*containerUnitCapacity()'));
 const before=json('[storageCap("oil"),storageCap("helium3"),storageCap("uranium")]');run('gameState.buildings.orbitalFuelDepot=2');for(const [i,r,n]of [[0,'oil',2000],[1,'helium3',1000],[2,'uranium',500]])near(run(`storageCap('${r}')`),before[i]+2*n,r);
 run('gameState.buildings.fuelDepot=3;gameState.tech=gameState.tech.filter(t=>t!=="helium3Storage")');const h=run('storageCap("helium3")');run('gameState.tech.push("helium3Storage")');near(run('storageCap("helium3")'),h+1500);assert.equal(run('storageBonuses("fuelDepot").helium3'),500);
});
test('breeder reactor upgrades fission to fixed 20 energy with unchanged fixed uranium input',()=>{
 reset('gameState.tech=["nuclearEnergy"];gameState.buildings.fissionGenerator=2;gameState.resources.uranium=100');near(run('production().power.generated'),24);near(run('production().power.available'),24);near(run('production().rates.energy'),24);near(run('production().rates.uranium'),-.2);
 run('gameState.tech.push("breederReactor");gameState.population=50;gameState.buildings.communityCenter=3;gameState.prestige.particles=100');near(run('production().power.generated'),40);near(run('production().power.available'),40);near(run('production().rates.energy'),40);near(run('production().rates.uranium'),-.2);run('gameState.resources.uranium=.1');near(run('production().power.generated'),20);near(run('production().power.available'),20);near(run('production().rates.energy'),20);near(run('production().rates.uranium'),-.1);
});
test('v25 saves reject immutably instead of initializing missing moon fields',()=>{
 reset();run('globalThis.old=JSON.parse(JSON.stringify(gameState));old.version=25;delete old.unlockedResources;delete old.resources.iridium');
 const before=run('JSON.stringify(old)');assert.throws(()=>run('validateSave(old)'),/版本|兼容/);assert.equal(run('JSON.stringify(old)'),before);
});
test('operational status distinguishes enabled unsupported, partially supported and stopped mines',()=>{
 moon('gameState.buildings.iridiumMine=3;gameState.resources.oil=0');let status=json('buildingOperationalStatus("iridiumMine",production())');assert.equal(status.enabled,3);assert.equal(status.actual,0);assert.equal(status.shortage,true);assert.ok(status.causes.some(c=>c.includes('支持')));
 run('gameState.resources.oil=100');status=json('buildingOperationalStatus("iridiumMine",production())');assert.equal(status.actual,2);assert.equal(status.shortage,true);
 run('gameState.stoppedBuildings.iridiumMine=3');status=json('buildingOperationalStatus("iridiumMine",production())');assert.equal(status.enabled,0);assert.equal(status.actual,0);assert.equal(status.shortage,false);
});
test('non-lunar maintenance status reflects available power, including broadcast and housing',()=>{
 for(const id of ['broadcast','apartment']){reset(`gameState.buildings.${id}=1;gameState.buildings.solarSatellite=0`);let status=json(`buildingOperationalStatus('${id}',production())`);assert.equal(status.enabled,1,id);assert.equal(status.shortage,true,id+' empty power');near(run('production().power.generated'),0,id);run('gameState.buildings.solarSatellite=1');status=json(`buildingOperationalStatus('${id}',production())`);assert.equal(status.shortage,false,id+' funded');assert.ok(run('production().power.used')>0,id+' 固定供给被消费');assert.ok(run('production().power.available')>0,id);run(`gameState.stoppedBuildings.${id}=1`);status=json(`buildingOperationalStatus('${id}',production())`);assert.equal(status.enabled,0,id);assert.equal(status.shortage,false,id+' stopped');near(run('production().power.used'),0,id+' 停用不耗电')}
});
test('resource unlock callback and alternate-state queries are pure',()=>{
 reset();const before=json('gameState');assert.deepEqual(json('Object.keys(RESOURCES).filter(resourceUnlocked)'),json('Object.keys(RESOURCES).filter(r=>resourceUnlocked(r))'));assert.deepEqual(json('gameState'),before);
 run('globalThis.alternate=freshState();alternate.buildings.iridiumMine=1');assert.equal(run('resourceUnlocked("iridium",alternate)'),true);assert.equal(run('resourceUnlocked("iridium")'),false);assert.deepEqual(json('gameState'),before);
});
test('queued unsupported mines auto-stop and debit the live scaled price exactly once',()=>{
 moon('gameState.stoppedBuildings.moonBase=1');run('requestPurchase("build","helium3Mine")');assert.equal(run('gameState.queue.length'),1);rich();const before=json('gameState.resources'),price=json('queueCost("build","helium3Mine")');run('processQueue()');assert.equal(run('gameState.queue.length'),0);assert.equal(run('gameState.buildings.helium3Mine'),1);assert.equal(run('gameState.stoppedBuildings.helium3Mine'),1);for(const [r,v]of Object.entries(price))near(run(`gameState.resources.${r}`),before[r]-v,r);
});
test('live support API reports reserved whole-unit allocation and spare capacity',()=>{
 moon('gameState.buildings.iridiumMine=1;gameState.buildings.helium3Mine=3');assert.deepEqual(json('moonSupportState().allocations'),{iridiumMine:1,helium3Mine:1,moonObservatory:0});assert.deepEqual(json('[moonSupportState().capacity,moonSupportState().used,moonSupportState().available,moonSupportState().baseUnits]'),[2,2,0,1]);run('gameState.stoppedBuildings.helium3Mine=3');assert.deepEqual(json('[moonSupportState().used,moonSupportState().available]'),[1,1]);run('gameState.resources.oil=0');assert.deepEqual(json('[moonSupportState().capacity,moonSupportState().used]'),[0,0]);
});
test('sticky resource flags persist, reject malformed enum values, and fresh reset clears flags',()=>{
 reset('gameState.unlockedResources=["iridium","helium3"]');assert.deepEqual(json('validateSave(gameState).unlockedResources'),['iridium','helium3']);
 for(const v of ['null','{}','["notAResource"]','["iridium","iridium"]','[1]']){reset(`gameState.unlockedResources=${v}`);assert.throws(()=>run('validateSave(gameState)'),v)}
 reset();assert.deepEqual(json('gameState.unlockedResources'),[]);
 for(const kind of ['soft','hard']){reset('gameState.unlockedResources=["iridium","helium3"]');run(`resetRun('${kind}')`);assert.deepEqual(json('gameState.unlockedResources'),[],kind+' clears flags')}
 reset('gameState.unlockedResources=["iridium","helium3"];gameState.tech=["nuclearProgram"];gameState.nuclearProgress=100');run('launchNuclear()');assert.deepEqual(json('gameState.unlockedResources'),[],'nuclear reset clears flags');
});
test('new moon save fields reject invalid counts, resources, stopped units and container assignments',()=>{
 for(const [field,value]of [['resources.iridium','-1'],['resources.helium3','NaN'],['buildings.moonBase','.5'],['buildings.iridiumMine','-1'],['buildings.helium3Mine','Infinity'],['buildings.navigationBeacon','.5'],['buildings.orbitalFuelDepot','-1'],['workers.moonBase','1'],['stoppedBuildings.iridiumMine','1'],['containerAssignments.iridium','-1'],['containerAssignments.helium3','1']]){reset(`gameState.${field}=${value}`);assert.throws(()=>run('validateSave(gameState)'),field+'='+value)}
});
test('space content places Moon after Eden, shows mines only after base (HTML, not visual CSS)',()=>{
 reset('gameState.tech=Object.keys(TECHNOLOGIES).filter(t=>!["spaceBroadcasting","globalObservationCalibration","anomalyMapping","fieldConstraintTheory","dimensionBeaconDeployment","accessPointBeacon","hydrogenRecovery","icebreakingPlan","interstellarScoutPlan","interstellarCalibration","crispr16","geothermalFurnace","advancedMetalRefining","helium3ExtractionOptimization","spaceControlTower","hyperspaceMiningSurvey","gasCloudAccretion","highTechFarmPlatform","fusionPower","largeMiningShips","dimensionPioneer","highTechFactory","higherDimensionalStorage","e710ResearchStation","ripperOverclock","overclocking13","superMetal","grapheneProcessing","nanoArmor","nanoExoskeleton","aiDataCenter","aiCementWorkshop","advancedAdamantiteProcessing","advancedGrapheneProcessing","advancedConcrete","nanoAlloy","virtualReality","virtualTraining","virtualEntertainment","aerogel","plasmaResearch","plasmaMining","energyShield","stellarForge","penroseTheory","massEjector","gravityConversion","stabilizeBlackHole","exoticRunaway","alienSettlement","unifiedPlan","worldUnification"].includes(t))');
 // The Vue space view owns this ordering; assert against its real source plus unlock rules.
 const space=fs.readFileSync(path.join(__dirname,'..','src/vue/components/BuildingsPanel.vue'),'utf8');
 const eden=space.indexOf('Eden_Kittens'),moon=space.indexOf('月球');
 assert.ok(eden>=0&&moon>eden,'Eden_Kittens 先于月球渲染');
 assert.match(space,/SPACE\.filter\(id => buildingUnlocked\(id, props\.state\)\)/);
 assert.match(space,/MOON\.filter\(id => buildingUnlocked\(id, props\.state\)\)/);
 run('gameState.buildings.moonBase=0');
 assert.equal(run(`buildingUnlocked('iridiumMine')`),false,'未建月球基地时矿井不解锁');
 run('gameState.buildings.moonBase=1;gameState.resources.oil=100');
 assert.equal(run(`buildingUnlocked('iridiumMine')`),true,'月球基地建成后解锁铱矿');
 assert.equal(run(`buildingUnlocked('helium3Mine')`),true,'月球基地建成后解锁氦3矿');
 // Live support balance must come from actual production, never a static snapshot.
 assert.match(space,/moonSupportBalance|moon\.used|moon\.capacity/,'太空视图绑定实时月球支持');
});
console.log(`Moon/resource-unlock VM regressions: ${passed} passed, ${failed} failed.`);if(failed)process.exitCode=1;
