import { addLog } from './progression';
import { updateStageThreeProgress } from './stage-three';
import { updateStoryProgress } from './story';
import { CONFIG } from '../data/config';
import { advanceSoldierTraining } from './military';
import { calculateProduction } from './production';
import { advancePopulationGrowth, advanceStarvation, enforcePopulationCapacity } from './population';
import { recordGameDays } from './statistics';
import { applyMassEjection, BLACK_HOLE_UNSTABLE_LOG } from './black-hole';
import { applyGeneSynthesis } from './genes';
import { applyAutoWorkerAssignment } from './auto-workers';
import type { GameState } from '../types/state';

/** Transitional application hooks keep UI, queue notifications and previews outside simulation. */
export interface TickHooks {
  happiness: () => number;
  capacity: () => number;
  event: () => void;
  projects: (dt: number) => void;
  purchases: () => void;
  unlocks: () => void;
}
export function advanceGameTick(state: GameState, dt: number, hooks: TickHooks): void {
  if (state.settings.paused || !Number.isFinite(dt) || dt <= 0) return;
  applyAutoWorkerAssignment(state);
  advanceSoldierTraining(state, dt);
  state.happiness = hooks.happiness();
  const foodBefore = state.resources.food;
  const result = calculateProduction(state, dt);
  state.resources = result.pool;
  if (applyMassEjection(state, result.ejected, dt)) addLog(state, BLACK_HOLE_UNSTABLE_LOG, 'event');
  applyGeneSynthesis(state, result.geneSynthesis, dt);
  const corePreviouslyActivated = state.stageThree.coreActivated;
  updateStageThreeProgress(state, result);
  updateStoryProgress(state);
  if (!corePreviouslyActivated && state.stageThree.coreActivated) addLog(state, 'AI超级核心提交了一份异常观测复核申请，已收录至「剧情」。', 'event');
  state.starvation = 0;
  state.time += dt;
  recordGameDays(state, dt / CONFIG.secondsPerDay);
  advanceStarvation(state, dt, result.rates.food, foodBefore);
  state.effects = state.effects.map(effect => ({ ...effect, left: effect.left - dt })).filter(effect => effect.left > 0);
  const capacity = hooks.capacity();
  enforcePopulationCapacity(state, capacity);
  advancePopulationGrowth(state, dt, result.rates.food, capacity);
  state.eventIn -= dt;
  if (state.eventIn <= 0) hooks.event();
  hooks.projects(dt);
  hooks.purchases();
  hooks.unlocks();
  applyAutoWorkerAssignment(state);
  state.happiness = hooks.happiness();
}
export function simulateElapsed(seconds: number, tick: (dt: number) => void): void {
  let left = Math.min(seconds, CONFIG.simulateLimit);
  while (left > 0) {
    const dt = Math.min(1, left); tick(dt); left -= dt;
  }
}
