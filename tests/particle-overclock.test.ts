import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInitialState } from '../src/state/create-state';
import { CONFIG } from '../src/data/config';
import { validateAndMigrateSave } from '../src/state/validate-save';
import { BUILDINGS } from '../src/data/buildings';
import { TECHNOLOGIES } from '../src/data/technologies';

test('retired overclock content is absent and saved retired research and queues reject', () => {
  const raw = JSON.parse(JSON.stringify(createInitialState(CONFIG.version, 60, 0)));
  raw.tech = ['acceleratorOverclock', 'advancedParticleOverclock'];
  raw.buildings.particleOverclockStation = 3;
  raw.workers.particleOverclockStation = 0;
  raw.stoppedBuildings.particleOverclockStation = 1;
  raw.queue = [{ uid:1,kind:'build',id:'particleOverclockStation' }, { uid:2,kind:'tech',id:'acceleratorOverclock' }];
  const before = structuredClone(raw);
  assert.throws(() => validateAndMigrateSave(raw, { now:0,eventInterval:60,housingCapacity:()=>100,clampResources:()=>{} }));
  assert.equal(Object.hasOwn(BUILDINGS, 'particleOverclockStation'), false);
  assert.equal(Object.hasOwn(TECHNOLOGIES, 'acceleratorOverclock'), false);
  assert.equal(Object.hasOwn(TECHNOLOGIES, 'advancedParticleOverclock'), false);
  assert.deepEqual(raw, before);
});
