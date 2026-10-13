import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS, BUILDING_GROUPS } from '../src/data/buildings';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { calculateBuildingCost, calculateBuildingScale, calculateDynamicCreep } from '../src/simulation/costs';
import { calculateHousingDetails } from '../src/simulation/housing';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateTechnologyTier } from '../src/simulation/technology';
import { isBuildingUnlocked, isTechnologyUnlocked } from '../src/simulation/unlocks';
import type { ResourceId } from '../src/types/economy';

const fresh = () => createInitialState(CONFIG.version, 60, 0);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const context = { now: 0, eventInterval: 60, housingCapacity: () => 1e6, clampResources: () => {} };
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('猫窝 houses 1 and 猫窝MKII houses 2', () => {
  assert.equal(BUILDINGS.nest.cap, 1);
  assert.equal(BUILDINGS.nestMKII.cap, 2);
  const s = fresh();
  s.buildings.nest = 3; s.buildings.nestMKII = 2;
  const rows = calculateHousingDetails(s, calculateSupportPreview(s).asriel);
  assert.equal(rows.find(row => row.name === '猫窝')!.value, 3);
  assert.equal(rows.find(row => row.name === '猫窝MKII')!.value, 4);
});

test('猫猫小屋 tech is T3 after 农业 for 750 knowledge and unlocks the building', () => {
  const tech = TECHNOLOGIES.catHut;
  assert.equal(calculateTechnologyTier('catHut'), 3);
  assert.deepEqual(tech.pre, ['agriculture']);
  assert.deepEqual(tech.cost, { knowledge: 750 });
  const s = fresh();
  s.tech.push('survival', 'tools', 'writing');
  assert.equal(isTechnologyUnlocked('catHut', s), false);
  s.tech.push('agriculture');
  assert.equal(isTechnologyUnlocked('catHut', s), true);
  assert.equal(isBuildingUnlocked('catHut', s), false);
  s.tech.push('catHut');
  assert.equal(isBuildingUnlocked('catHut', s), true);
});

test('猫猫小屋 copies 猫窝 base values with independent data and 1.35 creep', () => {
  const hut = BUILDINGS.catHut, nest = BUILDINGS.nest;
  assert.deepEqual(hut.cost, nest.cost);
  assert.notEqual(hut.cost, nest.cost, 'separate objects, not shared parameters');
  assert.deepEqual(hut.costScales, { wood: 1.35, stone: 1.35, cash: 1.35 });
  assert.equal(hut.cap, 1);
  assert.equal(hut.desc, '猫口容量+1');
  assert.ok(BUILDING_GROUPS.find(group => group.id === 'housing')!.buildings.includes('catHut'));
  const s = fresh();
  // No early-cash exception: the first hut charges cash like any other building.
  assert.deepEqual(calculateBuildingCost('catHut', 0, s), { wood: 18, stone: 9, cash: 10 });
  assert.equal(calculateBuildingCost('catHut', 4, s).wood, Math.ceil(18 * 1.35 ** 4));
  s.buildings.catHut = 2;
  assert.equal(calculateHousingDetails(s, calculateSupportPreview(s).asriel).find(row => row.name === '猫猫小屋')!.value, 2);
  // Neither housing-material tech applies to the hut.
  s.tech.push('steelBuildingMaterials', 'neutronConstructionMaterials');
  assert.deepEqual(calculateDynamicCreep('catHut', 'wood', s), []);
});

test('钢制建材 is T5 for 5k knowledge + 500 steel and cuts 猫窝/MKII creep by 0.01', () => {
  const tech = TECHNOLOGIES.steelBuildingMaterials;
  assert.equal(calculateTechnologyTier('steelBuildingMaterials'), 5);
  assert.deepEqual(tech.cost, { knowledge: 5000, metal: 500 });
  assert.deepEqual(tech.pre, ['metallurgy']);
  const s = fresh();
  s.tech.push('steelBuildingMaterials');
  for (const id of ['nest', 'nestMKII'] as const) {
    for (const [resource, raw] of Object.entries(BUILDINGS[id].costScales!)) {
      close(calculateBuildingScale(id, resource as ResourceId, s), raw - .01);
    }
  }
  assert.ok(calculateDynamicCreep('nest', 'wood', s).some(term => term.label === '钢制建材' && term.value === -.01));
  close(calculateBuildingScale('apartment', 'cash', s), BUILDINGS.apartment.costScales!.cash!);
  // Stacks additively with 中子结构建材.
  s.tech.push('neutronConstructionMaterials');
  close(calculateBuildingScale('nest', 'wood', s), 1.15);
});

test('older saves without 猫猫小屋 records load at zero; the new building round-trips', () => {
  const s = fresh();
  s.tech.push('survival', 'tools', 'writing', 'agriculture', 'catHut');
  s.buildings.catHut = 2; s.population = 2;
  assert.equal(validateCurrentSave(clone(s), context).buildings.catHut, 2);
  const raw = clone(s) as unknown as Record<string, Record<string, unknown>>;
  for (const field of ['buildings', 'workers', 'stoppedBuildings']) delete raw[field]!.catHut;
  assert.equal(validateCurrentSave(raw, context).buildings.catHut, 0);
});
