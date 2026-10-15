import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateProduction } from '../src/simulation/production';
import { calculateResourceBreakdown } from '../src/simulation/resource-breakdown';
import type { ResourceId } from '../src/types/economy';
import { researchTechnologyNow } from '../src/simulation/purchases';
import { investInProject } from '../src/simulation/projects';
import { isBuildingUnlocked, isTechnologyUnlocked } from '../src/simulation/unlocks';
import { updateProgression } from '../src/simulation/progression';
import { resetRunState, launchNuclearPrestige, launchEscapePrestige } from '../src/simulation/prestige';
import { SHIP_COMPONENTS } from '../src/simulation/spaceship';
import { createMilestoneState } from './fixtures/milestones';
import type { ShipComponentId } from '../src/types/state';
const clone = <T>(s:T):T => JSON.parse(JSON.stringify(s));
const near = (a:number,b:number) => assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const context={now:0,eventInterval:60,housingCapacity:()=>1000,clampResources:()=>{}};
function complete() {
 const s=createMilestoneState('remote',{buildings:{aiSupercore:100,constraintArray:3}});
 s.stoppedBuildings.aiSupercore=1;
 return s;
}
function funds(s:ReturnType<typeof complete>) { for(const id of Object.keys(s.resources) as (keyof typeof s.resources)[])s.resources[id]=1e8; }

test('freight station unlocks directly with field theory, without a project or experiment',()=>{
 const s=complete();s.tech=s.tech.filter(id=>id!=='fieldConstraintTheory');assert.equal(isBuildingUnlocked('anchorFreightStation',s),false);
 funds(s);assert.equal(researchTechnologyNow(s,'fieldConstraintTheory').bought,true);updateProgression(s);
 assert.equal(isBuildingUnlocked('anchorFreightStation',s),true);assert.deepEqual(s.stageThree,{coreActivated:true});
 assert.equal(Object.hasOwn(s.arpaBuildings,'remoteAnchor'),false);assert.deepEqual(s.story.read,[]);
});

test('freight funds whole units after relays and charges maintenance once across step lengths',()=>{
 for(const dt of [.2,1,3]){
  const s=complete();s.buildings.constraintArray=4;s.buildings.shortRangeRelay=1;s.buildings.anchorFreightStation=2;
  Object.assign(s.resources,{energy:225*dt,e710:1*dt});const before=clone(s);const preview=calculateSupportPreview(s,dt);const result=calculateProduction(s,dt);
  assert.equal(preview.stageThree.freight,1);assert.equal(preview.stageThree.used,4);assert.equal(preview.stageThree.available,4);assert.equal(result.inputUnits.anchorFreightStation,1);near(result.rates.energy,-225);near(result.rates.e710,-1);assert.deepEqual(s,before);
  s.resources.energy=224*dt;assert.equal(calculateSupportPreview(s,dt).stageThree.freight,0);
  s.stoppedBuildings.constraintArray=4;assert.equal(calculateSupportPreview(s,dt).stageThree.freight,0);
 }
});

test('freight no longer boosts any mining output and breakdown still matches settlement',()=>{
 const s=complete();s.buildings.constraintArray=4;s.buildings.anchorFreightStation=2;
 s.buildings.moonBase=2;s.buildings.iridiumMine=s.buildings.helium3Mine=1;
 s.buildings.asrielSpaceport=1;s.buildings.asrielResidence=s.buildings.asrielMine=s.buildings.ecologicalDome=1;s.workers.asrielResidence=1;s.population=1;
 for(const id of ['talosMoonMiningStation','iridiumMiningShip','ironMiningShip','e710MiningShip','oilExtractor','atmosphericCollector'] as const)s.buildings[id]=1;
 funds(s);const before=clone(s);const on=calculateProduction(s);assert.equal(on.inputUnits.anchorFreightStation,2);assert.deepEqual(s,before);
 const offState=clone(s);offState.stoppedBuildings.anchorFreightStation=2;const off=calculateProduction(offState);
 for(const r of ['iridium','copper','titanium','neutron','iron','e710'] as ResourceId[]){
  const a=calculateResourceBreakdown(r,s,on),b=calculateResourceBreakdown(r,offState,off);near(a.income,b.income);near(a.net,on.rates[r]);near(a.expense,b.expense);
 }
 const heliumOn=calculateResourceBreakdown('helium3',s,on),heliumOff=calculateResourceBreakdown('helium3',offState,off);
 for(const row of heliumOn.entries.filter(row=>row.kind==='income')){const baseline=heliumOff.entries.find(other=>other.id===row.id)!;near(row.value,baseline.value);}
 near(heliumOn.net,on.rates.helium3);
 for(const r of ['oil','food'] as ResourceId[]){near(calculateResourceBreakdown(r,s,on).income,calculateResourceBreakdown(r,offState,off).income);}
 near(on.rates.energy-off.rates.energy,-30);
});

test('missing freight additions and malformed facility counts are rejected immutably',()=>{
 const raw:any=clone(complete());for(const field of ['buildings','workers','stoppedBuildings'])delete raw[field].anchorFreightStation;
 const before=clone(raw);assert.throws(()=>validateCurrentSave(raw,context));assert.deepEqual(raw,before);
 for(const field of ['buildings','workers','stoppedBuildings']){const bad:any=clone(complete());bad[field].anchorFreightStation=null;assert.throws(()=>validateCurrentSave(bad,context));}
});

test('remote stories survive ordinary resets while new-run remote progress clears',()=>{
 const s=complete();s.tech.push('nuclearProgram','dimensionBeaconDeployment');s.buildings.anchorFreightStation=s.buildings.civilianRouteStation=1;updateProgression(s);
 s.nuclearProgress=100;s.buildings.interstellarDock=1;for(const id of Object.keys(SHIP_COMPONENTS) as ShipComponentId[])s.shipComponents[id]=true;
 for(const next of [resetRunState(s,'soft',60,0)!.next,launchNuclearPrestige(s,60,0)!.next,launchEscapePrestige(s,60,0)!.next]){
  assert.deepEqual(next.stageThree,{coreActivated:false});assert.ok(next.story.unlocked.includes('remoteAnchor'));assert.ok(next.story.unlocked.includes('anomalyTopology'));assert.equal(Object.hasOwn(next.arpaBuildings,'remoteAnchor'),false);
 }
 assert.deepEqual(resetRunState(s,'hard',60,0)!.next.story,{unlocked:[],read:[]});
});
