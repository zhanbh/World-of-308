import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMonsterSimulation, initialMonsterState, validateMonsterRuntime } from '../src/monster-simulation.ts';
import { localTacticsConfig } from '../src/monster-tactics.ts';
import { earthFixture } from '../../backend/test/fixtures/earth-fixture.mjs';

function makeTarget(actorId, actorIndex, x, y, hp, maxHp) {
    return {
        actorId,
        actorIndex,
        x,
        y,
        hp,
        maxHp,
        lifeState: 'alive',
        mitigation: { n: '0', d: '1' },
        evasion: { n: '0', d: '1' },
        damageImmune: false,
        controlImmune: false,
        directSinceRise: '0',
        downUntilTick: null,
    };
}

function cloneSetup(s) {
    return {
        ...s,
        movement: structuredClone(s.movement),
        basic: structuredClone(s.basic),
        cross: structuredClone(s.cross),
        bengshan: structuredClone(s.bengshan),
        badao: structuredClone(s.badao),
        earth: structuredClone(s.earth),
        targets: structuredClone(s.targets),
        inputs: structuredClone(s.inputs),
        monsters: structuredClone(s.monsters),
        player: structuredClone(s.player),
        monsterConfig: structuredClone(s.monsterConfig),
    };
}

async function createEliteBossSetup(difficulty = 'normal') {
    const h = await earthFixture();
    const cp = await h.cp();
    const monsterConfig = localTacticsConfig({
        'elite_guard': 'elite',
        'bull_boss': 'boss',
    }, difficulty);

    const baseTargets = [
        makeTarget('elite_1', 1, 50000, 0, '1000', '1000'),
        makeTarget('boss_1', 2, 60000, 0, '2000', '2000'),
    ];

    const spawns = [
        { actorId: 'elite_1', actorIndex: 1, templateRef: 'elite_guard', identity: 'elite', attackPower: '1000' },
        { actorId: 'boss_1', actorIndex: 2, templateRef: 'bull_boss', identity: 'boss', attackPower: '2000' },
    ];

    const monsters = initialMonsterState(spawns, monsterConfig);

    return {
        movement: { ...cp.role.movement.state, x: '0', y: '0', facing: 1 },
        basic: cp.role.combat.state,
        cross: cp.scene.cross,
        bengshan: cp.scene.bengshan,
        badao: cp.scene.badao,
        earth: cp.scene.earth,
        targets: baseTargets,
        inputs: [],
        fromTick: 0,
        toTick: 10,
        movementConfig: h.config,
        basicConfig: h.profile.config,
        crossConfig: h.profile.cross,
        bengshanConfig: h.profile.bengshan,
        badaoConfig: h.profile.badao,
        earthConfig: h.profile.earth,
        context: { challengeId: 'elite-boss', sceneEpoch: 1, actorId: 'player' },
        stats: {
            haste: { n: '1', d: '1' },
            damageBonus: { n: '0', d: '1' },
            hit: { n: '1', d: '1' },
            crit: { n: '0', d: '1' },
            critMultiplier: { n: '2', d: '1' },
            attackPower: '1000',
            level: 20,
            mastery: { n: '0', d: '1' },
            mp: '1000',
            x: 0,
            y: 0,
            facing: 1,
            controlled: false,
        },
        random: () => 0,
        monsterConfig,
        monsters,
        player: { hp: '10000', maxHp: '10000', lifeState: 'alive', controlledUntilTick: 0 },
    };
}

test('Test 1: cleave damage does not interrupt; legal control cancels future contact and retains CD', async () => {
    const s = await createEliteBossSetup();
    const eliteCfg = localTacticsConfig({ 'elite_1': 'cleave' });
    const spawns = [{ actorId: 'elite_1', actorIndex: 1, templateRef: 'elite_1', identity: 'elite', attackPower: '1000' }];
    const monsters = initialMonsterState(spawns, eliteCfg);
    const targets = [makeTarget('elite_1', 1, 40000, 0, '1000', '1000')];

    // Start cleave at tick 0 (windup 60, recovery 70, end 130, cd 300, no super armor)
    const run1 = advanceMonsterSimulation({
        ...s,
        monsterConfig: eliteCfg,
        monsters,
        targets,
        fromTick: 0,
        toTick: 10,
    });
    const m = run1.monsters[0];
    assert.ok(m.action !== null, 'Cleave should have started');
    assert.equal(m.action.startTick, 0);
    assert.equal(m.action.hitTick, 60);
    assert.equal(m.action.endTick, 130);
    assert.equal(m.cooldowns['elite_1_skill'], 300);

    // Apply mere damage without control at tick 20 -> action continues!
    run1.targets[0].hp = '800';
    const run2 = advanceMonsterSimulation({
        ...s,
        ...run1,
        monsterConfig: eliteCfg,
        fromTick: 10,
        toTick: 30,
        inputs: [],
    });
    assert.ok(run2.monsters[0].action !== null, 'Mere damage does not interrupt unarmored windup');

    // Apply legal control at tick 30 (e.g. staggerUntilTick = 40)
    run2.monsters[0].staggerUntilTick = 40;
    const run3 = advanceMonsterSimulation({
        ...s,
        ...run2,
        monsterConfig: eliteCfg,
        fromTick: 30,
        toTick: 70,
        inputs: [],
    });
    // Action should be cancelled, no hit emitted, CD remains 300
    assert.equal(run3.monsters[0].action, null, 'Legal control interrupts unarmored cleave');
    assert.equal(run3.monsters[0].cooldowns['elite_1_skill'], 300, 'Interruption retains cooldown without refund');
    // Player HP should remain untouched by cleave (hit at tick 60 was cancelled)
    const playerDamageEvents = run3.events.filter(e => e.kind === 'damage' && e.targetId === 'player');
    assert.equal(playerDamageEvents.length, 0, 'No contact event released after interruption');
});

test('Test 2: sweep/smash super armor blocks control, not damage; recovery restores control', async () => {
    const s = await createEliteBossSetup();
    const cfg = localTacticsConfig({ 'elite_sweep': 'sweep', 'boss_smash': 'smash' });
    const spawns = [
        { actorId: 'elite_sweep', actorIndex: 1, templateRef: 'elite_sweep', identity: 'elite', attackPower: '1000' },
        { actorId: 'boss_smash', actorIndex: 2, templateRef: 'boss_smash', identity: 'boss', attackPower: '1000' },
    ];
    const monsters = initialMonsterState(spawns, cfg);
    const targets = [
        makeTarget('elite_sweep', 1, 40000, 0, '1000', '1000'),
        makeTarget('boss_smash', 2, 40000, 0, '2000', '2000'),
    ];

    // Tick 0..10: actions start. Both sweep and smash have windup 100, superArmorTicks 115, end 200.
    const r1 = advanceMonsterSimulation({ ...s, monsterConfig: cfg, monsters, targets, fromTick: 0, toTick: 10 });
    assert.equal(r1.monsters[0].action.superArmorEndTick, 115);
    assert.equal(r1.monsters[1].action.superArmorEndTick, 115);

    // Tick 50 (during super armor): player inflicts control (staggerUntilTick = 80) and damage (hp - 200)
    r1.monsters[0].staggerUntilTick = 80;
    r1.targets[0].hp = '800';
    r1.monsters[1].staggerUntilTick = 80;
    r1.targets[1].hp = '1800';

    const r2 = advanceMonsterSimulation({ ...s, ...r1, monsterConfig: cfg, fromTick: 10, toTick: 105, inputs: [] });
    // Super armor prevented control interruption! Both actions are active and released hits at tick 100!
    assert.ok(r2.monsters[0].action.released, 'Sweep released hit during super armor');
    assert.ok(r2.monsters[1].action.released, 'Smash released hit during super armor');
    assert.equal(r2.targets[0].hp, '800', 'Damage was taken despite super armor');

    // Tick 120 (recovery phase: 115..200): super armor is OFF.
    // Apply control during recovery
    r2.monsters[0].staggerUntilTick = 160;
    r2.monsters[1].staggerUntilTick = 160;

    const r3 = advanceMonsterSimulation({ ...s, ...r2, monsterConfig: cfg, fromTick: 105, toTick: 130, inputs: [] });
    // In recovery, super armor has ended -> control interrupts action!
    assert.equal(r3.monsters[0].action, null, 'Sweep recovery phase interrupted by control');
    assert.equal(r3.monsters[1].action, null, 'Smash recovery phase interrupted by control');
});

test('Test 3: half HP waits current full action including recovery; phase does not reset cooldown', async () => {
    const s = await createEliteBossSetup();
    const bossCfg = localTacticsConfig({ 'boss_1': 'smash' });
    const spawns = [{ actorId: 'boss_1', actorIndex: 1, templateRef: 'boss_1', identity: 'boss', attackPower: '1000' }];
    const monsters = initialMonsterState(spawns, bossCfg);
    const targets = [makeTarget('boss_1', 1, 40000, 0, '1000', '1000')];

    // Start smash at tick 0 (windup 100, end 200, cd 400)
    const r1 = advanceMonsterSimulation({ ...s, monsterConfig: bossCfg, monsters, targets, fromTick: 0, toTick: 10 });
    assert.equal(r1.monsters[0].phase, 1);
    assert.equal(r1.monsters[0].pendingPhase, null);
    assert.equal(r1.monsters[0].cooldowns['boss_1_skill'], 400);

    // At tick 50, Boss HP is reduced to 490 (<= 50% of 1000)
    r1.targets[0].hp = '490';
    const r2 = advanceMonsterSimulation({ ...s, ...r1, monsterConfig: bossCfg, fromTick: 10, toTick: 60, inputs: [] });
    // Boss is in the middle of action, so pendingPhase = 2, phase stays 1!
    assert.equal(r2.monsters[0].phase, 1, 'Phase remains 1 while action is running');
    assert.equal(r2.monsters[0].pendingPhase, 2, 'Pending phase set to 2');
    assert.ok(r2.monsters[0].action !== null, 'Action continues without interruption');

    // At tick 150 (during recovery 115..200): still in action, phase remains 1
    const r3 = advanceMonsterSimulation({ ...s, ...r2, monsterConfig: bossCfg, fromTick: 60, toTick: 150, inputs: [] });
    assert.equal(r3.monsters[0].phase, 1, 'Phase remains 1 during recovery');
    assert.equal(r3.monsters[0].pendingPhase, 2);

    // At tick 200 (action finishes): phase transitions to 2!
    const r4 = advanceMonsterSimulation({ ...s, ...r3, monsterConfig: bossCfg, fromTick: 150, toTick: 205, inputs: [] });
    assert.equal(r4.monsters[0].phase, 2, 'Phase transitions to 2 after full recovery completes');
    assert.equal(r4.monsters[0].pendingPhase, null, 'Pending phase cleared');
    assert.equal(r4.monsters[0].action, null, 'Action ended');
    assert.equal(r4.monsters[0].cooldowns['boss_1_skill'], 400, 'Phase transition does not reset cooldown');
    assert.equal(r4.targets[0].hp, '490', 'Phase transition does not heal');
});

test('Test 4: unarmored windup interrupt resolves pending phase without CD refund', async () => {
    const s = await createEliteBossSetup();
    const bossCfg = localTacticsConfig({ 'boss_1': 'cleave' });
    const spawns = [{ actorId: 'boss_1', actorIndex: 1, templateRef: 'boss_1', identity: 'boss', attackPower: '1000' }];
    const monsters = initialMonsterState(spawns, bossCfg);
    const targets = [makeTarget('boss_1', 1, 40000, 0, '1000', '1000')];

    // Start unarmored cleave at tick 0 (windup 60, end 130, cd 300)
    const r1 = advanceMonsterSimulation({ ...s, monsterConfig: bossCfg, monsters, targets, fromTick: 0, toTick: 10 });
    assert.equal(r1.monsters[0].phase, 1);

    // At tick 20, Boss HP dropped to 400 (<= 50%)
    r1.targets[0].hp = '400';
    const r2 = advanceMonsterSimulation({ ...s, ...r1, monsterConfig: bossCfg, fromTick: 10, toTick: 30, inputs: [] });
    assert.equal(r2.monsters[0].pendingPhase, 2);
    assert.equal(r2.monsters[0].phase, 1);

    // At tick 30, legal control hits boss (staggerUntilTick = 50)
    r2.monsters[0].staggerUntilTick = 50;
    const r3 = advanceMonsterSimulation({ ...s, ...r2, monsterConfig: bossCfg, fromTick: 30, toTick: 40, inputs: [] });

    // Legal interruption cancels action and immediately resolves pendingPhase to 2!
    assert.equal(r3.monsters[0].action, null, 'Action cancelled by control');
    assert.equal(r3.monsters[0].phase, 2, 'Pending phase resolved immediately upon lawful interruption');
    assert.equal(r3.monsters[0].pendingPhase, null);
    assert.equal(r3.monsters[0].cooldowns['boss_1_skill'], 300, 'Cooldown is NOT refunded on interruption');
});

test('Test 5: death supersedes pending phase; posthumous phase transition blocked', async () => {
    const s = await createEliteBossSetup();
    const bossCfg = localTacticsConfig({ 'boss_1': 'smash' });
    const spawns = [{ actorId: 'boss_1', actorIndex: 1, templateRef: 'boss_1', identity: 'boss', attackPower: '1000' }];
    const monsters = initialMonsterState(spawns, bossCfg);
    const targets = [makeTarget('boss_1', 1, 40000, 0, '1000', '1000')];

    // Start smash at tick 0
    const r1 = advanceMonsterSimulation({ ...s, monsterConfig: bossCfg, monsters, targets, fromTick: 0, toTick: 10 });

    // Boss HP reduced to 500 at tick 30 -> pendingPhase = 2
    r1.targets[0].hp = '500';
    const r2 = advanceMonsterSimulation({ ...s, ...r1, monsterConfig: bossCfg, fromTick: 10, toTick: 40, inputs: [] });
    assert.equal(r2.monsters[0].pendingPhase, 2);
    assert.equal(r2.monsters[0].phase, 1);

    // At tick 50, Boss takes lethal damage -> HP becomes 0
    r2.targets[0].hp = '0';
    r2.targets[0].lifeState = 'dead';
    const r3 = advanceMonsterSimulation({ ...s, ...r2, monsterConfig: bossCfg, fromTick: 40, toTick: 250, inputs: [] });

    // Death supersedes pending phase!
    assert.equal(r3.targets[0].lifeState, 'dead');
    assert.equal(r3.monsters[0].phase, 1, 'Dead boss never enters phase 2 posthumously');
    assert.equal(r3.monsters[0].pendingPhase, null, 'Pending phase cleared on death');
    assert.equal(r3.monsters[0].action, null);
});

test('Test 6: phase transition preserves existing control state (stagger/knockdown)', async () => {
    const s = await createEliteBossSetup();
    const bossCfg = localTacticsConfig({ 'boss_1': 'smash' });
    const spawns = [{ actorId: 'boss_1', actorIndex: 1, templateRef: 'boss_1', identity: 'boss', attackPower: '1000' }];
    const monsters = initialMonsterState(spawns, bossCfg);
    const targets = [makeTarget('boss_1', 1, 40000, 0, '1000', '1000')];

    // Boss is idle at tick 0. Inflict stagger until tick 50, and knockdown until tick 60.
    monsters[0].staggerUntilTick = 50;
    targets[0].downUntilTick = 60;
    targets[0].hp = '400'; // <= 50% HP

    // Advance 0..10. Boss is idle and HP <= 50%, transitions to phase 2 immediately.
    const r = advanceMonsterSimulation({ ...s, monsterConfig: bossCfg, monsters, targets, fromTick: 0, toTick: 10 });
    assert.equal(r.monsters[0].phase, 2, 'Phase transitioned to 2');
    assert.equal(r.monsters[0].staggerUntilTick, 50, 'Stagger state preserved across phase transition');
    assert.equal(r.targets[0].downUntilTick, 60, 'Knockdown state preserved across phase transition');
});

test('Test 7: sliced checkpoint preserves exact elite & boss combat state, super armor, and pending phase', async () => {
    const s = await createEliteBossSetup();
    s.targets[0].hp = '1000';
    s.targets[1].hp = '2000';

    // Whole simulation 0..300
    // At tick 50, boss takes damage to 1200 (not <= 50%)
    // At tick 120, boss takes damage to 900 (<= 50% of 2000)
    const wholeSetup = cloneSetup(s);
    let wholeState = advanceMonsterSimulation({ ...wholeSetup, fromTick: 0, toTick: 50 });
    wholeState.targets[1].hp = '1200';
    wholeState = advanceMonsterSimulation({ ...wholeSetup, ...wholeState, fromTick: 50, toTick: 120, inputs: [] });
    wholeState.targets[1].hp = '900'; // Triggers pending phase
    wholeState = advanceMonsterSimulation({ ...wholeSetup, ...wholeState, fromTick: 120, toTick: 300, inputs: [] });

    // Sliced simulation: [0, 50], [50, 80], [80, 120], [120, 160], [160, 220], [220, 300]
    const slicedSetup = cloneSetup(s);
    let slicedState = advanceMonsterSimulation({ ...slicedSetup, fromTick: 0, toTick: 50 });
    slicedState.monsters = slicedState.monsters.map(validateMonsterRuntime);
    slicedState.targets[1].hp = '1200';

    slicedState = advanceMonsterSimulation({ ...slicedSetup, ...slicedState, fromTick: 50, toTick: 80, inputs: [] });
    slicedState.monsters = slicedState.monsters.map(validateMonsterRuntime);

    slicedState = advanceMonsterSimulation({ ...slicedSetup, ...slicedState, fromTick: 80, toTick: 120, inputs: [] });
    slicedState.monsters = slicedState.monsters.map(validateMonsterRuntime);
    slicedState.targets[1].hp = '900';

    slicedState = advanceMonsterSimulation({ ...slicedSetup, ...slicedState, fromTick: 120, toTick: 160, inputs: [] });
    slicedState.monsters = slicedState.monsters.map(validateMonsterRuntime);

    slicedState = advanceMonsterSimulation({ ...slicedSetup, ...slicedState, fromTick: 160, toTick: 220, inputs: [] });
    slicedState.monsters = slicedState.monsters.map(validateMonsterRuntime);

    slicedState = advanceMonsterSimulation({ ...slicedSetup, ...slicedState, fromTick: 220, toTick: 300, inputs: [] });
    slicedState.monsters = slicedState.monsters.map(validateMonsterRuntime);

    // Compare whole vs sliced states
    assert.deepEqual(slicedState.monsters, wholeState.monsters, 'Monsters runtime exactly matches across slices');
    assert.deepEqual(slicedState.targets, wholeState.targets, 'Combat targets exactly match across slices');
    assert.deepEqual(slicedState.player, wholeState.player, 'Player state exactly matches across slices');
    assert.deepEqual(slicedState.movement, wholeState.movement, 'Movement state exactly matches across slices');
});

test('Test 8: boss stomp super armor 0..150 and recovery 150..230 with CD 500', async () => {
    const s = await createEliteBossSetup();
    const bossCfg = localTacticsConfig({ 'boss_1': 'stomp' });
    const spawns = [{ actorId: 'boss_1', actorIndex: 1, templateRef: 'boss_1', identity: 'boss', attackPower: '1000' }];
    const monsters = initialMonsterState(spawns, bossCfg);
    const targets = [makeTarget('boss_1', 1, 40000, 0, '2000', '2000')];

    // Start stomp at tick 0 (windup 130, superArmorTicks 150, end 230, cd 500)
    const r1 = advanceMonsterSimulation({ ...s, monsterConfig: bossCfg, monsters, targets, fromTick: 0, toTick: 10 });
    assert.equal(r1.monsters[0].action.hitTick, 130);
    assert.equal(r1.monsters[0].action.superArmorEndTick, 150);
    assert.equal(r1.monsters[0].action.endTick, 230);
    assert.equal(r1.monsters[0].cooldowns['boss_1_skill'], 500);

    // Stagger at tick 140 (during super armor 0..150): action not interrupted
    r1.monsters[0].staggerUntilTick = 145;
    const r2 = advanceMonsterSimulation({ ...s, ...r1, monsterConfig: bossCfg, fromTick: 10, toTick: 148, inputs: [] });
    assert.ok(r2.monsters[0].action.released, 'Stomp released hit at tick 130 during super armor');
    assert.ok(r2.monsters[0].action !== null, 'Stomp not cancelled during super armor');

    // Stagger at tick 160 (during recovery 150..230): super armor has expired, action interrupted!
    r2.monsters[0].staggerUntilTick = 180;
    const r3 = advanceMonsterSimulation({ ...s, ...r2, monsterConfig: bossCfg, fromTick: 148, toTick: 170, inputs: [] });
    assert.equal(r3.monsters[0].action, null, 'Stomp interrupted during recovery phase');
    assert.equal(r3.monsters[0].cooldowns['boss_1_skill'], 500, 'Cooldown retained without refund');
});
