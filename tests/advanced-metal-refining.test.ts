import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { validateCurrentSave } from '../src/state/validate-save';
import type { TechnologyId } from '../src/types/technologies';
import { createInitialState } from '../src/state/create-state';
import { calculateProduction } from '../src/simulation/production';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateAluminumMultiplier } from '../src/simulation/multipliers';
import { calculateRefiningMultiplier, calculatePoweredMetalRefineryUnits } from '../src/simulation/refining';
import { calculateBuildingInput, hasContinuousEnergyInput } from '../src/simulation/building-production';
import { calculateResourceBreakdown, calculateResourceFactorRows } from '../src/simulation/resource-breakdown';
import { applyResearchSideEffects } from '../src/simulation/purchases';
import { supplyPower } from './support/power';

function state() {
  const s = createInitialState(CONFIG.version, 60, 0);
  s.buildings.metalRefinery = 3;
  s.buildings.quarry = 1; s.workers.quarry = 1;
  supplyPower(s, 100);
  return s;
}
function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);
}

test('advanced refining definition and the unconditional original aluminum baseline', () => {
  const tech = TECHNOLOGIES.advancedMetalRefining;
  assert.equal(tech.tier, 14);
  assert.equal(tech.cost.knowledge, 380000);
  assert.deepEqual(tech.pre, ['geothermalFurnace']);
  const s = state(); s.stoppedBuildings.metalRefinery = 3;
  close(calculateAluminumMultiplier(s), 1.18);
  close(calculateProduction(s).rates.aluminum, 1.02 * 1.18);
  assert.equal(hasContinuousEnergyInput('metalRefinery', s), false);
  assert.deepEqual(calculateBuildingInput('metalRefinery', s), {});
  const result = calculateProduction(s);
  assert.equal(result.power.used, 0);
  close(result.power.available, 100);
  close(result.rates.energy, 100);
});

test('funded refineries stack 8% aluminum and 1% steel and 0.5% iridium, charge exactly 4 once without workers', () => {
  const s = state(); s.tech.push('advancedMetalRefining');
  const before = structuredClone(s);
  const result = calculateProduction(s);
  assert.equal(s.workers.metalRefinery, 0);
  assert.equal(result.inputUnits.metalRefinery, 3);
  assert.deepEqual(result.power, { generated: 100, used: 12, available: 88 });
  close(result.rates.energy, 88);
  close(result.rates.aluminum, 1.02 * 1.24);
  close(calculateRefiningMultiplier('metal', s), 1.03);
  close(calculateRefiningMultiplier('iridium', s), 1.015);
  close(calculateAluminumMultiplier(s), 1.24);
  assert.equal(calculatePoweredMetalRefineryUnits(s), 3);
  assert.deepEqual(s, before);
  const energy = calculateResourceBreakdown('energy', s, result);
  assert.equal(energy.entries.filter(e => e.id === 'metalRefinery').length, 1);
  close(energy.net, result.rates.energy);
});

test('shortage funds whole enabled units and preserves 6% passive baseline for unfunded/stopped owned buildings', () => {
  for (const dt of [.2, 1, 3]) {
    const s = state(); s.tech.push('advancedMetalRefining');
    supplyPower(s, 7.9);
    const before = structuredClone(s);
    const result = calculateProduction(s, dt);
    assert.equal(result.inputUnits.metalRefinery, 1);
    assert.equal(calculateSupportPreview(s, dt).metalRefineryUnits, 1);
    assert.equal(result.power.generated, 7.9); close(result.power.used, 4); close(result.power.available, 3.9);
    assert.equal(result.pool.energy, 0, 'electricity is a fixed budget, not stored');
    close(result.rates.aluminum, 1.02 * 1.2);
    close(calculateResourceBreakdown('aluminum', s, result).net, result.rates.aluminum);
    const factors = calculateResourceFactorRows('aluminum', s, result).rows;
    assert.equal(factors.find(r => r.name === '金属精炼厂')?.value, '+20%');
    assert.deepEqual(s, before);
    s.stoppedBuildings.metalRefinery = 3;
    const stopped = calculateProduction(s, dt);
    assert.equal(stopped.inputUnits.metalRefinery, 0);
    assert.equal(stopped.power.generated, 7.9); close(stopped.power.used, 0); close(stopped.power.available, 7.9);
    close(stopped.rates.aluminum, 1.02 * 1.18);
    close(calculateRefiningMultiplier('metal', s), 1);
    close(calculateRefiningMultiplier('iridium', s), 1);
    s.stoppedBuildings.metalRefinery = 0; supplyPower(s, 0);
    close(calculateProduction(s, dt).rates.aluminum, 1.02 * 1.18);
  }
});

test('refining applies to ground steel and lunar/outer space iridium before source outputs', () => {
  const s = state(); s.buildings.metalRefinery = 1;
  s.buildings.smelter = 1; s.resources.iron = 100; s.resources.coal = 100;
  s.buildings.moonBase = 1; s.buildings.iridiumMine = 1; s.resources.oil = 100;
  s.buildings.iridiumMiningShip = 1; s.resources.helium3 = 100;
  const original = calculateProduction(s);
  s.tech.push('advancedMetalRefining');
  const advanced = calculateProduction(s);
  close(advanced.rates.metal, original.rates.metal * 1.01);
  close(advanced.rates.iridium, original.rates.iridium * 1.005);
  for (const id of ['iridiumMine', 'iridiumMiningShip']) {
    const actual = advanced.outputs[id], baseline = original.outputs[id];
    assert.ok(actual !== undefined && baseline !== undefined);
    close(actual, baseline * 1.005);
  }
  for (const resource of ['metal', 'iridium', 'aluminum'] as const) {
    close(calculateResourceBreakdown(resource, s, advanced).net, advanced.rates[resource]);
    assert.equal(calculateResourceFactorRows(resource, s, advanced).rows.find(r => r.name === '金属精炼厂')?.value, resource === 'aluminum' ? '+8%' : resource === 'iridium' ? '+0.5%' : '+1%');
  }
});

test('existing lunar maintenance has priority and preview counts agree without recursive production', () => {
  const s = state(); s.tech.push('advancedMetalRefining'); s.buildings.metalRefinery = 1;
  s.buildings.moonBase = 1; s.buildings.iridiumMine = 1; s.resources.oil = 100;
  for (const energy of [4, 7.9, 8]) {
    supplyPower(s, energy);
    const preview = calculateSupportPreview(s);
    const production = calculateProduction(s);
    assert.equal(preview.moon.baseUnits, 1);
    assert.equal(preview.metalRefineryUnits, energy >= 8 ? 1 : 0);
    assert.equal(preview.metalRefineryUnits, production.inputUnits.metalRefinery);
    close(calculateRefiningMultiplier('iridium', s), energy >= 8 ? 1.005 : 1);
  }
});

test('valid current saves preserve advanced refining research and reject missing prerequisites', () => {
  const s = createInitialState(CONFIG.version, 60, 0);
  const add = (id: TechnologyId) => {
    for (const parent of TECHNOLOGIES[id].pre) add(parent);
    if (!s.tech.includes(id)) s.tech.push(id);
  };
  add('advancedMetalRefining'); s.kerberosMissionCompleted = true;
  const context = { now: 0, eventInterval: 60, housingCapacity: () => 100, clampResources: () => {} };
  const restored = validateCurrentSave(JSON.parse(JSON.stringify(s)), context);
  assert.ok(restored.tech.includes('advancedMetalRefining'));
  s.tech = s.tech.filter(id => id !== 'geothermalFurnace');
  assert.throws(() => validateCurrentSave(s, context), /科技前置关系无效/);
});

test('research makes existing refineries continuous-power consumers and defaults them stopped', () => {
  const s = state(), previous = [...s.tech]; s.tech.push('advancedMetalRefining');
  const effect = applyResearchSideEffects(s, 'advancedMetalRefining', previous);
  assert.ok(effect.poweredShutdown.includes('metalRefinery'));
  assert.equal(s.stoppedBuildings.metalRefinery, 3);
  assert.equal(hasContinuousEnergyInput('metalRefinery', s), true);
  assert.deepEqual(calculateBuildingInput('metalRefinery', s), { energy: 4 });
  const settled = calculateProduction(s);
  assert.equal(settled.power.used, 0);
  assert.equal(settled.power.available, 100);
  close(settled.rates.aluminum, 1.02 * 1.18);
});
