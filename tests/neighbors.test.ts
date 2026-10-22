import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { createInitialState } from '../src/state/create-state';
import {
  NEIGHBORS, NEIGHBOR_IDS, OCCUPATION_OUTPUT_BONUS, OCCUPATION_TAX_PENALTY, RAID_ACTIONS,
  SOLDIER_FOOD_UPKEEP,
} from '../src/data/neighbors';
import { abandonOccupation, advanceNeighbors, createNeighborsState, executeRaid, garrisonedSoldiers, isNeighborsUnlocked, occupationOutputMultiplier, occupationTaxRate, previewRaid, raidStrength, soldierFoodUpkeep } from '../src/simulation/neighbors';
import { calculateGlobalOutputMultiplier } from '../src/simulation/crafting';
import { calculateTaxBase } from '../src/simulation/government';
import { buildRaidEconomy } from '../src/simulation/neighbor-economy';
import { validateAndMigrateSave } from '../src/state/validate-save';
import type { GameState } from '../src/types/state';

/** Deterministic RNG so spawn rolls and raids are reproducible. */
function seeded(seed = 1) {
  let value = seed;
  return () => { value = (value * 16807) % 2147483647; return value / 2147483647; };
}

/** Complete prerequisite closure so the fixture passes the real save validator. */
function addTech(tech: string[], id: string): void {
  if (tech.includes(id)) return;
  for (const parent of TECHNOLOGIES[id as keyof typeof TECHNOLOGIES].pre) addTech(tech, parent);
  tech.push(id);
}

function state(): GameState {
  const s = createInitialState(CONFIG.version, 600, 0);
  for (const id of ['government', 'military']) addTech(s.tech, id);
  s.soldiers = 200;
  s.population = 20;
  s.resources.food = 1000;
  // The save validator caps soldiers at barracks capacity, so the fixture must own enough
  // barracks for its army to be accepted by a real load.
  s.buildings.barracks = 100;
  // Raid loot is a share of the player's own output; without production a successful raid
  // legitimately brings nothing home.
  s.buildings.forage = 6; s.workers.forage = 6;
  s.buildings.lumber = 6; s.workers.lumber = 6;
  s.neighbors = createNeighborsState(seeded(7));
  return s;
}

test('neighbours spawn in strength order with the configured ranges', () => {
  const rolls = createNeighborsState(seeded(3));
  const military = NEIGHBOR_IDS.map(id => rolls.values[id].military);
  const economy = NEIGHBOR_IDS.map(id => rolls.values[id].economy);
  // 共联网络 < 归零者 < 米卡洛斯: the design ranges are strictly ordered, so the first
  // neighbour is always the weakest even though individual rolls may vary.
  assert.ok(NEIGHBORS.commonwealth.military.max < NEIGHBORS.zeroers.military.min);
  assert.ok(NEIGHBORS.zeroers.military.max < NEIGHBORS.mikaros.military.min);
  assert.ok(military[0]! < NEIGHBORS.zeroers.military.min);
  assert.ok(military[2]! > NEIGHBORS.zeroers.military.max);
  assert.equal(military.length, 3);
  assert.equal(economy.length, 3);
  for (const id of NEIGHBOR_IDS) {
    assert.ok(rolls.values[id].military >= NEIGHBORS[id].military.min && rolls.values[id].military <= NEIGHBORS[id].military.max);
    assert.equal(rolls.values[id].opinion, 30);
  }
  assert.deepEqual(rolls.occupied, []);
});

test('neighbours only appear after 政府 and soldiers', () => {
  const s = createInitialState(CONFIG.version, 600, 0);
  assert.equal(isNeighborsUnlocked(s), false);
  addTech(s.tech, 'government');
  assert.equal(isNeighborsUnlocked(s), false, 'no soldiers yet');
  s.soldiers = 1;
  assert.equal(isNeighborsUnlocked(s), true);
});

test('each occupied city adds one output factor and costs garrison and tax', () => {
  const s = state();
  assert.equal(occupationOutputMultiplier(s), 1);
  assert.equal(garrisonedSoldiers(s), 0);
  assert.equal(occupationTaxRate(s), s.taxRate);
  const base = calculateTaxBase(s);

  s.neighbors.occupied.push('commonwealth');
  assert.ok(Math.abs(occupationOutputMultiplier(s) - (1 + OCCUPATION_OUTPUT_BONUS)) < 1e-12);
  assert.equal(garrisonedSoldiers(s), 20);
  assert.equal(occupationTaxRate(s), s.taxRate - OCCUPATION_TAX_PENALTY);
  // Tax actually collected drops with the same penalty.
  assert.ok(calculateTaxBase(s) < base);
  // And the bonus reaches the global multiplier every resource uses.
  assert.ok(Math.abs(calculateGlobalOutputMultiplier('wood', s) - (1 + OCCUPATION_OUTPUT_BONUS)) < 1e-12);

  s.neighbors.occupied.push('zeroers');
  assert.ok(Math.abs(occupationOutputMultiplier(s) - (1 + OCCUPATION_OUTPUT_BONUS * 2)) < 1e-12);
  assert.equal(garrisonedSoldiers(s), 40);
});

test('a raid needs enough strength and reports why it is refused', () => {
  const s = state();
  s.soldiers = 2;
  const weak = previewRaid(s, 'mikaros', 3, 2);
  assert.equal(weak.available, false);
  assert.match(weak.reason, /战力不足/);
  const outcome = executeRaid(s, 'mikaros', 3 as const, 2, seeded(1), buildRaidEconomy(s));
  assert.equal(outcome.ok, false);
  assert.equal(s.soldiers, 2, 'a refused raid changes nothing');

  s.soldiers = 200;
  const strong = previewRaid(s, 'commonwealth', 0, 200);
  assert.equal(strong.available, true);
  assert.ok(strong.strength > strong.required);
});

test('raids cost soldiers, may wound some, and lower opinion', () => {
  const s = state();
  // Keep opinion above zero so the raid's own casualties are the only ones counted.
  s.neighbors.values.commonwealth.opinion = 100;
  const before = s.soldiers, opinionBefore = s.neighbors.values.commonwealth.opinion;
  const outcome = executeRaid(s, 'commonwealth', 2, 100, seeded(5), buildRaidEconomy(s));
  assert.equal(outcome.ok, true);
  assert.ok(outcome.soldiersLost + outcome.wounded > 0, 'a large raid must cost something');
  assert.ok(s.wounded === outcome.wounded);
  assert.equal(s.soldiers, before - outcome.soldiersLost);
  assert.equal(s.neighbors.values.commonwealth.opinion, opinionBefore - RAID_ACTIONS[2].opinionCost);
  assert.ok(Object.keys(outcome.loot).length > 0, 'a success plunders something');
});

test('occupying requires enough survivors and then raises output', () => {
  const s = state();
  s.neighbors.values.commonwealth.military = 10;
  s.neighbors.values.commonwealth.economy = 20;
  s.neighbors.values.commonwealth.opinion = 100; // 占领 costs 50 opinion; avoid retaliation too
  // Too few attackers to even clear the strength gate: nothing happens, no city taken.
  const thin = executeRaid(s, 'commonwealth', 3, 20, seeded(3), buildRaidEconomy(s));
  assert.equal(thin.ok, false, '20 soldiers cannot storm a city');
  assert.equal(thin.captured, false);
  assert.deepEqual(s.neighbors.occupied, []);

  // A real assault on the same weak neighbour succeeds and leaves a garrison behind.
  s.soldiers = 400;
  const strong = executeRaid(s, 'commonwealth', 3, 400, seeded(3), buildRaidEconomy(s));
  assert.equal(strong.ok, true, strong.reason ?? '');
  assert.equal(strong.captured, true, `expected capture, lost ${strong.soldiersLost} of 400`);
  assert.deepEqual(s.neighbors.occupied, ['commonwealth']);
  // The garrison is committed: those soldiers no longer count as available, and the
  // captured city immediately contributes output and costs tax.
  assert.equal(garrisonedSoldiers(s), 20);
  assert.ok(occupationOutputMultiplier(s) > 1);
  assert.ok(occupationTaxRate(s) < s.taxRate);
});

test('an assault that cannot leave 20 survivors does not hold the city', () => {
  const s = state();
  s.neighbors.values.commonwealth.military = 10;
  s.neighbors.values.commonwealth.economy = 20;
  s.neighbors.values.commonwealth.opinion = 100;
  // Right at the strength gate the casualties consume nearly the whole force, so fewer
  // than 20 survive and the capture must be refused even though the raid itself runs.
  const outcome = executeRaid(s, 'commonwealth', 3, 41, seeded(3), buildRaidEconomy(s));
  if (outcome.ok) {
    const survivors = 41 - outcome.soldiersLost;
    assert.equal(outcome.captured, survivors >= 20, `survivors ${survivors}`);
    if (!outcome.captured) assert.deepEqual(s.neighbors.occupied, []);
  }
});

test('zero opinion triggers a retaliation that costs soldiers and resources', () => {
  const s = state();
  s.neighbors.values.commonwealth.opinion = RAID_ACTIONS[0].opinionCost; // drops to exactly 0
  s.neighbors.values.commonwealth.military = 10; // keep the raid survivable so it resolves
  const before = s.soldiers;
  const outcome = executeRaid(s, 'commonwealth', 0, 100, seeded(11), buildRaidEconomy(s));
  assert.equal(outcome.retaliated, true);
  assert.ok(s.soldiers < before, 'a retaliation must cost soldiers');
  assert.ok(s.neighbors.values.commonwealth.opinion > 0, 'opinion recovers from the retaliation');
});

test('an occupied neighbour stops growing and can be released', () => {
  const s = state();
  s.neighbors.occupied.push('zeroers');
  const frozen = s.neighbors.values.zeroers.military;
  advanceNeighbors(s, 500);
  assert.equal(s.neighbors.values.zeroers.military, frozen, 'occupied cities stop growing');
  assert.ok(s.neighbors.values.commonwealth.military > NEIGHBORS.commonwealth.military.min, 'free neighbours still grow');

  assert.equal(abandonOccupation(s, 'zeroers'), true);
  assert.deepEqual(s.neighbors.occupied, []);
  assert.equal(abandonOccupation(s, 'zeroers'), false, 'abandoning twice is a no-op');
});

test('stronger neighbours grow faster and growth is capped', () => {
  const s = state();
  for (const id of NEIGHBOR_IDS) s.neighbors.values[id] = { military: 10, economy: 10, opinion: 30 };
  advanceNeighbors(s, 5 * 10); // ten game days
  const growth = NEIGHBOR_IDS.map(id => s.neighbors.values[id].military - 10);
  assert.ok(growth[2]! > growth[1]! && growth[1]! > growth[0]!, `growth must increase with tier: ${growth}`);

  advanceNeighbors(s, 5 * 100000);
  for (const id of NEIGHBOR_IDS) {
    assert.ok(s.neighbors.values[id].military <= NEIGHBORS[id].military.max * 2 + 1e-9, 'growth is capped');
  }
});

test('the army eats 2 food per soldier per second', () => {
  const s = state();
  // One farmer produces 2/s and eats 1/s, so each soldier costs a whole farmer's net output.
  assert.equal(soldierFoodUpkeep(s), s.soldiers * 2);
  assert.equal(SOLDIER_FOOD_UPKEEP, 2);
  s.soldiers = 0;
  assert.equal(soldierFoodUpkeep(s), 0);
});

test('raid strength rewards quality as well as quantity', () => {
  // Four times the soldiers is 4^0.75 ≈ 2.83x the strength, so elites stay valuable
  // without making numbers pointless.
  assert.ok(Math.abs(raidStrength(400, 1) / raidStrength(100, 1) - 4 ** .75) < 1e-12);
  // Doubling per-soldier power exactly doubles the result.
  assert.ok(Math.abs(raidStrength(100, 2) / raidStrength(100, 1) - 2) < 1e-12);
  assert.equal(raidStrength(0, 5), 0);
});

test('a schema31 save without neighbours upgrades to a fresh set', () => {
  const s = state();
  assert.ok(s.soldiers <= s.buildings.barracks * 2, 'fixture capacity must cover the army');
  const raw = JSON.parse(JSON.stringify(s));
  delete raw.neighbors;
  delete raw.wounded;
  const loaded = validateAndMigrateSave(raw, {
    now: 0, eventInterval: 600,
    housingCapacity: () => 999,
    clampResources: () => undefined,
  });
  assert.equal(loaded.wounded, 0);
  assert.deepEqual(loaded.neighbors.occupied, []);
  for (const id of NEIGHBOR_IDS) assert.equal(loaded.neighbors.values[id].opinion, 30);
});

test('malformed or inflated neighbour records are rejected', () => {
  const context = {
    now: 0, eventInterval: 600,
    housingCapacity: () => 999,
    clampResources: () => undefined,
  };
  const raw = JSON.parse(JSON.stringify(state()));
  // A hand-edited save must not be able to inflate the output multiplier.
  raw.neighbors.occupied = ['commonwealth', 'commonwealth'];
  assert.throws(() => validateAndMigrateSave(raw, context), /临近势力数据无效/);

  const raw2 = JSON.parse(JSON.stringify(state()));
  raw2.neighbors.occupied = ['atlantis'];
  assert.throws(() => validateAndMigrateSave(raw2, context), /临近势力数据无效/);

  const raw3 = JSON.parse(JSON.stringify(state()));
  raw3.neighbors.values.commonwealth.opinion = 101;
  assert.throws(() => validateAndMigrateSave(raw3, context), /好感度/);

  const raw4 = JSON.parse(JSON.stringify(state()));
  raw4.neighbors.values.commonwealth.military = -1;
  assert.throws(() => validateAndMigrateSave(raw4, context), /军事实力/);
});
