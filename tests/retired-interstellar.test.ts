import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { ARPA_PROJECTS } from '../src/data/projects';
import { STORY_CHAPTERS } from '../src/data/story';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { STAGE_THREE_EXPERIMENTS, runStageThreeExperiment, stageThreeExperimentAvailable, type StageThreeExperimentId } from '../src/simulation/stage-three';
import { isBuildingUnlocked, isTechnologyUnlocked } from '../src/simulation/unlocks';
import { isProjectUnlocked } from '../src/simulation/projects';
import { requestPurchaseModule } from '../src/simulation/purchases';
import { resetRunState, launchEscapePrestige } from '../src/simulation/prestige';
import { SHIP_COMPONENTS } from '../src/simulation/spaceship';
import { updateProgression } from '../src/simulation/progression';
import type { TechnologyId } from '../src/types/technologies';
import type { ShipComponentId } from '../src/types/state';
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
const context={now:0,eventInterval:60,housingCapacity:()=>1000,clampResources:()=>{}};
const retiredTech=['interstellarScoutPlan','interstellarCalibration'];
const retiredProjects=['interstellarScout','extrasolarAnchor'];
const retiredFlags=['scoutArrived','interstellarSignal','interstellarCargo'];
const retiredStories=['scoutDeparture','anotherSun','distantFoundation','distantReply','firstInterstellarCargo'];
function ready(){
 const s=createInitialState(CONFIG.version,60,0);s.tech=Object.keys(TECHNOLOGIES).filter(id=>!['spaceControlTower','hydrogenRecovery','icebreakingPlan','higherDimensionalStorage','overclocking13','superMetal','grapheneProcessing','nanoAlloy','virtualReality','virtualTraining','virtualEntertainment','aerogel','plasmaResearch','plasmaMining','energyShield','stellarForge','penroseTheory','massEjector','gravityConversion','stabilizeBlackHole','exoticRunaway'].includes(id)) as TechnologyId[];s.prestige.nuclearResets=1;
 s.asrielMissionCompleted=s.kerberosMissionCompleted=s.solarMissionCompleted=s.talosMissionCompleted=s.talosMoonMissionCompleted=s.asteroidBeltMissionCompleted=s.misenMissionCompleted=true;
 for(const id of ['rocketPlatform','monument','geneSequencing','remoteAnchor'] as const)s.arpaBuildings[id]=1;s.arpaBuildings.arpaResearchInstitute=2;
 s.buildings.aiSupercore=100;s.buildings.constraintArray=3;s.buildings.anchorFreightStation=s.buildings.civilianRouteStation=s.buildings.interstellarDock=1;
 for(const key of Object.keys(s.stageThree) as (keyof typeof s.stageThree)[])s.stageThree[key]=true;
 for(const key of Object.keys(SHIP_COMPONENTS) as ShipComponentId[]){s.shipComponents[key]=true;s.shipResourceProgress[key]=Object.fromEntries(Object.keys(SHIP_COMPONENTS[key].cost).map(id=>[id,100]));if(SHIP_COMPONENTS[key].population)s.shipResourceProgress[key].population=100;}
 Object.assign(s.resources,{cash:123456,knowledge:23456,energy:3456,e710:23,nanotubes:456,helium3:789});
 updateProgression(s);s.story.read=[...s.story.unlocked];return s;
}
function legacy(){
 const s=ready();return {...clone(s),tech:[...s.tech,...retiredTech],stageThree:{...s.stageThree,scoutArrived:true,interstellarSignal:true,interstellarCargo:true},
 arpaBuildings:{...s.arpaBuildings,interstellarScout:1,extrasolarAnchor:1},arpaProgress:{...s.arpaProgress,interstellarScout:0,extrasolarAnchor:0},
 arpaResourceProgress:{...s.arpaResourceProgress,interstellarScout:{cash:100},extrasolarAnchor:{cash:40,e710:15}},
 queue:[{uid:1,kind:'tech',id:'interstellarCalibration'},{uid:2,kind:'arpa',id:'interstellarScout'},{uid:3,kind:'arpa',id:'extrasolarAnchor'}],
 story:{unlocked:[...s.story.unlocked,...retiredStories],read:[...s.story.read,...retiredStories]}};
}
test('retired interstellar registries and commands disappear while solar facilities and ESS remain',()=>{
 const s=ready();assert.doesNotThrow(()=>validateCurrentSave(s,context));
 for(const id of retiredTech){assert.equal(Object.hasOwn(TECHNOLOGIES,id),false);assert.equal(isTechnologyUnlocked(id,s),false);}
 for(const id of retiredProjects){assert.equal(Object.hasOwn(ARPA_PROJECTS,id),false);assert.equal(isProjectUnlocked(id,s),false);const before=clone(s);assert.equal(requestPurchaseModule(s,'arpa',id,0,true).status,'rejected');assert.deepEqual(s,before);}
 for(const id of ['scout','stellarSignal','stellarCargo'] as unknown as StageThreeExperimentId[]){const before=clone(s);assert.equal(Object.hasOwn(STAGE_THREE_EXPERIMENTS,id),false);assert.equal(stageThreeExperimentAvailable(s,id),false);assert.equal(runStageThreeExperiment(s,id),false);assert.deepEqual(s,before);}
 assert.equal(STORY_CHAPTERS.length,22);assert.ok(STORY_CHAPTERS.every(row=>!retiredStories.includes(row.id)));assert.equal(Object.keys(s.stageThree).length,5);
 assert.ok(s.tech.includes('anomalyTopology'));assert.equal(s.arpaBuildings.remoteAnchor,1);assert.equal(isBuildingUnlocked('anchorFreightStation',s),true);assert.equal(isBuildingUnlocked('civilianRouteStation',s),true);assert.ok(Object.values(s.shipComponents).every(Boolean));
});
test('legacy interstellar content is scrubbed immutably without refunds and repeated imports are stable',()=>{
 const raw=legacy(),before=clone(raw),restored=validateCurrentSave(raw,context);assert.deepEqual(raw,before);
 for(const id of retiredTech)assert.equal((restored.tech as string[]).includes(id),false);
 for(const id of retiredProjects){assert.equal(Object.hasOwn(restored.arpaBuildings,id),false);assert.equal(Object.hasOwn(restored.arpaProgress,id),false);assert.equal(Object.hasOwn(restored.arpaResourceProgress||{},id),false);}
 for(const id of retiredFlags)assert.equal(Object.hasOwn(restored.stageThree,id),false);
 assert.equal(restored.queue.length,0);assert.ok(restored.story.unlocked.every(id=>!retiredStories.includes(id)));assert.ok(restored.story.read.every(id=>!retiredStories.includes(id)));
 assert.deepEqual(restored.resources,raw.resources);assert.deepEqual(restored.shipComponents,raw.shipComponents);assert.deepEqual(restored.prestige,raw.prestige);assert.deepEqual(restored.stageThree,ready().stageThree);assert.equal(restored.buildings.anchorFreightStation,1);assert.equal(restored.buildings.civilianRouteStation,1);
 assert.deepEqual(validateCurrentSave(clone(restored),context),restored);
});
test('retirement scrubs only recognized IDs and matching queue kinds, not malformed or unknown data',()=>{
 const cases:Record<string,unknown>[]=[];
 const t=legacy();t.tech.push('unknownFutureTech');cases.push(t);
 cases.push({...legacy(),arpaBuildings:{...legacy().arpaBuildings,unknownFutureProject:1}});
 cases.push({...legacy(),stageThree:{...legacy().stageThree,unknownFutureFlag:true}});
 cases.push({...legacy(),story:{unlocked:[...legacy().story.unlocked,'unknownFutureStory'],read:[]}});
 cases.push({...legacy(),queue:[{uid:1,kind:'build',id:'interstellarScout'}]});
 cases.push({...legacy(),queue:[{uid:1,kind:'tech',id:'extrasolarAnchor'}]});
 for(const key of ['tech','stageThree','arpaBuildings','arpaProgress','arpaResourceProgress','queue','story'])for(const value of [null,42,'invalid'])cases.push({...legacy(),[key]:value});
 cases.push({...legacy(),containers:-1});
 for(const raw of cases){const before=clone(raw);assert.throws(()=>validateCurrentSave(raw,context));assert.deepEqual(raw,before);}
});
test('retired migration preserves partial solar progress and reset archives with unchanged ESS escape',()=>{
 const raw=legacy();raw.arpaProgress.interstellarScout=60;raw.arpaBuildings.interstellarScout=0;raw.arpaBuildings.extrasolarAnchor=0;
 const s=validateCurrentSave(raw,context);const archived=[...s.story.unlocked];
 const soft=resetRunState(s,'soft',60,0);assert.ok(soft);assert.deepEqual(soft.next.story.unlocked,archived);assert.ok(Object.values(soft.next.stageThree).every(v=>v===false));
 const escape=launchEscapePrestige(s,60,0);assert.ok(escape);assert.equal(escape.next.prestige.escapeResets,1);assert.deepEqual(escape.next.story.unlocked.filter(id=>id!=='firstEscape'),archived.filter(id=>id!=='firstEscape'));
 assert.deepEqual(validateCurrentSave(clone(soft.next),context).stageThree,soft.next.stageThree);
});
