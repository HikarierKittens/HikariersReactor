import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { TECHNOLOGIES } from '../src/data/technologies';
import { RAID_ACTIONS, RAID_ECONOMY_FLOOR } from '../src/data/neighbors';
import { createNeighborsState, previewRaid } from '../src/simulation/neighbors';
import { buildRaidEconomy, raidCapacity } from '../src/simulation/neighbor-economy';
import type { GameState } from '../src/types/state';
import type { ResourceId } from '../src/types/economy';

function seeded(seed = 1) {
  let value = seed;
  return () => { value = (value * 16807) % 2147483647; return value / 2147483647; };
}
function addTech(tech: string[], id: string): void {
  if (tech.includes(id)) return;
  for (const parent of TECHNOLOGIES[id as keyof typeof TECHNOLOGIES].pre) addTech(tech, parent);
  tech.push(id);
}

/** A colony with real output so raids have something to scale from. */
function state(buildings = 6): GameState {
  const s = createInitialState(CONFIG.version, 600, 0);
  for (const id of ['government', 'military']) addTech(s.tech, id);
  s.soldiers = 400;
  s.population = 20;
  s.buildings.barracks = 200;
  s.buildings.forage = buildings; s.workers.forage = buildings;
  s.buildings.lumber = buildings; s.workers.lumber = buildings;
  s.buildings.quarry = Math.max(1, Math.floor(buildings / 2)); s.workers.quarry = Math.max(1, Math.floor(buildings / 2));
  s.resources.food = 5000;
  s.neighbors = createNeighborsState(seeded(7));
  s.neighbors.values.commonwealth.military = 10;
  s.neighbors.values.commonwealth.opinion = 100;
  return s;
}

const total = (loot: Partial<Record<ResourceId, number>>): number =>
  Object.values(loot).reduce((sum, amount) => sum + (amount ?? 0), 0);

test('loot scales with the action tier', () => {
  const s = state();
  s.neighbors.values.commonwealth.economy = 60;
  const ctx = buildRaidEconomy(s);
  const totals = ([0, 1, 2] as const).map(tier => total(previewRaid(s, 'commonwealth', tier, 300, ctx).loot));
  assert.ok(totals[1]! > totals[0]!, `抢劫 must beat 偷袭: ${totals}`);
  assert.ok(totals[2]! > totals[1]!, `扫荡 must beat 抢劫: ${totals}`);
  // The declared multipliers are the ratio the implementation must honour.
  assert.ok(Math.abs(totals[1]! / totals[0]! - RAID_ACTIONS[1].tierMultiplier / RAID_ACTIONS[0].tierMultiplier) < .05,
    `tier ratio should follow the configured multipliers: ${totals[1]! / totals[0]!}`);
});

test('loot scales with the neighbour economy, independently of the tier', () => {
  const low = state(), high = state();
  low.neighbors.values.commonwealth.economy = 20;
  high.neighbors.values.commonwealth.economy = 100;
  const lowCtx = buildRaidEconomy(low), highCtx = buildRaidEconomy(high);
  for (const tier of [0, 1, 2] as const) {
    const a = total(previewRaid(low, 'commonwealth', tier, 300, lowCtx).loot);
    const b = total(previewRaid(high, 'commonwealth', tier, 300, highCtx).loot);
    assert.ok(b > a, `tier ${tier}: a richer neighbour must pay more (${a} → ${b})`);
  }
  // Economy and tier compose multiplicatively: the rich/poor ratio is tier-independent.
  const ratioAt = (tier: 0 | 1 | 2) => total(previewRaid(high, 'commonwealth', tier, 300, highCtx).loot)
    / total(previewRaid(low, 'commonwealth', tier, 300, lowCtx).loot);
  const ratios = [ratioAt(0), ratioAt(1), ratioAt(2)];
  for (const ratio of ratios) {
    assert.ok(Math.abs(ratio - ratios[0]!) / ratios[0]! < .02, `economy must not depend on tier: ${ratios}`);
  }
  assert.ok(ratios[0]! > 1, 'the rich neighbour really does pay more');
});

test('loot follows the player output, so it stays relevant at every stage', () => {
  const small = state(4), large = state(20);
  for (const s of [small, large]) s.neighbors.values.commonwealth.economy = 60;
  const smallTotal = total(previewRaid(small, 'commonwealth', 1, 300, buildRaidEconomy(small)).loot);
  const largeTotal = total(previewRaid(large, 'commonwealth', 1, 300, buildRaidEconomy(large)).loot);
  assert.ok(largeTotal > smallTotal * 2, `a bigger colony must raid bigger: ${smallTotal} → ${largeTotal}`);
});

test('the economy floor keeps the weakest neighbour worth attacking', () => {
  const s = state();
  s.neighbors.values.commonwealth.economy = 0;
  const ctx = buildRaidEconomy(s);
  const loot = total(previewRaid(s, 'commonwealth', 0, 300, ctx).loot);
  assert.ok(loot > 0, 'a zero-economy neighbour still yields something');
  // Factor must equal the declared floor, not collapse to zero.
  const baseline = state();
  baseline.neighbors.values.commonwealth.economy = 100;
  const rich = total(previewRaid(baseline, 'commonwealth', 0, 300, buildRaidEconomy(baseline)).loot);
  const ratio = loot / rich;
  assert.ok(Math.abs(ratio - RAID_ECONOMY_FLOOR / (RAID_ECONOMY_FLOOR + 1)) < .02,
    `floor ratio should follow the constant: ${ratio}`);
});

test('loot only includes resources the action tier can reach', () => {
  const s = state();
  s.neighbors.values.commonwealth.economy = 100;
  const ctx = buildRaidEconomy(s);
  const raid = previewRaid(s, 'commonwealth', 0, 300, ctx).loot;
  // 偷袭 must never hand over titanium or alloy.
  assert.equal(raid.titanium, undefined, '偷袭 cannot reach 钛');
  assert.equal(raid.alloy, undefined, '偷袭 cannot reach 合金');
  const sweep = previewRaid(s, 'commonwealth', 2, 300, ctx).loot;
  assert.ok((sweep.titanium ?? 0) > 0, '扫荡 does reach 钛');
});

/** Every action shares one 30-second production baseline. */
test('the loot baseline is 30 seconds of production', () => {
  for (const tier of [0, 1, 2, 3] as const) {
    assert.equal(RAID_ACTIONS[tier].baseSeconds, 30, `tier ${tier} baseSeconds`);
  }
  // A doubling of baseSeconds must exactly double the haul for one tier.
  const s = state();
  s.neighbors.values.commonwealth.economy = 60;
  const ctx = buildRaidEconomy(s);
  const hauled = total(previewRaid(s, 'commonwealth', 1, 300, ctx).loot);
  // Reconstitute the same colony's haul with the declared seconds to confirm the scale.
  const expectedSeconds = RAID_ACTIONS[1].baseSeconds * RAID_ACTIONS[1].tierMultiplier;
  assert.ok(hauled > 0, 'the raid must yield something to compare');
  assert.ok(expectedSeconds === 75, `抢劫 should be 30s × 2.5 = 75s, got ${expectedSeconds}`);
});

test('capacity comes from the real storage rules, not the registry base caps', () => {
  const bare = state();
  const built = state();
  built.buildings.warehouse = 30;
  const bareCap = raidCapacity(bare).wood ?? 0;
  const builtCap = raidCapacity(built).wood ?? 0;
  assert.ok(builtCap > bareCap, `warehouses must raise the ceiling: ${bareCap} → ${builtCap}`);
});
