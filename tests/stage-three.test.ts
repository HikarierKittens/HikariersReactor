import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { researchTechnologyNow, buyBuildingNow } from '../src/simulation/purchases';

import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { calculateProduction } from '../src/simulation/production';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { advanceGameTick } from '../src/simulation/tick';
import { updateProgression } from '../src/simulation/progression';
import { isBuildingUnlocked, isTechnologyUnlocked } from '../src/simulation/unlocks';
import { calculateStageThreeSupport } from '../src/simulation/stage-three-support';
import { isEarlyStageThree, isHyperspaceUnlocked } from '../src/simulation/stage-three';
import { resetRunState, launchEscapePrestige } from '../src/simulation/prestige';
import { SHIP_COMPONENTS } from '../src/simulation/spaceship';
import { supplyPower } from './support/power';
import type { GameState, ShipComponentId } from '../src/types/state';
import type { TechnologyId } from '../src/types/technologies';
const fresh = () => createInitialState(CONFIG.version, 60, 0);
const clone = <T>(x:T):T => JSON.parse(JSON.stringify(x));
const close = (a:number,b:number) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
const context = { now: 0, eventInterval: 60, housingCapacity: () => 1000, clampResources: () => {} };
function tick(s:GameState, dt=1) { advanceGameTick(s,dt,{ happiness:()=>100, capacity:()=>1000, event:()=>{s.eventIn=60;},projects:()=>{},purchases:()=>{},unlocks:()=>{updateProgression(s);} }); }
const flags = { coreActivated:false };
function stageState() { const s=fresh(); Object.keys(s.stageThree).forEach(k => { s.stageThree[k as keyof typeof flags]=true; }); s.tech.push('fieldConstraintTheory'); return s; }

test('stage three defaults false and never infers actual AI activation from old construction alone',()=>{
  const s=fresh(); assert.deepEqual(s.stageThree,flags);
  const old:any=clone(s); delete old.stageThree;
  assert.throws(()=>validateCurrentSave(old,context)); assert.ok(!Object.hasOwn(old,'stageThree'));
  for(const bad of [null,{}, {...flags, coreActivated:1}]) { const raw:any=clone(s); raw.stageThree=bad; assert.throws(()=>validateCurrentSave(raw,context)); }
  const built=fresh(); built.buildings.aiSupercore=1; built.resources.helium3=100;
  calculateProduction(built); calculateSupportPreview(built); updateProgression(built);
  assert.equal(built.stageThree.coreActivated,false);
});

test('only committed fully fueled enabled AI ticks activate third stage, not previews or paused/starved cores',()=>{
  for(const kind of ['partial','stopped','starved','paused'] as const) {
    // 100 segments was one completed core in schema31; schema32 counts completed units only.
    const s=fresh(); s.buildings.aiSupercore=kind==='partial'?0:1; s.buildings.aiSupercoreSegments=kind==='partial'?99:0; s.resources.helium3=kind==='starved'?24.9:100; supplyPower(s,100);
    if(kind==='stopped')s.stoppedBuildings.aiSupercore=1;
    if(kind==='paused')s.settings.paused=true;
    tick(s); assert.equal(s.stageThree.coreActivated,false,kind);
  }
  const s=fresh(); s.buildings.aiSupercore=1; s.resources.helium3=25; supplyPower(s,100);
  const before=clone(s); calculateSupportPreview(s); calculateProduction(s); assert.deepEqual(s,before);
  tick(s); assert.equal(s.stageThree.coreActivated,true); close(s.resources.helium3,0);
  const stories=[...s.story.unlocked]; tick(s); assert.deepEqual(s.story.unlocked,stories);
});

test('mapping needs only global calibration and field theory needs mapping without an ARPA project',()=>{
  const s=fresh(); s.tech.push('artificialIntelligenceII');
  assert.equal(isTechnologyUnlocked('globalObservationCalibration',s),false);
  s.stageThree.coreActivated=true; assert.equal(isTechnologyUnlocked('globalObservationCalibration',s),true);
  assert.equal(isTechnologyUnlocked('anomalyMapping',s),false);
  assert.equal(isTechnologyUnlocked('fieldConstraintTheory',s),false);
  s.tech.push('globalObservationCalibration');
  assert.equal(isTechnologyUnlocked('anomalyMapping',s),true);
  assert.equal(isTechnologyUnlocked('fieldConstraintTheory',s),false);
  assert.ok(Object.values(s.arpaBuildings).every(count=>count===0));
  s.tech.push('anomalyMapping');
  assert.equal(isHyperspaceUnlocked({tech:s.tech}),true);
  assert.equal(isTechnologyUnlocked('fieldConstraintTheory',s),true);
  assert.deepEqual(TECHNOLOGIES.fieldConstraintTheory.pre,['anomalyMapping']);
  s.tech.push('fieldConstraintTheory');
  for(const id of ['shortRangeRelay','anchorFreightStation','civilianRouteStation'] as const)assert.equal(isBuildingUnlocked(id,s),true,id);
  for(const id of ['accessPointBeacon','dimensionBeaconDeployment'] as const){assert.deepEqual(TECHNOLOGIES[id].pre,['fieldConstraintTheory']);assert.equal(isTechnologyUnlocked(id,s),true);}
});

test('constraint arrays and relays fund full units with exact once-only upkeep and pure support previews',()=>{
  for(const dt of [.2,1,3]) {
    const s=stageState();s.buildings.constraintArray=2;s.buildings.shortRangeRelay=3;supplyPower(s,120);s.resources.e710=.5*dt;
    s.powerActivationOrder=[{id:'constraintArray',count:2},{id:'shortRangeRelay',count:3}];
    const before=clone(s);const preview=calculateSupportPreview(s,dt);const p=calculateProduction(s,dt);
    assert.deepEqual(preview.stageThree,{arrays:2,relays:2,freight:0,civilian:0,capacity:4,used:4,available:0,ports:0,iceShips:0,asteroidBases:0,asteroidCapacity:0,asteroidUsed:0,asteroidAvailable:0,repeaters:0,hydrogenPlants:0});
    assert.equal(p.inputUnits.constraintArray,2);assert.equal(p.inputUnits.shortRangeRelay,2);
    assert.deepEqual(p.power,{generated:120,used:120,available:-10});close(p.rates.energy,-10);assert.equal(p.pool.energy,0,'electricity is a fixed budget, not stored');close(p.rates.e710,-.5);assert.equal(p.asriel.capacity,4);
    assert.deepEqual(s,before);
    supplyPower(s,49.9);assert.equal(calculateSupportPreview(s,dt).stageThree.arrays,0);
    supplyPower(s,120);s.resources.e710=.2499*dt;assert.equal(calculateSupportPreview(s,dt).stageThree.arrays,0);
    s.resources.e710=.5*dt;s.stoppedBuildings.constraintArray=1;s.stoppedBuildings.shortRangeRelay=2;
    assert.deepEqual(calculateSupportPreview(s,dt).stageThree,{arrays:1,relays:1,freight:0,civilian:0,capacity:2,used:2,available:0,ports:0,iceShips:0,asteroidBases:0,asteroidCapacity:0,asteroidUsed:0,asteroidAvailable:0,repeaters:0,hydrogenPlants:0});
  }
});

test('original lunar and Asriel support maintenance remains ahead of new experimental facilities',()=>{
  const s=stageState();s.buildings.moonBase=1;s.buildings.asrielSpaceport=1;s.buildings.asrielControlTower=1;s.buildings.constraintArray=1;
  s.powerActivationOrder=[{id:'moonBase',count:1},{id:'asrielSpaceport',count:1},{id:'asrielControlTower',count:1},{id:'constraintArray',count:1}];
  Object.assign(s.resources,{oil:10,food:100,helium3:100,e710:1});supplyPower(s,50.9);
  const p=calculateProduction(s);assert.equal(p.moon.baseUnits,1);assert.equal(p.asriel.ports,1);assert.equal(p.asriel.towers,1);assert.equal(p.inputUnits.constraintArray||0,0);
  supplyPower(s,61);assert.equal(calculateStageThreeSupport(s).arrays,1);
});

test('field theory directly unlocks services without experiments while stability remains enforced',()=>{
  const s=fresh();
  const ids=['shortRangeRelay','anchorFreightStation','civilianRouteStation'] as const;
  for(const id of ids)assert.equal(isBuildingUnlocked(id,s),false,id);
  s.tech.push('fieldConstraintTheory');Object.assign(s.resources,{e710:100,food:1e6});supplyPower(s,1e6);
  for(const id of ids){assert.equal(isBuildingUnlocked(id,s),true,id);s.buildings[id]=1;}
  const before=clone(s),unsupported=calculateSupportPreview(s);assert.deepEqual(s,before);
  assert.equal(unsupported.stageThree.used,0);assert.equal(unsupported.asriel.capacity,0);
  s.buildings.constraintArray=3;const funded=calculateSupportPreview(s);
  assert.equal(funded.stageThree.relays,1);assert.equal(funded.stageThree.freight,1);assert.equal(funded.stageThree.civilian,1);assert.equal(funded.stageThree.used,6);
  assert.deepEqual(s.stageThree,flags,'operating services requires no activation or experiment history');
});

test('normal resets clear third-stage running progress while preserving earned stories and ESS escape',()=>{
  const s=stageState();updateProgression(s);const archived=[...s.story.unlocked];
  const soft=resetRunState(s,'soft',60,0)!.next;assert.deepEqual(soft.stageThree,flags);assert.deepEqual(soft.story.unlocked,archived);
  s.buildings.interstellarDock=1;for(const id of Object.keys(SHIP_COMPONENTS) as ShipComponentId[])s.shipComponents[id]=true;
  const escape=launchEscapePrestige(s,60,0);assert.ok(escape);assert.deepEqual(escape.next.stageThree,flags);assert.equal(escape.next.prestige.escapeResets,1);
  for(const id of archived)assert.ok(escape.next.story.unlocked.includes(id));
  assert.deepEqual(resetRunState(s,'hard',60,0)!.next.story,{unlocked:[],read:[]});
});

test('complete third stage saves round trip immutably and reject incoherent activation',()=>{
  const s=fresh(); s.tech=Object.keys(TECHNOLOGIES).filter(id=>!['spaceControlTower','hydrogenRecovery','icebreakingPlan','higherDimensionalStorage','ripperOverclock','overclocking13','superMetal','grapheneProcessing','nanoArmor','nanoExoskeleton','advancedConcrete','nanoAlloy','dysonSphere','dysonSphereII','virtualReality','virtualTraining','virtualEntertainment','aerogel','plasmaResearch','plasmaMining','energyShield','stellarForge','hazardousMaterialStorage','aiDataCenter','aiCementWorkshop','advancedAdamantiteProcessing','advancedGrapheneProcessing','penroseTheory','massEjector','gravityConversion','stabilizeBlackHole','exoticRunaway'].includes(id)) as TechnologyId[];
  s.prestige.nuclearResets=1;
  s.asrielMissionCompleted=s.kerberosMissionCompleted=s.solarMissionCompleted=s.talosMissionCompleted=s.talosMoonMissionCompleted=s.asteroidBeltMissionCompleted=s.misenMissionCompleted=true;
  s.arpaBuildings.rocketPlatform=s.arpaBuildings.monument=s.arpaBuildings.geneSequencing=1;s.arpaBuildings.arpaResearchInstitute=2;
  for(const key of Object.keys(flags) as (keyof typeof flags)[])s.stageThree[key]=true;
  s.buildings.aiSupercore=1;s.buildings.constraintArray=2;s.buildings.shortRangeRelay=1;
  const raw=clone(s), before=clone(raw);const restored=validateCurrentSave(raw,context);
  assert.deepEqual(raw,before);assert.deepEqual(restored.stageThree,s.stageThree);
  assert.deepEqual(validateCurrentSave(clone(restored),context).stageThree,s.stageThree);
  for(const key of ['coreActivated'] as const){ const bad=clone(s);bad.stageThree[key]=false;assert.throws(()=>validateCurrentSave(bad,context),key); }
  const legacy:any=clone(fresh());delete legacy.stageThree;assert.throws(()=>validateCurrentSave(legacy,context));
});

test('complete third stage chain uses actual research and construction without experiments or reading',()=>{
  const s=fresh();const chain=['globalObservationCalibration','anomalyMapping','fieldConstraintTheory','accessPointBeacon','dimensionBeaconDeployment'];
  const later=['hydrogenRecovery','icebreakingPlan','hyperspaceMiningSurvey','gasCloudAccretion','highTechFarmPlatform','fusionPower','largeMiningShips','dimensionPioneer','highTechFactory','higherDimensionalStorage','e710ResearchStation','ripperOverclock','overclocking13','superMetal','grapheneProcessing','nanoArmor','nanoExoskeleton','advancedConcrete','nanoAlloy','dysonSphere','dysonSphereII','virtualReality','virtualTraining','virtualEntertainment','aerogel','plasmaResearch','plasmaMining','energyShield','stellarForge','hazardousMaterialStorage','aiDataCenter','aiCementWorkshop','advancedAdamantiteProcessing','advancedGrapheneProcessing','penroseTheory','massEjector','gravityConversion','stabilizeBlackHole','exoticRunaway'];
  s.tech=Object.keys(TECHNOLOGIES).filter(id=>id!=='spaceControlTower'&&!chain.includes(id)&&!later.includes(id)) as TechnologyId[];
  s.prestige.nuclearResets=1;s.asrielMissionCompleted=s.kerberosMissionCompleted=s.solarMissionCompleted=s.talosMissionCompleted=s.talosMoonMissionCompleted=s.asteroidBeltMissionCompleted=s.misenMissionCompleted=true;
  s.arpaBuildings.rocketPlatform=s.arpaBuildings.monument=s.arpaBuildings.geneSequencing=1;s.arpaBuildings.arpaResearchInstitute=2;s.buildings.aiSupercore=1;
  const fund=()=>{for(const r of Object.keys(s.resources) as (keyof typeof s.resources)[])if(r!=='energy')s.resources[r]=1e9;supplyPower(s,1e9);};
  const valid=()=>assert.deepEqual(validateCurrentSave(clone(s),context).stageThree,s.stageThree);
  fund();tick(s);valid();
  for(const id of chain as TechnologyId[]){fund();assert.equal(researchTechnologyNow(s,id).bought,true,id);updateProgression(s);valid();}
  for(const id of ['constraintArray','constraintArray','constraintArray','shortRangeRelay','anchorFreightStation','civilianRouteStation'] as const){fund();assert.equal(buyBuildingNow(s,id,0).bought,true,id);valid();}
  assert.deepEqual(s.stageThree,{coreActivated:true});assert.deepEqual(s.story.read,[]);
  const p=calculateSupportPreview(s);assert.equal(p.stageThree.relays,1);assert.equal(p.stageThree.freight,1);assert.equal(p.stageThree.civilian,1);
});

test('all new technology prerequisite chains are present in the registry',()=>{
  for(const id of ['globalObservationCalibration','anomalyMapping','fieldConstraintTheory','accessPointBeacon','dimensionBeaconDeployment'] as TechnologyId[]) {
    assert.ok(TECHNOLOGIES[id]);for(const pre of TECHNOLOGIES[id].pre)assert.ok(TECHNOLOGIES[pre]);
  }
});

test('hyperspace opens immediately on mapping research, before stabilization or experiments', () => {
  const s = fresh();
  assert.equal(isHyperspaceUnlocked({tech:s.tech}), false);
  assert.equal(isEarlyStageThree(s), false, 'inactive stage three shows nowhere');
  s.stageThree.coreActivated = true;
  assert.equal(isHyperspaceUnlocked(s), false);
  assert.equal(isEarlyStageThree(s), true);
  s.tech.push('anomalyMapping');
  const before=clone(s);
  assert.equal(isHyperspaceUnlocked({tech:s.tech}), true);
  assert.equal(isEarlyStageThree(s), false);
  assert.ok(Object.values(s.arpaBuildings).every(count=>count===0));
  assert.deepEqual(s,before,'view gate queries are pure');
});