import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { BUILDINGS } from '../src/data/buildings';
import { createInitialState } from '../src/state/create-state';
import { validateAndMigrateSave } from '../src/state/validate-save';
import { registerBuiltPowerUnits } from '../src/simulation/power-grid';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { clampResourcesToCaps } from '../src/simulation/storage';
import { floorWithPrecision } from '../src/shared/format';
import { calculateHousingDetails } from '../src/simulation/housing';
import { supplyPower } from './support/power';
import type { GameState } from '../src/types/state';
import type { BuildingId } from '../src/types/buildings';

import { TECHNOLOGIES } from '../src/data/technologies';
import type { TechnologyId } from '../src/types/technologies';

/** Add a technology together with its full prerequisite closure. */
function addTech(state: GameState, id: string): void {
  if (state.tech.includes(id as TechnologyId)) return;
  for (const parent of TECHNOLOGIES[id as TechnologyId].pre) addTech(state, parent);
  state.tech.push(id as TechnologyId);
}

function context() {
  const capacity = (candidate: GameState): number => {
    const { asriel, stageThree, digital } = calculateSupportPreview(candidate);
    return floorWithPrecision(calculateHousingDetails(candidate, asriel, stageThree, digital).reduce((sum, row) => sum + row.value, 0));
  };
  return {
    now: 1_000_000, eventInterval: 60,
    housingCapacity: capacity,
    clampResources: (candidate: GameState) => {
      const { moon, asriel, biologyUnits, dataCenterUnits, researchStationUnits, blackHoleStationUnits, stageThree } = calculateSupportPreview(candidate);
      return clampResourcesToCaps(candidate, { biologyUnits, dataCenterUnits, moonBaseUnits: moon.baseUnits, moon, asriel, researchStationUnits, blackHoleStationUnits, stageThree });
    },
  };
}

const orderTotal = (state: GameState, id: BuildingId) =>
  (state.powerActivationOrder || []).filter(entry => entry.id === id).reduce((sum, entry) => sum + entry.count, 0);
const runningCount = (state: GameState, id: BuildingId) =>
  (state.buildings[id] || 0) - (BUILDINGS[id].alwaysRunning ? 0 : state.stoppedBuildings[id] || 0);

test('building a power plant never adds it to the power activation order', () => {
  // 恒星熔炉 is a power plant (alwaysRunning, output energy): it has no demand, and an entry
  // for it can never be consumed. Writing one inflated the order past the owned count and
  // the next load rejected the save.
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech.push('stellarForge');
  supplyPower(state, 100000);
  for (let i = 1; i <= 4; i++) {
    const before = state.buildings.stellarForge;
    state.buildings.stellarForge = before + 1;
    registerBuiltPowerUnits(state, 'stellarForge', before);
    assert.equal(orderTotal(state, 'stellarForge'), 0, `build #${i} must not register an order entry`);
  }
  assert.equal(state.buildings.stellarForge, 4);
});

test('building a load registers exactly one unit per build and stays within the running count', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech.push('electricity', 'writing');
  supplyPower(state, 100000);
  for (let i = 1; i <= 3; i++) {
    const before = state.buildings.lab;
    state.buildings.lab = before + 1;
    registerBuiltPowerUnits(state, 'lab', before);
    assert.equal(orderTotal(state, 'lab'), i, `build #${i} registers one more lab`);
    assert.ok(orderTotal(state, 'lab') <= runningCount(state, 'lab'), 'never exceeds the running count');
  }
  // An unpowered load is stopped, so it must not be registered at all.
  const dark = createInitialState(CONFIG.version, 60, 0);
  dark.tech.push('electricity', 'writing');
  supplyPower(dark, 0);
  dark.buildings.lab = 1;
  dark.stoppedBuildings.lab = 1;
  registerBuiltPowerUnits(dark, 'lab', 0);
  assert.equal(orderTotal(dark, 'lab'), 0);
});

test('a save whose activation order exceeds the running count is repaired on load', () => {
  // Reproduce the shipped bug's output: 2 labs owned but 5 activation entries. 恒星熔炉 is the
  // building that actually hit this in the field, but any load reproduces the same clamp.
  const state = createInitialState(CONFIG.version, 60, 0);
  addTech(state, 'electricity');
  addTech(state, 'writing');
  state.buildings.lab = 2;
  state.powerActivationOrder = [{ id: 'lab', count: 5 }];
  const raw = JSON.parse(JSON.stringify(state));
  const loaded = validateAndMigrateSave(raw, context());
  assert.equal(orderTotal(loaded, 'lab'), 2, 'clamped to what is actually running');
  // Progress is preserved, and a legitimate order is left untouched.
  assert.equal(loaded.buildings.lab, 2);
  const clean = createInitialState(CONFIG.version, 60, 0);
  addTech(clean, 'electricity');
  addTech(clean, 'writing');
  clean.buildings.lab = 2;
  clean.powerActivationOrder = [{ id: 'lab', count: 2 }];
  const keptRaw = JSON.parse(JSON.stringify(clean));
  const kept = validateAndMigrateSave(keptRaw, context());
  assert.equal(orderTotal(kept, 'lab'), 2, 'a valid order keeps every entry');
});

test('the repair does not invent entries for buildings the player never ordered', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  addTech(state, 'electricity');
  addTech(state, 'writing');
  state.buildings.lab = 3;
  // No lab entry at all: the grid appends missing units, so nothing is manufactured here.
  const raw = JSON.parse(JSON.stringify(state));
  const loaded = validateAndMigrateSave(raw, context());
  assert.equal(orderTotal(loaded, 'lab'), 0, 'absent entries stay absent');
  assert.equal(loaded.buildings.lab, 3);
});
