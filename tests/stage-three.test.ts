import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { researchTechnologyNow, buyBuildingNow } from '../src/simulation/purchases';
import { investInProject, isProjectUnlocked } from '../src/simulation/projects';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { calculateProduction } from '../src/simulation/production';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { advanceGameTick } from '../src/simulation/tick';
import { updateProgression } from '../src/simulation/progression';
import { isTechnologyUnlocked } from '../src/simulation/unlocks';
import { calculateStageThreeSupport } from '../src/simulation/stage-three-support';
import { STAGE_THREE_EXPERIMENTS, isEarlyStageThree, isHyperspaceUnlocked, runStageThreeExperiment, stageThreeExperimentAvailable, updateStageThreeProgress } from '../src/simulation/stage-three';
import { resetRunState, launchEscapePrestige } from '../src/simulation/prestige';
import { SHIP_COMPONENTS } from '../src/simulation/spaceship';
import type { GameState, ShipComponentId } from '../src/types/state';
import type { TechnologyId } from '../src/types/technologies';
const fresh = () => createInitialState(CONFIG.version, 60, 0);
const clone = <T>(x:T):T => JSON.parse(JSON.stringify(x));
const close = (a:number,b:number) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
const context = { now: 0, eventInterval: 60, housingCapacity: () => 1000, clampResources: () => {} };
function tick(s:GameState, dt=1) { advanceGameTick(s,dt,{ happiness:()=>100, capacity:()=>1000, event:()=>{s.eventIn=60;},projects:()=>{},purchases:()=>{},unlocks:()=>{updateProgression(s);} }); }
const flags = { coreActivated:false, probeCompleted:false, responseObserved:false, fieldStabilized:false, signalCompleted:false, transferCompleted:false, remoteLinked:false };
function stageState() { const s=fresh(); Object.keys(s.stageThree).forEach(k => { s.stageThree[k as keyof typeof flags]=true; }); s.tech.push('fieldConstraintTheory','dualEndCoupling'); return s; }

test('stage three defaults false and never infers actual AI activation from old construction alone',()=>{
  const s=fresh(); assert.deepEqual(s.stageThree,flags);
  const old:any=clone(s); delete old.stageThree;
  const restored=validateCurrentSave(old,context); assert.deepEqual(restored.stageThree,flags); assert.ok(!Object.hasOwn(old,'stageThree'));
  for(const bad of [null,{}, {...flags, coreActivated:1}]) { const raw:any=clone(s); raw.stageThree=bad; assert.throws(()=>validateCurrentSave(raw,context)); }
  const built=fresh(); built.buildings.aiSupercore=100; built.resources.helium3=100;
  calculateProduction(built); calculateSupportPreview(built); updateProgression(built);
  assert.equal(built.stageThree.coreActivated,false);
});

test('only committed fully fueled enabled AI ticks activate third stage, not previews or paused/starved cores',()=>{
  for(const kind of ['partial','stopped','starved','paused'] as const) {
    const s=fresh(); s.buildings.aiSupercore=kind==='partial'?99:100; s.resources.helium3=kind==='starved'?24.9:100;
    if(kind==='stopped')s.stoppedBuildings.aiSupercore=1;
    if(kind==='paused')s.settings.paused=true;
    tick(s); assert.equal(s.stageThree.coreActivated,false,kind);
  }
  const s=fresh(); s.buildings.aiSupercore=100; s.resources.helium3=25;
  const before=clone(s); calculateSupportPreview(s); calculateProduction(s); assert.deepEqual(s,before);
  tick(s); assert.equal(s.stageThree.coreActivated,true); close(s.resources.helium3,0);
  const stories=[...s.story.unlocked]; tick(s); assert.deepEqual(s.story.unlocked,stories);
});

test('third stage research and one-shot experiments follow actual event and engineering gates',()=>{
  const s=fresh(); s.tech.push('artificialIntelligenceII');
  assert.equal(isTechnologyUnlocked('globalObservationCalibration',s),false);
  s.stageThree.coreActivated=true; assert.equal(isTechnologyUnlocked('globalObservationCalibration',s),true);
  s.tech.push('globalObservationCalibration'); assert.equal(isTechnologyUnlocked('anomalyMapping',s),false);
  s.arpaBuildings.deepSpaceInterferometer=1; assert.equal(isTechnologyUnlocked('anomalyMapping',s),true);
  s.tech.push('anomalyMapping'); assert.equal(stageThreeExperimentAvailable(s,'probe'),true);
  assert.equal(isTechnologyUnlocked('anomalyResponse',s),false);
  s.resources.helium3=20000; s.resources.alloy=5000;
  assert.equal(runStageThreeExperiment(s,'probe'),true); close(s.resources.helium3,0);close(s.resources.alloy,0);
  const after=clone(s); assert.equal(runStageThreeExperiment(s,'probe'),false);assert.deepEqual(s,after);
  assert.equal(isTechnologyUnlocked('anomalyResponse',s),true);s.tech.push('anomalyResponse');
  updateStageThreeProgress(s);assert.equal(s.stageThree.responseObserved,false);
  s.arpaBuildings.deepSpaceLab=1; updateStageThreeProgress(s);assert.equal(s.stageThree.responseObserved,true);
  assert.equal(isTechnologyUnlocked('fieldConstraintTheory',s),true);s.tech.push('fieldConstraintTheory');
  assert.equal(isTechnologyUnlocked('dualEndCoupling',s),false);
  s.buildings.constraintArray=1;s.resources.energy=50;s.resources.e710=.25;
  calculateProduction(s);assert.equal(s.stageThree.fieldStabilized,false);tick(s);
  assert.equal(s.stageThree.fieldStabilized,true);assert.equal(isTechnologyUnlocked('dualEndCoupling',s),true);
  s.tech.push('dualEndCoupling');assert.equal(isTechnologyUnlocked('finiteAperture',s),false);
});

test('constraint arrays and relays fund full units with exact once-only upkeep and pure support previews',()=>{
  for(const dt of [.2,1,3]) {
    const s=stageState();s.buildings.constraintArray=2;s.buildings.shortRangeRelay=3;s.resources.energy=120*dt;s.resources.e710=.5*dt;
    const before=clone(s);const preview=calculateSupportPreview(s,dt);const p=calculateProduction(s,dt);
    assert.deepEqual(preview.stageThree,{arrays:2,relays:2,freight:0,civilian:0,capacity:4,used:4,available:0,ports:0,iceShips:0,asteroidBases:0,asteroidCapacity:0,asteroidUsed:0,asteroidAvailable:0,repeaters:0,hydrogenPlants:0});
    assert.equal(p.inputUnits.constraintArray,2);assert.equal(p.inputUnits.shortRangeRelay,2);
    close(p.rates.energy,-120);close(p.rates.e710,-.5);assert.equal(p.asriel.capacity,4);
    assert.deepEqual(s,before);
    s.resources.energy=49.9*dt;assert.equal(calculateSupportPreview(s,dt).stageThree.arrays,0);
    s.resources.energy=120*dt;s.resources.e710=.2499*dt;assert.equal(calculateSupportPreview(s,dt).stageThree.arrays,0);
    s.resources.e710=.5*dt;s.stoppedBuildings.constraintArray=1;s.stoppedBuildings.shortRangeRelay=2;
    assert.deepEqual(calculateSupportPreview(s,dt).stageThree,{arrays:1,relays:1,freight:0,civilian:0,capacity:2,used:2,available:0,ports:0,iceShips:0,asteroidBases:0,asteroidCapacity:0,asteroidUsed:0,asteroidAvailable:0,repeaters:0,hydrogenPlants:0});
  }
});

test('original lunar and Asriel support maintenance remains ahead of new experimental facilities',()=>{
  const s=stageState();s.buildings.moonBase=1;s.buildings.asrielSpaceport=1;s.buildings.asrielControlTower=1;s.buildings.constraintArray=1;
  Object.assign(s.resources,{oil:10,food:100,helium3:100,energy:50.9,e710:1});
  const p=calculateProduction(s);assert.equal(p.moon.baseUnits,1);assert.equal(p.asriel.ports,1);assert.equal(p.asriel.towers,1);assert.equal(p.inputUnits.constraintArray||0,0);
  s.resources.energy=61;assert.equal(calculateStageThreeSupport(s).arrays,1);
});

test('all hyperspace experiments have zero stability requirements and exact rebalanced material costs',()=>{
  for (const experiment of Object.values(STAGE_THREE_EXPERIMENTS)) assert.equal(experiment.stability,0);
  assert.deepEqual(STAGE_THREE_EXPERIMENTS.signal.cost,{energy:4000,e710:15,nanotubes:2500});
  assert.deepEqual(STAGE_THREE_EXPERIMENTS.transfer.cost,{energy:10000,metal:2000,alloy:2000,e710:50});
  assert.deepEqual(STAGE_THREE_EXPERIMENTS.remote.cost,{energy:16000,e710:100,helium3:20000,nanotubes:6000});
  assert.deepEqual(STAGE_THREE_EXPERIMENTS.probe.cost,{helium3:20000,alloy:5000});
  assert.deepEqual(Object.keys(STAGE_THREE_EXPERIMENTS).sort(), ['probe','remote','signal','transfer']);
});

test('signal and transfer use atomic material costs without operational stability or maintenance reserves',()=>{
  const s=stageState();s.stageThree.signalCompleted=false;s.stageThree.transferCompleted=false;s.buildings.constraintArray=0;s.buildings.shortRangeRelay=3;
  Object.assign(s.resources,{energy:3999,e710:15,nanotubes:2500,metal:2000,alloy:2000});
  let before=clone(s);assert.equal(runStageThreeExperiment(s,'signal'),false);assert.deepEqual(s,before,'insufficient material is atomic');
  s.resources.energy=4000;assert.equal(runStageThreeExperiment(s,'signal'),true);assert.equal(s.stageThree.signalCompleted,true);close(s.resources.energy,0);close(s.resources.e710,0);close(s.resources.nanotubes,0);
  assert.equal(isTechnologyUnlocked('finiteAperture',s),true);s.tech.push('finiteAperture');
  Object.assign(s.resources,{energy:10000,e710:50});s.buildings.constraintArray=3;s.stoppedBuildings.constraintArray=3;
  assert.equal(runStageThreeExperiment(s,'transfer'),true);assert.equal(s.stageThree.transferCompleted,true);close(s.resources.energy,0);close(s.resources.e710,0);close(s.resources.metal,0);close(s.resources.alloy,0);
  before=clone(s);assert.equal(runStageThreeExperiment(s,'transfer'),false);assert.deepEqual(s,before);
  assert.deepEqual(s.story.read,[],'experiments have no story-reading requirement');
});

test('normal resets clear third-stage running progress while preserving earned stories and ESS escape',()=>{
  const s=stageState();updateProgression(s);const archived=[...s.story.unlocked];
  const soft=resetRunState(s,'soft',60,0)!.next;assert.deepEqual(soft.stageThree,flags);assert.deepEqual(soft.story.unlocked,archived);
  s.buildings.interstellarDock=1;for(const id of Object.keys(SHIP_COMPONENTS) as ShipComponentId[])s.shipComponents[id]=true;
  const escape=launchEscapePrestige(s,60,0);assert.ok(escape);assert.deepEqual(escape.next.stageThree,flags);assert.equal(escape.next.prestige.escapeResets,1);
  for(const id of archived)assert.ok(escape.next.story.unlocked.includes(id));
  assert.deepEqual(resetRunState(s,'hard',60,0)!.next.story,{unlocked:[],read:[]});
});

test('complete third stage saves round trip immutably and reject incoherent flags and unsupported technology',()=>{
  const s=fresh(); s.tech=Object.keys(TECHNOLOGIES).filter(id=>!['spaceControlTower','hydrogenRecovery','icebreakingPlan','higherDimensionalStorage','overclocking13','superMetal','grapheneProcessing','nanoAlloy','virtualReality','virtualTraining','virtualEntertainment','aerogel','plasmaResearch','plasmaMining','energyShield','stellarForge','penroseTheory','massEjector','gravityConversion','stabilizeBlackHole','exoticRunaway'].includes(id)) as TechnologyId[];
  s.prestige.nuclearResets=1;
  s.asrielMissionCompleted=s.kerberosMissionCompleted=s.solarMissionCompleted=s.talosMissionCompleted=s.talosMoonMissionCompleted=s.asteroidBeltMissionCompleted=s.misenMissionCompleted=true;
  s.arpaBuildings.rocketPlatform=s.arpaBuildings.monument=s.arpaBuildings.geneSequencing=s.arpaBuildings.deepSpaceInterferometer=s.arpaBuildings.deepSpaceLab=s.arpaBuildings.remoteAnchor=1;s.arpaBuildings.arpaResearchInstitute=2;
  for(const key of Object.keys(flags) as (keyof typeof flags)[])s.stageThree[key]=true;
  s.buildings.aiSupercore=100;s.buildings.constraintArray=2;s.buildings.shortRangeRelay=1;
  const raw=clone(s), before=clone(raw);const restored=validateCurrentSave(raw,context);
  assert.deepEqual(raw,before);assert.deepEqual(restored.stageThree,s.stageThree);
  assert.deepEqual(validateCurrentSave(clone(restored),context).stageThree,s.stageThree);
  for(const key of ['coreActivated','probeCompleted','responseObserved','fieldStabilized','signalCompleted'] as const){ const bad=clone(s);bad.stageThree[key]=false;assert.throws(()=>validateCurrentSave(bad,context),key); }
  const legacy:any=clone(fresh());delete legacy.stageThree;assert.deepEqual(validateCurrentSave(legacy,context).stageThree,flags);
});

test('complete third stage chain uses real research project funding construction and experiments without reading or RNG',()=>{
  const s=fresh(); const newTech=['globalObservationCalibration','anomalyMapping','anomalyResponse','fieldConstraintTheory','dualEndCoupling','finiteAperture','anomalyTopology','dimensionBeaconDeployment','accessPointBeacon','hydrogenRecovery','icebreakingPlan','hyperspaceMiningSurvey','gasCloudAccretion','highTechFarmPlatform','fusionPower','largeMiningShips','dimensionPioneer','highTechFactory','higherDimensionalStorage','e710ResearchStation','ripperOverclock','overclocking13','superMetal','grapheneProcessing','nanoAlloy','virtualReality','virtualTraining','virtualEntertainment','aerogel','plasmaResearch','plasmaMining','energyShield','stellarForge','penroseTheory','massEjector','gravityConversion','stabilizeBlackHole','exoticRunaway'];
  s.tech=Object.keys(TECHNOLOGIES).filter(id=>id!=='spaceControlTower'&&!newTech.includes(id)) as TechnologyId[];
  s.prestige.nuclearResets=1;s.asrielMissionCompleted=s.kerberosMissionCompleted=s.solarMissionCompleted=s.talosMissionCompleted=s.talosMoonMissionCompleted=s.asteroidBeltMissionCompleted=s.misenMissionCompleted=true;
  s.arpaBuildings.rocketPlatform=s.arpaBuildings.monument=s.arpaBuildings.geneSequencing=1;s.arpaBuildings.arpaResearchInstitute=2;
  s.buildings.aiSupercore=100;
  const fund=()=>{for(const r of Object.keys(s.resources) as (keyof typeof s.resources)[])s.resources[r]=1e9;};
  const valid=()=>assert.deepEqual(validateCurrentSave(clone(s),context).stageThree,s.stageThree);
  const research=(id:TechnologyId)=>{fund();assert.equal(researchTechnologyNow(s,id).bought,true,id);updateProgression(s);valid();};
  const project=(id:'deepSpaceInterferometer'|'deepSpaceLab')=>{fund();assert.equal(isProjectUnlocked(id,s),true);assert.equal(investInProject(id,s,100,()=>{throw Error('unexpected RNG');}),100);assert.equal(s.arpaBuildings[id],1);updateProgression(s);valid();};
  valid();assert.equal(isProjectUnlocked('deepSpaceInterferometer',s),false);fund();tick(s);valid();
  research('globalObservationCalibration');project('deepSpaceInterferometer');research('anomalyMapping');
  fund();assert.equal(runStageThreeExperiment(s,'probe'),true);valid();research('anomalyResponse');project('deepSpaceLab');research('fieldConstraintTheory');
  fund();assert.equal(buyBuildingNow(s,'constraintArray',0).bought,true);assert.equal(buyBuildingNow(s,'constraintArray',0).bought,true);s.stoppedBuildings.constraintArray=0;
  tick(s);valid();research('dualEndCoupling');fund();assert.equal(runStageThreeExperiment(s,'signal'),true);valid();
  research('finiteAperture');fund();assert.equal(runStageThreeExperiment(s,'transfer'),true);valid();
  assert.deepEqual(s.stageThree,Object.fromEntries(Object.keys(flags).map(id=>[id,id !== 'remoteLinked'])));assert.deepEqual(s.story.read,[]);
  for(const id of ['coreCalibration','anomalyConfirmed','twoMaps','anomalyResponse','controlledField','firstSignal','firstTransfer'] as const)assert.ok(s.story.unlocked.includes(id),id);
});

test('all new technology prerequisite chains are present in the registry',()=>{
  for(const id of ['globalObservationCalibration','anomalyMapping','anomalyResponse','fieldConstraintTheory','dualEndCoupling','finiteAperture'] as TechnologyId[]) {
    assert.ok(TECHNOLOGIES[id]);for(const pre of TECHNOLOGIES[id].pre)assert.ok(TECHNOLOGIES[pre]);
  }
});

test('超空间 view unlocks only after ARPA 深空实验平台; earlier stage three lives on ARPA-进度', () => {
  const s = fresh();
  assert.equal(isHyperspaceUnlocked(s), false);
  assert.equal(isEarlyStageThree(s), false, 'inactive stage three shows nowhere');
  s.stageThree.coreActivated = true;
  assert.equal(isHyperspaceUnlocked(s), false);
  assert.equal(isEarlyStageThree(s), true);
  s.arpaBuildings.deepSpaceLab = 1;
  assert.equal(isHyperspaceUnlocked(s), true);
  assert.equal(isEarlyStageThree(s), false);
});
