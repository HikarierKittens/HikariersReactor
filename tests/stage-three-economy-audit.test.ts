import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInitialState } from '../src/state/create-state';
import { CONFIG } from '../src/data/config';
import { calculateProduction } from '../src/simulation/production';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateStorageDetails } from '../src/simulation/storage';
import { calculateHousingDetails } from '../src/simulation/housing';
import { constructBuildingState } from '../src/simulation/purchases';
const fresh=()=>createInitialState(CONFIG.version,60,0);
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function stage(){const s=fresh();s.tech.push('fieldConstraintTheory','dualEndCoupling');s.stageThree.signalCompleted=true;return s;}

test('subsecond quantum-funded satellite generation uses the same interval as core and stability maintenance',()=>{
  const s=stage();s.tech.push('artificialIntelligenceII','quantumSwarm');s.buildings.lab=200;s.buildings.aiSupercore=100;s.buildings.swarmControlStation=1;s.buildings.swarmSatellite=25;s.buildings.constraintArray=1;
  Object.assign(s.resources,{helium3:5,e710:1,energy:7.55});
  const before=JSON.stringify(s);const preview=calculateSupportPreview(s,.2);const actual=calculateProduction(s,.2);
  assert.equal(actual.inputUnits.aiSupercore,1);assert.ok(actual.quantum.level>=5);
  assert.equal(actual.outputs.swarmSatellite,25,'funded core supports the 25th satellite during this tick');
  assert.equal(actual.inputUnits.constraintArray,1,'additional quantum-funded energy completes array upkeep');
  assert.equal(preview.stageThree.arrays,1);assert.equal(JSON.stringify(s),before);
});

test('relay support reaches Asriel allocation housing knowledge storage and purchase defaults',()=>{
  const s=stage();s.buildings.constraintArray=4;s.buildings.shortRangeRelay=3;s.buildings.asrielResidence=2;s.buildings.alienMaterialLab=2;s.population=4;s.workers.asrielResidence=4;
  Object.assign(s.resources,{energy:230,e710:1});
  const preview=calculateSupportPreview(s),actual=calculateProduction(s);
  assert.equal(preview.asriel.capacity,6);assert.deepEqual(actual.asriel,preview.asriel);
  assert.equal(preview.asriel.allocations.asrielResidence,2);assert.equal(preview.asriel.allocations.alienMaterialLab,2);
  assert.equal(calculateHousingDetails(s,preview.asriel).find(row=>row.name==='Asriel居住站')?.active,2);
  assert.equal(calculateStorageDetails('knowledge',s,{...preview,moonBaseUnits:preview.moon.baseUnits}).rows.find(row=>row.name.includes('外星'))?.value,2000);
  constructBuildingState(s,'asrielResidence',0);assert.equal(s.stoppedBuildings.asrielResidence,0);
  s.resources.energy=240;constructBuildingState(s,'shortRangeRelay',0);assert.equal(s.stoppedBuildings.shortRangeRelay,0);
  constructBuildingState(s,'shortRangeRelay',0);assert.equal(s.stoppedBuildings.shortRangeRelay,1,'fifth relay cannot overbook eight stability');
  s.stoppedBuildings.constraintArray=4;const off=calculateProduction(s);assert.equal(off.inputUnits.shortRangeRelay,0);assert.equal(off.asriel.capacity,0);
});

test('quantum feedback with relays and Asriel knowledge terminates purely and charges upkeep exactly once',()=>{
  const s=stage();s.tech.push('artificialIntelligenceII','quantumSwarm');s.buildings.swarmControlStation=5;s.buildings.swarmSatellite=200;s.buildings.lab=200;s.buildings.constraintArray=1;s.buildings.shortRangeRelay=2;s.buildings.asrielResidence=1;s.buildings.alienMaterialLab=3;s.population=2;s.workers.asrielResidence=2;s.resources.e710=1;
  const before=JSON.stringify(s);const preview=calculateSupportPreview(s),actual=calculateProduction(s);
  assert.equal(preview.stageThree.relays,1);assert.deepEqual(preview.asriel,actual.asriel);
  assert.equal(actual.inputUnits.constraintArray,1);assert.equal(actual.inputUnits.shortRangeRelay,1);
  assert.ok(actual.outputs.swarmSatellite !== undefined);
  close(actual.rates.energy,actual.outputs.swarmSatellite*.5-60);close(actual.rates.e710,-.25);
  assert.equal(JSON.stringify(s),before);
});
