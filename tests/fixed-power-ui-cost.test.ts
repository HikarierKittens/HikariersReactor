import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { BUILDINGS } from '../src/data/buildings';
import { TECHNOLOGIES } from '../src/data/technologies';
import { ARPA_PROJECTS } from '../src/data/projects';
import { RESOURCES } from '../src/data/resources';
import { createInitialState } from '../src/state/create-state';
import { withoutPowerCost } from '../src/simulation/one-time-cost';
import { calculateBuildingCost, canPayCost, payResourceCost } from '../src/simulation/costs';
import { calculateTechCost } from '../src/simulation/government';
import { calculateProjectCost } from '../src/simulation/projects';
import { calculateQueueCost, buyBuildingNow } from '../src/simulation/purchases';
import { calculateResourceRemainingCost, investResourceProgress, resourceCompletionPercent } from '../src/simulation/project-funding';
import { calculateShipComponentRemainingCost, investInShipComponent } from '../src/simulation/spaceship';
import { isTechnologyUnlocked } from '../src/simulation/unlocks';
import type { BuildingId } from '../src/types/buildings';
import type { TechnologyId } from '../src/types/technologies';
const fresh = () => createInitialState(CONFIG.version, 60, 0);

test('one-time power fees never gate or debit funds and preserve other resources', () => {
  const state = fresh();
  state.resources.cash = 10;
  state.resources.energy = 0;
  const recipe = { energy: 1e9, cash: 10 };
  assert.deepEqual(withoutPowerCost(recipe), { cash: 10 });
  assert.deepEqual(recipe, { energy: 1e9, cash: 10 });
  assert.equal(canPayCost(state.resources, recipe), true);
  assert.equal(payResourceCost(state.resources, recipe), true);
  assert.equal(state.resources.cash, 0);
  assert.equal(state.resources.energy, 0);
  assert.equal(payResourceCost(state.resources, { energy: 1, cash: 1 }), false);
});

test('all building/technology/project quotes and queue quotes exclude energy', () => {
  const state = fresh();
  state.tech = Object.keys(TECHNOLOGIES) as TechnologyId[];
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    assert.equal(Object.hasOwn(calculateBuildingCost(id, 0, state), 'energy'), false, id);
    assert.equal(Object.hasOwn(calculateQueueCost(state, 'build', id, 2), 'energy'), false, `${id} queued`);
  }
  for (const id of Object.keys(TECHNOLOGIES) as TechnologyId[]) {
    assert.equal(Object.hasOwn(calculateTechCost(id, state), 'energy'), false, id);
    assert.equal(Object.hasOwn(calculateQueueCost(state, 'tech', id), 'energy'), false, `${id} queued`);
  }
  for (const id of Object.keys(ARPA_PROJECTS)) assert.equal(Object.hasOwn(calculateProjectCost(id, state), 'energy'), false, id);
});

test('a formerly power-priced building purchases with zero power stock', () => {
  const state = fresh();
  state.tech = Object.keys(TECHNOLOGIES) as TechnologyId[];
  // Inject a legacy fee locally; the registry itself may already be migrated.
  const original = BUILDINGS.nest.cost;
  try {
    BUILDINGS.nest.cost = { ...original, energy: 1000 };
    const cost = calculateBuildingCost('nest', 0, state);
    Object.assign(state.resources, cost, { energy: 0 });
    assert.equal(buyBuildingNow(state, 'nest', 100).bought, true);
    assert.equal(state.resources.energy, 0);
  } finally { BUILDINGS.nest.cost = original; }
});

test('independent project funding ignores historical energy deposits and preserves fuel costs', () => {
  const cost = { energy: 1000, helium3: 25, knowledge: 10 };
  const stock = { energy: 0, helium3: 25, knowledge: 10 };
  const progress = { energy: 0 };
  assert.deepEqual(calculateResourceRemainingCost(cost, progress), { helium3: 25, knowledge: 10 });
  const result = investResourceProgress(cost, stock, progress);
  assert.equal(result.complete, true);
  assert.deepEqual(result.spent, { helium3: 25, knowledge: 10 });
  assert.equal(resourceCompletionPercent(cost, progress), 100);
  assert.equal(stock.energy, 0);
  const state = fresh();
  state.buildings.interstellarDock = 1;
  state.shipComponents.hull = true;
  state.resources.knowledge = 1000000;
  assert.deepEqual(calculateShipComponentRemainingCost('computer', state), { knowledge: 1000000 });
  assert.equal(investInShipComponent('computer', 100, state).complete, true);
  assert.equal(state.resources.energy, 0);
});

test('retired power storage research remains earned but cannot unlock future purchases', () => {
  const state = fresh();
  state.tech = Object.keys(TECHNOLOGIES) as TechnologyId[];
  for (const id of ['energyStorage', 'batteryConcentrationRing'] as const) {
    assert.equal(isTechnologyUnlocked(id, state), false);
    assert.equal(state.tech.includes(id), true);
    assert.equal(TECHNOLOGIES[id].desc, '历史电力储存技术，不提供当前效果。');
  }
  assert.equal(RESOURCES.energy.cap, 0);
});

test('power UI uses fixed supply values in its own no-stock/no-rate/no-bar branch', () => {
  const source = readFileSync(new URL('../src/vue/components/ResourcePanel.vue', import.meta.url), 'utf8');
  const branch = source.split('<template v-if="row.id === \'energy\'">')[1]?.split('<template v-else>')[0];
  assert.ok(branch);
  assert.match(branch, /production\.power\.available/);
  assert.match(branch, /production\.power\.generated/);
  assert.match(branch, /剩余 \/ 总值/);
  assert.doesNotMatch(branch, /\/s(?!pan)|res-fill|data-tip-kind="storage"|储量/);
  const tooltip = readFileSync(new URL('../src/vue/components/TooltipPanel.vue', import.meta.url), 'utf8');
  const powerTip = tooltip.split("if (id === 'energy') {")[1]?.split('return tip;')[0];
  assert.ok(powerTip);
  assert.match(powerTip, /电力固定供给与占用/);
  assert.match(powerTip, /result\.power\.used/);
  assert.doesNotMatch(powerTip, /signedRate|calculateStorageDetails/);
  assert.match(tooltip, /resource === 'energy' \? '' : '\/s'/);
});
