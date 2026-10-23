import { SPECIES_TRAITS, SPECIES_TRAIT_CAP } from '../data/species-traits';
import { createSpeciesTraitsState } from '../simulation/species-traits';
import type { GameState, SpeciesTraitId } from '../types/state';

/**
 * 种族特质 (beta 0.9.44): every earlier save predates the field, so a missing value
 * gets the species' default traits instead of failing. A present value is validated
 * strictly — duplicates, unknown ids and over-cap lists are rejected, never trimmed.
 */
export function validateSpeciesTraits(raw: Record<string, unknown>, state: GameState): void {
  const value = raw.speciesTraits;
  if (value === undefined) { state.speciesTraits = createSpeciesTraitsState(); return; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('种族特质记录无效。');
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some(key => key !== 'traits')) throw Error('种族特质记录无效。');
  const traits = source.traits;
  if (!Array.isArray(traits) || new Set(traits).size !== traits.length
    || traits.some(id => typeof id !== 'string' || !Object.hasOwn(SPECIES_TRAITS, id))) throw Error('种族特质无效。');
  if (traits.length > SPECIES_TRAIT_CAP) throw Error('种族特质数量超过上限。');
  state.speciesTraits = { traits: [...traits] as SpeciesTraitId[] };
}
