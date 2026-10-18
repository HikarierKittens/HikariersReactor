import type { ResourceId, ResourceRecipe } from './economy';
import type { TechnologyId } from './technologies';

export type BuildingId =
  | 'softRouterNode' | 'aesComputeModule' | 'worldSimulator' | 'agiCoreComponent' | 'coreCooler' | 'agiAscensionCore'
  | 'gatewayRouter' | 'downloadExecutable' | 'quantumStorage' | 'downloadCache'
  | 'subcomputeNode' | 'quantizedCompressionModule' | 'dataCompression' | 'cpuDecoder'
  | 'cellCore' | 'memoryCore' | 'ethMiner' | 'dataDecryptionModule'
  | 'signalRepeater' | 'hydrogenPowerPlant'
  | 'hyperspaceSpaceport' | 'iceMiningShip' | 'asteroidBase'
  | 'comprehensiveMiningFacility' | 'gasCloudMiningShip' | 'highTechFarmPlatform'
  | 'fusionPowerPlant' | 'metalMiningShip' | 'fuelMiningShip'
  | 'spaceRipper' | 'highTechFactory' | 'e710ResearchStation'
  | 'adamantiteMiningShip' | 'adamantiteProcessor' | 'grapheneFactory' | 'vrCenter'
  | 'stellarForge' | 'hazardousMaterialStorage' | 'blackHoleStation' | 'penroseSphere' | 'dysonSphere' | 'massEjector'
  | 'constraintArray' | 'shortRangeRelay' | 'anchorFreightStation' | 'civilianRouteStation'
  | 'asrielControlTower'
  | 'alienMaterialLab' | 'aiSupercore' | 'swarmFactory'
  | 'e710Container' | 'e710MiningShip' | 'e710Warehouse' | 'e710Reactor' | 'miningDrone' | 'oilExtractor'
  | 'particleAccelerator' | 'interstellarDock'
  | 'swarmControlStation' | 'swarmSatellite' | 'atmosphericCollector' | 'galacticFuelDepot'
  | 'talosMoonMiningStation' | 'iridiumMiningShip' | 'ironMiningShip'
  | 'moonBase' | 'iridiumMine' | 'helium3Mine' | 'navigationBeacon' | 'orbitalFuelDepot'
  | 'solarSatellite' | 'researchSatellite' | 'granary' | 'biologyLab' | 'bank'
  | 'barracks' | 'trainingCamp' | 'metalRefinery' | 'cementWorkshop' | 'fuelDepot'
  | 'containerWarehouse' | 'communityCenter' | 'coalMine' | 'mine'
  | 'nestMKII' | 'apartment' | 'warehouse' | 'storageHub' | 'nest' | 'catHut' | 'forage'
  | 'lumber' | 'quarry' | 'theater' | 'broadcast' | 'touristStation' | 'foundry'
  | 'library' | 'school' | 'generator' | 'oilGenerator' | 'fissionGenerator' | 'solarFarm'
  | 'smelter' | 'lab' | 'refinery' | 'observatory' | 'factory' | 'moonObservatory'
  | 'asrielSpaceport' | 'asrielResidence' | 'asrielMine' | 'ecologicalDome'
  | 'planetaryFoundry' | 'spaceGarrison' | 'geothermalPlant'
  | 'hangar' | 'spaceFactory' | 'starRingStation' | 'spaceWaystation' | 'catCafe' | 'touristCenter';

export interface BuildingDefinition {
  name: string;
  icon: string;
  cost: ResourceRecipe;
  tech: TechnologyId;
  desc?: string;
  input?: ResourceRecipe;
  output?: ResourceRecipe;
  workerOutput?: ResourceRecipe;
  costScales?: ResourceRecipe;
  /** Count is stored as segments; effects and inputs apply only to complete units. */
  segmentedRequired?: number;
  slots?: number;
  workerName?: string;
  buildingRequired?: BuildingId;
  spaceMissionRequired?: 'misen' | 'neutronStar' | 'blackHole';
  /** Segmented building whose every built segment works (instead of only complete units). */
  segmentEffects?: boolean;
  boostResource?: ResourceId;
  alwaysRunning?: boolean;
  toggleable?: boolean;
  powerPlant?: boolean;
  unlimited?: boolean;
  minerBoost?: boolean;
  craftSlots?: boolean;
  asrielSource?: boolean;
  spaceSource?: boolean;
  moonSupport?: number;
  swarmSupport?: number;
  /** Digital-world bandwidth supplied / required while running. */
  bandwidth?: number;
  bandwidthUse?: number;
  /** Digital-world CPU compute supplied / required while running. */
  cpuCompute?: number;
  cpuComputeUse?: number;
  bytesCap?: number;
  cashCap?: number;
  downloadBoost?: number;
  knowledgeCap?: number;
  soldierCap?: number;
  trainingBoost?: number;
  oilCap?: number;
  containerCap?: number;
  max?: number;
  cap?: number;
  artistSlots?: number;
  moraleCap?: number;
  morale?: number;
  knowledgeBoost?: number;
  lines?: number;
  schoolBoost?: number;
  support?: number;
  asrielSupport?: number;
  jobs?: number;
  foodCap?: number;
  spaceContainerCap?: number;
  storageContainers?: number;
  /** Extra job slots this building grants to other worker buildings, per owned building. */
  jobSlots?: Partial<Record<BuildingId, number>>;
}
