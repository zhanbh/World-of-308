import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDropStrategyProfile,
  validateSpecialDungeonQualification,
  isCandidateMissing,
  selectCandidateByStrategy,
} from '../src/challenge/drop-strategy.ts';
import { terminalFixture } from './fixtures/terminal-fixture.mjs';
import { ChallengeService } from '../src/challenge/challenge-service.ts';
import { manifestDigest } from '../../shared/src/room-manifest.ts';
import { loginKey } from '../src/identity/identity-v2.ts';

const SLOTS = [
  'weapon', 'shoulder', 'chest', 'pants', 'belt', 'boots',
  'bracelet', 'necklace', 'ring', 'subEquip', 'magicStone',
];

function makeSetCandidates() {
  const wearSlots = ['weapon', 'shoulder', 'chest', 'belt', 'pants', 'boots', 'earring'];
  const candidates = SLOTS.map(slot => ({
    kind: 'equipment',
    templateRef: { id: `test-set-${slot}`, version: 1 },
    quantity: 1,
    quality: 'orange',
    itemLevel: 30,
    binding: { kind: 'character' },
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

function makeContext(
  ownedSlots,
  now = 1000,
  sourceKind = 'special',
  monsterLevel = 30,
  charLevel = 30,
) {
  const { domain } = makeSetCandidates();

  const charEntries = ownedSlots.map(slot => ({
    collectionKey: `god-set-${slot}`,
    permanentCount: 1,
    mailLatestExpiryAt: null,
  }));

  const context = {
    character: {
      id: 'test-char-1',
      accountId: 'test-acct-1',
      classId: 'warrior',
      level: charLevel,
      equipped: {},
      statsVersion: 1,
      backpackId: 'bag-1',
      vaultId: 'vault-1',
      mailIds: [],
      rolePlayEpoch: 1,
    },
    summaries: [
      {
        schemaVersion: 2,
        scope: 'character',
        characterId: 'test-char-1',
        revision: 1,
        domainRef: domain.ref,
        entries: charEntries,
      },
      {
        schemaVersion: 2,
        scope: 'account',
        revision: 1,
        domainRef: domain.ref,
        entries: [],
      },
    ],
    holdingsDomain: domain,
    now,
    source: {
      kind: sourceKind,
      monsterLevel,
    },
  };

  return { context, domain };
}

test('validateDropStrategyProfile: validates valid profile and rejects malformed configs', () => {
  const { candidates, domain } = makeSetCandidates();

  const valid = {
    profileId: 'valid-special-set-strategy',
    version: 1,
    schemaVersion: 1,
    strategyId: 'missing-slot-first',
    fallbackStrategy: 'weighted-random',
    parameters: { missingWeight: 3, normalWeight: 1 },
    candidates,
    holdingsDomain: domain,
  };

  assert.equal(validateDropStrategyProfile(valid), valid);

  // Invalid profileId
  assert.throws(() => validateDropStrategyProfile({ ...valid, profileId: '' }));
  assert.throws(() => validateDropStrategyProfile({ ...valid, profileId: 'bad id with spaces' }));

  // Invalid version
  assert.throws(() => validateDropStrategyProfile({ ...valid, version: 0 }));
  assert.throws(() => validateDropStrategyProfile({ ...valid, version: -1 }));

  // Invalid schemaVersion
  assert.throws(() => validateDropStrategyProfile({ ...valid, schemaVersion: 2 }));

  // Invalid strategyId
  assert.throws(() => validateDropStrategyProfile({ ...valid, strategyId: 'unknown-strategy' }));

  // Invalid fallbackStrategy
  assert.throws(() => validateDropStrategyProfile({ ...valid, fallbackStrategy: 'invalid-fallback' }));

  // Invalid parameter weights
  assert.throws(() => validateDropStrategyProfile({ ...valid, parameters: { missingWeight: 0 } }));
  assert.throws(() => validateDropStrategyProfile({ ...valid, parameters: { normalWeight: -1 } }));

  // Missing domain when set equipment is present
  assert.throws(() => validateDropStrategyProfile({ ...valid, holdingsDomain: undefined }));
});

test('validateSpecialDungeonQualification: enforces 30-level special dungeon gate for set items', () => {
  const { candidates } = makeSetCandidates();
  const setCandidate = candidates[0];
  const nonSetCandidate = {
    kind: 'equipment',
    templateRef: { id: 'plain-ore', version: 1 },
    quantity: 1,
    quality: 'white',
    itemLevel: 10,
    binding: { kind: 'none' },
    equipment: {
      slotKind: 'weapon',
      affixes: [],
      setRef: undefined,
      durability: { wearEnabled: false, current: null, max: null, policyRef: 'no-wear' },
    },
  };

  // Set candidate in level 30 special dungeon: PASS
  assert.doesNotThrow(() => validateSpecialDungeonQualification(setCandidate, { kind: 'special', monsterLevel: 30 }, 30));

  // Set candidate in ordinary dungeon: REJECT
  assert.throws(() => validateSpecialDungeonQualification(setCandidate, { kind: 'first', monsterLevel: 30 }, 30));

  // Set candidate in special dungeon with monster level < 30: REJECT
  assert.throws(() => validateSpecialDungeonQualification(setCandidate, { kind: 'special', monsterLevel: 25 }, 30));

  // Set candidate when player level < 30: REJECT
  assert.throws(() => validateSpecialDungeonQualification(setCandidate, { kind: 'special', monsterLevel: 30 }, 29));

  // Non-set candidate in ordinary dungeon: PASS
  assert.doesNotThrow(() => validateSpecialDungeonQualification(nonSetCandidate, { kind: 'first', monsterLevel: 10 }, 10));
});

test('Strategy 1 - weighted-random: uniformly selects items by sample index without missing priority', () => {
  const { candidates, domain } = makeSetCandidates();
  const profile = {
    profileId: 'weighted-random-profile',
    version: 1,
    schemaVersion: 1,
    strategyId: 'weighted-random',
    candidates,
    holdingsDomain: domain,
  };

  // Player owns 10 slots, only 'ring' is missing
  const owned = SLOTS.filter(s => s !== 'ring');
  const { context } = makeContext(owned);

  const selectedSlots = new Set();
  for (let sample = 0; sample < candidates.length; sample++) {
    const item = selectCandidateByStrategy(profile, sample, context);
    selectedSlots.add(item.equipment.slotKind);
  }

  // All 11 slots are reachable according to sample index
  assert.equal(selectedSlots.size, 11);
  // Specifically, owned slots can still be selected (duplicates allowed in weighted-random)
  assert.ok(selectedSlots.has('weapon'));
  assert.ok(selectedSlots.has('ring'));
});

test('Strategy 2 - missing-slot-first: strictly prioritizes unheld slots, and falls back smoothly on full set', () => {
  const { candidates, domain } = makeSetCandidates();
  const profile = {
    profileId: 'missing-first-profile',
    version: 1,
    schemaVersion: 1,
    strategyId: 'missing-slot-first',
    fallbackStrategy: 'weighted-random',
    candidates,
    holdingsDomain: domain,
  };

  // Case A: 10 slots owned, exactly 1 slot ('ring') missing
  {
    const owned = SLOTS.filter(s => s !== 'ring');
    const { context } = makeContext(owned);

    // 100 samples with different seeds must ALL select 'ring'
    for (let sample = 0; sample < 100; sample++) {
      const item = selectCandidateByStrategy(profile, sample, context);
      assert.equal(item.equipment.slotKind, 'ring', `sample ${sample} must select missing ring`);
    }
  }

  // Case B: 3 slots missing ('weapon', 'boots', 'ring')
  {
    const missingExpected = ['weapon', 'boots', 'ring'];
    const owned = SLOTS.filter(s => !missingExpected.includes(s));
    const { context } = makeContext(owned);

    const observed = new Set();
    for (let sample = 0; sample < 100; sample++) {
      const item = selectCandidateByStrategy(profile, sample, context);
      const slot = item.equipment.slotKind;
      assert.ok(missingExpected.includes(slot), `must only select from missing slots, got ${slot}`);
      observed.add(slot);
    }
    // All 3 missing slots were selected across samples
    assert.equal(observed.size, 3);
  }

  // Case C: All 11 slots owned (full set collected) -> smooth fallback to weighted-random
  {
    const owned = [...SLOTS];
    const { context } = makeContext(owned);

    const observedFull = new Set();
    for (let sample = 0; sample < candidates.length; sample++) {
      const item = selectCandidateByStrategy(profile, sample, context);
      observedFull.add(item.equipment.slotKind);
    }
    // Smoothly selects from pool without throwing or rejecting
    assert.equal(observedFull.size, 11);
  }
});

test('Strategy 3 - weighted-missing-first: applies configured weight ratio (e.g. 2:1) favoring missing slots', () => {
  const { candidates, domain } = makeSetCandidates();
  const profile = {
    profileId: 'weighted-missing-first-profile',
    version: 1,
    schemaVersion: 1,
    strategyId: 'weighted-missing-first',
    parameters: { missingWeight: 2, normalWeight: 1 },
    candidates,
    holdingsDomain: domain,
  };

  // 1 missing slot ('ring'), 10 owned slots
  // Missing weight = 2, Owned weight = 1 each (10 * 1 = 10)
  // Total virtual list length = 2 + 10 = 12
  // Ring occupies 2 slots out of 12 (16.67% of outcomes), while each owned slot occupies 1 out of 12 (8.33%)
  const owned = SLOTS.filter(s => s !== 'ring');
  const { context } = makeContext(owned);

  let ringCount = 0;
  let otherSlotSampleCount = 0;

  for (let sample = 0; sample < 1200; sample++) {
    const item = selectCandidateByStrategy(profile, sample, context);
    if (item.equipment.slotKind === 'ring') {
      ringCount++;
    } else if (item.equipment.slotKind === 'weapon') {
      otherSlotSampleCount++;
    }
  }

  // Ring should be chosen approximately twice as often as weapon
  // With 1200 samples across 12 items: expected ring = 200, expected weapon = 100
  assert.equal(ringCount, 200, 'missing slot ring received 2x weight');
  assert.equal(otherSlotSampleCount, 100, 'owned slot weapon received 1x weight');
});

test('Full Challenge settlement integration: terminal respects custom DropStrategyProfile', async () => {
  const h = await terminalFixture({ enemyCount: 8 });
  const { candidates, domain } = makeSetCandidates();

  // Configure terminal with DropStrategyProfile
  h.content.terminal.equipment = candidates;
  h.content.terminal.holdingsDomain = domain;
  h.content.terminal.strategyProfile = {
    profileId: 'terminal-special-strategy',
    version: 1,
    schemaVersion: 1,
    strategyId: 'missing-slot-first',
    fallbackStrategy: 'weighted-random',
    candidates,
    holdingsDomain: domain,
  };

  // Configure dungeon as level 30 special
  Object.assign(
    h.content.dungeons.find(d => d.dungeonId === h.store.inspect(h.challengeId).dungeonId),
    {
      kind: 'special',
      minLevel: 30,
      maxMonsterLevel: 30,
      difficulties: [{
        difficultyId: 'normal',
        roomCost: 3,
        levels: { 30: { monsterStatsRef: 'terminal-monsters', equipmentSourceRef: 'terminal-equipment' } },
      }],
    },
  );

  await h.store.run(async tx => {
    const ch = await tx.get(h.challengeId);
    tx.set(ch.id, {
      ...ch,
      monsterLevel: 30,
      terminalConfigHash: await manifestDigest({ terminal: h.content.terminal, rewards: h.content.rewards }),
    });

    // Populate holdings: player owns 10 slots, missing 'belt'
    const hid = await loginKey('holdings', [h.character().accountId, 'character', h.characterId]);
    const owned = SLOTS.filter(s => s !== 'belt');
    tx.set(hid, {
      schemaVersion: 2,
      id: hid,
      accountId: h.character().accountId,
      scope: 'character',
      characterId: h.characterId,
      revision: 1,
      domainRef: domain.ref,
      entries: owned.map(s => ({ collectionKey: `god-set-${s}`, permanentCount: 1, mailLatestExpiryAt: null })),
    });
  });

  h.service = new ChallengeService({
    store: h.store,
    clock: h.clock,
    identity: h.identity,
    content: h.content,
  });

  const result = await h.service.execute(await h.command());
  assert.equal(result.outcome.status, 'committed', JSON.stringify(result));

  const receipt = (await h.query()).clearReceipt;
  const awardedItem = h.store.inspect(receipt.itemId);

  // Assert awarded item is specifically the missing 'belt'
  assert.equal(awardedItem.slotKind, 'belt', 'missing-slot-first profile must award missing belt');
  assert.equal(awardedItem.setRef.id, 'warrior-god-set');
});


test('isCandidateMissing: accurately handles permanent, active mail, expired mail, and account vault holdings', () => {
  const { candidates, domain } = makeSetCandidates();
  const beltCandidate = candidates.find(c => c.equipment.slotKind === 'belt');
  const ringCandidate = candidates.find(c => c.equipment.slotKind === 'ring');
  const bootsCandidate = candidates.find(c => c.equipment.slotKind === 'boots');
  const weaponCandidate = candidates.find(c => c.equipment.slotKind === 'weapon');

  const now = 2000;

  const context = {
    character: {
      id: 'char-1',
      accountId: 'acct-1',
      classId: 'warrior',
      level: 30,
    },
    summaries: [
      {
        scope: 'character',
        characterId: 'char-1',
        revision: 1,
        domainRef: domain.ref,
        entries: [
          // Belt is permanently owned
          { collectionKey: 'god-set-belt', permanentCount: 1, mailLatestExpiryAt: null },
          // Ring has an active unexpired mail (expires at 3000 > now 2000)
          { collectionKey: 'god-set-ring', permanentCount: 0, mailLatestExpiryAt: 3000 },
          // Boots has an expired mail (expires at 1500 <= now 2000)
          { collectionKey: 'god-set-boots', permanentCount: 0, mailLatestExpiryAt: 1500 },
        ],
      },
      {
        scope: 'account',
        revision: 1,
        domainRef: domain.ref,
        entries: [
          // Weapon is owned in account vault
          { collectionKey: 'god-set-weapon', permanentCount: 1, mailLatestExpiryAt: null },
        ],
      },
    ],
    holdingsDomain: domain,
    now,
    source: { kind: 'special', monsterLevel: 30 },
  };

  // Belt: permanentCount = 1 -> NOT missing
  assert.equal(isCandidateMissing(beltCandidate, context), false, 'permanent belt is held');

  // Ring: active unexpired mail -> NOT missing (held in mailbox)
  assert.equal(isCandidateMissing(ringCandidate, context), false, 'active mail ring is held');

  // Boots: expired mail -> IS MISSING (mail expired, slot restored to missing)
  assert.equal(isCandidateMissing(bootsCandidate, context), true, 'expired mail boots is missing');

  // Weapon: owned in account vault -> NOT missing (shared holding)
  assert.equal(isCandidateMissing(weaponCandidate, context), false, 'account vault weapon is held');

  // Shoulder: completely absent from summaries -> IS MISSING
  const shoulderCandidate = candidates.find(c => c.equipment.slotKind === 'shoulder');
  assert.equal(isCandidateMissing(shoulderCandidate, context), true, 'absent shoulder is missing');
});

test('Ordinary dungeon cannot issue set equipment via custom DropStrategyProfile', async () => {
  const h = await terminalFixture();
  const { candidates, domain } = makeSetCandidates();

  h.content.terminal.equipment = candidates;
  h.content.terminal.holdingsDomain = domain;
  h.content.terminal.strategyProfile = {
    profileId: 'ordinary-illegal-strategy',
    version: 1,
    schemaVersion: 1,
    strategyId: 'missing-slot-first',
    candidates,
    holdingsDomain: domain,
  };

  // Dungeon remains kind: 'first' (ordinary story dungeon)
  await h.store.run(async tx => {
    const ch = await tx.get(h.challengeId);
    tx.set(ch.id, {
      ...ch,
      terminalConfigHash: await manifestDigest({ terminal: h.content.terminal, rewards: h.content.rewards }),
    });
  });

  h.service = new ChallengeService({
    store: h.store,
    clock: h.clock,
    identity: h.identity,
    content: h.content,
  });

  const before = h.store.snapshot();
  const result = await h.service.execute(await h.command());
  assert.equal(result.outcome.code, 'CONFIG_NOT_READY', 'ordinary dungeon cannot drop set items');
  assert.deepEqual(h.store.snapshot(), before);
});
