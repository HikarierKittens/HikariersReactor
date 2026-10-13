import { CONFIG } from '../data/config';
import { CRISPR_UPGRADES } from '../data/crispr';
import { createStatistics } from '../simulation/statistics';
import type { GameState } from '../types/state';

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${label}无效。`);
  return value as Record<string, unknown>;
}
function counter(value: unknown, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw Error(`${label}无效。`);
  return value;
}

/** Restore only facts recoverable from an old save; earlier runs are unknowable. */
export function validateStatistics(raw: Record<string, unknown>, state: GameState): void {
  const source = object(raw.statistics, '统计记录');
  const lifetime = object(source.lifetime, '历史统计');
  const run = object(source.run, '本周目统计');
  const stats = createStatistics();
  const days = state.time / CONFIG.secondsPerDay;
  for (const key of ['knowledgeSpent', 'starved', 'soldierDeaths', 'days'] as const) {
    stats.run[key] = counter(run[key], key === 'days' ? days : 0, '本周目统计');
    stats.lifetime[key] = Math.max(stats.run[key], counter(lifetime[key], key === 'days' ? days : 0, '历史统计'));
  }
  // Current holdings plus retained purchases are a recoverable lower bound,
  // not a reconstruction of all historical rewards (old prices may differ).
  const recoverableParticles = Math.min(Number.MAX_SAFE_INTEGER, state.prestige.particles + state.crispr.reduce((sum, id) => sum + CRISPR_UPGRADES[id].cost, 0));
  stats.lifetime.particlesEarned = counter(lifetime.particlesEarned, recoverableParticles, '粒子获取统计');
  const recoverableCasimir = Math.min(Number.MAX_SAFE_INTEGER, (state.prestige.casimir || 0) + state.crispr.reduce((sum, id) => sum + (CRISPR_UPGRADES[id].casimirCost || 0), 0));
  stats.lifetime.casimirEarned = counter(lifetime.casimirEarned, recoverableCasimir, '卡西米尔获取统计');
  state.statistics = stats;
  state.starvationElapsed = counter(raw.starvationElapsed, 0, '饥饿计时');
}
