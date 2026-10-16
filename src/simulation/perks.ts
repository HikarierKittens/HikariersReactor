import { CRISPR_UPGRADES } from '../data/crispr';
import { ACHIEVEMENTS } from '../data/progression';
import { getAchievementLevel, getAchievementMasteryBonus } from './achievement-tracking';
import type { AchievementId, CrisprUpgradeId, GameState } from '../types/state';
import { calculateCrisprCostReduction, calculateCrisprStorageBonus } from './crispr';

export interface PerkEntry {
  id: string;
  source: 'crispr' | 'achievement';
  name: string;
  lines: string[];
}

/** Each chain lists tiers from lowest to highest; only the highest owned tier is shown. */
const CRISPR_CHAINS: readonly (readonly CrisprUpgradeId[])[] = [
  ['materialEfficiency', 'innovativeMaterials', 'structuralReinforcement', 'physicsLaws', 'halfLife3'],
  ['spatialReasoning', 'dimensionCompression', 'dimensionDistortion'],
];

function percent(value: number): string {
  return `${Number((value * 100).toFixed(2))}%`;
}

function crisprLines(id: CrisprUpgradeId, state: GameState): string[] {
  const desc = CRISPR_UPGRADES[id].desc;
  if (CRISPR_CHAINS[0]!.includes(id)) return [desc, `当前建筑成本递增系数 −${Number(calculateCrisprCostReduction(state).toFixed(4))}`];
  if (CRISPR_CHAINS[1]!.includes(id)) {
    const bonus = calculateCrisprStorageBonus(state);
    return [desc, `当前粒子储量加成 +${percent(bonus.particleBonus)}`];
  }
  if (id === 'casimirEffect') return [desc, `当前卡西米尔储量加成 +${percent(calculateCrisprStorageBonus(state).casimirBonus)}`];
  return [desc];
}

/** Read-only list of active permanent perks for the statistics page. */
export function listActivePerks(state: GameState): PerkEntry[] {
  const owned = new Set(state.crispr);
  const hidden = new Set<CrisprUpgradeId>();
  for (const chain of CRISPR_CHAINS) {
    const top = [...chain].reverse().find(id => owned.has(id));
    for (const id of chain) if (id !== top) hidden.add(id);
  }
  const crispr = (Object.keys(CRISPR_UPGRADES) as CrisprUpgradeId[])
    .filter(id => owned.has(id) && !hidden.has(id))
    .map(id => ({ id, source: 'crispr' as const, name: CRISPR_UPGRADES[id].name, lines: crisprLines(id, state) }));
  const achievements = (Object.keys(ACHIEVEMENTS) as AchievementId[])
    .filter(id => state.achievements.includes(id) && ACHIEVEMENTS[id].perk)
    .map(id => {
      const level = getAchievementLevel(state, id) ?? 0;
      const perk = ACHIEVEMENTS[id].perk!;
      return { id, source: 'achievement' as const, name: `${ACHIEVEMENTS[id].name} · 等级 ${level}`, lines: [typeof perk === 'function' ? perk(level) : perk] };
    });
  const mastery: PerkEntry = { id: 'mastery', source: 'achievement', name: '精通', lines: [`当前全局产量 +${percent(getAchievementMasteryBonus(state))}`, '对除电力外的所有资源产量生效，包括锻造物。同一成就只计最高等级，不同成就相加。'] };
  return [...crispr, mastery, ...achievements];
}
