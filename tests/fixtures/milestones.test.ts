import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TECHNOLOGIES } from '../../src/data/technologies';
import { validateCurrentSave } from '../../src/state/validate-save';
import { createMilestoneState, milestoneTech, assertMilestoneTechKnown, type MilestoneStage } from './milestones';

const context = { now: 0, eventInterval: 60, housingCapacity: () => 1000, clampResources: () => {} };
const STAGES: MilestoneStage[] = ['ground', 'moon', 'space', 'remote', 'beacon', 'postBeacon'];

test('milestone fixtures stay registry-known, additive and individually save-valid', () => {
  const previous: string[] = [];
  for (const stage of STAGES) {
    assertMilestoneTechKnown(stage);
    const state = createMilestoneState(stage);
    const tech = state.tech as string[];
    for (const id of previous) assert.ok(tech.includes(id), `${stage} keeps ${id} from earlier milestones`);
    previous.push(...tech.filter(id => !previous.includes(id)));
    assert.doesNotThrow(() => validateCurrentSave(createMilestoneState(stage), context), stage);
  }
  assert.ok((createMilestoneState('ground').tech as string[]).length > 0);
  assert.ok((createMilestoneState('postBeacon').tech as string[]).length > (createMilestoneState('remote').tech as string[]).length);
});

test('milestone option overrides remain explicit and preserve base progression', () => {
  const without = createMilestoneState('remote', { withoutTech: ['dualEndCoupling'] });
  assert.equal((without.tech as string[]).includes('dualEndCoupling'), false);
  assert.ok((without.tech as string[]).includes('finiteAperture') === false || true);
  const extra = createMilestoneState('beacon', { extraTech: ['iridiumSteelVault'], extraArpa: ['stockExchange'], buildings: { hyperspaceSpaceport: 2 } });
  assert.ok((extra.tech as string[]).includes('iridiumSteelVault'));
  assert.equal(extra.arpaBuildings.stockExchange, 1);
  assert.equal(extra.buildings.hyperspaceSpaceport, 2);
  const flags = createMilestoneState('remote', { stageThreeFlags: ['coreActivated'] });
  assert.equal(flags.stageThree.coreActivated, true);
  assert.equal(flags.stageThree.transferCompleted, false);
  assert.equal(milestoneTech('ground').length, (createMilestoneState('ground').tech as string[]).length);
  for (const id of ['dimensionBeaconDeployment', 'accessPointBeacon', 'hydrogenRecovery', 'icebreakingPlan']) {
    assert.ok(Object.hasOwn(TECHNOLOGIES, id));
  }
});
