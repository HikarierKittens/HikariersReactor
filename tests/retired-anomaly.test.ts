import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TECHNOLOGIES } from '../src/data/technologies';
import { ARPA_PROJECTS } from '../src/data/projects';
import { createMilestoneState } from './fixtures/milestones';
import { validateCurrentSave } from '../src/state/validate-save';
import { isTechnologyUnlocked } from '../src/simulation/unlocks';
import { isProjectUnlocked } from '../src/simulation/projects';
import { requestPurchaseModule } from '../src/simulation/purchases';
import { updateProgression } from '../src/simulation/progression';
const clone = <T>(value:T):T => JSON.parse(JSON.stringify(value));
const context = { now:0, eventInterval:60, housingCapacity:()=>1000, clampResources:()=>{} };
const retiredProjects = ['deepSpaceInterferometer','deepSpaceLab','remoteAnchor'];
const retiredTech = ['anomalyResponse','dualEndCoupling','finiteAperture','anomalyTopology'];
const retiredFlags = ['probeCompleted','responseObserved','fieldStabilized','signalCompleted','transferCompleted','remoteLinked'];
function legacy() {
  const state=createMilestoneState('beacon');
  Object.assign(state.resources,{cash:123456,knowledge:23456,helium3:789,e710:23});
  updateProgression(state);state.story.read=[...state.story.unlocked];
  const raw:any=clone(state);
  raw.tech.push(...retiredTech);raw.legacyTechPrerequisites=[...retiredTech];
  for(const id of retiredFlags)raw.stageThree[id]=true;
  for(const id of retiredProjects){raw.arpaBuildings[id]=1;raw.arpaProgress[id]=35;raw.arpaResourceProgress[id]={cash:45,helium3:20};}
  raw.queue=[...retiredTech.map((id,i)=>({uid:i+1,kind:'tech',id})),...retiredProjects.map((id,i)=>({uid:i+10,kind:'arpa',id})),{uid:99,kind:'build',id:'nest'}];
  return raw;
}
test('retired anomaly registries and purchase commands disappear, and experiment APIs are absent',()=>{
  const s=createMilestoneState('beacon');
  assert.equal(Object.hasOwn(TECHNOLOGIES,'anomalyResponse'),false);
  assert.equal(isTechnologyUnlocked('anomalyResponse',s),false);
  for(const id of retiredProjects){
    assert.equal(Object.hasOwn(ARPA_PROJECTS,id),false);assert.equal(isProjectUnlocked(id,s),false);
    const before=clone(s);assert.equal(requestPurchaseModule(s,'arpa',id,0,true).status,'rejected');assert.deepEqual(s,before);
  }
});
test('retired payload rejects immutably instead of being cleaned up',()=>{
 const raw=legacy(),before=clone(raw);assert.throws(()=>validateCurrentSave(raw,context));assert.deepEqual(raw,before);
});
test('anomaly retirement keeps unknown ids and wrong-kind queues invalid',()=>{
  for(const entry of [{uid:1,kind:'build',id:'deepSpaceLab'},{uid:1,kind:'tech',id:'deepSpaceInterferometer'},{uid:1,kind:'arpa',id:'anomalyResponse'},{uid:1,kind:'arpa',id:'unknownFutureProject'}]){
    const raw=legacy();raw.queue=[entry];const before=clone(raw);assert.throws(()=>validateCurrentSave(raw,context));assert.deepEqual(raw,before);
  }
  const raw=legacy();raw.stageThree.unknownFutureFlag=true;assert.throws(()=>validateCurrentSave(raw,context));
});
