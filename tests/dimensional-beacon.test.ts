import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { BUILDINGS } from '../src/data/buildings';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateProduction } from '../src/simulation/production';
import { calculateStorageDetails } from '../src/simulation/storage';
import { calculateResourceBreakdown } from '../src/simulation/resource-breakdown';
import { isBuildingUnlocked, isTechnologyUnlocked } from '../src/simulation/unlocks';
import { requestPurchaseModule } from '../src/simulation/purchases';
import { isContainerAssignable } from '../src/simulation/containers';
import { supplyPower } from './support/power';
import type { ResourceId } from '../src/types/economy';
const fresh=()=>createInitialState(CONFIG.version,60,0);
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const setup=()=>{const s=fresh();s.tech.push('fieldConstraintTheory','dimensionBeaconDeployment');return s;};
const snap=(s:ReturnType<typeof fresh>,dt=1)=>{const p=calculateSupportPreview(s,dt);return {...p,moonBaseUnits:p.moon.baseUnits};};
const ordinary:ResourceId[]=['wood','cement','stone','iron','coal','copper','aluminum','titanium','metal','oil','uranium','alloy','polymer','iridium'];
test('beacon research gates directly on field constraint theory and unlocks the new building chain',()=>{
 const s=fresh();s.resources.knowledge=700000;
 assert.equal(isTechnologyUnlocked('dimensionBeaconDeployment',s),false);s.tech.push('fieldConstraintTheory');assert.deepEqual(TECHNOLOGIES.dimensionBeaconDeployment.pre,['fieldConstraintTheory']);
 assert.equal(isTechnologyUnlocked('dimensionBeaconDeployment',s),true);
 assert.deepEqual(TECHNOLOGIES.dimensionBeaconDeployment.cost,{knowledge:700000});
 assert.equal(TECHNOLOGIES.dimensionBeaconDeployment.tier,17);
 const before=clone(s);s.resources.knowledge=699999;assert.notEqual(requestPurchaseModule(s,'tech','dimensionBeaconDeployment',0).status,'buy-now');s.queue=[];s.resources.knowledge=before.resources.knowledge;
 assert.equal(requestPurchaseModule(s,'tech','dimensionBeaconDeployment',0).status,'buy-now');assert.equal(s.resources.knowledge,0);
 assert.equal(isBuildingUnlocked('hyperspaceSpaceport',s),true);assert.equal(isBuildingUnlocked('iceMiningShip',s),true);assert.equal(isBuildingUnlocked('asteroidBase',s),false);
 s.buildings.iceMiningShip=1;assert.equal(isBuildingUnlocked('asteroidBase',s),true);
 assert.equal(requestPurchaseModule(s,'tech','dimensionBeaconDeployment',0).status,'rejected');
 assert.equal(s.logs.filter(entry=>entry.text==='投放维度探测信标后，虚空之中传来了另一个信号').length,1);
});
test('funded ports add stability before freight, and ice/base reserve whole support and maintenance exactly once',()=>{
 for(const dt of [.2,1]){
  const s=setup();s.buildings.hyperspaceSpaceport=s.buildings.iceMiningShip=s.buildings.asteroidBase=s.buildings.anchorFreightStation=1;
  Object.assign(s.resources,{helium3:1e4});supplyPower(s,60);const before=clone(s),p=calculateProduction(s,dt),preview=calculateSupportPreview(s,dt);
  assert.deepEqual(s,before);assert.deepEqual(p.stageThree,preview.stageThree);assert.equal(p.stageThree.capacity,4);assert.equal(p.stageThree.freight,1);assert.equal(p.stageThree.available,2);
  assert.equal(p.inputUnits.hyperspaceSpaceport,1);assert.equal(p.inputUnits.iceMiningShip,1);assert.equal(p.inputUnits.asteroidBase,1);
  assert.deepEqual(p.power,{generated:60,used:60,available:0});near(p.rates.energy,0);near(p.rates.water,1);near(calculateResourceBreakdown('energy',s,p).net,p.rates.energy);near(calculateResourceBreakdown('water',s,p).net,1);
  near(calculateStorageDetails('water',s,snap(s,dt)).total,8100);
  supplyPower(s,50);s.resources.helium3=1e4;const low=calculateProduction(s,dt);assert.equal(low.inputUnits.iceMiningShip,1);assert.equal(low.inputUnits.asteroidBase,1);assert.deepEqual(low.power,{generated:50,used:45,available:-10});near(low.rates.energy,-10);
  s.stoppedBuildings.hyperspaceSpaceport=1;const off=calculateProduction(s,dt);assert.equal(off.stageThree.capacity,0);assert.equal(off.inputUnits.iceMiningShip||0,0);assert.equal(off.inputUnits.asteroidBase||0,0);near(off.rates.water,0);near(calculateStorageDetails('water',s,snap(s,dt)).total,0);
 }
});
test('asteroid bases multiply freight capacity additively without boosting unrelated storage',()=>{
 const s=setup();s.buildings.hyperspaceSpaceport=2;s.buildings.iceMiningShip=1;s.buildings.asteroidBase=2;s.buildings.anchorFreightStation=1;supplyPower(s,1000);s.resources.helium3=1e4;
 const off=clone(s);off.stoppedBuildings.asteroidBase=2;
 for(const id of ordinary)near(calculateStorageDetails(id,s,snap(s)).total-calculateStorageDetails(id,off,snap(off)).total,3200);
 for(const id of ['food','cash','knowledge','e710','energy'] as ResourceId[])near(calculateStorageDetails(id,s,snap(s)).total,calculateStorageDetails(id,off,snap(off)).total);
 assert.equal(isContainerAssignable('water',s),false);
 s.buildings.iceMiningShip=3;const p=calculateProduction(s);assert.equal(p.inputUnits.iceMiningShip,3);assert.equal(p.inputUnits.asteroidBase,1);near(p.rates.water,3);
});
test('missing and malformed beacon records reject without mutation',()=>{
 const s=fresh(),raw=clone(s) as unknown as Record<string,unknown>;const ids=['hyperspaceSpaceport','iceMiningShip','asteroidBase'];
 for(const field of ['buildings','workers','stoppedBuildings'])for(const id of ids)delete (raw[field] as Record<string,unknown>)[id];
 delete (raw.resources as Record<string,unknown>).water;delete (raw.containerAssignments as Record<string,unknown>).water;
 const before=clone(raw),ctx={now:0,eventInterval:60,housingCapacity:()=>1000,clampResources:()=>{}};assert.throws(()=>validateCurrentSave(raw,ctx));assert.deepEqual(raw,before);
 for(const field of ['buildings','workers','stoppedBuildings'])for(const id of ids)for(const value of [null,.5]){const bad=clone(s) as unknown as Record<string,unknown>;(bad[field] as Record<string,unknown>)[id]=value;assert.throws(()=>validateCurrentSave(bad,ctx));}
 const bad=clone(s);(bad.resources as Record<string,unknown>).water=null;assert.throws(()=>validateCurrentSave(bad,ctx));
 assert.equal(BUILDINGS.hyperspaceSpaceport.input?.energy,30);
});
test('funded hyperspace spaceports add 16000 helium-3 storage, doubled by higher-dimensional storage',()=>{
 const s=setup();s.buildings.hyperspaceSpaceport=1;s.resources.helium3=1e4;supplyPower(s,1000);
 const off=clone(s);off.stoppedBuildings.hyperspaceSpaceport=1;
 const row=(x:ReturnType<typeof fresh>)=>calculateStorageDetails('helium3',x,snap(x)).rows.find(r=>r.name.includes('超空间太空港'));
 assert.equal(row(off),undefined);near(row(s)!.value,16000);
 near(calculateStorageDetails('helium3',s,snap(s)).total-calculateStorageDetails('helium3',off,snap(off)).total,16000);
 s.tech.push('higherDimensionalStorage');off.tech.push('higherDimensionalStorage');near(row(s)!.value,32000);
 near(calculateStorageDetails('helium3',s,snap(s)).total-calculateStorageDetails('helium3',off,snap(off)).total,32000);
});
