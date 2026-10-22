import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { NEIGHBOR_MILITARY_FLOOR_SHARE, NEIGHBOR_MILITARY_RAID_CAP } from '../src/data/neighbors';
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
  assert.equal(raidMilitaryDamage(Infinity), NEIGHBOR_MILITARY_RAID_CAP);
  // 10% is the hard ceiling the requirement asked for.
  assert.equal(NEIGHBOR_MILITARY_RAID_CAP, .1);
});

test('the floor is a share of the spawn maximum, not of the current strength', () => {
  const floor = neighborMilitaryFloor('commonwealth');
  assert.ok(Math.abs(floor - 26 * NEIGHBOR_MILITARY_FLOOR_SHARE) < 1e-12);
  // The floor does not follow a raided-down value, so repeated raids cannot ratchet it away.
  const s = fixture(10);
  assert.equal(neighborMilitaryFloor('commonwealth'), floor);
  s.neighbors.values.commonwealth.military = 4;
  assert.equal(neighborMilitaryFloor('commonwealth'), floor);
});

test('a successful attack destroys at most ten percent of the defender military', () => {
  const s = fixture(40);
  const before = s.neighbors.values.commonwealth.military;
  const preview = previewRaid(s, 'commonwealth', 0, 200);
  assert.ok(preview.available, preview.reason);
  assert.ok(preview.militaryLoss > 0, 'a winning raid always costs the defender something');

  const outcome = executeRaid(s, 'commonwealth', 0, 200, seeded(5));
  assert.ok(outcome.ok, String(outcome.reason));
  const after = s.neighbors.values.commonwealth.military;
  assert.ok(after < before, 'military actually dropped');
  assert.ok(Math.abs((before - after) - outcome.militaryLoss) < 1e-9, 'outcome reports what changed');
  assert.ok(before - after <= before * NEIGHBOR_MILITARY_RAID_CAP + 1e-9, 'capped at 10%');
});

test('the preview and the settlement agree on the reduction', () => {
  const s = fixture(40);
  const preview = previewRaid(s, 'commonwealth', 2, 200);
  const expected = calculateRaidMilitaryLoss('commonwealth', s, preview.ratio);
  assert.ok(Math.abs(preview.militaryLoss - expected) < 1e-9);
  const outcome = executeRaid(s, 'commonwealth', 2, 200, seeded(3));
  assert.ok(outcome.ok, String(outcome.reason));
  assert.ok(Math.abs(outcome.militaryLoss - preview.militaryLoss) < 1e-9, 'display matches the ledger');
});

test('repeated attacks stop at the floor instead of erasing the defender', () => {
  const s = fixture(40);
  const floor = neighborMilitaryFloor('commonwealth');
  for (let i = 0; i < 60; i++) {
    // Keep the army healthy enough to outmatch the shrinking defender every round.
    s.soldiers = 200;
    executeRaid(s, 'commonwealth', 0, 200, seeded(i + 1));
  }
  assert.ok(s.neighbors.values.commonwealth.military >= floor - 1e-9, 'never driven below the floor');
  assert.ok(s.neighbors.values.commonwealth.military <= floor + 1e-6, 'and it does reach the floor');
  // At the floor there is nothing left to take, so the preview reports zero.
  s.soldiers = 200;
  const preview = previewRaid(s, 'commonwealth', 0, 200);
  assert.equal(preview.militaryLoss, 0);
});

test('a reduced defender really is easier to attack again', () => {
  const s = fixture(40);
  const before = neighborStrength('commonwealth', s);
  const outcome = executeRaid(s, 'commonwealth', 0, 200, seeded(9));
  assert.ok(outcome.ok, String(outcome.reason));
  const after = neighborStrength('commonwealth', s);
  assert.ok(after < before, 'the same army now faces less resistance');
  // And the required strength for the same action drops with it.
  assert.ok(previewRaid(s, 'commonwealth', 1, 200).required < before * 0.8);
});

test('a refused attack leaves the defender military untouched', () => {
  // Too few soldiers to clear the gate: nothing executes, so nothing is destroyed.
  const s = fixture(40);
  const before = s.neighbors.values.commonwealth.military;
  const outcome = executeRaid(s, 'commonwealth', 3, 2, seeded(1));
  assert.equal(outcome.ok, false);
  assert.equal(outcome.militaryLoss, 0);
  assert.equal(s.neighbors.values.commonwealth.military, before);
  // An occupied city is no longer a raid target at all.
  const occupied = fixture(40);
  occupied.neighbors.occupied.push('commonwealth');
  const kept = occupied.neighbors.values.commonwealth.military;
  const refused = executeRaid(occupied, 'commonwealth', 0, 200, seeded(1));
  assert.equal(refused.ok, false);
  assert.equal(occupied.neighbors.values.commonwealth.military, kept);
});

test('a more demanding action yields a smaller share for the same army', () => {
  // The share tracks the strength *ratio*, so the same force cripples a defender less when
  // it has to clear a higher gate. Locking this keeps the scaling tied to the fight itself
  // rather than to the button pressed.
  const s = fixture(40);
  const shares = ([0, 1, 2] as const).map(tier => previewRaid(s, 'commonwealth', tier, 200).militaryLossShare);
  assert.ok(shares[0]! > shares[1]!, `tier0 ${shares[0]} > tier1 ${shares[1]}`);
  assert.ok(shares[1]! > shares[2]!, `tier1 ${shares[1]} > tier2 ${shares[2]}`);
  for (const share of shares) assert.ok(share <= NEIGHBOR_MILITARY_RAID_CAP + 1e-12);
});
