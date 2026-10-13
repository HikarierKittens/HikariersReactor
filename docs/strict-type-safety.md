# Strict type-safety policy

The standard TypeScript `strict` option was already enabled. This update adds `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, and Vue `strictTemplates`.

`npm run typecheck` checks the application, Vue components, TypeScript tests, Vite configuration, and a separate strict script project (`tsconfig.scripts.json`). Script checks include dependency declarations. `npm run check` runs type checks, all regression suites, browser acceptance, and production build in order.

JavaScript/CJS tools, generated legacy bridges and inline browser-test JavaScript are not claimed to be TypeScript-checked. Generated bridges are regenerated from authoritative TypeScript by the existing pretest step and exercised by retained regression suites. Do not edit generated bridges to suppress source problems.

## Repair rules

- Narrow optional values and indexed elements explicitly rather than suppressing errors with blanket assertions.
- Keep deliberate invalid-input tests; untrusted JSON must remain runtime-validated.
- Count values must be safe integers. Population above housing is still accepted if it is a valid safe integer; fractions and unrepresentable population counts are rejected.
- Negative, non-finite and unaffordable costs must fail without partially changing resources.
- Shared display snapshots are read-only at the TypeScript API boundary; commands still use authoritative uncached calculations.
- Do not reinterpret missing values silently where doing so changes a gameplay rule.

## Compatibility boundary

The save version and gameplay economy are not intentionally changed. Previously accepted malformed saves (for example fractional stopped-building counts or unsafe integer population) may now be rejected. This is intentional input validation, not a promise to preserve corrupt data.

Compile-time correctness does not prove absence of runtime errors. Passing unit, retained legacy, and browser regressions provides evidence for covered behavior only. Tests intentionally using an expected type error must document the rejected misuse and must not execute unsafe operations merely to check their type.
