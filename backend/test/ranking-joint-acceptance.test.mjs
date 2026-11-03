import test from 'node:test';
import assert from 'node:assert/strict';
import { enhancementFixture } from './fixtures/enhancement-fixture.mjs';
import { RankingService } from '../src/ranking/ranking-service.ts';
import { EquipmentService } from '../src/equipment/equipment-service.ts';
import { RankingCoordinator } from '../../client/assets/scripts/net/RankingCoordinator.ts';
import { characterKey } from '../src/character/character-service.ts';
import { rankCacheKey } from '../src/ranking/ranking-model.ts';
import { parseAssetQueryResponse } from '../../shared/src/protocol/asset-v2.ts';

function meter(store, traces) {
  return {
    run: fn => store.run(async tx => {
      const reads = new Set();
      const writes = [];
      let calls = 0;
      const result = await fn({
        get: async id => {
          calls++;
          reads.add(id);
          return tx.get(id);
        },
        set: (id, value) => {
          calls++;
          writes.push({ id, bytes: new TextEncoder().encode(JSON.stringify(value)).length });
          tx.set(id, value);
        },
      });
      traces.push({
        R: reads.size,
        W: new Set(writes.map(w => w.id)).size,
        calls,
        setCalls: writes.length,
        bytes: writes.reduce((n, w) => n + w.bytes, 0),
        maxWrite: Math.max(0, ...writes.map(w => w.bytes)),
        responseBytes: new TextEncoder().encode(JSON.stringify(result)).length,
        writeKeys: writes.map(w => w.id),
      });
      return result;
    }),
  };
}

test('ST20 Joint Loop: Real Enhance (ST18) & Equip/Unequip (ST05) -> Real-time Score & Triad Rank Updates -> Client Reflection', async () => {
  let mockNow = 1000;
  const f = await enhancementFixture({
    random: { sample: async () => 100000 }, // Always succeed enhancement
  });
  f.clock.now = () => mockNow;
  await f.fund('100000');

  // Seed initial character score and RankingEntryEntity (representing ST05 wearing starter sword)
  const initialWeaponScore = 2040;
  const rankingKey = await characterKey('rankingEntry', [f.characterId]);
  await f.store.run(async tx => {
    const char = await tx.get(f.characterId);
    tx.set(char.id, {
      ...char,
      score: initialWeaponScore,
      scoreReachedAt: 1000,
      scoreConfigRef: 'score-v1',
    });
    tx.set(rankingKey, {
      schemaVersion: 2,
      id: rankingKey,
      characterId: f.characterId,
      accountId: f.account().id,
      classId: 'warrior',
      characterName: char.characterName,
      level: char.level,
      score: String(initialWeaponScore),
      scoreConfigRef: 'score-v1',
      equipmentVersion: 1,
      scoreReachedAt: 1000,
      projectionVersion: 1,
      updatedAt: 1000,
    });
  });

  // Seed Competitor 1: Hunter with score 2500, reachedAt 1000
  const hunterKey = await characterKey('rankingEntry', ['char-competitor-hunter']);
  await f.store.run(async tx => {
    tx.set(hunterKey, {
      schemaVersion: 2,
      id: hunterKey,
      characterId: 'char-competitor-hunter',
      accountId: 'acc-competitor-hunter',
      classId: 'hunter',
      characterName: '神箭手',
      level: 30,
      score: '2500',
      scoreConfigRef: 'score-v1',
      equipmentVersion: 1,
      scoreReachedAt: 1000,
      projectionVersion: 1,
      updatedAt: 1000,
    });
  });

  // Seed Competitor 2: Warrior Rival with score 2200, reachedAt 1050
  const rivalKey = await characterKey('rankingEntry', ['char-warrior-rival']);
  await f.store.run(async tx => {
    tx.set(rivalKey, {
      schemaVersion: 2,
      id: rivalKey,
      characterId: 'char-warrior-rival',
      accountId: 'acc-warrior-rival',
      classId: 'warrior',
      characterName: '重剑士',
      level: 25,
      score: '2200',
      scoreConfigRef: 'score-v1',
      equipmentVersion: 1,
      scoreReachedAt: 1050,
      projectionVersion: 1,
      updatedAt: 1050,
    });
  });

  const rankingService = new RankingService({
    store: f.store,
    clock: f.clock,
    secret: 'ranking-joint-secret-32-bytes-ok!',
    scoreConfigRef: 'score-v1',
  });

  const coordinator = new RankingCoordinator(async query => rankingService.query(query));
  const identity = {
    sessionId: f.auth.sessionId,
    sessionEpoch: f.auth.sessionEpoch,
    characterId: f.characterId,
  };

  // Step 1: Initial query across scopes
  // Scope: 'all' -> Hunter (2500, #1), Rival (2200, #2), Warrior (2040, #3)
  await coordinator.open(identity, 'all');
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.entries.length, 3);
  assert.deepEqual(coordinator.state.entries.map(e => e.characterName), ['神箭手', '重剑士', '银行']);
  assert.deepEqual(coordinator.state.entries.map(e => e.rank), [1, 2, 3]);
  assert.equal(coordinator.state.ownRank, 3);

  // Scope: 'warrior' -> Rival (2200, #1), Warrior (2040, #2)
  await coordinator.switchScope('warrior');
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.entries.length, 2);
  assert.deepEqual(coordinator.state.entries.map(e => e.characterName), ['重剑士', '银行']);
  assert.deepEqual(coordinator.state.entries.map(e => e.rank), [1, 2]);
  assert.equal(coordinator.state.ownRank, 2);

  // Scope: 'hunter' -> Hunter (2500, #1), Warrior ownRank is null
  await coordinator.switchScope('hunter');
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.entries.length, 1);
  assert.equal(coordinator.state.entries[0].characterName, '神箭手');
  assert.equal(coordinator.state.ownRank, null);

  // Switch back to 'all'
  await coordinator.switchScope('all');
  assert.equal(coordinator.state.ownRank, 3);

  // Step 2: Real Enhancement (ST18) +1 to +10
  for (let lvl = 1; lvl <= 10; lvl++) {
    const q = await f.quote(f.weaponId, lvl);
    assert.ok(!q.error, `Quote failed for level ${lvl}`);
    const cmd = {
      ...f.auth,
      command: 'equipment.enhance',
      operationId: `enhance-op-${lvl}`,
      expected: q.data.targetVersions,
      payload: {
        characterId: f.characterId,
        contextId: f.contextId,
        itemId: f.weaponId,
        targetLevel: lvl,
        useMemento: false,
        quoteRef: q.data.quoteRef,
      },
    };
    const r = await f.service.execute(cmd);
    assert.equal(r.outcome.status, 'committed');
  }

  // Weapon is now +10, character score has increased from 2040 to 3040
  assert.equal(f.character().score, 3040);
  const updatedRankingDoc = f.store.inspect(rankingKey);
  assert.equal(updatedRankingDoc.score, '3040');

  // Step 3: Immediate Ranking Query (Cache Freshness Window <= 15s)
  // Mock clock has not moved past 15s TTL, so cache is fresh
  // BUT Warrior's ownRank is computed in real-time from the updated score 3040!
  await coordinator.refresh();
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.stale, false);
  // Warrior score 3040 > 2500 Hunter & 2200 Rival -> C1 = 0, C2 = 0, C3 = 0 => ownRank = 1!
  assert.equal(coordinator.state.ownRank, 1);

  // Step 4: Cache TTL Expiration & Full List Update (> 15s)
  // Advance clock by 16s so fresh TTL (15s) expires and cache refresh occurs
  mockNow += 16000;
  await coordinator.refresh();
  assert.equal(coordinator.state.status, 'ready');
  assert.equal(coordinator.state.entries[0].characterId, f.characterId);
  assert.equal(coordinator.state.entries[0].rank, 1);
  assert.equal(coordinator.state.entries[0].score, '3040');
  assert.equal(coordinator.state.entries[1].characterName, '神箭手');
  assert.equal(coordinator.state.entries[1].rank, 2);
  assert.equal(coordinator.state.entries[2].characterName, '重剑士');
  assert.equal(coordinator.state.entries[2].rank, 3);
  assert.equal(coordinator.state.ownRank, 1);

  // Step 5: Real Equipment Unequip (ST05)
  const equipService = new EquipmentService({
    store: f.store,
    clock: f.clock,
    identity: f.identity,
    catalog: {
      'equipment:warrior-sword-white-v1': {
        templateId: 'equipment:warrior-sword-white-v1',
        name: 'Starter Sword',
        slotKind: 'weapon',
        itemLevel: 10,
        quality: 'white',
        allowedClasses: ['warrior'],
        affixMaxValues: { attackPower: 100 },
      },
    },
  });

  const unequip = await equipService.execute({
    ...f.auth,
    command: 'equipment.unequip',
    operationId: 'joint-unequip-weapon',
    expected: [
      { kind: 'character', id: f.characterId, version: f.character().version },
      { kind: 'container', id: f.bag().id, version: f.bag().version },
      { kind: 'equipment', id: f.weaponId, version: f.store.inspect(f.weaponId).version },
    ],
    payload: { characterId: f.characterId, itemId: f.weaponId, slot: 'weapon' },
  });
  assert.equal(unequip.outcome.status, 'committed');
  assert.equal(f.character().score, 0);
  assert.equal(f.store.inspect(rankingKey).score, '0');

  // Immediate query after unequip: Warrior's ownRank drops immediately to 3!
  await coordinator.refresh();
  assert.equal(coordinator.state.ownRank, 3);

  // Advance clock by 16s so cache refreshes:
  mockNow += 16000;
  await coordinator.refresh();
  assert.equal(coordinator.state.entries[0].characterName, '神箭手');
  assert.equal(coordinator.state.entries[0].rank, 1);
  assert.equal(coordinator.state.entries[1].characterName, '重剑士');
  assert.equal(coordinator.state.entries[1].rank, 2);
  assert.equal(coordinator.state.entries[2].characterId, f.characterId);
  assert.equal(coordinator.state.entries[2].rank, 3);
  assert.equal(coordinator.state.entries[2].score, '0');

  // Step 6: Real Equipment Re-equip & Triad Tie-Breaking (AC20-1)
  mockNow += 5000;
  const tReequip = mockNow;
  const reequip = await equipService.execute({
    ...f.auth,
    command: 'equipment.equip',
    operationId: 'joint-reequip-weapon',
    expected: [
      { kind: 'character', id: f.characterId, version: f.character().version },
      { kind: 'container', id: f.bag().id, version: f.bag().version },
      { kind: 'equipment', id: f.weaponId, version: f.store.inspect(f.weaponId).version },
    ],
    payload: { characterId: f.characterId, itemId: f.weaponId, targetSlot: 'weapon' },
  });
  assert.equal(reequip.outcome.status, 'committed');
  assert.equal(f.character().score, 3040);
  assert.equal(f.character().scoreReachedAt, tReequip);

  // Seed Competitor 3: Veteran Warrior with exact same score (3040), but reached at tReequip - 1000
  const veteranKey = await characterKey('rankingEntry', ['char-warrior-veteran']);
  await f.store.run(async tx => {
    tx.set(veteranKey, {
      schemaVersion: 2,
      id: veteranKey,
      characterId: 'char-warrior-veteran',
      accountId: 'acc-warrior-veteran',
      classId: 'warrior',
      characterName: '老练战士',
      level: 30,
      score: '3040',
      scoreConfigRef: 'score-v1',
      equipmentVersion: 1,
      scoreReachedAt: tReequip - 1000,
      projectionVersion: 1,
      updatedAt: tReequip - 1000,
    });
  });

  // Query in 'warrior' scope:
  // Both have score 3040, but Veteran reached earlier (tReequip - 1000 < tReequip)
  // Triad sort (score DESC, scoreReachedAt ASC, characterId ASC) ranks Veteran #1, Warrior #2!
  mockNow += 16000;
  await coordinator.switchScope('warrior');
  assert.equal(coordinator.state.entries.length, 3);
  assert.equal(coordinator.state.entries[0].characterName, '老练战士');
  assert.equal(coordinator.state.entries[0].rank, 1);
  assert.equal(coordinator.state.entries[0].score, '3040');
  assert.equal(coordinator.state.entries[1].characterId, f.characterId);
  assert.equal(coordinator.state.entries[1].rank, 2);
  assert.equal(coordinator.state.entries[1].score, '3040');
  assert.equal(coordinator.state.entries[2].characterName, '重剑士');
  assert.equal(coordinator.state.entries[2].rank, 3);
  assert.equal(coordinator.state.ownRank, 2);
});

test('ST20 Physical Budgets: Document Size, Wire Transmission and Read/Write Limits', async () => {
  let mockNow = 2000;
  const f = await enhancementFixture();
  f.clock.now = () => mockNow;

  // Seed 50 ranking entries (full page) into store
  const entriesCount = 50;
  await f.store.run(async tx => {
    for (let i = 1; i <= entriesCount; i++) {
      const charId = `budget-char-${String(i).padStart(3, '0')}`;
      const rKey = await characterKey('rankingEntry', [charId]);
      tx.set(rKey, {
        schemaVersion: 2,
        id: rKey,
        characterId: charId,
        accountId: `acc-${charId}`,
        classId: i % 2 === 0 ? 'warrior' : 'hunter',
        characterName: `玩家${i}号`,
        level: (i % 30) + 1, // legal 1..30
        score: String(5000 - i * 10),
        scoreConfigRef: 'score-v1',
        equipmentVersion: 1,
        scoreReachedAt: 1000 + i * 10,
        projectionVersion: 1,
        updatedAt: 1000 + i * 10,
      });
    }
  });

  const rankingService = new RankingService({
    store: f.store,
    clock: f.clock,
    secret: 'budget-secret-32-bytes-ok-ok-ok!!',
    scoreConfigRef: 'score-v1',
  });

  // Query 50 entries to populate cache
  const firstPageResponse = await rankingService.query({
    protocolVersion: 2,
    sessionId: f.auth.sessionId,
    sessionEpoch: f.auth.sessionEpoch,
    requestId: 'budget-q-1',
    query: 'ranking.list',
    payload: { scope: 'all', cursor: null, pageRequest: 50 },
  });

  assert.equal('data' in firstPageResponse, true);
  if (!('data' in firstPageResponse)) throw new Error('Query failed');
  assert.equal(firstPageResponse.data.entries.length, 50);

  // 1. Measure physical document size of rankCaches entity
  const cacheKey = await rankCacheKey('all', 'score-v1');
  const cacheEntity = f.store.inspect(cacheKey);
  assert.ok(cacheEntity != null, 'Cache entity must exist');
  const cacheJson = JSON.stringify(cacheEntity);
  const cacheBytes = new TextEncoder().encode(cacheJson).length;

  // Hard contract: rankCaches document <= 16 KiB (16384 bytes)
  assert.ok(cacheBytes <= 16384, `Cache document bytes (${cacheBytes}) exceeds 16 KiB limit`);
  assert.ok(cacheBytes > 3000, `Cache document bytes (${cacheBytes}) suspiciously small`);

  // 2. Measure physical document size of RankingEntryEntity
  const singleEntryKey = await characterKey('rankingEntry', ['budget-char-001']);
  const singleEntry = f.store.inspect(singleEntryKey);
  const singleEntryBytes = new TextEncoder().encode(JSON.stringify(singleEntry)).length;
  // Hard contract: RankingEntryEntity document <= 16 KiB (typically ~350 bytes)
  assert.ok(singleEntryBytes <= 16384, `Ranking entry bytes (${singleEntryBytes}) exceeds 16 KiB limit`);
  assert.ok(singleEntryBytes < 1024, `Ranking entry bytes (${singleEntryBytes}) expected < 1 KiB`);

  // 3. Measure single page response wire transmission budget
  const responseJson = JSON.stringify(firstPageResponse);
  const responseWireBytes = new TextEncoder().encode(responseJson).length;
  // Hard contract: response <= 64 KiB (65536 bytes) per assetQueryMaxBytes('ranking.list')
  assert.ok(responseWireBytes <= 65536, `Response wire bytes (${responseWireBytes}) exceeds 64 KiB limit`);
  assert.ok(responseWireBytes > 3000, `Response wire bytes (${responseWireBytes}) suspiciously small`);

  console.log(`[ST20 Budget Measurement] rankCaches doc: ${cacheBytes} B (<= 16384 B) | rankingEntry doc: ${singleEntryBytes} B (<= 16384 B) | wire response: ${responseWireBytes} B (<= 65536 B)`);

  // 4. Measure transaction read/write call counts via meter
  const traces = [];
  const metered = meter(f.store, traces);
  const meteredService = new RankingService({
    store: metered,
    clock: f.clock,
    secret: 'budget-secret-32-bytes-ok-ok-ok!!',
    scoreConfigRef: 'score-v1',
  });

  // A. Cache Hit (age 0s <= 15s)
  traces.length = 0;
  const hitRes = await meteredService.query({
    protocolVersion: 2,
    sessionId: f.auth.sessionId,
    sessionEpoch: f.auth.sessionEpoch,
    requestId: 'budget-q-hit',
    query: 'ranking.list',
    payload: { scope: 'all', cursor: null, pageRequest: 20 },
  });
  assert.equal('data' in hitRes, true);
  assert.equal(traces.length, 1);
  const hitTrace = traces[0];
  // On cache hit, ZERO store writes!
  assert.equal(hitTrace.W, 0, 'Cache hit must perform 0 writes');
  assert.equal(hitTrace.setCalls, 0, 'Cache hit must have 0 set calls');
  // Minimal reads: cacheKey + session + account + character
  assert.ok(hitTrace.R <= 5, `Cache hit read count ${hitTrace.R} must be <= 5`);

  // B. Cache Refresh (> 15s)
  mockNow += 20000; // Stale after 20s
  traces.length = 0;
  const refreshRes = await meteredService.query({
    protocolVersion: 2,
    sessionId: f.auth.sessionId,
    sessionEpoch: f.auth.sessionEpoch,
    requestId: 'budget-q-refresh',
    query: 'ranking.list',
    payload: { scope: 'all', cursor: null, pageRequest: 20 },
  });
  assert.equal('data' in refreshRes, true);
  assert.equal(traces.length, 1);
  const refreshTrace = traces[0];
  // On cache refresh, exactly 1 unique key written (to rankCaches key)
  assert.equal(refreshTrace.W, 1, 'Cache refresh must only write to rankCaches');
  assert.equal(refreshTrace.setCalls, 2, 'Cache refresh has 2-phase lease acquisition and cache commit');
  assert.ok(refreshTrace.writeKeys.every(k => k === cacheKey), 'All writes must be to rankCaches');
  // Invariant: ZERO writes to character, equipment, bag, or assets
  assert.ok(!refreshTrace.writeKeys.some(k => k.includes('character') || k.includes('equipment') || k.includes('container')));
});

test('ST20 Concurrency: Stampede Protection, CAS Lease Takeover & Graceful Degradation', async () => {
  let mockNow = 5000;
  const f = await enhancementFixture();
  f.clock.now = () => mockNow;

  // Seed 10 entries
  await f.store.run(async tx => {
    for (let i = 1; i <= 10; i++) {
      const charId = `stampede-char-${i}`;
      const rKey = await characterKey('rankingEntry', [charId]);
      tx.set(rKey, {
        schemaVersion: 2,
        id: rKey,
        characterId: charId,
        accountId: `acc-${charId}`,
        classId: 'warrior',
        characterName: `战士${i}`,
        level: 20,
        score: String(3000 - i * 50),
        scoreConfigRef: 'score-v1',
        equipmentVersion: 1,
        scoreReachedAt: 1000 + i,
        projectionVersion: 1,
        updatedAt: 1000 + i,
      });
    }
  });

  const rankingService = new RankingService({
    store: f.store,
    clock: f.clock,
    secret: 'stampede-secret-32-bytes-ok-ok!!',
    scoreConfigRef: 'score-v1',
  });

  // Initial prime query at t = 5000
  await rankingService.query({
    protocolVersion: 2,
    sessionId: f.auth.sessionId,
    sessionEpoch: f.auth.sessionEpoch,
    requestId: 'prime-q',
    query: 'ranking.list',
    payload: { scope: 'all', cursor: null, pageRequest: 10 },
  });

  // Advance time to 25s later: cache is stale (age 25s, between 15s fresh TTL and 60s max stale)
  mockNow += 25000;

  // 1. Anti-stampede test: Worker A holds the 3s active lease
  const cacheKey = await rankCacheKey('all', 'score-v1');
  await f.store.run(async tx => {
    const existing = await tx.get(cacheKey);
    existing.lease = { token: 'worker-a-active-lease', expiresAt: mockNow + 3000 };
    tx.set(cacheKey, existing);
  });

  // 10 concurrent requests arrive while lease is active
  // All 10 requests safely receive the cached stale data with stale: true without hammering backend
  const concurrentQueries = Array.from({ length: 10 }, (_, idx) =>
    rankingService.query({
      protocolVersion: 2,
      sessionId: f.auth.sessionId,
      sessionEpoch: f.auth.sessionEpoch,
      requestId: `stampede-concurrent-${idx}`,
      query: 'ranking.list',
      payload: { scope: 'all', cursor: null, pageRequest: 10 },
    }),
  );

  const results = await Promise.all(concurrentQueries);
  assert.equal(results.every(r => 'data' in r), true);

  const dataList = results.map(r => r.data);
  const staleCount = dataList.filter(d => d.stale).length;
  assert.equal(staleCount, 10, 'All 10 concurrent workers safely receive stale cache while lease is active');

  // 2. Lease timeout takeover test:
  // Advance time by 4 seconds (past 3s lease expiry)
  mockNow += 4000;
  // Stale age is now 29s <= 60s, but lease has expired
  const takeoverRes = await rankingService.query({
    protocolVersion: 2,
    sessionId: f.auth.sessionId,
    sessionEpoch: f.auth.sessionEpoch,
    requestId: 'lease-takeover-q',
    query: 'ranking.list',
    payload: { scope: 'all', cursor: null, pageRequest: 10 },
  });
  assert.equal('data' in takeoverRes, true);
  // New worker successfully took over lease and refreshed cache
  assert.equal(takeoverRes.data.stale, false);

  // 3. Graceful capacity degradation:
  // When countCapacityLimit is exceeded, ownRank degrades to null without failing query
  const degradingService = new RankingService({
    store: f.store,
    clock: f.clock,
    secret: 'stampede-secret-32-bytes-ok-ok!!',
    scoreConfigRef: 'score-v1',
    countCapacityLimit: 5, // Limit 5, but there are 10 entries in store
  });

  const degradedRes = await degradingService.query({
    protocolVersion: 2,
    sessionId: f.auth.sessionId,
    sessionEpoch: f.auth.sessionEpoch,
    requestId: 'degrade-q',
    query: 'ranking.list',
    payload: { scope: 'all', cursor: null, pageRequest: 10 },
  });
  assert.equal('data' in degradedRes, true);
  const degradedData = degradedRes.data;
  assert.equal(degradedData.entries.length, 10);
  assert.equal(degradedData.ownRank, null, 'ownRank must gracefully degrade to null when limit exceeded');

  // 4. Cache write failure asset non-pollution (Fault Injection):
  // Wrap store to simulate storage failure specifically when saving rankCaches
  const failingStore = {
    ...f.store,
    run: async fn => f.store.run(async tx => {
      return await fn({
        get: id => tx.get(id),
        set: (id, value) => {
          if (id.includes('rankCache')) {
            throw new Error('STORE_UNAVAILABLE: simulated cache disk failure');
          }
          return tx.set(id, value);
        },
      });
    }),
  };

  const faultTolerantService = new RankingService({
    store: failingStore,
    clock: f.clock,
    secret: 'stampede-secret-32-bytes-ok-ok!!',
    scoreConfigRef: 'score-v1',
  });

  // Query should fall back to direct query and not crash
  const faultRes = await faultTolerantService.query({
    protocolVersion: 2,
    sessionId: f.auth.sessionId,
    sessionEpoch: f.auth.sessionEpoch,
    requestId: 'fault-q',
    query: 'ranking.list',
    payload: { scope: 'all', cursor: null, pageRequest: 10 },
  });
  assert.equal('data' in faultRes, true);
  assert.equal(faultRes.data.entries.length, 10);
});

test('ST20 OCC Safety: Concurrent Gear Modification and Ranking Query', async () => {
  let mockNow = 10000;
  const f = await enhancementFixture();
  f.clock.now = () => mockNow;

  const equipService = new EquipmentService({
    store: f.store,
    clock: f.clock,
    identity: f.identity,
    catalog: {
      'equipment:warrior-sword-white-v1': {
        templateId: 'equipment:warrior-sword-white-v1',
        name: 'Starter Sword',
        slotKind: 'weapon',
        itemLevel: 10,
        quality: 'white',
        allowedClasses: ['warrior'],
        affixMaxValues: { attackPower: 100 },
      },
    },
  });

  const rankingService = new RankingService({
    store: f.store,
    clock: f.clock,
    secret: 'occ-secret-32-bytes-ok-ok-ok-ok!!',
    scoreConfigRef: 'score-v1',
  });

  // Interleave ranking query and gear unequip
  const unequipPromise = equipService.execute({
    ...f.auth,
    command: 'equipment.unequip',
    operationId: 'occ-concurrent-unequip',
    expected: [
      { kind: 'character', id: f.characterId, version: f.character().version },
      { kind: 'container', id: f.bag().id, version: f.bag().version },
      { kind: 'equipment', id: f.weaponId, version: f.store.inspect(f.weaponId).version },
    ],
    payload: { characterId: f.characterId, itemId: f.weaponId, slot: 'weapon' },
  });

  const queryPromise = rankingService.query({
    protocolVersion: 2,
    sessionId: f.auth.sessionId,
    sessionEpoch: f.auth.sessionEpoch,
    requestId: 'occ-concurrent-query',
    query: 'ranking.list',
    payload: { scope: 'all', cursor: null, pageRequest: 10 },
  });

  const [unequipRes, queryRes] = await Promise.all([unequipPromise, queryPromise]);

  assert.equal(unequipRes.outcome.status, 'committed');
  assert.equal('data' in queryRes, true);

  // Subsequent query reflects the unequipped state consistently
  const postRes = await rankingService.query({
    protocolVersion: 2,
    sessionId: f.auth.sessionId,
    sessionEpoch: f.auth.sessionEpoch,
    requestId: 'occ-post-query',
    query: 'ranking.list',
    payload: { scope: 'all', cursor: null, pageRequest: 10 },
  });
  assert.equal('data' in postRes, true);
  assert.equal(f.character().score, 0);
});
