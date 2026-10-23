import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMailExpired,
  canDeleteMail,
  calculateStackClaimQuantity,
  canClaimEquipmentAttachment,
  MAX_STACK_QUANTITY,
} from '../src/mail/mail-rules.ts';

test('isMailExpired evaluates boundaries accurately', () => {
  const expiresAt = 1000000;
  assert.equal(isMailExpired({ expiresAt }, expiresAt - 1), false);
  assert.equal(isMailExpired({ expiresAt }, expiresAt), true);
  assert.equal(isMailExpired({ expiresAt }, expiresAt + 1), true);
});

test('canDeleteMail enforces protection when unclaimed attachments exist', () => {
  // 1. Mail with no attachments can be deleted
  assert.equal(canDeleteMail({ attachments: [] }), true);

  // 2. Mail with unclaimed attachment cannot be deleted
  assert.equal(
    canDeleteMail({
      attachments: [
        { quantityGranted: 8, quantityClaimed: 0 },
      ],
    }),
    false
  );

  // 3. Mail with partially claimed attachment cannot be deleted
  assert.equal(
    canDeleteMail({
      attachments: [
        { quantityGranted: 8, quantityClaimed: 5 },
      ],
    }),
    false
  );

  // 4. Mail with multiple attachments where all are claimed can be deleted
  assert.equal(
    canDeleteMail({
      attachments: [
        { quantityGranted: 8, quantityClaimed: 8 },
        { quantityGranted: 10, quantityClaimed: 10 },
      ],
    }),
    true
  );

  // 5. Mail with one claimed and one unclaimed cannot be deleted
  assert.equal(
    canDeleteMail({
      attachments: [
        { quantityGranted: 8, quantityClaimed: 8 },
        { quantityGranted: 10, quantityClaimed: 9 },
      ],
    }),
    false
  );
});

test('calculateStackClaimQuantity computes available capacity and partial delivery', () => {
  const templateRef = { id: 'item:hp-potion-small-v1', version: 1 };
  const binding = { kind: 'character', accountId: 'acc-1', characterId: 'char-1' };

  // 1. Empty backpack with capacity 20
  const emptyBag = {
    schemaVersion: 2,
    id: 'bag-1',
    accountId: 'acc-1',
    characterId: 'char-1',
    kind: 'backpack',
    capacity: 20,
    stage: 0,
    slots: {},
    version: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  assert.equal(calculateStackClaimQuantity(8, templateRef, binding, emptyBag), 8);
  assert.equal(calculateStackClaimQuantity(30, templateRef, binding, emptyBag), 30);

  // 2. Completely full bag with other items (0 empty slots, no matching stack)
  const fullBag = {
    ...emptyBag,
    slots: Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [
        i,
        {
          kind: 'stack',
          stackId: `stk-${i}`,
          templateRef: { id: 'item:other-item', version: 1 },
          quantity: 20,
          binding: { kind: 'none' },
          traceRef: `tr-${i}`,
        },
      ])
    ),
  };
  assert.equal(calculateStackClaimQuantity(8, templateRef, binding, fullBag), 0);

  // 3. Full bag (20 slots occupied) but contains 1 matching stack with space (quantity 17)
  const fullWithRoom = {
    ...emptyBag,
    slots: {
      ...fullBag.slots,
      0: {
        kind: 'stack',
        stackId: 'stk-matching',
        templateRef,
        quantity: 17,
        binding,
        traceRef: 'tr-0',
      },
    },
  };
  // Space is 20 - 17 = 3. Remaining requested is 8. Should claim exactly 3.
  assert.equal(calculateStackClaimQuantity(8, templateRef, binding, fullWithRoom), 3);
  // If remaining is 2, claims 2.
  assert.equal(calculateStackClaimQuantity(2, templateRef, binding, fullWithRoom), 2);

  // 4. Matching stack with different characterId should NOT merge
  const differentBindingBag = {
    ...emptyBag,
    slots: {
      ...fullBag.slots,
      0: {
        kind: 'stack',
        stackId: 'stk-diff',
        templateRef,
        quantity: 17,
        binding: { kind: 'character', accountId: 'acc-1', characterId: 'char-2' },
        traceRef: 'tr-0',
      },
    },
  };
  assert.equal(calculateStackClaimQuantity(8, templateRef, binding, differentBindingBag), 0);
});

test('canClaimEquipmentAttachment checks backpack slot availability', () => {
  const bag = {
    schemaVersion: 2,
    id: 'bag-1',
    accountId: 'acc-1',
    characterId: 'char-1',
    kind: 'backpack',
    capacity: 2,
    stage: 0,
    slots: {},
    version: 0,
    createdAt: 1,
    updatedAt: 1,
  };

  assert.equal(canClaimEquipmentAttachment(bag), true);

  bag.slots[0] = {
    kind: 'equipment',
    itemId: 'eq-1',
    sortHeader: { itemLevel: 10, quality: 'white', slotKind: 'weapon' },
  };
  assert.equal(canClaimEquipmentAttachment(bag), true);

  bag.slots[1] = {
    kind: 'equipment',
    itemId: 'eq-2',
    sortHeader: { itemLevel: 10, quality: 'white', slotKind: 'weapon' },
  };
  // Now 2/2 slots occupied
  assert.equal(canClaimEquipmentAttachment(bag), false);
});
