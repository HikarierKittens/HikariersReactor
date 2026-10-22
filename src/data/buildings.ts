import type { BuildingId, BuildingDefinition } from '../types/buildings';
import type { ResourceRecipe } from '../types/economy';

export const BUILDINGS: Record<BuildingId, BuildingDefinition> = {
  softRouterNode: { settledByOtherSystem: true, name: '软路由节点', icon: '', tech: 'softRoutingNode', slots: 0, toggleable: true, bandwidth: 4, cpuCompute: 3, input: { energy: 10 }, cost: { cash: 2500000, encryptedData: 25, nanoAlloy: 25000 }, costScales: { cash: 1.27, encryptedData: 1.27, nanoAlloy: 1.27 },
  },
  aesComputeModule: { settledByOtherSystem: true, name: 'AES算力模块', icon: '', tech: 'aes114514', slots: 0, toggleable: true, cpuComputeUse: 1, output: { encryptedData: .005 }, knowledgeBoost: .1, cost: { cash: 4000000, bytes: 50000, encryptedData: 50, nanoAlloy: 25000 }, costScales: { cash: 1.265, bytes: 1.265, encryptedData: 1.265, nanoAlloy: 1.265 },
  },
  worldSimulator: { settledByOtherSystem: true, name: '世界模拟器', icon: '', tech: 'highPrecisionWorldSimulation', slots: 0, toggleable: true, cpuComputeUse: 3, cap: 8, soldierCap: 4, morale: 5, moraleCap: 5, input: { energy: 10 }, cost: { cash: 5000000, bytes: 25000, encryptedData: 100, nanoAlloy: 25000 }, costScales: { cash: 1.26, bytes: 1.26, encryptedData: 1.26, nanoAlloy: 1.26 },
  },
  agiCoreComponent: { settledByOtherSystem: true, name: 'AGI核心组件', icon: '', tech: 'agi', slots: 0, toggleable: true, buildable: false, max: 1, input: { energy: 100, water: 1000 }, morale: 25, cost: {},
  },
  agiCoreComponentSegments: { settledByOtherSystem: true, name: 'AGI核心组件', icon: '', tech: 'agi', slots: 0, segmentedRequired: 100, completesInto: 'agiCoreComponent', cost: { cash: 5000000, bytes: 50000, encryptedData: 500, nanoAlloy: 25000 }, costScales: { cash: 1, bytes: 1, encryptedData: 1, nanoAlloy: 1 },
  },
  coreCooler: { settledByOtherSystem: true, name: '核心散热器', icon: '', tech: 'digitalAscension', slots: 0, toggleable: true,  cost: { cash: 1000000, bytes: 10000, encryptedData: 10, nanoAlloy: 10000 }, costScales: { cash: 1.1, bytes: 1.1, encryptedData: 1.1, nanoAlloy: 1.1 },
  },
  agiAscensionCore: { settledByOtherSystem: true, name: 'AGI飞升核心', icon: '', tech: 'digitalAscension', slots: 0, toggleable: true, buildable: false, max: 1, input: { energy: 10000 }, cost: {},
    desc: '完整供能并启用后，可进行数字化飞升。',
  },
  agiAscensionCoreSegments: { settledByOtherSystem: true, name: 'AGI飞升核心', icon: '', tech: 'digitalAscension', slots: 0, segmentedRequired: 100, completesInto: 'agiAscensionCore', cost: { cash: 10000000, bytes: 100000, encryptedData: 1000, nanoAlloy: 50000 }, costScales: { cash: 1, bytes: 1, encryptedData: 1, nanoAlloy: 1 },
  },
  gatewayRouter: { settledByOtherSystem: true, name: '网关路由', icon: '', tech: 'aiCoreCalibration', slots: 0, toggleable: true, bandwidth: 5, input: { energy: 25 }, cost: { bytes: 1000 }, costScales: { bytes: 1.30 },
  },
  downloadExecutable: { settledByOtherSystem: true, name: 'dl.exe', icon: '', tech: 'aiCoreCalibration', slots: 0, toggleable: true, bandwidthUse: 1, max: 1, cost: { bytes: 0 }, costScales: { bytes: 1 },
  },
  quantumStorage: { settledByOtherSystem: true, name: '量子存储器', icon: '', tech: 'binaryWorld', slots: 0, toggleable: true, bandwidthUse: 1, bytesCap: 10000, cost: { bytes: 1000 }, costScales: { bytes: 1.27 },
  },
  downloadCache: { settledByOtherSystem: true, name: '下载缓存器', icon: '', tech: 'binaryWorld', slots: 0, toggleable: true, bandwidthUse: 1, downloadBoost: .1, cost: { bytes: 1000 }, costScales: { bytes: 1.24 },
  },
  subcomputeNode: { settledByOtherSystem: true, name: '子算力节点', icon: '', tech: 'subcomputeNode', slots: 0, toggleable: true, bandwidthUse: 3, cpuCompute: 2, cost: { bytes: 10000 }, costScales: { bytes: 1.275 },
  },
  quantizedCompressionModule: { settledByOtherSystem: true, name: '量化压缩模块', icon: '', tech: 'quantizedCompression', slots: 0, toggleable: true, cpuComputeUse: 1, knowledgeCap: 100000, cost: { knowledge: 100000, bytes: 10000 }, costScales: { knowledge: 1.25, bytes: 1.25 } },
  dataCompression: { settledByOtherSystem: true, name: '数据压缩', icon: '', tech: 'dataCompressor', slots: 0, toggleable: true, cpuComputeUse: 1, cost: { knowledge: 50000, bytes: 10000 }, costScales: { knowledge: 1.285, bytes: 1.285 },
  },
  cpuDecoder: { settledByOtherSystem: true, name: 'CPU解码器', icon: '', tech: 'cpuDecoding', slots: 0, toggleable: true, bandwidthUse: 2, cpuComputeUse: 1, output: { bytes: 100 }, cost: { knowledge: 50000, bytes: 20000, nanoAlloy: 10000 }, costScales: { knowledge: 1.25, bytes: 1.25, nanoAlloy: 1.25 },
  },
  cellCore: { settledByOtherSystem: true, name: 'CELL核心', icon: '', tech: 'deepCore', slots: 0, toggleable: true, cpuCompute: 3, input: { energy: 25 }, cost: { bytes: 50000 }, costScales: { bytes: 1.27 },
  },
  memoryCore: { settledByOtherSystem: true, name: '记忆核心', icon: '', tech: 'deepCore', slots: 0, toggleable: true, cpuComputeUse: 1, bytesCap: 50000, input: { energy: 5 }, cost: { bytes: 50000 }, costScales: { bytes: 1.27 },
  },
  ethMiner: { settledByOtherSystem: true, name: 'eth_miner', icon: '', tech: 'cryptocurrency', slots: 0, toggleable: true, cpuComputeUse: 1, cashCap: 512000, input: { energy: 10 }, output: { cash: 512 }, cost: { bytes: 100000 }, costScales: { bytes: 1.25 },
  },
  dataDecryptionModule: { settledByOtherSystem: true, name: '数据解密模块', icon: '', tech: 'encryptedDataAnalysis', slots: 0, toggleable: true, cpuComputeUse: 2, output: { encryptedData: .01 }, cost: { bytes: 10000 }, costScales: { bytes: 1.24 },
  },
  signalRepeater: { settledByOtherSystem: true, name: '信号中继', icon: '', tech: 'accessPointBeacon', slots: 0, toggleable: true, input: { energy: 10 }, cost: { cash: 1200000, alloy: 20000, copper: 30000, nanotubes: 15000, e710: 80 }, costScales: { cash: 1.21, alloy: 1.21, copper: 1.21, nanotubes: 1.21, e710: 1.21 },
  },
  hydrogenPowerPlant: { name: '氢气发电站', icon: '', tech: 'hydrogenRecovery', slots: 0, toggleable: true, powerPlant: true, input: { water: 2 }, output: { energy: 35 }, cost: { cash: 1800000, alloy: 35000, iridium: 8000, nanotubes: 20000, e710: 120 }, costScales: { cash: 1.21, alloy: 1.21, iridium: 1.21, nanotubes: 1.21, e710: 1.21 },
  },
  hyperspaceSpaceport: { settledByOtherSystem: true, name: '超空间太空港', icon: '', tech: 'dimensionBeaconDeployment', slots: 0, toggleable: true, input: { energy: 30, helium3: 5 }, cost: { cash: 2000000, alloy: 40000, iridium: 10000, nanotubes: 30000, e710: 200 }, costScales: { cash: 1.21, alloy: 1.21, iridium: 1.21, nanotubes: 1.21, e710: 1.21 },
    desc: '在异常空间里建立第一个永久性定居点。',
  },
  iceMiningShip: { settledByOtherSystem: true, name: '采冰船', icon: '', tech: 'dimensionBeaconDeployment', slots: 0, toggleable: true, input: { energy: 5, helium3: 5 }, output: { water: 1 }, cost: { cash: 800000, alloy: 15000, iridium: 3000, nanotubes: 8000, e710: 50 }, costScales: { cash: 1.19, alloy: 1.19, iridium: 1.19, nanotubes: 1.19, e710: 1.19 },
    desc: '采集冰喷发物获取水。',
  },
  asteroidBase: { settledByOtherSystem: true, name: '小行星基地', icon: '', tech: 'dimensionBeaconDeployment', buildingRequired: 'iceMiningShip', slots: 0, toggleable: true, input: { energy: 10 }, cost: { cash: 1500000, alloy: 30000, iridium: 8000, nanotubes: 20000, e710: 100 }, costScales: { cash: 1.21, alloy: 1.21, iridium: 1.21, nanotubes: 1.21, e710: 1.21 },
    desc: '在异常小行星群建立小型基地。',
  },
  comprehensiveMiningFacility: { settledByOtherSystem: true, name: '综合采矿设施', icon: '', tech: 'hyperspaceMiningSurvey', slots: 0, toggleable: true, input: { energy: 20, helium3: 10 }, output: { e710: .05, neutron: .15, uranium: .1 }, cost: { cash: 3000000, alloy: 50000, iridium: 12000, nanotubes: 40000, e710: 300 }, costScales: { cash: 1.23, alloy: 1.23, iridium: 1.23, nanotubes: 1.23, e710: 1.23 },
    desc: '采掘小天体获取矿物。',
  },
  gasCloudMiningShip: { settledByOtherSystem: true, name: '气体云采矿舰', icon: '', tech: 'gasCloudAccretion', slots: 0, toggleable: true, input: { energy: 5 }, output: { helium3: 1, deuterium: .2 }, cost: { cash: 1500000, alloy: 25000, iridium: 6000, nanotubes: 20000, e710: 150 }, costScales: { cash: 1.23, alloy: 1.23, iridium: 1.23, nanotubes: 1.23, e710: 1.23 },
    desc: '游荡在气体分子云中收集资源。',
  },
  highTechFarmPlatform: { settledByOtherSystem: true, name: '高科技农场平台', icon: '', tech: 'highTechFarmPlatform', slots: 0, toggleable: true, input: { energy: 10, deuterium: .2 }, output: { food: 5, wood: 4, water: .5 }, cost: { cash: 2000000, alloy: 30000, nanotubes: 25000, e710: 200 }, costScales: { cash: 1.23, alloy: 1.23, nanotubes: 1.23, e710: 1.23 },
    desc: '在超空间中运转的封闭农场。',
  },
  fusionPowerPlant: { name: '聚变发电站', icon: '', tech: 'fusionPower', slots: 0, toggleable: true, powerPlant: true, input: { deuterium: .5 }, output: { energy: 50 }, cost: { cash: 2500000, alloy: 60000, iridium: 15000, nanotubes: 35000, e710: 250 }, costScales: { cash: 1.25, alloy: 1.25, iridium: 1.25, nanotubes: 1.25, e710: 1.25 },
    desc: '氘聚变堆芯持续供电。',
  },
  metalMiningShip: { settledByOtherSystem: true, name: '金属采矿舰', icon: '', tech: 'largeMiningShips', slots: 0, toggleable: true, input: { deuterium: .2 }, output: { stone: 4, copper: 2, iron: 2, aluminum: 1.5, titanium: 1, iridium: .25 }, cost: { cash: 2000000, alloy: 40000, iridium: 10000, nanotubes: 30000, e710: 180 }, costScales: { cash: 1.23, alloy: 1.23, iridium: 1.23, nanotubes: 1.23, e710: 1.23 },
    desc: '采集超空间矿脉。',
  },
  fuelMiningShip: { settledByOtherSystem: true, name: '燃料采矿舰', icon: '', tech: 'largeMiningShips', slots: 0, toggleable: true, input: { deuterium: .2 }, output: { coal: 1.25, oil: 1.25 }, cost: { cash: 1800000, alloy: 35000, iridium: 8000, nanotubes: 25000, e710: 160 }, costScales: { cash: 1.23, alloy: 1.23, iridium: 1.23, nanotubes: 1.23, e710: 1.23 },
    desc: '收集超空间中的碳氢沉积物。',
  },
  spaceRipper: { settledByOtherSystem: true, name: '空间撕裂者', icon: '', tech: 'dimensionPioneer', slots: 0, powerPlant: true, alwaysRunning: true, buildable: false, max: 1, output: { energy: 100 }, cost: {},
    desc: '[AMD友情赞助] 这个巨大的装置撕开了空间的边界。',
  },
  spaceRipperSegments: { settledByOtherSystem: true, name: '空间撕裂者', icon: '', tech: 'dimensionPioneer', slots: 0, segmentedRequired: 100, completesInto: 'spaceRipper', cost: { cash: 2500000, alloy: 50000, polymer: 50000, iridium: 5000, neutron: 2500, nanotubes: 100000, e710: 50, mithril: 10000 }, costScales: { cash: 1, alloy: 1, polymer: 1, iridium: 1, neutron: 1, nanotubes: 1, e710: 1, mithril: 1 },
  },
  highTechFactory: { settledByOtherSystem: true, name: '高科技工厂', icon: '', tech: 'highTechFactory', slots: 0, toggleable: true, lines: 2, jobSlots: { cementWorkshop: 2 }, input: { energy: 10, deuterium: .5 }, cost: { cash: 3000000, alloy: 60000, iridium: 15000, nanotubes: 40000, e710: 250 }, costScales: { cash: 1.25, alloy: 1.25, iridium: 1.25, nanotubes: 1.25, e710: 1.25 },
  },
  e710ResearchStation: { settledByOtherSystem: true, name: '710研究站', icon: '', tech: 'e710ResearchStation', slots: 0, toggleable: true, jobSlots: { lab: 1 }, input: { energy: 25, deuterium: 1 }, cost: { cash: 2800000, alloy: 50000, iridium: 12000, nanotubes: 40000, e710: 300 }, costScales: { cash: 1.25, alloy: 1.25, iridium: 1.25, nanotubes: 1.25, e710: 1.25 },
  },
  adamantiteMiningShip: { settledByOtherSystem: true, name: '精金采矿船', icon: '', tech: 'superMetal', slots: 0, toggleable: true, input: { energy: 5, helium3: 5, deuterium: 1 }, output: { adamantite: .25 }, cost: { cash: 3500000, alloy: 60000, iridium: 15000, nanotubes: 50000, e710: 300 }, costScales: { cash: 1.27, alloy: 1.27, iridium: 1.27, nanotubes: 1.27, e710: 1.27 },
    desc: '在黑洞附近的残余星区采集精金。',
  },
  adamantiteProcessor: { settledByOtherSystem: true, name: '精金精炼站', icon: '', tech: 'superMetal', slots: 0, toggleable: true, input: { energy: 5 }, cost: { cash: 3000000, alloy: 50000, iridium: 12000, nanotubes: 40000, adamantite: 100 }, costScales: { cash: 1.26, alloy: 1.26, iridium: 1.26, nanotubes: 1.26, adamantite: 1.26 },
  },
  grapheneFactory: { settledByOtherSystem: true, name: '石墨烯厂', icon: '', tech: 'grapheneProcessing', slots: 0, toggleable: true, input: { oil: 15, energy: 5 }, output: { graphene: 1.5 }, cost: { cash: 3000000, alloy: 50000, polymer: 60000, nanotubes: 40000, adamantite: 250 }, costScales: { cash: 1.25, alloy: 1.25, polymer: 1.25, nanotubes: 1.25, adamantite: 1.25 },
  },
  stellarForge: { settledByOtherSystem: true, name: '恒星熔炉', icon: '', tech: 'stellarForge', spaceMissionRequired: 'neutronStar', slots: 0, powerPlant: true, alwaysRunning: true, output: { energy: 25 }, cost: { cash: 5000000, alloy: 100000, nanoAlloy: 15000, mithril: 20000, e710: 500 }, costScales: { cash: 1.275, alloy: 1.275, nanoAlloy: 1.275, mithril: 1.275, e710: 1.275 },
    desc: '借助中子星的极端环境进行冶炼与锻造。',
  },
  // 危险物质库 now carries maintenance (10 电力 + 0.25 氘/s), so it is a space consumer:
  // its E-710/中子 capacity follows the funded units instead of the owned count.
  hazardousMaterialStorage: { settledByOtherSystem: true, name: '危险物质库', icon: '', tech: 'hazardousMaterialStorage', spaceMissionRequired: 'neutronStar', slots: 0, toggleable: true, input: { energy: 10, deuterium: .25 }, cost: { cash: 2000000, alloy: 50000, adamantite: 10000, nanoAlloy: 10000 }, costScales: { cash: 1.265, alloy: 1.265, adamantite: 1.265, nanoAlloy: 1.265 },
    desc: '在卡尔维拉隔离储存危险物质。',
  },
  aiDataCenter: { settledByOtherSystem: true, name: 'AI数据中心', icon: '', tech: 'aiDataCenter', spaceMissionRequired: 'neutronStar', slots: 0, toggleable: true, input: { energy: 25 },
    cost: { knowledge: 200000, mithril: 1500, nanoAlloy: 12000, graphene: 25000, adamantite: 3000 },
    costScales: { knowledge: 1.15, mithril: 1.2, nanoAlloy: 1.2, graphene: 1.2, adamantite: 1.2 },
    desc: '让CatGPT和DeepSleep来优化喵星机器的运转',
  },
  blackHoleStation: { settledByOtherSystem: true, name: '黑洞星际站', icon: '', tech: 'energyShield', spaceMissionRequired: 'blackHole', slots: 0, toggleable: true, input: { energy: 10 }, cost: { cash: 1000000, knowledge: 100000, neutron: 2500, adamantite: 500, e710: 100 }, costScales: { cash: 1.3, knowledge: 1.3, neutron: 1.3, adamantite: 1.3, e710: 1.3 },
  },
  dysonSphere: { settledByOtherSystem: true, name: '戴森球', icon: '', tech: 'dysonSphere', slots: 0, powerPlant: true, alwaysRunning: true, buildable: false, max: 1, output: { energy: 500 }, cost: {},
    desc: '环绕恒星的巨型能量收集结构。',
  },
  dysonSphereSegments: { settledByOtherSystem: true, name: '戴森球', icon: '', tech: 'dysonSphere', slots: 0, powerPlant: true, segmentEffects: true, segmentedRequired: 100, completesInto: 'dysonSphere', output: { energy: 5 }, cost: { cash: 1000000, adamantite: 5000, graphene: 2500, nanoAlloy: 5000 }, costScales: { cash: 1, adamantite: 1, graphene: 1, nanoAlloy: 1 },
  },
  dysonSphereL2: { settledByOtherSystem: true, name: '2级戴森球', icon: '', tech: 'dysonSphereII', slots: 0, powerPlant: true, alwaysRunning: true, buildable: false, max: 1, addsOnTopOf: 'dysonSphere', output: { energy: 750 }, cost: {},
    desc: '在1级戴森球之上继续收集恒星的能量。',
  },
  dysonSphereL2Segments: { settledByOtherSystem: true, name: '2级戴森球', icon: '', tech: 'dysonSphereII', slots: 0, powerPlant: true, segmentEffects: true, segmentedRequired: 100, completesInto: 'dysonSphereL2', buildingRequired: 'dysonSphere', output: { energy: 7.5 }, cost: { cash: 2000000, adamantite: 10000, graphene: 5000, nanoAlloy: 10000 }, costScales: { cash: 1, adamantite: 1, graphene: 1, nanoAlloy: 1 },
  },
  penroseSphere: { settledByOtherSystem: true, name: '彭罗斯球体', icon: '', tech: 'penroseTheory', spaceMissionRequired: 'blackHole', slots: 0, powerPlant: true, alwaysRunning: true, buildable: false, max: 1, output: { energy: 500 }, cost: {},
    desc: '环绕黑洞的巨型能量收集结构。',
  },
  penroseSphereSegments: { settledByOtherSystem: true, name: '彭罗斯球体', icon: '', tech: 'penroseTheory', spaceMissionRequired: 'blackHole', slots: 0, powerPlant: true, segmentEffects: true, segmentedRequired: 100, completesInto: 'penroseSphere', output: { energy: 5 }, cost: { cash: 2000000, neutron: 400, adamantite: 15000, graphene: 20000, nanoAlloy: 5000, mithril: 500 }, costScales: { cash: 1, neutron: 1, adamantite: 1, graphene: 1, nanoAlloy: 1, mithril: 1 },
  },
  massEjector: { settledByOtherSystem: true, name: '质量喷射器', icon: '', tech: 'massEjector', spaceMissionRequired: 'blackHole', slots: 0, toggleable: true, input: { energy: 10 }, cost: { cash: 3000000, adamantite: 20000, nanoAlloy: 8000, mithril: 3000, aerogel: 4000 }, costScales: { cash: 1.28, adamantite: 1.28, nanoAlloy: 1.28, mithril: 1.28, aerogel: 1.28 },
    desc: '向黑洞喷射物质。',
  },
  vrCenter: { settledByOtherSystem: true, name: 'VR中心', icon: '', tech: 'virtualEntertainment', slots: 0, toggleable: true, support: 1, asrielSupport: 1, cost: { cash: 500000, nanoAlloy: 10000, aerogel: 2500 }, costScales: { cash: 1.275, nanoAlloy: 1.275, aerogel: 1.275 },
  },
  civilianRouteStation: { settledByOtherSystem: true, name: '民用航线站', icon: '', tech: 'fieldConstraintTheory', slots: 0, toggleable: true, cap: 5, input: { energy: 15, food: 50 }, cost: { cash: 1200000, alloy: 20000, iridium: 6000, nanotubes: 20000, e710: 100 }, costScales: { cash: 1.21, alloy: 1.21, iridium: 1.21, nanotubes: 1.21, e710: 1.21 },
    desc: '研究场约束理论后可建。',
  },
  anchorFreightStation: { settledByOtherSystem: true, name: '锚点货运站', icon: '', tech: 'fieldConstraintTheory', slots: 0, toggleable: true, input: { energy: 15 }, cost: { cash: 1500000, alloy: 30000, iridium: 8000, nanotubes: 25000, e710: 150 }, costScales: { cash: 1.2, alloy: 1.2, iridium: 1.2, nanotubes: 1.2, e710: 1.2 },
    desc: '研究场约束理论后可建。',
  },
  constraintArray: { settledByOtherSystem: true, name: '场约束阵列', icon: '', tech: 'fieldConstraintTheory', slots: 0, toggleable: true, input: { energy: 50, e710: .25 }, cost: { cash: 1000000, alloy: 20000, iridium: 5000, nanotubes: 15000, e710: 100 }, costScales: { cash: 1.2, alloy: 1.2, iridium: 1.2, nanotubes: 1.2, e710: 1.2 },
  },
  shortRangeRelay: { settledByOtherSystem: true, name: '短程通信节点', icon: '', tech: 'fieldConstraintTheory', slots: 0, toggleable: true, input: { energy: 10 }, cost: { cash: 750000, copper: 30000, alloy: 10000, nanotubes: 10000, e710: 50 }, costScales: { cash: 1.2, copper: 1.2, alloy: 1.2, nanotubes: 1.2, e710: 1.2 },
    desc: '研究场约束理论后可建。只传递信息，不运输货物。',
  },

  asrielControlTower: {
    settledByOtherSystem: true, name: 'Asriel控制塔', icon: '', tech: 'spaceControlTower', slots: 0, toggleable: true, input: { energy: 2 },
    cost: { cash: 200000, iron: 20000, alloy: 7200 },
    costScales: { cash: 1.25, iron: 1.25, alloy: 1.25 },
  },
  alienMaterialLab: {
    name: '外星材料实验室', icon: '', tech: 'alienScienceResearch', slots: 0, toggleable: true, support: 1, asrielSupport: 1,
    cost: { cash: 200000, metal: 30000, mithril: 300, e710: 10 },
    costScales: { cash: 1.25, metal: 1.25, mithril: 1.25, e710: 1.25 },
  },
  aiSupercore: {
    settledByOtherSystem: true, name: 'AI超级核心', icon: '', tech: 'artificialIntelligenceII', slots: 0, toggleable: true, buildable: false, max: 1, input: { helium3: 25, energy: 100 },
    cost: {},
  },
  aiSupercoreSegments: {
    settledByOtherSystem: true, name: 'AI超级核心', icon: '', tech: 'artificialIntelligenceII', slots: 0, segmentedRequired: 100, completesInto: 'aiSupercore',
    cost: { cash: 100000, metal: 10000, alloy: 5000, e710: 10, nanotubes: 50000 },
    costScales: { cash: 1, metal: 1, alloy: 1, e710: 1, nanotubes: 1 },
  },
  swarmFactory: {
    name: '蜂群工厂', icon: '', tech: 'swarmFactory', slots: 0,
    cost: { cash: 75000, iron: 50000, neutron: 75, brick: 2500, mithril: 100 },
    costScales: { cash: 1.28, iron: 1.28, neutron: 1.28, brick: 1.28, mithril: 1.28 },
  },
  interstellarDock: {
    name: '星际船坞', icon: '', tech: 'escapePlan', spaceMissionRequired: 'misen', slots: 0, max: 1,
    cost: { cash: 500000, metal: 250000, helium3: 10000, nanotubes: 100000, mithril: 10000 },
    costScales: { cash: 1, metal: 1, helium3: 1, nanotubes: 1, mithril: 1 },
  },
  e710Container: {
    settledByOtherSystem: true, name: 'E-710容器', icon: '', tech: 'exoticElementResearch', slots: 0, toggleable: true, input: { helium3: .5 },
    cost: { cash: 100000, uranium: 500, titanium: 750, alloy: 500, mithril: 50 },
    costScales: { cash: 1.25, uranium: 1.25, titanium: 1.25, alloy: 1.25, mithril: 1.25 },
  },
  e710MiningShip: {
    name: 'E-710采矿船', icon: '', tech: 'exoticElementResearch', slots: 0, toggleable: true, spaceSource: true, output: { e710: .01 }, input: { helium3: 3 },
    cost: { cash: 150000, uranium: 750, titanium: 5000, mithril: 150, helium3: 1000 },
    costScales: { cash: 1.25, uranium: 1.25, titanium: 1.25, mithril: 1.25, helium3: 1.25 },
  },
  e710Warehouse: {
    settledByOtherSystem: true, name: 'E-710仓库', icon: '', tech: 'misenDiscovery', spaceMissionRequired: 'misen', slots: 0, toggleable: true, input: { energy: 7 },
    cost: { cash: 200000, metal: 25000, alloy: 10000, iridium: 2000 },
    costScales: { cash: 1.3, metal: 1.3, alloy: 1.3, iridium: 1.3 },
  },
  e710Reactor: {
    name: 'E-710反应堆', icon: '', tech: 'misenDiscovery', spaceMissionRequired: 'misen', slots: 0, toggleable: true, powerPlant: true, input: { e710: .05 }, output: { energy: 25 },
    cost: { cash: 300000, metal: 100000, neutron: 400, mithril: 1000 },
    costScales: { cash: 1.25, metal: 1.25, neutron: 1.25, mithril: 1.25 },
  },
  miningDrone: {
    name: '采矿无人机', icon: '', tech: 'talosMoonScanning', slots: 0,
    cost: { cash: 75000, metal: 5000, neutron: 150, helium3: 500, e710: 10 },
    costScales: { cash: 1.2, metal: 1.2, neutron: 1.2, helium3: 1.2, e710: 1.2 },
  },
  oilExtractor: {
    name: '石油提取器', icon: '', tech: 'talosMoonScanning', slots: 0, toggleable: true, spaceSource: true, output: { oil: 1 }, input: { energy: 1 },
    cost: { cash: 200000, polymer: 2000, helium3: 250, wroughtIron: 1500 },
    costScales: { cash: 1.2, polymer: 1.2, helium3: 1.2, wroughtIron: 1.2 },
  },
  particleAccelerator: {
    name: '粒子加速器', icon: '', tech: 'particleAccelerator', slots: 0,
    cost: { cash: 1000, copper: 250, iron: 250, metal: 25 },
    costScales: { cash: 1.33, copper: 1.33, iron: 1.33, metal: 1.33 },
  },
  swarmControlStation: {
    name: '蜂群控制站', icon: '',
    tech: 'dysonTheory', slots: 0, swarmSupport: 20,
    cost: { cash: 50000, knowledge: 70000, alloy: 10000, helium3: 1000, mithril: 200 },
    costScales: { cash: 1.275, knowledge: 1.275, alloy: 1.275, helium3: 1.275, mithril: 1.275 },
    desc: '控制与维持蜂群卫星运行。',
  },
  swarmSatellite: {
    name: '蜂群卫星', icon: '',
    tech: 'dysonTheory', slots: 0, toggleable: true, powerPlant: true, swarmSupport: -1,
    output: { energy: 0.5 }, cost: { cash: 5000, copper: 1500, iridium: 100, helium3: 25 },
    costScales: { cash: 1.15, copper: 1.15, iridium: 1.15, helium3: 1.15 },
    desc: '大量的蜂群卫星环绕太阳组成戴森云。',
  },
  atmosphericCollector: {
    name: '大气采集器', icon: '', tech: 'atmosphericMining', slots: 0, toggleable: true, spaceSource: true,
    output: { helium3: 0.75 }, input: { energy: 2 },
    cost: { cash: 200000, uranium: 300, alloy: 5000, helium3: 2000, mithril: 25 },
    costScales: { cash: 1.22, uranium: 1.22, alloy: 1.22, helium3: 1.22, mithril: 1.22 },
  },
  galacticFuelDepot: {
    name: '星系燃料库', icon: '', tech: 'atmosphericMining', slots: 0,
    cost: { cash: 150000, iridium: 3000, metalPlate: 2000, helium3: 1000 },
    costScales: { cash: 1.275, iridium: 1.275, metalPlate: 1.275, helium3: 1.275 },
  },
  talosMoonMiningStation: {
    name: '塔卫二采矿站', icon: '', tech: 'outerPlanetExploration', slots: 0, toggleable: true, spaceSource: true,
    output: { neutron: 0.05 }, input: { energy: 3, oil: 1 },
    cost: { cash: 300000, titanium: 20000, iridium: 1500, helium3: 2000, mithril: 300 },
    costScales: { cash: 1.265, titanium: 1.265, iridium: 1.265, helium3: 1.265, mithril: 1.265 },
  },
  iridiumMiningShip: {
    name: '铱采矿船', icon: '', tech: 'asteroidBeltMining', slots: 0, toggleable: true, spaceSource: true,
    output: { iridium: 0.07 }, input: { helium3: 2 },
    cost: { cash: 200000, uranium: 1500, alloy: 20000, iridium: 1500, helium3: 1000 },
    costScales: { cash: 1.2, uranium: 1.2, alloy: 1.2, iridium: 1.2, helium3: 1.2 },
  },
  ironMiningShip: {
    name: '铁采矿船', icon: '', tech: 'asteroidBeltMining', slots: 0, toggleable: true, spaceSource: true,
    output: { iron: 2 }, input: { helium3: 2 },
    cost: { cash: 200000, metal: 25000, aluminum: 25000, polymer: 5000, helium3: 1000 },
    costScales: { cash: 1.2, metal: 1.2, aluminum: 1.2, polymer: 1.2, helium3: 1.2 },
  },
  planetaryFoundry: {
    settledByOtherSystem: true, name: '行星铸造厂', icon: '',
    cost: { cash: 50000, copper: 25000, cement: 10000, wroughtIron: 3000 },
    costScales: { cash: 1.235, copper: 1.235, cement: 1.235, wroughtIron: 1.235 },
    tech: 'alienCasting', buildingRequired: 'asrielSpaceport',
    slots: 1, craftSlots: true, workerName: '猫猫工匠', support: 1, asrielSupport: 1,
  },
  spaceGarrison: {
    name: '太空驻军', icon: '',
    cost: { cash: 50000, alloy: 10000, iridium: 1000, wroughtIron: 2500 },
    costScales: { cash: 1.3, alloy: 1.3, iridium: 1.3, wroughtIron: 1.3 },
    tech: 'spaceGarrison', buildingRequired: 'asrielSpaceport', slots: 0,
    toggleable: true, input: { oil: 0.5, food: 10 }, soldierCap: 2,
  },
  geothermalPlant: {
    name: '地热发电站', icon: '',
    cost: { cash: 50000, metal: 10000, polymer: 2500 },
    costScales: { cash: 1.19, metal: 1.19, polymer: 1.19 },
    tech: 'planetaryExploration', slots: 0, powerPlant: true, toggleable: true,
    input: { helium3: 0.5 }, output: { energy: 10 },
    desc: '完成Kerberos任务后可建造。',
  },
  "moonBase": {
    settledByOtherSystem: true, "name": "月球基地",
    "icon": "",
    "cost": {
      "cash": 10000,
      "metal": 3000,
      "titanium": 2000,
      "polymer": 1000,
      "oil": 3000
    },
    "input": {
      "oil": 2,
      "energy": 4
    },
    "slots": 0,
    "tech": "moonExploration",
    "costScales": {
      "cash": 1.18,
      "metal": 1.18,
      "titanium": 1.18,
      "polymer": 1.18,
      "oil": 1.18
    }
  },
  "iridiumMine": {
    settledByOtherSystem: true, "name": "铱矿",
    "icon": "",
    "cost": {
      "cash": 10000,
      "titanium": 2000,
      "alloy": 1000
    },
    "output": {
      "iridium": 0.05
    },
    "slots": 0,
    "moonSupport": 1,
    "buildingRequired": "moonBase",
    "tech": "moonExploration",
    "costScales": {
      "cash": 1.2,
      "titanium": 1.2,
      "alloy": 1.2
    }
  },
  "helium3Mine": {
    settledByOtherSystem: true, "name": "氦-3矿",
    "icon": "",
    "cost": {
      "cash": 10000,
      "aluminum": 3000,
      "metal": 2000,
      "alloy": 2000
    },
    "output": {
      "helium3": 0.2
    },
    "slots": 0,
    "moonSupport": 1,
    "buildingRequired": "moonBase",
    "tech": "moonExploration",
    "costScales": {
      "cash": 1.18,
      "aluminum": 1.18,
      "metal": 1.18,
      "alloy": 1.18
    }
  },
  "navigationBeacon": {
    settledByOtherSystem: true, "name": "导航灯塔",
    "icon": "",
    "cost": {
      "cash": 15000,
      "copper": 2000,
      "aluminum": 2000,
      "oil": 4000,
      "iridium": 1000
    },
    "slots": 0,
    "toggleable": true,
    "input": { "energy": 2 },
    "tech": "navigationBeacon",
    "costScales": {
      "cash": 1.18,
      "copper": 1.18,
      "aluminum": 1.18,
      "oil": 1.18,
      "iridium": 1.18
    }
  },
  "orbitalFuelDepot": {
    "name": "轨道燃料库",
    "icon": "",
    "cost": {
      "cash": 10000,
      "oil": 3000,
      "metal": 1000
    },
    "slots": 0,
    "tech": "helium3Storage",
    "costScales": {
      "cash": 1.18,
      "oil": 1.18,
      "metal": 1.18
    }
  },
  "solarSatellite": {
    "name": "太阳能卫星",
    "icon": "",
    "cost": {
      "cash": 2000,
      "alloy": 2000,
      "polymer": 1000
    },
    "output": {
      "energy": 5
    },
    "powerPlant": true,
    "slots": 0,
    "tech": "solarSatellite",
    "costScales": {
      "cash": 1.18,
      "alloy": 1.18,
      "polymer": 1.18
    },
  },
  "researchSatellite": {
    "name": "科研卫星",
    "icon": "",
    "cost": {
      "cash": 4000,
      "knowledge": 25000,
      "alloy": 2000,
      "polymer": 1000
    },
    "knowledgeCap": 1500,
    "slots": 0,
    "tech": "researchSatellite",
    "costScales": {
      "cash": 1.2,
      "knowledge": 1.2,
      "alloy": 1.2,
      "polymer": 1.2
    }
  },
  "granary": {
    "name": "粮仓",
    "icon": "",
    "cost": {
      "wood": 100,
      "stone": 100,
      "cash": 100
    },
    "slots": 0,
    "tech": "granary",
    "costScales": {
      "wood": 1.25,
      "stone": 1.25,
      "cash": 1.25
    },
  },
  "biologyLab": {
    settledByOtherSystem: true, "name": "生物科学实验室",
    "icon": "",
    "cost": {
      "cash": 2000,
      "knowledge": 1000,
      "metal": 1000,
      "alloy": 500
    },
    "input": {
      "energy": 2
    },
    "slots": 0,
    "tech": "biologicalScience",
    "costScales": {
      "cash": 1.19,
      "knowledge": 1.19,
      "metal": 1.19,
      "alloy": 1.19
    },
  },
  "bank": {
    "name": "银行",
    "icon": "",
    "cost": {
      "wood": 40,
      "stone": 20,
      "cash": 25
    },
    "slots": 1,
    "workerName": "银行家",
    "workerOutput": {
      "cash": 0
    },
    "tech": "banking",
    "costScales": {
      "wood": 1.27,
      "stone": 1.27,
      "cash": 1.27
    },
  },
  "barracks": {
    "name": "军营",
    "icon": "",
    "cost": {
      "wood": 60,
      "stone": 40,
      "cash": 20
    },
    "slots": 0,
    "soldierCap": 2,
    "toggleable": true,
    "tech": "military",
    "costScales": {
      "wood": 1.25,
      "stone": 1.25,
      "cash": 1.25
    }
  },
  "trainingCamp": {
    "name": "新兵训练营",
    "icon": "",
    "trainingBoost": 5,
    "cost": {
      "wood": 150,
      "cement": 100,
      "metalPlate": 10,
      "cash": 120
    },
    "slots": 0,
    "tech": "recruitTraining",
    "costScales": {
      "wood": 1.19,
      "cement": 1.19,
      "metalPlate": 1.19,
      "cash": 1.19
    }
  },
  "hospital": {
    "name": "医院",
    "desc": "收容并治疗从临近势力抬回来的伤兵。",
    "icon": "",
    "cost": {
      "wood": 200,
      "cement": 150,
      "metalPlate": 15,
      "cash": 200
    },
    "slots": 0,
    "tech": "fieldHospital",
    "costScales": {
      "wood": 1.19,
      "cement": 1.19,
      "metalPlate": 1.19,
      "cash": 1.19
    }
  },
  "metalRefinery": { settledByOtherSystem: true,
    "name": "金属精炼厂",
    "icon": "",
    "cost": {
      "stone": 200,
      "iron": 100,
      "metal": 50,
      "cash": 100
    },
    "slots": 0,
    "tech": "metalRefining",
    "costScales": {
      "stone": 1.195,
      "iron": 1.195,
      "metal": 1.195,
      "cash": 1.195
    },
  },
  "cementWorkshop": {
    "name": "水泥工坊",
    "icon": "",
    "cost": {
      "wood": 100,
      "stone": 80,
      "cash": 35
    },
    "input": {
      "stone": 2
    },
    "workerOutput": {
      "cement": 1
    },
    "slots": 2,
    "workerName": "水泥工人",
    "tech": "cement",
    "costScales": {
      "wood": 1.215,
      "stone": 1.215,
      "cash": 1.215
    },
  },
  "fuelDepot": {
    "name": "燃料库",
    "icon": "",
    "cost": {
      "iron": 150,
      "metal": 80,
      "cash": 100
    },
    "oilCap": 1000,
    "tech": "oilStorage",
    "costScales": {
      "iron": 1.17,
      "metal": 1.17,
      "cash": 1.17
    },
  },
  "containerWarehouse": {
    "name": "集装仓库",
    "icon": "",
    "cost": {
      "cement": 200,
      "metalPlate": 15,
      "cash": 100
    },
    "containerCap": 20,
    "tech": "containerManagement",
    "costScales": {
      "cement": 1.17,
      "metalPlate": 1.17,
      "cash": 1.17
    },
    desc: '为整齐堆放的集装箱留出位置。',
  },
  "communityCenter": {
    "name": "猫猫社区",
    "icon": "",
    "cost": {
      "wood": 180,
      "stone": 120,
      "cash": 80
    },
    "tech": "community",
    "max": 1,
    "costScales": {
      "wood": 1.17,
      "stone": 1.17,
      "cash": 1.17
    },
    desc: '让每一声喵，都有邻居回应。',
  },
  "coalMine": {
    "name": "煤矿",
    "icon": "",
    "cost": {
      "wood": 70,
      "wroughtIron": 12,
      "cash": 40
    },
    "tech": "coalMining",
    "slots": 1,
    "workerName": "煤矿工人",
    "workerOutput": {
      "coal": 1
    },
    "minerBoost": true,
    "costScales": {
      "wood": 1.19,
      "wroughtIron": 1.19,
      "cash": 1.19
    },
    desc: '向地下索取远古的火焰。',
  },
  "mine": {
    "name": "采矿场",
    "icon": "",
    "cost": {
      "wood": 60,
      "stone": 40,
      "cash": 15
    },
    "tech": "mining",
    "slots": 1,
    "workerName": "矿工",
    "workerOutput": {
      "iron": 0.5,
      "copper": 0.5
    },
    "minerBoost": true,
    "costScales": {
      "wood": 1.185,
      "stone": 1.185,
      "cash": 1.185
    },
    desc: '向大地深处寻找文明的基石。',
  },
  "nestMKII": {
    "name": "猫窝MKII",
    "icon": "",
    "cost": {
      "stone": 70,
      "plank": 30,
      "brick": 15,
      "cash": 80
    },
    "tech": "nestMKII",
    "cap": 2,
    "costScales": {
      "stone": 1.17,
      "plank": 1.17,
      "brick": 1.17,
      "cash": 1.17
    },
    desc: '更宽敞的小窝，装得下更多美梦。',
  },
  "apartment": {
    "name": "住宅楼",
    "icon": "",
    "cost": {
      "cement": 85,
      "copper": 100,
      "metal": 35,
      "fur": 60,
      "cash": 140
    },
    "input": {
      "energy": 1
    },
    "tech": "housing",
    "cap": 5,
    "costScales": {
      "cement": 1.18,
      "copper": 1.18,
      "metal": 1.18,
      "fur": 1.18,
      "cash": 1.18
    },
    desc: '把温暖的家叠成一座楼。',
  },
  "warehouse": {
    "name": "仓库",
    "icon": "",
    "cost": {
      "wood": 80,
      "stone": 40,
      "cash": 20
    },
    "tech": "storage",
    "costScales": {
      "wood": 1.25,
      "stone": 1.25,
      "cash": 1.25
    },
    desc: '基本的储存设施，保护你的资源不被浪费。',
  },
  "storageHub": {
    "name": "高级存储枢纽",
    "icon": "",
    "cost": {
      "cement": 300,
      "metal": 400,
      "alloy": 180,
      "cash": 300
    },
    "tech": "automatedStorage",
    "costScales": {
      "cement": 1.25,
      "metal": 1.25,
      "alloy": 1.25,
      "cash": 1.25
    },
    desc: '更大也更聪明的仓库',
  },
  "nest": {
    "name": "猫窝",
    "icon": "",
    "cost": {
      "wood": 18,
      "stone": 9,
      "cash": 10
    },
    "tech": "survival",
    "cap": 1,
    "costScales": {
      "wood": 1.17,
      "stone": 1.17,
      "cash": 1.17
    },
    desc: '温暖，是文明的开始。',
  },
  // Same base price as 猫窝 by value only; parameters are independent.
  "catHut": {
    "name": "猫猫小屋",
    "icon": "",
    "cost": {
      "wood": 18,
      "stone": 9,
      "cash": 10
    },
    "tech": "catHut",
    "cap": 1,
    "costScales": {
      "wood": 1.35,
      "stone": 1.35,
      "cash": 1.35
    },
  },
  "forage": {
    "name": "农场",
    "icon": "",
    "cost": {
      "wood": 15,
      "stone": 5,
      "cash": 5
    },
    "workerOutput": {
      "food": 2
    },
    "workerName": "猫猫农民",
    "slots": 1,
    "tech": "survival",
    "boostResource": "food",
    "costScales": {
      "wood": 1.2,
      "stone": 1.2,
      "cash": 1.2
    },
    desc: '在田野里种下丰收的希望。',
  },
  "lumber": {
    "name": "伐木场",
    "icon": "",
    "cost": {
      "wood": 25,
      "stone": 10,
      "cash": 8
    },
    "workerOutput": {
      "wood": 3
    },
    "workerName": "伐木工人",
    "unlimited": true,
    "boostResource": "wood",
    "tech": "tools",
    "costScales": {
      "wood": 1.185,
      "stone": 1.185,
      "cash": 1.185
    },
    desc: '把森林的馈赠带回家园。',
  },
  "quarry": {
    "name": "采石场",
    "icon": "",
    "cost": {
      "stone": 30,
      "wood": 10,
      "cash": 8
    },
    "workerOutput": {
      "stone": 3
    },
    "workerName": "石工",
    "unlimited": true,
    "boostResource": "stone",
    "tech": "tools",
    "costScales": {
      "stone": 1.185,
      "wood": 1.185,
      "cash": 1.185
    },
    desc: '敲敲石头，打好文明的地基。',
  },
  "theater": {
    "name": "剧场",
    "icon": "",
    "cost": {
      "food": 80,
      "wood": 60,
      "stone": 30,
      "cash": 25
    },
    "artistSlots": 1,
    "moraleCap": 1,
    "tech": "music",
    "costScales": {
      "food": 1.265,
      "wood": 1.265,
      "stone": 1.265,
      "cash": 1.265
    },
    desc: '让歌声和故事陪伴每个夜晚。',
  },
  "broadcast": {
    settledByOtherSystem: true, "name": "广播塔",
    "icon": "",
    "cost": {
      "iron": 200,
      "copper": 150,
      "metal": 50,
      "cash": 160
    },
    "input": {
      "energy": 2
    },
    "morale": 3,
    "moraleCap": 1,
    "tech": "broadcasting",
    "costScales": {
      "iron": 1.19,
      "copper": 1.19,
      "metal": 1.19,
      "cash": 1.19
    },
    desc: '把熟悉的声音送到每个角落。',
  },
  "touristStation": {
    settledByOtherSystem: true, "name": "观光空间站",
    "icon": "", 
    "cost": {
      "metal": 600,
      "alloy": 300,
      "oil": 200,
      "cash": 600
    },
    "input": {
      "energy": 5,
      "oil": 0.5
    },
    "morale": 3,
    "moraleCap": 1,
    "cap": 2,
    "tech": "tourism",
    "costScales": {
      "metal": 1.18,
      "alloy": 1.18,
      "oil": 1.18,
      "cash": 1.18
    },
    desc: '在星海之间，眺望温暖的家园。',
  },
  "foundry": {
    "name": "铸造厂",
    "icon": "",
    "cost": {
      "wood": 100,
      "stone": 80,
      "iron": 30,
      "cash": 40
    },
    "slots": 1,
    "craftSlots": true,
    "workerName": "猫猫工匠",
    "tech": "castingWorkshop",
    "costScales": {
      "wood": 1.19,
      "stone": 1.19,
      "iron": 1.19,
      "cash": 1.19
    },
  },
  "library": {
    "name": "图书馆",
    "icon": "",
    "cost": {
      "plank": 12,
      "brick": 18,
      "fur": 20,
      "cash": 40
    },
    "knowledgeBoost": 0.05,
    "knowledgeCap": 100,
    "slots": 0,
    "tech": "knowledgeContainer",
    "costScales": {
      "plank": 1.19,
      "brick": 1.19,
      "fur": 1.19,
      "cash": 1.19
    },
    desc: '收藏文明的知识。',
  },
  "school": {
    "name": "喵喵学校",
    "icon": "",
    "cost": {
      "wood": 35,
      "stone": 20,
      "cash": 15
    },
    "workerOutput": {
      "knowledge": 2
    },
    "workerName": "猫猫教授",
    "slots": 1,
    "tech": "writing",
    "costScales": {
      "wood": 1.265,
      "stone": 1.265,
      "cash": 1.265
    },
    desc: '从喵喵叫，到写下第一首诗。',
  },
  "generator": {
    "name": "煤炭发电厂",
    "icon": "",
    "cost": {
      "cement": 120,
      "iron": 100,
      "metal": 40,
      "cash": 120
    },
    "input": {
      "coal": 0.5
    },
    "output": {
      "energy": 5
    },
    "powerPlant": true,
    "slots": 0,
    "tech": "electricity",
    "costScales": {
      "cement": 1.19,
      "iron": 1.19,
      "metal": 1.19,
      "cash": 1.19
    },
  },
  "oilGenerator": {
    "name": "石油发电站",
    "icon": "",
    "cost": {
      "cement": 200,
      "iron": 100,
      "copper": 100,
      "metal": 220,
      "cash": 250
    },
    "input": {
      "oil": 0.25
    },
    "output": {
      "energy": 8
    },
    "powerPlant": true,
    "slots": 0,
    "tech": "oilTechnology",
    "costScales": {
      "cement": 1.19,
      "iron": 1.19,
      "copper": 1.19,
      "metal": 1.19,
      "cash": 1.19
    },
  },
  "fissionGenerator": {
    "name": "裂变发电站",
    "icon": "",
    "cost": {
      "cement": 300,
      "iron": 200,
      "copper": 200,
      "metal": 400,
      "alloy": 150,
      "cash": 500
    },
    "input": {
      "uranium": 0.1
    },
    "output": {
      "energy": 12
    },
    "powerPlant": true,
    "slots": 0,
    "tech": "nuclearEnergy",
    "costScales": {
      "cement": 1.19,
      "iron": 1.19,
      "copper": 1.19,
      "metal": 1.19,
      "alloy": 1.19,
      "cash": 1.19
    },
  },
  "solarFarm": {
    "name": "光伏电站",
    "icon": "",
    "cost": {
      "cash": 10000,
      "copper": 1000,
      "iron": 1000,
      "metal": 100
    },
    "output": {
      "energy": 4
    },
    "powerPlant": true,
    "slots": 0,
    "tech": "solarPower",
    "costScales": {
      "cash": 1.21,
      "copper": 1.21,
      "iron": 1.21,
      "metal": 1.21
    },
    desc: '成排的光伏板把阳光直接变成电力。',
  },
  "smelter": {
    "name": "冶炼厂",
    "icon": "",
    "cost": {
      "stone": 140,
      "iron": 100,
      "cash": 100
    },
    "input": {
      "iron": 0.75,
      "coal": 0.25
    },
    "output": {
      "metal": 0.5
    },
    "tech": "metallurgy",
    "slots": 0,
    "costScales": {
      "stone": 1.19,
      "iron": 1.19,
      "cash": 1.19
    },
  },
  "lab": {
    "name": "实验室",
    "icon": "",
    "cost": {
      "knowledge": 1000,
      "copper": 80,
      "cement": 120,
      "metalPlate": 8,
      "cash": 120
    },
    "workerOutput": {
      "knowledge": 2
    },
    "workerName": "猫猫科学家",
    "slots": 1,
    "tech": "science",
    "costScales": {
      "knowledge": 1.18,
      "copper": 1.2,
      "cement": 1.2,
      "metalPlate": 1.2,
      "cash": 1.2
    },
    desc: '让好奇心找到答案。',
  },
  "refinery": {
    "name": "石油精炼厂",
    "icon": "",
    "cost": {
      "metal": 200,
      "copper": 80,
      "cash": 180
    },
    "input": {
      "energy": 0.5
    },
    "output": {
      "oil": 1
    },
    "tech": "oilTechnology",
    "slots": 0,
    "costScales": {
      "metal": 1.19,
      "copper": 1.19,
      "cash": 1.19
    },
    desc: '提炼石油。',
  },
  "observatory": {
    settledByOtherSystem: true, "name": "数据中心",
    "icon": "",
    "cost": {
      "cash": 3000,
      "knowledge": 1000,
      "metal": 500,
      "titanium": 250,
      "alloy": 500
    },
    "input": {
      "energy": 3
    },
    "knowledgeBoost": 0.05,
    "knowledgeCap": 2500,
    "tech": "dataCenter",
    "costScales": {
      "cash": 1.19,
      "knowledge": 1.19,
      "metal": 1.19,
      "titanium": 1.19,
      "alloy": 1.19
    },
	desc: '数据中心是互联网的核心'
  },
  "factory": {
    settledByOtherSystem: true, "name": "工厂",
    "icon": "",
    "cost": {
      "cement": 250,
      "titanium": 150,
      "metal": 300,
      "cash": 300
    },
    "input": {
      "energy": 3
    },
    "tech": "industrialization",
    "slots": 0,
    "lines": 1,
    "costScales": {
      "cement": 1.19,
      "titanium": 1.19,
      "metal": 1.19,
      "cash": 1.19
    },
    desc: '齿轮转动，流水线开始工作。',
  },
  "moonObservatory": {
    settledByOtherSystem: true, "name": "月球观测站",
    "icon": "",
    "cost": {
      "knowledge": 25000,
      "cash": 50000,
      "stone": 20000,
      "iron": 10000,
      "iridium": 1000
    },
    "tech": "moonObservatory",
    "slots": 0,
    "schoolBoost": 0.05,
    "moonSupport": 1,
    "costScales": {
      "cash": 1.18,
      "knowledge": 1.18,
      "stone": 1.18,
      "iron": 1.18,
      "iridium": 1.18
    },
  },
  "asrielSpaceport": {
    settledByOtherSystem: true, "name": "Asriel太空港",
    "icon": "",
    "cost": {
      "cash": 40000,
      "iridium": 1500,
      "mithril": 25,
      "titanium": 10000
    },
    "input": {
      "helium3": 2,
      "energy": 5,
      "food": 25
    },
    "tech": "planetaryExploration",
    "asrielSupport": 4,
    "support": 4,
    "slots": 0,
    "costScales": {
      "cash": 1.25,
      "iridium": 1.25,
      "mithril": 1.25,
      "titanium": 1.25
    },
    desc: '连接Asriel的太空港。',
  },
  "asrielResidence": {
    settledByOtherSystem: true, "name": "Asriel居住站",
    "icon": "",
    "cost": {
      "cash": 30000,
      "metal": 10000,
      "polymer": 5000
    },
    "tech": "planetaryExploration",
    "buildingRequired": "asrielSpaceport",
    "asrielSupport": 1,
    "support": 1,
    "jobs": 2,
    "slots": 2,
    "workerName": "Asriel居民",
    "workerOutput": {},
    "cap": 2,
    "costScales": {
      "cash": 1.2,
      "metal": 1.2,
      "polymer": 1.2
    },
  },
  "asrielMine": {
    settledByOtherSystem: true, "name": "Asriel矿井",
    "icon": "",
    "cost": {
      "cash": 40000,
      "iron": 30000
    },
    "tech": "planetaryExploration",
    "buildingRequired": "asrielSpaceport",
    "asrielSupport": 1,
    "support": 1,
    "slots": 0,
    "asrielSource": true,
    "output": {
      "copper": 0.25,
      "titanium": 0.05
    },
    "costScales": {
      "cash": 1.25,
      "iron": 1.25
    },
  },
  "ecologicalDome": {
    settledByOtherSystem: true, "name": "生态穹顶",
    "icon": "",
    "cost": {
      "cash": 40000,
      "wood": 50000,
      "brick": 1000
    },
    "tech": "planetaryExploration",
    "buildingRequired": "asrielSpaceport",
    "asrielSupport": 1,
    "support": 1,
    "slots": 0,
    "asrielSource": true,
    "foodCap": 2500,
    "costScales": {
      "cash": 1.2,
      "wood": 1.2,
      "brick": 1.2
    },
  },
  "hangar": {
    settledByOtherSystem: true, "name": "格纳库",
    "icon": "",
    "cost": {
      "cash": 25000,
      "iron": 10000,
      "brick": 2000,
      "metalPlate": 1000
    },
    "tech": "planetaryExploration",
    "buildingRequired": "asrielSpaceport",
    "slots": 0,
    "containerCap": 30,
    "spaceContainerCap": 4000,
    "storageContainers": 30,
    "costScales": {
      "cash": 1.2,
      "iron": 1.2,
      "brick": 1.2,
      "metalPlate": 1.2
    },
  },
  "spaceFactory": {
    settledByOtherSystem: true, "name": "太空工厂",
    "icon": "",
    "cost": {
      "cash": 50000,
      "brick": 5000,
      "coal": 5000,
      "mithril": 5
    },
    "input": {
      "helium3": 2,
      "energy": 3
    },
    "tech": "spaceIndustrialization",
    "buildingRequired": "asrielSpaceport",
    "slots": 0,
    "lines": 1,
    "spaceSource": true,
    "costScales": {
      "cash": 1.2035,
      "brick": 1.2035,
      "coal": 1.2035,
      "mithril": 1.2035
    },
  },
  "starRingStation": {
    settledByOtherSystem: true, "name": "星环空间站",
    "icon": "",
    "cost": {
      "cash": 300000,
      "stone": 200000,
      "aluminum": 50000,
      "mithril": 250
    },
    "tech": "starRingStation",
    "buildingRequired": "asrielSpaceport",
    "slots": 0,
    "alwaysRunning": true,
    "costScales": {
      "cash": 1.24,
      "stone": 1.24,
      "aluminum": 1.24,
      "mithril": 1.24
    },
  },
  "spaceWaystation": {
    settledByOtherSystem: true, "name": "电磁发射器",
    "icon": "",
    "cost": {
      "cash": 50000,
      "metal": 20000,
      "alloy": 10000,
      "iridium": 1000
    },
    "tech": "spaceTransitStation",
    "buildingRequired": "asrielSpaceport",
    "slots": 0,
    "toggleable": true,
    "input": { "energy": 5 },
    "costScales": {
      "cash": 1.25,
      "metal": 1.25,
      "alloy": 1.25,
      "iridium": 1.25
    },
  },
  "catCafe": {
    "name": "芯片工厂",
    "icon": "",
    "desc": "卖芯片可比卖牙膏赚钱多了",
    "moraleCap": 1,
    "cost": {
      "cash": 50000,
      "fur": 25000,
      "wood": 20000,
      "brick": 5000
    },
    "input": {
      "energy": 3
    },
    "output": {
      "cash": 5
    },
    "slots": 1,
    "artistSlots": 1,
    "workerName": "猫猫艺术家",
    "tech": "catCafe",
    "costScales": {
      "cash": 1.25,
      "fur": 1.25,
      "wood": 1.25,
      "brick": 1.25
    },
  },
  "touristCenter": {
    "name": "游客中心",
    "icon": "",
    "cost": {
      "cash": 50000,
      "fur": 10000,
      "plank": 10000,
      "stone": 20000
    },
    "input": {
      "food": 50
    },
    "output": {
      "cash": 0
    },
    "slots": 0,
    "tech": "tourismIndustry",
    "costScales": {
      "cash": 1.18,
      "fur": 1.18,
      "plank": 1.18,
      "stone": 1.18
    },
  }
};

// Compatibility exports for legacy callers and registry-parity tests. Derive from
// BUILDINGS so every building is covered without duplicating balance data; omit
// absent cash costs/scales rather than inventing a fallback. Keep Partial types
// because those fields are optional in BuildingDefinition.
export const BUILDING_CASH_COSTS: Partial<Record<BuildingId, number>> = Object.fromEntries(
  Object.entries(BUILDINGS).flatMap(([id, building]) =>
    building.cost.cash === undefined ? [] : [[id, building.cost.cash]]),
);

export const BUILDING_COST_SCALES: Partial<Record<BuildingId, ResourceRecipe>> = Object.fromEntries(
  Object.entries(BUILDINGS).flatMap(([id, building]) =>
    building.costScales === undefined ? [] : [[id, { ...building.costScales }]]),
);

export const BUILDING_GROUPS: { id: string; name: string; buildings: BuildingId[] }[] = [
  {
    "id": "housing",
    "name": "住宅区",
    "buildings": [
      "nest",
      "catHut",
      "nestMKII",
      "apartment"
    ]
  },
  {
    "id": "outskirts",
    "name": "郊外",
    "buildings": [
      "forage",
      "lumber",
      "quarry",
      "mine",
      "coalMine"
    ]
  },
  {
    "id": "commerce",
    "name": "商业区",
    "buildings": [
      "bank",
      "communityCenter",
      "theater",
      "broadcast",
      "catCafe",
      "touristCenter"
    ]
  },
  {
    "id": "science",
    "name": "科学部门",
    "buildings": [
      "school",
      "library",
      "lab",
      "observatory",
      "biologyLab"
    ]
  },
  {
    "id": "military",
    "name": "军事设施",
    "buildings": [
      "barracks",
      "trainingCamp",
      "hospital"
    ]
  },
  {
    "id": "industry",
    "name": "工业区",
    "buildings": [
      "metalRefinery",
      "cementWorkshop",
      "smelter",
      "foundry",
      "refinery",
      "factory"
    ]
  },
  {
    "id": "storage",
    "name": "仓储区",
    "buildings": [
      "granary",
      "warehouse",
      "storageHub",
      "containerWarehouse",
      "fuelDepot"
    ]
  },
  {
    "id": "energy",
    "name": "能源设施",
    "buildings": [
      "generator",
      "solarFarm",
      "oilGenerator",
      "fissionGenerator"
    ]
  },
  {
    "id": "publicUtilities",
    "name": "公共事业部门",
    "buildings": ["particleAccelerator", "spaceWaystation"]
  }
];

export const BUILDING_FLAVOR_IDS = new Set<BuildingId>(["containerWarehouse","communityCenter","coalMine","mine","nestMKII","apartment","nest","forage","lumber","quarry","theater","touristStation","foundry","school","smelter","lab"]);
