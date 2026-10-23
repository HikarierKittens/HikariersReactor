import { BUILDINGS } from '../../data/buildings';
import { TECHNOLOGIES } from '../../data/technologies';
import { ARPA_PROJECTS } from '../../data/projects';
import { RESOURCES } from '../../data/resources';
import { NEIGHBORS } from '../../data/neighbors';
import type { NeighborId } from '../../data/neighbors';
import { calculateSupportPreview } from '../support-preview';
import { calculateStorageTotals } from '../storage';
import { calculateHousingDetails, countRunningBuildings } from '../housing';
import { previewMorale, calculateProduction } from '../production';
import { isBuildingUnlocked, isResourceUnlocked, isTechnologyUnlocked } from '../unlocks';
import { isPurchaseAllowed } from '../purchases';
import { calculateWorkerCapacity } from '../building-production';
import { calculateBuildingCost, buildPriceContext } from '../costs';
import { isRegionalMissionAvailable } from '../space-missions';
import { isProjectUnlocked } from '../projects';
import { countSparePopulation } from '../ship-crew';
import { countCraftWorkers } from '../crafting';
import { calculateEjectionCapacity } from '../black-hole';
import { calculateArmyLimit } from '../government';
import { floorWithPrecision } from '../../shared/format';
import type { GameState } from '../../types/state';
import type { BuildingId } from '../../types/buildings';
import type { ResourceId } from '../../types/economy';
import type { TechnologyId } from '../../types/technologies';
import type { CompareOperator, ConditionRow, ConditionSourceId } from '../../types/automation';

/**
 * 条件求值：参考脚本 `checkTypes` + `checkCompare` 的等价物。
 *
 * 用固定读取器表代替 `eval`：配置里只出现"取哪个值"和"怎么比较"，永远不会执行代码，
 * 导入别人的配置也不会带入可执行内容。读取器只读状态，可反复调用；
 * 未知来源或非法参数一律返回 `undefined`，由 `evaluateConditionRow` 判否。
 */

export interface ConditionContext {
  state: GameState;
  /** 惰性派生的派生量；一次求值只算一次，避免每条条件都重跑结算。 */
  storageCaps: () => Record<ResourceId, number>;
  rates: () => Record<ResourceId, number>;
  housing: () => number;
}

/** 住房上限与运行时、存档校验同源。 */
export function calculateAutomationHousingCapacity(state: GameState): number {
  const support = calculateSupportPreview(state);
  return floorWithPrecision(calculateHousingDetails(state, support.asriel, support.stageThree, support.digital).reduce((sum, row) => sum + row.value, 0));
}

export function createConditionContext(state: GameState): ConditionContext {
  let caps: Record<ResourceId, number> | undefined;
  let rates: Record<ResourceId, number> | undefined;
  let housing: number | undefined;
  return {
    state,
    storageCaps: () => {
      if (caps === undefined) {
        const support = calculateSupportPreview(state);
        caps = calculateStorageTotals(state, { ...support, moonBaseUnits: support.moon.baseUnits });
      }
      return caps;
    },
    rates: () => {
      if (rates === undefined) rates = calculateProduction(state, 1).rates;
      return rates;
    },
    housing: () => {
      if (housing === undefined) housing = calculateAutomationHousingCapacity(state);
      return housing;
    },
  };
}

export type ConditionResult = number | boolean | string;

/** 资源“满足度”：1 表示刚好够用，>1 表示有余量。储量上限为 0 时视为未解锁，返回 1。 */
function resourceSatisfiedRatio(state: GameState, cap: number, id: ResourceId): number {
  const income = calculateProduction(state, 1).rates[id] || 0;
  const stock = state.resources[id] || 0;
  if (cap <= 0) return 1;
  if (income >= 0) return stock / cap;
  // 产量为负时，看现有库存还能撑多久（按每秒消耗折算成 0–1）。
  return stock > 0 ? 0 : -1;
}

/**
 * 单个取值来源的读取器。
 *
 * 约定：每个 case 返回一个值或 `undefined`；**不允许抛错**，也**不允许**为了“看起来合理”
 * 而在参数非法时返回 0——0 会让 `!=` / `<=` 这类条件误判为真。
 */
export function readConditionSource(context: ConditionContext, source: ConditionSourceId, arg: string): ConditionResult | undefined {
  const { state } = context;
  const hasResource = Object.hasOwn(RESOURCES, arg);
  const hasBuilding = Object.hasOwn(BUILDINGS, arg);
  switch (source) {
    // ---- 字面量 ----
    case 'number': { const value = Number(arg); return Number.isFinite(value) ? value : undefined; }
    case 'boolean': return arg === 'true';
    case 'string': return arg;

    // ---- 资源 ----
    case 'resourceQuantity': return hasResource ? state.resources[arg as ResourceId] || 0 : undefined;
    case 'resourceCap': return hasResource ? context.storageCaps()[arg as ResourceId] || 0 : undefined;
    case 'resourceRatio': {
      if (!hasResource) return undefined;
      const cap = context.storageCaps()[arg as ResourceId] || 0;
      return cap > 0 ? (state.resources[arg as ResourceId] || 0) / cap : 0;
    }
    case 'resourceIncome': return hasResource ? context.rates()[arg as ResourceId] || 0 : undefined;
    case 'resourceUnlocked': return hasResource ? isResourceUnlocked(arg, state) : undefined;
    case 'resourceSatisfied': {
      if (!hasResource) return undefined;
      const id = arg as ResourceId;
      return resourceSatisfiedRatio(state, context.storageCaps()[id] || 0, id);
    }
    case 'resourceSatisfyRatio': {
      if (!hasResource) return undefined;
      const id = arg as ResourceId;
      const income = context.rates()[id] || 0;
      return income >= 0 ? Infinity : 0;
    }

    // ---- 建筑 ----
    case 'buildingCount': return hasBuilding ? state.buildings[arg as BuildingId] || 0 : undefined;
    case 'buildingRunning': return hasBuilding ? countRunningBuildings(arg as BuildingId, state) : undefined;
    case 'buildingStopped': return hasBuilding ? state.stoppedBuildings[arg as BuildingId] || 0 : undefined;
    case 'buildingUnlocked': return hasBuilding ? isBuildingUnlocked(arg, state) : undefined;
    case 'buildingPurchasable': return hasBuilding ? isPurchaseAllowed(state, 'build', arg) : undefined;
    case 'buildingQueued': return state.queue.some(item => item.kind === 'build' && item.id === arg);
    case 'buildingCost': {
      // 参数形如 `building.resource`，与参考脚本的 `city-farm.Money` 一致。
      // 校验的是**拆分后**的两段：拿整串 `nest.wood` 去查注册表永远查不到。
      const [id, resource] = arg.split('.');
      if (!id || !resource) return undefined;
      if (!Object.hasOwn(BUILDINGS, id) || !Object.hasOwn(RESOURCES, resource)) return undefined;
      const cost = calculateBuildingCost(id as BuildingId, state.buildings[id as BuildingId] || 0, state, buildPriceContext(state));
      const value = cost[resource as keyof typeof cost];
      return typeof value === 'number' ? value : 0;
    }
    case 'buildingAffordable': {
      if (!hasBuilding) return undefined;
      const cost = calculateBuildingCost(arg as BuildingId, state.buildings[arg as BuildingId] || 0, state, buildPriceContext(state));
      return Object.entries(cost).every(([resource, need]) =>
        typeof need !== 'number' || (state.resources[resource as ResourceId] || 0) + 1e-9 >= need);
    }

    // ---- 科技 ----
    case 'techResearched': return Object.hasOwn(TECHNOLOGIES, arg) ? state.tech.includes(arg as TechnologyId) : undefined;
    case 'techUnlocked': return Object.hasOwn(TECHNOLOGIES, arg) ? isTechnologyUnlocked(arg, state) : undefined;
    case 'techCostKnowledge': return Object.hasOwn(TECHNOLOGIES, arg) ? TECHNOLOGIES[arg as TechnologyId].knowledgeCost ?? 0 : undefined;

    // ---- 人口与就业 ----
    case 'population': return state.population;
    case 'idlePopulation': return countSparePopulation(state);
    case 'housingCapacity': return context.housing();
    case 'jobWorkers': return hasBuilding ? state.workers[arg as BuildingId] || 0 : undefined;
    case 'jobCapacity': return hasBuilding ? calculateWorkerCapacity(arg as BuildingId, state) : undefined;
    case 'jobUnlocked': return hasBuilding ? isBuildingUnlocked(arg, state) && Boolean(BUILDINGS[arg as BuildingId].tech) && state.tech.includes(BUILDINGS[arg as BuildingId].tech as TechnologyId) : undefined;

    // ---- 社会 ----
    case 'happiness': return previewMorale(state).happiness;
    case 'taxRate': return state.taxRate;
    case 'government': return state.government;
    case 'gameDays': return state.time / 5;
    case 'clicks': return state.clicks;

    // ---- 队列与任务 ----
    case 'queueLength': {
      if (arg === 'build') return state.queue.filter(item => item.kind !== 'tech').length;
      if (arg === 'tech') return state.queue.filter(item => item.kind === 'tech').length;
      if (arg === 'total') return state.queue.length;
      return undefined;
    }
    case 'missionCompleted': return arg in state ? Boolean((state as unknown as Record<string, unknown>)[arg]) : undefined;
    case 'missionAvailable': {
      // 区域任务用注册表判定；非法 id 返回 undefined。
      try { return isRegionalMissionAvailable(state, arg as never); } catch { return undefined; }
    }

    // ---- 军事 ----
    case 'soldierCount': return state.soldiers;
    case 'woundedCount': return state.wounded;
    case 'armyLimit': return calculateArmyLimit(state);
    case 'neighborControlled': return Object.hasOwn(NEIGHBORS, arg) ? state.neighbors.occupied.includes(arg as NeighborId) : undefined;
    case 'neighborMilitary': return Object.hasOwn(NEIGHBORS, arg) ? state.neighbors.values[arg as NeighborId]?.military : undefined;

    // ---- ARPA 与飞船 ----
    case 'arpaCount': return Object.hasOwn(ARPA_PROJECTS, arg) ? state.arpaBuildings[arg as keyof typeof ARPA_PROJECTS] || 0 : undefined;
    case 'arpaProgress': return Object.hasOwn(ARPA_PROJECTS, arg) ? state.arpaProgress[arg as keyof typeof ARPA_PROJECTS] || 0 : undefined;
    case 'arpaUnlocked': return Object.hasOwn(ARPA_PROJECTS, arg) ? isProjectUnlocked(arg, state) : undefined;
    case 'shipComponentReady': return arg in state.shipComponents ? Boolean(state.shipComponents[arg as keyof typeof state.shipComponents]) : undefined;

    // ---- 锻造与工厂 ----
    case 'craftWorkers': return countCraftWorkers(state);
    case 'factoryLineWorkers': return arg in state.lines ? state.lines[arg as keyof typeof state.lines] || 0 : undefined;
    case 'smelterIdle': return state.smelterIdle;

    // ---- 黑洞 ----
    case 'blackHoleMass': return state.blackHole.mass;
    case 'exoticMassRatio': return state.blackHole.unstable ? 1 : 0;
    case 'ejectionAllocated': {
      const capacity = calculateEjectionCapacity(state);
      const allocated = Object.values(state.blackHole.ejection).reduce((sum, value) => sum + (value || 0), 0);
      return capacity > 0 ? allocated / capacity : 0;
    }

    // ---- 威望 ----
    case 'prestigeParticles': return state.prestige.particles;
    case 'prestigeCasimir': return state.prestige.casimir;
    case 'prestigeDarkEnergy': return state.prestige.darkEnergy;
    case 'prestigeCrystals': return state.prestige.harmonyCrystals;
    case 'prestigeResets': {
      const key = ({ nuclear: 'nuclearResets', escape: 'escapeResets', blackHole: 'blackHoleResets', ascension: 'ascensionResets', soft: 'softResets' } as const)[arg as 'nuclear'];
      if (key) return state.prestige[key] || 0;
      if (arg !== 'total') return undefined;
      return (state.prestige.nuclearResets || 0) + (state.prestige.escapeResets || 0) + (state.prestige.blackHoleResets || 0) + (state.prestige.ascensionResets || 0);
    }
    case 'prestigeType': return prestigeResetLabel(state);
    case 'nuclearProgress': return state.nuclearProgress;

    // ---- 基因与特质 ----
    case 'geneLevel': return state.geneModification.levels[arg as keyof typeof state.geneModification.levels] ?? undefined;
    case 'dnaStock': return state.geneModification.dna[arg as keyof typeof state.geneModification.dna] ?? undefined;
    case 'speciesTrait': return state.speciesTraits.traits.includes(arg as never);

    // ---- 容器 ----
    case 'containerFree': return Math.max(0, state.containers - Object.values(state.containerAssignments || {}).reduce((sum, value) => sum + (value || 0), 0));
    case 'alloyContainerFree': return Math.max(0, state.alloyContainers - Object.values(state.alloyContainerAssignments || {}).reduce((sum, value) => sum + (value || 0), 0));

    // ---- 标识符 ----
    case 'resourceId': return arg;
    case 'buildingId': return arg;
    case 'techId': return arg;
    default: return undefined;
  }
}

/** 最近一次威望重置的类型标签；界面与条件共用，避免两处各写一份。 */
export function prestigeResetLabel(state: GameState): string {
  if ((state.prestige.ascensionResets || 0) > 0) return 'ascension';
  if ((state.prestige.blackHoleResets || 0) > 0) return 'blackHole';
  if ((state.prestige.escapeResets || 0) > 0) return 'escape';
  if ((state.prestige.nuclearResets || 0) > 0) return 'nuclear';
  if ((state.prestige.softResets || 0) > 0) return 'soft';
  return 'none';
}

/**
 * 比较运算符。
 *
 * 刻意用宽松相等（`==` / `!=`）作为默认：一边是“数值”来源、另一边是“布尔/字符串”来源时，
 * 玩家写 `建筑数量 == true` 这种组合不应该静默恒假。严格相等另有 `===` / `!==`。
 */
export const COMPARE_OPERATORS: Readonly<Record<CompareOperator, (left: ConditionResult, right: ConditionResult) => boolean>> = {
  '==': (a, b) => a == b, // eslint-disable-line eqeqeq
  '!=': (a, b) => a != b, // eslint-disable-line eqeqeq
  '===': (a, b) => a === b,
  '!==': (a, b) => a !== b,
  '>': (a, b) => a > b,
  '<': (a, b) => a < b,
  '>=': (a, b) => a >= b,
  '<=': (a, b) => a <= b,
  '&&': (a, b) => Boolean(a) && Boolean(b),
  '||': (a, b) => Boolean(a) || Boolean(b),
  NAND: (a, b) => !(Boolean(a) && Boolean(b)),
  NOR: (a, b) => !(Boolean(a) || Boolean(b)),
  XOR: (a, b) => Boolean(a) !== Boolean(b),
  XNOR: (a, b) => Boolean(a) === Boolean(b),
  'AND!': (a, b) => Boolean(a) && !Boolean(b),
  'OR!': (a, b) => Boolean(a) || !Boolean(b),
  // 左边成立就把右边整体作为输出值（不参与真值判定），与参考脚本一致。
  'A?B': (a) => Boolean(a),
  '!A?B': (a) => !Boolean(a),
};

/** `A?B` / `!A?B`：命中时把右侧取值作为覆盖值。 */
export const OUTPUT_OPERATORS: ReadonlySet<CompareOperator> = new Set<CompareOperator>(['A?B', '!A?B']);

export interface RowEvaluation {
  matched: boolean;
  /** `A?B` 输出右值，其余输出行上声明的值。 */
  value?: ConditionResult;
}

export function evaluateConditionRow(context: ConditionContext, row: ConditionRow): RowEvaluation {
  const left = readConditionSource(context, row.left, row.leftArg);
  if (left === undefined) return { matched: false };
  const compare = COMPARE_OPERATORS[row.operator];
  if (!compare) return { matched: false };
  // `A?B` 的输出不依赖右侧能否读取；其它运算符必须先拿到右侧才能比较。
  if (OUTPUT_OPERATORS.has(row.operator)) {
    const right = readConditionSource(context, row.right, row.rightArg);
    if (right === undefined) return { matched: false };
    if (!compare(left, right)) return { matched: false };
    return { matched: true, value: right };
  }
  const right = readConditionSource(context, row.right, row.rightArg);
  if (right === undefined) return { matched: false };
  if (!compare(left, right)) return { matched: false };
  return row.value === undefined ? { matched: true } : { matched: true, value: row.value };
}
