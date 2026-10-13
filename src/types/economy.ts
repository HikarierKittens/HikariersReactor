/** Canonical identifiers shared by configuration, state and simulation. */
export type ResourceId =
  | 'water'
  | 'cash' | 'fur' | 'energy' | 'knowledge' | 'food' | 'wood'
  | 'cement' | 'brick' | 'stone' | 'iron' | 'coal' | 'copper'
  | 'aluminum' | 'titanium' | 'metal' | 'plank' | 'oil' | 'uranium'
  | 'alloy' | 'polymer' | 'iridium' | 'mithril' | 'helium3' | 'deuterium' | 'neutron'
  | 'wroughtIron' | 'metalPlate' | 'e710' | 'nanotubes';

export type ResourceAmounts = Record<ResourceId, number>;
export type ResourceRecipe = Partial<ResourceAmounts>;
export type FactoryLineId = 'alloy' | 'polymer' | 'fur' | 'nanotubes';
export type CraftId = 'plank' | 'brick' | 'wroughtIron' | 'metalPlate' | 'mithril';
export type AsrielSupportedBuilding = 'asrielResidence' | 'asrielMine' | 'ecologicalDome' | 'planetaryFoundry' | 'alienMaterialLab';

export interface AsrielSupport {
  ports: number;
  towers: number;
  capacity: number;
  used: number;
  available: number;
  allocations: Record<AsrielSupportedBuilding, number>;
  priority: readonly AsrielSupportedBuilding[];
  support: number;
}

export interface FactoryRecipe {
  input: ResourceRecipe;
  output: ResourceRecipe;
}
