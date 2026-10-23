import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/adapters/memory-store.ts';
import { createContextIdentityPort } from '../src/identity/identity-v2.ts';
import { LoginService } from '../src/identity/login-service.ts';
import { CharacterService, characterKey } from '../src/character/character-service.ts';
import { MailService } from '../src/mail/mail-service.ts';

async function fixture() {
  const store = new MemoryStore();
  let currentTime = 1000;
  const clock = {
    now: () => currentTime,
    setNow: t => {
      currentTime = t;
    },
  };
  let subject = 'player-st07';

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
    payload: { classId: 'warrior', characterName: '战七' },
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

  // Open Mailbox Service Context
  const contextId = 'ctx_mailbox_test_1';
  await store.run(async tx => {
    tx.set(contextId, {
      schemaVersion: 2,
      id: contextId,
      accountId,
      characterId,
      rolePlayEpoch: character.rolePlayEpoch,
      sceneEpoch: 1,
      locationRevision: 1,
      anchorId: 'anchor_mailbox',
      serviceKind: 'mailbox',
      issuedAt: 1000,
      status: 'open',
    });
  });

  const mailService = new MailService({
    store,
    clock,
    identity,
  });

  const noviceMailId = await characterKey('mail', [accountId, 'warrior', 'novice-gift']);

  return {
    store,
    clock,
    identity,
    session,
    envelope,
    characterId,
    accountId,
    contextId,
    mailService,
    noviceMailId,
  };
}

test('mail.markRead sets readAt and increments version without modifying createdAt', async () => {
  const f = await fixture();
  const initialMail = f.store.inspect(f.noviceMailId);
  assert.equal(initialMail.readAt, null);
  assert.equal(initialMail.version, 0);
  const initialCreatedAt = initialMail.createdAt;

  f.clock.setNow(2500);

  const res1 = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.markRead',
    operationId: 'op-read-1',
    expected: [],
    payload: { characterId: f.characterId, contextId: f.contextId, mailId: f.noviceMailId },
  });
  assert.equal(res1.outcome.status, 'committed');
  assert.equal(res1.outcome.data.read, true);

  const readMail = f.store.inspect(f.noviceMailId);
  assert.equal(readMail.readAt, 2500);
  assert.equal(readMail.version, 1);
  assert.equal(readMail.createdAt, initialCreatedAt); // Strict invariance

  // Idempotent execution
  f.clock.setNow(3000);
  const res2 = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.markRead',
    operationId: 'op-read-2',
    expected: [],
    payload: { characterId: f.characterId, contextId: f.contextId, mailId: f.noviceMailId },
  });
  assert.equal(res2.outcome.status, 'committed');
  const readMail2 = f.store.inspect(f.noviceMailId);
  assert.equal(readMail2.readAt, 2500); // Remains original read time
  assert.equal(readMail2.createdAt, initialCreatedAt);
});

test('mail.delete rejects UNCLAIMED_ATTACHMENTS and succeeds only when all attachments are claimed', async () => {
  const f = await fixture();

  // 1. Try to delete novice mail with unclaimed attachments
  const resReject = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.delete',
    operationId: 'op-del-fail',
    expected: [],
    payload: { characterId: f.characterId, contextId: f.contextId, mailId: f.noviceMailId },
  });
  assert.equal(resReject.outcome.status, 'rejected');
  assert.equal(resReject.outcome.code, 'UNCLAIMED_ATTACHMENTS');

  // Mail status remains active
  const mailAfterReject = f.store.inspect(f.noviceMailId);
  assert.equal(mailAfterReject.status, 'active');

  // 2. Add an empty mail (no attachments)
  const emptyMailId = 'mail:empty-test';
  await f.store.run(async tx => {
    tx.set(emptyMailId, {
      schemaVersion: 2,
      id: emptyMailId,
      accountId: f.accountId,
      characterId: f.characterId,
      sourceKey: 'system-announcement',
      titleKey: 'mail.announcement.title',
      bodyKey: 'mail.announcement.body',
      parameters: {},
      expiresAt: 5000000,
      status: 'active',
      readAt: null,
      version: 0,
      attachments: [],
      createdAt: 1000,
      updatedAt: 1000,
    });
  });

  const resDel = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.delete',
    operationId: 'op-del-success',
    expected: [],
    payload: { characterId: f.characterId, contextId: f.contextId, mailId: emptyMailId },
  });
  assert.equal(resDel.outcome.status, 'committed');
  assert.equal(resDel.outcome.data.deleted, true);

  const deletedMail = f.store.inspect(emptyMailId);
  assert.equal(deletedMail.status, 'deleted');

  // 3. Trying to delete or read deleted mail fails
  const resDelAgain = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.delete',
    operationId: 'op-del-again',
    expected: [],
    payload: { characterId: f.characterId, contextId: f.contextId, mailId: emptyMailId },
  });
  assert.equal(resDelAgain.outcome.status, 'rejected');
  assert.equal(resDelAgain.outcome.code, 'NOT_FOUND_OR_FORBIDDEN');
});

test('mail.claimAttachment supports partial delivery for stackables and full delivery for equipment', async () => {
  const f = await fixture();
  const character = f.store.inspect(f.characterId);
  const bagId = character.backpackId;

  // 1. Fill backpack so it only has 1 slot with 17 HP potions, and remaining 19 slots filled with junk
  await f.store.run(async tx => {
    const bag = await tx.get(bagId);
    bag.slots = {};
    // Slot 0: matching HP potion stack with 17 items (room for exactly 3)
    bag.slots[0] = {
      kind: 'stack',
      stackId: 'stk-matching-hp',
      templateRef: { id: 'item:hp-potion-small-v1', version: 1 },
      quantity: 17,
      binding: { kind: 'character', accountId: f.accountId, characterId: f.characterId },
      traceRef: 'tr-init',
    };
    // Slots 1 to 19: filled with other items
    for (let i = 1; i < 20; i++) {
      bag.slots[i] = {
        kind: 'stack',
        stackId: `stk-junk-${i}`,
        templateRef: { id: 'item:junk', version: 1 },
        quantity: 20,
        binding: { kind: 'none' },
        traceRef: 'tr-init',
      };
    }
    tx.set(bag.id, bag);
  });

  // Novice mail has 8 HP potions in attachment 'att-hp-potion'.
  // Backpack only has room for 3.
  const claimPart = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.claimAttachment',
    operationId: 'op-claim-part-1',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      mailId: f.noviceMailId,
      attachmentId: 'att-hp-potion',
    },
  });
  assert.equal(claimPart.outcome.status, 'committed');
  assert.equal(claimPart.outcome.data.deliveredQuantity, 3);

  // Check mail attachment state: 3 claimed out of 8, partially_claimed
  const mailAfterPart = f.store.inspect(f.noviceMailId);
  const attHp = mailAfterPart.attachments.find(a => a.attachmentId === 'att-hp-potion');
  assert.equal(attHp.quantityClaimed, 3);
  assert.equal(attHp.state, 'partially_claimed');

  // Check backpack: slot 0 is now full (20)
  const bagAfterPart = f.store.inspect(bagId);
  assert.equal(bagAfterPart.slots[0].quantity, 20);

  // Bag is now completely full (0 free room for hp potion).
  // Claiming again must reject BAG_FULL.
  const claimBagFull = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.claimAttachment',
    operationId: 'op-claim-bag-full',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      mailId: f.noviceMailId,
      attachmentId: 'att-hp-potion',
    },
  });
  assert.equal(claimBagFull.outcome.status, 'rejected');
  assert.equal(claimBagFull.outcome.code, 'BAG_FULL');

  // Free up slot 19 in bag
  await f.store.run(async tx => {
    const bag = await tx.get(bagId);
    delete bag.slots[19];
    tx.set(bag.id, bag);
  });

  // Claim the remaining 5 HP potions
  const claimRemaining = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.claimAttachment',
    operationId: 'op-claim-part-2',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      mailId: f.noviceMailId,
      attachmentId: 'att-hp-potion',
    },
  });
  assert.equal(claimRemaining.outcome.status, 'committed');
  assert.equal(claimRemaining.outcome.data.deliveredQuantity, 5);

  const mailAfterRemaining = f.store.inspect(f.noviceMailId);
  const attHpFinal = mailAfterRemaining.attachments.find(a => a.attachmentId === 'att-hp-potion');
  assert.equal(attHpFinal.quantityClaimed, 8);
  assert.equal(attHpFinal.state, 'claimed');

  // Trying to claim again rejects ALREADY_DELIVERED
  const claimAlready = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.claimAttachment',
    operationId: 'op-claim-already',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      mailId: f.noviceMailId,
      attachmentId: 'att-hp-potion',
    },
  });
  assert.equal(claimAlready.outcome.status, 'rejected');
  assert.equal(claimAlready.outcome.code, 'ALREADY_DELIVERED');
});

test('mail.claimAttachment rejects MAIL_EXPIRED when now >= expiresAt', async () => {
  const f = await fixture();
  const mail = f.store.inspect(f.noviceMailId);

  // Advance clock beyond mail expiresAt
  f.clock.setNow(mail.expiresAt + 100);

  const res = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.claimAttachment',
    operationId: 'op-claim-expired',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      mailId: f.noviceMailId,
      attachmentId: 'att-mp-potion',
    },
  });
  assert.equal(res.outcome.status, 'rejected');
  assert.equal(res.outcome.code, 'MAIL_EXPIRED');
});

test('reward.claim materializes pending equipment into backpack and never expires', async () => {
  const f = await fixture();
  const character = f.store.inspect(f.characterId);
  const bagId = character.backpackId;

  const grantId = 'grant:challenge-clear-1';
  const itemId = 'eq-pending-sword';

  // Create pre-existing pending equipment and grant
  await f.store.run(async tx => {
    tx.set(itemId, {
      schemaVersion: 2,
      id: itemId,
      accountId: f.accountId,
      holderCharacterId: f.characterId,
      sourceKey: 'challenge-clear-1',
      sourceOrdinal: 0,
      sourceLocator: { kind: 'grant', grantId },
      templateRef: { id: 'item:greatsword-blue-v1', version: 1 },
      slotKind: 'weapon',
      itemLevel: 20,
      quality: 'blue',
      rolledAffixes: [{ stat: 'attackPower', value: 50 }],
      setRef: null,
      binding: { kind: 'character', accountId: f.accountId, characterId: f.characterId },
      enhancementLevel: 5,
      durability: { wearEnabled: true, current: 100, max: 100, policyRef: 'test-wear-v1' },
      location: { kind: 'pending', grantId },
      lifecycle: 'active',
      version: 0,
      createdAt: 1000,
      updatedAt: 1000,
    });

    tx.set(grantId, {
      schemaVersion: 2,
      id: grantId,
      accountId: f.accountId,
      characterId: f.characterId,
      sourceType: 'challenge-clear',
      sourceTuple: JSON.stringify(['challenge-clear', 'ch-1']),
      route: 'pending',
      payload: { kind: 'equipment', itemId },
      deliveryState: 'available',
      createdAt: 1000,
      deliveredAt: null,
      version: 0,
    });

    // Record grant in character pendingGrantIds
    const char = await tx.get(f.characterId);
    char.pendingGrantIds = [grantId];
    tx.set(char.id, char);
  });

  // Fast forward 100 days (100 * 86400 * 1000 ms) — permanent pending rewards DO NOT expire!
  f.clock.setNow(1000 + 100 * 86400 * 1000);

  // 1. Fill bag completely (20 slots) to verify BAG_FULL check
  await f.store.run(async tx => {
    const bag = await tx.get(bagId);
    bag.slots = {};
    for (let i = 0; i < 20; i++) {
      bag.slots[i] = {
        kind: 'stack',
        stackId: `stk-${i}`,
        templateRef: { id: 'item:junk', version: 1 },
        quantity: 20,
        binding: { kind: 'none' },
        traceRef: 'tr-junk',
      };
    }
    tx.set(bag.id, bag);
  });

  const resBagFull = await f.mailService.execute({
    ...f.envelope,
    command: 'reward.claim',
    operationId: 'op-reward-bag-full',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      grantId,
    },
  });
  assert.equal(resBagFull.outcome.status, 'rejected');
  assert.equal(resBagFull.outcome.code, 'BAG_FULL');

  // Verify grant and equipment state are unchanged
  const grantUnchanged = f.store.inspect(grantId);
  assert.equal(grantUnchanged.deliveryState, 'available');
  const eqUnchanged = f.store.inspect(itemId);
  assert.equal(eqUnchanged.location.kind, 'pending');

  // 2. Clear a slot in bag and claim reward
  await f.store.run(async tx => {
    const bag = await tx.get(bagId);
    delete bag.slots[5];
    tx.set(bag.id, bag);
  });

  const resClaim = await f.mailService.execute({
    ...f.envelope,
    command: 'reward.claim',
    operationId: 'op-reward-claim-success',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      grantId,
    },
  });
  assert.equal(resClaim.outcome.status, 'committed');
  assert.equal(resClaim.outcome.data.grantId, grantId);
  assert.equal(resClaim.outcome.data.itemId, itemId);
  assert.equal(resClaim.outcome.data.state, 'delivered');

  // Verify grant updated to delivered
  const grantDelivered = f.store.inspect(grantId);
  assert.equal(grantDelivered.deliveryState, 'delivered');
  assert.ok(grantDelivered.deliveredAt);

  // Verify equipment location moved into container
  const eqDelivered = f.store.inspect(itemId);
  assert.equal(eqDelivered.location.kind, 'container');
  assert.equal(eqDelivered.location.containerId, bagId);
  assert.equal(eqDelivered.enhancementLevel, 5); // Kept original stats

  // Verify backpack slot 5 holds the equipment
  const bagAfter = f.store.inspect(bagId);
  assert.equal(bagAfter.slots[5].kind, 'equipment');
  assert.equal(bagAfter.slots[5].itemId, itemId);

  // Claiming again rejects ALREADY_DELIVERED
  const resAlready = await f.mailService.execute({
    ...f.envelope,
    command: 'reward.claim',
    operationId: 'op-reward-already',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      grantId,
    },
  });
  assert.equal(resAlready.outcome.status, 'rejected');
  assert.equal(resAlready.outcome.code, 'ALREADY_DELIVERED');
});

test('mail.list, reward.list, and delivery.summary queries accurately report state', async () => {
  const f = await fixture();

  // 1. Check HUD delivery.summary initially (novice mail is unread)
  const hud1 = await f.mailService.getDeliverySummary({
    protocolVersion: 2,
    query: 'delivery.summary',
    requestId: 'req-hud-1',
    sessionId: f.session.sessionId,
    sessionEpoch: f.session.sessionEpoch,
    payload: { characterId: f.characterId },
  });
  assert.ok(hud1.data);
  assert.equal(hud1.data.unreadMailCount, 1);
  assert.equal(hud1.data.pendingCount, 0);

  // 2. Query mail.list
  const mailList = await f.mailService.getMailList({
    protocolVersion: 2,
    query: 'mail.list',
    requestId: 'req-mail-list-1',
    sessionId: f.session.sessionId,
    sessionEpoch: f.session.sessionEpoch,
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      cursor: null,
      pageRequest: 20,
    },
  });
  assert.ok(mailList.data);
  assert.equal(mailList.data.entries.length, 1);
  assert.equal(mailList.data.entries[0].mailId, f.noviceMailId);
  assert.equal(mailList.data.entries[0].attachments.length, 3);
  assert.equal(mailList.data.entries[0].read, false);

  // 3. Mark mail read
  await f.mailService.execute({
    ...f.envelope,
    command: 'mail.markRead',
    operationId: 'op-read-summary',
    expected: [],
    payload: { characterId: f.characterId, contextId: f.contextId, mailId: f.noviceMailId },
  });

  // Since novice mail still has unclaimed attachments, unreadMailCount remains 1
  const hud2 = await f.mailService.getDeliverySummary({
    protocolVersion: 2,
    query: 'delivery.summary',
    requestId: 'req-hud-2',
    sessionId: f.session.sessionId,
    sessionEpoch: f.session.sessionEpoch,
    payload: { characterId: f.characterId },
  });
  assert.equal(hud2.data.unreadMailCount, 1);

  // 4. Query reward.list (empty initially)
  const rewardList1 = await f.mailService.getRewardList({
    protocolVersion: 2,
    query: 'reward.list',
    requestId: 'req-reward-list-1',
    sessionId: f.session.sessionId,
    sessionEpoch: f.session.sessionEpoch,
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      cursor: null,
      pageRequest: 20,
    },
  });
  assert.ok(rewardList1.data);
  assert.equal(rewardList1.data.entries.length, 0);
});

test('idempotency: replaying same operationId returns original outcome', async () => {
  const f = await fixture();

  const first = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.markRead',
    operationId: 'op-idem-1',
    expected: [],
    payload: { characterId: f.characterId, contextId: f.contextId, mailId: f.noviceMailId },
  });
  assert.equal(first.outcome.status, 'committed');
  assert.equal(first.replayed, false);

  // Exact same intent and operationId
  const replay = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.markRead',
    operationId: 'op-idem-1',
    expected: [],
    payload: { characterId: f.characterId, contextId: f.contextId, mailId: f.noviceMailId },
  });
  assert.equal(replay.outcome.status, 'committed');
  assert.equal(replay.replayed, true);

  // Different payload with same operationId rejects OPERATION_MISMATCH
  const mismatch = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.markRead',
    operationId: 'op-idem-1',
    expected: [],
    payload: { characterId: f.characterId, contextId: f.contextId, mailId: 'mail:different' },
  });
  assert.equal(mismatch.outcome.status, 'rejected');
  assert.equal(mismatch.outcome.code, 'OPERATION_MISMATCH');
});
