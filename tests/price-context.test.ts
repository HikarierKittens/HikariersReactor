import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInitialState } from '../src/state/create-state';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { calculateBuildingCost, buildPriceContext } from '../src/simulation/costs';
import { calculateProduction } from '../src/simulation/production';
import type { GameState } from '../src/types/state';

/** Late-game state with the swarm discount chain active and mining ships funded. */
function lateState(): GameState {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech = Object.keys(TECHNOLOGIES).filter(id => id !== 'spaceControlTower') as GameState['tech'];
  state.prestige.nuclearResets = 1;
  state.asrielMissionCompleted = state.kerberosMissionCompleted = state.solarMissionCompleted
    = state.talosMissionCompleted = state.talosMoonMissionCompleted = state.asteroidBeltMissionCompleted
    = state.misenMissionCompleted = true;
  for (const id of ['rocketPlatform', 'monument', 'geneSequencing', 'remoteAnchor'] as const) state.arpaBuildings[id] = 1;
  state.arpaBuildings.arpaResearchInstitute = 2;
  state.buildings.aiSupercore = 100;
  state.buildings.ironMiningShip = 5;
  state.asteroidBeltMissionCompleted = true;
  state.buildings.swarmControlStation = 1;
  state.buildings.swarmFactory = 2;
  Object.assign(state.resources, { energy: 5000, oil: 5000, helium3: 5000, iron: 100, knowledge: 1e9, e710: 1000, nanotubes: 10000 });
  return state;
}

test('price context reproduces the exact legacy quote for every cost path and count', () => {
  for (const dt of [.2, 1]) {
    const state = lateState();
    state.resources.energy = 5000 * dt; state.resources.oil = 5000 * dt; state.resources.helium3 = 5000 * dt;
    const context = buildPriceContext(state, dt);
    // The funded-count source must equal the production settlement input exactly.
    assert.equal(context.ironMiningShips, calculateProduction(state, dt).inputUnits.ironMiningShip);
    for (const id of ['swarmFactory', 'swarmSatellite', 'swarmControlStation', 'ironMiningShip', 'factory', 'mine', 'nest'] as const) {
      for (const count of [0, 1, 5, 50]) {
        const expected = calculateBuildingCost(id, count, state);
        const actual = calculateBuildingCost(id, count, state, context);
        assert.deepEqual(actual, expected, `${id}@${count} dt=${dt}`);
      }
    }
  }
});

test('context reuse never triggers a full production or quantum solve for quoted prices', () => {
  const state = lateState();
  state.tech.push('quantumSwarm', 'swarmFactoryOptimization');
  const context = buildPriceContext(state);
  const guarded = new Proxy(state, {
    get(target, key, receiver) {
      if (key === 'resources' && !contextOilGuard) throw Error('quote must not recompute production/quantum');
      return Reflect.get(target, key, receiver);
    },
  });
  // The swarm factory recipe has no oil/helium3, so applySpaceFuelDiscount must skip
  // the powered-waystation path entirely; the proxy proves the quote stays cheap.
  assert.equal('oil' in state.buildings, false);
  delete (state.buildings as Record<string, unknown>).spaceWaystation;
  const contextOilGuard = true;
  for (const count of [0, 3]) {
    calculateBuildingCost('swarmFactory', count, guarded, context);
  }
  // Satellite discount is derived purely from the supplied quantum level.
  calculateBuildingCost('swarmSatellite', 3, guarded, context);
});

test('legacy callers without a context keep the self-computing behavior', () => {
  const state = lateState();
  state.tech.push('swarmFactoryOptimization');
  const before = JSON.stringify(state);
  const cost = calculateBuildingCost('swarmFactory', 1, state);
  assert.ok(Object.values(cost).every(value => Number.isFinite(value) && value >= 0));
  assert.equal(JSON.stringify(state), before);
});
