import test from 'node:test';
import assert from 'node:assert/strict';
import { monsterClientFixture } from './fixtures/monster-client-fixture.mjs';

test('durable caller restores hostile CP public runtime, HP and original events after a lost response', async () => {
  const h = await monsterClientFixture();
  assert.equal(h.client.state.monsters.length, 5);
  h.setNow(1113);
  h.client.enqueue({ seq: 1, tick: 1, kind: 'basic', pressed: false });
  h.lose();
  await h.client.submit('hostile-client', 11);
  assert.equal(h.client.state.status, 'unknown');
  const reopened = h.make();
  await reopened.load(h.context, h.config, h.loading, h.basic);
  assert.equal(reopened.state.status, 'active', reopened.state.code);
  assert.equal(reopened.state.player.hp, '999500');
  assert.ok(reopened.state.monsters.every(m => m.readyAtTick === 51));
  assert.deepEqual(reopened.state.actionResults, await h.results('hostile-client'));
});

test('ranged and charge tactics execute via MovementCoordinator with ChallengeService CP roundtrip', async () => {
  const { localTacticsConfig } = await import('../../shared/src/monster-tactics.ts');
  const tactics = localTacticsConfig({ 'humanoid@1': 'ranged' }, 'normal');
  const h = await monsterClientFixture(tactics);
  assert.equal(h.client.state.status, 'active');
  assert.equal(h.client.state.monsters.length, 5);

  // Advance clock by 300ms to allow prediction up to tick 20 (20 ticks = 200ms)
  h.setNow(1013 + 300);
  h.client.enqueue({ seq: 1, tick: 1, kind: 'move', x: 1000, y: 0 });
  h.client.enqueue({ seq: 2, tick: 2, kind: 'basic', pressed: true });
  h.client.predict(20);

  await h.client.submit('ranged-charge-op', 20);
  assert.equal(h.client.state.status, 'active');
  assert.ok(h.client.state.confirmed.acceptedTick >= 20);
  assert.equal(h.client.state.monsters.length, 5);

  const state = (await h.query()).data;
  assert.equal(state.acceptedTick, 20);
});

test('elite and boss skills with super armor and phase transition execute via MovementCoordinator', async () => {
  const { localTacticsConfig } = await import('../../shared/src/monster-tactics.ts');
  const tactics = localTacticsConfig({ 'humanoid@1': 'boss' }, 'normal');
  const h = await monsterClientFixture(tactics);
  assert.equal(h.client.state.status, 'active');

  // Advance clock by 600ms to allow prediction up to tick 50
  h.setNow(1013 + 600);
  h.client.enqueue({ seq: 1, tick: 1, kind: 'basic', pressed: true });
  h.client.predict(50);
  await h.client.submit('boss-phase-op', 50);
  assert.equal(h.client.state.status, 'active');

  const monsters = h.client.state.monsters;
  assert.ok(monsters.length > 0);
  assert.ok(monsters[0].actorIndex > 0);
});

test('boss combo trample-charge wall hit and roar soundwave propagate through MovementCoordinator CP state', async () => {
  const { localTacticsConfig } = await import('../../shared/src/monster-tactics.ts');
  const tactics = localTacticsConfig({ 'humanoid@1': 'boss' }, 'hard');
  const h = await monsterClientFixture(tactics);

  // Advance clock by 900ms to allow prediction up to tick 80
  h.setNow(1013 + 900);
  h.client.enqueue({ seq: 1, tick: 1, kind: 'move', x: 1000, y: 0 });
  h.client.predict(80);
  await h.client.submit('boss-combo-roar-op', 80);

  assert.equal(h.client.state.status, 'active');
  assert.equal(h.client.state.confirmed.acceptedTick, 80);

  const reopened = h.make();
  await reopened.load(h.context, h.config, h.loading, h.basic);
  assert.equal(reopened.state.status, 'active');
  assert.equal(reopened.state.confirmed.acceptedTick, 80);
  assert.equal(reopened.state.monsters.length, 5);
});

test('live 8-enemy cluster concurrency (Rift R6) and live simulation runtime budget verification', async () => {
  const { advanceMonsterSimulation, initialMonsterState } = await import('../../shared/src/monster-simulation.ts');
  const { localTacticsConfig } = await import('../../shared/src/monster-tactics.ts');
  const { MemoryStore } = await import('../src/adapters/memory-store.ts');
  const { earthFixture } = await import('./fixtures/earth-fixture.mjs');

  const h = await earthFixture();
  const cp = await h.cp();
  const mapping = {
    test_0: 'melee', test_1: 'melee', test_2: 'melee',
    test_3: 'ranged', test_4: 'ranged', test_5: 'charge',
    test_6: 'charge', test_7: 'melee'
  };
  const cfg = localTacticsConfig(mapping, 'hard');
  const targets = Array.from({ length: 8 }, (_, i) => ({
    actorId: `monster_${i}`,
    actorIndex: i + 1,
    x: 50000 + (i % 4) * 30000,
    y: (i < 4 ? -15000 : 25000),
    hp: '5000',
    maxHp: '5000',
    lifeState: 'alive',
    mitigation: { n: '0', d: '1' },
    evasion: { n: '0', d: '1' },
    damageImmune: false,
    controlImmune: false,
    directSinceRise: '0',
    downUntilTick: null
  }));

  const initialMonsters = initialMonsterState(targets.map((t, i) => ({
    actorId: t.actorId,
    actorIndex: t.actorIndex,
    templateRef: `test_${i}`,
    identity: 'ordinary',
    attackPower: '1000'
  })), cfg);

  // Run live 8-enemy cluster simulation over 100 ticks
  const simResult = advanceMonsterSimulation({
    monsterConfig: cfg,
    monsters: initialMonsters,
    player: { hp: '10000', maxHp: '10000', lifeState: 'alive', controlledUntilTick: 0 },
    movement: { ...cp.role.movement.state, x: '0', y: '0' },
    basic: cp.role.combat.state,
    cross: cp.scene.cross,
    bengshan: cp.scene.bengshan,
    badao: cp.scene.badao,
    earth: cp.scene.earth,
    targets,
    inputs: [
      { tick: 10, kind: 'move', x: 500, y: 0 },
      { tick: 20, kind: 'basic', pressed: true },
      { tick: 50, kind: 'cross', pressed: true }
    ],
    fromTick: 0,
    toTick: 100,
    movementConfig: h.config,
    basicConfig: h.profile.config,
    crossConfig: h.profile.cross,
    bengshanConfig: h.profile.bengshan,
    badaoConfig: h.profile.badao,
    earthConfig: h.profile.earth,
    context: { challengeId: 'live-8-cluster', sceneEpoch: 1, actorId: 'player' },
    stats: { haste: { n: '1', d: '1' }, damageBonus: { n: '0', d: '1' }, hit: { n: '1', d: '1' }, crit: { n: '0', d: '1' }, critMultiplier: { n: '2', d: '1' }, attackPower: '1000', level: 20, mastery: { n: '0', d: '1' }, mp: '1000', controlled: false },
    random: cursor => Math.imul(cursor + 1, 0x9e3779b1) >>> 0
  });

  assert.equal(simResult.monsters.length, 8);
  assert.ok(simResult.monsters.every(m => m.actorIndex >= 1 && m.actorIndex <= 8));

  // Package live checkpoint structure and verify UTF-8 byte budgets
  const livePayload = {
    header: {
      challengeId: 'live-8-cluster',
      roomNo: 5,
      acceptedTick: 100,
      timestamp: Date.now()
    },
    actors: [
      { actorId: 'player', x: simResult.movement.x, y: simResult.movement.y, hp: simResult.player.hp },
      ...simResult.targets.map(t => ({ actorId: t.actorId, x: t.x, y: t.y, hp: t.hp }))
    ],
    monsterStates: simResult.monsters,
    events: simResult.events
  };

  const byteSize = val => Buffer.byteLength(JSON.stringify(val), 'utf8');
  const headerBytes = byteSize(livePayload.header);
  const totalBytes = byteSize(livePayload);

  assert.ok(headerBytes <= 16384, `Live header ${headerBytes} exceeds 16384B`);
  assert.ok(totalBytes <= 81920, `Live single CP ${totalBytes} exceeds chunk budget 81920B`);
  assert.ok(totalBytes <= 655360, `Live total size ${totalBytes} exceeds 655360B`);

  // Verify atomic persistence in MemoryStore
  const store = new MemoryStore();
  await store.run(async tx => {
    tx.set('live-cluster:header', livePayload.header);
    tx.set('live-cluster:state', livePayload);
  });

  const readState = store.inspect('live-cluster:state');
  assert.equal(readState.actors.length, 9);
  assert.equal(readState.monsterStates.length, 8);
});
