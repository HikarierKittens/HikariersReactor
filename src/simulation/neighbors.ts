import {
  NEIGHBORS, NEIGHBOR_IDS, NEIGHBOR_MILITARY_FLOOR_SHARE, NEIGHBOR_MILITARY_RAID_CAP,
  OCCUPATION_OPINION_RECOVERY, OCCUPATION_OUTPUT_BONUS,
  OCCUPATION_SOLDIERS, OCCUPATION_TAX_PENALTY, RAID_ACTIONS, RAID_ECONOMY_FLOOR, RAID_STORAGE_BASE,
  RAID_ECONOMY_SPAN, RAID_TIERS, RETALIATION_LOSS,
  RETALIATION_OPINION, SOLDIER_FOOD_UPKEEP, UNIFICATION_OUTPUT_BONUS, UNIFICATION_STORAGE_BONUS,
  type NeighborId, type RaidTier,
} from '../data/neighbors';
import { RESOURCES } from '../data/resources';
import { CONFIG } from '../data/config';
import { addLog } from './progression';
import { calculateCombatPower, defenseCasualtyMultiplier } from './government';
import { formatResourceNumber } from '../shared/format';
import type { GameState, NeighborState, NeighborsState } from '../types/state';
import type { ResourceId } from '../types/economy';
import type { TechnologyId } from '../types/technologies';

/** A neighbour is only shown once 政府 is researched and the player owns soldiers.
 *  After 世界统一 there are no rival states left to show. */
export function isNeighborsUnlocked(state: Pick<GameState, 'tech' | 'soldiers' | 'neighbors'>): boolean {
  if (isWorldUnified(state)) return false;
  return state.tech.includes('government') && (state.soldiers > 0 || state.neighbors.occupied.length > 0);
}

function roll(min: number, max: number, random: () => number): number {
  return min + (max - min) * random();
}

/** Creates the three neighbours with the requested start rolls. */
export function createNeighborsState(random: () => number = Math.random): NeighborsState {
  const values = {} as NeighborsState['values'];
  for (const id of NEIGHBOR_IDS) {
    const def = NEIGHBORS[id];
    values[id] = {
      military: roll(def.military.min, def.military.max, random),
      economy: roll(def.economy.min, def.economy.max, random),
      opinion: 30,
    };
  }
  return { values, occupied: [], lastActionTime: null };
}

/**
 * Neighbours slowly grow stronger each game day; stronger ones grow faster.
 *
 * Growth is capped so a long-running save cannot make them untouchable: the cap is
 * deliberately generous (double the spawn maximum) because 占领 is the intended answer
 * to a strong neighbour, not grinding.
 */
export function advanceNeighbors(state: GameState, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0 || !neighborsActive(state)) return;
  const days = dt / CONFIG.secondsPerDay;
  for (const id of NEIGHBOR_IDS) {
    const def = NEIGHBORS[id], value = state.neighbors.values[id];
    if (state.neighbors.occupied.includes(id)) {
      // An occupied city is under our administration: it stops growing and its standing recovers.
      value.opinion = Math.min(100, value.opinion + OCCUPATION_OPINION_RECOVERY * days);
      continue;
    }
    value.military = Math.min(def.military.max * 2, value.military + def.militaryGrowth * days);
    value.economy = Math.min(def.economy.max * 2, value.economy + def.economyGrowth * days);
  }
}

function neighborsActive(state: GameState): boolean {
  // A unified world has no rival states left to grow or raid.
  return state.tech.includes('government') && !isWorldUnified(state);
}

/** Our strength for one raid: soldier count, per-soldier power, and the leader's skill. */
export function raidStrength(soldiers: number, combatPower: number): number {
  // A 3/4 power keeps quality relevant without making numbers meaningless: 100 raw
  // recruits (31.6) still beat 25 elites (11.2 x 2), but not by 4x.
  return Math.pow(Math.max(0, soldiers), .75) * combatPower;
}

/** Defender strength; economy adds a little garrison quality so rich nations resist better. */
export function neighborStrength(id: NeighborId, state: Pick<GameState, 'neighbors'>): number {
  const value = state.neighbors.values[id];
  return value.military * (1 + value.economy / 400);
}

/**
 * Share of the defender's standing army one successful attack destroys.
 *
 * `ratio` is our strength over the strength the chosen action requires, so the reward tracks
 * how decisively we won rather than which button was pressed: clearing the gate by a hair
 * returns a small share, doubling it reaches the cap. The cap (10%) keeps a single raid from
 * erasing a neighbour, and the result never takes them below their floor.
 */
export function raidMilitaryDamage(ratio: number): number {
  // `ratio` is Infinity when the defender has no standing strength left (required === 0), and
  // that must read as the full cap rather than as an invalid input; only real garbage is 0.
  if (Number.isNaN(ratio) || ratio <= 0) return 0;
  const cap = NEIGHBOR_MILITARY_RAID_CAP;
  // ratio 1 -> cap/2, ratio 2 -> cap, then flat. Sub-1 ratios only occur below the gate,
  // which never executes; clamp them so a preview of an impossible raid still reports 0.
  if (ratio < 1) return 0;
  return cap * Math.min(1, ratio / 2);
}

/**
 * The neighbour's military floor: a share of the spawn maximum.
 *
 * Measured against `military.max` rather than the current value on purpose. Using the current
 * value would let each raid lower the floor in turn, which is the runaway the floor exists to
 * prevent.
 */
export function neighborMilitaryFloor(id: NeighborId): number {
  return NEIGHBORS[id].military.max * NEIGHBOR_MILITARY_FLOOR_SHARE;
}

/**
 * Military loss one successful attack inflicts, in absolute points, honouring the floor.
 *
 * Returns 0 when the neighbour is already at (or below) the floor, so the UI can stay silent
 * instead of advertising a reduction that cannot happen.
 */
export function calculateRaidMilitaryLoss(id: NeighborId, state: Pick<GameState, 'neighbors'>, ratio: number): number {
  const current = state.neighbors.values[id].military;
  const floor = neighborMilitaryFloor(id);
  const room = Math.max(0, current - floor);
  return Math.min(room, current * raidMilitaryDamage(ratio));
}

export interface RaidPreview {
  available: boolean;
  reason: string;
  strength: number;
  required: number;
  /** 0–1, how decisively we outmatch the defender. */
  ratio: number;
  /** Projected casualties at this ratio, before randomness. */
  expectedLosses: number;
  /** Loot per resource at this economy level. */
  loot: Partial<Record<ResourceId, number>>;
  /** Absolute military points this attack would destroy, after the floor is honoured. */
  militaryLoss: number;
  /** The share of the defender's army that loss represents, for display. */
  militaryLossShare: number;
}

/**
 * Full preview of one raid so the UI can show exact numbers before committing.
 *
 * Casualties rise with the tier and fall as our strength advantage grows; a hopeless
 * attack loses most of the force, which is what makes the tier choice meaningful.
 */
export function previewRaid(
  state: Pick<GameState, 'soldiers' | 'tech' | 'government' | 'neighbors' | 'geneModification'>,
  id: NeighborId,
  tier: RaidTier,
  soldiers: number,
  economy?: RaidEconomyContext,
): RaidPreview {
  const action = RAID_ACTIONS[tier];
  const combatPower = calculateCombatPower(state as GameState);
  const strength = raidStrength(soldiers, combatPower);
  const required = neighborStrength(id, state) * action.strengthRatio;
  const ratio = required > 0 ? strength / required : Infinity;
  // 防御力 lowers casualties only; strength and the gate above stay untouched, so a
  // defended army does not become able to win fights it could not win before.
  const expectedLosses = soldiers * action.losses * (ratio >= 1 ? 1 / Math.sqrt(ratio) : 2 - ratio * .5)
    * defenseCasualtyMultiplier(state as Pick<GameState, 'tech'>);
  const unified = isWorldUnified(state as Pick<GameState, 'tech'>);
  const militaryLoss = unified ? 0 : calculateRaidMilitaryLoss(id, state, ratio);
  return {
    available: !unified && soldiers > 0 && strength >= required,
    reason: unified ? '世界已经统一，没有敌对国家。'
      : soldiers <= 0 ? '没有派遣士兵。'
      : strength < required ? `战力不足：需要 ${Math.ceil(required)}，当前 ${Math.floor(strength)}。` : '',
    strength,
    required,
    ratio,
    expectedLosses: Math.max(0, Math.min(soldiers, expectedLosses)),
    loot: unified ? {} : raidLoot(state, id, tier, economy ?? EMPTY_ECONOMY),
    militaryLoss,
    militaryLossShare: raidMilitaryDamage(ratio),
  };
}

/**
 * Raid economics, supplied by the caller.
 *
 * `production` is the per-second rate of each resource and `capacity` its storage ceiling.
 * Both are passed in rather than imported: `production` depends on `crafting`, which
 * already imports this module for the occupation bonus, so importing back would create a
 * cycle. Injection also lets previews reuse the UI cache instead of recomputing.
 */
export interface RaidEconomyContext {
  production: Partial<Record<ResourceId, number>>;
  capacity: Partial<Record<ResourceId, number>>;
}

/** No registered production yet: raids yield nothing rather than throwing in previews. */
const EMPTY_ECONOMY: RaidEconomyContext = { production: {}, capacity: {} };

/**
 * Build the economy context for a raid.
 *
 * Lives in `neighbor-economy.ts` rather than here: `production` transitively imports this
 * module for the occupation bonus, so reading production from inside `neighbors.ts` would
 * close a cycle. Callers pass the result in, which also keeps every calculation pure.
 */
export type RaidEconomyBuilder = (state: GameState) => RaidEconomyContext;

/**
 * Loot for one action, in resource units.
 *
 * Volume per resource = max(production baseline, storage baseline) × tier × economy.
 *
 * Two independent axes as requested: `tierMultiplier` scales how much a bolder action
 * takes, and the neighbour's economy scales how rich the target is. Each resource takes
 * whichever baseline is larger — a young colony with tiny output but big warehouses still
 * gets a meaningful haul, and a late-game colony is not capped by storage it can refill
 * in seconds.
 */
function raidLoot(
  state: Pick<GameState, 'neighbors'>,
  id: NeighborId,
  tier: RaidTier,
  context: RaidEconomyContext,
): Partial<Record<ResourceId, number>> {
  const action = RAID_ACTIONS[tier];
  const economy = state.neighbors.values[id].economy;
  const economyFactor = RAID_ECONOMY_FLOOR + RAID_ECONOMY_SPAN * Math.min(1, Math.max(0, economy / 100));

  // Only resources from this action's tier table can be plundered.
  const tierTable = RAID_TIERS[Math.min(RAID_TIERS.length - 1, tier === 3 ? 2 : tier === 0 ? 0 : tier === 1 ? 1 : 2)]!;
  const loot: Partial<Record<ResourceId, number>> = {};
  tierTable.forEach((resource, index) => {
    const rate = context.production[resource] ?? 0;
    const cap = context.capacity[resource] ?? 0;
    // Later entries in a tier are scarcer, so they weigh less and 偷袭 stays basic.
    const weight = 1 / (1 + index * .45);
    const fromProduction = rate * action.baseSeconds * weight;
    const fromStorage = cap * RAID_STORAGE_BASE * weight;
    const baseline = Math.max(fromProduction, fromStorage);
    if (!(baseline > 0)) return;
    const amount = baseline * action.tierMultiplier * economyFactor;
    if (amount > 0) loot[resource] = amount;
  });
  return loot;
}

export interface RaidOutcome {
  ok: boolean;
  reason?: string;
  captured: boolean;
  soldiersLost: number;
  wounded: number;
  loot: Partial<Record<ResourceId, number>>;
  opinionAfter: number;
  retaliated: boolean;
  /** Military points actually taken off the defender by this attack. */
  militaryLoss: number;
}

/**
 * Human-readable loot list for the activity log, e.g. "食物 12.4、木材 8.1、钢 2".
 *
 * Shared with the UI so a log line and the panel never disagree about rounding. Order
 * follows `RAID_TIERS` (basic resources first) rather than object insertion order, which
 * keeps the log stable and readable across actions.
 */
export function describeLoot(loot: Partial<Record<ResourceId, number>>): string {
  const ordered = (RAID_TIERS[RAID_TIERS.length - 1] ?? [])
    .filter(resource => (loot[resource] ?? 0) > 0);
  const extras = (Object.keys(loot) as ResourceId[])
    .filter(resource => !ordered.includes(resource) && (loot[resource] ?? 0) > 0);
  return [...ordered, ...extras]
    .map(resource => `${RESOURCES[resource].name} ${formatResourceNumber(loot[resource]!)}`)
    .join('、');
}

/**
 * Resolve one raid.
 *
 * Survivors are split into dead and wounded; wounded return to the pool as `wounded`
 * so a future hospital can treat them. Occupying additionally moves soldiers into the
 * city and only succeeds when enough of them survive.
 */
export function executeRaid(
  state: GameState, id: string, tierValue: number, soldiers: number,
  random: () => number = Math.random,
  economy?: RaidEconomyContext,
): RaidOutcome {
  const fail = (reason: string): RaidOutcome => ({ ok: false, reason, captured: false, soldiersLost: 0, wounded: 0, loot: {}, opinionAfter: 0, retaliated: false, militaryLoss: 0 });
  if (!NEIGHBOR_IDS.includes(id as NeighborId)) return fail('未知的势力。');
  if (isWorldUnified(state)) return fail('世界已经统一，没有敌对国家。');
  if (!neighborsActive(state)) return fail('研究政府后才能与临近势力接触。');
  const neighborId = id as NeighborId;
  if (state.neighbors.occupied.includes(neighborId)) return fail('该势力已被占领。');
  const tier = (Number.isInteger(tierValue) && tierValue >= 0 && tierValue <= 3 ? tierValue : -1) as RaidTier;
  if (tier < 0) return fail('未知的行动等级。');
  if (!Number.isSafeInteger(soldiers) || soldiers <= 0) return fail('派遣的士兵数量无效。');
  if (soldiers > state.soldiers) return fail('士兵不足。');
  const preview = previewRaid(state, neighborId, tier, soldiers, economy);
  if (!preview.available) return fail(preview.reason || '无法执行该行动。');

  // Casualties: expected losses scaled by a random spread so identical raids differ.
  const spread = .6 + random() * .8;
  const totalLost = Math.min(soldiers, Math.round(preview.expectedLosses * spread));
  // Roughly a third of the casualties are wounded rather than dead.
  const wounded = Math.floor(totalLost * .34);
  const soldiersLost = totalLost - wounded;
  state.soldiers -= soldiersLost;
  state.wounded += wounded;

  const loot: Partial<Record<ResourceId, number>> = {};
  for (const [resource, amount] of Object.entries(preview.loot) as [ResourceId, number][]) {
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const granted = Math.max(0, amount * (random() * .3 + .85));
    if (granted <= 0) continue;
    state.resources[resource] += granted;
    loot[resource] = granted;
  }

  // A successful attack also burns down part of the defender's standing army, scaled by how
  // decisively we outmatched them. `preview` resolved this against the pre-raid military, so
  // the loss cannot be amplified by its own effect.
  const militaryLoss = preview.militaryLoss;
  if (militaryLoss > 0) {
    state.neighbors.values[neighborId].military = Math.max(
      neighborMilitaryFloor(neighborId),
      state.neighbors.values[neighborId].military - militaryLoss,
    );
  }

  state.neighbors.values[neighborId].opinion = Math.max(0,
    state.neighbors.values[neighborId].opinion - RAID_ACTIONS[tier].opinionCost);
  state.neighbors.lastActionTime = state.time;

  const survivors = soldiers - totalLost;
  let captured = false;
  if (tier === 3 && survivors >= RAID_ACTIONS[3].minSurvivors) {
    captured = true;
    state.neighbors.occupied.push(neighborId);
    addLog(state, `已占领${NEIGHBORS[neighborId].name}：全局产量 +${Math.round(OCCUPATION_OUTPUT_BONUS * 100)}%，税收 -${OCCUPATION_TAX_PENALTY}%，驻军 ${OCCUPATION_SOLDIERS} 名。`, 'progress');
  }

  const opinion = state.neighbors.values[neighborId].opinion;
  // A retaliation is part of the same action, so its casualties are reported with it;
  // otherwise the UI would claim a raid cost 7 men while the army shrank by 20.
  const retaliation = opinion <= 0 ? retaliate(state, neighborId, random) : null;
  const lostTotal = soldiersLost + (retaliation?.soldiersLost ?? 0);
  if (soldiersLost || wounded) {
    addLog(state, `${RAID_ACTIONS[tier].name}${NEIGHBORS[neighborId].name}：阵亡 ${soldiersLost}，伤兵 ${wounded}。`, 'event');
  }
  // Report what was actually carried home. Every entry in `loot` already passed the
  // "granted > 0" filter, so this list is exactly what the stockpiles received.
  const lootText = describeLoot(loot);
  if (lootText) {
    addLog(state, `${RAID_ACTIONS[tier].name}${NEIGHBORS[neighborId].name}：掠夺 ${lootText}。`, 'progress');
  }
  if (militaryLoss > 0) {
    addLog(state, `${NEIGHBORS[neighborId].name}军事 -${formatResourceNumber(militaryLoss)}。`, 'progress');
  }
  return {
    ok: true, captured, soldiersLost: lostTotal, wounded, loot, opinionAfter: opinion,
    retaliated: retaliation !== null, militaryLoss,
  };
}

/**
 * A neighbour at zero opinion strikes back: we lose soldiers and a share of a random
 * stockpile. This is the cost of treating 好感度 as free.
 */
function retaliate(state: GameState, id: NeighborId, random: () => number): { soldiersLost: number } {
  const power = neighborStrength(id, state);
  // Never drive the army below zero, and never take the garrison's soldiers either.
  // 防御力 applies here too: the same equipment that saves soldiers in a raid saves them
  // when a neighbour strikes back.
  const losses = Math.min(state.soldiers, Math.max(1, Math.round(power / Math.max(1, calculateCombatPower(state)) * .5 * defenseCasualtyMultiplier(state))));
  state.soldiers -= losses;
  const pool = (Object.keys(RESOURCES) as ResourceId[]).filter(resource =>
    resource !== 'energy' && !RESOURCES[resource].special && state.resources[resource] > 0);
  const target = pool.length ? pool[Math.floor(random() * pool.length)]! : null;
  const stolen = target ? state.resources[target] * RETALIATION_LOSS : 0;
  if (target) state.resources[target] = Math.max(0, state.resources[target] - stolen);
  state.neighbors.values[id].opinion = RETALIATION_OPINION;
  addLog(state, `${NEIGHBORS[id].name}反击：损失 ${losses} 名士兵${target ? `及部分${RESOURCES[target].name}` : ''}。`, 'system');
  return { soldiersLost: losses };
}

/** Leaves an occupied city; its garrison returns to the pool. */
export function abandonOccupation(state: GameState, id: string): boolean {
  if (!NEIGHBOR_IDS.includes(id as NeighborId)) return false;
  const index = state.neighbors.occupied.indexOf(id as NeighborId);
  if (index < 0) return false;
  state.neighbors.occupied.splice(index, 1);
  state.neighbors.values[id as NeighborId].opinion = 10;
  addLog(state, `已撤出${NEIGHBORS[id as NeighborId].name}，驻军返回。`, 'progress');
  return true;
}

/**
 * 世界统一 replaces the whole occupation system: the rival states no longer exist, so their
 * output bonus, garrison and tax penalty all end at once. Everything below reads this flag
 * instead of the raw occupation list, which keeps a stale `occupied` array harmless.
 */
export function isWorldUnified(state: { tech?: readonly TechnologyId[] }): boolean {
  return !!state.tech?.includes('worldUnification');
}

/** Occupied cities that still exist; always empty after 世界统一. */
export function activeOccupations(state: { tech?: readonly TechnologyId[]; neighbors: Pick<GameState, 'neighbors'>['neighbors'] }): NeighborId[] {
  return isWorldUnified(state) ? [] : state.neighbors.occupied;
}

/** Global output multiplier granted by occupied cities (replaced by 世界统一). */
export function occupationOutputMultiplier(state: Pick<GameState, 'neighbors'> & { tech?: readonly TechnologyId[] }): number {
  return 1 + activeOccupations(state).length * OCCUPATION_OUTPUT_BONUS;
}

/** Tax rate actually collected: occupations cost order, so they tax at a penalty. */
export function occupationTaxRate(state: Pick<GameState, 'taxRate' | 'neighbors'> & { tech?: readonly TechnologyId[] }): number {
  const penalty = activeOccupations(state).length * OCCUPATION_TAX_PENALTY;
  return Math.max(0, state.taxRate - penalty);
}

/** Soldiers committed to garrisons; they cannot be sent on raids. */
export function garrisonedSoldiers(state: Pick<GameState, 'neighbors'> & { tech?: readonly TechnologyId[] }): number {
  return activeOccupations(state).length * OCCUPATION_SOLDIERS;
}

/**
 * 世界统一: dissolve the rival states. Occupation records are cleared and the three neighbours
 * stop existing (no growth, no raids, no retaliation), while `tech` keeps the researched flag
 * that grants the replacement bonuses.
 */
export function applyWorldUnification(state: GameState): boolean {
  // Idempotent on the occupation list only: research pushes the flag into `tech` before its
  // side effects run, so guarding on `isWorldUnified` here would skip the dissolve entirely.
  const occupied = state.neighbors.occupied.length;
  if (!occupied) return false;
  state.neighbors.occupied = [];
  addLog(state, `世界已统一：敌对国家消失，${occupied > 0 ? `原占领加成（产量 +${Math.round(occupied * OCCUPATION_OUTPUT_BONUS * 100)}%、驻军 ${occupied * OCCUPATION_SOLDIERS} 名、税收 −${occupied * OCCUPATION_TAX_PENALTY}%）随之结束；` : ''}全局产量 +${Math.round(UNIFICATION_OUTPUT_BONUS * 100)}%，普通资源储量 +${Math.round(UNIFICATION_STORAGE_BONUS * 100)}%。`, 'progress');
  return true;
}

/** Flat global output factor from 世界统一; 1 before the world is unified. */
export function unificationOutputMultiplier(state: Pick<GameState, 'tech'>): number {
  return isWorldUnified(state) ? 1 + UNIFICATION_OUTPUT_BONUS : 1;
}

/** Flat storage factor for ordinary resources from 世界统一; 1 before it is researched. */
export function unificationStorageMultiplier(state: Pick<GameState, 'tech'>): number {
  return isWorldUnified(state) ? 1 + UNIFICATION_STORAGE_BONUS : 1;
}

/** Food per second spent feeding the army. */
export function soldierFoodUpkeep(state: Pick<GameState, 'soldiers'>): number {
  return state.soldiers * SOLDIER_FOOD_UPKEEP;
}

export type { NeighborState };
