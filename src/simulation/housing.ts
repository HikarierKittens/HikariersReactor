import { calculateSupportPreview } from './support-preview';
import { BUILDINGS } from '../data/buildings';
import type { BuildingId } from '../types/buildings';
import type { AsrielSupport } from '../types/economy';
import type { GameState } from '../types/state';

export function countRunningBuildings(id: BuildingId, state: Pick<GameState, 'buildings' | 'stoppedBuildings'>): number {
  // Segmented projects only count complete units (every segmentedRequired segments).
  // segmentEffects projects (彭罗斯球体) work per built segment instead.
  const required = BUILDINGS[id].segmentEffects ? undefined : BUILDINGS[id].segmentedRequired;
  const count = required ? Math.floor((state.buildings[id] || 0) / required) : state.buildings[id] || 0;
  return BUILDINGS[id].alwaysRunning ? count : Math.max(0, count - (state.stoppedBuildings?.[id] || 0));
}
export interface HousingContribution { name: string; count: number; active: number; perBuilding: number; value: number }
export function calculateHousingDetails(state: GameState, support: AsrielSupport, stageThree?: { civilian: number }): HousingContribution[] {
  return (Object.keys(BUILDINGS) as BuildingId[])
    .filter(id => BUILDINGS[id].cap && (state.buildings[id] || 0) > 0)
    .map(id => {
      const building = BUILDINGS[id], count = state.buildings[id];
      const active = id === 'civilianRouteStation' ? stageThree?.civilian ?? calculateSupportPreview(state).stageThree.civilian : id === 'asrielResidence' ? support.allocations.asrielResidence || 0 : countRunningBuildings(id, state);
      const perBuilding = id === 'asrielResidence'
        ? ((building.cap || 0) * 20 + (support.allocations.ecologicalDome || 0)) / 20
        : (building.cap || 0);
      return { name: building.name, count, active, perBuilding, value: active * perBuilding };
    });
}
