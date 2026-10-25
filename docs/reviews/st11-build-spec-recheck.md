# ST11 Spec finding — independent recheck

Reviewed fixed HEAD `cfb7bb94076989fd51bc328fd427b8a7a59cc793` against initial review HEAD `ea9ac987e6a70a6c19bb5ccb2a1a44aaeebdaeeb`. Initial findings remain unchanged in `st11-build-spec-review.md`. Scope: original arithmetic-publication P2 and regressions in its repair/refactoring; not a new full-scope review.

## Result

**Original P2 resolved; no new confirmed Spec finding in the reviewed repair.**

`backend/src/challenge/basic-training.ts` now invokes `validateTrainingArithmetic` before accepting every supported profile. Its BigInt products follow the kernels' rounding sequence: complete direct budget, weighted node floors and final remainder, then maximum critical amplification; complete uint64 bleed budget, weighted allocation, fixed jumps and critical final-jump maximum. The proof uses the existing supported post-equipment AP/bonus/mastery/critical/level domain, rather than only initial fixture attributes. The original maximum-uint64 cross bleed coefficient is rejected at publication. The service admission test also verifies rejection with an exactly unchanged store.

The requested overkill extension clears obsolete direct-control accumulation after lethal damage in all five kernels, retaining full damage events and death precedence. Shared displacement extraction and named simulation arguments preserve actual movement, old snapshots, input ordering and original-result behavior in the focused regression checks.

## Independent validation

- `node --test backend/test/combat-publication-domain.test.mjs`: **5/5 pass**, including all four skill coefficient overflow cases, exact legal direct bases plus one, last legal integer bleed coefficients plus one, service admission/store immutability, and all five lethal kernels.
- `node --test shared/test/basic-combat.test.mjs shared/test/cross-combat.test.mjs shared/test/bengshan-combat.test.mjs shared/test/earth-combat.test.mjs backend/test/bengshan-submit.test.mjs backend/test/badao-submit.test.mjs backend/test/earth-submit.test.mjs`: **66/66 pass**. Includes every-cut determinism, 30/60/120 pacing, thin walls, MP fractions, recovery, write faults, concurrent original operations, 3648-effect public proof and 11400-result pagination.

The unrelated bank concurrency-test repair and any subsequent final HEAD are outside this fixed-SHA recheck. No implementation or original-review file was changed.
