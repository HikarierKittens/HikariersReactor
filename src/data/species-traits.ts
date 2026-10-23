import type { SpeciesId, SpeciesTraitId } from '../types/state';

export interface SpeciesTraitDefinition {
  name: string;
  /** Particles paid to add the trait, and again to remove it. */
  cost: number;
  /** One short effect line; the numbers come from simulation/species-traits.ts. */
  desc: string;
}

/** Every species starts with these; owning them still counts toward the cap. */
export const SPECIES_DEFAULT_TRAITS: readonly SpeciesTraitId[] = ['smart', 'creative', 'cute'];
/** One species can hold at most this many traits, initial ones included. */
export const SPECIES_TRAIT_CAP = 6;

export const SPECIES_TRAITS: Record<SpeciesTraitId, SpeciesTraitDefinition> = {
  smart: { name: '聪明', cost: 10, desc: '教授基础知识产量+0.25，科学家基础知识产量+0.5' },
  creative: { name: '创造', cost: 25, desc: 'ARPA项目成本蠕变-0.005，基础造价-20%' },
  cute: { name: '可爱', cost: 25, desc: '猫猫艺术家产出的幸福度+1%' },
  curious: { name: '好奇', cost: 30, desc: '每个猫猫市民使喵喵学校的知识容量+0.1%' },
};

export const SPECIES: Record<SpeciesId, { name: string; traits: readonly SpeciesTraitId[] }> = {
  cat: { name: '喵星人', traits: SPECIES_DEFAULT_TRAITS },
};
