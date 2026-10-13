import { calculateBuildingInput } from './building-production';
import { calculatePopulationPressure, calculateSoldierPressure } from './government';
import type { GameState } from '../types/state';

export interface MoralePowerSnapshot {
  generatorSpeed: number;
  generatorEnergy: number;
  coalRatio: number;
  moonBaseUnits: number;
  biologyUnits: number;
  dataCenterUnits: number;
  waystationUnits?: number;
  navigationBeaconUnits?: number;
  /** Asriel-supported VR中心 units (+2.5 happiness each, within the existing cap). */
  vrCenterUnits?: number;
}
export function calculateArtistEffect(state: Pick<GameState, 'tech' | 'government'>): number {
  return 1 + (state.tech.includes('theaterUpgrade') ? 1 : 0) + (state.tech.includes('tourism') ? 1 : 0) + (state.government === 'democracy' ? .5 : 0);
}
/** Display and settlement share the same power reservations, supplied by the caller. */
export function calculateMorale(state: GameState, dt: number, power: MoralePowerSnapshot) {
  const community = state.buildings.communityCenter ? 25 : 0;
  const base = 100, populationPenalty = calculatePopulationPressure(state), soldierPenalty = calculateSoldierPressure(state);
  const taxPenalty = state.taxRate - 20, governmentPenalty = state.government === 'oligarchy' ? 10 : 0;
  const artistCount = (state.workers.theater || 0) + (state.workers.catCafe || 0);
  const artistEffect = calculateArtistEffect(state), artists = artistCount * artistEffect;
  const theaterCap = state.buildings.theater, broadcastCap = state.buildings.broadcast, stationCap = state.buildings.touristStation;
  const catCafeCap = state.buildings.catCafe;
  const beacon = state.tech.includes('spaceBroadcasting') ? 3 * (power.navigationBeaconUnits || 0) : 0;
  const vr = 2.5 * (power.vrCenterUnits || 0);
  const monumentCap = (state.arpaBuildings.monument || 0) * 2, cap = 100 + theaterCap + broadcastCap + stationCap + catCafeCap + monumentCap;
  const demand = state.buildings.broadcast * 2 + state.buildings.touristStation * 5;
  const potential = state.buildings.broadcast * 3 + state.buildings.touristStation * 3;
  const ratio = demand ? Math.min(1, Math.max(0, Math.max(0, state.resources.energy / dt + power.generatorEnergy - (power.navigationBeaconUnits || 0) * (calculateBuildingInput('navigationBeacon', state).energy || 2) - (power.waystationUnits || 0) * 5 - power.moonBaseUnits * 4 - power.biologyUnits * 2 - power.dataCenterUnits * 3) / demand)) : 1;
  const oilPerStation = calculateBuildingInput('touristStation', state).oil || 0;
  const stationRatio = oilPerStation ? Math.min(ratio, Math.max(0, state.resources.oil) / (oilPerStation * state.buildings.touristStation * dt || 1)) : ratio;
  const broadcast = state.buildings.broadcast * 3 * ratio, station = state.buildings.touristStation * 3 * stationRatio;
  const happiness = Math.max(40, Math.min(cap, base + community - populationPenalty - soldierPenalty - taxPenalty - governmentPenalty + artists + broadcast + station + beacon + vr));
  return { base, community, populationPenalty, soldierPenalty, taxPenalty, governmentPenalty, artists, artistCount, artistEffect,
    theaterCap, broadcastCap, stationCap, catCafeCap, monumentCap, beacon, vr, cap, demand, powerUsed: demand * ratio, ratio, broadcast, station,
    raw: base + community - populationPenalty - soldierPenalty - taxPenalty - governmentPenalty + artists + broadcast + station + beacon + vr,
    happiness, generatorSpeed: power.generatorSpeed, generatorEnergy: power.generatorEnergy, coalRatio: power.coalRatio };
}
