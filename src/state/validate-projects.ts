import { ARPA_PROJECTS, MONUMENT_MATERIALS } from '../data/projects';
import { TECHNOLOGIES } from '../data/technologies';
import { calculateProjectCost, isProjectUnlocked } from '../simulation/projects';
import { resourceCompletionPercent } from '../simulation/project-funding';
import type { ResourceId, ResourceRecipe } from '../types/economy';
import { validateSaveNumber } from './validation';
import type { ArpaProjectId, GameState } from '../types/state';

export function validateProjectRecords(raw: Record<string, unknown>, state: GameState): void {
  const progress = raw.arpaProgress as Record<string, unknown> | undefined | null;
  const buildings = raw.arpaBuildings as Record<string, unknown> | undefined | null;
  const tracking = raw.arpaResourceProgress;
  for (const record of [progress, buildings]) {
    if (!record || typeof record !== 'object' || Array.isArray(record)
      || Object.keys(record).some(id => !Object.hasOwn(ARPA_PROJECTS, id))) throw Error('工程数据无效');
  }
  if (!tracking || typeof tracking !== 'object' || Array.isArray(tracking)
    || Object.keys(tracking).some(id => !Object.hasOwn(ARPA_PROJECTS, id))) throw Error('工程投入数据无效');
  for (const id of Object.keys(ARPA_PROJECTS) as ArpaProjectId[]) {
    state.arpaProgress[id] = validateSaveNumber(progress?.[id], 0, 100, '工程进度');
    state.arpaBuildings[id] = validateSaveNumber(buildings?.[id], 0, ARPA_PROJECTS[id].repeatable ? Number.MAX_SAFE_INTEGER : 1, '工程数量');
    if (!Number.isInteger(state.arpaBuildings[id])) throw Error('工程数据无效');
    if ((state.arpaProgress[id] || state.arpaBuildings[id]) && !isProjectUnlocked(id, state)) throw Error('工程尚未解锁');
  }
  if (state.tech.includes('crispr16') && state.arpaBuildings.geneSequencing !== 1) throw Error('CRISPR需要完成基因测序');
  const material = raw.monumentMaterial;
  if (!MONUMENT_MATERIALS.some(id => id === material) || (state.arpaBuildings.monument === 0 && material !== 'stone')) throw Error('纪念碑材料无效');
  state.monumentMaterial = material as GameState['monumentMaterial'];
  state.arpaResourceProgress = {};
  for (const id of Object.keys(ARPA_PROJECTS) as ArpaProjectId[]) {
    const cost = calculateProjectCost(id, state);
    const saved = (tracking as Record<string, unknown>)[id];
    const paid: ResourceRecipe = {};
    if (saved !== undefined) {
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)
        || Object.keys(saved).some(resource => !Object.hasOwn(cost, resource))) throw Error('工程投入数据无效');
      for (const resource of Object.keys(cost) as ResourceId[]) {
        const value = (saved as Record<string, unknown>)[resource];
        paid[resource] = validateSaveNumber(value === undefined ? 0 : value, 0, 100, '工程投入');
      }
      const completion = resourceCompletionPercent(cost, paid);
      if (completion === 100 || ((Object.values(paid).some(value => value > 0))
        && (!isProjectUnlocked(id, state) || (!ARPA_PROJECTS[id].repeatable && state.arpaBuildings[id] > 0)))) throw Error('工程投入数据无效');
      if (Math.abs(state.arpaProgress[id] - completion) > 1e-9) throw Error('工程进度与投入不一致。');
      state.arpaResourceProgress[id] = paid;
    } else if (state.arpaProgress[id] !== 0) throw Error('工程投入记录缺失。');
  }
  if (state.tech.includes('tourismIndustry') && state.arpaBuildings.monument < 1) throw Error('旅游业需要纪念碑');
  for (const id of state.tech) {
    const technology = TECHNOLOGIES[id];
    if (technology.arpaPre && technology.arpaRequiredCount !== undefined && state.arpaBuildings[technology.arpaPre] < technology.arpaRequiredCount) throw Error('科技需要完成所需工程');
  }
  state.arpaQueueElapsed = validateSaveNumber(raw.arpaQueueElapsed, 0, 1, '工程计时');
}
