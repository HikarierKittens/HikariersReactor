import './retired-anomaly.test';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TECHNOLOGIES } from '../src/data/technologies';
import { ARPA_PROJECTS } from '../src/data/projects';
import * as stageThree from '../src/simulation/stage-three';
import { validateCurrentSave } from '../src/state/validate-save';
import { resetRunState, launchNuclearPrestige } from '../src/simulation/prestige';
import { updateProgression } from '../src/simulation/progression';
import { requestPurchaseModule } from '../src/simulation/purchases';
import { createMilestoneState } from './fixtures/milestones';
const clone = <T>(value:T):T => JSON.parse(JSON.stringify(value));
const context={now:0,eventInterval:60,housingCapacity:()=>1000,clampResources:()=>{}};
const retiredTech=['dualEndCoupling','finiteAperture','anomalyTopology','anomalyResponse','interstellarScoutPlan','interstellarCalibration'];
const retiredProjects=['remoteAnchor','deepSpaceInterferometer','deepSpaceLab','interstellarScout','extrasolarAnchor'];
const retiredFlags=['fieldStabilized','signalCompleted','transferCompleted','remoteLinked','probeCompleted','responseObserved','scoutArrived','interstellarSignal','interstellarCargo'];
const complete=()=>createMilestoneState('postBeacon',{buildings:{constraintArray:3,shortRangeRelay:1,anchorFreightStation:1,civilianRouteStation:1}});
function legacy(){
 const raw:any=clone(complete());raw.tech.push(...retiredTech);raw.legacyTechPrerequisites=[...retiredTech];
 for(const id of retiredFlags)raw.stageThree[id]=true;
 for(const id of retiredProjects){raw.arpaBuildings[id]=1;raw.arpaProgress[id]=40;raw.arpaResourceProgress[id]={cash:234,e710:3};}
 raw.queue=[...retiredTech.map((id,i)=>({uid:i+1,kind:'tech',id})),...retiredProjects.map((id,i)=>({uid:i+20,kind:'arpa',id})),{uid:99,kind:'build',id:'nest'}];
 Object.assign(raw.resources,{water:71,e710:42,helium3:1000,cash:123456});raw.prestige.particles=123;
 updateProgression(raw);return raw;
}
test('retired experiment APIs and registries are absent and commands reject atomically',()=>{
 const s=complete();
 for(const id of ['STAGE_THREE_EXPERIMENTS','runStageThreeExperiment','stageThreeExperimentAvailable'])assert.equal(Object.hasOwn(stageThree,id),false,id);
 for(const id of retiredTech){assert.equal(Object.hasOwn(TECHNOLOGIES,id),false);const before=clone(s);assert.equal(requestPurchaseModule(s,'tech',id,0,true).status,'rejected');assert.deepEqual(s,before);}
 for(const id of retiredProjects){assert.equal(Object.hasOwn(ARPA_PROJECTS,id),false);const before=clone(s);assert.equal(requestPurchaseModule(s,'arpa',id,0,true).status,'rejected');assert.deepEqual(s,before);}
});
test('retired payload rejects immutably instead of being cleaned up',()=>{
 const raw=legacy(),before=clone(raw);assert.throws(()=>validateCurrentSave(raw,context));assert.deepEqual(raw,before);
});
test('migration rejects malformed retained state unknown content and wrong-kind retired queues',()=>{
 for(const change of [(s:any)=>s.stageThree.unknownFutureFlag=true,(s:any)=>s.stageThree.coreActivated=1,(s:any)=>s.stageThree=null,(s:any)=>s.tech.push('unknownFutureTech'),(s:any)=>s.arpaBuildings.unknownFutureProject=1,(s:any)=>s.queue=[{uid:1,kind:'build',id:'remoteAnchor'}],(s:any)=>s.queue=[{uid:1,kind:'arpa',id:'dualEndCoupling'}]]){
  const raw=legacy();change(raw);const before=clone(raw);assert.throws(()=>validateCurrentSave(raw,context));assert.deepEqual(raw,before);
 }
});
test('core activation needs a constructed core but field services need no historical array operation',()=>{
 const full=complete();assert.doesNotThrow(()=>validateCurrentSave(full,context));
 for(const count of [0,99]){const s=clone(full);s.buildings.aiSupercore=count;assert.throws(()=>validateCurrentSave(s,context));}
 full.buildings.constraintArray=0;full.stoppedBuildings.aiSupercore=1;full.resources.helium3=full.resources.energy=full.resources.e710=0;
 assert.deepEqual(validateCurrentSave(full,context).stageThree,{coreActivated:true});
 const noTheory=clone(full);noTheory.tech=noTheory.tech.filter(id=>id!=='fieldConstraintTheory');assert.throws(()=>validateCurrentSave(noTheory,context));
});
test('reset keeps archived stories without retaining retired flags or current activation',()=>{
 const s=validateCurrentSave(complete(),context);updateProgression(s);s.story.read=[...s.story.unlocked];
 const soft=resetRunState(s,'soft',60,0)!.next;assert.deepEqual(soft.stageThree,{coreActivated:false});assert.deepEqual(soft.story,s.story);
 assert.deepEqual(validateCurrentSave(soft,context).stageThree,soft.stageThree);
 s.tech.push('nuclearProgram');s.nuclearProgress=100;const nuclear=launchNuclearPrestige(s,60,0)!.next;
 assert.deepEqual(nuclear.stageThree,{coreActivated:false});assert.ok(nuclear.story.unlocked.includes('coreCalibration'));
});
