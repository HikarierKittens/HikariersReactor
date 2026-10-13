import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInitialState } from '../src/state/create-state';
import { CONFIG } from '../src/data/config';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateBiologyUnits, calculateDataCenterUnits } from '../src/simulation/research-power';
import { calculateSwarmSupportCapacity, calculateQuantumLevel } from '../src/simulation/quantum';
import { previewMorale } from '../src/simulation/production';
import { calculateMorale } from '../src/simulation/morale';
import { settlePowerPlants, isPowerProducer } from '../src/simulation/power';
import { allocateMoonSupport } from '../src/simulation/moon';
import { countRunningBuildings } from '../src/simulation/housing';
import { BUILDINGS } from '../src/data/buildings';
import type { BuildingId } from '../src/types/buildings';
import type { GameState } from '../src/types/state';

function legacyMorale(state: GameState, dt: number) {
  const plants = settlePowerPlants({ ...state.resources }, dt, state);
  const coalSpeed = countRunningBuildings('generator', state);
  const moonPool = { ...state.resources };
  settlePowerPlants(moonPool, dt, state);
  const support = calculateSupportPreview(state, dt);
  return calculateMorale(state, dt, {
    waystationUnits: support.waystations, navigationBeaconUnits: support.moon.beaconUnits || 0,
    generatorSpeed: (Object.keys(BUILDINGS) as BuildingId[]).filter(isPowerProducer).reduce((sum, id) => sum + countRunningBuildings(id, state), 0),
    generatorEnergy: plants.energy, coalRatio: coalSpeed ? (plants.outputs.generator || 0) / coalSpeed : 1,
    moonBaseUnits: allocateMoonSupport(state, moonPool, dt).baseUnits,
    biologyUnits: calculateBiologyUnits(state, dt), dataCenterUnits: calculateDataCenterUnits(state, dt),
  });
}

test('shared research reservations preserve the legacy morale result across timesteps and shortages with fewer inventory reads', () => {
  for (const dt of [.2, 1]) for (const energy of [0, 1, 7, 1000]) {
    const state = createInitialState(CONFIG.version, 60, 0);
    state.buildings.biologyLab = 3; state.buildings.observatory = 2;
    state.buildings.navigationBeacon = 2; state.buildings.broadcast = 2;
    state.buildings.hydrogenPowerPlant = 1; state.buildings.iceMiningShip = 1;
    state.tech.push('spaceBroadcasting', 'hydrogenRecovery');
    state.resources.energy = energy; state.resources.water = 2 * dt;
    const before = JSON.stringify(state);
    let reads = 0;
    const counted = new Proxy(state, { get(target, key, receiver) { if (key === 'resources') reads++; return Reflect.get(target, key, receiver); } });
    const expected = legacyMorale(counted, dt), legacyReads = reads;
    reads = 0;
    assert.deepEqual(previewMorale(counted, dt), expected);
    assert.ok(reads < legacyReads, `fewer inventory reads at dt=${dt}, energy=${energy}`);
    assert.equal(JSON.stringify(state), before);
  }
});

test('non-quantum swarm support never reads inventory, while explicit zero and computed quantum remain supported', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.buildings.swarmControlStation = 3; state.stoppedBuildings.swarmControlStation = 1;
  const guarded = new Proxy(state, { get(target, key, receiver) { if (key === 'resources') throw Error('unnecessary quantum solve'); return Reflect.get(target, key, receiver); } });
  assert.equal(calculateSwarmSupportCapacity(guarded), 40);
  assert.equal(calculateSwarmSupportCapacity(guarded, 99), 40);
  state.tech.push('quantumSwarm', 'artificialIntelligenceII');
  assert.equal(calculateSwarmSupportCapacity(guarded, 0), 40);
  assert.equal(calculateSwarmSupportCapacity(guarded, 5), 50);
  assert.equal(calculateSwarmSupportCapacity(state), 2 * (20 + calculateQuantumLevel(state)));
});
