import type { GameState } from '../types/state';
import type { TechnologyId } from '../types/technologies';
import type { ResourceRecipe } from '../types/economy';
import { calculateSpaceFuelMultiplier } from './space-fuel';
import { payResourceCost } from './costs';

export type SpaceMissionId = 'solar' | 'talos' | 'talosMoon' | 'asteroidBelt' | 'misen' | 'neutronStar' | 'blackHole';
export type RegionalMissionId = 'asriel' | 'kerberos' | SpaceMissionId;
type MissionFlag = { [Key in keyof GameState]-?: GameState[Key] extends boolean ? Key : never }[keyof GameState];
export interface RegionalMissionDefinition {
  name: string;
  desc: string;
  region: string;
  /** Legacy helium-3 base price; retained for existing consumers. */
  baseCost: number;
  cost: ResourceRecipe;
  tech: TechnologyId;
  flag: MissionFlag;
  unlock: string;
  missionRequired?: RegionalMissionId;
}
export const SPACE_MISSIONS = {
  solar: { name: '太阳勘探任务', desc: '完成太阳勘探，解锁戴森理论。', region: '太阳', baseCost: 10000, cost: { helium3: 10000 }, tech: 'solarExploration', flag: 'solarMissionCompleted', unlock: '戴森理论' },
  talos: { name: '塔罗斯任务', desc: '完成塔罗斯勘探，解锁大气采矿。', region: '塔罗斯', baseCost: 8000, cost: { helium3: 8000 }, tech: 'outerPlanetExploration', flag: 'talosMissionCompleted', unlock: '大气采矿' },
  talosMoon: { name: '塔卫二任务', desc: '完成塔卫二勘探，解锁采矿站与小行星带区域。', region: '塔卫二', baseCost: 10000, cost: { helium3: 10000 }, tech: 'outerPlanetExploration', flag: 'talosMoonMissionCompleted', unlock: '塔卫二采矿站与小行星带区域' },
  asteroidBelt: { name: '小行星带任务', desc: '完成小行星带勘探，解锁小行星带采矿。', region: '小行星带', baseCost: 20000, cost: { helium3: 20000 }, tech: 'outerPlanetExploration', flag: 'asteroidBeltMissionCompleted', unlock: '小行星带采矿', missionRequired: 'talosMoon' },
  misen: { name: '米神星任务', desc: '完成米神星探索，解锁E-710仓库与E-710反应堆。', region: '米神星', baseCost: 30000, cost: { helium3: 30000, e710: 50 }, tech: 'misenDiscovery', flag: 'misenMissionCompleted', unlock: 'E-710仓库与E-710反应堆' },
  neutronStar: { name: '中子星探索', desc: '探索中子星卡尔维拉，解锁恒星熔炉科技。', region: '卡尔维拉', baseCost: 100000, cost: { helium3: 100000, deuterium: 50000 }, tech: 'energyShield', flag: 'neutronStarMissionCompleted', unlock: '恒星熔炉科技' },
  blackHole: { name: '黑洞探索', desc: '探索人造黑洞DSR-8086，解锁黑洞星际站与彭罗斯理论。', region: 'DSR-8086', baseCost: 150000, cost: { helium3: 150000, deuterium: 75000 }, tech: 'energyShield', flag: 'blackHoleMissionCompleted', unlock: '黑洞星际站与彭罗斯理论' },
} as const satisfies Record<SpaceMissionId, RegionalMissionDefinition>;

export const REGIONAL_MISSIONS = {
  asriel: { name: 'Asriel 探索任务', desc: '完成 Asriel 探索任务，解锁太空港。', region: 'Asriel', baseCost: 5000, cost: { helium3: 5000 }, tech: 'planetaryExploration', flag: 'asrielMissionCompleted', unlock: '太空港' },
  kerberos: { name: 'Kerberos探查', desc: '完成 Kerberos 探查，解锁地热发电站。', region: 'Kerberos', baseCost: 5000, cost: { helium3: 5000 }, tech: 'planetaryExploration', flag: 'kerberosMissionCompleted', unlock: '地热发电站' },
  ...SPACE_MISSIONS,
} as const satisfies Record<RegionalMissionId, RegionalMissionDefinition>;

export function isRegionalMissionId(id: string): id is RegionalMissionId {
  return Object.hasOwn(REGIONAL_MISSIONS, id);
}
export function isRegionalMissionCompleted(state: GameState, id: RegionalMissionId): boolean {
  return !!state[REGIONAL_MISSIONS[id].flag];
}
export function isRegionalMissionAvailable(state: GameState, id: RegionalMissionId): boolean {
  const mission: RegionalMissionDefinition = REGIONAL_MISSIONS[id];
  return state.tech.includes(mission.tech)
    && (!mission.missionRequired || isRegionalMissionCompleted(state, mission.missionRequired))
    && (id !== 'asriel' || !state.asrielMissionQueued);
}
/** 遥远星际 missions: the 电磁发射器 fuel discount covers only ground and space regions. */
export const FUEL_DISCOUNT_EXEMPT_MISSIONS: readonly RegionalMissionId[] = ['neutronStar', 'blackHole'];
/** Recomputed from live powered waystations; only helium-3 receives the fuel discount. */
export function calculateRegionalMissionCost(state: GameState, id: RegionalMissionId): ResourceRecipe {
  const cost: ResourceRecipe = { ...REGIONAL_MISSIONS[id].cost };
  if (cost.helium3 !== undefined && !FUEL_DISCOUNT_EXEMPT_MISSIONS.includes(id)) cost.helium3 = Math.max(Number.MIN_VALUE, cost.helium3 * calculateSpaceFuelMultiplier(state));
  return cost;
}
/** Mark only after payment; shared by immediate commands and purchase queue settlement. */
export function markRegionalMissionCompleted(state: GameState, id: RegionalMissionId): void {
  state[REGIONAL_MISSIONS[id].flag] = true;
  if (id === 'asriel') state.asrielMissionQueued = false;
}
export function completeRegionalMissionNow(state: GameState, id: string): boolean {
  if (!isRegionalMissionId(id) || !isRegionalMissionAvailable(state, id) || isRegionalMissionCompleted(state, id)
    || state.queue.some(item => item.kind === 'mission' && item.id === id)) return false;
  if (!payResourceCost(state.resources, calculateRegionalMissionCost(state, id))) return false;
  markRegionalMissionCompleted(state, id);
  return true;
}

// Preserve the original outer-space API and its numeric helium-3 cost return value.
export function isSpaceMissionCompleted(state: GameState, id: SpaceMissionId): boolean {
  return isRegionalMissionCompleted(state, id);
}
export function isSpaceMissionAvailable(state: GameState, id: SpaceMissionId): boolean {
  return isRegionalMissionAvailable(state, id);
}
export function calculateSpaceMissionCost(state: GameState, id: SpaceMissionId): number {
  return calculateRegionalMissionCost(state, id).helium3!;
}
