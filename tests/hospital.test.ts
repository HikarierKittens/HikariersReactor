import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { BUILDINGS, BUILDING_GROUPS } from '../src/data/buildings';
import { TECHNOLOGIES } from '../src/data/technologies';
import {
  HOSPITAL_HEAL_PER_DAY, advanceHospital, hospitalHealPerDay, hospitalHealRate,
  isHospitalIdle, workingHospitals,
} from '../src/simulation/hospital';
import { validateAndMigrateSave } from '../src/state/validate-save';
import type { GameState } from '../src/types/state';

const context = { now: 0, eventInterval: 60, housingCapacity: () => 1e6, clampResources: () => undefined };

/** Complete prerequisite closure so the fixture passes the real save validator. */
function addTech(tech: string[], id: string): void {
  if (tech.includes(id)) return;
  for (const parent of TECHNOLOGIES[id as keyof typeof TECHNOLOGIES].pre) addTech(tech, parent);
  tech.push(id);
}

function state(): GameState {
  const s = createInitialState(CONFIG.version, 600, 0);
  addTech(s.tech, 'fieldHospital');
  s.soldiers = 50;
  // The save validator caps soldiers at barracks capacity, so the fixture needs barracks.
  s.buildings.barracks = 25;
  s.buildings.hospital = 1;
  return s;
}

test('战地医院 is a T5 technology unlocked from 军事 and 科学方法', () => {
  const tech = TECHNOLOGIES.fieldHospital;
  assert.equal(tech.tier, 5, 'T5 as requested');
  assert.equal(tech.era, 2);
  assert.deepEqual([...tech.pre].sort(), ['military', 'science'], 'needs both prerequisites');
  assert.ok(tech.cost.knowledge! > 0 && tech.cost.metalPlate! > 0, 'has a real cost');
});

test('医院 sits in the 军事设施 group and is gated by the new tech', () => {
  const group = BUILDING_GROUPS.find(entry => entry.id === 'military');
  assert.ok(group, 'military group exists');
  assert.ok(group!.buildings.includes('hospital'), 'hospital is listed under 军事设施');
  assert.equal(BUILDINGS.hospital.tech, 'fieldHospital', 'requires the technology');
  assert.ok(BUILDINGS.hospital.cost.cash! > 0 || BUILDINGS.hospital.cost.wood! > 0, 'has a real cost');
});

test('one hospital heals exactly one wounded soldier per game day', () => {
  const s = state();
  assert.equal(hospitalHealPerDay(s), 1);
  // Rate is per second, derived from the 5-second game day.
  assert.ok(Math.abs(hospitalHealRate(s) - HOSPITAL_HEAL_PER_DAY / CONFIG.secondsPerDay) < 1e-12);
  s.buildings.hospital = 3;
  assert.equal(hospitalHealPerDay(s), 3, 'rate scales with hospital count');
});

test('healing accumulates across short ticks instead of rounding to nothing', () => {
  const s = state();
  s.wounded = 5;
  // One game day as 25 separate 0.2s ticks: fractions must not be discarded.
  let healed = 0;
  for (let i = 0; i < 25; i++) healed += advanceHospital(s, CONFIG.secondsPerDay / 25);
  assert.equal(healed, 1, 'a full game day heals exactly one soldier');
  assert.equal(s.wounded, 4);
  assert.equal(s.soldiers, 51, 'recovered soldiers rejoin the army');
});

test('healing stops when there are no wounded and resets stale progress', () => {
  const s = state();
  s.wounded = 0;
  advanceHospital(s, 1.5);
  assert.equal(s.hospitalProgress, 0, 'no banked progress without patients');
  assert.equal(s.soldiers, 50);

  s.wounded = 1;
  advanceHospital(s, 2); // 0.4 progress with one hospital
  assert.ok(s.hospitalProgress > 0 && s.hospitalProgress < 1);
  s.wounded = 0;
  advanceHospital(s, .1);
  assert.equal(s.hospitalProgress, 0, 'progress is dropped when the last patient leaves');
});

test('a stopped or missing hospital heals nothing', () => {
  const s = state();
  s.wounded = 5;
  s.stoppedBuildings.hospital = 1;
  assert.equal(workingHospitals(s), 0);
  assert.equal(advanceHospital(s, 100), 0);
  assert.equal(s.wounded, 5, 'stopped hospitals do not treat patients');

  s.stoppedBuildings.hospital = 0;
  s.buildings.hospital = 0;
  assert.equal(advanceHospital(s, 100), 0);
});

test('healing never exceeds the wounded count', () => {
  const s = state();
  s.buildings.hospital = 100;
  s.wounded = 2;
  const healed = advanceHospital(s, CONFIG.secondsPerDay);
  assert.equal(healed, 2, 'only as many as are actually wounded');
  assert.equal(s.wounded, 0);
  assert.equal(s.soldiers, 52);
  assert.equal(s.hospitalProgress, 0);
});

test('the hospital is idle only when it works but has no patients', () => {
  const s = state();
  s.wounded = 1;
  assert.equal(isHospitalIdle(s), false);
  s.wounded = 0;
  assert.equal(isHospitalIdle(s), true);
  s.buildings.hospital = 0;
  assert.equal(isHospitalIdle(s), false, 'no hospital means not idle, just absent');
});

test('saves without hospitalProgress upgrade cleanly and reject invalid carries', () => {
  const s = state();
  s.wounded = 3;
  const raw = JSON.parse(JSON.stringify(s));
  delete raw.hospitalProgress;
  const loaded = validateAndMigrateSave(raw, context);
  assert.equal(loaded.hospitalProgress, 0, 'backfilled for older saves');
  assert.equal(loaded.wounded, 3, 'wounded count is preserved');

  const bad = JSON.parse(JSON.stringify(s));
  bad.hospitalProgress = 5;
  assert.throws(() => validateAndMigrateSave(bad, context), /医院治疗进度/);
});
