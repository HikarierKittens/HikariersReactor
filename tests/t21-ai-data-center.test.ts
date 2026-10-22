import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { BUILDINGS } from '../src/data/buildings';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { createInitialState } from '../src/state/create-state';
import { validateAndMigrateSave } from '../src/state/validate-save';
import {
  ADAMANTITE_PROCESSOR_AI_BONUS, AI_CEMENT_DIVISOR, AI_DATA_CENTER_POWER, AI_DATA_CENTER_POWER_STEP, AI_GRAPHENE_DIVISOR,
  calculateAdamantiteProcessorBonus, calculateAiCementBonusPerCenter, calculateAiCementMultiplier, calculateAiDataCenterPower,
  calculateAiGrapheneBonusPerCenter, calculateAiGrapheneMultiplier, countRunningAiDataCenters,
} from '../src/simulation/ai-data-center';
import { addBuildingEffectRows } from '../src/vue/building-tooltip-rows';
import { storageSnapshot } from '../src/vue/format';
import { formatEffectNumber } from '../src/shared/format';
import { calculateBuildingCost, calculateBuildingScale } from '../src/simulation/costs';
import { calculateQuantumLevel, calculateQuantumSnapshot } from '../src/simulation/quantum';
import { calculateProduction } from '../src/simulation/production';
import { calculateResourceBreakdown, calculateResourceFactorRows } from '../src/simulation/resource-breakdown';
import { isBuildingUnlocked, isTechnologyUnlocked } from '../src/simulation/unlocks';
import { calculateBuildingInput } from '../src/simulation/building-production';
import { supplyPower } from './support/power';
import type { GameState } from '../src/types/state';
import type { ResourceId } from '../src/types/economy';
import type { TechnologyId } from '../src/types/technologies';

const fresh = (): GameState => createInitialState(CONFIG.version, 60, 0);
const near = (a: number, b: number, label = '') => assert.ok(Math.abs(a - b) < 1e-7, `${label} ${a} != ${b}`);

/** Add a technology together with its full prerequisite closure. */
function addTech(tech: TechnologyId[], id: string): void {
  if (tech.includes(id as TechnologyId)) return;
  for (const parent of TECHNOLOGIES[id as TechnologyId].pre) addTech(tech, parent);
  tech.push(id as TechnologyId);
}

/** A 卡尔维拉 state that can actually run AI数据中心. */
function calvira(): GameState {
  const s = fresh();
  s.tech.push('artificialIntelligenceII');
  addTech(s.tech, 'aiDataCenter');
  s.neutronStarMissionCompleted = true;
  // 量子水平 needs a knowledge cap worth talking about; the centre bonus is multiplicative on it.
  s.buildings.library = 200;
  Object.assign(s.resources, { knowledge: 1e9, deuterium: 1e6, graphene: 1e6, adamantite: 1e6, mithril: 1e6, nanoAlloy: 1e6 });
  supplyPower(s, 100000);
  return s;
}

/** Drive the real tooltip row builder the way TooltipPanel does, keyed by row name. */
function aiTip(state: GameState): { value: Map<string, string>; note: Map<string, string> } {
  const tip = { description: '', footnote: '', rows: [] as unknown[] };
  const value = new Map<string, string>();
  const note = new Map<string, string>();
  addBuildingEffectRows({
    id: 'aiDataCenter', building: BUILDINGS.aiDataCenter, state, snapshot: storageSnapshot(state),
    count: state.buildings.aiDataCenter, tip,
    add: (name: string, text: string, _negative?: boolean, explanation?: string) => {
      value.set(name, text);
      note.set(name, explanation ?? '');
    },
    number: (n: number) => String(Number(n.toFixed(2))), percent: formatEffectNumber,
    formatEffectNumber,
  });
  return { value, note };
}

test('AI数据中心 is a T21 卡尔维拉 technology gated by 纳米合金, 能量护盾 and the neutron-star mission', () => {
  const tech = TECHNOLOGIES.aiDataCenter;
  assert.equal(tech.name, 'AI数据中心');
  assert.equal(tech.tier, 21);
  assert.deepEqual([...tech.pre].sort(), ['energyShield', 'nanoAlloy']);
  assert.equal(tech.spaceMissionRequired, 'neutronStar');
  // The description is the requested flavour line and must carry no numbers.
  assert.equal(tech.desc, '让CatGPT和DeepSleep来优化喵星机器的运转，距离AGI更进一步');

  const s = fresh();
  assert.equal(isTechnologyUnlocked('aiDataCenter', s), false, 'nothing researched');
  addTech(s.tech, 'aiDataCenter');
  assert.equal(isTechnologyUnlocked('aiDataCenter', s), false, 'neutron star missing');
  s.neutronStarMissionCompleted = true;
  assert.equal(isTechnologyUnlocked('aiDataCenter', s), true);
  // The building itself needs the technology plus the same mission.
  assert.equal(isBuildingUnlocked('aiDataCenter', { ...s, tech: [] }), false);
  assert.equal(isBuildingUnlocked('aiDataCenter', s), true);
});

test('the building sits in 卡尔维拉 with 200k knowledge creeping at 1.15 and 1.20 materials', () => {
  const building = BUILDINGS.aiDataCenter;
  assert.equal(building.name, 'AI数据中心');
  assert.equal(building.tech, 'aiDataCenter');
  assert.equal(building.spaceMissionRequired, 'neutronStar');
  assert.equal(building.cost.knowledge, 200000);
  for (const resource of ['mithril', 'nanoAlloy', 'graphene', 'adamantite'] as ResourceId[]) {
    assert.ok((building.cost[resource] ?? 0) > 0, `${resource} is part of the price`);
  }
  const s = calvira();
  assert.equal(calculateBuildingScale('aiDataCenter', 'knowledge', s), 1.15);
  for (const resource of ['mithril', 'nanoAlloy', 'graphene', 'adamantite'] as ResourceId[]) {
    assert.equal(calculateBuildingScale('aiDataCenter', resource, s), 1.2, `${resource} creep`);
  }
  // 1.15^2 ≈ 1.3225: the second centre's knowledge price stays a safe integer.
  assert.equal(calculateBuildingCost('aiDataCenter', 2, s).knowledge, Math.ceil(200000 * 1.15 ** 2));
});

test('power grows by 5 per centre already built: N units each demand 25+5(N-1)', () => {
  const s = calvira();
  assert.equal(calculateAiDataCenterPower(s), AI_DATA_CENTER_POWER);
  s.buildings.aiDataCenter = 4;
  assert.equal(calculateAiDataCenterPower(s), AI_DATA_CENTER_POWER + 3 * AI_DATA_CENTER_POWER_STEP);
  // The registry input and the grid demand read the same helper.
  assert.deepEqual(calculateBuildingInput('aiDataCenter', s), { energy: 40 });
  // The per-unit figure follows the owned count, so four units request 4 × 40.
  const p = calculateProduction(s, 1);
  assert.equal(p.powerGrid.requested, 4 * 40);
  assert.equal(p.power.used, 4 * 40);
  for (const requested of [0, 40, 79, 119, 160]) {
    const scaled = calvira();
    scaled.buildings.aiDataCenter = 4;
    supplyPower(scaled, requested);
    const grid = calculateProduction(scaled, 1).powerGrid;
    assert.equal(grid.requested, 160, 'still every enabled unit');
    assert.equal(grid.failed.aiDataCenter ?? 0, 4 - Math.min(4, Math.floor(requested / 40)), `${requested}W funded`);
  }
});

test('each running centre adds 5% of the base multiplier to 量子水平', () => {
  const s = calvira();
  const base = calculateQuantumSnapshot(s, undefined, 0);
  near(calculateQuantumLevel(s), base.level);
  // One centre: +5% of the base multiplier.
  s.buildings.aiDataCenter = 1;
  const one = calculateQuantumSnapshot(s, undefined, 0);
  assert.equal(one.centers, 1);
  near(one.level, Math.floor(one.base * 1.05 * 100) / 100);
  s.buildings.aiDataCenter = 3;
  const three = calculateQuantumSnapshot(s, undefined, 0);
  assert.equal(three.centers, 3);
  near(three.level, Math.floor(three.base * (1 + .05 * 3) * 100) / 100);
  // A stopped centre grants nothing.
  s.stoppedBuildings.aiDataCenter = 3;
  assert.equal(countRunningAiDataCenters(s), 0);
  assert.equal(calculateQuantumSnapshot(s, undefined, 0).centers, 0);
});

test('AI水泥工坊 adds (量子水平 / 1.75)% cement output per running centre', () => {
  const s = calvira();
  s.tech.push('cement', 'aiCementWorkshop');
  s.buildings.aiDataCenter = 2;
  s.buildings.cementWorkshop = 1;
  s.workers.cementWorkshop = 2;
  Object.assign(s.resources, { stone: 1e9 });
  const quantum = calculateQuantumLevel(s);
  const plain = { ...s };
  plain.tech = plain.tech.filter(id => id !== 'aiCementWorkshop');
  const without = calculateProduction(plain, 1).rates.cement;
  const withTech = calculateProduction(s, 1).rates.cement;
  const expected = 1 + 2 * quantum / AI_CEMENT_DIVISOR / 100;
  near(withTech / without, expected, 'multiplier');
  near(calculateAiCementMultiplier(s, quantum), expected);
  near(calculateAiCementBonusPerCenter(quantum) * 100, quantum / AI_CEMENT_DIVISOR, 'per-centre pct');
  near(calculateAiCementMultiplier(s, quantum), 1 + 2 * calculateAiCementBonusPerCenter(quantum));
  // Without the centre there is no bonus at all.
  s.buildings.aiDataCenter = 0;
  assert.equal(calculateAiCementMultiplier(s, quantum), 1);
});

test('高级精金加工 raises every refinery to 10% + 2% per running centre', () => {
  const s = calvira();
  s.buildings.aiDataCenter = 4;
  assert.equal(calculateAdamantiteProcessorBonus(s), .1, 'base 10%, no tech');
  s.tech.push('advancedAdamantiteProcessing');
  near(calculateAdamantiteProcessorBonus(s), .1 + .02 * 4);
  // The miner follows the same figure: 2 miners × (1 + perStation × 4 stations).
  s.tech.push('superMetal');
  s.buildings.adamantiteMiningShip = 2;
  s.buildings.adamantiteProcessor = 4;
  Object.assign(s.resources, { helium3: 1e6 });
  supplyPower(s, 100000);
  const p = calculateProduction(s, 1);
  near(p.rates.adamantite, .25 * 2 * (1 + .18 * 4));
  near(calculateResourceBreakdown('adamantite', s, p).net, p.rates.adamantite);
});

test('高级石墨烯加工 scales graphene by (量子水平 / 5)% per running centre', () => {
  const s = calvira();
  s.tech.push('superMetal', 'grapheneProcessing');
  s.buildings.grapheneFactory = 1;
  s.buildings.aiDataCenter = 3;
  Object.assign(s.resources, { oil: 1e9 });
  const quantum = calculateQuantumLevel(s);
  const before = calculateProduction(s, 1).rates.graphene;
  near(before, 1.5, 'no tech yet');
  s.tech.push('advancedGrapheneProcessing');
  const after = calculateProduction(s, 1).rates.graphene;
  near(after / before, 1 + 3 * quantum / AI_GRAPHENE_DIVISOR / 100);
  near(calculateAiGrapheneMultiplier(s, quantum), 1 + 3 * quantum / AI_GRAPHENE_DIVISOR / 100);
  near(calculateAiGrapheneBonusPerCenter(quantum) * 100, quantum / AI_GRAPHENE_DIVISOR, 'per-centre pct');
  // Breakdown stays in sync with the settlement and lists the factor.
  near(calculateResourceBreakdown('graphene', s, calculateProduction(s, 1)).net, after);
  const rows = calculateResourceFactorRows('graphene', s, calculateProduction(s, 1)).rows;
  assert.ok(rows.some(row => row.name === '高级石墨烯加工' && row.child), 'graphene bonus row');
});

test('the tooltip lists the bonus of a single centre, with no suffix or extra explanation', () => {
  const s = calvira();
  s.tech.push('cement', 'aiCementWorkshop', 'advancedGrapheneProcessing', 'advancedAdamantiteProcessing');
  s.buildings.aiDataCenter = 4;
  s.stoppedBuildings.aiDataCenter = 1;
  const running = countRunningAiDataCenters(s);
  assert.equal(running, 3, 'one stopped centre is not running');
  const quantum = calculateQuantumLevel(s);
  const { value: rows, note } = aiTip(s);

  // Each follow-up technology shows the per-centre figure, and nothing else.
  assert.equal(rows.get('水泥产量'), `+${formatEffectNumber(quantum / AI_CEMENT_DIVISOR)}%`);
  assert.equal(rows.get('石墨烯产量'), `+${formatEffectNumber(quantum / AI_GRAPHENE_DIVISOR)}%`);
  assert.equal(rows.get('精金精炼站加成数值'), `+${formatEffectNumber(ADAMANTITE_PROCESSOR_AI_BONUS * 100)}%`);
  // ...and therefore not the figure multiplied by the running centres.
  assert.notEqual(rows.get('水泥产量'), `+${formatEffectNumber(quantum / AI_CEMENT_DIVISOR * running)}%`);
  assert.notEqual(rows.get('精金精炼站加成数值'), `+${formatEffectNumber(ADAMANTITE_PROCESSOR_AI_BONUS * 100 * running)}%`);
  // 量子水平 was already per-centre.
  assert.equal(rows.get('量子水平'), '+5%');
  // No "/座" suffix and no second-line explanation unless the user asked for one.
  for (const name of ['量子水平', '水泥产量', '石墨烯产量', '精金精炼站加成数值']) {
    assert.equal(note.get(name), '', `${name} has no extra explanation`);
    assert.ok(!(rows.get(name) ?? '').includes('/座'), `${name} has no /座 suffix`);
  }

  // Per-centre × running centres is the multiplier the settlement applies (rounding aside).
  const perCentre = (name: string) => parseFloat((rows.get(name) || '').replace('+', ''));
  const tolerance = running * .005 + 1e-9;
  assert.ok(Math.abs(1 + running * perCentre('水泥产量') / 100 - calculateAiCementMultiplier(s, quantum)) < tolerance, 'cement total');
  assert.ok(Math.abs(1 + running * perCentre('石墨烯产量') / 100 - calculateAiGrapheneMultiplier(s, quantum)) < tolerance, 'graphene total');
  assert.ok(Math.abs(.1 + running * perCentre('精金精炼站加成数值') / 100 - calculateAdamantiteProcessorBonus(s)) < tolerance, 'refinery total');

  // The rows appear as soon as the technology is known, so an idle player can read the rate.
  const idle = calvira();
  idle.tech.push('cement', 'aiCementWorkshop');
  const idleCement = aiTip(idle).value.get('水泥产量') || '';
  assert.ok(idleCement.startsWith('+') && idleCement.endsWith('%'), 'idle centre still lists the per-centre rate');
});

test('the power surcharge row sits last and reports the per-extra-centre step', () => {
  // Each extra centre raises every centre's draw, so the row explains the 电力 number above it.
  // It must stay the final row and carry the plain step value, with no suffix or note.
  const s = calvira();
  s.buildings.aiDataCenter = 3;
  const { value: rows, note } = aiTip(s);
  assert.equal(rows.get('AI数据中心耗电'), `+${formatEffectNumber(AI_DATA_CENTER_POWER_STEP)}`, 'plain step value');
  assert.equal(note.get('AI数据中心耗电'), '', 'no extra explanation');
  assert.ok(!(rows.get('AI数据中心耗电') ?? '').includes('/座'), 'no /座 suffix');
  // 电力 itself already carries the surcharge, so the two rows are consistent.
  const expectedPower = AI_DATA_CENTER_POWER + AI_DATA_CENTER_POWER_STEP * (s.buildings.aiDataCenter - 1);
  assert.equal(rows.get('电力'), `-${formatEffectNumber(expectedPower)}`);
  // Last row: nothing in the builder may be appended after it.
  const tip = { description: '', footnote: '', rows: [] as unknown[] };
  const names: string[] = [];
  addBuildingEffectRows({
    id: 'aiDataCenter', building: BUILDINGS.aiDataCenter, state: s, snapshot: storageSnapshot(s),
    count: s.buildings.aiDataCenter, tip,
    add: (name: string) => { names.push(name); },
    number: (n: number) => String(Number(n.toFixed(2))), percent: formatEffectNumber,
    formatEffectNumber,
  });
  assert.equal(names[names.length - 1], 'AI数据中心耗电', 'rendered last');
});


test('the three follow-up technologies hang off AI数据中心 at T21 with the requested prices', () => {
  const expectations = [
    { id: 'aiCementWorkshop', name: 'AI水泥工坊', knowledge: 1750000 },
    { id: 'advancedAdamantiteProcessing', name: '高级精金加工', knowledge: 1800000 },
    { id: 'advancedGrapheneProcessing', name: '高级石墨烯加工', knowledge: 1900000 },
  ] as const;
  for (const expected of expectations) {
    const tech = TECHNOLOGIES[expected.id];
    assert.equal(tech.name, expected.name, expected.id);
    assert.equal(tech.tier, 21, `${expected.id} tier`);
    assert.equal(tech.cost.knowledge, expected.knowledge, `${expected.id} price`);
    assert.deepEqual(tech.pre, ['aiDataCenter'], `${expected.id} prerequisite`);
    // Locked until the centre itself is researched, then immediately available.
    const s = fresh();
    s.tech.push('nanoAlloy', 'energyShield');
    s.neutronStarMissionCompleted = true;
    assert.equal(isTechnologyUnlocked(expected.id, s), false, `${expected.id} before the centre`);
    s.tech.push('aiDataCenter');
    assert.equal(isTechnologyUnlocked(expected.id, s), true, `${expected.id} after the centre`);
  }
});

test('a previous-release save gains the AI数据中心 record with an upgrade default', () => {
  // Use the frozen pre-release JSON that the compatibility suite already maintains: it is a
  // real historical save, so this checks the upgrade on data the project actually shipped.
  const raw = JSON.parse(readFileSync(new URL('./fixtures/pre-beta0.9.5-schema31.json', import.meta.url), 'utf8'));
  const fields = ['buildings', 'workers', 'stoppedBuildings'] as const;
  for (const field of fields) assert.equal(Object.hasOwn(raw[field], 'aiDataCenter'), false, `${field} predates the building`);
  const context = { now: 1_000_000, eventInterval: 60, housingCapacity: () => 1e6, clampResources: () => undefined };
  const loaded = validateAndMigrateSave(raw, context);
  assert.equal(loaded.buildings.aiDataCenter, 0, 'absent record backfills to zero');
  assert.equal(loaded.workers.aiDataCenter, 0);
  assert.equal(loaded.stoppedBuildings.aiDataCenter, 0);
  // An explicitly malformed value is still rejected instead of being repaired.
  for (const field of fields) {
    const broken = JSON.parse(JSON.stringify(raw));
    broken[field].aiDataCenter = .5;
    assert.throws(() => validateAndMigrateSave(broken, context), `${field} malformed`);
  }
});
