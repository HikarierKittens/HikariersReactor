import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { runStageThreeExperiment, stageThreeExperimentAvailable } from '../src/simulation/stage-three';
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
 const s=createMilestoneState('remote',{withoutTech:['anomalyTopology'],stageThreeFlags:['coreActivated','fieldStabilized','signalCompleted','transferCompleted'],buildings:{aiSupercore:100,constraintArray:3},extraArpa:[]});
 s.stoppedBuildings.aiSupercore=1;s.stageThree.remoteLinked=false;delete (s.arpaBuildings as Record<string,number>).remoteAnchor;
 return s;
}
function funds(s:ReturnType<typeof complete>) { for(const id of Object.keys(s.resources) as (keyof typeof s.resources)[])s.resources[id]=1e8; }

test('remote anchor follows actual research project and atomic experiment progression',()=>{
 const s=complete();assert.equal(isTechnologyUnlocked('anomalyTopology',s),true);s.stageThree.transferCompleted=false;assert.equal(isTechnologyUnlocked('anomalyTopology',s),false);s.stageThree.transferCompleted=true;
 assert.equal(stageThreeExperimentAvailable(s,'remote'),false);funds(s);assert.equal(researchTechnologyNow(s,'anomalyTopology').bought,true);updateProgression(s);assert.ok(s.story.unlocked.includes('anomalyTopology'));
 assert.equal(stageThreeExperimentAvailable(s,'remote'),false);assert.equal(investInProject('remoteAnchor',s,100,()=>{throw Error('no RNG');}),100);assert.equal(stageThreeExperimentAvailable(s,'remote'),true);assert.equal(isBuildingUnlocked('anchorFreightStation',s),false);
 Object.assign(s.resources,{energy:15999,e710:100,helium3:20000,nanotubes:6000});let before=clone(s);assert.equal(runStageThreeExperiment(s,'remote'),false);assert.deepEqual(s,before);
 s.buildings.shortRangeRelay=3;s.stoppedBuildings.constraintArray=3;
 s.resources.energy=16000;assert.equal(runStageThreeExperiment(s,'remote'),true);near(s.resources.energy,0);near(s.resources.e710,0);near(s.resources.helium3,0);near(s.resources.nanotubes,0);
 assert.equal(s.stageThree.remoteLinked,true);assert.equal(isBuildingUnlocked('anchorFreightStation',s),true);assert.ok(s.story.unlocked.includes('remoteAnchor'));assert.deepEqual(s.story.read,[]);
 before=clone(s);assert.equal(runStageThreeExperiment(s,'remote'),false);assert.deepEqual(s,before);assert.deepEqual(validateCurrentSave(clone(s),context).stageThree,s.stageThree);
});

test('freight funds whole units after relays and charges maintenance once across step lengths',()=>{
 for(const dt of [.2,1,3]){
  const s=complete();s.tech.push('anomalyTopology');s.stageThree.remoteLinked=true;s.arpaBuildings.remoteAnchor=1;s.buildings.constraintArray=4;s.buildings.shortRangeRelay=1;s.buildings.anchorFreightStation=2;
  Object.assign(s.resources,{energy:225*dt,e710:1*dt});const before=clone(s);const preview=calculateSupportPreview(s,dt);const result=calculateProduction(s,dt);
  assert.equal(preview.stageThree.freight,1);assert.equal(preview.stageThree.used,4);assert.equal(preview.stageThree.available,4);assert.equal(result.inputUnits.anchorFreightStation,1);near(result.rates.energy,-225);near(result.rates.e710,-1);assert.deepEqual(s,before);
  s.resources.energy=224*dt;assert.equal(calculateSupportPreview(s,dt).stageThree.freight,0);
  s.stoppedBuildings.constraintArray=4;assert.equal(calculateSupportPreview(s,dt).stageThree.freight,0);
 }
});

test('freight no longer boosts any mining output and breakdown still matches settlement',()=>{
 const s=complete();s.tech.push('anomalyTopology');s.stageThree.remoteLinked=true;s.arpaBuildings.remoteAnchor=1;s.buildings.constraintArray=4;s.buildings.anchorFreightStation=2;
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

test('older saves default remote additions and malformed flags are rejected immutably',()=>{
 const raw:any=clone(complete());delete raw.stageThree.remoteLinked;delete raw.arpaBuildings.remoteAnchor;delete raw.arpaProgress.remoteAnchor;delete raw.buildings.anchorFreightStation;delete raw.workers.anchorFreightStation;delete raw.stoppedBuildings.anchorFreightStation;
 const before=clone(raw);const restored=validateCurrentSave(raw,context);assert.deepEqual(raw,before);assert.equal(restored.stageThree.remoteLinked,false);assert.equal(restored.arpaBuildings.remoteAnchor,0);assert.equal(restored.buildings.anchorFreightStation,0);
 for(const value of [null,1,'false']){const bad=clone(raw);bad.stageThree.remoteLinked=value;assert.throws(()=>validateCurrentSave(bad,context));}
 const bad=clone(raw);bad.stageThree.remoteLinked=true;assert.throws(()=>validateCurrentSave(bad,context));
 for(const field of ['buildings','workers','stoppedBuildings'] as const){const malformed=clone(raw);malformed[field].anchorFreightStation=null;assert.throws(()=>validateCurrentSave(malformed,context));}
 for(const field of ['arpaBuildings','arpaProgress'] as const){const malformed=clone(raw);malformed[field].remoteAnchor=null;assert.throws(()=>validateCurrentSave(malformed,context));}
});

test('remote stories survive ordinary resets while new-run remote progress clears',()=>{
 const s=complete();s.tech.push('anomalyTopology','nuclearProgram');s.arpaBuildings.remoteAnchor=1;s.stageThree.remoteLinked=true;updateProgression(s);
 s.nuclearProgress=100;s.buildings.interstellarDock=1;for(const id of Object.keys(SHIP_COMPONENTS) as ShipComponentId[])s.shipComponents[id]=true;
 for(const next of [resetRunState(s,'soft',60,0)!.next,launchNuclearPrestige(s,60,0)!.next,launchEscapePrestige(s,60,0)!.next]){
  assert.equal(next.stageThree.remoteLinked,false);assert.ok(next.story.unlocked.includes('remoteAnchor'));assert.ok(next.story.unlocked.includes('anomalyTopology'));assert.equal(next.arpaBuildings.remoteAnchor,0);
 }
 assert.deepEqual(resetRunState(s,'hard',60,0)!.next.story,{unlocked:[],read:[]});
});
