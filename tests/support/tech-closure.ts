import { TECHNOLOGIES } from '../../src/data/technologies';
import type { TechnologyId } from '../../src/types/technologies';

/**
 * Technologies that cannot be granted in bulk, because a save listing them must also
 * satisfy a live state check:
 *
 *   `state/validate-unlocks.ts`  — mission completion, or a fully built 空间撕裂者.
 *   `state/validate-projects.ts` — a required ARPA project (or the two named gates).
 *
 * A research gate tied to `buildingRequired` is *not* included: that field governs
 * future research only, and validation deliberately lets earned research survive it
 * (see the comment at the 空间撕裂者 branch in `validate-unlocks.ts`).
 *
 * The reverse link (a completed mission flag requires its `tech`, see
 * `validateSpaceMissionRecords`) is also left out: tests that set mission flags must keep
 * those technologies researched, which is a scenario decision rather than a gate to skip.
 *
 * The set is *not* closed over prerequisites. A technology that merely hangs off a gated
 * one fails for the ordinary reason that its parent is absent, which every exclusion list
 * already handles by omitting the parent; expanding the set here would over-exclude and
 * disagree with every list that was written by hand.
 */
export function stateGatedTechnologies(): Set<TechnologyId> {
  return new Set((Object.keys(TECHNOLOGIES) as TechnologyId[]).filter(id => {
    const definition = TECHNOLOGIES[id] as unknown as Record<string, unknown>;
    if (definition.spaceMissionRequired || definition.kerberosMissionRequired) return true;
    // Full-ripper structure gate, checked by id in validate-unlocks.ts.
    if (id === 'higherDimensionalStorage' || id === 'overclocking13') return true;
    // Project gate only fires when a required count is spelled out.
    if (definition.arpaPre && definition.arpaRequiredCount !== undefined) return true;
    // Named project gates in validate-projects.ts.
    return id === 'crispr16' || id === 'tourismIndustry';
  }));
}

/**
 * The full tree minus the state-gated technologies. Tests that want "everything that can
 * simply be granted" start here.
 *
 * A test that must also leave a *working* chain unresearched (超空间, 混凝土, 蜂群 …) still
 * spells that out itself — those chains are legitimate research, not gates, so there is
 * nothing to derive them from.
 */
export function technologiesWithoutStateGates(): TechnologyId[] {
  const gated = stateGatedTechnologies();
  return (Object.keys(TECHNOLOGIES) as TechnologyId[]).filter(id => !gated.has(id));
}
