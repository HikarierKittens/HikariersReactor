import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { calculateProduction } from '../src/simulation/production';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { allocateShipCrew, countSparePopulation, SHIP_CREW_JOB_NAME, SHIP_CREW_SIZE } from '../src/simulation/ship-crew';

function fresh() {
  const s = createInitialState(CONFIG.version, 60, 0);
  // A late-game save always has a civilian surplus; crew tests size it per case.
  s.resources.food = 1e6; s.resources.helium3 = 1e6; s.resources.energy = 1e6;
  return s;
}

test('采矿船 crew sizes are data: 铱/铁 1 cat, E-710 2 cats', () => {
  assert.equal(SHIP_CREW_JOB_NAME, '采矿船操作员');
  assert.equal(SHIP_CREW_SIZE.iridiumMiningShip, 1);
  assert.equal(SHIP_CREW_SIZE.ironMiningShip, 1);
  assert.equal(SHIP_CREW_SIZE.e710MiningShip, 2);
});

test('enabled ships draw their crew from the idle population', () => {
  const s = fresh(); s.population = 4;
  s.buildings.iridiumMiningShip = 2; s.buildings.ironMiningShip = 1; s.buildings.e710MiningShip = 1;
  const crew = allocateShipCrew(s);
  assert.deepEqual(crew.working, { iridiumMiningShip: 2, ironMiningShip: 1, e710MiningShip: 0 });
  assert.equal(crew.operators, 3, '2 + 1 + 0 crew');
  assert.equal(crew.required, 5, '2 + 1 + 2 crew would be needed');
  assert.equal(crew.shortfall, 2);
  assert.equal(countSparePopulation(s), 1);
  const production = calculateProduction(s);
  assert.equal(production.inputUnits.iridiumMiningShip, 2);
  assert.equal(production.inputUnits.ironMiningShip, 1);
  assert.equal(production.inputUnits.e710MiningShip || 0, 0, 'the last enabled ship stopped');
  assert.equal(production.rates.e710, 0);
});

test('manual assignments come first and the last enabled ship stops when idle cats run out', () => {
  const s = fresh(); s.population = 3;
  s.workers.forage = 2;
  s.buildings.iridiumMiningShip = 1; s.buildings.ironMiningShip = 1; s.buildings.e710MiningShip = 1;
  // One idle cat staffs 铱, 铁 is the last enabled ship and stops; E-710 never starts.
  const crew = allocateShipCrew(s);
  assert.deepEqual(crew.working, { iridiumMiningShip: 1, ironMiningShip: 0, e710MiningShip: 0 });
  assert.equal(crew.operators, 1);
  const preview = calculateSupportPreview(s);
  assert.equal(preview.shipCrew.operators, 1);
  assert.equal(preview.ironMiningShips, 0, 'cost context follows the actual funded ships');
});

test('disabling ships frees their crew and zero population stops every ship', () => {
  const s = fresh(); s.population = 1;
  s.buildings.iridiumMiningShip = 2;
  assert.equal(allocateShipCrew(s).working.iridiumMiningShip, 1, 'only one crew is available');
  assert.equal(allocateShipCrew(s).shortfall, 1);
  s.stoppedBuildings.iridiumMiningShip = 1;
  assert.equal(allocateShipCrew(s).working.iridiumMiningShip, 1, 'the remaining enabled ship keeps its crew');
  assert.equal(allocateShipCrew(s).shortfall, 0, 'disabling one ship removes its crew need too');
  s.population = 0;
  assert.equal(allocateShipCrew(s).operators, 0);
  assert.equal(calculateProduction(s).inputUnits.iridiumMiningShip, undefined, 'an uncrewed ship is not settled');
});

test('crew is derived, never stored: settlement does not mutate workers or the save', () => {
  const s = fresh(); s.population = 5;
  s.buildings.iridiumMiningShip = 1; s.buildings.e710MiningShip = 1;
  const before = JSON.stringify(s);
  const crew = allocateShipCrew(s);
  calculateProduction(s);
  calculateSupportPreview(s);
  assert.equal(JSON.stringify(s), before, 'crew allocation is read-only');
  assert.equal(s.workers.iridiumMiningShip, 0, 'crew is not written into the job assignment map');
  assert.equal(s.workers.e710MiningShip, 0);
  assert.equal(crew.operators, 3);
});

test('a population top-up restores the stopped ship without touching assignments', () => {
  const s = fresh(); s.population = 0;
  s.buildings.e710MiningShip = 1;
  assert.equal(calculateProduction(s).inputUnits.e710MiningShip || 0, 0);
  s.population = 2;
  const p = calculateProduction(s);
  assert.equal(p.inputUnits.e710MiningShip, 1);
  assert.ok(p.rates.e710 > 0);
  assert.equal(s.workers.e710MiningShip, 0);
});

test('previous-release save loses nothing: crew is derived after reload, never persisted', () => {
  const context = { now: 1_000_000, eventInterval: 60, housingCapacity: () => 1e6, clampResources: () => {} };
  const raw = JSON.parse(readFileSync(new URL('./fixtures/pre-beta0.6.5-schema31.json', import.meta.url), 'utf8'));
  // A late save that already owns asteroid-belt ships when this balance change lands.
  raw.asteroidBeltMissionCompleted = true;
  raw.tech = [...new Set([...raw.tech, 'asteroidBeltMining', 'exoticElementResearch'])];
  raw.population = 3;
  raw.buildings.iridiumMiningShip = 1; raw.buildings.ironMiningShip = 1;
  raw.resources.helium3 = 1e4; raw.resources.food = 1e4;
  const loaded = validateCurrentSave(raw, context);
  assert.equal(Object.hasOwn(loaded.workers, 'iridiumMiningShip'), true);
  assert.equal(loaded.workers.iridiumMiningShip, 0, 'no crew is written into an old save');
  const crew = allocateShipCrew(loaded);
  assert.equal(crew.operators, 2, 'both ships get a crew from the existing population');
  assert.equal(calculateProduction(loaded).inputUnits.iridiumMiningShip, 1);
  // Save → reload keeps the same derived crew and the untouched schema.
  const reloaded = validateCurrentSave(JSON.parse(JSON.stringify(loaded)), context);
  assert.deepEqual(allocateShipCrew(reloaded), crew);
  assert.equal(reloaded.version, CONFIG.version);
  assert.equal(reloaded.workers.iridiumMiningShip, 0);
  assert.equal(Object.hasOwn(reloaded, 'shipCrew'), false, 'no new state field was introduced for the crew');
});
