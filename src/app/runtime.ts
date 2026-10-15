import { floorWithPrecision } from '../shared/format';
import type { GameState } from '../types/state';
import { createInitialState } from '../state/create-state';
import { advanceGameTick } from '../simulation/tick';
import type { TickHooks } from '../simulation/tick';
import { sampleEventInterval, applyRandomEvent } from '../simulation/events';
import { clampResourcesToCaps } from '../simulation/storage';
import { advanceProjectQueue } from '../simulation/project-queue';
import { settlePurchaseQueue } from '../simulation/purchases';
import { simulateElapsed } from '../simulation/tick';
import { updateProgression, addLog } from '../simulation/progression';
import { persistGame } from '../state/persistence';
import { validateAndMigrateSave } from '../state/validate-save';
import { calculateHousingDetails } from '../simulation/housing';
import { calculateSupportPreview } from '../simulation/support-preview';
import { ACHIEVEMENTS } from '../data/progression';
import { previewMorale } from '../simulation/production';
import { resetRunState } from '../simulation/prestige';
import { CONFIG } from '../data/config';
import { initializeTechnologyCosts } from '../simulation/technology';

// The typed registry retains legacy base prices; normalize it once at app startup.
initializeTechnologyCosts();

export interface Runtime {
  readonly state: GameState;
  readonly saveFailed: boolean;
  readonly saveBlocked: boolean;
  /** Validates before replacing; returns whether the accepted state was persisted. */
  replaceState: (value: unknown) => boolean;
  /** Parsing/validation errors throw for callers to display; false means persistence failed. */
  importSave: (text: string) => boolean;
  exportSave: () => string;
  save: () => boolean;
  load: () => void;
  tick: (dt: number) => void;
  reset: (kind: 'soft' | 'hard') => boolean;
}

/** The one owner of mutable game state, ticking, persistence and reset for the application. */
export function createRuntime(): Runtime {
  let state = createInitialState(CONFIG.version, sampleEventInterval(Math.random), Date.now());
  let lastTick = performance.now();
  let saveElapsed = 0;
  let saveFailed = false;
  let saveBlocked = false;
  let loaded = false;

  function capacity(candidate: GameState = state): number {
    const { asriel, stageThree } = calculateSupportPreview(candidate);
    return floorWithPrecision(calculateHousingDetails(candidate, asriel, stageThree).reduce((sum, row) => sum + row.value, 0));
  }

  function storageSnapshot(candidate: GameState) {
    const { moon, asriel, biologyUnits, dataCenterUnits, researchStationUnits, blackHoleStationUnits, stageThree } = calculateSupportPreview(candidate);
    return { biologyUnits, dataCenterUnits, moonBaseUnits: moon.baseUnits, moon, asriel, researchStationUnits, blackHoleStationUnits, stageThree };
  }

  function validate(value: unknown): GameState {
    return validateAndMigrateSave(value, {
      now: Date.now(),
      eventInterval: sampleEventInterval(Math.random),
      housingCapacity: capacity,
      clampResources: candidate => clampResourcesToCaps(candidate, storageSnapshot(candidate)),
    });
  }

  function resetClock(): void {
    saveElapsed = 0;
    lastTick = performance.now();
  }

  function scanAchievements(): void {
    for (const id of updateProgression(state)) {
      addLog(state, '成就达成：' + ACHIEVEMENTS[id].name, 'achievement');
    }
  }

  const tickHooks: TickHooks = {
    happiness: () => previewMorale(state).happiness,
    capacity,
    event: () => {
      const message = applyRandomEvent(state, Math.random, () => state.resources.metal);
      if (message) addLog(state, message, 'event');
      state.eventIn = sampleEventInterval(Math.random);
    },
    projects: dt => { advanceProjectQueue(state, dt, Math.random); },
    purchases: () => { settlePurchaseQueue(state, () => calculateSupportPreview(state).moon.available); },
    unlocks: scanAchievements,
  };

  function save(): boolean {
    // A temporary game must never silently replace an unreadable existing save.
    if (saveBlocked) return false;
    const previousSaved = state.lastSaved;
    try {
      saveFailed = !persistGame(state, localStorage, CONFIG.saveKey, Date.now());
    } catch {
      saveFailed = true;
    }
    if (saveFailed) state.lastSaved = previousSaved;
    return !saveFailed;
  }

  function load(): void {
    if (loaded) return;
    loaded = true;
    resetClock();
    let raw: string | null;
    try {
      raw = localStorage.getItem(CONFIG.saveKey);
    } catch {
      saveFailed = saveBlocked = true;
      addLog(state, '无法读取本地存档，已暂停保存。', 'system');
      return;
    }
    if (raw === null) {
      addLog(state, '第一只猫猫登陆了这颗小小的星球。我们的故事开始了。', 'system');
      scanAchievements();
      return;
    }
    try {
      state = validate(JSON.parse(raw));
    } catch {
      saveFailed = saveBlocked = true;
      addLog(state, '检测到不兼容或损坏的存档。新版 beta 0.6.0 不支持过去版本存档，当前已进入保护模式，原存档不会被自动覆盖。请前往「设置」执行「硬重置」并确认：这会完全清空游戏存档，重新开始；新档保存成功后退出保护模式。', 'system');
      return;
    }
    // No offline catch-up: time while the page was closed is never settled.
    scanAchievements();
    resetClock();
  }

  /** Timer arguments are advisory; elapsed real time also covers background throttling. */
  function tick(_dt: number): void {
    if (state.settings?.paused) {
      lastTick = performance.now();
      return;
    }
    const now = performance.now();
    const elapsed = Math.max(0, (now - lastTick) / 1000);
    lastTick = now;
    if (!Number.isFinite(elapsed)) return;
    simulateElapsed(elapsed, dt => advanceGameTick(state, dt, tickHooks));
    saveElapsed += elapsed;
    if (saveElapsed >= 10) {
      saveElapsed %= 10;
      save();
    }
  }

  function replaceState(value: unknown): boolean {
    const next = validate(value);
    state = next;
    loaded = true;
    saveBlocked = false;
    resetClock();
    scanAchievements();
    return save();
  }

  function importSave(text: string): boolean {
    return replaceState(JSON.parse(text));
  }

  function exportSave(): string {
    // lastSaved is kept as save metadata only; loading never replays time from it.
    return JSON.stringify({ ...state, lastSaved: Date.now() }, null, 2);
  }

  function reset(kind: 'soft' | 'hard'): boolean {
    if (saveBlocked && kind !== 'hard') {
      addLog(state, '保护模式下无法软重置。请前往「设置」执行「硬重置」并确认清空存档。', 'system');
      return false;
    }
    const next = resetRunState(state, kind, sampleEventInterval(Math.random), Date.now());
    if (!next) return false;
    state = next.next;
    loaded = true;
    saveBlocked = false;
    resetClock();
    scanAchievements();
    if (!save()) {
      saveBlocked = true;
      addLog(state, '新存档写入失败，保护模式仍然开启。请检查浏览器存储权限或空间，然后在设置中重试硬重置。', 'system');
      return false;
    }
    return true;
  }

  return {
    get state(): GameState { return state; },
    get saveFailed(): boolean { return saveFailed; },
    get saveBlocked(): boolean { return saveBlocked; },
    replaceState,
    importSave,
    exportSave,
    save,
    load,
    tick,
    reset,
  };
}
