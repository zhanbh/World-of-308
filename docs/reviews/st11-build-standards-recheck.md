# ST11 Standards targeted recheck

Result: **PASS** at `cfb7bb94076989fd51bc328fd427b8a7a59cc793`.

Scope: only the two judgment findings in [the immutable initial review](st11-build-standards-review.md) and regression risks introduced by their fixes. Compared `ea9ac987e6a70a6c19bb5ccb2a1a44aaeebdaeeb..cfb7bb94076989fd51bc328fd427b8a7a59cc793`; consulted [fix evidence](st11-review-fixes.md). This is not a new full review of other changes.

- **Duplicated Code: resolved.** `shared/src/skill-displacement.ts:5–12` now owns cumulative rational displacement, per-tick delta, saved intent/facing and complete-path movement sweep. Bengshan, badao and earth simulations import it. The extraction preserves the old arithmetic and movement calls; earth explicitly supplies its first-node endpoint and removes the misleading bengshan casts.
- **Data Clumps: resolved for the reviewed entry points.** `BengshanSimulationInput`, `BadaoSimulationInput` and `EarthSimulationInput` make each supported lane explicit. Their destructured entry points and backend/client/benchmark/test callers use named fields. Inspection found no swapped or dropped state/configuration, resource callback, RNG or context input in this conversion. Versioned lane availability is retained.

Independent focused validation: `node --test shared/test/bengshan-combat.test.mjs shared/test/earth-combat.test.mjs backend/test/bengshan-client.test.mjs backend/test/badao-client.test.mjs backend/test/earth-client.test.mjs` — **16/16 passed**. This includes thin-wall displacement, every-cut rational-haste continuity, mixed four-skill continuity and durable client recovery for all three converted APIs.

No remaining finding within this targeted Standards recheck. The initial report remains unchanged. A later test-only concurrency fix requires separate final-SHA confirmation; it is not included in this pass.

## Final SHA confirmation

**PASS confirmed at `07ffb1ec12d6bc94f27d35f3b8cb25d5cbe5c71a`.** Independently inspected the complete delta after `cfb7bb94076989fd51bc328fd427b8a7a59cc793`: only `backend/test/bank-v2.test.mjs` and the fix report changed. The new `firstArrived` latch binds the first command to gate1 before launching the competing command; both still reach `beforeCommit` before either gate releases, retaining the stale-baseline OCC conflict and retry assertions for both transfer orders. No production code or reviewed refactor changed. No additional Standards finding or regression risk identified in this test-only delta. Full-suite results in the fix report were supplied by the implementation/root verification; this reviewer did not rerun that suite. Initial findings remain immutable.
