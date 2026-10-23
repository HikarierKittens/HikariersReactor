import { SPECIES_DEFAULT_TRAITS, SPECIES_TRAITS, SPECIES_TRAIT_CAP } from '../data/species-traits';
import type { GameState, SpeciesId, SpeciesTraitId } from '../types/state';

/** 种族特质 are edited only after 第三代喵星人, and only for the current species. */
export const CURRENT_SPECIES: SpeciesId = 'cat';

export function createSpeciesTraitsState(): { traits: SpeciesTraitId[] } {
  return { traits: [...SPECIES_DEFAULT_TRAITS] };
}

export function isSpeciesTraitUnlocked(state: Pick<GameState, 'crispr'>): boolean {
  return state.crispr.includes('thirdGenerationCat');
}

/** Defensive read: saves from before 0.9.44 have no speciesTraits field at all. */
export function ownedSpeciesTraits(state: Pick<GameState, 'speciesTraits'>): readonly SpeciesTraitId[] {
  const traits = state.speciesTraits?.traits;
  return Array.isArray(traits) ? traits : SPECIES_DEFAULT_TRAITS;
}

export function hasSpeciesTrait(state: Pick<GameState, 'speciesTraits'>, id: SpeciesTraitId): boolean {
  return ownedSpeciesTraits(state).includes(id);
}

export function speciesTraitCount(state: Pick<GameState, 'speciesTraits'>): number {
  return ownedSpeciesTraits(state).length;
}

export function canAddSpeciesTrait(state: GameState, id: SpeciesTraitId): boolean {
  return isSpeciesTraitUnlocked(state) && !hasSpeciesTrait(state, id)
    && speciesTraitCount(state) < SPECIES_TRAIT_CAP
    && state.prestige.particles >= SPECIES_TRAITS[id].cost;
}

export function canRemoveSpeciesTrait(state: GameState, id: SpeciesTraitId): boolean {
  return isSpeciesTraitUnlocked(state) && hasSpeciesTrait(state, id)
    && state.prestige.particles >= SPECIES_TRAITS[id].cost;
}

/** Buy or drop one trait; both directions cost the trait price and take effect at once. */
export function toggleSpeciesTrait(state: GameState, id: SpeciesTraitId): boolean {
  if (!Object.hasOwn(SPECIES_TRAITS, id)) return false;
  const add = !hasSpeciesTrait(state, id);
  if (add ? !canAddSpeciesTrait(state, id) : !canRemoveSpeciesTrait(state, id)) return false;
  state.prestige.particles -= SPECIES_TRAITS[id].cost;
  if (!state.speciesTraits || !Array.isArray(state.speciesTraits.traits)) state.speciesTraits = createSpeciesTraitsState();
  state.speciesTraits.traits = add
    ? [...state.speciesTraits.traits, id]
    : state.speciesTraits.traits.filter(trait => trait !== id);
  return true;
}

/** 聪明: additive flat knowledge, so it is a plain bonus rather than a multiplier. */
export const SMART_PROFESSOR_KNOWLEDGE = .25;
export const SMART_SCIENTIST_KNOWLEDGE = .5;
/** 创造: ARPA cost creep drops by this and every base price by 20%. */
export const CREATIVE_PROJECT_CREEP = .005;
export const CREATIVE_PROJECT_COST = .2;
/** 可爱: one percent of happiness per artist effect unit. */
export const CUTE_ARTIST_HAPPINESS = .01;
/** 好奇: school knowledge capacity scales with population. */
export const CURIOUS_SCHOOL_CAPACITY = .001;
