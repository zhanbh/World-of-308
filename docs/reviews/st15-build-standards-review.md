# ST15 Standards independent review

Initial immutable review scope: `git diff 4243635...0639c097fd8f2da0465ace41e16a06ee127d1dd7`. Reviewed committed content only; later working-tree execution updates are outside this snapshot.

Standards: root `AGENTS.md`, `docs/agents/issue-tracker.md`, `docs/backend/source-of-truth.md` and its ST15 ground-drop, boss-clear, terminal-settlement and budget contracts. No CONTRIBUTING/CODING_STANDARDS file found. Applied the complete Fowler smell baseline from soflow code-review, with repository rules taking precedence; tooling-enforced checks excluded.

## Documented-standard breaches

None identified. Local task IDs/evidence and frozen-source validation are retained. The explicit stamina decision supersedes the contrary frozen line. The maximum-domain budget failure is reported and blocked, not presented as platform or production readiness. Historical hashes and normalization provenance are evidence, not substituted specifications.

## Judgement calls

- **Possible Duplicated Code — low priority:** `backend/src/challenge/challenge-service.ts:800,802` independently calculate terminal durability for persisted equipment and CP attack-power projection. Both hunks repeat `['weapon','shoulder','chest','pants','belt','boots','earring']`, `wearEnabled`, and `Math.max(0,item.durability.current-rewardConfig.roomWear-(terminalFact.playerDied?5:0))`. They currently agree, but a future wear-rule change must update both or the committed item and authoritative combat snapshot can diverge. Compute the post-wear equipment once, then use those values for the writes and `currentBasicStats`. This is a maintenance heuristic, not a current correctness defect or documented-rule violation.

Result: 0 hard breaches; 1 nonblocking smell judgement. No implementation changes or builds performed by this reviewer.
