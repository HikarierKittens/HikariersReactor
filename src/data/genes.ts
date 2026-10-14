import type { DnaId, GeneId } from '../types/state';

export interface GeneDefinition {
  name: string;
  /** The DNA base spent to upgrade this gene. */
  dna: DnaId;
  /** Bonus per level, as a fraction (0.04 = 4%). */
  perLevel: number;
  desc: string;
  /** Label for the primary bonus when a gene has more than one effect. */
  label?: string;
  /** Optional second per-level bonus shown and applied separately. */
  extra?: { label: string; perLevel: number };
}

export const DNA_BASE_IDS: readonly DnaId[] = ['C', 'G', 'A', 'T'];
/** Knowledge spent to craft one DNA base. */
export const DNA_KNOWLEDGE_COST = 200000;

export const GENE_DEFINITIONS: Record<GeneId, GeneDefinition> = {
  goodCat: { name: '好猫基因', dna: 'C', perLevel: .04, desc: '每一级，猫咖的资金基础产量+4%' },
  hardWorking: { name: '吃苦耐劳', dna: 'C', perLevel: .04, desc: '每一级，矿工和煤矿工人基础产量+4%' },
  maturationAcceleration: { name: '成熟加速', dna: 'C', perLevel: .01, desc: '每一级，人口增长速率+1%' },
  superWorkshop: { name: '超级工坊', dna: 'G', perLevel: .02, desc: '每一级，水泥工人基础产量+2%' },
  perfectionism: { name: '完美主义', dna: 'G', perLevel: .02, desc: '每一级，工厂生产线基础产能+2%' },
  overclockForging: { name: '超频锻造', dna: 'G', perLevel: .02, label: '锻造物', extra: { label: '工匠', perLevel: .01 }, desc: '每一级，锻造物产量+2%，工匠产量+1%（不增加原料消耗）' },
  titanPower: { name: '泰坦之力', dna: 'A', perLevel: .05, desc: '每一级，士兵战斗力+5%' },
  advancedScience: { name: '高级科学', dna: 'A', perLevel: .01, desc: '每一级，教授与科学家的基础知识产量+1%' },
  catCohesion: { name: '猫猫凝聚', dna: 'T', perLevel: .01, desc: '每一级，猫口数量带来的幸福度压力按比例-1%，士兵上限带来的幸福度压力按比例-0.5%' },
  kinoFire: { name: '奇诺之火', dna: 'T', perLevel: .01, desc: '每一级，钢冶炼工位基础产量+1%' },
};
