import { CRISPR_UPGRADES } from '../data/crispr';
import type { CrisprUpgradeId, GameState } from '../types/state';

/** Permanent unlocks do not require the current run to have researched CRISPR. */
export function validateCrispr(raw: Record<string, unknown>, state: GameState): void {
  const value = raw.crispr;
  if (value === undefined) { state.crispr = []; return; }
  if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !Object.hasOwn(CRISPR_UPGRADES, id)) || new Set(value).size !== value.length) throw Error('CRISPR升级记录无效。');
  const upgrades = value as CrisprUpgradeId[];
  if (upgrades.some(id => !CRISPR_UPGRADES[id].pre.every(pre => upgrades.includes(pre)))) throw Error('CRISPR升级前置缺失。');
  state.crispr = [...upgrades];
}
