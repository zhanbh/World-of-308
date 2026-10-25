# ST11 build — Standards review

Initial, immutable review of `accd5927b0e5daefcac281b2b8913adfdbe04209...ea9ac987e6a70a6c19bb5ccb2a1a44aaeebdaeeb` (committed changes only). Subsequent fixes require a separate recheck record.

Standards sources: `AGENTS.md`, `docs/agents/issue-tracker.md`, and the maintenance rules in `docs/backend/source-of-truth.md`. No `CODING_STANDARDS.md` or `CONTRIBUTING.md` was found. Fowler baseline applied as judgment only; tooling-enforced formatting/type rules excluded.

## Documented standards

No hard documented-standard breach identified in the reviewed diff. Requirements, plan approval and evidence remain repository documents; authoritative contract views were updated. This is not a claim that every behavior satisfies the specification; that belongs to the independent Spec axis.

## Judgment findings

1. **[P2] Possible Duplicated Code — displacement sweep copied into three simulation versions.** `shared/src/bengshan-simulation.ts:12–16`, `shared/src/badao-simulation.ts:14–18`, and `shared/src/earth-simulation.ts:16–20` each define `sweepBengshanMovement` with the same `progress`, `delta`, saved-intent and `advanceMovement` logic. Quoted shape: `const delta=Number(progress(tick)-progress(Math.max(0,tick-1)))`. These implement one collision/displacement rule, so a sweep fix must be repeated across all supported profiles; version compatibility does not require duplicating this identical helper. Extract a shared displacement sweep and retain the versioned orchestration callers.

2. **[P2] Possible Data Clumps — simulation entry points expose an expanding positional bundle.** `shared/src/earth-simulation.ts:22` passes six states, six configurations, targets, inputs, tick bounds, context, stats, RNG and optional resources; `shared/src/badao-simulation.ts:20` and `shared/src/bengshan-simulation.ts:18` repeat its subsets. Quote: `movement:MovementState,basic:CombatState,cross:CrossState,bengshan:BengshanState,badao:BadaoState,earth:EarthState`. Client call sites at `client/assets/scripts/net/MovementCoordinator.ts:102–106` repeat the corresponding positional lists. Bundle named state/configuration/context fields into explicit inputs while preserving each profile's supported lanes. This reduces call-site coupling and makes missing or misordered lane inputs reviewable.

Totals: 0 hard breaches; 2 judgment findings, worst P2. No implementation changes or test runs were necessary for these structural findings.
