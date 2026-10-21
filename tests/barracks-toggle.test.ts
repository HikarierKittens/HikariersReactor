import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { BUILDINGS } from '../src/data/buildings';
import { TECHNOLOGIES } from '../src/data/technologies';
import { createInitialState } from '../src/state/create-state';
import { validateAndMigrateSave } from '../src/state/validate-save';
import { calculateMorale } from '../src/simulation/morale';
import { calculateSoldierPressure, calculateSoldierCapacity, calculateArmyLimit, calculateOperationalSoldierCapacity } from '../src/simulation/government';
import { advanceSoldierTraining, clampSoldiersToArmyLimit } from '../src/simulation/military';
import { calculateProduction } from '../src/simulation/production';
import { isBuildingUnderworking } from '../src/vue/building-status';
import { setBuildingPowerEnabled } from '../src/simulation/power-grid';
import { hasContinuousEnergyInput } from '../src/simulation/building-production';
import { countRunningBuildings } from '../src/simulation/housing';
import type { GameState } from '../src/types/state';

const context = { now: 0, eventInterval: 60, housingCapacity: () => 1e6, clampResources: () => undefined };

/** Complete prerequisite closure so the fixture passes the real save validator. */
function addTech(s: GameState, id: string): void {
  if (s.tech.includes(id as never)) return;
  for (const parent of TECHNOLOGIES[id as keyof typeof TECHNOLOGIES].pre) addTech(s, parent);
  s.tech.push(id as never);
}

/** 军营 owned but never powered: the switch must still be offered. */
function stateWith(barracks: number, stopped = 0): GameState {
  const s = createInitialState(CONFIG.version, 600, 0);
  addTech(s, 'military');
  s.buildings.barracks = barracks;
  s.stoppedBuildings.barracks = stopped;
  s.soldiers = 0;
  return s;
}

function moraleSnapshot() {
  return { generatorSpeed: 0, generatorEnergy: 0, coalRatio: 1, moonBaseUnits: 0, biologyUnits: 0, dataCenterUnits: 0, digital: { worldSimulatorUnits: 0, agiComponentUnits: 0 } };
}

test('军营 is registered as a toggleable building with no power demand', () => {
  assert.equal(BUILDINGS.barracks.toggleable, true, 'the switch is driven by the toggleable flag');
  assert.equal(BUILDINGS.barracks.input, undefined, 'a barracks draws no upkeep');
  assert.equal(hasContinuousEnergyInput('barracks', stateWith(1)), true, 'the UI shows the switch without any technology prerequisite');
});

test('switching barracks off lowers the army limit and the happiness pressure', () => {
  const s = stateWith(10);
  assert.equal(calculateArmyLimit(s), 20, 'ten barracks give twenty places');
  assert.equal(calculateSoldierPressure(s), 20, 'every switched-on place is a happiness cost');

  setBuildingPowerEnabled(s, 'barracks', -4);
  assert.equal(s.stoppedBuildings.barracks, 4, 'four barracks are switched off');
  assert.equal(countRunningBuildings('barracks', s), 6);
  assert.equal(calculateArmyLimit(s), 12, 'the four stopped barracks no longer count');
  assert.equal(calculateSoldierPressure(s), 12, 'happiness pressure drops with them');
  assert.equal(calculateSoldierCapacity(s), 20, 'the owned-count helper still reports every owned place');
});

test('the morale result itself improves when barracks are switched off', () => {
  const s = stateWith(10);
  s.population = 1;
  const before = calculateMorale(s, 1, moraleSnapshot());
  setBuildingPowerEnabled(s, 'barracks', -10);
  const after = calculateMorale(s, 1, moraleSnapshot());
  assert.equal(before.soldierPenalty, 20);
  assert.equal(after.soldierPenalty, 0);
  assert.ok(after.raw > before.raw, 'happiness recovers once the barracks are off');
  assert.ok(after.happiness >= before.happiness);
});

test('soldiers above the switched capacity are removed immediately', () => {
  const s = stateWith(10);
  s.soldiers = 15;
  setBuildingPowerEnabled(s, 'barracks', -5);
  assert.equal(s.soldiers, 10, 'five barracks switched off: the five surplus soldiers disappear at once');
  assert.equal(s.trainingProgress, 0, 'no training carry survives the removal');
  assert.equal(calculateArmyLimit(s), 10);
  assert.equal(calculateOperationalSoldierCapacity(s, 0), 10);
});

test('switching barracks off keeps the soldiers that still fit', () => {
  const s = stateWith(10);
  s.soldiers = 4;
  setBuildingPowerEnabled(s, 'barracks', -5);
  assert.equal(s.soldiers, 4, 'an army inside the new limit is untouched');
});

test('training never pushes the army past its limit', () => {
  const s = stateWith(10);
  s.soldiers = 15;
  const cap = calculateOperationalSoldierCapacity(s, 0);
  assert.equal(cap, 20, 'ten barracks give twenty training places');
  s.trainingProgress = 0;
  advanceSoldierTraining(s, 10);
  assert.ok(s.soldiers <= 20, 'training cannot exceed the limit');
  assert.ok(s.soldiers >= 15, 'training continues while places remain');
});

test('a resource dip pauses training instead of deleting soldiers', () => {
  const s = stateWith(4);
  s.buildings.spaceGarrison = 2;
  s.soldiers = 10;
  assert.equal(calculateArmyLimit(s), 12, 'four barracks plus two garrisons give twelve places');
  // Nothing is paid this step: the training capacity collapses, the limit does not.
  assert.equal(calculateOperationalSoldierCapacity(s, 0), 8);
  s.trainingProgress = 0;
  advanceSoldierTraining(s, 30, 0);
  assert.equal(s.soldiers, 10, 'unpaid upkeep never removes soldiers inside the limit');
  assert.equal(s.trainingProgress, 0, 'training waits for payment');
});

test('barracks switched off cannot be switched off again and clamp at zero', () => {
  const s = stateWith(3, 1);
  setBuildingPowerEnabled(s, 'barracks', -10);
  assert.equal(s.stoppedBuildings.barracks, 3, 'clamped to the owned count');
  setBuildingPowerEnabled(s, 'barracks', 10);
  assert.equal(s.stoppedBuildings.barracks, 0, 'clamped back to zero');
  assert.equal(countRunningBuildings('barracks', s), 3);
});

test('clamping is idempotent and reports how many soldiers were removed', () => {
  const s = stateWith(3);
  s.soldiers = 10;
  assert.equal(clampSoldiersToArmyLimit(s), 4, 'ten soldiers against six places removes four');
  assert.equal(s.soldiers, 6);
  assert.equal(clampSoldiersToArmyLimit(s), 0, 'a fitting army removes nobody');
});

test('军营 has no upkeep, so it is never reported as underworking', () => {
  const s = stateWith(2);
  const result = calculateProduction(s, 1);
  // Nothing to fund and nothing produced: the yellow shortage state would be meaningless.
  assert.equal(result.inputUnits.barracks || 0, 0);
  assert.equal(isBuildingUnderworking('barracks', s, result), false);
});

test('a real consumer is still flagged when its upkeep cannot be paid', () => {
  const s = stateWith(0);
  s.tech.push('artificialIntelligenceII');
  s.buildings.aiSupercore = 1;
  s.resources.helium3 = 0;
  const result = calculateProduction(s, 1);
  assert.equal(isBuildingUnderworking('aiSupercore', s, result), true, 'upkeep shortages must keep their warning');
});

test('a save with switched-off barracks loads and keeps the choice', () => {
  const s = stateWith(6, 2);
  s.buildings.nest = 6;
  s.population = 3;
  const loaded = validateAndMigrateSave(JSON.parse(JSON.stringify(s)), context);
  assert.equal(loaded.stoppedBuildings.barracks, 2, 'the switch position survives the save roundtrip');
  assert.equal(calculateArmyLimit(loaded), 8, 'the limit counts only the four running barracks');
});
