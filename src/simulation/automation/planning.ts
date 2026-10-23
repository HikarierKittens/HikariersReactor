/**
 * 建造与研究规划的实现已合并到 `weighting.ts`。
 *
 * 两个文件原本分开，但排序与权重表的耦合太紧：权重倍率为 0 的目标必须直接从候选里
 * 淘汰，拆成两层只会让“排序在 A、过滤在 B”来回跳。这里保留文件名作为稳定入口，
 * 让调用方与测试继续从 `./planning` 引用。
 */
export {
  buildCostWeight, buildTier, buildWeight, buildAnchor, rankBuildTargets, rankResearchTargets,
  collectWeightSignals, weightingKeysFor, needsCash, techTier, nextAutomationMission, jobHasRoom,
} from './weighting';
export type { WeightSignals } from './weighting';
