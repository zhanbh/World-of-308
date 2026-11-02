import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CollectionCoordinator,
  SET_SLOT_DEFS,
} from '../../client/assets/scripts/net/CollectionCoordinator.ts';
import {
  isCandidateMissing,
} from '../src/challenge/drop-strategy.ts';
import { ShopService } from '../src/shop/shop-service.ts';
import { enhancementFixture } from './fixtures/enhancement-fixture.mjs';
import { createBankFixture } from './fixtures/bank-fixture.mjs';
import { loginKey } from '../src/identity/identity-v2.ts';
import { DEFAULT_SHOP_CATALOG } from '../src/shop/shop-model.ts';

const SET_SLOTS = [
  'weapon', 'shoulder', 'chest', 'pants', 'belt', 'boots',
  'bracelet', 'necklace', 'ring', 'subEquip', 'magicStone',
];

function makeSetCandidates() {
  const candidates = SET_SLOTS.map(slot => ({
    kind: 'equipment',
    templateRef: { id: `god-set-${slot}-tpl`, version: 1 },
    quantity: 1,
    quality: 'orange',
    itemLevel: 30,
    binding: { kind: 'character' },
    equipment: {
      slotKind: slot,
      affixes: [],
      setRef: { id: 'warrior-god-set', version: 1 },
      durability: { wearEnabled: true, current: 100, max: 100, policyRef: 'combat-decay' },
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

test('CollectionCoordinator: pure model tracks 11-slot progress, X/11 format, highlights, and full set completion', () => {
  const coordinator = new CollectionCoordinator();
  assert.equal(coordinator.state.status, 'closed');
  assert.equal(coordinator.state.collectedCount, 0);
  assert.equal(coordinator.state.progressText, '0/11');
  assert.equal(coordinator.state.isFullSet, false);

  // Open coordinator
  coordinator.open({
    sessionId: 'session-1',
    sessionEpoch: 1,
    characterId: 'char-1',
    setId: 'warrior-god-set',
  });
  assert.equal(coordinator.state.status, 'ready');

  const { domain } = makeSetCandidates();

  // Apply holdings with 3 pieces (weapon, shoulder, chest)
  const charSummary = {
    schemaVersion: 2,
    scope: 'character',
    characterId: 'char-1',
    revision: 1,
    domainRef: domain.ref,
    entries: [
      { collectionKey: 'god-set-weapon', permanentCount: 1, mailLatestExpiryAt: null },
      { collectionKey: 'god-set-shoulder', permanentCount: 1, mailLatestExpiryAt: null },
      { collectionKey: 'god-set-chest', permanentCount: 2, mailLatestExpiryAt: null },
    ],
  };

  coordinator.applyHoldings(charSummary, null, domain);
  const state1 = coordinator.state;
  assert.equal(state1.collectedCount, 3);
  assert.equal(state1.progressText, '3/11');
  assert.equal(state1.isFullSet, false);
  assert.equal(state1.slots.weapon.collected, true);
  assert.equal(state1.slots.weapon.count, 1);
  assert.equal(state1.slots.chest.collected, true);
  assert.equal(state1.slots.chest.count, 2);
  assert.equal(state1.slots.belt.collected, false);
  assert.equal(state1.slots.belt.count, 0);

  // Apply holdings with all 11 pieces
  const fullSummary = {
    schemaVersion: 2,
    scope: 'character',
    characterId: 'char-1',
    revision: 2,
    domainRef: domain.ref,
    entries: SET_SLOTS.map(s => ({
      collectionKey: `god-set-${s}`,
      permanentCount: 1,
      mailLatestExpiryAt: null,
    })),
  };

  coordinator.applyHoldings(fullSummary, null, domain);
  const state2 = coordinator.state;
  assert.equal(state2.collectedCount, 11);
  assert.equal(state2.progressText, '11/11');
  assert.equal(state2.isFullSet, true);
  assert.equal(state2.isNewCompletion, true);
  for (const slot of SET_SLOTS) {
    assert.equal(state2.slots[slot].collected, true, `slot ${slot} must be highlighted`);
  }
});

test('CollectionCoordinator: applyClearReceipt awards new set slot and triggers completion feedback', () => {
  const coordinator = new CollectionCoordinator();
  coordinator.open({
    sessionId: 'session-1',
    sessionEpoch: 1,
    characterId: 'char-1',
  });

  const { domain } = makeSetCandidates();

  // Initially owns 10 slots, missing 'belt'
  const owned10 = SET_SLOTS.filter(s => s !== 'belt');
  coordinator.applyHoldings({
    schemaVersion: 2,
    scope: 'character',
    characterId: 'char-1',
    revision: 1,
    domainRef: domain.ref,
    entries: owned10.map(s => ({ collectionKey: `god-set-${s}`, permanentCount: 1, mailLatestExpiryAt: null })),
  }, null, domain);

  assert.equal(coordinator.state.collectedCount, 10);
  assert.equal(coordinator.state.slots.belt.collected, false);

  // Simulate terminal clear receipt awarding the missing 'belt'
  const receipt = {
    sourceKey: 'clearSource:challenge-1',
    itemId: 'equipment:clear-1',
    grantId: null,
    route: 'direct',
    equipment: {
      itemId: 'equipment:clear-1',
      templateRef: { id: 'god-set-belt-tpl', version: 1 },
      slotKind: 'belt',
      itemLevel: 30,
      quality: 'orange',
    },
    gold: '100',
    xp: 50,
    kills: 1,
    elapsedMs: 2000,
    sceneState: 'looting',
    staminaRemaining: 10,
    configRef: 'terminal-v1',
  };

  coordinator.applyClearReceipt(receipt);

  const state = coordinator.state;
  assert.equal(state.latestAwardedSlot, 'belt');
  assert.equal(state.slots.belt.collected, true);
  assert.equal(state.collectedCount, 11);
  assert.equal(state.progressText, '11/11');
  assert.equal(state.isFullSet, true);
  assert.equal(state.isNewCompletion, true, 'awarding 11th piece triggers completion feedback');
});

test('CollectionCoordinator: generation isolation protects against late responses and closed UI', () => {
  const coordinator = new CollectionCoordinator();
  const g1 = coordinator.open({
    sessionId: 'session-1',
    sessionEpoch: 1,
    characterId: 'char-1',
  });
  assert.equal(g1, coordinator.currentGeneration);

  // Close coordinator
  coordinator.close();
  assert.equal(coordinator.state.status, 'closed');

  // Attempting to apply late response for g1 on closed coordinator is rejected
  const { domain } = makeSetCandidates();
  const applied = coordinator.applyHoldings({
    entries: [{ collectionKey: 'god-set-weapon', permanentCount: 1 }],
  }, null, domain, g1);
  assert.equal(applied, false);
  assert.equal(coordinator.state.status, 'closed');

  // Reopen in generation 2
  const g2 = coordinator.open({
    sessionId: 'session-2',
    sessionEpoch: 2,
    characterId: 'char-1',
  });
  assert.equal(g2, coordinator.currentGeneration);

  // Late response from g1 arriving during g2 is safely discarded
  const lateFromG1 = coordinator.applyHoldings({
    entries: [{ collectionKey: 'god-set-weapon', permanentCount: 1 }],
  }, null, domain, g1);
  assert.equal(lateFromG1, false, 'late response from old generation must be ignored');
  assert.equal(coordinator.state.collectedCount, 0, 'state is unchanged by stale generation');

  // Response for g2 succeeds
  const validForG2 = coordinator.applyHoldings({
    entries: [{ collectionKey: 'god-set-weapon', permanentCount: 1 }],
  }, null, domain, g2);
  assert.equal(validForG2, true);
  assert.equal(coordinator.state.collectedCount, 1);
});

test('ShopService equipment sale: selling last piece of a set item immediately decrements holdings and restores missing slot', async () => {
  const { candidates, domain } = makeSetCandidates();
  const setWeapon = candidates.find(c => c.equipment.slotKind === 'weapon');

  const f = await createBankFixture({ holdingsDomain: domain });
  const shopContextId = 'ctx_shop_test_sale';
  await f.store.run(async tx => {
    tx.set(shopContextId, {
      schemaVersion: 2,
      id: shopContextId,
      accountId: f.account().id,
      characterId: f.characterId,
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

  const weaponId = 'eq:god-set-weapon-sale-1';
  const hid = await loginKey('holdings', [f.account().id, 'character', f.characterId]);
  const holdingsEntity = {
    schemaVersion: 2,
    id: hid,
    accountId: f.account().id,
    scope: 'character',
    characterId: f.characterId,
    revision: 1,
    domainRef: domain.ref,
    entries: [
      { collectionKey: 'god-set-weapon', permanentCount: 1, mailLatestExpiryAt: null },
    ],
  };

  const weaponEntity = {
    schemaVersion: 2,
    id: weaponId,
    accountId: f.account().id,
    holderCharacterId: f.characterId,
    templateRef: setWeapon.templateRef,
    slotKind: 'weapon',
    itemLevel: 30,
    quality: 'orange',
    binding: { kind: 'none' },
    setRef: setWeapon.equipment.setRef,
    enhancementLevel: 0,
    durability: { current: 100, max: 100, wearEnabled: true },
    location: { kind: 'container', containerId: f.bag().id },
    lifecycle: 'active',
    version: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  await f.store.run(async tx => {
    tx.set(weaponId, weaponEntity);
    const bag = await tx.get(f.bag().id);
    bag.slots[0] = {
      kind: 'equipment',
      itemId: weaponId,
      sortHeader: { itemLevel: 30, quality: 'orange', slotKind: 'weapon' },
    };
    tx.set(bag.id, bag);
    tx.set(hid, holdingsEntity);
  });

  const contextBefore = {
    character: f.character(),
    summaries: [holdingsEntity, { scope: 'account', entries: [] }],
    holdingsDomain: domain,
    now: 1000,
  };

  // Initially: weapon is HELD (NOT missing)
  assert.equal(isCandidateMissing(setWeapon, contextBefore), false, 'weapon is held before sale');

  // Execute shop sale
  const sellCmd = {
    ...f.auth,
    command: 'shop.sell',
    operationId: 'op-sell-1',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: shopContextId,
      target: { kind: 'equipment', itemId: weaponId },
      quantity: 1,
      quoteRef: 'local-test',
    },
  };

  const res = await shopService.execute(sellCmd);
  assert.equal(res.outcome.status, 'committed');

  // Verify holdings was updated in store
  const updatedHoldings = f.store.inspect(hid);
  assert.equal(updatedHoldings.revision, 2, 'holdings revision incremented on sale');
  const weaponEntry = updatedHoldings.entries.find(e => e.collectionKey === 'god-set-weapon');
  assert.equal(weaponEntry.permanentCount, 0, 'permanentCount dropped to 0');

  // Check isCandidateMissing again with updated holdings
  const contextAfter = {
    character: f.character(),
    summaries: [updatedHoldings, { scope: 'account', entries: [] }],
    holdingsDomain: domain,
    now: 1000,
  };

  assert.equal(isCandidateMissing(setWeapon, contextAfter), true, 'weapon is now MISSING after sale');
});

test('EnhancementService destruction: destroying last piece of a set item restores missing slot', async () => {
  const { candidates, domain } = makeSetCandidates();
  const setWeapon = candidates.find(c => c.equipment.slotKind === 'weapon');

  const goldByItemLevel = {
    10: {
      weapon: Array.from({ length: 20 }, (_, i) => String(i < 10 ? (i + 1) * 10 : 100 * 2 ** (i - 9))),
      earring: Array.from({ length: 20 }, (_, i) => String(i < 10 ? (i + 1) * 8 : 80 * 2 ** (i - 9))),
    },
    30: {
      weapon: Array.from({ length: 20 }, (_, i) => String(i < 10 ? (i + 1) * 10 : 100 * 2 ** (i - 9))),
      earring: Array.from({ length: 20 }, (_, i) => String(i < 10 ? (i + 1) * 8 : 80 * 2 ** (i - 9))),
    },
  };

  // Enhancement fixture set to sample >= threshold to force destruction at +13
  const f = await enhancementFixture({
    sample: 999999,
    holdingsDomain: domain,
    config: { goldByItemLevel },
  });

  await f.fund('100000', '100');

  const hid = await loginKey('holdings', [f.character().accountId, 'character', f.character().id]);
  const holdings = {
    schemaVersion: 2,
    id: hid,
    accountId: f.character().accountId,
    scope: 'character',
    characterId: f.character().id,
    revision: 1,
    domainRef: domain.ref,
    entries: [
      { collectionKey: 'god-set-weapon', permanentCount: 1, mailLatestExpiryAt: null },
    ],
  };

  await f.store.run(async tx => {
    const weapon = await tx.get(f.weaponId);
    weapon.enhancementLevel = 12;
    weapon.itemLevel = 30;
    weapon.setRef = setWeapon.equipment.setRef;
    weapon.enhancementBonus = {
      configRef: f.config.ref,
      level: 12,
      attackPower: '234',
    };
    tx.set(f.weaponId, weapon);
    tx.set(hid, holdings);
  });

  const contextBefore = {
    character: f.character(),
    summaries: [holdings, { scope: 'account', entries: [] }],
    holdingsDomain: domain,
    now: f.clock.now(),
  };

  assert.equal(isCandidateMissing(setWeapon, contextBefore), false, 'weapon is held before destruction');

  // Quote +13 enhancement and execute
  const q = await f.quote(f.weaponId, 13);
  assert.ok(!q.error, JSON.stringify(q));

  const cmd = {
    ...f.auth,
    command: 'equipment.enhance',
    operationId: 'enhance-op-destroy-1',
    expected: q.data.targetVersions,
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      itemId: f.weaponId,
      targetLevel: 13,
      useMemento: false,
      quoteRef: q.data.quoteRef,
    },
  };

  const res = await f.service.execute(cmd);
  assert.equal(res.outcome.status, 'committed');
  assert.equal(res.outcome.data.result, 'destroyed');

  // Verify holdings entry was decremented
  const updatedHoldings = f.store.inspect(hid);
  const entry = updatedHoldings.entries.find(e => e.collectionKey === 'god-set-weapon');
  assert.equal(entry.permanentCount, 0, 'permanentCount reduced to 0 after destruction');

  const contextAfter = {
    character: f.character(),
    summaries: [updatedHoldings, { scope: 'account', entries: [] }],
    holdingsDomain: domain,
    now: f.clock.now(),
  };

  assert.equal(isCandidateMissing(setWeapon, contextAfter), true, 'weapon slot is restored to missing after destruction');
});

test('BankService cross-scope transfer: moving set item between character and account vault synchronizes holdings', async () => {
  const { candidates, domain } = makeSetCandidates();
  const setWeapon = candidates.find(c => c.equipment.slotKind === 'weapon');

  const f = await createBankFixture({ holdingsDomain: domain });

  const accountId = f.account().id;
  const charAId = f.characterId;
  const weaponId = 'test-set-weapon-bank';
  const weapon = {
    schemaVersion: 2,
    id: weaponId,
    accountId,
    holderCharacterId: charAId,
    templateRef: setWeapon.templateRef,
    slotKind: 'weapon',
    itemLevel: 30,
    quality: 'orange',
    binding: { kind: 'account', accountId }, // account bound so can enter account vault
    setRef: setWeapon.equipment.setRef,
    enhancementLevel: 0,
    durability: { current: 100, max: 100, wearEnabled: true },
    location: { kind: 'container', containerId: f.bag().id },
    lifecycle: 'active',
    version: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const chid = await loginKey('holdings', [accountId, 'character', charAId]);
  const ahid = await loginKey('holdings', [accountId, 'account']);

  await f.store.run(async tx => {
    tx.set(weaponId, weapon);
    const bag = await tx.get(f.bag().id);
    bag.slots[0] = { kind: 'equipment', itemId: weaponId, sortHeader: { itemLevel: 30, quality: 'orange', slotKind: 'weapon' } };
    tx.set(bag.id, bag);

    tx.set(chid, {
      schemaVersion: 2,
      id: chid,
      accountId,
      scope: 'character',
      characterId: charAId,
      revision: 1,
      domainRef: domain.ref,
      entries: [{ collectionKey: 'god-set-weapon', permanentCount: 1, mailLatestExpiryAt: null }],
    });

    tx.set(ahid, {
      schemaVersion: 2,
      id: ahid,
      accountId,
      scope: 'account',
      revision: 1,
      domainRef: domain.ref,
      entries: [],
    });
  });

  // Transfer weapon from backpack to account vault
  const cmdDeposit = f.transfer({ kind: 'equipment', itemId: weaponId }, 1, 'accountVault');
  const transferToVault = await f.service.execute(cmdDeposit);
  assert.equal(transferToVault.outcome.status, 'committed');

  // Verify holdings: Character count = 0, Account count = 1
  const chHoldingsAfterDeposit = f.store.inspect(chid);
  const acHoldingsAfterDeposit = f.store.inspect(ahid);

  assert.equal(chHoldingsAfterDeposit.entries.find(e => e.collectionKey === 'god-set-weapon').permanentCount, 0);
  assert.equal(acHoldingsAfterDeposit.entries.find(e => e.collectionKey === 'god-set-weapon').permanentCount, 1);

  // For Character A: still held via account vault
  const contextA = {
    character: f.character(),
    summaries: [chHoldingsAfterDeposit, acHoldingsAfterDeposit],
    holdingsDomain: domain,
    now: 1000,
  };
  assert.equal(isCandidateMissing(setWeapon, contextA), false, 'Character A still sees item held via account vault');

  // For Character B (same account, same class): also sees item held via shared account vault!
  const charB = { ...f.character(), id: 'char-b-warrior' };
  const contextB = {
    character: charB,
    summaries: [
      { schemaVersion: 2, scope: 'character', characterId: 'char-b-warrior', revision: 1, domainRef: domain.ref, entries: [] },
      acHoldingsAfterDeposit,
    ],
    holdingsDomain: domain,
    now: 1000,
  };
  assert.equal(isCandidateMissing(setWeapon, contextB), false, 'Character B sees item held via shared account vault');

  // Transfer weapon back from account vault to backpack
  const cmdWithdraw = f.transfer({ kind: 'equipment', itemId: weaponId }, 1, 'accountVault', true);
  const transferToBag = await f.service.execute(cmdWithdraw);
  assert.equal(transferToBag.outcome.status, 'committed');

  const chHoldingsAfterWithdraw = f.store.inspect(chid);
  const acHoldingsAfterWithdraw = f.store.inspect(ahid);

  assert.equal(chHoldingsAfterWithdraw.entries.find(e => e.collectionKey === 'god-set-weapon').permanentCount, 1);
  assert.equal(acHoldingsAfterWithdraw.entries.find(e => e.collectionKey === 'god-set-weapon').permanentCount, 0);

  // Character B now sees it as MISSING (private backpack of Character A is isolated from Character B)
  const contextBAfter = {
    character: charB,
    summaries: [
      { schemaVersion: 2, scope: 'character', characterId: 'char-b-warrior', revision: 1, domainRef: domain.ref, entries: [] },
      acHoldingsAfterWithdraw,
    ],
    holdingsDomain: domain,
    now: 1000,
  };
  assert.equal(isCandidateMissing(setWeapon, contextBAfter), true, 'Character B now sees item as missing');
});

