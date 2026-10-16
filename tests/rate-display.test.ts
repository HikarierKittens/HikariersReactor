import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInitialState } from '../src/state/create-state';
import { CONFIG } from '../src/data/config';
import { calculateProduction } from '../src/simulation/production';
import { signedRate } from '../src/simulation/resource-breakdown';
import { formatResourceNumber, formatEffectNumber, formatNumber, formatRateNumber } from '../src/shared/format';

test('metric notation promotes only above ten thousand of each unit', () => {
  for (const format of [formatResourceNumber, formatEffectNumber, formatNumber, formatRateNumber]) {
    for (const [value, text] of [[10000, '10000'], [32000, '32k'], [1e6, '1000k'], [1e7, '10000k'], [12e6, '12M'], [1e10, '10000M'], [12e9, '12G'], [12e12, '12T'], [12e18, '12E']] as const) {
      assert.equal(format(value), text); assert.equal(format(-value), `−${text}`);
    }
  }
});

test('constant reactor income does not flicker at floating-point inventory boundaries', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech.push('nuclearEnergy', 'breederReactor');
  state.buildings.fissionGenerator = 1;
  state.resources.uranium = 100;
  for (const energy of [8172.02, 8172.05, 8172.08, 8192.05]) {
    state.resources.energy = energy;
    for (const dt of [1, .2, .05]) {
      const before = JSON.stringify(state);
      const result = calculateProduction(state, dt);
      assert.ok(Math.abs(result.rates.energy - 20) < 1e-8);
      assert.equal(signedRate(result.rates.energy), '+20/s');
      assert.equal(JSON.stringify(state), before);
    }
  }
});

test('rate rounding preserves genuine hundredths and leaves inventory truncation unchanged', () => {
  assert.equal(signedRate(19.99999999999909), '+20/s');
  assert.equal(signedRate(-19.99999999999909), '−20/s');
  assert.equal(signedRate(19.99), '+19.99/s');
  assert.equal(signedRate(-19.99), '−19.99/s');
  assert.equal(signedRate(1.236), '+1.24/s');
  assert.equal(signedRate(12345.6789), '+12.35k/s');
  assert.equal(signedRate(-1e-12), '+0/s');
  assert.equal(formatResourceNumber(19.99999999999909), '19.99');
  assert.equal(formatResourceNumber(1.236), '1.23');
  assert.equal(formatResourceNumber(12345.6789), '12.34k');
});
