// v29 配置契约 + 核心行为回归。运行：node test-asriel.cjs
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({performance:{now:()=>0},Date,console,document:{getElementById:()=>({}),querySelectorAll:()=>[]},localStorage:{setItem(){},getItem(){return null}}});
require('./load-game.cjs').loadGame(ctx);
const run=s=>vm.runInContext(s,ctx),json=s=>JSON.parse(run(`JSON.stringify(${s})`));
const techs={moonObservatory:[170000,'moonExploration'],planetaryExploration:[190000,'moonExploration'],spaceIndustrialization:[200000,'planetaryExploration'],starRingStation:[220000,'planetaryExploration']};
for(const [id,[knowledge,parent]]of Object.entries(techs)){assert.equal(run(`techTier('${id}')`),12);assert.equal(run(`TECHNOLOGIES.${id}.cost.knowledge`),knowledge);assert.deepEqual(json(`TECHNOLOGIES.${id}.pre`),[parent]);}
assert.deepEqual(json('TECHNOLOGIES.planetaryExploration.cost'),{knowledge:190000,alloy:2000,polymer:1000,iridium:1000});
const buildings={
 moonObservatory:[{knowledge:25000,cash:50000,stone:20000,iron:10000,iridium:1000},1.18],
 asrielSpaceport:[{cash:40000,iridium:1500,mithril:25,titanium:10000},1.25],
 asrielResidence:[{cash:30000,metal:10000,polymer:5000},1.2],
 asrielMine:[{cash:40000,iron:30000},1.25],
 ecologicalDome:[{cash:40000,wood:50000,brick:1000},1.2],
 hangar:[{cash:25000,iron:10000,brick:2000,metalPlate:1000},1.2],
 spaceFactory:[{cash:50000,brick:5000,coal:5000,mithril:5},1.2035],
 starRingStation:[{cash:300000,stone:200000,aluminum:50000,mithril:250},1.24]
};
for(const [id,[cost,scale]]of Object.entries(buildings)){assert.deepEqual(json(`BUILDINGS.${id}.cost`),cost);for(const resource of Object.keys(cost))assert.equal(run(`buildingCostScale('${id}','${resource}')`),scale,`${id}/${resource}`);}
assert.deepEqual(json('BUILDINGS.asrielSpaceport.input'),{helium3:2,energy:5,food:25});
assert.deepEqual(json('BUILDINGS.spaceFactory.input'),{helium3:2,energy:3});
assert.equal(run('BUILDINGS.asrielSpaceport.asrielSupport'),4);
for(const id of ['asrielResidence','asrielMine','ecologicalDome'])assert.equal(run(`BUILDINGS.${id}.asrielSupport`),1);
assert.equal(run('BUILDINGS.moonObservatory.output'),undefined,'观测站提供容量而非知识产量');
run('gameState=freshState();keyAction=()=>{};gameState.tech=Object.keys(TECHNOLOGIES)');
for(const id of Object.keys(buildings).filter(id=>id!=='moonObservatory'))assert.equal(run(`buildingUnlocked('${id}')`),false);
run('gameState.resources.helium3=4999');assert.equal(run('launchAsrielMission()'),false);assert.equal(run('gameState.resources.helium3'),4999);
run('gameState.resources.helium3=5000');assert.equal(run('launchAsrielMission()'),true);assert.equal(run('buildingUnlocked("asrielSpaceport")'),true);
for(const id of ['asrielResidence','asrielMine','ecologicalDome','hangar','spaceFactory','starRingStation'])assert.equal(run(`buildingUnlocked('${id}')`),false);
run('gameState.buildings.asrielSpaceport=1');for(const id of Object.keys(buildings))assert.equal(run(`buildingUnlocked('${id}')`),true);
for(const [field,value]of [['asrielMissionCompleted','1'],['asrielMissionQueued','1'],['resources.helium3','NaN'],['buildings.asrielSpaceport','-.5']]){run(`gameState=freshState();gameState.${field}=${value}`);assert.throws(()=>run('validateSave(gameState)'),field);}
run('gameState=freshState();gameState.asrielMissionQueued=true');const queuedBefore=run('JSON.stringify(gameState)');assert.throws(()=>run('validateSave(gameState)'),/Asriel任务状态/);assert.equal(run('JSON.stringify(gameState)'),queuedBefore,'拒绝旧版排队标志时保持原始记录');
console.log('PASS 科技、建筑成本倍率、支持、任务与存档字段契约');
require('./test-asriel-core.cjs');
