import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/adapters/memory-store.ts';
import { createContextIdentityPort } from '../src/identity/identity-v2.ts';
import { LoginService } from '../src/identity/login-service.ts';
import { CharacterService, validateCharacterName, characterKey } from '../src/character/character-service.ts';

const setupEnvironment = () => {
  const store = new MemoryStore();
  let now = 1000;
  const identity = createContextIdentityPort(
    { appId: 'app', environment: 'test', sources: ['minigame'] },
    () => ({ APPID: 'app', ENV: 'test', SOURCE: 'minigame', OPENID: 'player' })
  );
  const loginService = new LoginService({
    store,
    identity,
    clock: { now: () => now },
    ticketTtlMs: 60000,
    initialUnlocks: { first: ['normal'] },
    holdingsDomainRef: 'test-collection-domain-v1',
  });
  const characterService = new CharacterService({
    store,
    clock: { now: () => now },
    initialProgressionRef: { id: 'progression-warrior-v1', version: 1 },
    initialWeaponTemplateRef: { id: 'equipment:warrior-sword-white-v1', version: 1 },
  });
  return { store, loginService, characterService, setNow: n => { now = n; }, getNow: () => now };
};

async function loginUser(loginService, launchId = 'launch-1', operation = 'op-1') {
  const prep = await loginService.execute({
    protocolVersion: 2,
    command: 'session.prepare',
    payload: { launchId, prepareOperationId: `prep-${operation}` },
  });
  const commit = await loginService.execute({
    protocolVersion: 2,
    command: 'session.commit',
    payload: { launchId, ticketId: prep.outcome.data.ticketId, openOperationId: `commit-${operation}` },
  });
  return commit.outcome.data;
}

// ==========================================
// Ticket 01: 创角验证与全局占名
// ==========================================

test('character name validation enforces length and script exclusivity', () => {
  // Valid names
  assert.equal(validateCharacterName('破阵子'), true);
  assert.equal(validateCharacterName('剑'), true);
  assert.equal(validateCharacterName('六字角色名字'), true);
  assert.equal(validateCharacterName('Warrior'), true);
  assert.equal(validateCharacterName('BladeMaster'), true);
  assert.equal(validateCharacterName('TwelveLetter'), true);

  // Invalid names
  assert.equal(validateCharacterName(''), false); // empty
  assert.equal(validateCharacterName('七字超长中文角色名'), false); // >6 Chinese
  assert.equal(validateCharacterName('ThirteenLetter'), false); // >12 English
  assert.equal(validateCharacterName('战Warrior'), false); // mixed Chinese and English
  assert.equal(validateCharacterName('剑_圣'), false); // symbols
  assert.equal(validateCharacterName('剑 圣'), false); // spaces
  assert.equal(validateCharacterName('Warrior1'), false); // digits
});

test('character creation with invalid name is rejected', async () => {
  const { loginService, characterService } = setupEnvironment();
  const session = await loginUser(loginService);

  const res = await characterService.execute({
    protocolVersion: 2,
    command: 'character.create',
    operationId: 'op-create-invalid',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { classId: 'warrior', characterName: '战Warrior' },
  });

  assert.equal(res.outcome.status, 'rejected');
  assert.equal(res.outcome.code, 'INVALID_ARGUMENT');
});

test('global atomic name occupancy prevents duplicate name across different accounts', async () => {
  const store = new MemoryStore();
  let now = 1000;
  const clock = { now: () => now };

  const identity1 = createContextIdentityPort(
    { appId: 'app', environment: 'test', sources: ['minigame'] },
    () => ({ APPID: 'app', ENV: 'test', SOURCE: 'minigame', OPENID: 'player-1' })
  );
  const login1 = new LoginService({ store, identity: identity1, clock, ticketTtlMs: 60000, initialUnlocks: { first: ['normal'] }, holdingsDomainRef: 'test-domain' });

  const identity2 = createContextIdentityPort(
    { appId: 'app', environment: 'test', sources: ['minigame'] },
    () => ({ APPID: 'app', ENV: 'test', SOURCE: 'minigame', OPENID: 'player-2' })
  );
  const login2 = new LoginService({ store, identity: identity2, clock, ticketTtlMs: 60000, initialUnlocks: { first: ['normal'] }, holdingsDomainRef: 'test-domain' });

  const characterService = new CharacterService({
    store,
    clock,
    initialProgressionRef: { id: 'progression-warrior-v1', version: 1 },
    initialWeaponTemplateRef: { id: 'equipment:warrior-sword-white-v1', version: 1 },
  });

  const session1 = await loginUser(login1, 'launch-1', 'user1');
  const session2 = await loginUser(login2, 'launch-2', 'user2');

  // Account 1 creates character "破阵子"
  const res1 = await characterService.execute({
    protocolVersion: 2,
    command: 'character.create',
    operationId: 'op-1',
    sessionId: session1.sessionId,
    sessionEpoch: session1.sessionEpoch,
    expected: [],
    payload: { classId: 'warrior', characterName: '破阵子' },
  });
  assert.equal(res1.outcome.status, 'committed');

  // Account 2 tries to create character "破阵子" -> rejected
  const res2 = await characterService.execute({
    protocolVersion: 2,
    command: 'character.create',
    operationId: 'op-2',
    sessionId: session2.sessionId,
    sessionEpoch: session2.sessionEpoch,
    expected: [],
    payload: { classId: 'warrior', characterName: '破阵子' },
  });
  assert.equal(res2.outcome.status, 'rejected');
  assert.equal(res2.outcome.code, 'INVALID_ARGUMENT');

  // English case-insensitive occupancy check
  const resCase1 = await characterService.execute({
    protocolVersion: 2,
    command: 'character.create',
    operationId: 'op-case-1',
    sessionId: session2.sessionId,
    sessionEpoch: session2.sessionEpoch,
    expected: [],
    payload: { classId: 'warrior', characterName: 'Arthur' },
  });
  assert.equal(resCase1.outcome.status, 'committed');

  const resCase2 = await characterService.execute({
    protocolVersion: 2,
    command: 'character.create',
    operationId: 'op-case-2',
    sessionId: session1.sessionId,
    sessionEpoch: session1.sessionEpoch,
    expected: [],
    payload: { classId: 'warrior', characterName: 'arthur' },
  });
  assert.equal(resCase2.outcome.status, 'rejected');
});

test('account cannot create more than one character of the same class', async () => {
  const { loginService, characterService } = setupEnvironment();
  const session = await loginUser(loginService);

  const res1 = await characterService.execute({
    protocolVersion: 2,
    command: 'character.create',
    operationId: 'op-first-char',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { classId: 'warrior', characterName: '狂战士' },
  });
  assert.equal(res1.outcome.status, 'committed');

  // Second warrior creation on same account is rejected with CLASS_EXISTS
  const res2 = await characterService.execute({
    protocolVersion: 2,
    command: 'character.create',
    operationId: 'op-second-char',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { classId: 'warrior', characterName: '剑圣' },
  });
  assert.equal(res2.outcome.status, 'rejected');
  assert.equal(res2.outcome.code, 'CLASS_EXISTS');
});

test('hunter class creation is rejected in current release profile', async () => {
  const { loginService, characterService } = setupEnvironment();
  const session = await loginUser(loginService);

  const res = await characterService.execute({
    protocolVersion: 2,
    command: 'character.create',
    operationId: 'op-hunter',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { classId: 'hunter', characterName: '神射手' },
  });
  assert.equal(res.outcome.status, 'rejected');
  assert.equal(res.outcome.code, 'INVALID_ARGUMENT');
});

// ==========================================
// Ticket 02: 初始角色属性与容器隔离
// ==========================================

test('character entity is initialized with level 1, 0 xp, 308 stamina, and inn location', async () => {
  const { loginService, characterService, store } = setupEnvironment();
  const session = await loginUser(loginService);

  const res = await characterService.execute({
    protocolVersion: 2,
    command: 'character.create',
    operationId: 'op-init-state',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { classId: 'warrior', characterName: '铁血战士' },
  });

  const charId = res.outcome.data.characterId;
  const character = store.inspect(charId);
  assert.equal(character.level, 1);
  assert.equal(character.xp, 0);
  assert.equal(character.stamina.value, 308);
  assert.deepEqual(character.quickSlots, [null, null, null]);
  assert.deepEqual(character.location, { kind: 'inn', characterId: charId });
  assert.equal(character.rolePlayEpoch, 1);
});

test('containers are created with 20 capacity each and shared account assets remain intact', async () => {
  const { loginService, characterService, store } = setupEnvironment();
  const session = await loginUser(loginService);

  // Inspect account vault and wallet before character creation
  const sessionDoc = store.inspect(session.sessionId);
  const account = store.inspect(sessionDoc.accountId);
  const accountVaultBefore = store.inspect(account.accountVaultId);
  const walletBefore = store.inspect(account.walletId);

  const res = await characterService.execute({
    protocolVersion: 2,
    command: 'character.create',
    operationId: 'op-containers',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { classId: 'warrior', characterName: '无极' },
  });

  const charId = res.outcome.data.characterId;
  const character = store.inspect(charId);

  // Backpack
  const backpack = store.inspect(character.backpackId);
  assert.equal(backpack.kind, 'backpack');
  assert.equal(backpack.capacity, 20);
  assert.equal(backpack.stage, 0);

  // Personal Vault
  const personalVault = store.inspect(character.personalVaultId);
  assert.equal(personalVault.kind, 'personalVault');
  assert.equal(personalVault.capacity, 20);
  assert.equal(personalVault.stage, 0);

  // Shared Account Vault and Wallet are unchanged
  const accountVaultAfter = store.inspect(account.accountVaultId);
  const walletAfter = store.inspect(account.walletId);
  assert.deepEqual(accountVaultBefore, accountVaultAfter);
  assert.deepEqual(walletBefore, walletAfter);
});

// ==========================================
// Ticket 03: 初始白武器穿戴与新手邮件发放
// ==========================================

test('initial level 10 white weapon is equipped, character-bound and at max durability', async () => {
  const { loginService, characterService, store } = setupEnvironment();
  const session = await loginUser(loginService);

  const res = await characterService.execute({
    protocolVersion: 2,
    command: 'character.create',
    operationId: 'op-weapon',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { classId: 'warrior', characterName: '斩铁' },
  });

  const charId = res.outcome.data.characterId;
  const character = store.inspect(charId);
  assert.ok(character.equipped.weapon);

  const weapon = store.inspect(character.equipped.weapon);
  assert.equal(weapon.quality, 'white');
  assert.equal(weapon.itemLevel, 10);
  assert.equal(weapon.durability.wearEnabled, true);
  assert.equal(weapon.durability.current, weapon.durability.max);
  assert.equal(weapon.binding.kind, 'character');
  assert.equal(weapon.binding.characterId, charId);
  assert.deepEqual(weapon.location, { kind: 'equipped', characterId: charId, slotId: 'weapon' });
});

test('novice mail contains 8 hp, 8 mp and 10 emblems and creates immutable source stub', async () => {
  const { loginService, characterService, store, getNow } = setupEnvironment();
  const session = await loginUser(loginService);

  const res = await characterService.execute({
    protocolVersion: 2,
    command: 'character.create',
    operationId: 'op-mail',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { classId: 'warrior', characterName: '破军' },
  });

  const charId = res.outcome.data.characterId;
  const sessionDoc = store.inspect(session.sessionId);
  const mailKey = await characterKey('mail', [sessionDoc.accountId, 'warrior', 'novice-gift']);
  const mail = store.inspect(mailKey);

  assert.equal(mail.status, 'active');
  assert.equal(mail.expiresAt, getNow() + 30 * 24 * 60 * 60 * 1000);
  assert.equal(mail.attachments.length, 3);

  const hp = mail.attachments.find(a => a.templateRef.id === 'item:hp-potion-small-v1');
  assert.equal(hp.quantityGranted, 8);
  assert.equal(hp.binding.kind, 'character');

  const mp = mail.attachments.find(a => a.templateRef.id === 'item:mp-potion-small-v1');
  assert.equal(mp.quantityGranted, 8);

  const emblem = mail.attachments.find(a => a.templateRef.id === 'item:revival-emblem-v1');
  assert.equal(emblem.quantityGranted, 10);

  // Grant stub
  const grantKey = await characterKey('grant', [sessionDoc.accountId, 'warrior', 'novice-gift']);
  const grant = store.inspect(grantKey);
  assert.equal(grant.sourceType, 'novice-gift');
  assert.equal(grant.deliveryState, 'delivered');
  assert.equal(grant.relatedId, mailKey);
});

// ==========================================
// Ticket 04: 创角原子事务与故障回滚
// ==========================================

test('character creation atomically initializes assets and personal holdings into store', async () => {
  const { loginService, characterService, store } = setupEnvironment();
  const session = await loginUser(loginService);

  const sizeBefore = store.snapshot().size;
  const res = await characterService.execute({
    protocolVersion: 2,
    command: 'character.create',
    operationId: 'op-9keys',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { classId: 'warrior', characterName: '天策' },
  });

  assert.equal(res.outcome.status, 'committed');
  const sizeAfter = store.snapshot().size;
  // 9 new keys: existing initial assets plus the character holdings summary; account updates in place
  assert.equal(sizeAfter - sizeBefore, 9);
});

test('failure injection at any write point rolls back all changes with zero residue', async () => {
  const failNames = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  for (let failIndex = 1; failIndex <= 10; failIndex++) {
    const { loginService, characterService, store } = setupEnvironment();
    const session = await loginUser(loginService);
    const snapshotBefore = store.snapshot();

    // Inject write failure at failIndex
    store.injectWriteFailure(failIndex);

    const res = await characterService.execute({
      protocolVersion: 2,
      command: 'character.create',
      operationId: `op-fail-${failIndex}`,
      sessionId: session.sessionId,
      sessionEpoch: session.sessionEpoch,
      expected: [],
      payload: { classId: 'warrior', characterName: failNames[failIndex - 1] },
    });

    assert.equal(res.outcome.status, 'rejected');
    assert.equal(res.outcome.code, 'SERVICE_UNAVAILABLE');

    // Verify snapshot is completely unchanged
    assert.deepEqual(store.snapshot(), snapshotBefore);
  }
});

test('lost response restores exact character creation result with replayed true', async () => {
  const { loginService, characterService, store } = setupEnvironment();
  const session = await loginUser(loginService);

  const command = {
    protocolVersion: 2,
    command: 'character.create',
    operationId: 'op-retry-idempotent',
    sessionId: session.sessionId,
    sessionEpoch: session.sessionEpoch,
    expected: [],
    payload: { classId: 'warrior', characterName: '孤勇者' },
  };

  const first = await characterService.execute(command);
  assert.equal(first.outcome.status, 'committed');
  assert.equal(first.replayed, false);

  const replay = await characterService.execute(command);
  assert.equal(replay.outcome.status, 'committed');
  assert.equal(replay.replayed, true);
  assert.equal(replay.outcome.data.characterId, first.outcome.data.characterId);
  assert.equal(replay.outcome.data.characterName, '孤勇者');

  // Same operationId but different intent parameters triggers OPERATION_MISMATCH
  const mismatch = await characterService.execute({
    ...command,
    payload: { classId: 'warrior', characterName: '另一名' },
  });
  assert.equal(mismatch.outcome.status, 'rejected');
  assert.equal(mismatch.outcome.code, 'OPERATION_MISMATCH');
});

// ==========================================
// ST03 Ticket 01: 角色选择与代次控制
// ==========================================

test('character select validates ownership, increments rolePlayEpoch, isolates in inn, and updates account', async () => {
  const { loginService, characterService, store } = setupEnvironment();
  const session1 = await loginUser(loginService, 'launch-user-1', 'op-u1');

  // Create character
  const createRes = await characterService.execute({
    protocolVersion: 2,
    command: 'character.create',
    operationId: 'op-create-sel',
    sessionId: session1.sessionId,
    sessionEpoch: session1.sessionEpoch,
    expected: [],
    payload: { classId: 'warrior', characterName: '破军' },
  });
  assert.equal(createRes.outcome.status, 'committed');
  const characterId = createRes.outcome.data.characterId;

  // 1. Select character
  const select1 = await characterService.execute({
    protocolVersion: 2,
    command: 'character.select',
    operationId: 'op-sel-1',
    sessionId: session1.sessionId,
    sessionEpoch: session1.sessionEpoch,
    expected: [],
    payload: { characterId },
  });
  assert.equal(select1.outcome.status, 'committed');
  assert.equal(select1.replayed, false);
  assert.equal(select1.outcome.data.characterId, characterId);
  assert.equal(select1.outcome.data.rolePlayEpoch, 2);
  assert.equal(select1.outcome.data.innAnchorRef, `inn:${characterId}`);

  // Check state in store
  const charAfter1 = store.inspect(characterId);
  assert.equal(charAfter1.rolePlayEpoch, 2);
  assert.deepEqual(charAfter1.location, { kind: 'inn', characterId });

  const account1 = store.inspect(charAfter1.accountId);
  assert.equal(account1.selectedCharacterId, characterId);

  // 2. Select again -> rolePlayEpoch increments to 3
  const select2 = await characterService.execute({
    protocolVersion: 2,
    command: 'character.select',
    operationId: 'op-sel-2',
    sessionId: session1.sessionId,
    sessionEpoch: session1.sessionEpoch,
    expected: [],
    payload: { characterId },
  });
  assert.equal(select2.outcome.status, 'committed');
  assert.equal(select2.outcome.data.rolePlayEpoch, 3);

  const charAfter2 = store.inspect(characterId);
  assert.equal(charAfter2.rolePlayEpoch, 3);

  // 3. Select non-existent character -> NOT_FOUND_OR_FORBIDDEN
  const notFound = await characterService.execute({
    protocolVersion: 2,
    command: 'character.select',
    operationId: 'op-sel-missing',
    sessionId: session1.sessionId,
    sessionEpoch: session1.sessionEpoch,
    expected: [],
    payload: { characterId: 'c-non-existent' },
  });
  assert.equal(notFound.outcome.status, 'rejected');
  assert.equal(notFound.outcome.code, 'NOT_FOUND_OR_FORBIDDEN');

  // 4. Another user tries to select this character -> NOT_FOUND_OR_FORBIDDEN
  const otherIdentity = createContextIdentityPort(
    { appId: 'app', environment: 'test', sources: ['minigame'] },
    () => ({ APPID: 'app', ENV: 'test', SOURCE: 'minigame', OPENID: 'other-player' })
  );
  const otherLoginService = new LoginService({
    store,
    identity: otherIdentity,
    clock: { now: () => 1000 },
    ticketTtlMs: 60000,
    initialUnlocks: {},
    holdingsDomainRef: 'test-collection-domain-v1',
  });
  const session2 = await loginUser(otherLoginService, 'launch-user-2', 'op-u2');

  const crossUser = await characterService.execute({
    protocolVersion: 2,
    command: 'character.select',
    operationId: 'op-sel-cross',
    sessionId: session2.sessionId,
    sessionEpoch: session2.sessionEpoch,
    expected: [],
    payload: { characterId },
  });
  assert.equal(crossUser.outcome.status, 'rejected');
  assert.equal(crossUser.outcome.code, 'NOT_FOUND_OR_FORBIDDEN');

  // 5. Stale sessionEpoch -> VERSION_CONFLICT
  const staleSession = await characterService.execute({
    protocolVersion: 2,
    command: 'character.select',
    operationId: 'op-sel-stale-session',
    sessionId: session1.sessionId,
    sessionEpoch: session1.sessionEpoch + 99,
    expected: [],
    payload: { characterId },
  });
  assert.equal(staleSession.outcome.status, 'rejected');
  assert.equal(staleSession.outcome.code, 'VERSION_CONFLICT');

  // 6. Conflicting expected version -> VERSION_CONFLICT
  const staleExpected = await characterService.execute({
    protocolVersion: 2,
    command: 'character.select',
    operationId: 'op-sel-stale-exp',
    sessionId: session1.sessionId,
    sessionEpoch: session1.sessionEpoch,
    expected: [{ kind: 'character', id: characterId, version: 9999 }],
    payload: { characterId },
  });
  assert.equal(staleExpected.outcome.status, 'rejected');
  assert.equal(staleExpected.outcome.code, 'VERSION_CONFLICT');

  // 7. Idempotency & lost response recovery
  const replaySelect2 = await characterService.execute({
    protocolVersion: 2,
    command: 'character.select',
    operationId: 'op-sel-2',
    sessionId: session1.sessionId,
    sessionEpoch: session1.sessionEpoch,
    expected: [],
    payload: { characterId },
  });
  assert.equal(replaySelect2.outcome.status, 'committed');
  assert.equal(replaySelect2.replayed, true);
  assert.equal(replaySelect2.outcome.data.rolePlayEpoch, 3);

  // 8. Operation mismatch
  const mismatchSelect = await characterService.execute({
    protocolVersion: 2,
    command: 'character.select',
    operationId: 'op-sel-2',
    sessionId: session1.sessionId,
    sessionEpoch: session1.sessionEpoch,
    expected: [],
    payload: { characterId: 'c-different' },
  });
  assert.equal(mismatchSelect.outcome.status, 'rejected');
  assert.equal(mismatchSelect.outcome.code, 'OPERATION_MISMATCH');
});
