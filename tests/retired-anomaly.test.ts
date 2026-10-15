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
test('old anomaly saves retire only removed records and queues without losing later progress or archived stories',()=>{
  const raw=legacy(),before=clone(raw),restored=validateCurrentSave(raw,context);
  assert.deepEqual(raw,before,'migration cannot mutate source');
  for(const id of retiredTech){assert.equal((restored.tech as string[]).includes(id),false);assert.equal((restored.legacyTechPrerequisites as string[]|undefined)?.includes(id)??false,false);}
  assert.equal((restored.legacyTechPrerequisites as string[]|undefined)?.includes('anomalyResponse')??false,false);
  for(const id of retiredProjects)for(const record of [restored.arpaBuildings,restored.arpaProgress,restored.arpaResourceProgress])assert.equal(Object.hasOwn(record??{},id),false);
  for(const id of retiredFlags)assert.equal(Object.hasOwn(restored.stageThree,id),false);
  assert.deepEqual(restored.queue,[{uid:99,kind:'build',id:'nest'}]);
  assert.deepEqual(restored.resources,raw.resources,'no refunds or resource loss');
  assert.deepEqual(restored.prestige,raw.prestige);assert.deepEqual(restored.buildings,raw.buildings);
  assert.deepEqual(restored.stageThree,createMilestoneState('beacon').stageThree);
  assert.equal(Object.hasOwn(restored.arpaBuildings,'remoteAnchor'),false);assert.ok(restored.tech.includes('dimensionBeaconDeployment'));
  assert.deepEqual(restored.story,raw.story);assert.ok(restored.story.unlocked.includes('anomalyResponse'));
  assert.deepEqual(validateCurrentSave(clone(restored),context),restored,'migration is idempotent');
});
test('anomaly retirement keeps unknown ids and wrong-kind queues invalid',()=>{
  for(const entry of [{uid:1,kind:'build',id:'deepSpaceLab'},{uid:1,kind:'tech',id:'deepSpaceInterferometer'},{uid:1,kind:'arpa',id:'anomalyResponse'},{uid:1,kind:'arpa',id:'unknownFutureProject'}]){
    const raw=legacy();raw.queue=[entry];const before=clone(raw);assert.throws(()=>validateCurrentSave(raw,context));assert.deepEqual(raw,before);
  }
  const raw=legacy();raw.stageThree.unknownFutureFlag=true;assert.throws(()=>validateCurrentSave(raw,context));
});
