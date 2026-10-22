import { loadStageThreeState, validateStageThreeProgress } from './validate-stage-three';
import { validateStoryArchive } from './validate-story';
import { CONFIG } from '../data/config';
import { normalizeSchemaSave } from './save-compatibility';
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
import { validateNeighbors } from './validate-neighbors';
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

/** Strict current-schema boundary: schema 31 is upgraded in memory, retired schemas are rejected. */
export function validateCurrentSave(value: unknown, context: SaveValidationContext): GameState {
  // Every check is wrapped with a stage label so a rejected save reports which step
  // refused it. The label is appended to the existing message, so the copy players
  // already see stays identical; only our diagnostics (and tests) get the extra text.
  let stage = '版本';
  const check = <T>(label: string, run: () => T): T => {
    stage = label;
    try {
      return run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw Error(message.includes(label) ? message : `${message}（${label}）`);
    }
  };
  if (!value || typeof value !== 'object') throw Error('存档版本不受支持。（版本）');
  // Normalization upgrades schema 31 to 32 and backfills absent entries; the version check
  // below then rejects everything that is not the current schema.
  const raw = check('版本规范化', () => normalizeSchemaSave(value as Record<string, unknown>));
  if (raw.version !== CONFIG.version) throw Error('存档版本不受支持。（版本号）');
  const state = createInitialState(CONFIG.version, context.eventInterval, context.now);
  if (Object.keys(raw).some(key => !Object.hasOwn(state, key)) || Object.keys(state).some(key => key !== 'achievementLevels' && !Object.hasOwn(raw, key))) throw Error('存档字段无效。（字段集合）');
  if (typeof raw.furUnlocked !== 'boolean') throw Error('毛皮解锁状态无效。（毛皮）');
  state.furUnlocked = raw.furUnlocked;
  state.happiness = check('幸福度', () => validateSaveNumber(raw.happiness, 0, Number.MAX_SAFE_INTEGER, '幸福度'));
  state.downloadAllocation = check('下载分配', () => validateSaveNumber(raw.downloadAllocation, 0, 100, '下载分配'));
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
  check('自动分配', () => validateAutoWorkers(raw, state));
  // Load permanent modifiers before any cost/cap-dependent validation.
  check('CRISPR', () => validateCrispr(raw, state));
  // Gene levels scale base outputs and morale, so load them with the other modifiers.
  check('基因修饰', () => validateGeneModification(raw, state));
  check('挑战', () => validateChallenges(raw, state));
  check('经济记录', () => validateEconomyRecords(raw, state));
  check('临近势力', () => validateNeighbors(raw, state));
  check('供电顺序', () => validatePowerActivationOrder(raw, state));
  check('第三阶段', () => loadStageThreeState(raw, state));
  check('解锁记录', () => validateUnlockRecords(raw, state));
  check('人口记录', () => validatePopulationRecords(raw, state, context.housingCapacity(state), context.now));
  check('文明', () => validateCivilization(raw, state));
  check('黑洞', () => validateBlackHole(raw, state));
  check('威望解锁', () => validatePrestigeUnlocks(raw, state));
  check('生产线分配', () => validateFactoryAssignments(raw.lines, state));
  check('冶炼厂工位', () => validateSmelterAssignments(raw.smelterIdle, state));
  check('历史', () => validateHistory(raw, state));
  check('统计', () => validateStatistics(raw, state));
  check('工程记录', () => validateProjectRecords(raw, state));
  check('飞船', () => validateSaveSpaceship(raw, state));
  check('第三阶段进度', () => validateStageThreeProgress(state));
  check('剧情档案', () => validateStoryArchive(raw, state));
  state.queue = check('建造队列', () => validateSaveQueue(raw.queue, state));
  check('存储分配', () => validateStorageAssignments(raw, state));
  check('资源截断', () => context.clampResources(state));
  return state;
}
