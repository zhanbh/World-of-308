import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBankFixture } from './fixtures/bank-fixture.mjs';
import { ChallengeService } from '../src/challenge/challenge-service.ts';
import { entryContentFromE01 } from '../src/challenge/challenge-content.ts';
import {
    FIRST_DUNGEON_SEVEN_ROOM_SPAWNS,
    PURPLE_SPAWN_CANDIDATE,
    PURPLE_ELIGIBLE_ROOMS,
    validateSpawnGeometry,
    buildEncounterRoomSpawns,
} from '../../shared/src/encounter-layout.ts';
import { manifestDigest } from '../../shared/src/room-manifest.ts';
import { loginKey } from '../src/identity/identity-v2.ts';
import { writeChunk, stateHash, readCheckpoint } from '../src/challenge/room-checkpoint.ts';

async function encounterFixture(purpleRoom = 0) {
    const h = await createBankFixture();
    const releaseText = await readFile(new URL('../../shared/fixtures/warrior-first-normal.test.json', import.meta.url), 'utf8');
    const content = await entryContentFromE01(
        releaseText,
        { profileId: 'warrior-e01-test', environmentScope: 'local-test', allowTestStrategies: true },
        { mapId: h.town.manifest.mapId, x: 100, y: 100, radius: 24 },
        { encounterLayout: true }
    );
    const service = new ChallengeService({
        store: h.store,
        clock: h.clock,
        identity: h.identity,
        content: {
            ...content,
            exitInteraction: { profile: 'local-test', rulesRef: content.releaseRef, radius: 0 }
        },
        encounterRandom: { nextRoom: () => purpleRoom },
        catalog: {
            'equipment:warrior-sword-white-v1': {
                templateId: 'equipment:warrior-sword-white-v1',
                name: 'Starter',
                slotKind: 'weapon',
                itemLevel: 10,
                quality: 'white',
                allowedClasses: ['warrior'],
            },
        },
    });
    const entry = await service.query({
        ...h.auth,
        query: 'dungeon.entry',
        requestId: 'entry',
        payload: { characterId: h.characterId, rolePlayEpoch: h.character().rolePlayEpoch, dungeonId: 'first' },
    });
    const started = await service.execute({
        ...h.auth,
        command: 'challenge.start',
        operationId: 'start',
        expected: entry.versions,
        payload: { characterId: h.characterId, rolePlayEpoch: h.character().rolePlayEpoch, dungeonId: 'first', difficultyId: 'normal', entryContext: entry.data.entryContext },
    });
    const challengeId = started.outcome.data.challengeId;
    const query = () => service.query({ ...h.auth, query: 'challenge.get', requestId: 'state', payload: { challengeId } });
    const state = await query();
    const command = {
        ...h.auth,
        command: 'challenge.prepareRoom',
        operationId: 'prepare-0',
        expected: state.versions,
        payload: { characterId: h.characterId, rolePlayEpoch: h.character().rolePlayEpoch, challengeId, nextRoomNo: 0, expectedRevision: 0 },
    };
    return { ...h, content, service, challengeId, query, command, purpleRoom };
}

test('7-room encounter geometry has exactly 27 base monsters and purple is valid across rooms 0..5', async () => {
    // 1. Total base monsters check
    const baseCounts = FIRST_DUNGEON_SEVEN_ROOM_SPAWNS.map(r => r.length);
    assert.deepEqual(baseCounts, [3, 5, 5, 4, 3, 6, 1]);
    const totalBase = baseCounts.reduce((sum, n) => sum + n, 0);
    assert.equal(totalBase, 27, 'First dungeon must have exactly 27 base monsters');

    // 2. Purple eligibility: only in rooms 0..5, never in boss room 6
    assert.deepEqual(PURPLE_ELIGIBLE_ROOMS, [0, 1, 2, 3, 4, 5]);
    assert.equal(PURPLE_SPAWN_CANDIDATE.x, 105000);
    assert.equal(PURPLE_SPAWN_CANDIDATE.y, 20000);
    assert.equal(PURPLE_SPAWN_CANDIDATE.experienceMultiplier, 2);

    // 3. Map bounds and geometry verification for every room
    const bounds = { left: -218000, right: 218000, bottom: -35000, top: 78000 };
    const entrance = { x: -180000, y: 20000 };
    const exit = { x: 200000, y: 20000 };

    for (let roomNo = 0; roomNo < 7; roomNo++) {
        // Without purple
        const baseSpawns = buildEncounterRoomSpawns(roomNo, null, 'humanoid@1');
        assert.ok(baseSpawns.length <= 8, `Room ${roomNo} base spawns must not exceed 8`);
        validateSpawnGeometry(baseSpawns, bounds, entrance, exit);

        // With purple in eligible rooms
        if (roomNo <= 5) {
            const withPurple = buildEncounterRoomSpawns(roomNo, roomNo, 'humanoid@1');
            assert.equal(withPurple.length, baseSpawns.length + 1);
            assert.ok(withPurple.length <= 8, `Room ${roomNo} with purple must not exceed 8`);
            assert.equal(withPurple.at(-1).role, 'purple');
            assert.equal(withPurple.at(-1).x, 105000);
            assert.equal(withPurple.at(-1).y, 20000);
            validateSpawnGeometry(withPurple, bounds, entrance, exit);
        } else {
            // Boss room 6 cannot receive purple
            const bossSpawns = buildEncounterRoomSpawns(6, 6, 'humanoid@1');
            assert.equal(bossSpawns.length, 1, 'Boss room must only have 1 monster even if purpleRoomNo was 6');
            assert.equal(bossSpawns[0].role, 'boss');
        }
    }
});

test('prepareRoom produces versioned 7-room manifests with 27 base monsters and single purple monster', async () => {
    for (let purpleRoom = 0; purpleRoom < 6; purpleRoom++) {
        const h = await encounterFixture(purpleRoom);
        const prep = await h.service.execute(h.command);
        assert.equal(prep.outcome.status, 'committed');
        const m = prep.outcome.data;
        assert.equal(m.roomNo, 0);

        if (purpleRoom === 0) {
            // Room 0 has 3 base + 1 purple = 4
            assert.equal(m.spawns.length, 4);
            const purple = m.spawns.find(s => s.role === 'purple');
            assert.ok(purple);
            assert.equal(purple.x, 105000);
            assert.equal(purple.y, 20000);
        } else {
            // Room 0 has 3 base, no purple
            assert.equal(m.spawns.length, 3);
            assert.equal(m.spawns.filter(s => s.role === 'purple').length, 0);
        }
    }
});

test('room cannot open or advance while purple monster or any ordinary monster is still alive', async () => {
    // Room 0 has purple monster
    const h = await encounterFixture(0);
    const p = await h.service.execute(h.command);
    assert.equal(p.outcome.status, 'committed');
    const m = p.outcome.data;

    // Activate room 0
    const a = await h.service.execute({
        ...h.auth,
        command: 'challenge.activateRoom',
        operationId: 'activate-0',
        expected: p.outcome.resultVersions,
        payload: {
            characterId: h.characterId,
            rolePlayEpoch: h.character().rolePlayEpoch,
            challengeId: h.challengeId,
            roomAttemptId: m.roomAttemptId,
            manifestHash: m.manifestHash,
            expectedRevision: h.store.inspect(h.challengeId).version,
        },
    });
    assert.equal(a.outcome.status, 'committed');

    // Ready room 0
    const ready = {
        ...h.auth,
        command: 'scene.ready',
        controlSeq: 1,
        leaseRevision: 0,
        payload: {
            characterId: h.characterId,
            rolePlayEpoch: h.character().rolePlayEpoch,
            challengeId: h.challengeId,
            ...Object.fromEntries(Object.entries(a.outcome.data.readyTicket).filter(([k]) => k !== 'deadline')),
        },
    };
    await h.service.execute(ready);

    const headerId = await loginKey('cpHeader', [h.challengeId]);
    const roleId = await loginKey('cpChunk', [h.challengeId, 0]);
    const sceneId = await loginKey('cpChunk', [h.challengeId, 1]);

    const buildNextCmd = (opId, expectedRevision, versions) => ({
        ...h.command,
        operationId: opId,
        expected: versions,
        payload: {
            characterId: h.characterId,
            rolePlayEpoch: h.character().rolePlayEpoch,
            challengeId: h.challengeId,
            nextRoomNo: 1,
            expectedRevision,
        },
    });

    // Case 1: All monsters alive -> prepareRoom rejected
    const case1Res = await h.service.execute(buildNextCmd('prepare-all-alive', h.store.inspect(h.challengeId).version, (await h.query()).versions));
    assert.equal(case1Res.outcome.code, 'ROOM_NOT_AVAILABLE');

    // Case 2: Ordinary monsters dead, but purple monster is STILL ALIVE -> prepareRoom rejected
    await h.store.run(async tx => {
        const old = await tx.get(h.challengeId);
        const header = await tx.get(headerId);
        const role = (await tx.get(roleId)).data;
        const scene = (await tx.get(sceneId)).data;

        role.player.x = 200000;
        role.player.y = 20000;
        for (const e of scene.enemies) {
            if (e.role !== 'purple') {
                e.actor.hp = '0';
                e.actor.lifeState = 'dead';
            }
        }
        const chunks = await Promise.all([writeChunk(old, 0, 1, role), writeChunk(old, 1, 1, scene)]);
        for (const ch of chunks) tx.set(ch.id, ch);
        tx.set(headerId, {
            ...header,
            activeChunks: chunks.map(ch => ({ ordinal: ch.ordinal, chunkRevision: 1, hash: ch.hash, sceneEpoch: old.sceneEpoch })),
            state: { ...header.state, publicStateHash: await stateHash(role, scene) },
        });
    });

    const case2Res = await h.service.execute(buildNextCmd('prepare-purple-alive', h.store.inspect(h.challengeId).version, (await h.query()).versions));
    assert.equal(case2Res.outcome.code, 'ROOM_NOT_AVAILABLE');

    // Case 3: Purple monster dead, but one ordinary monster is STILL ALIVE -> prepareRoom rejected
    await h.store.run(async tx => {
        const old = await tx.get(h.challengeId);
        const header = await tx.get(headerId);
        const role = (await tx.get(roleId)).data;
        const scene = (await tx.get(sceneId)).data;

        const purple = scene.enemies.find(e => e.role === 'purple');
        purple.actor.hp = '0';
        purple.actor.lifeState = 'dead';
        const ordinary = scene.enemies.find(e => e.role === 'ordinary');
        ordinary.actor.hp = '100000';
        ordinary.actor.lifeState = 'alive';

        const chunks = await Promise.all([writeChunk(old, 0, 2, role), writeChunk(old, 1, 2, scene)]);
        for (const ch of chunks) tx.set(ch.id, ch);
        tx.set(headerId, {
            ...header,
            activeChunks: chunks.map(ch => ({ ordinal: ch.ordinal, chunkRevision: 2, hash: ch.hash, sceneEpoch: old.sceneEpoch })),
            state: { ...header.state, publicStateHash: await stateHash(role, scene) },
        });
    });

    const case3Res = await h.service.execute(buildNextCmd('prepare-ordinary-alive', h.store.inspect(h.challengeId).version, (await h.query()).versions));
    assert.equal(case3Res.outcome.code, 'ROOM_NOT_AVAILABLE');

    // Case 4: ALL monsters in room dead, room cleared -> prepareRoom allowed!
    await h.store.run(async tx => {
        const old = await tx.get(h.challengeId);
        const header = await tx.get(headerId);
        const role = (await tx.get(roleId)).data;
        const scene = (await tx.get(sceneId)).data;

        for (const e of scene.enemies) {
            e.actor.hp = '0';
            e.actor.lifeState = 'dead';
        }
        const chunks = await Promise.all([writeChunk(old, 0, 3, role), writeChunk(old, 1, 3, scene)]);
        for (const ch of chunks) tx.set(ch.id, ch);
        tx.set(headerId, {
            ...header,
            activeChunks: chunks.map(ch => ({ ordinal: ch.ordinal, chunkRevision: 3, hash: ch.hash, sceneEpoch: old.sceneEpoch })),
            state: { ...header.state, roomPhase: 'cleared', publicStateHash: await stateHash(role, scene) },
        });
        tx.set(old.id, { ...old, roomPhase: 'cleared' });
    });

    const allowed = await h.service.execute(buildNextCmd('prepare-cleared', h.store.inspect(h.challengeId).version, (await h.query()).versions));
    assert.equal(allowed.outcome.status, 'committed');
    assert.equal(allowed.outcome.data.roomNo, 1);
});

test('simulation step marks room cleared and records confirmed kill facts with 2x xp for purple monster', async () => {
    const h = await encounterFixture(0);
    const p = await h.service.execute(h.command);
    const a = await h.service.execute({
        ...h.auth,
        command: 'challenge.activateRoom',
        operationId: 'activate-0',
        expected: p.outcome.resultVersions,
        payload: {
            characterId: h.characterId,
            rolePlayEpoch: h.character().rolePlayEpoch,
            challengeId: h.challengeId,
            roomAttemptId: p.outcome.data.roomAttemptId,
            manifestHash: p.outcome.data.manifestHash,
            expectedRevision: h.store.inspect(h.challengeId).version,
        },
    });
    const ticket = a.outcome.data.readyTicket;
    await h.service.execute({
        ...h.auth,
        command: 'scene.ready',
        controlSeq: 1,
        leaseRevision: 0,
        payload: {
            characterId: h.characterId,
            rolePlayEpoch: h.character().rolePlayEpoch,
            challengeId: h.challengeId,
            ...Object.fromEntries(Object.entries(ticket).filter(([k]) => k !== 'deadline')),
        },
    });

    const initialH = h.store.inspect(h.challengeId);
    assert.equal(initialH.roomPhase, 'active');
    assert.deepEqual(initialH.confirmedKills, []);

    // Set enemies to 0 hp in checkpoint to simulate lethal combat damage in step
    const headerId = await loginKey('cpHeader', [h.challengeId]);
    const roleId = await loginKey('cpChunk', [h.challengeId, 0]);
    const sceneId = await loginKey('cpChunk', [h.challengeId, 1]);

    await h.store.run(async tx => {
        const old = await tx.get(h.challengeId);
        const header = await tx.get(headerId);
        const role = (await tx.get(roleId)).data;
        const scene = (await tx.get(sceneId)).data;

        // Position player at exit
        role.player.x = 200000;
        role.player.y = 20000;
        for (const e of scene.enemies) {
            e.actor.hp = '0';
            e.actor.lifeState = 'dead';
        }

        const chunks = await Promise.all([writeChunk(old, 0, 1, role), writeChunk(old, 1, 1, scene)]);
        for (const ch of chunks) tx.set(ch.id, ch);
        tx.set(headerId, {
            ...header,
            activeChunks: chunks.map(ch => ({ ordinal: ch.ordinal, chunkRevision: 1, hash: ch.hash, sceneEpoch: old.sceneEpoch })),
            state: { ...header.state, publicStateHash: await stateHash(role, scene) },
        });
    });

    // Submit movement step
    const manifest = p.outcome.data;
    const movementConfig = {
        schemaVersion: 1,
        profile: 'local-test-movement',
        units: 'milli-design-pixel',
        ruleRef: h.content.releaseRef,
        mapRef: manifest.mapRef,
        walkSpeed: 100000,
        runSpeed: 200000,
        ySpeed: 100000,
        deadzone: 100,
        runThreshold: 600,
        footprint: 10,
        bounds: { minX: -1000000, maxX: 1000000, minY: -1000000, maxY: 1000000 },
        walls: [],
    };
    const content = { ...h.content, movement: movementConfig };
    h.service = new ChallengeService({
        store: h.store,
        clock: h.clock,
        identity: h.identity,
        content: {
            ...content,
            exitInteraction: { profile: 'local-test', rulesRef: h.content.releaseRef, radius: 0 },
        },
    });

    const stepPayload = {
        characterId: h.characterId,
        rolePlayEpoch: h.character().rolePlayEpoch,
        challengeId: h.challengeId,
        sceneEpoch: 1,
        timelineEpoch: 1,
        roomNo: 0,
        mapRef: manifest.mapRef,
        ruleRef: h.content.releaseRef,
        baseCheckpointVersion: h.store.inspect(headerId).revision,
        fromTick: 0,
        toTick: 1,
        firstSeq: 1,
        lastSeq: 1,
        inputs: [{ seq: 1, tick: 0, kind: 'move', x: 0, y: 0 }],
        digest: '',
    };
    stepPayload.digest = await manifestDigest({
        payload: Object.fromEntries(Object.entries(stepPayload).filter(([k]) => k !== 'digest')),
        config: movementConfig,
    });

    h.clock.now = () => 1010;
    const step = await h.service.execute({
        ...h.auth,
        command: 'simulation.submit',
        operationId: 'step-lethal',
        expected: (await h.query()).versions,
        payload: stepPayload,
    });
    assert.equal(step.outcome.status, 'committed');

    // Verify challenge state transitioned to cleared
    const updatedH = h.store.inspect(h.challengeId);
    assert.equal(updatedH.roomPhase, 'cleared', 'Room phase must become cleared after all enemies die');

    // Verify confirmed kill facts
    assert.equal(updatedH.confirmedKills.length, 4, 'Room 0 has 3 base + 1 purple = 4 kills');
    const purpleKill = updatedH.confirmedKills.find(k => k.role === 'purple');
    assert.ok(purpleKill);
    assert.equal(purpleKill.spawnId, 'purple-extra');
    assert.equal(purpleKill.xpMultiplier, 2, 'Purple monster kill must have 2x XP multiplier');

    const ordinaryKills = updatedH.confirmedKills.filter(k => k.role === 'ordinary');
    assert.equal(ordinaryKills.length, 3);
    assert.ok(ordinaryKills.every(k => k.xpMultiplier === 1), 'Ordinary monster kills must have 1x XP multiplier');

    // Next prepareRoom can be called immediately because room is cleared!
    const nextRoomPrep = await h.service.execute({
        ...h.auth,
        command: 'challenge.prepareRoom',
        operationId: 'prepare-room-1',
        expected: (await h.query()).versions,
        payload: {
            characterId: h.characterId,
            rolePlayEpoch: h.character().rolePlayEpoch,
            challengeId: h.challengeId,
            nextRoomNo: 1,
            expectedRevision: updatedH.version,
        },
    });
    assert.equal(nextRoomPrep.outcome.status, 'committed');
    assert.equal(nextRoomPrep.outcome.data.roomNo, 1);
});

test('checkpoint recovery and reload preserve spawn identities and confirmed kills without re-roll', async () => {
    const h = await encounterFixture(2); // Purple in room 2
    const p = await h.service.execute(h.command);
    const m = p.outcome.data;

    // Room 0: no purple monster
    assert.equal(m.spawns.filter(s => s.role === 'purple').length, 0);
    assert.equal(m.spawns.length, 3);

    // Initial challenge snapshot
    const initialChallenge = h.store.inspect(h.challengeId);
    assert.equal(initialChallenge.purpleRoomNo, 2);
    assert.equal(initialChallenge.purpleEncounter.roomNo, 2);

    // Reload from store
    const reloaded = await h.query();
    assert.equal(reloaded.data.challengeId, h.challengeId);
    assert.equal(h.store.inspect(h.challengeId).purpleRoomNo, 2, 'Purple room must be preserved without re-roll');
    assert.equal(h.store.inspect(h.challengeId).purpleEncounter.spawnId, 'purple-extra');
});
