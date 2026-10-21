import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { calculateBuildingName } from '../src/simulation/building-production';
import { withConstructionPhases } from '../src/vue/construction-rows';
import type { BuildingId } from '../src/types/buildings';
import type { GameState } from '../src/types/state';

/**
 * 分段工程在「已解锁、未建成」时只能显示一行（beta 0.9.26 修复的玩家反馈 bug）。
 *
 * 背景：`tests/segmented-naming.test.ts` 明确规定两条注册表记录**必须同名、不得带后缀**，
 * 玩家靠行内计数区分。但未开工时两条记录的计数都是 `0`，于是一个名称出现两次——玩家
 * 报告的「出现了两个戴森球」。
 *
 * 修正方式：完成体那一行在项目建成前**不显示**。它在未完成时既不能购买也没有开关，
 * 只是一行只能看的信息；建成后分段行自行退休，完成体才出现。
 */

const PROJECTS = (Object.keys(BUILDINGS) as BuildingId[])
  .filter(id => BUILDINGS[id].completesInto)
  .map(id => ({ segment: id, completed: BUILDINGS[id].completesInto! }));

function fresh(): GameState {
  return createInitialState(CONFIG.version, 600, 0);
}

test('未开工的分段工程只渲染建造行，不渲染完成体', () => {
  assert.equal(PROJECTS.length, 7, `expected 7 segmented projects, got ${PROJECTS.length}`);
  const state = fresh();
  for (const { segment, completed } of PROJECTS) {
    const rendered = withConstructionPhases([completed], state);
    assert.deepEqual(rendered, [segment],
      `${completed}: only the phase row may render before the project starts`);
    assert.equal(calculateBuildingName(segment, state), calculateBuildingName(completed, state),
      'both records still share one display name, as segmented-naming requires');
  }
});

test('在建中的分段工程同样只显示建造行', () => {
  const state = fresh();
  for (const { segment, completed } of PROJECTS) {
    for (const built of [1, 50, 99]) {
      state.buildings[segment] = built;
      state.buildings[completed] = 0;
      assert.deepEqual(withConstructionPhases([completed], state), [segment],
        `${completed} at ${built}/100 segments must not show the completed row`);
    }
    state.buildings[segment] = 0;
  }
});

test('建成后完成体出现且建造行退休', () => {
  const state = fresh();
  for (const { segment, completed } of PROJECTS) {
    state.buildings[segment] = 100;
    state.buildings[completed] = 1;
    assert.deepEqual(withConstructionPhases([completed], state), [completed],
      `${completed}: a finished project shows only its completed form`);
    state.buildings[segment] = 0;
    state.buildings[completed] = 0;
  }
});

test('非分段建筑永远只渲染自己一次', () => {
  const state = fresh();
  // Only plain buildings: a completed form of a segmented project is hidden until the
  // project finishes, which the previous tests already cover.
  const completedForms = new Set(PROJECTS.map(project => project.completed));
  for (const id of ['nest', 'factory', 'mine', 'lab', 'catCafe'] as BuildingId[]) {
    assert.ok(!BUILDINGS[id].completesInto && !BUILDINGS[id].segmentedRequired && !completedForms.has(id),
      `${id} is a plain building`);
    assert.deepEqual(withConstructionPhases([id], state), [id], `${id} renders once`);
  }
});

test('建筑页不会出现两个同名条目', () => {
  // The reported symptom, expressed as an invariant over the real render pipeline.
  const state = fresh();
  for (const tech of ['dysonSphere', 'dysonSphereII'] as const) state.tech.push(tech);
  state.prestige.nuclearResets = 1;
  state.buildings.dysonSphere = 0;

  const rendered = withConstructionPhases(['dysonSphere'], state);
  const labels = rendered.map(id => calculateBuildingName(id, state));
  assert.deepEqual(labels, ['戴森球'], 'one 戴森球 row, not two');
  assert.equal(labels.filter(name => name === '戴森球').length, 1);
});

test('详情与收支明细仍使用不带后缀的建筑名', () => {
  // The name helper feeds tooltips and resource breakdowns; it must stay suffix-free.
  const state = fresh();
  for (const { segment, completed } of PROJECTS) {
    assert.equal(calculateBuildingName(segment, state), BUILDINGS[segment].name);
    assert.equal(calculateBuildingName(completed, state), BUILDINGS[completed].name);
    assert.doesNotMatch(calculateBuildingName(segment, state), /（分段）/);
  }
});

test('行标签直接来自注册表名称，面板没有私自改名', () => {
  const panel = readFileSync(new URL('../src/vue/components/BuildingsPanel.vue', import.meta.url), 'utf8');
  assert.match(panel, /<span class="building-name">\{\{ calculateBuildingName\(id, state\) \}\}<\/span>/);
  assert.doesNotMatch(panel, /（分段）/, 'the panel must not invent a suffix');
});
