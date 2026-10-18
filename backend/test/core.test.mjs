import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, system, data, code, key, principal, rendezvous } from './helpers.mjs';
import { GameService } from '../src/application/game-service.ts';
import { StoreUnavailable } from '../src/ports/store.ts';

test('death + ordinary DOT kill can level up but cannot resurrect; monster level stays locked', async () => {
  const h = await setup();
  const response = await h.report([h.death(), h.kill('mob-a', 2, 'dot', 'bleed')]);
  assert.equal(data(response).restore, null);
  const state = await h.view();
  assert.equal(state.character.level, 2); assert.equal(state.challenge.lifeState, 'dead');
  assert.equal(state.challenge.result, 'active'); assert.equal(state.challenge.lockedMonsterLevel, 1);
  assert.equal(state.challenge.deathDeadline, 10_000); assert.equal(state.wallet.gold, 2);
});

test('dead player wins via lingering boss damage: free resurrection, all mob rewards exactly once', async () => {
  const h = await setup();
  const events = [h.death(), h.kill('boss', 2, 'lingering', 'bleed'), h.kill('mob-a', 3, 'dot', 'bleed')];
  const request = h.request('challenge.reportEvents', { challengeId: h.challengeId, roomToken: h.roomToken, firstSeq: 1, events }, 'finale');
  const response = await h.service.execute(h.auth, request);
  assert.equal(data(response).restore, 'fullHpMp');
  const state = await h.view();
  const ledger = h.store.inspect(key('room', h.challengeId, 0));
  assert.equal(state.challenge.result, 'completed'); assert.equal(state.challenge.lifeState, 'alive');
  assert.equal(state.challenge.deathDeadline, undefined); assert.equal(state.challenge.paidRevives, 0);
  assert.equal(state.character.xp, 40); assert.equal(state.wallet.gold, 106); assert.equal(ledger.drops.length, 3);
  assert.equal(ledger.kills['mob-a'].mode, 'indirect'); assert.equal(Object.keys(ledger.kills).length, 3);
  assert.equal(state.account.activeChallengeId, undefined); assert.equal(state.account.openSceneChallengeId, h.challengeId);
  const item = h.peek('equipment', state.bag.slots[0].itemId); assert.equal(item.binding, 'character');
  const calls = h.calls.length;
  assert.equal((await h.service.execute(h.auth, request)).replayed, true);
  assert.equal(h.calls.length, calls); assert.equal((await h.view()).wallet.gold, 106);
});

test('manual revive consumes one emblem, preserves cooldowns and provides protection plus non-damaging control', async () => {
  const h = await setup(); await h.emblems(2); await h.report([h.death()]);
  const request = h.request('challenge.revive', { challengeId: h.challengeId, deathIndex: 1 }, 'revive');
  const response = data(await h.service.execute(h.auth, request));
  assert.equal(response.resetCooldowns, false); assert.equal(response.controlDamage, 0); assert.equal(response.protectionUntil, 2000);
  let state = await h.view(); assert.equal(state.bag.slots[0].quantity, 1); assert.equal(state.challenge.paidRevives, 1);
  assert.equal(state.challenge.lifeState, 'alive');
  await h.service.execute(h.auth, request); state = await h.view();
  assert.equal(state.bag.slots[0].quantity, 1); assert.equal(state.challenge.paidRevives, 1);
});

test('two different revive intents racing consume one emblem', async () => {
  const h = await setup(); await h.emblems(2); await h.report([h.death()]);
  const a = h.request('challenge.revive', { challengeId: h.challengeId, deathIndex: 1 }, 'revive-a');
  const b = { ...a, operationId: 'revive-b' }; rendezvous(h.store);
  const results = await Promise.all([h.service.execute(h.auth, a), h.service.execute(h.auth, b)]);
  h.store.beforeCommit = undefined;
  assert.equal(results.filter(r => r.outcome.status === 'committed').length, 1);
  assert.ok(h.store.conflicts > 0); const state = await h.view();
  assert.equal(state.bag.slots[0].quantity, 1); assert.equal(state.challenge.paidRevives, 1);
});

test('no emblem: stable rejection cannot become a debit when replayed later', async () => {
  const h = await setup(); await h.report([h.death()]);
  const request = h.request('challenge.revive', { challengeId: h.challengeId, deathIndex: 1 }, 'no-money');
  assert.equal(code(await h.service.execute(h.auth, request)), 'EMBLEM_NOT_ENOUGH');
  await h.emblems(1);
  assert.equal(code(await h.service.execute(h.auth, request)), 'EMBLEM_NOT_ENOUGH');
  assert.equal((await h.view()).bag.slots[0].quantity, 1);
});

test('special dungeon cap is cumulative and free completion resurrection does not use it', async () => {
  const h = await setup();
  await h.send('challenge.leave', { challengeId: h.challengeId, reason: 'abandon' });
  const rules = structuredClone(h.rules);
  rules.xpThresholds = Array.from({ length: 30 }, (_, level) => level * 10);
  rules.dungeons[0].special = true; rules.dungeons[0].reviveLimit = 1; rules.dungeons[0].version = 'special-test-v1';
  h.service = new GameService(h.store, h.clock, h.ids, h.rewards, rules);
  await h.seed('character', h.characterId, c => { c.level = 30; c.xp = 290; });
  await h.start(); await h.enter(); await h.emblems(2);
  assert.equal((await h.view()).character.stamina.value, 304);
  await h.report([h.death()]); data(await h.send('challenge.revive', { challengeId: h.challengeId, deathIndex: 1 }));
  await h.report([h.death(2, 2)]);
  assert.equal(code(await h.send('challenge.revive', { challengeId: h.challengeId, deathIndex: 2 })), 'REVIVE_LIMIT_REACHED');
  data(await h.report([h.kill('boss', 3, 'dot', 'bleed')]));
  const state = await h.view(); assert.equal(state.challenge.paidRevives, 1); assert.equal(state.bag.slots[0].quantity, 1);
});

for (const offset of [-1, 0, 1]) test(`death deadline boundary offset ${offset}`, async () => {
  const h = await setup(); await h.emblems(1); await h.report([h.death()]);
  h.clock.value = 5000; await h.service.control(h.auth, h.challengeId, { kind: 'heartbeat', seq: 1 });
  h.clock.value = 10_000 + offset;
  const response = await h.send('challenge.revive', { challengeId: h.challengeId, deathIndex: 1 });
  assert.equal(response.outcome.status, offset < 0 ? 'committed' : 'rejected');
  const state = await h.view(); assert.equal(state.challenge.result, offset < 0 ? 'active' : 'failed');
  assert.equal(state.bag.slots.length, offset < 0 ? 0 : 1);
});

test('death clock expires during 6-second disconnection after 4 seconds dead', async () => {
  const h = await setup(); await h.report([h.death()]);
  h.clock.value = 4000; data(await h.service.control(h.auth, h.challengeId, { kind: 'suspend', seq: 1 }));
  h.clock.value = 10_000;
  assert.equal(code(await h.service.control(h.auth, h.challengeId, { kind: 'resume', seq: 2 })), 'DEADLINE_EXPIRED');
  assert.equal((await h.view()).challenge.result, 'failed');
});

test('repeated background notifications and heartbeat replay cannot extend recovery', async () => {
  const h = await setup(); h.clock.value = 1000;
  await h.service.control(h.auth, h.challengeId, { kind: 'suspend', seq: 1 });
  h.clock.value = 9000;
  await h.service.control(h.auth, h.challengeId, { kind: 'suspend', seq: 2 });
  assert.equal(code(await h.service.control(h.auth, h.challengeId, { kind: 'heartbeat', seq: 1 })), 'RECOVERY_REQUIRED');
  assert.equal((await h.view()).challenge.lease.recoveryUntil, 11000);
  h.clock.value = 11000;
  assert.equal(code(await h.service.control(h.auth, h.challengeId, { kind: 'resume', seq: 3 })), 'DEADLINE_EXPIRED');
});

test('heartbeat sequence replay does not renew lease; late new heartbeat cannot revive it', async () => {
  const h = await setup(); h.clock.value = 1000;
  await h.service.control(h.auth, h.challengeId, { kind: 'heartbeat', seq: 1 });
  h.clock.value = 9000; await h.service.control(h.auth, h.challengeId, { kind: 'heartbeat', seq: 1 });
  assert.equal((await h.view()).challenge.lease.until, 11000);
  h.clock.value = 11000;
  assert.equal(code(await h.service.control(h.auth, h.challengeId, { kind: 'heartbeat', seq: 2 })), 'DEADLINE_EXPIRED');
});

test('recovery pauses events, then resumes without resetting original death deadline', async () => {
  const h = await setup(); await h.report([h.death()]); h.clock.value = 2000;
  await h.service.control(h.auth, h.challengeId, { kind: 'suspend', seq: 1 });
  assert.equal(code(await h.report([h.kill('boss', 2, 'dot', 'bleed')])), 'RECOVERY_REQUIRED');
  h.clock.value = 5000; await h.service.control(h.auth, h.challengeId, { kind: 'resume', seq: 2 });
  assert.equal((await h.view()).challenge.deathDeadline, 10000);
  assert.equal(data(await h.report([h.kill('boss', 2, 'dot', 'bleed')])).result, 'completed');
});

test('transaction conflict retry rechecks the death deadline and does not spend emblem', async () => {
  const h = await setup(); await h.emblems(1); await h.report([h.death()]);
  h.clock.value = 9999;
  let release, notify, held = false;
  const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { notify = resolve; });
  h.store.beforeCommit = async () => { if (!held) { held = true; notify(); await gate; } };
  const revive = h.send('challenge.revive', { challengeId: h.challengeId, deathIndex: 1 });
  await entered; await h.service.control(h.auth, h.challengeId, { kind: 'heartbeat', seq: 1 });
  h.clock.value = 10000; release();
  assert.equal(code(await revive), 'DEADLINE_EXPIRED'); h.store.beforeCommit = undefined;
  const state = await h.view(); assert.equal(state.challenge.result, 'failed'); assert.equal(state.bag.slots[0].quantity, 1);
});

test('room payment is business-idempotent across distinct requests and stamina refresh', async () => {
  const h = await setup(); assert.equal((await h.view()).character.stamina.value, 307);
  h.clock.value = 4 * 3600_000;
  // Keep the scene alive explicitly in the fixture; no in-game offline continuation is implied.
  await h.seed('challenge', h.challengeId, c => { c.lease.until = h.clock.value + 10000; });
  data(await h.send('challenge.enterRoom', { challengeId: h.challengeId, roomNo: 0 }));
  assert.equal((await h.view()).character.stamina.value, 307);
});

test('insufficient stamina does not create a paid room', async () => {
  const h = await setup(); await h.send('challenge.leave', { challengeId: h.challengeId, reason: 'abandon' });
  await h.seed('character', h.characterId, c => { c.stamina.value = 0; }); await h.start();
  assert.equal(code(await h.send('challenge.enterRoom', { challengeId: h.challengeId, roomNo: 0 })), 'STAMINA_NOT_ENOUGH');
  assert.equal(h.store.inspect(key('room', h.challengeId, 0)), undefined);
  assert.equal((await h.view()).character.stamina.value, 0);
});

test('same operation ID with different payload is rejected; caller cannot submit reward amounts', async () => {
  const h = await setup();
  const request = h.request('challenge.revive', { challengeId: h.challengeId, deathIndex: 1 }, 'same');
  await h.service.execute(h.auth, request);
  assert.equal(code(await h.service.execute(h.auth, { ...request, payload: { ...request.payload, deathIndex: 2 } })), 'OPERATION_MISMATCH');
  assert.equal(code(await h.service.execute(h.auth, { ...request, operationId: 'inject', payload: { ...request.payload, gold: 999 } })), 'INVALID_ARGUMENT');
  assert.equal((await h.view()).wallet.gold, 0);
});

test('event gap, stale room token, unknown monster and new direct attacks after death give no reward', async () => {
  const h = await setup();
  assert.equal(code(await h.report([h.kill('boss', 2)])), 'EVENT_GAP');
  const payload = { challengeId: h.challengeId, roomToken: 'other-room', firstSeq: 1, events: [h.kill('boss', 1)] };
  assert.equal(code(await h.send('challenge.reportEvents', payload)), 'ROOM_NOT_AVAILABLE');
  assert.equal(code(await h.report([h.kill('unknown', 1)])), 'INVALID_EVENT');
  await h.report([h.death()]);
  assert.equal(code(await h.report([h.kill('mob-a', 2)])), 'INVALID_EVENT');
  assert.equal(code(await h.report([h.kill('mob-a', 2, 'dot', 'unknown-effect')])), 'INVALID_EVENT');
  assert.equal((await h.view()).wallet.gold, 0);
});

test('invalid trailing event rolls back earlier kill and generated reward in the same batch', async () => {
  const h = await setup();
  const response = await h.report([h.kill('mob-a', 1), h.kill('not-spawned', 2)]);
  assert.equal(code(response), 'INVALID_EVENT');
  const state = await h.view(); assert.equal(state.character.xp, 0); assert.equal(state.wallet.gold, 0);
  assert.equal(state.challenge.lastEventSeq, 0); assert.deepEqual(h.store.inspect(key('room', h.challengeId, 0)).kills, {});
});

test('new event sequence cannot award the same spawn twice; latest identical batch can replay with a new ID', async () => {
  const h = await setup(); const events = [h.kill('mob-a', 1)];
  data(await h.report(events)); const calls = h.calls.length;
  data(await h.report(events)); assert.equal(h.calls.length, calls);
  data(await h.report([h.kill('mob-a', 2)]));
  assert.equal((await h.view()).wallet.gold, 2); assert.equal((await h.view()).character.xp, 10);
});

test('completion full bag becomes original-character pending reward; claim delivers once', async () => {
  const h = await setup();
  await h.seed('bag', h.characterId, b => { b.slots = Array.from({ length: 10 }, (_, i) => ({ kind: 'stack', templateId: `filler-${i}`, quantity: 20 })); });
  await h.report([h.kill('boss', 1)]); const sourceId = key('completion', h.challengeId);
  let state = await h.view(); assert.equal(state.wallet.gold, 106); assert.equal(state.bag.slots.length, 10);
  const grant = h.peek('grant', sourceId); assert.equal(grant.state, 'pending'); assert.equal(grant.characterId, h.characterId);
  assert.equal(h.peek('equipment', grant.itemId).binding, 'character');
  await h.send('challenge.leave', { challengeId: h.challengeId, reason: 'finishLoot' });
  assert.equal(code(await h.send('reward.claim', { sourceId })), 'BAG_FULL');
  await h.seed('bag', h.characterId, b => { b.slots.pop(); });
  data(await h.send('reward.claim', { sourceId })); data(await h.send('reward.claim', { sourceId }));
  state = await h.view(); assert.equal(state.bag.slots.filter(s => s.kind === 'equipment').length, 1);
  assert.equal(h.peek('grant', sourceId).state, 'delivered');
});

test('ground full bag remains on ground and cannot be converted into pending reward', async () => {
  const h = await setup(); await h.report([h.kill('mob-a', 1)]);
  const drop = h.store.inspect(key('room', h.challengeId, 0)).drops[0];
  await h.seed('bag', h.characterId, b => { b.slots = Array.from({ length: 10 }, (_, i) => ({ kind: 'stack', templateId: `fill-${i}`, quantity: 20 })); });
  assert.equal(code(await h.send('drop.collect', { challengeId: h.challengeId, roomNo: 0, dropId: drop.id, sceneEpoch: 1 })), 'BAG_FULL');
  assert.equal(h.store.inspect(key('room', h.challengeId, 0)).drops[0].state, 'ground');
  assert.equal(h.peek('grant', drop.sourceId), undefined);
});

test('two different collection intents cannot duplicate a ground item; collected assets survive exit', async () => {
  const h = await setup(); await h.report([h.kill('mob-a', 1)]);
  const drop = h.store.inspect(key('room', h.challengeId, 0)).drops[0];
  const a = h.request('drop.collect', { challengeId: h.challengeId, roomNo: 0, dropId: drop.id, sceneEpoch: 1 }, 'collect-a');
  rendezvous(h.store);
  await Promise.all([h.service.execute(h.auth, a), h.service.execute(h.auth, { ...a, operationId: 'collect-b' })]); h.store.beforeCommit = undefined;
  assert.deepEqual((await h.view()).bag.slots, [{ kind: 'stack', templateId: 'ore', quantity: 1 }]);
  data(await h.send('challenge.leave', { challengeId: h.challengeId, reason: 'abandon' }));
  assert.equal((await h.view()).bag.slots[0].quantity, 1); assert.equal((await h.view()).wallet.gold, 2);
});

test('online completed looting can continue indefinitely; disconnect only closes scene', async () => {
  const h = await setup(); await h.report([h.kill('boss', 1)]);
  for (let seq = 1; seq <= 40; seq++) { h.clock.value += 9000; data(await h.service.control(h.auth, h.challengeId, { kind: 'heartbeat', seq })); }
  assert.equal((await h.view()).challenge.sceneState, 'looting');
  h.clock.value += 10000;
  const state = await h.view(); assert.equal(state.challenge.result, 'completed'); assert.equal(state.challenge.sceneState, 'closed');
  assert.equal(state.wallet.gold, 106);
});

test('new launch does not resume unfinished challenge or refund stamina; old session cannot write/replay', async () => {
  const h = await setup(); const oldAuth = h.auth;
  const request = h.request('challenge.revive', { challengeId: h.challengeId, deathIndex: 1 }, 'old-intent');
  await h.service.execute(oldAuth, request);
  const next = data(await h.service.openSession(principal, 'launch-2', 'open-2'));
  h.auth = { ...oldAuth, sessionId: next.sessionId, epoch: next.epoch };
  assert.equal(code(await h.service.execute(oldAuth, request)), 'SESSION_REVOKED');
  assert.equal(code(await h.service.openSession(principal, 'launch-1', 'open-1')), 'SESSION_REVOKED');
  const state = await h.view(); assert.equal(state.challenge.result, 'failed'); assert.equal(state.character.stamina.value, 307);
  assert.equal((await h.service.operation(h.auth, 'old-intent')).code, 'NOT_DEAD');
});

test('restart after completion preserves success and rewards but cannot resume ground pickup', async () => {
  const h = await setup(); await h.report([h.kill('boss', 1)]);
  const next = data(await h.service.openSession(principal, 'launch-2', 'open-2'));
  h.auth = { ...h.auth, sessionId: next.sessionId, epoch: next.epoch };
  const state = await h.view(); assert.equal(state.challenge.result, 'completed'); assert.equal(state.challenge.sceneState, 'closed'); assert.equal(state.wallet.gold, 106);
});

test('concurrent first login creates one account and one effective session; same launch retries are idempotent', async () => {
  const h = system(); rendezvous(h.store);
  const responses = await Promise.all([h.service.openSession(principal, 'launch', 'open'), h.service.openSession(principal, 'launch', 'open')]);
  h.store.beforeCommit = undefined;
  assert.deepEqual(data(responses[0]), data(responses[1]));
  const accounts = [...h.store.snapshot()].filter(([k]) => JSON.parse(k)[0] === 'account'); assert.equal(accounts.length, 1);
  assert.equal(data(responses[0]).epoch, 1); assert.ok(h.store.conflicts > 0);
});

test('account fence resolves concurrent takeover vs old-session kill without losing committed assets', async () => {
  const h = await setup(); rendezvous(h.store);
  const request = h.request('challenge.reportEvents', { challengeId: h.challengeId, roomToken: h.roomToken, firstSeq: 1, events: [h.kill('mob-a', 1)] });
  const [kill, opened] = await Promise.all([h.service.execute(h.auth, request), h.service.openSession(principal, 'launch-2', 'open-2')]);
  h.store.beforeCommit = undefined; const next = data(opened); h.auth = { ...h.auth, sessionId: next.sessionId, epoch: next.epoch };
  const state = await h.view(); assert.equal(state.challenge.result, 'failed');
  assert.equal(state.wallet.gold, kill.outcome.status === 'committed' ? 2 : 0); assert.ok(h.store.conflicts > 0);
});

test('one active challenge per account; completed but open scene must be explicitly closed before new challenge', async () => {
  const h = await setup();
  assert.equal(code(await h.send('challenge.start', { characterId: h.characterId, dungeonId: 'test-dungeon', difficultyId: 'normal' })), 'ACTIVE_CHALLENGE_EXISTS');
  await h.report([h.kill('boss', 1)]);
  assert.equal(code(await h.send('challenge.start', { characterId: h.characterId, dungeonId: 'test-dungeon', difficultyId: 'normal' })), 'SCENE_STILL_OPEN');
  await h.send('challenge.leave', { challengeId: h.challengeId, reason: 'finishLoot' });
  await h.start(); assert.equal((await h.view()).challenge.result, 'active');
});

test('trusted principal and account/character ownership are checked independently of client IDs', async () => {
  const h = await setup();
  const foreign = data(await h.service.openSession({ ...principal, subject: 'someone-else' }, 'foreign', 'foreign-open'));
  const foreignAuth = { principal: { ...principal, subject: 'someone-else' }, accountId: foreign.accountId, sessionId: foreign.sessionId, epoch: foreign.epoch };
  const request = h.request('challenge.revive', { challengeId: h.challengeId, deathIndex: 1 });
  assert.equal(code(await h.service.execute(foreignAuth, request)), 'NOT_FOUND_OR_FORBIDDEN');
  assert.equal(code(await h.service.execute({ ...h.auth, principal: foreignAuth.principal }, request)), 'AUTH_REQUIRED');
});

test('committed response loss returns unknown; same operation can be queried and retried without reroll', async () => {
  const h = await setup();
  const request = h.request('challenge.reportEvents', { challengeId: h.challengeId, roomToken: h.roomToken, firstSeq: 1, events: [h.kill('boss', 1)] }, 'lost');
  h.store.injectResponseLoss(); assert.equal(code(await h.service.execute(h.auth, request)), 'RESULT_UNKNOWN');
  const calls = h.calls.length; assert.equal((await h.service.operation(h.auth, 'lost')).status, 'committed');
  assert.equal((await h.service.execute(h.auth, request)).replayed, true); assert.equal(h.calls.length, calls);
  assert.equal((await h.view()).wallet.gold, 106);
});

test('every final-settlement write point rolls back fully on failure', async () => {
  const reference = await setup(); const before = reference.store.snapshot();
  await reference.report([reference.kill('boss', 1)]);
  const after = reference.store.snapshot();
  const writes = [...after].filter(([k, v]) => JSON.stringify(before.get(k)) !== JSON.stringify(v)).length;
  assert.ok(writes >= 8);
  for (let at = 1; at <= writes; at++) {
    const h = await setup(); const saved = h.store.snapshot();
    h.store.injectWriteFailure(at);
    await assert.rejects(() => h.report([h.kill('boss', 1)]), StoreUnavailable);
    assert.deepEqual(h.store.snapshot(), saved, `write ${at} leaked partial settlement`);
  }
});

test('invalid special limits are rejected; external config mutation cannot change an active challenge', async () => {
  const h = await setup(); const bad = structuredClone(h.rules); bad.dungeons[0].special = true;
  assert.throws(() => new GameService(h.store, h.clock, h.ids, h.rewards, bad), /CONFIG_NOT_READY/);
  h.rules.dungeons[0].completionXp = 9999;
  data(await h.report([h.kill('boss', 1)]));
  assert.equal((await h.view()).character.xp, 40);
});

test('ordinary living completion does not heal unless it actually levels the character', async () => {
  const h = await setup({ xpThresholds: [0, 10000] });
  assert.equal(data(await h.report([h.kill('boss', 1)])).restore, null);
  const dead = await setup({ xpThresholds: [0, 10000] });
  assert.equal(data(await dead.report([dead.death(), dead.kill('boss', 2, 'dot', 'bleed')])).restore, 'fullHpMp');
});

test('delayed asynchronous repository reads crossing the deadline cannot charge for resurrection', async () => {
  const h = await setup(); await h.emblems(1); await h.report([h.death()]);
  h.clock.value = 9999;
  const delayed = { run: work => h.store.run(tx => work({
    get: async id => { const value = await tx.get(id); if (JSON.parse(id)[0] === 'bag') h.clock.value = 10000; return value; },
    set: (id, value) => tx.set(id, value),
  })) };
  h.service = new GameService(delayed, h.clock, h.ids, h.rewards, h.rules);
  assert.equal(code(await h.send('challenge.revive', { challengeId: h.challengeId, deathIndex: 1 })), 'DEADLINE_EXPIRED');
  const state = await h.view(); assert.equal(state.challenge.result, 'failed'); assert.equal(state.bag.slots[0].quantity, 1);
});

test('stale death index cannot consume an emblem for a later death', async () => {
  const h = await setup(); await h.emblems(2); await h.report([h.death()]);
  await h.send('challenge.revive', { challengeId: h.challengeId, deathIndex: 1 });
  await h.report([h.death(2, 2)]);
  assert.equal(code(await h.send('challenge.revive', { challengeId: h.challengeId, deathIndex: 1 })), 'NOT_DEAD');
  assert.equal((await h.view()).bag.slots[0].quantity, 1);
});

test('boss transaction retry reuses reward candidates and does not reroll on write conflict', async () => {
  const h = await setup(); rendezvous(h.store);
  const [finish] = await Promise.all([
    h.report([h.kill('boss', 1)]), h.service.control(h.auth, h.challengeId, { kind: 'heartbeat', seq: 1 }),
  ]);
  h.store.beforeCommit = undefined;
  assert.equal(data(finish).result, 'completed'); assert.ok(h.store.conflicts > 0);
  assert.equal(h.calls.length, 4); assert.equal((await h.view()).wallet.gold, 106);
});

test('room progression, fixed refill and payment replay preserve the correct total stamina', async () => {
  const baseline = system().rules.dungeons[0];
  const dungeon = structuredClone(baseline);
  dungeon.rooms.unshift([{ spawnId: 'entry-mob', xp: 1, tableId: 'monster' }]);
  const h = await setup({ dungeons: [dungeon] });
  await h.send('challenge.leave', { challengeId: h.challengeId, reason: 'abandon' });
  h.clock.value = 4 * 3600_000 - 1000; await h.start(); await h.enter();
  assert.equal((await h.view()).character.stamina.value, 306);
  assert.equal(code(await h.send('challenge.enterRoom', { challengeId: h.challengeId, roomNo: 1 })), 'ROOM_NOT_AVAILABLE');
  await h.report([h.kill('entry-mob', 1)]);
  h.clock.value += 1000;
  const paid = data(await h.send('challenge.enterRoom', { challengeId: h.challengeId, roomNo: 1 }));
  assert.equal(paid.paidCost, 1); assert.equal((await h.view()).character.stamina.value, 307);
  await h.send('challenge.enterRoom', { challengeId: h.challengeId, roomNo: 1 });
  assert.equal((await h.view()).character.stamina.value, 307);
});

test('material pickup fills compatible stacks before allocating a slot and preserves overflow on ground', async () => {
  const h = await setup();
  await h.seed('bag', h.characterId, b => { b.slots = [{ kind: 'stack', templateId: 'ore', quantity: 19 }]; });
  await h.report([h.kill('mob-a', 1)]);
  const first = h.store.inspect(key('room', h.challengeId, 0)).drops[0];
  data(await h.send('drop.collect', { challengeId: h.challengeId, roomNo: 0, dropId: first.id, sceneEpoch: 1 }));
  assert.deepEqual((await h.view()).bag.slots, [{ kind: 'stack', templateId: 'ore', quantity: 20 }]);
  await h.report([h.kill('mob-b', 2)]);
  const second = h.store.inspect(key('room', h.challengeId, 0)).drops[1];
  data(await h.send('drop.collect', { challengeId: h.challengeId, roomNo: 0, dropId: second.id, sceneEpoch: 1 }));
  assert.equal((await h.view()).bag.slots[1].quantity, 1);
});

test('two concurrent challenge starts across two owned characters admit only one', async () => {
  const h = await setup(); await h.send('challenge.leave', { challengeId: h.challengeId, reason: 'abandon' });
  const hunter = data(await h.send('character.create', { classId: 'hunter' })).characterId;
  const a = h.request('challenge.start', { characterId: h.characterId, dungeonId: 'test-dungeon', difficultyId: 'normal' });
  const b = h.request('challenge.start', { characterId: hunter, dungeonId: 'test-dungeon', difficultyId: 'normal' });
  rendezvous(h.store);
  const results = await Promise.all([h.service.execute(h.auth, a), h.service.execute(h.auth, b)]); h.store.beforeCommit = undefined;
  assert.equal(results.filter(r => r.outcome.status === 'committed').length, 1);
  assert.equal(results.filter(r => code(r) === 'ACTIVE_CHALLENGE_EXISTS').length, 1);
});

test('session open response loss can retry without a second takeover', async () => {
  const h = system(); h.store.injectResponseLoss();
  assert.equal(code(await h.service.openSession(principal, 'launch-1', 'open-1')), 'RESULT_UNKNOWN');
  const retry = await h.service.openSession(principal, 'launch-1', 'open-1');
  assert.equal(retry.replayed, true); assert.equal(data(retry).epoch, 1);
});

test('malformed auth, missing expected version and non-finite event numbers are rejected without effects', async () => {
  const h = await setup(); const request = h.request('challenge.revive', { challengeId: h.challengeId, deathIndex: 1 });
  assert.equal(code(await h.service.execute(undefined, request)), 'AUTH_REQUIRED');
  assert.equal(code(await h.send('challenge.revive', request.payload, 'no-version', {})), 'INVALID_ARGUMENT');
  assert.equal(code(await h.report([{ ...h.kill('boss', 1), simulationTick: NaN }])), 'INVALID_ARGUMENT');
  assert.equal((await h.view()).wallet.gold, 0);
});

test('unknown random reward definition fails the entire boss settlement without consuming or partially rewarding', async () => {
  const h = await setup(); h.rewards.roll = () => ({ gold: -1, drops: [] });
  assert.equal(code(await h.report([h.kill('boss', 1)])), 'CONFIG_NOT_READY');
  const state = await h.view(); assert.equal(state.wallet.gold, 0); assert.equal(state.character.xp, 0);
  assert.equal(state.challenge.result, 'active'); assert.deepEqual(h.store.inspect(key('room', h.challengeId, 0)).kills, {});
});

test('session.open operation ID cannot be reused to silently take over with different launch parameters', async () => {
  const h = system(); const first = data(await h.service.openSession(principal, 'launch-1', 'open-one'));
  assert.equal(code(await h.service.openSession(principal, 'launch-2', 'open-one')), 'OPERATION_MISMATCH');
  assert.equal(h.store.inspect(key('account', first.accountId)).epoch, 1);
});
