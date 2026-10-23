import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/adapters/memory-store.ts';
import { createContextIdentityPort } from '../src/identity/identity-v2.ts';
import { LoginService } from '../src/identity/login-service.ts';
import { CharacterService, characterKey } from '../src/character/character-service.ts';
import { MailService } from '../src/mail/mail-service.ts';
import { MAX_STACK_QUANTITY } from '../src/mail/mail-rules.ts';

async function fixture() {
  const store = new MemoryStore();
  let currentTime = 1000;
  const clock = {
    now: () => currentTime,
    setNow: t => {
      currentTime = t;
    },
  };
  let subject = 'player-st08';

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
    payload: { classId: 'warrior', characterName: '战八' },
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

  async function addCustomMail(mailId, attachments, expiresAt = currentTime + 86400000) {
    await store.run(async tx => {
      const char = await tx.get(characterId);
      const mail = {
        schemaVersion: 2,
        id: mailId,
        accountId,
        characterId,
        sourceKey: `src-${mailId}`,
        titleKey: 'system_mail',
        bodyKey: 'system_body',
        parameters: {},
        expiresAt,
        status: 'active',
        readAt: null,
        version: 0,
        attachments,
        createdAt: currentTime,
        updatedAt: currentTime,
      };
      tx.set(mailId, mail);
      char.mailIds = [...(char.mailIds ?? []), mailId];
      tx.set(characterId, char);
    });
  }

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
    addCustomMail,
  };
}

test('batch execution limits each request to at most 4 items with cursor progression', async () => {
  const f = await fixture();

  // Create 2 mails with 3 attachments each = 6 candidate items
  await f.addCustomMail('mail-multi-1', [
    {
      attachmentId: 'att-1-1',
      kind: 'stack',
      templateRef: { id: 'potion-hp', version: 1 },
      quantityGranted: 5,
      quantityClaimed: 0,
      binding: { kind: 'none' },
      state: 'available',
    },
    {
      attachmentId: 'att-1-2',
      kind: 'stack',
      templateRef: { id: 'potion-mp', version: 1 },
      quantityGranted: 5,
      quantityClaimed: 0,
      binding: { kind: 'none' },
      state: 'available',
    },
    {
      attachmentId: 'att-1-3',
      kind: 'equipment',
      templateRef: { id: 'sword-iron', version: 1 },
      quantityGranted: 1,
      quantityClaimed: 0,
      binding: { kind: 'character', characterId: f.characterId },
      state: 'available',
      equipmentPayload: {
        itemLevel: 10,
        quality: 'white',
        slotKind: 'weapon',
      },
    },
  ]);

  await f.addCustomMail('mail-multi-2', [
    {
      attachmentId: 'att-2-1',
      kind: 'stack',
      templateRef: { id: 'potion-hp', version: 1 },
      quantityGranted: 2,
      quantityClaimed: 0,
      binding: { kind: 'none' },
      state: 'available',
    },
    {
      attachmentId: 'att-2-2',
      kind: 'equipment',
      templateRef: { id: 'chest-iron', version: 1 },
      quantityGranted: 1,
      quantityClaimed: 0,
      binding: { kind: 'none' },
      state: 'available',
      equipmentPayload: {
        itemLevel: 10,
        quality: 'green',
        slotKind: 'chest',
      },
    },
    {
      attachmentId: 'att-2-3',
      kind: 'stack',
      templateRef: { id: 'potion-mp', version: 1 },
      quantityGranted: 3,
      quantityClaimed: 0,
      binding: { kind: 'none' },
      state: 'available',
    },
  ]);

  // Step 1: Claim available with cursor: null (first step)
  const step1 = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.claimAvailable',
    operationId: 'op-batch-step-1',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      cursor: null,
      batchIntentId: 'batch-intent-1',
    },
  });

  assert.equal(step1.outcome.status, 'committed');
  assert.equal(step1.outcome.data.batchIntentId, 'batch-intent-1');
  assert.equal(step1.outcome.data.state, 'partial');
  assert.equal(step1.outcome.data.items.length, 4); // bounded to 4
  assert.equal(step1.outcome.data.nextCursor, '4');
  for (const it of step1.outcome.data.items) {
    assert.equal(it.status, 'committed');
    assert.ok(it.deliveredQuantity > 0);
  }

  // Step 2: Resume with nextCursor = '4'
  const step2 = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.claimAvailable',
    operationId: 'op-batch-step-2',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      cursor: '4',
      batchIntentId: 'batch-intent-1',
    },
  });

  assert.equal(step2.outcome.status, 'committed');
  assert.equal(step2.outcome.data.batchIntentId, 'batch-intent-1');
  assert.equal(step2.outcome.data.state, 'partial');
  assert.equal(step2.outcome.data.items.length, 4);
  assert.equal(step2.outcome.data.nextCursor, '8');

  // Step 3: Resume with nextCursor = '8'
  const step3 = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.claimAvailable',
    operationId: 'op-batch-step-3',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      cursor: '8',
      batchIntentId: 'batch-intent-1',
    },
  });

  assert.equal(step3.outcome.status, 'committed');
  assert.equal(step3.outcome.data.batchIntentId, 'batch-intent-1');
  assert.equal(step3.outcome.data.state, 'completed');
  assert.equal(step3.outcome.data.items.length, 1);
  assert.equal(step3.outcome.data.nextCursor, null);

  // Verify batch entity in store
  const batchEntity = f.store.inspect(`v2:batch:${f.accountId}:batch-intent-1`);
  assert.ok(batchEntity);
  assert.equal(batchEntity.state, 'completed');
  assert.equal(batchEntity.items.length, 9);
  assert.equal(batchEntity.cursor, null);
});

test('full bag equipment is skipped while subsequent stack item merges successfully (AC8)', async () => {
  const f = await fixture();

  // Fill character backpack to full capacity (20 slots)
  await f.store.run(async tx => {
    const char = await tx.get(f.characterId);
    const bag = await tx.get(char.backpackId);
    // Slot 0: Potion stack with quantity 17 (room for 3 more)
    bag.slots[0] = {
      kind: 'stack',
      stackId: 'stk-potion-hp-existing',
      templateRef: { id: 'potion-hp', version: 1 },
      quantity: 17,
      binding: { kind: 'none' },
      traceRef: 'tr-init',
    };
    // Slots 1..19: Filled with dummy equipment items so no empty slot exists
    for (let i = 1; i < 20; i++) {
      bag.slots[i] = {
        kind: 'equipment',
        itemId: `eq-dummy-${i}`,
        sortHeader: {
          itemLevel: 10,
          quality: 'white',
          slotKind: 'weapon',
        },
      };
    }
    bag.version++;
    tx.set(bag.id, bag);
  });

  // Create a mail with:
  // 1. Equipment (cannot fit -> full bag skip)
  // 2. Potion stack 5 (can fit 3 by merging into slot 0 -> partial commit!)
  // 3. Equipment (cannot fit -> full bag skip)
  // 4. Other stack potion-mp (no slot and no existing stack -> full bag skip)
  await f.addCustomMail('mail-bag-test', [
    {
      attachmentId: 'att-eq-skip-1',
      kind: 'equipment',
      templateRef: { id: 'sword-heavy', version: 1 },
      quantityGranted: 1,
      quantityClaimed: 0,
      binding: { kind: 'none' },
      state: 'available',
      equipmentPayload: { itemLevel: 10, quality: 'purple', slotKind: 'weapon' },
    },
    {
      attachmentId: 'att-stack-merge',
      kind: 'stack',
      templateRef: { id: 'potion-hp', version: 1 },
      quantityGranted: 5,
      quantityClaimed: 0,
      binding: { kind: 'none' },
      state: 'available',
    },
    {
      attachmentId: 'att-eq-skip-2',
      kind: 'equipment',
      templateRef: { id: 'boots-iron', version: 1 },
      quantityGranted: 1,
      quantityClaimed: 0,
      binding: { kind: 'none' },
      state: 'available',
      equipmentPayload: { itemLevel: 10, quality: 'green', slotKind: 'boots' },
    },
    {
      attachmentId: 'att-stack-no-room',
      kind: 'stack',
      templateRef: { id: 'potion-mp', version: 1 },
      quantityGranted: 5,
      quantityClaimed: 0,
      binding: { kind: 'none' },
      state: 'available',
    },
  ]);

  const explicitSelection = [
    { mailId: 'mail-bag-test', attachmentId: 'att-eq-skip-1' },
    { mailId: 'mail-bag-test', attachmentId: 'att-stack-merge' },
    { mailId: 'mail-bag-test', attachmentId: 'att-eq-skip-2' },
    { mailId: 'mail-bag-test', attachmentId: 'att-stack-no-room' },
  ];

  const res = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.claimAvailable',
    operationId: 'op-batch-skip-test',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      selection: explicitSelection,
      batchIntentId: 'batch-intent-skip',
    },
  });

  assert.equal(res.outcome.status, 'committed');
  const items = res.outcome.data.items;
  assert.equal(items.length, 4);

  // 1. Equipment skipped
  assert.equal(items[0].attachmentId, 'att-eq-skip-1');
  assert.equal(items[0].status, 'rejected');
  assert.equal(items[0].deliveredQuantity, 0);

  // 2. Potion stack merged (quantity 3 delivered)
  assert.equal(items[1].attachmentId, 'att-stack-merge');
  assert.equal(items[1].status, 'committed');
  assert.equal(items[1].deliveredQuantity, 3);

  // 3. Equipment skipped
  assert.equal(items[2].attachmentId, 'att-eq-skip-2');
  assert.equal(items[2].status, 'rejected');
  assert.equal(items[2].deliveredQuantity, 0);

  // 4. Stack no room skipped
  assert.equal(items[3].attachmentId, 'att-stack-no-room');
  assert.equal(items[3].status, 'rejected');
  assert.equal(items[3].deliveredQuantity, 0);

  // Verify bag slot 0 now has exactly 20 potions
  const char = f.store.inspect(f.characterId);
  const bag = f.store.inspect(char.backpackId);
  assert.equal(bag.slots[0].quantity, 20);
});

test('real-time expiry intercept skips expired mail item during step execution', async () => {
  const f = await fixture();

  // Create Mail A expiring at 2000 and Mail B expiring at 5000
  await f.addCustomMail(
    'mail-expire-soon',
    [
      {
        attachmentId: 'att-exp-1',
        kind: 'stack',
        templateRef: { id: 'potion-hp', version: 1 },
        quantityGranted: 5,
        quantityClaimed: 0,
        binding: { kind: 'none' },
        state: 'available',
      },
    ],
    2000,
  );

  await f.addCustomMail(
    'mail-valid',
    [
      {
        attachmentId: 'att-val-1',
        kind: 'stack',
        templateRef: { id: 'potion-hp', version: 1 },
        quantityGranted: 3,
        quantityClaimed: 0,
        binding: { kind: 'none' },
        state: 'available',
      },
    ],
    5000,
  );

  // Advance time past Mail A expiry (now = 2500)
  f.clock.setNow(2500);

  const res = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.claimAvailable',
    operationId: 'op-batch-exp-test',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      selection: [
        { mailId: 'mail-expire-soon', attachmentId: 'att-exp-1' },
        { mailId: 'mail-valid', attachmentId: 'att-val-1' },
      ],
      batchIntentId: 'batch-intent-exp',
    },
  });

  assert.equal(res.outcome.status, 'committed');
  const items = res.outcome.data.items;
  assert.equal(items.length, 2);

  // Mail A expired: rejected with 0 delivered
  assert.equal(items[0].attachmentId, 'att-exp-1');
  assert.equal(items[0].status, 'rejected');
  assert.equal(items[0].deliveredQuantity, 0);

  // Mail B valid: committed
  assert.equal(items[1].attachmentId, 'att-val-1');
  assert.equal(items[1].status, 'committed');
  assert.equal(items[1].deliveredQuantity, 3);
});

test('location re-verification blocks batch advancement after service closed and resumes on reopen', async () => {
  const f = await fixture();

  await f.addCustomMail('mail-resume-1', [
    {
      attachmentId: 'att-r-1',
      kind: 'stack',
      templateRef: { id: 'potion-hp', version: 1 },
      quantityGranted: 2,
      quantityClaimed: 0,
      binding: { kind: 'none' },
      state: 'available',
    },
    {
      attachmentId: 'att-r-2',
      kind: 'stack',
      templateRef: { id: 'potion-hp', version: 1 },
      quantityGranted: 2,
      quantityClaimed: 0,
      binding: { kind: 'none' },
      state: 'available',
    },
    {
      attachmentId: 'att-r-3',
      kind: 'stack',
      templateRef: { id: 'potion-hp', version: 1 },
      quantityGranted: 2,
      quantityClaimed: 0,
      binding: { kind: 'none' },
      state: 'available',
    },
    {
      attachmentId: 'att-r-4',
      kind: 'stack',
      templateRef: { id: 'potion-hp', version: 1 },
      quantityGranted: 2,
      quantityClaimed: 0,
      binding: { kind: 'none' },
      state: 'available',
    },
    {
      attachmentId: 'att-r-5',
      kind: 'stack',
      templateRef: { id: 'potion-hp', version: 1 },
      quantityGranted: 2,
      quantityClaimed: 0,
      binding: { kind: 'none' },
      state: 'available',
    },
  ]);

  // Step 1: Claim first 4 items
  const step1 = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.claimAvailable',
    operationId: 'op-resume-s1',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      cursor: null,
      batchIntentId: 'batch-resume-test',
    },
  });
  assert.equal(step1.outcome.status, 'committed');
  assert.equal(step1.outcome.data.nextCursor, '4');

  // Player closes mailbox / leaves NPC
  await f.store.run(async tx => {
    const ctx = await tx.get(f.contextId);
    ctx.status = 'closed';
    tx.set(f.contextId, ctx);
  });

  // Attempting step 2 with the old closed context must be rejected
  const rejected = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.claimAvailable',
    operationId: 'op-resume-s2-attempt',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      cursor: '4',
      batchIntentId: 'batch-resume-test',
    },
  });
  assert.equal(rejected.outcome.status, 'rejected');
  assert.equal(rejected.outcome.code, 'CONTEXT_INVALID');

  // Player re-interacts with NPC, opening a new context
  const newContextId = 'ctx_mailbox_test_2';
  await f.store.run(async tx => {
    tx.set(newContextId, {
      schemaVersion: 2,
      id: newContextId,
      accountId: f.accountId,
      characterId: f.characterId,
      rolePlayEpoch: 1,
      sceneEpoch: 1,
      locationRevision: 2,
      anchorId: 'anchor_mailbox',
      serviceKind: 'mailbox',
      issuedAt: 2000,
      status: 'open',
    });
  });

  // Advancing step 2 with the new valid context succeeds!
  const step2 = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.claimAvailable',
    operationId: 'op-resume-s2-success',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: newContextId,
      cursor: '4',
      batchIntentId: 'batch-resume-test',
    },
  });
  assert.equal(step2.outcome.status, 'committed');
  assert.equal(step2.outcome.data.state, 'completed');
  assert.equal(step2.outcome.data.nextCursor, null);
});

test('concurrent batches competing for same attachments preserve quantity conservation', async () => {
  const f = await fixture();

  await f.addCustomMail('mail-race', [
    {
      attachmentId: 'att-race-1',
      kind: 'stack',
      templateRef: { id: 'potion-hp', version: 1 },
      quantityGranted: 10,
      quantityClaimed: 0,
      binding: { kind: 'none' },
      state: 'available',
    },
  ]);

  const selection = [{ mailId: 'mail-race', attachmentId: 'att-race-1' }];

  // Batch A claims the attachment
  const batchA = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.claimAvailable',
    operationId: 'op-batch-a',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      selection,
      batchIntentId: 'batch-race-a',
    },
  });
  assert.equal(batchA.outcome.status, 'committed');
  assert.equal(batchA.outcome.data.items[0].status, 'committed');
  assert.equal(batchA.outcome.data.items[0].deliveredQuantity, 10);

  // Batch B attempts to claim the same attachment
  const batchB = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.claimAvailable',
    operationId: 'op-batch-b',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      selection,
      batchIntentId: 'batch-race-b',
    },
  });
  assert.equal(batchB.outcome.status, 'committed');
  // Batch B item is rejected as already delivered (deliveredQuantity = 0)
  assert.equal(batchB.outcome.data.items[0].status, 'rejected');
  assert.equal(batchB.outcome.data.items[0].deliveredQuantity, 0);

  // Ensure total delivered across both batches is strictly 10
  const mail = f.store.inspect('mail-race');
  assert.equal(mail.attachments[0].quantityClaimed, 10);
});

test('child operation receipts and recovery via operation.get', async () => {
  const f = await fixture();

  await f.addCustomMail('mail-child-op', [
    {
      attachmentId: 'att-c-1',
      kind: 'stack',
      templateRef: { id: 'potion-hp', version: 1 },
      quantityGranted: 2,
      quantityClaimed: 0,
      binding: { kind: 'none' },
      state: 'available',
    },
  ]);

  const res = await f.mailService.execute({
    ...f.envelope,
    command: 'mail.claimAvailable',
    operationId: 'op-parent-batch',
    expected: [],
    payload: {
      characterId: f.characterId,
      contextId: f.contextId,
      selection: [{ mailId: 'mail-child-op', attachmentId: 'att-c-1' }],
      batchIntentId: 'batch-child-test',
    },
  });

  assert.equal(res.outcome.status, 'committed');
  const childOpId = res.outcome.data.items[0].childOperationId;
  assert.equal(childOpId, 'batch-child-test-c0');

  // Query operation.get on parent batch
  const parentQuery = await f.mailService.query({
    protocolVersion: 2,
    query: 'operation.get',
    requestId: 'req-op-parent',
    sessionId: f.session.sessionId,
    sessionEpoch: f.session.sessionEpoch,
    payload: { operationId: 'op-parent-batch' },
  });
  assert.equal(parentQuery.data.status, 'found');
  assert.equal(parentQuery.data.command, 'mail.claimAvailable');

  // Query operation.get on child operation
  const childQuery = await f.mailService.query({
    protocolVersion: 2,
    query: 'operation.get',
    requestId: 'req-op-child',
    sessionId: f.session.sessionId,
    sessionEpoch: f.session.sessionEpoch,
    payload: { operationId: childOpId },
  });
  assert.equal(childQuery.data.status, 'found');
  assert.equal(childQuery.data.command, 'mail.claimAttachment');
  assert.equal(childQuery.data.result.outcome.data.deliveredQuantity, 2);
});

test('multi-step execution across 20 candidates continues to completion', async () => {
  const f = await fixture();

  // Create explicit selection of 20 stack attachments across 5 mails
  const selection = [];
  for (let m = 0; m < 5; m++) {
    const mailId = `mail-twenty-${m}`;
    const attachments = [];
    for (let a = 0; a < 4; a++) {
      const attachmentId = `att-twenty-${m}-${a}`;
      attachments.push({
        attachmentId,
        kind: 'stack',
        templateRef: { id: 'potion-hp', version: 1 },
        quantityGranted: 1,
        quantityClaimed: 0,
        binding: { kind: 'none' },
        state: 'available',
      });
      selection.push({ mailId, attachmentId });
    }
    await f.addCustomMail(mailId, attachments);
  }

  assert.equal(selection.length, 20);

  let cursor = null;
  let totalSteps = 0;
  let totalDelivered = 0;
  let lastState = 'pending';

  while (lastState !== 'completed') {
    totalSteps++;
    const res = await f.mailService.execute({
      ...f.envelope,
      command: 'mail.claimAvailable',
      operationId: `op-twenty-step-${totalSteps}`,
      expected: [],
      payload:
        totalSteps === 1
          ? {
              characterId: f.characterId,
              contextId: f.contextId,
              selection,
              batchIntentId: 'batch-twenty-test',
            }
          : {
              characterId: f.characterId,
              contextId: f.contextId,
              cursor,
              batchIntentId: 'batch-twenty-test',
            },
    });

    assert.equal(res.outcome.status, 'committed');
    assert.ok(res.outcome.data.items.length <= 4);
    for (const it of res.outcome.data.items) {
      if (it.status === 'committed') {
        totalDelivered += it.deliveredQuantity;
      }
    }
    cursor = res.outcome.data.nextCursor;
    lastState = res.outcome.data.state;
  }

  assert.equal(totalSteps, 5); // 20 / 4 = 5 steps
  assert.equal(totalDelivered, 20);
  assert.equal(cursor, null);

  const batchEntity = f.store.inspect(`v2:batch:${f.accountId}:batch-twenty-test`);
  assert.equal(batchEntity.items.length, 20);
  assert.equal(batchEntity.state, 'completed');
});

