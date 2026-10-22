import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { validateFactoryAssignments } from '../src/state/validate-economy';
import { changeFactoryAssignment } from '../src/simulation/commands';
import { assignNewFactoryLines, calculateFactoryCapacity, countAssignedLines, countFreeFactoryLines } from '../src/simulation/factory';
import { buyBuildingNow, buyBuildingsInBatch } from '../src/simulation/purchases';
import { supplyPower } from './support/power';
import type { GameState } from '../src/types/state';

/**
 * 体验优化 (beta 0.9.28):
 * - 新建造的工厂默认加入合金生产线；
 * - 没有空余生产线时，增加其他生产线会从合金生产线抽取。
 *
 * 关键不变量：任何时刻 `lines` 总和都不超过容量，所以这两个操作都不能把存档写坏
 * （`validateFactoryAssignments` 会拒绝超额）。
 */

const fresh = (): GameState => createInitialState(CONFIG.version, 60, 0);
const moon = () => 100;

/** A state that can actually build and run factories (stopped factories grant no lines). */
function industry(): GameState {
  const s = fresh();
  s.tech.push('industrialization', 'automation');
  // Trading lines need their own unlock: 聚合物/毛皮/纳米管/纳米合金 all gate on a technology
  // (see `isFactoryLineUnlocked`), so the transfer tests must research them first.
  s.tech.push('polymer', 'syntheticFur', 'carbonNanotubes', 'nanoAlloy', 'grapheneProcessing', 'superMetal');
  Object.assign(s.resources, { cash: 1e12, cement: 1e12, titanium: 1e12, metal: 1e12, knowledge: 1e12 });
  // A factory burns 3 电力/s: without supply every new unit would start stopped.
  supplyPower(s, 1000);
  return s;
}

/** Build `count` running factories through the real command, so capacity matches reality. */
function factories(s: GameState, count: number): GameState {
  for (let i = 0; i < count; i++) buyBuildingNow(s, 'factory', moon());
  assert.equal(s.buildings.factory, count, 'test setup: factories were built');
  assert.equal(countAssignedLines(s), count, 'test setup: each new factory took an alloy line');
  return s;
}

test('every new factory defaults into the alloy line', () => {
  const s = industry();
  assert.equal(s.buildings.factory, 0);
  const bought = buyBuildingNow(s, 'factory', moon());
  assert.equal(bought.bought, true);
  assert.equal(s.buildings.factory, 1);
  assert.equal(s.lines.alloy, 1, 'the new line is already alloy');
  assert.equal(countAssignedLines(s), calculateFactoryCapacity(s));
  validateFactoryAssignments({ ...s.lines }, s);
});

test('a newly built factory that starts stopped grants no line', () => {
  // A factory with no power supply starts stopped, so its line capacity never materialises
  // and the automatic alloy assignment must leave `lines` alone.
  const s = fresh();
  s.tech.push('industrialization', 'automation');
  Object.assign(s.resources, { cash: 1e12, cement: 1e12, titanium: 1e12, metal: 1e12 });
  // Deliberately no power: the factory is constructed but cannot run.
  buyBuildingNow(s, 'factory', moon());
  if (s.buildings.factory === 1 && s.stoppedBuildings.factory === 1) {
    assert.equal(calculateFactoryCapacity(s), 0, 'a stopped factory grants no capacity');
    assert.equal(s.lines.alloy, 0, 'nothing was assigned for it');
  }
  // Either way the invariant holds: no assignment may exceed the running capacity.
  assert.ok(countAssignedLines(s) <= calculateFactoryCapacity(s));
  validateFactoryAssignments({ ...s.lines }, s);
});

test('batch purchases assign one line per completed factory', () => {
  const s = industry();
  const batch = buyBuildingsInBatch(s, 'factory', 5, moon());
  assert.equal(batch.bought, 5);
  assert.equal(s.lines.alloy, 5);
  assert.equal(countAssignedLines(s), calculateFactoryCapacity(s));
  validateFactoryAssignments({ ...s.lines }, s);
});

test('growing another line draws the shortfall out of the alloy line', () => {
  const s = factories(industry(), 3);
  assert.equal(s.lines.alloy, 3);
  assert.equal(countFreeFactoryLines(s), 0);
  // No free capacity, but the player can convert alloy into polymer one unit at a time.
  for (let i = 0; i < 3; i++) {
    assert.equal(changeFactoryAssignment(s, 'polymer', 1), 1);
    assert.equal(s.lines.polymer, i + 1);
    assert.equal(s.lines.alloy, 3 - (i + 1));
    assert.equal(countAssignedLines(s), 3, 'the total never exceeds capacity');
    validateFactoryAssignments({ ...s.lines }, s);
  }
  // Alloy is exhausted: nothing more can be converted.
  assert.equal(changeFactoryAssignment(s, 'polymer', 1), 0);
  assert.equal(changeFactoryAssignment(s, 'polymer', 10), 0);
  assert.equal(s.lines.polymer, 3);
  assert.equal(s.lines.alloy, 0);
});

test('the draw happens only after free capacity is used up', () => {
  const s = factories(industry(), 3);
  s.lines.alloy = 1; // one alloy + two free
  assert.equal(countFreeFactoryLines(s), 2);
  assert.equal(changeFactoryAssignment(s, 'polymer', 2), 2);
  assert.equal(s.lines.alloy, 1, 'free capacity is spent first');
  assert.equal(s.lines.polymer, 2);
  assert.equal(changeFactoryAssignment(s, 'polymer', 1), 1);
  assert.equal(s.lines.alloy, 0, 'only the third unit came out of alloy');
  assert.equal(s.lines.polymer, 3);
});

test('alloy itself never borrows from alloy, so it cannot exceed capacity', () => {
  const s = factories(industry(), 2);
  assert.equal(changeFactoryAssignment(s, 'alloy', 1), 0, 'no free capacity and no source');
  assert.equal(s.lines.alloy, 2);
  // Withdrawing is still always allowed.
  assert.equal(changeFactoryAssignment(s, 'alloy', -2), -2);
  assert.equal(s.lines.alloy, 0);
  assert.equal(changeFactoryAssignment(s, 'alloy', 2), 2);
});

test('a large delta converts at most the whole alloy line', () => {
  const s = factories(industry(), 5);
  assert.equal(changeFactoryAssignment(s, 'nanotubes', 100), 5, 'only the alloy line can be drawn');
  assert.equal(s.lines.nanotubes, 5);
  assert.equal(s.lines.alloy, 0);
  assert.equal(changeFactoryAssignment(s, 'nanotubes', 1), 0, 'nothing left to draw');
  validateFactoryAssignments({ ...s.lines }, s);
});

test('assignNewFactoryLines clamps to the capacity the new units created', () => {
  const s = factories(industry(), 1);
  // The running factory already consumed its line, so asking for two more cannot overfill.
  assert.equal(assignNewFactoryLines(s, 'factory', 2), 0, 'no capacity was added');
  assert.equal(s.lines.alloy, 1);
  validateFactoryAssignments({ ...s.lines }, s);
});

test('the registered line count is what a running factory grants', () => {
  const s = factories(industry(), 2);
  assert.equal(calculateFactoryCapacity(s), 2 * (BUILDINGS.factory.lines || 0));
  assert.equal(BUILDINGS.factory.lines, 1);
  assert.equal(BUILDINGS.highTechFactory.lines, 2);
});
