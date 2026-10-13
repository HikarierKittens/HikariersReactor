import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { createInitialState } from '../src/state/create-state';
import { calculateProduction } from '../src/simulation/production';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateBuildingInput } from '../src/simulation/building-production';
import { calculateStorageBonuses } from '../src/simulation/storage-bonuses';
import { calculateResourceBreakdown } from '../src/simulation/resource-breakdown';
import { isTechnologyUnlocked } from '../src/simulation/unlocks';
import { requestPurchaseModule } from '../src/simulation/purchases';
import { moraleSnapshot } from '../src/vue/format';
const fresh=()=>createInitialState(CONFIG.version,60,0);
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('space broadcasting costs exactly 480k behind AI II and upgrades the same existing beacon',()=>{
 const s=fresh();assert.equal(TECHNOLOGIES.spaceBroadcasting.name,'太空广播');assert.equal(TECHNOLOGIES.spaceBroadcasting.tier,16);assert.deepEqual(TECHNOLOGIES.spaceBroadcasting.cost,{knowledge:480000});assert.deepEqual(TECHNOLOGIES.spaceBroadcasting.pre,['artificialIntelligenceII']);
 assert.equal(isTechnologyUnlocked('spaceBroadcasting',s),false);s.tech.push('artificialIntelligenceII');assert.equal(isTechnologyUnlocked('spaceBroadcasting',s),true);s.buildings.navigationBeacon=3;s.stoppedBuildings.navigationBeacon=1;
 s.resources.knowledge=479999;const before=clone(s);assert.equal(requestPurchaseModule(s,'tech','spaceBroadcasting',0).status,'queued');assert.equal(s.tech.includes('spaceBroadcasting'),false);assert.equal(s.resources.knowledge,before.resources.knowledge);s.queue=[];
 s.resources.knowledge=480000;assert.equal(requestPurchaseModule(s,'tech','spaceBroadcasting',0).status,'buy-now');assert.equal(s.resources.knowledge,0);assert.equal(s.buildings.navigationBeacon,3);assert.equal(s.stoppedBuildings.navigationBeacon,1);assert.equal(requestPurchaseModule(s,'tech','spaceBroadcasting',0).status,'rejected');
});
test('broadcast beacons grant three morale per funded whole unit with exact once-only power and unchanged lunar support',()=>{
 for(const dt of [.2,1]){const s=fresh();s.population=20;s.buildings.theater=100;s.buildings.navigationBeacon=2;s.resources.energy=6*dt;
 const old=calculateProduction(s,dt);near(old.rates.energy,-4);near(old.morale.happiness,90);assert.equal(old.moon.capacity,2);assert.equal(calculateBuildingInput('navigationBeacon',s).energy,2);
 s.tech.push('spaceBroadcasting');const before=clone(s),p=calculateProduction(s,dt);assert.deepEqual(s,before);near(p.rates.energy,-6);near(p.morale.happiness,96);assert.equal(p.moon.capacity,2);assert.equal(calculateBuildingInput('navigationBeacon',s).energy,3);near(moraleSnapshot(s,dt).happiness,p.morale.happiness);assert.deepEqual(calculateSupportPreview(s,dt).moon,p.moon);near(calculateResourceBreakdown('energy',s,p).net,-6);
 s.resources.energy=5*dt;const partial=calculateProduction(s,dt);near(partial.rates.energy,-3);near(partial.morale.happiness,93);assert.equal(partial.moon.capacity,1);
 s.stoppedBuildings.navigationBeacon=2;const off=calculateProduction(s,dt);near(off.rates.energy,0);near(off.morale.happiness,90);assert.equal(off.moon.capacity,0);
 s.stoppedBuildings.navigationBeacon=0;s.resources.energy=0;near(calculateProduction(s,dt).morale.happiness,90);
 s.buildings.broadcast=1;s.resources.energy=6*dt;const competition=calculateProduction(s,dt);near(competition.morale.beacon,6);near(competition.morale.broadcast,0);near(competition.morale.happiness,96);near(competition.rates.energy,-6);
 }
});
test('morale cap sources each contribute one while existing actual broadcast and tourist morale remain three',()=>{
 const s=fresh();s.population=20;s.buildings.theater=4;s.buildings.broadcast=2;s.buildings.touristStation=3;s.buildings.catCafe=5;Object.assign(s.resources,{energy:1000,oil:1000});
 const m=calculateProduction(s).morale;assert.equal(m.theaterCap,4);assert.equal(m.broadcastCap,2);assert.equal(m.stationCap,3);assert.equal(m.catCafeCap,5);assert.equal(m.cap,114);near(m.broadcast,6);near(m.station,9);
 s.buildings.navigationBeacon=100;s.tech.push('spaceBroadcasting');assert.equal(calculateProduction(s).morale.cap,114);
});
test('cat cafe cash storage uses its new 4000 base and retains the independent iridium vault addition',()=>{
 const s=fresh();assert.equal(calculateStorageBonuses('catCafe',s,null).cash,4000);s.tech.push('iridiumSteelVault');assert.equal(calculateStorageBonuses('catCafe',s,null).cash,6500);s.tech.push('vaultExpansion','steelSafe','iridiumAlloyWarehouse');near(calculateStorageBonuses('catCafe',s,null).cash??0,6500*1.2);near(calculateStorageBonuses('bank',s,null).cash??0,4000*1.2);
});
