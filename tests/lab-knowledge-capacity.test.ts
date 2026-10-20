import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { calculateProduction } from '../src/simulation/production';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateStorageDetails } from '../src/simulation/storage';
import { storageSnapshot } from '../src/vue/format';

function labState() {
  const s = createInitialState(CONFIG.version, 60, 0);
  s.tech.push('writing', 'electricity');
  s.buildings.lab = 2; s.workers.lab = 2; s.population = 10;
  s.resources.food = 1e6; s.resources.knowledge = 0;
  return s;
}
const capacityRows = (s: ReturnType<typeof createInitialState>, revision: number) =>
  calculateStorageDetails('knowledge', s, storageSnapshot(s, 1, revision) as never).rows
    .filter(row => row.name.startsWith('实验室'));

test('供电的实验室知识容量覆盖未供电的，且储量明细随供电实时变化', () => {
  const s = labState();
  // Unpowered: 2 × 1000, no separate powered row.
  assert.deepEqual(capacityRows(s, 1).map(row => row.name), ['实验室 ×2']);
  assert.equal(calculateStorageDetails('knowledge', s, storageSnapshot(s, 1, 1) as never).total, 1000 + 2 * 1000);

  // One solar farm (4 W) funds both labs: the detail must grow immediately.
  s.buildings.solarFarm = 1;
  const lit = calculateStorageDetails('knowledge', s, storageSnapshot(s, 1, 2) as never);
  assert.equal(lit.total, 1000 + 2 * 2000, '供电实验室按每座2000计，覆盖未供电的1000');
  const litRows = lit.rows.filter(row => row.name.startsWith('实验室'));
  assert.equal(litRows.length, 2, 'powered capacity gets its own row instead of being deduplicated away');
  assert.ok(litRows.some(row => row.name.includes('供电')), `powered row label is distinguishable: ${litRows.map(row => row.name)}`);

  // Cutting power removes it again in the same detail path.
  s.buildings.solarFarm = 0;
  const dark = calculateStorageDetails('knowledge', s, storageSnapshot(s, 1, 3) as never);
  assert.equal(dark.total, 1000 + 2 * 1000);
  assert.ok(!dark.rows.some(row => row.name.includes('供电')), '断电后不再显示供电容量行');
});

test('猫猫科学家不受供电影响：未供电实验室照常提供岗位与产出', () => {
  const s = labState();
  // No power at all after 电力: the labs request it, but nobody is stopped and the
  // scientists keep producing.
  const dark = calculateProduction(s);
  assert.equal(calculateSupportPreview(s).labUnits, 0);
  assert.equal(dark.power.available, -4, 'two labs still request 4 watts');
  assert.equal(dark.inputUnits.lab, 2, '未供电实验室仍结算猫猫科学家');
  assert.ok(dark.rates.knowledge > 0, `未供电实验室的知识产出大于0: ${dark.rates.knowledge}`);

  // Funding them changes only the capacity, not the scientist count.
  s.buildings.solarFarm = 1;
  const lit = calculateProduction(s);
  assert.equal(calculateSupportPreview(s).labUnits, 2);
  assert.equal(lit.inputUnits.lab, 2);
  assert.ok(Math.abs(lit.rates.knowledge - dark.rates.knowledge) < 1e-9, '供电只影响容量，不影响科学家产出');
  // A stopped lab still stops its scientists (user stop, not a brownout).
  s.buildings.solarFarm = 0; s.stoppedBuildings.lab = 1;
  assert.ok(calculateProduction(s).rates.knowledge < dark.rates.knowledge, '手动关停的实验室停止产出');
});

test('供电不足不会把实验室加进有效停机集合，但会标记供电短缺', () => {
  const s = labState();
  const result = calculateProduction(s);
  assert.equal(result.powerGrid.failed.lab, 2, '供电不足计入 failed，用于黄色标记');
  assert.equal(s.stoppedBuildings.lab, 0, 'grid never writes a brownout into the user-facing stop counts');
  assert.equal(result.inputUnits.lab, 2);
});
