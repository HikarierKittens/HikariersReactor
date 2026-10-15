import './retired-anomaly.test';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { TECHNOLOGIES } from '../src/data/technologies';
import { createInitialState } from '../src/state/create-state';
import { validateCurrentSave } from '../src/state/validate-save';
import { stageThreeExperimentAvailable, runStageThreeExperiment, type StageThreeExperimentId } from '../src/simulation/stage-three';
import { resetRunState, launchNuclearPrestige } from '../src/simulation/prestige';
import { updateProgression } from '../src/simulation/progression';
import type { TechnologyId } from '../src/types/technologies';
const fresh = () => createInitialState(CONFIG.version, 60, 0);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const context = { now: 0, eventInterval: 60, housingCapacity: () => 1000, clampResources: () => {} };
function complete() {
  const s = fresh();
  s.tech = Object.keys(TECHNOLOGIES).filter(id => !['spaceControlTower','accessPointBeacon','hydrogenRecovery','icebreakingPlan','hyperspaceMiningSurvey','gasCloudAccretion','highTechFarmPlatform','fusionPower','largeMiningShips','dimensionPioneer','highTechFactory','higherDimensionalStorage','e710ResearchStation','ripperOverclock','overclocking13','superMetal','grapheneProcessing','nanoAlloy','virtualReality','virtualTraining','virtualEntertainment','aerogel','plasmaResearch','plasmaMining','energyShield','stellarForge','penroseTheory','massEjector','gravityConversion','stabilizeBlackHole','exoticRunaway'].includes(id)) as TechnologyId[];
  s.prestige.nuclearResets = 1;
  s.asrielMissionCompleted = s.kerberosMissionCompleted = s.solarMissionCompleted = s.talosMissionCompleted = s.talosMoonMissionCompleted = s.asteroidBeltMissionCompleted = s.misenMissionCompleted = true;
  s.arpaBuildings.rocketPlatform = s.arpaBuildings.monument = s.arpaBuildings.geneSequencing = s.arpaBuildings.remoteAnchor = 1;
  s.arpaBuildings.arpaResearchInstitute = 2;
  s.buildings.aiSupercore = 100; s.buildings.constraintArray = 2;
  for (const id of Object.keys(s.stageThree) as (keyof typeof s.stageThree)[]) s.stageThree[id] = true;
  return s;
}

test('activation and stabilization history require persistent current-run facilities, not current fuel or switches', () => {
  const initial = fresh(); initial.stageThree.coreActivated = true;
  assert.throws(() => validateCurrentSave(initial, context), /第三阶段/);
  const full = complete();
  assert.doesNotThrow(() => validateCurrentSave(full, context));
  for (const count of [0, 99]) { const s = clone(full); s.buildings.aiSupercore = count; assert.throws(() => validateCurrentSave(s, context), /第三阶段/); }
  const noArray = clone(full); noArray.buildings.constraintArray = 0;
  assert.throws(() => validateCurrentSave(noArray, context), /第三阶段/);
  full.stoppedBuildings.aiSupercore = 1; full.stoppedBuildings.constraintArray = 2;
  full.resources.helium3 = full.resources.energy = full.resources.e710 = 0;
  assert.deepEqual(validateCurrentSave(full, context).stageThree, full.stageThree);
});

test('unknown experiment ids fail in both availability and execution without falling through to transfer', () => {
  const s = complete(); s.stageThree.transferCompleted = false;
  for (const id of ['probe', 'invalid', 'constructor', '__proto__', 'toString'] as unknown as StageThreeExperimentId[]) {
    const before = clone(s);
    assert.equal(stageThreeExperimentAvailable(s, id), false);
    assert.equal(runStageThreeExperiment(s, id), false);
    assert.deepEqual(s, before);
  }
});

test('legacy missing additions default without mutating caller; explicit null additions are rejected', () => {
  const raw: any = clone(fresh());
  delete raw.stageThree;
  for (const id of ['constraintArray', 'shortRangeRelay']) { delete raw.buildings[id]; delete raw.workers[id]; delete raw.stoppedBuildings[id]; }
  for (const id of ['remoteAnchor']) { delete raw.arpaProgress[id]; delete raw.arpaBuildings[id]; }
  const before = clone(raw); const migrated = validateCurrentSave(raw, context);
  assert.deepEqual(raw, before); assert.deepEqual(migrated.stageThree, fresh().stageThree);
  for (const key of ['stageThree', 'buildings', 'workers', 'arpaProgress', 'arpaBuildings']) {
    const bad: any = clone(fresh());
    if (key === 'stageThree') bad[key] = null;
    else bad[key][key.startsWith('arpa') ? 'remoteAnchor' : 'constraintArray'] = null;
    assert.throws(() => validateCurrentSave(bad, context), key);
  }
});

test('research, project and queue prerequisites cannot skip missing stage events or completed projects', () => {
  const full = complete();
  const noAnchor = clone(full); noAnchor.arpaBuildings.remoteAnchor = 0; assert.throws(() => validateCurrentSave(noAnchor, context));
  const noMapping = clone(full); noMapping.tech = noMapping.tech.filter(id => id !== 'anomalyMapping'); assert.throws(() => validateCurrentSave(noMapping, context));
  const s = clone(full); s.stageThree.signalCompleted = s.stageThree.transferCompleted = false;
  s.tech = s.tech.filter(id => id !== 'finiteAperture' && id !== 'anomalyTopology' && id !== 'dimensionBeaconDeployment');
  s.stageThree.remoteLinked = false; s.arpaBuildings.remoteAnchor = 0;
  s.queue = [{ uid: 1, kind: 'tech', id: 'finiteAperture' }];
  assert.throws(() => validateCurrentSave(s, context), /队列科技/);
  s.queue = [{ uid: 1, kind: 'build', id: 'shortRangeRelay' }];
  assert.throws(() => validateCurrentSave(s, context), /队列建筑/);
});

test('reset permanent stories are not reused as current-run event proof; nuclear reset also clears flags', () => {
  const s = complete(); updateProgression(s); s.story.read = [...s.story.unlocked];
  const soft = resetRunState(s, 'soft', 60, 0)!.next;
  assert.ok(soft.story.unlocked.includes('coreCalibration')); assert.deepEqual(soft.stageThree, fresh().stageThree);
  assert.deepEqual(validateCurrentSave(soft, context).stageThree, fresh().stageThree);
  s.nuclearProgress = 100;
  const nuclear = launchNuclearPrestige(s, 60, 0)!.next;
  assert.deepEqual(nuclear.stageThree, fresh().stageThree);
  assert.ok(nuclear.story.unlocked.includes('firstTransfer'));
  nuclear.story.read.pop(); assert.notDeepEqual(nuclear.story.read, s.story.read);
});
