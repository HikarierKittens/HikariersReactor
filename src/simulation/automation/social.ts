import { GOVERNMENTS } from '../government';
import { NEIGHBORS, NEIGHBOR_IDS } from '../../data/neighbors';
import { changeGovernment, changeTaxRate, raidNeighbor, withdrawFromNeighbor } from '../commands';
import { calculateArmyLimit, reformCooldown } from '../government';
import { previewMorale } from '../production';
import { SHIP_COMPONENTS, investInShipComponent } from '../spaceship';
import { calculateStorageTotals } from '../storage';
import { calculateSupportPreview } from '../support-preview';
import { listValue, numericValue, stringValue } from './policy';
import type { AutomationValues } from './policy';
import type { GovernmentId } from '../../types/state';
import type { NeighborId } from '../../data/neighbors';
import type { GameState } from '../../types/state';
import type { ShipComponentId } from '../../types/state';

/**
 * 社会、军事与太空的自动化。
 *
 * 这里只做"要不要调用既有命令"的判断，**不复制任何结算公式**：
 * 税率、政体、掠夺、撤回、医院、飞船投资的全部数值都来自 `simulation/*` 的既有函数，
 * 所以界面显示与结算永远一致。
 *
 * 所有开关默认关闭：这些动作会改变玩家的军队、外交与永久资源，不能默认替玩家做决定。
 */

/** 税率上限：`changeTaxRate` 的合法区间是 0–30。 */
const HARD_TAX_CAP = 30;

/**
 * 自动调整税率：幸福度高于目标就加一档，低于目标就减一档。
 *
 * 判据用当前幸福度而不是"预测加税后的幸福度"——后者要把整张电力快照再算一遍，
 * 等于在这里复制结算。慢一档在脚本里是安全的：每个 tick 都会再调一次，几 tick 内收敛。
 */
export function applyAutoTax(state: GameState, values: AutomationValues): number {
  if (values.autoTax !== true) return 0;
  const target = Math.max(0, numericValue(values, 'taxTargetHappiness'));
  const cap = Math.max(0, Math.min(HARD_TAX_CAP, numericValue(values, 'taxMax')));
  const happiness = previewMorale(state).happiness;
  const current = state.taxRate;
  if (happiness > target + 1) return current < cap && changeTaxRate(state, Math.min(cap, current + 1)) ? 1 : 0;
  if (happiness < target) return current > 0 && changeTaxRate(state, current - 1) ? 1 : 0;
  return 0;
}

/**
 * 自动更换政体：玩家指定了具体政体、且不在改革冷却中时切换。
 *
 * `changeGovernment` 自己检查科技门槛、重复切换与冷却，这里只负责"玩家要不要换"。
 */
export function applyAutoGovernment(state: GameState, values: AutomationValues): number {
  const wanted = stringValue(values, 'autoGovernment');
  if (!wanted || wanted === 'none') return 0;
  if (!Object.hasOwn(GOVERNMENTS, wanted)) return 0;
  const id = wanted as GovernmentId;
  if (state.government === id) return 0;
  if (reformCooldown(state) > 0) return 0;
  return changeGovernment(state, id) ? 1 : 0;
}

/**
 * 自动扩军的"停手"判据：兵力顶到上限时，不再推进军营类建造目标。
 *
 * 训练本身由 `advanceSoldierTraining` 每 tick 结算、不能被跳过，所以这个开关管的不是
 * "训不训"，而是**要不要继续加兵营**——满员时还继续造兵营纯属浪费资源与占地。
 * 返回 1 表示"本次压制发生了"，供引擎计数。
 */
export function applyAutoTrainSoldiers(state: GameState, values: AutomationValues): number {
  if (values.autoTrainSoldiers !== true) return 0;
  return armyIsFull(state, values) ? 1 : 0;
}

/** 扩军是否已经"够用"：`applyAutoTrainSoldiers` 的判据，供建造模块复用。 */
export function armyIsFull(state: GameState, values: AutomationValues): boolean {
  if (values.autoTrainSoldiers !== true) return false;
  const margin = Math.max(0, numericValue(values, 'soldierSafetyMargin'));
  const limit = calculateArmyLimit(state);
  return state.soldiers > 0 && limit - state.soldiers <= margin && limit > 0;
}

/**
 * 自动恢复医院运转：有伤兵、医院被停用时重新启用它。
 *
 * 治疗本身由 `advanceHospital` 每 tick 结算；脚本能做的是别让医院停着。
 */
export function applyAutoHeal(state: GameState, values: AutomationValues): number {
  if (values.autoHeal !== true) return 0;
  if (state.wounded <= 0) return 0;
  if ((state.buildings.hospital || 0) <= 0) return 0;
  const stopped = state.stoppedBuildings.hospital || 0;
  if (stopped <= 0) return 0;
  // 判据只能是"有没有可恢复的医院"。不能先问 `hospitalHealPerDay`——医院全停时它恰好返回 0，
  // 那样就永远等不到恢复的那一步（实测：加了这个保护条件后整个功能失效）。
  //
  // 也不能用 `setBuildingPowerEnabled`：它只对"有持续能源输入"的建筑生效，医院不在其列，
  // 调用会被静默拒绝（实测：启用数量一直停在 1）。医院的启停就记在 `stoppedBuildings` 里，
  // 归零即恢复运转。
  state.stoppedBuildings.hospital = 0;
  return 1;
}

/**
 * 自动掠夺邻国：按优先列表挑第一个还没占领的势力，兵力达标时才出手。
 *
 * 胜负、战利品和伤亡全部由 `raidNeighbor` 结算；这里只决定"打不打、打谁"。
 */
export function applyAutoRaid(state: GameState, values: AutomationValues): number {
  const targets = listValue(values, 'raidTargets') as NeighborId[];
  if (targets.length === 0) return 0;
  const minimum = Math.max(0, numericValue(values, 'raidMinSoldiers'));
  if (state.soldiers < minimum) return 0;
  // 掠夺偏好：按玩家看重的产出给目标排序后再打，`random` 表示不排序。
  const preference = stringValue(values, 'raidLoot');
  const ordered = preference === 'random' ? targets : orderByLootPreference(targets, preference);
  for (const id of ordered) {
    if (!NEIGHBOR_IDS.includes(id)) continue;
    if (state.neighbors.occupied.includes(id)) continue;
    return raidNeighbor(state, id, 1, Math.floor(state.soldiers)) ? 1 : 0;
  }
  return 0;
}

/**
 * 按掠夺偏好排序：把玩家最看重的那种产出高的势力排在前面。
 *
 * 产出数据直接取 `NEIGHBORS` 注册表里的既有字段，不另算经济模型。
 */
function orderByLootPreference(targets: readonly NeighborId[], preference: string): NeighborId[] {
  const score = (id: NeighborId): number => {
    const definition = NEIGHBORS[id];
    if (!definition) return 0;
    // 军事偏好看兵力区间上界，经济偏好看产出区间上界；都是注册表里的既有数值。
    const pick = preference === 'military' ? definition.military : definition.economy;
    return (pick.max + pick.min) / 2;
  };
  return [...targets].sort((a, b) => score(b) - score(a));
}

/** 自动撤回驻军：按占领的逆序撤回，一次一个，避免一次性丢掉全部产量加成。 */
export function applyAutoWithdraw(state: GameState, values: AutomationValues): number {
  if (values.autoWithdraw !== true) return 0;
  const occupied = state.neighbors.occupied;
  if (occupied.length === 0) return 0;
  const last = occupied[occupied.length - 1];
  if (!last) return 0;
  return withdrawFromNeighbor(state, last) ? 1 : 0;
}

/**
 * 自动建造飞船部件：按优先列表推进下一个未完成的部件。
 *
 * `investInShipComponent` 自己扣资源、记知识消耗、处理人口部件，
 * 所以这里只决定"投哪个部件"。
 */
export function applyAutoShip(state: GameState, values: AutomationValues): number {
  if (values.autoShip !== true) return 0;
  if (stringValue(values, 'shipMode') === 'none') return 0;
  const priority = listValue(values, 'shipPriority') as ShipComponentId[];
  const ordered: ShipComponentId[] = [
    ...priority.filter(id => Object.hasOwn(SHIP_COMPONENTS, id)),
    ...(Object.keys(SHIP_COMPONENTS) as ShipComponentId[]).filter(id => !priority.includes(id)),
  ];
  for (const id of ordered) {
    if (state.shipComponents?.[id]) continue;
    const result = investInShipComponent(id, 'max', state);
    if (result.investedPercent > 0) return 1;
  }
  return 0;
}

/**
 * ARPA 保留资源：把"知识低于该比例就暂停投资"换算成绝对知识量。
 *
 * 知识上限来自建筑（`knowledgeCap` 一类的存储行），所以用上限算比例；
 * 没有上限时退回当前存量，比例依然有意义。
 */
export function arpaKnowledgeReserve(state: GameState, values: AutomationValues): number {
  const percent = Math.max(0, Math.min(100, numericValue(values, 'arpaKeepResources')));
  if (percent <= 0) return 0;
  const current = state.resources.knowledge || 0;
  const cap = knowledgeCap(state);
  return (cap > 0 ? cap : current) * percent / 100;
}

/** 知识上限：与结算同源（`calculateStorageTotals`），不自己推算。 */
function knowledgeCap(state: GameState): number {
  const support = calculateSupportPreview(state);
  const totals = calculateStorageTotals(state, { ...support, moonBaseUnits: support.moon.baseUnits });
  const cap = totals.knowledge;
  return Number.isFinite(cap) ? cap : 0;
}
