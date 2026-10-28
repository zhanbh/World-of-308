import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFixture } from './fixtures/prepare-fixture.mjs';
import { logicTick } from '../../shared/src/exact-values.ts';
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

test('successful revive within deadline deducts 1 emblem, restores full HP/MP, grants 2s protection, resets warrior CDs while preserving potion/trinket CD', async () => {
  const h = await activeRoomFixture();
  h.clock.now = () => 5000;
  const bagId = h.character().backpackId;

  // Set active cooldowns on skills and items in checkpoint
  await h.store.run(async (tx) => {
    const cp = await readCheckpoint(tx, h.store.inspect(h.challengeId));
    for (const cd of cp.role.cooldowns) {
      if (['cross', 'bengshan', 'badao', 'earth'].includes(cd.cooldownId)) {
        cd.readyAtTick = logicTick(800);
      } else if (['hpPotion', 'trinket'].includes(cd.cooldownId)) {
        cd.readyAtTick = logicTick(1200);
      }
    }
    cp.role.player.hp = '0';
    cp.role.player.mp = '10';
    cp.role.player.lifeState = 'dead';
    if (cp.scene.cross) cp.scene.cross.readyAtUs = { n: '8000000', d: '1' };
    if (cp.scene.bengshan) cp.scene.bengshan.readyAtUs = { n: '8000000', d: '1' };
    if (cp.scene.badao) cp.scene.badao.readyAtUs = { n: '8000000', d: '1' };
    if (cp.scene.earth) cp.scene.earth.readyAtUs = { n: '8000000', d: '1' };

    const { writeChunk, stateHash } = await import('../src/challenge/room-checkpoint.ts');
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
      state: { ...cp.header.state, checkpointRevision: rev, publicStateHash: hash, lifeState: 'dead', deathDeadline: 15000 }
    });

    const ch = await tx.get(h.challengeId);
    tx.set(h.challengeId, {
      ...ch,
      lifeState: 'dead',
      deathIndex: 1,
      deathDeadline: 15000,
    });

    // Add 2 resurrection emblems
    const bag = await tx.get(bagId);
    bag.slots[0] = {
      kind: 'stack',
      stackId: 'emblem-stack-1',
      templateRef: { id: 'resurrection-emblem', version: 1 },
      quantity: 2,
      binding: { kind: 'character' },
      traceRef: 'trace-1'
    };
    tx.set(bagId, bag);
  });

  const bagBefore = h.store.inspect(bagId);
  const challengeBefore = h.store.inspect(h.challengeId);

  h.clock.now = () => 6000;
  const reviveCmd = {
    protocolVersion: 2,
    sessionId: h.auth.sessionId,
    sessionEpoch: h.auth.sessionEpoch,
    operationId: 'revive-op-1',
    expected: [
      { kind: 'character', id: h.characterId, version: h.character().version },
      { kind: 'challenge', id: h.challengeId, version: challengeBefore.version },
      { kind: 'container', id: bagId, version: bagBefore.version },
    ],
    command: 'challenge.revive',
    payload: {
      challengeId: h.challengeId,
      deathIndex: 1,
    }
  };

  const res = await h.service.execute(reviveCmd);
  assert.equal(res.outcome.status, 'committed');
  assert.equal(res.outcome.data.challengeId, h.challengeId);
  assert.equal(res.outcome.data.deathIndex, 1);
  assert.ok(res.outcome.data.checkpointRevision > 0);
  assert.ok(res.outcome.data.stateRef.length > 0);

  // Verify bag: 1 emblem deducted (2 -> 1)
  const bagAfter = h.store.inspect(bagId);
  assert.equal(bagAfter.slots[0].quantity, 1);
  assert.equal(bagAfter.version, bagBefore.version + 1);

  // Verify challenge: lifeState = alive, paidRevives = 1, deathDeadline undefined, protectionUntil = 8000
  const challengeAfter = h.store.inspect(h.challengeId);
  assert.equal(challengeAfter.lifeState, 'alive');
  assert.equal(challengeAfter.paidRevives, 1);
  assert.equal(challengeAfter.deathDeadline, undefined);
  assert.equal(challengeAfter.protectionUntil, 8000);

  // Verify checkpoint: full HP/MP, warrior skill CDs reset to 0, potion/trinket preserved!
  await h.store.run(async (tx) => {
    const cp = await readCheckpoint(tx, challengeAfter);
    assert.equal(cp.role.player.lifeState, 'alive');
    assert.equal(cp.role.player.hp, cp.role.player.maxHp);
    assert.equal(cp.role.player.mp, cp.role.player.maxMp);

    // Warrior skill CDs reset to 0
    for (const cd of cp.role.cooldowns) {
      if (['cross', 'bengshan', 'badao', 'earth'].includes(cd.cooldownId)) {
        assert.equal(cd.readyAtTick, 0, `${cd.cooldownId} should be reset to tick 0`);
      } else if (['hpPotion', 'trinket'].includes(cd.cooldownId)) {
        assert.equal(cd.readyAtTick, 1200, `${cd.cooldownId} cooldown should be preserved as-is`);
      }
    }
    if (cp.scene.cross) assert.deepEqual(cp.scene.cross.readyAtUs, { n: '0', d: '1' });
    if (cp.scene.bengshan) assert.deepEqual(cp.scene.bengshan.readyAtUs, { n: '0', d: '1' });
    if (cp.scene.badao) assert.deepEqual(cp.scene.badao.readyAtUs, { n: '0', d: '1' });
    if (cp.scene.earth) assert.deepEqual(cp.scene.earth.readyAtUs, { n: '0', d: '1' });
  });
});

test('priority deduction: consumes character-bound before account-bound and unbound emblems', async () => {
  const h = await activeRoomFixture();
  const bagId = h.character().backpackId;

  // Populate bag with 3 slots: slot 0 unbound, slot 1 account-bound, slot 2 character-bound
  await h.store.run(async (tx) => {
    const bag = await tx.get(bagId);
    bag.slots[0] = {
      kind: 'stack',
      stackId: 'emblem-unbound',
      templateRef: { id: 'resurrection-emblem', version: 1 },
      quantity: 1,
      binding: { kind: 'none' },
      traceRef: 'trace-none'
    };
    bag.slots[1] = {
      kind: 'stack',
      stackId: 'emblem-account',
      templateRef: { id: 'resurrection-emblem', version: 1 },
      quantity: 1,
      binding: { kind: 'account' },
      traceRef: 'trace-account'
    };
    bag.slots[2] = {
      kind: 'stack',
      stackId: 'emblem-char',
      templateRef: { id: 'resurrection-emblem', version: 1 },
      quantity: 1,
      binding: { kind: 'character' },
      traceRef: 'trace-char'
    };
    tx.set(bagId, bag);

    const ch = await tx.get(h.challengeId);
    tx.set(h.challengeId, { ...ch, lifeState: 'dead', deathIndex: 1, deathDeadline: 50000 });
  });

  h.clock.now = () => 5000;

  // Revive 1: must consume slot 2 (character-bound)
  const r1 = await h.service.execute({
    protocolVersion: 2,
    sessionId: h.auth.sessionId,
    sessionEpoch: h.auth.sessionEpoch,
    operationId: 'prio-revive-1',
    expected: [],
    command: 'challenge.revive',
    payload: { challengeId: h.challengeId, deathIndex: 1 }
  });
  assert.equal(r1.outcome.status, 'committed');
  let bag = h.store.inspect(bagId);
  assert.equal(bag.slots[2], undefined, 'character-bound slot 2 consumed first');
  assert.ok(bag.slots[1] !== undefined, 'account-bound slot 1 preserved');
  assert.ok(bag.slots[0] !== undefined, 'unbound slot 0 preserved');

  // Die again: deathIndex 2
  await h.store.run(async (tx) => {
    const ch = await tx.get(h.challengeId);
    tx.set(h.challengeId, { ...ch, lifeState: 'dead', deathIndex: 2, deathDeadline: 50000 });
  });

  // Revive 2: must consume slot 1 (account-bound)
  const r2 = await h.service.execute({
    protocolVersion: 2,
    sessionId: h.auth.sessionId,
    sessionEpoch: h.auth.sessionEpoch,
    operationId: 'prio-revive-2',
    expected: [],
    command: 'challenge.revive',
    payload: { challengeId: h.challengeId, deathIndex: 2 }
  });
  assert.equal(r2.outcome.status, 'committed');
  bag = h.store.inspect(bagId);
  assert.equal(bag.slots[1], undefined, 'account-bound slot 1 consumed second');
  assert.ok(bag.slots[0] !== undefined, 'unbound slot 0 preserved');

  // Die again: deathIndex 3
  await h.store.run(async (tx) => {
    const ch = await tx.get(h.challengeId);
    tx.set(h.challengeId, { ...ch, lifeState: 'dead', deathIndex: 3, deathDeadline: 50000 });
  });

  // Revive 3: must consume slot 0 (unbound)
  const r3 = await h.service.execute({
    protocolVersion: 2,
    sessionId: h.auth.sessionId,
    sessionEpoch: h.auth.sessionEpoch,
    operationId: 'prio-revive-3',
    expected: [],
    command: 'challenge.revive',
    payload: { challengeId: h.challengeId, deathIndex: 3 }
  });
  assert.equal(r3.outcome.status, 'committed');
  bag = h.store.inspect(bagId);
  assert.equal(bag.slots[0], undefined, 'unbound slot 0 consumed third');
});

test('no emblems in bag rejects with EMBLEM_NOT_ENOUGH and zero deduction', async () => {
  const h = await activeRoomFixture();
  const bagId = h.character().backpackId;

  await h.store.run(async (tx) => {
    const ch = await tx.get(h.challengeId);
    tx.set(h.challengeId, { ...ch, lifeState: 'dead', deathIndex: 1, deathDeadline: 50000 });
    const bag = await tx.get(bagId);
    bag.slots = {};
    tx.set(bagId, bag);
  });

  h.clock.now = () => 5000;
  const res = await h.service.execute({
    protocolVersion: 2,
    sessionId: h.auth.sessionId,
    sessionEpoch: h.auth.sessionEpoch,
    operationId: 'no-emblem-revive',
    expected: [],
    command: 'challenge.revive',
    payload: { challengeId: h.challengeId, deathIndex: 1 }
  });
  assert.equal(res.outcome.status, 'rejected');
  assert.equal(res.outcome.code, 'EMBLEM_NOT_ENOUGH');
  assert.equal(h.store.inspect(h.challengeId).lifeState, 'dead');
});

test('deadline expired: now > deathDeadline rejects with DEADLINE_EXPIRED and zero deduction', async () => {
  const h = await activeRoomFixture();
  const bagId = h.character().backpackId;

  await h.store.run(async (tx) => {
    const ch = await tx.get(h.challengeId);
    tx.set(h.challengeId, { ...ch, lifeState: 'dead', deathIndex: 1, deathDeadline: 10000 });
    const bag = await tx.get(bagId);
    bag.slots[0] = {
      kind: 'stack',
      stackId: 'emblem-1',
      templateRef: { id: 'resurrection-emblem', version: 1 },
      quantity: 5,
      binding: { kind: 'character' },
      traceRef: 'trace-1'
    };
    tx.set(bagId, bag);
  });

  // Exactly at or past deadline
  h.clock.now = () => 10001;
  const res = await h.service.execute({
    protocolVersion: 2,
    sessionId: h.auth.sessionId,
    sessionEpoch: h.auth.sessionEpoch,
    operationId: 'expired-revive',
    expected: [],
    command: 'challenge.revive',
    payload: { challengeId: h.challengeId, deathIndex: 1 }
  });
  assert.equal(res.outcome.status, 'rejected');
  assert.equal(res.outcome.code, 'DEADLINE_EXPIRED');

  // Verify zero deduction
  const bag = h.store.inspect(bagId);
  assert.equal(bag.slots[0].quantity, 5);
});

test('special dungeon: paidRevives >= 3 rejects with REVIVE_LIMIT_REACHED', async () => {
  const h = await activeRoomFixture();
  const bagId = h.character().backpackId;

  const specialDungeon = {
    dungeonId: 'special',
    kind: 'special',
    minLevel: 30,
    maxMonsterLevel: 30,
    mapId: h.content.dungeons[0].mapId,
    anchor: { ...h.content.dungeons[0].anchor },
    difficulties: [{
      difficultyId: 'normal',
      roomCost: 3,
      levels: {
        30: {
          monsterStatsRef: h.content.dungeons[0].difficulties[0].levels[1].monsterStatsRef,
          equipmentSourceRef: h.content.dungeons[0].difficulties[0].levels[1].equipmentSourceRef,
        }
      }
    }]
  };
  const specialContent = {
    ...h.content,
    dungeons: [h.content.dungeons[0], specialDungeon]
  };
  const { ChallengeService } = await import('../src/challenge/challenge-service.ts');
  const specialService = new ChallengeService({
    store: h.store,
    clock: h.clock,
    identity: h.identity,
    content: specialContent,
  });

  await h.store.run(async (tx) => {
    const ch = await tx.get(h.challengeId);
    tx.set(h.challengeId, {
      ...ch,
      dungeonId: 'special',
      lifeState: 'dead',
      deathIndex: 1,
      deathDeadline: 50000,
      paidRevives: 3
    });
    const bag = await tx.get(bagId);
    bag.slots[0] = {
      kind: 'stack',
      stackId: 'emblem-1',
      templateRef: { id: 'resurrection-emblem', version: 1 },
      quantity: 5,
      binding: { kind: 'character' },
      traceRef: 'trace-1'
    };
    tx.set(bagId, bag);
  });

  h.clock.now = () => 5000;
  const res = await specialService.execute({
    protocolVersion: 2,
    sessionId: h.auth.sessionId,
    sessionEpoch: h.auth.sessionEpoch,
    operationId: 'special-limit-revive',
    expected: [],
    command: 'challenge.revive',
    payload: { challengeId: h.challengeId, deathIndex: 1 }
  });
  assert.equal(res.outcome.status, 'rejected');
  assert.equal(res.outcome.code, 'REVIVE_LIMIT_REACHED');
  assert.equal(h.store.inspect(bagId).slots[0].quantity, 5, 'zero deduction on limit reached');
});

test('not dead: living player calling revive rejects with NOT_DEAD', async () => {
  const h = await activeRoomFixture();
  const bagId = h.character().backpackId;

  await h.store.run(async (tx) => {
    const ch = await tx.get(h.challengeId);
    tx.set(h.challengeId, { ...ch, lifeState: 'alive', deathIndex: 0 });
    const bag = await tx.get(bagId);
    bag.slots[0] = {
      kind: 'stack',
      stackId: 'emblem-1',
      templateRef: { id: 'resurrection-emblem', version: 1 },
      quantity: 5,
      binding: { kind: 'character' },
      traceRef: 'trace-1'
    };
    tx.set(bagId, bag);
  });

  h.clock.now = () => 5000;
  const res = await h.service.execute({
    protocolVersion: 2,
    sessionId: h.auth.sessionId,
    sessionEpoch: h.auth.sessionEpoch,
    operationId: 'alive-revive',
    expected: [],
    command: 'challenge.revive',
    payload: { challengeId: h.challengeId, deathIndex: 1 }
  });
  assert.equal(res.outcome.status, 'rejected');
  assert.equal(res.outcome.code, 'NOT_DEAD');
  assert.equal(h.store.inspect(bagId).slots[0].quantity, 5);
});

test('stale deathIndex: mismatched deathIndex rejects with NOT_DEAD', async () => {
  const h = await activeRoomFixture();
  const bagId = h.character().backpackId;

  await h.store.run(async (tx) => {
    const ch = await tx.get(h.challengeId);
    tx.set(h.challengeId, { ...ch, lifeState: 'dead', deathIndex: 2, deathDeadline: 50000 });
    const bag = await tx.get(bagId);
    bag.slots[0] = {
      kind: 'stack',
      stackId: 'emblem-1',
      templateRef: { id: 'resurrection-emblem', version: 1 },
      quantity: 5,
      binding: { kind: 'character' },
      traceRef: 'trace-1'
    };
    tx.set(bagId, bag);
  });

  h.clock.now = () => 5000;
  const res = await h.service.execute({
    protocolVersion: 2,
    sessionId: h.auth.sessionId,
    sessionEpoch: h.auth.sessionEpoch,
    operationId: 'mismatched-death-index',
    expected: [],
    command: 'challenge.revive',
    payload: { challengeId: h.challengeId, deathIndex: 1 }
  });
  assert.equal(res.outcome.status, 'rejected');
  assert.equal(res.outcome.code, 'NOT_DEAD');
  assert.equal(h.store.inspect(bagId).slots[0].quantity, 5);
});

test('idempotent replay of same operationId returns original result with replayed true and single deduction', async () => {
  const h = await activeRoomFixture();
  const bagId = h.character().backpackId;

  await h.store.run(async (tx) => {
    const ch = await tx.get(h.challengeId);
    tx.set(h.challengeId, { ...ch, lifeState: 'dead', deathIndex: 1, deathDeadline: 50000 });
    const bag = await tx.get(bagId);
    bag.slots[0] = {
      kind: 'stack',
      stackId: 'emblem-1',
      templateRef: { id: 'resurrection-emblem', version: 1 },
      quantity: 3,
      binding: { kind: 'character' },
      traceRef: 'trace-1'
    };
    tx.set(bagId, bag);
  });

  h.clock.now = () => 5000;
  const cmd = {
    protocolVersion: 2,
    sessionId: h.auth.sessionId,
    sessionEpoch: h.auth.sessionEpoch,
    operationId: 'idem-revive',
    expected: [],
    command: 'challenge.revive',
    payload: { challengeId: h.challengeId, deathIndex: 1 }
  };

  const r1 = await h.service.execute(cmd);
  assert.equal(r1.outcome.status, 'committed');
  assert.equal(r1.replayed, false);
  assert.equal(h.store.inspect(bagId).slots[0].quantity, 2);

  // Replay
  h.clock.now = () => 6000;
  const r2 = await h.service.execute(cmd);
  assert.equal(r2.outcome.status, 'committed');
  assert.equal(r2.replayed, true);
  assert.deepEqual(r2.outcome.data, r1.outcome.data);
  assert.equal(h.store.inspect(bagId).slots[0].quantity, 2, 'no second emblem deducted');
});

test('concurrent write conflict / double revive: second distinct operationId fails with NOT_DEAD', async () => {
  const h = await activeRoomFixture();
  const bagId = h.character().backpackId;

  await h.store.run(async (tx) => {
    const ch = await tx.get(h.challengeId);
    tx.set(h.challengeId, { ...ch, lifeState: 'dead', deathIndex: 1, deathDeadline: 50000 });
    const bag = await tx.get(bagId);
    bag.slots[0] = {
      kind: 'stack',
      stackId: 'emblem-1',
      templateRef: { id: 'resurrection-emblem', version: 1 },
      quantity: 5,
      binding: { kind: 'character' },
      traceRef: 'trace-1'
    };
    tx.set(bagId, bag);
  });

  h.clock.now = () => 5000;
  const first = await h.service.execute({
    protocolVersion: 2,
    sessionId: h.auth.sessionId,
    sessionEpoch: h.auth.sessionEpoch,
    operationId: 'concurrent-1',
    expected: [],
    command: 'challenge.revive',
    payload: { challengeId: h.challengeId, deathIndex: 1 }
  });
  assert.equal(first.outcome.status, 'committed');
  assert.equal(h.store.inspect(bagId).slots[0].quantity, 4);

  // Concurrent second request with different operationId
  const second = await h.service.execute({
    protocolVersion: 2,
    sessionId: h.auth.sessionId,
    sessionEpoch: h.auth.sessionEpoch,
    operationId: 'concurrent-2',
    expected: [],
    command: 'challenge.revive',
    payload: { challengeId: h.challengeId, deathIndex: 1 }
  });
  assert.equal(second.outcome.status, 'rejected');
  assert.equal(second.outcome.code, 'NOT_DEAD');
  assert.equal(h.store.inspect(bagId).slots[0].quantity, 4, 'only single emblem deducted across both operations');
});
