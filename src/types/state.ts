import type { BuildingId } from './buildings';
import type { RegionalMissionId } from '../simulation/space-missions';
import type { CraftId, FactoryLineId, ResourceAmounts, ResourceId, ResourceRecipe } from './economy';
import type { TechnologyId } from './technologies';
import type { NeighborId } from '../data/neighbors';

export type CrisprUpgradeId = 'materialEfficiency' | 'innovativeMaterials' | 'structuralReinforcement' | 'physicsLaws' | 'halfLife3' | 'geneOptimization' | 'spatialReasoning' | 'dimensionCompression' | 'dimensionDistortion' | 'casimirEffect' | 'coreReplication' | 'technician' | 'masterArtisan' | 'architect' | 'challengeGene' | 'geneSplicing';
export type PrestigeResourceId = 'particles' | 'casimir' | 'darkEnergy' | 'harmonyCrystals';
/** Run-scoped black hole fed by 质量喷射器; masses keep full float precision. */
export interface BlackHoleState {
  mass: number;
  exoticMass: number;
  /** Set when exotic mass reaches the instability threshold; cleared by 稳定黑洞. */
  unstable: boolean;
  /** Ejection allocation in units/s per resource. */
  ejection: Partial<Record<ResourceId, number>>;
}
/** 特殊资源II: DNA bases crafted from knowledge for 基因修饰. */
export type DnaId = 'C' | 'G' | 'A' | 'T';
export type GeneId = 'goodCat' | 'hardWorking' | 'maturationAcceleration' | 'superWorkshop' | 'perfectionism' | 'overclockForging' | 'titanPower' | 'advancedScience' | 'catCohesion' | 'kinoFire';
/** Run-scoped gene modification: DNA stock and gene levels reset with every run. */
export interface GeneModificationState {
  /** DNA stock; 基因合成 produces fractional amounts. */
  dna: Record<DnaId, number>;
  levels: Record<GeneId, number>;
  /** 基因合成 rate per base, integer percent 0–100 of each 生物科学实验室. */
  synthesis: Record<DnaId, number>;
}
export type GovernmentId = 'none' | 'democracy' | 'militaryRule' | 'oligarchy' | 'technocracy' | 'industrialism';
export type ArpaProjectId = 'rocketPlatform' | 'monument' | 'geneSequencing' | 'stockExchange' | 'arpaResearchInstitute';
export type ShipComponentId = 'hull' | 'energyCore' | 'computer' | 'ecosystem' | 'electromagneticEngine' | 'fuel';
export type ShipResourceProgress = Partial<ResourceRecipe & { population: number }>;
export type SnapshotAchievementId = 'artificialCelestial' | 'swarmEclipse' | 'worldExecution' | 'overclockPrince';
export type AchievementId = 'nuclearCuriosity' | 'escapeRun' | SnapshotAchievementId | 'spaceDestroyer';
/** Run-scoped previous observations; permanent awards live in achievements. */
export type AchievementTracking = Record<SnapshotAchievementId, boolean>;
export type LogType = 'queue' | 'progress' | 'event' | 'achievement' | 'system';
export type QueueSettingKey = 'paused' | 'alwaysEnableNewBuildings' | 'unorderedBuildingQueue' | 'queueHotkeys' | 'unorderedResearchQueue' | 'touchOptimization';
export type GameSettings = Record<QueueSettingKey, boolean>;
export const DEFAULT_GAME_SETTINGS: GameSettings = {
  paused: false,
  alwaysEnableNewBuildings: false,
  unorderedBuildingQueue: true,
  queueHotkeys: true,
  unorderedResearchQueue: true,
  touchOptimization: false,
};
export type QueueItem =
  | { uid: number; kind: 'build'; id: BuildingId; segments?: number }
  | { uid: number; kind: 'tech'; id: TechnologyId }
  | { uid: number; kind: 'arpa'; id: ArpaProjectId }
  | { uid: number; kind: 'mission'; id: RegionalMissionId }
  | { uid: number; kind: 'ship'; id: ShipComponentId };

export interface RunStatistics {
  knowledgeSpent: number;
  starved: number;
  soldierDeaths: number;
  days: number;
}
export interface GameStatistics {
  lifetime: RunStatistics & { particlesEarned: number; casimirEarned: number; darkEnergyEarned: number; harmonyCrystalsEarned: number };
  run: RunStatistics;
}

export type ChallengeGeneId = 'particleImbalance' | 'geneCollapse' | 'industrialFracture';
export interface ChallengeState {
  genes: ChallengeGeneId[];
  /** Reserved for future modes; no mode IDs are registered yet. */
  modes: never[];
  /** Reserved for future story challenges. */
  story: null;
  /** Particles owned at launch, excluded only while particleImbalance is active. */
  particleBaseline: number;
}

export type StoryChapterId = 'firstShelter' | 'beyondStone' | 'sleeplessCity' | 'aboveRoof' | 'secondHome' | 'interplanetaryRoutes' | 'strangeElement' | 'anotherMind' | 'essPlan' | 'firstEscape' | 'geneRewrite' | 'nuclearChoice' | 'dysonSwarm' | 'coreCalibration' | 'anomalyConfirmed' | 'twoMaps' | 'anomalyResponse' | 'controlledField' | 'firstSignal' | 'firstTransfer' | 'anomalyTopology' | 'remoteAnchor';
export interface StoryArchive { unlocked: StoryChapterId[]; read: StoryChapterId[] }

export interface StageThreeState { coreActivated: boolean; }
export interface AutoWorkerJobState {
  enabled: boolean;
  /** -1 fills every available physical slot; nonnegative values cap total assigned workers. */
  limit: number;
}
export interface AutoWorkersState {
  enabled: boolean;
  priority: BuildingId[];
  jobs: Partial<Record<BuildingId, AutoWorkerJobState>>;
}

/** One neighbouring power's live attributes. */
export interface NeighborState {
  /** 10–100 at spawn, slowly climbing. */
  military: number;
  /** 10–100 at spawn, slowly climbing; scales what a raid can plunder. */
  economy: number;
  /** 0–100. Hostile actions lower it; at 0 the neighbour retaliates. */
  opinion: number;
}

/** 临近势力: three rivals unlocked by 政府 once the player fields soldiers. */
export interface NeighborsState {
  values: Record<NeighborId, NeighborState>;
  /** Occupied neighbours; each grants output and costs garrison soldiers and tax. */
  occupied: NeighborId[];
  /** Time of the last raid, for UI cooldown display; null until the first one. */
  lastActionTime: number | null;
}

export interface GameState {
  autoWorkers: AutoWorkersState;
  stageThree: StageThreeState;
  story: StoryArchive;
  challenge: ChallengeState;
  statistics: GameStatistics;
  starvationElapsed: number;
  version: number;
  government: GovernmentId;
  taxRate: number;
  /** Percentage of supported download bandwidth allocated to dl.exe (0–100). */
  downloadAllocation: number;
  lastReformTime: number | null;
  furUnlocked: boolean;
  unlockedResources: ResourceId[];
  prestige: { particles: number; casimir: number; darkEnergy: number; harmonyCrystals: number; ascensionResets: number; nuclearResets: number; escapeResets: number; blackHoleResets: number; softResets: number };
  /** Prestige resources ever held; stays unlocked when the amount later returns to 0. */
  prestigeUnlocked: PrestigeResourceId[];
  crispr: CrisprUpgradeId[];
  geneModification: GeneModificationState;
  soldiers: number;
  /** Wounded during raids; counted separately and unusable in combat until treated. */
  wounded: number;
  /** Fractional healing accumulated toward the next recovered soldier. */
  hospitalProgress: number;
  neighbors: NeighborsState;
  trainingProgress: number;
  nuclearProgress: number;
  arpaProgress: Record<ArpaProjectId, number>;
  /** Independent paid percentages; project rows are sparse until investment. */
  arpaResourceProgress: Partial<Record<ArpaProjectId, ResourceRecipe>>;
  arpaBuildings: Record<ArpaProjectId, number>;
  monumentMaterial: ResourceId;
  arpaQueueElapsed: number;
  craftWorkers: Record<CraftId, number>;
  containers: number;
  containerAssignments: ResourceAmounts;
  alloyContainers: number;
  alloyContainerAssignments: ResourceAmounts;
  resources: ResourceAmounts;
  buildings: Record<BuildingId, number>;
  stoppedBuildings: Record<BuildingId, number>;
  /** Enabled complete units, oldest activation first; missing legacy entries use registry order. */
  powerActivationOrder?: Array<{ id: BuildingId; count: number }>;
  workers: Record<BuildingId, number>;
  tech: TechnologyId[];
  population: number;
  growthTarget: number;
  lines: Record<FactoryLineId, number>;
  /** Idle 冶炼厂工位; every other slot (smelters + 2 × 恒星熔炉) auto-runs steel. */
  smelterIdle: number;
  asrielMissionCompleted: boolean;
  asrielMissionQueued: boolean;
  kerberosMissionCompleted: boolean;
  solarMissionCompleted: boolean;
  talosMissionCompleted: boolean;
  talosMoonMissionCompleted: boolean;
  asteroidBeltMissionCompleted: boolean;
  misenMissionCompleted: boolean;
  neutronStarMissionCompleted: boolean;
  blackHoleMissionCompleted: boolean;
  blackHole: BlackHoleState;
  shipResourceProgress: Partial<Record<ShipComponentId, ShipResourceProgress>>;
  shipComponents: Record<ShipComponentId, boolean>;
  happiness: number;
  growth: number;
  starvation: number;
  achievements: AchievementId[];
  /** Permanent best grades; omitted entries on earned achievements mean grade zero. */
  achievementLevels?: Partial<Record<AchievementId, number>>;
  achievementTracking: AchievementTracking;
  effects: { id: 'mice'; left: number }[];
  eventIn: number;
  time: number;
  clicks: number;
  logs: { time: number; text: string; type: LogType }[];
  queue: QueueItem[];
  settings: GameSettings;
  lastSaved: number;
}
