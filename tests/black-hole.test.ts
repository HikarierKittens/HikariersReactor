import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { BUILDINGS, BUILDING_COST_SCALES } from '../src/data/buildings';
import { TECHNOLOGIES } from '../src/data/technologies';
import { RESOURCES } from '../src/data/resources';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { validateBlackHole } from '../src/state/validate-black-hole';
import { calculateProduction } from '../src/simulation/production';
import { calculateStorageDetails, calculateStorageTotals } from '../src/simulation/storage';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { isTechnologyUnlocked } from '../src/simulation/unlocks';
import { requestPurchaseModule, researchTechnologyNow, constructBuildingState } from '../src/simulation/purchases';
import { advanceGameTick } from '../src/simulation/tick';
import { launchBlackHolePrestige } from '../src/simulation/prestige';
import { calculateBankerMultiplier, calculateBlackHoleParticleReward, calculateBlackHoleCasimirReward, calculateEscapePrestigeReward, calculateCasimirReward } from '../src/simulation/government';
import {
  BLACK_HOLE_UNSTABLE_LOG, MASS_EJECTION_UNLOCK_LOG, EJECTION_MASSES, calculateDarkEnergyReward, calculateGravityConversionEnergy,
  changeEjectionAllocation, ejectionMass, formatBlackHoleMass, isEjectableResource, isExoticResource,
} from '../src/simulation/black-hole';
import type { GameState } from '../src/types/state';
import type { ResourceId } from '../src/types/economy';

const fresh = () => createInitialState(CONFIG.version, 60, 0);
const near = (a: number, b: number, label = '') => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${label} ${a} != ${b}`);
const ctx = { now: 0, eventInterval: 60, housingCapacity: () => 1e6, clampResources: () => {} };
const hooks = { happiness: () => 100, capacity: () => 1e6, event: () => {}, projects: () => {}, purchases: () => {}, unlocks: () => {} };
const snap = (s: GameState) => { const p = calculateSupportPreview(s); return { ...p, moonBaseUnits: p.moon.baseUnits }; };

/** Black-hole stage with a finished sphere and ejectors powered by plenty of stored energy. */
function stage(ejectors = 1): GameState {
  const s = fresh();
  s.tech.push('energyShield', 'penroseTheory', 'massEjector');
  s.blackHoleMissionCompleted = true;
  s.buildings.penroseSphere = 1;
  s.buildings.massEjector = ejectors;
  s.resources.energy = 1e6;
  return s;
}

test('data: techs, building and ejection table follow the spec', () => {
  assert.deepEqual([TECHNOLOGIES.massEjector.tier, TECHNOLOGIES.massEjector.cost, TECHNOLOGIES.massEjector.pre], [21, { knowledge: 2000000 }, ['penroseTheory']]);
  assert.deepEqual([TECHNOLOGIES.gravityConversion.tier, TECHNOLOGIES.gravityConversion.cost, TECHNOLOGIES.gravityConversion.pre], [21, { knowledge: 2150000 }, ['massEjector']]);
  assert.deepEqual(TECHNOLOGIES.stabilizeBlackHole.cost, { knowledge: 2500000, neutron: 100000 });
  assert.deepEqual(TECHNOLOGIES.exoticRunaway.cost, { knowledge: 2500000, nanoAlloy: 100000, e710: 2500 });
  assert.equal(TECHNOLOGIES.stabilizeBlackHole.tier, -1); assert.equal(TECHNOLOGIES.exoticRunaway.tier, -1);
  assert.equal(TECHNOLOGIES.exoticRunaway.warning, '警告：这可能会导致无法预料的爆炸，毁灭一切，无限，永恒');
  const ejector = BUILDINGS.massEjector;
  for (const id of ['adamantite', 'nanoAlloy', 'mithril', 'aerogel'] as const) assert.ok(ejector.cost[id]! > 0, id);
  for (const [id, scale] of Object.entries(ejector.costScales!)) { assert.equal(scale, 1.28); assert.equal(BUILDING_COST_SCALES.massEjector![id as ResourceId], scale); }
  assert.deepEqual(ejector.input, { energy: 10 });
  // Ejectable: every ordinary non-cash resource plus all crafted goods; never cash, energy, knowledge.
  for (const id of Object.keys(RESOURCES) as ResourceId[]) {
    const expected = id !== 'cash' && (!RESOURCES[id].special || !!RESOURCES[id].crafted);
    assert.equal(isEjectableResource(id), expected, id);
    if (expected) assert.ok(ejectionMass(id) > 0, `${id} has a mass`);
  }
  for (const id of ['cash', 'energy', 'knowledge', 'dna', 'genes']) assert.equal(isEjectableResource(id), false, id);
  assert.equal(ejectionMass('e710'), 4e-6); assert.equal(ejectionMass('nanoAlloy'), 1e-8);
  assert.ok(EJECTION_MASSES.stone! > EJECTION_MASSES.water!);
  assert.ok(EJECTION_MASSES.uranium! > EJECTION_MASSES.iron! && EJECTION_MASSES.iron! > EJECTION_MASSES.aluminum!);
  assert.equal(formatBlackHoleMass(10), '10.00000000');
});

test('ejection masses follow the spec: fixed values and light-to-heavy order', () => {
  // 玩家指定的精确值（0.9.38 平衡性更新下调了两项奇异物质）。
  assert.equal(ejectionMass('e710'), 4e-6);
  assert.equal(ejectionMass('nanoAlloy'), 1e-8);
  assert.equal(ejectionMass('neutron'), 4e-5);
  assert.equal(ejectionMass('adamantite'), 1e-5);
  assert.equal(ejectionMass('aerogel'), 1e-7);
  // 氘、氦-3 保持原值（0.9.36 起就明确排除）。
  assert.equal(ejectionMass('deuterium'), 2e-8);
  assert.equal(ejectionMass('helium3'), 3e-8);
  // 纳米合金 1e-8 现在比氘还轻，因此「氘/氦-3 是最轻两项」不再成立；
  // 真正的不变量是它们仍是最轻的**普通**物质（奇异物质另算）。
  const ordinary = (Object.keys(RESOURCES) as ResourceId[]).filter(id => isEjectableResource(id) && !isExoticResource(id))
    .map(id => [id, ejectionMass(id)] as const).sort((a, b) => a[1] - b[1]);
  assert.deepEqual(ordinary.slice(0, 2).map(entry => entry[0]), ['deuterium', 'helium3']);
  // 木头远比铁轻，铁比铝重，铀接近最重的一档：物质特性顺序必须成立。
  assert.ok(ejectionMass('wood') < ejectionMass('iron'), 'wood is lighter than iron');
  assert.ok(ejectionMass('iron') > ejectionMass('aluminum'));
  assert.ok(ejectionMass('uranium') > ejectionMass('copper'));
  assert.ok(ejectionMass('aerogel') < ejectionMass('wood'), 'aerogel is extremely porous');
  assert.ok(ejectionMass('neutron') > ejectionMass('mithril'), 'neutron is by far the densest');
  // 奇异物质（E-710 / 纳米合金）按玩家指定值：E-710 比纳米合金重。
  // 0.9.38 把纳米合金下调到 1e-8，它现在是全场最轻的可喷射资源（比氘还轻），
  // 因此不能再断言它重于任何普通物质——这正是玩家指定的值。
  assert.ok(ejectionMass('e710') > ejectionMass('nanoAlloy'));
  assert.ok(ejectionMass('nanoAlloy') < ejectionMass('deuterium'), 'nanoAlloy is now the lightest ejectable');
  assert.equal(isExoticResource('e710'), true);
  assert.equal(isExoticResource('nanoAlloy'), true);
  assert.equal(isExoticResource('neutron'), false);
});

test('质量喷射器 tech needs a completed Penrose sphere; first ejector logs the new panel', () => {
  const s = stage(0); s.tech = s.tech.filter(id => id !== 'massEjector');
  s.buildings.penroseSphere = 0; s.buildings.penroseSphereSegments = 99;
  assert.equal(isTechnologyUnlocked('massEjector', s), false);
  s.buildings.penroseSphereSegments = 0; s.buildings.penroseSphere = 1;
  assert.equal(isTechnologyUnlocked('massEjector', s), true);
  const b = stage(0);
  constructBuildingState(b, 'massEjector', () => 0);
  assert.equal(b.logs.filter(log => log.text === MASS_EJECTION_UNLOCK_LOG && log.type === 'progress').length, 1);
  constructBuildingState(b, 'massEjector', () => 0);
  assert.equal(b.logs.filter(log => log.text === MASS_EJECTION_UNLOCK_LOG).length, 1);
});

test('allocations are capped by capacity and ejection adds ordinary and exotic mass', () => {
  const s = stage(2);
  assert.equal(changeEjectionAllocation(s, 'cash', 10), false);
  assert.equal(changeEjectionAllocation(s, 'energy', 10), false);
  changeEjectionAllocation(s, 'stone', 1500); changeEjectionAllocation(s, 'e710', 900);
  assert.deepEqual(s.blackHole.ejection, { stone: 1500, e710: 500 });
  changeEjectionAllocation(s, 'e710', -600); assert.deepEqual(s.blackHole.ejection, { stone: 1500 });
  changeEjectionAllocation(s, 'e710', 100);
  Object.assign(s.resources, { stone: 1e6, e710: 50 });
  const result = calculateProduction(s, 1);
  near(result.ejected.stone!, 1500); near(result.ejected.e710!, 50, 'limited by stock');
  advanceGameTick(s, 1, hooks);
  near(s.blackHole.mass, 10 + 1500 * ejectionMass('stone'));
  near(s.blackHole.exoticMass, 50 * ejectionMass('e710'));
  // Unpowered ejectors eject nothing (no sphere, no stored energy).
  const dark = stage(1); dark.buildings.penroseSphere = 0; dark.resources.energy = 0; changeEjectionAllocation(dark, 'stone', 1000); dark.resources.stone = 1e6;
  assert.equal(calculateProduction(dark, 1).ejected.stone || 0, 0);
  dark.stoppedBuildings.massEjector = 1; dark.resources.energy = 1e6;
  assert.equal(calculateProduction(dark, 1).ejected.stone || 0, 0, 'stopped ejector');
});

test('saves round-trip black hole state and reject missing records', () => {
  const s = stage(1); changeEjectionAllocation(s, 'iron', 400); s.blackHole.mass = 12.5; s.blackHole.exoticMass = .01;
  const target = fresh(); target.buildings.massEjector = 1;
  const raw = JSON.parse(JSON.stringify(s));
  validateBlackHole(raw, target);
  assert.deepEqual(target.blackHole, s.blackHole);
  raw.blackHole.ejection.iron = 5000; assert.throws(() => validateBlackHole(raw, target));
  raw.blackHole.ejection = { cash: 1 }; assert.throws(() => validateBlackHole(raw, target));
  raw.blackHole = { mass: -1, exoticMass: 0, unstable: false, ejection: {} }; assert.throws(() => validateBlackHole(raw, target));
  const roundTrip = fresh(); roundTrip.blackHole.mass = 11.25; roundTrip.prestige.darkEnergy = 3; roundTrip.prestige.blackHoleResets = 1;
  roundTrip.prestigeUnlocked = ['darkEnergy'];
  const reloaded = validateCurrentSave(JSON.parse(JSON.stringify(roundTrip)), ctx);
  assert.equal(reloaded.blackHole.mass, 11.25); assert.equal(reloaded.prestige.darkEnergy, 3);
  assert.ok(reloaded.prestigeUnlocked.includes('darkEnergy'));
  const old = JSON.parse(JSON.stringify(fresh())); delete old.blackHole;
  delete old.prestige.darkEnergy; delete old.prestige.blackHoleResets; delete old.statistics.lifetime.darkEnergyEarned;
  const before = structuredClone(old);
  assert.throws(() => validateCurrentSave(old, ctx));
  assert.deepEqual(old, before);
});

test('引力转化 scales the whole Penrose sphere continuously', () => {
  const s = stage(0);
  s.blackHole.mass = 10.5; s.blackHole.exoticMass = .02;
  assert.equal(calculateGravityConversionEnergy(s), 0);
  const base = calculateProduction(s, 1).rates.energy;
  s.tech.push('gravityConversion');
  near(calculateGravityConversionEnergy(s), 2.5 + 1);
  near(calculateProduction(s, 1).rates.energy - base, 3.5);
  s.blackHole.mass = 9; s.blackHole.exoticMass = 0; near(calculateGravityConversionEnergy(s), 0);
});

test('instability logs once per crossing, unlocks both specials, and 稳定黑洞 is repeatable', () => {
  const s = stage(1); s.tech.push('gravityConversion');
  assert.equal(isTechnologyUnlocked('stabilizeBlackHole', s), false);
  assert.equal(isTechnologyUnlocked('exoticRunaway', s), false);
  s.blackHole.exoticMass = .0249999; changeEjectionAllocation(s, 'e710', 1000); s.resources.e710 = 1e6;
  advanceGameTick(s, 1, hooks); advanceGameTick(s, 1, hooks);
  assert.equal(s.blackHole.unstable, true);
  assert.equal(s.logs.filter(log => log.text === BLACK_HOLE_UNSTABLE_LOG && log.type === 'progress').length, 1);
  assert.equal(isTechnologyUnlocked('stabilizeBlackHole', s), true);
  assert.equal(isTechnologyUnlocked('exoticRunaway', s), true);
  changeEjectionAllocation(s, 'e710', -1000);
  Object.assign(s.resources, { knowledge: 5e6, neutron: 2e5 });
  const exotic = s.blackHole.exoticMass, mass = s.blackHole.mass;
  assert.equal(researchTechnologyNow(s, 'stabilizeBlackHole').bought, true);
  near(s.blackHole.mass, mass + exotic * 40 + 100000 * ejectionMass('neutron'));
  assert.equal(s.blackHole.exoticMass, 0); assert.equal(s.blackHole.unstable, false);
  assert.equal(s.tech.includes('stabilizeBlackHole'), false);
  assert.equal(isTechnologyUnlocked('stabilizeBlackHole', s), false);
  s.blackHole.exoticMass = .03; changeEjectionAllocation(s, 'stone', 1); s.resources.stone = 10;
  advanceGameTick(s, 1, hooks);
  assert.equal(s.logs.filter(log => log.text === BLACK_HOLE_UNSTABLE_LOG).length, 2);
  assert.equal(isTechnologyUnlocked('stabilizeBlackHole', s), true);
});

test('奇异失控 cannot be bought or queued directly; 黑洞重置 pays and grants all three rewards', () => {
  const s = stage(1); s.blackHole.unstable = true; s.blackHole.mass = 26; s.blackHole.exoticMass = .03;
  Object.assign(s.resources, { knowledge: 5e6, nanoAlloy: 2e5, e710: 5000 });
  s.population = 300; s.soldiers = 100; s.prestige.particles = 7; s.prestige.darkEnergy = 2;
  assert.equal(requestPurchaseModule(s, 'tech', 'exoticRunaway', () => 0, true).status, 'rejected');
  assert.equal(requestPurchaseModule(s, 'tech', 'exoticRunaway', () => 0).status, 'rejected');
  const poor = JSON.parse(JSON.stringify(s)) as GameState; poor.resources.e710 = 10;
  assert.equal(launchBlackHolePrestige(poor, 60, 0), null);
  const result = launchBlackHolePrestige(s, 60, 0)!;
  assert.ok(result);
  assert.equal(result.reward, calculateBlackHoleParticleReward(s));
  assert.equal(result.casimirReward, calculateBlackHoleCasimirReward(result.reward, s));
  assert.equal(result.darkEnergyReward, calculateDarkEnergyReward(s));
  const next = result.next;
  assert.equal(next.prestige.particles, 7 + result.reward);
  assert.equal(next.prestige.darkEnergy, 2 + result.darkEnergyReward);
  assert.equal(next.prestige.blackHoleResets, 1);
  assert.ok(next.achievements.includes('spaceDestroyer'));
  assert.equal(next.logs.filter(l => l.type === 'achievement' && l.text.includes('空间毁灭者')).length, 1);
  assert.equal(next.statistics.lifetime.darkEnergyEarned, result.darkEnergyReward);
  assert.deepEqual(next.blackHole, { mass: 10, exoticMass: 0, unstable: false, ejection: {} });
  assert.ok(next.prestigeUnlocked.includes('darkEnergy'));
  assert.equal(s.prestige.blackHoleResets, 0, 'source state untouched');
});

test('black-hole rewards exceed escape rewards and dark energy stays in the 1-10 band', () => {
  // A bare crew object still needs run statistics: the knowledge term reads them.
  const bare = (crew: number) => {
    const s = fresh();
    s.population = crew; s.soldiers = crew / 4;
    s.statistics.run.knowledgeSpent = 0;
    return s;
  };
  // An empty crew earns nothing, so the comparison starts where a run actually has one.
  for (const crew of [400, 1200, 4000]) {
    const s = bare(crew);
    const p = calculateBlackHoleParticleReward(s);
    assert.ok(p > calculateEscapePrestigeReward(s), `particles ${crew}`);
    assert.ok(calculateBlackHoleCasimirReward(p, s) > calculateCasimirReward(calculateEscapePrestigeReward(s), s), `casimir ${crew}`);
  }
  // Mass above the initial 10 pays logarithmically; exotic mass adds a separate ln term.
  const de = (mass: number, exoticMass = 0, genes: GameState['challenge']['genes'] = []) =>
    calculateDarkEnergyReward({ blackHole: { mass, exoticMass, unstable: false, ejection: {} }, challenge: { genes, modes: [], story: null, particleBaseline: 0 } });
  assert.equal(de(10), 1, 'an untouched hole still pays the floor of 1');
  assert.equal(de(13), 1, 'mass at or below 13 is below the floor');
  assert.equal(de(40), 1);
  assert.equal(de(100), 2);
  assert.equal(de(500), 3);
  assert.ok(de(500) < 20, 'soft cap slows growth');
  assert.ok(de(30, .25) > de(30), 'exotic mass adds its own logarithmic term');
  // Each challenge gene multiplies the raw value before the cap squashes it.
  assert.ok(de(100, 0, ['geneCollapse']) > de(100), 'a challenge gene raises the reward');
});

test('暗能量加成 multiplies ordinary storage after the CRISPR bonuses', () => {
  const s = fresh(); s.buildings.warehouse = 5; s.crispr.push('casimirEffect'); s.prestige.casimir = 50;
  const before = calculateStorageDetails('stone', s, snap(s)).total;
  const cashBefore = calculateStorageDetails('cash', s, snap(s)).total;
  const knowledgeBefore = calculateStorageDetails('knowledge', s, snap(s)).total;
  s.prestige.darkEnergy = 5;
  const details = calculateStorageDetails('stone', s, snap(s));
  near(details.total, before * 1.05);
  assert.equal(details.rows.at(-1)!.name, '暗能量加成');
  near(calculateStorageTotals(s, snap(s)).stone, before * 1.05);
  near(calculateStorageDetails('cash', s, snap(s)).total, cashBefore * 1.05);
  near(calculateStorageTotals(s, snap(s)).cash, cashBefore * 1.05);
  near(calculateStorageDetails('knowledge', s, snap(s)).total, knowledgeBefore);
});

test('证券交易所 adds +2 percentage points to each banker tax bonus', () => {
  const s = fresh(); s.workers.bank = 3;
  near(calculateBankerMultiplier(s), 1.15);
  s.arpaBuildings.stockExchange = 2;
  near(calculateBankerMultiplier(s), 1 + 3 * (.05 + .04));
  s.population = 10; s.resources.food = 1e6;
  const taxed = calculateProduction(s, 1).outputs.catTax!;
  s.arpaBuildings.stockExchange = 0;
  near(taxed / calculateProduction(s, 1).outputs.catTax!, 1.27 / 1.15);
});