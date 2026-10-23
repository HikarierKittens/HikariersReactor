import { reactive, watch } from 'vue';
import type { AutomationConfig } from '../types/automation';
import { normalizeAutomationConfig } from '../state/automation-storage';

/**
 * 自动化面板的草稿状态。
 *
 * 面板就地编辑一份响应式副本，改完立刻交给运行时（自动化的设置在 `data` 之外的独立
 * 存储里，写失败只显示提示，不影响游戏存档）。这里只做两件事：
 * 1. 把外部传入的配置同步进草稿；
 * 2. 保证草稿永远是合法配置——归一化失败时保留上一份，不让界面写出坏数据。
 */

export interface AutomationDraft {
  readonly config: AutomationConfig;
  /** 用新的配置替换草稿；非法配置被拒绝并返回 false。 */
  update: (next: AutomationConfig) => boolean;
}

export function createAutomationDraft(source: () => AutomationConfig, onChange: (config: AutomationConfig) => void): AutomationDraft {
  const config = reactive<AutomationConfig>(cloneConfig(source()));
  watch(source, next => { Object.assign(config, cloneConfig(next)); });

  function update(next: AutomationConfig): boolean {
    const normalized = normalizeAutomationConfig(cloneConfig(next));
    if (!normalized) return false;
    Object.assign(config, normalized);
    onChange(normalized);
    return true;
  }

  return { config, update };
}

/** 深拷贝到可写的普通对象：响应式代理和存储里的旧对象都不能被就地修改。 */
function cloneConfig(config: AutomationConfig): AutomationConfig {
  return {
    version: config.version,
    values: Object.fromEntries(Object.entries(config.values).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])),
    overrides: Object.fromEntries(Object.entries(config.overrides).map(([key, rows]) => [key, rows.map(row => cloneRow(row))])),
    triggers: config.triggers.map(trigger => ({ ...trigger })),
    weighting: (config.weighting ?? []).map(rule => ({ ...rule })),
  };
}

/** 列表型选项的覆盖值可能是数组；浅拷贝会让草稿和存储共用同一个数组。 */
function cloneRow(row: AutomationConfig['overrides'][string][number]): AutomationConfig['overrides'][string][number] {
  const value = row.value;
  return Array.isArray(value) ? { ...row, value: [...value] as unknown as string } : { ...row };
}
