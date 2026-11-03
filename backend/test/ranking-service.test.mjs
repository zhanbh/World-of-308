import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/adapters/memory-store.ts';
import { characterKey } from '../src/character/character-service.ts';
import {
  RankingService,
  compareRankingEntries,
} from '../src/ranking/ranking-service.ts';
import {
  parseAssetQuery,
  parseAssetQueryResponse,
} from '../../shared/src/protocol/asset-v2.ts';

function createMockClock(initialTime = 1000) {
  let currentTime = initialTime;
  return {
    now: () => currentTime,
    setNow: (t) => {
      currentTime = t;
    },
  };
}

async function createFixture() {
  const store = new MemoryStore();
  const clock = createMockClock(2000);
  const service = new RankingService({
    store,
    clock,
    secret: 'test-ranking-secret-32-bytes-long!!',
    scoreConfigRef: 'score-v1',
  });

  async function putRankingEntry({
    characterId,
    accountId = 'acc-1',
    classId = 'warrior',
    characterName = '测试角色',
    level = 10,
    score = '2000',
    scoreConfigRef = 'score-v1',
    equipmentVersion = 1,
    scoreReachedAt = 1000,
  }) {
    const id = await characterKey('rankingEntry', [characterId]);
    const entry = {
      schemaVersion: 2,
      id,
      characterId,
      accountId,
      classId,
      characterName,
      level,
      score: String(score),
      scoreConfigRef,
      equipmentVersion,
      scoreReachedAt,
      projectionVersion: equipmentVersion,
      updatedAt: scoreReachedAt,
    };
    await store.run(async tx => {
      tx.set(id, entry);
    });
    return entry;
  }

  async function setupActiveSession(accountId, characterId, sessionId = 'sess-1', sessionEpoch = 1) {
    await store.run(async tx => {
      tx.set(sessionId, {
        schemaVersion: 2,
        id: sessionId,
        accountId,
        launchIdHash: 'launch-hash',
        epoch: sessionEpoch,
        status: 'active',
        openedAt: 1000,
      });
      tx.set(accountId, {
        schemaVersion: 2,
        id: accountId,
        version: 1,
        writeRevision: 1,
        createdAt: 1000,
        updatedAt: 1000,
        currentSessionId: sessionId,
        sessionEpoch,
        characterIdsByClass: { warrior: characterId },
        selectedCharacterId: characterId,
        walletId: 'w-1',
        accountVaultId: 'v-1',
        dungeonUnlocks: {},
      });
    });
  }

  return { store, clock, service, putRankingEntry, setupActiveSession };
}

test('ST20-01 AC20-1: stable triad sort (score DESC, scoreReachedAt ASC, characterId ASC)', async () => {
  const f = await createFixture();

  // Create four entries with interesting combinations
  // c1: 3000 score, reached 1000
  // c2: 3000 score, reached 1200 (later than c1)
  // c3: 3000 score, reached 1000, but id 'c-0' (lexicographically smaller than c1)
  // c4: 5000 score, reached 2000 (highest score)
  // c5: 1000 score, reached 500 (lowest score)
  await f.putRankingEntry({ characterId: 'c-1', characterName: '甲', score: '3000', scoreReachedAt: 1000 });
  await f.putRankingEntry({ characterId: 'c-2', characterName: '乙', score: '3000', scoreReachedAt: 1200 });
  await f.putRankingEntry({ characterId: 'c-0', characterName: '丙', score: '3000', scoreReachedAt: 1000 });
  await f.putRankingEntry({ characterId: 'c-4', characterName: '丁', score: '5000', scoreReachedAt: 2000 });
  await f.putRankingEntry({ characterId: 'c-5', characterName: '戊', score: '1000', scoreReachedAt: 500 });

  const res = await f.service.query({
    protocolVersion: 2,
    query: 'ranking.list',
    requestId: 'req-sort-1',
    sessionId: 'sess-none',
    sessionEpoch: 1,
    payload: { scope: 'all', cursor: null, pageRequest: 10 },
  });

  assert.ok('data' in res);
  const data = res.data;
  assert.equal(data.entries.length, 5);

  // Expected order:
  // 1: c-4 (score 5000)
  // 2: c-0 (score 3000, reached 1000, id 'c-0')
  // 3: c-1 (score 3000, reached 1000, id 'c-1')
  // 4: c-2 (score 3000, reached 1200)
  // 5: c-5 (score 1000)
  assert.equal(data.entries[0].character.characterId, 'c-4');
  assert.equal(data.entries[0].rank, 1);
  assert.equal(data.entries[0].score.value, '5000');

  assert.equal(data.entries[1].character.characterId, 'c-0');
  assert.equal(data.entries[1].rank, 2);
  assert.equal(data.entries[1].score.value, '3000');

  assert.equal(data.entries[2].character.characterId, 'c-1');
  assert.equal(data.entries[2].rank, 3);
  assert.equal(data.entries[2].score.value, '3000');

  assert.equal(data.entries[3].character.characterId, 'c-2');
  assert.equal(data.entries[3].rank, 4);
  assert.equal(data.entries[3].score.value, '3000');

  assert.equal(data.entries[4].character.characterId, 'c-5');
  assert.equal(data.entries[4].rank, 5);
  assert.equal(data.entries[4].score.value, '1000');
});

test('ST20-01 AC20-1: score fluctuation 500 -> 600 -> 500 resets scoreReachedAt', async () => {
  const f = await createFixture();

  // Character A: starts at 500 at t=1000
  // Character B: starts at 500 at t=1100
  await f.putRankingEntry({ characterId: 'char-a', characterName: '战A', score: '500', scoreReachedAt: 1000 });
  await f.putRankingEntry({ characterId: 'char-b', characterName: '战B', score: '500', scoreReachedAt: 1100 });

  // Initially: A is rank 1, B is rank 2 (1000 < 1100)
  const q1 = await f.service.query({
    protocolVersion: 2,
    query: 'ranking.list',
    requestId: 'req-fluc-1',
    sessionId: 'sess-none',
    sessionEpoch: 1,
    payload: { scope: 'all', cursor: null, pageRequest: 10 },
  });
  assert.ok('data' in q1);
  assert.equal(q1.data.entries[0].character.characterId, 'char-a');
  assert.equal(q1.data.entries[1].character.characterId, 'char-b');

  // Character A changes score: 500 -> 600 at t=1200, then drops back to 500 at t=1500
  await f.putRankingEntry({ characterId: 'char-a', characterName: '战A', score: '500', scoreReachedAt: 1500 });

  // Now: B reached 500 at t=1100, while A reached 500 at t=1500!
  // B must now be ahead of A!
  const q2 = await f.service.query({
    protocolVersion: 2,
    query: 'ranking.list',
    requestId: 'req-fluc-2',
    sessionId: 'sess-none',
    sessionEpoch: 1,
    payload: { scope: 'all', cursor: null, pageRequest: 10 },
  });
  assert.ok('data' in q2);
  assert.equal(q2.data.entries[0].character.characterId, 'char-b');
  assert.equal(q2.data.entries[0].rank, 1);
  assert.equal(q2.data.entries[1].character.characterId, 'char-a');
  assert.equal(q2.data.entries[1].rank, 2);
});

test('ST20-01 AC20-2: scope filtering (all / warrior / hunter) and scoreConfigRef isolation', async () => {
  const f = await createFixture();

  await f.putRankingEntry({ characterId: 'w-1', classId: 'warrior', score: '3000', scoreConfigRef: 'score-v1' });
  await f.putRankingEntry({ characterId: 'w-2', classId: 'warrior', score: '2500', scoreConfigRef: 'score-v1' });
  await f.putRankingEntry({ characterId: 'h-1', classId: 'hunter', score: '4000', scoreConfigRef: 'score-v1' });
  await f.putRankingEntry({ characterId: 'h-2', classId: 'hunter', score: '2000', scoreConfigRef: 'score-v1' });

  // Different configRef: should be isolated and excluded
  await f.putRankingEntry({ characterId: 'w-v2', classId: 'warrior', score: '9999', scoreConfigRef: 'score-v2' });

  // 1. scope: 'all'
  const resAll = await f.service.query({
    protocolVersion: 2,
    query: 'ranking.list',
    requestId: 'req-scope-all',
    sessionId: 'sess-none',
    sessionEpoch: 1,
    payload: { scope: 'all', cursor: null, pageRequest: 10 },
  });
  assert.ok('data' in resAll);
  assert.equal(resAll.data.entries.length, 4);
  assert.deepEqual(
    resAll.data.entries.map(e => e.character.characterId),
    ['h-1', 'w-1', 'w-2', 'h-2'],
  );

  // 2. scope: 'warrior'
  const resWarrior = await f.service.query({
    protocolVersion: 2,
    query: 'ranking.list',
    requestId: 'req-scope-warrior',
    sessionId: 'sess-none',
    sessionEpoch: 1,
    payload: { scope: 'warrior', cursor: null, pageRequest: 10 },
  });
  assert.ok('data' in resWarrior);
  assert.equal(resWarrior.data.entries.length, 2);
  assert.deepEqual(
    resWarrior.data.entries.map(e => e.character.characterId),
    ['w-1', 'w-2'],
  );
  assert.equal(resWarrior.data.entries[0].rank, 1);
  assert.equal(resWarrior.data.entries[1].rank, 2);

  // 3. scope: 'hunter'
  const resHunter = await f.service.query({
    protocolVersion: 2,
    query: 'ranking.list',
    requestId: 'req-scope-hunter',
    sessionId: 'sess-none',
    sessionEpoch: 1,
    payload: { scope: 'hunter', cursor: null, pageRequest: 10 },
  });
  assert.ok('data' in resHunter);
  assert.equal(resHunter.data.entries.length, 2);
  assert.deepEqual(
    resHunter.data.entries.map(e => e.character.characterId),
    ['h-1', 'h-2'],
  );
  assert.equal(resHunter.data.entries[0].rank, 1);
  assert.equal(resHunter.data.entries[1].rank, 2);
});

test('ST20-01 AC20-3: bounded cursor pagination and full traversal without duplicates', async () => {
  const f = await createFixture();

  // Insert 7 characters with descending scores
  for (let i = 1; i <= 7; i++) {
    await f.putRankingEntry({
      characterId: `char-${i}`,
      characterName: `勇士${i}`,
      score: String(10000 - i * 1000),
      scoreReachedAt: 1000 + i,
    });
  }

  // Page 1: pageRequest = 3
  const p1 = await f.service.query({
    protocolVersion: 2,
    query: 'ranking.list',
    requestId: 'req-page-1',
    sessionId: 'sess-none',
    sessionEpoch: 1,
    payload: { scope: 'all', cursor: null, pageRequest: 3 },
  });
  assert.ok('data' in p1);
  assert.equal(p1.data.entries.length, 3);
  assert.equal(p1.data.entries[0].character.characterId, 'char-1');
  assert.equal(p1.data.entries[1].character.characterId, 'char-2');
  assert.equal(p1.data.entries[2].character.characterId, 'char-3');
  assert.equal(p1.data.entries[0].rank, 1);
  assert.equal(p1.data.entries[1].rank, 2);
  assert.equal(p1.data.entries[2].rank, 3);
  assert.ok(p1.data.nextCursor !== null);

  // Page 2: pageRequest = 3 using nextCursor
  const p2 = await f.service.query({
    protocolVersion: 2,
    query: 'ranking.list',
    requestId: 'req-page-2',
    sessionId: 'sess-none',
    sessionEpoch: 1,
    payload: { scope: 'all', cursor: p1.data.nextCursor, pageRequest: 3 },
  });
  assert.ok('data' in p2);
  assert.equal(p2.data.entries.length, 3);
  assert.equal(p2.data.entries[0].character.characterId, 'char-4');
  assert.equal(p2.data.entries[1].character.characterId, 'char-5');
  assert.equal(p2.data.entries[2].character.characterId, 'char-6');
  assert.equal(p2.data.entries[0].rank, 4);
  assert.equal(p2.data.entries[1].rank, 5);
  assert.equal(p2.data.entries[2].rank, 6);
  assert.ok(p2.data.nextCursor !== null);

  // Page 3: pageRequest = 3 using p2 nextCursor (only 1 item left)
  const p3 = await f.service.query({
    protocolVersion: 2,
    query: 'ranking.list',
    requestId: 'req-page-3',
    sessionId: 'sess-none',
    sessionEpoch: 1,
    payload: { scope: 'all', cursor: p2.data.nextCursor, pageRequest: 3 },
  });
  assert.ok('data' in p3);
  assert.equal(p3.data.entries.length, 1);
  assert.equal(p3.data.entries[0].character.characterId, 'char-7');
  assert.equal(p3.data.entries[0].rank, 7);
  assert.equal(p3.data.nextCursor, null); // Last page!

  // Verify all 7 entries collected across pages are strictly unique
  const allIds = [
    ...p1.data.entries.map(e => e.character.characterId),
    ...p2.data.entries.map(e => e.character.characterId),
    ...p3.data.entries.map(e => e.character.characterId),
  ];
  assert.equal(allIds.length, 7);
  assert.equal(new Set(allIds).size, 7);
});

test('ST20-01 AC20-3: cursor tamper, expiration and scope mismatch protection', async () => {
  const f = await createFixture();

  await f.putRankingEntry({ characterId: 'char-1', score: '3000' });
  await f.putRankingEntry({ characterId: 'char-2', score: '2000' });

  const initial = await f.service.query({
    protocolVersion: 2,
    query: 'ranking.list',
    requestId: 'req-initial',
    sessionId: 'sess-none',
    sessionEpoch: 1,
    payload: { scope: 'all', cursor: null, pageRequest: 1 },
  });
  assert.ok('data' in initial);
  const validCursor = initial.data.nextCursor;
  assert.ok(validCursor);

  // 1. Tampered payload
  const tamperedCursor = validCursor.replace(/^([A-Za-z0-9_-]+)/, 'e30'); // replace with empty json base64
  const resTampered = await f.service.query({
    protocolVersion: 2,
    query: 'ranking.list',
    requestId: 'req-tamper',
    sessionId: 'sess-none',
    sessionEpoch: 1,
    payload: { scope: 'all', cursor: tamperedCursor, pageRequest: 1 },
  });
  assert.ok('error' in resTampered);
  assert.equal(resTampered.error.code, 'INVALID_ARGUMENT');

  // 2. Tampered signature
  const resBadSig = await f.service.query({
    protocolVersion: 2,
    query: 'ranking.list',
    requestId: 'req-badsig',
    sessionId: 'sess-none',
    sessionEpoch: 1,
    payload: { scope: 'all', cursor: validCursor + 'x', pageRequest: 1 },
  });
  assert.ok('error' in resBadSig);
  assert.equal(resBadSig.error.code, 'INVALID_ARGUMENT');

  // 3. Scope mismatch: cursor was issued for 'all', query passes 'warrior'
  const resMismatch = await f.service.query({
    protocolVersion: 2,
    query: 'ranking.list',
    requestId: 'req-mismatch',
    sessionId: 'sess-none',
    sessionEpoch: 1,
    payload: { scope: 'warrior', cursor: validCursor, pageRequest: 1 },
  });
  assert.ok('error' in resMismatch);
  assert.equal(resMismatch.error.code, 'INVALID_ARGUMENT');

  // 4. Expired cursor (> 10 minutes)
  f.clock.setNow(2000 + 11 * 60 * 1000);
  const resExpired = await f.service.query({
    protocolVersion: 2,
    query: 'ranking.list',
    requestId: 'req-expired',
    sessionId: 'sess-none',
    sessionEpoch: 1,
    payload: { scope: 'all', cursor: validCursor, pageRequest: 1 },
  });
  assert.ok('error' in resExpired);
  assert.equal(resExpired.error.code, 'INVALID_ARGUMENT');

  // 5. Completely corrupt cursor
  const resGarbage = await f.service.query({
    protocolVersion: 2,
    query: 'ranking.list',
    requestId: 'req-garbage',
    sessionId: 'sess-none',
    sessionEpoch: 1,
    payload: { scope: 'all', cursor: 'not-a-valid-cursor', pageRequest: 1 },
  });
  assert.ok('error' in resGarbage);
  assert.equal(resGarbage.error.code, 'INVALID_ARGUMENT');
});

test('ST20-01 AC20-6: query is strictly read-only and causes zero state mutations', async () => {
  const f = await createFixture();

  await f.putRankingEntry({ characterId: 'char-ro-1', score: '4000', scoreReachedAt: 1234 });
  await f.putRankingEntry({ characterId: 'char-ro-2', score: '3000', scoreReachedAt: 5678 });

  // Take store snapshot before querying
  const snapshotBefore = f.store.snapshot();

  // Perform query
  const res = await f.service.query({
    protocolVersion: 2,
    query: 'ranking.list',
    requestId: 'req-ro',
    sessionId: 'sess-none',
    sessionEpoch: 1,
    payload: { scope: 'all', cursor: null, pageRequest: 20 },
  });
  assert.ok('data' in res);

  // Take store snapshot after querying
  const snapshotAfter = f.store.snapshot();

  // Assert store has exact same number of keys and exact same contents
  assert.equal(snapshotBefore.size, snapshotAfter.size);
  for (const [k, v] of snapshotBefore.entries()) {
    assert.deepEqual(v, snapshotAfter.get(k));
  }

  // Specifically check scoreReachedAt and equipmentVersion
  const entryKey = await characterKey('rankingEntry', ['char-ro-1']);
  const entry = f.store.inspect(entryKey);
  assert.equal(entry.scoreReachedAt, 1234);
  assert.equal(entry.score, '4000');
});

test('ST20-01: authenticated session resolves ownRank; unauthenticated returns null', async () => {
  const f = await createFixture();

  await f.putRankingEntry({ characterId: 'char-top', score: '5000' });
  await f.putRankingEntry({ characterId: 'char-me', score: '3500' });
  await f.putRankingEntry({ characterId: 'char-bottom', score: '1000' });

  // Setup active session for 'char-me'
  await f.setupActiveSession('acc-me', 'char-me', 'sess-me', 1);

  // 1. Authenticated query
  const resAuth = await f.service.query({
    protocolVersion: 2,
    query: 'ranking.list',
    requestId: 'req-auth',
    sessionId: 'sess-me',
    sessionEpoch: 1,
    payload: { scope: 'all', cursor: null, pageRequest: 20 },
  });
  assert.ok('data' in resAuth);
  assert.equal(resAuth.data.ownRank, 2); // char-top (1), char-me (2), char-bottom (3)
  assert.equal(resAuth.data.stale, false);

  // 2. Unauthenticated query (unknown session)
  const resUnauth = await f.service.query({
    protocolVersion: 2,
    query: 'ranking.list',
    requestId: 'req-unauth',
    sessionId: 'sess-unknown',
    sessionEpoch: 1,
    payload: { scope: 'all', cursor: null, pageRequest: 20 },
  });
  assert.ok('data' in resUnauth);
  assert.equal(resUnauth.data.ownRank, null);
});

test('ST20-01: protocol schema and invalid query name handling', async () => {
  const f = await createFixture();

  // Unsupported query name
  await assert.rejects(
    async () => {
      await f.service.query({
        protocolVersion: 2,
        query: 'invalid.query',
        requestId: 'req-invalid',
        sessionId: 'sess-1',
        sessionEpoch: 1,
        payload: {},
      });
    },
    { name: 'TypeError', message: 'UNSUPPORTED_QUERY' },
  );

  // Invalid scope: rejected by protocol schema parser
  assert.throws(
    () => {
      parseAssetQuery({
        protocolVersion: 2,
        query: 'ranking.list',
        requestId: 'req-scope',
        sessionId: 'sess-1',
        sessionEpoch: 1,
        payload: { scope: 'invalid_scope', cursor: null, pageRequest: 20 },
      });
    },
    { name: 'TypeError' },
  );

  // pageRequest > 50: rejected by protocol schema parser
  assert.throws(
    () => {
      parseAssetQuery({
        protocolVersion: 2,
        query: 'ranking.list',
        requestId: 'req-pagesize',
        sessionId: 'sess-1',
        sessionEpoch: 1,
        payload: { scope: 'all', cursor: null, pageRequest: 100 },
      });
    },
    { name: 'TypeError' },
  );

  // pageRequest < 1: rejected by protocol schema parser
  assert.throws(
    () => {
      parseAssetQuery({
        protocolVersion: 2,
        query: 'ranking.list',
        requestId: 'req-pagesize-0',
        sessionId: 'sess-1',
        sessionEpoch: 1,
        payload: { scope: 'all', cursor: null, pageRequest: 0 },
      });
    },
    { name: 'TypeError' },
  );
});
