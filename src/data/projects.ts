import type { ArpaProjectId } from '../types/state';
import type { TechnologyId } from '../types/technologies';
import type { ResourceRecipe } from '../types/economy';
export const MONUMENT_MATERIALS = ['stone', 'aluminum', 'metal', 'cement'] as const;
export interface ProjectDefinition {
  name: string; icon: string; pre: TechnologyId[]; desc: string; cost?: ResourceRecipe; repeatable?: boolean; costScale?: number;
}
export const ARPA_PROJECTS: Record<ArpaProjectId, ProjectDefinition> = {

  geneSequencing: { name: '基因测序', icon: '', pre: ['genetics'], desc: '注入100万知识完成基因测序，每周目只能完成一次。', cost: { knowledge: 1000000 } },
  rocketPlatform: { name: '火箭平台', icon: '🚀', pre: ['arpa', 'rocketry'], desc: '需要分段建造的唯一超级工程；建成后可研究太空航行', cost: { metal: 10000, alloy: 5000 } },
  monument: { name: '纪念碑', icon: '🗿', pre: ['monument'], repeatable: true, costScale: 1.1, desc: '可重复建造，每座提高幸福度上限2%。每次建造从石头、铝、钢、水泥中随机选择材料。' },
  stockExchange: { name: '证券交易所', icon: '📈', pre: ['stockExchange'], repeatable: true, costScale: 1.08, cost: { cash: 2000000, wood: 50000, brick: 25000, wroughtIron: 10000 }, desc: '每个证券交易所使资金容量+10%，每位银行家提供的税收加成+2%' },
  arpaResearchInstitute: { name: 'ARPA科研所', icon: '🔬', pre: ['arpaResearchInstitute'], repeatable: true, costScale: 1.05, cost: { cash: 2000000, knowledge: 400000, copper: 100000, cement: 100000, aluminum: 200000, titanium: 50000, polymer: 10000 }, desc: '每个ARPA科研所使实验室和学校的知识容量+4%' },
};
