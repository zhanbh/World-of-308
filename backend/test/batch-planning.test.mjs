import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planBatchFromMails,
  planBatchFromSelection,
  sliceBatchStep,
  MAX_BATCH_SCAN_MAILS,
  MAX_BATCH_CANDIDATES,
  BATCH_STEP_SIZE,
} from '../src/mail/batch-planning.ts';

test('planBatchFromMails scans up to 100 mails and caps at 20 candidates', () => {
  // Create 120 mails, each with 1 unclaimed attachment
  const mails = Array.from({ length: 120 }, (_, i) => ({
    schemaVersion: 2,
    id: `mail-${i}`,
    accountId: 'acc-1',
    characterId: 'char-1',
    sourceKey: `src-${i}`,
    titleKey: 'title',
    bodyKey: 'body',
    parameters: {},
    expiresAt: 5000000,
    status: 'active',
    readAt: null,
    version: 0,
    attachments: [
      {
        attachmentId: `att-${i}`,
        kind: 'stack',
        templateRef: { id: 'item:hp-potion', version: 1 },
        quantityGranted: 8,
        quantityClaimed: 0,
        binding: { kind: 'none' },
        state: 'available',
      },
    ],
    createdAt: 1000 + i, // ascending so mail-119 is newest
    updatedAt: 1000 + i,
  }));

  const plan = planBatchFromMails('batch-1', mails, 2000);
  assert.equal(plan.batchIntentId, 'batch-1');
  // Maximum candidates is strictly 20
  assert.equal(plan.candidates.length, 20);

  // Newest mail is mail-119, so first candidate is from mail-119
  assert.equal(plan.candidates[0].mailId, 'mail-119');
  assert.equal(plan.candidates[0].childOperationId, 'batch-1-c0');
  assert.equal(plan.candidates[19].childOperationId, 'batch-1-c19');
});

test('planBatchFromMails filters expired mails and fully claimed attachments', () => {
  const now = 2500;
  const mails = [
    // Expired mail
    {
      schemaVersion: 2,
      id: 'mail-expired',
      accountId: 'acc-1',
      characterId: 'char-1',
      sourceKey: 'src-exp',
      titleKey: 'title',
      bodyKey: 'body',
      parameters: {},
      expiresAt: 2400,
      status: 'active',
      version: 0,
      attachments: [
        {
          attachmentId: 'att-exp',
          kind: 'stack',
          templateRef: { id: 'item:hp-potion', version: 1 },
          quantityGranted: 8,
          quantityClaimed: 0,
          binding: { kind: 'none' },
          state: 'available',
        },
      ],
      createdAt: 2000,
      updatedAt: 2000,
    },
    // Active mail with 1 fully claimed and 1 unclaimed attachment
    {
      schemaVersion: 2,
      id: 'mail-mixed',
      accountId: 'acc-1',
      characterId: 'char-1',
      sourceKey: 'src-mix',
      titleKey: 'title',
      bodyKey: 'body',
      parameters: {},
      expiresAt: 5000,
      status: 'active',
      version: 0,
      attachments: [
        {
          attachmentId: 'att-claimed',
          kind: 'stack',
          templateRef: { id: 'item:mp-potion', version: 1 },
          quantityGranted: 8,
          quantityClaimed: 8,
          binding: { kind: 'none' },
          state: 'claimed',
        },
        {
          attachmentId: 'att-valid',
          kind: 'equipment',
          templateRef: { id: 'sword-1', version: 1 },
          quantityGranted: 1,
          quantityClaimed: 0,
          binding: { kind: 'none' },
          state: 'available',
        },
      ],
      createdAt: 2100,
      updatedAt: 2100,
    },
  ];

  const plan = planBatchFromMails('batch-filter', mails, now);
  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0].mailId, 'mail-mixed');
  assert.equal(plan.candidates[0].attachmentId, 'att-valid');
  assert.equal(plan.candidates[0].kind, 'equipment');
});

test('sliceBatchStep slices candidate items by 4 with accurate nextCursor', () => {
  const candidates = Array.from({ length: 10 }, (_, i) => ({
    mailId: `mail-${i}`,
    attachmentId: `att-${i}`,
    kind: 'stack',
    childOperationId: `batch-1-c${i}`,
  }));

  // Step 1: cursor null -> items 0..3
  const step1 = sliceBatchStep(candidates, null, 4);
  assert.equal(step1.stepItems.length, 4);
  assert.equal(step1.offset, 0);
  assert.equal(step1.stepItems[0].childOperationId, 'batch-1-c0');
  assert.equal(step1.stepItems[3].childOperationId, 'batch-1-c3');
  assert.equal(step1.nextCursor, '4');

  // Step 2: cursor "4" -> items 4..7
  const step2 = sliceBatchStep(candidates, '4', 4);
  assert.equal(step2.stepItems.length, 4);
  assert.equal(step2.offset, 4);
  assert.equal(step2.stepItems[0].childOperationId, 'batch-1-c4');
  assert.equal(step2.stepItems[3].childOperationId, 'batch-1-c7');
  assert.equal(step2.nextCursor, '8');

  // Step 3: cursor "8" -> items 8..9 (2 items remaining)
  const step3 = sliceBatchStep(candidates, '8', 4);
  assert.equal(step3.stepItems.length, 2);
  assert.equal(step3.offset, 8);
  assert.equal(step3.stepItems[0].childOperationId, 'batch-1-c8');
  assert.equal(step3.stepItems[1].childOperationId, 'batch-1-c9');
  assert.equal(step3.nextCursor, null);
});
