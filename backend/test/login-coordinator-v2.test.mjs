import test from 'node:test';
import assert from 'node:assert/strict';
import { LoginCoordinator } from '../../client/assets/scripts/net/LoginCoordinator.ts';
import { LoginService } from '../src/identity/login-service.ts';
import { createContextIdentityPort } from '../src/identity/identity-v2.ts';
import { MemoryStore } from '../src/adapters/memory-store.ts';

const ids = suffix => ({ launchId: `launch-${suffix}`, prepareOperationId: `prepare-${suffix}`, openOperationId: `open-${suffix}` });
function setup(wrap = send => send) {
  const store = new MemoryStore();
  const identity = createContextIdentityPort({ appId: 'app', environment: 'test', sources: ['minigame'] }, () => ({ APPID: 'app', ENV: 'test', SOURCE: 'minigame', OPENID: 'player' }));
  const service = new LoginService({ store, identity, clock: { now: () => 1000 }, ticketTtlMs: 60000, initialUnlocks: {}, holdingsDomainRef: 'test-collection-domain-v1' });
  const sent = [];
  const send = wrap(async text => { sent.push(JSON.parse(text)); return JSON.stringify(await service.execute(JSON.parse(text))); });
  return { store, service, sent, coordinator: new LoginCoordinator({ send }) };
}

test('coordinator consumes real local prepare/commit responses and exposes an isolated current session', async () => {
  const { coordinator, sent } = setup();
  assert.equal(coordinator.state.status, 'idle');
  await coordinator.start(ids('a'));
  assert.equal(coordinator.state.status, 'authenticated');
  assert.equal(coordinator.state.session.sessionEpoch, 1);
  assert.deepEqual(sent.map(r => r.command), ['session.prepare', 'session.commit']);
  assert.equal(sent[1].payload.openOperationId, 'open-a');
  const snapshot = coordinator.state;
  snapshot.session.sessionEpoch = 999;
  assert.equal(coordinator.state.session.sessionEpoch, 1);
});

test('unknown commit retries the same original key and blocks starting a replacement intent', async () => {
  let loseCommit = true;
  const { coordinator, sent, store } = setup(send => async text => {
    const request = JSON.parse(text), response = await send(text);
    if (request.command === 'session.commit' && loseCommit) { loseCommit = false; throw new Error('response lost after actual commit'); }
    return response;
  });
  await coordinator.start(ids('a'));
  assert.deepEqual(coordinator.state, { status: 'unknown', phase: 'commit', code: 'RESULT_UNKNOWN' });
  await assert.rejects(coordinator.start(ids('b')), /UNRESOLVED_LOGIN_INTENT/);
  await coordinator.retry();
  assert.equal(coordinator.state.status, 'authenticated');
  assert.deepEqual(sent.map(r => r.command), ['session.prepare', 'session.commit', 'session.commit']);
  assert.deepEqual(sent[2], sent[1]);
  assert.equal(coordinator.state.session.sessionEpoch, 1);
  assert.equal([...store.snapshot().keys()].filter(k => k.startsWith('v2:account:')).length, 1);
});

function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
test('cancelled late prepare never sends commit or overwrites idle state', async () => {
  const gate = deferred(), entered = deferred();
  const { coordinator, sent, store } = setup(send => async text => {
    const response = await send(text); entered.resolve(); await gate.promise; return response;
  });
  const running = coordinator.start(ids('a'));
  await entered.promise;
  coordinator.cancel();
  gate.resolve(); await running;
  assert.equal(coordinator.state.status, 'idle');
  assert.deepEqual(sent.map(r => r.command), ['session.prepare']);
  assert.equal([...store.snapshot().keys()].filter(k => k.startsWith('v2:account:')).length, 0);
});

test('replacing a still-preparing flow ignores its late ticket while the new flow logs in', async () => {
  const gate = deferred(), entered = deferred();
  const { coordinator, sent } = setup(send => async text => {
    const request = JSON.parse(text), response = await send(text);
    if (request.command === 'session.prepare' && request.payload.launchId === 'launch-a') { entered.resolve(); await gate.promise; }
    return response;
  });
  const first = coordinator.start(ids('a')); await entered.promise;
  await coordinator.start(ids('b'));
  gate.resolve(); await first;
  assert.equal(coordinator.state.status, 'authenticated');
  assert.deepEqual(sent.filter(r => r.command === 'session.commit').map(r => r.payload.launchId), ['launch-b']);
});

test('cancel during a committed in-flight response preserves its unknown intent until explicit retry', async () => {
  const gate = deferred(), entered = deferred(); let once = true;
  const { coordinator, sent } = setup(send => async text => {
    const request = JSON.parse(text), response = await send(text);
    if (request.command === 'session.commit' && once) { once = false; entered.resolve(); await gate.promise; }
    return response;
  });
  const running = coordinator.start(ids('a')); await entered.promise;
  coordinator.cancel();
  assert.equal(coordinator.state.status, 'unknown');
  await assert.rejects(coordinator.start(ids('b')), /UNRESOLVED_LOGIN_INTENT/);
  gate.resolve(); await running;
  assert.equal(coordinator.state.status, 'unknown');
  await coordinator.retry();
  assert.equal(coordinator.state.status, 'authenticated');
  assert.deepEqual(sent[2], sent[1]);
});

test('a superseded original commit is never exposed as an authenticated session', async () => {
  let once = true;
  const { coordinator, service } = setup(send => async text => {
    const request = JSON.parse(text), response = await send(text);
    if (request.command === 'session.commit' && once) { once = false; throw new Error('lost response'); }
    return response;
  });
  await coordinator.start(ids('a'));
  const other = await service.execute({ protocolVersion: 2, command: 'session.prepare', payload: { launchId: 'other-launch', prepareOperationId: 'other-prepare' } });
  await service.execute({ protocolVersion: 2, command: 'session.commit', payload: { launchId: 'other-launch', ticketId: other.outcome.data.ticketId, openOperationId: 'other-open' } });
  await coordinator.retry();
  assert.deepEqual(coordinator.state, { status: 'superseded', code: 'SESSION_REVOKED' });
});

test('unknown prepare retries its exact original intent without creating another ticket', async () => {
  let once = true;
  const { coordinator, sent } = setup(send => async text => {
    const response = await send(text);
    if (once) { once = false; throw new Error('lost prepare response'); }
    return response;
  });
  await coordinator.start(ids('a'));
  assert.deepEqual(coordinator.state, { status: 'unknown', phase: 'prepare', code: 'RESULT_UNKNOWN' });
  await coordinator.retry();
  assert.equal(coordinator.state.status, 'authenticated');
  assert.deepEqual(sent[1], sent[0]);
  assert.equal(sent.length, 3);
});

test('invalid open intent is rejected before any prepare is sent', async () => {
  const { coordinator, sent } = setup();
  await assert.rejects(coordinator.start({ ...ids('a'), openOperationId: 'x'.repeat(65) }));
  assert.deepEqual(sent, []);
  assert.equal(coordinator.state.status, 'idle');
});

test('pending states are explicit and a trusted-adapter rejection is a terminal public error', async () => {
  const prepareGate = deferred(), commitGate = deferred(), preparing = deferred(), committing = deferred();
  const { coordinator } = setup(send => async text => {
    const request = JSON.parse(text);
    if (request.command === 'session.prepare') { preparing.resolve(); await prepareGate.promise; }
    else { committing.resolve(); await commitGate.promise; }
    return send(text);
  });
  const running = coordinator.start(ids('a'));
  await preparing.promise; assert.equal(coordinator.state.status, 'preparing');
  prepareGate.resolve(); await committing.promise; assert.equal(coordinator.state.status, 'committing');
  commitGate.resolve(); await running; assert.equal(coordinator.state.status, 'authenticated');
  const store = new MemoryStore();
  const rejected = new LoginService({ store, identity: createContextIdentityPort({ appId: 'app', environment: 'test', sources: ['minigame'] }, () => ({})), clock: { now: () => 1000 }, ticketTtlMs: 60000, initialUnlocks: {}, holdingsDomainRef: 'test-collection-domain-v1' });
  const refused = new LoginCoordinator({ send: async text => JSON.stringify(await rejected.execute(JSON.parse(text))) });
  await refused.start(ids('bad'));
  assert.deepEqual(refused.state, { status: 'error', code: 'AUTH_REQUIRED' });
  await assert.rejects(refused.retry(), /NO_PENDING_LOGIN_INTENT/);
  assert.equal(store.snapshot().size, 0);
});

test('malformed committed response is unknown and explicit retry restores the real original result', async () => {
  let once = true;
  const { coordinator, sent } = setup(send => async text => {
    const request = JSON.parse(text), response = await send(text);
    if (request.command === 'session.commit' && once) { once = false; return JSON.stringify({ ...JSON.parse(response), operationId: 'wrong' }); }
    return response;
  });
  await coordinator.start(ids('a'));
  assert.equal(coordinator.state.status, 'unknown');
  assert.equal(sent.length, 2);
  await coordinator.retry();
  assert.equal(coordinator.state.status, 'authenticated');
  assert.deepEqual(sent[2], sent[1]);
});
