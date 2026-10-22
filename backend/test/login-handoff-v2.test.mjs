import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/adapters/memory-store.ts';
import { handoff } from '../src/identity/login-handoff.ts';
import { loginKey } from '../src/identity/identity-v2.ts';
import { createHash } from 'node:crypto';

const now = 1000;
const windowAt = value => Math.floor((value + 8 * 3600000) / (4 * 3600000));
function account() { return { schemaVersion: 2, id: 'a', version: 0, writeRevision: 0, createdAt: 0, updatedAt: 0, currentSessionId: 'old-session', sessionEpoch: 1, characterIdsByClass: { warrior: 'c' }, selectedCharacterId: 'c', walletId: 'wallet', accountVaultId: 'vault', dungeonUnlocks: {} }; }
function character() { return { schemaVersion: 2, characterId: 'c', accountId: 'a', classId: 'warrior', characterName: '战士', level: 1, version: 0, rolePlayEpoch: 1, location: { kind: 'town', mapId: 'town', anchorId: 'bank' }, stamina: { value: 19, refillWindow: windowAt(now) } }; }
async function run(store, input = account(), time = now) { return store.run(async tx => {
  const current = await tx.get(input.id) ?? input;
  const result = await handoff(tx, current, time, 'open-operation', 'receipt');
  tx.set(current.id, { ...result.account, sessionEpoch: current.sessionEpoch + 1, writeRevision: current.writeRevision + 1 });
  return result;
}); }

test('selected character returns to its isolated inn with a new role epoch and preserves current-window stamina', async () => {
  const store = new MemoryStore();
  await store.run(tx => { tx.set('a', account()); tx.set('c', character()); tx.set('wallet', { gold: '12345' }); });
  const result = await run(store);
  assert.deepEqual(result.selectedCharacter, { characterId: 'c', rolePlayEpoch: 2 });
  assert.deepEqual(result.characters, [{ characterId: 'c', classId: 'warrior', characterName: '战士', level: 1 }]);
  assert.deepEqual(store.inspect('c').location, { kind: 'inn', characterId: 'c' });
  assert.deepEqual(store.inspect('c').stamina, { value: 19, refillWindow: windowAt(now) });
  assert.deepEqual(store.inspect('wallet'), { gold: '12345' });
});

async function battleFixture(store, result = 'active', settled = false) {
  const a = { ...account(), activeChallengeId: result === 'active' ? 'h' : undefined, openSceneChallengeId: 'h' };
  const c = { ...character(), location: { kind: 'challenge', challengeId: 'h' }, staminaReservation: settled ? undefined : 'h' };
  const data = { schemaVersion: 1, actors: [], effects: [] };
  const chunkHash = createHash('sha256').update('{"actors":[],"effects":[],"schemaVersion":1}').digest('hex');
  const headerId = await loginKey('cpHeader', ['h']), chunkId = await loginKey('cpChunk', ['h', 0]);
  const h = { schemaVersion: 2, id: 'h', accountId: 'a', characterId: 'c', sessionId: 'old-session', version: 0, result, sceneState: settled ? 'closed' : result === 'active' ? 'combat' : 'looting', sceneEpoch: 1, currentRoomNo: 0, roomPhase: settled ? 'closed' : 'active',
    staminaSnapshot: { entryValue: 19, remaining: 12, entryRefillWindow: windowAt(now), entryAt: 0, revision: 1 },
    staminaSettlement: settled ? { state: 'settled', settledAt: 500, loadedRefillWindow: windowAt(now), loadedValue: 12, sourceChallengeId: 'h' } : { state: 'unsettled' }, transitionClock: { marker: 'do-not-keep' } };
  const header = { schemaVersion: 2, id: headerId, challengeId: 'h', accountId: 'a', characterId: 'c', revision: 3, sceneEpoch: 1, acceptingInputs: !settled,
    activeChunks: [{ ordinal: 0, chunkRevision: 1, hash: chunkHash, sceneEpoch: 1 }] };
  const chunk = { schemaVersion: 2, id: chunkId, challengeId: 'h', accountId: 'a', ordinal: 0, chunkRevision: 1, sceneEpoch: 1, hash: chunkHash, data };
  await store.run(tx => { tx.set('a', a); tx.set('c', c); tx.set('h', h); tx.set(headerId, header); tx.set(chunkId, chunk); tx.set('wallet', { gold: '12345' }); });
  return { a, c, h, headerId, header, chunkId, chunk };
}

test('active handoff closes H and CP head, settles remaining once and never rewrites chunks or wallet', async () => {
  const store = new MemoryStore(), fixture = await battleFixture(store);
  const result = await run(store);
  assert.equal(result.account.activeChallengeId, undefined);
  assert.equal(result.account.openSceneChallengeId, undefined);
  assert.equal(store.inspect('h').result, 'failed');
  assert.equal(store.inspect('h').sceneState, 'closed');
  assert.equal(store.inspect('h').transitionClock, undefined);
  assert.equal(store.inspect(fixture.headerId).acceptingInputs, false);
  assert.deepEqual(store.inspect(fixture.chunkId), fixture.chunk);
  assert.equal(store.inspect('c').stamina.value, 12);
  assert.equal(store.inspect('c').staminaReservation, undefined);
  assert.equal(store.inspect('c').roleState.lifeState, 'alive');
  assert.equal(store.inspect('c').roleState.cooldowns, 'cleared');
  assert.deepEqual(store.inspect('wallet'), { gold: '12345' });
});

test('completed scenes keep success and a crossed refresh window loads 308 only at handoff', async () => {
  const store = new MemoryStore(), fixture = await battleFixture(store, 'completed');
  await run(store, fixture.a, now + 4 * 3600000);
  assert.equal(store.inspect('h').result, 'completed');
  assert.equal(store.inspect('h').sceneState, 'closed');
  assert.equal(store.inspect('c').stamina.value, 308);
  assert.equal(store.inspect('h').staminaSettlement.loadedValue, 308);
});

test('stale closed pointer never replays an old settlement over current character stamina', async () => {
  const store = new MemoryStore(), fixture = await battleFixture(store, 'completed', true);
  await run(store, fixture.a);
  assert.equal(store.inspect('c').stamina.value, 19);
  assert.equal(store.inspect('h').staminaSettlement.loadedValue, 12);
  assert.deepEqual(store.inspect(fixture.headerId), fixture.header);
  assert.equal(store.inspect('a').openSceneChallengeId, undefined);
});

test('a stale settled pointer still applies a genuinely newer town refill window', async () => {
  const store = new MemoryStore(), fixture = await battleFixture(store, 'completed', true);
  await run(store, fixture.a, now + 4 * 3600000);
  assert.equal(store.inspect('c').stamina.value, 308);
  assert.equal(store.inspect('h').staminaSettlement.loadedValue, 12);
});

test('an explicitly unactivated first room closes without inventing a checkpoint', async () => {
  const store = new MemoryStore(), fixture = await battleFixture(store);
  await store.run(tx => {
    tx.set('h', { ...fixture.h, sceneEpoch: 0, currentRoomNo: -1, roomPhase: 'preparing' });
    tx.set(fixture.headerId, undefined);
  });
  await run(store, fixture.a);
  assert.equal(store.inspect('h').sceneState, 'closed');
  assert.equal(store.inspect('h').result, 'failed');
  assert.equal(store.inspect(fixture.headerId), undefined);
  assert.equal(store.inspect('c').stamina.value, 12);
});

test('an unselected owned challenge character is still closed and reset without selecting it', async () => {
  const store = new MemoryStore(), fixture = await battleFixture(store);
  const a = { ...fixture.a }; delete a.selectedCharacterId;
  await store.run(tx => tx.set('a', a));
  const result = await run(store, a);
  assert.equal(result.selectedCharacter, null);
  assert.equal(store.inspect('c').location.kind, 'inn');
  assert.equal(store.inspect('h').sceneState, 'closed');
});

for (const mutation of ['missingChunk', 'chunkHash', 'chunkRevision', 'chunkScene', 'bodyTamper', 'splitPointers', 'wrongOwner', 'missingReservation', 'missingHeadAccess']) {
  test(`corrupt handoff ${mutation} rejects with no partially closed scene`, async () => {
    const store = new MemoryStore(), fixture = await battleFixture(store);
    await store.run(tx => {
      if (mutation === 'missingChunk') tx.set(fixture.chunkId, undefined);
      if (mutation === 'chunkHash') tx.set(fixture.chunkId, { ...fixture.chunk, hash: 'a'.repeat(64) });
      if (mutation === 'chunkRevision') tx.set(fixture.chunkId, { ...fixture.chunk, chunkRevision: 2 });
      if (mutation === 'chunkScene') tx.set(fixture.chunkId, { ...fixture.chunk, sceneEpoch: 2 });
      if (mutation === 'bodyTamper') tx.set(fixture.chunkId, { ...fixture.chunk, data: { changed: true } });
      if (mutation === 'splitPointers') tx.set('a', { ...fixture.a, openSceneChallengeId: 'other' });
      if (mutation === 'wrongOwner') tx.set('h', { ...fixture.h, accountId: 'other' });
      if (mutation === 'missingReservation') tx.set('c', { ...fixture.c, staminaReservation: undefined });
      if (mutation === 'missingHeadAccess') tx.set(fixture.headerId, { ...fixture.header, acceptingInputs: undefined });
    });
    const before = store.snapshot();
    await assert.rejects(run(store), /INTEGRITY/);
    assert.deepEqual(store.snapshot(), before);
  });
}

for (let write = 1; write <= 5; write++) {
  test(`handoff write ${write} fails atomically across character, H, CP head, journal and account`, async () => {
    const store = new MemoryStore(); await battleFixture(store);
    const before = store.snapshot(); store.injectWriteFailure(write);
    await assert.rejects(run(store), /injected write failure/);
    assert.deepEqual(store.snapshot(), before);
  });
}

for (const blockedFirst of ['handoff', 'terminal']) {
  test(`account fence resolves competing terminal and handoff when ${blockedFirst} attempts first`, async () => {
    const store = new MemoryStore(); await battleFixture(store);
    let signal, release;
    const reached = new Promise(resolve => { signal = resolve; });
    const held = new Promise(resolve => { release = resolve; });
    let block = true;
    store.beforeCommit = async attempt => { if (attempt === 0 && block) { block = false; signal(); await held; } };
    const terminal = () => store.run(async tx => {
      const a = await tx.get('a'), h = await tx.get('h');
      if (a.sessionEpoch !== 1 || h.sceneState === 'closed') return 'rejected';
      tx.set('a', { ...a, writeRevision: a.writeRevision + 1 });
      tx.set('h', { ...h, result: 'completed', sceneState: 'looting', version: h.version + 1 });
      tx.set('wallet', { gold: '12346' });
      return 'committed';
    });
    const first = blockedFirst === 'handoff' ? run(store) : terminal();
    await reached;
    const second = blockedFirst === 'handoff' ? terminal() : run(store);
    await second; release(); await first;
    assert.equal(store.inspect('h').sceneState, 'closed');
    assert.equal(store.inspect('h').result, blockedFirst === 'handoff' ? 'completed' : 'failed');
    assert.equal(store.inspect('wallet').gold, blockedFirst === 'handoff' ? '12346' : '12345');
    assert.ok(store.conflicts >= 1);
  });
}
