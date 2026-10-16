/** Canonical identifiers shared by configuration, state and simulation. */
export type ResourceId =
  | 'water' | 'bytes'
  | 'cash' | 'fur' | 'energy' | 'knowledge' | 'food' | 'wood'
  | 'cement' | 'brick' | 'stone' | 'iron' | 'coal' | 'copper'
  | 'aluminum' | 'titanium' | 'metal' | 'plank' | 'oil' | 'uranium'
  | 'alloy' | 'polymer' | 'iridium' | 'mithril' | 'helium3' | 'deuterium' | 'neutron'
  | 'wroughtIron' | 'metalPlate' | 'e710' | 'nanotubes'
  | 'graphene' | 'nanoAlloy' | 'adamantite' | 'aerogel';

export type ResourceAmounts = Record<ResourceId, number>;
export type ResourceRecipe = Partial<ResourceAmounts>;
export type FactoryLineId = 'alloy' | 'polymer' | 'fur' | 'nanotubes' | 'nanoAlloy';
export type CraftId = 'plank' | 'brick' | 'wroughtIron' | 'metalPlate' | 'mithril' | 'aerogel';
export type AsrielSupportedBuilding = 'asrielResidence' | 'asrielMine' | 'ecologicalDome' | 'planetaryFoundry' | 'alienMaterialLab' | 'vrCenter';

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
