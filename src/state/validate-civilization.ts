import { TECHNOLOGIES } from '../data/technologies';
import { GOVERNMENTS, calculateSoldierCapacity } from '../simulation/government';
import { validateSaveNumber } from './validation';
import { validateSpaceMissionRecords } from './validate-unlocks';
import type { GameState, GovernmentId } from '../types/state';

/** Called after technology, building and civilization-time validation. */
export function validateCivilization(raw: Record<string, unknown>, state: GameState): void {
  state.taxRate = validateSaveNumber(raw.taxRate, 0, 30, '税率');
  if (typeof raw.government !== 'string' || (raw.government !== 'none' && !Object.hasOwn(GOVERNMENTS, raw.government))) throw Error('政府类型无效。');
  state.government = raw.government as GovernmentId;
  if (state.government !== 'none' && !state.tech.includes(GOVERNMENTS[state.government].tech)) throw Error('政府尚未解锁。');
  state.lastReformTime = raw.lastReformTime === null ? null : validateSaveNumber(raw.lastReformTime, 0, state.time, '改革时间');
  if ((state.government !== 'none' && state.lastReformTime === null) || (state.lastReformTime !== null && !state.tech.includes('government'))) throw Error('改革记录无效。');
  const prestige = raw.prestige;
  if (!prestige || typeof prestige !== 'object' || Array.isArray(prestige) || Object.keys(prestige).some(key => !['particles', 'casimir', 'darkEnergy', 'nuclearResets', 'escapeResets', 'blackHoleResets', 'softResets', 'harmonyCrystals', 'ascensionResets'].includes(key))) throw Error('粒子数据无效。');
  for (const key of ['particles', 'casimir', 'darkEnergy', 'nuclearResets', 'escapeResets', 'blackHoleResets', 'softResets', 'harmonyCrystals', 'ascensionResets'] as const) {
    const value = (prestige as Record<string, unknown>)[key];
    state.prestige[key] = validateSaveNumber(value, 0, Number.MAX_SAFE_INTEGER, '粒子记录');
    if (!Number.isSafeInteger(state.prestige[key])) throw Error('粒子记录必须为整数。');
  }
  for (const id of state.tech) if (state.prestige.nuclearResets + state.prestige.escapeResets + state.prestige.blackHoleResets + state.prestige.ascensionResets < (TECHNOLOGIES[id].prestigeResetsRequired || 0)) throw Error('科技需要威望重置；软重置不计入。');
  // The army count itself is validated as a safe integer only. An army above the current limit
  // must never block loading (that rejection is what trapped a player's save in protection mode),
  // so the surplus is instead removed right after loading, by clampSoldiersToArmyLimit, which is
  // the single owner of the "soldiers may not exceed the limit" rule. A malformed training carry
  // (>= one full duration) is still rejected here, and trainingProgress must stay 0 once the army
  // is at or above the owned cap so an idle carry cannot be smuggled in with a full army.
  state.soldiers = validateSaveNumber(raw.soldiers, 0, Number.MAX_SAFE_INTEGER, '士兵');
  if (!Number.isSafeInteger(state.soldiers)) throw Error('士兵数量无效。');
  // Wounded soldiers are outside the deployable pool and may exceed the barracks cap,
  // so they get their own safe-integer bound instead of the capacity check.
  state.wounded = validateSaveNumber(raw.wounded, 0, Number.MAX_SAFE_INTEGER, '伤兵');
  if (!Number.isSafeInteger(state.wounded)) throw Error('伤兵数量无效。');
  // Healing carry stays below one soldier; anything else means a corrupted record.
  state.hospitalProgress = validateSaveNumber(raw.hospitalProgress, 0, 1, '医院治疗进度');
  state.trainingProgress = validateSaveNumber(raw.trainingProgress, 0, 30, '训练进度');
  if (state.trainingProgress >= 30 || (state.trainingProgress > 0 && (!state.tech.includes('military') || state.soldiers >= calculateSoldierCapacity(state)))) throw Error('训练进度无效。');
  state.nuclearProgress = validateSaveNumber(raw.nuclearProgress, 0, 100, '核弹进度');
  if (!Number.isInteger(state.nuclearProgress) || (state.nuclearProgress > 0 && !state.tech.includes('nuclearProgram'))) throw Error('核弹工程数据无效。');
  // Pending missions are represented exclusively by the purchase queue.
  if (typeof raw.asrielMissionCompleted !== 'boolean' || raw.asrielMissionQueued !== false) throw Error('Asriel任务状态无效。');
  state.asrielMissionCompleted = raw.asrielMissionCompleted;
  state.asrielMissionQueued = false;
  const kerberosMissionCompleted = raw.kerberosMissionCompleted;
  if (typeof kerberosMissionCompleted !== 'boolean' || (kerberosMissionCompleted && !state.tech.includes('planetaryExploration'))) throw Error('Kerberos任务状态无效。');
  state.kerberosMissionCompleted = kerberosMissionCompleted;
  validateSpaceMissionRecords(raw, state);
}
