import test from 'node:test';
import assert from 'node:assert/strict';
import { allWornFixture, WEAR_SLOTS } from './fixtures/all-worn-repair-fixture.mjs';
import { REPAIR_TEST_CONFIG } from './fixtures/repair-fixture.mjs';
import { RepairService } from '../src/repair/repair-service.ts';
import { ChallengeService } from '../src/challenge/challenge-service.ts';
import { EquipmentService } from '../src/equipment/equipment-service.ts';
import { ShopService } from '../src/shop/shop-service.ts';
import { parseAssetQueryResponse, decodeAssetResponse } from '../../shared/src/protocol/asset-v2.ts';
import { parseEquipmentView } from '../../shared/src/protocol/asset-v2.ts';

function makeChallengeContent(f) {
  const townState = f.character().townState;
  return {
    schemaVersion: 1,
    releaseRef: 'repair-joint-release-v1',
    profile: 'local-test',
    purpose: 'contract-fixture-only',
    dungeons: [
      {
        dungeonId: 'first',
        kind: 'first',
        purpleTemplateRef: 'first-purple-test',
        mapId: townState.mapRef,
        anchor: { x: townState.position.x, y: townState.position.y, radius: 24 },
        minLevel: 1,
        maxMonsterLevel: 15,
        difficulties: [
          {
            difficultyId: 'normal',
            roomCost: 1,
            levels: {
              1: {
                monsterStatsRef: 'first-normal-l1',
                equipmentSourceRef: 'first-normal-drops-v1',
              },
            },
          },
        ],
      },
    ],
  };
}

function meter(f, traces) {
  return {
    run: fn => f.store.run(async tx => {
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

async function orderedRace(f, first, second) {
  let arrivals = 0;
  let enteredFirst, enteredBoth, releaseFirst, releaseSecond;
  const firstReady = new Promise(r => enteredFirst = r);
  const bothReady = new Promise(r => enteredBoth = r);
  const gate1 = new Promise(r => releaseFirst = r);
  const gate2 = new Promise(r => releaseSecond = r);

  f.store.beforeCommit = async attempt => {
    if (attempt !== 0) return;
    const index = arrivals++;
    if (index === 0) enteredFirst();
    if (arrivals === 2) enteredBoth();
    await (index === 0 ? gate1 : gate2);
  };

  const a = first();
  await firstReady;
  const b = second();
  await bothReady;
  releaseFirst();
  const ar = await a;
  releaseSecond();
  const br = await b;
  f.store.beforeCommit = undefined;
  assert.ok(f.store.conflicts >= 1);
  return [ar, br];
}

test('ST17-05 AC1-4, AC8: End-to-end full loop: Combat wear to zero -> gate blocked -> Linus all-worn repair -> re-entry succeeded', async () => {
  const f = await allWornFixture();
  const content = makeChallengeContent(f);
  const catalog = {
    'equipment:warrior-sword-white-v1': {
      templateId: 'equipment:warrior-sword-white-v1',
      name: 'Starter sword',
      slotKind: 'weapon',
      itemLevel: 10,
      quality: 'white',
      allowedClasses: ['warrior'],
    },
  };
  const challengeService = new ChallengeService({
    store: f.store,
    clock: f.clock,
    identity: f.identity,
    content,
    catalog,
  });

  // 1. Initial State: Weapon is broken (durability 0), others have durability 30/60
  const weaponId = f.character().equipped.weapon;
  assert.equal(f.store.inspect(weaponId).durability.current, 0);

  // 2. Entrance Gatekeeper Check in Town:
  const entryQuery = await challengeService.query({
    ...f.auth,
    query: 'dungeon.entry',
    requestId: 'gatekeeper-check-1',
    payload: {
      characterId: f.characterId,
      rolePlayEpoch: f.character().rolePlayEpoch,
      dungeonId: 'first',
    },
  });
  assert.equal(entryQuery.data.options[0].canEnter, false, 'Entrance gatekeeper must block 0 durability weapon');
  assert.equal(entryQuery.data.options[0].reason, 'WEAPON_BROKEN');

  // Attempt direct entry -> rejected with WEAPON_BROKEN
  const directStartCmd = {
    ...f.auth,
    command: 'challenge.start',
    operationId: 'direct-start-blocked',
    expected: entryQuery.versions,
    payload: {
      characterId: f.characterId,
      rolePlayEpoch: f.character().rolePlayEpoch,
      dungeonId: 'first',
      difficultyId: 'normal',
      entryContext: entryQuery.data.entryContext,
    },
  };
  const directStartRes = await challengeService.execute(directStartCmd);
  assert.equal(directStartRes.outcome.status, 'rejected');
  assert.equal(directStartRes.outcome.code, 'WEAPON_BROKEN');

  // 3. Visit Linus Blacksmith in Town and Quote Repair:
  const quote = await f.quoteAll();
  assert.ok(!quote.error);
  assert.equal(quote.data.repair.items.length, 7, 'Exact 7 worn wear-enabled items quoted');
  assert.equal(quote.data.costs[0].amount, '240', 'Exact 240 gold cost for 240 total missing durability');

  const beforeWallet = f.wallet();
  assert.equal(beforeWallet.gold, '1000');

  // 4. Execute Batch Repair:
  const repairRes = await f.service.execute(f.allCommand(quote));
  assert.equal(repairRes.outcome.status, 'committed');
  assert.equal(repairRes.outcome.data.chargedGold, '240');
  assert.equal(f.wallet().gold, '760', 'Gold deducted accurately');

  // Verify all 7 wear items are repaired to 60/60
  for (const slot of WEAR_SLOTS) {
    const item = f.store.inspect(f.character().equipped[slot]);
    assert.equal(item.durability.current, 60, `Slot ${slot} must be fully repaired to 60`);
  }
  // Verify non-wear items remain unaffected
  for (const slot of ['bracelet', 'necklace', 'ring', 'subEquip', 'magicStone', 'trinket']) {
    const item = f.store.inspect(f.character().equipped[slot]);
    assert.equal(item.durability.current, null, `Non-wear slot ${slot} durability must remain null`);
  }

  // 5. Re-check Entrance Gatekeeper in Town:
  const secondEntry = await challengeService.query({
    ...f.auth,
    query: 'dungeon.entry',
    requestId: 'gatekeeper-check-2',
    payload: {
      characterId: f.characterId,
      rolePlayEpoch: f.character().rolePlayEpoch,
      dungeonId: 'first',
    },
  });
  assert.equal(secondEntry.data.options[0].canEnter, true, 'Gatekeeper must allow entry after weapon is repaired');
  assert.equal(secondEntry.data.options[0].reason, null);

  // 6. Enter Challenge Successfully:
  const startCmd = {
    ...f.auth,
    command: 'challenge.start',
    operationId: 'start-after-repair',
    expected: secondEntry.versions,
    payload: {
      characterId: f.characterId,
      rolePlayEpoch: f.character().rolePlayEpoch,
      dungeonId: 'first',
      difficultyId: 'normal',
      entryContext: secondEntry.data.entryContext,
    },
  };
  const startRes = await challengeService.execute(startCmd);
  assert.equal(startRes.outcome.status, 'committed', JSON.stringify(startRes));
  assert.ok(startRes.outcome.data.challengeId);
  assert.equal(f.account().activeChallengeId, startRes.outcome.data.challengeId);
  assert.equal(f.character().location.kind, 'challenge');

  // 7. Verify Idempotent Replay of Entrance:
  const replayStart = await challengeService.execute(startCmd);
  assert.equal(replayStart.replayed, true);
  assert.deepEqual(replayStart.outcome, startRes.outcome);
});

test('ST17-05 AC5, AC8: Physical Transaction Budget: maximum 7 wear slots, 100-slot bag, wallet, journals and public UTF-8 size bounds', async () => {
  const f = await allWornFixture();
  const wide = prefix => prefix + '界'.repeat(128 - prefix.length);

  // Configure maximum UTF-8 expansion with 16 affixes and maximum string sizes
  await f.store.run(async tx => {
    const c = await tx.get(f.characterId);
    for (const slot of WEAR_SLOTS) {
      const old = await tx.get(c.equipped[slot]);
      const id = wide(slot);
      c.equipped[slot] = id;
      tx.set(id, {
        ...old,
        id,
        templateRef: { id: wide('template'), version: 1 },
        sourceKey: wide('source'),
        sourceLocator: { kind: 'roomDrop', roomId: wide('room'), dropId: wide('drop') },
        setRef: { id: wide('set'), version: 1 },
        durability: { ...old.durability, policyRef: wide('policy') },
        rolledAffixes: Array.from({ length: 16 }, (_, n) => ({
          stat: wide('stat' + n),
          value: Number.MAX_SAFE_INTEGER,
        })),
      });
    }
    tx.set(c.id, { ...c, version: c.version + 1 });
  });

  // Query View Budget:
  const request = {
    ...f.auth,
    query: 'repair.get',
    requestId: 'maximum-all-view-st17-05',
    payload: { characterId: f.characterId, contextId: f.contextId, target: { kind: 'allWorn' } },
  };
  const view = await f.service.query(request);
  assert.ok(!view.error);
  assert.equal(view.data.items.length, 7);
  const viewBytes = new TextEncoder().encode(JSON.stringify(view)).length;
  assert.ok(viewBytes > 65536, 'UTF-8 expansion exceeds 64 KiB');
  assert.ok(viewBytes <= 131072, 'UTF-8 expansion remains within 128 KiB limit');

  // Execution Budget Measurement:
  const traces = [];
  const meteredService = new RepairService({
    store: meter(f, traces),
    clock: f.clock,
    identity: f.identity,
    config: REPAIR_TEST_CONFIG,
  });

  const quote = await f.quoteAll();
  assert.ok(!quote.error);
  const execResult = await meteredService.execute(f.allCommand(quote));
  assert.equal(execResult.outcome.status, 'committed');

  const trace = traces[0];
  assert.ok(trace.R <= 21, `Unique reads ${trace.R} must be <= 21`);
  assert.equal(trace.W, 12, 'Unique writes must be exactly 12');
  assert.ok(trace.calls <= 33, `Total calls ${trace.calls} must be <= 33`);
  assert.ok(trace.maxWrite <= 131072, 'Max single write must be <= 128 KiB');
  assert.ok(trace.bytes <= 262144, 'Total write bytes must be <= 256 KiB');
  assert.ok(!trace.writeKeys.some(k => k.includes('ranking')), 'Repair must never update score or rankings');

  console.log('ST17-05 all-worn measured physical budget:', JSON.stringify({
    reads: trace.R,
    writes: trace.W,
    calls: trace.calls,
    totalWriteBytes: trace.bytes,
    maxWrite: trace.maxWrite,
    viewBytes,
  }));
});

test('ST17-05 AC6, AC8: Atomic fault injection rollback across all write points and idempotent lost response recovery', async () => {
  const f = await allWornFixture();
  const quote = await f.quoteAll();
  const command = f.allCommand(quote);

  // Meter write set calls count
  const traces = [];
  const meteredService = new RepairService({
    store: meter(f, traces),
    clock: f.clock,
    identity: f.identity,
    config: REPAIR_TEST_CONFIG,
  });
  const dryRes = await meteredService.execute(command);
  assert.equal(dryRes.outcome.status, 'committed');
  const totalSets = traces[0].setCalls;
  assert.equal(totalSets, 12, 'allWorn repair requires exactly 12 writes');

  // Replay idempotency:
  const beforeReplay = f.store.snapshot();
  const replayRes = await f.service.execute(command);
  assert.equal(replayRes.replayed, true);
  assert.equal(replayRes.outcome.data.chargedGold, '240');
  assert.deepEqual(f.store.snapshot(), beforeReplay, 'Replay must make zero database modifications');

  // Fault injection across all 12 write points:
  for (let point = 1; point <= totalSets; point++) {
    const h = await allWornFixture();
    const hQuote = await h.quoteAll();
    const hCmd = h.allCommand(hQuote);
    const snapshotBefore = h.store.snapshot();

    h.store.injectWriteFailure(point);
    const failedRes = await h.service.execute(hCmd);
    assert.equal(failedRes.outcome.code, 'SERVICE_UNAVAILABLE', `Write point ${point} must fail with SERVICE_UNAVAILABLE`);
    assert.deepEqual(h.store.snapshot(), snapshotBefore, `Store snapshot must be perfectly restored after fault at point ${point}`);
    assert.equal(h.wallet().gold, '1000', `Gold must not be deducted on rollback at point ${point}`);

    // Retry after fault recovery:
    const recoveredRes = await h.service.execute(hCmd);
    assert.equal(recoveredRes.outcome.status, 'committed');
    assert.equal(h.wallet().gold, '760');
  }

  // Single repair fault injection (5 write points):
  const singleFixture = await allWornFixture();
  const singleQuote = await singleFixture.quote(singleFixture.weaponId);
  const singleCmd = singleFixture.command(singleQuote);
  for (let pt = 1; pt <= 5; pt++) {
    const sH = await allWornFixture();
    const sQuote = await sH.quote(sH.weaponId);
    const sCmd = sH.command(sQuote);
    const snap = sH.store.snapshot();

    sH.store.injectWriteFailure(pt);
    const failRes = await sH.service.execute(sCmd);
    assert.equal(failRes.outcome.code, 'SERVICE_UNAVAILABLE');
    assert.deepEqual(sH.store.snapshot(), snap);
  }
});

test('ST17-05 AC6, AC7: Concurrency & OCC conflict serialization between repair and equipment swap/shop sell', async () => {
  // Scenario 1: Repair vs Equipment Replacement (Equip new weapon into slot while quoting old)
  for (const allFirst of [true, false]) {
    const f = await allWornFixture();
    const all = f.allCommand(await f.quoteAll());
    const equip = {
      ...f.auth,
      command: 'equipment.equip',
      operationId: 'race-equip-' + allFirst,
      expected: [
        { kind: 'character', id: f.characterId, version: f.character().version },
        { kind: 'container', id: f.bag().id, version: f.bag().version },
      ],
      payload: { characterId: f.characterId, itemId: 'all-worn-bag', targetSlot: 'weapon' },
    };

    const actions = [() => f.service.execute(all), () => f.equipment.execute(equip)];
    if (!allFirst) actions.reverse();

    const [first, second] = await orderedRace(f, ...actions);
    assert.equal(first.outcome.status, 'committed');
    assert.equal(second.outcome.code, 'VERSION_CONFLICT', 'Second racer must encounter VERSION_CONFLICT');
    assert.equal(f.wallet().gold, allFirst ? '760' : '1000');
    assert.equal(f.character().equipped.weapon, allFirst ? f.weaponId : 'all-worn-bag');
  }

  // Scenario 2: Repair vs Shop Sell (Shared Wallet Contention)
  for (const allFirst of [true, false]) {
    const f = await allWornFixture();
    const shopContext = await f.open('shop', 'shop');
    const repairContext = await f.open();
    const all = f.allCommand(await f.quoteAll(repairContext), repairContext);
    const sell = {
      ...f.auth,
      command: 'shop.sell',
      operationId: 'race-sell-' + allFirst,
      expected: [
        { kind: 'character', id: f.characterId, version: f.character().version },
        { kind: 'container', id: f.bag().id, version: f.bag().version },
        { kind: 'wallet', id: f.wallet().id, version: f.wallet().version },
      ],
      payload: {
        characterId: f.characterId,
        contextId: shopContext,
        target: { kind: 'equipment', itemId: 'all-worn-bag' },
        quantity: 1,
        quoteRef: f.shop.catalog.quoteRef,
      },
    };

    const actions = [() => f.service.execute(all), () => f.shop.execute(sell)];
    if (!allFirst) actions.reverse();

    const [first, second] = await orderedRace(f, ...actions);
    assert.equal(first.outcome.status, 'committed');
    assert.equal(second.outcome.code, 'VERSION_CONFLICT');
    assert.equal(f.wallet().gold, allFirst ? '760' : '1100');
    assert.equal(f.store.inspect('all-worn-bag').lifecycle, allFirst ? 'active' : 'sold');
  }
});
