import { loadStageThreeState, validateStageThreeProgress } from './validate-stage-three';
import { validateStoryArchive } from './validate-story';
import { CONFIG } from '../data/config';
import { normalizeSchema31Save } from './save-compatibility';
import { createInitialState } from './create-state';
import { validateEconomyRecords, validateFactoryAssignments, validateSmelterAssignments } from './validate-economy';
import { validateUnlockRecords } from './validate-unlocks';
import { validatePopulationRecords } from './validate-population';
import { validateCivilization } from './validate-civilization';
import { validateCrispr } from './validate-crispr';
import { validateGeneModification, validatePrestigeUnlocks } from './validate-genes';
import { validateChallenges } from './validate-challenges';
import { validateHistory } from './validate-history';
import { validateStatistics } from './validate-stats';
import { validateBlackHole } from './validate-black-hole';
import { validateAutoWorkers } from './validate-auto-workers';
import { validatePowerActivationOrder } from './validate-power';
import { validateProjectRecords } from './validate-projects';
import { validateSaveSpaceship } from './validate-spaceship';
import { validateSaveQueue } from './validate-queue';
import { validateSaveNumber, validateStorageAssignments } from './validation';
import { DEFAULT_GAME_SETTINGS, type GameSettings, type QueueSettingKey } from '../types/state';
import type { GameState } from '../types/state';

export interface SaveValidationContext {
  now: number;
  eventInterval: number;
  housingCapacity: (state: GameState) => number;
  clampResources: (state: GameState) => unknown;
}
/** Temporary API alias: validates schema 31 only; never migrates old saves. */
export function validateAndMigrateSave(value: unknown, context: SaveValidationContext): GameState {
  return validateCurrentSave(value, context);
}

/** Strict current-schema boundary. Older and experimental schemas are unsupported. */
export function validateCurrentSave(value: unknown, context: SaveValidationContext): GameState {
  if (!value || typeof value !== 'object' || (value as Record<string, unknown>).version !== CONFIG.version) throw Error('存档版本不受支持。');
  const raw = normalizeSchema31Save(value as Record<string, unknown>);
  const state = createInitialState(CONFIG.version, context.eventInterval, context.now);
  if (Object.keys(raw).some(key => !Object.hasOwn(state, key)) || Object.keys(state).some(key => key !== 'achievementLevels' && !Object.hasOwn(raw, key))) throw Error('存档字段无效。');
  if (typeof raw.furUnlocked !== 'boolean') throw Error('毛皮解锁状态无效。');
  state.furUnlocked = raw.furUnlocked;
  state.happiness = validateSaveNumber(raw.happiness, 0, Number.MAX_SAFE_INTEGER, '幸福度');
  state.downloadAllocation = validateSaveNumber(raw.downloadAllocation, 0, 100, '下载分配');
  const savedSettings = raw.settings;
  if (!savedSettings || typeof savedSettings !== 'object' || Array.isArray(savedSettings) || Object.keys(savedSettings).some(key => !Object.hasOwn(DEFAULT_GAME_SETTINGS, key))) throw Error('游戏设置无效。');
  const settings: GameSettings = { ...DEFAULT_GAME_SETTINGS };
  for (const key of Object.keys(DEFAULT_GAME_SETTINGS) as QueueSettingKey[]) {
    {
      if (typeof (savedSettings as Record<string, unknown>)[key] !== 'boolean') throw Error('游戏设置无效。');
      settings[key] = (savedSettings as Record<QueueSettingKey, boolean>)[key];
    }
  }
  state.settings = settings;
  validateAutoWorkers(raw, state);
  // Load permanent modifiers before any cost/cap-dependent validation.
  validateCrispr(raw, state);
  // Gene levels scale base outputs and morale, so load them with the other modifiers.
  validateGeneModification(raw, state);
  validateChallenges(raw, state);
  validateEconomyRecords(raw, state);
  validatePowerActivationOrder(raw, state);
  loadStageThreeState(raw, state);
  validateUnlockRecords(raw, state);
  validatePopulationRecords(raw, state, context.housingCapacity(state), context.now);
  validateCivilization(raw, state);
  validateBlackHole(raw, state);
  validatePrestigeUnlocks(raw, state);
  validateFactoryAssignments(raw.lines, state);
  validateSmelterAssignments(raw.smelterIdle, state);
  validateHistory(raw, state);
  validateStatistics(raw, state);
  validateProjectRecords(raw, state);
  validateSaveSpaceship(raw, state);
  validateStageThreeProgress(state);
  validateStoryArchive(raw, state);
  state.queue = validateSaveQueue(raw.queue, state);
  validateStorageAssignments(raw, state);
  context.clampResources(state);
  return state;
}
