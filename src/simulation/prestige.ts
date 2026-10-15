import { snapshotStoryArchive, updateStoryProgress } from './story';
import { createInitialState } from '../state/create-state';
import { CONFIG } from '../data/config';
import { validateStatistics } from '../state/validate-stats';
import { recordParticlesEarned, recordCasimirEarned, recordDarkEnergyEarned } from './statistics';
import { calculateDarkEnergyReward } from './black-hole';
import { isTechnologyUnlocked } from './unlocks';
import { syncPrestigeUnlocks } from './prestige-unlocks';
import { ACHIEVEMENTS } from '../data/progression';
import { addLog } from './progression';
import { updateAchievementTracking } from './achievement-tracking';

function preserveLifetime(state: GameState, next: GameState): void {
  const snapshot = { ...state };
  validateStatistics(state as unknown as Record<string, unknown>, snapshot);
  next.statistics.lifetime = { ...snapshot.statistics.lifetime };
  next.story = snapshotStoryArchive(state);
}
/** Prestige-resource unlocks are sticky across runs; new rewards unlock their rows too. */
function keepPrestigeUnlocks(state: GameState, next: GameState): void {
  // Copy first so the source state is never mutated; then add what either side holds.
  next.prestigeUnlocked = [...(state.prestigeUnlocked ?? [])];
  syncPrestigeUnlocks({ prestige: state.prestige, prestigeUnlocked: next.prestigeUnlocked });
  syncPrestigeUnlocks(next);
}
import { canPayCost, payResourceCost } from './costs';
import { calculatePrestigeReward, calculateEscapePrestigeReward, calculateCasimirReward, calculateBlackHoleParticleReward, calculateBlackHoleCasimirReward, calculateTechCost } from './government';
import { hasCompleteShip } from './spaceship';
export { calculateEscapePrestigeReward, calculateCasimirReward } from './government';
import type { ResourceId } from '../types/economy';
import type { AchievementId, GameState } from '../types/state';

/** Successful reset awards live and log only on its returned state. */
function awardResetAchievement(next: GameState, id: AchievementId): void {
  if (next.achievements.includes(id)) return;
  next.achievements.push(id);
  addLog(next, `成就达成：${ACHIEVEMENTS[id].name}`, 'achievement');
}

/** Capture final unobserved run edges without mutating the reset source. */
function preserveFinalAchievements(state: GameState, next: GameState): void {
  const snapshot = { ...state, achievements: [...state.achievements] };
  const unlocked = updateAchievementTracking(snapshot);
  next.achievements = [...state.achievements];
  for (const id of unlocked) awardResetAchievement(next, id);
}

export const NUCLEAR_PROJECT = { name: '核弹', icon: '', cost: { oil: 4000, alloy: 2000, uranium: 1000 } } as const;

/** Affordable whole percent points, bounded by resources and remaining progress. */
export function calculateNuclearAffordablePercent(state: GameState, percent = 100): number {
  if (![1, 25, 50, 100].includes(percent) || !state.tech.includes('nuclearProgram')) return 0;
  return Math.max(0, Math.min(percent, 100 - state.nuclearProgress, ...Object.entries(NUCLEAR_PROJECT.cost).map(([resource, total]) => {
    const amount = state.resources[resource as ResourceId];
    return Math.floor((amount + 1e-8) / (total / 100));
  })));
}

/** Fill the nuclear project without launching; launch stays a separate explicit reset. */
export function fillNuclearProject(state: GameState, percent: number): number {
  const amount = calculateNuclearAffordablePercent(state, percent);
  if (!amount) return 0;
  const cost = Object.fromEntries(Object.entries(NUCLEAR_PROJECT.cost).map(([resource, total]) => [resource, total * amount / 100]));
  if (!canPayCost(state.resources, cost) || !payResourceCost(state.resources, cost)) return 0;
  state.nuclearProgress += amount;
  return amount;
}

export interface PrestigeReset { next: GameState; reward: number }

/**
 * Prestige launch: keep achievements, optional settings, and prestige counters.
 * Returns null when progress, reward, or counters are invalid; mutates nothing.
 */
export function launchNuclearPrestige(state: GameState, eventIn: number, now: number): PrestigeReset | null {
  if (!state.tech.includes('nuclearProgram') || state.nuclearProgress !== 100) return null;
  const reward = calculatePrestigeReward(state);
  if (!Number.isSafeInteger(state.prestige.particles + reward) || state.prestige.nuclearResets >= Number.MAX_SAFE_INTEGER) return null;
  const next = createInitialState(CONFIG.version, eventIn, now);
  preserveLifetime(state, next);
  recordParticlesEarned(next, reward);
  next.prestige = { ...state.prestige, particles: state.prestige.particles + reward, nuclearResets: state.prestige.nuclearResets + 1 };
  keepPrestigeUnlocks(state, next);
  next.crispr = [...state.crispr];
  next.achievements = [...state.achievements];
  const settings = (state as { settings?: unknown }).settings;
  if (settings !== undefined) (next as { settings?: unknown }).settings = JSON.parse(JSON.stringify(settings));
  awardResetAchievement(next, 'nuclearCuriosity');
  return { next, reward };
}

export interface EscapePrestigeReset extends PrestigeReset { casimirReward: number }

/** Escape is available only after the dock and every registered ship component are complete. */
export function launchEscapePrestige(state: GameState, eventIn: number, now: number): EscapePrestigeReset | null {
  if (!hasCompleteShip(state)) return null;
  const reward = calculateEscapePrestigeReward(state);
  const casimirReward = calculateCasimirReward(reward);
  const casimir = state.prestige.casimir === undefined ? 0 : state.prestige.casimir;
  const escapeResets = state.prestige.escapeResets === undefined ? 0 : state.prestige.escapeResets;
  if (!Number.isSafeInteger(reward) || reward < 0 || !Number.isSafeInteger(casimirReward) || casimirReward < 0
    || !Number.isSafeInteger(state.prestige.particles) || state.prestige.particles < 0
    || !Number.isSafeInteger(casimir) || casimir < 0 || !Number.isSafeInteger(escapeResets) || escapeResets < 0
    || !Number.isSafeInteger(state.prestige.particles + reward) || !Number.isSafeInteger(casimir + casimirReward)
    || escapeResets >= Number.MAX_SAFE_INTEGER) return null;
  const next = createInitialState(CONFIG.version, eventIn, now);
  preserveLifetime(state, next);
  recordParticlesEarned(next, reward);
  recordCasimirEarned(next, casimirReward);
  next.prestige = { ...state.prestige, particles: state.prestige.particles + reward, casimir: casimir + casimirReward, escapeResets: escapeResets + 1 };
  keepPrestigeUnlocks(state, next);
  next.crispr = [...state.crispr];
  next.achievements = [...state.achievements];
  const settings = (state as { settings?: unknown }).settings;
  if (settings !== undefined) (next as { settings?: unknown }).settings = JSON.parse(JSON.stringify(settings));
  preserveFinalAchievements(state, next);
  awardResetAchievement(next, 'escapeRun');
  updateStoryProgress(next);
  return { next, reward, casimirReward };
}

export interface BlackHolePrestigeReset extends EscapePrestigeReset { darkEnergyReward: number }
export interface BlackHolePrestigeRewards { reward: number; casimirReward: number; darkEnergyReward: number }
export function calculateBlackHolePrestigeRewards(state: GameState): BlackHolePrestigeRewards {
  const reward = calculateBlackHoleParticleReward(state);
  return { reward, casimirReward: calculateBlackHoleCasimirReward(reward), darkEnergyReward: calculateDarkEnergyReward(state) };
}

/** 奇异失控 → 黑洞重置: needs the unlocked tech and its full price; mutates nothing. */
export function launchBlackHolePrestige(state: GameState, eventIn: number, now: number): BlackHolePrestigeReset | null {
  if (!isTechnologyUnlocked('exoticRunaway', state) || state.tech.includes('exoticRunaway')) return null;
  const cost = calculateTechCost('exoticRunaway', state);
  if (!canPayCost(state.resources, cost)) return null;
  const { reward, casimirReward, darkEnergyReward } = calculateBlackHolePrestigeRewards(state);
  const { particles, casimir, darkEnergy, blackHoleResets } = state.prestige;
  if (![reward, casimirReward, darkEnergyReward, particles, casimir, darkEnergy, blackHoleResets].every(value => Number.isSafeInteger(value) && value >= 0)
    || !Number.isSafeInteger(particles + reward) || !Number.isSafeInteger(casimir + casimirReward) || !Number.isSafeInteger(darkEnergy + darkEnergyReward)
    || blackHoleResets >= Number.MAX_SAFE_INTEGER) return null;
  const next = createInitialState(CONFIG.version, eventIn, now);
  preserveLifetime(state, next);
  next.statistics.lifetime.knowledgeSpent = Math.min(Number.MAX_SAFE_INTEGER, next.statistics.lifetime.knowledgeSpent + (cost.knowledge || 0));
  recordParticlesEarned(next, reward);
  recordCasimirEarned(next, casimirReward);
  recordDarkEnergyEarned(next, darkEnergyReward);
  next.prestige = { ...state.prestige, particles: particles + reward, casimir: casimir + casimirReward, darkEnergy: darkEnergy + darkEnergyReward, blackHoleResets: blackHoleResets + 1 };
  keepPrestigeUnlocks(state, next);
  next.crispr = [...state.crispr];
  next.achievements = [...state.achievements];
  const settings = (state as { settings?: unknown }).settings;
  if (settings !== undefined) (next as { settings?: unknown }).settings = JSON.parse(JSON.stringify(settings));
  awardResetAchievement(next, 'spaceDestroyer');
  updateStoryProgress(next);
  return { next, reward, casimirReward, darkEnergyReward };
}

export interface SoftReset { next: GameState }
/** Soft reset keeps permanent progress; every ordinary reset clears active challenges.
 * Challenge launch opts back in only after this fresh-run reset succeeds. */
export function resetRunState(state: GameState, kind: string, eventIn: number, now: number): SoftReset | null {
  if (kind !== 'soft' && kind !== 'hard') return null;
  const next = createInitialState(CONFIG.version, eventIn, now);
  if (kind === 'soft') {
    if (state.prestige.softResets >= Number.MAX_SAFE_INTEGER) return null;
    preserveLifetime(state, next);
    next.prestige = { ...state.prestige, softResets: state.prestige.softResets + 1 };
    keepPrestigeUnlocks(state, next);
    next.crispr = [...state.crispr];
    next.achievements = [...state.achievements];
    const settings = (state as { settings?: unknown }).settings;
    if (settings !== undefined) (next as { settings?: unknown }).settings = JSON.parse(JSON.stringify(settings));
  }
  return { next };
}
