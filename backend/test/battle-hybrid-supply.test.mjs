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
import { readCheckpoint, writeChunk, stateHash } from '../src/challenge/room-checkpoint.ts';
import { loginKey } from '../src/identity/identity-v2.ts';
import { handoff } from '../src/identity/login-handoff.ts';

const GLORY_TRINKET_TEMPLATE = 'item:trinket-warrior-glory-v1';
const HP_POTION_TEMPLATE = 'item:hp-potion-small-v1';
const MP_POTION_TEMPLATE = 'item:mp-potion-small-v1';

async function hybridFixture(options = {}) {
  const h = await createBankFixture();
  const trinketId = 'inst-trinket-glory-1';
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
    sourceLocator: { kind: 'grant', grantId: 'test-trinket-grant' },
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

  // Seed backpack with 5 HP and 5 MP potions
  const hpStack = {
    kind: 'stack',
    stackId: 's-hp-1',
    templateRef: { id: HP_POTION_TEMPLATE, version: 1 },
    quantity: 5,
    binding: { kind: 'character', characterId: h.characterId },
    traceRef: 'trace-hp-1'
  };
  const mpStack = {
    kind: 'stack',
    stackId: 's-mp-1',
    templateRef: { id: MP_POTION_TEMPLATE, version: 1 },
    quantity: 5,
    binding: { kind: 'character', characterId: h.characterId },
    traceRef: 'trace-mp-1'
  };
  await h.seed({ 0: hpStack, 1: mpStack }, 'backpack');

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
    store: h.store,
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
  assert.equal(started.outcome.status, 'committed', JSON.stringify(started));
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
    store: h.store,
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

  async function command(inputs, ticks = 50, operationId = 'hybrid-cmd') {
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
    store: h.store,
    clock: h.clock,
    identity: h.identity,
    catalog: equipCatalog
  });

  return {
    ...h,
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

test('battle-hybrid-supply: same-tick MP potion restore enables insufficient MP Cross Slash cast', async () => {
  const h = await hybridFixture();
  h.clock.now = () => 1513;

  // Set player MP to 5 (Cross requires 10 MP)
  await roleFixture(h, role => {
    role.player.mp = '5';
  });
  const cpInitial = await getCheckpoint(h);
  assert.equal(cpInitial.role.player.mp, '5');

  // Same tick: 1. MP potion (+40 MP -> 45 MP), 2. Cross Slash (requires 10 MP -> 35 MP)
  const mpPotionInput = { kind: 'item', quickSlotIndex: 1, templateId: MP_POTION_TEMPLATE };
  const crossInput = { kind: 'skill', skillId: 'cross' };
  const cmd = await h.command([mpPotionInput, crossInput], 10, 'mp-then-cross');
  const res = await h.service.execute(cmd);

  assert.equal(res.outcome.status, 'committed', JSON.stringify(res));

  // Checkpoint validation: MP should be 35, Cross Slash is actively casting
  const cp = await getCheckpoint(h);
  assert.equal(cp.role.player.mp, '35');
  assert.ok(cp.scene.cross.cast !== null, 'Cross slash should be casting');
  assert.equal(cp.scene.cross.castSequence, 1);

  // Cooldown validation: MP potion 10s CD started
  const cd = cp.role.cooldowns.find(c => c.cooldownId === 'mpPotion');
  assert.ok(cd);
  assert.equal(cd.readyAtTick, cmd.payload.inputs[0].tick + 1000);

  // Bag validation: MP potion quantity decremented (5 -> 4)
  const bag = h.bag();
  assert.equal(bag.slots[1].quantity, 4);

  // Combat events: both actions accepted in order
  const events = await h.results('mp-then-cross');
  const potionEv = events.find(e => e.seq === cmd.payload.firstSeq);
  const crossEv = events.find(e => e.seq === cmd.payload.firstSeq + 1);
  assert.ok(potionEv);
  assert.equal(potionEv.kind, 'actionAccepted');
  assert.ok(crossEv);
  assert.equal(crossEv.kind, 'actionAccepted');
});

test('battle-hybrid-supply: same-tick trinket activation boosts skill cast AP snapshot; expiry retains snapshot damage', async () => {
  const h = await hybridFixture();
  h.clock.now = () => 1513;

  // Same tick: 1. Trinket (+150 AP, 5% crit, 20% critMul), 2. Cross Slash
  const trinketInput = { kind: 'trinket', itemId: h.trinketId };
  const crossInput = { kind: 'skill', skillId: 'cross' };
  const cmd = await h.command([trinketInput, crossInput], 10, 'trinket-then-cross');
  const res = await h.service.execute(cmd);

  assert.equal(res.outcome.status, 'committed', JSON.stringify(res));

  const cp = await getCheckpoint(h);
  assert.equal(cp.role.buffs.length, 1);
  assert.equal(cp.role.attackPower, '1150'); // 1000 base + 150 trinket buff
  assert.ok(cp.scene.cross.cast !== null);
  // Cross cast snapshot captures boosted AP 1150
  assert.equal(cp.scene.cross.cast.snapshot.attackPower, '1150');

  // Advance time beyond 1500 ticks (1600 ticks via 16 slices of 100 ticks)
  for (let i = 0; i < 16; i++) {
    h.clock.now = () => 1513 + (i + 1) * 1000;
    const stepCmd = await h.command([], 100, `expiry-step-${i}`);
    const r = await h.service.execute(stepCmd);
    assert.equal(r.outcome.status, 'committed');
  }

  // After 1500 ticks, buff is pruned and attackPower reverts to baseline 1000
  const cpAfter = await getCheckpoint(h);
  assert.equal(cpAfter.role.buffs.length, 0);
  assert.equal(cpAfter.role.attackPower, '1000');
});

test('battle-hybrid-supply: failed supply action (HP_FULL) does not swallow subsequent legal skill and movement', async () => {
  const h = await hybridFixture();
  h.clock.now = () => 1513;

  // Player is at full HP (1000/1000)
  const cpBefore = await getCheckpoint(h);
  assert.equal(cpBefore.role.player.hp, '1000000');

  // Same tick: 1. HP potion (fails HP_FULL), 2. Cross Slash (legal), 3. Move
  const hpInput = { kind: 'item', quickSlotIndex: 0, templateId: HP_POTION_TEMPLATE };
  const crossInput = { kind: 'skill', skillId: 'cross' };
  const moveInput = { kind: 'move', x: 1000, y: 0 };
  const cmd = await h.command([hpInput, crossInput, moveInput], 10, 'fail-hp-then-cross');
  const res = await h.service.execute(cmd);

  assert.equal(res.outcome.status, 'committed', JSON.stringify(res));

  // Events check: first action rejected with HP_FULL, subsequent skill accepted
  const events = await h.results('fail-hp-then-cross');
  const hpEv = events.find(e => e.seq === cmd.payload.firstSeq);
  const crossEv = events.find(e => e.seq === cmd.payload.firstSeq + 1);
  assert.ok(hpEv);
  assert.equal(hpEv.kind, 'actionRejected');
  assert.equal(hpEv.code, 'HP_FULL');
  assert.ok(crossEv);
  assert.equal(crossEv.kind, 'actionAccepted');

  // HP potion was NOT consumed, no CD started
  const bag = h.bag();
  assert.equal(bag.slots[0].quantity, 5);
  const cp = await getCheckpoint(h);
  const hpCd = cp.role.cooldowns.find(c => c.cooldownId === 'hpPotion');
  assert.equal(hpCd.readyAtTick, 0);

  // Cross slash was cast successfully
  assert.ok(cp.scene.cross.cast !== null);
});

test('battle-hybrid-supply: supply is usable during knockdown control without clearing control state', async () => {
  const h = await hybridFixture();
  h.clock.now = () => 1513;

  // Simulate player in knockdown with 300 HP
  await roleFixture(h, role => {
    role.player.actionId = 'knockdown';
    role.player.hp = '300';
  });

  const hpInput = { kind: 'item', quickSlotIndex: 0, templateId: HP_POTION_TEMPLATE };
  const trinketInput = { kind: 'trinket', itemId: h.trinketId };
  const cmd = await h.command([hpInput, trinketInput], 50, 'controlled-supply');
  const res = await h.service.execute(cmd);

  assert.equal(res.outcome.status, 'committed', JSON.stringify(res));

  const cp = await getCheckpoint(h);
  // HP restored (+150: 300 -> 450)
  assert.equal(cp.role.player.hp, '450');
  // Trinket buff granted (+150 AP)
  assert.equal(cp.role.buffs.length, 1);
  // Player remains knocked down (neither potion nor trinket clears control!)
  assert.equal(cp.role.player.actionId, 'knockdown');
});

test('battle-hybrid-supply: room transition preserves buffs & CDs and advances duration deterministically', async () => {
  const h = await hybridFixture();
  h.clock.now = () => 1513;

  // In Room 0, use MP potion and trinket
  const mpInput = { kind: 'item', quickSlotIndex: 1, templateId: MP_POTION_TEMPLATE };
  const trinketInput = { kind: 'trinket', itemId: h.trinketId };
  const cmd0 = await h.command([mpInput, trinketInput], 50, 'room0-supply');
  const res0 = await h.service.execute(cmd0);
  assert.equal(res0.outcome.status, 'committed');

  // Mark all enemies dead in Room 0
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

  // Prepare Room 1
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
  assert.equal(prep1.outcome.status, 'committed', JSON.stringify(prep1));
  const manifest1 = prep1.outcome.data;

  // Advance clock by 2000ms (200 ticks of loading elapsed time)
  h.clock.now = () => 1513 + 500 + 2000;
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

  // Verify Room 1 initial checkpoint: Trinket buff is preserved across rooms!
  const cpRoom1 = await getCheckpoint(h);
  assert.equal(cpRoom1.role.buffs.length, 1);
  assert.equal(cpRoom1.role.attackPower, '1150');
  const trinketCd = cpRoom1.role.cooldowns.find(c => c.cooldownId === 'trinket');
  assert.equal(trinketCd.readyAtTick, 12001);
  assert.equal(cpRoom1.role.buffs[0].endsAtTick, 1501);
});

test('battle-hybrid-supply: recoveryPage query exposes active buffs and cooldowns in public projection', async () => {
  const h = await hybridFixture();
  h.clock.now = () => 1513;

  // Activate trinket
  const cmd = await h.command([{ kind: 'trinket', itemId: h.trinketId }], 50, 'rec-supply');
  await h.service.execute(cmd);

  const state = (await h.queryState()).data;
  const recPage = await h.service.query({
    ...h.auth,
    query: 'scene.recoveryPage',
    requestId: 'rec-test',
    payload: {
      characterId: h.characterId,
      rolePlayEpoch: h.character().rolePlayEpoch,
      challengeId: h.challengeId,
      readyTicketId: h.readyTicket.readyTicketId,
      sceneEpoch: state.sceneEpoch,
      timelineEpoch: state.timelineEpoch,
      checkpointRevision: state.checkpointRevision,
      publicStateHash: state.publicStateHash,
      manifestHash: state.manifestHash,
      pageIndex: 0
    }
  });

  assert.ok(recPage.records);
  const buffRecord = recPage.records.find(r => r.kind === 'buff' && r.templateRef === GLORY_TRINKET_TEMPLATE);
  assert.ok(buffRecord, 'recoveryPage should expose active trinket buff');
  const cdRecord = recPage.records.find(r => r.kind === 'cooldown' && r.cooldownId === 'trinket');
  assert.ok(cdRecord, 'recoveryPage should expose trinket cooldown');
});

test('battle-hybrid-supply: death clears buffs and keeps CD; return to inn resets character cooldown', async () => {
  const h = await hybridFixture();
  h.clock.now = () => 1513;

  // Activate trinket
  const cmd = await h.command([{ kind: 'trinket', itemId: h.trinketId }], 50, 'trinket-pre-death');
  await h.service.execute(cmd);

  // Set player lifeState to dead
  await roleFixture(h, role => {
    role.player.hp = '0';
    role.player.lifeState = 'dead';
  });

  // Submit next step
  h.clock.now = () => 1513 + 500;
  const deadCmd = await h.command([], 10, 'post-death-step');
  await h.service.execute(deadCmd);

  const cp = await getCheckpoint(h);
  // Death clears buffs!
  assert.equal(cp.role.buffs.length, 0);
  // Cooldown is retained in checkpoint and character!
  assert.ok(cp.role.cooldowns.find(c => c.cooldownId === 'trinket').readyAtTick > 0);
  const char = h.character();
  assert.ok(char.trinketCooldownUntil > 0);

  // While CD is active, equipment unequip is blocked
  const unequipFail = await h.equipService.execute({
    protocolVersion: 2,
    sessionId: h.session.sessionId,
    sessionEpoch: h.session.sessionEpoch,
    command: 'equipment.unequip',
    operationId: 'unequip-fail-cd',
    expected: [
      { kind: 'character', id: char.id, version: char.version },
      { kind: 'container', id: char.backpackId, version: h.bag().version }
    ],
    payload: { characterId: char.id, itemId: h.trinketId, slot: 'trinket' }
  });
  assert.equal(unequipFail.outcome.status, 'rejected');
  assert.equal(unequipFail.outcome.code, 'LOCATION_NOT_ALLOWED');

  // Return to inn (handoff) resets character trinket cooldown
  await h.store.run(async tx => {
    await handoff(tx, h.account(), h.clock.now(), 'exit-inn-clears-cd', 'receipt');
  });

  const charAfterInn = h.character();
  assert.equal(charAfterInn.trinketCooldownUntil, undefined);
});

test('battle-hybrid-supply: idempotent replay does not double-deduct inventory or refresh cooldown', async () => {
  const h = await hybridFixture();
  h.clock.now = () => 1513;

  // Set player MP to 5 so MP potion can be consumed (not rejected with MP_FULL)
  await roleFixture(h, role => {
    role.player.mp = '5';
  });

  const inputs = [
    { kind: 'item', quickSlotIndex: 1, templateId: MP_POTION_TEMPLATE },
    { kind: 'trinket', itemId: h.trinketId }
  ];
  const cmd = await h.command(inputs, 50, 'op-hybrid-replay');
  const res1 = await h.service.execute(cmd);
  assert.equal(res1.outcome.status, 'committed');

  // Inventory consumed 1 MP potion: 5 -> 4
  assert.equal(h.bag().slots[1].quantity, 4);

  // Replay identical command
  const res2 = await h.service.execute(cmd);
  assert.equal(res2.outcome.status, 'committed');
  assert.equal(res2.replayed, true);

  // Bag quantity is STILL 4 (no double deduction!)
  assert.equal(h.bag().slots[1].quantity, 4);

  // Action results query returns original events
  const events = await h.results('op-hybrid-replay');
  assert.equal(events.length, 2);
  assert.equal(events[0].kind, 'actionAccepted');
  assert.equal(events[1].kind, 'actionAccepted');
});
