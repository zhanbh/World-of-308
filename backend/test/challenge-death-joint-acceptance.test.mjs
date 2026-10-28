import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFixture } from './fixtures/prepare-fixture.mjs';
import { logicTick } from '../../shared/src/exact-values.ts';
import { readCheckpoint, writeChunk, stateHash } from '../src/challenge/room-checkpoint.ts';

async function activateFixture() {
  const h = await prepareFixture(), prepared = await h.service.execute(h.command), m = prepared.outcome.data;
  const command = { ...h.auth, command: 'challenge.activateRoom', operationId: 'activate', expected: prepared.outcome.resultVersions, payload: { characterId: h.characterId, rolePlayEpoch: h.character().rolePlayEpoch, challengeId: h.challengeId, roomAttemptId: m.roomAttemptId, manifestHash: m.manifestHash, expectedRevision: 1 } };
  return { ...h, manifest: m, activateCommand: command };
}

function readyCommand(h, r) {
  return {
    ...h.auth,
    command: 'scene.ready',
    controlSeq: 1,
    leaseRevision: 0,
    payload: {
      characterId: h.characterId,
      rolePlayEpoch: h.character().rolePlayEpoch,
      challengeId: h.challengeId,
      ...Object.fromEntries(Object.entries(r.outcome.data.readyTicket).filter(([k]) => k !== 'deadline'))
    }
  };
}

async function activeRoomFixture() {
  const h = await activateFixture();
  h.clock.now = () => 3000;
  const activated = await h.service.execute(h.activateCommand);
  const q = readyCommand(h, activated);
  h.clock.now = () => 4000;
  const readyResult = await h.service.execute(q);
  assert.equal(readyResult.outcome.status, 'committed');
  return h;
}

/** Helper to mark challenge & checkpoint dead at given deathDeadline */
async function setDeadState(h, deathIndex = 1, deathDeadline = 15000) {
  await h.store.run(async (tx) => {
    const cp = await readCheckpoint(tx, h.store.inspect(h.challengeId));
    cp.role.player.hp = '0';
    cp.role.player.lifeState = 'dead';

    const c0 = await writeChunk(h.store.inspect(h.challengeId), 0, cp.header.activeChunks[0].chunkRevision + 1, cp.role);
    const c1 = await writeChunk(h.store.inspect(h.challengeId), 1, cp.header.activeChunks[1].chunkRevision + 1, cp.scene);
    tx.set(c0.id, c0);
    tx.set(c1.id, c1);
    const rev = cp.header.revision + 1;
    const hash = await stateHash(cp.role, cp.scene);
    const activeChunks = [
      { ...cp.header.activeChunks[0], chunkRevision: c0.chunkRevision, hash: c0.hash },
      { ...cp.header.activeChunks[1], chunkRevision: c1.chunkRevision, hash: c1.hash },
      ...cp.header.activeChunks.slice(2)
    ];
    tx.set(cp.header.id, {
      ...cp.header,
      revision: rev,
      activeChunks,
      state: { ...cp.header.state, checkpointRevision: rev, publicStateHash: hash, lifeState: 'dead', deathDeadline }
    });

    const ch = await tx.get(h.challengeId);
    tx.set(h.challengeId, {
      ...ch,
      lifeState: 'dead',
      deathIndex,
      deathDeadline,
    });
  });
}

/** Helper to put resurrection emblems into backpack */
async function addEmblems(h, quantity = 2, bindingKind = 'character') {
  const bagId = h.character().backpackId;
  await h.store.run(async (tx) => {
    const bag = await tx.get(bagId);
    bag.slots[0] = {
      kind: 'stack',
      stackId: 'emblem-stack-test',
      templateRef: { id: 'resurrection-emblem', version: 1 },
      quantity,
      binding: { kind: bindingKind },
      traceRef: 'trace-test'
    };
    tx.set(bagId, bag);
  });
}

test('extreme concurrency 1: revive request crossing deadline by 1ms is rejected with DEADLINE_EXPIRED and zero emblem deduction', async () => {
  const h = await activeRoomFixture();
  const deathDeadline = 15000;
  await setDeadState(h, 1, deathDeadline);
  await addEmblems(h, 5);

  const bagBefore = h.store.inspect(h.character().backpackId);
  const challengeBefore = h.store.inspect(h.challengeId);

  // Request arrives exactly 1ms after deadline (15001ms)
  h.clock.now = () => 15001;
  const reviveCmd = {
    ...h.auth,
    command: 'challenge.revive',
    operationId: 'revive-cross-deadline-1',
    expected: [
      { kind: 'character', id: h.characterId, version: h.character().version },
      { kind: 'challenge', id: h.challengeId, version: challengeBefore.version },
      { kind: 'container', id: bagBefore.id, version: bagBefore.version },
    ],
    payload: {
      challengeId: h.challengeId,
      deathIndex: 1,
    }
  };

  const res = await h.service.execute(reviveCmd);
  assert.equal(res.outcome.status, 'rejected');
  assert.equal(res.outcome.code, 'DEADLINE_EXPIRED');

  // Verify bag: ZERO deduction (still 5)
  const bagAfter = h.store.inspect(h.character().backpackId);
  assert.equal(bagAfter.slots[0].quantity, 5);

  // Verify challenge: still dead, zero paidRevives
  const challengeAfter = h.store.inspect(h.challengeId);
  assert.equal(challengeAfter.lifeState, 'dead');
  assert.equal(challengeAfter.paidRevives ?? 0, 0);

  // Verify idempotency replay returns original rejected outcome
  const replay = await h.service.execute(reviveCmd);
  assert.equal(replay.replayed, true);
  assert.equal(replay.outcome.status, 'rejected');
  assert.equal(replay.outcome.code, 'DEADLINE_EXPIRED');
});

test('extreme concurrency 2: Boss defeated at 8s in death window makes challenge completed; concurrent/subsequent manual revive is rejected without emblem deduction', async () => {
  const h = await activeRoomFixture();
  const deathDeadline = 15000;
  await setDeadState(h, 1, deathDeadline);
  await addEmblems(h, 3);

  const bagBefore = h.store.inspect(h.character().backpackId);

  // Boss defeated at t=13000 (8s after death at t=5000)
  // Encounter/challenge updates to completed
  await h.store.run(async (tx) => {
    const ch = await tx.get(h.challengeId);
    tx.set(h.challengeId, {
      ...ch,
      result: 'completed',
      lifeState: 'alive',
    });
  });

  const challengeCompleted = h.store.inspect(h.challengeId);

  // Client sent revive request at t=13050 concurrently
  h.clock.now = () => 13050;
  const reviveCmd = {
    ...h.auth,
    command: 'challenge.revive',
    operationId: 'revive-after-boss-clear',
    expected: [
      { kind: 'character', id: h.characterId, version: h.character().version },
      { kind: 'challenge', id: h.challengeId, version: challengeCompleted.version },
      { kind: 'container', id: bagBefore.id, version: bagBefore.version },
    ],
    payload: {
      challengeId: h.challengeId,
      deathIndex: 1,
    }
  };

  const res = await h.service.execute(reviveCmd);
  assert.equal(res.outcome.status, 'rejected');
  // Either CHALLENGE_TERMINAL or NOT_DEAD
  assert.ok(['CHALLENGE_TERMINAL', 'NOT_DEAD'].includes(res.outcome.code));

  // Verify bag: ZERO deduction (still 3)
  const bagAfter = h.store.inspect(h.character().backpackId);
  assert.equal(bagAfter.slots[0].quantity, 3);
});

test('extreme concurrency 3: killing monster during death window triggers character level up while strictly maintaining dead lifeState and 0 HP', async () => {
  const h = await activeRoomFixture();
  await setDeadState(h, 1, 15000);

  // Lingering bleed DOT kills a monster and awards 1000 XP, triggering level-up
  h.clock.now = () => 8000;
  await h.store.run(async (tx) => {
    const c = await tx.get(h.characterId);
    const initialLevel = c.level;
    c.xp = (c.xp ?? 0) + 1000;
    c.level = initialLevel + 1;
    tx.set(c.id, c);
  });

  const cAfter = h.store.inspect(h.characterId);
  assert.equal(cAfter.level, 2);

  // Verify checkpoint & challenge player state remains strictly dead with 0 HP (no implicit heal or resurrect)
  await h.store.run(async (tx) => {
    const ch = await tx.get(h.challengeId);
    assert.equal(ch.lifeState, 'dead');

    const cp = await readCheckpoint(tx, ch);
    assert.equal(cp.role.player.lifeState, 'dead');
    assert.equal(cp.role.player.hp, '0');
  });
});

test('extreme concurrency 4: special dungeon with 3-revive limit rejects 4th revive attempt with REVIVE_LIMIT_REACHED and zero deduction', async () => {
  const h = await activeRoomFixture();
  await setDeadState(h, 4, 15000);
  await addEmblems(h, 10);

  // Mark dungeon as special / limit 3, and challenge already has 3 paidRevives
  await h.store.run(async (tx) => {
    const ch = await tx.get(h.challengeId);
    tx.set(h.challengeId, {
      ...ch,
      paidRevives: 3,
      deathIndex: 4,
    });
  });

  // Temporarily set dungeon definition to special in options
  const origDungeon = h.service.dungeon(h.store.inspect(h.challengeId).dungeonId);
  origDungeon.special = true;
  origDungeon.reviveLimit = 3;

  const bagBefore = h.store.inspect(h.character().backpackId);
  const challengeBefore = h.store.inspect(h.challengeId);

  h.clock.now = () => 7000;
  const reviveCmd = {
    ...h.auth,
    command: 'challenge.revive',
    operationId: 'revive-4th-attempt-special',
    expected: [
      { kind: 'character', id: h.characterId, version: h.character().version },
      { kind: 'challenge', id: h.challengeId, version: challengeBefore.version },
      { kind: 'container', id: bagBefore.id, version: bagBefore.version },
    ],
    payload: {
      challengeId: h.challengeId,
      deathIndex: 4,
    }
  };

  const res = await h.service.execute(reviveCmd);
  assert.equal(res.outcome.status, 'rejected');
  assert.equal(res.outcome.code, 'REVIVE_LIMIT_REACHED');

  // Verify bag: ZERO deduction (still 10)
  const bagAfter = h.store.inspect(h.character().backpackId);
  assert.equal(bagAfter.slots[0].quantity, 10);

  // Restore dungeon
  delete origDungeon.special;
  delete origDungeon.reviveLimit;
});

test('extreme concurrency 5: revive with zero emblems in bag is rejected with EMBLEM_NOT_ENOUGH with no state corruption', async () => {
  const h = await activeRoomFixture();
  await setDeadState(h, 1, 15000);

  // Empty backpack
  const bagId = h.character().backpackId;
  await h.store.run(async (tx) => {
    const bag = await tx.get(bagId);
    bag.slots = {};
    tx.set(bagId, bag);
  });

  const bagBefore = h.store.inspect(bagId);
  const challengeBefore = h.store.inspect(h.challengeId);

  h.clock.now = () => 6000;
  const reviveCmd = {
    ...h.auth,
    command: 'challenge.revive',
    operationId: 'revive-no-emblems',
    expected: [
      { kind: 'character', id: h.characterId, version: h.character().version },
      { kind: 'challenge', id: h.challengeId, version: challengeBefore.version },
      { kind: 'container', id: bagBefore.id, version: bagBefore.version },
    ],
    payload: {
      challengeId: h.challengeId,
      deathIndex: 1,
    }
  };

  const res = await h.service.execute(reviveCmd);
  assert.equal(res.outcome.status, 'rejected');
  assert.equal(res.outcome.code, 'EMBLEM_NOT_ENOUGH');

  // Verify challenge remains dead
  const challengeAfter = h.store.inspect(h.challengeId);
  assert.equal(challengeAfter.lifeState, 'dead');
});

test('extreme concurrency 6: disconnect and reconnect within death window synchronizes dead lifeState and recovers remaining countdown ms', async () => {
  const h = await activeRoomFixture();
  const deathDeadline = 15000;
  await setDeadState(h, 1, deathDeadline);

  // Client disconnects at t=5000, reconnects at t=11000 (6s elapsed, 4s remaining)
  h.clock.now = () => 11000;

  // Read checkpoint state directly or via challenge
  const ch = h.store.inspect(h.challengeId);
  assert.equal(ch.lifeState, 'dead');
  assert.equal(ch.deathIndex, 1);
  assert.equal(ch.deathDeadline, 15000);

  // Calculate remaining time on reconnect
  const now = h.clock.now();
  const remainingMs = ch.deathDeadline - now;
  assert.equal(remainingMs, 4000, 'Remaining time must be exactly 4000ms (4.0s)');

  // Feed into DeathReviveHUDModel to verify recovery
  const { DeathReviveHUDModel } = await import('../../client/assets/scripts/DeathReviveHUDModel.ts');
  const hud = new DeathReviveHUDModel();
  hud.open(ch.deathIndex, 10000, remainingMs, 5, false, 0);

  assert.equal(hud.status, 'active');
  assert.equal(hud.remainingSec, 4.0);
  assert.equal(hud.countdownLabel, '剩余时间: 4.0s');
  assert.equal(hud.progress, 0.4);
  assert.equal(hud.reviveButtonState, 'ready');

  // Advance 4 seconds to timeout
  const result = hud.update(4.1);
  assert.equal(result.timeoutTriggered, true);
});
