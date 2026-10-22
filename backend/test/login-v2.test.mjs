import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/adapters/memory-store.ts';
import { createContextIdentityPort } from '../src/identity/identity-v2.ts';
import { LoginService } from '../src/identity/login-service.ts';
import { loginKey } from '../src/identity/identity-v2.ts';
import { createHash } from 'node:crypto';

const setup = (wrap = s => s) => {
  const store = new MemoryStore(); let now = 1000;
  const identity = createContextIdentityPort({ appId: 'app', environment: 'test', sources: ['minigame'] }, () => ({ APPID: 'app', ENV: 'test', SOURCE: 'minigame', OPENID: 'player' }));
  return { store, service: new LoginService({ store: wrap(store, n => { now = n; }), identity, clock: { now: () => now }, ticketTtlMs: 60000, initialUnlocks: { first: ['normal'] }, holdingsDomainRef: 'test-collection-domain-v1' }), setNow: n => { now = n; } };
};
const prepare = (launch = 'l', operation = 'p') => ({ protocolVersion: 2, command: 'session.prepare', payload: { launchId: launch, prepareOperationId: operation } });
const commit = (ticket, launch = 'l', operation = 'o') => ({ protocolVersion: 2, command: 'session.commit', payload: { ticketId: ticket, launchId: launch, openOperationId: operation } });

test('prepare creates only one stable ticket and never initializes assets or extends its deadline', async () => {
  const { service, store, setNow } = setup();
  const first = await service.execute(prepare());
  assert.equal(first.outcome.status, 'committed');
  assert.equal(first.outcome.data.expiresAt, 61000);
  assert.equal(store.snapshot().size, 1);
  setNow(2000);
  const replay = await service.execute(prepare());
  assert.equal(replay.outcome.data.ticketId, first.outcome.data.ticketId);
  assert.equal(replay.outcome.data.expiresAt, 61000);
  assert.equal(replay.replayed, true);
  assert.equal(store.snapshot().size, 1);
});

test('first commit atomically initializes one account and replays its original result', async () => {
  const { service, store } = setup();
  const ticket = (await service.execute(prepare())).outcome.data.ticketId;
  const request = commit(ticket);
  const first = await service.execute(request);
  assert.equal(first.outcome.status, 'committed');
  assert.equal(first.outcome.data.sessionEpoch, 1);
  assert.equal(first.outcome.data.sessionState, 'current');
  assert.deepEqual(first.outcome.data.characters, []);
  assert.equal(first.outcome.data.selectedCharacter, null);
  assert.equal(store.snapshot().size, 9);
  const replay = await service.execute(request);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.outcome, first.outcome);
  assert.equal(store.snapshot().size, 9);
  assert.equal((await service.execute({ ...request, payload: { ...request.payload, ticketId: 'different-ticket' } })).outcome.code, 'OPERATION_MISMATCH');
});

for (const [offset, expected] of [[-1, 'committed'], [0, 'rejected'], [1, 'rejected']]) {
  test(`commit ticket deadline boundary ${offset}`, async () => {
    const { service, store, setNow } = setup();
    const t = (await service.execute(prepare())).outcome.data;
    setNow(t.expiresAt + offset);
    const result = await service.execute(commit(t.ticketId));
    assert.equal(result.outcome.status, expected);
    if (expected === 'rejected') {
      assert.equal(result.outcome.code, 'DEADLINE_EXPIRED');
      assert.equal(store.snapshot().size, 2); // Original ticket plus stable rejected open receipt, no account/assets.
      assert.equal([...store.snapshot().keys()].filter(k => k.startsWith('v2:account:')).length, 0);
    }
  });
}
test('two first-login tickets race to one account and cannot automatically steal back the session', async () => {
  const { service, store } = setup();
  const [a, b] = await Promise.all([service.execute(prepare('a', 'pa')), service.execute(prepare('b', 'pb'))]);
  const results = await Promise.all([service.execute(commit(a.outcome.data.ticketId, 'a', 'oa')), service.execute(commit(b.outcome.data.ticketId, 'b', 'ob'))]);
  assert.equal(results.filter(r => r.outcome.status === 'committed').length, 1);
  assert.equal(results.find(r => r.outcome.status === 'rejected').outcome.code, 'VERSION_CONFLICT');
  assert.equal([...store.snapshot().keys()].filter(k => k.startsWith('v2:account:')).length, 1);
});
test('new launch replaces an existing account session while historical receipt cannot reactivate it', async () => {
  const { service, store } = setup();
  const a = (await service.execute(prepare('a', 'pa'))).outcome.data;
  const firstRequest = commit(a.ticketId, 'a', 'oa');
  const first = await service.execute(firstRequest);
  const b = (await service.execute(prepare('b', 'pb'))).outcome.data;
  assert.equal(b.baseSessionEpoch, 1);
  const second = await service.execute(commit(b.ticketId, 'b', 'ob'));
  assert.equal(second.outcome.data.sessionEpoch, 2);
  const replay = await service.execute(firstRequest);
  assert.equal(replay.outcome.data.sessionState, 'superseded');
  assert.equal(replay.outcome.data.sessionEpoch, 1);
  assert.equal((await service.execute(prepare('a', 'new-pa'))).outcome.code, 'SESSION_REVOKED');
  assert.equal([...store.snapshot().values()].find(v => v.schemaVersion === 2 && 'writeRevision' in v).sessionEpoch, 2);
});
for (let write = 1; write <= 9; write++) {
  test(`initialization write ${write} failure leaves only the original ticket`, async () => {
    const { service, store } = setup();
    const t = (await service.execute(prepare())).outcome.data;
    store.injectWriteFailure(write);
    assert.equal((await service.execute(commit(t.ticketId))).outcome.code, 'SERVICE_UNAVAILABLE');
    assert.equal(store.snapshot().size, 1);
    assert.equal((await service.execute(commit(t.ticketId))).outcome.status, 'committed');
  });
}
test('commit response loss returns unknown and same intent restores the once-committed result', async () => {
  const { service, store } = setup();
  const t = (await service.execute(prepare())).outcome.data;
  store.injectResponseLoss();
  assert.equal((await service.execute(commit(t.ticketId))).outcome.status, 'unknown');
  const retry = await service.execute(commit(t.ticketId));
  assert.equal(retry.outcome.status, 'committed'); assert.equal(retry.replayed, true);
  assert.equal(retry.outcome.data.sessionEpoch, 1); assert.equal(store.snapshot().size, 9);
});

test('body identity cannot reach the identity port or store, and fabricated port identities are rejected', async () => {
  const store = new MemoryStore(); let calls = 0;
  const service = new LoginService({ store, clock: { now: () => 1000 }, identity: { verify: async () => { calls++; return { provider: 'wechat', appId: 'app', subject: 'fake', environment: 'test' }; } }, ticketTtlMs: 60000, initialUnlocks: {}, holdingsDomainRef: 'test-collection-domain-v1' });
  await assert.rejects(service.execute({ ...prepare(), subject: 'forged' }));
  assert.equal(calls, 0);
  assert.equal((await service.execute(prepare())).outcome.code, 'AUTH_REQUIRED');
  assert.equal(store.snapshot().size, 0);
});

test('ticket cannot cross identities or launches, and double commit of one ticket cannot initialize twice', async () => {
  const { service, store } = setup();
  const ticket = (await service.execute(prepare('a', 'pa'))).outcome.data.ticketId;
  assert.equal((await service.execute(commit(ticket, 'b', 'ob'))).outcome.code, 'NOT_FOUND_OR_FORBIDDEN');
  const otherIdentity = createContextIdentityPort({ appId: 'app', environment: 'test', sources: ['minigame'] }, () => ({ APPID: 'app', ENV: 'test', SOURCE: 'minigame', OPENID: 'other' }));
  const other = new LoginService({ store, identity: otherIdentity, clock: { now: () => 1000 }, ticketTtlMs: 60000, initialUnlocks: {}, holdingsDomainRef: 'test-collection-domain-v1' });
  assert.equal((await other.execute(commit(ticket, 'a', 'ob'))).outcome.code, 'NOT_FOUND_OR_FORBIDDEN');
  const results = await Promise.all([service.execute(commit(ticket, 'a', 'oa')), service.execute(commit(ticket, 'a', 'different-oa'))]);
  assert.equal(results.filter(r => r.outcome.status === 'committed').length, 1);
  assert.equal(results.find(r => r.outcome.status === 'rejected').outcome.code, 'OPERATION_MISMATCH');
});

test('prepare response loss restores the same ticket, and a retry crossing deadline cannot commit', async () => {
  const { service, store, setNow } = setup();
  store.injectResponseLoss();
  assert.equal((await service.execute(prepare())).outcome.status, 'unknown');
  const t = (await service.execute(prepare())).outcome.data;
  setNow(t.expiresAt - 1);
  let triggered = false;
  store.beforeCommit = async () => {
    if (!triggered) {
      triggered = true; store.beforeCommit = undefined;
      await store.run(async tx => { const saved = await tx.get(t.ticketId); tx.set(t.ticketId, { ...saved }); });
      setNow(t.expiresAt);
    }
  };
  assert.equal((await service.execute(commit(t.ticketId))).outcome.code, 'DEADLINE_EXPIRED');
  assert.equal(store.snapshot().size, 2);
  assert.equal([...store.snapshot().keys()].filter(k => k.startsWith('v2:account:')).length, 0);
});

test('account fence overflow fails closed rather than persisting an unsafe integer', async () => {
  const { service, store } = setup();
  const t = (await service.execute(prepare('a', 'pa'))).outcome.data;
  await service.execute(commit(t.ticketId, 'a', 'oa'));
  const accountEntry = [...store.snapshot()].find(([k]) => k.startsWith('v2:account:'));
  await store.run(tx => tx.set(accountEntry[0], { ...accountEntry[1], writeRevision: Number.MAX_SAFE_INTEGER }));
  const nextTicket = (await service.execute(prepare('b', 'pb'))).outcome.data;
  await assert.rejects(service.execute(commit(nextTicket.ticketId, 'b', 'ob')), /SESSION_EPOCH_OVERFLOW/);
  assert.equal(store.inspect(accountEntry[0]).writeRevision, Number.MAX_SAFE_INTEGER);
});

test('login commit uses real character handoff in the same transaction and returns its new role epoch', async () => {
  const { service, store } = setup();
  const a = (await service.execute(prepare('a', 'pa'))).outcome.data;
  await service.execute(commit(a.ticketId, 'a', 'oa'));
  const [accountId, account] = [...store.snapshot()].find(([key]) => key.startsWith('v2:account:'));
  await store.run(tx => {
    tx.set(accountId, { ...account, characterIdsByClass: { warrior: 'c' }, selectedCharacterId: 'c' });
    tx.set('c', { schemaVersion: 2, accountId, characterId: 'c', classId: 'warrior', characterName: '战士', level: 1, version: 0, rolePlayEpoch: 1, location: { kind: 'town', mapId: 'town', anchorId: 'bank' }, stamina: { value: 100, refillWindow: 2 } });
  });
  const b = (await service.execute(prepare('b', 'pb'))).outcome.data;
  const result = await service.execute(commit(b.ticketId, 'b', 'ob'));
  assert.equal(result.outcome.status, 'committed');
  assert.deepEqual(result.outcome.data.selectedCharacter, { characterId: 'c', rolePlayEpoch: 2 });
  assert.equal(result.outcome.data.characters[0].characterName, '战士');
  assert.deepEqual(store.inspect('c').location, { kind: 'inn', characterId: 'c' });
});

async function seedOpenBattle(context) {
  const { service, store } = context;
  const t = (await service.execute(prepare('a', 'pa'))).outcome.data;
  await service.execute(commit(t.ticketId, 'a', 'oa'));
  const [accountId, account] = [...store.snapshot()].find(([key]) => key.startsWith('v2:account:'));
  const headerId = await loginKey('cpHeader', ['h']), chunkId = await loginKey('cpChunk', ['h', 0]);
  const data = { actors: [], effects: [], schemaVersion: 1 };
  const hash = createHash('sha256').update('{"actors":[],"effects":[],"schemaVersion":1}').digest('hex');
  await store.run(tx => {
    tx.set(accountId, { ...account, selectedCharacterId: 'c', characterIdsByClass: { warrior: 'c' }, activeChallengeId: 'h', openSceneChallengeId: 'h' });
    tx.set('c', { schemaVersion: 2, accountId, characterId: 'c', classId: 'warrior', characterName: '战士', level: 1, version: 0, rolePlayEpoch: 1, location: { kind: 'challenge', challengeId: 'h' }, stamina: { value: 100, refillWindow: 2 }, staminaReservation: 'h' });
    tx.set('h', { schemaVersion: 2, id: 'h', accountId, characterId: 'c', sessionId: account.currentSessionId, version: 0, result: 'active', sceneState: 'combat', sceneEpoch: 1,
      staminaSnapshot: { entryValue: 100, remaining: 97, entryRefillWindow: 2, entryAt: 1000, revision: 1 }, staminaSettlement: { state: 'unsettled' } });
    tx.set(headerId, { schemaVersion: 2, id: headerId, challengeId: 'h', accountId, characterId: 'c', revision: 3, sceneEpoch: 1, acceptingInputs: true, activeChunks: [{ ordinal: 0, chunkRevision: 1, hash, sceneEpoch: 1 }] });
    tx.set(chunkId, { schemaVersion: 2, id: chunkId, challengeId: 'h', accountId, ordinal: 0, chunkRevision: 1, sceneEpoch: 1, hash, data });
  });
  return { accountId, account, headerId, chunkId };
}

test('real login takeover atomically closes active challenge and CP access and settles stamina once', async () => {
  const context = setup(), fixture = await seedOpenBattle(context);
  const t = (await context.service.execute(prepare('b', 'pb'))).outcome.data;
  const result = await context.service.execute(commit(t.ticketId, 'b', 'ob'));
  assert.equal(result.outcome.status, 'committed');
  assert.equal(context.store.inspect('h').result, 'failed');
  assert.equal(context.store.inspect('h').sceneState, 'closed');
  assert.equal(context.store.inspect(fixture.headerId).acceptingInputs, false);
  assert.equal(context.store.inspect('c').stamina.value, 97);
  assert.equal(context.store.inspect('c').roleState.lifeState, 'alive');
  assert.equal(context.store.inspect(fixture.account.currentSessionId).status, 'revoked');
  const closed = context.store.snapshot();
  await context.service.execute(commit(t.ticketId, 'b', 'ob'));
  assert.deepEqual(context.store.snapshot(), closed);
});

test('takeover that observes an already committed completion preserves its reward and completed result', async () => {
  const context = setup(), fixture = await seedOpenBattle(context);
  await context.store.run(async tx => {
    const h = await tx.get('h'), wallet = await tx.get(fixture.account.walletId), account = await tx.get(fixture.accountId);
    tx.set('h', { ...h, result: 'completed', sceneState: 'looting' });
    tx.set(fixture.account.walletId, { ...wallet, gold: '1000' });
    tx.set(fixture.accountId, { ...account, writeRevision: account.writeRevision + 1 });
  });
  const t = (await context.service.execute(prepare('b', 'pb'))).outcome.data;
  assert.equal((await context.service.execute(commit(t.ticketId, 'b', 'ob'))).outcome.status, 'committed');
  assert.equal(context.store.inspect('h').result, 'completed');
  assert.equal(context.store.inspect(fixture.account.walletId).gold, '1000');
});

test('any write failure during integrated takeover preserves the old session, character and challenge', async () => {
  for (let write = 1; write <= 9; write++) {
    const context = setup(), fixture = await seedOpenBattle(context);
    const t = (await context.service.execute(prepare('b', 'pb'))).outcome.data;
    const before = context.store.snapshot();
    context.store.injectWriteFailure(write);
    const result = await context.service.execute(commit(t.ticketId, 'b', 'ob'));
    assert.equal(result.outcome.code, 'SERVICE_UNAVAILABLE', `write ${write}`);
    assert.deepEqual(context.store.snapshot(), before, `write ${write}`);
    assert.equal(context.store.inspect(fixture.account.currentSessionId).status, 'active');
  }
});

test('a rejected open intent retains its original result and cannot be reused with a new ticket', async () => {
  const { service, setNow } = setup();
  const firstTicket = (await service.execute(prepare())).outcome.data;
  setNow(firstTicket.expiresAt);
  const original = await service.execute(commit(firstTicket.ticketId));
  assert.equal(original.outcome.code, 'DEADLINE_EXPIRED');
  const nextTicket = (await service.execute(prepare('l', 'p2'))).outcome.data;
  assert.equal((await service.execute(commit(nextTicket.ticketId))).outcome.code, 'OPERATION_MISMATCH');
  const replay = await service.execute(commit(firstTicket.ticketId));
  assert.equal(replay.replayed, true);
  assert.equal(replay.serverTime, original.serverTime);
});

test('ticket expiry during transaction reads is checked again before publishing any initialization', async () => {
  const actual = new MemoryStore(); let now = 1000, armed = false;
  const store = { run: work => actual.run(tx => work({ get: async key => { const value = await tx.get(key); if (armed && key.startsWith('v2:session:')) { now = 61000; armed = false; } return value; }, set: (key, value) => tx.set(key, value) })) };
  const identity = createContextIdentityPort({ appId: 'app', environment: 'test', sources: ['minigame'] }, () => ({ APPID: 'app', ENV: 'test', SOURCE: 'minigame', OPENID: 'player' }));
  const service = new LoginService({ store, identity, clock: { now: () => now }, ticketTtlMs: 60000, initialUnlocks: {}, holdingsDomainRef: 'test-collection-domain-v1' });
  const t = (await service.execute(prepare())).outcome.data;
  armed = true;
  assert.equal((await service.execute(commit(t.ticketId))).outcome.code, 'DEADLINE_EXPIRED');
  assert.equal([...actual.snapshot().keys()].filter(k => k.startsWith('v2:account:')).length, 0);
});

test('expiry while verifying old CP discards every planned handoff write and preserves the old session', async () => {
  let armed = false;
  const context = setup((actual, setNow) => ({ run: work => actual.run(tx => work({
    get: async key => { const value = await tx.get(key); if (armed && key.startsWith('v2:cpChunk:')) { armed = false; setNow(61000); } return value; },
    set: (key, value) => tx.set(key, value),
  })) }));
  const fixture = await seedOpenBattle(context);
  const t = (await context.service.execute(prepare('b', 'pb'))).outcome.data;
  const before = context.store.snapshot(); armed = true;
  assert.equal((await context.service.execute(commit(t.ticketId, 'b', 'ob'))).outcome.code, 'DEADLINE_EXPIRED');
  for (const [key, value] of before) assert.deepEqual(context.store.inspect(key), value, key);
  assert.equal(context.store.inspect(fixture.account.currentSessionId).status, 'active');
  assert.equal(context.store.inspect('h').sceneState, 'combat');
  assert.equal(context.store.inspect('c').rolePlayEpoch, 1);
});
