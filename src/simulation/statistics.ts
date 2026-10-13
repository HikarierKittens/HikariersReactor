import type { GameStatistics, RunStatistics } from '../types/state';

export type StatisticsState = { statistics?: { lifetime?: Partial<GameStatistics['lifetime']>; run?: Partial<RunStatistics> } };

export function createStatistics(): GameStatistics {
  return {
    lifetime: { knowledgeSpent: 0, starved: 0, soldierDeaths: 0, days: 0, particlesEarned: 0, casimirEarned: 0 },
    run: { knowledgeSpent: 0, starved: 0, soldierDeaths: 0, days: 0 },
  };
}

/** Old partial simulation fixtures are supported without inventing past events. */
export function ensureStatistics(state: StatisticsState): GameStatistics {
  const defaults = createStatistics();
  const current = state.statistics;
  for (const scope of ['lifetime', 'run'] as const) {
    for (const key of Object.keys(defaults[scope]) as (keyof GameStatistics['lifetime'])[]) {
      const value = (current?.[scope] as Partial<GameStatistics['lifetime']> | undefined)?.[key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        (defaults[scope] as GameStatistics['lifetime'])[key] = Math.min(Number.MAX_SAFE_INTEGER, value);
      }
    }
  }
  state.statistics = defaults;
  return defaults;
}

function record(state: StatisticsState, key: keyof RunStatistics, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const stats = ensureStatistics(state);
  stats.lifetime[key] = Math.min(Number.MAX_SAFE_INTEGER, stats.lifetime[key] + amount);
  stats.run[key] = Math.min(Number.MAX_SAFE_INTEGER, stats.run[key] + amount);
}

export function recordKnowledgeSpent(state: StatisticsState, amount: number): void { record(state, 'knowledgeSpent', amount); }
export function recordStarvation(state: StatisticsState, count: number): void { record(state, 'starved', count); }
export function recordSoldierDeaths(state: StatisticsState, count: number): void { record(state, 'soldierDeaths', count); }
export function recordGameDays(state: StatisticsState, days: number): void { record(state, 'days', days); }
export function recordCasimirEarned(state: StatisticsState, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const stats = ensureStatistics(state);
  stats.lifetime.casimirEarned = Math.min(Number.MAX_SAFE_INTEGER, stats.lifetime.casimirEarned + amount);
}
export function recordParticlesEarned(state: StatisticsState, amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const stats = ensureStatistics(state);
  stats.lifetime.particlesEarned = Math.min(Number.MAX_SAFE_INTEGER, stats.lifetime.particlesEarned + amount);
}
