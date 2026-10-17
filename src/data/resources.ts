import type { CraftId, FactoryLineId, ResourceId, ResourceRecipe } from '../types/economy';
import type { BuildingId } from '../types/buildings';
import type { TechnologyId } from '../types/technologies';

export interface ResourceDefinition {
  name: string;
  icon: string;
  cap: number;
  special?: boolean;
  crafted?: boolean;
  tech?: TechnologyId;
  unlockBy?: BuildingId;
}

export const RESOURCES: Record<ResourceId, ResourceDefinition> = {
  water: { name: '水', icon: '', cap: 0, unlockBy: 'iceMiningShip' },
  cash: { name: '$', icon: '', cap: 1000 },
  fur: { name: '毛皮', icon: '', cap: 100 },
  energy: { special: true, name: '电力', icon: '', tech: 'electricity', cap: 10000 },
  knowledge: { special: true, name: '知识', icon: '', tech: 'writing', cap: 1000 },
  bytes: { name: '字节', icon: '', cap: 10000, special: true, tech: 'aiCoreCalibration' },
  encryptedData: { name: '加密数据', icon: '', cap: 50000, special: true, tech: 'encryptedDataAnalysis' },
  food: { name: '猫粮', icon: '', cap: 100 },
  wood: { name: '木材', icon: '', cap: 200 },
  cement: { name: '水泥', icon: '', tech: 'cement', cap: 200 },
  brick: { name: '砌砖', icon: '', special: true, crafted: true, tech: 'cement', unlockBy: 'foundry', cap: Infinity },
  stone: { name: '石头', icon: '', cap: 200 },
  iron: { name: '铁', icon: '', tech: 'mining', cap: 100 },
  coal: { name: '煤', icon: '', tech: 'coalMining', cap: 100 },
  copper: { name: '铜', icon: '', tech: 'mining', cap: 100 },
  aluminum: { name: '铝', icon: '', unlockBy: 'metalRefinery', cap: 100 },
  titanium: { name: '钛', icon: '', tech: 'titaniumSmelting', cap: 100 },
  metal: { name: '钢', icon: '', tech: 'metallurgy', cap: 100 },
  plank: { name: '木板', icon: '', special: true, crafted: true, unlockBy: 'foundry', cap: Infinity },
  oil: { name: '石油', icon: '', tech: 'oilTechnology', cap: 100 },
  uranium: { name: '铀', icon: '', tech: 'nuclearEnergy', cap: 10 },
  alloy: { name: '合金', icon: '', unlockBy: 'factory', cap: 100 },
  polymer: { name: '聚合物', icon: '', tech: 'polymer', cap: 50 },
  iridium: { name: '铱', icon: '', unlockBy: 'iridiumMine', cap: 100 },
  mithril: { name: '秘银', icon: '', crafted: true, unlockBy: 'foundry', cap: Infinity },
  helium3: { name: '氦-3', icon: '', unlockBy: 'helium3Mine', cap: 100 },
  deuterium: { name: '氘', icon: '', unlockBy: 'gasCloudMiningShip', cap: 0 },
  e710: { name: 'E-710', icon: '', tech: 'exoticElementResearch', cap: 0, special: false },
  neutron: { name: '中子', icon: '', unlockBy: 'talosMoonMiningStation', cap: 0, special: false },
  nanotubes: { name: '纳米管', icon: '', tech: 'carbonNanotubes', cap: 0 },
  graphene: { name: '石墨烯', icon: '', tech: 'grapheneProcessing', cap: 0 },
  nanoAlloy: { name: '纳米合金', icon: '', tech: 'nanoAlloy', cap: 0 },
  adamantite: { name: '精金', icon: '', unlockBy: 'adamantiteMiningShip', cap: 0 },
  aerogel: { name: '气凝胶', icon: '', crafted: true, tech: 'aerogel', unlockBy: 'foundry', cap: Infinity },
  wroughtIron: { name: '锻铁', icon: '', special: true, crafted: true, unlockBy: 'foundry', cap: Infinity },
  metalPlate: { name: '金属板', icon: '', special: true, crafted: true, unlockBy: 'foundry', cap: Infinity },
};

export const CRAFT_RECIPES: Record<CraftId, { input: ResourceRecipe; rate: number }> = {
  plank: { input: { wood: 10 }, rate: .1 },
  brick: { input: { cement: 5 }, rate: .1 },
  wroughtIron: { input: { iron: 10 }, rate: .1 },
  metalPlate: { input: { aluminum: 10 }, rate: .1 },
  mithril: { input: { iridium: 10 }, rate: .1 },
  aerogel: { input: { graphene: 10, nanoAlloy: 5 }, rate: .1 },
};

export interface FactoryOption {
  id: FactoryLineId;
  name: string;
  icon: string;
  tech?: TechnologyId;
  input: ResourceRecipe;
  output: ResourceRecipe;
}
export const FACTORY_OPTIONS: FactoryOption[] = [
  { id: 'alloy', name: '合金生产线', icon: '', input: { iron: .25, copper: .5 }, output: { alloy: 1 } },
  { id: 'polymer', name: '聚合物生产线', icon: '', input: { oil: 1 }, output: { polymer: .5 } },
  { id: 'fur', name: '毛皮生产线', icon: '', tech: 'syntheticFur', input: { cash: 25, polymer: 2 }, output: { fur: 5 } },
  { id: 'nanotubes', name: '纳米管生产线', icon: '', tech: 'carbonNanotubes', input: { neutron: .05, coal: 1 }, output: { nanotubes: 10 } },
  { id: 'nanoAlloy', name: '纳米合金生产线', icon: '', tech: 'nanoAlloy', input: { graphene: 5, adamantite: 2 }, output: { nanoAlloy: 1 } },
];
