import type { ArpaProjectId } from '../types/state';
import type { TechnologyId } from '../types/technologies';
import type { ResourceRecipe } from '../types/economy';
export const MONUMENT_MATERIALS = ['stone', 'aluminum', 'metal', 'cement'] as const;
export interface ProjectDefinition {
  name: string; icon: string; pre: TechnologyId[]; desc: string; cost?: ResourceRecipe; repeatable?: boolean; costScale?: number;
}
export const ARPA_PROJECTS: Record<ArpaProjectId, ProjectDefinition> = {
  remoteAnchor: { name: '远端锚点验证', icon: '⌖', pre: ['anomalyTopology'], cost: { cash: 5000000, knowledge: 600000, alloy: 75000, iridium: 20000, nanotubes: 100000, e710: 500, helium3: 30000 }, desc: '以常规运输将供能、测量与E-710场响应装置送至太阳系内候选异常区。一次性工程，完工即结束部署校准，随后在超空间执行远端连接验证。无现实倒计时。' },
  deepSpaceInterferometer: { name: '深空干涉阵列', icon: '📡', pre: ['globalObservationCalibration'], cost: { cash: 3000000, knowledge: 450000, alloy: 30000, iridium: 10000, nanotubes: 50000 }, desc: '联合太阳系观测站进行独立复测。一次性工程，完工即确认可重复的局部异常，无额外等待。' },
  deepSpaceLab: { name: '深空实验平台', icon: '🔬', pre: ['anomalyResponse'], cost: { cash: 4000000, knowledge: 500000, metal: 150000, alloy: 50000, nanotubes: 75000, e710: 200 }, desc: '在异常边缘部署无人实验平台。一次性工程，完工即完成对照实验，确认E-710在特定场条件下参与异常响应。' },

  geneSequencing: { name: '基因测序', icon: '', pre: ['genetics'], desc: '注入100万知识完成基因测序，每周目只能完成一次。', cost: { knowledge: 1000000 } },
  rocketPlatform: { name: '火箭平台', icon: '🚀', pre: ['arpa', 'rocketry'], desc: '需要分段建造的唯一超级工程；建成后可研究太空航行', cost: { metal: 10000, alloy: 5000 } },
  monument: { name: '纪念碑', icon: '🗿', pre: ['monument'], repeatable: true, costScale: 1.1, desc: '可重复建造，每座提高幸福度上限2%。每次建造从石头、铝、钢、水泥中随机选择材料。' },
  stockExchange: { name: '证券交易所', icon: '📈', pre: ['stockExchange'], repeatable: true, costScale: 1.08, cost: { cash: 2000000, wood: 50000, brick: 25000, wroughtIron: 10000 }, desc: '每个证券交易所使资金容量+10%' },
  arpaResearchInstitute: { name: 'ARPA科研所', icon: '🔬', pre: ['arpaResearchInstitute'], repeatable: true, costScale: 1.05, cost: { cash: 2000000, knowledge: 400000, copper: 100000, cement: 100000, aluminum: 200000, titanium: 50000, polymer: 10000 }, desc: '每个ARPA科研所使实验室和学校的知识容量+4%' },
};
