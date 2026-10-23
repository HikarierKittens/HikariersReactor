import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { calculateStorageDetails, calculateStorageTotals } from '../src/simulation/storage';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import type { GameState } from '../src/types/state';

function digitalState(): GameState {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.tech.push('aiCoreCalibration');
  // Power the digital grid so the storage units are actually funded.
  state.resources.energy = 1e6;
  state.buildings.quantumStorage = 3;
  state.buildings.memoryCore = 2;
  return state;
}

function bonuses(): { particle: number; casimir: number; dark: number } {
  return { particle: .0004 * 800, casimir: .0008 * 200, dark: .01 * 12 };
}

function snapshotOf(state: GameState): never {
  return calculateSupportPreview(state) as never;
}

test('字节 picks up the particle, Casimir and dark energy storage bonuses', () => {
  const plain = digitalState();
  const rich = digitalState();
  rich.prestige.particles = 800;
  rich.prestige.casimir = 200;
  rich.prestige.darkEnergy = 12;
  rich.crispr.push('spatialReasoning', 'casimirEffect');

  const base = calculateStorageDetails('bytes', plain, snapshotOf(plain)).total;
  const boosted = calculateStorageDetails('bytes', rich, snapshotOf(rich)).total;
  const { particle, casimir, dark } = bonuses();
  // Both CRISPR bonuses scale the raw capacity, then 暗能量 multiplies the result.
  assert.ok(Math.abs(boosted - base * (1 + particle + casimir) * (1 + dark)) < 1e-6,
    `expected ${base * (1 + particle + casimir) * (1 + dark)}, got ${boosted}`);
  assert.ok(boosted > base, '字节 capacity must grow with prestige bonuses');
});

test('字节 detail rows and batched totals agree exactly', () => {
  const state = digitalState();
  state.prestige.particles = 800;
  state.prestige.casimir = 200;
  state.prestige.darkEnergy = 12;
  state.crispr.push('spatialReasoning', 'casimirEffect');
  const snapshot = snapshotOf(state);
  const detail = calculateStorageDetails('bytes', state, snapshot);
  const batched = calculateStorageTotals(state, snapshot);
  assert.ok(Math.abs(detail.total - batched.bytes) < 1e-6, `detail ${detail.total} vs batched ${batched.bytes}`);
  const labels = detail.rows.map(row => row.name);
  assert.ok(labels.includes('空间推理'), `missing particle row: ${labels.join(' / ')}`);
  assert.ok(labels.includes('卡西米尔效应'), `missing Casimir row: ${labels.join(' / ')}`);
  assert.ok(labels.includes('暗能量加成'), `missing dark energy row: ${labels.join(' / ')}`);
});

test('the bonuses are inert without CRISPR or prestige holdings', () => {
  const state = digitalState();
  const snapshot = snapshotOf(state);
  const detail = calculateStorageDetails('bytes', state, snapshot);
  assert.equal(detail.rows.length, 1, `only 基础储量 expected, got ${detail.rows.map(row => row.name).join(' / ')}`);
  assert.equal(calculateStorageTotals(state, snapshot).bytes, detail.total);
});

test('加密数据 stays exempt from the prestige storage bonuses', () => {
  const state = digitalState();
  const snapshot = snapshotOf(state);
  const before = calculateStorageTotals(state, snapshot).encryptedData;
  state.prestige.particles = 800;
  state.prestige.casimir = 200;
  state.prestige.darkEnergy = 12;
  state.crispr.push('spatialReasoning', 'casimirEffect');
  const after = calculateStorageTotals(state, snapshotOf(state)).encryptedData;
  assert.equal(after, before, '加密数据 must not change');
});
