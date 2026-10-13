import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { validateStorageAssignments } from '../src/state/validation';
import { validatePopulationRecords } from '../src/state/validate-population';
import { canPayCost, payResourceCost } from '../src/simulation/costs';
import { queuePurchase, type QueuePurchaseArguments } from '../src/simulation/purchases';
const fresh=()=>createInitialState(CONFIG.version,60,0);

test('all stopped building counts reject fractional values while absent legacy counts remain compatible',()=>{
 const s=fresh();s.buildings.generator=1;const raw=structuredClone(s);raw.stoppedBuildings.generator=.5;
 assert.throws(()=>validateStorageAssignments(raw,s));
 const valid=fresh();valid.buildings.generator=1;valid.stoppedBuildings.generator=1;validateStorageAssignments(structuredClone(valid),valid);assert.equal(valid.stoppedBuildings.generator,1);
 const legacy=fresh();const stopped:Record<string,unknown>={...legacy.stoppedBuildings};delete stopped.generator;validateStorageAssignments({...legacy,stoppedBuildings:stopped},legacy);assert.equal(legacy.stoppedBuildings.generator,0);
});
test('population preserves overhousing integer saves but rejects unsafe or fractional population',()=>{
 for(const population of [Number.MAX_SAFE_INTEGER+1,1e100,.5,-1]){const s=fresh();assert.throws(()=>validatePopulationRecords({...s,population},s,1,0));}
 const s=fresh();validatePopulationRecords({...s,population:100},s,1,0);assert.equal(s.population,100);
});
test('payments reject negative nonfinite and unknown costs atomically but retain valid zero and epsilon behavior',()=>{
 const s=fresh();s.resources.wood=10;s.resources.stone=10;
 for(const cost of [{wood:-1},{wood:5,stone:-1},{wood:NaN},{wood:Infinity},{unknown:1}]){const before={...s.resources};assert.equal(canPayCost(s.resources,cost),false);assert.equal(payResourceCost(s.resources,cost),false);assert.deepEqual(s.resources,before);}
 assert.equal(payResourceCost(s.resources,{wood:0}),true);assert.equal(payResourceCost(s.resources,{wood:10}),true);assert.equal(s.resources.wood,0);
});
test('typed queue inputs reject mismatched locked and duplicate requests without changing state',()=>{
 const s=fresh();const invalid=['tech','nest'] as unknown as QueuePurchaseArguments;const before=structuredClone(s);
 assert.equal(queuePurchase(s,...invalid).status,'rejected');assert.deepEqual(s,before);
 assert.equal(queuePurchase(s,'tech','quantumSwarm').status,'rejected');assert.deepEqual(s,before);
 assert.equal(queuePurchase(s,'tech','survival').status,'queued');assert.equal(s.queue.length,1);
 const once=structuredClone(s);assert.equal(queuePurchase(s,'tech','survival').status,'rejected');assert.deepEqual(s,once);
});
