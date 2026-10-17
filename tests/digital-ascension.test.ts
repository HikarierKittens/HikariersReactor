import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInitialState } from '../src/state/create-state';
import { CONFIG } from '../src/data/config';
import { calculateDigitalAscensionParticleReward, calculateDigitalAscensionCasimirReward, calculateDigitalAscensionHarmonyReward } from '../src/simulation/government';
import { launchDigitalAscension, resetRunState } from '../src/simulation/prestige';
import { calculateSupportPreview } from '../src/simulation/support-preview';
import { calculateBuildingScale, calculateDynamicCreep, calculateHarmonyCreepReduction, HARMONY_BUILDING_IDS } from '../src/simulation/costs';
import { BUILDINGS } from '../src/data/buildings';
import { isPrestigeResourceUnlocked } from '../src/simulation/prestige-unlocks';

const fresh = () => createInitialState(CONFIG.version, 60, 1000);

test('ascension exact rewards: knowledge logarithm, 2000 softcap, final integer Casimir, active genes', () => {
  const s = fresh();
  assert.equal(calculateDigitalAscensionParticleReward(s), 0);
  assert.equal(calculateDigitalAscensionCasimirReward(0), 0);
  assert.equal(calculateDigitalAscensionCasimirReward(1), 0);
  s.population = 115; s.statistics.run.knowledgeSpent = 30000;
  assert.equal(calculateDigitalAscensionParticleReward(s), 101);
  s.population = 2300; s.statistics.run.knowledgeSpent = 0;
  assert.equal(calculateDigitalAscensionParticleReward(s), 2000);
  s.population = 4600;
  assert.equal(calculateDigitalAscensionParticleReward(s), 2500);
  assert.equal(calculateDigitalAscensionCasimirReward(2500), Math.floor(Math.log2(2500) * 4 * Math.E));
  s.statistics.lifetime.knowledgeSpent = 1e15;
  assert.equal(calculateDigitalAscensionParticleReward(s), 2500);
  assert.equal(calculateDigitalAscensionHarmonyReward(s), 2);
  s.challenge.genes = ['particleImbalance', 'geneCollapse', 'industrialFracture'];
  assert.equal(calculateDigitalAscensionHarmonyReward(s), 5);
});

test('ascension gate requires all segments, enabled core and actual funded support', () => {
  const s = fresh(); s.resources.energy = 1e12;
  s.buildings.agiAscensionCore = 99;
  assert.equal(launchDigitalAscension(s, 60, 2000), null);
  s.buildings.agiAscensionCore = 100; s.stoppedBuildings.agiAscensionCore = 100;
  assert.equal(launchDigitalAscension(s, 60, 2000), null);
  s.stoppedBuildings.agiAscensionCore = 0; s.resources.energy = 0;
  assert.equal(launchDigitalAscension(s, 60, 2000), null);
  s.resources.energy = 1e12;
  assert.ok(calculateSupportPreview(s).digital.ascensionCoreUnits >= 1);
  const before = structuredClone(s);
  assert.ok(launchDigitalAscension(s, 60, 2000));
  assert.deepEqual(s, before);
});

test('ascension keeps permanent state, resets run, records totals and sticky harmony unlock', () => {
  const s = fresh(); s.buildings.agiAscensionCore = 100; s.resources.energy = 1e12;
  s.population = 115; s.soldiers = 10;
  s.prestige.particles = 50; s.prestige.casimir = 30; s.prestige.darkEnergy = 4;
  s.prestige.harmonyCrystals = 7; s.prestige.ascensionResets = 2;
  s.prestige.nuclearResets = 3; s.crispr = ['materialEfficiency'];
  s.achievements = ['nuclearCuriosity']; s.settings.touchOptimization = true;
  s.statistics.run.knowledgeSpent = 30000; s.statistics.lifetime.knowledgeSpent = 50000;
  s.statistics.lifetime.harmonyCrystalsEarned = 9; s.challenge.genes = ['geneCollapse'];
  const before = structuredClone(s);
  const result = launchDigitalAscension(s, 70, 2000)!;
  assert.ok(result); const n = result.next;
  assert.deepEqual(s, before);
  assert.equal(n.prestige.harmonyCrystals, 10); assert.equal(n.prestige.ascensionResets, 3);
  assert.equal(n.prestige.particles, 50 + result.reward); assert.equal(n.prestige.casimir, 30 + result.casimirReward);
  assert.equal(n.prestige.darkEnergy, 4); assert.equal(n.prestige.nuclearResets, 3);
  assert.equal(n.statistics.lifetime.harmonyCrystalsEarned, 12);
  assert.equal(n.statistics.lifetime.knowledgeSpent, 50000); assert.equal(n.statistics.run.knowledgeSpent, 0);
  assert.equal(n.population, 0); assert.equal(n.buildings.agiAscensionCore, 0);
  assert.deepEqual(n.challenge.genes, []); assert.deepEqual(n.crispr, s.crispr);
  assert.ok(n.achievements.includes('nuclearCuriosity')); assert.deepEqual(n.settings, s.settings);
  n.prestige.harmonyCrystals = 0;
  assert.equal(isPrestigeResourceUnlocked(n, 'harmonyCrystals'), true);
  assert.equal(isPrestigeResourceUnlocked(resetRunState(n, 'soft', 60, 3000)!.next, 'harmonyCrystals'), true);
});

test('harmony reduces only non-ground creep, respects floors and leaves fixed segments untouched', () => {
  const s = fresh();
  assert.equal(calculateHarmonyCreepReduction(s), 0);
  s.prestige.harmonyCrystals = 50;
  assert.equal(calculateHarmonyCreepReduction(s), (Math.log(100) - Math.log(50)) * .01);
  for (const id of HARMONY_BUILDING_IDS) {
    const terms = calculateDynamicCreep(id, 'knowledge', s);
    assert.equal(terms.some(term => term.label === '和谐水晶'), !BUILDINGS[id].segmentedRequired, id);
  }
  for (const id of ['nest', 'factory', 'spaceWaystation', 'biologyLab'] as const) {
    assert.equal(calculateDynamicCreep(id, 'knowledge', s).some(term => term.label === '和谐水晶'), false, id);
  }
  assert.equal(calculateBuildingScale('gatewayRouter', 'bytes', s), Number((1.3 - calculateHarmonyCreepReduction(s)).toFixed(12)));
  s.prestige.harmonyCrystals = Number.MAX_SAFE_INTEGER;
  assert.equal(calculateBuildingScale('gatewayRouter', 'bytes', s), 1.005);
  assert.deepEqual(calculateDynamicCreep('agiAscensionCore', 'knowledge', s), []);
});

test('ascension rejects unsafe reward totals or counters without mutation', () => {
  for (const key of ['particles', 'casimir', 'harmonyCrystals', 'ascensionResets'] as const) {
    const s = fresh(); s.buildings.agiAscensionCore = 100; s.resources.energy = 1e12; s.population = 115;
    s.prestige[key] = Number.MAX_SAFE_INTEGER;
    const before = structuredClone(s);
    assert.equal(launchDigitalAscension(s, 60, 2000), null, key);
    assert.deepEqual(s, before);
  }
});
