import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import {
  MILITARY_RAID_TIER, NEIGHBOR_MILITARY_FLOOR_SHARE, NEIGHBOR_MILITARY_RAID_CAP, RAID_ACTIONS,
} from '../src/data/neighbors';
import { createInitialState } from '../src/state/create-state';
import {
  calculateRaidMilitaryLoss, createNeighborsState, executeRaid, neighborMilitaryFloor,
  neighborStrength, previewRaid, raidMilitaryDamage,
} from '../src/simulation/neighbors';
import type { GameState } from '../src/types/state';

function seeded(seed = 1) {
  let value = seed;
  return () => { value = (value * 16807) % 2147483647; return value / 2147483647; };
}

function addTech(tech: string[], id: string): void {
  if (tech.includes(id)) return;
  for (const parent of TECHNOLOGIES[id as keyof typeof TECHNOLOGIES].pre) addTech(tech, parent);
  tech.push(id);
}

/** Commonwealth with a pinned strength so every expectation below is exact. */
function fixture(military = 40, economy = 0): GameState {
  const s = createInitialState(CONFIG.version, 600, 0);
  for (const id of ['government', 'military']) addTech(s.tech, id);
  s.soldiers = 200;
  s.population = 20;
  s.resources.food = 1000;
  s.buildings.barracks = 100;
  s.buildings.forage = 6; s.workers.forage = 6;
  s.neighbors = createNeighborsState(seeded(7));
  s.neighbors.values.commonwealth.military = military;
  s.neighbors.values.commonwealth.economy = economy;
  return s;
}

test('only 扫荡 reduces the defender military', () => {
  assert.equal(MILITARY_RAID_TIER, 2);
  assert.equal(RAID_ACTIONS[MILITARY_RAID_TIER].name, '扫荡');
  // 偷袭 and 抢劫 hit caravans, 占领 ends the fight: none of them touch the standing army.
  for (const tier of [0, 1, 3] as const) {
    const s = fixture(40);
    const before = s.neighbors.values.commonwealth.military;
    const preview = previewRaid(s, 'commonwealth', tier, 200);
    assert.equal(preview.militaryLoss, 0, `tier ${tier} previews no reduction`);
    assert.equal(preview.militaryLossShare, 0, `tier ${tier} reports no share`);
    const outcome = executeRaid(s, 'commonwealth', tier, 200, seeded(5));
    if (outcome.ok) {
      assert.equal(outcome.militaryLoss, 0, `tier ${tier} destroys nothing`);
      assert.equal(s.neighbors.values.commonwealth.military, before, `tier ${tier} leaves military untouched`);
    } else {
      assert.equal(preview.available, false);
    }
  }
  // 扫荡 does reduce it.
  const sweep = fixture(40);
  const before = sweep.neighbors.values.commonwealth.military;
  const preview = previewRaid(sweep, 'commonwealth', 2, 200);
  assert.ok(preview.available, preview.reason);
  assert.ok(preview.militaryLoss > 0);
  const outcome = executeRaid(sweep, 'commonwealth', 2, 200, seeded(5));
  assert.ok(outcome.ok, String(outcome.reason));
  assert.ok(sweep.neighbors.values.commonwealth.military < before, '扫荡 actually dropped it');
});

test('扫荡 reduces the defender military by at most ten percent', () => {
  const s = fixture(40);
  const before = s.neighbors.values.commonwealth.military;
  const preview = previewRaid(s, 'commonwealth', 2, 200);
  assert.ok(preview.available, preview.reason);
  assert.ok(preview.militaryLoss > 0, 'a winning 扫荡 always costs the defender something');

  const outcome = executeRaid(s, 'commonwealth', 2, 200, seeded(5));
  assert.ok(outcome.ok, String(outcome.reason));
  const after = s.neighbors.values.commonwealth.military;
  assert.ok(after < before, 'military actually dropped');
  assert.ok(Math.abs((before - after) - outcome.militaryLoss) < 1e-9, 'outcome reports what changed');
  assert.ok(before - after <= before * NEIGHBOR_MILITARY_RAID_CAP + 1e-9, 'capped at 10%');
});

test('the reduction share scales with how decisively we outmatch the defender', () => {
  // Below the gate nothing executes, so the share is zero rather than negative.
  assert.equal(raidMilitaryDamage(0), 0);
  assert.equal(raidMilitaryDamage(.5), 0);
  // Just clearing the gate takes half the cap; doubling it reaches the cap.
  assert.ok(Math.abs(raidMilitaryDamage(1) - NEIGHBOR_MILITARY_RAID_CAP / 2) < 1e-12);
  assert.ok(Math.abs(raidMilitaryDamage(1.5) - NEIGHBOR_MILITARY_RAID_CAP * .75) < 1e-12);
  assert.ok(Math.abs(raidMilitaryDamage(2) - NEIGHBOR_MILITARY_RAID_CAP) < 1e-12);
  // Never more than the cap, however lopsided the fight.
  assert.equal(raidMilitaryDamage(10), NEIGHBOR_MILITARY_RAID_CAP);
  // Infinity is a real case: a defender with no standing strength left reads as the full cap.
  assert.equal(raidMilitaryDamage(Infinity), NEIGHBOR_MILITARY_RAID_CAP);
  // 10% is the hard ceiling the requirement asked for.
  assert.equal(NEIGHBOR_MILITARY_RAID_CAP, .1);
});

test('the floor is a share of the spawn maximum, not of the current strength', () => {
  const floor = neighborMilitaryFloor('commonwealth');
  assert.ok(Math.abs(floor - 26 * NEIGHBOR_MILITARY_FLOOR_SHARE) < 1e-12);
  // The floor does not follow a raided-down value, so repeated 扫荡 cannot ratchet it away.
  const s = fixture(10);
  assert.equal(neighborMilitaryFloor('commonwealth'), floor);
  s.neighbors.values.commonwealth.military = 4;
  assert.equal(neighborMilitaryFloor('commonwealth'), floor);
});

test('the preview and the settlement agree on the reduction', () => {
  const s = fixture(40);
  const preview = previewRaid(s, 'commonwealth', 2, 200);
  const expected = calculateRaidMilitaryLoss('commonwealth', s, preview.ratio, MILITARY_RAID_TIER);
  assert.ok(Math.abs(preview.militaryLoss - expected) < 1e-9);
  const outcome = executeRaid(s, 'commonwealth', 2, 200, seeded(3));
  assert.ok(outcome.ok, String(outcome.reason));
  assert.ok(Math.abs(outcome.militaryLoss - preview.militaryLoss) < 1e-9, 'display matches the ledger');
});

test('repeated 扫荡 stops at the floor instead of erasing the defender', () => {
  const s = fixture(40);
  const floor = neighborMilitaryFloor('commonwealth');
  for (let i = 0; i < 60; i++) {
    // Keep the army healthy enough to outmatch the shrinking defender every round.
    s.soldiers = 200;
    s.resources.food = 1000;
    executeRaid(s, 'commonwealth', 2, 200, seeded(i + 1));
  }
  assert.ok(s.neighbors.values.commonwealth.military >= floor - 1e-9, 'never driven below the floor');
  assert.ok(s.neighbors.values.commonwealth.military <= floor + 1e-6, 'and it does reach the floor');
  // At the floor there is nothing left to take, so the preview reports zero.
  s.soldiers = 200;
  assert.equal(previewRaid(s, 'commonwealth', 2, 200).militaryLoss, 0);
});

test('a reduced defender really is easier to attack again', () => {
  const s = fixture(40);
  const before = neighborStrength('commonwealth', s);
  const requiredBefore = previewRaid(s, 'commonwealth', 2, 200).required;
  const outcome = executeRaid(s, 'commonwealth', 2, 200, seeded(9));
  assert.ok(outcome.ok, String(outcome.reason));
  const after = neighborStrength('commonwealth', s);
  assert.ok(after < before, 'the same army now faces less resistance');
  // The strength the same action demands drops with the defender's standing army.
  assert.ok(previewRaid(s, 'commonwealth', 2, 200).required < requiredBefore, 'gate drops with the army');
});

test('a refused attack leaves the defender military untouched', () => {
  // Too few soldiers to clear the gate: nothing executes, so nothing is destroyed.
  const s = fixture(40);
  const before = s.neighbors.values.commonwealth.military;
  const outcome = executeRaid(s, 'commonwealth', 2, 2, seeded(1));
  assert.equal(outcome.ok, false);
  assert.equal(outcome.militaryLoss, 0);
  assert.equal(s.neighbors.values.commonwealth.military, before);
  // An occupied city is no longer a raid target at all.
  const occupied = fixture(40);
  occupied.neighbors.occupied.push('commonwealth');
  const kept = occupied.neighbors.values.commonwealth.military;
  const refused = executeRaid(occupied, 'commonwealth', 2, 200, seeded(1));
  assert.equal(refused.ok, false);
  assert.equal(occupied.neighbors.values.commonwealth.military, kept);
});

test('扫荡 never writes a log line about the military reduction', () => {
  const s = fixture(40);
  const outcome = executeRaid(s, 'commonwealth', 2, 200, seeded(5));
  assert.ok(outcome.ok, String(outcome.reason));
  assert.ok(outcome.militaryLoss > 0, 'the reduction did happen');
  const text = s.logs.map(entry => entry.text).join('\n');
  assert.ok(!text.includes('军事'), `no military log line: ${text}`);
});
