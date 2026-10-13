import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { calculateProduction } from '../src/simulation/production';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { createUiPreviewCache } from '../src/vue/preview-cache';
import { storageSnapshot } from '../src/vue/format';
const fresh = () => createInitialState(CONFIG.version, 60, 0);

test('UI previews are lazy and shared only within identical state revision and dt', () => {
  let production = 0, support = 0;
  const cache = createUiPreviewCache({
    production: (s, dt) => { production++; return calculateProduction(s, dt); },
    support: (s, dt) => { support++; return calculateSupportPreview(s, dt); },
  });
  const s = fresh();
  assert.equal(production + support, 0);
  const p = cache.production(s, 1), u = cache.support(s, 1);
  for (let i = 0; i < 10; i++) { assert.equal(cache.production(s, 1), p); assert.equal(cache.support(s, 1), u); }
  assert.deepEqual([production, support], [1, 1]);
  assert.notEqual(cache.production(s, 1, .2), p);
  assert.notEqual(cache.support(s, 1, .2), u);
  assert.notEqual(cache.production(s, 2), p);
  assert.notEqual(cache.support(s, 2), u);
  assert.notEqual(cache.production(fresh(), 2), cache.production(s, 2));
  assert.throws(() => cache.production(s, 2, 0), RangeError);
});

test('cached previews do not mutate input or replace authoritative simulation and keep working pools independent', () => {
  const s = fresh(); s.tech.push('fieldConstraintTheory'); s.buildings.constraintArray = 1;
  Object.assign(s.resources, { energy: 50, e710: 1 });
  const before = JSON.stringify(s), cache = createUiPreviewCache();
  const p = cache.production(s, 1), u = cache.support(s, 1);
  assert.equal(JSON.stringify(s), before);
  assert.notEqual(p.pool, u.pool); assert.notEqual(p.pool, s.resources); assert.notEqual(u.pool, s.resources);
  assert.deepEqual(p, calculateProduction(s)); assert.deepEqual(u, calculateSupportPreview(s));
  s.resources.energy = 0;
  assert.equal(calculateSupportPreview(s).stageThree.arrays, 0);
  assert.equal(cache.support(s, 2).stageThree.arrays, 0);
  assert.equal(cache.production(s, 2).stageThree.arrays, 0);
  assert.equal(u.stageThree.arrays, 1);
  // Compile-only regression: shared display objects must reject consumer writes.
  // This block deliberately never executes or alters a cached snapshot.
  if (false) {
    // @ts-expect-error shared production inventory is deeply readonly
    p.pool.wood = 123;
    // @ts-expect-error shared output dictionaries are deeply readonly
    p.outputs.generator = 123;
    // @ts-expect-error shared support allocation is deeply readonly
    u.stageThree.arrays = 123;
    // @ts-expect-error shared nested support dictionaries are deeply readonly
    u.asriel.allocations.asrielMine = 123;
  }
});

test('formatter omitting revision stays uncached for command checks while display snapshots use supplied revisions', () => {
  const s = fresh(); s.tech.push('fieldConstraintTheory'); s.buildings.constraintArray = 1;
  Object.assign(s.resources, { energy: 50, e710: 1 });
  assert.equal(storageSnapshot(s, 1, 10).stageThree?.freight, 0);
  const a = storageSnapshot(s, 1, 10), b = storageSnapshot(s, 1, 10);
  assert.equal(a.stageThree, b.stageThree);
  const immutableSupport = a.stageThree;
  if (immutableSupport && false) {
    // @ts-expect-error formatter cannot expose mutable references to cached support
    immutableSupport.freight = 123;
  }
  s.resources.energy = 0;
  assert.notEqual(storageSnapshot(s).stageThree, a.stageThree);
  assert.equal(calculateSupportPreview(s).stageThree.arrays, 0);
  assert.notEqual(storageSnapshot(s, 1, 11).stageThree, a.stageThree);
});
