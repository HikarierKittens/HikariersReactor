import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInitialState } from '../src/state/create-state';
import { CONFIG } from '../src/data/config';
import { calculateProduction } from '../src/simulation/production';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateStorageDetails } from '../src/simulation/storage';
import { calculateHousingDetails } from '../src/simulation/housing';
import { constructBuildingState } from '../src/simulation/purchases';
import { supplyPower } from './support/power';
const fresh=()=>createInitialState(CONFIG.version,60,0);
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function stage(){const s=fresh();s.tech.push('fieldConstraintTheory');return s;}

test('subsecond quantum-funded satellite generation uses the same interval as core and stability maintenance',()=>{
  const s=stage();s.tech.push('artificialIntelligenceII','quantumSwarm');s.buildings.lab=600;s.buildings.aiSupercore=100;s.buildings.swarmControlStation=1;s.buildings.swarmSatellite=25;s.buildings.constraintArray=1;
  // The retired 27.55 stock over this 0.2 s step is a fixed 137.75 W supply.
  Object.assign(s.resources,{helium3:5,e710:1});supplyPower(s,27.55/.2);
  const before=JSON.stringify(s);const preview=calculateSupportPreview(s,.2);const actual=calculateProduction(s,.2);
  // Logarithmic knowledge scaling needs 600 labs to straddle the 25th-satellite threshold:
  // the funded core lifts base <5 to final >=5, without changing the upkeep boundary.
  assert.equal(actual.inputUnits.aiSupercore,1);assert.ok(actual.quantum.base<5);assert.ok(actual.quantum.level>=5);
  close(actual.quantum.base,Math.log1p(.1*actual.quantum.knowledgeCapacity/250000)/Math.log1p(.1));
  assert.equal(actual.quantum.level,Math.floor(actual.quantum.base*1.25*100)/100);
  assert.equal(actual.outputs.swarmSatellite,25,'funded core supports the 25th satellite during this tick');
  assert.equal(actual.inputUnits.constraintArray,1,'additional quantum-funded energy completes array upkeep');
  assert.equal(actual.pool.energy,0,'electricity is a fixed budget, not stored');
  assert.equal(preview.stageThree.arrays,1);assert.equal(JSON.stringify(s),before);
});

test('relay support reaches Asriel allocation housing knowledge storage and purchase defaults',()=>{
  const s=stage();s.buildings.constraintArray=4;s.buildings.shortRangeRelay=3;s.buildings.asrielResidence=2;s.buildings.alienMaterialLab=2;s.population=4;s.workers.asrielResidence=4;
  Object.assign(s.resources,{e710:1});supplyPower(s,230);
  const preview=calculateSupportPreview(s),actual=calculateProduction(s);
  assert.equal(preview.asriel.capacity,6);assert.deepEqual(actual.asriel,preview.asriel);
  assert.equal(preview.asriel.allocations.asrielResidence,2);assert.equal(preview.asriel.allocations.alienMaterialLab,2);
  assert.equal(calculateHousingDetails(s,preview.asriel).find(row=>row.name==='Asriel居住站')?.active,2);
  assert.equal(calculateStorageDetails('knowledge',s,{...preview,moonBaseUnits:preview.moon.baseUnits}).rows.find(row=>row.name.includes('外星'))?.value,2000);
  constructBuildingState(s,'asrielResidence',0);assert.equal(s.stoppedBuildings.asrielResidence,0);
  supplyPower(s,240);constructBuildingState(s,'shortRangeRelay',0);assert.equal(s.stoppedBuildings.shortRangeRelay,0);
  constructBuildingState(s,'shortRangeRelay',0);assert.equal(s.stoppedBuildings.shortRangeRelay,1,'fifth relay cannot overbook eight stability');
  s.stoppedBuildings.constraintArray=4;const off=calculateProduction(s);assert.equal(off.inputUnits.shortRangeRelay,0);assert.equal(off.asriel.capacity,0);
});

test('quantum feedback with relays and Asriel knowledge terminates purely and charges upkeep exactly once',()=>{
  const s=stage();s.tech.push('artificialIntelligenceII','quantumSwarm');s.buildings.swarmControlStation=5;s.buildings.swarmSatellite=200;s.buildings.lab=600;s.buildings.constraintArray=1;s.buildings.shortRangeRelay=2;s.buildings.asrielResidence=1;s.buildings.alienMaterialLab=3;s.population=2;s.workers.asrielResidence=2;s.resources.e710=1;
  // Sufficient logarithmic base quantum must fund the original array + one-relay feedback case.
  const before=JSON.stringify(s);const preview=calculateSupportPreview(s),actual=calculateProduction(s);
  close(actual.quantum.base,Math.log1p(.1*actual.quantum.knowledgeCapacity/250000)/Math.log1p(.1));
  assert.equal(preview.stageThree.relays,1);assert.deepEqual(preview.asriel,actual.asriel);
  assert.equal(actual.inputUnits.constraintArray,1);assert.equal(actual.inputUnits.shortRangeRelay,1);
  assert.ok(actual.outputs.swarmSatellite !== undefined);
  close(actual.rates.energy,actual.outputs.swarmSatellite*.5-60);close(actual.rates.e710,-.25);
  assert.equal(JSON.stringify(s),before);
});
