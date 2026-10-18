import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { BUILDINGS } from '../src/data/buildings';
import { TECHNOLOGIES } from '../src/data/technologies';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateProduction } from '../src/simulation/production';
import { calculateStorageDetails } from '../src/simulation/storage';
import { calculateHousingDetails } from '../src/simulation/housing';
import { calculateResourceBreakdown } from '../src/simulation/resource-breakdown';
import { calculateBuildingScale } from '../src/simulation/costs';
import { isBuildingUnlocked } from '../src/simulation/unlocks';
import { constructBuildingState, requestPurchaseModule, settlePurchaseQueue } from '../src/simulation/purchases';
import type { TechnologyId } from '../src/types/technologies';
import type { ResourceId } from '../src/types/economy';
import { supplyPower } from './support/power';
const fresh=()=>createInitialState(CONFIG.version,60,0);
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function services(){const s=fresh();s.tech.push('fieldConstraintTheory');return s;}
function snapshot(s:ReturnType<typeof fresh>,dt=1){const p=calculateSupportPreview(s,dt);return {...p,moonBaseUnits:p.moon.baseUnits};}
const resources:ResourceId[]=['wood','cement','stone','iron','coal','copper','aluminum','titanium','metal','oil','uranium','alloy','polymer','iridium'];

test('service allocation spends two stability per relay freight and civilian with whole-unit upkeep exactly once',()=>{
 for(const dt of [.2,1,3]){
  const s=services();s.buildings.constraintArray=3;s.buildings.shortRangeRelay=1;s.buildings.anchorFreightStation=1;s.buildings.civilianRouteStation=2;
  Object.assign(s.resources,{e710:.75*dt,food:50*dt});supplyPower(s,205);const before=clone(s);const preview=calculateSupportPreview(s,dt),p=calculateProduction(s,dt);
  assert.deepEqual(preview.stageThree,{arrays:3,relays:1,freight:1,civilian:1,capacity:6,used:6,available:0,ports:0,iceShips:0,asteroidBases:0,asteroidCapacity:0,asteroidUsed:0,asteroidAvailable:0,repeaters:0,hydrogenPlants:0});
  assert.equal(p.inputUnits.civilianRouteStation,1);assert.deepEqual(p.power,{generated:205,used:190,available:15});near(p.rates.energy,15);assert.equal(p.pool.energy,0,'electricity is a fixed budget, not stored');near(p.rates.food,-50);near(p.rates.e710,-.75);assert.deepEqual(s,before);
  s.resources.food=49.9*dt;assert.equal(calculateSupportPreview(s,dt).stageThree.civilian,0);
  s.resources.food=50*dt;supplyPower(s,159.9);assert.equal(calculateSupportPreview(s,dt).stageThree.civilian,0);
  supplyPower(s,160);s.stoppedBuildings.constraintArray=1;const short=calculateSupportPreview(s,dt).stageThree;assert.equal(short.relays,1);assert.equal(short.freight,1);assert.equal(short.civilian,0);
 }
});

test('freight adds exactly 32000 base storage for fourteen resources only when funded without warehouse doubling',()=>{
 const s=services();s.buildings.constraintArray=2;s.buildings.anchorFreightStation=2;Object.assign(s.resources,{e710:1,helium3:1e4});supplyPower(s,200);const on=snapshot(s);
 const off=clone(s);off.stoppedBuildings.anchorFreightStation=2;const baseline=snapshot(off);
 for(const id of resources)near(calculateStorageDetails(id,s,on).total-calculateStorageDetails(id,off,baseline).total,64000);
 for(const id of ['food','energy','knowledge','fur','helium3','e710','neutron','cash'] as ResourceId[])near(calculateStorageDetails(id,s,on).total,calculateStorageDetails(id,off,baseline).total);
 assert.equal(calculateStorageDetails('plank',s,on).total,Infinity);
 s.tech.push('iridiumAlloyWarehouse','dimensionCompression');s.arpaBuildings.arpaResearchInstitute=10;
 near(calculateStorageDetails('wood',s,snapshot(s)).rows.find(r=>r.name.includes('锚点货运站'))!.value,64000);
 s.stoppedBuildings.anchorFreightStation=1;near(calculateStorageDetails('wood',s,snapshot(s)).rows.find(r=>r.name.includes('锚点货运站'))!.value,32000);
 supplyPower(s,0);assert.equal(calculateStorageDetails('wood',s,snapshot(s)).rows.some(r=>r.name.includes('锚点货运站')),false);
});

test('service base storage receives global particle Casimir and exchange bonuses without special-resource leakage',()=>{
 const s=services();s.buildings.constraintArray=2;s.buildings.anchorFreightStation=1;s.buildings.civilianRouteStation=1;Object.assign(s.resources,{e710:1,helium3:1e4,food:100});supplyPower(s,200);
 s.crispr.push('spatialReasoning','casimirEffect');s.prestige.particles=1000;s.prestige.casimir=500;s.arpaBuildings.stockExchange=2;
 const off=clone(s);off.stoppedBuildings.anchorFreightStation=1;off.stoppedBuildings.civilianRouteStation=1;
 near(calculateStorageDetails('wood',s,snapshot(s)).total-calculateStorageDetails('wood',off,snapshot(off)).total,32000*1.8);
 near(calculateStorageDetails('cash',s,snapshot(s)).total-calculateStorageDetails('cash',off,snapshot(off)).total,32000*1.2*1.8);
 near(calculateStorageDetails('energy',s,snapshot(s)).total,calculateStorageDetails('energy',off,snapshot(off)).total);
});

test('civilian housing and cash capacity use actually funded units and preserve supplied subsecond snapshots',()=>{
 const s=services();s.buildings.constraintArray=1;s.buildings.civilianRouteStation=1;Object.assign(s.resources,{e710:1,helium3:1e4,food:10});supplyPower(s,100);
 const p=calculateSupportPreview(s,.2);assert.equal(p.stageThree.civilian,1);assert.equal(calculateSupportPreview(s,1).stageThree.civilian,0);
 assert.equal(calculateHousingDetails(s,p.asriel,p.stageThree).find(row=>row.name===BUILDINGS.civilianRouteStation.name)?.value,5);
 const cap=calculateStorageDetails('cash',s,{...p,moonBaseUnits:p.moon.baseUnits});assert.equal(cap.rows.find(row=>row.name.includes(BUILDINGS.civilianRouteStation.name))?.value,32000);
 const foodCap=calculateStorageDetails('food',s,{...p,moonBaseUnits:p.moon.baseUnits});assert.equal(foodCap.rows.find(row=>row.name.includes(BUILDINGS.civilianRouteStation.name))?.value,32000);
 const stopped=clone(s);stopped.stoppedBuildings.civilianRouteStation=1;assert.equal(calculateStorageDetails('food',stopped,snapshot(stopped,.2)).rows.some(row=>row.name.includes(BUILDINGS.civilianRouteStation.name)),false);
 const result=calculateProduction(s,.2);near(calculateResourceBreakdown('food',s,result).net,result.rates.food);near(result.rates.food,-50);
 s.resources.food=0;const noFood=calculateSupportPreview(s,.2);assert.equal(noFood.stageThree.civilian,0);assert.equal(calculateHousingDetails(s,noFood.asriel,noFood.stageThree).find(row=>row.name===BUILDINGS.civilianRouteStation.name)?.value,0);
});

test('civilian unlock cost creep and direct queued support-shortage defaults share service gates',()=>{
 const s=services();assert.equal(isBuildingUnlocked('civilianRouteStation',s),true);assert.equal(isBuildingUnlocked('anchorFreightStation',s),true);
 s.tech=[];assert.equal(isBuildingUnlocked('civilianRouteStation',s),false);s.tech.push('fieldConstraintTheory');
 for(const r of Object.keys(BUILDINGS.civilianRouteStation.cost) as ResourceId[])assert.equal(calculateBuildingScale('civilianRouteStation',r,s),1.21);
 assert.deepEqual(BUILDINGS.civilianRouteStation.cost,{cash:1200000,alloy:20000,iridium:6000,nanotubes:20000,e710:100});
 s.buildings.constraintArray=1;Object.assign(s.resources,{food:100,e710:1});supplyPower(s,100);constructBuildingState(s,'civilianRouteStation',0);assert.equal(s.stoppedBuildings.civilianRouteStation,0);
 constructBuildingState(s,'civilianRouteStation',0);assert.equal(s.stoppedBuildings.civilianRouteStation,1);
 const q=services();for(const r of Object.keys(q.resources) as ResourceId[])q.resources[r]=1e9;
 requestPurchaseModule(q,'build','civilianRouteStation',0,true);settlePurchaseQueue(q,0);assert.equal(q.buildings.civilianRouteStation,1);assert.equal(q.stoppedBuildings.civilianRouteStation,1);
});

test('saves reject missing and malformed civilian records immutably',()=>{
 const s=fresh();s.tech=Object.keys(TECHNOLOGIES).filter(id=>!['spaceControlTower','globalObservationCalibration','anomalyMapping','fieldConstraintTheory','dimensionBeaconDeployment','accessPointBeacon','hydrogenRecovery','icebreakingPlan','hyperspaceMiningSurvey','gasCloudAccretion','highTechFarmPlatform','fusionPower','largeMiningShips','dimensionPioneer','highTechFactory','higherDimensionalStorage','e710ResearchStation','ripperOverclock','overclocking13','superMetal','grapheneProcessing','nanoAlloy','dysonSphere','virtualReality','virtualTraining','virtualEntertainment','aerogel','plasmaResearch','plasmaMining','energyShield','stellarForge','penroseTheory','massEjector','gravityConversion','stabilizeBlackHole','exoticRunaway'].includes(id)) as TechnologyId[];
 s.prestige.nuclearResets=1;s.asrielMissionCompleted=s.kerberosMissionCompleted=s.solarMissionCompleted=s.talosMissionCompleted=s.talosMoonMissionCompleted=s.asteroidBeltMissionCompleted=s.misenMissionCompleted=true;
 s.arpaBuildings.rocketPlatform=s.arpaBuildings.monument=s.arpaBuildings.geneSequencing=1;s.arpaBuildings.arpaResearchInstitute=2;
 const raw:any=clone(s);for(const field of ['buildings','workers','stoppedBuildings'])delete raw[field].civilianRouteStation;const before=clone(raw);
 const ctx={now:0,eventInterval:60,housingCapacity:()=>1000,clampResources:()=>{}};assert.throws(()=>validateCurrentSave(raw,ctx));assert.deepEqual(raw,before);
 for(const field of ['buildings','workers','stoppedBuildings']){const bad=clone(s) as unknown as Record<string,unknown>;(bad[field] as Record<string,unknown>).civilianRouteStation=null;assert.throws(()=>validateCurrentSave(bad,ctx));}
});
