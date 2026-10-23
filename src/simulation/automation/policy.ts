import { AUTOMATION_OPTIONS } from '../../data/automation';
import { evaluateConditionRow } from './conditions';
import type { ConditionContext } from './conditions';
import type { AutomationConfig, AutomationOption } from '../../types/automation';

/**
 * 设置求值：注册表默认值 → 条件覆盖表（自上而下，首个命中的生效）。
 *
 * 覆盖表是为"不想为这一次改设置"准备的，例如「资源满 90% 时关闭自动锻造」。
 * 它只影响脚本自己的选项，永远不改游戏状态。
 *
 * 列表型选项（`list`）的覆盖语义与参考脚本一致：命中值是**列表**时，多行命中按顺序
 * 拼接（XOR 累加）；命中值是**字符串**时视为单元素列表。这样「某个条件下额外多建一种
 * 建筑」不需要重写整张列表。
 */

export type AutomationValue = number | boolean | string | string[];
export type AutomationValues = Record<string, AutomationValue>;
export type OverriddenKeys = ReadonlySet<string>;

export interface ResolvedAutomation {
  values: AutomationValues;
  /** 当前被覆盖表改写的键，界面据此高亮。 */
  overridden: OverriddenKeys;
}

function coerce(option: AutomationOption, value: unknown): AutomationValue | undefined {
  if (option.kind === 'toggle') return typeof value === 'boolean' ? value : undefined;
  if (option.kind === 'string') return typeof value === 'string' ? value : undefined;
  if (option.kind === 'select') {
    if (typeof value !== 'string') return undefined;
    return option.choices?.some(choice => choice.value === value) ? value : undefined;
  }
  if (option.kind === 'list') {
    const rows = Array.isArray(value) ? value : typeof value === 'string' ? [value] : undefined;
    if (!rows || rows.some(row => typeof row !== 'string')) return undefined;
    // 去重但保留顺序：重复项对分配没有意义，只会让界面出现两条一样的行。
    return [...new Set(rows as string[])];
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const min = option.min ?? 0, max = option.max ?? Number.MAX_SAFE_INTEGER;
  if (value < min || value > max) return undefined;
  return option.integer ? Math.round(value) : value;
}

/** 列表型覆盖的累加：命中行按顺序拼接，而不是互相替换。 */
function concatenate(current: AutomationValue, addition: AutomationValue): AutomationValue {
  return [...new Set([...(current as string[]), ...(addition as string[])])];
}

export function resolveAutomation(config: AutomationConfig, context: ConditionContext): ResolvedAutomation {
  const values: AutomationValues = {};
  const overridden = new Set<string>();
  for (const [key, option] of Object.entries(AUTOMATION_OPTIONS)) {
    const stored = config.values[key];
    values[key] = coerce(option, stored) ?? (option.kind === 'list' ? [...(option.default as string[])] : option.default as AutomationValue);
    const rows = config.overrides[key];
    if (!rows || rows.length === 0) continue;
    for (const row of rows) {
      const result = evaluateConditionRow(context, row);
      if (!result.matched) continue;
      const next = coerce(option, result.value);
      if (next === undefined) continue;
      values[key] = option.kind === 'list' && overridden.has(key) ? concatenate(values[key], next) : next;
      overridden.add(key);
      if (option.kind !== 'list') break;
    }
  }
  return { values, overridden };
}

/** 读数值型选项；类型不对时退回注册表默认值，不让 `undefined` 流到计算里。 */
export function numericValue(values: AutomationValues, key: string): number {
  const value = values[key];
  if (typeof value === 'number') return value;
  const fallback = AUTOMATION_OPTIONS[key]?.default;
  return typeof fallback === 'number' ? fallback : 0;
}

export function booleanValue(values: AutomationValues, key: string): boolean {
  const value = values[key];
  if (typeof value === 'boolean') return value;
  const fallback = AUTOMATION_OPTIONS[key]?.default;
  return typeof fallback === 'boolean' ? fallback : false;
}

export function stringValue(values: AutomationValues, key: string): string {
  const value = values[key];
  if (typeof value === 'string') return value;
  const fallback = AUTOMATION_OPTIONS[key]?.default;
  return typeof fallback === 'string' ? fallback : '';
}

export function listValue(values: AutomationValues, key: string): string[] {
  const value = values[key];
  if (Array.isArray(value)) return value;
  const fallback = AUTOMATION_OPTIONS[key]?.default;
  return Array.isArray(fallback) ? [...fallback] : [];
}
