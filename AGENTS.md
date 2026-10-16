# Project maintenance rules

## Save compatibility (user requirement)

- Preserve existing player saves across future releases by default. Breaking save compatibility requires an explicit user instruction; never infer it from balancing or new content.
- Adding buildings/resources/state fields must include narrowly scoped, validated upgrade defaults and previous-release save regression tests. Do not merely update fresh-state tests to match the new registry.
- Tightened unlock requirements govern future purchases/research; do not invalidate previously legitimate earned progress. Keep research gating and historical save validation distinct.
- Upgrade normalization must not mutate input. Preserve progression, queues, achievements, and permanent rewards. Reject explicitly malformed data rather than replacing it silently.
- Test previous-release JSON load/import, save/reload roundtrip, and protected-save recovery before shipping.
- Exception retained from prior explicit instructions: schema12–30 were intentionally retired when the schema31 refresh branch began. Do not restore those schemas unless the user specifically requests it. Default compatibility applies to the current supported branch and all subsequent updates.
