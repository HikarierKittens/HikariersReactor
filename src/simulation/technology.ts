import { TECHNOLOGIES } from '../data/technologies';
import type { TechnologyDefinition, TechnologyId } from '../types/technologies';

export const TECH_KNOWLEDGE_COST_RANGES: Partial<Record<number, readonly [number, number]>> = {
  2: [300, 500], 3: [1000, 1200], 4: [2000, 3000], 5: [4000, 6000],
  6: [15000, 20000], 7: [30000, 35000], 8: [45000, 50000], 9: [70000, 80000],
  10: [90000, 120000], 11: [120000, 140000], 12: [150000, 180000],
};

export function calculateTechnologyTier(
  id: string,
  memo: Record<string, number> = {},
  technologies: Readonly<Partial<Record<string, TechnologyDefinition>>> = TECHNOLOGIES,
): number {
  if (memo[id] !== undefined) return memo[id];
  const tech = technologies[id];
  const tier = tech && Number.isInteger(tech.tier) ? tech.tier! : tech?.pre.length
    ? Math.max(...tech.pre.map(parent => calculateTechnologyTier(parent, memo, technologies))) + 1 : 0;
  memo[id] = tier;
  return tier;
}

/** Preserve explicit exceptions and initial T0/T1 costs; called once at startup. */
export function initializeTechnologyCosts(technologies: Record<TechnologyId, TechnologyDefinition> = TECHNOLOGIES): void {
  const memo: Record<string, number> = {};
  for (const [id, tech] of Object.entries(technologies)) {
    const range = TECH_KNOWLEDGE_COST_RANGES[calculateTechnologyTier(id, memo, technologies)];
    if (range) tech.cost.knowledge = tech.knowledgeCost ?? (range[0] + range[1]) / 2;
  }
}
