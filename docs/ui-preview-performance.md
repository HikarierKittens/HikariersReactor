# UI preview cache benchmark

## Scope

Option A only: shared read-only display previews. No changes to simulation scheduling, offline catch-up, game balance, purchase authorization, or save format.

Run `npm run benchmark:ui` for reproducible synthetic early/middle/late workloads. These fixtures exercise systems, but are not validated player saves. Five production and five support requests represent repeated consumers in one display revision; they are not an instrumented count of every Vue render. Every cached sample uses a new revision, so its first production and support calls are cold. Five warm-up iterations precede 30 samples. Numbers depend on machine load and JIT warm-up.

## Observed comparison (milliseconds, median)

| Synthetic fixture | Uncached 10 requests | Shared 10 requests | Reduction |
| --- | ---: | ---: | ---: |
| Early | 1.918 | 0.353 | 81.6% |
| Middle | 2.713 | 0.536 | 80.2% |
| Late | 9.001 | 1.725 | 80.8% |

This measures repeated preview work only, **not overall FPS or total frame-time improvement**. Production and support are still computed separately because they have different pool semantics. Nested calculations within each preview remain outside this cache.

The script also measures isolated production/support and a 0.2-second logic step with no-op queue/event/unlock hooks. That logic-step number is not full runtime cost. No offline one/eight-hour or browser paint timing measurement is claimed in this iteration.

## Cache contract

- Key: GameState object identity + explicit UI revision + exact positive finite dt.
- Lazy: requesting production does not automatically calculate a support snapshot.
- A revision change discards previous cached steps for that state.
- At most four dt entries are retained per state revision.
- WeakMap permits old imported/reset states to be garbage-collected.
- Consumers must treat shared snapshots as read-only.
- Action paths and validators keep uncached functions; they do not authorize actions using a display snapshot.
- Display formatter calls without a revision retain their original uncached behavior.

## Remaining work

Measure real browser traces before extending optimization to resource-breakdown internals or offline catch-up. This change does not establish the cause of any earlier initialization hang.
