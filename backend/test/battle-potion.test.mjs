import test from 'node:test';
import assert from 'node:assert/strict';
import { basicFixture } from './fixtures/basic-fixture.mjs';
import { crossFixture } from './fixtures/cross-fixture.mjs';
import { InventoryService } from '../src/inventory/inventory-service.ts';
import { readCheckpoint, writeChunk, stateHash } from '../src/challenge/room-checkpoint.ts';
import { manifestDigest } from '../../shared/src/room-manifest.ts';

async function checkpoint(h) {
  return h.store.run(async tx => readCheckpoint(tx, await tx.get(h.challengeId)));
}

async function roleFixture(h, change) {
  await h.store.run(async tx => {
    const challenge = await tx.get(h.challengeId), old = await readCheckpoint(tx, challenge);
    change(old.role);
    const chunk = await writeChunk(challenge, 0, old.header.activeChunks[0].chunkRevision + 1, old.role);
    const hash = await stateHash(old.role, old.scene);
    tx.set(chunk.id, chunk);
    tx.set(old.header.id, {
      ...old.header,
      activeChunks: old.header.activeChunks.map(r => r.ordinal === 0 ? { ...r, hash: chunk.hash, chunkRevision: chunk.chunkRevision } : r),
      state: { ...old.header.state, publicStateHash: hash }
    });
  });
}

test('battle-potion: simulation.submit with HP potion restores player HP, deducts inventory, starts 10s CD, and commits CP + container in single transaction', async () => {
  const h = await basicFixture();
  h.clock.now = () => 1513;

  // 1. Assign quickSlot 0 to 'item:hp-potion-small-v1'
  const char = h.character();
  const nextQuickSlots = ['item:hp-potion-small-v1', null, null];
  await h.store.run(async tx => {
    tx.set(h.characterId, { ...char, quickSlots: nextQuickSlots });
  });

  // 2. Seed backpack slot 0 with 5 HP potions
  const hpStack = {
    kind: 'stack',
    stackId: 's-hp-1',
    templateRef: { id: 'item:hp-potion-small-v1', version: 1 },
    quantity: 5,
    binding: { kind: 'character', characterId: h.characterId },
    traceRef: 'trace-hp-1'
  };
  await h.seed({ 0: hpStack }, 'backpack');
  const bagBefore = h.bag();
  assert.equal(bagBefore.slots[0].quantity, 5);

  // 3. Set player HP in checkpoint to 400 (out of 1000)
  await roleFixture(h, role => {
    role.player.hp = '400';
  });
  const cpBefore = await checkpoint(h);
  assert.equal(cpBefore.role.player.hp, '400');

  // 4. Submit simulation with HP potion input
  const potionInput = { kind: 'item', templateId: 'item:hp-potion-small-v1', quickSlotIndex: 0 };
  const cmd = await h.command([potionInput], 10, 'use-hp-potion-1');
  const res = await h.service.execute(cmd);

  assert.equal(res.outcome.status, 'committed', JSON.stringify(res));

  // 5. Verify resultVersions includes character, challenge, and container
  const resultVersions = res.outcome.resultVersions;
  const containerVersion = resultVersions.find(v => v.kind === 'container');
  assert.ok(containerVersion, 'container version should be in resultVersions');
  assert.equal(containerVersion.id, bagBefore.id);
  assert.equal(containerVersion.version, bagBefore.version + 1);

  // 6. Verify backpack inventory was decremented by exactly 1
  const bagAfter = h.bag();
  assert.equal(bagAfter.version, bagBefore.version + 1);
  assert.equal(bagAfter.slots[0].quantity, 4);

  // 7. Verify checkpoint: player HP restored to 550 (400 + 150), and 10s CD started
  const cpAfter = await checkpoint(h);
  assert.equal(cpAfter.role.player.hp, '550');
  const hpCd = cpAfter.role.cooldowns.find(c => c.cooldownId === 'hpPotion');
  assert.ok(hpCd);
  assert.equal(hpCd.readyAtTick, cmd.payload.inputs[0].tick + 1000); // 10s CD = 1000 ticks

  // 8. Verify actionAccepted event in combat results
  const events = await h.results('use-hp-potion-1');
  const potionEvent = events.find(e => e.seq === cmd.payload.firstSeq);
  assert.ok(potionEvent);
  assert.equal(potionEvent.kind, 'actionAccepted');
  assert.equal(potionEvent.actorId, h.characterId);
});

test('battle-potion: simulation.submit with MP potion restores MP, independent CD from HP, and enables same-tick skill', async () => {
  const h = await crossFixture();
  h.clock.now = () => 1513;

  // 1. Assign quickSlots: slot 0 HP, slot 1 MP
  const char = h.character();
  await h.store.run(async tx => {
    tx.set(h.characterId, { ...char, quickSlots: ['item:hp-potion-small-v1', 'item:mp-potion-small-v1', null] });
  });

  // 2. Seed backpack: slot 0 HP (qty 3), slot 1 MP (qty 3)
  await h.seed({
    0: { kind: 'stack', stackId: 's-hp-1', templateRef: { id: 'item:hp-potion-small-v1', version: 1 }, quantity: 3, binding: { kind: 'character', characterId: h.characterId }, traceRef: 't-hp' },
    1: { kind: 'stack', stackId: 's-mp-1', templateRef: { id: 'item:mp-potion-small-v1', version: 1 }, quantity: 3, binding: { kind: 'character', characterId: h.characterId }, traceRef: 't-mp' }
  }, 'backpack');

  // 3. Set player MP to 5 in checkpoint (max 200). Cross skill costs 10 MP.
  await roleFixture(h, role => {
    role.player.mp = '5';
  });

  // 4. Submit: MP potion input (+40 MP -> 45 MP) followed by Cross skill (costs 10 MP -> 35 MP remaining)
  const mpInput = { kind: 'item', templateId: 'item:mp-potion-small-v1', quickSlotIndex: 1 };
  const skillInput = { kind: 'skill', skillId: 'cross' };
  const cmd = await h.command([mpInput, skillInput], 20, 'use-mp-and-cross');
  const res = await h.service.execute(cmd);

  assert.equal(res.outcome.status, 'committed', JSON.stringify(res));

  // 5. Verify MP potion inventory decremented, HP potion untouched
  const bagAfter = h.bag();
  assert.equal(bagAfter.slots[0].quantity, 3);
  assert.equal(bagAfter.slots[1].quantity, 2);

  // 6. Verify checkpoint: MP cooldown started, HP cooldown still 0
  const cpAfter = await checkpoint(h);
  const mpCd = cpAfter.role.cooldowns.find(c => c.cooldownId === 'mpPotion');
  const hpCd = cpAfter.role.cooldowns.find(c => c.cooldownId === 'hpPotion');
  assert.equal(mpCd.readyAtTick, cmd.payload.inputs[0].tick + 1000);
  assert.equal(hpCd.readyAtTick, 0); // HP CD is independent and untouched!

  // 7. Verify events: both potion and cross skill accepted
  const events = await h.results('use-mp-and-cross');
  const potionEv = events.find(e => e.seq === cmd.payload.firstSeq);
  assert.equal(potionEv.kind, 'actionAccepted');
  const crossEv = events.find(e => e.seq === cmd.payload.firstSeq + 1);
  assert.equal(crossEv.kind, 'actionAccepted');
});

test('battle-potion: two HP potions within 10s rejects second with COOLDOWN_ACTIVE, no double inventory deduction', async () => {
  const h = await basicFixture();
  h.clock.now = () => 1513;

  await h.store.run(async tx => {
    tx.set(h.characterId, { ...h.character(), quickSlots: ['item:hp-potion-small-v1', null, null] });
  });
  await h.seed({
    0: { kind: 'stack', stackId: 's-hp', templateRef: { id: 'item:hp-potion-small-v1', version: 1 }, quantity: 5, binding: { kind: 'character' }, traceRef: 't' }
  }, 'backpack');

  // Lower player HP
  await roleFixture(h, role => {
    role.player.hp = '200';
  });

  // Send two HP potions in the same submit batch: first at tick, second at tick + 5
  const state = (await h.query()).data;
  const firstSeq = state.acceptedSeq + 1;
  const p1 = { kind: 'item', templateId: 'item:hp-potion-small-v1', quickSlotIndex: 0, seq: firstSeq, tick: state.acceptedTick };
  const p2 = { kind: 'item', templateId: 'item:hp-potion-small-v1', quickSlotIndex: 0, seq: firstSeq + 1, tick: state.acceptedTick + 5 };

  const payload = {
    characterId: h.characterId,
    rolePlayEpoch: h.character().rolePlayEpoch,
    challengeId: h.challengeId,
    roomNo: 0,
    sceneEpoch: state.sceneEpoch,
    timelineEpoch: state.timelineEpoch,
    baseCheckpointVersion: state.checkpointRevision,
    firstSeq,
    lastSeq: firstSeq + 1,
    fromTick: state.acceptedTick,
    toTick: state.acceptedTick + 20,
    ruleRef: h.config.ruleRef,
    mapRef: h.config.mapRef,
    inputs: [p1, p2],
    digest: ''
  };
  payload.digest = await manifestDigest({ payload: Object.fromEntries(Object.entries(payload).filter(([k]) => k !== 'digest')), config: h.config, combat: h.profile });
  const cmd = { ...h.auth, command: 'simulation.submit', operationId: 'double-hp-cd', expected: (await h.query()).versions, payload };

  const res = await h.service.execute(cmd);
  assert.equal(res.outcome.status, 'committed');

  // Bag should only be decremented once (quantity 4)
  const bagAfter = h.bag();
  assert.equal(bagAfter.slots[0].quantity, 4);

  // Events: first accepted, second rejected with COOLDOWN_ACTIVE
  const events = await h.results('double-hp-cd');
  const ev1 = events.find(e => e.seq === firstSeq);
  const ev2 = events.find(e => e.seq === firstSeq + 1);
  assert.equal(ev1.kind, 'actionAccepted');
  assert.equal(ev2.kind, 'actionRejected');
  assert.equal(ev2.code, 'COOLDOWN_ACTIVE');
});

test('battle-potion: full HP rejection in live service does NOT deduct item, does NOT trigger CD, and does NOT update bag version', async () => {
  const h = await basicFixture();
  h.clock.now = () => 1513;

  await h.store.run(async tx => {
    tx.set(h.characterId, { ...h.character(), quickSlots: ['item:hp-potion-small-v1', null, null] });
  });
  await h.seed({
    0: { kind: 'stack', stackId: 's-hp', templateRef: { id: 'item:hp-potion-small-v1', version: 1 }, quantity: 5, binding: { kind: 'character' }, traceRef: 't' }
  }, 'backpack');

  const bagBefore = h.bag();
  const cpBefore = await checkpoint(h);
  assert.equal(cpBefore.role.player.hp, cpBefore.role.player.maxHp); // Full HP!

  const potionInput = { kind: 'item', templateId: 'item:hp-potion-small-v1', quickSlotIndex: 0 };
  const cmd = await h.command([potionInput], 10, 'full-hp-reject');
  const res = await h.service.execute(cmd);

  assert.equal(res.outcome.status, 'committed');

  // resultVersions should NOT contain container version (since bag was unchanged)
  const containerVersion = res.outcome.resultVersions.find(v => v.kind === 'container');
  assert.equal(containerVersion, undefined);

  // Bag quantity and version untouched
  const bagAfter = h.bag();
  assert.equal(bagAfter.version, bagBefore.version);
  assert.equal(bagAfter.slots[0].quantity, 5);

  // CD untouched (readyAtTick = 0)
  const cpAfter = await checkpoint(h);
  const hpCd = cpAfter.role.cooldowns.find(c => c.cooldownId === 'hpPotion');
  assert.equal(hpCd.readyAtTick, 0);

  // Event reports HP_FULL
  const events = await h.results('full-hp-reject');
  const ev = events.find(e => e.seq === cmd.payload.firstSeq);
  assert.equal(ev.kind, 'actionRejected');
  assert.equal(ev.code, 'HP_FULL');
});

test('battle-potion: idempotent replay returns original committed outcome without re-deducting potion', async () => {
  const h = await basicFixture();
  h.clock.now = () => 1513;

  await h.store.run(async tx => {
    tx.set(h.characterId, { ...h.character(), quickSlots: ['item:hp-potion-small-v1', null, null] });
  });
  await h.seed({
    0: { kind: 'stack', stackId: 's-hp', templateRef: { id: 'item:hp-potion-small-v1', version: 1 }, quantity: 5, binding: { kind: 'character' }, traceRef: 't' }
  }, 'backpack');

  await roleFixture(h, role => {
    role.player.hp = '500';
  });

  const potionInput = { kind: 'item', templateId: 'item:hp-potion-small-v1', quickSlotIndex: 0 };
  const cmd = await h.command([potionInput], 10, 'idempotent-potion-op');

  // First execution
  const res1 = await h.service.execute(cmd);
  assert.equal(res1.outcome.status, 'committed');
  assert.equal(res1.replayed, false);
  assert.equal(h.bag().slots[0].quantity, 4);

  // Replay same command
  const res2 = await h.service.execute(cmd);
  assert.equal(res2.outcome.status, 'committed');
  assert.equal(res2.replayed, true);
  assert.equal(h.bag().slots[0].quantity, 4); // Still 4! Not deducted again!
});

test('battle-potion: different parameters with same operationId rejects with OPERATION_MISMATCH', async () => {
  const h = await basicFixture();
  h.clock.now = () => 1513;

  await h.store.run(async tx => {
    tx.set(h.characterId, { ...h.character(), quickSlots: ['item:hp-potion-small-v1', 'item:hp-potion-small-v1', null] });
  });
  await h.seed({
    0: { kind: 'stack', stackId: 's-hp', templateRef: { id: 'item:hp-potion-small-v1', version: 1 }, quantity: 5, binding: { kind: 'character' }, traceRef: 't' }
  }, 'backpack');

  await roleFixture(h, role => {
    role.player.hp = '500';
  });

  const potionInput = { kind: 'item', templateId: 'item:hp-potion-small-v1', quickSlotIndex: 0 };
  const cmd1 = await h.command([potionInput], 10, 'mismatch-op-test');
  const res1 = await h.service.execute(cmd1);
  assert.equal(res1.outcome.status, 'committed');

  // Send different command with same operationId
  const cmd2 = structuredClone(cmd1);
  cmd2.payload.inputs = [{ kind: 'item', templateId: 'item:hp-potion-small-v1', quickSlotIndex: 1, seq: cmd1.payload.inputs[0].seq, tick: cmd1.payload.inputs[0].tick }];
  cmd2.payload.digest = await manifestDigest({ payload: Object.fromEntries(Object.entries(cmd2.payload).filter(([k]) => k !== 'digest')), config: h.config, combat: h.profile });

  const res2 = await h.service.execute(cmd2);
  assert.equal(res2.outcome.status, 'rejected');
  assert.equal(res2.outcome.code, 'OPERATION_MISMATCH');
});

test('battle-potion: inventory concurrency - order 1: potion submit commits first, concurrent operation expecting old bag version gets VERSION_CONFLICT', async () => {
  const h = await basicFixture();
  h.clock.now = () => 1513;

  await h.store.run(async tx => {
    tx.set(h.characterId, { ...h.character(), quickSlots: ['item:hp-potion-small-v1', null, null] });
  });
  await h.seed({
    0: { kind: 'stack', stackId: 's-hp', templateRef: { id: 'item:hp-potion-small-v1', version: 1 }, quantity: 5, binding: { kind: 'character', accountId: h.character().accountId, characterId: h.characterId }, traceRef: 'trace-concurrent-1' }
  }, 'backpack');

  await roleFixture(h, role => {
    role.player.hp = '500';
  });

  const bagBefore = h.bag();

  // Potion submit commits first
  const potionInput = { kind: 'item', templateId: 'item:hp-potion-small-v1', quickSlotIndex: 0 };
  const cmd = await h.command([potionInput], 10, 'concurrent-order-1');
  const res = await h.service.execute(cmd);
  assert.equal(res.outcome.status, 'committed');

  // Verify bag version incremented
  const bagAfter = h.bag();
  assert.equal(bagAfter.version, bagBefore.version + 1);

  // A concurrent inventory organize expecting old bag version fails with VERSION_CONFLICT
  const inventoryService = new InventoryService({
    store: h.store,
    clock: h.clock,
    identity: h.identity,
    catalog: { 'item:hp-potion-small-v1': { version: 1, kind: 'consumable', quickAssignable: true } }
  });

  const organizeCmd = {
    ...h.auth,
    command: 'inventory.organize',
    operationId: 'concurrent-organize-order-1',
    expected: [
      { kind: 'character', id: h.characterId, version: h.character().version },
      { kind: 'container', id: bagBefore.id, version: bagBefore.version }
    ],
    payload: {
      characterId: h.characterId,
      direction: 'forward'
    }
  };
  const organizeRes = await inventoryService.execute(organizeCmd);
  assert.equal(organizeRes.outcome.status, 'rejected');
  assert.equal(organizeRes.outcome.code, 'VERSION_CONFLICT');
});

test('battle-potion: inventory concurrency - order 2: concurrent inventory operation commits first, potion submit detects version conflict and retries cleanly', async () => {
  const h = await basicFixture();
  h.clock.now = () => 1513;

  await h.store.run(async tx => {
    tx.set(h.characterId, { ...h.character(), quickSlots: ['item:hp-potion-small-v1', null, null] });
  });
  await h.seed({
    0: { kind: 'stack', stackId: 's-hp', templateRef: { id: 'item:hp-potion-small-v1', version: 1 }, quantity: 5, binding: { kind: 'character' }, traceRef: 't' }
  }, 'backpack');

  await roleFixture(h, role => {
    role.player.hp = '500';
  });

  // Build command with expected container version
  const potionInput = { kind: 'item', templateId: 'item:hp-potion-small-v1', quickSlotIndex: 0 };
  const cmd = await h.command([potionInput], 10, 'concurrent-order-2');
  const bagBefore = h.bag();
  cmd.expected = [
    ...cmd.expected,
    { kind: 'container', id: bagBefore.id, version: bagBefore.version }
  ];

  // Now simulate a concurrent modification to the backpack before potion submit finishes
  await h.store.run(async tx => {
    tx.set(bagBefore.id, { ...bagBefore, version: bagBefore.version + 1, updatedAt: h.clock.now() + 1 });
  });

  // Potion submit now executes: detects backpack version conflict!
  const res = await h.service.execute(cmd);
  assert.equal(res.outcome.status, 'rejected');
  assert.equal(res.outcome.code, 'VERSION_CONFLICT');

  // Verify bag inventory was NOT deducted (still quantity 5 in slots[0])
  const bagCurrent = h.bag();
  assert.equal(bagCurrent.slots[0].quantity, 5);
});

test('battle-potion: inventory concurrency - order 2 OCC race: concurrent modification before commit transaction triggers VERSION_CONFLICT without dirty write', async () => {
  const h = await basicFixture();
  h.clock.now = () => 1513;

  await h.store.run(async tx => {
    tx.set(h.characterId, { ...h.character(), quickSlots: ['item:hp-potion-small-v1', null, null] });
  });
  await h.seed({
    0: { kind: 'stack', stackId: 's-hp', templateRef: { id: 'item:hp-potion-small-v1', version: 1 }, quantity: 5, binding: { kind: 'character' }, traceRef: 't' }
  }, 'backpack');

  await roleFixture(h, role => {
    role.player.hp = '500';
  });

  const potionInput = { kind: 'item', templateId: 'item:hp-potion-small-v1', quickSlotIndex: 0 };
  const cmd = await h.command([potionInput], 10, 'concurrent-order-2-occ');

  let calls = 0;
  h.store.beforeCommit = async () => {
    if (++calls !== 2) return; // Second tx is the commit transaction
    const b = h.bag();
    await h.store.run(tx => tx.set(b.id, { ...b, version: b.version + 1 }));
  };

  const res = await h.service.execute(cmd);
  h.store.beforeCommit = undefined;

  assert.equal(res.outcome.status, 'rejected');
  assert.equal(res.outcome.code, 'VERSION_CONFLICT');
  assert.equal(h.bag().slots[0].quantity, 5);
});
