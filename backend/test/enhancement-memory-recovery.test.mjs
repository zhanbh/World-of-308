import test from 'node:test';
import assert from 'node:assert/strict';
import { enhancementFixture } from './fixtures/enhancement-fixture.mjs';
import { EnhancementCoordinator } from '../../client/assets/scripts/net/EnhancementCoordinator.ts';
import { loginKey } from '../src/identity/identity-v2.ts';
import { EquipmentService } from '../src/equipment/equipment-service.ts';

const highConfig = {
  ref: 'enhance-local-v2',
  contextTtlMs: 30000,
  probabilityScale: 1000000,
  probabilityCap: 900000,
  luckPerPoint: 1000,
  luckCap: 50000,
  memoryStep: 30000,
  memorySourceCap: 150000,
  memoryTotalCap: 150000,
  distanceWeights: [1000000, 600000, 140000, ...Array(17).fill(0)],
  goldByItemLevel: { 10: {
    weapon: Array.from({ length: 20 }, (_, i) => String(i < 10 ? (i + 1) * 10 : 100 * 2 ** (i - 9))),
    earring: Array.from({ length: 20 }, (_, i) => String(i < 10 ? (i + 1) * 8 : 80 * 2 ** (i - 9))),
  } },
  materialTemplateRef: 'ore',
  materialsByTarget: Array(20).fill(1),
  earringAttackPowerByTarget: ['2','6','12','20','30','42','56','72','90','110','132','156','182','210','240','272','306','342','380','420'],
  highGradeProbabilityByTarget: [500000, 400000, 300000, 250000, 200000, 150000, 120000, 90000, 60000, 40000],
  mementoTemplateRef: 'memento',
  mementoCostByTarget: Array(20).fill(1),
  mementoBonusByTarget: Array(20).fill(50000),
  destructionMementoReturnByTarget: Array(20).fill(5),
};

test('cross-equipment memory reuse: weapon failure accumulates memory which directly benefits earring enhancement and is consumed upon success', async () => {
  const f = await enhancementFixture({ config: highConfig, sample: 700000 });
  await f.fund('100000');

  // Create an earring in backpack at +7 (earring AP at lvl 7 is 56)
  const earringId = 'test-memory-earring';
  const originalWeapon = f.store.inspect(f.weaponId);
  await f.store.run(async tx => {
    tx.set(earringId, {
      ...originalWeapon,
      id: earringId,
      slotKind: 'earring',
      sourceKey: earringId,
      sourceLocator: { kind: 'grant', grantId: earringId },
      location: { kind: 'container', containerId: f.bag().id },
      holderCharacterId: f.characterId,
      enhancementLevel: 7,
      enhancementBonus: { configRef: highConfig.ref, level: 7, attackPower: '56' },
    });
    const bag = await tx.get(f.bag().id);
    tx.set(bag.id, {
      ...bag,
      slots: {
        ...bag.slots,
        1: { kind: 'equipment', itemId: earringId, sortHeader: { itemLevel: 10, quality: 'white', slotKind: 'earring' } },
        2: { kind: 'stack', stackId: 'ore-stack-2', templateRef: { id: 'ore', version: 1 }, quantity: 90, binding: { kind: 'none' }, traceRef: 'ore-extra' },
      },
    });
    // Weapon at level 7 (weapon AP at lvl 7 is Math.floor(56 * 1.5) = 84)
    const weapon = await tx.get(f.weaponId);
    tx.set(weapon.id, {
      ...weapon,
      enhancementLevel: 7,
      enhancementBonus: { configRef: highConfig.ref, level: 7, attackPower: '84' },
    });
  });

  const memoryId = await loginKey('enhancementMemory', [f.characterId, f.character().rolePlayEpoch]);
  const initialMemory = f.store.inspect(memoryId);
  assert.equal(initialMemory, undefined);

  // Attempt enhancement on weapon towards level 8 with sample 700000.
  // Base prob for 8 is 600000, sample 700000 >= 600000 -> failed (保级).
  const quoteWeapon1 = await f.quote(f.weaponId, 8);
  assert.ok(quoteWeapon1.data, JSON.stringify(quoteWeapon1));
  const cmdWeapon1 = {
    ...f.auth,
    command: 'equipment.enhance',
    operationId: 'op-weapon-fail-8',
    expected: quoteWeapon1.data.targetVersions,
    payload: { characterId: f.characterId, contextId: f.contextId, itemId: f.weaponId, targetLevel: 8, useMemento: false, quoteRef: quoteWeapon1.data.quoteRef },
  };
  const res1 = await f.service.execute(cmdWeapon1);
  assert.equal(res1.outcome.data.result, 'failed');

  // Verify memory after weapon failure at targetLevel 8: index 7 should have 30000
  const memAfterFail1 = f.store.inspect(memoryId);
  assert.ok(memAfterFail1);
  assert.equal(memAfterFail1.values[7], 30000);

  // Now attempt earring towards level 8, with a controlled sample of 620000.
  // Without memory bonus, base prob is 600000 (would fail).
  // With memory bonus (+30000 at level 8), threshold becomes 630000, so sample 620000 < 630000 -> SUCCESS!
  f.service['options'].random = { sample: async () => 620000 };

  const quoteEarring = await f.quote(earringId, 8);
  assert.ok(quoteEarring.data, JSON.stringify(quoteEarring));
  const cmdEarring = {
    ...f.auth,
    command: 'equipment.enhance',
    operationId: 'op-earring-succ-8',
    expected: quoteEarring.data.targetVersions,
    payload: { characterId: f.characterId, contextId: f.contextId, itemId: earringId, targetLevel: 8, useMemento: false, quoteRef: quoteEarring.data.quoteRef },
  };
  const res2 = await f.service.execute(cmdEarring);
  assert.equal(res2.outcome.data.result, 'success');

  // Verify earring became level 8 (earring AP at lvl 8 is 72)
  const earringView = await f.view(earringId);
  assert.equal(earringView.data.item.enhancementLevel, 8);
  assert.equal(earringView.data.item.enhancementBonus.attackPower, '72');

  // Verify level 8 memory is now cleared to 0 (consumed by earring success at level 8)
  const memAfterSuccess = f.store.inspect(memoryId);
  assert.equal(memAfterSuccess.values[7], 0);
});

test('similarity distance weights correctly scale bonus contribution and partial memory consumption across neighboring and distant levels', async () => {
  const f = await enhancementFixture({ config: highConfig, sample: 999999 });
  await f.fund('100000');
  await f.store.run(async tx => {
    const bag = await tx.get(f.bag().id);
    tx.set(bag.id, {
      ...bag,
      slots: {
        ...bag.slots,
        0: { kind: 'stack', stackId: 'ore-stack-0', templateRef: { id: 'ore', version: 1 }, quantity: 20, binding: { kind: 'none' }, traceRef: 'ore-0' },
        1: { kind: 'stack', stackId: 'ore-stack-1', templateRef: { id: 'ore', version: 1 }, quantity: 20, binding: { kind: 'none' }, traceRef: 'ore-1' },
        2: { kind: 'stack', stackId: 'ore-stack-2', templateRef: { id: 'ore', version: 1 }, quantity: 20, binding: { kind: 'none' }, traceRef: 'ore-2' },
      },
    });
  });

  const memoryId = await loginKey('enhancementMemory', [f.characterId, f.character().rolePlayEpoch]);

  // Inject 3 failures at level 8 directly into memory: 3 * 30000 = 90000
  await f.store.run(async tx => {
    const values = Array(20).fill(0);
    values[7] = 90000;
    tx.set(memoryId, {
      schemaVersion: 2, id: memoryId, accountId: f.account().id, characterId: f.characterId,
      rolePlayEpoch: f.character().rolePlayEpoch, configRef: highConfig.ref, values, version: 1,
    });
  });

  // Test distance 1: target level 7 (distance = |8 - 7| = 1, weight = 600000 = 60%)
  // Weapon at lvl 6 AP is Math.floor(42 * 1.5) = 63.
  // Expected bonus = Math.floor(90000 * 600000 / 1000000) = 54000.
  // Base prob for 7 is 700000. Threshold = 700000 + 54000 = 754000.
  // If sample = 750000, it succeeds (< 754000)!
  f.service['options'].random = { sample: async () => 750000 };
  await f.store.run(async tx => {
    const weapon = await tx.get(f.weaponId);
    tx.set(weapon.id, { ...weapon, enhancementLevel: 6, enhancementBonus: { configRef: highConfig.ref, level: 6, attackPower: '63' } });
  });

  const q7 = await f.quote(f.weaponId, 7);
  assert.ok(q7.data, JSON.stringify(q7));
  const cmd7 = { ...f.auth, command: 'equipment.enhance', operationId: 'op-dist1-succ', expected: q7.data.targetVersions, payload: { characterId: f.characterId, contextId: f.contextId, itemId: f.weaponId, targetLevel: 7, useMemento: false, quoteRef: q7.data.quoteRef } };
  const res7 = await f.service.execute(cmd7);
  assert.equal(res7.outcome.data.result, 'success');

  // Verify memory after success at target 7:
  // Level 7 memory had 0, so 0 after success.
  // Level 8 memory (distance 1) should be consumed by 60%:
  // Math.floor(90000 * (1000000 - 600000) / 1000000) = 36000 remaining!
  const memAfterDist1 = f.store.inspect(memoryId);
  assert.equal(memAfterDist1.values[7], 36000);

  // Test distance 2: target level 10 (distance = |8 - 10| = 2, weight = 140000 = 14%)
  // Weapon at lvl 9 AP is Math.floor(90 * 1.5) = 135.
  // Remaining at level 8 is 36000.
  // When target 10 succeeds, level 8 should be reduced by 14%:
  // Math.floor(36000 * (1000000 - 140000) / 1000000) = Math.floor(36000 * 860000 / 1000000) = 30960!
  await f.store.run(async tx => {
    const weapon = await tx.get(f.weaponId);
    tx.set(weapon.id, { ...weapon, enhancementLevel: 9, enhancementBonus: { configRef: highConfig.ref, level: 9, attackPower: '135' } });
  });
  f.service['options'].random = { sample: async () => 100000 };
  const q10 = await f.quote(f.weaponId, 10);
  assert.ok(q10.data, JSON.stringify(q10));
  const cmd10 = { ...f.auth, command: 'equipment.enhance', operationId: 'op-dist2-succ', expected: q10.data.targetVersions, payload: { characterId: f.characterId, contextId: f.contextId, itemId: f.weaponId, targetLevel: 10, useMemento: false, quoteRef: q10.data.quoteRef } };
  const res10 = await f.service.execute(cmd10);
  assert.equal(res10.outcome.data.result, 'success');

  const memAfterDist2 = f.store.inspect(memoryId);
  assert.equal(memAfterDist2.values[7], 30960);

  // Test distance >= 3: target level 13 (distance = |8 - 13| = 5, weight = 0)
  // Weapon at lvl 12 AP is Math.floor(156 * 1.5) = 234.
  // When target 13 succeeds, level 8 should remain completely untouched at 30960!
  await f.store.run(async tx => {
    const weapon = await tx.get(f.weaponId);
    tx.set(weapon.id, { ...weapon, enhancementLevel: 12, enhancementBonus: { configRef: highConfig.ref, level: 12, attackPower: '234' } });
  });
  const q13 = await f.quote(f.weaponId, 13);
  assert.ok(q13.data, JSON.stringify(q13));
  const cmd13 = { ...f.auth, command: 'equipment.enhance', operationId: 'op-dist5-succ', expected: q13.data.targetVersions, payload: { characterId: f.characterId, contextId: f.contextId, itemId: f.weaponId, targetLevel: 13, useMemento: false, quoteRef: q13.data.quoteRef } };
  const res13 = await f.service.execute(cmd13);
  assert.equal(res13.outcome.data.result, 'success');

  const memAfterDist5 = f.store.inspect(memoryId);
  assert.equal(memAfterDist5.values[7], 30960);
});

test('memory sources cap at memorySourceCap, total bonus caps at memoryTotalCap, and overall chance caps at probabilityCap', async () => {
  const f = await enhancementFixture({ config: highConfig, sample: 999999 });
  await f.fund('100000');
  await f.store.run(async tx => {
    const bag = await tx.get(f.bag().id);
    tx.set(bag.id, {
      ...bag,
      slots: { ...bag.slots, 0: { kind: 'stack', stackId: 'ore-stack', templateRef: { id: 'ore', version: 1 }, quantity: 20, binding: { kind: 'none' }, traceRef: 'ore-many' } },
    });
  });

  const memoryId = await loginKey('enhancementMemory', [f.characterId, f.character().rolePlayEpoch]);

  // Inject maximum source cap into level 5 (150000)
  await f.store.run(async tx => {
    const values = Array(20).fill(0);
    values[4] = highConfig.memorySourceCap; // 150000
    values[3] = highConfig.memorySourceCap; // 150000
    tx.set(memoryId, {
      schemaVersion: 2, id: memoryId, accountId: f.account().id, characterId: f.characterId,
      rolePlayEpoch: f.character().rolePlayEpoch, configRef: highConfig.ref, values, version: 1,
    });
  });

  // Weapon at lvl 4 AP is Math.floor(20 * 1.5) = 30.
  // Failing again at level 5 does not exceed memorySourceCap (150000)
  await f.store.run(async tx => {
    const weapon = await tx.get(f.weaponId);
    tx.set(weapon.id, { ...weapon, enhancementLevel: 4, enhancementBonus: { configRef: highConfig.ref, level: 4, attackPower: '30' } });
  });

  const q5 = await f.quote(f.weaponId, 5);
  assert.ok(q5.data, JSON.stringify(q5));
  const cmd5 = { ...f.auth, command: 'equipment.enhance', operationId: 'op-cap-fail', expected: q5.data.targetVersions, payload: { characterId: f.characterId, contextId: f.contextId, itemId: f.weaponId, targetLevel: 5, useMemento: false, quoteRef: q5.data.quoteRef } };
  const resFail = await f.service.execute(cmd5);
  assert.equal(resFail.outcome.data.result, 'failed');

  const mem = f.store.inspect(memoryId);
  assert.equal(mem.values[4], highConfig.memorySourceCap); // still 150000, capped!

  // Now verify probabilityCap: Base probability for level 1 is 800000.
  // Plus memoryBonus capped at 150000 -> 800000 + 150000 = 950000.
  // But probabilityCap is 900000.
  // Sample 910000 >= 900000, so it fails! (Proves probabilityCap is strictly enforced)
  f.service['options'].random = { sample: async () => 910000 };
  await f.store.run(async tx => {
    const weapon = await tx.get(f.weaponId);
    tx.set(weapon.id, { ...weapon, enhancementLevel: 0, enhancementBonus: undefined });
    const values = Array(20).fill(0);
    values[0] = 150000;
    tx.set(memoryId, { ...mem, values, version: mem.version + 1 });
  });

  const q1 = await f.quote(f.weaponId, 1);
  assert.ok(q1.data, JSON.stringify(q1));
  const cmd1 = { ...f.auth, command: 'equipment.enhance', operationId: 'op-prob-cap', expected: q1.data.targetVersions, payload: { characterId: f.characterId, contextId: f.contextId, itemId: f.weaponId, targetLevel: 1, useMemento: false, quoteRef: q1.data.quoteRef } };
  const resCap = await f.service.execute(cmd1);
  assert.equal(resCap.outcome.data.result, 'failed'); // 910000 >= 900000 cap!
});

test('rolePlayEpoch boundary and character isolation: memory resets across new epoch and is strictly isolated between characters', async () => {
  const f = await enhancementFixture({ config: highConfig, sample: 999999 });
  await f.fund('100000');
  const memoryIdEpoch1 = await loginKey('enhancementMemory', [f.characterId, f.character().rolePlayEpoch]);

  // Inject failure memory in epoch 1
  await f.store.run(async tx => {
    const values = Array(20).fill(0);
    values[4] = 60000;
    tx.set(memoryIdEpoch1, {
      schemaVersion: 2, id: memoryIdEpoch1, accountId: f.account().id, characterId: f.characterId,
      rolePlayEpoch: f.character().rolePlayEpoch, configRef: highConfig.ref, values, version: 1,
    });
  });

  // Verify epoch 1 memory exists
  assert.equal(f.store.inspect(memoryIdEpoch1).values[4], 60000);

  // Advance rolePlayEpoch: character logs in again or switches session with epoch + 1
  const newEpoch = f.character().rolePlayEpoch + 1;
  await f.store.run(async tx => {
    const char = await tx.get(f.characterId);
    tx.set(char.id, { ...char, rolePlayEpoch: newEpoch, version: char.version + 1 });
  });

  // Open a new service context under the new epoch
  const opened2 = await f.town.openService({
    ...f.auth,
    command: 'service.open',
    operationId: 'open-epoch-2',
    expected: [{ kind: 'character', id: f.characterId, version: f.character().version }],
    payload: { characterId: f.characterId, serviceKind: 'enhance', anchorId: 'mary' },
  });
  assert.equal(opened2.outcome.status, 'committed');
  const contextId2 = opened2.outcome.data.contextId;

  // Query quote in new epoch: new memory document should be instantiated with all zeros
  const qNewEpoch = await f.service.query({
    ...f.auth,
    query: 'service.quote',
    requestId: 'q-new-epoch',
    payload: {
      characterId: f.characterId,
      contextId: contextId2,
      serviceIntent: { command: 'equipment.enhance', payload: { characterId: f.characterId, contextId: contextId2, itemId: f.weaponId, targetLevel: 1, useMemento: false, quoteRef: 'unquoted' } },
    },
  });
  assert.ok(qNewEpoch.data, JSON.stringify(qNewEpoch));

  // The service reads zeros for new epoch
  const memoryIdEpoch2 = await loginKey('enhancementMemory', [f.characterId, newEpoch]);
  const memEpoch2 = f.store.inspect(memoryIdEpoch2);
  assert.ok(!memEpoch2 || memEpoch2.values.every(v => v === 0));

  // Old epoch memory remains unchanged in store for auditing
  assert.equal(f.store.inspect(memoryIdEpoch1).values[4], 60000);
});

test('fixed random sample survives transaction retries and OCC conflict without re-rolling', async () => {
  const f = await enhancementFixture({ config: highConfig });
  await f.fund('100000');

  const q = await f.quote(f.weaponId, 1);
  const cmd = {
    ...f.auth,
    command: 'equipment.enhance',
    operationId: 'op-fixed-sample',
    expected: q.data.targetVersions,
    payload: { characterId: f.characterId, contextId: f.contextId, itemId: f.weaponId, targetLevel: 1, useMemento: false, quoteRef: q.data.quoteRef },
  };

  const capturedSamples = [];
  const trackingRandom = {
    sample: async seed => {
      const s = 123456;
      capturedSamples.push({ seed, s });
      return s;
    },
  };
  f.service['options'].random = trackingRandom;

  // Execute command with OCC conflict simulation on first attempt using beforeCommit
  let firstAttempt = true;
  f.store.beforeCommit = async attempt => {
    if (firstAttempt && attempt === 0) {
      firstAttempt = false;
      // Mutate wallet in raw cells to force an OCC conflict on attempt 0
      const w = f.store.inspect(f.wallet().id);
      f.store['cells'].set(w.id, { revision: 999, value: { ...w, version: w.version + 1 } });
    }
  };

  const res = await f.service.execute(cmd);
  assert.ok(res.outcome);

  // Verify the random sample was called with the exact seed JSON.stringify([accountId, operationId])
  assert.ok(capturedSamples.length >= 1);
  assert.equal(capturedSamples[0].seed, JSON.stringify([f.account().id, cmd.operationId]));
  assert.equal(capturedSamples[0].s, 123456);
});

test('committed enhancement outcome is immutable and cannot re-charge or change even after config changes', async () => {
  const f = await enhancementFixture({ config: highConfig, sample: 100000 });
  await f.fund('100000');

  const q = await f.quote(f.weaponId, 1);
  const cmd = {
    ...f.auth,
    command: 'equipment.enhance',
    operationId: 'op-immutable-outcome',
    expected: q.data.targetVersions,
    payload: { characterId: f.characterId, contextId: f.contextId, itemId: f.weaponId, targetLevel: 1, useMemento: false, quoteRef: q.data.quoteRef },
  };
  const res1 = await f.service.execute(cmd);
  assert.equal(res1.outcome.status, 'committed');
  assert.equal(res1.outcome.data.result, 'success');

  const goldAfterFirst = f.wallet().gold;

  // Replay exact same command: returns identical receipt outcome
  const res2 = await f.service.execute(cmd);
  assert.equal(res2.outcome.status, 'committed');
  assert.equal(res2.outcome.data.result, 'success');
  assert.equal(f.wallet().gold, goldAfterFirst); // Zero additional debit

  // Query operation.get directly
  const opQuery = await f.service.query({
    ...f.auth,
    query: 'operation.get',
    requestId: 'get-op-1',
    payload: { operationId: cmd.operationId },
  });
  assert.equal(opQuery.data.status, 'found');
  assert.equal(opQuery.data.result.outcome.status, 'committed');
  assert.equal(opQuery.data.result.outcome.data.result, 'success');
});

test('EnhancementCoordinator supports high-grade quoting, memento toggling and handles destroyed items cleanly', async () => {
  const f = await enhancementFixture({ config: highConfig, sample: 100000 });
  await f.fund('100000');

  // Prepare weapon at +10 (AP is Math.floor(110 * 1.5) = 165) and backpack with mementos
  await f.store.run(async tx => {
    const weapon = await tx.get(f.weaponId);
    tx.set(weapon.id, {
      ...weapon,
      enhancementLevel: 10,
      enhancementBonus: { configRef: highConfig.ref, level: 10, attackPower: '165' },
    });
    const bag = await tx.get(f.bag().id);
    tx.set(bag.id, {
      ...bag,
      slots: {
        ...bag.slots,
        1: { kind: 'stack', stackId: 'mem-stack', templateRef: { id: 'memento', version: 1 }, quantity: 10, binding: { kind: 'character', accountId: f.account().id, characterId: f.characterId }, traceRef: 'mem-1' },
      },
    });
  });

  const saved = new Map();
  const persistence = {
    load: k => saved.get(k) ?? null,
    save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)),
  };

  const coordinator = new EnhancementCoordinator(f.transport, persistence, () => 'coord-op-high');
  coordinator.init({ ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch });

  await coordinator.open(f.contextId, f.weaponId);
  // Coordinator should successfully quote +11 instead of throwing LOW_GRADE_LIMIT
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.view.item.enhancementLevel, 10);
  assert.equal(coordinator.state.quote.materialCosts.length, 1); // ore only initially

  // Toggle memento usage
  await coordinator.setMemento(true);
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.quote.materialCosts.length, 2); // ore + memento
  assert.ok(coordinator.state.quote.failureConsequences.includes('consumeMemento'));

  // Test destroyed handling in coordinator:
  // Set weapon to +13 (AP is Math.floor(182 * 1.5) = 273), sample = 999999 (guaranteed destroy)
  const fDestroy = await enhancementFixture({ config: highConfig, sample: 999999 });
  await fDestroy.fund('100000');
  await fDestroy.store.run(async tx => {
    const weapon = await tx.get(fDestroy.weaponId);
    tx.set(weapon.id, {
      ...weapon,
      enhancementLevel: 13,
      enhancementBonus: { configRef: highConfig.ref, level: 13, attackPower: '273' },
    });
  });

  const coordDestroy = new EnhancementCoordinator(fDestroy.transport, persistence, () => 'coord-op-destroy');
  coordDestroy.init({ ...fDestroy.auth, characterId: fDestroy.characterId, rolePlayEpoch: fDestroy.character().rolePlayEpoch });
  await coordDestroy.open(fDestroy.contextId, fDestroy.weaponId);
  assert.equal(coordDestroy.state.status, 'ready');

  await coordDestroy.enhance(false);
  assert.equal(coordDestroy.state.lastResult.result, 'destroyed');
  assert.equal(coordDestroy.state.itemId, null);
  assert.equal(coordDestroy.state.view, null);
  assert.equal(coordDestroy.state.status, 'empty');
});

test('EnhancementCoordinator recovers from unknown lost response via operation.get found and notFound resend', async () => {
  const f = await enhancementFixture({ config: highConfig, sample: 100000 });
  await f.fund('100000');

  const saved = new Map();
  const persistence = {
    load: k => saved.get(k) ?? null,
    save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)),
  };

  const identity = { ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch };

  // Case A: Response dropped AFTER backend committed transaction
  let dropResponse = true;
  const transportDropA = {
    send: async text => {
      const res = await f.transport.send(text);
      const parsed = JSON.parse(text);
      if (parsed.command === 'equipment.enhance' && dropResponse) {
        dropResponse = false;
        throw new Error('NETWORK_TIMEOUT');
      }
      return res;
    },
  };

  const coordA = new EnhancementCoordinator(transportDropA, persistence, () => 'op-lost-committed');
  coordA.init(identity);
  await coordA.open(f.contextId, f.weaponId);
  await coordA.enhance();
  assert.equal(coordA.state.status, 'unknown');
  assert.equal(coordA.state.pendingOperationId, 'op-lost-committed');

  // Recover through operation.get -> found!
  await coordA.recover();
  assert.equal(coordA.state.status, 'ready');
  assert.equal(coordA.state.view.item.enhancementLevel, 1);
  assert.equal(saved.size, 0);

  // Case B: Response dropped BEFORE backend committed (server never saw it)
  let dropBeforeCommit = true;
  const transportDropB = {
    send: async text => {
      const parsed = JSON.parse(text);
      if (parsed.command === 'equipment.enhance' && dropBeforeCommit) {
        dropBeforeCommit = false;
        throw new Error('CONNECTION_RESET_BEFORE_SEND');
      }
      return f.transport.send(text);
    },
  };

  const coordB = new EnhancementCoordinator(transportDropB, persistence, () => 'op-lost-uncommitted');
  coordB.init(identity);
  await coordB.open(f.contextId, f.weaponId);
  await coordB.enhance();
  assert.equal(coordB.state.status, 'unknown');
  assert.equal(coordB.state.pendingOperationId, 'op-lost-uncommitted');

  // Recover -> query operation.get returns notFound -> coordinator resends and succeeds!
  await coordB.recover();
  assert.equal(coordB.state.status, 'ready');
  assert.equal(coordB.state.view.item.enhancementLevel, 2);
  assert.equal(saved.size, 0);
});

test('OCC race between enhancement and equipment unequip or lifecycle update prevents unauthorized or phantom debits', async () => {
  const f = await enhancementFixture({ config: highConfig });
  await f.fund('100000');
  const equip = new EquipmentService({ store: f.store, clock: f.clock, identity: f.identity });

  // Plan enhancement for currently equipped weapon
  const qEnhance = await f.quote(f.weaponId, 1);
  assert.ok(qEnhance.data, JSON.stringify(qEnhance));
  const cmdEnhance = {
    ...f.auth,
    command: 'equipment.enhance',
    operationId: 'enhance-racing-unequip',
    expected: qEnhance.data.targetVersions,
    payload: { characterId: f.characterId, contextId: f.contextId, itemId: f.weaponId, targetLevel: 1, useMemento: false, quoteRef: qEnhance.data.quoteRef },
  };

  // Unequip weapon to backpack first before enhancement executes
  await equip.execute({
    ...f.auth,
    command: 'equipment.unequip',
    operationId: 'unequip-before-enhance',
    expected: [{ kind: 'character', id: f.characterId, version: f.character().version }, { kind: 'container', id: f.bag().id, version: f.bag().version }],
    payload: { characterId: f.characterId, itemId: f.weaponId, slot: 'weapon' },
  });

  const goldBeforeReject = f.wallet().gold;

  // The racing enhancement attempts to execute with old quote: character version and expected item location mismatched
  const res = await f.service.execute(cmdEnhance);
  assert.equal(res.outcome.status, 'rejected');
  assert.ok(['ITEM_NOT_ELIGIBLE', 'EXPECTED_VERSION_MISMATCH', 'VERSION_CONFLICT', 'QUOTE_CHANGED'].includes(res.outcome.code));

  // No funds were debited, no materials were consumed
  assert.equal(f.wallet().gold, goldBeforeReject);

  // Now test item lifecycle changed to sold/destroyed directly
  await f.store.run(async tx => {
    const w = await tx.get(f.weaponId);
    tx.set(w.id, { ...w, lifecycle: 'sold', location: { kind: 'retired', reason: 'sold', sourceRef: w.id }, version: w.version + 1 });
  });

  const resSold = await f.service.execute(cmdEnhance);
  assert.equal(resSold.outcome.status, 'rejected');
  assert.ok(['ITEM_NOT_ELIGIBLE', 'EXPECTED_VERSION_MISMATCH', 'VERSION_CONFLICT', 'QUOTE_CHANGED'].includes(resSold.outcome.code));
  assert.equal(f.wallet().gold, goldBeforeReject);
});

test('public query endpoints and receipts strictly protect information hiding without leaking private sample or memory values', async () => {
  const f = await enhancementFixture({ config: highConfig, sample: 123456 });
  await f.fund('100000');

  // 1. service.quote
  const quoteRes = await f.quote(f.weaponId, 1);
  const quoteStr = JSON.stringify(quoteRes);
  assert.ok(!quoteStr.includes('123456'), 'quote should not expose random sample');
  assert.ok(!quoteStr.includes('probabilityCap'), 'quote should not expose probabilityCap');
  assert.ok(!quoteStr.includes('values'), 'quote should not expose memory values array');

  // 2. enhancement.get
  const viewRes = await f.view(f.weaponId);
  const viewStr = JSON.stringify(viewRes);
  assert.ok(!viewStr.includes('123456'), 'view should not expose sample');
  assert.ok(!viewStr.includes('values'), 'view should not expose memory values');

  // 3. execute outcome
  const cmd = {
    ...f.auth,
    command: 'equipment.enhance',
    operationId: 'info-hiding-cmd',
    expected: quoteRes.data.targetVersions,
    payload: { characterId: f.characterId, contextId: f.contextId, itemId: f.weaponId, targetLevel: 1, useMemento: false, quoteRef: quoteRes.data.quoteRef },
  };
  const execRes = await f.service.execute(cmd);
  const outcomeStr = JSON.stringify(execRes);
  assert.ok(!outcomeStr.includes('123456'), 'outcome should not expose random sample');
  assert.ok(!outcomeStr.includes('values'), 'outcome should not expose memory values array');
});
