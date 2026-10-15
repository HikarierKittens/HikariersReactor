import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { BUILDINGS } from '../src/data/buildings';
import { TECHNOLOGIES } from '../src/data/technologies';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { calculateBuildingInput, calculateBuildingOutput, calculateToolMultiplier } from '../src/simulation/building-production';
import { calculateProduction } from '../src/simulation/production';
import { calculateResourceBreakdown } from '../src/simulation/resource-breakdown';
import { calculateTechCost } from '../src/simulation/government';
import { initializeTechnologyCosts } from '../src/simulation/technology';
import { researchTechnologyNow } from '../src/simulation/purchases';
import { updateProgression } from '../src/simulation/progression';
import { isTechnologyUnlocked } from '../src/simulation/unlocks';
import type { TechnologyId } from '../src/types/technologies';
import type { BuildingId } from '../src/types/buildings';
import type { ResourceId } from '../src/types/economy';

const fresh = () => createInitialState(CONFIG.version, 60, 0);
function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);
}
const cases = [
  { id: 'alloyDrill', tier: 8, pre: 'automation', resource: 'alloy', producer: 'factory', knowledge: 44000, material: 'alloy', amount: 500 },
  { id: 'alloyChainsaw', tier: 8, pre: 'automation', resource: 'alloy', producer: 'factory', knowledge: 44000, material: 'alloy', amount: 500 },
  { id: 'silicateCement', tier: 5, pre: 'metallurgy', resource: 'cement', producer: 'cementWorkshop', knowledge: 5000, material: 'stone', amount: 1000 },
] as const;

for (const c of cases) {
  test(`${c.id}: explicit tier, prices and prerequisite/resource gates`, () => {
    const definition = TECHNOLOGIES[c.id];
    assert.equal(definition.tier, c.tier);
    assert.equal(definition.knowledgeCost, c.knowledge);
    assert.deepEqual(definition.cost, { knowledge: c.knowledge, [c.material]: c.amount });
    assert.deepEqual(definition.pre, c.id === 'silicateCement' ? ['metallurgy', 'cement'] : [c.pre]);
    assert.equal(definition.resourceRequired, c.id === 'silicateCement' ? undefined : c.resource);
    const definitions = structuredClone(TECHNOLOGIES);
    initializeTechnologyCosts(definitions);
    assert.deepEqual(definitions[c.id].cost, definition.cost, 'tier initialization preserves the explicit price');
    const s = fresh();
    s.tech.push(c.pre);
    if (c.id === 'silicateCement') {
      assert.equal(isTechnologyUnlocked(c.id, s), false, 'metallurgy alone is insufficient');
      s.tech = ['cement'];
      assert.equal(isTechnologyUnlocked(c.id, s), false, 'cement alone is insufficient');
      s.tech.push('metallurgy');
      assert.equal(isTechnologyUnlocked(c.id, s), true, 'both technologies suffice without a resource producer');
      return;
    }
    s.resources[c.resource] = 1;
    assert.equal(isTechnologyUnlocked(c.id, s), false, 'inventory alone does not unlock research');
    s.buildings[c.producer] = 1;
    assert.equal(isTechnologyUnlocked(c.id, s), true);
    s.tech = [];
    assert.equal(isTechnologyUnlocked(c.id, s), false, 'producer does not bypass prerequisite');
    s.tech.push(c.pre);
    updateProgression(s);
    assert.ok(s.unlockedResources.includes(c.resource));
    s.buildings[c.producer] = 0;
    s.resources[c.resource] = 0;
    assert.equal(isTechnologyUnlocked(c.id, s), true, 'resource discovery remains sticky without producer or inventory');
    s.tech = [];
    assert.equal(isTechnologyUnlocked(c.id, s), false);
  });

  test(`${c.id}: actual research charges knowledge and material exactly once`, () => {
    for (const technocracy of [false, true]) {
      const s = fresh();
      s.tech.push(c.pre);
      if (c.id === 'silicateCement') s.tech.push('cement');
      else s.unlockedResources.push(c.resource);
      if (technocracy) s.government = 'technocracy';
      const knowledge = technocracy ? Math.ceil(c.knowledge * .92) : c.knowledge;
      assert.deepEqual(calculateTechCost(c.id, s), { knowledge, [c.material]: c.amount });
      s.resources.knowledge = knowledge;
      s.resources[c.material] = c.amount - 1;
      const before = structuredClone(s);
      assert.equal(researchTechnologyNow(s, c.id).bought, false);
      assert.deepEqual(s, before, 'failed payment is atomic');
      s.resources[c.material] = c.amount;
      s.resources.knowledge = knowledge - 1;
      assert.equal(researchTechnologyNow(s, c.id).bought, false);
      assert.equal(s.resources[c.material], c.amount);
      s.resources.knowledge = knowledge;
      assert.equal(researchTechnologyNow(s, c.id).bought, true);
      assert.equal(s.resources.knowledge, 0);
      assert.equal(s.resources[c.material], 0);
      assert.equal(s.tech.filter(id => id === c.id).length, 1);
      assert.equal(researchTechnologyNow(s, c.id).bought, false);
    }
  });
}

test('alloy tools replace older tiers only for their own jobs; all other building multipliers stay unchanged', () => {
  for (const old of [[], ['ironTools'], ['ironTools', 'steelTools']] as TechnologyId[][]) {
    for (const added of [['alloyDrill'], ['alloyChainsaw'], ['alloyDrill', 'alloyChainsaw']] as TechnologyId[][]) {
      const before = { tech: old };
      const after = { tech: [...old, ...added] };
      for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
        const affected = (['quarry', 'mine', 'coalMine'].includes(id) && added.includes('alloyDrill'))
          || (id === 'lumber' && added.includes('alloyChainsaw'));
        close(calculateToolMultiplier(id, after), affected ? 2 : calculateToolMultiplier(id, before));
      }
      close(calculateToolMultiplier('forage', after), old.includes('steelTools') ? 1.5 : old.includes('ironTools') ? 1.25 : 1);
    }
  }
  close(calculateToolMultiplier('coalMine', { tech: ['ironTools'] }), 1);
  close(calculateToolMultiplier('coalMine', { tech: ['steelTools'] }), 1.5);
});

test('alloy job production and resource breakdown agree including mining byproducts and unchanged forage', () => {
  for (const id of ['forage', 'lumber', 'quarry', 'mine', 'coalMine'] as const) {
    for (const dt of [.2, 1, 3]) for (const steel of [false, true]) {
      const s = fresh();
      s.tech.push('nuclearEnergy');
      if (steel) s.tech.push('ironTools', 'steelTools');
      s.buildings[id] = 2;
      s.workers[id] = 2;
      if (id === 'quarry') s.buildings.metalRefinery = 1;
      const original = calculateProduction(s, dt);
      s.tech.push('alloyDrill', 'alloyChainsaw');
      const snapshot = structuredClone(s);
      const upgraded = calculateProduction(s, dt);
      for (const resource of Object.keys(calculateBuildingOutput(id, s)) as ResourceId[]) {
        const base = calculateResourceBreakdown(resource, { ...s, tech: s.tech.filter(t => t !== 'alloyDrill' && t !== 'alloyChainsaw') }, original);
        const breakdown = calculateResourceBreakdown(resource, s, upgraded);
        const baselineEntry = base.entries.find(e => e.id === id);
        const entry = breakdown.entries.find(e => e.id === id);
        assert.ok(baselineEntry && entry, `${id}/${resource} source is visible`);
        assert.ok(baselineEntry.value > 0);
        close(entry.value, baselineEntry.value * (id === 'forage' ? 1 : 2 / (steel ? 1.5 : 1)));
        close(breakdown.net, upgraded.rates[resource]);
        close(base.net, original.rates[resource]);
      }
      assert.deepEqual(s, snapshot, 'production preview is pure');
    }
  }
});

test('silicate cement increases base and actual cement by 50% without increasing inputs, including shortages and mixers', () => {
  for (const mixer of [false, true]) for (const dt of [.2, 1, 3]) for (const stone of [0, .5, 1000]) {
    const s = fresh();
    s.buildings.cementWorkshop = 2;
    s.workers.cementWorkshop = 2;
    s.resources.stone = stone;
    s.resources.energy = 100;
    if (mixer) s.tech.push('cementMixer');
    const baseOutput = calculateBuildingOutput('cementWorkshop', s);
    const baseInput = structuredClone(calculateBuildingInput('cementWorkshop', s));
    const original = calculateProduction(s, dt);
    s.tech.push('silicateCement');
    const snapshot = structuredClone(s);
    close(calculateBuildingOutput('cementWorkshop', s).cement!, baseOutput.cement! * 1.5);
    assert.deepEqual(calculateBuildingInput('cementWorkshop', s), baseInput);
    const upgraded = calculateProduction(s, dt);
    close(upgraded.rates.cement, original.rates.cement * 1.5);
    close(upgraded.rates.stone, original.rates.stone);
    close(upgraded.rates.energy, original.rates.energy);
    close(upgraded.inputUnits.cementWorkshop!, original.inputUnits.cementWorkshop!);
    for (const resource of ['cement', 'stone', 'energy'] as const) {
      close(calculateResourceBreakdown(resource, s, upgraded).net, upgraded.rates[resource]);
    }
    assert.deepEqual(s, snapshot);
  }
});

test('strict current saves round-trip researched worker technologies with complete prerequisite closure', () => {
  const s = fresh();
  const add = (id: TechnologyId) => {
    for (const parent of TECHNOLOGIES[id].pre) add(parent);
    if (!s.tech.includes(id)) s.tech.push(id);
  };
  for (const c of cases) add(c.id);
  // Research is permanent: validation requires parent technologies, not a still-owned resource producer.
  const context = { now: 0, eventInterval: 60, housingCapacity: () => 100, clampResources: () => {} };
  const restored = validateCurrentSave(JSON.parse(JSON.stringify(s)), context);
  assert.deepEqual(restored.tech, s.tech);
  for (const c of cases) assert.ok(restored.tech.includes(c.id));
  for (const parent of ['automation', 'metallurgy', 'cement'] as const) {
    const invalid = structuredClone(s);
    invalid.tech = invalid.tech.filter(id => id !== parent);
    assert.throws(() => validateCurrentSave(invalid, context), /科技前置关系无效/);
  }
});
