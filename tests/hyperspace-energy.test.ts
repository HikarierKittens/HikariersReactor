import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { BUILDINGS } from '../src/data/buildings';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { calculateProduction } from '../src/simulation/production';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateResourceBreakdown } from '../src/simulation/resource-breakdown';
import { calculateBuildingOutput } from '../src/simulation/building-production';
import { isTechnologyUnlocked, isBuildingUnlocked } from '../src/simulation/unlocks';
import { requestPurchaseModule } from '../src/simulation/purchases';
import type { TechnologyId } from '../src/types/technologies';
const fresh=()=>createInitialState(CONFIG.version,60,0);
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function ready(){const s=fresh();s.tech.push('fieldConstraintTheory','accessPointBeacon','dimensionBeaconDeployment','hydrogenRecovery');return s;}
test('hyperspace technology tiers costs and building-gated research retain exact research payments',()=>{
 assert.equal(TECHNOLOGIES.dimensionBeaconDeployment.tier,17);
 assert.equal(TECHNOLOGIES.accessPointBeacon.tier,17);assert.deepEqual(TECHNOLOGIES.accessPointBeacon.cost,{knowledge:650000});
 assert.equal(TECHNOLOGIES.hydrogenRecovery.tier,17);assert.deepEqual(TECHNOLOGIES.hydrogenRecovery.cost,{knowledge:660000});
 assert.equal(TECHNOLOGIES.icebreakingPlan.tier,18);assert.deepEqual(TECHNOLOGIES.icebreakingPlan.cost,{knowledge:690000});
 const s=fresh();s.tech.push('fieldConstraintTheory','dimensionBeaconDeployment');
 assert.equal(isTechnologyUnlocked('accessPointBeacon',s),true);assert.equal(isTechnologyUnlocked('hydrogenRecovery',s),false);
 s.buildings.asteroidBase=1;assert.equal(isTechnologyUnlocked('hydrogenRecovery',s),true);assert.equal(isTechnologyUnlocked('icebreakingPlan',s),false);
 for(const [id,cost] of [['accessPointBeacon',650000],['hydrogenRecovery',660000],['icebreakingPlan',690000]] as const){s.resources.knowledge=cost;assert.equal(requestPurchaseModule(s,'tech',id,0).status,'buy-now');assert.equal(s.resources.knowledge,0);assert.equal(requestPurchaseModule(s,'tech',id,0).status,'rejected');}
 assert.equal(isBuildingUnlocked('signalRepeater',s),true);assert.equal(isBuildingUnlocked('hydrogenPowerPlant',s),true);
 assert.equal(s.logs.some(log=>log.text==='投放维度探测信标后，虚空之中传来了另一个信号'),false);
});
test('funded repeaters amplify only funded arrays and never amplify spaceport stability',()=>{
 for(const dt of [.2,1]){const s=ready();s.buildings.constraintArray=2;s.buildings.signalRepeater=3;s.buildings.hyperspaceSpaceport=1;s.resources.e710=1;s.resources.helium3=1e4;s.resources.energy=165*dt;
 const before=clone(s),p=calculateProduction(s,dt);assert.deepEqual(s,before);assert.deepEqual(p.stageThree,calculateSupportPreview(s,dt).stageThree);near(p.stageThree.capacity,9.5);near(p.rates.energy,-160);near(calculateResourceBreakdown('energy',s,p).net,-160);
 s.resources.energy=120*dt;const short=calculateProduction(s,dt);near(short.stageThree.capacity,5);near(short.rates.energy,-120);
 s.stoppedBuildings.constraintArray=2;s.resources.energy=60*dt;s.resources.helium3=1e4;near(calculateProduction(s,dt).stageThree.capacity,4);
 }
});
test('hydrogen plants use stored water before energy maintenance and supply independent asteroid support',()=>{
 for(const dt of [.2,1]){const s=ready();s.buildings.hydrogenPowerPlant=s.buildings.hyperspaceSpaceport=s.buildings.iceMiningShip=1;s.buildings.aiSupercore=0;s.resources.energy=0;s.resources.water=2*dt;s.resources.helium3=100*dt;
 const before=clone(s),p=calculateProduction(s,dt),preview=calculateSupportPreview(s,dt);assert.deepEqual(s,before);assert.deepEqual(p.stageThree,preview.stageThree);near(p.rates.energy,0);near(p.rates.water,-1);near(p.pool.water,1*dt);near(p.rates.helium3,-10);assert.equal(p.stageThree.asteroidCapacity,3);assert.equal(p.inputUnits.hydrogenPowerPlant,1);assert.equal(p.inputUnits.hyperspaceSpaceport,1);assert.equal(p.inputUnits.iceMiningShip,1);near(calculateResourceBreakdown('energy',s,p).net,p.rates.energy);near(calculateResourceBreakdown('water',s,p).net,p.rates.water);
 s.resources.water=2*dt-.001;const short=calculateProduction(s,dt);assert.equal(short.inputUnits.hydrogenPowerPlant||0,0);assert.equal(short.stageThree.asteroidCapacity,0);
 s.resources.water=0;near(calculateProduction(s,dt).rates.water,0);s.resources.water=2*dt;s.stoppedBuildings.hydrogenPowerPlant=1;assert.equal(calculateProduction(s,dt).stageThree.asteroidCapacity,0);
 s.stoppedBuildings.hydrogenPowerPlant=0;s.stoppedBuildings.hyperspaceSpaceport=1;const independent=calculateProduction(s,dt);assert.equal(independent.stageThree.asteroidCapacity,1);assert.equal(independent.inputUnits.iceMiningShip,1);near(independent.rates.energy,30);near(independent.rates.helium3,-5);
 }
});
test('hydrogen research cannot be smuggled through saves without its permanent base prerequisite',()=>{
 const s=fresh();s.tech=Object.keys(TECHNOLOGIES).filter(id=>id!=='spaceControlTower'&&id!=='higherDimensionalStorage'&&!['overclocking13','superMetal','grapheneProcessing','nanoAlloy','virtualReality','virtualTraining','virtualEntertainment','aerogel','plasmaResearch','plasmaMining','energyShield','stellarForge','penroseTheory','massEjector','gravityConversion','stabilizeBlackHole','exoticRunaway'].includes(id)) as TechnologyId[];s.prestige.nuclearResets=1;
 s.asrielMissionCompleted=s.kerberosMissionCompleted=s.solarMissionCompleted=s.talosMissionCompleted=s.talosMoonMissionCompleted=s.asteroidBeltMissionCompleted=s.misenMissionCompleted=true;
 for(const id of ['rocketPlatform','monument','geneSequencing'] as const)s.arpaBuildings[id]=1;s.arpaBuildings.arpaResearchInstitute=2;
 s.buildings.aiSupercore=100;s.buildings.constraintArray=s.buildings.iceMiningShip=s.buildings.asteroidBase=1;for(const key of Object.keys(s.stageThree) as (keyof typeof s.stageThree)[])s.stageThree[key]=true;
 const ctx={now:0,eventInterval:60,housingCapacity:()=>1000,clampResources:()=>{}};assert.doesNotThrow(()=>validateCurrentSave(s,ctx));const bad=clone(s);bad.buildings.asteroidBase=0;assert.throws(()=>validateCurrentSave(bad,ctx));
});
test('icebreaking upgrades only the base water output once and new powered buildings migrate strictly',()=>{
 const s=ready();s.buildings.hyperspaceSpaceport=1;s.buildings.iceMiningShip=2;s.resources.energy=100;s.resources.helium3=1e4;s.tech.push('icebreakingPlan');assert.equal(calculateBuildingOutput('iceMiningShip',s).water,1.25);const p=calculateProduction(s);near(p.rates.water,2.5);near(calculateResourceBreakdown('water',s,p).net,2.5);assert.equal(BUILDINGS.hydrogenPowerPlant.input?.water,2);
 const raw=clone(fresh()) as unknown as Record<string,unknown>;for(const field of ['buildings','workers','stoppedBuildings'])for(const id of ['signalRepeater','hydrogenPowerPlant'])delete (raw[field] as Record<string,unknown>)[id];const before=clone(raw),ctx={now:0,eventInterval:60,housingCapacity:()=>1000,clampResources:()=>{}};const migrated=validateCurrentSave(raw,ctx);assert.deepEqual(raw,before);assert.equal(migrated.buildings.signalRepeater,0);assert.equal(migrated.buildings.hydrogenPowerPlant,0);
 for(const field of ['buildings','workers','stoppedBuildings'])for(const id of ['signalRepeater','hydrogenPowerPlant'])for(const value of [null,.5]){const bad=clone(raw);(bad[field] as Record<string,unknown>)[id]=value;assert.throws(()=>validateCurrentSave(bad,ctx));}
});
