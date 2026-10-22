import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { calculateStorageBonuses } from '../src/simulation/storage-bonuses';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { addBuildingEffectRows } from '../src/vue/building-tooltip-rows';
import { BUILDINGS } from '../src/data/buildings';

/** Drive the real tooltip row builder the way TooltipPanel does. */
function labTip(state: ReturnType<typeof createInitialState>) {
  const support = calculateSupportPreview(state);
  const snapshot = {
    moon: support.moon, asriel: support.asriel, moonBaseUnits: support.moon.baseUnits,
    biologyUnits: support.biologyUnits, dataCenterUnits: support.dataCenterUnits, labUnits: support.labUnits,
    e710ContainerUnits: support.e710ContainerUnits, e710WarehouseUnits: support.e710WarehouseUnits,
    researchStationUnits: support.researchStationUnits, blackHoleStationUnits: support.blackHoleStationUnits,
    stageThree: support.stageThree, digital: support.digital,
  };
  const tip = { description: '让好奇心找到答案。', footnote: '', rows: [] as { name: string; value: string }[] };
  const add = (name: string, value: string) => { tip.rows.push({ name, value }); };
  addBuildingEffectRows({
    id: 'lab', building: BUILDINGS.lab, state, snapshot: snapshot as never, count: state.buildings.lab,
    tip, add, number: (n: number) => String(Number(n.toFixed(2))), percent: (n: number) => String(n),
    formatEffectNumber: (n: number) => String(Number(n.toFixed(2))),
  });
  return tip;
}

function labState() {
  const s = createInitialState(CONFIG.version, 60, 0);
  s.tech.push('writing');
  s.buildings.lab = 1;
  return s;
}

test('实验室 effects are rows in the 建筑效果 block, not a header description', () => {
  const base = labTip(labState());
  assert.equal(base.description, '让好奇心找到答案。', 'description keeps only the flavor line');
  assert.deepEqual(base.rows.map(row => `${row.name}${row.value}`), ['猫猫科学家+1', '知识容量+1000']);

  const powered = labState();
  powered.tech.push('electricity');
  assert.deepEqual(labTip(powered).rows.map(row => `${row.name}${row.value}`),
    ['猫猫科学家+1', '知识容量+1000', '供能时知识容量+2000，电力-2']);
});

test('实验室 capacity values stay live with the satellite/institute multipliers', () => {
  // x follows the real per-building capacity; the powered value is always 2x.
  const satellites = labState();
  satellites.tech.push('electricity');
  satellites.buildings.researchSatellite = 4;
  const satelliteRows = labTip(satellites).rows;
  const perBuilding = calculateStorageBonuses('lab', satellites, null).knowledge!;
  assert.equal(perBuilding, 1200, '4 satellites add 5% each');
  assert.deepEqual(satelliteRows.map(row => row.value), ['+1', '+1200', '+2400，电力-2']);

  const institutes = labState();
  institutes.tech.push('electricity');
  institutes.arpaBuildings.arpaResearchInstitute = 2;
  assert.deepEqual(labTip(institutes).rows.map(row => row.value), ['+1', '+1080', '+2160，电力-2']);
});

test('实验室 capacity row matches the storage detail source exactly', () => {
  const state = labState();
  state.tech.push('electricity');
  state.buildings.researchSatellite = 2;
  const described = Number(labTip(state).rows[1]?.value.replace('+', ''));
  assert.equal(described, calculateStorageBonuses('lab', state, null).knowledge, 'tooltip and storage details share one source');
});

test('军营 tooltip keeps only the soldier cap number, without the removed note', () => {
  const state = createInitialState(CONFIG.version, 60, 0);
  state.buildings.barracks = 2;
  const support = calculateSupportPreview(state);
  const notes: string[] = [];
  const rows: { name: string; value: string }[] = [];
  addBuildingEffectRows({
    id: 'barracks', building: BUILDINGS.barracks, state,
    snapshot: {
      moon: support.moon, asriel: support.asriel, moonBaseUnits: support.moon.baseUnits,
      biologyUnits: support.biologyUnits, dataCenterUnits: support.dataCenterUnits, labUnits: support.labUnits,
      e710ContainerUnits: support.e710ContainerUnits, e710WarehouseUnits: support.e710WarehouseUnits,
      researchStationUnits: support.researchStationUnits, blackHoleStationUnits: support.blackHoleStationUnits,
      stageThree: support.stageThree, digital: support.digital,
    } as never,
    count: state.buildings.barracks, tip: { description: '', footnote: '', rows: [] } as never,
    add: (name, value, _negative, note) => { rows.push({ name, value }); if (note) notes.push(note); },
    number: (n: number) => String(Number(n.toFixed(2))), percent: (n: number) => String(n),
    formatEffectNumber: (n: number) => String(Number(n.toFixed(2))),
  });
  const capRow = rows.find(row => row.name === '士兵容量');
  assert.ok(capRow, `soldier cap row exists [${rows.map(row => row.name).join(' / ')}]`);
  assert.equal(capRow.value, '+2', 'two barracks give +2 soldier cap');
  // 0.9.39 移除了「军营数量决定士兵数量上限……」这段小字：任何行都不应再带备注。
  assert.deepEqual(notes, [], `no tooltip notes expected [${notes.join(' | ')}]`);
});
