import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFixture } from './fixtures/prepare-fixture.mjs';
import { LoginService } from '../src/identity/login-service.ts';
import { readCheckpoint } from '../src/challenge/room-checkpoint.ts';

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

test('1. explicit challenge.leave with reason abandon safely terminates challenge as failed, sets town portal location, and preserves loot/xp without refunding stamina', async () => {
  const h = await activeRoomFixture();
  h.clock.now = () => 5000;

  // Award kill XP to verify it is retained upon exit
  await h.store.run(async (tx) => {
    const c = await tx.get(h.characterId);
    c.xp = 75;
    tx.set(c.id, c);
  });

  const leaveCmd = {
    ...h.auth,
    command: 'challenge.leave',
    operationId: 'leave-abandon-test-1',
    expected: [],
    payload: {
      challengeId: h.challengeId,
      reason: 'abandon',
    }
  };

  const res = await h.service.execute(leaveCmd);
  assert.equal(res.outcome.status, 'committed');
  assert.equal(res.outcome.data.challengeId, h.challengeId);
  assert.equal(res.outcome.data.result, 'failed');
  assert.equal(res.outcome.data.sceneState, 'closed');
  assert.equal(res.outcome.data.returnAnchorRef, 'town:town-map-1:first');
  assert.ok(typeof res.outcome.data.staminaSettlementRef === 'string' && res.outcome.data.staminaSettlementRef.length > 0);

  // Character location: town portal anchor
  const charAfter = h.character();
  assert.equal(charAfter.location.kind, 'town');
  assert.equal(charAfter.location.mapId, 'town-map-1');
  assert.equal(charAfter.location.anchorId, 'dungeon:first');
  assert.equal(charAfter.townState?.position.x, 100);
  assert.equal(charAfter.townState?.position.y, 100);
  assert.equal(charAfter.staminaReservation, undefined);
  assert.equal(charAfter.stamina.value, 307); // 308 - 1 room cost = 307, not refunded!
  assert.equal(charAfter.xp, 75); // Kill XP retained!

  // Account pointers cleared
  const accAfter = h.account();
  assert.equal(accAfter.openSceneChallengeId, undefined);
  assert.equal(accAfter.activeChallengeId, undefined);

  // Challenge in store is terminal failed and closed
  const chalAfter = h.store.inspect(h.challengeId);
  assert.equal(chalAfter.result, 'failed');
  assert.equal(chalAfter.sceneState, 'closed');
  assert.equal(chalAfter.staminaSettlement.state, 'settled');

  // Checkpoint header marked closed
  const cpHeader = await h.store.run(async (tx) => {
    const { loginKey } = await import('../src/identity/identity-v2.ts');
    return tx.get(await loginKey('cpHeader', [h.challengeId]));
  });
  assert.equal(cpHeader.acceptingInputs, false);
});

test('2. explicit challenge.leave with reason deathTimeout safely transitions dead player to failed/closed and returns to town', async () => {
  const h = await activeRoomFixture();
  h.clock.now = () => 5000;

  // Set player dead with deadline
  await h.store.run(async (tx) => {
    const ch = await tx.get(h.challengeId);
    tx.set(h.challengeId, {
      ...ch,
      lifeState: 'dead',
      deathIndex: 1,
      deathDeadline: 15000,
    });
  });

  h.clock.now = () => 15000;
  const leaveCmd = {
    ...h.auth,
    command: 'challenge.leave',
    operationId: 'leave-deathtimeout-test',
    expected: [],
    payload: {
      challengeId: h.challengeId,
      reason: 'deathTimeout',
    }
  };

  const res = await h.service.execute(leaveCmd);
  assert.equal(res.outcome.status, 'committed');
  assert.equal(res.outcome.data.result, 'failed');
  assert.equal(res.outcome.data.sceneState, 'closed');
  assert.equal(res.outcome.data.returnAnchorRef, 'town:town-map-1:first');

  const charAfter = h.character();
  assert.equal(charAfter.location.kind, 'town');
  assert.equal(charAfter.location.anchorId, 'dungeon:first');
  assert.equal(h.account().openSceneChallengeId, undefined);
});

test('3. death countdown timeout: challenge.revive at or after deathDeadline returns DEADLINE_EXPIRED, transitions challenge to failed/closed, and zero emblems deducted', async () => {
  const h = await activeRoomFixture();
  h.clock.now = () => 5000;
  const bagId = h.character().backpackId;

  // Add 1 resurrection emblem to bag and set challenge dead with 10s deadline
  await h.store.run(async (tx) => {
    const bag = await tx.get(bagId);
    bag.slots[0] = {
      kind: 'stack',
      stackId: 'emblem-stack-timeout',
      templateRef: { id: 'resurrection-emblem', version: 1 },
      quantity: 1,
      binding: { kind: 'character' },
      traceRef: 'trace-timeout'
    };
    tx.set(bagId, bag);

    const ch = await tx.get(h.challengeId);
    tx.set(h.challengeId, {
      ...ch,
      lifeState: 'dead',
      deathIndex: 1,
      deathDeadline: 15000,
    });
  });

  // Jump to exact deathDeadline
  h.clock.now = () => 15000;

  const reviveCmd = {
    ...h.auth,
    command: 'challenge.revive',
    operationId: 'revive-after-timeout-op',
    expected: [],
    payload: {
      challengeId: h.challengeId,
      deathIndex: 1,
    }
  };

  const res = await h.service.execute(reviveCmd);
  assert.equal(res.outcome.status, 'rejected');
  assert.equal(res.outcome.code, 'DEADLINE_EXPIRED');

  // Zero emblems deducted
  const bagAfter = h.bag();
  assert.equal(bagAfter.slots[0].quantity, 1);

  // Challenge in store transitioned to failed and closed
  const chalAfter = h.store.inspect(h.challengeId);
  assert.equal(chalAfter.result, 'failed');
  assert.equal(chalAfter.sceneState, 'closed');

  // Account pointer cleared
  assert.equal(h.account().openSceneChallengeId, undefined);
});

test('4. idempotency: replaying challenge.leave or expired revive with same operationId returns original response with replayed: true', async () => {
  const h = await activeRoomFixture();
  h.clock.now = () => 5000;

  const leaveCmd = {
    ...h.auth,
    command: 'challenge.leave',
    operationId: 'idempotent-leave-op',
    expected: [],
    payload: {
      challengeId: h.challengeId,
      reason: 'abandon',
    }
  };

  const res1 = await h.service.execute(leaveCmd);
  assert.equal(res1.outcome.status, 'committed');
  assert.equal(res1.replayed, false);

  // Replay exactly same command
  h.clock.now = () => 6000;
  const res2 = await h.service.execute(leaveCmd);
  assert.equal(res2.outcome.status, 'committed');
  assert.equal(res2.replayed, true);
  assert.equal(res2.outcome.data.challengeId, res1.outcome.data.challengeId);
  assert.equal(res2.outcome.data.result, res1.outcome.data.result);
  assert.equal(res2.outcome.data.sceneState, res1.outcome.data.sceneState);
  assert.equal(res2.outcome.data.returnAnchorRef, res1.outcome.data.returnAnchorRef);
  assert.equal(res2.outcome.data.staminaSettlementRef, res1.outcome.data.staminaSettlementRef);
});

test('5. terminal barrier: once challenge is closed, subsequent illegal actions are blocked', async () => {
  const h = await activeRoomFixture();
  h.clock.now = () => 5000;

  // Abandon challenge
  await h.service.execute({
    ...h.auth,
    command: 'challenge.leave',
    operationId: 'terminal-leave-1',
    expected: [],
    payload: {
      challengeId: h.challengeId,
      reason: 'abandon',
    }
  });

  // 1. Attempting new revive on closed challenge returns CHALLENGE_TERMINAL
  const reviveRes = await h.service.execute({
    ...h.auth,
    command: 'challenge.revive',
    operationId: 'revive-on-closed',
    expected: [],
    payload: {
      challengeId: h.challengeId,
      deathIndex: 1,
    }
  });
  assert.equal(reviveRes.outcome.status, 'rejected');
  assert.equal(reviveRes.outcome.code, 'CHALLENGE_TERMINAL');

  // 2. Attempting new leave on closed challenge returns SCENE_CLOSED
  const leaveRes = await h.service.execute({
    ...h.auth,
    command: 'challenge.leave',
    operationId: 'leave-on-closed',
    expected: [],
    payload: {
      challengeId: h.challengeId,
      reason: 'abandon',
    }
  });
  assert.equal(leaveRes.outcome.status, 'rejected');
  assert.equal(leaveRes.outcome.code, 'SCENE_CLOSED');

  // 3. Attempting activateRoom on closed challenge returns SCENE_CLOSED
  const activateRes = await h.service.execute({
    ...h.auth,
    command: 'challenge.activateRoom',
    operationId: 'activate-on-closed',
    expected: [
      { kind: 'challenge', id: h.challengeId, version: h.store.inspect(h.challengeId).version },
      { kind: 'character', id: h.characterId, version: h.character().version }
    ],
    payload: {
      characterId: h.characterId,
      rolePlayEpoch: h.character().rolePlayEpoch,
      challengeId: h.challengeId,
      roomAttemptId: 'attempt-2',
      manifestHash: 'a'.repeat(64),
      expectedRevision: 1
    }
  });
  assert.equal(activateRes.outcome.status, 'rejected');
  assert.equal(activateRes.outcome.code, 'CHALLENGE_TERMINAL');

  // 4. Attempting prepareRoom on closed challenge returns CHALLENGE_TERMINAL
  const prepareRes = await h.service.execute({
    ...h.auth,
    command: 'challenge.prepareRoom',
    operationId: 'prepare-on-closed',
    expected: [
      { kind: 'challenge', id: h.challengeId, version: h.store.inspect(h.challengeId).version },
      { kind: 'character', id: h.characterId, version: h.character().version }
    ],
    payload: {
      characterId: h.characterId,
      rolePlayEpoch: h.character().rolePlayEpoch,
      challengeId: h.challengeId,
      nextRoomNo: 1,
      expectedRevision: 1
    }
  });
  assert.equal(prepareRes.outcome.status, 'rejected');
  assert.equal(prepareRes.outcome.code, 'CHALLENGE_TERMINAL');
});

test('6. offline / re-login scenario hands off character to inn space, not town portal', async () => {
  const h = await activeRoomFixture();
  h.clock.now = () => 5000;

  // Player disconnects/re-logs in while in challenge
  const login = new LoginService({
    store: h.store,
    clock: h.clock,
    identity: h.identity,
    ticketTtlMs: 60000,
    initialUnlocks: {},
    holdingsDomainRef: 'bank-test-domain'
  });

  h.clock.now = () => 20000;
  const prep = await login.execute({
    protocolVersion: 2,
    command: 'session.prepare',
    payload: { launchId: 'relogin-launch', prepareOperationId: 'relogin-prep' }
  });
  const commit = await login.execute({
    protocolVersion: 2,
    command: 'session.commit',
    payload: { launchId: 'relogin-launch', ticketId: prep.outcome.data.ticketId, openOperationId: 'relogin-commit' }
  });
  assert.equal(commit.outcome.status, 'committed');

  // Character location falls back to inn!
  const charAfter = h.character();
  assert.equal(charAfter.location.kind, 'inn');
  assert.equal(charAfter.location.characterId, h.characterId);
  assert.equal(charAfter.roleState?.kind, 'inn');
  assert.equal(charAfter.staminaReservation, undefined);
  assert.equal(charAfter.stamina.value, 307);

  // Challenge closed and failed
  const chalAfter = h.store.inspect(h.challengeId);
  assert.equal(chalAfter.result, 'failed');
  assert.equal(chalAfter.sceneState, 'closed');
  assert.equal(h.account().openSceneChallengeId, undefined);
});

test('7. challenge.leave with reason finishLoot requires result completed, and preserves completed status', async () => {
  const h = await activeRoomFixture();
  h.clock.now = () => 5000;

  // 1. Sending finishLoot on active challenge is rejected
  const badRes = await h.service.execute({
    ...h.auth,
    command: 'challenge.leave',
    operationId: 'bad-finish-loot-op',
    expected: [],
    payload: {
      challengeId: h.challengeId,
      reason: 'finishLoot',
    }
  });
  assert.equal(badRes.outcome.status, 'rejected');
  assert.equal(badRes.outcome.code, 'INVALID_ARGUMENT');

  // 2. Mark challenge completed (e.g. boss killed)
  await h.store.run(async (tx) => {
    const ch = await tx.get(h.challengeId);
    ch.result = 'completed';
    ch.sceneState = 'looting';
    tx.set(ch.id, ch);
  });

  // 3. Sending finishLoot on completed challenge commits and keeps completed
  const goodRes = await h.service.execute({
    ...h.auth,
    command: 'challenge.leave',
    operationId: 'good-finish-loot-op',
    expected: [],
    payload: {
      challengeId: h.challengeId,
      reason: 'finishLoot',
    }
  });
  assert.equal(goodRes.outcome.status, 'committed');
  assert.equal(goodRes.outcome.data.result, 'completed');
  assert.equal(goodRes.outcome.data.sceneState, 'closed');
  assert.equal(goodRes.outcome.data.returnAnchorRef, 'town:town-map-1:first');

  const chalAfter = h.store.inspect(h.challengeId);
  assert.equal(chalAfter.result, 'completed');
  assert.equal(chalAfter.sceneState, 'closed');
});

test('8. stamina natural window rollover: if refill window passed during challenge, stamina refills to 308 on leave', async () => {
  const h = await activeRoomFixture();

  // Advance time past the 4-hour window rollover
  // E.g. + 16 hours
  h.clock.now = () => 5000 + 16 * 3600_000;

  const leaveRes = await h.service.execute({
    ...h.auth,
    command: 'challenge.leave',
    operationId: 'leave-rollover-op',
    expected: [],
    payload: {
      challengeId: h.challengeId,
      reason: 'abandon',
    }
  });
  assert.equal(leaveRes.outcome.status, 'committed');

  const charAfter = h.character();
  assert.equal(charAfter.stamina.value, 308); // Window passed -> refilled to max 308!
});
