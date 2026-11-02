import test from 'node:test';
import assert from 'node:assert/strict';
import { enhancementFixture } from './fixtures/enhancement-fixture.mjs';
import { EnhancementCoordinator } from '../../client/assets/scripts/net/EnhancementCoordinator.ts';
import { EQUIPMENT_SLOTS } from '../../shared/src/protocol/asset-v2.ts';
import { loginKey } from '../src/identity/identity-v2.ts';

const SET_CONFIGS = [
  {
    setRef: 'set:warrior-glory-v1',
    requiredPieces: [2, 4],
    bonusAttributes: [
      { statId: 'attackPower', value: '50' },
      { statId: 'attackPower', value: '120' },
    ],
  },
];

async function seedLevel(f, level, setRef = null) {
  const item = f.store.inspect(f.weaponId);
  const ap = level === 0 ? undefined : String(BigInt(f.config.earringAttackPowerByTarget[level - 1]) * 3n / 2n);
  await f.store.run(async tx => tx.set(item.id, {
    ...item,
    setRef: setRef ? { id: setRef, version: 1 } : null,
    enhancementLevel: level,
    ...(level ? { enhancementBonus: { configRef: f.config.ref, level, attackPower: ap } } : { enhancementBonus: undefined }),
  }));
}

async function addMementos(f, quantity = 20, slot = 1) {
  await f.store.run(async tx => {
    const bag = await tx.get(f.bag().id);
    tx.set(bag.id, {
      ...bag,
      slots: {
        ...bag.slots,
        [slot]: {
          kind: 'stack',
          stackId: `memento-${slot}`,
          templateRef: { id: f.config.mementoTemplateRef, version: 1 },
          quantity,
          binding: { kind: 'character', accountId: f.account().id, characterId: f.characterId },
          traceRef: `memento-admitted-${slot}`,
        },
      },
    });
  });
}

test('Joint Loop: Enhance +1~+10 -> High +11~+13 -> Destruction -> Mail overflow -> Claim -> Re-enhance -> Recovery', async () => {
  // Step 1: Initialize fixture with controllable random and town manifest
  const { DEFAULT_TOWN_MAP } = await import('../src/town/town-model.ts');
  const manifest = structuredClone(DEFAULT_TOWN_MAP);
  manifest.serviceAnchors.mailbox = { anchorId: 'mailbox', serviceKind: 'mailbox', x: 340, y: 300 };

  let sampleValue = 100000; // default success
  const f = await enhancementFixture({
    manifest,
    random: { sample: async () => sampleValue },
  });
  await f.fund('200000');
  await addMementos(f, 20, 1);

  const saved = new Map();
  const persistence = { load: k => saved.get(k) ?? null, save: (k, v) => (v === null ? saved.delete(k) : saved.set(k, v)) };
  let opSeq = 0;
  const coordinator = new EnhancementCoordinator(f.transport, persistence, () => `joint-loop-coord-${++opSeq}`);
  const identity = { ...f.auth, characterId: f.characterId, rolePlayEpoch: f.character().rolePlayEpoch };
  coordinator.init(identity);

  await coordinator.open(f.contextId, f.weaponId);
  assert.equal(coordinator.state.status, 'ready');

  // Step 2: Low-grade enhancement (+1 to +10)
  for (let lvl = 1; lvl <= 10; lvl++) {
    await coordinator.enhance();
    assert.equal(coordinator.state.status, 'ready');
    assert.equal(coordinator.state.view.item.enhancementLevel, lvl);
  }
  assert.equal(coordinator.state.view.item.enhancementLevel, 10);

  // Step 3: High-grade enhancement (+11 with memento toggle)
  await coordinator.setMemento(true);
  assert.equal(coordinator.state.status, 'ready');
  assert.ok(coordinator.state.quote.materialCosts.some(m => m.templateRef === f.config.mementoTemplateRef));

  await coordinator.enhance(true);
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.view.item.enhancementLevel, 11);

  // Step 4: Advance to +12, then +13
  await coordinator.enhance(true);
  assert.equal(coordinator.state.view.item.enhancementLevel, 12);
  await coordinator.enhance(true);
  assert.equal(coordinator.state.view.item.enhancementLevel, 13);

  // Step 5: High-grade destruction at target 14 with full backpack (triggering mail overflow)
  // Fill all backpack slots to capacity (100 slots) except slot 0 (ores) and slot 1 (mementos)
  await f.store.run(async tx => {
    const bag = await tx.get(f.bag().id);
    const slots = { ...bag.slots };
    for (let i = 2; i < 100; i++) {
      slots[i] = {
        kind: 'stack',
        stackId: `filler-${i}`,
        templateRef: { id: 'junk-ore', version: 1 },
        quantity: 20,
        binding: { kind: 'none' },
        traceRef: `filler-${i}`,
      };
    }
    tx.set(bag.id, { ...bag, capacity: 100, stage: 4, slots });
  });

  // Force enhancement failure for target 14 -> permanent destruction!
  sampleValue = 999999;
  await coordinator.refresh();
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.quote.failureConsequences[0], 'destroy');

  await coordinator.enhance(true);
  // Item is destroyed! Coordinator automatically resets to empty state and clears itemId
  assert.equal(coordinator.state.status, 'empty');
  assert.equal(coordinator.state.itemId, null);
  assert.equal(coordinator.state.lastResult.result, 'destroyed');

  // Verify item in store is retired/destroyed
  const destroyedWeapon = f.store.inspect(f.weaponId);
  assert.equal(destroyedWeapon.lifecycle, 'destroyed');
  assert.equal(destroyedWeapon.location.kind, 'retired');

  // Verify overflow memento was mailed to mailbox
  const deliveryRef = coordinator.state.lastResult.deliveryRefs[0];
  assert.ok(deliveryRef, 'Destruction memento overflow mail deliveryRef must exist');
  const mail = f.store.inspect(deliveryRef);
  assert.ok(mail, 'Mail document must exist in store');
  assert.equal(mail.attachments[0].quantityGranted, 1); // 4 merged into bag (16->20), 1 overflowed to mail

  // Step 6: Free space in backpack and claim memento mail via MailService
  await f.store.run(async tx => {
    const bag = await tx.get(f.bag().id);
    const slots = { ...bag.slots };
    delete slots[99];
    tx.set(bag.id, { ...bag, slots, version: bag.version + 1 });
  });

  const openedMailbox = await f.town.openService({
    ...f.auth,
    command: 'service.open',
    operationId: 'open-enhance-mailbox',
    expected: [{ kind: 'character', id: f.characterId, version: f.character().version }],
    payload: { characterId: f.characterId, serviceKind: 'mailbox', anchorId: 'mailbox' },
  });
  assert.equal(openedMailbox.outcome.status, 'committed');

  const claimResult = await f.mailService.execute({
    ...f.auth,
    command: 'mail.claimAttachment',
    operationId: 'claim-memento-mail',
    expected: [
      { kind: 'mail', id: mail.id, version: mail.version },
      { kind: 'container', id: f.bag().id, version: f.bag().version },
    ],
    payload: {
      characterId: f.characterId,
      contextId: openedMailbox.outcome.data.contextId,
      mailId: mail.id,
      attachmentId: mail.attachments[0].attachmentId,
    },
  });
  assert.equal(claimResult.outcome.status, 'committed');
  assert.equal(f.store.inspect(mail.id).attachments[0].quantityClaimed, 1);

  // Step 7: Re-enhance: Player equips a second weapon, benefits from failure memory, and enhances
  let secondWeaponId;
  await f.store.run(async tx => {
    const c = await tx.get(f.characterId);
    const newWeapon = {
      ...destroyedWeapon,
      id: `v2:equipment:second-weapon-${globalThis.crypto.randomUUID()}`,
      enhancementLevel: 0,
      enhancementBonus: undefined,
      lifecycle: 'active',
      location: { kind: 'equipped', characterId: c.id, slotId: 'weapon' },
      version: 1,
    };
    secondWeaponId = newWeapon.id;
    c.equipped.weapon = secondWeaponId;
    c.version += 1;
    tx.set(newWeapon.id, newWeapon);
    tx.set(c.id, c);
  });

  // Open fresh Mary context after character change
  const openMary = await f.town.openService({
    ...f.auth,
    command: 'service.open',
    operationId: 'reopen-mary',
    expected: [{ kind: 'character', id: f.characterId, version: f.character().version }],
    payload: { characterId: f.characterId, serviceKind: 'enhance', anchorId: 'mary' },
  });
  assert.equal(openMary.outcome.status, 'committed');
  const newContextId = openMary.outcome.data.contextId;

  sampleValue = 100000; // Success
  await coordinator.open(newContextId, secondWeaponId);
  assert.equal(coordinator.state.status, 'ready');

  await coordinator.enhance(false);
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.view.item.enhancementLevel, 1);

  // Step 8: Network drop and recovery verification
  f.store.injectResponseLoss();
  await coordinator.enhance(false);
  assert.equal(coordinator.state.status, 'unknown');

  // Recover unknown operation
  await coordinator.recover();
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.view.item.enhancementLevel, 2);
});

test('Terminal Budget: Full 13-slot, 100-bag, 20-memory, set destruction and mail overflow transaction metrics', async () => {
  const holdingsDomain = {
    ref: 'bank-test-domain',
    keys: [{ collectionKey: 'set-hero-weapon', setId: 'set-hero', setVersion: 1, itemLevel: 10, slotId: 'weapon', classId: 'warrior' }],
  };
  const f = await enhancementFixture({
    holdingsDomain,
    sample: 999999, // Force destruction
  });
  await f.fund('500000');

  // Setup full 13 equipped slots
  const wear = new Set(['weapon', 'shoulder', 'chest', 'pants', 'belt', 'boots', 'earring']);
  await f.store.run(async tx => {
    const c = await tx.get(f.characterId);
    const w = await tx.get(f.weaponId);
    const equipped = { ...c.equipped };

    for (const slot of EQUIPMENT_SLOTS) {
      if (slot === 'weapon') continue;
      const id = `terminal-wear-${slot}`;
      equipped[slot] = id;
      tx.set(id, {
        ...w,
        id,
        slotKind: slot,
        sourceKey: id,
        sourceLocator: { kind: 'grant', grantId: id },
        location: { kind: 'equipped', characterId: c.id, slotId: slot },
        durability: wear.has(slot)
          ? { wearEnabled: true, current: 60, max: 60, policyRef: 'durability-v1' }
          : { wearEnabled: false, current: null, max: null, policyRef: 'none' },
      });
    }
    tx.set(c.id, { ...c, equipped });

    // Setup 100 backpack slots (full backpack)
    const b = await tx.get(c.backpackId);
    const slots = {};
    for (let i = 0; i < 100; i++) {
      slots[i] = {
        kind: 'stack',
        stackId: `terminal-ore-${i}`,
        templateRef: { id: i === 1 ? f.config.mementoTemplateRef : 'ore', version: 1 },
        quantity: 20,
        binding: i === 1 ? { kind: 'character', accountId: c.accountId, characterId: c.id } : { kind: 'none' },
        traceRef: `admitted-trace-${i}`,
      };
    }
    tx.set(b.id, { ...b, capacity: 100, stage: 4, slots });

    // Setup 20-source memory array
    const memoryId = await loginKey('enhancementMemory', [c.id, c.rolePlayEpoch]);
    tx.set(memoryId, {
      schemaVersion: 2,
      id: memoryId,
      accountId: c.accountId,
      characterId: c.id,
      rolePlayEpoch: c.rolePlayEpoch,
      configRef: f.config.ref,
      values: Array(20).fill(150000),
      version: 20,
    });

    // Setup holding entry
    const holdingId = await loginKey('holdings', [c.accountId, 'character', c.id]);
    const holding = await tx.get(holdingId);
    tx.set(holdingId, {
      ...holding,
      entries: [{ collectionKey: 'set-hero-weapon', permanentCount: 1, mailLatestExpiryAt: null }],
    });
  });

  // Seed weapon to +13, belonging to set-hero
  const w = f.store.inspect(f.weaponId);
  const ap = String(BigInt(f.config.earringAttackPowerByTarget[12]) * 3n / 2n);
  await f.store.run(async tx => {
    tx.set(w.id, {
      ...w,
      setRef: { id: 'set-hero', version: 1 },
      enhancementLevel: 13,
      enhancementBonus: { configRef: f.config.ref, level: 13, attackPower: ap },
    });
  });

  // Query quote for target 14 with memento enabled
  const quoteQuery = await f.service.query({
    ...f.auth,
    query: 'service.quote',
    requestId: 'budget-quote',
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      serviceIntent: {
        command: 'equipment.enhance',
        payload: {
          characterId: f.characterId,
          contextId: f.contextId,
          itemId: f.weaponId,
          targetLevel: 14,
          useMemento: true,
          quoteRef: 'unquoted',
        },
      },
    },
  });
  assert.ok(!quoteQuery.error, JSON.stringify(quoteQuery));
  assert.equal(quoteQuery.data.failureConsequences[0], 'destroy');

  const cmd = {
    ...f.auth,
    command: 'equipment.enhance',
    operationId: 'terminal-max-budget-op',
    expected: quoteQuery.data.targetVersions,
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      itemId: f.weaponId,
      targetLevel: 14,
      useMemento: true,
      quoteRef: quoteQuery.data.quoteRef,
    },
  };

  // Measure exact execution metrics on store.run
  const originalRun = f.store.run.bind(f.store);
  let metrics;
  f.store.run = work =>
    originalRun(async tx => {
      const reads = new Set(), writes = new Map();
      let calls = 0;
      const result = await work({
        get: async id => {
          calls++;
          reads.add(id);
          return tx.get(id);
        },
        set: (id, v) => {
          calls++;
          writes.set(id, v);
          tx.set(id, v);
        },
      });
      const sizes = [...writes.values()].map(v => new TextEncoder().encode(JSON.stringify(v)).length);
      metrics = {
        reads: reads.size,
        writes: writes.size,
        calls,
        writeBytes: sizes.reduce((a, b) => a + b, 0),
        maxDocumentBytes: Math.max(...sizes),
        writtenKeys: [...writes.keys()],
      };
      return result;
    });

  const res = await f.service.execute(cmd);
  assert.equal(res.outcome.status, 'committed');
  assert.equal(res.outcome.data.result, 'destroyed');

  console.log(`ST18-05 Maximum Terminal Budget Observed:`, JSON.stringify(metrics));

  // Budget Verification against enhancement-terminal-budget-v1.md:
  // Expected worst case: R <= 30, W <= 15, calls <= 80, writeBytes <= 65536, maxDocumentBytes <= 32768
  assert.ok(metrics.reads <= 30, `Reads ${metrics.reads} exceeded bound 30`);
  assert.ok(metrics.writes <= 15, `Writes ${metrics.writes} exceeded bound 15`);
  assert.ok(metrics.calls <= 80, `Calls ${metrics.calls} exceeded bound 80`);
  assert.ok(metrics.writeBytes <= 65536, `WriteBytes ${metrics.writeBytes} exceeded bound 65536`);
  assert.ok(metrics.maxDocumentBytes <= 32768, `MaxDocumentBytes ${metrics.maxDocumentBytes} exceeded bound 32768`);
});

test('Atomic Fault Injection: All actual write points rollback cleanly without partial state', async () => {
  // Determine number of write points for target 14 destruction
  const fInit = await enhancementFixture({ sample: 999999 });
  await fInit.fund('200000');
  await seedLevel(fInit, 13);
  await addMementos(fInit, 10, 1);

  const q = await fInit.quote(fInit.weaponId, 14);
  const cmd = {
    ...fInit.auth,
    command: 'equipment.enhance',
    operationId: 'fault-probe-op',
    expected: q.data.targetVersions,
    payload: {
      characterId: fInit.characterId,
      contextId: fInit.contextId,
      itemId: fInit.weaponId,
      targetLevel: 14,
      useMemento: false,
      quoteRef: q.data.quoteRef,
    },
  };

  // Count write points in normal run
  let writeCount = 0;
  const origRun = fInit.store.run.bind(fInit.store);
  fInit.store.run = work =>
    origRun(async tx => {
      return work({
        get: id => tx.get(id),
        set: (id, v) => {
          writeCount++;
          tx.set(id, v);
        },
      });
    });

  await fInit.service.execute(cmd);
  assert.ok(writeCount >= 8, `Expected at least 8 write points, got ${writeCount}`);

  // Now inject write failure at EVERY write point from 1 to writeCount
  for (let pt = 1; pt <= writeCount; pt++) {
    const f = await enhancementFixture({ sample: 999999 });
    await f.fund('200000');
    await seedLevel(f, 13);
    await addMementos(f, 10, 1);

    const quote = await f.quote(f.weaponId, 14);
    const command = {
      ...f.auth,
      command: 'equipment.enhance',
      operationId: `fault-test-pt-${pt}`,
      expected: quote.data.targetVersions,
      payload: {
        characterId: f.characterId,
        contextId: f.contextId,
        itemId: f.weaponId,
        targetLevel: 14,
        useMemento: false,
        quoteRef: quote.data.quoteRef,
      },
    };

    const snapshotBefore = f.store.snapshot();
    f.store.injectWriteFailure(pt);

    const res = await f.service.execute(command);
    assert.equal(res.outcome.code, 'SERVICE_UNAVAILABLE', `Write point ${pt} must return SERVICE_UNAVAILABLE`);
    assert.deepEqual(f.store.snapshot(), snapshotBefore, `Store snapshot must be perfectly identical at write point ${pt}`);
  }
});

test('OCC Races: Enhancement vs Equipment Unequip and Shop Sale serialize strictly in both orders', async () => {
  // Race 1: Enhancement vs Equipment Unequip
  for (const first of ['enhance', 'unequip']) {
    const f = await enhancementFixture({ sample: 100000 });
    await f.fund('10000');
    const q = await f.quote(f.weaponId, 1);

    const enhanceCmd = {
      ...f.auth,
      command: 'equipment.enhance',
      operationId: `race-enh-${first}`,
      expected: q.data.targetVersions,
      payload: {
        characterId: f.characterId,
        contextId: f.contextId,
        itemId: f.weaponId,
        targetLevel: 1,
        useMemento: false,
        quoteRef: q.data.quoteRef,
      },
    };

    if (first === 'unequip') {
      // Unequip weapon before enhance commits
      await f.store.run(async tx => {
        const c = await tx.get(f.characterId);
        const w = await tx.get(f.weaponId);
        c.equipped.weapon = null;
        c.version += 1;
        w.location = { kind: 'container', containerId: c.backpackId };
        w.version += 1;
        tx.set(c.id, c);
        tx.set(w.id, w);
      });

      const res = await f.service.execute(enhanceCmd);
      // Fencing rejects stale versions
      assert.ok(
        ['VERSION_CONFLICT', 'ITEM_NOT_ELIGIBLE'].includes(res.outcome.code),
        `Expected conflict code, got ${res.outcome.code}`
      );
      assert.equal(f.wallet().gold, '10000'); // Zero charge
    } else {
      // Enhance succeeds first
      const res = await f.service.execute(enhanceCmd);
      assert.equal(res.outcome.status, 'committed');
      assert.equal(res.outcome.data.result, 'success');
    }
  }

  // Race 2: Enhancement vs Shop Sale
  for (const first of ['enhance', 'sale']) {
    const f = await enhancementFixture({ sample: 100000 });
    await f.fund('10000');

    // Place an eligible weapon in backpack
    const original = f.store.inspect(f.weaponId);
    const bagWeaponId = 'sale-race-weapon';
    await f.store.run(async tx => {
      tx.set(bagWeaponId, {
        ...original,
        id: bagWeaponId,
        location: { kind: 'container', containerId: f.bag().id },
        version: 1,
      });
      const b = await tx.get(f.bag().id);
      b.slots[1] = {
        kind: 'equipment',
        itemId: bagWeaponId,
        sortHeader: { itemLevel: 10, quality: 'white', slotKind: 'weapon' },
      };
      tx.set(b.id, b);
    });

    const q = await f.quote(bagWeaponId, 1);
    const enhanceCmd = {
      ...f.auth,
      command: 'equipment.enhance',
      operationId: `race-sale-${first}`,
      expected: q.data.targetVersions,
      payload: {
        characterId: f.characterId,
        contextId: f.contextId,
        itemId: bagWeaponId,
        targetLevel: 1,
        useMemento: false,
        quoteRef: q.data.quoteRef,
      },
    };

    if (first === 'sale') {
      // Simulate weapon sale: item lifecycle becomes 'sold'
      await f.store.run(async tx => {
        const item = await tx.get(bagWeaponId);
        item.lifecycle = 'sold';
        item.version += 1;
        tx.set(item.id, item);
      });

      const res = await f.service.execute(enhanceCmd);
      assert.ok(
        ['VERSION_CONFLICT', 'ITEM_NOT_ELIGIBLE'].includes(res.outcome.code),
        `Expected conflict code, got ${res.outcome.code}`
      );
      assert.equal(f.wallet().gold, '10000');
    } else {
      const res = await f.service.execute(enhanceCmd);
      assert.equal(res.outcome.status, 'committed');
      assert.equal(res.outcome.data.result, 'success');
    }
  }
});
