import type { BuildingId, BuildingDefinition } from '../types/buildings';
import type { GameState } from '../types/state';
import type { ResourceId } from '../types/economy';
import { BUILDINGS } from '../data/buildings';
import { RESOURCES } from '../data/resources';
import { CONFIG } from '../data/config';
import { formatByteNumber } from '../shared/format';
import { calculateBuildingOutput, calculateBuildingInput } from '../simulation/building-production';
import { getBuildingEffectRows, calculateFreightCapacityMultiplier, RESEARCH_SATELLITE_LAB_OUTPUT, RESEARCH_SATELLITE_LAB_CAPACITY } from '../simulation/building-effects';
import { calculateStorageBonuses } from '../simulation/storage-bonuses';
import type { StorageSnapshot } from '../simulation/storage';
import { calculateBuildingContainerCap, calculateBuildingAlloyContainerCap } from '../simulation/containers';
import { calculateTrainingBoost } from '../simulation/government';
import { HOSPITAL_HEAL_PER_DAY, isHospitalIdle } from '../simulation/hospital';
import { calculateStarRingCoefficient } from '../simulation/asriel';
import { calculateQuantumSnapshot, calculateQuantumLevel, calculateQuantumSwarmFactoryReduction } from '../simulation/quantum';
import { isChallengeGeneActive } from '../simulation/challenges';
import { allocateShipCrew, SHIP_CREW_SIZE, SHIP_CREW_JOB_NAME, type ShipCrewId } from '../simulation/ship-crew';
import { orderedCostEntries } from './format';

/** Row-effect kind understood by TooltipPanel's dedup rules. */
export type EffectRowType = 'detail' | 'production' | 'multiplier';

export interface BuildingTooltipContext {
  id: BuildingId;
  building: BuildingDefinition;
  state: GameState;
  /** Resolved storage snapshot supplied by the caller; read-only. */
  snapshot: StorageSnapshot;
  count: number;
  /** Mutable tooltip description/footnote/rows; specialised buildings rewrite these. */
  tip: { description: string; footnote: string; rows: unknown[]; effects?: string[] };
  /** Tooltip row appender with its dedup logic (kept in the component). */
  add: (name: string, value: string, negative?: boolean, note?: string, effectType?: EffectRowType) => void;
  /** Component formatters, passed in so ∞ and rounding behaviour cannot drift. */
  number: (n: number) => string;
  percent: (n: number) => string;
  formatEffectNumber: (n: number) => string;
}

/**
 * Effect rows of the building tooltip, moved verbatim from the component with
 * source order preserved (rows are order-sensitive and interleave with the
 * caller's dynamic rows). State-dependent branches stay in this one function;
 * TooltipPanel keeps targeting, costs and the specialised descriptions.
 */
export function addBuildingEffectRows(ctx: BuildingTooltipContext): void {
  const { id, building, state, snapshot, count, tip, add, number, percent, formatEffectNumber } = ctx;
  // Every effect row below is derived from the registry's mechanics; there is no
  // hand-written effect text to fall back on.
  // 实验室: three lines in the 建筑效果 block instead of the old duplicated rows
  // (知识容量 appeared three times) and instead of a hardcoded powered capacity that
  // ignored the satellite/institute multipliers.
  if (id === 'lab') {
    const slots = building.slots ?? CONFIG.workersPerBuilding;
    const perBuilding = calculateStorageBonuses('lab', state, snapshot.moon, snapshot.asriel, snapshot.digital).knowledge || 0;
    add('猫猫科学家', `+${number(slots)}`);
    add('知识容量', `+${number(perBuilding)}`);
    // Only after 电力 does one funded lab hold a second unit of base capacity.
    if (state.tech.includes('electricity')) add('供能时知识容量', `+${number(perBuilding * 2)}，电力-2`);
    return;
  }
  for (const [job, slots] of Object.entries(building.jobSlots || {}) as [BuildingId, number][]) add(`${BUILDINGS[job].workerName}上限`, `+${number(slots)}`);
  if (Object.hasOwn(SHIP_CREW_SIZE, id)) {
    // Only the per-ship crew cost is an effect of the building; the live staffing
    // level belongs to the 工作列表 row, not to three separate ship tooltips.
    add(`${SHIP_CREW_JOB_NAME}（每座）`, `${number(SHIP_CREW_SIZE[id as ShipCrewId] || 0)} 猫口`);
  }
  if (id === 'swarmFactory') {
    const reduction = calculateQuantumSwarmFactoryReduction(state, calculateQuantumLevel(state));
    add('每座蜂群卫星价格', `-${percent(reduction * 100)}%`, false, '各工厂折扣复合计算；蜂群卫星总成本最多降低95%。');
  }
  // Building effects only: worker production belongs in the worker/resource details.
  // 冶炼厂 only grants 冶炼厂工位; the slot recipe lives in the smelter settings modal.
  if (!building.workerOutput && !building.asrielSource && id !== 'smelter') {
    for (const [resource, amount] of orderedCostEntries(calculateBuildingOutput(id, state))) {
      add(RESOURCES[resource as ResourceId].name, `+${resource === 'bytes' ? formatByteNumber(amount, false, 10000) : number(amount)}${resource === 'energy' ? '' : '/s'}`, false, undefined, 'production');
    }
  }
  if ((building.workerOutput || building.artistSlots || building.craftSlots) && !building.unlimited) {
    const slots = building.slots ?? building.artistSlots ?? CONFIG.workersPerBuilding;
    if (slots > 0) add(`${building.workerName || (building.artistSlots ? '艺术家' : building.craftSlots ? '工匠' : '工作猫')}容量`, `+${number(slots)}`);
  }
  if (building.boostResource) {
    add(`${RESOURCES[building.boostResource].name}产量`, `+${id === 'lumber' || id === 'quarry' ? 2 : 5}%`);
  }
  if (id === 'touristCenter') {
    add('每座剧场', '+2$/s');
    add('每座运行中的猫咖', '+5$/s');
    add('每座纪念碑', '+4$/s');
  }
  if (id === 'foundry' && state.tech.includes('castingToolUpgrade')) add('锻造工具加成', '+3%');
  if (id === 'asrielControlTower') add('火星支持', '+1');
  if (id === 'anchorFreightStation' || id === 'civilianRouteStation') add('占用稳定度', '2');
  for (const row of getBuildingEffectRows(id, state, { repeaters: snapshot.stageThree?.repeaters ?? 0, asteroidBases: snapshot.stageThree?.asteroidBases ?? 0, blackHoleStations: snapshot.blackHoleStationUnits ?? 0 })) {
    add(row.label, row.value, false, row.note);
  }
  if (id === 'asteroidBase') add('锚点货运站容量', '+5%', false, '仅运行时生效，按运行基地数量累加。');
  if (id === 'shortRangeRelay') { add('运行时：Asriel支持', '+2'); add('占用稳定度', '2'); }
  if (id === 'metalRefinery') {
    const advanced = state.tech.includes('advancedMetalRefining');
    add(advanced ? '供能时：铝产量' : '铝产量', advanced ? '+8%' : '+6%');
    if (advanced) { add('供能时：钢产量', '+1%'); add('供能时：铱产量', '+0.5%'); }
  }
  if (id === 'moonObservatory') add('学校知识容量', '+5%');
  if (id === 'particleAccelerator') {
    if (isChallengeGeneActive(state, 'particleImbalance')) {
      const bonus = 0.05;
      add('普通资源产量（含知识，不含电力）', `+${number(bonus * 100)}%`);
      add('锻造物产量', `+${number(bonus * 25)}%`);
    }
    else add('粒子产量加成', '+10%');
    if (state.tech.includes('knowledgeInheritance')) add('图书馆知识容量', `+${number(10)}%`);
  }
  if (id === 'researchSatellite') {
    add('科学家知识产量', `+${number(RESEARCH_SATELLITE_LAB_OUTPUT * 100)}%`);
    add('实验室知识容量', `+${number(RESEARCH_SATELLITE_LAB_CAPACITY * 100)}%`);
  }
  if (id === 'asrielMine') {
    add('每行星居民铜产量', '+0.25/s');
    add('每行星居民钛产量', '+0.05/s');
  }
  if (id === 'ecologicalDome') add('每行星居民猫粮产量', '+0.25/s');
  if (id === 'planetaryFoundry') add('每行星居民锻造工具加成', '+3%');
  if (id === 'miningDrone') add('塔卫二采矿站产量', '+5%');
  if (id === 'geothermalPlant') add('月球铱矿产量', '+5%');
  if (id === 'ecologicalDome') add('每座Asriel居住站猫口容量', '+0.05');
  if (building.cap) add('猫口容量', `+${number(building.cap + (id === 'asrielResidence' ? .05 * snapshot.asriel.allocations.ecologicalDome : 0))}`);
  if (building.soldierCap) add('士兵容量', `+${number(building.soldierCap)}`, false,
    id === 'barracks' ? '军营数量决定士兵数量上限：关闭军营会立即取消其士兵名额，超出上限的士兵会被马上移除，幸福度中的士兵容量压力也随之降低。' : undefined);
  if (building.trainingBoost) add('训练效果', `+${percent(calculateTrainingBoost(state))}%`);
  if (id === 'hospital') {
    add('治愈伤兵', `+${number(HOSPITAL_HEAL_PER_DAY)}/游戏日`, false,
      isHospitalIdle(state) ? '当前没有伤兵。' : '伤兵由临近势力的军事行动产生；治愈后自动回到士兵序列。');
  }
  if (building.lines) add('生产线容量', `+${number(building.lines)}`);
  if (id === 'smelter') add('冶炼厂工位', '+1', false, '冶炼厂本身不产出也不消耗资源；资源由钢冶炼工位产出和消耗，可在设置中查看配方并分配。');
  if (id === 'stellarForge') { add('冶炼厂工位', '+2'); add('工匠上限', '+2'); add('锻造工具加成', '+10%'); }
  if (id === 'adamantiteProcessor') add('精金采矿船产量', '+20%');
  if (id === 'vrCenter') add('幸福度', '+2.5%', false, '仍受幸福度上限限制。');
  if (id === 'blackHoleStation') add('空间撕裂者知识容量效果', '+1%');
  const containerCap = calculateBuildingContainerCap(id, state);
  const alloyContainerCap = calculateBuildingAlloyContainerCap(id, state);
  if (containerCap) add('集装箱容量', `+${number(containerCap)}`);
  if (alloyContainerCap) add('合金集装箱容量', `+${number(alloyContainerCap)}`);
  if (building.moraleCap) add('幸福度上限', `+${percent(building.moraleCap)}%`);
  if (building.morale) add('幸福度', `+${percent(building.morale)}%`);
  if (id === 'navigationBeacon' && state.tech.includes('spaceBroadcasting')) add('幸福度', '+3%');
  if (id === 'moonBase' || id === 'navigationBeacon') add('月球支持', `+${id === 'moonBase' ? 2 : 1}`);
  if (id === 'asrielSpaceport') add('Asriel支持', '+4');
  if (id === 'swarmControlStation') add('戴森群支持', `+${formatEffectNumber(20 + (state.tech.includes('quantumSwarm') ? calculateQuantumSnapshot(state).level : 0))}`);
  if (building.knowledgeBoost) add('知识产量', `+${percent(building.knowledgeBoost * 100)}%`);
  if (building.jobs) add('Asriel居民容量', `+${number(building.jobs)}`);
  if (id === 'starRingStation') {
    const coefficient = calculateStarRingCoefficient(state, snapshot.asriel.allocations.alienMaterialLab || 0);
    add('每Asriel行星居民使太空资源产量', `+${percent(coefficient * 100)}%`);
  }
  if (id === 'spaceWaystation') {
    add('太空区域石油消耗量', '-5%', false, '不作用于超空间/遥远星际的建筑与探索任务。');
    add('太空区域氦-3消耗量', '-5%');
  }
  if (id === 'communityCenter') {
    add('人口增长速率', '+10%');
    add('幸福度', '+25%');
    add('只能建造一个', '');
  }
  const miningPowered = (id === 'mine' || id === 'coalMine') && state.tech.includes('automatedMining');
  const gatheringPowered = (id === 'lumber' || id === 'quarry') && state.tech.includes('automatedMining');
  if (gatheringPowered) add(id === 'lumber' ? '每座供能伐木场：伐木工人产量' : '每座供能采石场：石工产量', '+5%');
  const mixerPowered = id === 'cementWorkshop' && state.tech.includes('cementMixer');
  if (miningPowered) add(id === 'mine' ? '每座供电矿井：矿工产量' : '每座供电煤矿：煤矿工人产量', '+5%');
  if (mixerPowered) add('每座供电水泥工坊：水泥工人产量', '+5%');
  if (building.cpuCompute) add('CPU算力', `+${number(id === 'cellCore' && state.tech.includes('cellMultithreading') ? 4 : building.cpuCompute)}`);
  if (id === 'dataCompression') {
    add('锚点货运站容量', '+20%', false, '按有效运行数量累加。');
    add('量子存储器容量', '+25%', false, '按有效运行数量累加。');
    if (state.tech.includes('deepCore')) add('记忆核心容量', '+15%', false, '按有效运行数量累加。');
  }
  if (id === 'cpuDecoder') add('量化压缩模块知识容量', '+10%', false, '按有效运行数量累加。');
  if (id === 'gatewayRouter') {
    add('数据带宽', state.tech.includes('layer3Switch') ? '+7.5' : '+5');
    if (state.tech.includes('layer3Switch')) tip.description = (building.desc || '').replace('提供5带宽', '提供7.5带宽');
  }
  if (id === 'memoryCore') {
    add('字节容量', `+${formatByteNumber(building.bytesCap! * (1 + .15 * (snapshot.digital?.dataCompressionUnits ?? 0)), false, 10000)}`, false, '包含有效运行数据压缩的加成。');
    if (state.tech.includes('encryptedDataAnalysis')) add('加密数据容量', `+${number(25000)}`);
  }
  if (id === 'softRouterNode') add('数据带宽', '+4');
  if (id === 'agiCoreComponent') { add('量子水平', '+50%', false, '完整建成并运行时生效。'); add('字节产量', '+50%', false, '完整建成并运行时生效。', 'multiplier'); }
  if (id === 'coreCooler') add('AGI飞升核心电力占用', '-100', false, '按有效运行数量累加，最低为0。');
  if (id === 'agiAscensionCore') tip.footnote = '默认关闭；完整建成、启用且获得完整供能后可数字化飞升。';
  if (id === 'ethMiner') add('现金容量', `+${number(building.cashCap!)}`);
  if (id === 'dataDecryptionModule') add('加密数据产量', '+25%', false, '按有效运行数量累加。', 'multiplier');
  if (id === 'quantumStorage') add('字节容量', `+${formatByteNumber(building.bytesCap! * (1 + .25 * (snapshot.digital?.dataCompressionUnits ?? 0)), false, 10000)}`, false, '包含有效运行数据压缩的加成。');
  if (id === 'downloadCache') add('字节产量', '+10%');
  if (id === 'downloadExecutable') add('数据下载', '1k知识/s → 1B/s', false, '配置0%～100%的实际知识产出用于下载；不主动消耗知识库存。');
  if (building.bandwidthUse) add('数据带宽', `−${number(building.bandwidthUse)}`, true);
  if (building.cpuComputeUse) add('CPU算力', `−${number(building.cpuComputeUse)}`, true);
  const storage = calculateStorageBonuses(id, state, snapshot.moon, snapshot.asriel, snapshot.digital);
  for (const [resource, amount] of orderedCostEntries(storage)) {
    if ((id === 'memoryCore' && (resource === 'bytes' || resource === 'encryptedData')) || (id === 'ethMiner' && resource === 'cash') || (id === 'quantumStorage' && resource === 'bytes')) continue;
    const effectiveAmount = id === 'anchorFreightStation' ? amount * calculateFreightCapacityMultiplier(state, snapshot.stageThree?.asteroidBases || 0, (snapshot.digital?.dataCompressionUnits ?? 0)) : amount;
    add(`${RESOURCES[resource as ResourceId].name}容量`, `+${number(effectiveAmount)}`, false, id === 'quantizedCompressionModule' ? '当前每座容量，包含有效运行CPU解码器加成。' : undefined);
  }
  // Worker recipe ingredients are not per-building maintenance.
  // Maintenance always follows all benefits and capacity effects.
  if (building.asrielSupport && id !== 'asrielSpaceport') add('Asriel支持', `-${number(building.asrielSupport)}`, true);
  if (building.moonSupport) add('月球支持', `-${number(building.moonSupport)}`, true);
  if (id === 'swarmSatellite') add('戴森群支持', '-1', true);
  if (!building.workerOutput && id !== 'smelter') for (const [resource, amount] of orderedCostEntries(calculateBuildingInput(id, state))) {
    add(RESOURCES[resource as ResourceId].name, `-${number(amount)}${resource === 'energy' ? '' : '/s'}`, true);
  }
  if (miningPowered || gatheringPowered || mixerPowered) add('电力', `-${mixerPowered ? 2 : 1}`, true);
  if (id === 'aiSupercore') {
    tip.description = `world.exection(cat);\n当前量子水平：${calculateQuantumLevel(state).toFixed(2)}`;
    tip.rows = [];
    tip.footnote = '';
    // One-off project: once the core exists its construction row is retired, so there is no
    // segment counter left to report; the completed entry only counts cores.
    add('已建成核心', `${count}`);
    add('量子水平', '+25%');
    add('氦-3', '-25/s', true);
    add('电力', '-100', true);
  }
}
