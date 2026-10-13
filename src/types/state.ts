import type { BuildingId } from './buildings';
import type { RegionalMissionId } from '../simulation/space-missions';
import type { CraftId, FactoryLineId, ResourceAmounts, ResourceId, ResourceRecipe } from './economy';
import type { TechnologyId } from './technologies';

export type CrisprUpgradeId = 'materialEfficiency' | 'innovativeMaterials' | 'structuralReinforcement' | 'physicsLaws' | 'halfLife3' | 'geneOptimization' | 'spatialReasoning' | 'dimensionCompression' | 'dimensionDistortion' | 'casimirEffect' | 'coreReplication' | 'technician' | 'masterArtisan' | 'architect' | 'challengeGene' | 'geneSplicing';
export type PrestigeResourceId = 'particles' | 'casimir';
/** 特殊资源II: DNA bases crafted from knowledge for 基因修饰. */
export type DnaId = 'C' | 'G' | 'A' | 'T';
export type GeneId = 'goodCat' | 'hardWorking' | 'superWorkshop' | 'perfectionism' | 'titanPower' | 'advancedScience' | 'catCohesion' | 'kinoFire';
/** Run-scoped gene modification: DNA stock and gene levels reset with every run. */
export interface GeneModificationState { dna: Record<DnaId, number>; levels: Record<GeneId, number> }
export type GovernmentId = 'none' | 'democracy' | 'militaryRule' | 'oligarchy' | 'technocracy' | 'industrialism';
export type ArpaProjectId = 'rocketPlatform' | 'monument' | 'geneSequencing' | 'stockExchange' | 'arpaResearchInstitute' | 'deepSpaceInterferometer' | 'deepSpaceLab' | 'remoteAnchor';
export type ShipComponentId = 'hull' | 'energyCore' | 'computer' | 'ecosystem' | 'electromagneticEngine' | 'fuel';
export type ShipResourceProgress = Partial<ResourceRecipe & { population: number }>;
export type AchievementId = 'first' | 'hundred' | 'food' | 'pioneer' | 'builder' | 'space';
export type LogType = 'progress' | 'event' | 'achievement' | 'system';
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
  lifetime: RunStatistics & { particlesEarned: number; casimirEarned: number };
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

export interface StageThreeState { coreActivated: boolean; probeCompleted: boolean; responseObserved: boolean; fieldStabilized: boolean; signalCompleted: boolean; transferCompleted: boolean; remoteLinked: boolean; }
export interface GameState {
  stageThree: StageThreeState;
  story: StoryArchive;
  challenge: ChallengeState;
  statistics: GameStatistics;
  starvationElapsed: number;
  version: number;
  government: GovernmentId;
  taxRate: number;
  lastReformTime: number | null;
  furUnlocked: boolean;
  unlockedResources: ResourceId[];
  prestige: { particles: number; casimir: number; nuclearResets: number; escapeResets: number; softResets: number };
  /** Prestige resources ever held; stays unlocked when the amount later returns to 0. */
  prestigeUnlocked: PrestigeResourceId[];
  crispr: CrisprUpgradeId[];
  geneModification: GeneModificationState;
  soldiers: number;
  trainingProgress: number;
  nuclearProgress: number;
  arpaProgress: Record<ArpaProjectId, number>;
  /** Independent paid percentages; absent project records migrate legacy arpaProgress lazily. */
  arpaResourceProgress?: Partial<Record<ArpaProjectId, ResourceRecipe>>;
  arpaBuildings: Record<ArpaProjectId, number>;
  monumentMaterial: ResourceId;
  arpaQueueElapsed: number;
  legacyRocketry: boolean;
  legacyTechPrerequisites?: TechnologyId[];
  craftWorkers: Record<CraftId, number>;
  containers: number;
  containerAssignments: ResourceAmounts;
  resources: ResourceAmounts;
  buildings: Record<BuildingId, number>;
  stoppedBuildings: Record<BuildingId, number>;
  workers: Record<BuildingId, number>;
  tech: TechnologyId[];
  population: number;
  growthTarget: number;
  lines: Record<FactoryLineId, number>;
  legacyPopulationCeiling: number;
  asrielMissionCompleted: boolean;
  asrielMissionQueued: boolean;
  kerberosMissionCompleted: boolean;
  solarMissionCompleted: boolean;
  talosMissionCompleted: boolean;
  talosMoonMissionCompleted: boolean;
  asteroidBeltMissionCompleted: boolean;
  misenMissionCompleted: boolean;
  shipResourceProgress: Partial<Record<ShipComponentId, ShipResourceProgress>>;
  shipComponents: Record<ShipComponentId, boolean>;
  happiness: number;
  growth: number;
  starvation: number;
  achievements: AchievementId[];
  effects: { id: 'mice'; left: number }[];
  eventIn: number;
  time: number;
  clicks: number;
  logs: { time: number; text: string; type: LogType }[];
  queue: QueueItem[];
  settings: GameSettings;
  lastSaved: number;
}
