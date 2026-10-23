import { BUILDINGS } from '../data/buildings';
import { TECHNOLOGIES } from '../data/technologies';
import { RESOURCES } from '../data/resources';
import type { BuildingId } from '../types/buildings';
import type { ResourceId } from '../types/economy';
import type { TechnologyId } from '../types/technologies';
import type { AutomationOption, AutomationSection, AutomationTrigger, ConditionRow, ConditionSourceId } from '../types/automation';

/**
 * 自动化选项注册表。
 *
 * 只放**纯数据**：默认值、文案、取值边界。求值逻辑在 `automation/policy.ts`，
 * 执行逻辑在 `automation/modules/*`。界面按这里的顺序与分组渲染，因此新增一个开关
 * 只需要改这一个文件（再在对应模块里读它）。
 *
 * 键名落盘后不可改名：改名等于让玩家已有的配置失效。
 */

const toggle = (key: string, label: string, hint: string, value = false): AutomationOption =>
  ({ key, label, hint, kind: 'toggle', default: value });
const number = (key: string, label: string, hint: string, value: number, min = 0, max = Number.MAX_SAFE_INTEGER, integer = true): AutomationOption =>
  ({ key, label, hint, kind: 'number', default: value, min, max, integer });

export const AUTOMATION_SECTIONS: readonly AutomationSection[] = [
  {
    id: 'general',
    label: '通用',
    options: [
      toggle('master', '启用自动化', '总开关。关闭后脚本只更新状态，不执行任何动作。'),
      number('tickInterval', '运算间隔（tick）', '每经过多少个游戏 tick 运行一次脚本。1 表示每个 tick 都运行。', 1, 1, 240),
      number('maxActionsPerRun', '单次最高动作数', '每次运行最多执行多少个动作，用来限制卡顿。', 40, 1, 400),
      toggle('safeMode', '安全模式', '脚本出错时自动暂停自动化并记录原因，避免错误在每一 tick 重复发生。', true),
    ],
  },
  {
    id: 'jobs',
    label: '工作分配',
    options: [
      toggle('autoWorkers', '自动分配工作', '用空闲人口填补已启用的岗位。不会从其他岗位调人。'),
      number('reservePopulation', '预留空闲人口', '始终保留这么多只空闲猫猫，不参与自动分配。', 0, 0),
      toggle('autoWorkersFollowCapacity', '岗位满员后停止', '岗位人数达到上限后不再继续分配。', true),
    ],
  },
  {
    id: 'building',
    label: '自动建造',
    options: [
      toggle('autoBuild', '自动建造', '按建造列表自上而下尝试建造，资源不足时跳过。'),
      number('autoBuildKeepCash', '保留资金', '自动建造不会动用低于该数值的资金。', 0, 0),
      toggle('buildingPriorityRespectQueue', '尊重手动队列', '手动加入队列的目标不会被自动建造重复购买。', true),
      number('buildingBuildPassCount', '建造轮数', '每次运行最多进行几轮建造。数值越高推进越快，也越容易出现资源竞争。', 1, 1, 12),
    ],
  },
  {
    id: 'research',
    label: '自动研究',
    options: [
      toggle('autoResearch', '自动研究', '按研究顺序自动完成可研究科技。'),
      number('researchKeepKnowledge', '保留知识', '自动研究不会动用低于该数值的知识。', 0, 0),
      toggle('researchFillQueue', '填满研究队列', '资源不足时把目标加入研究队列，而不是等待。'),
    ],
  },
  {
    id: 'crafting',
    label: '自动锻造',
    options: [
      toggle('autoCraft', '自动锻造', '当锻造物未达保留上限且原料充足时自动锻造。'),
      number('craftReserveRatio', '原料保留比例', '锻造后原料不能低于储量上限的这个比例（0.2 表示 20%）。', 0.2, 0, 1, false),
      number('craftTargetRatio', '产物目标比例', '锻造物达到储量上限的这个比例后停止锻造。', 0.95, 0, 1, false),
    ],
  },
  {
    id: 'state',
    label: '建筑开关',
    options: [
      toggle('autoPower', '自动分配供电', '电力不足时按建筑的开启优先级关闭靠后的建筑，电力恢复后重新开启。'),
      number('autoPowerReserve', '电力保留', '始终保留下来的电力余量，低于该值才开始关闭建筑。', 0, 0),
    ],
  },
  {
    id: 'prestige',
    label: '威望重置',
    options: [
      toggle('autoPrestige', '自动威望重置', '达到条件后自动执行威望重置。会开始新周目，请确认已经理解后果。'),
      number('prestigeTargetResets', '目标重置次数', '当前类型的重置次数达到该数值后停止自动重置。0 表示不限制。', 0, 0),
      toggle('prestigeNuclear', '允许核爆重置', '核弹进度填满后立即发射。'),
      number('prestigeNuclearPopulation', '核爆人口阈值', '人口达到该数值后才发射核弹。', 0, 0),
      toggle('prestigeEscape', '允许逃离重置', 'ESS-喵星号组装完成后立即启程。'),
      toggle('prestigeBlackHole', '允许黑洞重置', '奇异质量失控后立即引爆。'),
      toggle('prestigeDigital', '允许数字化飞升', 'AI 飞升核心就绪后立即飞升。'),
    ],
  },
  {
    id: 'triggers',
    label: '触发器',
    options: [
      toggle('autoTrigger', '启用触发器', '按触发器列表自上而下执行条件满足的动作。'),
      number('triggerRepeatLimit', '单次重复上限', '同一个触发器在一次运行中最多执行的次数。', 3, 1, 100),
    ],
  },
];

/** 扁平选项表：键 -> 定义。求值与界面共用同一份。 */
export const AUTOMATION_OPTIONS: Readonly<Record<string, AutomationOption>> =
  Object.fromEntries(AUTOMATION_SECTIONS.flatMap(section => section.options.map(option => [option.key, option])));

export function automationDefault(key: string): number | boolean | string {
  const option = AUTOMATION_OPTIONS[key];
  if (!option) throw Error(`未知的自动化选项：${key}`);
  return option.default;
}

/** 条件 DSL 的取值来源；`arg` 决定该来源需要哪一种 id。 */
export const CONDITION_SOURCES: readonly { id: ConditionSourceId; label: string; arg: 'none' | 'resource' | 'building' | 'tech' | 'text' }[] = [
  { id: 'number', label: '数值', arg: 'text' },
  { id: 'boolean', label: '布尔值', arg: 'text' },
  { id: 'resourceQuantity', label: '资源数量', arg: 'resource' },
  { id: 'resourceCap', label: '资源上限', arg: 'resource' },
  { id: 'resourceRatio', label: '资源占上限比例', arg: 'resource' },
  { id: 'resourceIncome', label: '资源净产量', arg: 'resource' },
  { id: 'resourceUnlocked', label: '资源是否解锁', arg: 'resource' },
  { id: 'buildingCount', label: '建筑数量', arg: 'building' },
  { id: 'buildingRunning', label: '建筑运行数量', arg: 'building' },
  { id: 'buildingUnlocked', label: '建筑是否解锁', arg: 'building' },
  { id: 'buildingPurchasable', label: '建筑是否可建造', arg: 'building' },
  { id: 'buildingQueued', label: '建筑是否在队列', arg: 'building' },
  { id: 'techResearched', label: '科技是否已研究', arg: 'tech' },
  { id: 'techUnlocked', label: '科技是否可研究', arg: 'tech' },
  { id: 'population', label: '人口', arg: 'none' },
  { id: 'soldierCount', label: '士兵数', arg: 'none' },
  { id: 'housingCapacity', label: '住房上限', arg: 'none' },
  { id: 'happiness', label: '幸福度', arg: 'none' },
  { id: 'taxRate', label: '税率', arg: 'none' },
  { id: 'gameDays', label: '游戏天数', arg: 'none' },
  { id: 'queueLength', label: '队列长度', arg: 'text' },
  { id: 'arpaCount', label: 'ARPA 项目数量', arg: 'text' },
  { id: 'prestigeParticles', label: '粒子', arg: 'none' },
  { id: 'prestigeResets', label: '威望重置次数', arg: 'text' },
  { id: 'prestigeType', label: '最近一次重置类型', arg: 'none' },
  { id: 'government', label: '社会体制', arg: 'none' },
  { id: 'resourceId', label: '资源 ID', arg: 'text' },
  { id: 'buildingId', label: '建筑 ID', arg: 'text' },
  { id: 'techId', label: '科技 ID', arg: 'text' },
];

/** 触发器行动可选的 id 列表，界面下拉复用。 */
export const TRIGGER_ACTION_OPTIONS = {
  build: () => Object.keys(BUILDINGS).map(id => ({ id, label: BUILDINGS[id as BuildingId].name })),
  research: () => Object.keys(TECHNOLOGIES).map(id => ({ id, label: TECHNOLOGIES[id as TechnologyId].name })),
  arpa: () => ['rocketPlatform', 'monument', 'geneSequencing', 'stockExchange', 'arpaResearchInstitute'].map(id => ({ id, label: id })),
  queueBuild: () => Object.keys(BUILDINGS).map(id => ({ id, label: BUILDINGS[id as BuildingId].name })),
  queueResearch: () => Object.keys(TECHNOLOGIES).map(id => ({ id, label: TECHNOLOGIES[id as TechnologyId].name })),
} as const;

/** 取值来源可选的 id 列表；未知来源返回空列表，界面据此禁用第二列。 */
export function conditionArgumentOptions(source: ConditionSourceId): { id: string; label: string }[] {
  const spec = CONDITION_SOURCES.find(entry => entry.id === source);
  if (!spec) return [];
  if (spec.arg === 'resource') return Object.keys(RESOURCES).map(id => ({ id, label: RESOURCES[id as ResourceId].name }));
  if (spec.arg === 'building') return Object.keys(BUILDINGS).map(id => ({ id, label: BUILDINGS[id as BuildingId].name }));
  if (spec.arg === 'tech') return Object.keys(TECHNOLOGIES).map(id => ({ id, label: TECHNOLOGIES[id as TechnologyId].name }));
  if (source === 'queueLength') return [{ id: 'build', label: '建筑队列' }, { id: 'tech', label: '研究队列' }];
  if (source === 'arpaCount') return TRIGGER_ACTION_OPTIONS.arpa();
  if (source === 'prestigeResets') return [
    { id: 'nuclear', label: '核爆' }, { id: 'escape', label: '逃离' }, { id: 'blackHole', label: '黑洞' }, { id: 'ascension', label: '飞升' }, { id: 'soft', label: '软重置' },
  ];
  return [];
}

/** 空条件行，界面新增一行时使用。 */
export function blankConditionRow(value?: number | boolean | string): ConditionRow {
  const row: ConditionRow = { left: 'resourceRatio', leftArg: 'food', operator: '>=', right: 'number', rightArg: '0.9' };
  if (value !== undefined) row.value = value;
  return row;
}

export function blankTrigger(): AutomationTrigger {
  return {
    left: 'techResearched', leftArg: Object.keys(TECHNOLOGIES)[0] ?? '', operator: '==', right: 'boolean', rightArg: 'true',
    action: 'build', actionId: Object.keys(BUILDINGS)[0] ?? '', actionCount: 1, chain: false, enabled: true,
  };
}
