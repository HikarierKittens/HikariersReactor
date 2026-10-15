import { RESOURCES, CRAFT_RECIPES } from '../data/resources';
import { TECHNOLOGIES } from '../data/technologies';
import { LEGACY_V21_TECH_PREREQUISITES } from './validate-unlocks';
import type { ResourceId, CraftId } from '../types/economy';

/** Migration values remain untrusted until current-version validation completes. */
export type MigrationRecord = Record<string, unknown>;
function cloneMigrationRecord(raw: MigrationRecord): MigrationRecord {
  return JSON.parse(JSON.stringify(raw)) as MigrationRecord;
}
function spreadMigrationField(value: unknown): MigrationRecord {
  // Object spread historically accepts missing fields and primitive values.
  return { ...(value as MigrationRecord) };
}
function migrationField(state: MigrationRecord, field: string): MigrationRecord {
  const value = state[field];
  if (!value || typeof value !== 'object') throw Error('旧存档字段无效。');
  return value as MigrationRecord;
}
export function migrateV12(raw: MigrationRecord): MigrationRecord {
  const state = cloneMigrationRecord(raw); state.version = 13;
  if (!Array.isArray(state.tech)) throw Error('旧存档科技无效。');
  state.legacyRocketry = state.tech.includes('rocketry');
  state.arpaProgress = { rocketPlatform: 0 }; state.arpaBuildings = { rocketPlatform: 0 }; state.arpaQueueElapsed = 0;
  for (const id of ['shipyard', 'launchpad']) {
    delete migrationField(state, 'buildings')[id]; delete migrationField(state, 'workers')[id];
    if (state.stoppedBuildings) delete migrationField(state, 'stoppedBuildings')[id];
  }
  const queue = state.queue || [];
  if (!Array.isArray(queue)) throw Error('旧存档队列无效。');
  state.queue = queue.filter((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw Error('旧存档队列无效。');
    const item = entry as MigrationRecord;
    return !['shipyard', 'launchpad'].includes(String(item.id)) && !(item.kind === 'tech' && item.id === 'rocketry');
  });
  delete state.parts; delete state.ark; delete state.won; return state;
}
export function migrateV21(raw: MigrationRecord): MigrationRecord {
  const state = cloneMigrationRecord(raw); state.version = 22;
  for (const field of ['buildings', 'workers', 'stoppedBuildings']) state[field] = { ...spreadMigrationField(state[field]), biologyLab: 0 };
  const tech = state.tech;
  if (tech != null && !Array.isArray(tech)) throw Error('旧存档科技无效。');
  const has = (id: string) => Array.isArray(tech) && tech.includes(id);
  const ids = Object.keys(LEGACY_V21_TECH_PREREQUISITES) as (keyof typeof LEGACY_V21_TECH_PREREQUISITES)[];
  state.legacyTechPrerequisites = ids.filter(id => has(id) && LEGACY_V21_TECH_PREREQUISITES[id].every(has) && !TECHNOLOGIES[id].pre.every(has));
  if (Array.isArray(state.queue)) state.queue = state.queue.filter((entry: unknown) => {
    const item = entry as MigrationRecord | null;
    if (item?.kind !== 'tech' || typeof item.id !== 'string' || !Object.hasOwn(LEGACY_V21_TECH_PREREQUISITES, item.id)) return true;
    return TECHNOLOGIES[item.id as keyof typeof LEGACY_V21_TECH_PREREQUISITES].pre.every(has);
  });
  return state;
}
function addMigrationResources(state: MigrationRecord, ids: string[]): void {
  for (const field of ['resources', 'containerAssignments']) for (const id of ids) migrationField(state, field)[id] = 0;
}
function addMigrationBuildings(state: MigrationRecord, ids: string[]): void {
  for (const id of ids) {
    migrationField(state, 'buildings')[id] = 0;
    migrationField(state, 'workers')[id] = 0;
    state.stoppedBuildings = { ...spreadMigrationField(state.stoppedBuildings), [id]: 0 };
  }
}
export function migrateV13(raw: MigrationRecord): MigrationRecord {
  const state = cloneMigrationRecord(raw); state.version = 14;
  addMigrationResources(state, ['cement', 'brick']); addMigrationBuildings(state, ['cementWorkshop']);
  migrationField(state, 'craftWorkers').brick = 0; return state;
}
export function migrateV14(raw: MigrationRecord): MigrationRecord {
  const state = cloneMigrationRecord(raw); state.version = 15;
  addMigrationResources(state, ['titanium']); return state;
}
export function migrateV15(raw: MigrationRecord): MigrationRecord {
  const state = cloneMigrationRecord(raw); state.version = 16;
  addMigrationResources(state, ['aluminum']); addMigrationBuildings(state, ['metalRefinery']); return state;
}
export function migrateV16(raw: MigrationRecord): MigrationRecord {
  const state = cloneMigrationRecord(raw); state.version = 17;
  addMigrationResources(state, ['metalPlate']); migrationField(state, 'craftWorkers').metalPlate = 0; return state;
}
export function migrateV17(raw: MigrationRecord): MigrationRecord {
  const state = cloneMigrationRecord(raw); state.version = 18;
  addMigrationResources(state, ['wroughtIron']); migrationField(state, 'craftWorkers').wroughtIron = 0; return state;
}
export function migrateV18(raw: MigrationRecord): MigrationRecord {
  const state = cloneMigrationRecord(raw); state.version = 19;
  state.prestige = { particles: 0, nuclearResets: 0, softResets: 0 };
  state.soldiers = 0; state.trainingProgress = 0; state.nuclearProgress = 0;
  addMigrationBuildings(state, ['barracks', 'trainingCamp']); return state;
}
export function migrateV19(raw: MigrationRecord): MigrationRecord {
  const state = cloneMigrationRecord(raw); state.version = 20;
  state.furUnlocked = Number(state.soldiers) > 0; addMigrationResources(state, ['fur']); return state;
}
export function migrateV20(raw: MigrationRecord): MigrationRecord {
  const state = cloneMigrationRecord(raw); state.version = 21;
  addMigrationResources(state, ['cash']); addMigrationBuildings(state, ['bank']);
  state.government = 'none'; state.taxRate = 20; state.lastReformTime = null; return state;
}
export function migrateV25(raw: MigrationRecord): MigrationRecord {
  const state = cloneMigrationRecord(raw); state.version = 26;
  const buildings = migrationField(state, 'buildings');
  const tech = state.tech;
  if (!Array.isArray(tech)) throw Error('旧存档科技无效。');
  const oldUnlocked = (id: string): boolean => {
    if (id === 'iridium' || id === 'helium3') return false;
    if (id === 'fur') return !!state.furUnlocked || Number(state.soldiers) > 0;
    if (Object.hasOwn(CRAFT_RECIPES, id)) return Number(buildings.foundry) > 0 && Object.keys(CRAFT_RECIPES[id as CraftId].input).every(oldUnlocked);
    const definition = RESOURCES[id as ResourceId];
    return definition.unlockBy ? Number(buildings[definition.unlockBy]) > 0 && (!definition.tech || tech.includes(definition.tech)) : !definition.tech || tech.includes(definition.tech);
  };
  state.unlockedResources = Object.keys(RESOURCES).filter(oldUnlocked);
  state.furUnlocked = !!state.furUnlocked || Number(state.soldiers) > 0;
  for (const field of ['resources', 'containerAssignments']) {
    const values = migrationField(state, field); values.iridium = 0; values.helium3 = 0;
  }
  for (const field of ['buildings', 'workers', 'stoppedBuildings']) {
    const values = migrationField(state, field);
    for (const id of ['moonBase', 'iridiumMine', 'helium3Mine', 'navigationBeacon', 'orbitalFuelDepot']) values[id] = 0;
  }
  return state;
}
export function migrateV22(raw: MigrationRecord): MigrationRecord {
  const state = cloneMigrationRecord(raw); state.version = 23;
  state.stoppedBuildings = { ...spreadMigrationField(state.stoppedBuildings), coalMine: migrationField(state, 'buildings').coalMine };
  return state;
}
export function migrateV23(raw: MigrationRecord): MigrationRecord {
  const state = cloneMigrationRecord(raw); state.version = 24;
  for (const field of ['buildings', 'workers', 'stoppedBuildings']) state[field] = { ...spreadMigrationField(state[field]), granary: 0 };
  if (Array.isArray(state.queue)) state.queue = state.queue.filter((entry: unknown) => {
    const item = entry as MigrationRecord | null;
    return !(item?.kind === 'tech' && item.id === 'spaceflight' && !(Number((state.arpaBuildings as MigrationRecord | undefined)?.rocketPlatform) > 0));
  });
  return state;
}
export function migrateV24(raw: MigrationRecord): MigrationRecord {
  const state = cloneMigrationRecord(raw); state.version = 25;
  for (const field of ['resources', 'containerAssignments', 'lines']) state[field] = { ...spreadMigrationField(state[field]), polymer: 0 };
  for (const field of ['buildings', 'workers', 'stoppedBuildings']) state[field] = { ...spreadMigrationField(state[field]), solarSatellite: 0, researchSatellite: 0 };
  return state;
}
export function migrateV26(raw: MigrationRecord): MigrationRecord {
  const state = cloneMigrationRecord(raw); state.version = 27;
  for (const field of ['buildings', 'workers', 'stoppedBuildings']) {
    const values = migrationField(state, field); values.catCafe = 0; values.touristCenter = 0;
  }
  migrationField(state, 'arpaProgress').monument = 0;
  migrationField(state, 'arpaBuildings').monument = 0;
  state.monumentMaterial = 'stone';
  return state;
}
export function migrateV27(raw: MigrationRecord): MigrationRecord {
  const state = cloneMigrationRecord(raw);
  state.version = 28;
  state.lines = { ...spreadMigrationField(state.lines), fur: 0 };
  return state;
}
export function migrateV28(raw: MigrationRecord): MigrationRecord {
  const state = cloneMigrationRecord(raw);
  state.version = 29;
  // Historical v28 semantics are unavailable. Treat these as additive fields:
  // initialize absent keys, preserve present values for current validation, and
  // never turn malformed legacy records into apparently valid empty records.
  const initialize = (field: string, defaults: MigrationRecord): void => {
    const saved = state[field];
    if (saved !== undefined && (!saved || typeof saved !== 'object' || Array.isArray(saved))) throw Error('旧存档字段无效。');
    state[field] = { ...defaults, ...(saved as MigrationRecord | undefined) };
  };
  for (const field of ['resources', 'containerAssignments', 'craftWorkers']) initialize(field, { mithril: 0 });
  const additions = { moonObservatory: 0, asrielSpaceport: 0, asrielResidence: 0, asrielMine: 0, ecologicalDome: 0, hangar: 0, spaceFactory: 0, starRingStation: 0 };
  for (const field of ['buildings', 'workers', 'stoppedBuildings']) initialize(field, additions);
  if (!Object.hasOwn(state, 'asrielMissionCompleted')) state.asrielMissionCompleted = false;
  if (!Object.hasOwn(state, 'asrielMissionQueued')) state.asrielMissionQueued = false;
  return state;
}
