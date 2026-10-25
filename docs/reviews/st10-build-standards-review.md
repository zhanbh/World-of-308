# ST10 build — independent Standards review

- Base: `2d5276a2a37d84b1a274ac453e105a3ef4ebdc1a`
- Reviewed HEAD: `bd6cda776e57abda5132ae35e30f2fc81b996a1a` (`feat-1.0.0`).
- Scope: committed `git diff 2d5276a2a37d84b1a274ac453e105a3ef4ebdc1a...HEAD`; commits `cae0f5d`, `e617619`, `7ab6184`, `83752e7`, `bd6cda7` (57 files). Uncommitted files excluded.
- Method: independent static Standards axis under soflow code-review; no implementation edits, builds, dependency installation, external actions, or new runtime verification. Frozen ST10 spec/tickets supplied as context, not substituted for standards.
- Sources: root `AGENTS.md`; `docs/backend/source-of-truth.md` and its loading, recovery, checkpoint, arithmetic, physical-mapping and synchronized protocol/state/data contracts. No additional CODING_STANDARDS, CONTRIBUTING or nested AGENTS source was identified. Tool-enforced concerns excluded. All twelve mandatory Fowler baseline smells considered; repository rules take precedence.

## Documented-standard breaches

No substantiated hard violation identified in the reviewed committed changes. This is a Standards finding, not a claim that every functional requirement or runtime behavior is correct.

## Baseline judgment calls

**Possible Duplicated Code — non-blocking.** `client/assets/scripts/net/ActivationCoordinator.ts:55–63` and `client/assets/scripts/net/RecoveryCoordinator.ts:44–52` independently implement the same ticket-bound recovery pagination transport: remove `deadline`, construct `scene.recoveryPage`, await transport, discard stale generations, decode the reply, parse the page, then update `totalPages` and append records. Representative repeated hunk: `decodeSceneReply(q,text); const page=parseRecoveryPage(JSON.parse(text)); total=page.totalPages; pages.push(page);` (spacing normalized).

Both paths must preserve identical page binding and stale-response rules. A future pagination/protocol fix currently needs coordinated edits in both callers; fixing only activation or recovery can leave the other handshake accepting/rejecting a different set of pages. Consider a shared page-fetch helper accepting the identity, ticket and cancellation predicate, while keeping each coordinator’s journal and readiness policy local. The shared `verifyRecoveryPages` already centralizes proof verification; the suggestion concerns transport duplication only. No documented repository rule requires this extraction, and no current exploit or failed acceptance case is asserted.

**Result:** 0 hard breaches; 1 optional smell judgment. No Standards blocker established.

## Independent Standards recheck — 2026-10-24

Rechecked integration HEAD `08fb0eba410dfa79477eff30b669717c5fa4d815`, including fixes `03148cb` and `08fb0eb`, against original reviewed HEAD `bd6cda776e57abda5132ae35e30f2fc81b996a1a` with `git diff bd6cda776e57abda5132ae35e30f2fc81b996a1a...HEAD`. The original report and its pinned result above remain historical evidence. Read `docs/reviews/st10-build-review-fixes.md` and the committed implementation delta; this was an independent static recheck, without running builds/tests or changing implementation files.

**Original optional judgment: closed.** `client/assets/scripts/net/RecoveryProof.ts:11–25` now owns the bounded page-fetch loop, requested binding checks, complete digest verification and cancellation predicate. Both `ActivationCoordinator.fetchPages` and `RecoveryCoordinator.fetchPages` call it, as do their post-ready proof paths. Coordinator-specific journals and readiness policies remain in their owners. The `.meta` asset accompanies the new client module. This directly removes the duplicated transport shape identified above without introducing an unused general abstraction.

**Documented standards:** no new substantiated hard breach found in the fix delta. Shared outer checkpoint validators are used by both handoff and room reads, with room-specific inner/state checks retained. The post-ready proof deadline is bounded metadata in the existing receipt and existing commit; active-page reads do not create a second loading clock or renew it. The fix evidence documents its schema scope, actual byte measurements, regression boundaries and excluded platform acceptance. Those reported test results were inspected as implementation evidence, not independently rerun here.

**Remaining/new baseline judgments:** none substantive identified. The twelve mandatory smell heuristics remain judgment calls, not additional hard repository rules.

**Standards signoff:** 0 open hard breaches; 0 open optional findings; no Standards blocker at the pinned recheck HEAD. This signoff covers Standards only and does not replace the independent Spec axis or platform/runtime acceptance.
