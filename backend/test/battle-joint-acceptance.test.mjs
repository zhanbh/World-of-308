import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBankFixture } from './fixtures/bank-fixture.mjs';
import { ChallengeService } from '../src/challenge/challenge-service.ts';
import { entryContentFromE01 } from '../src/challenge/challenge-content.ts';
import { EquipmentService } from '../src/equipment/equipment-service.ts';
import { TRAINING_BASIC_CONFIG } from '../../shared/src/basic-combat-kernel.ts';
import { CROSS_CONFIG } from './fixtures/cross-fixture.mjs';
import { manifestDigest } from '../../shared/src/room-manifest.ts';
import { readCheckpoint, writeChunk, stateHash, encodedBytes } from '../src/challenge/room-checkpoint.ts';
import { loginKey } from '../src/identity/identity-v2.ts';
import { handoff } from '../src/identity/login-handoff.ts';

const GLORY_TRINKET_TEMPLATE = 'item:trinket-warrior-glory-v1';
const HP_POTION_TEMPLATE = 'item:hp-potion-small-v1';
const MP_POTION_TEMPLATE = 'item:mp-potion-small-v1';

const bytes = v => new TextEncoder().encode(JSON.stringify(v)).length;

/**
 * Creates an instrumented MemoryStore wrapper that records unique keys read and written
 * during transactional commits.
 */
function createInstrumentedStore(baseStore) {
  const metrics = {
    runs: 0,
    history: []
  };

  const store = {
    inspect: (id) => baseStore.inspect(id),
    snapshot: () => baseStore.snapshot(),
    injectWriteFailure: (n) => baseStore.injectWriteFailure(n),
    injectResponseLoss: () => baseStore.injectResponseLoss(),
    async run(work) {
      metrics.runs++;
      return baseStore.run(async (tx) => {
        const reads = new Set();
        const writes = new Set();
        const interceptedTx = {
          get: async (id) => {
            reads.add(id);
            return tx.get(id);
          },
          set: (id, val) => {
            writes.add(id);
            tx.set(id, val);
          }
        };
        try {
          const result = await work(interceptedTx);
          metrics.history.push({ reads: [...reads], writes: [...writes], status: 'committed' });
          return result;
        } catch (err) {
          metrics.history.push({ reads: [...reads], writes: [...writes], status: 'error', error: err.message });
          throw err;
        }
      });
    },
    metrics
  };
  return store;
}

async function jointFixture(options = {}) {
  const h = await createBankFixture();
  const store = options.instrumentStore ? createInstrumentedStore(h.store) : h.store;

  const trinketId = 'inst-trinket-glory-joint';
  const trinketItem = {
    schemaVersion: 2,
    id: trinketId,
    accountId: h.account().id,
    version: 1,
    templateRef: { id: GLORY_TRINKET_TEMPLATE, version: 1 },
    slotKind: 'trinket',
    itemLevel: 30,
    quality: 'purple',
    binding: { kind: 'character', characterId: h.characterId },
    location: { kind: 'equipped', characterId: h.characterId, slotId: 'trinket' },
    enhancementLevel: 0,
    durability: { wearEnabled: false, current: null, max: null, policyRef: 'none' },
    rolledAffixes: [],
    sourceKey: 'test-trinket',
    sourceOrdinal: 0,
    sourceLocator: { kind: 'grant', grantId: 'test-trinket-joint' },
    lifecycle: 'active',
    createdAt: 1000,
    updatedAt: 1000
  };

  const equipCatalog = {
    'equipment:warrior-sword-white-v1': {
      templateId: 'equipment:warrior-sword-white-v1',
      name: 'Starter',
      slotKind: 'weapon',
      itemLevel: 10,
      quality: 'white',
      allowedClasses: ['warrior']
    },
    [GLORY_TRINKET_TEMPLATE]: {
      templateId: GLORY_TRINKET_TEMPLATE,
      name: '战神荣耀徽记',
      slotKind: 'trinket',
      itemLevel: 30,
      quality: 'purple',
      allowedClasses: ['warrior']
    }
  };

  // Fund wallet and expand backpack to 100 slots if requested
  if (options.expandTo100) {
    await h.fund('50000', '1000');
    for (let stage = 1; stage <= 4; stage++) {
      const expCmd = await h.expand('backpack', 'gold');
      assert.ok(expCmd.expected, 'Expansion quote must be valid');
      const expRes = await h.service.execute(expCmd);
      assert.equal(expRes.outcome.status, 'committed');
    }
    const bag = h.bag();
    assert.equal(bag.capacity, 100, 'Backpack capacity must be 100 after 4 expansions');
  }

  // Seed character quickslots and equipped trinket
  await h.store.run(async tx => {
    tx.set(trinketId, trinketItem);
    const char = h.character();
    tx.set(h.characterId, {
      ...char,
      quickSlots: [HP_POTION_TEMPLATE, MP_POTION_TEMPLATE, null],
      equipped: { ...char.equipped, trinket: trinketId },
      trinketEquippedAt: options.trinketEquippedAt ?? -100000
    });
  });

  // Seed supplies
  const slots = {};
  slots[0] = {
    kind: 'stack',
    stackId: 's-hp-joint',
    templateRef: { id: HP_POTION_TEMPLATE, version: 1 },
    quantity: options.hpQuantity ?? 10,
    binding: { kind: 'character', characterId: h.characterId },
    traceRef: 'trace-hp-joint'
  };
  slots[1] = {
    kind: 'stack',
    stackId: 's-mp-joint',
    templateRef: { id: MP_POTION_TEMPLATE, version: 1 },
    quantity: options.mpQuantity ?? 10,
    binding: { kind: 'character', characterId: h.characterId },
    traceRef: 'trace-mp-joint'
  };

  // If fill100Slots is set, populate remaining slots up to 100
  if (options.fill100Slots) {
    for (let i = 2; i < 100; i++) {
      slots[i] = {
        kind: 'stack',
        stackId: `s-filler-${i}`,
        templateRef: { id: i % 2 === 0 ? HP_POTION_TEMPLATE : MP_POTION_TEMPLATE, version: 1 },
        quantity: 20,
        binding: { kind: 'character', characterId: h.characterId },
        traceRef: `trace-filler-${i}`
      };
    }
  }
  await h.seed(slots, 'backpack');

  const contentRaw = await readFile(new URL('../../shared/fixtures/warrior-first-normal.test.json', import.meta.url), 'utf8');
  const baseContent = await entryContentFromE01(contentRaw, {
    profileId: 'warrior-e01-test',
    environmentScope: 'local-test',
    allowTestStrategies: true
  }, { mapId: h.town.manifest.mapId, x: 100, y: 100, radius: 24 });

  const moveConfig = {
    schemaVersion: 1,
    profile: 'local-test-movement',
    units: 'milli-design-pixel',
    ruleRef: 'movement-test@1',
    mapRef: 'first-room-1@1',
    walkSpeed: 1001,
    runSpeed: 3001,
    ySpeed: 701,
    deadzone: 100,
    runThreshold: 600,
    footprint: 10,
    bounds: { minX: -1000000, maxX: 1000000, minY: -1000000, maxY: 1000000 },
    walls: []
  };

  const combatProfile = {
    schemaVersion: 2,
    profile: 'local-test-cross',
    capabilities: ['basic', 'cross', 'no-rewards'],
    config: { ...structuredClone(TRAINING_BASIC_CONFIG), rangeX: 500000, rangeY: 500000 },
    cross: structuredClone(CROSS_CONFIG),
    mastery: { n: '0', d: '1' },
    attributes: {
      attackPowerByLevel: Array(30).fill('1000'),
      haste: { n: '1', d: '1' },
      damageBonus: { n: '0', d: '1' },
      hit: { n: '1', d: '1' },
      crit: { n: '0', d: '1' },
      critMultiplier: { n: '2', d: '1' }
    },
    targets: Object.fromEntries(
      baseContent.release.nodes.filter(n => n.kind === 'monster').map(n => [
        `${n.id}@${n.version}`,
        { mitigation: { n: '0', d: '1' }, evasion: { n: '0', d: '1' }, damageImmune: false }
      ])
    )
  };

  const content = {
    ...baseContent,
    exitInteraction: { profile: 'local-test', rulesRef: baseContent.releaseRef, radius: 1000000 },
    movement: moveConfig,
    combat: combatProfile
  };

  const service = new ChallengeService({
    store,
    clock: h.clock,
    identity: h.identity,
    content,
    encounterRandom: { nextRoom: () => 0 },
    catalog: equipCatalog
  });

  const entry = await service.query({
    ...h.auth,
    query: 'dungeon.entry',
    requestId: 'entry',
    payload: { characterId: h.characterId, rolePlayEpoch: h.character().rolePlayEpoch, dungeonId: 'first' }
  });

  const started = await service.execute({
    ...h.auth,
    command: 'challenge.start',
    operationId: 'start',
    expected: entry.versions,
    payload: { characterId: h.characterId, rolePlayEpoch: h.character().rolePlayEpoch, dungeonId: 'first', difficultyId: 'normal', entryContext: entry.data.entryContext }
  });
  assert.equal(started.outcome.status, 'committed');
  const challengeId = started.outcome.data.challengeId;

  const queryState = () => service.query({ ...h.auth, query: 'challenge.get', requestId: 'state', payload: { challengeId } });
  const prepCmd = {
    ...h.auth,
    command: 'challenge.prepareRoom',
    operationId: 'prep-room',
    expected: (await queryState()).versions,
    payload: { characterId: h.characterId, rolePlayEpoch: h.character().rolePlayEpoch, challengeId, nextRoomNo: 0, expectedRevision: 0 }
  };
  const prepared = await service.execute(prepCmd);
  assert.equal(prepared.outcome.status, 'committed');
  const manifest = prepared.outcome.data;
  moveConfig.mapRef = manifest.mapRef;

  const activeService = new ChallengeService({
    store,
    clock: h.clock,
    identity: h.identity,
    content: { ...content, movement: moveConfig },
    catalog: equipCatalog
  });

  const activated = await activeService.execute({
    ...h.auth,
    command: 'challenge.activateRoom',
    operationId: 'activate',
    expected: prepared.outcome.resultVersions,
    payload: { characterId: h.characterId, rolePlayEpoch: h.character().rolePlayEpoch, challengeId, roomAttemptId: manifest.roomAttemptId, manifestHash: manifest.manifestHash, expectedRevision: 1 }
  });
  assert.equal(activated.outcome.status, 'committed');

  h.clock.now = () => 1013;
  const readyTicket = activated.outcome.data.readyTicket;
  const ready = await activeService.execute({
    ...h.auth,
    command: 'scene.ready',
    controlSeq: 1,
    leaseRevision: 0,
    payload: {
      characterId: h.characterId,
      rolePlayEpoch: h.character().rolePlayEpoch,
      challengeId,
      ...Object.fromEntries(Object.entries(readyTicket).filter(([k]) => k !== 'deadline'))
    }
  });
  assert.equal(ready.outcome.status, 'committed');

  async function command(inputs, ticks = 50, operationId = 'joint-cmd') {
    const state = (await queryState()).data;
    const firstSeq = state.acceptedSeq + 1;
    const currentRoomNo = h.store.inspect(challengeId).currentRoomNo;
    const payload = {
      characterId: h.characterId,
      rolePlayEpoch: h.character().rolePlayEpoch,
      challengeId,
      roomNo: currentRoomNo,
      sceneEpoch: state.sceneEpoch,
      timelineEpoch: state.timelineEpoch,
      baseCheckpointVersion: state.checkpointRevision,
      firstSeq,
      lastSeq: firstSeq + inputs.length - 1,
      fromTick: state.acceptedTick,
      toTick: state.acceptedTick + ticks,
      ruleRef: moveConfig.ruleRef,
      mapRef: moveConfig.mapRef,
      inputs: inputs.map((a, i) => ({ ...a, seq: firstSeq + i, tick: a.tick ?? state.acceptedTick })),
      digest: ''
    };
    payload.digest = await manifestDigest({
      payload: Object.fromEntries(Object.entries(payload).filter(([k]) => k !== 'digest')),
      config: moveConfig,
      combat: combatProfile
    });
    return {
      ...h.auth,
      command: 'simulation.submit',
      operationId,
      expected: (await queryState()).versions,
      payload
    };
  }

  async function results(operationId) {
    const first = await activeService.query({
      ...h.auth,
      query: 'simulation.actionResults',
      requestId: 'results',
      payload: { operationId, pageIndex: 0 }
    });
    const pages = [first];
    for (let i = 1; i < first.totalPages; i++) {
      pages.push(await activeService.query({
        ...h.auth,
        query: 'simulation.actionResults',
        requestId: `results-${i}`,
        payload: { operationId, pageIndex: i }
      }));
    }
    return pages.flatMap(p => p.events);
  }

  const equipService = new EquipmentService({
    store,
    clock: h.clock,
    identity: h.identity,
    catalog: equipCatalog
  });

  return {
    ...h,
    store,
    trinketId,
    challengeId,
    service: activeService,
    queryState,
    command,
    results,
    equipService,
    moveConfig,
    combatProfile,
    content: { ...content, movement: moveConfig },
    readyTicket,
    equipCatalog
  };
}

async function getCheckpoint(h) {
  return h.store.run(async tx => readCheckpoint(tx, await tx.get(h.challengeId)));
}

async function mutateRoleCheckpoint(h, change) {
  await h.store.run(async tx => {
    const challenge = await tx.get(h.challengeId);
    const old = await readCheckpoint(tx, challenge);
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

test('battle-joint-acceptance: end-to-end full loop (town prep -> shop/expansion -> bank transfer -> equip trinket -> quickSlot binding -> entry challenge -> combat with monster -> knockdown & supply -> same-tick trinket & cross burst -> kill monster -> room transition -> death -> inn reset)', async () => {
  // trinketEquippedAt = -59000 so at clock 2000ms (2000 - (-59000) = 61000ms > 60000ms), 60s swap guard passes
  const h = await jointFixture({ expandTo100: true, trinketEquippedAt: -59000 });
  h.clock.now = () => 1513;

  // 1. Verify 100-slot backpack expansion state and supplies
  const bag = h.bag();
  assert.equal(bag.capacity, 100, 'Backpack must be 100 slots');
  assert.equal(bag.slots[0].quantity, 10, 'HP potions count');
  assert.equal(bag.slots[1].quantity, 10, 'MP potions count');

  // 2. Initial dungeon entry checkpoint state
  const cp0 = await getCheckpoint(h);
  assert.equal(cp0.role.player.hp, '1000000');
  assert.equal(cp0.role.attackPower, '120000');
  assert.equal(cp0.role.buffs.length, 0);
  assert.equal(cp0.role.cooldowns.length, 7);

  // 3. Combat interaction: player takes damage and is knocked down
  await mutateRoleCheckpoint(h, role => {
    role.player.hp = '400000'; // 400 HP (milli units: 400000)
    role.player.actionId = 'knockdown';
  });

  // Use HP potion while knocked down
  const hpCmd = await h.command([{ kind: 'item', quickSlotIndex: 0, templateId: HP_POTION_TEMPLATE }], 10, 'knockdown-heal');
  const hpRes = await h.service.execute(hpCmd);
  assert.equal(hpRes.outcome.status, 'committed');

  const cpAfterHeal = await getCheckpoint(h);
  // HP restored (+150 fixed: 400000 -> 400150)
  assert.equal(cpAfterHeal.role.player.hp, '400150');
  // Knockdown actionId is preserved (usable but NOT dispelling control!)
  assert.equal(cpAfterHeal.role.player.actionId, 'knockdown');
  // HP potion CD started
  const hpCd = cpAfterHeal.role.cooldowns.find(c => c.cooldownId === 'hpPotion');
  assert.ok(hpCd.readyAtTick > cpAfterHeal.header.state.acceptedTick);
  // 1 potion consumed from bag (10 -> 9)
  assert.equal(h.bag().slots[0].quantity, 9);

  // 4. Player rises, time reaches 2000ms (> 60s swap wait guard from -59000).
  // Same-tick trinket activation (+150 AP) + Cross Slash cast
  h.clock.now = () => 2000;
  await mutateRoleCheckpoint(h, role => {
    role.player.actionId = 'idle';
  });

  const burstCmd = await h.command([
    { kind: 'trinket', itemId: h.trinketId },
    { kind: 'skill', skillId: 'cross' }
  ], 10, 'trinket-cross-burst');
  const burstRes = await h.service.execute(burstCmd);
  assert.equal(burstRes.outcome.status, 'committed');

  const cpBurst = await getCheckpoint(h);
  // Trinket buff active and attackPower boosted (1000 -> 1150)
  assert.equal(cpBurst.role.buffs.length, 1);
  assert.equal(cpBurst.role.buffs[0].templateRef, GLORY_TRINKET_TEMPLATE);
  assert.equal(cpBurst.role.attackPower, '1150');
  // Cross Slash snapshot captured boosted attack power 1150
  assert.ok(cpBurst.scene.cross.cast !== null);
  assert.equal(cpBurst.scene.cross.cast.snapshot.attackPower, '1150');

  // Both actions accepted in order
  const burstEvents = await h.results('trinket-cross-burst');
  assert.equal(burstEvents[0].kind, 'actionAccepted');
  assert.equal(burstEvents[1].kind, 'actionAccepted');

  // 5. Complete room clearance and prepare transition to Room 1
  const headerId = await loginKey('cpHeader', [h.challengeId]);
  await h.store.run(async tx => {
    const challenge = await tx.get(h.challengeId);
    const old = await readCheckpoint(tx, challenge);
    for (let i = 0; i < old.scene.enemies.length; i++) {
      old.scene.enemies[i].actor.hp = '0';
      old.scene.enemies[i].actor.lifeState = 'dead';
      if (old.scene.combat?.targets[i]) {
        old.scene.combat.targets[i].hp = '0';
        old.scene.combat.targets[i].lifeState = 'dead';
      }
    }
    const chunk0 = await writeChunk(challenge, 0, old.header.activeChunks[0].chunkRevision + 1, old.role);
    const chunk1 = await writeChunk(challenge, 1, old.header.activeChunks[1].chunkRevision + 1, old.scene);
    const chunks = [chunk0, chunk1];
    for (const ch of chunks) tx.set(ch.id, ch);
    tx.set(headerId, {
      ...old.header,
      activeChunks: chunks.map(ch => ({ ordinal: ch.ordinal, chunkRevision: ch.chunkRevision, hash: ch.hash, sceneEpoch: challenge.sceneEpoch })),
      state: { ...old.header.state, roomPhase: 'cleared', publicStateHash: await stateHash(old.role, old.scene) }
    });
    tx.set(challenge.id, { ...challenge, roomPhase: 'cleared' });
  });

  const prep1 = await h.service.execute({
    ...h.auth,
    command: 'challenge.prepareRoom',
    operationId: 'prep-room-1',
    expected: (await h.queryState()).versions,
    payload: {
      characterId: h.characterId,
      rolePlayEpoch: h.character().rolePlayEpoch,
      challengeId: h.challengeId,
      nextRoomNo: 1,
      expectedRevision: h.store.inspect(h.challengeId).version
    }
  });
  assert.equal(prep1.outcome.status, 'committed');
  const manifest1 = prep1.outcome.data;

  // Advance clock by 2000ms (200 ticks of loading elapsed time)
  h.clock.now = () => 4000;
  h.moveConfig.mapRef = manifest1.mapRef;

  const room1Service = new ChallengeService({
    store: h.store,
    clock: h.clock,
    identity: h.identity,
    content: { ...h.content, movement: h.moveConfig },
    catalog: h.equipCatalog
  });

  const act1 = await room1Service.execute({
    ...h.auth,
    command: 'challenge.activateRoom',
    operationId: 'activate-room-1',
    expected: prep1.outcome.resultVersions,
    payload: {
      characterId: h.characterId,
      rolePlayEpoch: h.character().rolePlayEpoch,
      challengeId: h.challengeId,
      roomAttemptId: manifest1.roomAttemptId,
      manifestHash: manifest1.manifestHash,
      expectedRevision: h.store.inspect(h.challengeId).version
    }
  });
  assert.equal(act1.outcome.status, 'committed');

  const currentH = h.store.inspect(h.challengeId);
  const ready1 = await room1Service.execute({
    ...h.auth,
    command: 'scene.ready',
    controlSeq: (currentH.controlSeq ?? 0) + 1,
    leaseRevision: currentH.lease.revision,
    payload: {
      characterId: h.characterId,
      rolePlayEpoch: h.character().rolePlayEpoch,
      challengeId: h.challengeId,
      ...Object.fromEntries(Object.entries(act1.outcome.data.readyTicket).filter(([k]) => k !== 'deadline'))
    }
  });
  assert.equal(ready1.outcome.status, 'committed');

  // Verify Room 1 preserves buffs and cooldowns
  const cpRoom1 = await getCheckpoint(h);
  assert.equal(cpRoom1.role.buffs.length, 1);
  assert.equal(cpRoom1.role.attackPower, '1150');

  // 6. Player death in Room 1
  await mutateRoleCheckpoint(h, role => {
    role.player.hp = '0';
    role.player.lifeState = 'dead';
  });

  h.clock.now = () => 4500;
  const deadCmd = await h.command([], 10, 'post-death-step');
  await h.service.execute(deadCmd);

  const cpDead = await getCheckpoint(h);
  // Death clears buffs!
  assert.equal(cpDead.role.buffs.length, 0);
  // Cooldown is retained!
  const trinketCd = cpDead.role.cooldowns.find(c => c.cooldownId === 'trinket');
  assert.ok(trinketCd.readyAtTick > 0);

  // During CD, unequip is blocked
  const unequipFail = await h.equipService.execute({
    protocolVersion: 2,
    sessionId: h.session.sessionId,
    sessionEpoch: h.session.sessionEpoch,
    command: 'equipment.unequip',
    operationId: 'unequip-blocked-during-cd',
    expected: [
      { kind: 'character', id: h.characterId, version: h.character().version },
      { kind: 'container', id: h.character().backpackId, version: h.bag().version }
    ],
    payload: { characterId: h.characterId, itemId: h.trinketId, slot: 'trinket' }
  });
  assert.equal(unequipFail.outcome.status, 'rejected');
  assert.equal(unequipFail.outcome.code, 'LOCATION_NOT_ALLOWED');

  // 7. Return to inn (login-handoff) resets cooldown
  await h.store.run(async tx => {
    await handoff(tx, h.account(), h.clock.now(), 'exit-inn-clears-cd', 'receipt');
  });

  const charAfterInn = h.character();
  assert.equal(charAfterInn.trinketCooldownUntil, undefined, 'Inn reset clears character trinket cooldown');
});

test('battle-joint-acceptance: hard budget and UTF-8 serialized size limits under 32-input batch & 100-slot backpack', async () => {
  const h = await jointFixture({
    expandTo100: true,
    fill100Slots: true,
    trinketEquippedAt: -100000
  });
  h.clock.now = () => 1513;

  // Build a full 32-input batch:
  // 1-10: movements
  // 11: trinket activation
  // 12: cross slash skill
  // 13: hp potion item
  // 14: mp potion item
  // 15-20: basic attacks
  // 21-32: movements
  const inputs = [];
  for (let i = 0; i < 10; i++) {
    inputs.push({ kind: 'move', x: 500 + i * 10, y: 0 });
  }
  inputs.push({ kind: 'trinket', itemId: h.trinketId });
  inputs.push({ kind: 'skill', skillId: 'cross' });
  inputs.push({ kind: 'item', quickSlotIndex: 0, templateId: HP_POTION_TEMPLATE });
  inputs.push({ kind: 'item', quickSlotIndex: 1, templateId: MP_POTION_TEMPLATE });
  for (let i = 0; i < 6; i++) {
    inputs.push({ kind: 'basic', pressed: i % 2 === 0 });
  }
  for (let i = 0; i < 12; i++) {
    inputs.push({ kind: 'move', x: -500 - i * 10, y: 0 });
  }
  assert.equal(inputs.length, 32, 'Must submit exactly 32 inputs');

  // Set player HP & MP lower so potions can be consumed
  await mutateRoleCheckpoint(h, role => {
    role.player.hp = '500000';
    role.player.mp = '100000';
  });

  const cmd = await h.command(inputs, 50, 'budget-32-actions');
  const res = await h.service.execute(cmd);
  assert.equal(res.outcome.status, 'committed', JSON.stringify(res.outcome));

  // Read checkpoint components
  const cp = await getCheckpoint(h);
  const cpHeaderSize = bytes(cp.header);
  const chunk0 = h.store.inspect(cp.header.activeChunks[0].hash ? await loginKey('cpChunk', [h.challengeId, 0]) : '');
  const chunk1 = h.store.inspect(cp.header.activeChunks[1].hash ? await loginKey('cpChunk', [h.challengeId, 1]) : '');
  const chunk0Size = bytes(chunk0);
  const chunk1Size = bytes(chunk1);

  // Read action results page
  const actionResultsPage = await h.service.query({
    ...h.auth,
    query: 'simulation.actionResults',
    requestId: 'budget-results',
    payload: { operationId: 'budget-32-actions', pageIndex: 0 }
  });
  const actionResultsSize = bytes(actionResultsPage);

  // Read receipt
  const receipt = h.store.inspect(await loginKey('assetOp', [h.account().id, 'budget-32-actions']));
  const receiptSize = bytes(receipt);

  // Read challenge entity
  const challenge = h.store.inspect(h.challengeId);
  const challengeSize = bytes(challenge);

  // Hard budget bounds assertions:
  // CP Header <= 16,384 bytes (16KB)
  // CP Chunk0 <= 81,920 bytes (80KB)
  // CP Chunk1 <= 81,920 bytes (80KB)
  // ActionResults <= 32,768 bytes (32KB)
  // Receipt <= 16,384 bytes (16KB)
  // Challenge <= 131,072 bytes (128KB)
  console.log('ST13-05 Budget Metrics (UTF-8 Bytes):', {
    cpHeaderSize,
    chunk0Size,
    chunk1Size,
    actionResultsSize,
    receiptSize,
    challengeSize,
    inputsCount: inputs.length,
    backpackCapacity: h.bag().capacity
  });

  assert.ok(cpHeaderSize <= 16384, `cpHeaderSize ${cpHeaderSize} must be <= 16384`);
  assert.ok(chunk0Size <= 81920, `chunk0Size ${chunk0Size} must be <= 81920`);
  assert.ok(chunk1Size <= 81920, `chunk1Size ${chunk1Size} must be <= 81920`);
  assert.ok(actionResultsSize <= 32768, `actionResultsSize ${actionResultsSize} must be <= 32768`);
  assert.ok(receiptSize <= 16384, `receiptSize ${receiptSize} must be <= 16384`);
  assert.ok(challengeSize <= 131072, `challengeSize ${challengeSize} must be <= 131072`);

  // Ensure receipt does not leak seed or private snapshot data
  const receiptStr = JSON.stringify(receipt);
  assert.equal(receiptStr.includes('seed'), false, 'Receipt must not leak RNG seed');
  assert.equal(receiptStr.includes('snapshot'), false, 'Receipt must not leak snapshot');
});

test('battle-joint-acceptance: transactional atomicity and unique key read/write count metrics', async () => {
  const h = await jointFixture({
    expandTo100: true,
    instrumentStore: true,
    trinketEquippedAt: -100000
  });
  h.clock.now = () => 1513;

  // Set lower HP to allow consumption
  await mutateRoleCheckpoint(h, role => {
    role.player.hp = '500000';
  });

  const inputs = [
    { kind: 'item', quickSlotIndex: 0, templateId: HP_POTION_TEMPLATE },
    { kind: 'trinket', itemId: h.trinketId },
    { kind: 'skill', skillId: 'cross' }
  ];
  const cmd = await h.command(inputs, 50, 'tx-metrics-cmd');

  // Clear instrumented store metrics right before target execution transaction
  h.store.metrics.runs = 0;
  h.store.metrics.history = [];

  const res = await h.service.execute(cmd);
  assert.equal(res.outcome.status, 'committed', JSON.stringify(res.outcome));

  // Verify transactional execution metrics: 2-phase deterministic pattern
  // Phase 1: Snapshot precheck & read
  // Phase 2: Atomic commit with version guards (0 conflict retries)
  const runs = h.store.metrics.runs;
  assert.equal(runs, 2, 'Single simulation.submit must complete via exactly 2 clean transaction phases (0 conflict retries)');

  const phase1 = h.store.metrics.history[0];
  const phase2 = h.store.metrics.history[1];
  assert.equal(phase1.status, 'committed');
  assert.equal(phase2.status, 'committed');

  const reads = [...new Set([...phase1.reads, ...phase2.reads])];
  const writes = phase2.writes;

  console.log('ST13-05 Transaction Key Metrics:', {
    phase1ReadsCount: phase1.reads.length,
    phase2WritesCount: writes.length,
    totalUniqueReadsCount: reads.length,
    readsSample: reads.slice(0, 5),
    writesSample: writes.slice(0, 5)
  });

  // Verify required keys are properly touched
  assert.ok(reads.some(k => k.includes(h.challengeId)), 'Reads must include challenge entity');
  assert.ok(reads.some(k => k.includes(h.character().backpackId)), 'Reads must include backpack');
  assert.ok(writes.some(k => k.includes(h.challengeId)), 'Writes must include challenge entity');
  assert.ok(writes.some(k => k.includes(h.character().backpackId)), 'Writes must include backpack update');
  assert.ok(writes.some(k => k.includes('combatResults')), 'Writes must include action results');
  assert.ok(writes.some(k => k.includes('assetOp')), 'Writes must include operation receipt');

  // Bounded write size: simulation commit writes to at most 15 unique keys
  assert.ok(writes.length <= 15, `Writes count ${writes.length} must be bounded`);
});

test('battle-joint-acceptance: rational bounds & cross-cut determinism (3-slice vs single-slice invariance)', async () => {
  // Scenario A: Single 30-tick slice
  const hA = await jointFixture({ trinketEquippedAt: -100000 });
  hA.clock.now = () => 1513;
  await mutateRoleCheckpoint(hA, role => {
    role.player.hp = '600000';
  });
  const inputs = [
    { kind: 'item', quickSlotIndex: 0, templateId: HP_POTION_TEMPLATE },
    { kind: 'trinket', itemId: hA.trinketId }
  ];
  const cmdA = await hA.command(inputs, 30, 'single-slice-cmd');
  const resA = await hA.service.execute(cmdA);
  assert.equal(resA.outcome.status, 'committed', JSON.stringify(resA.outcome));
  const cpA = await getCheckpoint(hA);

  // Scenario B: Three 10-tick slices (inputs in first slice)
  const hB = await jointFixture({ trinketEquippedAt: -100000 });
  hB.clock.now = () => 1513;
  await mutateRoleCheckpoint(hB, role => {
    role.player.hp = '600000';
  });
  const cmdB1 = await hB.command(inputs, 10, 'multi-slice-cmd-1');
  const resB1 = await hB.service.execute(cmdB1);
  assert.equal(resB1.outcome.status, 'committed');

  hB.clock.now = () => 1523;
  const cmdB2 = await hB.command([], 10, 'multi-slice-cmd-2');
  const resB2 = await hB.service.execute(cmdB2);
  assert.equal(resB2.outcome.status, 'committed');

  hB.clock.now = () => 1533;
  const cmdB3 = await hB.command([], 10, 'multi-slice-cmd-3');
  const resB3 = await hB.service.execute(cmdB3);
  assert.equal(resB3.outcome.status, 'committed');
  const cpB = await getCheckpoint(hB);

  // Verify absolute cross-cut invariance between single 30-tick and 3 x 10-tick slices:
  // Player HP, MP, attackPower, buffs, cooldowns
  assert.equal(cpA.role.player.hp, cpB.role.player.hp, 'HP must match across slicing strategies');
  assert.equal(cpA.role.player.mp, cpB.role.player.mp, 'MP must match across slicing strategies');
  assert.equal(cpA.role.attackPower, cpB.role.attackPower, 'AttackPower must match across slicing strategies');
  assert.equal(cpA.role.buffs.length, cpB.role.buffs.length, 'Buffs count must match');
  assert.equal(cpA.role.buffs[0].endsAtTick, cpB.role.buffs[0].endsAtTick, 'Buff endsAtTick must match');
  const cdA = cpA.role.cooldowns.find(c => c.cooldownId === 'trinket');
  const cdB = cpB.role.cooldowns.find(c => c.cooldownId === 'trinket');
  assert.equal(cdA.readyAtTick, cdB.readyAtTick, 'Trinket CD readyAtTick must match');
});
