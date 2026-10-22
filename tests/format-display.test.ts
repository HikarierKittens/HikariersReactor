/** Moved verbatim out of tests/modules.test.ts during the 2026-10-22 split.
 *  Keep the assertions unchanged: they are the historical regression net. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatNumber, formatResourceNumber } from '../src/shared/format';

test('resource display retains two decimals and suppresses binary roundoff without rounding up stock', () => {
  assert.equal(formatResourceNumber(123.456789), '123.45');
  assert.equal(formatResourceNumber(0.01), '0.01');
  assert.equal(formatResourceNumber(0.009999), '0');
  assert.equal(formatResourceNumber(.3 - .2), '0.1');
  assert.equal(formatResourceNumber(2.05 - 2), '0.05');
  assert.equal(formatResourceNumber(1.23 - Number.EPSILON), '1.23');
  assert.equal(formatResourceNumber(-1.234567), '−1.23');
  assert.equal(formatResourceNumber(-1e-12), '0');
  assert.equal(formatResourceNumber(12345.6789), '12.34k');
  assert.equal(formatResourceNumber(Infinity), '∞');
});

test('formatting truncates stock and handles invalid and negative values', () => {
  assert.equal(formatNumber(NaN), '0'); assert.equal(formatNumber(Infinity), '0');
  assert.equal(formatNumber(12345), '12.34k'); assert.equal(formatNumber(-12.39), '−12.3');
  assert.equal(formatNumber(9999.99), '9999'); assert.equal(formatNumber(1e6), '1M');
});
