# ST15 Spec independent review — initial fixed snapshot

2026-10-29. Immutable review scope: `git diff 4243635...0639c097fd8f2da0465ace41e16a06ee127d1dd7`, all five ST15 slices. Reviewed frozen `st15/spec.md`, issues 01–05, actual-hash validation, latest stamina decision, source-of-truth and active source/holdings/terminal/budget contracts. No implementation edits. Root reports full checks 7/7; that does not satisfy the separately blocked maximum budget gate.

## (a) Missing or partial

- **Known BLOCKED acceptance, not a new defect:** spec line 93 requires “最坏读写键预算（R44 / W33）”. The due maximum fixture historically needs R42/W525, 570 calls and 3,763,879 bytes. `challenge-service.ts:734–742` now rejects the oversized terminal atomically; the normal fixture fits R42/W33. This is appropriate containment, but complete maximum-domain terminal acceptance remains unmet. Keep ST15 incomplete. SDK/device/production-table gaps are explicitly deferred, not added findings.

## (b) Scope creep

No material scope creep identified. Explicit local-test authorization and budget rejection support the approved safety boundaries.

## (c) Implemented incorrectly

- **[P1] Death before a later bleed tick prevents terminal completion across submit boundaries.** Active `boss-clear-terminal-contract-v1.md:7` states “玩家已释放的流血仍可在死亡后击杀首领”; line 9 requires retaining death facts and free revival with full HP/MP and cleared skill cooldowns. `ChallengeService.live()` (`backend/src/challenge/challenge-service.ts:448`) rejects any already-dead H. Both submit transactions call it (`:666`, `:747`), so commit a slice where the player dies while a released bleed remains and Boss HP is positive, then submit the next slice containing the lethal bleed tick: it returns `ROOM_NOT_AVAILABLE`; Boss never reaches the terminal handler. An unsplit slice can finish, making the outcome depend on transport slicing. Existing `shared/test/boss-terminal.test.mjs:16` proves only the pure kernel path. Its explicit `deathAtTick` also hides another seam: service input at `:709` omits that field, while `shared/src/monster-simulation.ts:494` derives `playerDied` solely from it. A bounded kernel reproduction using the service-shaped already-dead player returns `playerDied:false` and `playerDeathAtTick:null`, bypassing the service's conditional MP/CD reset at `:760–766` if the gate is later opened. Preserve death provenance and support authoritative tail progression together.
