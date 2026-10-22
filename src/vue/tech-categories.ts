import type { TechnologyId } from '../types/technologies';

/**
 * 科技分类：已研究科技树的按钮边框按类别上色，提高辨识度。
 *
 * 分类只看**科技本身的内容**，不看它解锁的建筑放在哪个页面。最典型的例子是发电类：
 * 光伏电站、氢气发电站、聚变发电站、太阳能卫星、恒星熔炉虽然部分位于太空页，
 * 但它们的本质是产能设施，所以统一归入「生产与工业」；只有戴森球、彭罗斯球体这类
 * 巨构，以及探索/定居/超空间设施才归入「太空与异星」。
 */
export type TechCategory = 'milestone' | 'production' | 'infrastructure' | 'military' | 'space' | 'digital' | 'special';

export interface TechCategoryMeta {
  id: TechCategory;
  name: string;
  /** Border colour; also drives the accent dot. Every value clears 3.6:1 on the button background. */
  color: string;
}

/**
 * Display order and palette. `milestone` keeps the historical gold so the previous
 * `is-key-tech` highlight means exactly the same thing it always did.
 */
export const TECH_CATEGORY_META: readonly TechCategoryMeta[] = [
  { id: 'milestone', name: '里程碑', color: '#e0b64a' },
  { id: 'production', name: '生产与工业', color: '#9fae4e' },
  { id: 'infrastructure', name: '民生与后勤', color: '#4fa695' },
  { id: 'military', name: '军事', color: '#cf5a52' },
  { id: 'space', name: '太空与异星', color: '#5b96dd' },
  { id: 'digital', name: '数字与基因', color: '#a97ad4' },
  { id: 'special', name: '特殊与终局', color: '#c4bfae' },
];

/**
 * Retired research lives in the data layer so `simulation/unlocks.ts` can share the same
 * list without importing from `vue/`. Re-exported here for the tech UI's convenience.
 */
export { RETIRED_TECHNOLOGIES } from '../data/technologies';

/**
 * One category per technology. Every entry in `TECHNOLOGIES` must appear here —
 * `tests/tech-categories.test.ts` enforces full coverage so a new technology cannot
 * silently fall back to a default colour.
 */
export const TECH_CATEGORIES: Record<TechnologyId, TechCategory> = {
  // ── 里程碑：跨时代的关键节点 ──
  survival: 'milestone', writing: 'milestone', metallurgy: 'milestone', science: 'milestone',
  electricity: 'milestone', automation: 'milestone', industrialization: 'milestone', internet: 'milestone',
  nuclearEnergy: 'milestone', arpa: 'milestone', rocketry: 'milestone', oilTechnology: 'milestone',

  // ── 生产与工业：提高资源产出、解锁生产建筑（含普通发电设施） ──
  tools: 'production', mining: 'production', agriculture: 'production', coalMining: 'production', cement: 'production',
  ironTools: 'production', castingWorkshop: 'production', castingToolUpgrade: 'production', steelTools: 'production',
  silicateCement: 'production', metalRefining: 'production', electrochemicalSmelting: 'production',
  advancedConcrete: 'production', nanoExoskeleton: 'production',
  agriculturalMachinery: 'production', cementMixer: 'production', automatedMining: 'production',
  alloyChainsaw: 'production', alloyDrill: 'production', chemicalDeposition: 'production', titaniumSmelting: 'production',
  oxygenConverter: 'production', crudeOilRefiningOptimization: 'production', automatedEngineering: 'production',
  polymer: 'production', quantumTunnelingThermalProcessing: 'production', syntheticFur: 'production',
  titaniumAlloyReactor: 'production', intelligentFactory: 'production', breederReactor: 'production',
  geothermalFurnace: 'production', helium3ExtractionOptimization: 'production', atmosphericMining: 'production',
  advancedMetalRefining: 'production', laser: 'production', carbonNanotubes: 'production',
  asteroidMiningOptimization: 'production', quantumManufacturing: 'production', highTechFactory: 'production',
  superMetal: 'production', plasmaResearch: 'production', plasmaMining: 'production', nanoAlloy: 'production',
  aerogel: 'production', grapheneProcessing: 'production',
  // 普通发电设施：本质是产能，不因位于太空页就变成太空科技。
  solarPower: 'production', hydrogenRecovery: 'production', fusionPower: 'production',
  solarSatellite: 'production', stellarForge: 'production',

  // ── 民生与后勤：容量、仓储、人口、幸福度、资金、队列、政府 ──
  storage: 'infrastructure', music: 'infrastructure', banking: 'infrastructure', government: 'infrastructure',
  theaterUpgrade: 'infrastructure', granary: 'infrastructure', community: 'infrastructure', catHut: 'infrastructure',
  communityAdmin: 'infrastructure', vaultExpansion: 'infrastructure', scientificBreeding: 'infrastructure',
  nestMKII: 'infrastructure', knowledgeContainer: 'infrastructure', warehouseUpgrade: 'infrastructure',
  steelBuildingMaterials: 'infrastructure', steelSafe: 'infrastructure', containerManagement: 'infrastructure',
  scientificAdministration: 'infrastructure', advancedGovernment: 'infrastructure', knowledgeInheritance: 'infrastructure',
  broadcasting: 'infrastructure', housing: 'infrastructure', automatedStorage: 'infrastructure',
  superContainers: 'infrastructure', stockTrading: 'infrastructure', catCafe: 'infrastructure',
  oilStorage: 'infrastructure', intelligentManagementSystem: 'infrastructure', intelligentStorage: 'infrastructure',
  savingsBonds: 'infrastructure', monument: 'infrastructure', masterpieceCat: 'infrastructure',
  radiationHardenedChip: 'infrastructure',
  tourismIndustry: 'infrastructure', uraniumStorage: 'infrastructure', stockExchange: 'infrastructure',
  arpaResearchInstitute: 'infrastructure', tourism: 'infrastructure', helium3Storage: 'infrastructure',
  reinforcedContainers: 'infrastructure', dimensionCompression: 'infrastructure', iridiumSteelVault: 'infrastructure',
  iridiumAlloyWarehouse: 'infrastructure', iridiumAlloyContainers: 'infrastructure',
  neutronConstructionMaterials: 'infrastructure', neutronVault: 'infrastructure',
  intelligentBankingSystem: 'infrastructure', higherDimensionalStorage: 'infrastructure',
  virtualReality: 'infrastructure', virtualEntertainment: 'infrastructure', hazardousMaterialStorage: 'infrastructure',
  // AI数据中心 is 卡尔维拉 infrastructure whose payoff is industrial output, so its
  // follow-up researches live in 生产与工业; the centre itself stays in the space family.
  aiDataCenter: 'space', aiCementWorkshop: 'production', advancedAdamantiteProcessing: 'production',
  advancedGrapheneProcessing: 'production',
  steelContainers: 'infrastructure',

  // ── 军事 ──
  military: 'military', fieldHospital: 'military', recruitTraining: 'military', ironEquipment: 'military',
  newInfantryEquipment: 'military', advancedThermalWeapons: 'military', kevlarFiber: 'military', railgun: 'military',
  nanoArmor: 'military',
  spaceGarrison: 'military', virtualTraining: 'military',

  // ── 太空与异星：探索、定居、巨构、超空间 ──
  researchSatellite: 'space', spaceflight: 'space', navigationBeacon: 'space', alienSettlement: 'space',
  planetaryExploration: 'space', moonObservatory: 'space', moonExploration: 'space', dysonTheory: 'space',
  spaceTransitStation: 'space', spaceIndustrialization: 'space', spaceControlTower: 'space', solarExploration: 'space',
  starRingStation: 'space', alienCasting: 'space', talosMoonScanning: 'space', outerPlanetExploration: 'space',
  asteroidBeltMining: 'space', swarmFactory: 'space', swarmFactoryOptimization: 'space', quantumSwarm: 'space',
  misenDiscovery: 'space', exoticElementResearch: 'space', alienScienceResearch: 'space', starRingOptimization: 'space',
  stationScienceFacilities: 'space', globalObservationCalibration: 'space', spaceBroadcasting: 'space',
  anomalyMapping: 'space', fieldConstraintTheory: 'space', accessPointBeacon: 'space',
  dimensionBeaconDeployment: 'space', hyperspaceMiningSurvey: 'space', highTechFarmPlatform: 'space',
  icebreakingPlan: 'space', gasCloudAccretion: 'space', e710ResearchStation: 'space', largeMiningShips: 'space',
  dimensionPioneer: 'space', ripperOverclock: 'space', overclocking13: 'space', dysonSphere: 'space',
  energyShield: 'space', penroseTheory: 'space', gravityConversion: 'space', massEjector: 'space',
  dysonSphereII: 'space',

  // ── 数字与基因 ──
  electronics: 'digital', artificialIntelligence: 'digital', dataCenter: 'digital', biologicalScience: 'digital',
  genetics: 'digital', geneSynthesis: 'digital', artificialIntelligenceII: 'digital', binaryWorld: 'digital',
  quantizedCompression: 'digital', dataCompressor: 'digital', downwardProbe: 'digital', subcomputeNode: 'digital',
  aiCoreCalibration: 'digital', cpuDecoding: 'digital', layer3Switch: 'digital', cryptocurrency: 'digital',
  encryptedDataAnalysis: 'digital', deepCore: 'digital', neuralNetwork: 'digital', softRoutingNode: 'digital',
  digitalSimulation: 'digital', aes114514: 'digital', cellMultithreading: 'digital',
  highPrecisionWorldSimulation: 'digital', agi: 'digital',

  // ── 特殊与终局：无常规前置效果的特殊科技与重置型终局 ──
  particleAccelerator: 'special', escapePlan: 'special', nuclearProgram: 'special', unifiedPlan: 'special',
  worldUnification: 'special', crispr16: 'special', stabilizeBlackHole: 'special', exoticRunaway: 'special',
  digitalAscension: 'special', energyStorage: 'special', batteryConcentrationRing: 'special',
};

/** Category of a technology, or `undefined` for an unknown ID. */
export function techCategory(id: string): TechCategory | undefined {
  return Object.hasOwn(TECH_CATEGORIES, id) ? TECH_CATEGORIES[id as TechnologyId] : undefined;
}
