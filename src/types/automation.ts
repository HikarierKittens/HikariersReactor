/**
 * 自动化脚本（Automation）的配置类型。
 *
 * 这些类型不进入 `GameState`：配置由 `automation-storage` 独立持久化，
 * 因此新增或调整选项永远不需要改动存档 schema。
 */

/** 条件 DSL 支持的取值来源；每一项都对应 `automation/conditions.ts` 的一个读取器。 */
export type ConditionSourceId =
  | 'number' | 'boolean' | 'string'
  | 'resourceQuantity' | 'resourceCap' | 'resourceRatio' | 'resourceIncome' | 'resourceUnlocked'
  | 'buildingCount' | 'buildingRunning' | 'buildingUnlocked' | 'buildingPurchasable' | 'buildingQueued'
  | 'techResearched' | 'techUnlocked'
  | 'population' | 'soldierCount' | 'housingCapacity' | 'happiness' | 'taxRate' | 'gameDays'
  | 'queueLength' | 'arpaCount' | 'prestigeParticles' | 'prestigeResets' | 'prestigeType' | 'government'
  | 'resourceId' | 'buildingId' | 'techId';

export type CompareOperator = '==' | '!=' | '>' | '<' | '>=' | '<=' | '&&' | '||' | 'A?B';

/** 一行条件：左右两个取值来源 + 运算符。命中时覆盖为 `value`。 */
export interface ConditionRow {
  left: ConditionSourceId;
  leftArg: string;
  operator: CompareOperator;
  right: ConditionSourceId;
  rightArg: string;
  /** 命中后该设置的取值；缺失表示使用该设置自身的默认值。 */
  value?: number | boolean | string;
}

/** 设置项的描述，界面与求值共用同一份注册表。 */
export interface AutomationOption {
  /** `overrides` 表使用的键，落盘后不可改名。 */
  key: string;
  label: string;
  hint: string;
  kind: 'toggle' | 'number' | 'string';
  default: number | boolean | string;
  /** number 类型的最小/最大与取整要求。 */
  min?: number;
  max?: number;
  integer?: boolean;
}

export interface AutomationSection {
  id: string;
  label: string;
  /** 默认折叠状态；脚本类设置很多，默认折叠更省空间。 */
  collapsed?: boolean;
  options: AutomationOption[];
}

export type TriggerActionType = 'build' | 'research' | 'arpa' | 'queueBuild' | 'queueResearch';

/** 触发器：满足条件后反复执行一个动作，直到动作被判定为完成。 */
export interface AutomationTrigger {
  left: ConditionSourceId;
  leftArg: string;
  operator: CompareOperator;
  right: ConditionSourceId;
  rightArg: string;
  action: TriggerActionType;
  actionId: string;
  /** 需要的完成数量；`chain` 之外的比较用它判定 "已完成"。 */
  actionCount: number;
  /** 与上一优先级触发器串联：上一条完成后本条才开始。 */
  chain: boolean;
  enabled: boolean;
}

/** 落盘结构；`version` 用于配置迁移，与存档 schema 完全独立。 */
export interface AutomationConfig {
  version: number;
  values: Record<string, number | boolean | string>;
  overrides: Record<string, ConditionRow[]>;
  triggers: AutomationTrigger[];
}

/** 一次引擎运行的结果，供界面与测试观察。 */
export interface AutomationRunReport {
  /** 本 tick 实际执行的动作数量。 */
  actions: number;
  /** 触发了安全模式的原因；null 表示正常。 */
  fault: string | null;
}
