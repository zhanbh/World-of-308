import test from 'node:test';
import assert from 'node:assert/strict';
import {
    FIRST_DUNGEON_SEVEN_ROOM_SPAWNS,
    WORKSHOP_DUNGEON_SEVEN_ROOM_SPAWNS,
    RIFT_DUNGEON_SEVEN_ROOM_SPAWNS,
    THREE_DUNGEON_SEVEN_ROOM_SPAWNS,
    buildEncounterRoomSpawnsForDungeon,
    buildEncounterRoomSpawns,
    validateSpawnGeometry,
} from '../../shared/src/encounter-layout.ts';
import {
    localTacticsConfig,
    DIFFICULTY_PROFILES,
} from '../../shared/src/monster-tactics.ts';
import { defaultMonsterResist } from '../../shared/src/monster-simulation.ts';
import {
    allocateEffectSlots,
    snapshotRow,
    restoreSnapshot,
    byteSize,
    validateCompactDomain,
} from '../src/challenge/compact-effects-checkpoint.ts';
import { MemoryStore } from '../src/adapters/memory-store.ts';
import { earthFixture } from './fixtures/earth-fixture.mjs';

test('three dungeons layout: 7 rooms each, counts, roles and spatial clearances', () => {
    // 1. First dungeon: 27 base monsters
    const firstTotal = FIRST_DUNGEON_SEVEN_ROOM_SPAWNS.reduce((acc, r) => acc + r.length, 0);
    assert.equal(firstTotal, 27);
    assert.equal(FIRST_DUNGEON_SEVEN_ROOM_SPAWNS.length, 7);

    // Purple spawn on rooms 0..5 produces 28 total monsters
    for (let r = 0; r <= 5; r++) {
        const spawns = buildEncounterRoomSpawnsForDungeon('first', r, r, 'template:mob', 'template:purple');
        const purple = spawns.find(s => s.role === 'purple');
        assert.ok(purple, `Room ${r} should contain purple monster`);
        assert.equal(purple.category, 'humanoid');
    }
    // Room 6 (R7 boss room) cannot spawn purple
    const bossSpawns = buildEncounterRoomSpawnsForDungeon('first', 6, 6, 'template:mob', 'template:purple');
    assert.equal(bossSpawns.some(s => s.role === 'purple'), false);

    // 2. Workshop dungeon: 34 monsters across 7 rooms (1 elite, 1 boss, 32 ordinary)
    assert.equal(WORKSHOP_DUNGEON_SEVEN_ROOM_SPAWNS.length, 7);
    const workshopTotal = WORKSHOP_DUNGEON_SEVEN_ROOM_SPAWNS.reduce((acc, r) => acc + r.length, 0);
    assert.equal(workshopTotal, 34);

    let workshopEliteCount = 0;
    let workshopBossCount = 0;
    let workshopOrdinaryCount = 0;
    for (let r = 0; r < 7; r++) {
        const roomSpawns = buildEncounterRoomSpawnsForDungeon('workshop', r, r, 'template:mob');
        assert.ok(roomSpawns.length <= 8, `Workshop room ${r} must not exceed 8 monsters`);
        for (const m of roomSpawns) {
            if (m.role === 'elite') workshopEliteCount++;
            else if (m.role === 'boss') workshopBossCount++;
            else if (m.role === 'ordinary') workshopOrdinaryCount++;
            else assert.fail(`Unexpected role in workshop: ${m.role}`);
        }
    }
    assert.equal(workshopEliteCount, 1); // R5
    assert.equal(workshopBossCount, 1);  // R7
    assert.equal(workshopOrdinaryCount, 32);

    // 3. Rift dungeon: 41 monsters across 7 rooms (1 elite, 1 boss, 39 ordinary, peak 8 in R6)
    assert.equal(RIFT_DUNGEON_SEVEN_ROOM_SPAWNS.length, 7);
    const riftTotal = RIFT_DUNGEON_SEVEN_ROOM_SPAWNS.reduce((acc, r) => acc + r.length, 0);
    assert.equal(riftTotal, 41);

    let riftEliteCount = 0;
    let riftBossCount = 0;
    let riftOrdinaryCount = 0;
    for (let r = 0; r < 7; r++) {
        const roomSpawns = buildEncounterRoomSpawnsForDungeon('rift', r, r, 'template:mob');
        assert.ok(roomSpawns.length <= 8, `Rift room ${r} must not exceed 8 monsters`);
        if (r === 5) {
            // Room 5 (R6) is the peak 8 concurrency room
            assert.equal(roomSpawns.length, 8);
        }
        for (const m of roomSpawns) {
            if (m.role === 'elite') riftEliteCount++;
            else if (m.role === 'boss') riftBossCount++;
            else if (m.role === 'ordinary') riftOrdinaryCount++;
            else assert.fail(`Unexpected role in rift: ${m.role}`);
        }
    }
    assert.equal(riftEliteCount, 1); // R5
    assert.equal(riftBossCount, 1);  // R7
    assert.equal(riftOrdinaryCount, 39);

    // 4. Validate geometry and clearances for all three dungeons
    const bounds = { left: -218000, right: 218000, bottom: -35000, top: 78000 };
    const entrance = { x: -180000, y: 20000 };
    const exit = { x: 200000, y: 20000 };
    for (const [dName, dSpawns] of Object.entries(THREE_DUNGEON_SEVEN_ROOM_SPAWNS)) {
        for (let r = 0; r < dSpawns.length; r++) {
            const roomSpawns = dSpawns[r];
            assert.doesNotThrow(() => validateSpawnGeometry(roomSpawns, bounds, entrance, exit),
                `${dName} room ${r} must be valid geometry`);
        }
    }

    // 5. Error handling for buildEncounterRoomSpawnsForDungeon
    assert.throws(() => buildEncounterRoomSpawnsForDungeon('unknown', 0, null, 'm'), /UNKNOWN_DUNGEON_KIND/);
    assert.throws(() => buildEncounterRoomSpawnsForDungeon('workshop', -1, null, 'm'), /INVALID_ROOM_NO/);
    assert.throws(() => buildEncounterRoomSpawnsForDungeon('rift', 7, null, 'm'), /INVALID_ROOM_NO/);
});

test('category bleed and control resistance rules and validation', () => {
    // 1. Bleed rules across categories
    const humanoidResist = defaultMonsterResist('humanoid');
    assert.equal(humanoidResist.bleed, false, 'Humanoid must be susceptible to bleed');
    assert.equal(humanoidResist.stagger, false);
    assert.equal(humanoidResist.knockback, false);
    assert.equal(humanoidResist.knockdown, false);

    const beastResist = defaultMonsterResist('beast');
    assert.equal(beastResist.bleed, false, 'Beast must be susceptible to bleed');
    assert.equal(beastResist.stagger, false);
    assert.equal(beastResist.knockdown, false);

    const undeadResist = defaultMonsterResist('undead');
    assert.equal(undeadResist.bleed, true, 'Undead must be immune to bleed');
    assert.equal(undeadResist.stagger, false, 'Undead must be controllable by default');
    assert.equal(undeadResist.knockdown, false);

    const mechanicalResist = defaultMonsterResist('mechanical');
    assert.equal(mechanicalResist.bleed, true, 'Mechanical must be immune to bleed');
    assert.equal(mechanicalResist.stagger, false, 'Mechanical must be controllable by default');
    assert.equal(mechanicalResist.knockdown, false);

    // 2. localTacticsConfig with template mapping specs
    const multiConfig = localTacticsConfig({
        guard_humanoid: { kind: 'melee', category: 'humanoid' },
        drone_mechanical: { kind: 'ranged', category: 'mechanical' },
        ghoul_undead: { kind: 'melee', category: 'undead' },
        wolf_beast: { kind: 'charge', category: 'beast' },
        overseer_elite: { kind: 'elite', category: 'humanoid' },
        constructor_boss: { kind: 'boss', category: 'humanoid' },
    });

    assert.equal(multiConfig.templates.guard_humanoid.type, 'humanoid');
    assert.equal(multiConfig.templates.guard_humanoid.resist.bleed, false);
    assert.equal(multiConfig.templates.drone_mechanical.type, 'mechanical');
    assert.equal(multiConfig.templates.drone_mechanical.resist.bleed, true);
    assert.equal(multiConfig.templates.ghoul_undead.type, 'undead');
    assert.equal(multiConfig.templates.ghoul_undead.resist.bleed, true);
    assert.equal(multiConfig.templates.wolf_beast.type, 'beast');
    assert.equal(multiConfig.templates.wolf_beast.resist.bleed, false);

    // 3. Validation: reject unknown category before release
    assert.throws(() => localTacticsConfig({
        dragon_mob: { kind: 'melee', category: 'dragon' },
    }), /INVALID_MONSTER_CATEGORY/);

    // 4. Validation: reject unknown monster kind before release
    assert.throws(() => localTacticsConfig({
        alien_mob: { kind: 'teleport_laser', category: 'humanoid' },
    }), /UNKNOWN_MONSTER_KIND/);
});

test('8-enemy peak concurrency and 3648 combined effect budget signoff with MemoryStore', async () => {
    // 1. Simulate 3648 combined slots (2736 player effects + 912 monster effects across 6 chunks)
    const combinedRows = Array.from({ length: 3648 }, (_, i) => [
        i < 2736 ? 0 : 4, // 0 = player domain, 4 = monster domain
        1,
        Math.floor(i / 16) + 1,
        Math.floor(i / 8) % 2,
        (i % 8) + 1,
        [4294967295, 4294967291],
        4,
        '18446744073709551615',
    ]);
    const chunks = allocateEffectSlots(combinedRows);
    assert.equal(chunks.length, 6);

    // Verify UTF-8 byte budget for each chunk <= 81920
    for (let c = 0; c < chunks.length; c++) {
        const chunk = chunks[c];
        const fullChunk = {
            ...chunk,
            id: `chunk-${c}`.repeat(10),
            accountId: 'acc-test'.repeat(10),
            challengeId: 'chal-test'.repeat(10),
            hash: 'h'.repeat(64),
            ordinal: c,
            sceneEpoch: 1,
            chunkRevision: 1,
            schemaVersion: 2,
        };
        const chunkBytes = byteSize(fullChunk);
        assert.ok(chunkBytes <= 81920, `Chunk ${c} size ${chunkBytes} must be <= 81920 bytes`);
    }

    // 2. 228 snapshots (171 player + 57 monster)
    const r = { n: '1', d: '1' };
    const shot = {
        attackPower: '1000000000000',
        haste: r,
        damageBonus: r,
        hit: r,
        crit: r,
        critMultiplier: r,
        mastery: r,
        x: 0,
        y: 0,
        facing: 1,
        level: 30,
    };
    const snapshots = Array.from({ length: 228 }, (_, i) => [
        i < 171 ? 0 : 4,
        i + 1,
        snapshotRow({ ...shot, attackPower: String(1000000000000 - i) }),
    ]);

    const domainValidation = validateCompactDomain(chunks, snapshots);
    assert.deepEqual(domainValidation, { effects: 3648, snapshots: 228 });

    // 3. UTF-8 encoded total payload budget <= 655360 bytes
    const fullPayload = {
        header: {
            challengeId: 'chal-three-dungeons',
            dungeonKind: 'rift',
            roomNo: 5,
            concurrency: 8,
            timestamp: Date.now(),
        },
        chunks,
        snapshots,
    };
    const totalBytes = byteSize(fullPayload);
    assert.ok(totalBytes <= 655360, `Total payload size ${totalBytes} bytes must be <= 655360`);
    assert.ok(byteSize(fullPayload.header) <= 16384, 'Header size must be <= 16384 bytes');

    // 4. MemoryStore transactional integrity
    const store = new MemoryStore();
    await store.run(async tx => {
        tx.set('checkpoint:chal-three-dungeons:effects', fullPayload);
    });

    const persisted = store.inspect('checkpoint:chal-three-dungeons:effects');
    assert.ok(persisted);
    assert.equal(persisted.header.concurrency, 8);
    assert.equal(persisted.chunks.length, 6);
    assert.equal(persisted.snapshots.length, 228);

    // Rollback test: error aborts all writes
    await assert.rejects(async () => {
        await store.run(async tx => {
            tx.set('checkpoint:abort_test', { dirty: true });
            throw new Error('SIMULATED_TRANSACTION_FAILURE');
        });
    }, /SIMULATED_TRANSACTION_FAILURE/);
    assert.equal(store.inspect('checkpoint:abort_test'), undefined);
});

test('strict backward compatibility with first-dungeon-v1 and earthFixture', async () => {
    // 1. buildEncounterRoomSpawns backward compatibility
    for (let r = 0; r < 7; r++) {
        const legacy = buildEncounterRoomSpawns(r, 0, 'template:mob', 'template:purple');
        const v2 = buildEncounterRoomSpawnsForDungeon('first', r, 0, 'template:mob', 'template:purple');
        assert.equal(legacy.length, v2.length);
        for (let i = 0; i < legacy.length; i++) {
            assert.equal(legacy[i].spawnId, v2[i].spawnId);
            assert.equal(legacy[i].templateRef, v2[i].templateRef);
            assert.equal(legacy[i].role, v2[i].role);
            assert.equal(legacy[i].x, v2[i].x);
            assert.equal(legacy[i].y, v2[i].y);
            assert.equal(legacy[i].category, undefined);
            assert.equal(legacy[i].tacticsKind, undefined);
        }
    }

    // 2. earthFixture runs and retains expected config and skill shapes
    const h = await earthFixture();
    assert.ok(h.profile);
    assert.ok(h.profile.earth);
    assert.equal(h.profile.earth.version, 'training-earth-v1');
    assert.ok(h.profile.capabilities.includes('earth'));
    const cp = await h.cp();
    assert.ok(cp.scene.earth);
});
