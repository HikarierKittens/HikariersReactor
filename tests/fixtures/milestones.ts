import { CONFIG } from '../../src/data/config';
import { TECHNOLOGIES } from '../../src/data/technologies';
import { createInitialState } from '../../src/state/create-state';
import type { TechnologyId } from '../../src/types/technologies';

/** Progression milestones used to build additive, explicit test save fixtures. */
export type MilestoneStage = 'ground' | 'moon' | 'space' | 'remote' | 'beacon' | 'postBeacon';

/** Historical third-stage events in research order (remoteLinked excluded; it is an experiment). */
const REMOTE_CHAIN_FLAGS = ['coreActivated', 'fieldStabilized', 'signalCompleted', 'transferCompleted'] as const;

/** Technology chains that unlock each anomaly-research capability. */
const BASE_ERA_TECH = ['survival', 'tools', 'writing', 'mining', 'ironTools', 'metallurgy', 'science', 'electricity', 'automation', 'electrochemicalSmelting', 'oilTechnology', 'oilStorage', 'titaniumSmelting'] as const;
const SPACE_BASE_TECH = ['electronics', 'dataCenter', 'artificialIntelligence', 'savingsBonds', 'internet', 'biologicalScience', 'genetics', 'monument', 'stockExchange', 'arpaResearchInstitute', 'nuclearEnergy', 'coalMining', 'uraniumStorage', 'arpa', 'rocketry', 'spaceflight', 'laser', 'outerPlanetExploration', 'asteroidBeltMining', 'asteroidMiningOptimization', 'exoticElementResearch'] as const;
const ANOMALY_BASE_TECH = [...BASE_ERA_TECH, ...SPACE_BASE_TECH, 'artificialIntelligenceII', 'globalObservationCalibration'] as const;
const ANOMALY_CHAIN_TECH = ['anomalyMapping', 'fieldConstraintTheory', 'dualEndCoupling', 'finiteAperture', 'anomalyTopology'] as const;
/** Techs whose save validity requires matching historical third-stage events. */
const ANOMALY_DEPENDENT_TECH = [...ANOMALY_CHAIN_TECH, 'artificialIntelligenceII', 'globalObservationCalibration'] as const;
const BEACON_TECH = ['dimensionBeaconDeployment'] as const;
const POST_BEACON_TECH = ['accessPointBeacon', 'hydrogenRecovery', 'icebreakingPlan'] as const;
/** Mission-required technologies stay explicit because completed missions validate against them. */
const MISSION_TECH = ['solarExploration', 'dysonTheory', 'atmosphericMining', 'talosMoonScanning', 'misenDiscovery'] as const;
/** Space-expedition techs depend on completed missions and are added with the mission flags. */
const EXPEDITION_TECH = ['outerPlanetExploration', 'asteroidBeltMining', 'asteroidMiningOptimization', 'exoticElementResearch'] as const;

/** Completed regional missions and the ARPA projects the space milestones rely on. */
const SPACE_MISSION_FLAGS = ['asrielMissionCompleted', 'kerberosMissionCompleted', 'solarMissionCompleted', 'talosMissionCompleted', 'talosMoonMissionCompleted', 'asteroidBeltMissionCompleted', 'misenMissionCompleted'] as const;
const CORE_ARPA = ['rocketPlatform', 'monument', 'geneSequencing'] as const;
const REMOTE_ARPA = ['remoteAnchor'] as const;

export interface MilestoneOptions {
  /** Explicit tech ids merged into the milestone list (deduplicated). */
  extraTech?: readonly TechnologyId[];
  /** Tech ids removed from the milestone list (never removes base progression). */
  withoutTech?: readonly TechnologyId[];
  /** Historical third-stage flags; defaults to every event up to the milestone. */
  stageThreeFlags?: string[];
  /** Additional ARPA buildings finished at count 1. */
  extraArpa?: string[];
  /** Completed regional mission flags; defaults to all for space-and-later. */
  missionFlags?: string[];
  /** Buildings owned when the state is returned (count 1). */
  buildings?: Partial<Record<string, number>>;
}

function stateAt(stage: MilestoneStage, options: MilestoneOptions = {}) {
  const state = createInitialState(CONFIG.version, 60, 0);
  // Ground keeps only pre-space tech: no anomaly chain, no AI-era dependency.
  const tech: string[] = [...BASE_ERA_TECH, ...SPACE_BASE_TECH.filter(id => !MISSION_TECH.includes(id as (typeof MISSION_TECH)[number]) && !ANOMALY_DEPENDENT_TECH.includes(id as never) && !EXPEDITION_TECH.includes(id as never))];
  const arpa: string[] = ['rocketPlatform', 'monument'];
  const missions: string[] = [];
  const stageFlags: string[] = [];
  if (stage !== 'ground') {
    tech.push(...ANOMALY_BASE_TECH, ...ANOMALY_CHAIN_TECH, ...EXPEDITION_TECH, 'moonExploration', 'moonObservatory', 'planetaryExploration', 'navigationBeacon', 'iridiumAlloyWarehouse', ...MISSION_TECH);
    missions.push(...SPACE_MISSION_FLAGS);
    // Completed missions and research institutes are part of every post-ground save.
    state.kerberosMissionCompleted = true;
    arpa.push('arpaResearchInstitute', 'geneSequencing');
    // Historical third-stage evidence matches the milestone's researched chain.
    state.buildings.aiSupercore = 100;
    state.buildings.constraintArray = 1;
    stageFlags.push(...REMOTE_CHAIN_FLAGS);
  }
  if (stage === 'space' || stage === 'remote' || stage === 'beacon' || stage === 'postBeacon') {
    tech.push('spaceControlTower', 'spaceIndustrialization', 'starRingStation', 'spaceTransitStation', 'spaceGarrison', 'alienCasting', 'geothermalFurnace', 'helium3ExtractionOptimization', 'swarmFactory', 'swarmFactoryOptimization', 'quantumManufacturing', 'quantumSwarm', 'escapePlan', 'neutronConstructionMaterials', 'carbonNanotubes');
  }
  if (stage === 'remote' || stage === 'beacon' || stage === 'postBeacon') {
    arpa.push(...REMOTE_ARPA);
  }
  if (stage === 'beacon' || stage === 'postBeacon') stageFlags.push('remoteLinked');
  if (stage === 'beacon') tech.push(...BEACON_TECH, 'accessPointBeacon');
  if (stage === 'postBeacon') {
    tech.push(...BEACON_TECH, ...POST_BEACON_TECH);
    state.buildings.iceMiningShip = 1;
    state.buildings.asteroidBase = 1;
  }
  const merged = [...new Set<string>([...tech, ...(options.extraTech ?? [])])]
    .filter((id): id is string => !(options.withoutTech ?? []).includes(id as TechnologyId));
  state.tech = merged as TechnologyId[];
  for (const flag of missions) (state as unknown as Record<string, boolean>)[flag] = true;
  for (const id of [...arpa, ...(options.extraArpa ?? [])]) (state.arpaBuildings as unknown as Record<string, number>)[id] = 1;
  (state.arpaBuildings as unknown as Record<string, number>).arpaResearchInstitute = 2;
  for (const flag of options.stageThreeFlags ?? stageFlags) (state.stageThree as unknown as Record<string, boolean>)[flag] = true;
  for (const [id, count] of Object.entries(options.buildings ?? {})) if (typeof count === 'number') (state.buildings as unknown as Record<string, number>)[id] = count;
  return state;
}

/** Explicit, additive milestone save fixture; never derived from "all tech minus a blacklist". */
export function createMilestoneState(stage: MilestoneStage, options: MilestoneOptions = {}) {
  return stateAt(stage, options);
}

/** Declarative snapshot of one milestone for tests that assert exact tech lists. */
export function milestoneTech(stage: MilestoneStage, options: MilestoneOptions = {}): string[] {
  return stateAt(stage, options).tech as string[];
}

/** True when every listed technology exists in the registry (guards registry drift). */
export function assertMilestoneTechKnown(stage: MilestoneStage, options: MilestoneOptions = {}): void {
  for (const id of milestoneTech(stage, options)) if (!Object.hasOwn(TECHNOLOGIES, id)) throw Error(`unknown milestone tech ${id}`);
}
