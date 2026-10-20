import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { calculateHappinessMultiplier, calculateProductionMultiplier, calculateFactoryOutputMultiplier } from '../src/simulation/multipliers';
import { settleGroundProduction } from '../src/simulation/ground-settlement';
import { calculateProduction } from '../src/simulation/production';
import { calculateResourceFactorRows } from '../src/simulation/resource-breakdown';

const near = (actual: number, expected: number, message: string) =>
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${message}: ${actual} vs ${expected}`);

test('happiness output multiplier keeps the 1%/point penalty below 100 and halves the bonus above it', () => {
  near(calculateHappinessMultiplier(100), 1, 'baseline');
  near(calculateHappinessMultiplier(99), .99, 'one point below baseline');
  near(calculateHappinessMultiplier(80), .8, 'penalty stays 1% per point');
  near(calculateHappinessMultiplier(40), .4, 'floor');
  // Above 100: 0.5% per point instead of 1%, so happiness bonuses never double-dip.
  near(calculateHappinessMultiplier(110), 1.05, '110%');
  near(calculateHappinessMultiplier(150), 1.25, '150% (was 1.5)');
  near(calculateHappinessMultiplier(200), 1.5, '200% (was 2.0)');
  assert.ok(calculateHappinessMultiplier(150) < 150 / 100, 'above-100 bonus is strictly smaller than the old linear curve');
  assert.equal(calculateHappinessMultiplier(Number.NaN), 1, 'non-finite input falls back to neutral');
  assert.equal(calculateHappinessMultiplier(-50), 0, 'negative happiness cannot invert output');
});

test('production and factory multipliers share the single happiness curve', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  for (const happiness of [40, 80, 100, 120, 150, 200]) {
    near(calculateProductionMultiplier('wood', happiness, state), calculateHappinessMultiplier(happiness), `ordinary resource at ${happiness}%`);
    // Foundry crafts (木板) and energy ignore happiness entirely.
    near(calculateFactoryOutputMultiplier('plank', happiness, state, 1), 1, `crafted plank at ${happiness}%`);
    near(calculateFactoryOutputMultiplier('energy', happiness, state, 1), 1, `energy at ${happiness}%`);
  }
});

test('settled output applies the new curve and the factor row matches it', () => {
  const boosts = { mixerUnits: 0, miningUnits: 0, coalMiningUnits: 0, lumberUnits: 0, quarryUnits: 0, dataUnits: 0 };
  const state = createInitialState(CONFIG.version, 60, 0);
  state.buildings.lumber = 1; state.workers.lumber = 1;
  const woodAt = (happiness: number) => {
    const pool = { ...state.resources }, inputs: Record<string, number> = {}, outputs: Record<string, number> = {};
    settleGroundProduction(state, pool, 1, happiness, inputs, outputs, boosts);
    return outputs.lumber || 0;
  };
  const base = woodAt(100);
  assert.ok(base > 0, 'lumber produces at the 100% baseline');
  near(woodAt(150), base * 1.25, '150% happiness settles at ×1.25, not the old ×1.5');
  near(woodAt(80), base * .8, 'below-baseline penalty is unchanged');
  // The tooltip/factor row must show the same curve the settlement uses.
  const result = calculateProduction(state);
  const rows = calculateResourceFactorRows('wood', state, { ...result, morale: { ...result.morale, happiness: 150 } }).rows;
  const happinessRows = rows.filter(entry => entry.name === '幸福度');
  assert.equal(happinessRows.length, 1, 'single happiness row');
  assert.equal(happinessRows[0]?.value, '+25%');
});
