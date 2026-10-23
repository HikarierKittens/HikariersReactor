import { AUTOMATION_OPTIONS, CONDITION_SOURCES, blankTrigger } from '../data/automation';
import type { AutomationConfig, AutomationOption, AutomationTrigger, CompareOperator, ConditionSourceId, ConditionRow } from '../types/automation';

/**
 * 自动化配置的**独立**持久化契约。
 *
 * 它不属于存档 schema：配置值不进 `GameState`，因此调整选项永远不会让玩家存档失效。
 * 规则与存档一致的部分：显式非法的输入整份拒绝（返回 null），不静默修复；缺失的键
 * 才用注册表默认值补齐。
 */

export const AUTOMATION_CONFIG_VERSION = 1;
export const AUTOMATION_STORAGE_KEY = 'meow-civilization-automation-v1';

const SOURCE_IDS = new Set<string>(CONDITION_SOURCES.map(source => source.id));
const OPERATORS = new Set<string>(['==', '!=', '>', '<', '>=', '<=', '&&', '||', 'A?B']);
const TRIGGER_ACTIONS = new Set<string>(['build', 'research', 'arpa', 'queueBuild', 'queueResearch']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 单个取值是否满足选项的取值范围；不满足时返回 null（交给调用方拒绝整份配置）。 */
function normalizeOptionValue(option: AutomationOption, value: unknown): number | boolean | string | null {
  if (option.kind === 'toggle') return typeof value === 'boolean' ? value : null;
  if (option.kind === 'string') return typeof value === 'string' && value.length <= 64 ? value : null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (option.integer && !Number.isSafeInteger(value)) return null;
  const min = option.min ?? 0, max = option.max ?? Number.MAX_SAFE_INTEGER;
  return value >= min && value <= max ? value : null;
}

function normalizeRow(value: unknown): ConditionRow | null {
  if (!isPlainObject(value)) return null;
  const { left, leftArg, operator, right, rightArg } = value;
  if (typeof left !== 'string' || !SOURCE_IDS.has(left)) return null;
  if (typeof right !== 'string' || !SOURCE_IDS.has(right)) return null;
  if (typeof operator !== 'string' || !OPERATORS.has(operator)) return null;
  if (typeof leftArg !== 'string' || typeof rightArg !== 'string' || leftArg.length > 64 || rightArg.length > 64) return null;
  const row: ConditionRow = { left: left as ConditionSourceId, leftArg, operator: operator as CompareOperator, right: right as ConditionSourceId, rightArg };
  if (value.value !== undefined) {
    if (!['number', 'boolean', 'string'].includes(typeof value.value)) return null;
    row.value = value.value as number | boolean | string;
  }
  return row;
}

function normalizeTrigger(value: unknown): AutomationTrigger | null {
  const row = normalizeRow(value);
  if (!row || !isPlainObject(value)) return null;
  const { action, actionId, actionCount, chain, enabled } = value;
  if (typeof action !== 'string' || !TRIGGER_ACTIONS.has(action)) return null;
  if (typeof actionId !== 'string' || actionId.length === 0 || actionId.length > 64) return null;
  if (typeof actionCount !== 'number' || !Number.isSafeInteger(actionCount) || actionCount < 1 || actionCount > 100000) return null;
  if (typeof chain !== 'boolean' || typeof enabled !== 'boolean') return null;
  return { ...row, action: action as AutomationTrigger['action'], actionId, actionCount, chain, enabled };
}

/** 只有显式给出且结构正确的字段才采用；缺失项用默认值。非法值返回 null 由调用方拒绝。 */
export function normalizeAutomationConfig(value: unknown): AutomationConfig | null {
  if (!isPlainObject(value)) return null;
  if (value.version !== AUTOMATION_CONFIG_VERSION) return null;
  const config: AutomationConfig = { version: AUTOMATION_CONFIG_VERSION, values: {}, overrides: {}, triggers: [] };
  const values = value.values ?? {};
  if (!isPlainObject(values)) return null;
  for (const [key, option] of Object.entries(AUTOMATION_OPTIONS)) {
    const raw = values[key];
    if (raw === undefined) { config.values[key] = option.default; continue; }
    const normalized = normalizeOptionValue(option, raw);
    if (normalized === null) return null;
    config.values[key] = normalized;
  }
  const overrides = value.overrides ?? {};
  if (!isPlainObject(overrides)) return null;
  for (const [key, rows] of Object.entries(overrides)) {
    // 只有真实存在的选项可以带覆盖行；未知键说明配置来自别的版本，拒绝而不是丢弃。
    if (!Object.hasOwn(AUTOMATION_OPTIONS, key) || !Array.isArray(rows)) return null;
    const normalized: ConditionRow[] = [];
    for (const row of rows) {
      const parsed = normalizeRow(row);
      if (!parsed) return null;
      normalized.push(parsed);
    }
    config.overrides[key] = normalized;
  }
  if (value.triggers !== undefined) {
    if (!Array.isArray(value.triggers)) return null;
    for (const trigger of value.triggers) {
      const parsed = normalizeTrigger(trigger);
      if (!parsed) return null;
      config.triggers.push(parsed);
    }
  }
  return config;
}

/** 按注册表生成默认配置；新增选项自动带上，无需迁移。 */
export function createDefaultAutomationConfig(): AutomationConfig {
  return normalizeAutomationConfig({ version: AUTOMATION_CONFIG_VERSION, values: {}, overrides: {}, triggers: [] })!;
}

/**
 * 读配置。任何异常、缺失或结构不符都回退到默认值：
 * 自动化的配置只影响自动化本身，绝不允许它阻止游戏启动。
 */
export function parseAutomationConfig(text: string | null): { config: AutomationConfig; restored: boolean } {
  if (text === null) return { config: createDefaultAutomationConfig(), restored: false };
  try {
    const parsed = normalizeAutomationConfig(JSON.parse(text));
    return parsed ? { config: parsed, restored: false } : { config: createDefaultAutomationConfig(), restored: true };
  } catch {
    return { config: createDefaultAutomationConfig(), restored: true };
  }
}

export function serializeAutomationConfig(config: AutomationConfig): string {
  return JSON.stringify(config);
}

export interface ConfigReader { getItem(key: string): string | null }
export interface ConfigWriter { setItem(key: string, value: string): void }

export function loadAutomationConfig(storage: ConfigReader): { config: AutomationConfig; restored: boolean } {
  try {
    return parseAutomationConfig(storage.getItem(AUTOMATION_STORAGE_KEY));
  } catch {
    return { config: createDefaultAutomationConfig(), restored: true };
  }
}

/** 写入失败只返回 false：配置没保存不应该影响游戏本身的存档流程。 */
export function persistAutomationConfig(storage: ConfigWriter, config: AutomationConfig): boolean {
  try {
    storage.setItem(AUTOMATION_STORAGE_KEY, serializeAutomationConfig(config));
    return true;
  } catch {
    return false;
  }
}

export { blankTrigger };
