import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveDropSample,
  remapCandidate,
  selectCandidateByStrategy,
  validateDropStrategyProfile,
} from '../src/challenge/drop-strategy.ts';
import { planClear } from '../src/challenge/terminal-settlement.ts';
import { terminalFixture } from './fixtures/terminal-fixture.mjs';
import { ChallengeService } from '../src/challenge/challenge-service.ts';
import { manifestDigest } from '../../shared/src/room-manifest.ts';
import { loginKey } from '../src/identity/identity-v2.ts';

const SET_SLOTS = [
  'weapon', 'shoulder', 'chest', 'pants', 'belt', 'boots',
  'bracelet', 'necklace', 'ring', 'subEquip', 'magicStone',
];

function makeSetCandidates() {
  const wearSlots = ['weapon', 'shoulder', 'chest', 'belt', 'pants', 'boots'];
  const candidates = SET_SLOTS.map(slot => ({
    kind: 'equipment',
    templateRef: { id: `god-set-${slot}-tpl`, version: 1 },
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
    keys: SET_SLOTS.map(slot => ({
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

test('deriveDropSample: deterministically generates identical base sample from sourceKey and configRef without drift', async () => {
  const sourceKey = 'clearSource:challenge-uuid-12345';
  const configRef = 'terminal-special-v1';

  const sample1 = await deriveDropSample(sourceKey, configRef);
  const sample2 = await deriveDropSample(sourceKey, configRef);
  const sample3 = await deriveDropSample(sourceKey, configRef);

  assert.equal(typeof sample1, 'number');
  assert.ok(Number.isSafeInteger(sample1) && sample1 >= 0);
  assert.equal(sample1, sample2, 'repeated derivations produce identical sample');
  assert.equal(sample2, sample3, 'sample is immutable for fixed sourceKey and config');

  // Different sourceKey produces different sample
  const differentSource = await deriveDropSample('clearSource:challenge-other-999', configRef);
  assert.notEqual(sample1, differentSource, 'different source produces distinct sample');

  // Different config produces different sample
  const differentConfig = await deriveDropSample(sourceKey, 'terminal-special-v2');
  assert.notEqual(sample1, differentConfig, 'different config produces distinct sample');
});

test('OCC conflict retry: base sample stays strictly fixed, candidate remaps smoothly to remaining missing slot', async () => {
  const { candidates, domain } = makeSetCandidates();
  const profile = {
    profileId: 'occ-test-profile',
    version: 1,
    schemaVersion: 1,
    strategyId: 'missing-slot-first',
    fallbackStrategy: 'weighted-random',
    candidates,
    holdingsDomain: domain,
  };

  // Find a sample value such that when 2 slots are missing ('shoulder' and 'chest'),
  // missingCandidates[sample % 2] selects 'chest' (index 1)
  // Let player own all slots EXCEPT 'shoulder' and 'chest'
  const ownedInitially = SET_SLOTS.filter(s => s !== 'shoulder' && s !== 'chest');
  const { context } = makeContext(ownedInitially);

  // Derive fixed base sample from challenge source
  const sourceKey = await loginKey('clearSource', ['occ-retry-challenge-1']);
  const fixedSample = await deriveDropSample(sourceKey, 'terminal-test-occ');

  // Attempt 1: First transaction evaluation
  const firstSelected = selectCandidateByStrategy(profile, fixedSample, context);
  const firstSelectedSlot = firstSelected.equipment.slotKind;
  assert.ok(
    firstSelectedSlot === 'shoulder' || firstSelectedSlot === 'chest',
    `first attempt must select one of the missing slots, got ${firstSelectedSlot}`,
  );

  // Simulate concurrent OCC transaction commit:
  // Another concurrent transaction just committed and awarded the slot that was firstSelected!
  // Character holdings summary is updated: revision increments from 1 to 2, and firstSelectedSlot is now held!
  const updatedOwned = [...ownedInitially, firstSelectedSlot];
  const { context: retryContext } = makeContext(updatedOwned);
  retryContext.summaries[0].revision = 2; // Bump revision

  // Attempt 2 (OCC Retry):
  // The transaction retries. Crucially, the base sample MUST NOT be re-rolled (no sample drift).
  // The exact same fixedSample is passed into remapCandidate / selectCandidateByStrategy.
  const remappedSelected = remapCandidate(profile, fixedSample, retryContext);
  const remappedSlot = remappedSelected.equipment.slotKind;

  // The remaining missing slot must be selected
  const otherSlot = firstSelectedSlot === 'shoulder' ? 'chest' : 'shoulder';
  assert.equal(
    remappedSlot,
    otherSlot,
    `on OCC retry, fixed sample ${fixedSample} must remap to the remaining missing slot (${otherSlot}) without sample drift`,
  );
});

test('11-piece full set smooth safe fallback: delegates to fallbackStrategy without error or rejection', () => {
  const { candidates, domain } = makeSetCandidates();

  // Test with missing-slot-first
  {
    const profile = {
      profileId: 'full-set-fallback-profile',
      version: 1,
      schemaVersion: 1,
      strategyId: 'missing-slot-first',
      fallbackStrategy: 'weighted-random',
      candidates,
      holdingsDomain: domain,
    };

    // All 11 slots are owned
    const allOwned = [...SET_SLOTS];
    const { context } = makeContext(allOwned);

    // Across 110 different samples, fallbackStrategy awards items across all 11 slots
    const awardedSlots = new Set();
    for (let sample = 0; sample < 110; sample++) {
      const item = selectCandidateByStrategy(profile, sample, context);
      assert.ok(item && item.equipment?.setRef, 'awarded item is a valid set equipment');
      assert.ok(SET_SLOTS.includes(item.equipment.slotKind), 'slot is within the 11 set pieces');
      awardedSlots.add(item.equipment.slotKind);
    }

    assert.equal(awardedSlots.size, 11, 'all 11 slots are distributed via weighted-random fallback');
  }

  // Test with weighted-missing-first
  {
    const profile = {
      profileId: 'weighted-full-set-fallback-profile',
      version: 1,
      schemaVersion: 1,
      strategyId: 'weighted-missing-first',
      fallbackStrategy: 'weighted-random',
      parameters: { missingWeight: 3, normalWeight: 1 },
      candidates,
      holdingsDomain: domain,
    };

    const allOwned = [...SET_SLOTS];
    const { context } = makeContext(allOwned);

    const awardedSlots = new Set();
    for (let sample = 0; sample < 110; sample++) {
      const item = selectCandidateByStrategy(profile, sample, context);
      assert.ok(item && item.equipment?.setRef);
      assert.ok(SET_SLOTS.includes(item.equipment.slotKind));
      awardedSlots.add(item.equipment.slotKind);
    }

    assert.equal(awardedSlots.size, 11, 'weighted-missing-first smoothly falls back to weighted-random when all 11 pieces are owned');
  }
});

test('End-to-end full 11-piece collection progression followed by 12th clear smooth fallback', async () => {
  const { candidates, domain } = makeSetCandidates();
  const profile = {
    profileId: 'collection-progression-profile',
    version: 1,
    schemaVersion: 1,
    strategyId: 'missing-slot-first',
    fallbackStrategy: 'weighted-random',
    candidates,
    holdingsDomain: domain,
  };

  const collectedSlots = [];
  const sourceBase = 'clearSource:progression-challenge-';

  // Progressively clear and collect all 11 pieces
  for (let round = 0; round < 11; round++) {
    const { context } = makeContext(collectedSlots);
    const sample = await deriveDropSample(`${sourceBase}${round}`, profile.profileId);
    const item = selectCandidateByStrategy(profile, sample, context);
    const slot = item.equipment.slotKind;

    assert.ok(
      !collectedSlots.includes(slot),
      `round ${round + 1}: selected slot ${slot} must be currently unheld, already have [${collectedSlots.join(', ')}]`,
    );
    collectedSlots.push(slot);
  }

  assert.equal(collectedSlots.length, 11, 'successfully collected all 11 set pieces');

  // 12th round: all 11 pieces are held -> must trigger smooth fallback
  const { context: fullContext } = makeContext(collectedSlots);
  const sample12 = await deriveDropSample(`${sourceBase}12`, profile.profileId);
  const item12 = selectCandidateByStrategy(profile, sample12, fullContext);

  assert.ok(item12 && item12.equipment?.setRef, '12th clear awards valid set equipment');
  assert.ok(collectedSlots.includes(item12.equipment.slotKind), '12th clear awards an existing set piece via fallback');
});

test('Terminal settlement immutability: planClear returns cached receipt idempotently on repeat calls', async () => {
  const h = await terminalFixture({ enemyCount: 8 });
  const { candidates, domain } = makeSetCandidates();

  h.content.terminal.equipment = candidates;
  h.content.terminal.holdingsDomain = domain;
  h.content.terminal.strategyProfile = {
    profileId: 'immutability-test-strategy',
    version: 1,
    schemaVersion: 1,
    strategyId: 'missing-slot-first',
    fallbackStrategy: 'weighted-random',
    candidates,
    holdingsDomain: domain,
  };

  const source = { kind: 'special', monsterLevel: 30 };
  const challengeId = h.challengeId;

  // Setup character & holdings
  let char, bag;
  await h.store.run(async tx => {
    char = await tx.get(h.characterId);
    char.level = 30;
    tx.set(char.id, char);

    bag = await tx.get(char.backpackId);

    const hid = await loginKey('holdings', [char.accountId, 'character', char.id]);
    tx.set(hid, {
      schemaVersion: 2,
      id: hid,
      accountId: char.accountId,
      scope: 'character',
      characterId: char.id,
      revision: 1,
      domainRef: domain.ref,
      entries: [],
    });

    const aid = await loginKey('holdings', [char.accountId, 'account']);
    tx.set(aid, {
      schemaVersion: 2,
      id: aid,
      accountId: char.accountId,
      scope: 'account',
      revision: 1,
      domainRef: domain.ref,
      entries: [],
    });
  });

  // First call to planClear: commits equipment
  let clear1;
  await h.store.run(async tx => {
    clear1 = await planClear(tx, char, bag, challengeId, h.content.terminal, 1000, source);
  });

  assert.ok(clear1.itemId, 'first call generates itemId');
  assert.ok(clear1.equipment, 'first call generates equipment view');
  const committedItem = h.store.inspect(clear1.itemId);
  assert.ok(committedItem, 'equipment is persisted in store');

  // Second call to planClear with the SAME challengeId (simulating repeat/replay invocation):
  // Must return the exact cached equipment and route idempotently without duplicate inserts
  let clear2;
  await h.store.run(async tx => {
    clear2 = await planClear(tx, char, bag, challengeId, h.content.terminal, 2000, source);
  });

  assert.equal(clear2.itemId, clear1.itemId, 'repeat call returns identical itemId');
  assert.equal(clear2.sourceKey, clear1.sourceKey, 'repeat call returns identical sourceKey');
  assert.equal(clear2.route, clear1.route, 'repeat call returns identical route');
  assert.deepEqual(clear2.equipment, clear1.equipment, 'repeat call returns identical equipment snapshot');
});

test('ChallengeService submission idempotency: packet replay returns exact clearReceipt with replayed: true', async () => {
  const h = await terminalFixture({ enemyCount: 8 });
  const { candidates, domain } = makeSetCandidates();

  h.content.terminal.equipment = candidates;
  h.content.terminal.holdingsDomain = domain;
  h.content.terminal.strategyProfile = {
    profileId: 'service-replay-strategy',
    version: 1,
    schemaVersion: 1,
    strategyId: 'missing-slot-first',
    fallbackStrategy: 'weighted-random',
    candidates,
    holdingsDomain: domain,
  };

  // Configure special dungeon
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

    const hid = await loginKey('holdings', [h.character().accountId, 'character', h.characterId]);
    tx.set(hid, {
      schemaVersion: 2,
      id: hid,
      accountId: h.character().accountId,
      scope: 'character',
      characterId: h.characterId,
      revision: 1,
      domainRef: domain.ref,
      entries: [],
    });
  });

  h.service = new ChallengeService({
    store: h.store,
    clock: h.clock,
    identity: h.identity,
    content: h.content,
  });

  const cmd = await h.command();

  // First execution: commits
  const result1 = await h.service.execute(cmd);
  assert.equal(result1.outcome.status, 'committed');
  assert.equal(result1.replayed, false);

  const queryAfterFirst = await h.query();
  const clearReceipt1 = queryAfterFirst.clearReceipt;
  assert.ok(clearReceipt1, 'challenge.get returns clearReceipt');
  assert.equal(clearReceipt1.sceneState, 'looting');

  // Second execution of the exact same command (packet loss / network retry):
  const result2 = await h.service.execute(cmd);
  assert.equal(result2.outcome.status, 'committed');
  assert.equal(result2.replayed, true, 'repeated submission returns replayed: true');

  // Verify clearReceipt is unchanged
  const queryAfterSecond = await h.query();
  const clearReceipt2 = queryAfterSecond.clearReceipt;
  assert.deepEqual(clearReceipt1, clearReceipt2, 'clearReceipt is completely immutable across replays');
});
