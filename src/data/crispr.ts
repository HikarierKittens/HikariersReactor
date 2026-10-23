import type { CrisprUpgradeId } from '../types/state';

export interface CrisprUpgradeDefinition {
  name: string;
  tier: number;
  cost: number;
  pre: CrisprUpgradeId[];
  desc: string;
  /** Optional additional price in 卡西米尔晶体, paid together with particles. */
  casimirCost?: number;
}

export const CRISPR_UPGRADES: Record<CrisprUpgradeId, CrisprUpgradeDefinition> = {
  materialEfficiency: { name: '材料效率', tier: 0, cost: 10, pre: [], desc: '建筑成本递增系数降低0.01，不影响ARPA工程。' },
  innovativeMaterials: { name: '创新材料', tier: 1, cost: 25, pre: ['materialEfficiency'], desc: '建筑成本递增系数降低0.02，覆盖低级效果，不影响ARPA工程。' },
  structuralReinforcement: { name: '结构强化', tier: 2, cost: 100, pre: ['innovativeMaterials'], desc: '建筑成本递增系数降低0.03，覆盖低级效果，不影响ARPA工程。' },
  physicsLaws: { name: '物理法则', tier: 3, cost: 500, pre: ['structuralReinforcement'], desc: '建筑成本递增系数降低0.04，覆盖低级效果，不影响ARPA工程。' },
  halfLife3: { name: '半衰期3', tier: 4, cost: 1000, pre: ['physicsLaws'], desc: '建筑成本递增系数降低0.05，覆盖低级效果，不影响ARPA工程。' },
  geneOptimization: { name: '基因优化', tier: 0, cost: 200, pre: [], desc: '基因测序所需知识从100万降低至50万。' },
  spatialReasoning: { name: '空间推理', tier: 0, cost: 100, pre: [], desc: '每个当前持有的粒子使普通资源储量提高0.04%，不影响电力、知识和合成资源。' },
  dimensionCompression: { name: '维度压缩', tier: 1, cost: 100, pre: ['spatialReasoning'], desc: '粒子的储量加成从每个0.04%改为每个0.06%' },
  dimensionDistortion: { name: '维度扭曲', tier: 2, cost: 350, pre: ['dimensionCompression'], desc: '粒子的储量加成改为每个0.08%' },
  casimirEffect: { name: '卡西米尔效应', tier: 3, cost: 500, pre: ['dimensionDistortion'], desc: '卡西米尔也提供每个+0.08%储量上限' },
  coreReplication: { name: '核心复制', tier: 0, cost: 50, pre: [], desc: '人口增长速率+15%' },
  technician: { name: '技工', tier: 0, cost: 50, pre: [], desc: '独立的锻造物产量加成 +100%，与其他独立加成乘算；不影响手动锻造和原料消耗' },
  masterArtisan: { name: '工匠大师', tier: 1, cost: 100, pre: ['technician'], desc: '工匠改为每秒制造 0.1 份锻造物（默认 0.05），产出与原料消耗同步翻倍；不影响手动锻造' },
  architect: { name: '建筑师', tier: 0, cost: 50, pre: [], desc: '建筑队列和研究队列的容量上限x2' },
  challengeGene: { name: '挑战基因', tier: 0, cost: 5, pre: [], desc: '开局解锁ARPA标签页。' },
  geneSplicing: { name: '基因剪切', tier: 1, cost: 100, casimirCost: 25, pre: ['geneOptimization'], desc: '在ARPA-遗传学页面中解锁基因修饰栏目（需要先完成本周目的基因测序）。' },
  advancedGeneSynthesis: { name: '高级基因合成', tier: 2, cost: 200, casimirCost: 25, pre: ['geneSplicing'], desc: '相同知识消耗下，基因合成的碱基产量翻倍。' },
  thirdGenerationCat: { name: '第三代喵星人', tier: 3, cost: 1000, pre: ['advancedGeneSynthesis'], desc: '在ARPA-遗传学页面中解锁种族特质栏目，可以用粒子增删当前物种的种族特质。' },
};
