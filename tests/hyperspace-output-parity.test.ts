import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { calculateProduction } from '../src/simulation/production';
import { calculateResourceBreakdown } from '../src/simulation/resource-breakdown';
import { settleSpaceProduction } from '../src/simulation/space-settlement';
import { settlePowerPlants } from '../src/simulation/power';
import { settleQuantumCores } from '../src/simulation/quantum';
import { buildSettlementLedger } from '../src/simulation/support-preview';
import { replaySettledPool } from '../src/simulation/pool-replay';
import type { ResourceId } from '../src/types/economy';
const near = (a:number,b:number) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);
function state() {
 const s=createInitialState(CONFIG.version,60,0);
 s.tech.push('dimensionBeaconDeployment','gasCloudAccretion','largeMiningShips','hyperspaceMiningSurvey','highTechFarmPlatform');
 s.stageThree.remoteLinked=true;
 Object.assign(s.resources,{energy:1000,helium3:100,deuterium:10});
 s.buildings.hyperspaceSpaceport=1;s.buildings.gasCloudMiningShip=1;s.buildings.metalMiningShip=1;
 return s;
}
test('port boosts ordinary fuels and multi-output sources once with breakdown parity',()=>{
 const s=state(), p=calculateProduction(s,.2);
 assert.equal(p.outputs.metalMiningShip,1);
 near(p.rates.stone,10); near(p.rates.copper,5); near(p.rates.aluminum,3.75);
 near(p.rates.deuterium,.3125-.2); near(p.rates.helium3,2.5-5);
 for(const id of ['stone','copper','aluminum','deuterium','helium3'] as ResourceId[]) near(calculateResourceBreakdown(id,s,p).net,p.rates[id]);
 s.buildings.metalRefinery=2;
 const refined=calculateProduction(s,.2);
 near(calculateResourceBreakdown('aluminum',s,refined).net,refined.rates.aluminum);
});
test('ice water receives the same funded-port bonus',()=>{
 const s=state();s.buildings.gasCloudMiningShip=0;s.buildings.metalMiningShip=0;s.buildings.iceMiningShip=1;
 const p=calculateProduction(s,.2);near(p.rates.water,1.25);near(calculateResourceBreakdown('water',s,p).net,p.rates.water);
 s.stoppedBuildings.hyperspaceSpaceport=1;near(calculateProduction(s,.2).rates.water,0);
});
test('actual-happiness replay rederives fuel-chain units instead of trusting baseline ledger',()=>{
 for(const happiness of [40,80,150]) for(const dt of [.2,1]) {
  const s=state();s.buildings.hyperspaceSpaceport=0;s.resources.deuterium=0;s.buildings.highTechFarmPlatform=1;s.buildings.fuelMiningShip=1;
  const original=JSON.stringify(s), ledger=buildSettlementLedger(s,dt), replay=replaySettledPool(s,ledger,dt,happiness);
  const pool={...s.resources};settleQuantumCores(s,pool,dt);const plants=settlePowerPlants(pool,dt,s);
  const expected=settleSpaceProduction(s,pool,dt,happiness,plants.inputUnits.geothermalPlant||0,plants.inputUnits.hydrogenPowerPlant||0);
  for(const id of ['gasCloudMiningShip','highTechFarmPlatform','metalMiningShip','fuelMiningShip']) near(replay.inputUnits[id]||0,expected.inputs[id]||0);
  for(const id of ['deuterium','helium3','stone','food','wood','water','coal','oil'] as ResourceId[]) near(replay.pool[id],pool[id]);
  assert.equal(JSON.stringify(s),original);
 }
});
