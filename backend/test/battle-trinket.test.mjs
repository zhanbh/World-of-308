import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBankFixture } from './fixtures/bank-fixture.mjs';
import { ChallengeService } from '../src/challenge/challenge-service.ts';
import { entryContentFromE01 } from '../src/challenge/challenge-content.ts';
import { EquipmentService } from '../src/equipment/equipment-service.ts';
import { TRAINING_BASIC_CONFIG } from '../../shared/src/basic-combat-kernel.ts';
import { manifestDigest } from '../../shared/src/room-manifest.ts';
import { readCheckpoint, writeChunk, stateHash } from '../src/challenge/room-checkpoint.ts';
import { loginKey } from '../src/identity/identity-v2.ts';

const GLORY_TRINKET_TEMPLATE = 'item:trinket-warrior-glory-v1';

async function trinketFixture(options = {}) {
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

  // Seed equipped trinket in store before challenge start
  await h.store.run(async tx => {
    tx.set(trinketId, trinketItem);
    const char = h.character();
    tx.set(h.characterId, {
      ...char,
      equipped: { ...char.equipped, trinket: trinketId },
      trinketEquippedAt: options.trinketEquippedAt ?? -100000 // Default: equipped long ago (no wait)
    });
  });

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
    schemaVersion: 1,
    profile: 'local-test-basic',
    capabilities: ['basic', 'no-rewards'],
    config: { ...structuredClone(TRAINING_BASIC_CONFIG), rangeX: 500000, rangeY: 500000 },
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

  const content = { ...baseContent, movement: moveConfig, combat: combatProfile };
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
  const ready = await activeService.execute({
    ...h.auth,
    command: 'scene.ready',
    controlSeq: 1,
    leaseRevision: 0,
    payload: {
      characterId: h.characterId,
      rolePlayEpoch: h.character().rolePlayEpoch,
      challengeId,
      ...Object.fromEntries(Object.entries(activated.outcome.data.readyTicket).filter(([k]) => k !== 'deadline'))
    }
  });
  assert.equal(ready.outcome.status, 'committed');

  async function command(inputs, ticks = 50, operationId = 'trinket-cmd') {
    const state = (await queryState()).data;
    const firstSeq = state.acceptedSeq + 1;
    const payload = {
      characterId: h.characterId,
      rolePlayEpoch: h.character().rolePlayEpoch,
      challengeId,
      roomNo: 0,
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
    service: activeService,
    equipService,
    challengeId,
    command,
    results,
    queryState
  };
}

async function getCheckpoint(h) {
  return h.store.run(async tx => readCheckpoint(tx, await tx.get(h.challengeId)));
}

test('battle-trinket: successful trinket activation grants 15s buff, starts 120s CD, and preserves equipment', async () => {
  const h = await trinketFixture();
  h.clock.now = () => 1513;

  const trinketInput = { kind: 'trinket', itemId: h.trinketId };
  const cmd = await h.command([trinketInput], 50, 'use-trinket-1');
  const res = await h.service.execute(cmd);

  assert.equal(res.outcome.status, 'committed', JSON.stringify(res));

  // Checkpoint validation
  const cp = await getCheckpoint(h);
  assert.equal(cp.role.buffs.length, 1);
  const buff = cp.role.buffs[0];
  assert.equal(buff.templateRef, GLORY_TRINKET_TEMPLATE);
  assert.equal(buff.endsAtTick, cmd.payload.inputs[0].tick + 1500); // 15s buff = 1500 ticks

  const cd = cp.role.cooldowns.find(c => c.cooldownId === 'trinket');
  assert.ok(cd);
  assert.equal(cd.readyAtTick, cmd.payload.inputs[0].tick + 12000); // 120s CD = 12000 ticks

  // Character cooldown timestamp updated
  const char = h.character();
  assert.ok(char.trinketCooldownUntil);
  assert.ok(char.trinketCooldownUntil > 1000);

  // Combat event is actionAccepted
  const events = await h.results('use-trinket-1');
  const trinketEvent = events.find(e => e.seq === cmd.payload.firstSeq);
  assert.ok(trinketEvent);
  assert.equal(trinketEvent.kind, 'actionAccepted');
});

test('battle-trinket: dynamic AP buff reflects in checkpoint attackPower during buff and reverts after expiry', async () => {
  const h = await trinketFixture();
  h.clock.now = () => 1513;

  // Initial base AP is 120000 in warrior-first-normal.test.json
  const cpBefore = await getCheckpoint(h);
  assert.equal(cpBefore.role.attackPower, '120000');

  // Activate trinket (+150 AP) in a 50 tick slice
  const trinketInput = { kind: 'trinket', itemId: h.trinketId };
  const cmd1 = await h.command([trinketInput], 50, 'trinket-ap-test-1');
  await h.service.execute(cmd1);

  // During buff, CP attackPower is boosted by 150 -> 1150
  const cpDuring = await getCheckpoint(h);
  assert.equal(cpDuring.role.attackPower, '1150');

  // Advance time beyond 1500 ticks (1600 ticks via 16 slices of 100 ticks)
  for (let i = 0; i < 16; i++) {
    h.clock.now = () => 1513 + (i + 1) * 1000;
    const cmd = await h.command([], 100, `trinket-ap-step-${i}`);
    const r = await h.service.execute(cmd);
    assert.equal(r.outcome.status, 'committed');
  }

  // Expired: buff is pruned and attackPower reverts to 1000
  const cpAfter = await getCheckpoint(h);
  assert.equal(cpAfter.role.buffs.length, 0);
  assert.equal(cpAfter.role.attackPower, '1000');
});

test('battle-trinket: rejected with EQUIP_WAITING during 60s equip waiting window', async () => {
  // Character equipped trinket 10 seconds ago (10000ms ago) -> 50s wait remaining = 5000 ticks
  const h = await trinketFixture({ trinketEquippedAt: 1000 - 10000 });
  h.clock.now = () => 1213;

  // Attempt use at tick 0 (< 5000 ticks wait)
  const trinketInput = { kind: 'trinket', itemId: h.trinketId };
  const cmd = await h.command([trinketInput], 20, 'trinket-wait-test');
  const res = await h.service.execute(cmd);

  assert.equal(res.outcome.status, 'committed');

  // Check event is actionRejected with EQUIP_WAITING
  const events = await h.results('trinket-wait-test');
  const ev = events.find(e => e.seq === cmd.payload.firstSeq);
  assert.ok(ev);
  assert.equal(ev.kind, 'actionRejected');
  assert.equal(ev.code, 'EQUIP_WAITING');

  // No buff added, no CD started
  const cp = await getCheckpoint(h);
  assert.equal(cp.role.buffs.length, 0);
  const cd = cp.role.cooldowns.find(c => c.cooldownId === 'trinket');
  assert.equal(cd.readyAtTick, 0);
});

test('battle-trinket: rejected with COOLDOWN_ACTIVE when used again during 120s CD', async () => {
  const h = await trinketFixture();
  h.clock.now = () => 1513;

  // 1. Activate trinket
  const cmd1 = await h.command([{ kind: 'trinket', itemId: h.trinketId }], 50, 'trinket-cd-1');
  await h.service.execute(cmd1);

  // 2. Try activating again at tick 50 (CD is ready at tick 12000)
  h.clock.now = () => 1513 + 500;
  const cmd2 = await h.command([{ kind: 'trinket', itemId: h.trinketId }], 50, 'trinket-cd-2');
  const res2 = await h.service.execute(cmd2);

  assert.equal(res2.outcome.status, 'committed');
  const events = await h.results('trinket-cd-2');
  const ev = events.find(e => e.seq === cmd2.payload.firstSeq);
  assert.ok(ev);
  assert.equal(ev.kind, 'actionRejected');
  assert.equal(ev.code, 'COOLDOWN_ACTIVE');

  // Buff count remains 1, CD is untouched
  const cp = await getCheckpoint(h);
  assert.equal(cp.role.buffs.length, 1);
});

test('battle-trinket: rejected with ITEM_NOT_EQUIPPED when itemId does not match equipped trinket', async () => {
  const h = await trinketFixture();
  h.clock.now = () => 1513;

  const cmd = await h.command([{ kind: 'trinket', itemId: 'wrong-item-id' }], 50, 'trinket-wrong-id');
  const res = await h.service.execute(cmd);

  assert.equal(res.outcome.status, 'committed');
  const events = await h.results('trinket-wrong-id');
  const ev = events.find(e => e.seq === cmd.payload.firstSeq);
  assert.ok(ev);
  assert.equal(ev.kind, 'actionRejected');
  assert.equal(ev.code, 'ITEM_NOT_EQUIPPED');
});

test('battle-trinket: equipment unequip rejected while trinket cooldown is active', async () => {
  const h = await trinketFixture();
  h.clock.now = () => 1513;

  // Activate trinket -> character.trinketCooldownUntil is set
  const cmd = await h.command([{ kind: 'trinket', itemId: h.trinketId }], 50, 'trinket-unequip-lock');
  await h.service.execute(cmd);

  const char = h.character();
  assert.ok(char.trinketCooldownUntil);

  // Attempt unequip via equipmentService
  const unequipCmd = {
    protocolVersion: 2,
    sessionId: h.session.sessionId,
    sessionEpoch: h.session.sessionEpoch,
    command: 'equipment.unequip',
    operationId: 'unequip-trinket-cd-active',
    expected: [
      { kind: 'character', id: char.id, version: char.version },
      { kind: 'container', id: char.backpackId, version: h.bag().version }
    ],
    payload: {
      characterId: char.id,
      itemId: h.trinketId,
      slot: 'trinket'
    }
  };

  const unequipRes = await h.equipService.execute(unequipCmd);
  assert.equal(unequipRes.outcome.status, 'rejected');
  assert.equal(unequipRes.outcome.code, 'LOCATION_NOT_ALLOWED');
});
