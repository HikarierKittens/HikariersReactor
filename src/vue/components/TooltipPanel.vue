<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import type { ArpaProjectId, CrisprUpgradeId, GameState, GovernmentId } from '../../types/state';
import type { BuildingId } from '../../types/buildings';
import type { TechnologyId } from '../../types/technologies';
import type { CraftId, ResourceId, ResourceRecipe } from '../../types/economy';
import { BUILDINGS } from '../../data/buildings';
import { TECHNOLOGIES } from '../../data/technologies';
import { CRAFT_RECIPES, RESOURCES } from '../../data/resources';
import { CRISPR_UPGRADES } from '../../data/crispr';
import { ARPA_PROJECTS } from '../../data/projects';
import { calculateProjectDescription, calculateProjectCost } from '../../simulation/projects';
import { SHIP_COMPONENTS, calculateShipComponentRemainingCost, calculateShipComponentProgress, isShipComponentUnlocked, type ShipComponentId } from '../../simulation/spaceship';
import { CONFIG } from '../../data/config';
import { floorWithPrecision, formatEffectNumber, formatResourceNumber, formatCostNumber, formatByteNumber } from '../../shared/format';
import { calculateFoodPerCat } from '../../simulation/population';
import { withoutPowerCost } from '../../simulation/one-time-cost';
import { calculateBuildingCost, isBuildingFullyBuilt } from '../../simulation/costs';
import { describeQueuedPurchases } from '../../simulation/purchases';
import { calculateTechCost, calculateTrainingBoost, calculateBankerTaxRate, BANKER_TAX_BONUS, STOCK_EXCHANGE_BANKER_BONUS, GOVERNMENTS } from '../../simulation/government';
import { SPACE_MISSIONS, REGIONAL_MISSIONS, calculateRegionalMissionCost, isRegionalMissionCompleted, type RegionalMissionId } from '../../simulation/space-missions';
import { calculateBuildingInput, calculateBuildingOutput, calculateToolMultiplier, calculateBuildingName } from '../../simulation/building-production';
import { getBuildingEffectRows, calculateFreightCapacityMultiplier, SPACE_RIPPER_OVERCLOCK_DESC } from '../../simulation/building-effects';
import { calculateStorageBonuses } from '../../simulation/storage-bonuses';
import { calculateStorageDetails, calculateDarkEnergyStorageBonus } from '../../simulation/storage';
import { calculateHousingDetails } from '../../simulation/housing';
import { calculateQuantumSnapshot, calculateQuantumLevel, calculateQuantumSwarmFactoryReduction } from '../../simulation/quantum';
import { uiPreview } from '../preview-cache';
import { calculateGravityConversionEnergy, formatBlackHoleMass } from '../../simulation/black-hole';
import { calculateResourceBreakdown, calculateResourceFactorRows, calculateResourceExpenseRows, signedRate } from '../../simulation/resource-breakdown';
import { calculateArtistEffect } from '../../simulation/morale';
import { calculateEffectiveParticles, calculateParticleMultiplier } from '../../simulation/crafting';
import { calculateBuildingContainerCap, calculateBuildingAlloyContainerCap } from '../../simulation/containers';
import { calculateCrisprStorageBonus } from '../../simulation/crispr';
import { calculateEffectiveParticleCount, isChallengeGeneActive } from '../../simulation/challenges';
import { duration, fmt, moraleSnapshot, orderedCostEntries, percent, storageSnapshot } from '../format';

const props = defineProps<{ state: GameState; revision: number }>();
type TipKind = 'building' | 'tech' | 'storage' | 'resource' | 'morale' | 'housing' | 'prestige' | 'crispr' | 'job' | 'craftJob' | 'arpa' | 'mission' | 'ship' | 'quantum' | 'government';
const kinds: TipKind[] = ['building', 'tech', 'storage', 'resource', 'morale', 'housing', 'prestige', 'crispr', 'job', 'craftJob', 'arpa', 'mission', 'ship', 'quantum', 'government'];
const selector = '[data-building-tip][data-tip-kind]';
const anchor = shallowRef<HTMLElement | null>(null);
const panel = shallowRef<HTMLElement | null>(null);
const selected = ref<{ id: string; kind: TipKind } | null>(null);
const pinned = ref(false);
let hoveredBuilding: HTMLElement | null = null;
const position = ref({ left: '8px', top: '8px' });
/** Keep values concise; conditions and stacking rules belong in the full-width note. */
type EffectRowType = 'detail' | 'production' | 'multiplier';
interface DetailRow { name: string; value: string; negative?: boolean; child?: boolean; note?: string; effectType?: EffectRowType }
interface TipContent {
  title: string;
  description: string;
  costs: { id: string; name: string; amount: number; missing: boolean; blocked: boolean }[];
  rows: DetailRow[];
  requirements: DetailRow[];
  income: DetailRow[];
  expense: DetailRow[];
  footnote: string;
  warning?: string;
  resourceTiming: string;
}
function number(n: number): string { return Number.isFinite(n) ? fmt(n) : '∞'; }
function recipeText(recipe: ResourceRecipe, suffix = ''): string {
  return orderedCostEntries(recipe).map(([id, amount]) => `${RESOURCES[id as ResourceId].name} ${number(amount)}${id === 'energy' ? '' : suffix}`).join(' · ');
}
const content = computed<TipContent | null>(() => {
  props.revision;
  const target = selected.value;
  if (!target) return null;
  const state = props.state;
  const tip: TipContent = { title: '', description: '', costs: [], rows: [], requirements: [], income: [], expense: [], footnote: '', resourceTiming: '' };
  const add = (name: string, value: string, negative = false, note?: string, effectType: EffectRowType = 'detail') => {
    // A resource can have both flat production and a percentage multiplier.
    // Only identical typed effects are duplicates; display names are not row identities.
    if (tip.rows.some(row => row.effectType === effectType && row.name === name && row.value === value && row.negative === negative && row.note === note)) return;
    tip.rows.push({ name, value, negative, effectType, ...(note === undefined ? {} : { note }) });
  };
  const snapshot = storageSnapshot(state, 1, props.revision);
  const prices = (cost: ResourceRecipe) => orderedCostEntries(withoutPowerCost(cost)).map(([id, amount]) => ({
    id,
    name: RESOURCES[id as ResourceId].name,
    amount,
    blocked: calculateStorageDetails(id as ResourceId, state, snapshot).total + 1e-8 < amount,
    missing: state.resources[id as ResourceId] + 1e-8 < amount,
  }));

  if (target.kind === 'government' && Object.hasOwn(GOVERNMENTS, target.id)) {
    const government = GOVERNMENTS[target.id as GovernmentId];
    tip.title = government.name;
    tip.description = government.desc;
  } else if (target.kind === 'quantum') {
    const quantum = calculateQuantumSnapshot(state);
    const decimal = (value: number) => (floorWithPrecision(value * 100) / 100).toFixed(2);
    tip.title = '量子水平';
    tip.description = '人工智能 II 解锁量子水平。基础水平按知识容量对数增长；完整建成且维护已支付的AI超级核心每个增加25%基础水平，AGI核心组件每个增加50%基础水平。';
    add('知识容量', formatResourceNumber(quantum.knowledgeCapacity));
    add('基础水平：log1p(0.1 × 知识容量 / 250000) / log1p(0.1)', decimal(quantum.base));
    add('实际生效AI超级核心', String(quantum.cores));
    add('AGI基础倍率加成', `+${percent(quantum.agi * 100)}%`);
    add('最终倍率', `×${decimal(1 + .25 * quantum.cores + quantum.agi)}`);
    add('量子水平', decimal(quantum.level));
    tip.footnote = '量子水平截断到小数点后两位；未完成或缺少氦-3的核心不提供加成。';
  } else if (target.kind === 'craftJob' && Object.hasOwn(CRAFT_RECIPES, target.id)) {
    const id = target.id as CraftId, recipe = CRAFT_RECIPES[id];
    tip.title = `${RESOURCES[id].name}工匠`;
    tip.description = '每人基础产出与岗位消耗';
    add(RESOURCES[id].name, `+${number(recipe.rate)}/s`);
    for (const [resource, amount] of orderedCostEntries(recipe.input)) {
      add(RESOURCES[resource as ResourceId].name, `-${number(amount * recipe.rate)}/s`, true);
    }
  } else if (target.kind === 'job' && Object.hasOwn(BUILDINGS, target.id)) {
    const id = target.id as BuildingId, building = BUILDINGS[id];
    tip.title = building.workerName || (id === 'theater' ? '猫猫艺术家' : building.name);
    tip.description = '每人基础产出与岗位消耗';
    if (building.artistSlots) add('幸福度', `+${percent(calculateArtistEffect(state))}%`);
    else if (id === 'bank') {
      const exchanges = state.arpaBuildings?.stockExchange || 0;
      add('税收收入', `+${percent(calculateBankerTaxRate(state) * 100)}%`);
      if (exchanges) {
        tip.rows.push({ name: '基础', value: `+${percent(BANKER_TAX_BONUS * 100)}%`, child: true });
        tip.rows.push({ name: `证券交易所 ×${exchanges}`, value: `+${percent(STOCK_EXCHANGE_BANKER_BONUS * exchanges * 100)}%`, child: true });
      }
    }
    else if (id === 'foundry') {
      add('锻造物', '+0.1/s');
      add('原料消耗', '按所分配的制作配方');
    } else if (id === 'asrielResidence') {
      const mines = snapshot.asriel.allocations.asrielMine || 0;
      const domes = snapshot.asriel.allocations.ecologicalDome || 0;
      add('铜', `+${number(.25 * mines)}/s`);
      add('钛', `+${number(.05 * mines)}/s`);
      add('猫粮', `+${number(.25 * domes)}/s`);
    } else {
      for (const [resource, amount] of orderedCostEntries(calculateBuildingOutput(id, state))) {
        const jobMultiplier = calculateToolMultiplier(id, state)
          * (id === 'forage' && state.tech.includes('agriculture') ? 1.5 : 1)
          * (id === 'forage' && state.tech.includes('agriculturalMachinery') ? 2 : 1);
        if (amount) add(RESOURCES[resource as ResourceId].name, `+${number(amount * jobMultiplier)}${resource === 'energy' ? '' : '/s'}`);
      }
      for (const [resource, amount] of orderedCostEntries(building.input || {})) {
        if (amount) add(RESOURCES[resource as ResourceId].name, `-${number(amount)}${resource === 'energy' ? '' : '/s'}`, true);
      }
    }
  } else if (target.kind === 'building' && Object.hasOwn(BUILDINGS, target.id)) {
    const number = formatEffectNumber;
    const percent = formatEffectNumber;
    const id = target.id as BuildingId, building = BUILDINGS[id];
    const count = state.buildings[id] || 0;
    tip.title = calculateBuildingName(id, state);
    if (['alienMaterialLab', 'aiSupercore', 'swarmFactory', 'hyperspaceSpaceport', 'iceMiningShip', 'asteroidBase', 'signalRepeater', 'hydrogenPowerPlant', 'comprehensiveMiningFacility', 'gasCloudMiningShip', 'highTechFarmPlatform', 'fusionPowerPlant', 'metalMiningShip', 'fuelMiningShip', 'spaceRipper', 'highTechFactory', 'e710ResearchStation', 'adamantiteMiningShip', 'adamantiteProcessor', 'grapheneFactory', 'vrCenter', 'stellarForge', 'blackHoleStation', 'penroseSphere', 'dysonSphere', 'massEjector'].includes(id)) tip.description = building.desc || '';
    // 质量喷射 reveals the black hole's masses on the sphere it feeds.
    if (id === 'penroseSphere' && (state.buildings.massEjector || 0) > 0) tip.description += `\n黑洞质量：${formatBlackHoleMass(state.blackHole.mass)}\n奇异质量：${formatBlackHoleMass(state.blackHole.exoticMass)}`;
    if (id === 'penroseSphere' && state.tech.includes('gravityConversion')) tip.description += `\n引力转化：电力+${formatEffectNumber(calculateGravityConversionEnergy(state))}`;
    if (id === 'iceMiningShip' && state.tech.includes('icebreakingPlan')) tip.description = (building.desc || '').replace('水产量+1/s', '水产量+1.25/s');
    if (id === 'aiSupercore') tip.description = `world.exection(cat);\n分段进度： ${Math.min(count, building.segmentedRequired!)} /${building.segmentedRequired}\n量子水平 +25%\n氦-3 - 25/s\n电力 - 100`;
    const queueUid = Number(anchor.value?.dataset.queueUid);
    // Resolve by stable uid, but recompute the ordinal price from the current queue.
    // Removing an earlier duplicate shifts all later quotes without changing their identity.
    const queued = Number.isFinite(queueUid)
      ? describeQueuedPurchases(state).find(item => item.uid === queueUid && item.kind === 'build' && item.id === id) : undefined;
    const queuedSegments = queued?.kind === 'build' ? queued.segments : undefined;
    const cost = queued ? (queuedSegments
      ? Object.fromEntries(Object.entries(queued.cost).map(([resource, value]) => [resource, value / queuedSegments]))
      : queued.cost) : calculateBuildingCost(id, count, state);
    // Completed one-off buildings and segmented projects have no further build cost.
    const fullyBuilt = isBuildingFullyBuilt(id, state);
    tip.costs = fullyBuilt ? [] : prices(queuedSegments ? Object.fromEntries(Object.entries(cost).map(([resource, value]) => [resource, value * queuedSegments])) : cost);
    if (queuedSegments) {
      add('队列剩余分段', `${queuedSegments} 段`);
      tip.footnote = '按分段逐个扣款建造；以下为剩余分段的总需求，无需一次备齐。';
      for (const row of tip.costs) row.blocked = calculateStorageDetails(row.id as ResourceId, state, snapshot).total + 1e-8 < (cost[row.id as ResourceId] || 0);
    }
    if (building.segmentedRequired) {
      // Clamp instead of modulo: a finished project shows 100/100, not 0/100.
      add('分段进度', `${Math.min(count, building.segmentedRequired)}/${building.segmentedRequired}`);
    }
    // 空间撕裂者: flavor text on top, effects in the rows below.
    if (id === 'spaceRipper') {
      tip.footnote = '';
      if (state.tech.includes('ripperOverclock')) tip.description = `${tip.description}\n${SPACE_RIPPER_OVERCLOCK_DESC}`;
    }
    for (const [job, slots] of Object.entries(building.jobSlots || {}) as [BuildingId, number][]) add(`${BUILDINGS[job].workerName}上限`, `+${number(slots)}`);
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
    if (id === 'foundry' && state.tech.includes('castingToolUpgrade')) add('锻造物产量', '+3%');
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
    }
    if (id === 'researchSatellite') {
      add('科学家知识产量', '+1%');
      add('实验室知识容量', '+5%');
    }
    if (id === 'asrielMine') {
      add('每行星居民铜产量', '+0.25/s');
      add('每行星居民钛产量', '+0.05/s');
    }
    if (id === 'ecologicalDome') add('每行星居民猫粮产量', '+0.25/s');
    if (id === 'planetaryFoundry') add('每行星居民锻造物产量加成', '+3%');
    if (id === 'miningDrone') add('塔卫二采矿站产量', '+5%');
    if (id === 'geothermalPlant') add('月球铱矿产量', '+5%');
    if (id === 'ecologicalDome') add('每座Asriel居住站猫口容量', '+0.05');
    if (building.cap) add('猫口容量', `+${number(building.cap + (id === 'asrielResidence' ? .05 * snapshot.asriel.allocations.ecologicalDome : 0))}`);
    if (building.soldierCap) add('士兵容量', `+${number(building.soldierCap)}`);
    if (building.trainingBoost) add('训练效果', `+${percent(calculateTrainingBoost(state))}%`);
    if (building.lines) add('生产线容量', `+${number(building.lines)}`);
    if (id === 'smelter') add('冶炼厂工位', '+1', false, '冶炼厂本身不产出也不消耗资源；资源由钢冶炼工位产出和消耗，可在设置中查看配方并分配。');
    if (id === 'stellarForge') { add('冶炼厂工位', '+2'); add('工匠上限', '+2'); add('锻造物产量', '+10%'); }
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
      const coefficient = state.tech.includes('starRingOptimization') ? .6 + .01 * (snapshot.asriel.allocations.alienMaterialLab || 0) : .5;
      add('每Asriel行星居民使太空资源产量', `+${percent(coefficient)}%`);
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
      add('分段进度', `${Math.min(count, building.segmentedRequired!)} /${building.segmentedRequired}`);
      add('量子水平', '+25%');
      add('氦-3', '-25/s', true);
      add('电力', '-100', true);
    }
  } else if (target.kind === 'mission' && Object.hasOwn(REGIONAL_MISSIONS, target.id)) {
    const id = target.id as RegionalMissionId, mission = REGIONAL_MISSIONS[id];
    tip.title = mission.name;
    tip.description = mission.desc;
    tip.costs = prices(calculateRegionalMissionCost(state, id));
    add('完成后解锁', mission.unlock);
    add('状态', isRegionalMissionCompleted(state, id) ? '已完成' : state.queue.some(item => item.kind === 'mission' && item.id === id) ? '已在建筑队列' : '未完成');
  } else if (target.kind === 'ship' && Object.hasOwn(SHIP_COMPONENTS, target.id)) {
    const id = target.id as ShipComponentId, component = SHIP_COMPONENTS[id];
    const labels: Record<ShipComponentId, string> = { hull: '船体', energyCore: '能源核心', computer: '舰载计算机', ecosystem: '生态系统', electromagneticEngine: '电磁引擎', fuel: '装填能源' };
    tip.title = `ESS-喵星号 · ${labels[id]}`;
    tip.description = component.desc;
    const { population, ...remaining } = calculateShipComponentRemainingCost(id, state);
    tip.costs = prices(remaining);
    if (population && population > 0) tip.costs.push({ id: 'population', name: '猫猫', amount: population, missing: state.population < population, blocked: false });
    add('建设进度', `${Number(calculateShipComponentProgress(id, state).toFixed(2))}%`);
    add('状态', state.shipComponents?.[id] ? '已完成' : id !== 'hull' && !state.shipComponents?.hull ? '构建船体之前不可用' : !isShipComponentUnlocked(id, state) ? '需要星际船坞' : state.queue.some(item => item.kind === 'ship' && item.id === id) ? '已在建筑队列' : '未完成');
    for (const [resource] of orderedCostEntries(component.cost)) add(`${RESOURCES[resource as ResourceId].name}已投入`, `${Number((state.shipResourceProgress?.[id]?.[resource as ResourceId] || 0).toFixed(2))}%`);
    if (component.population) add('猫猫已投入', `${Number((state.shipResourceProgress?.[id]?.population || 0).toFixed(2))}%`);
  } else if (target.kind === 'arpa' && Object.hasOwn(ARPA_PROJECTS, target.id)) {
    const id = target.id as ArpaProjectId;
    tip.title = ARPA_PROJECTS[id].name;
    tip.description = calculateProjectDescription(id, state);
    const progress = state.arpaProgress[id] || 0;
    tip.costs = prices(Object.fromEntries(Object.entries(calculateProjectCost(id, state)).map(([resource, total]) => [resource, total * (100 - progress) / 100])));
  } else if (target.kind === 'crispr' && Object.hasOwn(CRISPR_UPGRADES, target.id)) {
    const id = target.id as CrisprUpgradeId, upgrade = CRISPR_UPGRADES[id];
    tip.title = upgrade.name;
    tip.description = upgrade.desc;
    if (id === 'spatialReasoning' || id === 'dimensionCompression' || id === 'dimensionDistortion') {
      const rate = id === 'dimensionDistortion' ? .08 : id === 'dimensionCompression' ? .06 : .04;
      tip.description = `每个有效粒子使普通资源储量提高${rate}%；高级修饰覆盖低级效果，不叠加。不影响电力、知识和锻造物。`;
      add('储量有效粒子数', number(calculateEffectiveParticleCount(state)));
      if (isChallengeGeneActive(state, 'particleImbalance')) tip.footnote = '粒子失衡期间，开局粒子不提供储量加成。';
    } else if (id === 'casimirEffect') {
      tip.description = '每个卡西米尔晶体使普通资源储量提高0.08%，与粒子储量加成相加。不影响电力、知识和锻造物。';
    }
    tip.costs = [{ id: 'particles', name: '粒子', amount: upgrade.cost, missing: state.prestige.particles < upgrade.cost, blocked: false }];
    add('状态', state.crispr.includes(id) ? '已完成' : '未完成');
    if (upgrade.pre.length) add('前置修饰', upgrade.pre.map(parent => CRISPR_UPGRADES[parent].name).join(' · '));
  } else if (target.kind === 'tech' && Object.hasOwn(TECHNOLOGIES, target.id)) {
    const id = target.id as TechnologyId, tech = TECHNOLOGIES[id];
    tip.title = tech.name;
    tip.description = tech.desc;
    if (tech.warning) tip.warning = tech.warning;
    tip.costs = prices(calculateTechCost(id, state));
    add('状态', state.tech.includes(id) ? '已研究' : state.queue.some(item => item.kind === 'tech' && item.id === id) ? '已在研究队列' : '未研究');
    if (tech.prestigeResetsRequired) add('所需威望重置次数（不含软重置）', String(tech.prestigeResetsRequired));
    if (tech.pre.length) add('前置科技', tech.pre.map(parent => TECHNOLOGIES[parent].name).join(' · '));
    if (tech.kerberosMissionRequired) add('所需探索任务', 'Kerberos探查');
    if (tech.spaceMissionRequired) add('所需探索任务', SPACE_MISSIONS[tech.spaceMissionRequired].name);
    if (tech.buildingRequired) add('所需建筑', BUILDINGS[tech.buildingRequired].name);
    if (tech.resourceRequired) add('所需解锁资源', RESOURCES[tech.resourceRequired].name);
    if (tech.arpaPre) add('所需已建工程', `${ARPA_PROJECTS[tech.arpaPre].name} ×${tech.arpaRequiredCount || 1}`);
  } else if ((target.kind === 'storage' || target.kind === 'resource') && Object.hasOwn(RESOURCES, target.id)) {
    const id = target.id as ResourceId;
    if (id === 'energy') {
      const result = uiPreview.production(state, props.revision);
      const breakdown = calculateResourceBreakdown(id, state, result);
      tip.title = '电力固定供给与占用';
      tip.description = '电力为固定供给，不累积库存；建筑运行时占用供电，停机后释放。';
      add('总发电量', formatResourceNumber(result.power.generated));
      add('已占用电力', formatResourceNumber(result.power.used));
      add('可用电力', formatResourceNumber(result.power.available));
      const powerRows = (kind: 'income' | 'expense') => breakdown.entries.filter(row => row.kind === kind && row.value !== 0).map(row => ({
        name: row.name.replace(/产出$/, '供给').replace(/消耗$/, '占用'),
        value: `${row.value < 0 ? '−' : '+'}${formatResourceNumber(Math.abs(row.value))}`,
        negative: row.value < 0,
        note: row.note.replace(/\/s/g, '').replace(/产量/g, '供给'),
      }));
      tip.income = powerRows('income');
      tip.expense = powerRows('expense');
      tip.footnote = '固定电力分配随建筑、供能和燃料状态重新计算，不随时间储存。';
      return tip;
    }
    const storage = calculateStorageDetails(id, state, snapshot);
    tip.title = `${RESOURCES[id].name}${target.kind === 'storage' ? '储量' : '收支'}`;
    if (target.kind === 'storage') {
      for (const row of storage.rows) add(row.name, `+${id === 'bytes' ? formatByteNumber(row.value) : formatResourceNumber(row.value)}`);
      if (!storage.rows.length) tip.description = id === 'water' ? '水的基础容量为0，需要获得供电和支持的采冰船或小行星基地提供容量；不能分配集装箱。' : '锻造物不受储量上限限制。';
      tip.footnote = '储量使用当前供能与支持状态计算；降低上限后超出的资源会被截断。';
    } else {
      const result = uiPreview.production(state, props.revision);
      const breakdown = calculateResourceBreakdown(id, state, result);
      if (Object.hasOwn(CRAFT_RECIPES, id)) {
        const craftId = id as keyof typeof CRAFT_RECIPES;
        const recipe = CRAFT_RECIPES[craftId];
        const batches = result.inputUnits[`craft:${craftId}`] || 0;
        add('已分配工匠', number(state.craftWorkers[craftId] || 0));
        add('当前实际锻造产量', signedRate(result.outputs[`craft:${craftId}`] || 0));
        add('每批配方消耗', recipeText(recipe.input));
        for (const [resource, amount] of orderedCostEntries(recipe.input)) {
          add(`实际消耗 · ${RESOURCES[resource as ResourceId].name}`, signedRate(-amount * batches), batches > 0);
        }
      }
      tip.income = calculateResourceFactorRows(id, state, result).rows.map(row => ({ ...row, negative: row.value.startsWith('−') }));
      tip.expense = calculateResourceExpenseRows(breakdown).map(row => {
        // The legacy helper's community note predates the current food rule.
        // Keep its row structure but derive the percentage from live rules.
        const value = id === 'food' && row.child && row.name === '猫猫社区'
          ? `−${percent((1 - calculateFoodPerCat(state) / CONFIG.foodPerCat) * 100)}%` : row.value;
        return { ...row, value, negative: value.startsWith('−') };
      });
      const rate = breakdown.net;
      const amount = state.resources[id];
      const cap = storage.total;
      if (amount <= 0) {
        tip.resourceTiming = '已降为0';
      } else if (Number.isFinite(cap) && amount >= cap) {
        tip.resourceTiming = '已达到储量上限';
      } else if (rate > 0 && Number.isFinite(cap)) {
        tip.resourceTiming = `距离${duration(Math.ceil((cap - amount) / rate))}到达上限`;
      } else if (rate < 0) {
        tip.resourceTiming = `距离${duration(Math.ceil(amount / -rate))}到达0`;
      }

    }
  } else if (target.kind === 'morale') {
    const morale = moraleSnapshot(state, 1, props.revision);
    tip.title = '幸福度';
    add('当前有效值', `${percent(morale.happiness)}%`);
    add('当前实际值', `${percent(morale.raw)}%`);
    add('当前上限', `${percent(morale.cap)}%`);
    const influence = (name: string, value: number) => {
      if (value !== 0) tip.income.push({ name, value: `${value < 0 ? '−' : '+'}${percent(Math.abs(value))}%`, negative: value < 0 });
    };
    influence('基准', morale.base);
    influence('社区', morale.community);
    influence('猫口压力', -morale.populationPenalty);
    influence('士兵名额压力', -morale.soldierPenalty);
    influence('税率影响', -morale.taxPenalty);
    influence('体制压力', -morale.governmentPenalty);
    influence(`艺术家 ×${number(morale.artistCount)}`, morale.artists);
    influence('广播塔', morale.broadcast);
    influence('观光空间站', morale.station);
    influence('广播信标', morale.beacon);
    influence('VR中心', morale.vr);
    influence('世界模拟器', morale.worldSimulator);
    influence('AGI核心组件', morale.agi);
    tip.footnote = '实际值最低为0%，不受上限限制；有效值限制在40%至当前上限之间。';
  } else if (target.kind === 'housing') {
    const housing = calculateHousingDetails(state, snapshot.asriel, snapshot.stageThree, snapshot.digital);
    tip.title = '猫口容量';
    add('当前猫口 / 容量', `${number(state.population)} / ${number(floorWithPrecision(housing.reduce((sum, row) => sum + row.value, 0)))}`);
    for (const row of housing) add(row.name, `+${number(row.value)}`);

  } else if (target.kind === 'prestige' && target.id === 'harmonyCrystals') {
    tip.title = '和谐晶体';
    tip.description = '通过数字化飞升获得的永久威望资源，跨周目保留。';
    add('当前持有', number(state.prestige.harmonyCrystals));
    add('累计获取', number(state.statistics.lifetime.harmonyCrystalsEarned));
    add('数字化飞升次数', number(state.prestige.ascensionResets));
  } else if (target.kind === 'prestige' && target.id === 'darkEnergy') {
    tip.title = '暗能量';
    tip.description = '暗能量通过奇异失控引发的黑洞重置获得，跨周目保留。每个暗能量使普通资源储量提高1%（暗能量加成）。';
    add('当前持有', number(state.prestige.darkEnergy));
    add('每个暗能量', '普通资源储量 +1%');
    add('暗能量储量倍率', `×${number(1 + calculateDarkEnergyStorageBonus(state))}`);
    tip.footnote = '暗能量加成与粒子、卡西米尔储量加成独立相乘，不影响电力、知识和锻造物。';
  } else if (target.kind === 'prestige' && target.id === 'casimir') {
    tip.title = '卡西米尔晶体';
    tip.description = '卡西米尔晶体可以推迟粒子的软上限，减轻粒子产量加成的衰减。通过发射ESS-喵星号离开太阳系获得，跨周目保留。';
    add('当前持有', number(state.prestige.casimir));
    add('每个卡西米尔', '粒子的软上限 +1');
    add('当前粒子软上限', number(CONFIG.particleProductionSoftCap + state.prestige.casimir));
    const storageBonus = calculateCrisprStorageBonus(state);
    if (storageBonus.casimirRate > 0) {
      add('卡西米尔效应：每个晶体普通资源储量', `+${percent(storageBonus.casimirRate * 100)}%`);
      add('卡西米尔储量总加成', `+${percent(storageBonus.casimirBonus * 100)}%`);
      tip.footnote = '储量加成与粒子储量加成相加，不影响电力、知识和锻造物。';
    }
  } else if (target.kind === 'prestige') {
    tip.title = '粒子';
    const ordinary = (calculateParticleMultiplier('food', state) - 1) * 100;
    const crafted = (calculateParticleMultiplier('plank', state) - 1) * 100;
    const effect = (value: number) => String(Number(value.toFixed(3)));
    const effectiveParticles = calculateEffectiveParticleCount(state);
    const storageBonus = calculateCrisprStorageBonus(state);
    const imbalance = isChallengeGeneActive(state, 'particleImbalance');
    tip.description = `当前持有${number(state.prestige.particles)}粒子，当前实际加成为普通资源产量 +${effect(ordinary)}%，锻造物产量 +${effect(crafted)}%；电力不受加成。`;
    add('当前持有粒子', number(state.prestige.particles));
    if (imbalance) add('挑战有效粒子数', number(effectiveParticles));
    add('产量有效粒子数（衰减后）', effect(calculateEffectiveParticles(effectiveParticles, CONFIG.particleProductionSoftCap + state.prestige.casimir)));
    add('产量软上限', String(CONFIG.particleProductionSoftCap + state.prestige.casimir));
    if (storageBonus.particleUpgrade) {
      add(`${CRISPR_UPGRADES[storageBonus.particleUpgrade].name}：每个有效粒子储量`, `+${effect(storageBonus.particleRate * 100)}%`);
      add('粒子储量总加成', `+${effect(storageBonus.particleBonus * 100)}%`);
    }
    tip.footnote = `${imbalance ? '粒子失衡：开局粒子不提供产量或储量加成，仅新获得的有效粒子生效。' : ''}产量加成连续递减，超过软上限后递减加速；CRISPR储量加成按有效粒子数计算，不受产量衰减影响。高级储量修饰覆盖低级效果，不叠加。`;
  } else return null;
  if (target.kind === 'building') {
    tip.description = tip.description.replace(/(电力(?:消耗减少)?\s*[+−-]?\s*\d+(?:\.\d+)?)\/s/g, '$1');
  }
  return tip;
});

const splitEnergyExpense = computed(() => selected.value?.kind === 'resource'
  && selected.value.id === 'energy' && (content.value?.expense.length || 0) > 15);

function trigger(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(selector) : null;
}
function contains(target: EventTarget | null): boolean {
  return target instanceof Node && !!(anchor.value?.contains(target) || panel.value?.contains(target));
}
function hide(): void {
  selected.value = null;
  anchor.value = null;
  pinned.value = false;
}
function show(element: HTMLElement): void {
  const kind = element.dataset.tipKind as TipKind;
  if (!kinds.includes(kind)) return;
  anchor.value = element;
  selected.value = { id: element.dataset.buildingTip || '', kind };
  void nextTick(reposition);
}
function reposition(): void {
  if (!anchor.value || !panel.value) return;
  if (!anchor.value.isConnected) { hide(); return; }
  const source = anchor.value.getBoundingClientRect(), box = panel.value.getBoundingClientRect();
  const pad = 8, gap = 8, width = window.innerWidth, height = window.innerHeight;
  const left = Math.max(pad, Math.min(source.left, width - box.width - pad));
  const below = source.bottom + gap;
  const top = Math.max(pad, Math.min(below + box.height <= height - pad ? below : source.top - box.height - gap, height - box.height - pad));
  position.value = { left: `${left}px`, top: `${top}px` };
}
function pointerOver(event: PointerEvent): void {
  if (event.pointerType === 'touch') return;
  const element = trigger(event.target);
  if (element?.matches('[data-buy][data-tip-kind="building"],.building-button[data-tip-kind="mission"]')) hoveredBuilding = element;
  if (element && element !== anchor.value) { pinned.value = false; show(element); }
}
function pointerOut(event: PointerEvent): void {
  if (hoveredBuilding && event.target instanceof Node && hoveredBuilding.contains(event.target)
    && !(event.relatedTarget instanceof Node && hoveredBuilding.contains(event.relatedTarget))) {
    const leaving = hoveredBuilding;
    hoveredBuilding = null;
    if (anchor.value === leaving) hide();
    return;
  }
  if (!pinned.value && contains(event.target) && !contains(event.relatedTarget)) hide();
}
function focusIn(event: FocusEvent): void {
  const element = trigger(event.target);
  if (element) { pinned.value = false; show(element); }
}
function focusOut(event: FocusEvent): void {
  if (!pinned.value && contains(event.target) && !contains(event.relatedTarget)) hide();
}
function click(event: MouseEvent): void {
  const element = trigger(event.target);
  if (!element) { if (!contains(event.target)) hide(); return; }
  // Standalone info buttons open a tip, never purchase a building on touch.
  if (element.matches('.building-info,[data-tip-only]')) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (element === hoveredBuilding) {
    show(element);
    pinned.value = false;
    return;
  }
  if (pinned.value && element === anchor.value) hide();
  else { show(element); pinned.value = true; }
}
function keydown(event: KeyboardEvent): void { if (event.key === 'Escape') hide(); }
watch(content, () => { void nextTick(reposition); });
onMounted(() => {
  document.addEventListener('pointerover', pointerOver);
  document.addEventListener('pointerout', pointerOut);
  document.addEventListener('focusin', focusIn);
  document.addEventListener('focusout', focusOut);
  document.addEventListener('click', click, true);
  document.addEventListener('keydown', keydown);
  document.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
});
onUnmounted(() => {
  document.removeEventListener('pointerover', pointerOver);
  document.removeEventListener('pointerout', pointerOut);
  document.removeEventListener('focusin', focusIn);
  document.removeEventListener('focusout', focusOut);
  document.removeEventListener('click', click, true);
  document.removeEventListener('keydown', keydown);
  document.removeEventListener('scroll', reposition, true);
  window.removeEventListener('resize', reposition);
});
</script>

<template>
  <Teleport :to="anchor?.closest('dialog') || 'body'">
    <div v-if="content" ref="panel" id="gameTooltip" class="building-tooltip" :class="{ 'resource-detail': selected?.kind === 'resource', 'morale-detail': selected?.kind === 'morale', 'energy-expense-split': splitEnergyExpense }" role="tooltip" :style="position">
      <h3>{{ content.title }}</h3>
      <p v-if="content.description" class="tip-desc" :style="selected?.kind === 'building' && ['aiSupercore', 'spaceRipper', 'penroseSphere'].includes(selected.id) ? { whiteSpace: 'pre-line' } : undefined">{{ content.description }}</p>
      <p v-if="content.warning" class="tip-desc danger" data-tech-warning>{{ content.warning }}</p>
      <template v-if="content.costs.length">
        <p class="tip-label">{{ selected?.kind === 'arpa' || selected?.kind === 'ship' || anchor?.dataset.queueUid ? '剩余资源需求' : selected?.kind === 'building' && BUILDINGS[selected.id as BuildingId]?.segmentedRequired ? '每段固定价格' : '当前价格' }}</p>
        <div v-for="cost in content.costs" :key="cost.id" class="tip-cost" :class="{ 'is-cap-blocked': cost.blocked, 'is-missing': !cost.blocked && cost.missing }">{{ cost.name }} {{ selected?.kind === 'building' && ['swarmSatellite', 'swarmFactory'].includes(selected.id) && cost.amount < 1 ? '0' : cost.id === 'bytes' ? formatByteNumber(cost.amount, false, 10000) : formatCostNumber(cost.amount) }}</div>
        <hr>
      </template>
      <p v-if="selected?.kind === 'building' && content.rows.length" class="tip-label">建筑效果</p>
      <template v-if="selected?.kind !== 'morale'">
        <div v-for="(row, index) in content.rows" :key="index" class="resource-factor" :class="{ child: row.child }">
          <span>{{ row.name }}</span><span class="resource-factor-value" :class="{ 'is-negative': row.negative }">{{ row.value }}</span>
          <span v-if="row.note" class="rate-note">{{ row.note }}</span>
        </div>
      </template>
      <div v-if="selected?.kind === 'morale'" class="morale-columns">
        <div class="resource-column" data-morale-summary>
          <div class="resource-column-title">幸福度</div>
          <div v-for="(row, index) in content.rows" :key="index" class="resource-factor"><span>{{ row.name }}</span><span class="resource-factor-value">{{ row.value }}</span></div>
        </div>
        <div class="resource-column" data-morale-influences>
          <div class="resource-column-title">当前影响</div>
          <div v-for="(row, index) in content.income" :key="index" class="resource-factor"><span>{{ row.name }}</span><span class="resource-factor-value" :class="{ 'is-negative': row.negative }">{{ row.value }}</span></div>
        </div>
      </div>
      <div v-if="selected?.kind === 'resource'" class="resource-columns">
        <div class="resource-column">
          <div class="resource-column-title">{{ selected.id === 'energy' ? '固定供给' : '来源与产量倍率' }}</div>
          <div v-for="(row, index) in content.income" :key="index" class="resource-factor" :class="{ child: row.child, 'last-child': row.child && !content.income[index + 1]?.child }"><span>{{ row.name }}</span><span class="resource-factor-value" :class="{ 'is-negative': row.negative }">{{ row.value }}</span></div>
          <p v-if="!content.income.length" class="small subtle">{{ selected.id === 'energy' ? '暂无供电来源。' : '暂无生产来源。' }}</p>
        </div>
        <div class="resource-column">
          <div class="resource-column-title">{{ selected.id === 'energy' ? '固定占用' : '消耗' }}</div>
          <div class="expense-list" :class="{ 'expense-list-split': splitEnergyExpense }">
            <div v-for="(row, index) in content.expense" :key="index" class="resource-factor" :class="{ child: row.child, 'last-child': row.child && !content.expense[index + 1]?.child }"><span>{{ row.name }}</span><span class="resource-factor-value" :class="{ 'is-negative': row.negative }">{{ row.value }}</span></div>
          </div>
          <p v-if="!content.expense.length" class="small subtle">{{ selected.id === 'energy' ? '暂无电力占用。' : '暂无消耗。' }}</p>
        </div>
      </div>
      <p v-if="content.footnote" class="resource-footnote">{{ content.footnote }}</p>
      <p v-if="pinned" class="tip-hint">再次点击来源、点击空白处或按 Esc 关闭。</p>
      <p v-if="content.resourceTiming" class="resource-timing">{{ content.resourceTiming }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
.building-tooltip.morale-detail { width: 480px; max-width: calc(100vw - 16px); box-sizing: border-box; }
.morale-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 10px; margin-top: 6px; }
@media (max-width: 380px) {
  .morale-columns { grid-template-columns: minmax(0, 1fr); }
  .morale-columns > .resource-column + .resource-column { border-left: 0; padding-left: 0; border-top: 1px solid #68604e; padding-top: 6px; }
}
.building-tooltip.resource-detail.energy-expense-split { width: 620px; }
.energy-expense-split .resource-columns { grid-template-columns: minmax(0, 1.4fr) minmax(0, 2fr); }
.expense-list-split { column-count: 2; column-gap: 16px; }
.expense-list-split > .resource-factor { break-inside: avoid; }
</style>
