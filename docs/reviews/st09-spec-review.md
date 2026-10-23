# ST09 independent specification review

2026-10-23. Scope: BankService, bank rules, shared bank DTOs, character zero-holdings initialization, and TownService vault-query correction. Reviewer implemented BankCoordinator but did not implement these backend changes. No Jira or external actions.

Read the source-of-truth index, physical mapping and collection holdings contracts, accepted ST09 task graph, and implementation. Executed `node --test backend/test/bank-rules.test.mjs backend/test/bank-v2.test.mjs backend/test/town-bank-regression.test.mjs`: 49/49 passed.

## Finding SR09-01 — P2: bank uses the active character class to identify an item's holdings key

`backend/src/bank/bank-service.ts:60` filters the holdings domain with `k.classId === c.classId`. The holdings contract defines the class component as the equipment's usable class, and the bank task does not impose the equipment-wearing class restriction on storage. A warrior can own/store an unbound hunter item; moving that item into the account vault must identify its hunter collection key rather than search for a warrior key for the hunter set. Currently this returns `CONFIG_NOT_READY` before applying an otherwise legitimate transfer. Multiple eligible-class keys for a shared item are similarly not represented by selecting only the currently active class.

Reproduction executed against `createBankFixture`: retain its selected warrior, inject an admitted unbound level-30 orange hunter bow in its backpack, configure the declared domain with `{collectionKey:'hunter-set-weapon',setId:'hunter-set',setVersion:1,itemLevel:30,slotId:'weapon',classId:'hunter'}`, and submit the normal `f.transfer({kind:'equipment',itemId:'hunter-bow'},1,'accountVault')`. Actual: `{status:'rejected',code:'CONFIG_NOT_READY'}`. The item remains in the backpack. The same item can go to the personal vault because that path bypasses holdings.

Resolve class eligibility from immutable admitted equipment/template or set configuration and apply the appropriate physical-scope contributions, including the documented current-character usability rule, rather than treating the active class as the item's class. Add an other-class set transfer case and a shared-eligibility case if supported by the published domain.

## Acceptance evidence still missing

ST09-03 explicitly requires an actual ST05/ST06 legal-asset-to-bank memory composition. The reviewed bank tests create equipment directly with `seedEquipment`; they verify atomic storage well but do not establish compatibility with actual EquipmentService/ShopService outputs. Add the composed flow or keep that acceptance item open. This is an evidence gap, not a claim that the underlying flow fails.

## Verified strengths and limits

BankService independently verifies trusted identity, identity tuple, current account/session/epoch, selected character, bank context ownership/status/role/scene/location revisions, town map and actual range. Exact command receipts are replayed only after current-caller authorization. Atomic write staging and fault-injection tests cover containers, equipment, holdings, wallet, account fence, journal and receipt. Quote refs bind explicit config, stage and asset versions; personal gold/points races charge only one stage. Stack capacity refusal is all-or-nothing and exposes compatible capacity. Town's alternate read now selects the actual shared vault and applies matching context/range checks. Character creation creates a zero personal holdings record atomically.

Real SDK transaction isolation/budgets, production transport/identity wiring, formal prices and real-device Cocos behavior are not established by this local backend review.

## Recheck — SR09-01 resolved locally

Rechecked the revised holdings path: keys derive from admitted set ID/version, level and slot; account scope applies every declared eligible-class key, while role scope applies only that character's usable key. The parent added an other-class transfer regression. The reviewer independently added `backend/test/bank-composition.test.mjs`, including a dual-class shared-set round trip: account counts change for both warrior and hunter, role count changes only for warrior, and withdrawal returns both scopes to their expected values.

The same file closes the ST05/ST06 composition evidence gap with real service APIs: the actual creation weapon is unequipped by EquipmentService, stored in personal vault, and withdrawn with source/binding/affix/durability preserved; ShopService buys seven potions and one admitted level-10 weapon, both transfer to the account vault without extra wallet charges. The shop/map configuration is explicitly isolated test content, including compatible level-10 equipment and a real service anchor within range. It does not claim that the default candidate shop content or release content is approved.

Recheck command: `node --test backend/test/bank-composition.test.mjs` — 3/3 passed. No remaining blocking finding in the reviewed backend scope. Original finding and evidence-gap text above are retained as review history; both are resolved by this recheck. SDK/device/formal-content limits remain.
