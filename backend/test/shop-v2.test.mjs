import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/adapters/memory-store.ts';
import { createContextIdentityPort, loginKey } from '../src/identity/identity-v2.ts';
import { LoginService } from '../src/identity/login-service.ts';
import { CharacterService, characterKey } from '../src/character/character-service.ts';
import { ShopService } from '../src/shop/shop-service.ts';
import { DEFAULT_SHOP_CATALOG } from '../src/shop/shop-model.ts';

async function fixture() {
  const store = new MemoryStore();
  let currentTime = 1000;
  const clock = { now: () => currentTime, setNow: t => { currentTime = t; } };
  let subject = 'player-st06';

  const identity = createContextIdentityPort(
    { appId: 'app', environment: 'test', sources: ['minigame'] },
    () => ({ APPID: 'app', ENV: 'test', SOURCE: 'minigame', OPENID: subject }),
  );

  const login = new LoginService({
    store,
    clock,
    identity,
    ticketTtlMs: 60000,
    initialUnlocks: { first: ['normal'] },
    holdingsDomainRef: 'test-domain',
  });
  const prep = await login.execute({
    protocolVersion: 2,
    command: 'session.prepare',
    payload: { launchId: 'launch', prepareOperationId: 'prepare' },
  });
  const opened = await login.execute({
    protocolVersion: 2,
    command: 'session.commit',
    payload: { launchId: 'launch', ticketId: prep.outcome.data.ticketId, openOperationId: 'open' },
  });
  assert.equal(opened.outcome.status, 'committed');
  const session = opened.outcome.data;

  const characters = new CharacterService({
    store,
    clock,
    initialProgressionRef: { id: 'progression-warrior-v1', version: 1 },
    initialWeaponTemplateRef: { id: 'sword-starter', version: 1 },
  });
  const envelope = { protocolVersion: 2, sessionId: session.sessionId, sessionEpoch: session.sessionEpoch };
  const created = await characters.execute({
    ...envelope,
    command: 'character.create',
    operationId: 'create',
    expected: [],
    payload: { classId: 'warrior', characterName: '战六' },
  });
  assert.equal(created.outcome.status, 'committed');
  const characterId = created.outcome.data.characterId;
  const selected = await characters.execute({
    ...envelope,
    command: 'character.select',
    operationId: 'select',
    expected: [],
    payload: { characterId },
  });
  assert.equal(selected.outcome.status, 'committed');

  const character = store.inspect(characterId);
  const accountId = character.accountId;

  // Set initial wallet funds: 100,000 gold and 50 points
  const account = store.inspect(accountId);
  await store.run(async tx => {
    const w = await tx.get(account.walletId);
    w.gold = '100000';
    w.points = '50';
    w.version = 1;
    tx.set(w.id, w);

    // Create an open NPC shop context
    const contextId = 'ctx_shop_test_1';
    tx.set(contextId, {
      schemaVersion: 2,
      id: contextId,
      accountId,
      characterId,
      rolePlayEpoch: character.rolePlayEpoch,
      sceneEpoch: 1,
      locationRevision: 1,
      anchorId: 'anchor_blacksmith',
      serviceKind: 'shop',
      issuedAt: 1000,
      status: 'open',
    });
  });

  const shop = new ShopService({
    store,
    clock,
    identity,
  });

  return {
    store,
    clock,
    identity,
    shop,
    characterId,
    accountId,
    envelope,
    contextId: 'ctx_shop_test_1',
    walletId: account.walletId,
    backpackId: character.backpackId,
  };
}

test('shop.buy purchases potions and white equipment, deducting currency and updating bag', async () => {
  const f = await fixture();

  // Buy 5 minor HP potions (5 * 50 = 250 gold)
  const buyPotions = await f.shop.execute({
    ...f.envelope,
    command: 'shop.buy',
    operationId: 'op_buy_potions',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      offerId: 'offer_hp_potion_minor',
      quantity: 5,
      quoteRef: 'quote_shop_v1',
    },
  });

  assert.equal(buyPotions.outcome.status, 'committed');
  assert.equal(buyPotions.outcome.data.deliveredQuantity, 5);

  const walletAfter1 = f.store.inspect(f.walletId);
  assert.equal(walletAfter1.gold, '99750'); // 100000 - 250

  const bagAfter1 = f.store.inspect(f.backpackId);
  const potionSlot = Object.values(bagAfter1.slots).find(
    s => s.kind === 'stack' && s.templateRef.id === 'potion_hp_minor'
  );
  assert.ok(potionSlot);
  assert.equal(potionSlot.quantity, 5);

  // Buy 1 starter sword (100 gold)
  const buySword = await f.shop.execute({
    ...f.envelope,
    command: 'shop.buy',
    operationId: 'op_buy_sword',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      offerId: 'offer_starter_sword',
      quantity: 1,
      quoteRef: 'quote_shop_v1',
    },
  });

  assert.equal(buySword.outcome.status, 'committed');
  const walletAfter2 = f.store.inspect(f.walletId);
  assert.equal(walletAfter2.gold, '99650'); // 99750 - 100

  const bagAfter2 = f.store.inspect(f.backpackId);
  const swordSlot = Object.values(bagAfter2.slots).find(
    s => s.kind === 'equipment' && s.sortHeader.slotKind === 'weapon'
  );
  assert.ok(swordSlot);
  const swordItem = f.store.inspect(swordSlot.itemId);
  assert.equal(swordItem.lifecycle, 'active');
  assert.equal(swordItem.quality, 'white');
  assert.equal(swordItem.binding.kind, 'none');

  // Buy point scroll with points (10 points, becomes account bound)
  const buyScroll = await f.shop.execute({
    ...f.envelope,
    command: 'shop.buy',
    operationId: 'op_buy_scroll',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      offerId: 'offer_points_scroll',
      quantity: 1,
      quoteRef: 'quote_shop_v1',
    },
  });

  assert.equal(buyScroll.outcome.status, 'committed');
  const walletAfter3 = f.store.inspect(f.walletId);
  assert.equal(walletAfter3.points, '40'); // 50 - 10

  const bagAfter3 = f.store.inspect(f.backpackId);
  const scrollSlot = Object.values(bagAfter3.slots).find(
    s => s.kind === 'stack' && s.templateRef.id === 'scroll_exp_boost'
  );
  assert.ok(scrollSlot);
  assert.equal(scrollSlot.binding.kind, 'account');
  assert.equal(scrollSlot.binding.accountId, f.accountId);
});

test('shop.buy rejects BAG_FULL when bag has no slots for equipment, with zero currency deducted', async () => {
  const f = await fixture();

  // Fill bag to 20/20 slots
  await f.store.run(async tx => {
    const bag = await tx.get(f.backpackId);
    for (let i = 0; i < 20; i++) {
      bag.slots[i] = {
        kind: 'stack',
        stackId: `fill_stk_${i}`,
        templateRef: { id: `dummy_${i}`, version: 1 },
        quantity: 1,
        binding: { kind: 'none' },
        traceRef: 'fill',
      };
    }
    tx.set(bag.id, bag);
  });

  const walletBefore = f.store.inspect(f.walletId);

  // Attempt to buy equipment into full bag
  const buyFail = await f.shop.execute({
    ...f.envelope,
    command: 'shop.buy',
    operationId: 'op_buy_full_fail',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      offerId: 'offer_starter_sword',
      quantity: 1,
      quoteRef: 'quote_shop_v1',
    },
  });

  assert.equal(buyFail.outcome.status, 'rejected');
  assert.equal(buyFail.outcome.code, 'BAG_FULL');

  // Verify wallet balance is unchanged
  const walletAfter = f.store.inspect(f.walletId);
  assert.equal(walletAfter.gold, walletBefore.gold);
  assert.equal(walletAfter.points, walletBefore.points);
});

test('shop.buy rejects QUOTE_CHANGED and CURRENCY_NOT_ENOUGH', async () => {
  const f = await fixture();

  // Mismatched quoteRef rejects QUOTE_CHANGED
  const buyQuoteFail = await f.shop.execute({
    ...f.envelope,
    command: 'shop.buy',
    operationId: 'op_quote_fail',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      offerId: 'offer_starter_sword',
      quantity: 1,
      quoteRef: 'quote_stale_v0',
    },
  });
  assert.equal(buyQuoteFail.outcome.status, 'rejected');
  assert.equal(buyQuoteFail.outcome.code, 'QUOTE_CHANGED');

  // Set wallet to 0 gold
  await f.store.run(async tx => {
    const w = await tx.get(f.walletId);
    w.gold = '0';
    tx.set(w.id, w);
  });

  // Insufficient currency rejects CURRENCY_NOT_ENOUGH
  const buyFundsFail = await f.shop.execute({
    ...f.envelope,
    command: 'shop.buy',
    operationId: 'op_funds_fail',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      offerId: 'offer_starter_sword',
      quantity: 1,
      quoteRef: 'quote_shop_v1',
    },
  });
  assert.equal(buyFundsFail.outcome.status, 'rejected');
  assert.equal(buyFundsFail.outcome.code, 'CURRENCY_NOT_ENOUGH');
});

test('shop.sell sells equipment and stacks from backpack, crediting gold and removing items', async () => {
  const f = await fixture();

  // Put a level 10 purple weapon into backpack
  const purpleItemId = 'item_purple_10';
  await f.store.run(async tx => {
    const item = {
      schemaVersion: 2,
      id: purpleItemId,
      accountId: f.accountId,
      holderCharacterId: f.characterId,
      sourceKey: 'test',
      sourceOrdinal: 1,
      sourceLocator: { kind: 'grant', grantId: 'g1' },
      templateRef: { id: 'sword_epic', version: 1 },
      slotKind: 'weapon',
      itemLevel: 10,
      quality: 'purple',
      rolledAffixes: [{ stat: 'attack', value: 100 }],
      setRef: null,
      binding: { kind: 'character', characterId: f.characterId },
      enhancementLevel: 10, // +10 enhancement
      durability: { wearEnabled: true, current: 100, max: 100, policyRef: 'std' },
      location: { kind: 'container', containerId: f.backpackId },
      lifecycle: 'active',
      version: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    tx.set(purpleItemId, item);

    const bag = await tx.get(f.backpackId);
    bag.slots[0] = {
      kind: 'equipment',
      itemId: purpleItemId,
      sortHeader: { itemLevel: 10, quality: 'purple', slotKind: 'weapon' },
    };
    bag.slots[1] = {
      kind: 'stack',
      stackId: 'stk_pots',
      templateRef: { id: 'potion_hp_minor', version: 1 },
      quantity: 10,
      binding: { kind: 'none' },
      traceRef: 'tr1',
    };
    tx.set(bag.id, bag);
  });

  const walletBefore = f.store.inspect(f.walletId);
  const goldBefore = BigInt(walletBefore.gold);

  // Sell the +10 purple weapon (300 gold: 10 base * 10 level * 3.0 purple, +10 enhancement does NOT increase price)
  const sellEquip = await f.shop.execute({
    ...f.envelope,
    command: 'shop.sell',
    operationId: 'op_sell_equip',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      target: { kind: 'equipment', itemId: purpleItemId },
      quantity: 1,
      quoteRef: 'quote_shop_v1',
    },
  });

  assert.equal(sellEquip.outcome.status, 'committed');
  assert.equal(sellEquip.outcome.data.soldQuantity, 1);

  const walletAfter1 = f.store.inspect(f.walletId);
  assert.equal(BigInt(walletAfter1.gold), goldBefore + 300n);

  const bagAfter1 = f.store.inspect(f.backpackId);
  assert.equal(bagAfter1.slots[0], undefined); // Slot cleared

  const itemAfter = f.store.inspect(purpleItemId);
  assert.equal(itemAfter.lifecycle, 'sold');

  // Sell 4 potions from the 10-stack (4 * 10 = 40 gold)
  const sellStack = await f.shop.execute({
    ...f.envelope,
    command: 'shop.sell',
    operationId: 'op_sell_stack',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      target: { kind: 'stack', stackId: 'stk_pots' },
      quantity: 4,
      quoteRef: 'quote_shop_v1',
    },
  });

  assert.equal(sellStack.outcome.status, 'committed');
  assert.equal(sellStack.outcome.data.soldQuantity, 4);

  const walletAfter2 = f.store.inspect(f.walletId);
  assert.equal(BigInt(walletAfter2.gold), goldBefore + 300n + 40n);

  const bagAfter2 = f.store.inspect(f.backpackId);
  assert.equal(bagAfter2.slots[1].quantity, 6); // 10 - 4 = 6
});

test('shop.sell rejects equipped items and account-bound items', async () => {
  const f = await fixture();

  // 1. Equipped item cannot be sold
  const wornItemId = 'item_worn_sword';
  await f.store.run(async tx => {
    tx.set(wornItemId, {
      schemaVersion: 2,
      id: wornItemId,
      accountId: f.accountId,
      holderCharacterId: f.characterId,
      sourceKey: 'test',
      sourceOrdinal: 1,
      sourceLocator: { kind: 'grant', grantId: 'g1' },
      templateRef: { id: 'sword', version: 1 },
      slotKind: 'weapon',
      itemLevel: 1,
      quality: 'white',
      rolledAffixes: [],
      setRef: null,
      binding: { kind: 'character', characterId: f.characterId },
      enhancementLevel: 0,
      durability: { wearEnabled: true, current: 100, max: 100, policyRef: 'std' },
      location: { kind: 'equipped', characterId: f.characterId, slotId: 'weapon' },
      lifecycle: 'active',
      version: 1,
      createdAt: 1000,
      updatedAt: 1000,
    });
  });

  const sellWornFail = await f.shop.execute({
    ...f.envelope,
    command: 'shop.sell',
    operationId: 'op_sell_worn_fail',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      target: { kind: 'equipment', itemId: wornItemId },
      quantity: 1,
      quoteRef: 'quote_shop_v1',
    },
  });
  assert.equal(sellWornFail.outcome.status, 'rejected');
  assert.equal(sellWornFail.outcome.code, 'LOCATION_NOT_ALLOWED');

  // 2. Account-bound item cannot be sold
  const accountBoundId = 'item_account_bound';
  await f.store.run(async tx => {
    tx.set(accountBoundId, {
      schemaVersion: 2,
      id: accountBoundId,
      accountId: f.accountId,
      holderCharacterId: f.characterId,
      sourceKey: 'mall',
      sourceOrdinal: 1,
      sourceLocator: { kind: 'grant', grantId: 'mall_g1' },
      templateRef: { id: 'scroll', version: 1 },
      slotKind: 'weapon',
      itemLevel: 1,
      quality: 'purple',
      rolledAffixes: [],
      setRef: null,
      binding: { kind: 'account', accountId: f.accountId },
      enhancementLevel: 0,
      durability: { wearEnabled: true, current: 100, max: 100, policyRef: 'std' },
      location: { kind: 'container', containerId: f.backpackId },
      lifecycle: 'active',
      version: 1,
      createdAt: 1000,
      updatedAt: 1000,
    });
    const bag = await tx.get(f.backpackId);
    bag.slots[0] = {
      kind: 'equipment',
      itemId: accountBoundId,
      sortHeader: { itemLevel: 1, quality: 'purple', slotKind: 'weapon' },
    };
    tx.set(bag.id, bag);
  });

  const sellBoundFail = await f.shop.execute({
    ...f.envelope,
    command: 'shop.sell',
    operationId: 'op_sell_bound_fail',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      target: { kind: 'equipment', itemId: accountBoundId },
      quantity: 1,
      quoteRef: 'quote_shop_v1',
    },
  });
  assert.equal(sellBoundFail.outcome.status, 'rejected');
  assert.equal(sellBoundFail.outcome.code, 'BINDING_RESTRICTED');
});

test('wallet.exchange exchanges gold to points and points to gold with net asset invariance', async () => {
  const f = await fixture();

  // Exchange 30000 gold -> 3 points
  const exGold = await f.shop.execute({
    ...f.envelope,
    command: 'wallet.exchange',
    operationId: 'op_exchange_gold',
    expected: [],
    payload: {
      characterId: f.characterId,
      fromCurrency: 'gold',
      exchangeUnits: 3,
      quoteRef: 'quote_shop_v1',
    },
  });

  assert.equal(exGold.outcome.status, 'committed');
  assert.equal(exGold.outcome.data.fromCurrency, 'gold');
  assert.equal(exGold.outcome.data.exchangeUnits, 3);

  const wallet1 = f.store.inspect(f.walletId);
  assert.equal(wallet1.gold, '70000'); // 100000 - 30000
  assert.equal(wallet1.points, '53');  // 50 + 3

  // Exchange 5 points -> 50000 gold
  const exPoints = await f.shop.execute({
    ...f.envelope,
    command: 'wallet.exchange',
    operationId: 'op_exchange_points',
    expected: [],
    payload: {
      characterId: f.characterId,
      fromCurrency: 'points',
      exchangeUnits: 5,
      quoteRef: 'quote_shop_v1',
    },
  });

  assert.equal(exPoints.outcome.status, 'committed');
  assert.equal(exPoints.outcome.data.fromCurrency, 'points');
  assert.equal(exPoints.outcome.data.exchangeUnits, 5);

  const wallet2 = f.store.inspect(f.walletId);
  assert.equal(wallet2.gold, '120000'); // 70000 + 50000
  assert.equal(wallet2.points, '48');   // 53 - 5

  // Insufficient gold rejects CURRENCY_NOT_ENOUGH
  const exTooMuch = await f.shop.execute({
    ...f.envelope,
    command: 'wallet.exchange',
    operationId: 'op_exchange_toomuch',
    expected: [],
    payload: {
      characterId: f.characterId,
      fromCurrency: 'gold',
      exchangeUnits: 20, // 200,000 gold needed, only has 120,000
      quoteRef: 'quote_shop_v1',
    },
  });
  assert.equal(exTooMuch.outcome.status, 'rejected');
  assert.equal(exTooMuch.outcome.code, 'CURRENCY_NOT_ENOUGH');
});

test('idempotency and queries: replaying same operationId returns original result and operation.get works', async () => {
  const f = await fixture();

  const cmd = {
    ...f.envelope,
    command: 'shop.buy',
    operationId: 'op_replay_buy',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      offerId: 'offer_starter_sword',
      quantity: 1,
      quoteRef: 'quote_shop_v1',
    },
  };

  const firstRes = await f.shop.execute(cmd);
  assert.equal(firstRes.outcome.status, 'committed');
  assert.equal(firstRes.replayed, false);

  const secondRes = await f.shop.execute(cmd);
  assert.equal(secondRes.outcome.status, 'committed');
  assert.equal(secondRes.replayed, true);
  assert.equal(secondRes.outcome.data.deliveredQuantity, firstRes.outcome.data.deliveredQuantity);

  // Query operation.get
  const queryOp = await f.shop.query({
    protocolVersion: 2,
    query: 'operation.get',
    requestId: 'req_op_1',
    sessionId: f.envelope.sessionId,
    sessionEpoch: f.envelope.sessionEpoch,
    payload: { operationId: 'op_replay_buy' },
  });
  assert.equal(queryOp.data.status, 'found');
  assert.equal(queryOp.data.command, 'shop.buy');
  assert.equal(queryOp.data.result.outcome.status, 'committed');

  // Query account.get
  const queryAcc = await f.shop.query({
    protocolVersion: 2,
    query: 'account.get',
    requestId: 'req_acc_1',
    sessionId: f.envelope.sessionId,
    sessionEpoch: f.envelope.sessionEpoch,
    payload: {},
  });
  assert.equal(queryAcc.data.wallet.gold, '99900');
});
