# ST15 Standards targeted recheck

Fixed reviewed head: `bb916d809f8d9dcd04b8f2bc2477fa66fbb7dcb3`; corrective diff starts at `0639c097fd8f2da0465ace41e16a06ee127d1dd7`. The initial `st15-build-standards-review.md` remains unchanged. This is a targeted recheck of the original duplication finding and related death/wear regression, not a new full-feature style scan.

## Result

The original nonblocking **possible Duplicated Code** finding is resolved. `challenge-service.ts` computes `wear` and `finalEquipment` once; the equipment writes use the same objects passed into `currentBasicStats` for CP attack-power projection. The previous independent slot/predicate/formula copy is removed. Newly increased deathIndex causes one death deduction; a subsequent tail-clear fragment adds only room wear. No additional documented-standard breach or material smell was identified in this corrective scope.

The patch also updates the boss-clear contract, dictionary, API and state views for death-tail advancement. It retains the original deadline and restricts dead submissions to empty inputs with already released effects, consistent with the source-of-truth synchronization rule. Original frozen-source evidence and latest stamina decision remain intact.

## Independent validation

Ran `node --test backend/test/boss-death-tail.test.mjs`: **5/5 passed**. This covers split cross/earth terminal equivalence, 50→45→44 durability, original deadline, rejection of new dead-player actions, client empty-fragment advancement, and replay without duplicate mutation. Node emitted the existing client package module-type warning; no test failed.

Full-suite validation remains the root session's separate evidence. Maximum-domain terminal budget remains **BLOCKED**; this recheck does not claim production, SDK or device readiness.

Final targeted Standards result: **0 open hard breaches; 0 open smell findings**.
