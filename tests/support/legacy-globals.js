// Retained classic-style globals used by the VM regression suites.
// These mirror the thin wrappers the classic browser bundle exposed; the Vue app reaches the
// same simulation functions through direct ES-module imports instead.
'use strict';
var gameState = createInitialState(CONFIG.version, sampleEventInterval(Math.random), Date.now());

function freshState() {
  return createInitialState(CONFIG.version, sampleEventInterval(Math.random), Date.now());
}
function log(text, type) {
  addLog(gameState, text, type === undefined ? 'progress' : type);
}
function has(id) { return gameState.tech.includes(id); }
function rollEventInterval() { return sampleEventInterval(Math.random); }
function currentHappiness() { return previewMorale(gameState).happiness; }
function keyAction() { /* the classic bundle drove save/render here; suites ignore it */ }

function moonSupportState(state, dt, pool) {
  state = state || gameState;
  dt = dt === undefined ? 1 : dt;
  var resources = pool ? Object.assign({}, pool) : Object.assign({}, state.resources);
  if (!pool) settlePowerPlants(resources, dt, state);
  return allocateMoonSupport(state, resources, dt);
}
function asrielSupportState(state, dt, pool) {
  state = state || gameState;
  dt = dt === undefined ? 1 : dt;
  var resources = pool ? Object.assign({}, pool) : Object.assign({}, state.resources);
  if (!pool) {
    settlePowerPlants(resources, dt, state);
    var moon = moonSupportState(state, dt, resources);
    resources.energy = Math.max(0, resources.energy - moon.baseUnits * 4 * dt);
    resources.oil = Math.max(0, resources.oil - moon.baseUnits * 2 * dt);
  }
  return allocateAsrielSupport(state, resources, dt);
}
function biologyPoweredUnits(state, dt) { return calculateBiologyUnits(state || gameState, dt === undefined ? 1 : dt); }
function dataCenterPoweredUnits(state, dt) { return calculateDataCenterUnits(state || gameState, dt === undefined ? 1 : dt); }
function populationCapacityDetails(state) {
  state = state || gameState;
  return calculateHousingDetails(state, asrielSupportState(state));
}
function housingCapacity(state) {
  return populationCapacityDetails(state).reduce(function (sum, row) { return sum + row.value; }, 0);
}
function capacity() { return Math.floor(housingCapacity()); }
function storageDetails(resource, state) {
  state = state || gameState;
  var moon = moonSupportState(state);
  return calculateStorageDetails(resource, state, {
    biologyUnits: biologyPoweredUnits(state),
    dataCenterUnits: dataCenterPoweredUnits(state),
    moonBaseUnits: moon.baseUnits, moon: moon,
    asriel: asrielSupportState(state),
  });
}
function storageCap(resource) { return storageDetails(resource).total; }
function storageBonuses(id, state, moonSnapshot) {
  state = state || gameState;
  return calculateStorageBonuses(id, state, id === 'school' ? (moonSnapshot || moonSupportState(state)) : moonSnapshot);
}
function clampResources() {
  var moon = moonSupportState();
  return clampResourcesToCaps(gameState, {
    biologyUnits: biologyPoweredUnits(), dataCenterUnits: dataCenterPoweredUnits(),
    moonBaseUnits: moon.baseUnits, moon: moon, asriel: asrielSupportState(),
  });
}
function resourceUnlocked(id, state) {
  // Legacy signature accepted a state object passed through Array.filter, so guard it.
  if (!state || typeof state !== 'object') state = gameState;
  return isResourceUnlocked(id, state);
}
function particleMultiplier(id, state) { return calculateParticleMultiplier(id, state || gameState); }
function aluminumMultiplier(state) { return calculateAluminumMultiplier(state || gameState); }
function communityMultiplier(id, state) { return calculateCommunityMultiplier(id === undefined ? '' : id, state || gameState); }
function buildingUnlocked(id, state) { return isBuildingUnlocked(id, state || gameState); }
function techUnlocked(id, state) { return isTechnologyUnlocked(id, state || gameState); }
function canAssignContainer(id, state) { return isContainerAssignable(id, state || gameState); }
function containerCapacity(state) { return calculateContainerCapacity(state || gameState); }
function buildingCostScale(id, resource, state) { return calculateBuildingScale(id, resource, state || gameState); }
function costFor(id, count) {
  return calculateBuildingCost(id, count === undefined ? gameState.buildings[id] : count, gameState);
}
function buildingInput(id, state) { return calculateBuildingInput(id, state || gameState); }
function factoryLineCapacity(state) { return calculateFactoryCapacity(state || gameState); }
function asrielResidentCount(state, support) {
  state = state || gameState;
  return countAsrielResidents(state, support || asrielSupportState(state));
}
function spaceResourceMultiplier(id, state, support) {
  state = state || gameState;
  return calculateSpaceMultiplier(id, state, support || asrielSupportState(state));
}
function multiplier(happiness, resourceId) {
  return calculateProductionMultiplier(resourceId === undefined ? '' : resourceId,
    happiness === undefined ? currentHappiness() : happiness, gameState);
}
function usedWorkers() { return countUsedWorkers(gameState); }
function workerCapacity(id, state) { return calculateWorkerCapacity(id, state || gameState); }
function assignedLines(state) { return countAssignedLines(state || gameState); }
function assignLine(id, delta) { changeFactoryAssignment(gameState, id, delta); }
function assignWorker(id, delta) { changeWorkerAssignment(gameState, id, delta); }
function craftResource(id, count) { return craftManually(gameState, id, count); }
function toggleBuilding(id, delta) {
  var n = gameState.buildings[id] || 0;
  if (!hasContinuousEnergyInput(id, gameState) || !Number.isSafeInteger(delta) || !delta) return;
  var stopped = gameState.stoppedBuildings[id] || 0;
  gameState.stoppedBuildings[id] = Math.max(0, Math.min(n, stopped - delta));
}
function buyBuildingBatch(id, count) {
  return buyBuildingsInBatch(gameState, id, count, function () { return moonSupportState().available; });
}
function requestPurchase(kind, id) { return requestPurchaseModule(gameState, kind, id); }
function queueCost(kind, id) { return calculateQueueCost(gameState, kind, id); }
function processQueue() {
  return settlePurchaseQueue(gameState, function () { return moonSupportState().available; });
}
function checkUnlocks() {
  updateProgression(gameState).forEach(function (id) { log('🏅 成就达成：' + id, 'achievement'); });
}
function production(dt) { return calculateProduction(gameState, dt === undefined ? 1 : dt); }
function buildingOperationalStatus(id, result) {
  var building = BUILDINGS[id];
  var enabled = countRunningBuildings(id, gameState);
  var expected = enabled, actual = enabled, causes = [];
  if ((building && building.moonSupport) || id === 'moonObservatory') {
    actual = result.moon.allocations[id] || 0;
    if (actual < enabled) causes.push('月球支持不足');
  } else if (['asrielResidence', 'asrielMine', 'ecologicalDome'].indexOf(id) >= 0) {
    actual = result.asriel.allocations[id] || 0;
    if (actual < enabled) causes.push('Asriel支持不足');
  } else if (id === 'moonBase') {
    actual = result.moon.baseUnits;
  } else if (building && building.input) {
    expected = building.workerOutput ? Math.min(gameState.workers[id] || 0, enabled * (building.slots || 1)) : enabled;
    actual = result.inputUnits[id] || 0;
  }
  if (actual + 1e-8 < expected && !causes.length) causes.push('维护原料或电力不足');
  return { enabled: enabled, actual: actual, shortage: enabled > 0 && actual + 1e-8 < expected, causes: causes };
}
function launchAsrielMission() {
  if (!completeAsrielMission(gameState)) return false;
  if (typeof keyAction === 'function') keyAction();
  return true;
}
function launchNuclear() {
  var result = launchNuclearPrestige(gameState, rollEventInterval(), Date.now());
  if (!result) return 0;
  gameState = result.next;
  log('☢️ 核弹已发射，获得 ' + result.reward + ' 粒子。新的文明开始了。', 'system');
  return result.reward;
}
function validateSave(raw) {
  return validateAndMigrateSave(raw, {
    now: Date.now(), eventInterval: rollEventInterval(),
    housingCapacity: capacity, clampResources: clampResources,
  });
}
function contentHTML() { return ''; }
function renderFactorySettings() { }
function updateUI() { }

// --- Remaining thin wrappers the suites reach for -----------------------------
function techTier(id, memo) { return calculateTechnologyTier(id, memo || {}); }
function techCost(id, state) { return calculateTechCost(id, state || gameState); }
function factoryRecipe(id, state) { return calculateFactoryRecipe(id, state || gameState); }
function factoryLineUnlocked(id, state) {
  state = state || gameState;
  var opt = FACTORY_OPTIONS.find(function (o) { return o.id === id; });
  if (!opt || (opt.tech && !state.tech.includes(opt.tech))) return false;
  return id === 'fur' ? state.buildings.factory > 0
    : (!RESOURCES[id].tech || state.tech.includes(RESOURCES[id].tech)) && resourceUnlocked(id, state);
}
function buildingOutput(id, state, productionInputs) {
  return calculateBuildingOutput(id, state || gameState, productionInputs);
}
function runningBuildingCount(id, state) { return countRunningBuildings(id, state || gameState); }
function hasContinuousInput(building, state) {
  // The classic signature took a building object; resolve it back to its id.
  var id = Object.keys(BUILDINGS).find(function (key) { return BUILDINGS[key] === building; });
  return id ? hasContinuousEnergyInput(id, state || gameState) : false;
}
function buildingHTML() { return ''; }
function containerUnitCapacity(state) { return calculateContainerUnitCapacity(state || gameState); }
function purchaseAllowed(kind, id) { return isPurchaseAllowed(gameState, kind, id); }
function buyBuilding(id) {
  return buyBuildingNow(gameState, id, function () { return moonSupportState().available; });
}
function moraleState(dt) {
  dt = dt === undefined ? 1 : dt;
  var plants = settlePowerPlants(Object.assign({}, gameState.resources), dt, gameState);
  var coalSpeed = Math.max(0, (gameState.buildings.generator || 0) - (gameState.stoppedBuildings.generator || 0));
  return calculateMorale(gameState, dt, {
    generatorSpeed: coalSpeed, generatorEnergy: plants.energy,
    coalRatio: coalSpeed ? (plants.outputs.generator || 0) / coalSpeed : 1,
    moonBaseUnits: moonSupportState(gameState, dt).baseUnits,
    biologyUnits: biologyPoweredUnits(gameState, dt),
    dataCenterUnits: dataCenterPoweredUnits(gameState, dt),
  });
}
function gameLoop(dt) {
  advanceGameTick(gameState, dt, {
    happiness: currentHappiness, capacity: capacity,
    event: function () { },
    projects: function (step) { advanceProjectQueue(gameState, step, Math.random); },
    purchases: processQueue, unlocks: checkUnlocks,
  });
}
function resetRun(kind) {
  var result = resetRunState(gameState, kind, rollEventInterval(), Date.now());
  if (!result) return false;
  gameState = result.next;
  log('🐾 新的星球，新的第一声喵。', 'system');
  return true;
}
function resourceBreakdown(r, result) {
  return calculateResourceBreakdown(r, gameState, result || production());
}
function resourceExpenseRows(data) { return calculateResourceExpenseRows(data); }
function resourceFactorRows(r, result) {
  return calculateResourceFactorRows(r, gameState, result || production());
}
