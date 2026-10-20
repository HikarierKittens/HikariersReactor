import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { TECHNOLOGIES } from '../src/data/technologies';
import { RESOURCES } from '../src/data/resources';
import { createNeighborsState, describeLoot, executeRaid } from '../src/simulation/neighbors';
import { buildRaidEconomy } from '../src/simulation/neighbor-economy';
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

function state(): GameState {
  const s = createInitialState(CONFIG.version, 600, 0);
  for (const id of ['government', 'military']) addTech(s.tech, id);
  s.soldiers = 400;
  s.population = 20;
  s.resources.food = 5000;
  s.buildings.barracks = 200;
  // Loot is a share of the player's own output, so the fixture must actually produce.
  s.buildings.forage = 6; s.workers.forage = 6;
  s.buildings.lumber = 6; s.workers.lumber = 6;
  s.neighbors = createNeighborsState(seeded(7));
  return s;
}

/** Make the target weak and friendly so the raid clearly succeeds without retaliation. */
function weakTarget(s: GameState): void {
  s.neighbors.values.commonwealth.military = 10;
  s.neighbors.values.commonwealth.economy = 40;
  s.neighbors.values.commonwealth.opinion = 100;
}

test('a successful raid logs the resources it actually plundered', () => {
  const s = state();
  weakTarget(s);
  s.logs = [];
  const outcome = executeRaid(s, 'commonwealth', 0, 200, seeded(5), buildRaidEconomy(s));
  assert.equal(outcome.ok, true);
  const lootResources = Object.keys(outcome.loot) as ResourceId[];
  assert.ok(lootResources.length > 0, 'the raid brought something home');

  const lootLine = s.logs.find(entry => entry.text.includes('掠夺'));
  assert.ok(lootLine, `expected a loot log line, got ${JSON.stringify(s.logs.map(l => l.text))}`);
  // Every plundered resource must be named, with a number after it.
  for (const resource of lootResources) {
    assert.ok(lootLine!.text.includes(RESOURCES[resource].name),
      `${RESOURCES[resource].name} must appear in "${lootLine!.text}"`);
  }
  assert.match(lootLine!.text, /^偷袭.+：掠夺 .+。$/);
  assert.equal(lootLine!.type, 'progress');
});

test('the logged loot matches what the stockpile actually received', () => {
  const s = state();
  weakTarget(s);
  const before = { ...s.resources };
  s.logs = [];
  const outcome = executeRaid(s, 'commonwealth', 1, 200, seeded(9), buildRaidEconomy(s));
  assert.equal(outcome.ok, true);
  for (const [resource, amount] of Object.entries(outcome.loot) as [ResourceId, number][]) {
    assert.ok(Math.abs((s.resources[resource] - before[resource]) - amount) < 1e-9,
      `${resource} stock delta must equal the logged amount`);
  }
});

test('no loot means no loot line, so the log never claims an empty haul', () => {
  // describeLoot is the gate: an empty map produces nothing to report.
  assert.equal(describeLoot({}), '');
  assert.equal(describeLoot({ food: 0 }), '', 'zero amounts are filtered out');
  assert.equal(describeLoot({ food: NaN }), '', 'non-finite amounts are filtered out');
  assert.equal(describeLoot({ food: 2 }), '猫粮 2');

  const s = state();
  s.logs = [];
  // A refused raid must not log loot either.
  const refused = executeRaid(s, 'mikaros', 3, 1, seeded(1), buildRaidEconomy(s));
  assert.equal(refused.ok, false);
  assert.ok(!s.logs.some(entry => entry.text.includes('掠夺')), 'refused raids log no loot');
});

test('loot is listed in resource-tier order, not object insertion order', () => {
  // Deliberately backwards: wood is a basic resource and must be listed before 钛.
  assert.equal(describeLoot({ titanium: 1, wood: 2 } as never), '木材 2、钛 1');
  // Unknown-to-tier extras still appear after the ordered ones.
  const text = describeLoot({ food: 1, cash: 5 } as never);
  assert.ok(text.startsWith('猫粮 1'), text);
  assert.ok(text.includes('$ 5'), text);
});

test('the loot line is separate from the casualty line so both stay readable', () => {
  const s = state();
  weakTarget(s);
  s.logs = [];
  executeRaid(s, 'commonwealth', 2, 300, seeded(11), buildRaidEconomy(s));
  const lootLine = s.logs.find(entry => entry.text.includes('掠夺'));
  const casualtyLine = s.logs.find(entry => entry.text.includes('阵亡'));
  assert.ok(lootLine && casualtyLine, 'both lines exist');
  assert.notEqual(lootLine, casualtyLine, 'they are distinct entries');
  assert.ok(!lootLine!.text.includes('阵亡'), 'loot line does not mix in casualties');
  assert.ok(!casualtyLine!.text.includes('掠夺'), 'casualty line does not mix in loot');
});
