import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('工作列表 merges the mining crews into one read-only 采矿船操作员 row', () => {
  const panel = read('src/vue/components/CatsPanel.vue');
  // Ships are excluded from the per-building job rows; the merged row replaces them.
  assert.match(panel, /const SHIP_JOB_IDS: readonly BuildingId\[\] = SHIP_CREW_IDS;/);
  assert.match(panel, /!SHIP_JOB_IDS\.includes\(id\)/);
  assert.match(panel, /data-ship-crew-row/);
  assert.match(panel, /data-ship-crew-name[^\n]*SHIP_CREW_JOB_NAME/);
  // The crew row has no manual assignment buttons.
  const row = panel.slice(panel.indexOf('data-ship-crew-row'), panel.indexOf('v-for="row in rows"'));
  assert.doesNotMatch(row, /data-worker=|data-delta=/);
  assert.match(panel, /自动/);
  // Header and idle figure include the derived crew.
  assert.match(panel, /fmt\(used \+ shipCrew\.operators\)/);
  assert.match(panel, /空闲 \{\{ fmt\(spare\) \}\}/);
  assert.match(panel, /采矿船操作员无法手动分配/);
});

test('mining ships show the yellow under-staffed toggle with a crew shortage reason', () => {
  const panel = read('src/vue/components/BuildingsPanel.vue');
  assert.match(panel, /countUndercrewedShips\(id, props\.state\)/);
  assert.match(panel, /'is-shortage': underworking\(id\) \|\| undercrewed\(id\) > 0/);
  assert.match(panel, /data-crew-short/);
  assert.match(panel, /SHIP_CREW_JOB_NAME\}不足：空闲猫口不够，最后启用的采矿船已停机/);
});

test('mining ship crew cost is derived into tooltip rows, not written as text', () => {
  // The crew size lives in the simulation constant, and the tooltip renders it from
  // that constant — no hand-written effect text to drift from the data.
  const crew = read('src/simulation/ship-crew.ts');
  assert.match(crew, /SHIP_CREW_SIZE[^=]*=\s*\{[^}]*iridiumMiningShip: 1[^}]*ironMiningShip: 1[^}]*e710MiningShip: 2/);
  const rows = read('src/vue/building-tooltip-rows.ts');
  assert.match(rows, /Object\.hasOwn\(SHIP_CREW_SIZE, id\)/);
  assert.match(rows, /\$\{SHIP_CREW_JOB_NAME\}（每座）/);
  assert.match(rows, /\$\{number\(SHIP_CREW_SIZE\[id as ShipCrewId\] \|\| 0\)\} 猫口/);
  // Descriptions stay flavor-only: the registry must not restate the crew rule.
  const data = read('src/data/buildings.ts');
  for (const id of ['iridiumMiningShip', 'ironMiningShip', 'e710MiningShip']) {
    const start = data.indexOf(`  ${id}: {`);
    assert.ok(start >= 0, `${id} definition present`);
    const block = data.slice(start, data.indexOf('\n  },', start));
    assert.doesNotMatch(block, /采矿船操作员/, `${id} keeps crew text out of its description`);
  }
});
