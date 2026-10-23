import { BUILDINGS } from '../../data/buildings';
import { TECHNOLOGIES } from '../../data/technologies';
import { ARPA_PROJECTS } from '../../data/projects';
import { RESOURCES } from '../../data/resources';
import { calculateSupportPreview } from '../support-preview';
import { calculateStorageTotals } from '../storage';
import { calculateHousingDetails, countRunningBuildings } from '../housing';
import { previewMorale, calculateProduction } from '../production';
import { isBuildingUnlocked, isResourceUnlocked, isTechnologyUnlocked } from '../unlocks';
import { isPurchaseAllowed } from '../purchases';
import { floorWithPrecision } from '../../shared/format';
import type { GameState } from '../../types/state';
import type { BuildingId } from '../../types/buildings';
import type { ResourceId } from '../../types/economy';
import type { TechnologyId } from '../../types/technologies';
import type { CompareOperator, ConditionRow, ConditionSourceId } from '../../types/automation';

/**
 * 条件求值：Evolve 脚本 `checkTypes` + `checkCompare` 的等价物。
 *
 * 用固定读取器表代替 `eval`：配置里只出现"取哪个值"和"怎么比较"，永远不会执行代码，
 * 导入别人的配置也不会带入可执行内容。读取器只读状态，可反复调用。
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

const RESET_COUNTERS: Record<string, keyof GameState['prestige']> = {
  nuclear: 'nuclearResets', escape: 'escapeResets', blackHole: 'blackHoleResets', ascension: 'ascensionResets', soft: 'softResets',
};

/** 最近一次生效的重置类型；按已有计数器推断，不额外记录状态。 */
function prestigeResetLabel(state: GameState): string {
  const prestige = state.prestige;
  if ((prestige.ascensionResets || 0) > 0) return 'ascension';
  if ((prestige.blackHoleResets || 0) > 0) return 'blackHole';
  if ((prestige.escapeResets || 0) > 0) return 'escape';
  if ((prestige.nuclearResets || 0) > 0) return 'nuclear';
  return 'none';
}

export type ConditionResult = number | boolean | string;

/** 未知来源或非法参数返回 undefined：调用方当作"条件不成立"，不打断整轮脚本。 */
export function readConditionSource(context: ConditionContext, source: ConditionSourceId, arg: string): ConditionResult | undefined {
  const { state } = context;
  switch (source) {
    case 'number': { const value = Number(arg); return Number.isFinite(value) ? value : undefined; }
    case 'boolean': return arg === 'true';
    case 'string': return arg;
    case 'resourceQuantity': return Object.hasOwn(RESOURCES, arg) ? state.resources[arg as ResourceId] || 0 : undefined;
    case 'resourceCap': return Object.hasOwn(RESOURCES, arg) ? context.storageCaps()[arg as ResourceId] || 0 : undefined;
    case 'resourceRatio': {
      if (!Object.hasOwn(RESOURCES, arg)) return undefined;
      const cap = context.storageCaps()[arg as ResourceId] || 0;
      return cap > 0 ? (state.resources[arg as ResourceId] || 0) / cap : 0;
    }
    case 'resourceIncome': return Object.hasOwn(RESOURCES, arg) ? context.rates()[arg as ResourceId] || 0 : undefined;
    case 'resourceUnlocked': return Object.hasOwn(RESOURCES, arg) ? isResourceUnlocked(arg, state) : undefined;
    case 'buildingCount': return Object.hasOwn(BUILDINGS, arg) ? state.buildings[arg as BuildingId] || 0 : undefined;
    case 'buildingRunning': return Object.hasOwn(BUILDINGS, arg) ? countRunningBuildings(arg as BuildingId, state) : undefined;
    case 'buildingUnlocked': return Object.hasOwn(BUILDINGS, arg) ? isBuildingUnlocked(arg, state) : undefined;
    case 'buildingPurchasable': return Object.hasOwn(BUILDINGS, arg) ? isPurchaseAllowed(state, 'build', arg) : undefined;
    case 'buildingQueued': return state.queue.some(item => item.kind === 'build' && item.id === arg);
    case 'techResearched': return Object.hasOwn(TECHNOLOGIES, arg) ? state.tech.includes(arg as TechnologyId) : undefined;
    case 'techUnlocked': return Object.hasOwn(TECHNOLOGIES, arg) ? isTechnologyUnlocked(arg, state) : undefined;
    case 'population': return state.population;
    case 'soldierCount': return state.soldiers;
    case 'housingCapacity': return context.housing();
    case 'happiness': return previewMorale(state).happiness;
    case 'taxRate': return state.taxRate;
    case 'gameDays': return state.time / 5;
    case 'queueLength': {
      if (arg === 'build') return state.queue.filter(item => item.kind !== 'tech').length;
      if (arg === 'tech') return state.queue.filter(item => item.kind === 'tech').length;
      return undefined;
    }
    case 'arpaCount': return Object.hasOwn(ARPA_PROJECTS, arg) ? state.arpaBuildings[arg as keyof typeof ARPA_PROJECTS] || 0 : undefined;
    case 'prestigeParticles': return state.prestige.particles;
    case 'prestigeResets': {
      const key = RESET_COUNTERS[arg];
      const value = key ? state.prestige[key] : undefined;
      if (typeof value === 'number') return value;
      if (arg !== 'total') return undefined;
      return (state.prestige.nuclearResets || 0) + (state.prestige.escapeResets || 0) + (state.prestige.blackHoleResets || 0) + (state.prestige.ascensionResets || 0);
    }
    case 'prestigeType': return prestigeResetLabel(state);
    case 'government': return state.government;
    case 'resourceId': return arg;
    case 'buildingId': return arg;
    case 'techId': return arg;
    default: return undefined;
  }
}

/**
 * 比较运算符。刻意用宽松相等：一边是"数值"来源、另一边是"布尔值/字符串"来源时，
 * 玩家写 `建筑数量 == true` 这种组合不应该静默恒假。
 */
export const COMPARE_OPERATORS: Readonly<Record<CompareOperator, (left: ConditionResult, right: ConditionResult) => boolean>> = {
  '==': (a, b) => a == b, // eslint-disable-line eqeqeq
  '!=': (a, b) => a != b, // eslint-disable-line eqeqeq
  '>': (a, b) => a > b,
  '<': (a, b) => a < b,
  '>=': (a, b) => a >= b,
  '<=': (a, b) => a <= b,
  '&&': (a, b) => Boolean(a) && Boolean(b),
  '||': (a, b) => Boolean(a) || Boolean(b),
  // `A?B`：左值成立时输出右值；引擎把它当成"带输出值的条件"。
  'A?B': (a, b) => Boolean(a) && Boolean(b),
};

export interface RowEvaluation {
  matched: boolean;
  /** `A?B` 输出右值，其余输出行上声明的值。 */
  value?: ConditionResult;
}

export function evaluateConditionRow(context: ConditionContext, row: ConditionRow): RowEvaluation {
  const left = readConditionSource(context, row.left, row.leftArg);
  const right = readConditionSource(context, row.right, row.rightArg);
  if (left === undefined || right === undefined) return { matched: false };
  const compare = COMPARE_OPERATORS[row.operator];
  if (!compare) return { matched: false };
  if (!compare(left, right)) return { matched: false };
  const value = row.operator === 'A?B' ? right : row.value;
  return value === undefined ? { matched: true } : { matched: true, value };
}
