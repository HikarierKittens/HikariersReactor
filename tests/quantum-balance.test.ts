import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { FACTORY_OPTIONS } from '../src/data/resources';
import { createInitialState } from '../src/state/create-state';
import { calculateQuantumSnapshot, calculateQuantumManufacturingMultiplier, calculateQuantumSwarmFactoryReduction, calculateSwarmSupportCapacity } from '../src/simulation/quantum';
import { calculateBuildingCost } from '../src/simulation/costs';
import { calculateProduction } from '../src/simulation/production';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateResourceBreakdown, calculateResourceFactorRows } from '../src/simulation/resource-breakdown';
import type { ResourceId } from '../src/types/economy';
import { supplyPower } from './support/power';
const fresh = () => createInitialState(CONFIG.version, 60, 0);
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('quantum uses logarithmic knowledge capacity and floors only after funded additive multipliers', () => {
  const s = fresh(); s.buildings.library = 100;
  const support = calculateSupportPreview(s);
  const snapshot = { ...support, moonBaseUnits: support.moon.baseUnits };
  const locked = calculateQuantumSnapshot(s, snapshot, 4); assert.equal(locked.base, 0); assert.equal(locked.level, 0);
  s.tech.push('artificialIntelligenceII');
  const q = calculateQuantumSnapshot(s, snapshot, 4);
  const base = Math.log1p(.1 * q.knowledgeCapacity / 250000) / Math.log1p(.1);
  near(q.base, base); assert.equal(q.level, Math.floor(base * 2 * 100) / 100);
  assert.equal(calculateQuantumSnapshot(s, snapshot, 0).level, Math.floor(base * 100) / 100);
});

test('manufacturing is tech-gated and resource-specific across every factory product', () => {
  const s = fresh();
  for (const option of FACTORY_OPTIONS) for (const id of Object.keys(option.output) as ResourceId[]) {
    assert.equal(calculateQuantumManufacturingMultiplier(s, id, 10), 1);
  }
  s.tech.push('quantumManufacturing');
  for (const level of [0, .25, 1, 2, 5, -10]) {
    for (const option of FACTORY_OPTIONS) for (const id of Object.keys(option.output) as ResourceId[]) {
      near(calculateQuantumManufacturingMultiplier(s, id, level), Math.max(0, 1 + (level - 1) * (id === 'fur' ? .125 : .5)));
    }
    for (const id of ['iron', 'metal', 'graphene', 'knowledge', 'energy'] as const) assert.equal(calculateQuantumManufacturingMultiplier(s, id, level), 1);
  }
});

test('factory production and resource breakdown agree for fur and every other industrial line', () => {
  for (const dt of [.2, 1]) for (const option of FACTORY_OPTIONS) {
    const s = fresh(); s.tech.push('artificialIntelligenceII', 'polymer', 'syntheticFur', 'carbonNanotubes', 'nanoAlloy');
    s.buildings.library = 100; s.buildings.factory = 1; s.lines[option.id] = 1;
    supplyPower(s, 1000);
    for (const id of Object.keys(option.input) as ResourceId[]) s.resources[id] = 10000;
    const before = calculateProduction(s, dt); s.tech.push('quantumManufacturing');
    const after = calculateProduction(s, dt);
    for (const id of Object.keys(option.output) as ResourceId[]) {
      const multiplier = calculateQuantumManufacturingMultiplier(s, id, after.quantum.level);
      near(after.rates[id], before.rates[id] * multiplier);
      near(calculateResourceBreakdown(id, s, after).net, after.rates[id]);
      assert.ok(calculateResourceFactorRows(id, s, after).rows.some(row => row.name === '量子制造'));
    }
    for (const id of Object.keys(option.input) as ResourceId[]) near(after.rates[id], before.rates[id]);
  }
});

test('swarm gets fractional per-level factory effects, retains station support and caps total discount at 95%', () => {
  const s = fresh();
  near(calculateQuantumSwarmFactoryReduction(s, 25), .1);
  s.buildings.swarmControlStation = 2; near(calculateSwarmSupportCapacity(s, 4.5), 40);
  s.tech.push('quantumSwarm');
  near(calculateQuantumSwarmFactoryReduction(s, 4.5), .145);
  near(calculateSwarmSupportCapacity(s, 4.5), 49);
  const base = calculateBuildingCost('swarmSatellite', 0, s, { quantumLevel: 4.5 });
  s.buildings.swarmFactory = 2;
  const discounted = calculateBuildingCost('swarmSatellite', 0, s, { quantumLevel: 4.5 });
  for (const id of Object.keys(base) as ResourceId[]) near(discounted[id]!, base[id]! * .855 ** 2);
  for (const level of [0, 4.5, 1000]) {
    s.buildings.swarmFactory = 100000;
    const capped = calculateBuildingCost('swarmSatellite', 0, s, { quantumLevel: level });
    for (const id of Object.keys(base) as ResourceId[]) near(capped[id]!, base[id]! * .05);
  }
});
