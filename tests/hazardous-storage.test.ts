import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { BUILDINGS } from '../src/data/buildings';
import { TECHNOLOGIES } from '../src/data/technologies';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { calculateStorageBonuses } from '../src/simulation/storage-bonuses';
import { calculateStorageDetails, calculateStorageTotals } from '../src/simulation/storage';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { isBuildingUnlocked, isTechnologyUnlocked } from '../src/simulation/unlocks';
import { calculateBuildingScale } from '../src/simulation/costs';

const fresh = () => createInitialState(CONFIG.version, 60, 0);
const snapshot = (s: ReturnType<typeof fresh>) => {
  const p = calculateSupportPreview(s);
  return { ...p, moonBaseUnits: p.moon.baseUnits };
};

test('hazardous storage research follows stellar forge and gates the regional building', () => {
  const s = fresh(), tech = TECHNOLOGIES.hazardousMaterialStorage;
  assert.equal(tech.name, '危险物质库');
  assert.equal(tech.tier, 21);
  assert.equal(tech.knowledgeCost, 1750000);
  assert.deepEqual(tech.cost, { knowledge: 1750000, nanoAlloy: 25000 });
  assert.deepEqual(tech.pre, ['stellarForge']);
  assert.equal(isTechnologyUnlocked('hazardousMaterialStorage', s), false);
  s.tech.push('stellarForge');
  assert.equal(isTechnologyUnlocked('hazardousMaterialStorage', s), true);
  assert.equal(isBuildingUnlocked('hazardousMaterialStorage', s), false);
  s.tech.push('hazardousMaterialStorage');
  assert.equal(isBuildingUnlocked('hazardousMaterialStorage', s), false);
  s.neutronStarMissionCompleted = true;
  assert.equal(isBuildingUnlocked('hazardousMaterialStorage', s), true);
  assert.equal(s.buildings.hazardousMaterialStorage, 0);
  assert.deepEqual(BUILDINGS.hazardousMaterialStorage.cost, { adamantite: 10000, nanoAlloy: 10000 });
  for (const resource of ['adamantite', 'nanoAlloy'] as const) {
    assert.equal(calculateBuildingScale('hazardousMaterialStorage', resource, s), 1.265);
  }
});

test('hazardous stores add passive E710 and neutron capacity with detail/total parity', () => {
  const s = fresh();
  const before = calculateStorageTotals(s, snapshot(s));
  s.buildings.hazardousMaterialStorage = 3;
  s.tech.push('higherDimensionalStorage');
  const p = snapshot(s), after = calculateStorageTotals(s, p);
  for (const [resource, capacity] of [['e710', 1500], ['neutron', 96000]] as const) {
    assert.equal(after[resource] - before[resource], capacity);
    const details = calculateStorageDetails(resource, s, p);
    assert.equal(details.total, after[resource]);
    assert.equal(details.rows.find(row => row.name.startsWith('危险物质库'))?.value, capacity);
  }
});

test('asteroid base new capacities double alongside existing stores', () => {
  const s = fresh();
  assert.deepEqual(calculateStorageBonuses('asteroidBase', s, null), { water: 8000, helium3: 4000, neutron: 8000 });
  s.buildings.gasCloudMiningShip = 1;
  s.tech.push('higherDimensionalStorage');
  assert.deepEqual(calculateStorageBonuses('asteroidBase', s, null), { water: 16000, helium3: 8000, neutron: 16000, deuterium: 4000 });
});

test('asteroid capacity follows powered supported bases and disappears when stopped', () => {
  const s = fresh();
  s.tech.push('dimensionBeaconDeployment');
  s.buildings.hyperspaceSpaceport = 2;
  s.buildings.iceMiningShip = 1;
  s.buildings.asteroidBase = 2;
  Object.assign(s.resources, { energy: 1000, helium3: 1000 });
  for (const multiplier of [1, 2]) {
    if (multiplier === 2) s.tech.push('higherDimensionalStorage');
    const p = snapshot(s);
    assert.equal(p.stageThree.asteroidBases, 2);
    for (const [resource, capacity] of [['helium3', 8000], ['neutron', 16000]] as const) {
      const details = calculateStorageDetails(resource, s, p);
      assert.equal(details.rows.find(row => row.name.startsWith('小行星基地'))?.value, capacity * multiplier);
      assert.equal(details.total, calculateStorageTotals(s, p)[resource]);
    }
  }
  s.stoppedBuildings.asteroidBase = 2;
  assert.equal(snapshot(s).stageThree.asteroidBases, 0);
  for (const resource of ['helium3', 'neutron'] as const) {
    assert.equal(calculateStorageDetails(resource, s, snapshot(s)).rows.some(row => row.name.startsWith('小行星基地')), false);
  }
  s.stoppedBuildings.asteroidBase = 0;
  s.resources.energy = 0;
  assert.equal(snapshot(s).stageThree.asteroidBases, 0);
});

test('generated legacy bridge contains dangerous storage and upgraded asteroid capacities', () => {
  const require = createRequire(import.meta.url);
  const { loadGame } = require('./load-game.cjs');
  const context = vm.createContext({ console });
  loadGame(context);
  const result = vm.runInContext(`(() => {
    const s = createInitialState(CONFIG.version, 60, 0);
    s.tech.push('higherDimensionalStorage');
    return JSON.stringify({ cost: TECHNOLOGIES.hazardousMaterialStorage.cost, store: calculateStorageBonuses('hazardousMaterialStorage', s, null), asteroid: calculateStorageBonuses('asteroidBase', s, null) });
  })()`, context);
  assert.deepEqual(JSON.parse(result), {
    cost: { knowledge: 1750000, nanoAlloy: 25000 },
    store: { e710: 500, neutron: 32000 },
    asteroid: { water: 16000, helium3: 8000, neutron: 16000 },
  });
});
