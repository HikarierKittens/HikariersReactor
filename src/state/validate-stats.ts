import { createStatistics } from '../simulation/statistics';
import type { GameState } from '../types/state';

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${label}无效。`);
  return value as Record<string, unknown>;
}
function counter(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw Error(`${label}无效。`);
  return value;
}

/** Statistics are explicit current-save records, never inferred from holdings. */
export function validateStatistics(raw: Record<string, unknown>, state: GameState): void {
  const source = object(raw.statistics, '统计记录');
  const lifetime = object(source.lifetime, '历史统计');
  const run = object(source.run, '本周目统计');
  const stats = createStatistics();
  if (Object.keys(source).some(key => key !== 'lifetime' && key !== 'run')
    || Object.keys(lifetime).some(key => !Object.hasOwn(stats.lifetime, key))
    || Object.keys(run).some(key => !Object.hasOwn(stats.run, key))) throw Error('统计字段无效。');
  for (const key of ['knowledgeSpent', 'starved', 'soldierDeaths', 'days'] as const) {
    stats.run[key] = counter(run[key], '本周目统计');
    stats.lifetime[key] = counter(lifetime[key], '历史统计');
  }
  stats.lifetime.particlesEarned = counter(lifetime.particlesEarned, '粒子获取统计');
  stats.lifetime.casimirEarned = counter(lifetime.casimirEarned, '卡西米尔获取统计');
  stats.lifetime.darkEnergyEarned = counter(lifetime.darkEnergyEarned, '暗能量获取统计');
  stats.lifetime.harmonyCrystalsEarned = counter(lifetime.harmonyCrystalsEarned, '和谐水晶获取统计');
  state.statistics = stats;
  state.starvationElapsed = counter(raw.starvationElapsed, '饥饿计时');
}
