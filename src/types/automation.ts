import type { BuildingId } from './buildings';
import type { TechnologyId } from './technologies';
import type { GameState } from './state';

/**
 * 自动化脚本（Automation）的配置类型。
 *
 * 这些类型不进入 `GameState`：配置由 `automation-storage` 独立持久化，
 * 因此新增或调整选项永远不需要改动存档 schema。
 */

/** 条件 DSL 支持的取值来源；每一项都对应 `automation/conditions.ts` 的一个读取器。 */
export type ConditionSourceId =
  // 字面量：让条件两侧可以写常数，不必依赖某种资源。
  | 'number' | 'boolean' | 'string'
  // 资源
  | 'resourceQuantity' | 'resourceCap' | 'resourceRatio' | 'resourceIncome' | 'resourceUnlocked'
  | 'resourceSatisfied' | 'resourceSatisfyRatio'
  // 建筑
  | 'buildingCount' | 'buildingRunning' | 'buildingStopped' | 'buildingUnlocked' | 'buildingPurchasable'
  | 'buildingQueued' | 'buildingCost' | 'buildingAffordable'
  // 科技
  | 'techResearched' | 'techUnlocked' | 'techCostKnowledge'
  // 人口与就业
  | 'population' | 'idlePopulation' | 'housingCapacity' | 'jobWorkers' | 'jobCapacity' | 'jobUnlocked'
  // 社会
  | 'happiness' | 'taxRate' | 'government' | 'gameDays' | 'clicks'
  // 队列与任务
  | 'queueLength' | 'missionCompleted' | 'missionAvailable'
  // 军事与临近势力
  | 'soldierCount' | 'woundedCount' | 'armyLimit' | 'neighborControlled' | 'neighborMilitary'
  // ARPA 与飞船
  | 'arpaCount' | 'arpaProgress' | 'arpaUnlocked' | 'shipComponentReady'
  // 锻造与工厂
  | 'craftWorkers' | 'factoryLineWorkers' | 'smelterIdle'
  // 黑森（质量喷射）
  | 'blackHoleMass' | 'exoticMassRatio' | 'ejectionAllocated'
  // 威望
  | 'prestigeParticles' | 'prestigeCasimir' | 'prestigeDarkEnergy' | 'prestigeCrystals'
  | 'prestigeResets' | 'prestigeType' | 'nuclearProgress'
  // 基因与特质
  | 'geneLevel' | 'dnaStock' | 'speciesTrait'
  // 容器
  | 'containerFree' | 'alloyContainerFree'
  // 标识符（用于与触发器/列表里的 id 比较）
  | 'resourceId' | 'buildingId' | 'techId';

/**
 * 比较运算符。语义对齐参考脚本的“高级设置”：多了严格相等、位逻辑组合与取反形式。
 *
 * `A?B` / `!A?B` 是“带输出值的条件”：命中时把**右侧的取值**作为覆盖值，
 * 因此可以让覆盖值本身也来自状态（例如“资源满足率 ≥ 某值时覆盖为该值”）。
 */
export type CompareOperator =
  | '==' | '!=' | '===' | '!==' | '>' | '<' | '>=' | '<='
  | '&&' | '||' | 'NAND' | 'NOR' | 'XOR' | 'XNOR' | 'AND!' | 'OR!'
  | 'A?B' | '!A?B';

/** 一行条件：左右两个取值来源 + 运算符。命中时覆盖为 `value`。 */
export interface ConditionRow {
  left: ConditionSourceId;
  leftArg: string;
  operator: CompareOperator;
  right: ConditionSourceId;
  rightArg: string;
  /** 命中后该设置的取值；缺失表示使用该设置自身的默认值。`A?B` 系列忽略此项。 */
  value?: number | boolean | string;
}

/** 选项可用于条件行的“参数 ID”种类，界面据此决定第二列用下拉还是文本框。 */
export type OptionArgKind = 'none' | 'resource' | 'building' | 'tech' | 'text' | 'option';

/** 设置项的描述，界面与求值共用同一份注册表。 */
export interface AutomationOption {
  /** `overrides` 表使用的键，落盘后不可改名。 */
  key: string;
  label: string;
  hint: string;
  kind: 'toggle' | 'number' | 'string' | 'select' | 'list';
  default: number | boolean | string | string[];
  /** number 类型的最小/最大与取整要求。 */
  min?: number;
  max?: number;
  integer?: boolean;
  /** select 类型的候选值。 */
  choices?: { value: string; label: string; hint?: string }[];
  /** list 类型的候选 ID 来源（按需生成，避免注册表加载时就把全量名表拼好）。 */
  listSource?: () => { id: string; label: string }[];
}

export interface AutomationSection {
  id: string;
  label: string;
  /** 默认折叠状态；脚本类设置很多，默认折叠更省空间。 */
  collapsed?: boolean;
  options: AutomationOption[];
}

/** 触发器动作：脚本能替玩家做的操作。 */
export type TriggerActionType =
  | 'build' | 'research' | 'arpa' | 'mission' | 'ship'
  | 'queueBuild' | 'queueResearch' | 'queueArpa'
  | 'worker' | 'craftWorker' | 'factoryLine' | 'smelterIdle'
  | 'eject' | 'container' | 'alloyContainer';

/** 触发器：满足条件后反复执行一个动作，直到动作被判定为完成。 */
export interface AutomationTrigger {
  /** 稳定的行标识：移动/删除不改变其它触发器的 id。 */
  id: number;
  /** 启用状态；关闭的行仍然保留在列表里。 */
  enabled: boolean;
  /** 与上一条串联：上一条判定完成后本条才开始。 */
  chain: boolean;
  left: ConditionSourceId;
  leftArg: string;
  operator: CompareOperator;
  right: ConditionSourceId;
  rightArg: string;
  action: TriggerActionType;
  actionId: string;
  /** 需要的完成数量；用于判定“已完成”与“还剩几次”。 */
  actionCount: number;
}

/** 权重规则的“条件”部分：全部成立时该规则生效。 */
export interface WeightingRule {
  id: number;
  enabled: boolean;
  /** 作用目标的说明（界面显示），实际判定在 `automation/weighting.ts`。 */
  kind: string;
  multiplier: number;
}

/** 落盘结构；`version` 用于配置迁移，与存档 schema 完全独立。 */
export interface AutomationConfig {
  version: number;
  values: Record<string, unknown>;
  overrides: Record<string, ConditionRow[]>;
  triggers: AutomationTrigger[];
  weighting: WeightingRule[];
}

/** 一次引擎运行的结果，供界面与测试观察。 */
export interface AutomationRunReport {
  /** 本 tick 实际执行的动作数量。 */
  actions: number;
  /** 触发了安全模式的原因；null 表示正常。 */
  fault: string | null;
  /** 本 tick 命中的覆盖键，界面据此高亮。 */
  overridden?: string[];
  /** 本 tick 实际执行过的触发器 id。 */
  triggersFired?: number[];
  /**
   * 自动威望重置后的新状态。
   *
   * 重置会整份换掉 `GameState`（`launch*Prestige` 返回新对象），而引擎的 `tick` 只拿得到
   * 旧对象，无法原地改掉调用方的变量。所以由引擎把新状态放进出参，运行时负责替换。
   * 没有发生重置时不设置这个字段。
   */
  prestigeReset?: { kind: 'nuclear' | 'escape' | 'blackHole' | 'digital'; reward: number; next: GameState };
}

/** 触发器动作需要哪种 id，界面据此渲染第三列。 */
export type TriggerActionArgKind = 'building' | 'technology' | 'arpa' | 'mission' | 'ship' | 'resource' | 'job' | 'factoryLine';

export interface TriggerActionSpec {
  value: TriggerActionType;
  label: string;
  arg: TriggerActionArgKind;
  hint: string;
}

/** 权重规则的目标分类（只列出本游戏真实存在的场景）。 */
export interface WeightingKindSpec {
  value: string;
  label: string;
  hint: string;
}

/** 触发器动作引用的各类 id，供 `modules` 与界面共用。 */
export interface TriggerTargets {
  building: BuildingId;
  technology: TechnologyId;
}
