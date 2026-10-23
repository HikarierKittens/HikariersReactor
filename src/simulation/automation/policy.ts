import { AUTOMATION_OPTIONS } from '../../data/automation';
import { evaluateConditionRow } from './conditions';
import type { ConditionContext } from './conditions';
import type { AutomationConfig, AutomationOption } from '../../types/automation';

/**
 * 设置求值：注册表默认值 → 条件覆盖表（自上而下，首个命中的生效）。
 *
 * 覆盖表是为"不想为这一次改设置"准备的，例如「资源满 90% 时关闭自动锻造」。
 * 它只影响脚本自己的选项，永远不改游戏状态。
 */

export type AutomationValue = number | boolean | string;
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
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const min = option.min ?? 0, max = option.max ?? Number.MAX_SAFE_INTEGER;
  if (value < min || value > max) return undefined;
  return option.integer ? Math.round(value) : value;
}

export function resolveAutomation(config: AutomationConfig, context: ConditionContext): ResolvedAutomation {
  const values: AutomationValues = {};
  const overridden = new Set<string>();
  for (const [key, option] of Object.entries(AUTOMATION_OPTIONS)) {
    const stored = config.values[key];
    values[key] = coerce(option, stored) ?? option.default;
    const rows = config.overrides[key];
    if (!rows || rows.length === 0) continue;
    for (const row of rows) {
      const result = evaluateConditionRow(context, row);
      if (!result.matched) continue;
      const next = coerce(option, result.value);
      if (next === undefined) continue;
      values[key] = next;
      overridden.add(key);
      break;
    }
  }
  return { values, overridden };
}
