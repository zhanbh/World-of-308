# ST10 build — independent Spec review

2026-10-24. Base `2d5276a2a37d84b1a274ac453e105a3ef4ebdc1a`; HEAD `bd6cda776e57abda5132ae35e30f2fc81b996a1a`. Reviewed committed `git diff 2d5276a...HEAD` only (57 files; cae0f5d, e617619, 7ab6184, 83752e7, bd6cda7). Sources: accepted st10/spec.md, frozen issues/01–05, task-plan.md and source-of-truth loading/recovery/CP/arithmetic/protocol/physical contracts; implementation verification reports are evidence, not specifications. No implementation edits or external operations.

## Missing/partial or incorrect requirements

1. **[P1] Recovery after loading cannot complete when final ready changes HP/buffs.** Issue 04 requires “客户端可查询原结果并在原截止内恢复”; issue 05 requires “加载分段自然回复与精确余数沿算术合同，buff中途到期正确分段”. `client/assets/scripts/net/RecoveryCoordinator.ts:73–76` clears the pending intent/ticket and requires the final public hash to equal the **pre-ready** ticket hash before enabling prediction. The legitimate ready suffix changes that hash. Actual-service repro: wounded second-room role with explicit hash-bound 60 internal HP/sec; prepare at 1000, activate 2000, suspend 3000, resume/recovery-ready 4000, final ordinary ready 5000. Server commits active/HP1180/tick300; client remains loading/prediction=false, readyTicket=null. Retry and fetchPages have no usable intent/ticket. Reproduce: `node /private/tmp/st10-spec-recovery-repro.mjs` (also runs the imported 14 passing next-room tests). Fix acceptance must deliver/verify the current bounded public actor/CD/buff state after the suffix; merely deleting the hash comparison can leave stale records. Ordinary ready currently removes the ticket required by recoveryPage.

2. **[P2] Outer checkpoint validation diverges from handoff.** CP contract states “外层沿 login-handoff 的 schemaVersion=2 cpHeader/cpChunk 键、归属、activeChunks 和 canonical(data) hash”. `backend/src/challenge/room-checkpoint.ts:46–49` checks chunkRevision equality without its integer domain and omits acceptingInputs type validation. Repro on an actual activated fixture: set both activeChunks[].chunkRevision and matching chunk.chunkRevision to null, retaining valid data/hash. challenge.get succeeds; actual LoginService session.commit throws LOGIN_HANDOFF_INTEGRITY at login-handoff.ts:77. This requires malformed persisted metadata; normal writers were not shown to generate it. Reject such metadata consistently before exposing/continuing the scene; verify valid checkpoints still hand off.

## Scope creep

None found within the approved memory-service/client coordinator and explicit local-test fixture boundaries. Cocos/SDK, formal content, battle engine and ST15 remain recorded gaps.

Spec: 2 findings; worst P1. Passing tests do not cover the demonstrated cross-feature failure.

## Independent recheck — 2026-10-24

Pinned repaired HEAD `08fb0eba410dfa79477eff30b669717c5fa4d815` (fix commits `03148cb` and `08fb0eb`); reviewed `git diff bd6cda7...HEAD` and `st10-build-review-fixes.md`. The original findings and original pinned review above remain historical evidence.

**P1 closed.** Re-ran the unchanged `/private/tmp/st10-spec-recovery-repro.mjs`: client now reaches active/prediction=true; independently parsed its output and asserted verified public player HP equals actual CP HP1180 and current public hash equals server hash. Fresh records, rather than removal of the previous-hash predicate alone, resolve the failure. Both coordinators fetch digest-verified post-ready actor/CD/buff records, then revalidate current scene/timeline/revision/hash before permitting prediction. New tests additionally assert current HP and removal of the buff expiring during the ready suffix, reopen after committed-response loss, and refusal on altered/omitted pages or an actual suspend between proof and final status.

The active-page path binds the authenticated issued ready receipt to the current CP and same scene/timeline/manifest. Its proof deadline comes from the committed new connected lease, capped by death deadline; it is fixed in the ready receipt. Inspected boundary coverage: ready at old cutoff−1 with lost reply, reopen/proof at old cutoff+1 succeeds; replay/reads/heartbeats do not extend the issued deadline; forged/old timeline and expired proof are rejected. Original ready acceptance remains strictly before its original cutoff.

**P2 closed.** Both handoff and room reads now invoke shared outer header/chunk validators. Actual malformed matching metadata fails closed; valid CP still passes actual LoginService takeover. Revision, ref, integer domains and acceptingInputs checks match the identified compatibility requirement.

Executed `node --test backend/test/ready-proof-v2.test.mjs backend/test/client-ready-proof.test.mjs backend/test/room-checkpoint-v2.test.mjs`: **60/60 harness executions passed**, including 42 repeated imported next-room cases, not 60 distinct new tests. Original repro output is `/private/tmp/st10-spec-recovery-recheck.log`.

No new concrete Spec finding in the repaired diff. Independent Spec signoff: both original findings closed, zero open. Existing formal-content, Cocos/device/SDK and later-story gaps remain as originally scoped.
