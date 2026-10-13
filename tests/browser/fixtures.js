import { createInitialState } from '../../src/state/create-state';
import { CONFIG } from '../../src/data/config';
import { TECHNOLOGIES } from '../../src/data/technologies';
import { BUILDINGS } from '../../src/data/buildings';

/** Complete prerequisite closures plus actual storage; accepted by runtime.replaceState. */
export function advancedFixture() {
  const state = createInitialState(CONFIG.version, 600, Date.now());
  const tech = new Set();
  const add = id => { if (tech.has(id)) return; TECHNOLOGIES[id].pre.forEach(add); tech.add(id); };
  const buildings = { nest: 10, forage: 4, warehouse: 30, factory: 2, foundry: 2,
    mine: 2, containerWarehouse: 2, orbitalFuelDepot: 5, asrielSpaceport: 0 };
  for (const id of ['rocketry', 'arpa', 'planetaryExploration', 'helium3Storage']) add(id);
  for (const id of Object.keys(buildings)) add(BUILDINGS[id].tech);
  state.tech = [...tech];
  Object.assign(state.buildings, buildings);
  state.stoppedBuildings.factory = 2;
  state.population = 5;
  Object.assign(state.resources, { food: 80, wood: 1000, stone: 1000, iron: 500, metal: 1500, alloy: 500, helium3: 5000 });
  return state;
}
