import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import { createInitialState } from '../src/state/create-state';
import { buyBuildingsInBatch, constructBuildingState, settlePurchaseQueue } from '../src/simulation/purchases';

function funded() {
  const state = createInitialState(CONFIG.version, 60, 1000);
  state.tech.push('digitalAscension');
  state.resources.cash = state.resources.bytes = state.resources.encryptedData = state.resources.nanoAlloy = 1e15;
  return state;
}

for (const alwaysEnable of [false, true]) {
  test(`ascension completion defaults off once, auto-enable=${alwaysEnable}`, () => {
    const state = funded();
    state.settings.alwaysEnableNewBuildings = alwaysEnable;
    for (let segment = 1; segment < 100; segment++) {
      constructBuildingState(state, 'agiAscensionCore', 0);
      assert.equal(state.stoppedBuildings.agiAscensionCore || 0, 0);
    }
    constructBuildingState(state, 'agiAscensionCore', 0);
    assert.equal(state.buildings.agiAscensionCore, 100);
    assert.equal(state.stoppedBuildings.agiAscensionCore, 1);
    state.stoppedBuildings.agiAscensionCore = 0;
    assert.equal(buyBuildingsInBatch(state, 'agiAscensionCore', 1, 0).bought, 0);
    assert.equal(state.stoppedBuildings.agiAscensionCore, 0, 'later rejected purchase must not switch an enabled core off');
  });
}

test('bulk ascension construction defaults completed core off', () => {
  const state = funded();
  state.settings.alwaysEnableNewBuildings = true;
  assert.equal(buyBuildingsInBatch(state, 'agiAscensionCore', 100, 0).bought, 100);
  assert.equal(state.stoppedBuildings.agiAscensionCore, 1);
});

test('queue completion defaults ascension core off and does not repeat', () => {
  const state = funded();
  state.buildings.agiAscensionCore = 99;
  state.settings.alwaysEnableNewBuildings = true;
  state.queue.push({ uid: 1, kind: 'build', id: 'agiAscensionCore' });
  settlePurchaseQueue(state, 0);
  assert.equal(state.buildings.agiAscensionCore, 100);
  assert.equal(state.stoppedBuildings.agiAscensionCore, 1);
  state.stoppedBuildings.agiAscensionCore = 0;
  settlePurchaseQueue(state, 0);
  assert.equal(state.stoppedBuildings.agiAscensionCore, 0);
});
