import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/adapters/memory-store.ts';
import { createContextIdentityPort } from '../src/identity/identity-v2.ts';
import { LoginService } from '../src/identity/login-service.ts';
import { CharacterService } from '../src/character/character-service.ts';
import { TownService } from '../src/town/town-service.ts';
import { DEFAULT_TOWN_MAP } from '../src/town/town-model.ts';

const setupTownEnvironment = () => {
  const store = new MemoryStore();
  let now = 1000;
  const identity = createContextIdentityPort(
    { appId: 'app', environment: 'test', sources: ['minigame'] },
    () => ({ APPID: 'app', ENV: 'test', SOURCE: 'minigame', OPENID: 'town-player' })
  );
  const loginService = new LoginService({
    store,
    identity,
    clock: { now: () => now },
    ticketTtlMs: 60000,
    initialUnlocks: {},
    holdingsDomainRef: 'test-collection-domain-v1',
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
    manifest: DEFAULT_TOWN_MAP,
  });

  return { store, loginService, characterService, townService, setNow: n => { now = n; }, getNow: () => now };
};

async function loginAndCreateCharacter(env, name = '征战者') {
  const { loginService, characterService } = env;
  const prep = await loginService.execute({
    protocolVersion: 2,
    command: 'session.prepare',
    payload: { launchId: 'l1', prepareOperationId: 'p-town-1' },
  });
  const commit = await loginService.execute({
    protocolVersion: 2,
    command: 'session.commit',
    payload: { launchId: 'l1', ticketId: prep.outcome.data.ticketId, openOperationId: 'o-town-1' },
  });
  const session = commit.outcome.data;

  const create = await characterService.execute({
    protocolVersion: 2,
    command: 'character.create',
    operationId: 'op-town-c1',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { classId: 'warrior', characterName: name },
  });
  const characterId = create.outcome.data.characterId;

  // Select character
  await characterService.execute({
    protocolVersion: 2,
    command: 'character.select',
    operationId: 'op-town-sel1',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { characterId },
  });

  return { session, characterId };
}

// ==========================================
// Ticket 02: 城镇位置与移动权威状态
// ==========================================

test('scene.exitInn transitions character from inn to town anchor and initializes townState', async () => {
  const env = setupTownEnvironment();
  const { session, characterId } = await loginAndCreateCharacter(env);

  // Character starts in inn
  const charBefore = env.store.inspect(characterId);
  assert.equal(charBefore.location.kind, 'inn');
  assert.equal(charBefore.townState, undefined);

  // 1. Invalid exit anchor rejected
  const badAnchor = await env.townService.exitInn({
    protocolVersion: 2,
    command: 'scene.exitInn',
    operationId: 'op-exit-bad',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { characterId, exitAnchorId: 'wrong-door' },
  });
  assert.equal(badAnchor.outcome.status, 'rejected');
  assert.equal(badAnchor.outcome.code, 'INVALID_ARGUMENT');

  // 2. Valid exit to inn-door
  const exitRes = await env.townService.exitInn({
    protocolVersion: 2,
    command: 'scene.exitInn',
    operationId: 'op-exit-good',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { characterId, exitAnchorId: 'inn-door' },
  });
  assert.equal(exitRes.outcome.status, 'committed');
  assert.equal(exitRes.outcome.data.characterId, characterId);
  assert.equal(exitRes.outcome.data.anchorId, 'inn-door');
  assert.equal(exitRes.outcome.data.locationRevision, 1);

  // Store inspection
  const charAfter = env.store.inspect(characterId);
  assert.equal(charAfter.location.kind, 'town');
  assert.equal(charAfter.location.anchorId, 'inn-door');
  assert.ok(charAfter.townState);
  assert.deepEqual(charAfter.townState.position, { x: 100, y: 100 });
  assert.equal(charAfter.townState.acceptedSeq, 0);
  assert.equal(charAfter.townState.locationRevision, 1);

  // 3. Repeating exit when already in town is rejected
  const repeatExit = await env.townService.exitInn({
    protocolVersion: 2,
    command: 'scene.exitInn',
    operationId: 'op-exit-repeat',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { characterId, exitAnchorId: 'inn-door' },
  });
  assert.equal(repeatExit.outcome.status, 'rejected');
  assert.equal(repeatExit.outcome.code, 'LOCATION_NOT_ALLOWED');
});

test('town.move verifies ordered sequential steps, bounds and speed limits', async () => {
  const env = setupTownEnvironment();
  const { session, characterId } = await loginAndCreateCharacter(env);
  await env.townService.exitInn({
    protocolVersion: 2,
    command: 'scene.exitInn',
    operationId: 'op-exit-1',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { characterId, exitAnchorId: 'inn-door' },
  });

  // 1. Valid move sequence of 3 steps within speed limit (160 px/s)
  // Step 1: dx=10, dy=0 in 100ms (speed = 100 px/s <= 160)
  // Step 2: dx=10, dy=5 in 100ms (hypot = 11.18 <= 16)
  // Step 3: dx=5, dy=5 in 100ms
  const move1 = await env.townService.move({
    protocolVersion: 2,
    command: 'town.move',
    operationId: 'op-move-1',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    payload: {
      characterId,
      steps: [
        { seq: 1, dx: 10, dy: 0, dtMs: 100 },
        { seq: 2, dx: 10, dy: 5, dtMs: 100 },
        { seq: 3, dx: 5, dy: 5, dtMs: 100 },
      ],
    },
  });

  assert.equal(move1.outcome.status, 'committed');
  assert.deepEqual(move1.outcome.data.position, { x: 125, y: 110 });
  assert.equal(move1.outcome.data.acceptedSeq, 3);
  assert.equal(move1.outcome.data.locationRevision, 2);

  // 2. Reject non-consecutive seq (jumping from 3 to 5)
  const orderViolation = await env.townService.move({
    protocolVersion: 2,
    command: 'town.move',
    operationId: 'op-move-jump',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    payload: {
      characterId,
      steps: [{ seq: 5, dx: 5, dy: 0, dtMs: 100 }],
    },
  });
  assert.equal(orderViolation.outcome.status, 'rejected');
  assert.equal(orderViolation.outcome.code, 'ORDER_VIOLATION');

  // 3. Reject speed limit exceeded (speed = 100px in 100ms = 1000 px/s > 160)
  const speedExceeded = await env.townService.move({
    protocolVersion: 2,
    command: 'town.move',
    operationId: 'op-move-speed',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    payload: {
      characterId,
      steps: [{ seq: 4, dx: 100, dy: 0, dtMs: 100 }],
    },
  });
  assert.equal(speedExceeded.outcome.status, 'rejected');
  assert.equal(speedExceeded.outcome.code, 'SPEED_LIMIT_EXCEEDED');

  // 4. Reject out of bounds (bounds are 0-1000, current x is 125, dx=-150 is valid speed in 1000ms but results in x=-25 < 0)
  const outOfBounds = await env.townService.move({
    protocolVersion: 2,
    command: 'town.move',
    operationId: 'op-move-oob',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    payload: {
      characterId,
      steps: [{ seq: 4, dx: -150, dy: 0, dtMs: 1000 }],
    },
  });
  assert.equal(outOfBounds.outcome.status, 'rejected');
  assert.equal(outOfBounds.outcome.code, 'OUT_OF_BOUNDS');
});

// ==========================================
// Ticket 03: 服务地点授权与 ServiceContext 机制
// ==========================================

test('service.open checks 24px radius, issues context, and service.close terminates it', async () => {
  const env = setupTownEnvironment();
  const { session, characterId } = await loginAndCreateCharacter(env);
  await env.townService.exitInn({
    protocolVersion: 2,
    command: 'scene.exitInn',
    operationId: 'op-exit-1',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { characterId, exitAnchorId: 'inn-door' },
  });

  // Current position is { x: 100, y: 100 }
  // Bank anchor is { x: 110, y: 100 }, dist = 10px <= 24px -> ALLOWED
  const openBank = await env.townService.openService({
    protocolVersion: 2,
    command: 'service.open',
    operationId: 'op-open-bank',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { characterId, serviceKind: 'bank', anchorId: 'bank' },
  });
  assert.equal(openBank.outcome.status, 'committed');
  assert.equal(openBank.outcome.data.serviceKind, 'bank');
  const bankContextId = openBank.outcome.data.contextId;
  assert.ok(bankContextId);

  // Blacksmith anchor is { x: 300, y: 300 }, dist = 282px > 24px -> LOCATION_NOT_ALLOWED
  const openBlacksmith = await env.townService.openService({
    protocolVersion: 2,
    command: 'service.open',
    operationId: 'op-open-smith',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { characterId, serviceKind: 'repair', anchorId: 'blacksmith' },
  });
  assert.equal(openBlacksmith.outcome.status, 'rejected');
  assert.equal(openBlacksmith.outcome.code, 'LOCATION_NOT_ALLOWED');

  // Check service context query
  const getContext = await env.townService.getService({
    protocolVersion: 2,
    query: 'service.get',
    requestId: 'req-get-ctx',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    payload: { characterId, serviceContextId: bankContextId },
  });
  assert.equal(getContext.data.contextId, bankContextId);
  assert.equal(getContext.data.state, 'open');

  // Close service context
  const closeRes = await env.townService.closeService({
    protocolVersion: 2,
    command: 'service.close',
    operationId: 'op-close-bank',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { characterId, contextId: bankContextId },
  });
  assert.equal(closeRes.outcome.status, 'committed');
  assert.equal(closeRes.outcome.data.closed, true);

  // Now querying context shows closed
  const getContextAfter = await env.townService.getService({
    protocolVersion: 2,
    query: 'service.get',
    requestId: 'req-get-ctx-2',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    payload: { characterId, serviceContextId: bankContextId },
  });
  assert.equal(getContextAfter.data.state, 'closed');
});

// ==========================================
// Ticket 04: 私有读模型与字段裁剪
// ==========================================

test('private read models enforce context authorization and HUD summary does not leak bodies', async () => {
  const env = setupTownEnvironment();
  const { session, characterId } = await loginAndCreateCharacter(env);
  await env.townService.exitInn({
    protocolVersion: 2,
    command: 'scene.exitInn',
    operationId: 'op-exit-1',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { characterId, exitAnchorId: 'inn-door' },
  });

  // 1. Backpack query is allowed without service context
  const backpackQuery = await env.townService.getInventory({
    protocolVersion: 2,
    query: 'inventory.get',
    requestId: 'req-bag',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    payload: { characterId, containerKind: 'backpack' },
  });
  assert.ok(backpackQuery.data);
  assert.equal(backpackQuery.data.kind, 'backpack');
  assert.equal(backpackQuery.data.capacity, 20);

  // 2. Personal vault query WITHOUT context is rejected
  const vaultNoContext = await env.townService.getInventory({
    protocolVersion: 2,
    query: 'inventory.get',
    requestId: 'req-vault-no-ctx',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    payload: { characterId, containerKind: 'personalVault' },
  });
  assert.ok(vaultNoContext.error);
  assert.equal(vaultNoContext.error.code, 'CONTEXT_INVALID');

  // 3. Open bank context and query personal vault -> SUCCESS
  const openBank = await env.townService.openService({
    protocolVersion: 2,
    command: 'service.open',
    operationId: 'op-open-b2',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { characterId, serviceKind: 'bank', anchorId: 'bank' },
  });
  const bankContextId = openBank.outcome.data.contextId;

  const vaultWithContext = await env.townService.getInventory({
    protocolVersion: 2,
    query: 'inventory.get',
    requestId: 'req-vault-with-ctx',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    payload: { characterId, containerKind: 'personalVault', contextId: bankContextId },
  });
  assert.ok(vaultWithContext.data);
  assert.equal(vaultWithContext.data.kind, 'personalVault');
  assert.equal(vaultWithContext.data.capacity, 20);

  // 4. Mail list requires mailbox context; using bank context is rejected
  const mailBadContext = await env.townService.getMailList({
    protocolVersion: 2,
    query: 'mail.list',
    requestId: 'req-mail-bad-ctx',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    payload: { characterId, contextId: bankContextId, cursor: null, pageRequest: 20 },
  });
  assert.ok(mailBadContext.error);
  assert.equal(mailBadContext.error.code, 'CONTEXT_INVALID');

  // Open mailbox context
  const openMail = await env.townService.openService({
    protocolVersion: 2,
    command: 'service.open',
    operationId: 'op-open-m1',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { characterId, serviceKind: 'mailbox', anchorId: 'mailbox' },
  });
  const mailContextId = openMail.outcome.data.contextId;

  const mailGoodContext = await env.townService.getMailList({
    protocolVersion: 2,
    query: 'mail.list',
    requestId: 'req-mail-good-ctx',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    payload: { characterId, contextId: mailContextId, cursor: null, pageRequest: 20 },
  });
  assert.ok(mailGoodContext.data);
  assert.equal(Array.isArray(mailGoodContext.data.entries), true);

  // 5. HUD delivery summary returns count without requiring service context
  const hudSummary = await env.townService.getDeliverySummary({
    protocolVersion: 2,
    query: 'delivery.summary',
    requestId: 'req-hud',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    payload: { characterId },
  });
  assert.ok(hudSummary.data);
  assert.equal(hudSummary.data.unreadMailCount, 1);
  assert.equal(hudSummary.data.pendingCount, 0);

  // 6. Player moves away from bank (>24px) -> bank context is invalidated for personal vault
  await env.townService.move({
    protocolVersion: 2,
    command: 'town.move',
    operationId: 'op-move-away',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    payload: {
      characterId,
      steps: [{ seq: 1, dx: 50, dy: 50, dtMs: 500 }], // moves from (100,100) to (150,150), dist to bank(110,100) = sqrt(1600+2500) = 64px > 24px
    },
  });

  const vaultAfterMove = await env.townService.getInventory({
    protocolVersion: 2,
    query: 'inventory.get',
    requestId: 'req-vault-after-move',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    payload: { characterId, containerKind: 'personalVault', contextId: bankContextId },
  });
  assert.ok(vaultAfterMove.error);
  assert.equal(vaultAfterMove.error.code, 'CONTEXT_INVALID');
});
