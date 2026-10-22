import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/data/config';
import {
  UNIFICATION_ALLOY_CONTAINER_SLOTS, UNIFICATION_BANK_BONUS, UNIFICATION_CONTAINER_SLOTS,
  UNIFICATION_FUEL_DEPOT_BONUS,
} from '../src/data/neighbors';
import { createInitialState } from '../src/state/create-state';
import {
  calculateBuildingAlloyContainerCap, calculateBuildingContainerCap,
} from '../src/simulation/containers';
import { calculateStorageBonuses } from '../src/simulation/storage-bonuses';
import type { GameState } from '../src/types/state';

function fresh(unified = false): GameState {
  const s = createInitialState(CONFIG.version, 60, 0);
  if (unified) s.tech.push('worldUnification');
  return s;
}

const ratio = (after: number, before: number) => after / before;

test('集装仓库 and 格纳库 each gain ten container slots after 世界统一', () => {
  assert.equal(UNIFICATION_CONTAINER_SLOTS, 10);
  const plain = fresh();
  const unified = fresh(true);
  // Base caps come straight from the building data; the bonus is a flat +10 on top of the
  // upgrade-adjusted value, so it stacks with 超级集装箱 / 中子库 instead of replacing them.
  for (const id of ['containerWarehouse', 'hangar'] as const) {
    assert.equal(
      calculateBuildingContainerCap(id, unified),
      calculateBuildingContainerCap(id, plain) + 10,
      `${id} gains 10 slots`,
    );
  }
  // Upgraded caps keep the bonus too.
  const upgraded = fresh(true);
  upgraded.tech.push('superContainers', 'neutronVault');
  const upgradedPlain = fresh();
  upgradedPlain.tech.push('superContainers', 'neutronVault');
  assert.equal(calculateBuildingContainerCap('hangar', upgraded), 40 + 10);
  assert.equal(calculateBuildingContainerCap('containerWarehouse', upgraded), 25 + 10);
  // Buildings that provide no containers are untouched.
  assert.equal(calculateBuildingContainerCap('warehouse', unified), calculateBuildingContainerCap('warehouse', plain));
});

test('集装仓库 and 格纳库 each gain five alloy container slots', () => {
  assert.equal(UNIFICATION_ALLOY_CONTAINER_SLOTS, 5);
  const plain = fresh();
  plain.tech.push('superContainers');
  const unified = fresh(true);
  unified.tech.push('superContainers');
  assert.equal(calculateBuildingAlloyContainerCap('containerWarehouse', unified), 10 + 5);
  assert.equal(calculateBuildingAlloyContainerCap('hangar', unified), 15 + 5);
  // Still gated on 超级集装箱: without the tech there are no alloy slots at all.
  const locked = fresh(true);
  assert.equal(calculateBuildingAlloyContainerCap('containerWarehouse', locked), 0);
  assert.equal(calculateBuildingAlloyContainerCap('hangar', locked), 0);
});

test('格纳库 resource capacity doubles, including its late-game resources', () => {
  const plain = fresh();
  const unified = fresh(true);
  const before = calculateStorageBonuses('hangar', plain, null);
  const after = calculateStorageBonuses('hangar', unified, null);
  for (const [resource, value] of Object.entries(before)) {
    assert.equal(after[resource as keyof typeof after], value * 2, `${resource} doubled`);
  }
  assert.equal(before.iron, 8000);
  assert.equal(after.iron, 16000);
});

test('燃料库, 轨道燃料库 and 星系燃料库 gain 50% on 石油/氦-3/铀', () => {
  assert.equal(UNIFICATION_FUEL_DEPOT_BONUS, .5);
  const plain = fresh();
  plain.tech.push('uraniumStorage', 'helium3Storage');
  const unified = fresh(true);
  unified.tech.push('uraniumStorage', 'helium3Storage');
  for (const id of ['fuelDepot', 'orbitalFuelDepot', 'galacticFuelDepot'] as const) {
    const before = calculateStorageBonuses(id, plain, null);
    const after = calculateStorageBonuses(id, unified, null);
    assert.ok(Object.keys(after).length > 0, `${id} has capacity`);
    for (const [resource, value] of Object.entries(before)) {
      assert.equal(after[resource as keyof typeof after], value * 1.5, `${id} ${resource} +50%`);
    }
  }
  assert.equal(calculateStorageBonuses('fuelDepot', unified, null).oil, 1500);
  assert.equal(calculateStorageBonuses('galacticFuelDepot', unified, null).uranium, 2250);
});

test('银行 and 猫咖 gain 25% cash capacity', () => {
  assert.equal(UNIFICATION_BANK_BONUS, .25);
  const plain = fresh();
  const unified = fresh(true);
  assert.equal(ratio(calculateStorageBonuses('bank', unified, null).cash!, calculateStorageBonuses('bank', plain, null).cash!), 1.25);
  assert.equal(ratio(calculateStorageBonuses('catCafe', unified, null).cash!, calculateStorageBonuses('catCafe', plain, null).cash!), 1.25);
  // Vault upgrades are multiplied too, not replaced.
  const vaults = fresh(true);
  vaults.tech.push('intelligentBankingSystem', 'iridiumSteelVault', 'vaultExpansion', 'steelSafe', 'neutronVault');
  const vaultsPlain = structuredClone(vaults);
  vaultsPlain.tech = vaultsPlain.tech.filter(id => id !== 'worldUnification');
  assert.equal(ratio(calculateStorageBonuses('bank', vaults, null).cash!, calculateStorageBonuses('bank', vaultsPlain, null).cash!), 1.25);
});

test('地面的仓库 and 高级存储枢纽 capacity doubles', () => {
  const plain = fresh();
  const unified = fresh(true);
  for (const id of ['warehouse', 'storageHub'] as const) {
    const before = calculateStorageBonuses(id, plain, null);
    const after = calculateStorageBonuses(id, unified, null);
    for (const [resource, value] of Object.entries(before)) {
      assert.equal(after[resource as keyof typeof after], value * 2, `${id} ${resource} doubled`);
    }
  }
  // 仓库升级 (warehouseUpgrade) is multiplied, not overwritten.
  const upgraded = fresh(true);
  upgraded.tech.push('warehouseUpgrade');
  const upgradedPlain = structuredClone(upgraded);
  upgradedPlain.tech = upgradedPlain.tech.filter(id => id !== 'worldUnification');
  assert.equal(calculateStorageBonuses('warehouse', upgraded, null).titanium, 500 * 2);
});

test('buildings outside the named list keep their capacity', () => {
  const plain = fresh();
  const unified = fresh(true);
  for (const id of ['granary', 'library', 'school', 'lab', 'observatory'] as const) {
    assert.deepEqual(calculateStorageBonuses(id, unified, null), calculateStorageBonuses(id, plain, null), `${id} untouched`);
  }
});
