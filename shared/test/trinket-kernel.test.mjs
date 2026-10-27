import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRINKET_CATALOG,
  TRINKET_COOLDOWN_TICKS,
  TRINKET_BUFF_DURATION_TICKS,
  TRINKET_EQUIP_WAIT_TICKS,
  resolveTrinketTemplate,
  applyTrinketInput,
  aggregateTrinketModifiers,
  pruneExpiredBuffs,
  applyTrinketStats
} from '../src/trinket-kernel.ts';

test('TRINKET_CATALOG: contains defined templates and aliases', () => {
  const glory = resolveTrinketTemplate('item:trinket-warrior-glory-v1');
  assert.ok(glory);
  assert.equal(glory.tier, 30);
  assert.equal(glory.effects.attackPower, '150');
  assert.deepEqual(glory.effects.crit, { n: '1', d: '20' });
  assert.deepEqual(glory.effects.critMultiplier, { n: '1', d: '5' });
  assert.equal(glory.cooldownTicks, 12000);
  assert.equal(glory.durationTicks, 1500);
  assert.equal(glory.equipWaitTicks, 6000);

  const gloryAlias = resolveTrinketTemplate('trinket_glory');
  assert.deepEqual(gloryAlias, glory);

  const power = resolveTrinketTemplate('item:trinket-power-v1');
  assert.ok(power);
  assert.equal(power.effects.attackPower, '100');

  const haste = resolveTrinketTemplate('item:trinket-haste-v1');
  assert.ok(haste);
  assert.deepEqual(haste.effects.haste, { n: '1', d: '10' });

  assert.equal(resolveTrinketTemplate('unknown_trinket'), null);
});

test('applyTrinketInput: successful activation sets 120s CD and 15s buff', () => {
  const state = {
    player: { hp: '1000', maxHp: '1000', mp: '200', maxMp: '200', lifeState: 'alive' },
    equippedTrinket: {
      itemId: 'inst-trinket-1',
      templateRef: 'item:trinket-warrior-glory-v1',
      equippedAtTick: 0
    },
    cooldowns: [],
    buffs: []
  };
  const context = { challengeId: 'chal-1', sceneEpoch: 1, actorId: 'c1' };

  const input = {
    kind: 'trinket',
    itemId: 'inst-trinket-1',
    tick: 7000,
    seq: 1
  };

  const res = applyTrinketInput(input, state, context);
  assert.equal(res.outcome, 'accepted');
  assert.equal(res.activated, true);
  assert.equal(res.event.kind, 'actionAccepted');
  assert.equal(res.buff?.endsAtTick, 7000 + TRINKET_BUFF_DURATION_TICKS); // 8500
  assert.equal(state.buffs.length, 1);
  assert.equal(state.buffs[0].templateRef, 'item:trinket-warrior-glory-v1');
  assert.equal(state.buffs[0].endsAtTick, 8500);

  const cd = state.cooldowns.find(c => c.cooldownId === 'trinket');
  assert.ok(cd);
  assert.equal(cd.readyAtTick, 7000 + TRINKET_COOLDOWN_TICKS); // 19000
});

test('applyTrinketInput: item not equipped or id mismatch rejection', () => {
  const state = {
    player: { hp: '1000', maxHp: '1000', mp: '200', maxMp: '200', lifeState: 'alive' },
    equippedTrinket: null,
    cooldowns: [],
    buffs: []
  };
  const context = { challengeId: 'chal-1', sceneEpoch: 1, actorId: 'c1' };

  const r1 = applyTrinketInput(
    { kind: 'trinket', itemId: 'inst-1', tick: 100, seq: 1 },
    state,
    context
  );
  assert.equal(r1.outcome, 'rejected');
  assert.equal(r1.code, 'ITEM_NOT_EQUIPPED');

  state.equippedTrinket = { itemId: 'inst-different', templateRef: 'item:trinket-power-v1' };
  const r2 = applyTrinketInput(
    { kind: 'trinket', itemId: 'inst-1', tick: 100, seq: 2 },
    state,
    context
  );
  assert.equal(r2.outcome, 'rejected');
  assert.equal(r2.code, 'ITEM_NOT_EQUIPPED');
});

test('applyTrinketInput: equip waiting rejection (60s / 6000 ticks lock)', () => {
  const state = {
    player: { hp: '1000', maxHp: '1000', mp: '200', maxMp: '200', lifeState: 'alive' },
    equippedTrinket: {
      itemId: 'inst-1',
      templateRef: 'item:trinket-power-v1',
      equippedAtTick: 1000
    },
    equipWaitUntilTick: 7000, // 1000 + 6000
    cooldowns: [],
    buffs: []
  };
  const context = { challengeId: 'chal-1', sceneEpoch: 1, actorId: 'c1' };

  // Attempt at tick 5000 (< 7000)
  const r1 = applyTrinketInput(
    { kind: 'trinket', itemId: 'inst-1', tick: 5000, seq: 1 },
    state,
    context
  );
  assert.equal(r1.outcome, 'rejected');
  assert.equal(r1.code, 'EQUIP_WAITING');
  assert.equal(state.buffs.length, 0);

  // Attempt at tick 7000 (>= 7000) -> should succeed
  const r2 = applyTrinketInput(
    { kind: 'trinket', itemId: 'inst-1', tick: 7000, seq: 2 },
    state,
    context
  );
  assert.equal(r2.outcome, 'accepted');
  assert.equal(state.buffs.length, 1);
});

test('applyTrinketInput: cooldown active rejection (120s lock)', () => {
  const state = {
    player: { hp: '1000', maxHp: '1000', mp: '200', maxMp: '200', lifeState: 'alive' },
    equippedTrinket: {
      itemId: 'inst-1',
      templateRef: 'item:trinket-power-v1'
    },
    cooldowns: [
      { kind: 'cooldown', actorId: 'c1', cooldownId: 'trinket', readyAtTick: 15000 }
    ],
    buffs: []
  };
  const context = { challengeId: 'chal-1', sceneEpoch: 1, actorId: 'c1' };

  const res = applyTrinketInput(
    { kind: 'trinket', itemId: 'inst-1', tick: 14999, seq: 1 },
    state,
    context
  );
  assert.equal(res.outcome, 'rejected');
  assert.equal(res.code, 'COOLDOWN_ACTIVE');
  assert.equal(state.buffs.length, 0);
});

test('applyTrinketInput: dead player rejection', () => {
  const state = {
    player: { hp: '0', maxHp: '1000', mp: '0', maxMp: '200', lifeState: 'dead' },
    equippedTrinket: {
      itemId: 'inst-1',
      templateRef: 'item:trinket-power-v1'
    },
    cooldowns: [],
    buffs: []
  };
  const context = { challengeId: 'chal-1', sceneEpoch: 1, actorId: 'c1' };

  const res = applyTrinketInput(
    { kind: 'trinket', itemId: 'inst-1', tick: 100, seq: 1 },
    state,
    context
  );
  assert.equal(res.outcome, 'rejected');
  assert.equal(res.code, 'PLAYER_DEAD');
});

test('aggregateTrinketModifiers: aggregates active buffs and ignores expired ones', () => {
  const buffs = [
    { templateRef: 'item:trinket-warrior-glory-v1', endsAtTick: 2000 },
    { templateRef: 'item:trinket-power-v1', endsAtTick: 1000 } // expired at tick 1500
  ];

  // At tick 500, both are active: 150 + 100 AP = 250 AP
  const mods500 = aggregateTrinketModifiers(buffs, 500);
  assert.equal(mods500.attackPower, 250n);
  assert.deepEqual(mods500.crit, { n: '1', d: '20' });
  assert.deepEqual(mods500.critMultiplier, { n: '1', d: '5' });

  // At tick 1500, only glory is active (150 AP)
  const mods1500 = aggregateTrinketModifiers(buffs, 1500);
  assert.equal(mods1500.attackPower, 150n);

  // At tick 2500, both expired (0 AP)
  const mods2500 = aggregateTrinketModifiers(buffs, 2500);
  assert.equal(mods2500.attackPower, 0n);
  assert.deepEqual(mods2500.crit, { n: '0', d: '1' });
});

test('pruneExpiredBuffs: cleanly removes expired buffs', () => {
  const buffs = [
    { kind: 'buff', buffId: 'b1', actorId: 'c1', templateRef: 't1', endsAtTick: 1000 },
    { kind: 'buff', buffId: 'b2', actorId: 'c1', templateRef: 't2', endsAtTick: 2000 }
  ];

  const pruned = pruneExpiredBuffs(buffs, 1500);
  assert.equal(pruned.length, 1);
  assert.equal(pruned[0].buffId, 'b2');
});

test('applyTrinketStats: applies dynamic AP, crit, and haste capping', () => {
  const baseStats = {
    attackPower: '1000',
    haste: { n: '9', d: '5' }, // 1.8
    damageBonus: { n: '1', d: '10' },
    hit: { n: '1', d: '1' },
    crit: { n: '9', d: '10' }, // 0.9
    critMultiplier: { n: '3', d: '2' },
    x: 0,
    y: 0,
    facing: 1
  };

  const buffs = [
    { templateRef: 'item:trinket-warrior-glory-v1', endsAtTick: 2000 }, // +150 AP, +5% crit, +20% critMul
    { templateRef: 'item:trinket-haste-v1', endsAtTick: 2000 } // +10% haste (1/10) -> 1.8 + 0.1 = 1.9
  ];

  // While active:
  const active = applyTrinketStats(baseStats, buffs, 1000);
  assert.equal(active.attackPower, '1150');
  assert.deepEqual(active.haste, { n: '19', d: '10' }); // 1.9
  assert.deepEqual(active.crit, { n: '19', d: '20' }); // 0.9 + 0.05 = 0.95
  assert.deepEqual(active.critMultiplier, { n: '17', d: '10' }); // 1.5 + 0.2 = 1.7

  // Test capping: if haste exceeds 2n or crit exceeds 1n
  const extraHasteBuffs = [
    { templateRef: 'item:trinket-haste-v1', endsAtTick: 2000 },
    { templateRef: 'item:trinket-haste-v1', endsAtTick: 2000 },
    { templateRef: 'item:trinket-haste-v1', endsAtTick: 2000 } // +30% haste -> 1.8 + 0.3 = 2.1 -> capped to 2
  ];
  const capped = applyTrinketStats(baseStats, extraHasteBuffs, 1000);
  assert.deepEqual(capped.haste, { n: '2', d: '1' });

  // Expired:
  const expired = applyTrinketStats(baseStats, buffs, 2500);
  assert.deepEqual(expired, baseStats);
});

test('applyTrinketInput: usable during controlled state without breaking control', () => {
  const state = {
    player: { hp: '800', maxHp: '1000', mp: '150', maxMp: '200', lifeState: 'alive' },
    equippedTrinket: {
      itemId: 'inst-1',
      templateRef: 'item:trinket-warrior-glory-v1'
    },
    cooldowns: [],
    buffs: []
  };
  const context = { challengeId: 'chal-1', sceneEpoch: 1, actorId: 'c1' };

  // Trigger trinket while controlled
  const res = applyTrinketInput(
    { kind: 'trinket', itemId: 'inst-1', tick: 100, seq: 1 },
    state,
    context
  );
  assert.equal(res.outcome, 'accepted');
  assert.equal(res.activated, true);
  assert.equal(state.buffs.length, 1);
  assert.equal(state.buffs[0].templateRef, 'item:trinket-warrior-glory-v1');
  assert.equal(state.cooldowns.find(c => c.cooldownId === 'trinket')?.readyAtTick, 100 + TRINKET_COOLDOWN_TICKS);
});


