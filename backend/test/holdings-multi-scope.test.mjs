import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCandidateMissing,
  isSlotHeld,
  selectCandidateByStrategy,
  validateHoldingsSummaryIntegrity,
  getMissingCandidates,
} from '../src/challenge/drop-strategy.ts';
import { createBankFixture } from './fixtures/bank-fixture.mjs';
import { loginKey } from '../src/identity/identity-v2.ts';

const SLOTS = [
  'weapon', 'shoulder', 'chest', 'pants', 'belt', 'boots',
  'bracelet', 'necklace', 'ring', 'subEquip', 'magicStone',
];

const wearSlots = ['weapon', 'shoulder', 'chest', 'belt', 'pants', 'boots', 'earring'];

function makeGodSetCandidates() {
  const candidates = SLOTS.map(slot => ({
    kind: 'equipment',
    templateRef: { id: `god-set-${slot}`, version: 1 },
    quantity: 1,
    quality: 'orange',
    itemLevel: 30,
    binding: { kind: 'account' },
    equipment: {
      slotKind: slot,
      affixes: [],
      setRef: { id: 'warrior-god-set', version: 1 },
      durability: wearSlots.includes(slot)
        ? { wearEnabled: true, current: 100, max: 100, policyRef: 'combat-decay' }
        : { wearEnabled: false, current: null, max: null, policyRef: 'no-wear' },
    },
  }));

  const domain = {
    ref: 'bank-test-domain',
    keys: SLOTS.map(slot => ({
      collectionKey: `god-set-${slot}`,
      setId: 'warrior-god-set',
      setVersion: 1,
      itemLevel: 30,
      slotId: slot,
      classId: 'warrior',
    })),
  };

  return { candidates, domain };
}

test('Multi-Scope Coverage: 13-slot wear, bag, vault, mail and pending grant coverage', () => {
  const { candidates, domain } = makeGodSetCandidates();
  const now = 5000;

  // Character has:
  // - Weapon in equipped
  // - Shoulder in bag
  // - Chest in personal vault
  // - Belt in active unexpired mail (expires at 8000 > now 5000)
  // - Boots in pending grant
  // - Pants in account vault (shared)
  // - Ring, Necklace, Bracelet, SubEquip, MagicStone are MISSING
  const charSummary = {
    schemaVersion: 2,
    id: 'holdings:acct-1:character:char-1',
    accountId: 'acct-1',
    scope: 'character',
    characterId: 'char-1',
    revision: 1,
    domainRef: domain.ref,
    entries: [
      { collectionKey: 'god-set-weapon', permanentCount: 1, mailLatestExpiryAt: null },
      { collectionKey: 'god-set-shoulder', permanentCount: 1, mailLatestExpiryAt: null },
      { collectionKey: 'god-set-chest', permanentCount: 1, mailLatestExpiryAt: null },
      { collectionKey: 'god-set-belt', permanentCount: 0, mailLatestExpiryAt: 8000 },
      { collectionKey: 'god-set-boots', permanentCount: 1, mailLatestExpiryAt: null },
    ],
  };

  const accountSummary = {
    schemaVersion: 2,
    id: 'holdings:acct-1:account',
    accountId: 'acct-1',
    scope: 'account',
    revision: 1,
    domainRef: domain.ref,
    entries: [
      { collectionKey: 'god-set-pants', permanentCount: 1, mailLatestExpiryAt: null },
    ],
  };

  const context = {
    character: {
      id: 'char-1',
      accountId: 'acct-1',
      classId: 'warrior',
      level: 30,
    },
    summaries: [charSummary, accountSummary],
    holdingsDomain: domain,
    now,
    source: { kind: 'special', monsterLevel: 30 },
  };

  // Check held items:
  assert.equal(isSlotHeld('god-set-weapon', context.summaries, now), true, 'equipped weapon is held');
  assert.equal(isSlotHeld('god-set-shoulder', context.summaries, now), true, 'bag shoulder is held');
  assert.equal(isSlotHeld('god-set-chest', context.summaries, now), true, 'personal vault chest is held');
  assert.equal(isSlotHeld('god-set-belt', context.summaries, now), true, 'unexpired mail belt is held');
  assert.equal(isSlotHeld('god-set-boots', context.summaries, now), true, 'pending grant boots is held');
  assert.equal(isSlotHeld('god-set-pants', context.summaries, now), true, 'account vault pants is held');

  // Check missing items:
  assert.equal(isSlotHeld('god-set-ring', context.summaries, now), false, 'ring is missing');
  assert.equal(isSlotHeld('god-set-necklace', context.summaries, now), false, 'necklace is missing');
  assert.equal(isSlotHeld('god-set-bracelet', context.summaries, now), false, 'bracelet is missing');
  assert.equal(isSlotHeld('god-set-subEquip', context.summaries, now), false, 'subEquip is missing');
  assert.equal(isSlotHeld('god-set-magicStone', context.summaries, now), false, 'magicStone is missing');

  const missingList = getMissingCandidates(candidates, context);
  const missingSlots = missingList.map(c => c.equipment.slotKind);
  assert.deepEqual(missingSlots.sort(), ['bracelet', 'magicStone', 'necklace', 'ring', 'subEquip'].sort());
});

test('Dual-Character Private Isolation: Character A private assets never satisfy Character B missing slots', async () => {
  const { candidates, domain } = makeGodSetCandidates();
  const now = 1000;

  // Account acct-1 has two characters: char-A and char-B
  // Character A owns god-set-weapon and god-set-ring in private possession (bag/equipped/vault)
  const charASummary = {
    schemaVersion: 2,
    id: 'holdings:acct-1:character:char-A',
    accountId: 'acct-1',
    scope: 'character',
    characterId: 'char-A',
    revision: 1,
    domainRef: domain.ref,
    entries: [
      { collectionKey: 'god-set-weapon', permanentCount: 1, mailLatestExpiryAt: null },
      { collectionKey: 'god-set-ring', permanentCount: 1, mailLatestExpiryAt: null },
    ],
  };

  // Character B currently has 0 items in private possession
  const charBSummary = {
    schemaVersion: 2,
    id: 'holdings:acct-1:character:char-B',
    accountId: 'acct-1',
    scope: 'character',
    characterId: 'char-B',
    revision: 1,
    domainRef: domain.ref,
    entries: [],
  };

  // Public account vault has 0 items initially
  const accountSummaryEmpty = {
    schemaVersion: 2,
    id: 'holdings:acct-1:account',
    accountId: 'acct-1',
    scope: 'account',
    revision: 1,
    domainRef: domain.ref,
    entries: [],
  };

  // Context for Character B:
  const contextB = {
    character: {
      id: 'char-B',
      accountId: 'acct-1',
      classId: 'warrior',
      level: 30,
    },
    summaries: [charBSummary, accountSummaryEmpty],
    holdingsDomain: domain,
    now,
    source: { kind: 'special', monsterLevel: 30 },
  };

  // Even though Character A has weapon and ring, Character B MUST see all 11 slots as missing!
  const missingForB = getMissingCandidates(candidates, contextB);
  assert.equal(missingForB.length, 11, 'Character B misses all 11 slots despite Character A owning them');

  // Now, Character A transfers god-set-weapon into Account Vault:
  // Account scope now records permanentCount = 1 for god-set-weapon
  const accountSummaryWithWeapon = {
    schemaVersion: 2,
    id: 'holdings:acct-1:account',
    accountId: 'acct-1',
    scope: 'account',
    revision: 2,
    domainRef: domain.ref,
    entries: [
      { collectionKey: 'god-set-weapon', permanentCount: 1, mailLatestExpiryAt: null },
    ],
  };

  const contextBAfterDeposit = {
    ...contextB,
    summaries: [charBSummary, accountSummaryWithWeapon],
  };

  // Now Character B checks missing slots:
  const missingForBNow = getMissingCandidates(candidates, contextBAfterDeposit);
  assert.equal(missingForBNow.length, 10, 'Character B now has access to shared account vault weapon');
  assert.equal(missingForBNow.some(c => c.equipment.slotKind === 'weapon'), false, 'weapon is no longer missing for B');
  assert.equal(missingForBNow.some(c => c.equipment.slotKind === 'ring'), true, 'ring is still missing for B (remains in A private scope)');
});

test('Mail Expiration Boundary: now < expiry is held, now >= expiry is missing', () => {
  const { candidates, domain } = makeGodSetCandidates();
  const ringCandidate = candidates.find(c => c.equipment.slotKind === 'ring');

  const expiryTime = 10000;

  const makeMailContext = (currentTime) => ({
    character: { id: 'char-1', accountId: 'acct-1', classId: 'warrior', level: 30 },
    summaries: [
      {
        schemaVersion: 2,
        id: 'holdings:acct-1:character:char-1',
        accountId: 'acct-1',
        scope: 'character',
        characterId: 'char-1',
        revision: 1,
        domainRef: domain.ref,
        entries: [{ collectionKey: 'god-set-ring', permanentCount: 0, mailLatestExpiryAt: expiryTime }],
      },
      {
        schemaVersion: 2,
        id: 'holdings:acct-1:account',
        accountId: 'acct-1',
        scope: 'account',
        revision: 1,
        domainRef: domain.ref,
        entries: [],
      },
    ],
    holdingsDomain: domain,
    now: currentTime,
    source: { kind: 'special', monsterLevel: 30 },
  });

  // 1 millisecond before expiry: HELD
  assert.equal(isCandidateMissing(ringCandidate, makeMailContext(9999)), false, 'now < expiry must be considered held');

  // Exact millisecond of expiry: EXPIRED -> MISSING
  assert.equal(isCandidateMissing(ringCandidate, makeMailContext(10000)), true, 'now == expiry must be considered expired/missing');

  // After expiry: EXPIRED -> MISSING
  assert.equal(isCandidateMissing(ringCandidate, makeMailContext(10001)), true, 'now > expiry must be considered expired/missing');
});

test('Holdings Integrity Protections: Rejects corrupted summaries without awarding phantom items', () => {
  const { candidates, domain } = makeGodSetCandidates();
  const now = 1000;

  const validCharSummary = {
    schemaVersion: 2,
    id: 'holdings:acct-1:character:char-1',
    accountId: 'acct-1',
    scope: 'character',
    characterId: 'char-1',
    revision: 1,
    domainRef: domain.ref,
    entries: [{ collectionKey: 'god-set-weapon', permanentCount: 1, mailLatestExpiryAt: null }],
  };

  const validAccountSummary = {
    schemaVersion: 2,
    id: 'holdings:acct-1:account',
    accountId: 'acct-1',
    scope: 'account',
    revision: 1,
    domainRef: domain.ref,
    entries: [],
  };

  const profile = {
    profileId: 'integrity-check-profile',
    version: 1,
    schemaVersion: 1,
    strategyId: 'missing-slot-first',
    fallbackStrategy: 'weighted-random',
    candidates,
    holdingsDomain: domain,
  };

  // Valid summaries pass integrity check
  assert.doesNotThrow(() => validateHoldingsSummaryIntegrity(validCharSummary, 'character', 'char-1', domain));
  assert.doesNotThrow(() => validateHoldingsSummaryIntegrity(validAccountSummary, 'account', 'char-1', domain));

  // Corruption 1: Negative permanentCount (-1)
  const corruptNegative = structuredClone(validCharSummary);
  corruptNegative.entries[0].permanentCount = -1;
  assert.throws(() => validateHoldingsSummaryIntegrity(corruptNegative, 'character', 'char-1', domain));
  assert.throws(() => selectCandidateByStrategy(profile, 0, {
    character: { id: 'char-1', accountId: 'acct-1', classId: 'warrior', level: 30 },
    summaries: [corruptNegative, validAccountSummary],
    holdingsDomain: domain,
    now,
    source: { kind: 'special', monsterLevel: 30 },
  }));

  // Corruption 2: Mismatched domainRef
  const corruptDomain = { ...validCharSummary, domainRef: 'wrong-domain-ref' };
  assert.throws(() => validateHoldingsSummaryIntegrity(corruptDomain, 'character', 'char-1', domain));

  // Corruption 3: Character ID mismatch (Character A summary passed for Character B)
  assert.throws(() => validateHoldingsSummaryIntegrity(validCharSummary, 'character', 'char-2', domain));

  // Corruption 4: Unknown collectionKey not present in domain.keys
  const corruptKey = structuredClone(validCharSummary);
  corruptKey.entries[0].collectionKey = 'forged-illegal-collection-key';
  assert.throws(() => validateHoldingsSummaryIntegrity(corruptKey, 'character', 'char-1', domain));

  // Corruption 5: Schema version mismatch
  const corruptSchema = { ...validCharSummary, schemaVersion: 1 };
  assert.throws(() => validateHoldingsSummaryIntegrity(corruptSchema, 'character', 'char-1', domain));
});

test('Ground Drops Exclusion: Uncollected ground drops do not count towards holdings', async () => {
  const { candidates, domain } = makeGodSetCandidates();
  const now = 2000;

  // Player killed boss, ground drop for god-set-necklace is lying on floor (not collected into bag)
  // Therefore character holdings entries do NOT contain god-set-necklace
  const charSummaryWithoutNecklace = {
    schemaVersion: 2,
    id: 'holdings:acct-1:character:char-1',
    accountId: 'acct-1',
    scope: 'character',
    characterId: 'char-1',
    revision: 1,
    domainRef: domain.ref,
    entries: [
      { collectionKey: 'god-set-weapon', permanentCount: 1, mailLatestExpiryAt: null },
    ],
  };

  const accountSummaryEmpty = {
    schemaVersion: 2,
    id: 'holdings:acct-1:account',
    accountId: 'acct-1',
    scope: 'account',
    revision: 1,
    domainRef: domain.ref,
    entries: [],
  };

  const context = {
    character: { id: 'char-1', accountId: 'acct-1', classId: 'warrior', level: 30 },
    summaries: [charSummaryWithoutNecklace, accountSummaryEmpty],
    holdingsDomain: domain,
    now,
    source: { kind: 'special', monsterLevel: 30 },
  };

  const necklaceCandidate = candidates.find(c => c.equipment.slotKind === 'necklace');
  assert.equal(isCandidateMissing(necklaceCandidate, context), true, 'uncollected ground drop is still missing');
});


test('BankService deposit into accountVault updates account holdings and shares with Character B', async () => {
  const { candidates } = makeGodSetCandidates();
  const domain = {
    ref: 'bank-test-domain',
    keys: [
      ...SLOTS.map(slot => ({
        collectionKey: `god-set-${slot}-warrior`,
        setId: 'warrior-god-set',
        setVersion: 1,
        itemLevel: 30,
        slotId: slot,
        classId: 'warrior',
      })),
      ...SLOTS.map(slot => ({
        collectionKey: `god-set-${slot}-hunter`,
        setId: 'warrior-god-set',
        setVersion: 1,
        itemLevel: 30,
        slotId: slot,
        classId: 'hunter',
      })),
    ],
  };

  const f = await createBankFixture({ holdingsDomain: domain });
  const weaponItem = candidates.find(c => c.equipment.slotKind === 'weapon');

  const charAId = f.characterId;
  const accountId = f.account().id;

  // Setup Character B (Hunter) on the same account for dual-character isolation
  const charBId = 'isolated-second-role';
  const bagBId = 'isolated-second-bag';
  const vaultBId = 'isolated-second-vault';
  const charBHoldingsKey = await loginKey('holdings', [accountId, 'character', charBId]);

  await f.store.run(async tx => {
    const acct = await tx.get(accountId);
    tx.set(charBId, { ...f.character(), id: charBId, characterId: charBId, classId: 'hunter', backpackId: bagBId, personalVaultId: vaultBId, equipped: {} });
    tx.set(bagBId, { ...f.bag(), id: bagBId, characterId: charBId, slots: {} });
    tx.set(vaultBId, { ...f.vault(), id: vaultBId, characterId: charBId, slots: {} });
    tx.set(accountId, { ...acct, characterIdsByClass: { ...acct.characterIdsByClass, hunter: charBId } });
    tx.set(charBHoldingsKey, {
      schemaVersion: 2,
      id: charBHoldingsKey,
      accountId,
      scope: 'character',
      characterId: charBId,
      revision: 1,
      domainRef: domain.ref,
      entries: [],
    });
  });

  const weaponId = 'eq-god-weapon-1';
  const charAHoldingsKey = await loginKey('holdings', [accountId, 'character', charAId]);
  const accountHoldingsKey = await loginKey('holdings', [accountId, 'account']);

  // Seed weapon into Char A's bag and holdings
  await f.store.run(async tx => {
    tx.set(weaponId, {
      schemaVersion: 2,
      id: weaponId,
      accountId,
      holderCharacterId: charAId,
      sourceKey: 'src-test',
      sourceOrdinal: 0,
      sourceLocator: { kind: 'grant', grantId: 'src-test' },
      templateRef: weaponItem.templateRef,
      slotKind: weaponItem.equipment.slotKind,
      itemLevel: weaponItem.itemLevel,
      quality: weaponItem.quality,
      rolledAffixes: weaponItem.equipment.affixes,
      setRef: weaponItem.equipment.setRef,
      binding: { kind: 'account', accountId },
      enhancementLevel: 0,
      durability: { wearEnabled: true, current: 100, max: 100, policyRef: 'combat-decay' },
      location: { kind: 'container', containerId: f.bag().id },
      lifecycle: 'active',
      version: 1,
      createdAt: 1000,
      updatedAt: 1000,
    });
    tx.set(f.bag().id, {
      ...f.bag(),
      slots: {
        0: {
          kind: 'equipment',
          itemId: weaponId,
          sortHeader: { itemLevel: 30, quality: 'orange', slotKind: 'weapon' },
        },
      },
    });
    const summaryA = await tx.get(charAHoldingsKey);
    tx.set(charAHoldingsKey, {
      ...summaryA,
      entries: [
        { collectionKey: 'god-set-weapon-warrior', permanentCount: 1, mailLatestExpiryAt: null },
      ],
    });
  });

  // Check state before deposit:
  // Character A has weapon, Character B misses weapon
  const initialCharAHoldings = f.store.inspect(charAHoldingsKey);
  const initialAccountHoldings = f.store.inspect(accountHoldingsKey);
  const initialCharBHoldings = f.store.inspect(charBHoldingsKey);

  assert.equal(isCandidateMissing(weaponItem, {
    character: { id: charAId, accountId, classId: 'warrior', level: 30 },
    summaries: [initialCharAHoldings, initialAccountHoldings],
    holdingsDomain: domain,
    now: 1000,
    source: { kind: 'special', monsterLevel: 30 },
  }), false, 'Character A has weapon in bag');

  assert.equal(isCandidateMissing(weaponItem, {
    character: { id: charBId, accountId, classId: 'hunter', level: 30 },
    summaries: [initialCharBHoldings, initialAccountHoldings],
    holdingsDomain: domain,
    now: 1000,
    source: { kind: 'special', monsterLevel: 30 },
  }), true, 'Character B misses weapon before deposit');

  // Character A deposits set weapon into Account Vault
  const transferCmd = f.transfer({ kind: 'equipment', itemId: weaponId }, 1, 'accountVault');
  const depositRes = await f.service.execute(transferCmd);
  assert.equal(depositRes.outcome.status, 'committed', JSON.stringify(depositRes));

  // Check state after deposit:
  const updatedCharAHoldings = f.store.inspect(charAHoldingsKey);
  const updatedAccountHoldings = f.store.inspect(accountHoldingsKey);

  const charAWeaponEntry = updatedCharAHoldings.entries.find(e => e.collectionKey === 'god-set-weapon-warrior');
  assert.equal(charAWeaponEntry.permanentCount, 0, 'Char A holdings decremented');

  const acctWarriorWeaponEntry = updatedAccountHoldings.entries.find(e => e.collectionKey === 'god-set-weapon-warrior');
  const acctHunterWeaponEntry = updatedAccountHoldings.entries.find(e => e.collectionKey === 'god-set-weapon-hunter');
  assert.equal(acctWarriorWeaponEntry.permanentCount, 1, 'Account vault warrior holdings incremented');
  assert.equal(acctHunterWeaponEntry.permanentCount, 1, 'Account vault hunter holdings incremented');

  // Now verify Character B missing slot detection!
  // Character B now sees weapon as HELD via Account Vault!
  assert.equal(isCandidateMissing(weaponItem, {
    character: { id: charBId, accountId, classId: 'hunter', level: 30 },
    summaries: [initialCharBHoldings, updatedAccountHoldings],
    holdingsDomain: domain,
    now: 1000,
    source: { kind: 'special', monsterLevel: 30 },
  }), false, 'Character B now has access to weapon via shared Account Vault');
});
