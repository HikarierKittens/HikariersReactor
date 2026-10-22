import { countRunningBuildings } from './housing';
import type { GameState } from '../types/state';

/**
 * AI数据中心 (T21 卡尔维拉) 的全部数值只有这一个来源：电力、量子水平、水泥、
 * 石墨烯与精金精炼站加成都从这里派生，界面与结算因此不可能各算一套。
 *
 * 「运行中」一律指完整建成、未被停用且已获得供能的数量。电网会把缺电的单位写进
 * `stoppedBuildings`，所以 `countRunningBuildings` 就是权威口径，显示与结算读的是
 * 同一份状态，不需要额外的快照字段。
 */
type CenterState = Pick<GameState, 'buildings' | 'stoppedBuildings'>;
type CenterTechState = CenterState & Pick<GameState, 'tech'>;

/** 单座 AI数据中心的基础耗电。 */
export const AI_DATA_CENTER_POWER = 25;
/** 每多建造一座，所有 AI数据中心的单座耗电都提高这么多。 */
export const AI_DATA_CENTER_POWER_STEP = 5;
/** 每座运行中的 AI数据中心给量子水平的基础倍率加算的比例（0.05 = +5%）。 */
export const AI_DATA_CENTER_QUANTUM_BONUS = .05;
/** 精金精炼站原本提供的每座精金采矿船产量加成。 */
export const ADAMANTITE_PROCESSOR_BONUS = .1;
/** 高级精金加工：每座运行中的 AI数据中心给精金精炼站的加成数值加 2 个百分点。 */
export const ADAMANTITE_PROCESSOR_AI_BONUS = .02;
/** AI水泥工坊的分母：每座中心的加成是 (量子水平 / 1.75)%。 */
export const AI_CEMENT_DIVISOR = 1.75;
/** 高级石墨烯加工的分母：每座中心的加成是 (量子水平 / 5)%。 */
export const AI_GRAPHENE_DIVISOR = 5;

/** N 座时每座耗电 = 25 + 5×(N-1)；按已建造总数计，与是否供能无关。 */
export function calculateAiDataCenterPower(state: Pick<GameState, 'buildings'>): number {
  return AI_DATA_CENTER_POWER + AI_DATA_CENTER_POWER_STEP * Math.max(0, (state.buildings.aiDataCenter || 0) - 1);
}

/** 完整建成、已启用且已供能的 AI数据中心数量。 */
export function countRunningAiDataCenters(state: CenterState): number {
  return countRunningBuildings('aiDataCenter', state);
}

/**
 * AI水泥工坊的单座加成比例（0.02 表示 +2%）。
 * 界面显示的是这个「每座」数值，结算用的是它乘以中心数——两者只有这一个公式。
 */
export function calculateAiCementBonusPerCenter(quantumLevel: number): number {
  return Math.max(0, quantumLevel) / AI_CEMENT_DIVISOR / 100;
}

/** AI水泥工坊：每座运行中的中心提供 (量子水平 / 1.75)% 的水泥产量加成。 */
export function calculateAiCementMultiplier(state: CenterTechState, quantumLevel: number): number {
  if (!state.tech.includes('aiCementWorkshop')) return 1;
  return 1 + countRunningAiDataCenters(state) * calculateAiCementBonusPerCenter(quantumLevel);
}

/** 高级石墨烯加工的单座加成比例（0.01 表示 +1%）。 */
export function calculateAiGrapheneBonusPerCenter(quantumLevel: number): number {
  return Math.max(0, quantumLevel) / AI_GRAPHENE_DIVISOR / 100;
}

/** 高级石墨烯加工：每座运行中的中心提供 (量子水平 / 5)% 的石墨烯产量加成。 */
export function calculateAiGrapheneMultiplier(state: CenterTechState, quantumLevel: number): number {
  if (!state.tech.includes('advancedGrapheneProcessing')) return 1;
  return 1 + countRunningAiDataCenters(state) * calculateAiGrapheneBonusPerCenter(quantumLevel);
}

/** 精金精炼站每座的加成数值：基础 10%，高级精金加工后每座 AI数据中心再 +2%。 */
export function calculateAdamantiteProcessorBonus(state: CenterTechState): number {
  return ADAMANTITE_PROCESSOR_BONUS
    + (state.tech.includes('advancedAdamantiteProcessing') ? ADAMANTITE_PROCESSOR_AI_BONUS * countRunningAiDataCenters(state) : 0);
}
