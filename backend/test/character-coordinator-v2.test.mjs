import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterCoordinator } from '../../client/assets/scripts/net/CharacterCoordinator.ts';
import { CharacterService } from '../src/character/character-service.ts';
import { LoginService } from '../src/identity/login-service.ts';
import { createContextIdentityPort } from '../src/identity/identity-v2.ts';
import { MemoryStore } from '../src/adapters/memory-store.ts';

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

function setup(wrap = send => send) {
  const store = new MemoryStore();
  const identity = createContextIdentityPort(
    { appId: 'app', environment: 'test', sources: ['minigame'] },
    () => ({ APPID: 'app', ENV: 'test', SOURCE: 'minigame', OPENID: 'player' })
  );
  const loginService = new LoginService({
    store,
    identity,
    clock: { now: () => 1000 },
    ticketTtlMs: 60000,
    initialUnlocks: {},
    holdingsDomainRef: 'test-domain',
  });
  const characterService = new CharacterService({
    store,
    clock: { now: () => 1000 },
    initialProgressionRef: { id: 'progression-warrior-v1', version: 1 },
    initialWeaponTemplateRef: { id: 'equipment:warrior-sword-white-v1', version: 1 },
  });

  const sent = [];
  const send = wrap(async text => {
    sent.push(JSON.parse(text));
    return JSON.stringify(await characterService.execute(JSON.parse(text)));
  });

  return { store, loginService, characterService, sent, coordinator: new CharacterCoordinator({ send }) };
}

async function getSession(loginService) {
  const prep = await loginService.execute({
    protocolVersion: 2,
    command: 'session.prepare',
    payload: { launchId: 'l1', prepareOperationId: 'p1' },
  });
  const commit = await loginService.execute({
    protocolVersion: 2,
    command: 'session.commit',
    payload: { launchId: 'l1', ticketId: prep.outcome.data.ticketId, openOperationId: 'o1' },
  });
  return commit.outcome.data;
}

test('character coordinator successfully creates warrior and exposes created state', async () => {
  const { coordinator, loginService, sent } = setup();
  const session = await getSession(loginService);

  assert.equal(coordinator.state.status, 'idle');
  await coordinator.start({
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    operationId: 'op-coord-create',
    classId: 'warrior',
    characterName: '破阵子',
  });

  assert.equal(coordinator.state.status, 'created');
  assert.equal(coordinator.state.characterName, '破阵子');
  assert.equal(coordinator.state.classId, 'warrior');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].command, 'character.create');
});

test('character coordinator validates invalid name locally and immediately rejects', async () => {
  const { coordinator, loginService, sent } = setup();
  const session = await getSession(loginService);

  await coordinator.start({
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    operationId: 'op-invalid-name',
    classId: 'warrior',
    characterName: '战Warrior', // Mixed script
  });

  assert.equal(coordinator.state.status, 'rejected');
  assert.equal(coordinator.state.code, 'INVALID_ARGUMENT');
  assert.equal(sent.length, 0); // No network request sent
});

test('character coordinator handles transport loss as unknown and retry uses original intent', async () => {
  let shouldFail = true;
  const sentAttempts = [];
  const { coordinator, loginService } = setup(send => async text => {
    sentAttempts.push(JSON.parse(text));
    if (shouldFail) {
      shouldFail = false;
      throw new Error('network timeout');
    }
    return send(text);
  });
  const session = await getSession(loginService);

  await coordinator.start({
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    operationId: 'op-coord-timeout',
    classId: 'warrior',
    characterName: '无畏',
  });

  assert.equal(coordinator.state.status, 'unknown');
  assert.equal(coordinator.state.code, 'RESULT_UNKNOWN');

  // Starting new intent is blocked when previous intent is unknown
  await assert.rejects(
    coordinator.start({
      sessionId: session.sessionId,
      sessionEpoch: session.sessionEpoch,
      operationId: 'op-replacement',
      classId: 'warrior',
      characterName: '无双',
    }),
    /UNRESOLVED_CHARACTER_INTENT/
  );

  // Retry uses original request with exact same operationId
  await coordinator.retry();
  assert.equal(coordinator.state.status, 'created');
  assert.equal(sentAttempts.length, 2);
  assert.deepEqual(sentAttempts[0], sentAttempts[1]);
  assert.equal(sentAttempts[1].operationId, 'op-coord-timeout');
});

test('late response from reset coordinator is ignored and does not overwrite idle state', async () => {
  const gate = deferred(), entered = deferred();
  const { coordinator, loginService } = setup(send => async text => {
    entered.resolve();
    await gate.promise;
    return send(text);
  });
  const session = await getSession(loginService);

  const pending = coordinator.start({
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    operationId: 'op-late',
    classId: 'warrior',
    characterName: '惊鸿',
  });

  await entered.promise;
  coordinator.reset();
  assert.equal(coordinator.state.status, 'idle');

  gate.resolve();
  await pending;

  // Stale callback did not overwrite idle state
  assert.equal(coordinator.state.status, 'idle');
});

test('character coordinator handles CLASS_EXISTS rejection correctly', async () => {
  const { coordinator, loginService } = setup();
  const session = await getSession(loginService);

  // First create succeeds
  await coordinator.start({
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    operationId: 'op-c1',
    classId: 'warrior',
    characterName: '苍狼',
  });
  assert.equal(coordinator.state.status, 'created');

  // Second create warrior on same account
  coordinator.reset();
  await coordinator.start({
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    operationId: 'op-c2',
    classId: 'warrior',
    characterName: '白鹿',
  });
  assert.equal(coordinator.state.status, 'rejected');
  assert.equal(coordinator.state.code, 'CLASS_EXISTS');
});
