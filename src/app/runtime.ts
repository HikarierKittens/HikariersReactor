import { floorWithPrecision } from '../shared/format';
import type { GameState } from '../types/state';
import { createInitialState } from '../state/create-state';
import { advanceGameTick } from '../simulation/tick';
import { clampSoldiersToArmyLimit } from '../simulation/military';
import type { TickHooks } from '../simulation/tick';
import { sampleEventInterval, applyRandomEvent } from '../simulation/events';
import { clampResourcesToCaps } from '../simulation/storage';
import { advanceProjectQueue } from '../simulation/project-queue';
import { settlePurchaseQueue } from '../simulation/purchases';
import { simulateElapsed } from '../simulation/tick';
import { updateProgression, addLog } from '../simulation/progression';
import { persistGame } from '../state/persistence';
import { validateAndMigrateSave } from '../state/validate-save';
import { decodeSaveText, encryptSaveText } from '../state/save-cipher';
import { calculateHousingDetails } from '../simulation/housing';
import { calculateSupportPreview } from '../simulation/support-preview';
import { ACHIEVEMENTS } from '../data/progression';
import { previewMorale } from '../simulation/production';
import { resetRunState } from '../simulation/prestige';
import { CONFIG } from '../data/config';
import { initializeTechnologyCosts } from '../simulation/technology';
import { createAutomationEngine } from '../simulation/automation/engine';
import { createDefaultAutomationConfig, loadAutomationConfig, persistAutomationConfig } from '../state/automation-storage';
import type { AutomationConfig, AutomationRunReport } from '../types/automation';

// The typed registry retains legacy base prices; normalize it once at app startup.
initializeTechnologyCosts();

export interface Runtime {
  readonly state: GameState;
  readonly saveFailed: boolean;
  readonly saveBlocked: boolean;
  /** Validates before replacing; returns whether the accepted state was persisted. */
  replaceState: (value: unknown) => boolean;
  /**
   * Accepts an encrypted envelope or a legacy plaintext save. Parsing, decryption and
   * validation errors throw for callers to display; false means persistence failed.
   */
  importSave: (text: string) => Promise<boolean>;
  /** Encrypts the current game. Rejects when the page is not a secure context. */
  exportSave: () => Promise<string>;
  /** Plaintext export used only to show a preview inside the panel. */
  exportSavePlaintext: () => string;
  /** Returns the untouched protected storage text, never the temporary game. */
  exportProtectedSave: () => string;
  save: () => boolean;
  load: () => void;
  tick: (dt: number) => void;
  reset: (kind: 'soft' | 'hard') => boolean;
  /** Automation settings, kept outside the save schema so they never invalidate a save. */
  readonly automation: AutomationConfig;
  /** Replaces the automation settings and persists them independently of the game save. */
  setAutomation: (config: AutomationConfig) => boolean;
  /** Whether the last automation write reached localStorage. */
  readonly automationSaveFailed: boolean;
  /** Result of the most recent automation run, for the panel to display. */
  readonly automationReport: AutomationRunReport | null;
}

/** The one owner of mutable game state, ticking, persistence and reset for the application. */
export function createRuntime(initialAutomation?: AutomationConfig): Runtime {
  let state = createInitialState(CONFIG.version, sampleEventInterval(Math.random), Date.now());
  let lastTick = performance.now();
  let saveElapsed = 0;
  // Keep background debt out of a single blocking call; retain one-second settlement semantics.
  let pendingSimulation = 0;
  let saveFailed = false;
  let saveBlocked = false;
  let loaded = false;
  let protectedSaveText: string | null = null;
  // 自动化配置独立于存档：读不出来只回退默认值，绝不影响游戏本身能否启动。
  // 自动化的存储要在第一次真正 `tick` 时才读：构造运行时不碰存储，
  // 让"加载存档只读一次本地存储"这条既有约定继续成立。
  let automation: AutomationConfig = initialAutomation ?? createDefaultAutomationConfig();
  let automationLoaded = initialAutomation !== undefined;
  let automationSaveFailed = false;
  let automationReport: AutomationRunReport | null = null;
  const automationEngine = createAutomationEngine({
    // 每 tick 都重新读一遍当前配置：面板里改完立刻生效，不需要重建引擎。
    config: () => automationFor(),
    random: Math.random,
  });

  /** localStorage 可能整个不可用（隐私模式、权限被拒）；这里只负责拿一个安全句柄。 */
  function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> {
    try {
      return localStorage;
    } catch {
      return { getItem: () => null, setItem: () => { throw Error('storage unavailable'); } };
    }
  }

  function capacity(candidate: GameState = state): number {
    const { asriel, stageThree, digital } = calculateSupportPreview(candidate);
    return floorWithPrecision(calculateHousingDetails(candidate, asriel, stageThree, digital).reduce((sum, row) => sum + row.value, 0));
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

  /**
   * The army may never exceed the capacity its running barracks, garrisons and simulators
   * provide, so a load or import drops any surplus instead of carrying it forward.
   * The saved training progress is kept when the army still has room to grow.
   */
  function enforceArmyLimit(candidate: GameState): GameState {
    const before = candidate.soldiers;
    clampSoldiersToArmyLimit(candidate);
    if (candidate.soldiers !== before) addLog(candidate, `军营与驻军的可容纳数量不足，已移除 ${before - candidate.soldiers} 名多余士兵。`, 'progress');
    return candidate;
  }

  function resetClock(): void {
    saveElapsed = 0;
    pendingSimulation = 0;
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
    // 自动化排在购买结算之后：它这一 tick 下的购买单要在下一次结算才生效，
    // 所以脚本的每一步都建立在"已结算的真实状态"上，不会读到半成品队列。
    // 引擎自己捕获所有异常并记成 fault，因此这里不需要 try。
    afterRun: () => { automationReport = automationEngine.tick(state); },
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
      addLog(state, '无法读取本地存档，已进入保护模式。可在「设置」点击「导出不兼容的旧版本存档」尝试备份；若仍无法读取，请先检查浏览器存储权限。', 'system');
      return;
    }
    if (raw === null) {
      addLog(state, '第一只猫猫登陆了这颗小小的星球。我们的故事开始了。', 'system');
      scanAchievements();
      return;
    }
    try {
      state = enforceArmyLimit(validate(JSON.parse(raw)));
    } catch (error) {
      saveFailed = saveBlocked = true;
      protectedSaveText = raw;
      // The player-facing line stays generic, but the browser console reports the exact
      // stage that rejected the save so a load failure can be diagnosed without guessing.
      // console.warn, not console.error: the acceptance page treats every console.error as
      // a failed assertion (it is the uncaught-exception net), and a rejected legacy save
      // is a handled, expected outcome here.
      console.warn('[存档载入失败]', error instanceof Error ? error.message : error);
      addLog(state, '检测到暂时无法载入的存档，已进入保护模式，原存档不会被自动覆盖。请先前往「设置」点击「导出不兼容的旧版本存档」备份原档；当前分支默认兼容此前版本，请优先更新后重载或导入备份，并报告载入问题。明确退役的schema12～30仍不支持。只有决定放弃原进度时才执行「硬重置」并确认：这会完全清空游戏存档，重新开始；新档保存成功后退出保护模式。', 'system');
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
    // No accelerated settlement: background time only counts as one step per
    // 1-second game tick, so throttled pages run at normal in-game speed.
    pendingSimulation = Math.min(1, pendingSimulation + Math.min(elapsed, 1));
    const batchStart = performance.now();
    let steps = 0;
    while (pendingSimulation > 1e-9 && steps < 10) {
      const dt = Math.min(1, pendingSimulation);
      simulateElapsed(dt, step => advanceGameTick(state, step, tickHooks));
      pendingSimulation = Math.max(0, pendingSimulation - dt);
      steps++;
      // At least one step progresses even on slower late-game saves.
      if (performance.now() - batchStart >= 8) break;
    }
    saveElapsed += elapsed;
    if (saveElapsed >= 10) {
      saveElapsed %= 10;
      save();
    }
  }

  function replaceState(value: unknown): boolean {
    const next = enforceArmyLimit(validate(value));
    state = next;
    loaded = true;
    saveBlocked = false;
    resetClock();
    scanAchievements();
    return save();
  }

  async function importSave(text: string): Promise<boolean> {
    // Decrypt first (no-op for legacy plaintext), then reuse the same JSON chain.
    const plaintext = await decodeSaveText(text);
    return replaceState(JSON.parse(plaintext));
  }

  function exportProtectedSave(): string {
    if (!saveBlocked) throw Error('当前未处于保护模式。');
    if (protectedSaveText !== null) return protectedSaveText;
    try {
      const text = localStorage.getItem(CONFIG.saveKey);
      if (text === null) throw Error('没有可导出的旧存档。');
      protectedSaveText = text;
      return text;
    } catch {
      throw Error('无法读取被保护的旧存档，请检查浏览器存储权限；未导出临时新游戏。');
    }
  }

  function exportSavePlaintext(): string {
    // lastSaved is kept as save metadata only; loading never replays time from it.
    return JSON.stringify({ ...state, lastSaved: Date.now() }, null, 2);
  }

  async function exportSave(): Promise<string> {
    return encryptSaveText(exportSavePlaintext());
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

  /** 首次访问自动化设置时才读存储：构造运行时必须保持"不碰 localStorage"。 */
  function automationFor(): AutomationConfig {
    if (!automationLoaded) {
      automationLoaded = true;
      automation = loadAutomationConfig(safeStorage()).config;
    }
    return automation;
  }

  /**
   * 替换自动化设置并独立持久化。写入失败只标记状态，不回滚内存里的设置：
   * 玩家刚改的选项应该立刻生效，即使这次没写进存储。
   */
  function setAutomation(config: AutomationConfig): boolean {
    automation = config;
    automationLoaded = true;
    automationSaveFailed = !persistAutomationConfig(safeStorage(), config);
    return !automationSaveFailed;
  }

  return {
    get state(): GameState { return state; },
    get saveFailed(): boolean { return saveFailed; },
    get saveBlocked(): boolean { return saveBlocked; },
    replaceState,
    importSave,
    exportSave,
    exportSavePlaintext,
    exportProtectedSave,
    save,
    load,
    tick,
    reset,
    get automation(): AutomationConfig { return automationFor(); },
    get automationSaveFailed(): boolean { return automationSaveFailed; },
    get automationReport(): AutomationRunReport | null { return automationReport; },
    setAutomation,
  };
}
