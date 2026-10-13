import { loadStageThreeState, validateStageThreeProgress } from './validate-stage-three';
import { validateStoryArchive } from './validate-story';
import { CONFIG } from '../data/config';
import { trimFactoryAssignments } from '../simulation/factory';
import { createInitialState } from './create-state';
import { validateEconomyRecords, validateFactoryAssignments } from './validate-economy';
import { validateUnlockRecords } from './validate-unlocks';
import { validatePopulationRecords } from './validate-population';
import { validateCivilization } from './validate-civilization';
import { validateCrispr } from './validate-crispr';
import { validateChallenges } from './validate-challenges';
import { validateHistory } from './validate-history';
import { validateStatistics } from './validate-stats';
import { validateProjectRecords } from './validate-projects';
import { validateSaveSpaceship } from './validate-spaceship';
import { validateSaveQueue } from './validate-queue';
import { validateStorageAssignments } from './validation';
import { migrateV12, migrateV13, migrateV14, migrateV15, migrateV16, migrateV17, migrateV18, migrateV19, migrateV20, migrateV21, migrateV22, migrateV23, migrateV24, migrateV25, migrateV26, migrateV27, migrateV28 } from './migrations';
import type { MigrationRecord } from './migrations';
import { DEFAULT_GAME_SETTINGS, type GameSettings, type QueueSettingKey } from '../types/state';
import type { GameState } from '../types/state';

export interface SaveValidationContext {
  now: number;
  eventInterval: number;
  housingCapacity: (state: GameState) => number;
  clampResources: (state: GameState) => unknown;
}
export function validateAndMigrateSave(value: unknown, context: SaveValidationContext): GameState {
  const migrations = [migrateV12, migrateV13, migrateV14, migrateV15, migrateV16, migrateV17, migrateV18, migrateV19, migrateV20, migrateV21, migrateV22, migrateV23, migrateV24, migrateV25, migrateV26, migrateV27, migrateV28];
  let raw = value;
  for (const [index, migrate] of migrations.entries()) {
    if (raw && typeof raw === 'object' && (raw as MigrationRecord).version === index + 12) raw = migrate(raw as MigrationRecord);
  }
  return validateCurrentSave(raw, context);
}

/** Current-version validation. Legacy migrations run before this boundary. */
export function validateCurrentSave(value: unknown, context: SaveValidationContext): GameState {
  if (!value || typeof value !== 'object' || (value as Record<string, unknown>).version !== CONFIG.version) throw Error('存档版本不受支持。');
  // Retire removed content before validating dependencies, without mutating any
  // part of the caller's save. Historical logs and spent resources stay intact.
  const original = value as Record<string, unknown>;
  const retiredTech = ['acceleratorOverclock', 'advancedParticleOverclock', 'e710Analysis', 'transcendenceHopeless', 'engineAdjustment', 'ftlWaypointResearch', 'interstellarScoutPlan', 'interstellarCalibration'];
  const retiredProjects = ['interstellarScout', 'extrasolarAnchor'];
  const retiredStories = ['scoutDeparture', 'anotherSun', 'distantFoundation', 'distantReply', 'firstInterstellarCargo'];
  const retiredBuildings = ['particleOverclockStation', 'tianxingMiningStation', 'ftlSolar', 'ftlTianxing'];
  const raw: Record<string, unknown> = { ...original };
  delete raw.tianxing;
  if (Array.isArray(original.tech)) raw.tech = original.tech.filter(id => !retiredTech.includes(id));
  if (Array.isArray(original.legacyTechPrerequisites)) raw.legacyTechPrerequisites = original.legacyTechPrerequisites.filter(id => !retiredTech.includes(id));
  if (Array.isArray(original.queue)) raw.queue = original.queue.filter(item => !(item && typeof item === 'object' && ((item.kind === 'build' && retiredBuildings.includes(item.id)) || (item.kind === 'tech' && retiredTech.includes(item.id)) || (item.kind === 'arpa' && retiredProjects.includes(item.id)))));
  for (const field of ['arpaBuildings', 'arpaProgress', 'arpaResourceProgress']) {
    const saved = original[field];
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      const record = { ...saved as Record<string, unknown> };
      for (const id of retiredProjects) delete record[id];
      raw[field] = record;
    }
  }
  const savedStage = original.stageThree;
  if (savedStage && typeof savedStage === 'object' && !Array.isArray(savedStage)) {
    const record = { ...savedStage as Record<string, unknown> };
    for (const key of ['scoutArrived', 'interstellarSignal', 'interstellarCargo']) delete record[key];
    raw.stageThree = record;
  }
  const savedStory = original.story;
  if (savedStory && typeof savedStory === 'object' && !Array.isArray(savedStory)) {
    const archive = { ...savedStory as Record<string, unknown> };
    for (const key of ['unlocked', 'read']) {
      const ids = archive[key];
      if (Array.isArray(ids)) archive[key] = ids.filter(id => !retiredStories.includes(id));
    }
    raw.story = archive;
  }
  for (const field of ['resources', 'containerAssignments']) {
    const saved = original[field];
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      const record = { ...saved as Record<string, unknown> };
      delete record.rawMaterial;
      raw[field] = record;
    }
  }
  if (Array.isArray(original.unlockedResources)) raw.unlockedResources = original.unlockedResources.filter(id => id !== 'rawMaterial');
  const state = createInitialState(CONFIG.version, context.eventInterval, context.now);
  if (typeof raw.furUnlocked !== 'boolean') throw Error('毛皮解锁状态无效。');
  state.furUnlocked = raw.furUnlocked || Number(raw.soldiers) > 0;
  const savedSettings = raw.settings;
  if (savedSettings !== undefined && (!savedSettings || typeof savedSettings !== 'object' || Array.isArray(savedSettings))) throw Error('游戏设置无效。');
  const settings: GameSettings = { ...DEFAULT_GAME_SETTINGS };
  for (const key of Object.keys(DEFAULT_GAME_SETTINGS) as QueueSettingKey[]) {
    if (savedSettings !== undefined && Object.hasOwn(savedSettings as object, key)) {
      if (typeof (savedSettings as Record<string, unknown>)[key] !== 'boolean') throw Error('游戏设置无效。');
      settings[key] = (savedSettings as Record<QueueSettingKey, boolean>)[key];
    }
  }
  state.settings = settings;
  // Load permanent modifiers before any cost/cap-dependent validation.
  validateCrispr(raw, state);
  validateChallenges(raw, state);
  validateEconomyRecords(raw, state);
  loadStageThreeState(raw, state);
  validateUnlockRecords(raw, state);
  validatePopulationRecords(raw, state, context.housingCapacity(state), context.now);
  validateCivilization(raw, state);
  validateFactoryAssignments(raw.lines, state);
  validateHistory(raw, state);
  validateStatistics(raw, state);
  validateProjectRecords(raw, state);
  validateSaveSpaceship(raw, state);
  validateStageThreeProgress(state);
  validateStoryArchive(raw, state);
  state.queue = validateSaveQueue(raw.queue, state);
  validateStorageAssignments(raw, state);
  // Older saves allowed stopped factories to reserve lines. Normalize after
  // validating total owned capacity and loading the stopped-building records.
  trimFactoryAssignments(state);
  context.clampResources(state);
  return state;
}
