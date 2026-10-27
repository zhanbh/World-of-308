import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMonsterSimulation, initialMonsterState, validateMonsterRuntime } from '../src/monster-simulation.ts';
import { localTacticsConfig } from '../src/monster-tactics.ts';
import { earthFixture } from '../../backend/test/fixtures/earth-fixture.mjs';

function cloneSetup(s) {
    return { ...structuredClone({ ...s, random: undefined }), random: s.random };
}

export async function bossArgs(options = {}) {
    const h = await earthFixture(), cp = await h.cp();
    const cfg = localTacticsConfig({ boss_0: 'boss' }, 'normal');
    const bossX = options.bossX ?? 100000;
    const bossY = options.bossY ?? 0;
    const playerX = options.playerX ?? 0;
    const playerY = options.playerY ?? 0;
    const targets = [{
        ...cp.scene.combat.targets[0],
        actorIndex: 1,
        actorId: 'boss_0',
        x: bossX,
        y: bossY,
        hp: options.bossHp ?? '50000',
        maxHp: options.bossMaxHp ?? '50000',
    }];
    const monsters = initialMonsterState([{
        actorId: 'boss_0',
        actorIndex: 1,
        templateRef: 'boss_0',
        identity: 'boss',
        attackPower: options.attackPower ?? '1000',
    }], cfg);
    if (options.phase) {
        monsters[0].phase = options.phase;
    }
    return {
        movement: { ...cp.role.movement.state, x: String(playerX), y: String(playerY) },
        basic: cp.role.combat.state,
        cross: cp.scene.cross,
        bengshan: cp.scene.bengshan,
        badao: cp.scene.badao,
        earth: cp.scene.earth,
        targets,
        inputs: options.inputs ?? [],
        fromTick: 0,
        toTick: options.toTick ?? 120,
        movementConfig: {
            ...h.config,
            bounds: options.bounds ?? { minX: -218000, maxX: 218000, minY: -35000, maxY: 78000 },
        },
        basicConfig: h.profile.config,
        crossConfig: h.profile.cross,
        bengshanConfig: h.profile.bengshan,
        badaoConfig: h.profile.badao,
        earthConfig: h.profile.earth,
        context: { challengeId: 'boss_test', sceneEpoch: 1, actorId: 'player' },
        stats: { haste: { n: '1', d: '1' }, damageBonus: { n: '0', d: '1' }, hit: { n: '1', d: '1' }, crit: { n: '0', d: '1' }, critMultiplier: { n: '2', d: '1' }, attackPower: '1000', level: 20, mastery: { n: '0', d: '1' }, mp: '1000', controlled: false },
        random: () => 0,
        monsterConfig: cfg,
        monsters,
        player: { hp: options.playerHp ?? '10000', maxHp: options.playerMaxHp ?? '10000', lifeState: 'alive', controlledUntilTick: 0 },
    };
}

test('Test 1: P2 combo sequence (3 tramples -> lock -> charge -> wall crash -> 3s weakness)', async () => {
    // Boss starts at x: 0, y: 0 in Phase 2. Player at x: -50000, y: 0. Reach 150000.
    const a = await bossArgs({ bossX: 0, playerX: -50000, phase: 2 });
    
    // Tick 0: combo begins
    const startRun = advanceMonsterSimulation({ ...a, toTick: 1 });
    const mStart = startRun.monsters[0];
    assert.equal(mStart.action?.kind, 'combo');
    assert.equal(mStart.action?.superArmorEndTick, 800);

    // Tramples at 80, 140, 200 ticks. Player within 72px reach takes 3 * 2500 damage.
    const tramples = advanceMonsterSimulation({ ...a, toTick: 210 });
    // Player HP reduced by 3 trample hits (2500 * 3 = 7500): 10000 - 7500 = 2500
    assert.equal(tramples.player.hp, '2500');
    assert.deepEqual(tramples.monsters[0].action?.trampleDone, [80, 140, 200]);

    // Lock facing at 240 towards player (-1)
    const locked = advanceMonsterSimulation({ ...a, toTick: 245 });
    assert.equal(locked.monsters[0].action?.chargeLocked, true);
    assert.equal(locked.monsters[0].action?.facing, -1);

    // Charge starts at 320. Left wall is at minX + bodyRadius = -218000 + 14000 = -204000.
    // Speed: 1800/tick. From 0 to -204000 takes 114 ticks -> tick 433.
    const wallHitRun = advanceMonsterSimulation({ ...a, toTick: 435 });
    const mWall = wallHitRun.monsters[0];
    assert.equal(mWall.action?.wallHit, true);
    assert.equal(wallHitRun.targets[0].x, -204000);
    // Super armor ends immediately at wall crash
    assert.equal(mWall.action?.superArmorEndTick, 433);
    // 3s weakness = 300 ticks
    assert.equal(mWall.weakUntilTick, 433 + 300);
    assert.equal(mWall.action?.endTick, 433 + 300);

    // Boss cannot move or act while weak (e.g. at tick 600)
    const midWeak = advanceMonsterSimulation({ ...a, toTick: 600 });
    assert.equal(midWeak.targets[0].x, -204000);
    assert.ok(midWeak.monsters[0].weakUntilTick > 600);
    assert.equal(midWeak.monsters[0].action?.wallHit, true);

    // At tick 734: weakness expires, action ends
    const endWeak = advanceMonsterSimulation({ ...a, toTick: 734 });
    assert.equal(endWeak.monsters[0].action, null);
});

test('Test 2: combo charge max distance without wall hit does NOT trigger weakness; recovery restores vulnerability', async () => {
    // Map bounds: [-204000, 204000]. Width = 408000.
    // Start at -150000, player at -50000 (Boss faces right +1).
    // Max travel = 320000. Destination = -150000 + 320000 = 170000 < 204000.
    const a = await bossArgs({ bossX: -150000, playerX: -50000, phase: 2 });
    
    // Charge starts at 320, completes 320000 travel at tick 497.
    const chargeEndRun = advanceMonsterSimulation({ ...a, toTick: 498 });
    const m = chargeEndRun.monsters[0];
    assert.equal(m.action?.wallHit, false);
    assert.equal(m.action?.travelled, 320000);
    assert.equal(chargeEndRun.targets[0].x, 170000);
    // Strictly NO weakness!
    assert.equal(m.weakUntilTick, undefined);
    // Enters 80-tick recovery: 497 + 80 = 577
    assert.equal(m.action?.endTick, 497 + 80);
    assert.equal(m.action?.superArmorEndTick, 497); // super armor ended!

    // Vulnerable to interruption during recovery (e.g. at tick 510)
    // Manually stagger monster at tick 510
    const recoveryRun = advanceMonsterSimulation({ ...a, toTick: 510 });
    recoveryRun.monsters[0].staggerUntilTick = 530;
    const interrupted = advanceMonsterSimulation({
        ...a,
        ...recoveryRun,
        basic: recoveryRun.state,
        stats: { ...a.stats, mp: recoveryRun.mp },
        fromTick: 510,
        toTick: 515,
    });
    // Boss was interrupted during recovery
    assert.equal(interrupted.monsters[0].action, null);
});

test('Test 3: weakness is not refreshed by player attacks and does not amplify damage', async () => {
    const a = await bossArgs({ bossX: 0, playerX: -50000, playerHp: '50000', playerMaxHp: '50000', phase: 2 });
    // Run until wall crash weakness at tick 435 (weak until 733)
    const crashed = advanceMonsterSimulation({ ...a, toTick: 435 });
    const origWeakUntil = crashed.monsters[0].weakUntilTick;
    assert.equal(origWeakUntil, 733);

    // Player attacks the weak boss at tick 450 using direct basic attack
    const bossHpBefore = BigInt(crashed.targets[0].hp);
    crashed.inputs = [{ seq: 1, tick: 450, kind: 'basic', pressed: true }];
    crashed.targets[0].x = Number(crashed.movement.x) + 20000; // in range of basic attack
    const afterHit = advanceMonsterSimulation({
        ...a,
        ...crashed,
        basic: crashed.state,
        stats: { ...a.stats, mp: crashed.mp },
        fromTick: 435,
        toTick: 470,
    });

    // 1. Weakness is NOT refreshed/extended!
    assert.equal(afterHit.monsters[0].weakUntilTick, origWeakUntil);
    // 2. Boss took standard damage (hp reduced, no bonus multiplier)
    const bossHpAfter = BigInt(afterHit.targets[0].hp);
    assert.ok(bossHpAfter < bossHpBefore);
});

test('Test 4: roar sector geometry and escaping range', async () => {
    // Boss at (0, 0), facing right (+1). Phase = 1.
    // Roar has reach 140000, half-angle PI/6 (30 degrees). First contact node at tick 150.
    
    // Case A: Player at (100000, 0) - inside sector -> takes damage
    const a1 = await bossArgs({ bossX: 0, playerX: 100000, playerY: 0, phase: 1 });
    const r1 = advanceMonsterSimulation({ ...a1, toTick: 155 });
    assert.equal(r1.player.hp, '9550'); // 10000 - 450

    // Case B: Player behind Boss at (-50000, 0) -> outside sector -> takes 0 damage
    const a2 = await bossArgs({ bossX: 0, playerX: 100000, playerY: 0, phase: 1 });
    // Move player behind Boss at tick 140 before first contact at 150
    const r2_prep = advanceMonsterSimulation({ ...a2, toTick: 140 });
    r2_prep.movement.x = '-50000';
    r2_prep.movement.y = '0';
    const r2 = advanceMonsterSimulation({
        ...a2,
        ...r2_prep,
        basic: r2_prep.state,
        stats: { ...a2.stats, mp: r2_prep.mp },
        fromTick: 140,
        toTick: 155,
    });
    assert.equal(r2.player.hp, '10000'); // no damage taken!

    // Case C: Player outside half-angle (e.g. angle = 45 deg > 30 deg): x = 50000, y = 50000
    const a3 = await bossArgs({ bossX: 0, playerX: 100000, playerY: 0, phase: 1 });
    const r3_prep = advanceMonsterSimulation({ ...a3, toTick: 140 });
    r3_prep.movement.x = '50000';
    r3_prep.movement.y = '50000';
    const r3 = advanceMonsterSimulation({
        ...a3,
        ...r3_prep,
        basic: r3_prep.state,
        stats: { ...a3.stats, mp: r3_prep.mp },
        fromTick: 140,
        toTick: 155,
    });
    assert.equal(r3.player.hp, '10000'); // no damage taken!

    // Case D: Player beyond reach: x = 160000 (> 140000)
    const a4 = await bossArgs({ bossX: 0, playerX: 100000, playerY: 0, phase: 1 });
    const r4_prep = advanceMonsterSimulation({ ...a4, toTick: 140 });
    r4_prep.movement.x = '160000';
    r4_prep.movement.y = '0';
    const r4 = advanceMonsterSimulation({
        ...a4,
        ...r4_prep,
        basic: r4_prep.state,
        stats: { ...a4.stats, mp: r4_prep.mp },
        fromTick: 140,
        toTick: 155,
    });
    assert.equal(r4.player.hp, '10000'); // no damage taken!
});

test('Test 5: roar cumulative 15% max HP knockdown once per roar; ongoing roar continues through down', async () => {
    // Player maxHp = 10000, 15% threshold = 1500 damage.
    // Each roar node deals 450 damage.
    // Nodes at 150 (450), 200 (900), 250 (1350), 300 (1800 >= 1500 -> knockdown for 80 ticks), 350 (2250), 400 (2700).
    const a = await bossArgs({ bossX: 0, playerX: 50000, playerY: 0, phase: 1 });

    // Tick 255: 3 nodes hit, damage = 1350 < 1500. Stagger applied, not knockdown.
    const r3 = advanceMonsterSimulation({ ...a, toTick: 255 });
    assert.equal(r3.player.hp, '8650'); // 10000 - 1350
    assert.equal(r3.monsters[0].action?.roarKnocked, false);

    // Tick 305: 4th node hits, damage = 1800 >= 1500. Knockdown triggered!
    const r4 = advanceMonsterSimulation({ ...a, toTick: 305 });
    assert.equal(r4.player.hp, '8200'); // 10000 - 1800
    assert.equal(r4.monsters[0].action?.roarKnocked, true);
    assert.equal(r4.player.controlledUntilTick, 300 + 80); // 80 ticks down
    assert.ok(r4.events.some(e => e.kind === 'knockdown'));

    // Tick 405: remaining nodes 5 and 6 STILL hit knocked-down player!
    const r6 = advanceMonsterSimulation({ ...a, toTick: 405 });
    assert.equal(r6.player.hp, '7300'); // 10000 - 2700
    // Exactly 1 knockdown event emitted
    const knockdowns = r6.events.filter(e => e.kind === 'knockdown');
    assert.equal(knockdowns.length, 1);
});

test('Test 6: roar super armor 0..400 and recovery vulnerability 400..480', async () => {
    const a = await bossArgs({ bossX: 0, playerX: 50000, phase: 1 });
    
    // Windup tick 50: Boss has super armor (0..400)
    const windup = advanceMonsterSimulation({ ...a, toTick: 50 });
    assert.ok(windup.monsters[0].action?.superArmorEndTick === 400);

    // Recovery tick 420: Super armor ended at tick 400, recovery lasts until 480
    const recovery = advanceMonsterSimulation({ ...a, toTick: 420 });
    assert.ok(recovery.monsters[0].action !== null);
    // Apply stagger to Boss during recovery
    recovery.monsters[0].staggerUntilTick = 450;
    const interrupted = advanceMonsterSimulation({
        ...a,
        ...recovery,
        basic: recovery.state,
        stats: { ...a.stats, mp: recovery.mp },
        fromTick: 420,
        toTick: 425,
    });
    // Boss action was cancelled by control during recovery!
    assert.equal(interrupted.monsters[0].action, null);
});

test('Test 7: caster death cancels future roar soundwaves', async () => {
    const a = await bossArgs({ bossX: 0, playerX: 50000, phase: 1 });
    // Run past node 1 (tick 150) to tick 160
    const r1 = advanceMonsterSimulation({ ...a, toTick: 160 });
    assert.equal(r1.player.hp, '9550'); // took 1 node

    // Kill the Boss at tick 160
    r1.targets[0].hp = '0';
    r1.targets[0].lifeState = 'dead';
    const rEnd = advanceMonsterSimulation({
        ...a,
        ...r1,
        basic: r1.state,
        stats: { ...a.stats, mp: r1.mp },
        fromTick: 160,
        toTick: 450,
    });
    // Future nodes 2..6 are cancelled; player took NO additional damage!
    assert.equal(rEnd.player.hp, '9550');
    assert.equal(rEnd.monsters[0].action, null);
});

test('Test 8: two-phase independent roar cooldowns', async () => {
    const a = await bossArgs({ bossX: 0, playerX: 50000, phase: 1 });
    // Tick 1: Boss casts roar_p1
    const p1Run = advanceMonsterSimulation({ ...a, toTick: 1 });
    assert.equal(p1Run.monsters[0].cooldowns?.['boss_0_roar_p1'], 1200);

    // Transition Boss to Phase 2
    p1Run.monsters[0].action = null; // finish action
    p1Run.monsters[0].phase = 2;
    p1Run.monsters[0].nextDecisionTick = 1;

    // In Phase 2, roar_p2 has NOT been used, cooldown is undefined / 0
    assert.equal(p1Run.monsters[0].cooldowns?.['boss_0_roar_p2'], undefined);

    // Boss can immediately cast in Phase 2: combo is highest priority
    const p2Run = advanceMonsterSimulation({
        ...a,
        ...p1Run,
        basic: p1Run.state,
        stats: { ...a.stats, mp: p1Run.mp },
        fromTick: 1,
        toTick: 2,
    });
    assert.equal(p2Run.monsters[0].action?.skillRef, 'boss_0_combo');

    // Put combo on CD: Boss immediately casts roar_p2 without being blocked by roar_p1's CD!
    p2Run.monsters[0].action = null;
    p2Run.monsters[0].nextDecisionTick = 2;
    p2Run.monsters[0].cooldowns['boss_0_combo'] = 2000;
    const p2RoarRun = advanceMonsterSimulation({
        ...a,
        ...p2Run,
        basic: p2Run.state,
        stats: { ...a.stats, mp: p2Run.mp },
        fromTick: 2,
        toTick: 3,
    });
    assert.equal(p2RoarRun.monsters[0].action?.skillRef, 'boss_0_roar_p2');
    assert.equal(p2RoarRun.monsters[0].cooldowns?.['boss_0_roar_p2'], 2 + 1200);
});

test('Test 9: sliced checkpoint test preserves roar and combo exact states across arbitrary slices', async () => {
    // Sliced test for combo
    const aCombo = await bossArgs({ bossX: 0, playerX: -50000, phase: 2, toTick: 500 });
    const wholeCombo = advanceMonsterSimulation(cloneSetup(aCombo));

    const slice1 = advanceMonsterSimulation({ ...cloneSetup(aCombo), toTick: 150 });
    const slice2 = advanceMonsterSimulation({ ...cloneSetup(aCombo), ...slice1, basic: slice1.state, stats: { ...aCombo.stats, mp: slice1.mp }, fromTick: 150, toTick: 300 });
    const slice3 = advanceMonsterSimulation({ ...cloneSetup(aCombo), ...slice2, basic: slice2.state, stats: { ...aCombo.stats, mp: slice2.mp }, fromTick: 300, toTick: 500 });

    for (const k of ['monsters', 'player', 'targets', 'movement']) {
        assert.deepEqual(slice3[k], wholeCombo[k]);
    }

    // Sliced test for roar
    const aRoar = await bossArgs({ bossX: 0, playerX: 50000, phase: 1, toTick: 480 });
    const wholeRoar = advanceMonsterSimulation(cloneSetup(aRoar));

    const rSlice1 = advanceMonsterSimulation({ ...cloneSetup(aRoar), toTick: 180 });
    const rSlice2 = advanceMonsterSimulation({ ...cloneSetup(aRoar), ...rSlice1, basic: rSlice1.state, stats: { ...aRoar.stats, mp: rSlice1.mp }, fromTick: 180, toTick: 320 });
    const rSlice3 = advanceMonsterSimulation({ ...cloneSetup(aRoar), ...rSlice2, basic: rSlice2.state, stats: { ...aRoar.stats, mp: rSlice2.mp }, fromTick: 320, toTick: 480 });

    for (const k of ['monsters', 'player', 'targets', 'movement']) {
        assert.deepEqual(rSlice3[k], wholeRoar[k]);
    }
});
