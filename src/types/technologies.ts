import type { BuildingId } from './buildings';
import type { ArpaProjectId } from './state';
import type { ResourceId, ResourceRecipe } from './economy';

export type TechnologyId =
  | 'softRoutingNode' | 'aes114514' | 'digitalSimulation' | 'highPrecisionWorldSimulation' | 'agi' | 'digitalAscension'
  | 'aiCoreCalibration' | 'binaryWorld' | 'downwardProbe' | 'subcomputeNode' | 'quantizedCompression'
  | 'dataCompressor' | 'cpuDecoding'
  | 'deepCore' | 'neuralNetwork' | 'layer3Switch' | 'cryptocurrency' | 'encryptedDataAnalysis' | 'cellMultithreading'
  | 'stationScienceFacilities' | 'knowledgeInheritance'
  | 'batteryConcentrationRing'
  | 'spaceBroadcasting'
  | 'accessPointBeacon' | 'hydrogenRecovery' | 'icebreakingPlan'
  | 'dimensionBeaconDeployment'
  | 'hyperspaceMiningSurvey' | 'gasCloudAccretion' | 'highTechFarmPlatform'
  | 'fusionPower' | 'largeMiningShips'
  | 'dimensionPioneer' | 'highTechFactory' | 'higherDimensionalStorage' | 'e710ResearchStation' | 'ripperOverclock'
  | 'overclocking13' | 'superMetal' | 'grapheneProcessing' | 'nanoAlloy' | 'dysonSphere' | 'dysonSphereII' | 'virtualReality' | 'virtualTraining'
  | 'virtualEntertainment' | 'aerogel' | 'plasmaResearch' | 'plasmaMining' | 'energyShield' | 'stellarForge' | 'hazardousMaterialStorage' | 'penroseTheory'
  | 'aiDataCenter' | 'aiCementWorkshop' | 'advancedAdamantiteProcessing' | 'advancedGrapheneProcessing'
  | 'globalObservationCalibration' | 'anomalyMapping' | 'fieldConstraintTheory'
  | 'advancedMetalRefining'
  | 'spaceControlTower'
  | 'alienScienceResearch' | 'starRingOptimization' | 'artificialIntelligenceII'
  | 'quantumManufacturing' | 'quantumSwarm' | 'swarmFactory' | 'swarmFactoryOptimization'
  | 'iridiumAlloyWarehouse' | 'escapePlan' | 'carbonNanotubes'
  | 'particleAccelerator'
  | 'solarExploration' | 'dysonTheory' | 'outerPlanetExploration' | 'atmosphericMining'
  | 'neutronConstructionMaterials' | 'asteroidBeltMining' | 'laser'
  | 'asteroidMiningOptimization' | 'exoticElementResearch'
  | 'talosMoonScanning' | 'misenDiscovery'
  | 'intelligentBankingSystem' | 'neutronVault'
  | 'stockTrading'
  | 'savingsBonds'
  | 'stockExchange'
  | 'arpaResearchInstitute'
  | 'dimensionCompression'
  | 'quantumTunnelingThermalProcessing'
  | 'monument'
  | 'tourismIndustry'
  | 'catCafe'
  | 'masterpieceCat'
  | 'radiationHardenedChip'
  | 'moonExploration'
  | 'moonObservatory'
  | 'planetaryExploration'
  | 'alienSettlement'
  | 'unifiedPlan'
  | 'worldUnification'
  | 'geothermalFurnace'
  | 'helium3ExtractionOptimization'
  | 'alienCasting'
  | 'spaceGarrison'
  | 'reinforcedContainers'
  | 'iridiumAlloyContainers'
  | 'spaceIndustrialization'
  | 'starRingStation'
  | 'spaceTransitStation'
  | 'iridiumSteelVault'
  | 'helium3Storage'
  | 'breederReactor'
  | 'navigationBeacon'
  | 'polymer'
  | 'titaniumAlloyReactor'
  | 'steelContainers'
  | 'solarSatellite'
  | 'researchSatellite'
  | 'granary'
  | 'vaultExpansion'
  | 'steelSafe'
  | 'government'
  | 'advancedGovernment'
  | 'banking'
  | 'ironEquipment'
  | 'military'
  | 'recruitTraining'
  | 'fieldHospital'
  | 'newInfantryEquipment'
  | 'advancedThermalWeapons'
  | 'kevlarFiber'
  | 'railgun'
  | 'nanoArmor'
  | 'nanoExoskeleton'
  | 'advancedConcrete'
  | 'nuclearProgram'
  | 'automatedMining'
  | 'metalRefining'
  | 'titaniumSmelting'
  | 'intelligentStorage'
  | 'cementMixer'
  | 'cement'
  | 'arpa'
  | 'energyStorage'
  | 'containerManagement'
  | 'ironTools'
  | 'steelTools'
  | 'alloyDrill'
  | 'alloyChainsaw'
  | 'silicateCement'
  | 'coalMining'
  | 'mining'
  | 'nestMKII'
  | 'catHut'
  | 'steelBuildingMaterials'
  | 'housing'
  | 'storage'
  | 'automatedStorage'
  | 'superContainers'
  | 'warehouseUpgrade'
  | 'music'
  | 'broadcasting'
  | 'theaterUpgrade'
  | 'tourism'
  | 'survival'
  | 'tools'
  | 'castingToolUpgrade'
  | 'castingWorkshop'
  | 'knowledgeContainer'
  | 'writing'
  | 'agriculture'
  | 'community'
  | 'electricity'
  | 'metallurgy'
  | 'syntheticFur'
  | 'chemicalDeposition'
  | 'automatedEngineering'
  | 'crudeOilRefiningOptimization'
  | 'intelligentFactory'
  | 'oxygenConverter'
  | 'artificialIntelligence'
  | 'electrochemicalSmelting'
  | 'science'
  | 'agriculturalMachinery'
  | 'automation'
  | 'rocketry'
  | 'oilStorage'
  | 'oilTechnology'
  | 'industrialization' | 'solarPower'
  | 'nuclearEnergy'
  | 'uraniumStorage'
  | 'electronics'
  | 'internet'
  | 'biologicalScience'
  | 'genetics'
  | 'geneSynthesis'
  | 'dataCenter'
  | 'spaceflight'
  | 'crispr16'
  | 'scientificBreeding'
  | 'communityAdmin'
  | 'scientificAdministration'
  | 'intelligentManagementSystem'
  | 'massEjector'
  | 'gravityConversion'
  | 'stabilizeBlackHole'
  | 'exoticRunaway';

export interface TechnologyDefinition {
  name: string;
  era: number;
  tier?: number;
  knowledgeCost?: number;
  cost: ResourceRecipe;
  pre: TechnologyId[];
  /**
   * Flavor text only, rendered under the technology name. Unlock conditions and
   * numeric effects belong in `effects`; most technologies have no description.
   */
  desc?: string;
  /**
   * Effect sentences rendered in the 科技效果 block below the price divider.
   * Technologies keep these hand-written lines: their unlocks and multipliers are
   * spread across several systems, so there is nothing to derive them from.
   */
  effects?: string[];
  /** Extra warning line rendered in red below the description. */
  warning?: string;
  /** Special techs that can be researched again after their gate re-opens. */
  repeatable?: boolean;
  /** Researching immediately triggers a prestige reset; needs explicit confirmation. */
  prestigeReset?: boolean;
  /**
   * Every registered neighbour must be occupied before this research may start. On completion
   * the world is unified: occupations are released and their bonuses are replaced by the
   * unification effect (`worldUnification`).
   */
  occupiedNeighborsRequired?: number;
  buildingQueueBonus?: number;
  researchQueueBonus?: number;
  arpaPre?: ArpaProjectId;
  arpaRequiredCount?: number;
  buildingRequired?: BuildingId;
  resourceRequired?: ResourceId;
  prestigeResetsRequired?: number;
  kerberosMissionRequired?: boolean;
  spaceMissionRequired?: 'solar' | 'talos' | 'talosMoon' | 'asteroidBelt' | 'misen' | 'neutronStar' | 'blackHole';
}
