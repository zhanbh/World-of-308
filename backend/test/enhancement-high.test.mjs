import test from 'node:test';
import assert from 'node:assert/strict';
import { enhancementFixture } from './fixtures/enhancement-fixture.mjs';
import { MailService } from '../src/mail/mail-service.ts';
import { ShopService } from '../src/shop/shop-service.ts';
import { EquipmentService } from '../src/equipment/equipment-service.ts';
import { loginKey } from '../src/identity/identity-v2.ts';
import { characterKey } from '../src/character/character-service.ts';

const high = {
  ref: 'enhance-local-v2',
  goldByItemLevel: { 10: {
    weapon: Array.from({ length: 20 }, (_, i) => String(i < 10 ? (i + 1) * 10 : 100 * 2 ** (i - 9))),
    earring: Array.from({ length: 20 }, (_, i) => String(i < 10 ? (i + 1) * 8 : 80 * 2 ** (i - 9))),
  } },
  materialsByTarget: Array(20).fill(1),
  earringAttackPowerByTarget: ['2','6','12','20','30','42','56','72','90','110','132','156','182','210','240','272','306','342','380','420'],
  highGradeProbabilityByTarget: [500000,400000,300000,250000,200000,150000,120000,90000,60000,40000],
  mementoTemplateRef: 'memento',
  mementoCostByTarget: Array(20).fill(1),
  mementoBonusByTarget: Array(20).fill(50000),
  destructionMementoReturnByTarget: Array(20).fill(5),
};

async function quote(f, targetLevel, useMemento = false) {
  return f.service.query({
    ...f.auth,
    query: 'service.quote',
    requestId: `high-quote-${targetLevel}-${useMemento}`,
    payload: { characterId: f.characterId, contextId: f.contextId, serviceIntent: {
      command: 'equipment.enhance',
      payload: { characterId: f.characterId, contextId: f.contextId, itemId: f.weaponId, targetLevel, useMemento, quoteRef: 'unquoted' },
    } },
  });
}

function command(f, q, targetLevel, useMemento = false, operationId = `high-${targetLevel}-${useMemento}`) {
  return { ...f.auth, command: 'equipment.enhance', operationId, expected: q.data.targetVersions,
    payload: { characterId: f.characterId, contextId: f.contextId, itemId: f.weaponId, targetLevel, useMemento, quoteRef: q.data.quoteRef } };
}

async function seedLevel(f, level, setRef = null) {
  const item = f.store.inspect(f.weaponId);
  const ap = level === 0 ? undefined : String(BigInt(high.earringAttackPowerByTarget[level - 1]) * 3n / 2n);
  await f.store.run(async tx => tx.set(item.id, { ...item, setRef, enhancementLevel: level,
    ...(level ? { enhancementBonus: { configRef: f.config.ref, level, attackPower: ap } } : { enhancementBonus: undefined }) }));
}

async function addMemento(f, quantity = 10, slot = 1) {
  await f.store.run(async tx => {
    const bag = await tx.get(f.bag().id);
    tx.set(bag.id, { ...bag, slots: { ...bag.slots, [slot]: {
      kind: 'stack', stackId: 'memento-admitted', templateRef: { id: high.mementoTemplateRef, version: 1 }, quantity,
      binding: { kind: 'character', accountId: f.account().id, characterId: f.characterId }, traceRef: 'memento-admitted-source',
    } } });
  });
}

async function moveWeaponToBackpack(f) {
  await f.store.run(async tx => {
    const character = await tx.get(f.characterId), item = await tx.get(f.weaponId), bag = await tx.get(f.bag().id);
    const equipped = { ...character.equipped }; delete equipped.weapon;
    tx.set(character.id, { ...character, equipped });
    tx.set(item.id, { ...item, location: { kind: 'container', containerId: bag.id } });
    tx.set(bag.id, { ...bag, slots: { ...bag.slots, 2: { kind: 'equipment', itemId: item.id, sortHeader: { itemLevel: item.itemLevel, quality: item.quality, slotKind: item.slotKind } } } });
  });
}

test('targets 11 and 12 preserve the item at +10 on failure and consume an optional memento', async () => {
  for (const target of [11, 12]) {
    const f = await enhancementFixture({ sample: 999999, config: high });
    await f.fund('500000');
    await seedLevel(f, target - 1);
    await addMemento(f);
    const q = await quote(f, target, true);
    assert.ok(!q.error, JSON.stringify(q));
    assert.equal(q.data.materialCosts.find(m => m.templateRef === 'memento')?.quantity, 1);
    assert.ok(q.data.failureConsequences.includes('downgrade'));
    const result = await f.service.execute(command(f, q, target, true));
    assert.equal(result.outcome.data.result, 'failed');
    const item = f.store.inspect(f.weaponId);
    assert.equal(item.lifecycle, 'active');
    assert.equal(item.enhancementLevel, 10);
    assert.equal(item.enhancementBonus.attackPower, '165');
    assert.equal(f.bag().slots[1].quantity, 9);
  }
});

test('targets 13 through 20 destroy on failure, remove equipped references and retain source audit facts', async () => {
  for (const target of Array.from({ length: 8 }, (_, index) => index + 13)) {
    const holdingsDomain = { ref: 'bank-test-domain', keys: [{ collectionKey: 'set-hero-weapon', setId: 'set-hero', setVersion: 1, itemLevel: 10, slotId: 'weapon', classId: 'warrior' }] };
    const f = await enhancementFixture({ sample: 999999, config: high, holdingsDomain });
    await f.fund('500000');
    await seedLevel(f, target - 1, { id: 'set-hero', version: 1 });
    await addMemento(f);
    const holdingId = await loginKey('holdings', [f.account().id, 'character', f.characterId]);
    await f.store.run(async tx => {
      const holdings = await tx.get(holdingId);
      tx.set(holdingId, { ...holdings, entries: [{ collectionKey: 'set-hero-weapon', permanentCount: 1, mailLatestExpiryAt: null }] });
    });
    const sourceKey = f.store.inspect(f.weaponId).sourceKey, beforeCharacter = f.character();
    const q = await quote(f, target, true);
    assert.ok(!q.error, JSON.stringify(q));
    assert.ok(q.data.failureConsequences.includes('destroy'));
    const result = await f.service.execute(command(f, q, target, true));
    assert.equal(result.outcome.status, 'committed', JSON.stringify(result));
    assert.equal(result.outcome.data.result, 'destroyed');
    const item = f.store.inspect(f.weaponId);
    assert.equal(item.lifecycle, 'destroyed');
    assert.equal(item.sourceKey, sourceKey);
    assert.equal(f.character().equipped.weapon, undefined);
    assert.ok(f.character().statsVersion > beforeCharacter.statsVersion);
    assert.ok(f.character().equipmentVersion > beforeCharacter.equipmentVersion);
    const ranking = f.store.inspect(await characterKey('rankingEntry', [f.characterId]));
    assert.equal(ranking.score, String(f.character().score));
    assert.equal(f.store.inspect(holdingId).entries[0].permanentCount, 0);
  }
});

test('an explicitly selected memento adds only its configured chance and uses a strict sample boundary', async () => {
  for (const [sample, expected] of [[549999, 'success'], [550000, 'failed']]) {
    const f = await enhancementFixture({ sample, config: high });
    await f.fund('10000');
    await seedLevel(f, 10);
    await addMemento(f, 2);
    const q = await quote(f, 11, true);
    assert.ok(!q.error, JSON.stringify(q));
    assert.equal(q.data.materialCosts.reduce((sum, cost) => sum + cost.quantity, 0), 2);
    assert.ok(!/probability|threshold|sample/i.test(JSON.stringify(q.data)));
    const result = await f.service.execute(command(f, q, 11, true));
    assert.equal(result.outcome.data.result, expected);
    assert.equal(f.store.inspect(f.weaponId).enhancementLevel, expected === 'success' ? 11 : 10);
    assert.equal(f.bag().slots[1].quantity, 1);
  }
});

test('a memento must be a character-bound stack and no attempt is charged when it is missing', async () => {
  const f = await enhancementFixture({ sample: 0, config: high });
  await f.fund('10000');
  await seedLevel(f, 10);
  await f.store.run(async tx => {
    const bag = await tx.get(f.bag().id);
    tx.set(bag.id, { ...bag, slots: { ...bag.slots, 1: { kind: 'stack', stackId: 'unbound-memento', templateRef: { id: 'memento', version: 1 }, quantity: 10, binding: { kind: 'none' }, traceRef: 'unbound-source' } } });
  });
  const before = f.store.snapshot();
  assert.equal((await quote(f, 11, true)).error.code, 'MATERIAL_NOT_ENOUGH');
  assert.deepEqual(f.store.snapshot(), before);
});

test('destroying a backpack item removes its slot before the character-bound return is placed', async () => {
  const f = await enhancementFixture({ sample: 999999, config: high });
  await f.fund('500000');
  await seedLevel(f, 12);
  await addMemento(f, 1);
  await f.store.run(async tx => {
    const character = await tx.get(f.characterId), item = await tx.get(f.weaponId), bag = await tx.get(f.bag().id);
    const equipped = { ...character.equipped }; delete equipped.weapon;
    tx.set(character.id, { ...character, equipped });
    tx.set(item.id, { ...item, location: { kind: 'container', containerId: bag.id } });
    tx.set(bag.id, { ...bag, slots: { ...bag.slots, 2: { kind: 'equipment', itemId: item.id, sortHeader: { itemLevel: item.itemLevel, quality: item.quality, slotKind: item.slotKind } } } });
  });
  const q = await quote(f, 13, true);
  assert.ok(!q.error, JSON.stringify(q));
  const result = await f.service.execute(command(f, q, 13, true));
  assert.equal(result.outcome.data.result, 'destroyed');
  assert.equal(f.bag().slots[2], undefined);
  assert.equal(f.bag().slots[1].quantity, 5);
  assert.equal(f.bag().slots[1].binding.kind, 'character');
  assert.equal(f.store.inspect(f.weaponId).location.kind, 'retired');
});

test('backpack equipment sale and Mary destruction serialize on context and source state', async () => {
  const manifest = structuredClone((await import('../src/town/town-model.ts')).DEFAULT_TOWN_MAP);
  manifest.serviceAnchors.shop.x = 320;
  const sold = await enhancementFixture({ sample: 999999, config: high, manifest });
  await sold.fund('500000'); await seedLevel(sold, 12); await moveWeaponToBackpack(sold); await addMemento(sold);
  const oldQuote = await quote(sold, 13, true); assert.ok(!oldQuote.error, JSON.stringify(oldQuote));
  const saleContext = await sold.town.openService({ ...sold.auth, command: 'service.open', operationId: 'open-high-sale-first', expected: [{ kind: 'character', id: sold.characterId, version: sold.character().version }], payload: { characterId: sold.characterId, serviceKind: 'shop', anchorId: 'shop' } });
  assert.equal(saleContext.outcome.status, 'committed');
  const shop = new ShopService({ store: sold.store, clock: sold.clock, identity: sold.identity });
  const sale = await shop.execute({ ...sold.auth, command: 'shop.sell', operationId: 'sell-high-first', expected: [], payload: { characterId: sold.characterId, contextId: saleContext.outcome.data.contextId, target: { kind: 'equipment', itemId: sold.weaponId }, quantity: 1, quoteRef: 'local-test' } });
  assert.equal(sale.outcome.status, 'committed', JSON.stringify(sale));
  assert.equal((await sold.service.execute(command(sold, oldQuote, 13, true))).outcome.code, 'CONTEXT_INVALID');
  assert.equal(sold.store.inspect(sold.weaponId).lifecycle, 'sold');
  assert.equal(sold.wallet().gold, '500100');

  const destroyed = await enhancementFixture({ sample: 999999, config: high, manifest });
  await destroyed.fund('500000'); await seedLevel(destroyed, 12); await moveWeaponToBackpack(destroyed); await addMemento(destroyed);
  const destructionQuote = await quote(destroyed, 13, true); assert.ok(!destructionQuote.error, JSON.stringify(destructionQuote));
  assert.equal((await destroyed.service.execute(command(destroyed, destructionQuote, 13, true))).outcome.data.result, 'destroyed');
  const mail = await destroyed.town.openService({ ...destroyed.auth, command: 'service.open', operationId: 'open-high-sale-after', expected: [{ kind: 'character', id: destroyed.characterId, version: destroyed.character().version }], payload: { characterId: destroyed.characterId, serviceKind: 'shop', anchorId: 'shop' } });
  assert.equal(mail.outcome.status, 'committed');
  const rejectedSale = await new ShopService({ store: destroyed.store, clock: destroyed.clock, identity: destroyed.identity }).execute({ ...destroyed.auth, command: 'shop.sell', operationId: 'sell-destroyed-high', expected: [], payload: { characterId: destroyed.characterId, contextId: mail.outcome.data.contextId, target: { kind: 'equipment', itemId: destroyed.weaponId }, quantity: 1, quoteRef: 'local-test' } });
  assert.equal(rejectedSale.outcome.status, 'rejected');
  assert.equal(destroyed.store.inspect(destroyed.weaponId).lifecycle, 'destroyed');
  assert.equal(destroyed.bag().slots[2], undefined);
});

test('memento overflow is mailed and the real mailbox consumer claims it back into the backpack', async () => {
  const manifest = structuredClone((await import('../src/town/town-model.ts')).DEFAULT_TOWN_MAP);
  manifest.serviceAnchors.mailbox = { anchorId: 'mailbox', serviceKind: 'mailbox', x: 340, y: 300 };
  const holdingsDomain = { ref: 'bank-test-domain', keys: [{ collectionKey: 'set-hero-weapon', setId: 'set-hero', setVersion: 1, itemLevel: 10, slotId: 'weapon', classId: 'warrior' }] };
  let sampleCalls = 0;
  const f = await enhancementFixture({ random: { sample: async () => { sampleCalls++; return 999999; } }, config: high, manifest, holdingsDomain });
  await f.fund('100000');
  await seedLevel(f, 12, { id: 'set-hero', version: 1 });
  const holdingId = await loginKey('holdings', [f.account().id, 'character', f.characterId]);
  await f.store.run(async tx => { const holding = await tx.get(holdingId); tx.set(holdingId, { ...holding, entries: [{ collectionKey: 'set-hero-weapon', permanentCount: 1, mailLatestExpiryAt: null }] }); });
  await addMemento(f, 20, 1);
  const slots = {};
  for (let i = 0; i < 100; i++) slots[i] = i === 0
    ? { kind: 'stack', stackId: 'ore-20', templateRef: { id: 'ore', version: 1 }, quantity: 20, binding: { kind: 'none' }, traceRef: 'ore-source' }
    : i === 1 ? f.bag().slots[1]
      : { kind: 'stack', stackId: `full-${i}`, templateRef: { id: 'filler', version: 1 }, quantity: 1, binding: { kind: 'none' }, traceRef: `filler-source-${i}` };
  await f.store.run(async tx => { const bag = await tx.get(f.bag().id); tx.set(bag.id, { ...bag, capacity: 100, stage: 4, slots }); });
  const q = await quote(f, 13, true);
  assert.ok(!q.error, JSON.stringify(q));
  const enhancementCommand = command(f, q, 13, true);
  f.store.injectResponseLoss();
  assert.equal((await f.service.execute(enhancementCommand)).outcome.status, 'unknown');
  const committedSnapshot = f.store.snapshot();
  const result = await f.service.execute(enhancementCommand);
  assert.equal(result.replayed, true);
  assert.deepEqual(f.store.snapshot(), committedSnapshot);
  assert.equal(sampleCalls, 1);
  assert.equal(result.outcome.status, 'committed', JSON.stringify(result));
  assert.equal(result.outcome.data.result, 'destroyed');
  assert.equal(result.outcome.data.deliveryRefs.length, 1);
  const mail = f.store.inspect(result.outcome.data.deliveryRefs[0]);
  assert.equal(mail.attachments[0].quantityGranted, 4);
  assert.equal(mail.expiresAt, f.clock.now() + 30 * 24 * 60 * 60 * 1000);
  assert.equal(f.bag().slots[1].quantity, 20);
  assert.equal(f.bag().slots[0].quantity, 19);

  await f.store.run(async tx => { const bag = await tx.get(f.bag().id), slots = { ...bag.slots }; delete slots[99]; tx.set(bag.id, { ...bag, slots, version: bag.version + 1 }); });
  const opened = await f.town.openService({ ...f.auth, command: 'service.open', operationId: 'open-enhance-mailbox', expected: [{ kind: 'character', id: f.characterId, version: f.character().version }], payload: { characterId: f.characterId, serviceKind: 'mailbox', anchorId: 'mailbox' } });
  assert.equal(opened.outcome.status, 'committed', JSON.stringify(opened));
  const mailService = new MailService({ store: f.store, clock: f.clock, identity: f.identity });
  const claimed = await mailService.execute({ ...f.auth, command: 'mail.claimAttachment', operationId: 'claim-enhance-memento', expected: [{ kind: 'mail', id: mail.id, version: mail.version }, { kind: 'container', id: f.bag().id, version: f.bag().version }], payload: { characterId: f.characterId, contextId: opened.outcome.data.contextId, mailId: mail.id, attachmentId: mail.attachments[0].attachmentId } });
  assert.equal(claimed.outcome.status, 'committed', JSON.stringify(claimed));
  assert.equal(f.store.inspect(mail.id).attachments[0].quantityClaimed, 4);
  const duplicate = await mailService.execute({ ...f.auth, command: 'mail.claimAttachment', operationId: 'claim-enhance-memento', expected: [{ kind: 'mail', id: mail.id, version: mail.version }, { kind: 'container', id: f.bag().id, version: f.bag().version }], payload: { characterId: f.characterId, contextId: opened.outcome.data.contextId, mailId: mail.id, attachmentId: mail.attachments[0].attachmentId } });
  assert.equal(duplicate.replayed, true);
  assert.equal(f.bag().slots[1].quantity, 20);
  assert.equal(f.bag().slots[99].quantity, 4);
});

test('every physical write in a full-bag destruction plus holding/mail update rolls back atomically', async () => {
  async function setup() {
    const manifest = structuredClone((await import('../src/town/town-model.ts')).DEFAULT_TOWN_MAP);
    const holdingsDomain = { ref: 'bank-test-domain', keys: [{ collectionKey: 'set-hero-weapon', setId: 'set-hero', setVersion: 1, itemLevel: 10, slotId: 'weapon', classId: 'warrior' }] };
    const f = await enhancementFixture({ sample: 999999, config: high, manifest, holdingsDomain });
    await f.fund('100000'); await seedLevel(f, 12, { id: 'set-hero', version: 1 }); await addMemento(f, 20, 1);
    const holdingId = await loginKey('holdings', [f.account().id, 'character', f.characterId]);
    await f.store.run(async tx => {
      const holding = await tx.get(holdingId), bag = await tx.get(f.bag().id), slots = {};
      for (let i = 0; i < 100; i++) slots[i] = i === 0
        ? { kind: 'stack', stackId: 'ore-20', templateRef: { id: 'ore', version: 1 }, quantity: 20, binding: { kind: 'none' }, traceRef: 'ore-source' }
        : i === 1 ? bag.slots[1]
          : { kind: 'stack', stackId: `full-${i}`, templateRef: { id: 'filler', version: 1 }, quantity: 1, binding: { kind: 'none' }, traceRef: `filler-source-${i}` };
      tx.set(holdingId, { ...holding, entries: [{ collectionKey: 'set-hero-weapon', permanentCount: 1, mailLatestExpiryAt: null }] });
      tx.set(bag.id, { ...bag, capacity: 100, stage: 4, slots });
    });
    const q = await quote(f, 13, true);
    return { f, q, command: command(f, q, 13, true) };
  }
  const sample = await setup();
  let writes = 0, calls = 0, reads = new Set(), uniqueWrites = new Map();
  const store = sample.f.store, originalRun = store.run.bind(store);
  store.run = work => originalRun(tx => work({ get: async id => { calls++; reads.add(id); return tx.get(id); }, set: (id, value) => { calls++; writes++; uniqueWrites.set(id, value); tx.set(id, value); } }));
  assert.equal((await sample.f.service.execute(sample.command)).outcome.data.result, 'destroyed');
  assert.equal(writes, 11);
  const byteSizes = [...uniqueWrites.values()].map(value => new TextEncoder().encode(JSON.stringify(value)).length);
  console.log('ST18-02 full-bag destruction observed ' + JSON.stringify({ reads: reads.size, writes: uniqueWrites.size, setCalls: writes, calls, writeBytes: byteSizes.reduce((sum, size) => sum + size, 0), maxDocumentBytes: Math.max(...byteSizes) }));
  for (let write = 1; write <= writes; write++) {
    const { f, command: cmd } = await setup(), before = f.store.snapshot();
    f.store.injectWriteFailure(write);
    const result = await f.service.execute(cmd);
    assert.equal(result.outcome.code, 'SERVICE_UNAVAILABLE', `write ${write}`);
    assert.deepEqual(f.store.snapshot(), before, `write ${write}`);
  }
});
