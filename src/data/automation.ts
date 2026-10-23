import { BUILDINGS } from '../data/buildings';
import { TECHNOLOGIES } from '../data/technologies';
import { RESOURCES, CRAFT_RECIPES, FACTORY_OPTIONS } from '../data/resources';
import { NEIGHBORS } from '../data/neighbors';
import { ARPA_PROJECTS } from '../data/projects';
import { SHIP_COMPONENTS } from '../simulation/spaceship';
import { GENE_DEFINITIONS } from '../data/genes';
import { SPECIES_TRAITS } from '../data/species-traits';
import { REGIONAL_MISSIONS, isRegionalMissionId } from '../simulation/space-missions';
import type { BuildingId } from '../types/buildings';
import type { ResourceId } from '../types/economy';
import type { TechnologyId } from '../types/technologies';
import type { NeighborId } from '../data/neighbors';
import type {
  AutomationOption, AutomationSection, AutomationTrigger,
  ConditionRow, ConditionSourceId, OptionArgKind, TriggerActionSpec, TriggerActionType,
} from '../types/automation';

/**
 * 自动化选项注册表。
 *
 * 只放**纯数据**：默认值、文案、取值边界。求值逻辑在 `automation/policy.ts`，
 * 执行逻辑在 `automation/modules.ts`。界面按这里的顺序与分组渲染，因此新增一个开关
 * 只需要改这一个文件（再在对应模块里读它）。
 *
 * 三条约定：
 * 1. **只登记本游戏真实存在的机制**，不为了凑数搬运参考脚本里没有对应物的选项；
 * 2. 键名落盘后不可改名：改名等于让玩家已有的配置失效；
 * 3. 每个选项都必须有提示文本——脚本类设置数量多，没有提示等于不可用。
 */

type Choice = { value: string; label: string; hint?: string };

const toggle = (key: string, label: string, hint: string, value = false): AutomationOption =>
  ({ key, label, hint, kind: 'toggle', default: value });
const number = (key: string, label: string, hint: string, value: number, min = 0, max = Number.MAX_SAFE_INTEGER, integer = true): AutomationOption =>
  ({ key, label, hint, kind: 'number', default: value, min, max, integer });
const select = (key: string, label: string, hint: string, value: string, choices: Choice[]): AutomationOption =>
  ({ key, label, hint, kind: 'select', default: value, choices });
const ids = (key: string, label: string, hint: string, listSource: () => { id: string; label: string }[]): AutomationOption =>
  ({ key, label, hint, kind: 'list', default: [], listSource });

/** 建筑 / 科技 / 资源 / 势力 / ARPA / 飞船 的 id 名表；界面下拉与 list 控件共用。 */
export const automationIdLists = {
  building: () => (Object.keys(BUILDINGS) as BuildingId[]).map(id => ({ id, label: BUILDINGS[id].name })),
  technology: () => (Object.keys(TECHNOLOGIES) as TechnologyId[]).map(id => ({ id, label: TECHNOLOGIES[id].name })),
  resource: () => (Object.keys(RESOURCES) as ResourceId[]).map(id => ({ id, label: RESOURCES[id].name })),
  neighbor: () => (Object.keys(NEIGHBORS) as NeighborId[]).map(id => ({ id, label: NEIGHBORS[id].name })),
  arpa: () => Object.keys(ARPA_PROJECTS).map(id => ({ id, label: ARPA_PROJECTS[id as keyof typeof ARPA_PROJECTS].name })),
  mission: () => Object.keys(REGIONAL_MISSIONS).map(id => ({ id, label: REGIONAL_MISSIONS[id as keyof typeof REGIONAL_MISSIONS].name })),
  ship: () => Object.keys(SHIP_COMPONENTS).map(id => ({ id, label: SHIP_COMPONENTS[id as keyof typeof SHIP_COMPONENTS].name })),
  gene: () => Object.keys(GENE_DEFINITIONS).map(id => ({ id, label: GENE_DEFINITIONS[id as keyof typeof GENE_DEFINITIONS].name })),
  trait: () => Object.keys(SPECIES_TRAITS).map(id => ({ id, label: SPECIES_TRAITS[id as keyof typeof SPECIES_TRAITS].name })),
  // 生产线 / 锻造物的 id 来自各自的注册表：写死 'steel' 这类猜测值会得到永远读不到的下拉项。
  factoryLine: () => FACTORY_OPTIONS.map(option => ({ id: option.id, label: option.name })),
  craft: () => (Object.keys(CRAFT_RECIPES) as ResourceId[]).map(id => ({ id, label: RESOURCES[id]?.name ?? id })),
};

export const AUTOMATION_SECTIONS: readonly AutomationSection[] = [
  {
    id: 'general',
    label: '常规',
    options: [
      toggle('master', '启用自动化', '总开关。关闭后脚本只更新状态，不执行任何动作。'),
      number('tickInterval', '运算间隔（tick）', '每经过多少个游戏 tick 运行一次脚本。1 表示每个 tick 都运行。', 1, 1, 240),
      number('maxActionsPerRun', '单次最高动作数', '每次运行最多执行多少个动作，用来限制卡顿。', 40, 1, 400),
      toggle('safeMode', '安全模式', '脚本出错时自动暂停自动化并记录原因，避免错误在每一 tick 重复发生。', true),
      toggle('ignoreActionConflicts', '忽略动作冲突', '默认情况下，同一资源被多个目标争抢时只执行优先级最高的那一个。开启后不做此限制。', false),
      toggle('prioMissingResources', '优先缺失资源', '队列与触发器优先处理缺少的资源，可以覆盖其它设置里的资源选择。'),
      toggle('autoPause', '无可做之事时暂停', '脚本判断当前没有任何可推进的目标时不执行动作，省下运算开销。'),
    ],
  },
  {
    id: 'jobs',
    label: '工作',
    options: [
      toggle('autoWorkers', '自动分配工作', '用空闲人口填补已启用的岗位。', true),
      number('reservePopulation', '预留空闲人口', '始终保留这么多只空闲猫猫，不参与自动分配。', 0, 0),
      toggle('autoWorkersFollowCapacity', '岗位满员后停止', '岗位人数达到上限后不再继续分配。', true),
      toggle('autoWorkerSteal', '允许调岗', '没有空闲人口时，从其它岗位调猫猫到更急需的岗位。'),
      number('autoWorkerStealFloor', '调岗保留人数', '被调岗的岗位至少保留这么多猫猫。', 1, 0),
      toggle('autoTeacher', '自动安排教授', '知识产量为 0 时优先给学校安排教授，推进科技树。'),
      toggle('autoMaterialJobs', '自动安排原料岗位', '木材或石料产量为 0 时优先补伐木与采石。'),
      toggle('autoHousingJobs', '住房优先', '人口达到住房上限时优先建造住房。'),
      ids('jobPriority', '岗位填充顺序', '自动分配按这个顺序填补岗位。留空表示使用注册表顺序。', automationIdLists.building),
      ids('jobDisabled', '不自动分配的岗位', '这些岗位不会被自动分配填补。', automationIdLists.building),
      number('jobFillLimit', '每岗位填充上限', '自动分配时单个岗位最多补到多少人。0 表示不限制。', 0, 0),
      toggle('autoCraftWorkers', '自动分配工匠', '把空闲猫猫分配到锻造岗位。'),
      ids('artisanPriority', '锻造岗位优先顺序', '自动分配工匠时按这个顺序选择锻造物。', automationIdLists.craft),
      number('craftWorkerReserve', '工匠保留空闲人口', '分配工匠时至少留下这么多空闲猫猫。', 0, 0),
    ],
  },
  {
    id: 'building',
    label: '建筑',
    options: [
      toggle('autoBuild', '自动建造', '按建造列表自上而下尝试建造，资源不足时跳过。', true),
      number('autoBuildKeepCash', '保留资金', '自动建造不会动用低于该数值的资金。', 0, 0),
      toggle('buildingPriorityRespectQueue', '尊重手动队列', '手动加入队列的目标不会被自动建造重复购买。', true),
      number('buildingBuildPassCount', '建造轮数', '每次运行最多进行几轮建造。数值越高推进越快，也越容易出现资源竞争。', 1, 1, 12),
      toggle('buildingSkipUnreachable', '跳过付不起的目标', '跳过成本超过仓库上限、当前又没有产量的目标，避免守着永远买不起的东西。', true),
      toggle('buildingBuildIfStorageFull', '存储满时无视权重', '任意相关资源已满时忽略权重立刻建造，避免浪费产能。权重仍需大于 0。'),
      select('buildingMode', '建造顺序', '自动建造决定“造什么”的依据。', 'tier', [
        { value: 'tier', label: '前置链 + 成本', hint: '默认：先造前置链靠前、成本低的建筑。' },
        { value: 'weight', label: '只看权重', hint: '完全按下方权重表排序。' },
        { value: 'queue', label: '只补队列', hint: '只为已经手动加入队列的目标付钱。' },
        { value: 'manual', label: '手动', hint: '不自动建造，只保留开关状态。' },
      ]),
      select('buildingQueueBehavior', '队列满时', '建造队列没有空位时的处理方式。', 'evictOwned', [
        { value: 'evictOwned', label: '清掉已拥有建筑的加建单', hint: '默认：这些条目多半是脚本上一轮排进去的。' },
        { value: 'replaceLast', label: '替换最后一条', hint: '移除队尾条目后插入锚点。' },
        { value: 'skip', label: '跳过', hint: '队列满时这一轮不建造。' },
      ]),
      number('buildingKeepQueueSlots', '保留队列空位', '至少为其它目标保留多少个空队列位置。', 0, 0),
      toggle('autoBuildHousing', '自动补住房', '人口接近上限时优先加建住房。', true),
      number('housingBuffer', '住房缓冲', '人口达到上限减去该值时才补住房。', 1, 0),
      ids('buildingPriority', '建造优先列表', '优先建造这些建筑，列表中靠前的先造。留空表示使用默认排序。', automationIdLists.building),
      ids('buildingBlacklist', '永不自动建造', '这些建筑不会被自动建造。', automationIdLists.building),
      number('buildingMaxPerType', '同类型上限', '自动建造时单种建筑最多造到多少座。0 表示不限制。', 0, 0),
      ids('buildingKeepStock', '保留资源的建造', '这些建筑不会动用它们的成本资源低于保留值。', automationIdLists.resource),
    ],
  },
  {
    id: 'weighting',
    label: '自动建造权重',
    options: [
      number('buildingWeightingNew', '新建筑', '从未拥有过的建筑（解锁链上的关键一环）的权重倍率。', 3, 0, 100, false),
      number('buildingWeightingUnderpowered', '电力不足的用电建筑', '有耗电建筑的电力不足时，这些建筑的权重倍率。', 2, 0, 100, false),
      number('buildingWeightingNeedfulPowerPlant', '电力不足时的发电厂', '电力不足时发电厂的权重倍率。', 3, 0, 100, false),
      number('buildingWeightingUselessPowerPlant', '电力过剩时的发电厂', '电力明显过剩时发电厂的权重倍率。设为 0 表示不再造。', 0, 0, 100, false),
      number('buildingWeightingNeedfulKnowledge', '知识上限不足', '有研究因知识上限不足而无法进行时，知识上限建筑的权重倍率。', 2.5, 0, 100, false),
      number('buildingWeightingUselessKnowledge', '知识上限够用', '知识上限够用时，知识上限建筑的权重倍率。', 0, 0, 100, false),
      number('buildingWeightingNonOperating', '供能不足的建筑', '并非所有建筑都在正常供能时，可调供能建筑的权重倍率。', 2, 0, 100, false),
      number('buildingWeightingMissingSupply', '缺少原料的建筑', '有建筑因缺少原料无法运转时，补料建筑的权重倍率。', 2, 0, 100, false),
      number('buildingWeightingMissingSupport', '缺少支持的建筑', '有建筑因缺少支持无法运转时，提供支持建筑的权重倍率。', 2, 0, 100, false),
      number('buildingWeightingUselessSupport', '支持过剩', '提供的支持超过当前需求时，支持建筑的权重倍率。', 0, 0, 100, false),
      number('buildingWeightingNeedStorage', '储量上限告急', '有资源接近储量上限时，仓库类建筑的权重倍率。', 2, 0, 100, false),
      number('buildingWeightingUselessHousing', '住房过剩', '住房使用率不到 90% 时，住房建筑的权重倍率。', 0.2, 0, 100, false),
      number('buildingWeightingUnusedEjectors', '未完全运作的质量喷射器', '存在未完全运作的质量喷射器时，它们的权重倍率。', 2, 0, 100, false),
      number('buildingWeightingCrateUseless', '未使用的集装箱', '有未使用的集装箱时，集装箱类建筑的权重倍率。', 0, 0, 100, false),
    ],
  },
  {
    id: 'research',
    label: '研究',
    options: [
      toggle('autoResearch', '自动研究', '按研究顺序自动完成可研究科技。', true),
      number('researchKeepKnowledge', '保留知识', '自动研究不会动用低于该数值的知识。', 0, 0),
      toggle('researchFillQueue', '填满研究队列', '资源不足时把目标加入研究队列，而不是等待。'),
      select('researchOrder', '研究顺序', '自动研究决定“研究什么”的依据。', 'tier', [
        { value: 'tier', label: '层级 + 成本', hint: '默认：先研究层级低、知识需求少的科技。' },
        { value: 'priority', label: '优先列表', hint: '按下方优先列表，其余按层级。' },
        { value: 'cheapest', label: '最便宜优先', hint: '始终先研究知识需求最少的科技。' },
        { value: 'manual', label: '手动', hint: '不自动研究，只保留开关状态。' },
      ]),
      ids('researchPriority', '研究优先列表', '优先研究这些科技。', automationIdLists.technology),
      ids('researchBlacklist', '永不自动研究', '这些科技不会被自动研究。', automationIdLists.technology),
      number('researchMaxQueue', '研究队列上限', '自动研究最多把多少目标放进研究队列。0 表示使用游戏默认容量。', 0, 0),
      toggle('researchKeepForArpa', '为 ARPA 保留知识', 'ARPA 项目需要知识时，自动研究不动用这部分知识。'),
    ],
  },
  {
    id: 'crafting',
    label: '锻造',
    options: [
      toggle('autoCraft', '自动锻造', '当锻造物未达保留上限且原料充足时自动锻造。'),
      number('craftReserveRatio', '原料保留比例', '锻造后原料不能低于储量上限的这个比例（0.2 表示 20%）。', 0.2, 0, 1, false),
      number('craftTargetRatio', '产物目标比例', '锻造物达到储量上限的这个比例后停止锻造。', 0.95, 0, 1, false),
      toggle('craftIgnoreFuel', '能量锻造无视燃料', '能量锻造时不顾燃料是否充足。'),
      select('craftMode', '锻造数量', '手动锻造与自动锻造共用的数量策略。', 'one', [
        { value: 'one', label: '逐个', hint: '每次锻造一件，最容易与其它步骤交替。' },
        { value: 'max', label: '尽可能多', hint: '一次把当前资源能锻造的数量都做出来。' },
      ]),
      number('craftMaxPerRun', '单次锻造上限', '每次运行最多锻造多少件。', 20, 1, 1000),
      ids('craftPriority', '锻造优先顺序', '自动锻造按这个顺序选择锻造物。', automationIdLists.craft),
      ids('craftBlacklist', '永不自动锻造', '这些锻造物不会被自动锻造。', automationIdLists.craft),
      number('craftKeepSpace', '冶炼保留工位', '冶炼厂中至少保留多少个空闲工位。', 0, 0),
    ],
  },
  {
    id: 'power',
    label: '供电与工厂',
    options: [
      toggle('autoPower', '自动分配供电', '电力不足时按建筑的开启优先级关闭靠后的建筑，电力恢复后重新开启。'),
      number('autoPowerReserve', '电力保留', '始终保留下来的电力余量，低于该值才开始关闭建筑。', 0, 0),
      toggle('autoPowerPriority', '按优先列表供能', '供能顺序使用下方列表，而不是注册表顺序。'),
      ids('powerPriority', '供能优先顺序', '电力不足时优先保证这些建筑供能。', automationIdLists.building),
      number('powerMaxShutdownPerRun', '单次最多关停', '每次运行最多调整多少座建筑的供能，避免一次关掉太多。', 8, 1, 200),
      toggle('autoFactoryLines', '自动分配生产线', '有空闲生产线时自动把工人分配到空线。'),
      ids('factoryLinePriority', '生产线优先顺序', '自动分配生产线时按这个顺序选择。', automationIdLists.factoryLine),
      toggle('autoSmelterIdle', '保留空闲冶炼工位', '冶炼厂自动补工位，避免全部被钢占满。'),
    ],
  },
  {
    id: 'storage',
    label: '存储与喷射',
    options: [
      toggle('autoStorage', '自动调整集装箱', '按下方顺序把集装箱分配给需要的资源。'),
      ids('storagePriority', '集装箱分配顺序', '集装箱按这个顺序分配：前面的资源优先拿到集装箱。', automationIdLists.resource),
      number('storageReserveRatio', '储量告急阈值', '资源超过储量上限的这个比例时优先为它增加储量。', 0.9, 0, 1, false),
      toggle('autoEject', '自动质量喷射', '把已经满仓的资源喷进黑洞，换取质量。'),
      ids('ejectPriority', '喷射资源顺序', '质量喷射按这个顺序分配喷射量。', automationIdLists.resource),
      number('ejectKeepRatio', '喷射保留比例', '资源高于储量上限的这个比例才开始喷射。', 0.98, 0, 1, false),
      toggle('autoStabilizeBlackHole', '自动稳定黑洞', '奇异质量失控时自动稳定黑洞。'),
      toggle('autoEjectWhenUnstable', '失控时停止喷射', '黑洞失控期间不再继续喷射，避免浪费质量。', true),
    ],
  },
  {
    id: 'social',
    label: '社会与军事',
    options: [
      toggle('autoTax', '自动调整税率', '按幸福度自动调整税率，在收益与幸福度之间取舍。'),
      number('taxTargetHappiness', '目标幸福度', '自动税率会把幸福度维持在这个水平之上。', 100, 0),
      number('taxMax', '税率上限', '自动调税不会超过该数值。', 30, 0, 30),
      select('autoGovernment', '自动更改体制', '满足条件时自动切换到指定体制。', 'none', [
        { value: 'none', label: '不自动更改', hint: '保持玩家手动选择的体制。' },
        { value: 'democracy', label: '民主' },
        { value: 'militaryRule', label: '军政' },
        { value: 'oligarchy', label: '寡头' },
        { value: 'technocracy', label: '技术官僚' },
        { value: 'industrialism', label: '工业主义' },
      ]),
      toggle('autoTrainSoldiers', '自动训练士兵', '按上限自动训练士兵。'),
      number('soldierSafetyMargin', '士兵上限余量', '训练到上限减去该值为止，避免刚满就被战斗削掉。', 0, 0),
      toggle('autoHeal', '自动治疗伤兵', '有伤兵时优先保证医院运转。'),
      ids('raidTargets', '掠夺目标顺序', '自动掠夺按这个顺序选择临近势力。', automationIdLists.neighbor),
      number('raidMinSoldiers', '掠夺最低兵力', '空闲兵力低于该值时不发起掠夺。', 0, 0),
      select('raidLoot', '掠夺目标偏好', '掠夺时优先看重的产出。', 'economy', [
        { value: 'economy', label: '经济' }, { value: 'military', label: '军事' }, { value: 'random', label: '随机' },
      ]),
      toggle('autoWithdraw', '自动撤回驻军', '占领的势力不再划算时自动撤回。'),
      toggle('autoDownload', '自动分配下载带宽', '按下方比例自动分配 dl.exe 的下载带宽。'),
      number('downloadAllocation', '下载带宽比例', '分配多少百分比的带宽给 dl.exe。', 100, 0, 100),
    ],
  },
  {
    id: 'space',
    label: '太空与 ARPA',
    options: [
      toggle('autoArpa', '自动推进 ARPA', '按下方顺序自动投入 ARPA 项目。'),
      ids('arpaPriority', 'ARPA 优先顺序', '自动投入 ARPA 项目时按这个顺序选择。', automationIdLists.arpa),
      number('arpaKeepResources', 'ARPA 保留资源比例', '投入 ARPA 时至少为其它用途留下这么多比例的资源。', 0, 0, 1, false),
      select('arpaInvest', 'ARPA 投入方式', '每次运行投入多少。', 'affordable', [
        { value: 'affordable', label: '能投多少投多少', hint: '按当前资源能负担的百分比投入。' },
        { value: 'fixed', label: '固定百分比', hint: '按下方固定值投入。' },
        { value: 'full', label: '一次投满', hint: '攒够就一次完成。' },
      ]),
      number('arpaInvestPercent', '固定投入百分比', '投入方式为“固定百分比”时使用。', 10, 1, 100),
      toggle('autoMission', '自动探索任务', '按下方顺序完成区域探索任务。'),
      ids('missionPriority', '探索优先顺序', '探索任务按这个顺序推进。', automationIdLists.mission),
      toggle('autoShip', '自动建造飞船', '自动为 ESS-喵星号投入资源。'),
      ids('shipPriority', '飞船组件顺序', '飞船组件按这个顺序投入。', automationIdLists.ship),
      select('shipMode', '飞船建造方式', '飞船组件的资源投入方式。', 'affordable', [
        { value: 'affordable', label: '能投多少投多少' }, { value: 'none', label: '不建造' },
      ]),
    ],
  },
  {
    id: 'prestige',
    label: '威望重置',
    options: [
      toggle('autoPrestige', '自动威望重置', '达到条件后自动执行威望重置。会开始新周目，请确认已经理解后果。'),
      select('prestigeType', '重置类型', '自动重置时执行哪一种重置。', 'none', [
        { value: 'none', label: '不自动重置', hint: '不会自动重置。' },
        { value: 'nuclear', label: '核爆重置', hint: '核弹进度填满后发射。' },
        { value: 'escape', label: '逃离重置', hint: 'ESS-喵星号组装完成后启程。' },
        { value: 'blackHole', label: '黑洞重置', hint: '奇异质量失控后引爆。' },
        { value: 'ascension', label: '数字飞升', hint: 'AI 飞升核心就绪后飞升。' },
      ]),
      number('prestigeMinPopulation', '最低人口', '人口达到该数值才执行自动重置。', 0, 0),
      number('prestigeMinParticles', '最低粒子收益', '预计获得的粒子低于该值时不重置。', 0, 0),
      number('prestigeTargetResets', '目标重置次数', '当前类型的重置次数达到该数值后停止自动重置。0 表示不限制。', 0, 0),
      toggle('prestigeNuclear', '允许核爆重置', '核弹进度填满后立即发射。'),
      number('prestigeNuclearPopulation', '核爆人口阈值', '人口达到该数值后才发射核弹。', 0, 0),
      toggle('prestigeEscape', '允许逃离重置', 'ESS-喵星号组装完成后立即启程。'),
      toggle('prestigeBlackHole', '允许黑洞重置', '奇异质量失控后立即引爆。'),
      toggle('prestigeDigital', '允许数字化飞升', 'AI 飞升核心就绪后立即飞升。'),
      toggle('prestigeKeepCrispr', '重置前检查 CRISPR', '有可购买的 CRISPR 升级时先不重置。'),
    ],
  },
  {
    id: 'genes',
    label: '基因与特质',
    options: [
      toggle('autoGeneSynthesis', '自动基因合成', '有生物科学实验室时自动合成 DNA。'),
      ids('geneSynthesisPriority', '合成碱基顺序', '按这个顺序分配合成比例。', () => [
        { id: 'C', label: '胞嘧啶 C' }, { id: 'G', label: '鸟嘌呤 G' }, { id: 'A', label: '腺嘌呤 A' }, { id: 'T', label: '胸腺嘧啶 T' },
      ]),
      toggle('autoGeneModification', '自动购买基因修饰', 'DNA 足够时自动购买基因修饰等级。'),
      ids('genePriority', '基因修饰优先顺序', '自动购买基因修饰时按这个顺序。', automationIdLists.gene),
      number('geneKeepDna', '保留 DNA', '每种碱基至少保留这么多，不用于购买基因修饰。', 0, 0),
      toggle('autoSpeciesTrait', '自动购买种族特质', '粒子足够时自动购买种族特质。'),
      ids('traitPriority', '特质优先顺序', '自动购买特质时按这个顺序。', automationIdLists.trait),
      number('traitKeepParticles', '保留粒子', '粒子低于该值时不再购买特质。', 0, 0),
    ],
  },
  {
    id: 'triggers',
    label: '触发器',
    options: [
      toggle('autoTrigger', '启用触发器', '按触发器列表自上而下执行条件满足的动作。'),
      number('triggerRepeatLimit', '单次重复上限', '同一个触发器在一次运行中最多执行的次数。', 3, 1, 100),
      toggle('triggerSkipConflicts', '跳过冲突动作', '已被更高优先级触发器占用的目标不再重复执行。', true),
      toggle('triggerStopOnComplete', '完成后自动失效', '触发器达到所需数量后不再执行，但保留在列表里。', true),
    ],
  },
  {
    id: 'logging',
    label: '日志与界面',
    options: [
      toggle('logToGame', '把脚本动作写进日志', '脚本执行的动作会写进游戏日志，便于回看。'),
      toggle('logFaultOnly', '只记录错误', '只在脚本出错时写日志。'),
      number('logMaxPerRun', '单次最多日志条数', '每次运行最多写多少条日志，避免刷屏。', 5, 0, 50),
      toggle('hideScriptUI', '隐藏脚本附加界面', '不显示脚本在游戏界面里附加的信息块。'),
      toggle('showActiveTargets', '显示当前目标', '在界面上显示脚本正在推进的目标。'),
    ],
  },
];

/** 扁平选项表：键 -> 定义。求值与界面共用同一份。 */
export const AUTOMATION_OPTIONS: Readonly<Record<string, AutomationOption>> =
  Object.fromEntries(AUTOMATION_SECTIONS.flatMap(section => section.options.map(option => [option.key, option])));

export function automationDefault(key: string): unknown {
  const option = AUTOMATION_OPTIONS[key];
  if (!option) throw Error(`未知的自动化选项：${key}`);
  return Array.isArray(option.default) ? [...option.default] : option.default;
}

/** 条件 DSL 的取值来源；`arg` 决定该来源需要哪一种 id。 */
export const CONDITION_SOURCES: readonly { id: ConditionSourceId; label: string; arg: OptionArgKind }[] = [
  { id: 'number', label: '数值', arg: 'text' },
  { id: 'boolean', label: '布尔值', arg: 'text' },
  { id: 'string', label: '文本', arg: 'text' },
  { id: 'resourceQuantity', label: '资源数量', arg: 'resource' },
  { id: 'resourceCap', label: '资源上限', arg: 'resource' },
  { id: 'resourceRatio', label: '资源占上限比例', arg: 'resource' },
  { id: 'resourceIncome', label: '资源净产量', arg: 'resource' },
  { id: 'resourceUnlocked', label: '资源是否解锁', arg: 'resource' },
  { id: 'resourceSatisfied', label: '资源满足度', arg: 'resource' },
  { id: 'resourceSatisfyRatio', label: '资源是否供过于求', arg: 'resource' },
  { id: 'buildingCount', label: '建筑数量', arg: 'building' },
  { id: 'buildingRunning', label: '建筑运行数量', arg: 'building' },
  { id: 'buildingStopped', label: '建筑停用数量', arg: 'building' },
  { id: 'buildingUnlocked', label: '建筑是否解锁', arg: 'building' },
  { id: 'buildingPurchasable', label: '建筑是否可建造', arg: 'building' },
  { id: 'buildingQueued', label: '建筑是否在队列', arg: 'building' },
  { id: 'buildingCost', label: '建筑成本', arg: 'text' },
  { id: 'buildingAffordable', label: '建筑是否付得起', arg: 'building' },
  { id: 'techResearched', label: '科技是否已研究', arg: 'tech' },
  { id: 'techUnlocked', label: '科技是否可研究', arg: 'tech' },
  { id: 'techCostKnowledge', label: '科技知识成本', arg: 'tech' },
  { id: 'population', label: '人口', arg: 'none' },
  { id: 'idlePopulation', label: '空闲人口', arg: 'none' },
  { id: 'housingCapacity', label: '住房上限', arg: 'none' },
  { id: 'jobWorkers', label: '岗位人数', arg: 'building' },
  { id: 'jobCapacity', label: '岗位上限', arg: 'building' },
  { id: 'jobUnlocked', label: '岗位是否解锁', arg: 'building' },
  { id: 'happiness', label: '幸福度', arg: 'none' },
  { id: 'taxRate', label: '税率', arg: 'none' },
  { id: 'government', label: '社会体制', arg: 'none' },
  { id: 'gameDays', label: '游戏天数', arg: 'none' },
  { id: 'clicks', label: '点击次数', arg: 'none' },
  { id: 'queueLength', label: '队列长度', arg: 'text' },
  { id: 'missionCompleted', label: '任务是否完成', arg: 'text' },
  { id: 'missionAvailable', label: '任务是否可接取', arg: 'text' },
  { id: 'soldierCount', label: '士兵数', arg: 'none' },
  { id: 'woundedCount', label: '伤兵数', arg: 'none' },
  { id: 'armyLimit', label: '士兵上限', arg: 'none' },
  { id: 'neighborControlled', label: '势力是否已占领', arg: 'text' },
  { id: 'neighborMilitary', label: '势力军力', arg: 'text' },
  { id: 'arpaCount', label: 'ARPA 数量', arg: 'text' },
  { id: 'arpaProgress', label: 'ARPA 进度', arg: 'text' },
  { id: 'arpaUnlocked', label: 'ARPA 是否解锁', arg: 'text' },
  { id: 'shipComponentReady', label: '飞船组件是否就绪', arg: 'text' },
  { id: 'craftWorkers', label: '工匠人数', arg: 'none' },
  { id: 'factoryLineWorkers', label: '生产线工人数', arg: 'text' },
  { id: 'smelterIdle', label: '冶炼空闲工位', arg: 'none' },
  { id: 'blackHoleMass', label: '黑洞质量', arg: 'none' },
  { id: 'exoticMassRatio', label: '黑洞是否失控', arg: 'none' },
  { id: 'ejectionAllocated', label: '喷射分配比例', arg: 'none' },
  { id: 'prestigeParticles', label: '粒子', arg: 'none' },
  { id: 'prestigeCasimir', label: '卡西米尔晶体', arg: 'none' },
  { id: 'prestigeDarkEnergy', label: '暗能量', arg: 'none' },
  { id: 'prestigeCrystals', label: '和谐结晶', arg: 'none' },
  { id: 'prestigeResets', label: '威望重置次数', arg: 'text' },
  { id: 'prestigeType', label: '最近一次重置类型', arg: 'none' },
  { id: 'nuclearProgress', label: '核弹进度', arg: 'none' },
  { id: 'geneLevel', label: '基因修饰等级', arg: 'text' },
  { id: 'dnaStock', label: '碱基储量', arg: 'text' },
  { id: 'speciesTrait', label: '是否拥有种族特质', arg: 'text' },
  { id: 'containerFree', label: '空闲集装箱', arg: 'none' },
  { id: 'alloyContainerFree', label: '空闲合金集装箱', arg: 'none' },
  { id: 'resourceId', label: '资源 ID', arg: 'text' },
  { id: 'buildingId', label: '建筑 ID', arg: 'text' },
  { id: 'techId', label: '科技 ID', arg: 'text' },
];

/** 触发器动作及其需要的 id 种类。 */
export const TRIGGER_ACTIONS: readonly TriggerActionSpec[] = [
  { value: 'build', label: '建造', arg: 'building', hint: '立刻买下目标建筑（资源不足时跳过）。' },
  { value: 'queueBuild', label: '加入建筑队列', arg: 'building', hint: '把目标建筑加入建造队列。' },
  { value: 'research', label: '研究', arg: 'technology', hint: '立刻研究目标科技。' },
  { value: 'queueResearch', label: '加入研究队列', arg: 'technology', hint: '把目标科技加入研究队列。' },
  { value: 'arpa', label: '投入 ARPA', arg: 'arpa', hint: '为目标 ARPA 项目投入资源。' },
  { value: 'queueArpa', label: 'ARPA 加入队列', arg: 'arpa', hint: '把 ARPA 项目加入队列。' },
  { value: 'mission', label: '完成探索任务', arg: 'mission', hint: '完成目标区域探索任务。' },
  { value: 'ship', label: '投入飞船组件', arg: 'ship', hint: '为飞船组件投入资源。' },
  { value: 'worker', label: '调整岗位人数', arg: 'building', hint: '给目标岗位增加指定数量的猫猫。' },
  { value: 'craftWorker', label: '调整工匠人数', arg: 'resource', hint: '给目标锻造物增加指定数量的工匠。' },
  { value: 'factoryLine', label: '调整生产线人数', arg: 'factoryLine', hint: '给目标生产线增加指定数量的工人。' },
  { value: 'smelterIdle', label: '调整冶炼空闲工位', arg: 'job', hint: '调整冶炼厂的空闲工位数量。' },
  { value: 'eject', label: '调整喷射分配', arg: 'resource', hint: '为目标资源增加质量喷射分配量。' },
  { value: 'container', label: '分配集装箱', arg: 'resource', hint: '把集装箱分配给目标资源。' },
  { value: 'alloyContainer', label: '分配合金集装箱', arg: 'resource', hint: '把合金集装箱分配给目标资源。' },
];

export const TRIGGER_ACTION_SPECS: Readonly<Record<TriggerActionType, TriggerActionSpec>> =
  Object.fromEntries(TRIGGER_ACTIONS.map(spec => [spec.value, spec])) as Record<TriggerActionType, TriggerActionSpec>;

/** 触发器动作第三列的可选 id。 */
export function triggerActionOptions(action: TriggerActionType): { id: string; label: string }[] {
  const spec = TRIGGER_ACTION_SPECS[action];
  if (!spec) return [];
  switch (spec.arg) {
    case 'building': return automationIdLists.building();
    case 'technology': return automationIdLists.technology();
    case 'arpa': return automationIdLists.arpa();
    case 'mission': return automationIdLists.mission();
    case 'ship': return automationIdLists.ship();
    case 'resource': return automationIdLists.resource();
    case 'job': return [{ id: 'increase', label: '增加' }, { id: 'decrease', label: '减少' }];
    case 'factoryLine': return automationIdLists.factoryLine();
    default: return [];
  }
}

/** 取值来源可选的 id 列表；未知来源返回空列表，界面据此禁用第二列。 */
export function conditionArgumentOptions(source: ConditionSourceId): { id: string; label: string }[] {
  const spec = CONDITION_SOURCES.find(entry => entry.id === source);
  if (!spec) return [];
  if (spec.arg === 'resource') return automationIdLists.resource();
  if (spec.arg === 'building') return automationIdLists.building();
  if (spec.arg === 'tech') return automationIdLists.technology();
  if (source === 'queueLength') return [{ id: 'build', label: '建筑队列' }, { id: 'tech', label: '研究队列' }, { id: 'total', label: '全部' }];
  if (source === 'arpaCount' || source === 'arpaProgress' || source === 'arpaUnlocked') return automationIdLists.arpa();
  if (source === 'shipComponentReady') return automationIdLists.ship();
  if (source === 'neighborControlled' || source === 'neighborMilitary') return automationIdLists.neighbor();
  if (source === 'missionCompleted' || source === 'missionAvailable') return automationIdLists.mission();
  if (source === 'geneLevel') return automationIdLists.gene();
  if (source === 'dnaStock') return [{ id: 'C', label: 'C' }, { id: 'G', label: 'G' }, { id: 'A', label: 'A' }, { id: 'T', label: 'T' }];
  if (source === 'speciesTrait') return automationIdLists.trait();
  if (source === 'factoryLineWorkers') return automationIdLists.factoryLine();
  if (source === 'prestigeResets') return [
    { id: 'nuclear', label: '核爆' }, { id: 'escape', label: '逃离' }, { id: 'blackHole', label: '黑洞' },
    { id: 'ascension', label: '飞升' }, { id: 'soft', label: '软重置' }, { id: 'total', label: '合计' },
  ];
  return [];
}

/** `buildingCost` 这类需要 `建筑.资源` 组合参数的来源，展开成扁平候选。 */
export function compositeConditionArguments(source: ConditionSourceId): { id: string; label: string }[] {
  if (source !== 'buildingCost') return [];
  const rows: { id: string; label: string }[] = [];
  for (const id of Object.keys(BUILDINGS) as BuildingId[]) {
    for (const resource of Object.keys(BUILDINGS[id].cost ?? {}) as ResourceId[]) {
      rows.push({ id: `${id}.${resource}`, label: `${BUILDINGS[id].name}（${RESOURCES[resource]?.name ?? resource}）` });
    }
  }
  return rows;
}

/** 空条件行，界面新增一行时使用。 */
export function blankConditionRow(value?: number | boolean | string): ConditionRow {
  const row: ConditionRow = { left: 'resourceRatio', leftArg: 'food', operator: '>=', right: 'number', rightArg: '0.9' };
  if (value !== undefined) row.value = value;
  return row;
}

let nextTriggerId = 1;
/** 新触发器：条件默认“永不成立”以外的安全起点，动作默认排在最前。 */
export function blankTrigger(id = nextTriggerId++): AutomationTrigger {
  return {
    id,
    enabled: true,
    chain: false,
    left: 'resourceRatio', leftArg: 'food', operator: '>=', right: 'number', rightArg: '0.9',
    action: 'build', actionId: (Object.keys(BUILDINGS)[0] ?? '') as BuildingId,
    actionCount: 1,
  };
}

/** 配置迁移与触发器 id 分配需要知道当前最大 id。 */
export function normalizeTriggerIds(triggers: AutomationTrigger[]): AutomationTrigger[] {
  let max = 0;
  for (const trigger of triggers) max = Math.max(max, trigger.id);
  nextTriggerId = max + 1;
  return triggers;
}

export { isRegionalMissionId };
