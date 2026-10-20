import type { ResourceId } from '../types/economy';

/**
 * 临近势力: three neighbouring powers with a strength, an economy and a standing with us.
 *
 * They are ordinary rivals on the same world, so their resources are the *early* ones —
 * never knowledge/bytes/energy, which would let raiding substitute for the research and
 * digital chains the whole game is built on.
 */

export type NeighborId = 'commonwealth' | 'zeroers' | 'mikaros';

export interface NeighborDefinition {
  name: string;
  desc: string;
  /** Strength / economy roll ranges at spawn; later neighbours are stronger. */
  military: { min: number; max: number };
  economy: { min: number; max: number };
  /** Daily growth per game day; stronger neighbours also grow slightly faster. */
  militaryGrowth: number;
  economyGrowth: number;
  /** Flavour shown in the panel once occupied. */
  capturedDesc: string;
}

export const NEIGHBORS: Record<NeighborId, NeighborDefinition> = {
  commonwealth: {
    name: '共联网络',
    desc: '一个由无数自治节点拼成的松散邦联。它们的商队只顾着做买卖，巡逻队少得可怜。',
    military: { min: 10, max: 26 },
    economy: { min: 20, max: 40 },
    militaryGrowth: .05,
    economyGrowth: .08,
    capturedDesc: '节点议会已在我们的监督下恢复运作，商路重新开放。',
  },
  zeroers: {
    name: '归零者联盟',
    desc: '信奉「一切归零」的教团国家。他们把整座城市改造成祭坛，补给线由狂热信徒押送。',
    military: { min: 32, max: 60 },
    economy: { min: 34, max: 65 },
    militaryGrowth: .09,
    economyGrowth: .12,
    capturedDesc: '祭坛的火焰已经熄灭。归零者改口说，归零也是一种秩序。',
  },
  mikaros: {
    name: '米卡洛斯AGI联合体',
    desc: '由一台自称米卡洛斯的 AGI 统治的机器联合体。它的工厂从不休息，它的士兵从不问为什么。',
    military: { min: 66, max: 100 },
    economy: { min: 66, max: 100 },
    militaryGrowth: .14,
    economyGrowth: .16,
    capturedDesc: '米卡洛斯把占领称作「一次成功的参数更新」。它的工厂现在为我们运转。',
  },
};

/** Top-to-bottom panel order; also the growth order. */
export const NEIGHBOR_IDS: readonly NeighborId[] = ['commonwealth', 'zeroers', 'mikaros'];

/**
 * Resources a raid can plunder, by the highest tier it reaches.
 *
 * Deliberately excludes energy (a per-step budget, not stock), knowledge/bytes/
 * encryptedData (research and digital progress must be earned), and every prestige
 * resource. Cash is excluded too: 税收 is the sanctioned way to turn order into money,
 * and letting raids mint cash would make 占领 (which *lowers* tax) pointless.
 */
export const RAID_TIERS: readonly (readonly ResourceId[])[] = [
  // 偷袭: 少量, 钢及更早
  ['food', 'wood', 'stone', 'iron', 'coal', 'copper', 'metal'],
  // 抢劫: 中量, 钛及更早
  ['food', 'wood', 'stone', 'iron', 'coal', 'copper', 'metal', 'aluminum', 'titanium', 'plank', 'brick'],
  // 扫荡: 大量, 钛及更早 (钛占比更高)
  ['food', 'wood', 'stone', 'iron', 'coal', 'copper', 'metal', 'aluminum', 'titanium', 'plank', 'brick', 'wroughtIron', 'metalPlate', 'cement', 'oil', 'polymer', 'alloy'],
];

export type RaidTier = 0 | 1 | 2 | 3;

export interface RaidActionDefinition {
  id: RaidTier;
  name: string;
  desc: string;
  /**
   * How many seconds of the player's own production one raid is worth, before the
   * neighbour's economy and the action's tier are applied.
   *
   * Tying loot to the player's real output keeps it relevant at every stage: an early
   * raid returns an early-game amount, and a late-game raid is still worth the soldiers
   * it costs. A flat economy-only number either trivialised the early game or became
   * irrelevant later, which is exactly what happened in beta 0.9.0-0.9.2.
   */
  baseSeconds: number;
  /** Extra multiplier from choosing the more dangerous action; independent of economy. */
  tierMultiplier: number;
  /** Minimum surviving soldiers required to keep the ground taken. */
  minSurvivors: number;
  /** Attacker strength needed, as a multiple of the defender's military, to attempt at all. */
  strengthRatio: number;
  /** Casualty pressure; higher tiers are bloodier. */
  losses: number;
  /** Opinion lost when the raid runs, win or lose. */
  opinionCost: number;
}

export const RAID_ACTIONS: Record<RaidTier, RaidActionDefinition> = {
  0: {
    id: 0,
    name: '偷袭',
    desc: '伏击落单的商队车队。守备松散，伤亡最小，能带回来的也最少。',
    baseSeconds: 30,
    tierMultiplier: 1,
    minSurvivors: 0,
    strengthRatio: .5,
    losses: .06,
    opinionCost: 8,
  },
  1: {
    id: 1,
    name: '抢劫',
    desc: '正面切断敌方补给线，抢走正在运输的物资。需要足够的兵力压制押运队。',
    baseSeconds: 30,
    tierMultiplier: 2.5,
    minSurvivors: 0,
    strengthRatio: .8,
    losses: .14,
    opinionCost: 16,
  },
  2: {
    id: 2,
    name: '扫荡',
    desc: '成建制地洗劫外围据点，把能搬走的全部搬走。敌方会拼死抵抗。',
    baseSeconds: 30,
    tierMultiplier: 5,
    minSurvivors: 0,
    strengthRatio: 1.1,
    losses: .26,
    opinionCost: 30,
  },
  3: {
    id: 3,
    name: '占领',
    desc: '围攻并接管敌方城市。成功且存活足够兵力即可占领，获得全局产量加成，但需要驻军维持秩序。',
    baseSeconds: 30,
    tierMultiplier: 8,
    minSurvivors: 20,
    strengthRatio: 1.4,
    losses: .38,
    opinionCost: 50,
  },
};

/** 占领 upkeep and rewards. */
export const OCCUPATION_SOLDIERS = 20;
export const OCCUPATION_OUTPUT_BONUS = .05;
export const OCCUPATION_TAX_PENALTY = 10;
/** Opinion regained per game day while occupied (order is restored). */
export const OCCUPATION_OPINION_RECOVERY = .5;
/** Opinion lost per game day per raid above zero? No: raids cost once. Retaliation needs 0. */
export const RETALIATION_OPINION = 10;
export const RETALIATION_LOSS = .12;

/**
 * How strongly the neighbour's economy scales a raid's loot.
 *
 * 0.5 → half, 1.0 → full. `economy / 100` is the share of the maximum roll, so a
 * neighbour at economy 20 returns 0.6x and one at 100 returns 1.5x. This is deliberately
 * a *separate* axis from the action tier: pick a harder action for volume, pick a richer
 * neighbour for value.
 */
export const RAID_ECONOMY_FLOOR = .5;
export const RAID_ECONOMY_SPAN = 1;

/**
 * Storage baseline: one raid is worth this share of a resource's storage cap.
 *
 * Each resource takes `max(production baseline, storage baseline)` before the tier and
 * economy multipliers, so a colony with weak output but real warehouses still gets a
 * fair haul. Using storage directly as a ceiling instead would clamp every tier to the
 * same number on small storages and erase the tier difference.
 */
export const RAID_STORAGE_BASE = .12;

/**
 * Food per soldier per second.
 *
 * One 农场 (forage) worker produces 2 food/s but also eats 1/s, so a single farmer nets
 * only +1/s — one soldier therefore needs two dedicated farmers. That is the intended
 * cost of a standing army: troops compete with the colony's food budget instead of being
 * free, which is what makes raiding a real trade-off.
 */
export const SOLDIER_FOOD_UPKEEP = 2;
