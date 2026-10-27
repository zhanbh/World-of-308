import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POTION_CATALOG,
  POTION_COOLDOWN_TICKS,
  resolvePotionTemplate,
  resolvePotionRestore,
  consumePotionInventory,
  applyPotionInput
} from '../src/potion-kernel.ts';

test('POTION_CATALOG: contains all defined tiers and aliases', () => {
  assert.equal(resolvePotionTemplate('item:hp-potion-small-v1')?.amount, 150);
  assert.equal(resolvePotionTemplate('potion_hp_minor')?.amount, 150);
  assert.equal(resolvePotionTemplate('item:mp-potion-small-v1')?.amount, 40);
  assert.equal(resolvePotionTemplate('potion_mp_minor')?.amount, 40);

  assert.equal(resolvePotionTemplate('item:hp-potion-medium-v1')?.amount, 300);
  assert.equal(resolvePotionTemplate('item:mp-potion-medium-v1')?.amount, 70);

  assert.equal(resolvePotionTemplate('item:hp-potion-large-v1')?.amount, 550);
  assert.equal(resolvePotionTemplate('item:mp-potion-large-v1')?.amount, 110);

  assert.equal(resolvePotionTemplate('item:hp-potion-greater-v1')?.amount, 900);
  assert.equal(resolvePotionTemplate('item:mp-potion-greater-v1')?.amount, 160);

  assert.equal(resolvePotionTemplate('item:hp-potion-max-v1')?.restoreType, 'percent');
  assert.equal(resolvePotionTemplate('item:hp-potion-max-v1')?.amount, 30);
  assert.equal(resolvePotionTemplate('item:mp-potion-max-v1')?.restoreType, 'percent');
  assert.equal(resolvePotionTemplate('item:mp-potion-max-v1')?.amount, 30);

  assert.equal(resolvePotionTemplate('unknown_potion'), null);
});

test('resolvePotionRestore: fixed amounts and 30% max calculations', () => {
  const smallHp = resolvePotionTemplate('item:hp-potion-small-v1');
  assert.deepEqual(resolvePotionRestore(smallHp, '1000', '500'), { kind: 'hp', amount: 150n });

  const smallMp = resolvePotionTemplate('item:mp-potion-small-v1');
  assert.deepEqual(resolvePotionRestore(smallMp, '1000', '500'), { kind: 'mp', amount: 40n });

  const maxHp = resolvePotionTemplate('item:hp-potion-max-v1');
  assert.deepEqual(resolvePotionRestore(maxHp, '1000', '500'), { kind: 'hp', amount: 300n });
  assert.deepEqual(resolvePotionRestore(maxHp, '1055', '500'), { kind: 'hp', amount: 316n }); // 1055 * 30 / 100 = 316

  const maxMp = resolvePotionTemplate('item:mp-potion-max-v1');
  assert.deepEqual(resolvePotionRestore(maxMp, '1000', '500'), { kind: 'mp', amount: 150n });
});

test('consumePotionInventory: character -> account -> none binding priority', () => {
  const bag = {
    id: 'bag-1',
    slots: {
      0: { kind: 'stack', stackId: 's-none', templateRef: { id: 'item:hp-potion-small-v1', version: 1 }, quantity: 5, binding: { kind: 'none' }, traceRef: 't0' },
      1: { kind: 'stack', stackId: 's-acct', templateRef: { id: 'item:hp-potion-small-v1', version: 1 }, quantity: 5, binding: { kind: 'account', accountId: 'a1' }, traceRef: 't1' },
      2: { kind: 'stack', stackId: 's-char', templateRef: { id: 'item:hp-potion-small-v1', version: 1 }, quantity: 1, binding: { kind: 'character', characterId: 'c1' }, traceRef: 't2' }
    },
    version: 1,
    updatedAt: 100
  };

  // First consumption: character binding (slot 2)
  const res1 = consumePotionInventory(bag, 'item:hp-potion-small-v1');
  assert.equal(res1.consumed, true);
  assert.equal(res1.slotIndex, 2);
  assert.equal(res1.stackId, 's-char');
  assert.equal(bag.slots[2], undefined); // Exhausted stack is deleted

  // Second consumption: account binding (slot 1)
  const res2 = consumePotionInventory(bag, 'item:hp-potion-small-v1');
  assert.equal(res2.consumed, true);
  assert.equal(res2.slotIndex, 1);
  assert.equal(res2.stackId, 's-acct');
  assert.equal(bag.slots[1].quantity, 4);

  // Third consumption: same account binding (slot 1)
  const res3 = consumePotionInventory(bag, 'item:hp-potion-small-v1');
  assert.equal(res3.consumed, true);
  assert.equal(res3.slotIndex, 1);
  assert.equal(bag.slots[1].quantity, 3);
});

test('consumePotionInventory: slot order tie-breaker within same binding', () => {
  const bag = {
    id: 'bag-1',
    slots: {
      5: { kind: 'stack', stackId: 's-5', templateRef: { id: 'item:mp-potion-small-v1', version: 1 }, quantity: 3, binding: { kind: 'character' }, traceRef: 't5' },
      2: { kind: 'stack', stackId: 's-2', templateRef: { id: 'item:mp-potion-small-v1', version: 1 }, quantity: 3, binding: { kind: 'character' }, traceRef: 't2' }
    },
    version: 1,
    updatedAt: 100
  };

  // Slot 2 should be consumed before slot 5
  const res = consumePotionInventory(bag, 'item:mp-potion-small-v1');
  assert.equal(res.consumed, true);
  assert.equal(res.slotIndex, 2);
  assert.equal(bag.slots[2].quantity, 2);
});

test('applyPotionInput: successful HP potion use, CD start, and HP recovery', () => {
  const quickSlots = ['item:hp-potion-small-v1', null, null];
  const bag = {
    id: 'bag-1',
    slots: {
      0: { kind: 'stack', stackId: 's-hp', templateRef: { id: 'item:hp-potion-small-v1', version: 1 }, quantity: 2, binding: { kind: 'character' }, traceRef: 't0' }
    },
    version: 1,
    updatedAt: 100
  };
  const cooldowns = [
    { kind: 'cooldown', actorId: 'c1', cooldownId: 'hpPotion', readyAtTick: 0 },
    { kind: 'cooldown', actorId: 'c1', cooldownId: 'mpPotion', readyAtTick: 0 }
  ];
  const state = {
    quickSlots,
    bag,
    player: { hp: '300', maxHp: '1000', mp: '100', maxMp: '200', lifeState: 'alive' },
    cooldowns,
    hpRegenRemainder: { numerator: 5, denominator: 10 },
    mpRegenRemainder: { numerator: 0, denominator: 1 }
  };
  const context = { challengeId: 'chal-1', sceneEpoch: 1, actorId: 'c1' };

  const input = { seq: 10, tick: 50, kind: 'item', templateId: 'item:hp-potion-small-v1', quickSlotIndex: 0 };
  const res = applyPotionInput(input, state, context);

  assert.equal(res.outcome, 'accepted');
  assert.equal(res.consumed, true);
  assert.equal(state.player.hp, '450'); // 300 + 150
  assert.equal(bag.slots[0].quantity, 1);
  assert.equal(cooldowns.find(c => c.cooldownId === 'hpPotion').readyAtTick, 50 + POTION_COOLDOWN_TICKS);
  assert.equal(cooldowns.find(c => c.cooldownId === 'mpPotion').readyAtTick, 0); // mpPotion CD untouched
  assert.equal(res.event.kind, 'actionAccepted');
  assert.equal(res.event.seq, 10);
});

test('applyPotionInput: HP full rejection does NOT consume item or start CD', () => {
  const quickSlots = ['item:hp-potion-small-v1', null, null];
  const bag = {
    id: 'bag-1',
    slots: {
      0: { kind: 'stack', stackId: 's-hp', templateRef: { id: 'item:hp-potion-small-v1', version: 1 }, quantity: 5, binding: { kind: 'character' }, traceRef: 't0' }
    },
    version: 1,
    updatedAt: 100
  };
  const cooldowns = [
    { kind: 'cooldown', actorId: 'c1', cooldownId: 'hpPotion', readyAtTick: 0 }
  ];
  const state = {
    quickSlots,
    bag,
    player: { hp: '1000', maxHp: '1000', mp: '100', maxMp: '200', lifeState: 'alive' },
    cooldowns
  };
  const context = { challengeId: 'chal-1', sceneEpoch: 1, actorId: 'c1' };

  const input = { seq: 11, tick: 50, kind: 'item', templateId: 'item:hp-potion-small-v1', quickSlotIndex: 0 };
  const res = applyPotionInput(input, state, context);

  assert.equal(res.outcome, 'rejected');
  assert.equal(res.code, 'HP_FULL');
  assert.equal(res.consumed, false);
  assert.equal(bag.slots[0].quantity, 5); // Unchanged
  assert.equal(cooldowns[0].readyAtTick, 0); // Unchanged
  assert.equal(res.event.kind, 'actionRejected');
  assert.equal(res.event.code, 'HP_FULL');
});

test('applyPotionInput: MP full rejection does NOT consume item or start CD', () => {
  const quickSlots = [null, 'item:mp-potion-small-v1', null];
  const bag = {
    id: 'bag-1',
    slots: {
      0: { kind: 'stack', stackId: 's-mp', templateRef: { id: 'item:mp-potion-small-v1', version: 1 }, quantity: 5, binding: { kind: 'character' }, traceRef: 't0' }
    },
    version: 1,
    updatedAt: 100
  };
  const cooldowns = [
    { kind: 'cooldown', actorId: 'c1', cooldownId: 'mpPotion', readyAtTick: 0 }
  ];
  const state = {
    quickSlots,
    bag,
    player: { hp: '500', maxHp: '1000', mp: '200', maxMp: '200', lifeState: 'alive' },
    cooldowns
  };
  const context = { challengeId: 'chal-1', sceneEpoch: 1, actorId: 'c1' };

  const input = { seq: 12, tick: 50, kind: 'item', templateId: 'item:mp-potion-small-v1', quickSlotIndex: 1 };
  const res = applyPotionInput(input, state, context);

  assert.equal(res.outcome, 'rejected');
  assert.equal(res.code, 'MP_FULL');
  assert.equal(res.consumed, false);
  assert.equal(bag.slots[0].quantity, 5);
  assert.equal(cooldowns[0].readyAtTick, 0);
});

test('applyPotionInput: cooldown rejection within 10s', () => {
  const quickSlots = ['item:hp-potion-small-v1', null, null];
  const bag = {
    id: 'bag-1',
    slots: {
      0: { kind: 'stack', stackId: 's-hp', templateRef: { id: 'item:hp-potion-small-v1', version: 1 }, quantity: 5, binding: { kind: 'character' }, traceRef: 't0' }
    },
    version: 1,
    updatedAt: 100
  };
  const cooldowns = [
    { kind: 'cooldown', actorId: 'c1', cooldownId: 'hpPotion', readyAtTick: 1050 }
  ];
  const state = {
    quickSlots,
    bag,
    player: { hp: '500', maxHp: '1000', mp: '100', maxMp: '200', lifeState: 'alive' },
    cooldowns
  };
  const context = { challengeId: 'chal-1', sceneEpoch: 1, actorId: 'c1' };

  const input = { seq: 13, tick: 200, kind: 'item', templateId: 'item:hp-potion-small-v1', quickSlotIndex: 0 };
  const res = applyPotionInput(input, state, context);

  assert.equal(res.outcome, 'rejected');
  assert.equal(res.code, 'COOLDOWN_ACTIVE');
  assert.equal(res.consumed, false);
  assert.equal(bag.slots[0].quantity, 5);
});

test('applyPotionInput: HP and MP cooldowns are completely independent', () => {
  const quickSlots = ['item:hp-potion-small-v1', 'item:mp-potion-small-v1', null];
  const bag = {
    id: 'bag-1',
    slots: {
      0: { kind: 'stack', stackId: 's-hp', templateRef: { id: 'item:hp-potion-small-v1', version: 1 }, quantity: 5, binding: { kind: 'character' }, traceRef: 't0' },
      1: { kind: 'stack', stackId: 's-mp', templateRef: { id: 'item:mp-potion-small-v1', version: 1 }, quantity: 5, binding: { kind: 'character' }, traceRef: 't1' }
    },
    version: 1,
    updatedAt: 100
  };
  const cooldowns = [
    { kind: 'cooldown', actorId: 'c1', cooldownId: 'hpPotion', readyAtTick: 0 },
    { kind: 'cooldown', actorId: 'c1', cooldownId: 'mpPotion', readyAtTick: 0 }
  ];
  const state = {
    quickSlots,
    bag,
    player: { hp: '500', maxHp: '1000', mp: '50', maxMp: '200', lifeState: 'alive' },
    cooldowns
  };
  const context = { challengeId: 'chal-1', sceneEpoch: 1, actorId: 'c1' };

  // 1. Consume HP potion at tick 10
  const resHp = applyPotionInput(
    { seq: 1, tick: 10, kind: 'item', templateId: 'item:hp-potion-small-v1', quickSlotIndex: 0 },
    state,
    context
  );
  assert.equal(resHp.outcome, 'accepted');
  assert.equal(cooldowns.find(c => c.cooldownId === 'hpPotion').readyAtTick, 1010);
  assert.equal(cooldowns.find(c => c.cooldownId === 'mpPotion').readyAtTick, 0);

  // 2. Consume MP potion at same tick 10 (should SUCCEED because mpPotion CD is independent!)
  const resMp = applyPotionInput(
    { seq: 2, tick: 10, kind: 'item', templateId: 'item:mp-potion-small-v1', quickSlotIndex: 1 },
    state,
    context
  );
  assert.equal(resMp.outcome, 'accepted');
  assert.equal(cooldowns.find(c => c.cooldownId === 'mpPotion').readyAtTick, 1010);
});

test('applyPotionInput: quickslot template mismatch and slot empty rejections', () => {
  const quickSlots = ['item:hp-potion-small-v1', null, null];
  const state = {
    quickSlots,
    bag: { id: 'b', slots: {}, version: 1, updatedAt: 0 },
    player: { hp: '500', maxHp: '1000', mp: '100', maxMp: '200', lifeState: 'alive' },
    cooldowns: []
  };
  const context = { challengeId: 'chal-1', sceneEpoch: 1, actorId: 'c1' };

  // Mismatch at slot 0
  const r1 = applyPotionInput(
    { seq: 1, tick: 10, kind: 'item', templateId: 'item:mp-potion-small-v1', quickSlotIndex: 0 },
    state,
    context
  );
  assert.equal(r1.outcome, 'rejected');
  assert.equal(r1.code, 'TEMPLATE_MISMATCH');

  // Slot 1 is empty (null)
  const r2 = applyPotionInput(
    { seq: 2, tick: 10, kind: 'item', templateId: 'item:mp-potion-small-v1', quickSlotIndex: 1 },
    state,
    context
  );
  assert.equal(r2.outcome, 'rejected');
  assert.equal(r2.code, 'SLOT_EMPTY');
});

test('applyPotionInput: out of stock rejection when bag has 0 items', () => {
  const quickSlots = ['item:hp-potion-small-v1', null, null];
  const state = {
    quickSlots,
    bag: { id: 'b', slots: {}, version: 1, updatedAt: 0 },
    player: { hp: '500', maxHp: '1000', mp: '100', maxMp: '200', lifeState: 'alive' },
    cooldowns: [{ kind: 'cooldown', actorId: 'c1', cooldownId: 'hpPotion', readyAtTick: 0 }]
  };
  const context = { challengeId: 'chal-1', sceneEpoch: 1, actorId: 'c1' };

  const r = applyPotionInput(
    { seq: 1, tick: 10, kind: 'item', templateId: 'item:hp-potion-small-v1', quickSlotIndex: 0 },
    state,
    context
  );
  assert.equal(r.outcome, 'rejected');
  assert.equal(r.code, 'OUT_OF_STOCK');
});

test('applyPotionInput: dead player rejection', () => {
  const quickSlots = ['item:hp-potion-small-v1', null, null];
  const state = {
    quickSlots,
    bag: {
      id: 'b',
      slots: { 0: { kind: 'stack', stackId: 's', templateRef: { id: 'item:hp-potion-small-v1', version: 1 }, quantity: 1, binding: { kind: 'character' } } },
      version: 1,
      updatedAt: 0
    },
    player: { hp: '0', maxHp: '1000', mp: '100', maxMp: '200', lifeState: 'dead' },
    cooldowns: [{ kind: 'cooldown', actorId: 'c1', cooldownId: 'hpPotion', readyAtTick: 0 }]
  };
  const context = { challengeId: 'chal-1', sceneEpoch: 1, actorId: 'c1' };

  const r = applyPotionInput(
    { seq: 1, tick: 10, kind: 'item', templateId: 'item:hp-potion-small-v1', quickSlotIndex: 0 },
    state,
    context
  );
  assert.equal(r.outcome, 'rejected');
  assert.equal(r.code, 'PLAYER_DEAD');
});

test('applyPotionInput: capping and remainder reset on hitting max HP', () => {
  const quickSlots = ['item:hp-potion-small-v1', null, null];
  const state = {
    quickSlots,
    bag: {
      id: 'b',
      slots: { 0: { kind: 'stack', stackId: 's', templateRef: { id: 'item:hp-potion-small-v1', version: 1 }, quantity: 1, binding: { kind: 'character' } } },
      version: 1,
      updatedAt: 0
    },
    player: { hp: '950', maxHp: '1000', mp: '100', maxMp: '200', lifeState: 'alive' },
    cooldowns: [{ kind: 'cooldown', actorId: 'c1', cooldownId: 'hpPotion', readyAtTick: 0 }],
    hpRegenRemainder: { numerator: 7, denominator: 10 }
  };
  const context = { challengeId: 'chal-1', sceneEpoch: 1, actorId: 'c1' };

  const r = applyPotionInput(
    { seq: 1, tick: 10, kind: 'item', templateId: 'item:hp-potion-small-v1', quickSlotIndex: 0 },
    state,
    context
  );
  assert.equal(r.outcome, 'accepted');
  assert.equal(state.player.hp, '1000'); // Capped at maxHp (950 + 150 = 1100 -> 1000)
  assert.deepEqual(state.hpRegenRemainder, { numerator: 0, denominator: 1 }); // Remainder reset to zero
});
