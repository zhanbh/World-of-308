import test from 'node:test';
import assert from 'node:assert/strict';
import { TownCoordinator } from '../../client/assets/scripts/net/TownCoordinator.ts';
import { TownService } from '../src/town/town-service.ts';
import { MemoryStore } from '../src/adapters/memory-store.ts';
import { createContextIdentityPort } from '../src/identity/identity-v2.ts';
import { LoginService } from '../src/identity/login-service.ts';
import { CharacterService } from '../src/character/character-service.ts';

function setupEnvironment() {
  const store = new MemoryStore();
  let now = 1000;
  const identity = createContextIdentityPort(
    { appId: 'app', environment: 'test', sources: ['minigame'] },
    () => ({ APPID: 'app', ENV: 'test', SOURCE: 'minigame', OPENID: 'coord-player' })
  );
  const loginService = new LoginService({
    store,
    identity,
    clock: { now: () => now },
    ticketTtlMs: 60000,
    initialUnlocks: {},
    holdingsDomainRef: 'test-domain',
  });
  const characterService = new CharacterService({
    store,
    clock: { now: () => now },
    initialProgressionRef: { id: 'progression-warrior-v1', version: 1 },
    initialWeaponTemplateRef: { id: 'equipment:warrior-sword-white-v1', version: 1 },
  });
  const townService = new TownService({
    store,
    clock: { now: () => now },
  });

  const sent = [];
  const send = async text => {
    const req = JSON.parse(text);
    sent.push(req);
    if (req.command === 'scene.exitInn') {
      const res = await townService.exitInn(req);
      return JSON.stringify(res);
    }
    if (req.command === 'town.move') {
      const res = await townService.move(req);
      return JSON.stringify(res);
    }
    if (req.command === 'service.open') {
      const res = await townService.openService(req);
      return JSON.stringify(res);
    }
    if (req.command === 'service.close') {
      const res = await townService.closeService(req);
      return JSON.stringify(res);
    }
    throw new Error(`Unsupported command: ${req.command}`);
  };

  const coordinator = new TownCoordinator({ send });
  return { store, loginService, characterService, townService, coordinator, sent };
}

async function loginAndInitCoordinator(env) {
  const { loginService, characterService, coordinator } = env;
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
  const session = commit.outcome.data;

  const create = await characterService.execute({
    protocolVersion: 2,
    command: 'character.create',
    operationId: 'op-coord-c1',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { classId: 'warrior', characterName: '天策' },
  });
  const characterId = create.outcome.data.characterId;

  const select = await characterService.execute({
    protocolVersion: 2,
    command: 'character.select',
    operationId: 'op-coord-s1',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { characterId },
  });
  const rolePlayEpoch = select.outcome.data.rolePlayEpoch;

  coordinator.init(characterId, rolePlayEpoch, 'inn');
  return { session, characterId, rolePlayEpoch };
}

test('town coordinator manages inn exit and position synchronization', async () => {
  const env = setupEnvironment();
  const { session, characterId } = await loginAndInitCoordinator(env);

  assert.equal(env.coordinator.state.scene, 'inn');
  assert.equal(env.coordinator.state.characterId, characterId);

  await env.coordinator.exitInn({
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    operationId: 'op-coord-exit',
  });

  assert.equal(env.coordinator.state.scene, 'town');
  assert.deepEqual(env.coordinator.state.position, { x: 100, y: 100 });
  assert.equal(env.coordinator.state.locationRevision, 1);
});

test('town coordinator closes active panel on movement and predicts position', async () => {
  const env = setupEnvironment();
  const { session } = await loginAndInitCoordinator(env);
  await env.coordinator.exitInn({
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    operationId: 'op-coord-exit',
  });

  // 1. Open bank service
  await env.coordinator.openService({
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    operationId: 'op-coord-open-bank',
    serviceKind: 'bank',
    anchorId: 'bank',
  });
  assert.equal(env.coordinator.state.servicePanel.status, 'open');

  // 2. Trigger movement -> panel is immediately closed locally before move request completes
  await env.coordinator.move({
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    operationId: 'op-coord-move-1',
    steps: [{ dx: 5, dy: 5, dtMs: 50 }],
  });

  assert.equal(env.coordinator.state.servicePanel.status, 'closed');
  assert.deepEqual(env.coordinator.state.position, { x: 105, y: 105 });
  assert.equal(env.coordinator.state.acceptedSeq, 1);
  assert.equal(env.coordinator.state.locationRevision, 2);
});

test('town coordinator locally rejects service open when beyond 24px distance', async () => {
  const env = setupEnvironment();
  const { session } = await loginAndInitCoordinator(env);
  await env.coordinator.exitInn({
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    operationId: 'op-coord-exit',
  });

  // Blacksmith is at (300, 300), current position is (100, 100) -> distance > 24px
  const countBefore = env.sent.length;
  await env.coordinator.openService({
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    operationId: 'op-coord-open-far',
    serviceKind: 'repair',
    anchorId: 'blacksmith',
  });

  // Locally rejected without network request
  assert.equal(env.coordinator.state.servicePanel.status, 'rejected');
  assert.equal(env.coordinator.state.servicePanel.code, 'LOCATION_NOT_ALLOWED');
  assert.equal(env.sent.length, countBefore);
});

test('town coordinator generation isolation drops late responses after reset', async () => {
  let finishSend;
  const slowSend = () => new Promise(resolve => { finishSend = resolve; });
  const coordinator = new TownCoordinator({ send: slowSend });
  coordinator.init('char-1', 1, 'inn');

  const pending = coordinator.exitInn({
    sessionId: 's1',
    sessionEpoch: 1,
    operationId: 'op-slow',
  });

  // Reset during in-flight request
  coordinator.reset();
  assert.equal(coordinator.state.characterId, null);

  // Complete delayed response
  finishSend(JSON.stringify({
    outcome: {
      status: 'committed',
      data: { anchorId: 'inn-door', locationRevision: 1 },
    },
  }));
  await pending;

  // Stale callback did not overwrite reset state
  assert.equal(coordinator.state.characterId, null);
  assert.equal(coordinator.state.scene, 'inn');
});
