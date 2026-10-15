import { BUILDINGS } from '../data/buildings';
import { RESOURCES } from '../data/resources';
import { TECHNOLOGIES } from '../data/technologies';
import { ACHIEVEMENTS } from '../data/progression';
import { isBuildingUnlocked } from '../simulation/unlocks';
import { isBuildingFullyBuilt } from '../simulation/costs';
import { SPACE_MISSIONS, isRegionalMissionCompleted, type SpaceMissionId, type RegionalMissionDefinition } from '../simulation/space-missions';
import { validateSaveIds } from './validation';
import { validateSaveSpaceship } from './validate-spaceship';
import { SNAPSHOT_ACHIEVEMENT_IDS, snapshotAchievementConditions } from '../simulation/achievement-tracking';
import type { GameState } from '../types/state';
import type { BuildingId } from '../types/buildings';
import type { TechnologyId } from '../types/technologies';

export const LEGACY_V21_TECH_PREREQUISITES = { cement: ['knowledgeContainer', 'castingWorkshop'], nuclearEnergy: ['oilTechnology'] } satisfies Record<string, TechnologyId[]>;
/** Additive mission fields default only when absent; explicit malformed values are invalid. */
export function validateSpaceMissionRecords(raw: Record<string, unknown>, state: GameState): void {
  for (const mission of Object.values(SPACE_MISSIONS)) {
    const saved = raw[mission.flag] === undefined ? false : raw[mission.flag];
    if (typeof saved !== 'boolean') throw Error('太空任务状态无效。');
    state[mission.flag] = saved;
  }
  for (const mission of Object.values(SPACE_MISSIONS) as RegionalMissionDefinition[]) {
    if (state[mission.flag] && (!state.tech.includes(mission.tech)
      || (mission.missionRequired && !isRegionalMissionCompleted(state, mission.missionRequired)))) throw Error('太空任务前置关系无效。');
  }
}

const BUILDING_SPACE_MISSIONS = {
  swarmControlStation: 'solar', swarmSatellite: 'solar',
  atmosphericCollector: 'talos', galacticFuelDepot: 'talos',
  talosMoonMiningStation: 'talosMoon', iridiumMiningShip: 'asteroidBelt', ironMiningShip: 'asteroidBelt',
} as const;

export function validateUnlockRecords(raw: Record<string, unknown>, state: GameState): void {
  state.unlockedResources = validateSaveIds(raw.unlockedResources, RESOURCES);
  state.tech = validateSaveIds(raw.tech, TECHNOLOGIES);
  const retiredAchievements = ['first', 'hundred', 'food', 'pioneer', 'builder', 'space'];
  // Only known retired ids are stripped; malformed or unknown ids still reject.
  state.achievements = validateSaveIds(Array.isArray(raw.achievements)
    ? raw.achievements.filter(id => !retiredAchievements.includes(id)) : raw.achievements, ACHIEVEMENTS);
  const tracking = raw.achievementTracking;
  if (tracking === undefined) {
    // Ship records are loaded later in validation and may omit explicit flags;
    // derive their current paid completion on a temporary state, just as the
    // later spaceship validator does. Never mutate or backfill the source save.
    const snapshot = { ...state };
    validateSaveSpaceship(raw, snapshot);
    state.achievementTracking = snapshotAchievementConditions(snapshot);
  } else {
    if (!tracking || typeof tracking !== 'object' || Array.isArray(tracking)
      || Object.keys(tracking).some(id => !SNAPSHOT_ACHIEVEMENT_IDS.includes(id as typeof SNAPSHOT_ACHIEVEMENT_IDS[number]))
      || SNAPSHOT_ACHIEVEMENT_IDS.some(id => !Object.hasOwn(tracking, id) || typeof (tracking as Record<string, unknown>)[id] !== 'boolean')) throw Error('成就追踪状态无效。');
    state.achievementTracking = { ...tracking } as GameState['achievementTracking'];
  }
  state.legacyRocketry = raw.legacyRocketry === true;
  if (typeof raw.asrielMissionCompleted !== 'boolean' || typeof raw.asrielMissionQueued !== 'boolean' || raw.asrielMissionQueued) throw Error('Asriel任务状态无效。');
  state.asrielMissionCompleted = raw.asrielMissionCompleted; state.asrielMissionQueued = false;
  const kerberosMissionCompleted = raw.kerberosMissionCompleted === undefined ? false : raw.kerberosMissionCompleted;
  if (typeof kerberosMissionCompleted !== 'boolean' || (kerberosMissionCompleted && !state.tech.includes('planetaryExploration'))) throw Error('Kerberos任务状态无效。');
  state.kerberosMissionCompleted = kerberosMissionCompleted;
  validateSpaceMissionRecords(raw, state);
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const mission = BUILDINGS[id].spaceMissionRequired
      ?? (BUILDING_SPACE_MISSIONS as Partial<Record<BuildingId, SpaceMissionId>>)[id];
    if ((state.buildings[id] || state.workers[id]) && mission && !isRegionalMissionCompleted(state, mission)) throw Error('建筑需要完成太空任务。');
  }
  if (state.buildings.geothermalPlant > 0 && !state.kerberosMissionCompleted) throw Error('Kerberos任务尚未完成。');
  const legacy = validateSaveIds(raw.legacyTechPrerequisites ?? [], LEGACY_V21_TECH_PREREQUISITES);
  state.legacyTechPrerequisites = legacy;
  if (legacy.some(id => !state.tech.includes(id) || !LEGACY_V21_TECH_PREREQUISITES[id].every(parent => state.tech.includes(parent)))) throw Error('旧档科技前置记录无效。');
  for (const tech of state.tech) {
    const mission = TECHNOLOGIES[tech].spaceMissionRequired;
    if (mission && !isRegionalMissionCompleted(state, mission)) throw Error('科技需要完成太空任务。');
    if (TECHNOLOGIES[tech].kerberosMissionRequired && !state.kerberosMissionCompleted) throw Error('科技需要完成Kerberos任务。');
    // 高维存储 requires the completed 空间撕裂者, not merely one segment.
    if ((tech === 'higherDimensionalStorage' || tech === 'overclocking13') && !isBuildingFullyBuilt('spaceRipper', state)) throw Error('科技需要完成空间撕裂者。');
    if (!['metallurgy', 'electricity'].includes(tech) && !(tech === 'rocketry' && state.legacyRocketry)
      && !(tech === 'knowledgeContainer' && state.tech.includes('writing'))
      && !(['banking', 'military', 'mining'].includes(tech) && state.tech.includes('tools'))
      && !state.legacyTechPrerequisites.includes(tech) && !TECHNOLOGIES[tech].pre.every(parent => state.tech.includes(parent))) throw Error('科技前置关系无效。');
  }
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) if ((state.buildings[id] || state.workers[id]) && !isBuildingUnlocked(id, state)) throw Error('建筑尚未解锁。');
}
