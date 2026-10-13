import { recordKnowledgeSpent } from './statistics';
import { affordableResourcePercent, calculateResourceRemainingCost, investResourceProgress, resourceCompletionPercent } from './project-funding';
import { ARPA_PROJECTS, MONUMENT_MATERIALS } from '../data/projects';
import type { ArpaProjectId, GameState } from '../types/state';
import type { ResourceRecipe, ResourceId } from '../types/economy';

export function calculateProjectDescription(id: ArpaProjectId, state: Pick<GameState, 'tech'>): string {
  const base = ARPA_PROJECTS[id].desc;
  return id === 'arpaResearchInstitute' && state.tech.includes('dimensionCompression')
    ? `${base}；每个科研所额外使仓库、高级存储枢纽和格纳库的资源容量+4%` : base;
}

export function calculateProjectCost(id: string, state: Pick<GameState, 'arpaBuildings' | 'monumentMaterial'> & Partial<Pick<GameState, 'crispr'>>): ResourceRecipe {
  if (!Object.hasOwn(ARPA_PROJECTS, id)) return {};
  if (id === 'geneSequencing' && state.crispr?.includes('geneOptimization')) return { knowledge: 500000 };
  const project = ARPA_PROJECTS[id as ArpaProjectId];
  const cost = id === 'monument' ? { [state.monumentMaterial || 'stone']: 100000 } : project.cost || {};
  if (!project.costScale) return { ...cost };
  const count = state.arpaBuildings?.[id as ArpaProjectId] || 0;
  return Object.fromEntries(Object.entries(cost).map(([resource, base]) => {
    const value = base * project.costScale! ** count;
    const total = Number.isFinite(value) ? Math.min(1e100, Math.ceil(value - 1e-8)) : 1e100;
    return [resource, total];
  }));
}
export function isProjectAtLimit(id: string, state: Pick<GameState, 'arpaBuildings'>): boolean {
  const project = id as ArpaProjectId;
  return (state.arpaBuildings?.[project] || 0) >= (ARPA_PROJECTS[project]?.repeatable ? Number.MAX_SAFE_INTEGER : 1);
}
export function normalizeProjectProgress(state: GameState): void {
  const emptyRecord = () => Object.fromEntries(Object.keys(ARPA_PROJECTS).map(id => [id, 0])) as Record<ArpaProjectId, number>;
  if (!state.arpaProgress || typeof state.arpaProgress !== 'object') state.arpaProgress = emptyRecord();
  if (!state.arpaBuildings || typeof state.arpaBuildings !== 'object') state.arpaBuildings = emptyRecord();
  for (const id of Object.keys(ARPA_PROJECTS) as ArpaProjectId[]) {
    const progress = Number(state.arpaProgress[id]), completed = Number(state.arpaBuildings[id]);
    state.arpaProgress[id] = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
    state.arpaBuildings[id] = Number.isFinite(completed) ? Math.max(0, Math.min(ARPA_PROJECTS[id].repeatable ? Number.MAX_SAFE_INTEGER : 1, Math.floor(completed))) : 0;
    const tracking = state.arpaResourceProgress?.[id];
    if (tracking) state.arpaProgress[id] = resourceCompletionPercent(calculateProjectCost(id, state), tracking);
  }
  if (!Number.isFinite(state.arpaQueueElapsed) || state.arpaQueueElapsed < 0) state.arpaQueueElapsed = 0;
}
export function calculateProjectRemainingCost(id: string, state: GameState): ResourceRecipe {
  if (!Object.hasOwn(ARPA_PROJECTS, id)) return {};
  normalizeProjectProgress(state);
  return calculateResourceRemainingCost(calculateProjectCost(id, state), getProjectResourceProgress(id as ArpaProjectId, state));
}
export function calculateAffordableProjectPercent(id: string, state: GameState, requested = 100): number {
  if (!isProjectUnlocked(id, state)) return 0;
  normalizeProjectProgress(state);
  if (isProjectAtLimit(id, state)) return 0;
  return affordableResourcePercent(calculateProjectCost(id, state), state.resources, getProjectResourceProgress(id as ArpaProjectId, state), requested);
}
export function investInProject(id: string, state: GameState, percent: number, random: () => number, minimumPercent = 0): number {
  if (![1, 25, 50, 75, 100].includes(percent) || !isProjectUnlocked(id, state)) return 0;
  normalizeProjectProgress(state);
  if (isProjectAtLimit(id, state)) return 0;
  const project = id as ArpaProjectId;
  const cost = calculateProjectCost(id, state);
  const progress = getProjectResourceProgress(project, state);
  const funding = investResourceProgress(cost, state.resources, progress, percent, minimumPercent);
  recordKnowledgeSpent(state, funding.spent.knowledge || 0);
  state.arpaProgress[project] = resourceCompletionPercent(cost, progress);
  if (funding.complete) {
    state.arpaBuildings[project]++; state.arpaProgress[project] = 0;
    delete state.arpaResourceProgress![project];
    if (id === 'monument') {
      const choices = MONUMENT_MATERIALS.filter(resource => resource !== state.monumentMaterial);
      const material = choices[Math.floor(random() * choices.length)];
      if (material !== undefined) state.monumentMaterial = material;
    }
  }
  return funding.investedPercent;
}
/** Lazily migrate legacy scalar progress without overwriting explicit independent deposits. */
export function getProjectResourceProgress(id: ArpaProjectId, state: GameState): ResourceRecipe {
  state.arpaResourceProgress ||= {};
  return state.arpaResourceProgress[id] ||= Object.fromEntries(Object.keys(calculateProjectCost(id, state)).map(resource => [resource, state.arpaProgress[id] || 0]));
}
export function isProjectUnlocked(id: string, state: Pick<GameState, 'tech'>): boolean {
  return Object.hasOwn(ARPA_PROJECTS, id)
    && ARPA_PROJECTS[id as ArpaProjectId].pre.every(tech => state.tech.includes(tech));
}
