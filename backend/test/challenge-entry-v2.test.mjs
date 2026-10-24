import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankFixture } from './fixtures/bank-fixture.mjs';
import { ChallengeService } from '../src/challenge/challenge-service.ts';
async function fixture(options = {}) {
    const h = await createBankFixture();
    const content = { schemaVersion: 1, releaseRef: 'st10-entry-test-v1', profile: 'local-test', purpose: 'contract-fixture-only', dungeons: [{ dungeonId: 'first', kind: 'first', purpleTemplateRef:'first-purple-test', mapId: 'town-map-1', anchor: { x: 100, y: 100, radius: 24 }, minLevel: 1, maxMonsterLevel: 15, difficulties: [{ difficultyId: 'normal', roomCost: 1, levels: { 1: { monsterStatsRef: 'first-normal-l1', equipmentSourceRef: 'first-normal-drops-v1' } } }] }] };
    const service = new ChallengeService({ store: h.store, clock: h.clock, identity: h.identity, content, catalog:{'equipment:warrior-sword-white-v1':{templateId:'equipment:warrior-sword-white-v1',name:'Starter sword',slotKind:'weapon',itemLevel:10,quality:'white',allowedClasses:['warrior']}}, ...options });
    const entry = () => service.query({ ...h.auth, query: 'dungeon.entry', requestId: 'entry', payload: { characterId: h.characterId, rolePlayEpoch: h.character().rolePlayEpoch, dungeonId: 'first' } });
    return { ...h, service, entry, content };
}
test('real login, selected warrior and town position issue usable difficulty selection without creating a challenge', async () => {
    const h = await fixture();
    const r = await h.entry();
    assert.equal(r.data.options[0].canEnter, true);
    assert.equal(typeof r.data.entryContext, 'string');
    assert.equal(h.account().activeChallengeId, undefined);
    assert.equal(h.character().location.kind, 'town');
    assert.equal('roomCost' in r.data.options[0], false);
});
test('explicit confirmation atomically reserves one stamina without charging first room and replays original locked choice', async () => {
    const h = await fixture();
    await h.store.run(tx => tx.set(h.characterId, { ...h.character(), stamina: { value: 1, refillWindow: 2 } }));
    const entry = await h.entry();
    const command = { ...h.auth, command: 'challenge.start', operationId: 'start', expected: entry.versions, payload: { characterId: h.characterId, rolePlayEpoch: h.character().rolePlayEpoch, dungeonId: 'first', difficultyId: 'normal', entryContext: entry.data.entryContext } };
    const r = await h.service.execute(command);
    assert.equal(r.outcome.status, 'committed');
    assert.equal(r.outcome.data.staminaSnapshot, 1);
    assert.equal(r.outcome.data.playerLevel, 1);
    assert.equal(h.character().stamina.value, 1);
    assert.equal(h.character().location.challengeId, r.outcome.data.challengeId);
    assert.equal(h.account().activeChallengeId, r.outcome.data.challengeId);
    const replay = await h.service.execute(command);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.outcome, r.outcome);
});
async function startCommand(h, operationId = 'start') { const r = await h.entry(); return { ...h.auth, command: 'challenge.start', operationId, expected: r.versions, payload: { characterId: h.characterId, rolePlayEpoch: h.character().rolePlayEpoch, dungeonId: 'first', difficultyId: 'normal', entryContext: r.data.entryContext } }; }
test('entry rejects forged position/context, stale movement generation and foreign identity before replay', async () => {
    const h = await fixture(), cmd = await startCommand(h);
    const forged = await h.service.execute({ ...cmd, operationId: 'forged', payload: { ...cmd.payload, entryContext: 'forged' } });
    assert.equal(forged.outcome.code, 'VERSION_CONFLICT');
    await h.town.move({ ...h.auth, command: 'town.move', operationId: 'move', payload: { characterId: h.characterId, steps: [{ seq: 1, dx: 1, dy: 0, dtMs: 10 }] } });
    assert.equal((await h.service.execute(cmd)).outcome.code, 'VERSION_CONFLICT');
    const fresh = await startCommand(h, 'fresh');
    assert.equal((await h.service.execute(fresh)).outcome.status, 'committed');
    h.setSubject('intruder');
    assert.equal((await h.service.execute(fresh)).outcome.code, 'AUTH_REQUIRED');
});
test('level1 starter10 permits entry but level15, broken and missing weapons do not', async () => {
    const h = await fixture(), id = h.character().equipped.weapon, w = h.store.inspect(id);
    assert.equal((await h.entry()).data.options[0].canEnter, true);
    for (const [patch, code] of [[{ itemLevel: 15 }, 'WEAPON_REQUIRED'], [{ durability: { ...w.durability, current: 0 } }, 'WEAPON_BROKEN'], [{ lifecycle: 'destroyed' }, 'WEAPON_REQUIRED']]) {
        await h.store.run(tx => tx.set(id, { ...w, ...patch }));
        assert.equal((await h.entry()).data.options[0].reason, code);
    }
});
test('0 stamina rejected, refresh loads308, and high level first replay locks capped monster15', async () => {
    const h = await fixture();
    await h.store.run(tx => tx.set(h.characterId, { ...h.character(), stamina: { value: 0, refillWindow: 2 } }));
    assert.equal((await h.entry()).data.options[0].reason, 'STAMINA_NOT_ENOUGH');
    await h.store.run(tx => tx.set(h.characterId, { ...h.character(), stamina: { value: 0, refillWindow: 1 } }));
    assert.equal((await h.service.execute(await startCommand(h))).outcome.data.staminaSnapshot, 308);
});
test('same operation different intent and cross-service receipt fail closed; expected versions are checked', async () => {
    const h = await fixture(), cmd = await startCommand(h);
    assert.equal((await h.service.execute({ ...cmd, operationId: 'missing-expected', expected: [] })).outcome.code, 'VERSION_CONFLICT');
    await h.service.execute(cmd);
    assert.equal((await h.service.execute({ ...cmd, payload: { ...cmd.payload, difficultyId: 'other' } })).outcome.code, 'OPERATION_MISMATCH');
});
test('each of five write faults is atomic and a lost reply replays the original challenge', async () => {
    for (let i = 1; i <= 5; i++) {
        const h = await fixture(), cmd = await startCommand(h), before = h.store.snapshot();
        h.store.injectWriteFailure(i);
        assert.equal((await h.service.execute(cmd)).outcome.code, 'SERVICE_UNAVAILABLE');
        assert.deepEqual(h.store.snapshot(), before);
        assert.equal((await h.service.execute(cmd)).outcome.status, 'committed');
    }
    const h = await fixture(), cmd = await startCommand(h);
    h.store.injectResponseLoss();
    assert.equal((await h.service.execute(cmd)).outcome.status, 'unknown');
    const replay = await h.service.execute(cmd);
    assert.equal(replay.replayed, true);
    assert.equal(replay.outcome.status, 'committed');
});
test('concurrent distinct starts create one challenge and transaction retries reread clock', async () => {
    const h = await fixture(), a = await startCommand(h, 'a'), b = { ...a, operationId: 'b' };
    let now = 1000;
    h.clock.now = () => now;
    let entered = 0, release;
    const barrier = new Promise(r => release = r);
    h.store.beforeCommit = async (attempt) => { if (attempt === 0) {
        entered++;
        if (entered === 2) {
            now = 2000;
            release();
        }
        await barrier;
    } };
    const results = await Promise.all([h.service.execute(a), h.service.execute(b)]);
    assert.equal(results.filter(r => r.outcome.status === 'committed').length, 1);
    assert.equal(h.store.conflicts, 1);
    assert.equal(results.find(r => r.outcome.status === 'rejected').serverTime, 2000);
});
test('missing or malformed content cannot turn level gates into defaults', async () => {
    const h = await fixture({ content: undefined });
    assert.equal((await h.entry()).error.code, 'CONFIG_NOT_READY');
    const g = await fixture(), bad = structuredClone(g.content);
    bad.dungeons[0].minLevel = 0;
    const service = new ChallengeService({ store: g.store, clock: g.clock, identity: g.identity, content: bad });
    assert.equal((await service.query({ ...g.auth, query: 'dungeon.entry', requestId: 'bad-config', payload: { characterId: g.characterId, rolePlayEpoch: g.character().rolePlayEpoch, dungeonId: 'first' } })).error.code, 'CONFIG_NOT_READY');
});
test('start exposes locked monster, equipment provenance and computed equipment attributes to the client', async () => {
    const h = await fixture(), r = await h.service.execute(await startCommand(h));
    assert.equal(r.outcome.data.monsterLevel, 1);
    assert.equal(r.outcome.data.monsterStatsRef, 'first-normal-l1');
    assert.equal(r.outcome.data.equipmentSourceRef, 'first-normal-drops-v1');
    assert.equal(r.outcome.data.equipmentVersion, 0);
    assert.deepEqual(r.outcome.data.equipmentAttributes, []);
});
test('real new login closes an unpaid challenge without checkpoint or extra stamina charge exactly once', async () => {
    const h = await fixture(), r = await h.service.execute(await startCommand(h));
    const { LoginService } = await import('../src/identity/login-service.ts');
    const login = new LoginService({ store: h.store, clock: h.clock, identity: h.identity, ticketTtlMs: 60000, initialUnlocks: {}, holdingsDomainRef: 'bank-test-domain' });
    const p = await login.execute({ protocolVersion: 2, command: 'session.prepare', payload: { launchId: 'new-launch', prepareOperationId: 'new-prepare' } }), command = { protocolVersion: 2, command: 'session.commit', payload: { launchId: 'new-launch', ticketId: p.outcome.data.ticketId, openOperationId: 'new-open' } };
    const n = await login.execute(command);
    assert.equal(n.outcome.status, 'committed');
    assert.equal(h.character().location.kind, 'inn');
    assert.equal(h.character().stamina.value, 308);
    assert.equal(h.character().staminaReservation, undefined);
    const closed = h.store.inspect(r.outcome.data.challengeId);
    assert.equal(closed.roomPhase, 'closed');
    assert.equal(closed.staminaSettlement.state, 'settled');
    const before = h.store.snapshot();
    await login.execute(command);
    assert.deepEqual(h.store.snapshot(), before);
});
test('durable client selection requires confirmation and reload retries the same start after response loss', async () => {
    const { ChallengeEntryCoordinator } = await import('../../client/assets/scripts/net/ChallengeEntryCoordinator.ts');
    const h = await fixture(), saved = new Map(), persistence = { load: k => saved.get(k) ?? null, save: (k, v) => v === null ? saved.delete(k) : saved.set(k, v) };
    let lose = false;
    const transport = { send: async (text) => { const request = JSON.parse(text); const result = await ('query' in request ? h.service.query(request) : h.service.execute(request)); if (lose) {
            lose = false;
            throw new Error('network');
        } return JSON.stringify(result); } };
    const identity = { sessionId: h.auth.sessionId, sessionEpoch: h.auth.sessionEpoch, characterId: h.characterId, rolePlayEpoch: h.character().rolePlayEpoch };
    const c = new ChallengeEntryCoordinator(transport, persistence);
    c.init(identity);
    await c.open('first');
    assert.equal(c.state.status, 'choosing');
    assert.equal(h.account().activeChallengeId, undefined);
    lose = true;
    await c.confirm('normal', 'durable-start');
    assert.equal(c.state.status, 'unknown');
    const reopened = new ChallengeEntryCoordinator(transport, persistence);
    reopened.init(identity);
    assert.equal(reopened.state.status, 'unknown');
    await reopened.retry();
    assert.equal(reopened.state.status, 'started');
    assert.equal(reopened.state.started.monsterLevel, 1);
    assert.equal(saved.size, 0);
});
test('real equipment unequip removes entry eligibility and re-equip restores level1 starter10 eligibility', async () => {
    const { EquipmentService } = await import('../src/equipment/equipment-service.ts');
    const h = await fixture(), equipment = new EquipmentService({ store: h.store, clock: h.clock, identity: h.identity });
    const id = h.character().equipped.weapon;
    const command = name => ({ ...h.auth, command: name, operationId: name, expected: [{ kind: 'character', id: h.characterId, version: h.character().version }, { kind: 'container', id: h.bag().id, version: h.bag().version }, { kind: 'equipment', id, version: h.store.inspect(id).version }], payload: name === 'equipment.unequip' ? { characterId: h.characterId, itemId: id, slot: 'weapon' } : { characterId: h.characterId, itemId: id, targetSlot: 'weapon' } });
    assert.equal((await equipment.execute(command('equipment.unequip'))).outcome.status, 'committed');
    assert.equal((await h.entry()).data.options[0].reason, 'WEAPON_REQUIRED');
    assert.equal((await equipment.execute(command('equipment.equip'))).outcome.status, 'committed');
    assert.equal((await h.entry()).data.options[0].canEnter, true);
});
test('a known rejected start keeps its original result after stamina changes', async () => {
    const h = await fixture();
    await h.store.run(tx => tx.set(h.characterId, { ...h.character(), stamina: { value: 0, refillWindow: 2 } }));
    const cmd = await startCommand(h), first = await h.service.execute(cmd);
    assert.equal(first.outcome.code, 'STAMINA_NOT_ENOUGH');
    await h.store.run(tx => tx.set(h.characterId, { ...h.character(), stamina: { value: 308, refillWindow: 2 } }));
    const again = await h.service.execute(cmd);
    assert.equal(again.replayed, true);
    assert.deepEqual(again.outcome, first.outcome);
});
test('configured gates are first1/second15/special30, capped first15, and account difficulty unlock adds no score gate', async () => {
    const seed = await fixture(), content = structuredClone(seed.content);
    content.dungeons[0].difficulties[0].levels[15] = { monsterStatsRef: 'first-l15', equipmentSourceRef: 'first-drops-l15' };
    for (const [kind, min, cost] of [['second', 15, 1], ['special', 30, 3]])
        content.dungeons.push({ ...structuredClone(content.dungeons[0]), dungeonId: kind, kind, minLevel: min, maxMonsterLevel: 30, difficulties: [{ difficultyId: 'normal', roomCost: cost, levels: { [min]: { monsterStatsRef: `${kind}-l${min}`, equipmentSourceRef: `${kind}-drops` } } }, { difficultyId: 'adventure', roomCost: cost, levels: { [min]: { monsterStatsRef: `${kind}-adventure`, equipmentSourceRef: `${kind}-adventure-drops` } } }] });
    const h = await fixture({ content }), q = (id) => h.service.query({ ...h.auth, query: 'dungeon.entry', requestId: `q-${id}`, payload: { characterId: h.characterId, rolePlayEpoch: h.character().rolePlayEpoch, dungeonId: id } });
    for (const [id, level] of [['second', 14], ['special', 29]]) {
        await h.store.run(tx => tx.set(h.characterId, { ...h.character(), level }));
        assert.equal((await q(id)).data.options[0].reason, 'LEVEL_REQUIRED');
    }
    await h.store.run(tx => { tx.set(h.characterId, { ...h.character(), level: 30, score: 0 }); tx.set(h.account().id, { ...h.account(), dungeonUnlocks: { special: ['normal', 'adventure'] } }); });
    assert.equal((await q('special')).data.options[1].canEnter, true);
    const r = await h.service.execute(await startCommand(h));
    assert.equal(r.outcome.data.monsterLevel, 15);
    assert.equal(r.outcome.data.playerLevel, 30);
});
test('verified E01 adapter exposes only its published level1 normal contract fixture', async () => {
    const { readFile } = await import('node:fs/promises');
    const { entryContentFromE01 } = await import('../src/challenge/challenge-content.ts');
    const text = await readFile(new URL('../../shared/fixtures/warrior-first-normal.test.json', import.meta.url), 'utf8');
    const content = await entryContentFromE01(text, { profileId: 'warrior-e01-test', environmentScope: 'local-test', allowTestStrategies: true }, { mapId: 'town-map-1', x: 100, y: 100, radius: 24 });
    const h = await fixture({ content }), q = await h.entry();
    assert.equal(q.data.options.length, 1);
    assert.equal(q.data.options[0].difficultyId, 'normal');
    const result = await h.service.execute(await startCommand(h));
    assert.equal(result.outcome.data.configRef, 'warrior-first-normal-e01-v1');
    await assert.rejects(() => entryContentFromE01(text.replace('"1000000"', '"1000001"'), { profileId: 'warrior-e01-test', environmentScope: 'local-test', allowTestStrategies: true }, { mapId: 'town-map-1', x: 100, y: 100, radius: 24 }), /MANIFEST_HASH/);
});

test('unregistered template classes and unsafe counters fail closed', async () => {
 const h=await fixture({catalog:undefined});assert.equal((await h.entry()).data.options[0].reason,'CONFIG_NOT_READY');
 const g=await fixture();await g.store.run(tx=>tx.set(g.characterId,{...g.character(),version:Number.MAX_SAFE_INTEGER}));assert.equal((await g.service.execute(await startCommand(g))).outcome.code,'CONFIG_NOT_READY');assert.equal(g.account().activeChallengeId,undefined);
});
test('maximum13 equipped instances and16 escaped affixes remain bounded in actual H/O/J encoding', async () => {
 const h=await fixture(),weapon=h.store.inspect(h.character().equipped.weapon);
 const slots=['weapon','shoulder','chest','pants','belt','boots','bracelet','necklace','ring','subEquip','magicStone','earring','trinket'];
 const equipped={};await h.store.run(tx=>{for(const slot of slots){const id=(slot+'"\\'.repeat(64)).slice(0,128),wear=['weapon','shoulder','chest','pants','belt','boots','earring'].includes(slot);equipped[slot]=id;tx.set(id,{...weapon,id,slotKind:slot,sourceKey:'"\\'.repeat(64),sourceLocator:{kind:'initialEquip',characterId:h.characterId},location:{kind:'equipped',characterId:h.characterId,slotId:slot},durability:wear?weapon.durability:{wearEnabled:false,current:null,max:null,policyRef:'no-wear'},rolledAffixes:Array.from({length:16},(_,i)=>({stat:(`stat${i}`+'"\\'.repeat(64)).slice(0,128),value:1}))});}tx.set(h.characterId,{...h.character(),equipped});});
 const cmd=await startCommand(h),r=await h.service.execute(cmd);assert.equal(r.outcome.status,'committed');const bytes=x=>new TextEncoder().encode(JSON.stringify(x)).length,keys=await h.keys(cmd.operationId),sizes={H:bytes(h.store.inspect(r.outcome.data.challengeId)),O:bytes(h.store.inspect(keys.o)),J:bytes(h.store.inspect(keys.j))};
 assert.ok(sizes.H<=131072);assert.ok(sizes.O<=16384);assert.ok(sizes.J<=131072);console.log('ST10-01 maximum fixture UTF-8 bytes',JSON.stringify(sizes));
});

test('cross-service, malformed receipt and orphan journal cannot be consumed by a new start', async () => {
 const {canonical}=await import('../src/ports/store.ts');
 for(const corruption of ['foreign-command','malformed-result','orphan-journal']){
  const h=await fixture(),cmd=await startCommand(h),keys=await h.keys(cmd.operationId);
  await h.store.run(tx=>{if(corruption==='orphan-journal')tx.set(keys.j,{schemaVersion:2,id:keys.j});else tx.set(keys.o,{schemaVersion:2,id:keys.o,accountId:h.account().id,command:corruption==='foreign-command'?'equipment.equip':'challenge.start',tuple:canonical(cmd),result:{}});});
  assert.equal((await h.service.execute(cmd)).outcome.code,'SERVICE_UNAVAILABLE');assert.equal(h.account().activeChallengeId,undefined);assert.equal(h.character().location.kind,'town');
 }
});
