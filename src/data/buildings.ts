import type { BuildingId, BuildingDefinition } from '../types/buildings';
import type { ResourceRecipe } from '../types/economy';

export const BUILDINGS: Record<BuildingId, BuildingDefinition> = {
  signalRepeater: { name: '信号中继', icon: '⌁', tech: 'accessPointBeacon', slots: 0, toggleable: true, input: { energy: 10 }, desc: '为接入点附近提供通信保障，每座运行中的信号中继使每座运行场约束阵列的稳定度增加0.25，电力-10/s。', cost: { cash: 1200000, alloy: 20000, copper: 30000, nanotubes: 15000, e710: 80 }, costScales: { cash: 1.21, alloy: 1.21, copper: 1.21, nanotubes: 1.21, e710: 1.21 } },
  hydrogenPowerPlant: { name: '氢气发电站', icon: '⚡', tech: 'hydrogenRecovery', slots: 0, toggleable: true, powerPlant: true, input: { water: 2 }, output: { energy: 35 }, desc: '利用本地资源发电，还能补给基地用电，水-2/s，电力+35/s，喷发小行星群支持+1。只在完整支付水消耗时运行，不占用小行星群支持。', cost: { cash: 1800000, alloy: 35000, iridium: 8000, nanotubes: 20000, e710: 120 }, costScales: { cash: 1.21, alloy: 1.21, iridium: 1.21, nanotubes: 1.21, e710: 1.21 } },
  hyperspaceSpaceport: { name: '超空间太空港', icon: '⌖', tech: 'dimensionBeaconDeployment', slots: 0, toggleable: true, input: { energy: 30, helium3: 5 }, desc: '在异常空间里建立第一个永久性定居点，空间异常·接入点区域稳定度+4，喷发小行星群区域支持+2，氦-3容量+16k，电力-30/s、氦-3-5/s。完整支付维护时生效。', cost: { cash: 2000000, alloy: 40000, iridium: 10000, nanotubes: 30000, e710: 200 }, costScales: { cash: 1.21, alloy: 1.21, iridium: 1.21, nanotubes: 1.21, e710: 1.21 } },
  iceMiningShip: { name: '采冰船', icon: '❄', tech: 'dimensionBeaconDeployment', slots: 0, toggleable: true, input: { energy: 5, helium3: 5 }, output: { water: 1 }, desc: '采集冰喷发物获取水，水产量+1/s，水容量+100，电力-5/s、氦-3-5/s，喷发小行星群支持-1。获得供电和支持时生效。', cost: { cash: 800000, alloy: 15000, iridium: 3000, nanotubes: 8000, e710: 50 }, costScales: { cash: 1.19, alloy: 1.19, iridium: 1.19, nanotubes: 1.19, e710: 1.19 } },
  asteroidBase: { name: '小行星基地', icon: '◉', tech: 'dimensionBeaconDeployment', buildingRequired: 'iceMiningShip', slots: 0, toggleable: true, input: { energy: 10 }, desc: '在异常小行星群建立小型基地，水容量+8k、氘容量+2k（解锁氘后），锚点货运站的资源容量+5%，电力-10/s，喷发小行星群支持-1。获得供电和支持时生效，容量加成按运行基地数量累加。', cost: { cash: 1500000, alloy: 30000, iridium: 8000, nanotubes: 20000, e710: 100 }, costScales: { cash: 1.21, alloy: 1.21, iridium: 1.21, nanotubes: 1.21, e710: 1.21 } },
  comprehensiveMiningFacility: { name: '综合采矿设施', icon: '⛏️', tech: 'hyperspaceMiningSurvey', slots: 0, toggleable: true, desc: '采掘小天体获取矿物，E-710 +0.05/s，中子+0.25/s，铀+0.1/s，电力-20/s，氦-3-10/s。', input: { energy: 20, helium3: 10 }, output: { e710: .05, neutron: .25, uranium: .1 }, cost: { cash: 3000000, alloy: 50000, iridium: 12000, nanotubes: 40000, e710: 300 }, costScales: { cash: 1.23, alloy: 1.23, iridium: 1.23, nanotubes: 1.23, e710: 1.23 } },
  gasCloudMiningShip: { name: '气体云采矿舰', icon: '☁️', tech: 'gasCloudAccretion', slots: 0, toggleable: true, desc: '游荡在气体分子云中收集资源，氦-3 +2/s，氘 +0.25/s，电力-5/s。', input: { energy: 5 }, output: { helium3: 2, deuterium: .25 }, cost: { cash: 1500000, alloy: 25000, iridium: 6000, nanotubes: 20000, e710: 150 }, costScales: { cash: 1.23, alloy: 1.23, iridium: 1.23, nanotubes: 1.23, e710: 1.23 } },
  highTechFarmPlatform: { name: '高科技农场平台', icon: '🌾', tech: 'highTechFarmPlatform', slots: 0, toggleable: true, desc: '在超空间中运转的封闭农场，猫粮+10/s，木材+8/s，水+2/s，氘-0.2/s，电力-10/s。', input: { energy: 10, deuterium: .2 }, output: { food: 10, wood: 8, water: 2 }, cost: { cash: 2000000, alloy: 30000, nanotubes: 25000, e710: 200 }, costScales: { cash: 1.23, alloy: 1.23, nanotubes: 1.23, e710: 1.23 } },
  fusionPowerPlant: { name: '聚变发电站', icon: '⚛️', tech: 'fusionPower', slots: 0, toggleable: true, powerPlant: true, desc: '氘聚变堆芯持续供电，电力+50/s，氘-0.5/s。', input: { deuterium: .5 }, output: { energy: 50 }, cost: { cash: 2500000, alloy: 60000, iridium: 15000, nanotubes: 35000, e710: 250 }, costScales: { cash: 1.25, alloy: 1.25, iridium: 1.25, nanotubes: 1.25, e710: 1.25 } },
  metalMiningShip: { name: '金属采矿舰', icon: '🚀', tech: 'largeMiningShips', slots: 0, toggleable: true, desc: '采集超空间矿脉，石头+8/s，铜+4/s，铁+4/s，铝+3/s，钛+2/s，铱+0.5/s，氘-0.2/s。', input: { deuterium: .2 }, output: { stone: 8, copper: 4, iron: 4, aluminum: 3, titanium: 2, iridium: .5 }, cost: { cash: 2000000, alloy: 40000, iridium: 10000, nanotubes: 30000, e710: 180 }, costScales: { cash: 1.23, alloy: 1.23, iridium: 1.23, nanotubes: 1.23, e710: 1.23 } },
  fuelMiningShip: { name: '燃料采矿舰', icon: '🛢️', tech: 'largeMiningShips', slots: 0, toggleable: true, desc: '收集超空间中的碳氢沉积物，煤+2.5/s，石油+2.5/s，氘-0.2/s。', input: { deuterium: .2 }, output: { coal: 2.5, oil: 2.5 }, cost: { cash: 1800000, alloy: 35000, iridium: 8000, nanotubes: 25000, e710: 160 }, costScales: { cash: 1.23, alloy: 1.23, iridium: 1.23, nanotubes: 1.23, e710: 1.23 } },
  spaceRipper: { name: '空间撕裂者', icon: '🌀', tech: 'dimensionPioneer', segmentedRequired: 100, slots: 0, powerPlant: true, alwaysRunning: true, output: { energy: 100 }, cost: { cash: 2500000, alloy: 50000, polymer: 50000, iridium: 5000, neutron: 2500, nanotubes: 100000, e710: 50, mithril: 10000 }, costScales: { cash: 1, alloy: 1, polymer: 1, iridium: 1, neutron: 1, nanotubes: 1, e710: 1, mithril: 1 }, desc: '[AMD友情赞助] 这个巨大的装置撕开了空间的边界。' },
  highTechFactory: { name: '高科技工厂', icon: '🏭', tech: 'highTechFactory', slots: 0, toggleable: true, lines: 2, jobSlots: { cementWorkshop: 2 }, input: { energy: 10, deuterium: .5 }, desc: '工厂生产线+2，水泥工人上限+2, 电力-10/s，氘-0.5/s', cost: { cash: 3000000, alloy: 60000, iridium: 15000, nanotubes: 40000, e710: 250 }, costScales: { cash: 1.25, alloy: 1.25, iridium: 1.25, nanotubes: 1.25, e710: 1.25 } },
  e710ResearchStation: { name: '710研究站', icon: '🔭', tech: 'e710ResearchStation', slots: 0, toggleable: true, jobSlots: { lab: 1 }, input: { energy: 25, deuterium: 1 }, desc: '猫猫科学家上限+1. 知识容量+50k， 电力-25/s，氘-1/s', cost: { cash: 2800000, alloy: 50000, iridium: 12000, nanotubes: 40000, e710: 300 }, costScales: { cash: 1.25, alloy: 1.25, iridium: 1.25, nanotubes: 1.25, e710: 1.25 } },
  adamantiteMiningShip: { name: '精金采矿船', icon: '🚀', tech: 'superMetal', slots: 0, toggleable: true, input: { energy: 5, helium3: 5, deuterium: 1 }, output: { adamantite: .1 }, desc: '在黑洞附近的残余星区采集精金，精金+0.1/s，电力-5/s，氦-3 -5/s，氘-1/s。', cost: { cash: 3500000, alloy: 60000, iridium: 15000, nanotubes: 50000, e710: 300 }, costScales: { cash: 1.27, alloy: 1.27, iridium: 1.27, nanotubes: 1.27, e710: 1.27 } },
  adamantiteProcessor: { name: '精金加工站', icon: '⚙️', tech: 'superMetal', slots: 0, toggleable: true, input: { energy: 10 }, desc: '供电运行时，精金采矿船的产量+10%，电力-10/s。', cost: { cash: 3000000, alloy: 50000, iridium: 12000, nanotubes: 40000, adamantite: 100 }, costScales: { cash: 1.26, alloy: 1.26, iridium: 1.26, nanotubes: 1.26, adamantite: 1.26 } },
  grapheneFactory: { name: '石墨烯厂', icon: '🏭', tech: 'grapheneProcessing', slots: 0, toggleable: true, input: { oil: 15, energy: 5 }, output: { graphene: 2 }, desc: '石墨烯+2/s，石油-15/s，电力-5/s。', cost: { cash: 3000000, alloy: 50000, polymer: 60000, nanotubes: 40000, adamantite: 250 }, costScales: { cash: 1.25, alloy: 1.25, polymer: 1.25, nanotubes: 1.25, adamantite: 1.25 } },
  stellarForge: { name: '恒星熔炉', icon: '🔥', tech: 'stellarForge', spaceMissionRequired: 'neutronStar', slots: 0, powerPlant: true, alwaysRunning: true, output: { energy: 25 }, desc: '借助中子星的极端环境进行冶炼与锻造，冶炼厂工位+2，工匠上限+2，锻造物产量加成+10%，电力+25/s。', cost: { cash: 5000000, alloy: 100000, nanoAlloy: 15000, mithril: 20000, e710: 500 }, costScales: { cash: 1.275, alloy: 1.275, nanoAlloy: 1.275, mithril: 1.275, e710: 1.275 } },
  blackHoleStation: { name: '黑洞星际站', icon: '🕳️', tech: 'energyShield', spaceMissionRequired: 'blackHole', slots: 0, toggleable: true, input: { energy: 10 }, desc: '空间撕裂者的知识容量效果+1%，电力-10/s。', cost: { cash: 1000000, knowledge: 100000, neutron: 2500, adamantite: 500, e710: 100 }, costScales: { cash: 1.3, knowledge: 1.3, neutron: 1.3, adamantite: 1.3, e710: 1.3 } },
  penroseSphere: { name: '彭罗斯球体', icon: '🔮', tech: 'penroseTheory', spaceMissionRequired: 'blackHole', segmentedRequired: 100, segmentEffects: true, slots: 0, powerPlant: true, alwaysRunning: true, output: { energy: 5 }, desc: '环绕黑洞的巨型能量收集结构，每建成一段电力+5/s。', cost: { cash: 2000000, neutron: 400, adamantite: 15000, graphene: 20000, nanoAlloy: 5000, mithril: 500 }, costScales: { cash: 1, neutron: 1, adamantite: 1, graphene: 1, nanoAlloy: 1, mithril: 1 } },
  massEjector: { name: '质量喷射器', icon: '🌀', tech: 'massEjector', spaceMissionRequired: 'blackHole', slots: 0, toggleable: true, input: { energy: 10 }, desc: '向黑洞喷射物质。喷射容量+1000/s，电力-10/s。', cost: { cash: 3000000, adamantite: 20000, nanoAlloy: 8000, mithril: 3000, aerogel: 4000 }, costScales: { cash: 1.28, adamantite: 1.28, nanoAlloy: 1.28, mithril: 1.28, aerogel: 1.28 } },
  vrCenter: { name: 'VR中心', icon: '🥽', tech: 'virtualEntertainment', slots: 0, toggleable: true, support: 1, asrielSupport: 1, desc: '幸福度+2.5%，Asriel支持-1。', cost: { cash: 500000, nanoAlloy: 10000, aerogel: 2500 }, costScales: { cash: 1.275, nanoAlloy: 1.275, aerogel: 1.275 } },
  civilianRouteStation: { name: '民用航线站', icon: '⌂', tech: 'fieldConstraintTheory', slots: 0, toggleable: true, cap: 5, desc: '研究场约束理论后可建。每座运行占用2稳定度，人口容量+5，资金与猫粮基础储量各+32000；电力-15/s、食物-50/s。缺少维护资源时安全停机。', input: { energy: 15, food: 50 }, cost: { cash: 1200000, alloy: 20000, iridium: 6000, nanotubes: 20000, e710: 100 }, costScales: { cash: 1.21, alloy: 1.21, iridium: 1.21, nanotubes: 1.21, e710: 1.21 } },
  anchorFreightStation: { name: '锚点货运站', icon: '▣', tech: 'fieldConstraintTheory', slots: 0, toggleable: true, desc: '研究场约束理论后可建。每座运行占用2稳定度、电力-15/s，为木头至铱范围内的有限普通资源增加32000基础储量，不再增加采矿产出。', input: { energy: 15 }, cost: { cash: 1500000, alloy: 30000, iridium: 8000, nanotubes: 25000, e710: 150 }, costScales: { cash: 1.2, alloy: 1.2, iridium: 1.2, nanotubes: 1.2, e710: 1.2 } },
  constraintArray: { name: '场约束阵列', icon: '◈', tech: 'fieldConstraintTheory', slots: 0, toggleable: true, desc: '稳定度+2；电力-50/s、E-710 -0.25/s。缺少维护资源时安全停机，不损毁建筑。', input: { energy: 50, e710: .25 }, cost: { cash: 1000000, alloy: 20000, iridium: 5000, nanotubes: 15000, e710: 100 }, costScales: { cash: 1.2, alloy: 1.2, iridium: 1.2, nanotubes: 1.2, e710: 1.2 } },
  shortRangeRelay: { name: '短程通信节点', icon: '📡', tech: 'fieldConstraintTheory', slots: 0, toggleable: true, desc: '研究场约束理论后可建。运行占用2稳定度，额外提供2 Asriel支持；电力-10/s。只传递信息，不运输货物。', input: { energy: 10 }, cost: { cash: 750000, copper: 30000, alloy: 10000, nanotubes: 10000, e710: 50 }, costScales: { cash: 1.2, copper: 1.2, alloy: 1.2, nanotubes: 1.2, e710: 1.2 } },

  asrielControlTower: {
    name: 'Asriel控制塔', icon: '', tech: 'spaceControlTower', slots: 0, toggleable: true,
    desc: '电力-2/s，火星支持+1', input: { energy: 2 },
    cost: { cash: 200000, iron: 20000, alloy: 7200 },
    costScales: { cash: 1.25, iron: 1.25, alloy: 1.25 },
  },
  alienMaterialLab: {
    name: '外星材料实验室', icon: '🔬', tech: 'alienScienceResearch', slots: 0, toggleable: true,
    desc: '每Asriel居民使知识上限+250，E-710容量+25，Asriel支持-1。', support: 1, asrielSupport: 1,
    cost: { cash: 200000, metal: 30000, mithril: 300, e710: 10 },
    costScales: { cash: 1.25, metal: 1.25, mithril: 1.25, e710: 1.25 },
  },
  aiSupercore: {
    name: 'AI超级核心', icon: '🧠', tech: 'artificialIntelligenceII', slots: 0, toggleable: true, segmentedRequired: 100,
    desc: '需要100次分段建造，完整核心运行时电力-100/s，氦-3 -25/s。', input: { helium3: 25, energy: 100 },
    cost: { cash: 100000, metal: 10000, alloy: 5000, e710: 10, nanotubes: 50000 },
    costScales: { cash: 1, metal: 1, alloy: 1, e710: 1, nanotubes: 1 },
  },
  swarmFactory: {
    name: '蜂群工厂', icon: '🏭', tech: 'swarmFactory', slots: 0,
    desc: '每个蜂群工厂使得蜂群卫星价格-10%。',
    cost: { cash: 75000, iron: 50000, neutron: 75, brick: 2500, mithril: 100 },
    costScales: { cash: 1.28, iron: 1.28, neutron: 1.28, brick: 1.28, mithril: 1.28 },
  },
  interstellarDock: {
    name: '星际船坞', icon: '🚀', tech: 'escapePlan', spaceMissionRequired: 'misen', slots: 0, max: 1,
    cost: { cash: 500000, metal: 250000, helium3: 10000, nanotubes: 100000, mithril: 10000 },
    costScales: { cash: 1, metal: 1, helium3: 1, nanotubes: 1, mithril: 1 },
  },
  e710Container: {
    name: 'E-710容器', icon: '💠', tech: 'exoticElementResearch', slots: 0, toggleable: true,
    desc: '运行时E-710容量+50，每秒消耗0.5氦-3。', input: { helium3: .5 },
    cost: { cash: 100000, uranium: 500, titanium: 750, alloy: 500, mithril: 50 },
    costScales: { cash: 1.25, uranium: 1.25, titanium: 1.25, alloy: 1.25, mithril: 1.25 },
  },
  e710MiningShip: {
    name: 'E-710采矿船', icon: '🚀', tech: 'exoticElementResearch', slots: 0, toggleable: true, spaceSource: true,
    desc: 'E-710+0.01/s，氦-3-3/s。', output: { e710: .01 }, input: { helium3: 3 },
    cost: { cash: 150000, uranium: 750, titanium: 5000, mithril: 150, helium3: 1000 },
    costScales: { cash: 1.25, uranium: 1.25, titanium: 1.25, mithril: 1.25, helium3: 1.25 },
  },
  e710Warehouse: {
    name: 'E-710仓库', icon: '📦', tech: 'misenDiscovery', spaceMissionRequired: 'misen', slots: 0, toggleable: true,
    desc: '供电运行时E-710容量+200，每秒消耗7电力。', input: { energy: 7 },
    cost: { cash: 200000, metal: 25000, alloy: 10000, iridium: 2000 },
    costScales: { cash: 1.3, metal: 1.3, alloy: 1.3, iridium: 1.3 },
  },
  e710Reactor: {
    name: 'E-710反应堆', icon: '⚡', tech: 'misenDiscovery', spaceMissionRequired: 'misen', slots: 0, toggleable: true, powerPlant: true,
    desc: '每秒消耗0.05 E-710，固定产出25电力。', input: { e710: .05 }, output: { energy: 25 },
    cost: { cash: 300000, metal: 100000, neutron: 400, mithril: 1000 },
    costScales: { cash: 1.25, metal: 1.25, neutron: 1.25, mithril: 1.25 },
  },
  miningDrone: {
    name: '采矿无人机', icon: '🤖', tech: 'talosMoonScanning', slots: 0,
    desc: '每台使塔卫二采矿站基础中子产量+5%，加成相加。',
    cost: { cash: 75000, metal: 5000, neutron: 150, helium3: 500, e710: 10 },
    costScales: { cash: 1.2, metal: 1.2, neutron: 1.2, helium3: 1.2, e710: 1.2 },
  },
  oilExtractor: {
    name: '石油提取器', icon: '🛢️', tech: 'talosMoonScanning', slots: 0, toggleable: true, spaceSource: true,
    desc: '石油+1/s，电力-1/s。', output: { oil: 1 }, input: { energy: 1 },
    cost: { cash: 200000, polymer: 2000, helium3: 250, wroughtIron: 1500 },
    costScales: { cash: 1.2, polymer: 1.2, helium3: 1.2, wroughtIron: 1.2 },
  },
  particleAccelerator: {
    name: '粒子加速器', icon: '⚛️', tech: 'particleAccelerator', slots: 0,
    desc: '粒子产量加成+10%',
    cost: { cash: 1000, copper: 250, iron: 250, metal: 25 },
    costScales: { cash: 1.33, copper: 1.33, iron: 1.33, metal: 1.33 },
  },
  swarmControlStation: {
    name: '蜂群控制站', icon: '📡', desc: '控制与维持蜂群卫星运行，蜂群卫星支持+20',
    tech: 'dysonTheory', slots: 0, swarmSupport: 20,
    cost: { cash: 50000, knowledge: 70000, alloy: 10000, helium3: 1000, mithril: 200 },
    costScales: { cash: 1.275, knowledge: 1.275, alloy: 1.275, helium3: 1.275, mithril: 1.275 },
  },
  swarmSatellite: {
    name: '蜂群卫星', icon: '🛰️', desc: '大量的蜂群卫星环绕太阳组成戴森云，电力+0.5/s，蜂群卫星支持-1',
    tech: 'dysonTheory', slots: 0, toggleable: true, powerPlant: true, swarmSupport: -1,
    output: { energy: 0.5 }, cost: { cash: 5000, copper: 1500, iridium: 100, helium3: 25 },
    costScales: { cash: 1.15, copper: 1.15, iridium: 1.15, helium3: 1.15 },
  },
  atmosphericCollector: {
    name: '大气采集器', icon: '🌫️', desc: '氦-3+0.75/s，电力-2/s', tech: 'atmosphericMining', slots: 0, toggleable: true, spaceSource: true,
    output: { helium3: 0.75 }, input: { energy: 2 },
    cost: { cash: 200000, uranium: 300, alloy: 5000, helium3: 2000, mithril: 25 },
    costScales: { cash: 1.22, uranium: 1.22, alloy: 1.22, helium3: 1.22, mithril: 1.22 },
  },
  galacticFuelDepot: {
    name: '星系燃料库', icon: '🛢️', desc: '石油容量+4000，氦-3容量+2500，铀容量+1500', tech: 'atmosphericMining', slots: 0,
    cost: { cash: 150000, iridium: 3000, metalPlate: 2000, helium3: 1000 },
    costScales: { cash: 1.275, iridium: 1.275, metalPlate: 1.275, helium3: 1.275 },
  },
  talosMoonMiningStation: {
    name: '塔卫二采矿站', icon: '⚛️', desc: '中子+0.05/s，中子容量+100，电力-3/s，石油-1/s', tech: 'outerPlanetExploration', slots: 0, toggleable: true, spaceSource: true,
    output: { neutron: 0.05 }, input: { energy: 3, oil: 1 },
    cost: { cash: 300000, titanium: 20000, iridium: 1500, helium3: 2000, mithril: 300 },
    costScales: { cash: 1.265, titanium: 1.265, iridium: 1.265, helium3: 1.265, mithril: 1.265 },
  },
  iridiumMiningShip: {
    name: '铱采矿船', icon: '🚀', desc: '铱+0.07/s，氦-3-2/s', tech: 'asteroidBeltMining', slots: 0, toggleable: true, spaceSource: true,
    output: { iridium: 0.07 }, input: { helium3: 2 },
    cost: { cash: 200000, uranium: 1500, alloy: 20000, iridium: 1500, helium3: 1000 },
    costScales: { cash: 1.2, uranium: 1.2, alloy: 1.2, iridium: 1.2, helium3: 1.2 },
  },
  ironMiningShip: {
    name: '铁采矿船', icon: '🚀', desc: '铁+2/s，氦-3-2/s', tech: 'asteroidBeltMining', slots: 0, toggleable: true, spaceSource: true,
    output: { iron: 2 }, input: { helium3: 2 },
    cost: { cash: 200000, metal: 25000, aluminum: 25000, polymer: 5000, helium3: 1000 },
    costScales: { cash: 1.2, metal: 1.2, aluminum: 1.2, polymer: 1.2, helium3: 1.2 },
  },
  planetaryFoundry: {
    name: '行星铸造厂', icon: '⚒️',
    desc: '每座受Asriel支持的行星铸造厂提供1个共享猫猫工匠岗位，消耗1点Asriel支持。',
    cost: { cash: 50000, copper: 25000, cement: 10000, wroughtIron: 3000 },
    costScales: { cash: 1.235, copper: 1.235, cement: 1.235, wroughtIron: 1.235 },
    tech: 'alienCasting', buildingRequired: 'asrielSpaceport',
    slots: 1, craftSlots: true, workerName: '猫猫工匠', support: 1, asrielSupport: 1,
  },
  spaceGarrison: {
    name: '太空驻军', icon: '🪖',
    desc: '运行时每座提供2士兵容量，每秒消耗0.5石油和10猫粮，不消耗Asriel支持。',
    cost: { cash: 50000, alloy: 10000, iridium: 1000, wroughtIron: 2500 },
    costScales: { cash: 1.3, alloy: 1.3, iridium: 1.3, wroughtIron: 1.3 },
    tech: 'spaceGarrison', buildingRequired: 'asrielSpaceport', slots: 0,
    toggleable: true, input: { oil: 0.5, food: 10 }, soldierCap: 2,
  },
  geothermalPlant: {
    name: '地热发电站', icon: '⚡',
    desc: '完成Kerberos任务后可建造；每秒消耗0.5氦-3，产出10电力。',
    cost: { cash: 50000, metal: 10000, polymer: 2500 },
    costScales: { cash: 1.2, metal: 1.2, polymer: 1.2 },
    tech: 'planetaryExploration', slots: 0, powerPlant: true, toggleable: true,
    input: { helium3: 0.5 }, output: { energy: 10 },
  },
  "moonBase": {
    "name": "月球基地",
    "icon": "🌙",
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
    "name": "铱矿",
    "icon": "⛏️",
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
    "name": "氦-3矿",
    "icon": "⚗️",
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
    "name": "导航灯塔",
    "icon": "📡",
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
    "icon": "🛢️",
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
    "icon": "☀️",
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
    }
  },
  "researchSatellite": {
    "name": "科研卫星",
    "icon": "🛰️",
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
    "icon": "🌾",
    "desc": "每座增加500猫粮储量，不提供工作岗位。木材、石头与现金成本各按1.25倍递增。",
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
    }
  },
  "biologyLab": {
    "name": "生物科学实验室",
    "icon": "🧬",
    "desc": "每座正常供电时提供3000知识容量，消耗2电力/s，无岗位。关停或供电不足的实验室不提供容量，超额知识会被截断。",
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
    }
  },
  "bank": {
    "name": "银行",
    "icon": "🏦",
    "desc": "每座基础增加1000现金储量；金库扩容与钢制保险箱各使基础容量+750（两项相加后基础2500）。提供1个银行家岗位，每位银行家使猫猫税收增加5%（每个证券交易所+2%），加成相加；银行不直接生产现金。",
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
    }
  },
  "barracks": {
    "name": "军营",
    "icon": "🪖",
    "cost": {
      "wood": 60,
      "stone": 40,
      "cash": 20
    },
    "slots": 0,
    "soldierCap": 2,
    "tech": "military",
    "costScales": {
      "wood": 1.25,
      "stone": 1.25,
      "cash": 1.25
    }
  },
  "trainingCamp": {
    "name": "新兵训练营",
    "icon": "🎯",
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
  "metalRefinery": {
    "name": "金属精炼厂",
    "icon": "🏭",
    "desc": "建成首座后解锁铝，石工每位基础采集1铝/s。每座使铝总产量额外+6%。",
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
    }
  },
  "cementWorkshop": {
    "name": "水泥工坊",
    "icon": "🏭",
    "desc": "每座提供2个水泥工人岗位，每位每秒消耗2石头，基础生产1水泥。原料消耗不受产量加成影响。",
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
    }
  },
  "fuelDepot": {
    "name": "燃料库",
    "icon": "🛢️",
    "desc": "每座提供1000石油储量；研究铀存储后额外提供250铀储量。",
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
    }
  },
  "batteryStation": {
    "name": "储能站",
    "icon": "🔋",
    "desc": "电力存储设施，每座提供1000电力储量。",
    "cost": {
      "stone": 200,
      "iron": 100,
      "metal": 50,
      "cash": 80
    },
    "energyCap": 1000,
    "tech": "energyStorage",
    "costScales": {
      "stone": 1.17,
      "iron": 1.17,
      "metal": 1.17,
      "cash": 1.17
    }
  },
  "containerWarehouse": {
    "name": "集装仓库",
    "icon": "📦",
    "desc": "为整齐堆放的集装箱留出位置。",
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
    }
  },
  "communityCenter": {
    "name": "猫猫社区",
    "icon": "🏘️",
    "desc": "让每一声喵，都有邻居回应",
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
    }
  },
  "coalMine": {
    "name": "煤矿",
    "icon": "⚫",
    "desc": "向地下索取远古的火焰。",
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
      "wood": 1.18,
      "wroughtIron": 1.18,
      "cash": 1.18
    }
  },
  "mine": {
    "name": "采矿场",
    "icon": "⛏️",
    "desc": "向大地深处寻找文明的基石。矿工同时开采铁与铜。",
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
      "wood": 1.18,
      "stone": 1.18,
      "cash": 1.18
    }
  },
  "nestMKII": {
    "name": "猫窝MKII",
    "icon": "🏡",
    "desc": "更宽敞的小窝，装得下更多美梦。",
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
    }
  },
  "apartment": {
    "name": "住宅楼",
    "icon": "🏢",
    "desc": "把温暖的家叠成一座楼。每个启用的住宅楼每秒消耗1电力。",
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
    }
  },
  "warehouse": {
    "name": "仓库",
    "icon": "📦",
    "desc": "每座为木材、石头、毛皮、铜、铁、铝、水泥、煤、钢各增加250储量，不储存猫粮。仓库升级后各增加500储量，并加入钛和合金。",
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
    }
  },
  "storageHub": {
    "name": "高级存储枢纽",
    "icon": "🗄️",
    "desc": "每座为木材、石头、毛皮、铜、铁、铝、水泥、煤、钢、钛、合金各增加1500储量；智能化存储后增至2500，不储存猫粮、现金、石油、铀或特殊资源。",
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
    }
  },
  "nest": {
    "name": "猫窝",
    "icon": "🏠",
    "desc": "温暖，是文明的开始。",
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
    }
  },
  // Same base price as 猫窝 by value only; parameters are independent.
  "catHut": {
    "name": "猫猫小屋",
    "icon": "🛖",
    "desc": "猫口容量+1",
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
    }
  },
  "forage": {
    "name": "农场",
    "icon": "🌾",
    "desc": "在田野里种下丰收的希望。",
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
    }
  },
  "lumber": {
    "name": "伐木场",
    "icon": "🪵",
    "desc": "把森林的馈赠带回家园。",
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
      "wood": 1.18,
      "stone": 1.18,
      "cash": 1.18
    }
  },
  "quarry": {
    "name": "采石场",
    "icon": "⛏️",
    "desc": "敲敲石头，打好文明的地基。",
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
      "stone": 1.18,
      "wood": 1.18,
      "cash": 1.18
    }
  },
  "theater": {
    "name": "剧场",
    "icon": "🎭",
    "desc": "让歌声和故事陪伴每个夜晚。",
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
      "food": 1.19,
      "wood": 1.19,
      "stone": 1.19,
      "cash": 1.19
    }
  },
  "broadcast": {
    "name": "广播塔",
    "icon": "📻",
    "desc": "把熟悉的声音送到每个角落。建成后每秒消耗2电力。",
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
    }
  },
  "touristStation": {
    "name": "观光空间站",
    "icon": "🛰️",
    "desc": "在星海之间，眺望温暖的家园。维护消耗5电力/s、0.5石油/s。", 
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
    }
  },
  "foundry": {
    "name": "铸造厂",
    "icon": "⚒️",
    "desc": "每座提供1个猫猫工匠岗位，可分配制作锻造物。",
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
    }
  },
  "library": {
    "name": "图书馆",
    "icon": "📚",
    "desc": "收藏文明的知识。每座知识上限 +100，知识总产量 +5%。",
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
    }
  },
  "school": {
    "name": "喵喵学校",
    "icon": "🏫",
    "desc": "从喵喵叫，到写下第一首诗。提供教授岗位与知识储量。",
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
      "wood": 1.19,
      "stone": 1.19,
      "cash": 1.19
    }
  },
  "generator": {
    "name": "煤炭发电厂",
    "icon": "⚡",
    "desc": "燃烧煤炭发电，产出不受幸福度影响；缺煤时按比例减产。",
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
    }
  },
  "oilGenerator": {
    "name": "石油发电站",
    "icon": "⚡",
    "desc": "每秒消耗0.25石油，固定产出8电力，不受全局加成；缺油时按比例减产。",
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
    }
  },
  "fissionGenerator": {
    "name": "裂变发电站",
    "icon": "☢️",
    "desc": "每秒消耗0.1铀，固定产出12电力，不受全局加成；缺铀时按比例减产。",
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
    }
  },
  "smelter": {
    "name": "冶炼厂",
    "icon": "🏭",
    "desc": "冶炼厂工位+1",
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
    }
  },
  "lab": {
    "name": "实验室",
    "icon": "🔬",
    "desc": "让好奇心找到答案。",
    "cost": {
      "knowledge": 1000,
      "copper": 80,
      "cement": 120,
      "metalPlate": 8,
      "cash": 120
    },
    "workerOutput": {
      "knowledge": 3
    },
    "workerName": "猫猫科学家",
    "slots": 1,
    "tech": "science",
    "costScales": {
      "knowledge": 1.17,
      "copper": 1.19,
      "cement": 1.19,
      "metalPlate": 1.19,
      "cash": 1.19
    }
  },
  "refinery": {
    "name": "石油精炼厂",
    "icon": "🛢️",
    "desc": "提炼石油，每座产出1石油/s，并额外提供250石油储量；不提供工作岗位。",
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
    }
  },
  "observatory": {
    "name": "数据中心",
    "icon": "🖥️",
    "desc": "每座正常供电时提供知识产量+10%及3000知识容量，耗电3/s。关停或缺电时无加成，超额知识会被截断。",
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
    "knowledgeBoost": 0.1,
    "knowledgeCap": 3000,
    "tech": "dataCenter",
    "costScales": {
      "cash": 1.19,
      "knowledge": 1.19,
      "metal": 1.19,
      "titanium": 1.19,
      "alloy": 1.19
    }
  },
  "factory": {
    "name": "工厂",
    "icon": "🏭",
    "desc": "齿轮转动，流水线开始工作。每座提供 1 条生产线，每秒消耗3喵能。",
    "cost": {
      "cement": 250,
      "titanium": 150,
      "metal": 300,
      "cash": 300
    },
    "input": {
      "energy": 3
    },
    "tech": "automation",
    "slots": 0,
    "lines": 1,
    "costScales": {
      "cement": 1.19,
      "titanium": 1.19,
      "metal": 1.19,
      "cash": 1.19
    }
  },
  "moonObservatory": {
    "name": "月球观测站",
    "icon": "🔭",
    "desc": "每座启用的观测站提供5000知识容量，并使学校容量+5%。",
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
    }
  },
  "asrielSpaceport": {
    "name": "Asriel太空港",
    "icon": "🛸",
    "desc": "连接Asriel的太空港。<br>每座启用的太空港消耗氦-3、电力和猫粮，提供Asriel支持。",
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
    }
  },
  "asrielResidence": {
    "name": "Asriel居住站",
    "icon": "🏠",
    "desc": "每座提供2个居住岗位与2人口容量。",
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
    }
  },
  "asrielMine": {
    "name": "Asriel矿井",
    "icon": "⛏️",
    "desc": "每位Asriel居民生产铜0.25、钛0.05/s。",
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
    }
  },
  "ecologicalDome": {
    "name": "生态穹顶",
    "icon": "🌿",
    "desc": "每位Asriel居民生产猫粮0.25/s；每座使居住站人口容量+0.05，并增加2500猫粮容量。",
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
    }
  },
  "hangar": {
    "name": "格纳库",
    "icon": "🛰️",
    "desc": "增加太空资源集装箱容量。",
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
    }
  },
  "spaceFactory": {
    "name": "太空工厂",
    "icon": "🏭",
    "desc": "每座提供1条共享生产线，每秒消耗2氦-3和3电力。",
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
    }
  },
  "starRingStation": {
    "name": "星环空间站",
    "icon": "⭕",
    "desc": "每Asriel行星居民使太空资源产量+0.5%。",
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
      "cash": 1.25,
      "stone": 1.25,
      "aluminum": 1.25,
      "mithril": 1.25
    }
  },
  "spaceWaystation": {
    "name": "电磁发射器",
    "icon": "🚉",
    "desc": "运行时太空区域的石油和氦-3消耗量-5%；氦-3容量+250，石油容量+250，维护消耗5电力/s",
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
    }
  },
  "catCafe": {
    "name": "猫咖",
    "icon": "🐈",
    "desc": "按照5 + (猫口数量/10) × 5；提供$。资金基础容量+4000（铱钢金库后+6500），幸福度上限+1。",
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
    }
  },
  "touristCenter": {
    "name": "游客中心",
    "icon": "🧳",
    "desc": "基础资金产量：每座剧场+2$/s，每座运行中的猫咖+5$/s，每座纪念碑+4$/s。", 
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
    }
  }
};

export const BUILDING_CASH_COSTS: Partial<Record<BuildingId, number>> = {
  alienMaterialLab: 200000, aiSupercore: 100000, swarmFactory: 75000,
  e710Container: 100000, e710MiningShip: 150000, e710Warehouse: 200000, e710Reactor: 300000, miningDrone: 75000, oilExtractor: 200000,
  particleAccelerator: 1000,
  swarmControlStation: 50000, swarmSatellite: 5000, atmosphericCollector: 200000,
  galacticFuelDepot: 150000, talosMoonMiningStation: 300000, iridiumMiningShip: 200000, ironMiningShip: 200000,
  planetaryFoundry: 50000,
  spaceGarrison: 50000,
  geothermalPlant: 50000,
  "moonBase": 10000,
  "iridiumMine": 10000,
  "helium3Mine": 10000,
  "navigationBeacon": 15000,
  "orbitalFuelDepot": 10000,
  "solarSatellite": 2000,
  "researchSatellite": 4000,
  "granary": 100,
  "biologyLab": 2000,
  "forage": 5,
  "nest": 10,
  "catHut": 10,
  "lumber": 8,
  "quarry": 8,
  "school": 15,
  "bank": 25,
  "mine": 15,
  "warehouse": 20,
  "foundry": 40,
  "coalMine": 40,
  "cementWorkshop": 35,
  "theater": 25,
  "library": 40,
  "nestMKII": 80,
  "communityCenter": 80,
  "smelter": 100,
  "refinery": 180,
  "lab": 120,
  "generator": 120,
  "apartment": 140,
  "factory": 300,
  "moonObservatory": 50000,
  "asrielSpaceport": 40000,
  "asrielResidence": 30000,
  "asrielMine": 40000,
  "ecologicalDome": 40000,
  "hangar": 25000,
  "spaceFactory": 50000,
  "starRingStation": 300000,
  "spaceWaystation": 50000,
  "storageHub": 300,
  "metalRefinery": 100,
  "batteryStation": 80,
  "containerWarehouse": 100,
  "fuelDepot": 100,
  "broadcast": 160,
  "oilGenerator": 250,
  "fissionGenerator": 500,
  "observatory": 3000,
  "touristStation": 600,
  "barracks": 20,
  "trainingCamp": 120
};

export const BUILDING_COST_SCALES: Partial<Record<BuildingId, ResourceRecipe>> = {
  alienMaterialLab: { cash: 1.25, metal: 1.25, mithril: 1.25, e710: 1.25 },
  aiSupercore: { cash: 1, metal: 1, alloy: 1, e710: 1, nanotubes: 1 },
  massEjector: { cash: 1.28, adamantite: 1.28, nanoAlloy: 1.28, mithril: 1.28, aerogel: 1.28 },
  swarmFactory: { cash: 1.28, iron: 1.28, neutron: 1.28, brick: 1.28, mithril: 1.28 },
  e710Container: { cash: 1.25, uranium: 1.25, titanium: 1.25, alloy: 1.25, mithril: 1.25 },
  e710MiningShip: { cash: 1.25, uranium: 1.25, titanium: 1.25, mithril: 1.25, helium3: 1.25 },
  e710Warehouse: { cash: 1.3, metal: 1.3, alloy: 1.3, iridium: 1.3 },
  e710Reactor: { cash: 1.25, metal: 1.25, neutron: 1.25, mithril: 1.25 },
  miningDrone: { cash: 1.2, metal: 1.2, neutron: 1.2, helium3: 1.2, e710: 1.2 },
  oilExtractor: { cash: 1.2, polymer: 1.2, helium3: 1.2, wroughtIron: 1.2 },
  particleAccelerator: { cash: 1.33, copper: 1.33, iron: 1.33, metal: 1.33 },
  swarmControlStation: { cash: 1.275, knowledge: 1.275, alloy: 1.275, helium3: 1.275, mithril: 1.275 },
  swarmSatellite: { cash: 1.15, copper: 1.15, iridium: 1.15, helium3: 1.15 },
  atmosphericCollector: { cash: 1.22, uranium: 1.22, alloy: 1.22, helium3: 1.22, mithril: 1.22 },
  galacticFuelDepot: { cash: 1.275, iridium: 1.275, metalPlate: 1.275, helium3: 1.275 },
  talosMoonMiningStation: { cash: 1.265, titanium: 1.265, iridium: 1.265, helium3: 1.265, mithril: 1.265 },
  iridiumMiningShip: { cash: 1.2, uranium: 1.2, alloy: 1.2, iridium: 1.2, helium3: 1.2 },
  ironMiningShip: { cash: 1.2, metal: 1.2, aluminum: 1.2, polymer: 1.2, helium3: 1.2 },
  planetaryFoundry: { cash: 1.235, copper: 1.235, cement: 1.235, wroughtIron: 1.235 },
  spaceGarrison: { cash: 1.3, alloy: 1.3, iridium: 1.3, wroughtIron: 1.3 },
  geothermalPlant: { cash: 1.2, metal: 1.2, polymer: 1.2 },
  "moonBase": {
    "cash": 1.18,
    "metal": 1.18,
    "titanium": 1.18,
    "polymer": 1.18,
    "oil": 1.18
  },
  "iridiumMine": {
    "cash": 1.2,
    "titanium": 1.2,
    "alloy": 1.2
  },
  "helium3Mine": {
    "cash": 1.18,
    "aluminum": 1.18,
    "metal": 1.18,
    "alloy": 1.18
  },
  "navigationBeacon": {
    "cash": 1.18,
    "copper": 1.18,
    "aluminum": 1.18,
    "oil": 1.18,
    "iridium": 1.18
  },
  "orbitalFuelDepot": {
    "cash": 1.18,
    "oil": 1.18,
    "metal": 1.18
  },
  "solarSatellite": {
    "cash": 1.18,
    "alloy": 1.18,
    "polymer": 1.18
  },
  "researchSatellite": {
    "knowledge": 1.2,
    "cash": 1.2,
    "alloy": 1.2,
    "polymer": 1.2
  },
  "granary": {
    "wood": 1.25,
    "stone": 1.25,
    "cash": 1.25
  },
  "biologyLab": {
    "cash": 1.19,
    "knowledge": 1.19,
    "metal": 1.19,
    "alloy": 1.19
  },
  "bank": {
    "wood": 1.27,
    "stone": 1.27,
    "cash": 1.27
  },
  "barracks": {
    "wood": 1.25,
    "stone": 1.25,
    "cash": 1.25
  },
  "trainingCamp": {
    "wood": 1.19,
    "cement": 1.19,
    "metalPlate": 1.19,
    "cash": 1.19
  },
  "metalRefinery": {
    "stone": 1.195,
    "iron": 1.195,
    "metal": 1.195,
    "cash": 1.195
  },
  "cementWorkshop": {
    "wood": 1.215,
    "stone": 1.215,
    "cash": 1.215
  },
  "fuelDepot": {
    "iron": 1.17,
    "metal": 1.17,
    "cash": 1.17
  },
  "batteryStation": {
    "stone": 1.17,
    "iron": 1.17,
    "metal": 1.17,
    "cash": 1.17
  },
  "containerWarehouse": {
    "cement": 1.17,
    "metalPlate": 1.17,
    "cash": 1.17
  },
  "communityCenter": {
    "wood": 1.17,
    "stone": 1.17,
    "cash": 1.17
  },
  "coalMine": {
    "wood": 1.18,
    "wroughtIron": 1.18,
    "cash": 1.18
  },
  "mine": {
    "wood": 1.18,
    "stone": 1.18,
    "cash": 1.18
  },
  "nestMKII": {
    "stone": 1.17,
    "plank": 1.17,
    "brick": 1.17,
    "cash": 1.17
  },
  "apartment": {
    "cement": 1.18,
    "copper": 1.18,
    "metal": 1.18,
    "fur": 1.18,
    "cash": 1.18
  },
  "warehouse": {
    "wood": 1.25,
    "stone": 1.25,
    "cash": 1.25
  },
  "storageHub": {
    "cement": 1.25,
    "metal": 1.25,
    "alloy": 1.25,
    "cash": 1.25
  },
  "nest": {
    "wood": 1.17,
    "stone": 1.17,
    "cash": 1.17
  },
  "catHut": {
    "wood": 1.35,
    "stone": 1.35,
    "cash": 1.35
  },
  "forage": {
    "wood": 1.2,
    "stone": 1.2,
    "cash": 1.2
  },
  "lumber": {
    "wood": 1.18,
    "stone": 1.18,
    "cash": 1.18
  },
  "quarry": {
    "stone": 1.18,
    "wood": 1.18,
    "cash": 1.18
  },
  "theater": {
    "food": 1.19,
    "wood": 1.19,
    "stone": 1.19,
    "cash": 1.19
  },
  "broadcast": {
    "iron": 1.19,
    "copper": 1.19,
    "metal": 1.19,
    "cash": 1.19
  },
  "touristStation": {
    "metal": 1.18,
    "alloy": 1.18,
    "oil": 1.18,
    "cash": 1.18
  },
  "foundry": {
    "wood": 1.19,
    "stone": 1.19,
    "iron": 1.19,
    "cash": 1.19
  },
  "library": {
    "plank": 1.19,
    "brick": 1.19,
    "fur": 1.19,
    "cash": 1.19
  },
  "school": {
    "wood": 1.19,
    "stone": 1.19,
    "cash": 1.19
  },
  "generator": {
    "cement": 1.19,
    "iron": 1.19,
    "metal": 1.19,
    "cash": 1.19
  },
  "oilGenerator": {
    "cement": 1.19,
    "iron": 1.19,
    "copper": 1.19,
    "metal": 1.19,
    "cash": 1.19
  },
  "fissionGenerator": {
    "cement": 1.19,
    "iron": 1.19,
    "copper": 1.19,
    "metal": 1.19,
    "alloy": 1.19,
    "cash": 1.19
  },
  "smelter": {
    "stone": 1.19,
    "iron": 1.19,
    "cash": 1.19
  },
  "lab": {
    "knowledge": 1.17,
    "copper": 1.19,
    "cement": 1.19,
    "metalPlate": 1.19,
    "cash": 1.19
  },
  "refinery": {
    "metal": 1.19,
    "copper": 1.19,
    "cash": 1.19
  },
  "observatory": {
    "cash": 1.19,
    "knowledge": 1.19,
    "metal": 1.19,
    "titanium": 1.19,
    "alloy": 1.19
  },
  "factory": {
    "cement": 1.19,
    "titanium": 1.19,
    "metal": 1.19,
    "cash": 1.19
  },
  "catCafe": {
    "cash": 1.25,
    "fur": 1.25,
    "wood": 1.25,
    "brick": 1.25
  },
  "touristCenter": {
    "cash": 1.18,
    "fur": 1.18,
    "plank": 1.18,
    "stone": 1.18
  },
  "moonObservatory": {
    "cash": 1.18,
    "knowledge": 1.18,
    "stone": 1.18,
    "iron": 1.18,
    "iridium": 1.18
  },
  "asrielSpaceport": {
    "cash": 1.25,
    "iridium": 1.25,
    "mithril": 1.25,
    "titanium": 1.25
  },
  "asrielResidence": {
    "cash": 1.2,
    "metal": 1.2,
    "polymer": 1.2
  },
  "asrielMine": {
    "cash": 1.25,
    "iron": 1.25
  },
  "ecologicalDome": {
    "cash": 1.2,
    "wood": 1.2,
    "brick": 1.2
  },
  "hangar": {
    "cash": 1.2,
    "iron": 1.2,
    "brick": 1.2,
    "metalPlate": 1.2
  },
  "spaceFactory": {
    "cash": 1.2035,
    "brick": 1.2035,
    "coal": 1.2035,
    "mithril": 1.2035
  },
  "spaceWaystation": {
    "cash": 1.25,
    "metal": 1.25,
    "alloy": 1.25,
    "iridium": 1.25
  },
  "starRingStation": {
    "cash": 1.25,
    "stone": 1.25,
    "aluminum": 1.25,
    "mithril": 1.25
  }
};

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
      "trainingCamp"
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
      "oilGenerator",
      "fissionGenerator",
      "batteryStation"
    ]
  },
  {
    "id": "publicUtilities",
    "name": "公共事业部门",
    "buildings": ["particleAccelerator", "spaceWaystation"]
  }
];

export const BUILDING_FLAVOR_IDS = new Set<BuildingId>(["containerWarehouse","communityCenter","coalMine","mine","nestMKII","apartment","nest","forage","lumber","quarry","theater","touristStation","foundry","school","smelter","lab"]);
