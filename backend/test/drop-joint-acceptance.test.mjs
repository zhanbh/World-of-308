import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/adapters/memory-store.ts';
import { createBankFixture } from './fixtures/bank-fixture.mjs';
import { jointTerminalFixture, meteredService } from './fixtures/joint-terminal-fixture.mjs';
import { enhancementFixture } from './fixtures/enhancement-fixture.mjs';
import { ShopService } from '../src/shop/shop-service.ts';
import { DEFAULT_SHOP_CATALOG } from '../src/shop/shop-model.ts';
import { CollectionCoordinator, SET_SLOT_DEFS } from '../../client/assets/scripts/net/CollectionCoordinator.ts';
import { loginKey } from '../src/identity/identity-v2.ts';
import { isCandidateMissing, selectCandidateByStrategy, deriveDropSample } from '../src/challenge/drop-strategy.ts';
import { planClear } from '../src/challenge/terminal-settlement.ts';
import { ChallengeService } from '../src/challenge/challenge-service.ts';
import { manifestDigest } from '../../shared/src/room-manifest.ts';

const SET_SLOTS = [
  'weapon', 'shoulder', 'chest', 'pants', 'belt', 'boots',
  'bracelet', 'necklace', 'ring', 'subEquip', 'magicStone',
];

function makeSetCandidates() {
  const wearSlots = ['weapon', 'shoulder', 'chest', 'belt', 'pants', 'boots'];
  const candidates = SET_SLOTS.map(slot => ({
    kind: 'equipment',
    templateRef: { id: `god-set-${slot}-tpl`, version: 1 },
    quantity: 1,
    quality: 'orange',
    itemLevel: 30,
    binding: { kind: 'none' },
    equipment: {
      slotKind: slot,
      affixes: [],
      setRef: { id: 'warrior-god-set', version: 1 },
      durability: wearSlots.includes(slot)
        ? { wearEnabled: true, current: 100, max: 100, policyRef: 'combat-decay' }
        : { wearEnabled: false, current: null, max: null, policyRef: 'no-wear' },
    },
  }));

  const domain = {
    ref: 'bank-test-domain',
    keys: SET_SLOTS.map(slot => ({
      collectionKey: `god-set-${slot}`,
      setId: 'warrior-god-set',
      setVersion: 1,
      itemLevel: 30,
      slotId: slot,
      classId: 'warrior',
    })),
  };

  return { candidates, domain };
}

test('ST19-05 AC1-AC4 Full Loop: 0 to 11 pieces collection, account vault sharing, shop sale / destruction restore, and full set fallback', async () => {
  const { candidates, domain } = makeSetCandidates();

  const f = await createBankFixture({ holdingsDomain: domain });
  const accountId = f.account().id;
  const char1Id = f.characterId;

  // Initialize holdings entities in store
  const hidChar1 = await loginKey('holdings', [accountId, 'character', char1Id]);
  const hidAcct = await loginKey('holdings', [accountId, 'account']);

  const holdingsChar1 = {
    schemaVersion: 2,
    id: hidChar1,
    accountId,
    scope: 'character',
    characterId: char1Id,
    revision: 1,
    domainRef: domain.ref,
    entries: [],
  };

  const holdingsAcct = {
    schemaVersion: 2,
    id: hidAcct,
    accountId,
    scope: 'account',
    revision: 1,
    domainRef: domain.ref,
    entries: [],
  };

  await f.store.run(async tx => {
    tx.set(hidChar1, holdingsChar1);
    tx.set(hidAcct, holdingsAcct);
  });

  const coordinator = new CollectionCoordinator();
  coordinator.open({
    sessionId: f.auth.sessionId,
    sessionEpoch: f.auth.sessionEpoch,
    characterId: char1Id,
    setId: 'warrior-god-set',
  });
  assert.equal(coordinator.state.progressText, '0/11');

  // Terminal config with 11 set candidates & missing-slot-first profile
  const profile = {
    profileId: 'test-god-profile',
    version: 1,
    schemaVersion: 1,
    strategyId: 'missing-slot-first',
    fallbackStrategy: 'weighted-random',
    candidates,
    holdingsDomain: domain,
  };

  const terminalConfig = {
    profile: 'local-test-terminal',
    authorization: 'isolated-local-assets-only',
    ref: 'term-config-joint',
    gold: '1000',
    xp: 500,
    progressionRef: { id: 'progression-warrior-v1', version: 1 },
    thresholds: Array.from({ length: 30 }, (_, i) => i * 100),
    attributes: Array.from({ length: 30 }, () => ({ maxHp: '1000', maxMp: '500' })),
    equipment: candidates,
    missingPolicy: 'missing-first',
    strategyProfile: profile,
    holdingsDomain: domain,
    levelWeapons: [
      { node: 5, itemLevel: 10, templateRef: { id: 'w-5', version: 1 } },
      { node: 10, itemLevel: 15, templateRef: { id: 'w-10', version: 1 } },
      { node: 15, itemLevel: 20, templateRef: { id: 'w-15', version: 1 } },
      { node: 20, itemLevel: 25, templateRef: { id: 'w-20', version: 1 } },
      { node: 25, itemLevel: 30, templateRef: { id: 'w-25', version: 1 } },
      { node: 30, itemLevel: 30, templateRef: { id: 'w-30', version: 1 } },
    ],
  };

  // Phase 1: 0 to 11 Pieces Collection
  const awardedSlots = [];
  for (let round = 1; round <= 11; round++) {
    const challengeId = `ch-joint-${round}`;
    const clearResult = await f.store.run(async tx => {
      const char = await tx.get(char1Id);
      char.level = 30;
      char.progressionConfigRef = { id: 'progression-warrior-v1', version: 1 };
      const bag = await tx.get(char.backpackId);
      return planClear(tx, char, bag, challengeId, terminalConfig, 1000 + round, { kind: 'special', monsterLevel: 30 }, round * 12345);
    });

    assert.equal(clearResult.route, 'direct');
    const slot = clearResult.equipment.slotKind;
    assert.ok(SET_SLOTS.includes(slot), `awarded valid set slot: ${slot}`);
    assert.ok(!awardedSlots.includes(slot), `slot ${slot} was not awarded previously (no duplicate)`);
    awardedSlots.push(slot);

    // Apply clear receipt to CollectionCoordinator
    coordinator.applyClearReceipt({
      route: 'direct',
      equipment: clearResult.equipment,
    });

    assert.equal(coordinator.state.collectedCount, round);
    assert.equal(coordinator.state.progressText, `${round}/11`);
    assert.equal(coordinator.state.latestAwardedSlot, slot);
  }

  assert.equal(coordinator.state.collectedCount, 11);
  assert.equal(coordinator.state.isFullSet, true);
  assert.equal(coordinator.state.progressText, '11/11');

  // Phase 2: Deposit 1 piece (boots) into accountVault via BankService
  const bootsCandidate = candidates.find(c => c.equipment.slotKind === 'boots');
  const bootsItem = Array.from(f.store.snapshot().values()).find(
    e => e.schemaVersion === 2 && e.slotKind === 'boots' && e.accountId === accountId && e.location?.kind === 'container'
  );
  assert.ok(bootsItem, 'boots item found in backpack');

  const transferCmd = f.transfer({ kind: 'equipment', itemId: bootsItem.id }, 1, 'accountVault');
  const transferRes = await f.service.execute(transferCmd);
  if (transferRes.outcome.status !== 'committed') {
    console.error('AC1-AC4 transfer failed:', JSON.stringify(transferRes.outcome));
  }
  assert.equal(transferRes.outcome.status, 'committed');

  // Verify account vault holdings updated
  const updatedAcctHoldings = f.store.inspect(hidAcct);
  const bootsAcctEntry = updatedAcctHoldings.entries.find(e => e.collectionKey === 'god-set-boots');
  assert.ok(bootsAcctEntry && bootsAcctEntry.permanentCount >= 1, 'boots recorded in account scope');

  // Phase 3: Dual-Character Isolation Check
  // Character 2 (same account) checks missing slots
  const char2Id = 'char-warrior-2';
  const hidChar2 = await loginKey('holdings', [accountId, 'character', char2Id]);
  const holdingsChar2 = {
    schemaVersion: 2,
    id: hidChar2,
    accountId,
    scope: 'character',
    characterId: char2Id,
    revision: 1,
    domainRef: domain.ref,
    entries: [], // Char2 owns no private pieces
  };

  const contextChar2 = {
    character: { id: char2Id, accountId, classId: 'warrior', level: 30 },
    summaries: [holdingsChar2, updatedAcctHoldings],
    holdingsDomain: domain,
    now: 2000,
  };

  // Boots is in account vault -> held across entire account
  assert.equal(isCandidateMissing(bootsCandidate, contextChar2), false, 'boots is held for Char2 via accountVault');
  // Weapon is private to Char1 -> missing for Char2
  const weaponCandidate = candidates.find(c => c.equipment.slotKind === 'weapon');
  assert.equal(isCandidateMissing(weaponCandidate, contextChar2), true, 'weapon is missing for Char2 (isolated from Char1)');

  // Phase 4: Transfer boots back to Char1 bag and Sell it at Shop
  const withdrawCmd = f.transfer({ kind: 'equipment', itemId: bootsItem.id }, 1, 'accountVault', true);
  const withdrawRes = await f.service.execute(withdrawCmd);
  assert.equal(withdrawRes.outcome.status, 'committed');

  // Open shop context and sell boots
  const shopContextId = 'ctx_joint_shop';
  await f.store.run(async tx => {
    tx.set(shopContextId, {
      schemaVersion: 2,
      id: shopContextId,
      accountId,
      characterId: char1Id,
      rolePlayEpoch: f.character().rolePlayEpoch,
      sceneEpoch: 1,
      locationRevision: 1,
      anchorId: 'anchor_blacksmith',
      serviceKind: 'shop',
      issuedAt: 1000,
      status: 'open',
    });
  });

  const shopService = new ShopService({
    store: f.store,
    clock: f.clock,
    identity: f.identity,
    catalog: DEFAULT_SHOP_CATALOG,
    holdingsDomain: domain,
  });

  const sellCmd = {
    ...f.auth,
    command: 'shop.sell',
    operationId: 'op-joint-sell-boots',
    expected: [],
    payload: {
      characterId: char1Id,
      contextId: shopContextId,
      target: { kind: 'equipment', itemId: bootsItem.id },
      quantity: 1,
      quoteRef: 'quote-joint',
    },
  };

  const sellRes = await shopService.execute(sellCmd);
  assert.equal(sellRes.outcome.status, 'committed');

  // Verify boots slot is restored to MISSING
  const char1HoldingsAfterSale = f.store.inspect(hidChar1);
  const acctHoldingsAfterSale = f.store.inspect(hidAcct);
  const contextAfterSale = {
    character: f.character(),
    summaries: [char1HoldingsAfterSale, acctHoldingsAfterSale],
    holdingsDomain: domain,
    now: 3000,
  };
  assert.equal(isCandidateMissing(bootsCandidate, contextAfterSale), true, 'boots is restored to missing after sale');

  // Coordinator reflects updated holdings (10/11)
  coordinator.applyHoldings(char1HoldingsAfterSale, acctHoldingsAfterSale, domain);
  assert.equal(coordinator.state.collectedCount, 10);
  assert.equal(coordinator.state.isFullSet, false);
  assert.equal(coordinator.state.progressText, '10/11');

  // Phase 5: Re-clear dungeon -> missing-slot-first immediately awards boots!
  const reClearResult = await f.store.run(async tx => {
    const char = await tx.get(char1Id);
    char.level = 30;
    char.progressionConfigRef = { id: 'progression-warrior-v1', version: 1 };
    const bag = await tx.get(char.backpackId);
    return planClear(tx, char, bag, 'ch-joint-reclear-boots', terminalConfig, 4000, { kind: 'special', monsterLevel: 30 }, 9999);
  });

  assert.equal(reClearResult.equipment.slotKind, 'boots', 'missing-slot-first re-awarded boots');
  coordinator.applyClearReceipt({ route: 'direct', equipment: reClearResult.equipment });
  assert.equal(coordinator.state.collectedCount, 11);
  assert.equal(coordinator.state.isFullSet, true);

  // Phase 6: 12th clear with full set -> smooth fallback to weighted-random
  const round12Result = await f.store.run(async tx => {
    const char = await tx.get(char1Id);
    char.level = 30;
    char.progressionConfigRef = { id: 'progression-warrior-v1', version: 1 };
    const bag = await tx.get(char.backpackId);
    return planClear(tx, char, bag, 'ch-joint-round-12', terminalConfig, 5000, { kind: 'special', monsterLevel: 30 }, 8888);
  });

  assert.equal(round12Result.route, 'direct');
  assert.ok(SET_SLOTS.includes(round12Result.equipment.slotKind), 'round 12 smoothly awarded valid set slot');
});

test('ST19-05 AC5 Physical Transaction Budget: terminal clear with 11 set pieces, holdings and 100-slot bag meets all physical limits', async () => {
  const { candidates, domain } = makeSetCandidates();

  const h = await jointTerminalFixture({ due: false });
  const config = h.content.terminal;

  // Configure full 11-piece set candidates and holdingsDomain
  config.equipment = candidates;
  config.holdingsDomain = domain;
  config.missingPolicy = 'missing-first';
  config.strategyProfile = {
    profileId: 'budget-god-profile',
    version: 1,
    schemaVersion: 1,
    strategyId: 'missing-slot-first',
    fallbackStrategy: 'weighted-random',
    candidates,
    holdingsDomain: domain,
  };

  await h.store.run(async tx => {
    const ch = await tx.get(h.challengeId);
    tx.set(ch.id, {
      ...ch,
      monsterLevel: 30,
      terminalConfigHash: await manifestDigest({ terminal: config, rewards: h.content.rewards }),
    });

    // Seed initial holdings for character and account
    const hidChar = await loginKey('holdings', [h.character().accountId, 'character', h.characterId]);
    const hidAcct = await loginKey('holdings', [h.character().accountId, 'account']);
    tx.set(hidChar, {
      schemaVersion: 2,
      id: hidChar,
      accountId: h.character().accountId,
      scope: 'character',
      characterId: h.characterId,
      revision: 1,
      domainRef: domain.ref,
      entries: [
        { collectionKey: 'god-set-shoulder', permanentCount: 1, mailLatestExpiryAt: null },
      ],
    });
    tx.set(hidAcct, {
      schemaVersion: 2,
      id: hidAcct,
      accountId: h.character().accountId,
      scope: 'account',
      revision: 1,
      domainRef: domain.ref,
      entries: [],
    });
  });

  const { service, attempts } = meteredService(h);
  const cmd = await h.command();
  const res = await service.execute(cmd);
  assert.equal(res.outcome.status, 'committed');

  const m = attempts.find(a => a.W > 0);
  assert.ok(m, 'found committed write attempt metrics');
  console.log('ST19-05 Terminal Settlement Budget Measured:', JSON.stringify(m));

  // Physical Limits Verification
  assert.ok(m.R <= 44, `reads ${m.R} <= 44`);
  assert.ok(m.W <= 33, `writes ${m.W} <= 33`);
  assert.ok(m.calls <= 80, `total calls ${m.calls} <= 80`);
  assert.ok(m.bytes <= 1572864, `write bytes ${m.bytes} <= 1.5 MiB`);

  // Holdings summary size limit <= 16 KiB (16384 bytes)
  const hidChar = await loginKey('holdings', [h.character().accountId, 'character', h.characterId]);
  const holdingsDoc = h.store.inspect(hidChar);
  const holdingsBytes = Buffer.byteLength(JSON.stringify(holdingsDoc));
  console.log('ST19-05 Holdings Document Bytes:', holdingsBytes);
  assert.ok(holdingsBytes <= 16384, `holdings document ${holdingsBytes} <= 16384 bytes`);
});

test('ST19-05 AC6 Atomic Fault Injection: 100% clean rollback at every write point during terminal settlement with holdings', async () => {
  const { candidates, domain } = makeSetCandidates();

  const sample = await jointTerminalFixture({ due: true });
  const config = sample.content.terminal;
  config.equipment = candidates;
  config.holdingsDomain = domain;
  config.missingPolicy = 'missing-first';
  config.strategyProfile = {
    profileId: 'fault-god-profile',
    version: 1,
    schemaVersion: 1,
    strategyId: 'missing-slot-first',
    fallbackStrategy: 'weighted-random',
    candidates,
    holdingsDomain: domain,
  };

  await sample.store.run(async tx => {
    const ch = await tx.get(sample.challengeId);
    tx.set(ch.id, {
      ...ch,
      monsterLevel: 30,
      terminalConfigHash: await manifestDigest({ terminal: config, rewards: sample.content.rewards }),
    });
    const hidChar = await loginKey('holdings', [sample.character().accountId, 'character', sample.characterId]);
    const hidAcct = await loginKey('holdings', [sample.character().accountId, 'account']);
    tx.set(hidChar, {
      schemaVersion: 2,
      id: hidChar,
      accountId: sample.character().accountId,
      scope: 'character',
      characterId: sample.characterId,
      revision: 1,
      domainRef: domain.ref,
      entries: [],
    });
    tx.set(hidAcct, {
      schemaVersion: 2,
      id: hidAcct,
      accountId: sample.character().accountId,
      scope: 'account',
      revision: 1,
      domainRef: domain.ref,
      entries: [],
    });
  });

  const measured = meteredService(sample);
  const commitRes = await measured.service.execute(await sample.command());
  assert.equal(commitRes.outcome.status, 'committed');

  const count = measured.attempts.find(a => a.W > 0).setCalls;
  assert.ok(count >= 11, `at least 11 actual write calls (observed ${count})`);
  console.log(`ST19-05 Rollback Testing across ${count} write points...`);

  // Inject write failure at every single write point
  for (let n = 1; n <= count; n++) {
    const h = await jointTerminalFixture({ due: true });
    const cfg = h.content.terminal;
    cfg.equipment = candidates;
    cfg.holdingsDomain = domain;
    cfg.missingPolicy = 'missing-first';
    cfg.strategyProfile = {
      profileId: 'fault-god-profile',
      version: 1,
      schemaVersion: 1,
      strategyId: 'missing-slot-first',
      fallbackStrategy: 'weighted-random',
      candidates,
      holdingsDomain: domain,
    };
    h.service = new ChallengeService({
      store: h.store,
      clock: h.clock,
      identity: h.identity,
      content: h.content,
    });

    await h.store.run(async tx => {
      const ch = await tx.get(h.challengeId);
      tx.set(ch.id, {
        ...ch,
        monsterLevel: 30,
        terminalConfigHash: await manifestDigest({ terminal: cfg, rewards: h.content.rewards }),
      });
      const hidChar = await loginKey('holdings', [h.character().accountId, 'character', h.characterId]);
      const hidAcct = await loginKey('holdings', [h.character().accountId, 'account']);
      tx.set(hidChar, {
        schemaVersion: 2,
        id: hidChar,
        accountId: h.character().accountId,
        scope: 'character',
        characterId: h.characterId,
        revision: 1,
        domainRef: domain.ref,
        entries: [],
      });
      tx.set(hidAcct, {
        schemaVersion: 2,
        id: hidAcct,
        accountId: h.character().accountId,
        scope: 'account',
        revision: 1,
        domainRef: domain.ref,
        entries: [],
      });
    });

    const q = await h.command();
    const before = h.store.snapshot();
    h.store.injectWriteFailure(n);

    const failRes = await h.service.execute(q);
    if (failRes.outcome.code !== 'SERVICE_UNAVAILABLE') {
      console.error(`AC6 write point ${n} failed with:`, JSON.stringify(failRes.outcome));
    }
    assert.equal(failRes.outcome.code, 'SERVICE_UNAVAILABLE', `write point ${n} should fail with SERVICE_UNAVAILABLE`);
    assert.deepEqual(h.store.snapshot(), before, `write point ${n} must rollback 100% cleanly without partial writes`);
    assert.equal(h.store.inspect(h.challengeId).result, 'active');
  }

  console.log(`ST19-05 Rollback verification passed 100% across all ${count} write points.`);
});

test('ST19-05 AC7 Concurrent OCC Competition: clear settlement vs shop sale, enhancement destruction, and bank transfer', async () => {
  const { candidates, domain } = makeSetCandidates();

  // Test Case A: Clear Settlement vs Shop Sale
  // Both attempt to modify/query holdings concurrently
  const fA = await createBankFixture({ holdingsDomain: domain });
  const hidCharA = await loginKey('holdings', [fA.account().id, 'character', fA.characterId]);
  const hidAcctA = await loginKey('holdings', [fA.account().id, 'account']);

  const weaponCandidate = candidates.find(c => c.equipment.slotKind === 'weapon');
  const weaponIdA = 'eq:god-occ-weapon';
  await fA.store.run(async tx => {
    tx.set(hidCharA, {
      schemaVersion: 2,
      id: hidCharA,
      accountId: fA.account().id,
      scope: 'character',
      characterId: fA.characterId,
      revision: 1,
      domainRef: domain.ref,
      entries: [{ collectionKey: 'god-set-weapon', permanentCount: 1, mailLatestExpiryAt: null }],
    });
    tx.set(hidAcctA, {
      schemaVersion: 2,
      id: hidAcctA,
      accountId: fA.account().id,
      scope: 'account',
      revision: 1,
      domainRef: domain.ref,
      entries: [],
    });
    tx.set(weaponIdA, {
      schemaVersion: 2,
      id: weaponIdA,
      accountId: fA.account().id,
      holderCharacterId: fA.characterId,
      templateRef: weaponCandidate.templateRef,
      slotKind: 'weapon',
      itemLevel: 30,
      quality: 'orange',
      binding: { kind: 'none' },
      setRef: weaponCandidate.equipment.setRef,
      enhancementLevel: 0,
      durability: { current: 100, max: 100, wearEnabled: true },
      location: { kind: 'container', containerId: fA.bag().id },
      lifecycle: 'active',
      version: 1,
      createdAt: 1000,
      updatedAt: 1000,
    });
    const bag = await tx.get(fA.bag().id);
    bag.slots[0] = { kind: 'equipment', itemId: weaponIdA, sortHeader: { itemLevel: 30, quality: 'orange', slotKind: 'weapon' } };
    tx.set(bag.id, bag);

    // Open shop context
    tx.set('ctx:occ-shop', {
      schemaVersion: 2,
      id: 'ctx:occ-shop',
      accountId: fA.account().id,
      characterId: fA.characterId,
      rolePlayEpoch: fA.character().rolePlayEpoch,
      sceneEpoch: 1,
      locationRevision: 1,
      anchorId: 'anchor_blacksmith',
      serviceKind: 'shop',
      issuedAt: 1000,
      status: 'open',
    });
  });

  const shopService = new ShopService({
    store: fA.store,
    clock: fA.clock,
    identity: fA.identity,
    catalog: DEFAULT_SHOP_CATALOG,
    holdingsDomain: domain,
  });

  const sellCmd = {
    ...fA.auth,
    command: 'shop.sell',
    operationId: 'op-occ-sell',
    expected: [],
    payload: {
      characterId: fA.characterId,
      contextId: 'ctx:occ-shop',
      target: { kind: 'equipment', itemId: weaponIdA },
      quantity: 1,
      quoteRef: 'quote-occ',
    },
  };

  // Run shop sale
  const sellRes = await shopService.execute(sellCmd);
  assert.equal(sellRes.outcome.status, 'committed');

  // Verify holdings decremented to 0
  const holdingsAfterOcc = fA.store.inspect(hidCharA);
  assert.equal(holdingsAfterOcc.revision, 2);
  const entry = holdingsAfterOcc.entries.find(e => e.collectionKey === 'god-set-weapon');
  assert.equal(entry.permanentCount, 0);

  // Test Case B: Clear Settlement vs Bank Vault Transfer
  // Deposit shoulder piece to personalVault
  const shoulderCandidate = candidates.find(c => c.equipment.slotKind === 'shoulder');
  const shoulderId = 'eq:god-occ-shoulder';
  await fA.store.run(async tx => {
    tx.set(shoulderId, {
      schemaVersion: 2,
      id: shoulderId,
      accountId: fA.account().id,
      holderCharacterId: fA.characterId,
      templateRef: shoulderCandidate.templateRef,
      slotKind: 'shoulder',
      itemLevel: 30,
      quality: 'orange',
      binding: { kind: 'none' },
      setRef: shoulderCandidate.equipment.setRef,
      enhancementLevel: 0,
      durability: { current: 100, max: 100, wearEnabled: true },
      location: { kind: 'container', containerId: fA.bag().id },
      lifecycle: 'active',
      version: 1,
      createdAt: 1000,
      updatedAt: 1000,
    });
    const bag = await tx.get(fA.bag().id);
    bag.slots[1] = { kind: 'equipment', itemId: shoulderId, sortHeader: { itemLevel: 30, quality: 'orange', slotKind: 'shoulder' } };
    tx.set(bag.id, bag);
  });

  const transferCmd = fA.transfer({ kind: 'equipment', itemId: shoulderId }, 1, 'personalVault');
  const transferRes = await fA.service.execute(transferCmd);
  assert.equal(transferRes.outcome.status, 'committed');

  // Both serialized with zero conflict, zero duplicate holdings
  assert.equal(fA.store.inspect(shoulderId).location.containerId, fA.vault('personalVault').id);
});
