import { BUILDINGS } from '../data/buildings';
import { RESOURCES } from '../data/resources';
import { RETIRED_TECHNOLOGIES, TECHNOLOGIES } from '../data/technologies';
import { ACHIEVEMENTS } from '../data/progression';
import { isBuildingUnlocked } from '../simulation/unlocks';
import { isBuildingFullyBuilt } from '../simulation/costs';
import { SPACE_MISSIONS, isRegionalMissionCompleted, type SpaceMissionId, type RegionalMissionDefinition } from '../simulation/space-missions';
import { validateSaveIds } from './validation';
import { SNAPSHOT_ACHIEVEMENT_IDS } from '../simulation/achievement-tracking';
import type { GameState } from '../types/state';
import type { BuildingId } from '../types/buildings';
import type { TechnologyId } from '../types/technologies';

/** Every current mission flag is required. */
export function validateSpaceMissionRecords(raw: Record<string, unknown>, state: GameState): void {
  for (const mission of Object.values(SPACE_MISSIONS)) {
    const saved = raw[mission.flag];
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

/**
 * Earned research that beta 0.7.3 re-gated behind 工业化. A save predating that
 * retarget keeps its research; only the new parent is tolerated as missing, and
 * isTechnologyUnlocked still enforces it for every future purchase. These IDs
 * were originally gated on 自动化/电力, which historical saves already satisfy.
 */
const RETARGETED_PREREQUISITE_TECH: readonly TechnologyId[] = ['electronics', 'oilTechnology', 'alloyDrill', 'alloyChainsaw'];

/**
 * Earned research re-gated behind 外星定居 (beta 0.9.11). The four Asriel techs used to hang off
 * 行星勘探 alone; a save that already researched them keeps that progress. Only the new parent
 * may be missing, and `isTechnologyUnlocked` still enforces it for every future purchase.
 */
const ALIEN_SETTLEMENT_RETARGETED: readonly TechnologyId[] = [
  'spaceControlTower', 'alienCasting', 'spaceIndustrialization', 'starRingStation',
];

/**
 * Buildings whose unlock technology moved in beta 0.7.3, mapped to the technology
 * that previously opened them. Historical saves keep built counts and workers.
 */
const RETARGETED_BUILDING_TECH: Partial<Record<BuildingId, TechnologyId>> = { factory: 'automation' };

export function validateUnlockRecords(raw: Record<string, unknown>, state: GameState): void {
  state.unlockedResources = validateSaveIds(raw.unlockedResources, RESOURCES);
  state.tech = validateSaveIds(raw.tech, TECHNOLOGIES);
  state.achievements = validateSaveIds(raw.achievements, ACHIEVEMENTS);
  const levels = raw.achievementLevels;
  if (Object.hasOwn(raw, 'achievementLevels') && (!levels || typeof levels !== 'object' || Array.isArray(levels)
    || Object.entries(levels).some(([id, level]) => !state.achievements.includes(id as GameState['achievements'][number])
      || !Number.isInteger(level) || (level as number) < 0 || (level as number) > 3))) throw Error('成就等级无效。');
  state.achievementLevels = { ...levels as GameState['achievementLevels'] };
  const tracking = raw.achievementTracking;
  {
    if (!tracking || typeof tracking !== 'object' || Array.isArray(tracking)
      || Object.keys(tracking).some(id => !SNAPSHOT_ACHIEVEMENT_IDS.includes(id as typeof SNAPSHOT_ACHIEVEMENT_IDS[number]))
      || SNAPSHOT_ACHIEVEMENT_IDS.some(id => !Object.hasOwn(tracking, id) || typeof (tracking as Record<string, unknown>)[id] !== 'boolean')) throw Error('成就追踪状态无效。');
    state.achievementTracking = { ...tracking } as GameState['achievementTracking'];
  }
  // Pending missions are represented exclusively by the purchase queue.
  if (typeof raw.asrielMissionCompleted !== 'boolean' || raw.asrielMissionQueued !== false) throw Error('Asriel任务状态无效。');
  state.asrielMissionCompleted = raw.asrielMissionCompleted; state.asrielMissionQueued = false;
  const kerberosMissionCompleted = raw.kerberosMissionCompleted;
  if (typeof kerberosMissionCompleted !== 'boolean' || (kerberosMissionCompleted && !state.tech.includes('planetaryExploration'))) throw Error('Kerberos任务状态无效。');
  state.kerberosMissionCompleted = kerberosMissionCompleted;
  validateSpaceMissionRecords(raw, state);
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    const mission = BUILDINGS[id].spaceMissionRequired
      ?? (BUILDING_SPACE_MISSIONS as Partial<Record<BuildingId, SpaceMissionId>>)[id];
    if ((state.buildings[id] || state.workers[id]) && mission && !isRegionalMissionCompleted(state, mission)) throw Error('建筑需要完成太空任务。');
  }
  if (state.buildings.geothermalPlant > 0 && !state.kerberosMissionCompleted) throw Error('Kerberos任务尚未完成。');
  for (const tech of state.tech) {
    // Retired research carries no effect any more, so its prerequisite graph is no longer
    // meaningful: a save that earned it before retirement must keep loading even if a parent
    // was itself retired or re-gated. `isTechnologyUnlocked` still refuses it forever.
    if (RETIRED_TECHNOLOGIES.includes(tech as TechnologyId)) continue;
    const mission = TECHNOLOGIES[tech].spaceMissionRequired;
    if (mission && !isRegionalMissionCompleted(state, mission)) throw Error('科技需要完成太空任务。');
    if (TECHNOLOGIES[tech].kerberosMissionRequired && !state.kerberosMissionCompleted) throw Error('科技需要完成Kerberos任务。');
    // ripperOverclock historically required only its tech prerequisites. Its new
    // buildingRequired/full-ripper purchase gate must not revoke earned research.
    // Do not reuse isTechnologyUnlocked here: it governs future research.
    if ((tech === 'higherDimensionalStorage' || tech === 'overclocking13') && !isBuildingFullyBuilt('spaceRipper', state)) throw Error('科技需要完成空间撕裂者。');
    // beta 0.7.3 tightened these to require 工业化 (and retargeted 电子学/石油开采
    // off 自动化+电力). Earned research must survive: a historical save that
    // predates the retarget is accepted without the new parent, while
    // isTechnologyUnlocked still governs all future research.
    const tightened = RETARGETED_PREREQUISITE_TECH.includes(tech as TechnologyId);
    const missing = TECHNOLOGIES[tech].pre.filter(parent => !state.tech.includes(parent));
    // beta 0.9.11 re-gated the four Asriel techs behind 外星定居; earned research survives.
    const alienRetargeted = ALIEN_SETTLEMENT_RETARGETED.includes(tech) && missing.every(parent => parent === 'alienSettlement');
    if (missing.length && !(tightened && missing.every(parent => parent === 'industrialization')) && !alienRetargeted) throw Error('科技前置关系无效。');
  }
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    if (!(state.buildings[id] || state.workers[id])) continue;
    if (isBuildingUnlocked(id, state)) continue;
    // beta 0.7.3 moved 工厂 onto 工业化. A save that predates the retarget keeps
    // its built factories and assigned workers; every other gate is re-checked at
    // its current strictness so this tolerance cannot open anything new.
    const previousTech = RETARGETED_BUILDING_TECH[id];
    if (previousTech && state.tech.includes(previousTech)
      && isBuildingUnlocked(id, { ...state, tech: [...state.tech, BUILDINGS[id].tech] })) continue;
    throw Error('建筑尚未解锁。');
  }
}
