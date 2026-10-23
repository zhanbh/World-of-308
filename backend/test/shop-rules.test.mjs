import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SHOP_CATALOG,
} from '../src/shop/shop-model.ts';
import {
  validateBuyEligibility,
  validateSellEligibility,
  calculateSellPrice,
  calculateExchange,
  ShopRefusal,
} from '../src/shop/shop-rules.ts';

test('validateBuyEligibility verifies quote, quantity and wallet balance', () => {
  const offer = DEFAULT_SHOP_CATALOG.offers['offer_hp_potion_minor'];
  const wallet = {
    schemaVersion: 2,
    id: 'w1',
    accountId: 'a1',
    gold: '1000',
    points: '10',
    version: 0,
    createdAt: 1000,
    updatedAt: 1000,
  };

  // Success with gold
  const buy1 = validateBuyEligibility(offer, 5, 'quote_shop_v1', wallet, 'quote_shop_v1');
  assert.equal(buy1.cost, 250n);
  assert.equal(buy1.priceCurrency, 'gold');

  // Mismatched quoteRef rejects QUOTE_CHANGED
  assert.throws(
    () => validateBuyEligibility(offer, 1, 'quote_shop_v0', wallet, 'quote_shop_v1'),
    (err) => err instanceof ShopRefusal && err.code === 'QUOTE_CHANGED'
  );

  // Invalid quantity rejects INVALID_ARGUMENT
  assert.throws(
    () => validateBuyEligibility(offer, 0, 'quote_shop_v1', wallet, 'quote_shop_v1'),
    (err) => err instanceof ShopRefusal && err.code === 'INVALID_ARGUMENT'
  );
  assert.throws(
    () => validateBuyEligibility(offer, 25, 'quote_shop_v1', wallet, 'quote_shop_v1'),
    (err) => err instanceof ShopRefusal && err.code === 'INVALID_ARGUMENT'
  );
  assert.throws(
    () => validateBuyEligibility(offer, 2.5, 'quote_shop_v1', wallet, 'quote_shop_v1'),
    (err) => err instanceof ShopRefusal && err.code === 'INVALID_ARGUMENT'
  );

  // Insufficient balance rejects CURRENCY_NOT_ENOUGH
  const brokeWallet = { ...wallet, gold: '100' };
  assert.throws(
    () => validateBuyEligibility(offer, 5, 'quote_shop_v1', brokeWallet, 'quote_shop_v1'),
    (err) => err instanceof ShopRefusal && err.code === 'CURRENCY_NOT_ENOUGH'
  );

  // Points item purchase
  const pointsOffer = DEFAULT_SHOP_CATALOG.offers['offer_points_scroll'];
  const buyPoints = validateBuyEligibility(pointsOffer, 1, 'quote_shop_v1', wallet, 'quote_shop_v1');
  assert.equal(buyPoints.cost, 10n);
  assert.equal(buyPoints.priceCurrency, 'points');
});

test('validateSellEligibility blocks equipped, non-backpack and account-bound items', () => {
  const normalItem = {
    schemaVersion: 2,
    id: 'i1',
    accountId: 'a1',
    templateRef: { id: 'w1', version: 1 },
    slotKind: 'weapon',
    itemLevel: 10,
    quality: 'blue',
    binding: { kind: 'none' },
    lifecycle: 'active',
  };

  // In backpack -> success
  assert.doesNotThrow(() => validateSellEligibility(normalItem, false, 'backpack'));

  // Equipped -> LOCATION_NOT_ALLOWED
  assert.throws(
    () => validateSellEligibility(normalItem, true, 'backpack'),
    (err) => err instanceof ShopRefusal && err.code === 'LOCATION_NOT_ALLOWED'
  );

  // Non-backpack -> LOCATION_NOT_ALLOWED
  assert.throws(
    () => validateSellEligibility(normalItem, false, 'accountVault'),
    (err) => err instanceof ShopRefusal && err.code === 'LOCATION_NOT_ALLOWED'
  );

  // Account bound mall item -> BINDING_RESTRICTED
  const accountBoundItem = {
    ...normalItem,
    binding: { kind: 'account', accountId: 'a1' },
  };
  assert.throws(
    () => validateSellEligibility(accountBoundItem, false, 'backpack'),
    (err) => err instanceof ShopRefusal && err.code === 'BINDING_RESTRICTED'
  );
});

test('calculateSellPrice guarantees enhancement and affixes do not increase sell price', () => {
  const basePurpleItem = {
    schemaVersion: 2,
    id: 'p1',
    accountId: 'a1',
    templateRef: { id: 'sword_p', version: 1 },
    slotKind: 'weapon',
    itemLevel: 10,
    quality: 'purple',
    binding: { kind: 'character', characterId: 'c1' },
    enhancementLevel: 0,
    rolledAffixes: [],
    lifecycle: 'active',
  };

  const enhancedItemWithAffixes = {
    ...basePurpleItem,
    enhancementLevel: 12,
    rolledAffixes: [
      { stat: 'strength', value: 50 },
      { stat: 'attack', value: 100 },
    ],
  };

  const basePrice = calculateSellPrice(basePurpleItem, 1);
  const enhancedPrice = calculateSellPrice(enhancedItemWithAffixes, 1);

  // Price must be strictly equal
  assert.equal(basePrice, 300n);
  assert.equal(enhancedPrice, 300n);
  assert.equal(basePrice, enhancedPrice);

  // Stacks calculate based on quantity
  const stack = {
    kind: 'stack',
    stackId: 'stk1',
    templateRef: { id: 'pot1', version: 1 },
    quantity: 7,
    binding: { kind: 'none' },
    traceRef: 'tr1',
  };
  assert.equal(calculateSellPrice(stack, 7), 70n);
});

test('calculateExchange handles bidirectional 10000:1 conversion with net asset invariance', () => {
  const wallet = {
    schemaVersion: 2,
    id: 'w1',
    accountId: 'a1',
    gold: '50000',
    points: '5',
    version: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  // Gold -> Points: 20000 gold -> 2 points
  const res1 = calculateExchange('gold', 2, wallet);
  assert.equal(res1.nextGold, '30000');
  assert.equal(res1.nextPoints, '7');

  // Points -> Gold: 3 points -> 30000 gold
  const res2 = calculateExchange('points', 3, wallet);
  assert.equal(res2.nextGold, '80000');
  assert.equal(res2.nextPoints, '2');

  // Insufficient gold rejects CURRENCY_NOT_ENOUGH
  assert.throws(
    () => calculateExchange('gold', 6, wallet),
    (err) => err instanceof ShopRefusal && err.code === 'CURRENCY_NOT_ENOUGH'
  );

  // Insufficient points rejects CURRENCY_NOT_ENOUGH
  assert.throws(
    () => calculateExchange('points', 10, wallet),
    (err) => err instanceof ShopRefusal && err.code === 'CURRENCY_NOT_ENOUGH'
  );

  // Invalid units reject INVALID_ARGUMENT
  assert.throws(
    () => calculateExchange('gold', 0, wallet),
    (err) => err instanceof ShopRefusal && err.code === 'INVALID_ARGUMENT'
  );
  assert.throws(
    () => calculateExchange('gold', -1, wallet),
    (err) => err instanceof ShopRefusal && err.code === 'INVALID_ARGUMENT'
  );
  assert.throws(
    () => calculateExchange('gold', 1.5, wallet),
    (err) => err instanceof ShopRefusal && err.code === 'INVALID_ARGUMENT'
  );
});
