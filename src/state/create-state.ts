import { BUILDINGS } from '../data/buildings';
import { ARPA_PROJECTS } from '../data/projects';
import { RESOURCES, CRAFT_RECIPES, FACTORY_OPTIONS } from '../data/resources';
import { createStatistics } from '../simulation/statistics';
import { createGeneModificationState } from '../simulation/genes';
import { createBlackHoleState } from '../simulation/black-hole';
import { createAutoWorkersState } from '../simulation/auto-workers';
import { createAchievementTracking } from '../simulation/achievement-tracking';
import { DEFAULT_GAME_SETTINGS } from '../types/state';
import type { GameState } from '../types/state';

/** Keys come from complete typed registries; each invocation owns its records. */
function zeroRecord<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map(key => [key, 0])) as Record<K, number>;
}
function registryKeys<K extends string>(registry: Record<K, unknown>): K[] {
  return Object.keys(registry) as K[];
}

export function createInitialState(version: number, eventIn: number, now: number): GameState {
  return {
    autoWorkers: createAutoWorkersState(),
    stageThree: { coreActivated: false },
    story: { unlocked: [], read: [] },
    challenge: { genes: [], modes: [], story: null, particleBaseline: 0 },
    statistics: createStatistics(), starvationElapsed: 0,
    government: 'none', taxRate: 20, lastReformTime: null,
    furUnlocked: false, unlockedResources: [],
    prestige: { particles: 0, nuclearResets: 0, softResets: 0, casimir: 0, escapeResets: 0, darkEnergy: 0, blackHoleResets: 0 }, prestigeUnlocked: [], crispr: [],
    geneModification: createGeneModificationState(),
    soldiers: 0, trainingProgress: 0, nuclearProgress: 0,
    arpaResourceProgress: {},
    shipResourceProgress: {},
    shipComponents: { hull: false, energyCore: false, computer: false, ecosystem: false, electromagneticEngine: false, fuel: false },
    arpaProgress: zeroRecord(registryKeys(ARPA_PROJECTS)),
    arpaBuildings: zeroRecord(registryKeys(ARPA_PROJECTS)),
    monumentMaterial: 'stone', arpaQueueElapsed: 0,
    craftWorkers: zeroRecord(registryKeys(CRAFT_RECIPES)), version,
    containers: 0, containerAssignments: zeroRecord(registryKeys(RESOURCES)),
    alloyContainers: 0, alloyContainerAssignments: zeroRecord(registryKeys(RESOURCES)),
    resources: zeroRecord(registryKeys(RESOURCES)),
    buildings: zeroRecord(registryKeys(BUILDINGS)),
    stoppedBuildings: zeroRecord(registryKeys(BUILDINGS)),
    workers: zeroRecord(registryKeys(BUILDINGS)),
    tech: [], population: 0, growthTarget: 0,
    lines: zeroRecord(FACTORY_OPTIONS.map(option => option.id)),
    smelterIdle: 0,
    asrielMissionCompleted: false, asrielMissionQueued: false, kerberosMissionCompleted: false,
    solarMissionCompleted: false, talosMissionCompleted: false, talosMoonMissionCompleted: false, asteroidBeltMissionCompleted: false, misenMissionCompleted: false,
    neutronStarMissionCompleted: false, blackHoleMissionCompleted: false, blackHole: createBlackHoleState(),
    happiness: 99.5, growth: 0, starvation: 0, achievements: [], achievementTracking: createAchievementTracking(), effects: [],
    eventIn, time: 0, clicks: 0, logs: [], queue: [], settings: { ...DEFAULT_GAME_SETTINGS }, lastSaved: now,
  };
}
