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
import { calculateBuildingCost, calculateHarmonyCreepReduction, isBuildingFullyBuilt } from '../../simulation/costs';
import { describeQueuedPurchases } from '../../simulation/purchases';
import { calculateTechCost, calculateBankerTaxRate, BANKER_TAX_BONUS, STOCK_EXCHANGE_BANKER_BONUS, GOVERNMENTS, soldierStatBreakdown } from '../../simulation/government';
import { SPACE_MISSIONS, REGIONAL_MISSIONS, calculateRegionalMissionCost, isRegionalMissionCompleted, type RegionalMissionId } from '../../simulation/space-missions';
import { calculateBuildingOutput, calculateToolMultiplier, calculateBuildingName } from '../../simulation/building-production';
import { SPACE_RIPPER_OVERCLOCK_DESC } from '../../simulation/building-effects';
import { calculateStorageDetails, calculateDarkEnergyStorageBonus } from '../../simulation/storage';
import { calculateHousingDetails } from '../../simulation/housing';
import { calculateEscapePrestigeReward, calculateCasimirReward, calculateBlackHolePrestigeRewards, calculateDigitalAscensionRewards } from '../../simulation/prestige';
import { calculatePrestigeReward } from '../../simulation/government';
import { canPayCost } from '../../simulation/costs';
import { calculateQuantumSnapshot } from '../../simulation/quantum';
import { uiPreview } from '../preview-cache';
import { calculateGravityConversionEnergy, formatBlackHoleMass } from '../../simulation/black-hole';
import { calculateResourceBreakdown, calculateResourceFactorRows, calculateResourceExpenseRows, signedRate } from '../../simulation/resource-breakdown';
import { calculateArtistEffect } from '../../simulation/morale';
import { calculateParticleMultiplier, calculateForgingToolBonus, artisanCraftRate } from '../../simulation/crafting';
import { calculateCrisprStorageBonus } from '../../simulation/crispr';
import { calculateEffectiveParticleCount, isChallengeGeneActive } from '../../simulation/challenges';
import { duration, fmt, moraleSnapshot, orderedCostEntries, percent, storageSnapshot } from '../format';
import { addBuildingEffectRows } from '../building-tooltip-rows';
import { isWorldUnified } from '../../simulation/neighbors';
import { TECH_CATEGORY_META, techCategory } from '../tech-categories';
import { allocateShipCrew, SHIP_CREW_SIZE, SHIP_CREW_JOB_NAME, type ShipCrewId } from '../../simulation/ship-crew';

const props = defineProps<{ state: GameState; revision: number }>();
type TipKind = 'building' | 'tech' | 'storage' | 'resource' | 'morale' | 'housing' | 'prestige' | 'prestige-reset' | 'crispr' | 'job' | 'craftJob' | 'arpa' | 'mission' | 'ship' | 'quantum' | 'government' | 'soldier';
const kinds: TipKind[] = ['building', 'tech', 'storage', 'resource', 'morale', 'housing', 'prestige', 'prestige-reset', 'crispr', 'job', 'craftJob', 'arpa', 'mission', 'ship', 'quantum', 'government', 'soldier'];
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
  /** Short line directly under the title. 科技 uses it for the category name. */
  subtitle?: string;
  /** Category id, so the subtitle can reuse the tech-tree border colour. */
  subtitleCategory?: string;
  description: string;
  costs: { id: string; name: string; amount: number; missing: boolean; blocked: boolean }[];
  rows: DetailRow[];
  /** 科技效果 sentences from the registry (`effects`), one per line. */
  effects: string[];
  /** 锻造物 only: additive tool-bonus sources shown under the upkeep column. */
  toolBonus?: { total: string; entries: { id: string; name: string; value: string }[] };
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
  const tip: TipContent = { title: '', description: '', costs: [], rows: [], effects: [], requirements: [], income: [], expense: [], footnote: '', resourceTiming: '' };
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
    // 工匠大师 doubles throughput, so show the effective rate rather than the recipe base.
    const rate = artisanCraftRate(recipe.rate, state);
    tip.title = `${RESOURCES[id].name}工匠`;
    tip.description = '每人基础产出与岗位消耗';
    add(RESOURCES[id].name, `+${number(rate)}/s`);
    for (const [resource, amount] of orderedCostEntries(recipe.input)) {
      add(RESOURCES[resource as ResourceId].name, `-${number(amount * rate)}/s`, true);
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
      add('锻造物', `+${number(artisanCraftRate(CRAFT_RECIPES[id as CraftId].rate, state))}/s`);
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
          * (id === 'forage' && state.tech.includes('agriculture') ? 1.5 : 1);
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
    // Every building renders its own description; `desc` is flavor-only data, so no
    // per-id allowlist is needed (the old one silently hid most descriptions).
    tip.description = building.desc || '';
    // 质量喷射 reveals the black hole's masses on the sphere it feeds.
    if (id === 'penroseSphere' && (state.buildings.massEjector || 0) > 0) tip.description += `\n黑洞质量：${formatBlackHoleMass(state.blackHole.mass)}\n奇异质量：${formatBlackHoleMass(state.blackHole.exoticMass)}`;
    if (id === 'penroseSphere' && state.tech.includes('gravityConversion')) tip.description += `\n引力转化：电力+${formatEffectNumber(calculateGravityConversionEnergy(state))}`;
    // The completed core keeps only its flavour line here: segment progress and the maintenance
    // rows live in the effect block, where they read the real construction-phase record.
    if (id === 'aiSupercore') tip.description = 'world.exection(cat);';
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
    addBuildingEffectRows({ id, building, state, snapshot, count, tip, add, number, percent, formatEffectNumber });
    // Mining ships stop when the idle cats run out; surface that above the generic rows.
    if (Object.hasOwn(SHIP_CREW_SIZE, id)) {
      const crew = allocateShipCrew(state), working = crew.working[id as ShipCrewId] || 0;
      const enabled = Math.max(0, count - (state.stoppedBuildings?.[id] || 0));
      if (enabled > working) tip.warning = `${SHIP_CREW_JOB_NAME}不足：空闲猫口只够 ${working} 座，${enabled - working} 座已停机；减少工作猫分配或增加猫口后自动恢复。`;
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
    // Category line: derived from the same registry that colours the tree button, so the
    // hover text and the border can never disagree. No per-technology string to maintain.
    const category = techCategory(id);
    const meta = TECH_CATEGORY_META.find(entry => entry.id === category);
    if (meta) { tip.subtitle = meta.name; tip.subtitleCategory = meta.id; }
    // 描述 = flavor only; every unlock/number lives in `effects`, rendered as its own
    // block below the price divider so the two never mix.
    tip.description = tech.desc ?? '';
    if (tech.warning) tip.warning = tech.warning;
    tip.costs = prices(calculateTechCost(id, state));
    tip.effects = [...(tech.effects ?? [])];
    add('状态', state.tech.includes(id) ? '已研究' : state.queue.some(item => item.kind === 'tech' && item.id === id) ? '已在研究队列' : '未研究');
    if (tech.prestigeResetsRequired) add('所需威望重置次数（不含软重置）', String(tech.prestigeResetsRequired));
    if (tech.pre.length) add('前置科技', tech.pre.map(parent => TECHNOLOGIES[parent].name).join(' · '));
    if (tech.kerberosMissionRequired) add('所需探索任务', 'Kerberos探查');
    if (tech.spaceMissionRequired) add('所需探索任务', SPACE_MISSIONS[tech.spaceMissionRequired].name);
    if (tech.buildingRequired) add('所需建筑', BUILDINGS[tech.buildingRequired].name);
    if (tech.resourceRequired) add('所需解锁资源', RESOURCES[tech.resourceRequired].name);
    if (tech.arpaPre) add('所需已建工程', `${ARPA_PROJECTS[tech.arpaPre].name} ×${tech.arpaRequiredCount || 1}`);
    // 世界统一 shows live occupation progress so the requirement is never a mystery.
    if (tech.occupiedNeighborsRequired !== undefined) {
      const occupied = isWorldUnified(state) ? 0 : state.neighbors.occupied.length;
      add('所需占领敌对国家', `${occupied} / ${tech.occupiedNeighborsRequired}`);
      tip.footnote = '占领全部敌对国家后即可研究；研究后敌对国家消失，占领加成替换为世界统一加成。';
    }
    if (tech.prestigeReset) {
      const rewards = calculateBlackHolePrestigeRewards(state);
      add('本次重置获得', `粒子 +${number(rewards.reward)} · 卡西米尔晶体 +${number(rewards.casimirReward)} · 暗能量 +${number(rewards.darkEnergyReward)}`);
      tip.footnote = '点击研究按钮立即执行黑洞重置并结束本周目。';
    }
  } else if ((target.kind === 'storage' || target.kind === 'resource') && Object.hasOwn(RESOURCES, target.id)) {
    const id = target.id as ResourceId;
    if (id === 'energy') {
      const result = uiPreview.production(state, props.revision);
      const breakdown = calculateResourceBreakdown(id, state, result);
      tip.title = '电力固定供给与占用';
      add('总发电量', formatResourceNumber(result.power.generated));
      add('请求用电量', formatResourceNumber(result.powerGrid.requested));
      add('实际耗电', formatResourceNumber(result.power.used));
      add('可用电力', formatResourceNumber(result.power.available), result.power.available < 0);
      if (result.power.available < 0) tip.warning = '供电不足：超额开启的建筑未获得供电，供能按钮以黄色标记；关闭超额负载或恢复发电后会重新分配供电。';
      // Power rows name the generating building directly: the breakdown appends 产出/消耗 for the
      // generic resource tooltips, which reads as noise inside a dedicated power breakdown.
      const powerRows = (kind: 'income' | 'expense') => breakdown.entries.filter(row => row.kind === kind && row.value !== 0).map(row => ({
        name: row.name.replace(/(?:产出|消耗|占用)$/, ''),
        value: `${row.value < 0 ? '−' : '+'}${formatResourceNumber(Math.abs(row.value))}`,
        negative: row.value < 0,
        note: row.note.replace(/\/s/g, ''),
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
      // 锻造物: the additive 锻造工具加成 sources share one column with upkeep.
      if (RESOURCES[id].crafted) {
        const planetaryResidents = state.buildings.planetaryFoundry
          ? Math.min(state.population, state.workers.asrielResidence || 0, result.asriel.allocations.asrielResidence * 2) : 0;
        const planetaryAllocated = state.buildings.planetaryFoundry ? result.asriel.allocations.planetaryFoundry || 0 : 0;
        const tool = calculateForgingToolBonus(state, planetaryResidents, planetaryAllocated);
        if (tool.total > 0) {
          const fmtPct = (value: number) => `+${percent(value * 100)}%`;
          tip.toolBonus = {
            total: fmtPct(tool.total),
            entries: tool.entries.map(entry => ({ id: entry.id, name: entry.name, value: fmtPct(entry.value) })),
          };
        }
      }
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
  } else if (target.kind === 'soldier') {
    // 单兵战斗力/防御力: every contributing source, derived from the same registries the
    // calculators read, so the explained number is exactly the displayed one.
    const stats = soldierStatBreakdown(state);
    const signed = (value: number) => `+${formatEffectNumber(value)}`;
    if (target.id === 'combatPower') {
      tip.title = '单兵战斗力';
      tip.description = '决定突袭时的我方战力（士兵数^0.75 × 单兵战斗力）。基础值为1，装备科技提供固定加算，军政与泰坦之力再按百分比放大。';
      add('基础', formatEffectNumber(stats.combatPower.base));
      for (const source of stats.combatPower.flat) add(source.name, signed(source.value));
      for (const source of stats.combatPower.percent) add(source.name, `+${percent(source.value * 100)}%`);
      add('当前单兵战斗力', formatEffectNumber(stats.combatPower.total));
      tip.footnote = '百分比加成只放大固定部分；装备科技全部研究后固定值为 5。';
    } else {
      tip.title = '单兵防御力';
      tip.description = '防御力只减少士兵伤亡，不改变战力：每点使突袭与反击中的伤亡乘以 1 / (1 + 防御力 × 0.1)。';
      add('基础', formatEffectNumber(stats.defense.base));
      for (const source of stats.defense.flat) add(source.name, signed(source.value));
      add('当前单兵防御力', formatEffectNumber(stats.defense.total));
      add('伤亡倍率', `×${formatEffectNumber(stats.defense.casualtyMultiplier)}`);
      tip.footnote = '防御力递减叠加：4 点满装时伤亡约为无装备时的 71%。';
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

  } else if (target.kind === 'prestige-reset') {
    // Hover preview of exactly what this reset run will award; the simulation
    // calculators are pure and stay authoritative over any hard-coded text.
    const kind = target.id;
    if (kind === 'nuclear') {
      const reward = calculatePrestigeReward(state);
      tip.title = '发射核弹';
      tip.description = '立即结束本周目并开启新的周目，保留威望资源、CRISPR修饰、成就与重置记录。';
      add('粒子', `+${number(reward)}`);
    } else if (kind === 'escape') {
      const reward = calculateEscapePrestigeReward(state), casimir = calculateCasimirReward(reward, state);
      tip.title = '发射ESS-喵星号';
      tip.description = '离开太阳系将结束本周目，保留威望资源、CRISPR修饰、成就与重置记录，重新开始文明。';
      add('粒子', `+${number(reward)}`);
      add('卡西米尔晶体', `+${number(casimir)}`);
    } else if (kind === 'blackHole') {
      const rewards = calculateBlackHolePrestigeRewards(state);
      tip.title = '奇异失控：黑洞重置';
      tip.description = '向不稳定的黑洞投入奇异物质将引发黑洞重置：结束本周目，保留威望资源、CRISPR修饰、成就与重置记录，重新开始文明。警告：这可能会导致无法预料的爆炸，毁灭一切，无限，永恒。';
      add('粒子', `+${number(rewards.reward)}`);
      add('卡西米尔晶体', `+${number(rewards.casimirReward)}`);
      add('暗能量', `+${number(rewards.darkEnergyReward)}`);
      if (!canPayCost(state.resources, calculateTechCost('exoticRunaway', state))) tip.warning = '资源不足，无法支付奇异失控的研究费用。';
    } else if (kind === 'ascension') {
      const rewards = calculateDigitalAscensionRewards(state);
      tip.title = '数字化飞升';
      tip.description = '数字化飞升将结束当前文明并开启新的周目，保留永久威望奖励、基因修饰与历史统计。';
      add('粒子', `+${number(rewards.reward)}`);
      add('卡西米尔晶体', `+${number(rewards.casimirReward)}`);
      add('和谐晶体', `+${number(rewards.harmonyReward)}`);
    } else return null;
    tip.footnote = '点击按钮立即执行重置；奖励按当前文明状态计算，执行时可能略有变化。';
  } else if (target.kind === 'prestige' && target.id === 'harmonyCrystals') {
    tip.title = '和谐水晶';
    tip.description = `当前已生效${formatResourceNumber(state.prestige.harmonyCrystals)}个和谐水晶，地面之外的建筑成本蠕变-${formatEffectNumber(calculateHarmonyCreepReduction(state))}`;
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
    add('产量软上限', String(CONFIG.particleProductionSoftCap + state.prestige.casimir));
    if (storageBonus.particleUpgrade) {
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
      <p v-if="content.subtitle" class="tip-subtitle" :data-tech-category="content.subtitleCategory" data-tip-subtitle>{{ content.subtitle }}</p>
      <p v-if="content.description" class="tip-desc" :style="selected?.kind === 'building' && ['aiSupercore', 'spaceRipper', 'penroseSphere'].includes(selected.id) ? { whiteSpace: 'pre-line' } : undefined">{{ content.description }}</p>      <p v-if="content.warning" class="tip-desc danger" data-tech-warning>{{ content.warning }}</p>
      <template v-if="content.costs.length">
        <p class="tip-label">{{ selected?.kind === 'arpa' || selected?.kind === 'ship' || anchor?.dataset.queueUid ? '剩余资源需求' : selected?.kind === 'building' && BUILDINGS[selected.id as BuildingId]?.segmentedRequired ? '每段固定价格' : '当前价格' }}</p>
        <div v-for="cost in content.costs" :key="cost.id" class="tip-cost" :class="{ 'is-cap-blocked': cost.blocked, 'is-missing': !cost.blocked && cost.missing }">{{ cost.name }} {{ selected?.kind === 'building' && ['swarmSatellite', 'swarmFactory'].includes(selected.id) && cost.amount < 1 ? '0' : cost.id === 'bytes' ? formatByteNumber(cost.amount, false, 10000) : formatCostNumber(cost.amount) }}</div>
        <hr>
      </template>
      <p v-if="selected?.kind === 'tech' || (selected?.kind === 'building' && content.rows.length)" class="tip-label">{{ selected?.kind === 'tech' ? '科技效果' : '建筑效果' }}</p>
      <p v-for="(effect, index) in content.effects" :key="`effect-${index}`" class="tip-effect" data-tip-effect>{{ effect }}</p>
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
          <div class="resource-column-title">{{ selected.id === 'energy' ? '发电建筑' : '来源与产量倍率' }}</div>
          <div v-for="(row, index) in content.income" :key="index" class="resource-factor" :class="{ child: row.child, 'last-child': row.child && !content.income[index + 1]?.child }"><span>{{ row.name }}</span><span class="resource-factor-value" :class="{ 'is-negative': row.negative }">{{ row.value }}</span></div>
          <p v-if="!content.income.length" class="small subtle">{{ selected.id === 'energy' ? '暂无供电来源。' : '暂无生产来源。' }}</p>
        </div>
        <div class="resource-column">
          <div class="resource-column-title">{{ selected.id === 'energy' ? '实际耗电明细' : '消耗' }}</div>
          <div class="expense-list" :class="{ 'expense-list-split': splitEnergyExpense }">
            <div v-for="(row, index) in content.expense" :key="index" class="resource-factor" :class="{ child: row.child, 'last-child': row.child && !content.expense[index + 1]?.child }"><span>{{ row.name }}</span><span class="resource-factor-value" :class="{ 'is-negative': row.negative }">{{ row.value }}</span></div>
          </div>
          <p v-if="!content.expense.length" class="small subtle">{{ selected.id === 'energy' ? '暂无电力占用。' : '暂无消耗。' }}</p>
          <!-- 锻造物: every additive 锻造工具加成 source, in the same column as upkeep. -->
          <template v-if="content.toolBonus">
            <div class="resource-column-title" data-tool-bonus-title>锻造工具加成</div>
            <div class="resource-factor" data-tool-bonus-total><span>合计</span><span class="resource-factor-value">{{ content.toolBonus.total }}</span></div>
            <div v-for="entry in content.toolBonus.entries" :key="entry.id" class="resource-factor" :class="{ child: true }" :data-tool-bonus="entry.id"><span>{{ entry.name }}</span><span class="resource-factor-value">{{ entry.value }}</span></div>
          </template>
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
