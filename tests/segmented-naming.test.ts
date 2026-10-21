import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BUILDINGS } from '../src/data/buildings';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { addBuildingEffectRows } from '../src/vue/building-tooltip-rows';
import type { BuildingDefinition, BuildingId } from '../src/types/buildings';

/**
 * beta 0.9.9 removed the 「（建造中）」 suffix from every construction-phase entry.
 *
 * The two registry records of a segmented project therefore share one display name. Players
 * distinguish them by the count in the row (segments 0-100 versus completed units) and by the
 * purchase/switch controls, never by the label, so a suffix creeping back in would silently
 * break the intended naming.
 */
const SEGMENTED = (Object.keys(BUILDINGS) as BuildingId[])
  .filter(id => BUILDINGS[id].completesInto)
  .map(id => ({ segments: id, completed: BUILDINGS[id].completesInto! }));

test('every construction phase shares its completed building display name', () => {
  assert.ok(SEGMENTED.length >= 7, `expected every segmented project to be registered (${SEGMENTED.length})`);
  for (const { segments, completed } of SEGMENTED) {
    assert.equal(BUILDINGS[segments].name, BUILDINGS[completed].name,
      `${segments} must not advertise itself with a different name than ${completed}`);
  }
});

test('no building name still carries the retired construction suffix', () => {
  for (const [id, building] of Object.entries(BUILDINGS) as [string, BuildingDefinition][]) {
    assert.doesNotMatch(building.name, /建造中/, `${id} keeps a clean display name: ${building.name}`);
  }
  // The suffix must not survive in shipped copy either (docs may quote the removal itself).
  const sources = ['src/data/buildings.ts', 'src/vue/components/BuildingsPanel.vue', 'src/vue/components/TooltipPanel.vue'];
  for (const path of sources) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /（建造中）/, `${path} must not render the retired suffix`);
  }
});

test('construction and completed records stay distinguishable without the suffix', () => {
  for (const { segments, completed } of SEGMENTED) {
    const phase = BUILDINGS[segments], finished = BUILDINGS[completed];
    assert.equal(phase.segmentedRequired, 100, `${segments} keeps its 100-segment requirement`);
    assert.equal(phase.buildable, undefined, `${segments} is the purchasable row`);
    assert.equal(finished.buildable, false, `${completed} is never bought directly`);
    assert.deepEqual(finished.cost, {}, `${completed} quotes no build cost`);
    assert.equal(finished.segmentedRequired, undefined, `${completed} counts units, not segments`);
  }
});

test('the completed AI supercore tooltip reports no retired construction progress', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.buildings.aiSupercore = 1;
  state.buildings.aiSupercoreSegments = 0;
  const support = calculateSupportPreview(state);
  const snapshot = {
    moon: support.moon, asriel: support.asriel, moonBaseUnits: support.moon.baseUnits,
    biologyUnits: support.biologyUnits, dataCenterUnits: support.dataCenterUnits, labUnits: support.labUnits,
    e710ContainerUnits: support.e710ContainerUnits, e710WarehouseUnits: support.e710WarehouseUnits,
    researchStationUnits: support.researchStationUnits, blackHoleStationUnits: support.blackHoleStationUnits,
    stageThree: support.stageThree, digital: support.digital,
  };
  const tip = { description: BUILDINGS.aiSupercore.desc || '', footnote: '', rows: [] as { name: string; value: string }[] };
  const add = (name: string, value: string) => { tip.rows.push({ name, value }); };
  addBuildingEffectRows({
    id: 'aiSupercore', building: BUILDINGS.aiSupercore, state, snapshot: snapshot as never, count: 1,
    tip, add, number: String, percent: String, formatEffectNumber: String,
  });
  const rendered = `${tip.description}\n${tip.rows.map(row => `${row.name}${row.value}`).join('\n')}`;
  assert.doesNotMatch(rendered, /NaN|undefined/, `the completed core tooltip must never leak a missing field:\n${rendered}`);
  assert.doesNotMatch(rendered, /建造进度|分段进度/, 'a finished project has no construction phase to report');
  assert.ok(tip.rows.some(row => row.name === '已建成核心' && row.value === '1'), 'the completed row counts cores');
});
