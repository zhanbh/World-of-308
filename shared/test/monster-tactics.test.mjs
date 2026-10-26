import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMonsterSimulation, initialMonsterState, validateMonsterRuntime } from '../src/monster-simulation.ts';
import { localTacticsConfig } from '../src/monster-tactics.ts';
import { earthFixture } from '../../backend/test/fixtures/earth-fixture.mjs';

export async function tacticsArgs(kind = 'ranged', difficulty = 'normal', monsterCount = 1) {
    const h = await earthFixture(), cp = await h.cp();
    const mapping = {};
    for (let i = 0; i < monsterCount; i++) mapping[`test_${i}`] = kind;
    const cfg = localTacticsConfig(mapping, difficulty);
    const targets = cp.scene.combat.targets.slice(0, monsterCount).map((t, i) => ({ ...t, actorId: `monster_${i}`, actorIndex: i + 1, x: 100000 + i * 20000, y: 0 }));
    return {
        movement: { ...cp.role.movement.state, x: '0', y: '0' },
        basic: cp.role.combat.state,
        cross: cp.scene.cross,
        bengshan: cp.scene.bengshan,
        badao: cp.scene.badao,
        earth: cp.scene.earth,
        targets,
        inputs: [],
        fromTick: 0,
        toTick: 120,
        movementConfig: h.config,
        basicConfig: h.profile.config,
        crossConfig: h.profile.cross,
        bengshanConfig: h.profile.bengshan,
        badaoConfig: h.profile.badao,
        earthConfig: h.profile.earth,
        context: { challengeId: 'tactics', sceneEpoch: 1, actorId: 'player' },
        stats: { haste: { n: '1', d: '1' }, damageBonus: { n: '0', d: '1' }, hit: { n: '1', d: '1' }, crit: { n: '0', d: '1' }, critMultiplier: { n: '2', d: '1' }, attackPower: '1000', level: 20, mastery: { n: '0', d: '1' }, mp: '1000', controlled: false },
        random: () => 0,
        monsterConfig: cfg,
        monsters: initialMonsterState(targets.map((t, i) => ({ actorId: t.actorId, actorIndex: t.actorIndex, templateRef: `test_${i}`, identity: 'ordinary', attackPower: '1000' })), cfg),
        player: { hp: '10000', maxHp: '10000', lifeState: 'alive', controlledUntilTick: 0 },
    };
}

test('ranged releases a moving projectile; release and flight survive a sliced checkpoint', async () => {
    const a = await tacticsArgs();
    const release = advanceMonsterSimulation({ ...a, toTick: 81 });
    assert.equal(release.player.hp, '10000');
    assert.equal(release.monsters[0].tactics.effects.length, 1);
    const whole = advanceMonsterSimulation(a), tail = advanceMonsterSimulation({ ...a, ...release, basic: release.state, stats: { ...a.stats, mp: release.mp }, fromTick: 81 });
    assert.equal(whole.player.hp, '9000');
    for (const k of ['monsters', 'player', 'targets', 'movement'])
        assert.deepEqual(tail[k], whole[k]);
    assert.deepEqual([...release.events, ...tail.events], whole.events);
});

test('projectile interrupted before release is cancelled; caster interrupted after release preserves in-flight projectile', async () => {
    // 1. Windup interrupt: stagger monster at tick 40 before hitTick 80
    const a1 = await tacticsArgs();
    a1.inputs = [{ seq: 1, tick: 20, kind: 'skill', skillId: 'cross' }];
    a1.crossConfig = structuredClone(a1.crossConfig);
    a1.crossConfig.nodeOffsetsUs = [200000, 300000]; // impact at tick 40
    a1.targets[0].x = 10000; // put monster in cross reach
    const interruptedBefore = advanceMonsterSimulation({ ...a1, toTick: 85 });
    // Monster staggered at tick 40, action cancelled, no projectile launched
    assert.equal(interruptedBefore.monsters[0].action, null);
    assert.equal(interruptedBefore.monsters[0].tactics.effects.length, 0);

    // 2. Post-release interrupt: monster staggered at tick 85 (after projectile launched at tick 80)
    const a2 = await tacticsArgs();
    const afterRelease = advanceMonsterSimulation({ ...a2, toTick: 81 });
    assert.equal(afterRelease.monsters[0].tactics.effects.length, 1);
    // Stagger the monster manually at tick 81
    afterRelease.monsters[0].staggerUntilTick = 120;
    afterRelease.monsters[0].action = null;
    const finalRun = advanceMonsterSimulation({ ...a2, ...afterRelease, basic: afterRelease.state, stats: { ...a2.stats, mp: afterRelease.mp }, fromTick: 81, toTick: 120 });
    // In-flight projectile survives caster stagger and hits player!
    assert.equal(finalRun.player.hp, '9000');
    assert.equal(finalRun.monsters[0].tactics.effects.length, 0);
});

test('charge locks direction, sweeps across map, deals damage on contact, and respects boundary', async () => {
    const a = await tacticsArgs('charge', 'normal');
    // Monster is at (100000, 0), player at (0, 0). Reach is 150000.
    // At tick 0: monster starts charge (windup: 70 ticks, active sweep: 35 ticks, recovery: 70 ticks)
    const windup = advanceMonsterSimulation({ ...a, toTick: 70 });
    assert.equal(windup.player.hp, '10000');
    assert.equal(windup.targets[0].x, 100000); // stationary during windup
    assert.ok(windup.monsters[0].action !== null);

    // During active sweep (ticks 70..105): monster sweeps towards player
    const sweeping = advanceMonsterSimulation({ ...a, toTick: 90 });
    assert.ok(sweeping.targets[0].x < 100000); // sweeping forward!
    assert.equal(sweeping.player.hp, '9000'); // contacted and damaged player!
    assert.ok(sweeping.player.controlledUntilTick > 90); // player staggered

    // Full run and sliced run equivalence
    const whole = advanceMonsterSimulation({ ...a, toTick: 175 });
    const tail = advanceMonsterSimulation({ ...a, ...windup, basic: windup.state, stats: { ...a.stats, mp: windup.mp }, fromTick: 70, toTick: 175 });
    for (const k of ['monsters', 'player', 'targets', 'movement'])
        assert.deepEqual(tail[k], whole[k]);
    assert.deepEqual([...windup.events, ...tail.events], whole.events);
});

test('four-tier difficulty role assignments match candidate bounds', async () => {
    const checkRoles = async (diff, kinds) => {
        const h = await earthFixture(), cp = await h.cp();
        const mapping = {};
        kinds.forEach((k, i) => mapping[`tmpl_${i}`] = k);
        const cfg = localTacticsConfig(mapping, diff);
        const spawns = kinds.map((_, i) => ({ actorId: `m_${i}`, actorIndex: i + 1, templateRef: `tmpl_${i}`, identity: 'ordinary', attackPower: '1000' }));
        const st = initialMonsterState(spawns, cfg);
        return st.map(m => m.tactics.role);
    };

    // Normal: 0 flankers, 0 retreaters
    const normalRoles = await checkRoles('normal', ['melee', 'melee', 'melee', 'ranged', 'charge']);
    assert.deepEqual(normalRoles, ['frontline', 'frontline', 'frontline', 'artillery', 'charger']);

    // Adventure: 1 flanker, 0 retreaters
    const advRoles = await checkRoles('adventure', ['melee', 'melee', 'melee', 'ranged']);
    assert.deepEqual(advRoles, ['flanker', 'frontline', 'frontline', 'artillery']);

    // Warrior: 1 flanker, 1 retreater
    const warRoles = await checkRoles('warrior', ['melee', 'melee', 'melee', 'ranged']);
    assert.deepEqual(warRoles, ['flanker', 'frontline', 'frontline', 'artillery']);

    // King: 2 flankers, 1 retreater
    const kingRoles = await checkRoles('king', ['melee', 'melee', 'melee', 'ranged']);
    assert.deepEqual(kingRoles, ['flanker', 'flanker', 'frontline', 'artillery']);
});

test('difficulty retreat behavior: warrior ranged retreats when player < 95px; normal ranged does not retreat', async () => {
    // Under warrior: player at (0, 0), ranged monster at (80000, 0) (80px < 95px trigger).
    // Monster should retreat away from player (intentX > 0).
    const aWar = await tacticsArgs('ranged', 'warrior');
    aWar.targets[0].x = 80000;
    aWar.monsters[0].readyAtTick = 0;
    const rWar = advanceMonsterSimulation({ ...aWar, toTick: 10 });
    // Monster moves away from player towards retreat distance 120px
    assert.ok(rWar.targets[0].x > 80000, `Warrior ranged should retreat away: ${rWar.targets[0].x} > 80000`);

    // Under normal: player at (0, 0), ranged monster at (80000, 0). Max retreaters is 0.
    // Monster does not retreat, but attacks since distance <= 210px reach.
    const aNorm = await tacticsArgs('ranged', 'normal');
    aNorm.targets[0].x = 80000;
    const rNorm = advanceMonsterSimulation({ ...aNorm, toTick: 10 });
    assert.equal(rNorm.targets[0].x, 80000, 'Normal ranged should stay and attack, not retreat');
    assert.ok(rNorm.monsters[0].action !== null, 'Normal ranged should initiate attack');
});

test('special attack concurrency cap delays second special attack without consuming cooldown', async () => {
    // Normal difficulty: specialCap is 1. Two ranged monsters at 100px.
    const a = await tacticsArgs('ranged', 'normal', 2);
    // Tick 0: monster 1 starts ranged skill. Monster 2 is ready but specialCap (1) is active.
    const r = advanceMonsterSimulation({ ...a, toTick: 10 });
    assert.ok(r.monsters[0].action !== null, 'First monster gets special permit');
    assert.equal(r.monsters[1].action, null, 'Second monster waits for special permit');
    // Cooldown is NOT pre-consumed for waiting monster!
    assert.equal(r.monsters[1].readyAtTick, 0, 'Waiting monster retains readyAtTick');
});

test('mixed encounter: melee, ranged, and charge monsters fight simultaneously; sliced checkpoint preserves exact outcome', async () => {
    const h = await earthFixture(), cp = await h.cp();
    const cfg = localTacticsConfig({ 'melee_tmpl': 'melee', 'ranged_tmpl': 'ranged', 'charge_tmpl': 'charge' }, 'warrior');
    const targets = [
        { ...cp.scene.combat.targets[0], actorId: 'm_melee', actorIndex: 1, x: 40000, y: 0 },
        { ...cp.scene.combat.targets[1], actorId: 'm_ranged', actorIndex: 2, x: 120000, y: 0 },
        { ...cp.scene.combat.targets[2], actorId: 'm_charge', actorIndex: 3, x: 140000, y: 0 },
    ];
    const spawns = [
        { actorId: 'm_melee', actorIndex: 1, templateRef: 'melee_tmpl', identity: 'ordinary', attackPower: '500' },
        { actorId: 'm_ranged', actorIndex: 2, templateRef: 'ranged_tmpl', identity: 'ordinary', attackPower: '1000' },
        { actorId: 'm_charge', actorIndex: 3, templateRef: 'charge_tmpl', identity: 'ordinary', attackPower: '1500' },
    ];
    const a = {
        movement: { ...cp.role.movement.state, x: '0', y: '0' },
        basic: cp.role.combat.state,
        cross: cp.scene.cross,
        bengshan: cp.scene.bengshan,
        badao: cp.scene.badao,
        earth: cp.scene.earth,
        targets,
        inputs: [],
        fromTick: 0,
        toTick: 150,
        movementConfig: h.config,
        basicConfig: h.profile.config,
        crossConfig: h.profile.cross,
        bengshanConfig: h.profile.bengshan,
        badaoConfig: h.profile.badao,
        earthConfig: h.profile.earth,
        context: { challengeId: 'mixed', sceneEpoch: 1, actorId: 'player' },
        stats: { haste: { n: '1', d: '1' }, damageBonus: { n: '0', d: '1' }, hit: { n: '1', d: '1' }, crit: { n: '0', d: '1' }, critMultiplier: { n: '2', d: '1' }, attackPower: '1000', level: 20, mastery: { n: '0', d: '1' }, mp: '1000', controlled: false },
        random: () => 0,
        monsterConfig: cfg,
        monsters: initialMonsterState(spawns, cfg),
        player: { hp: '20000', maxHp: '20000', lifeState: 'alive', controlledUntilTick: 0 },
    };

    const whole = advanceMonsterSimulation(a);
    // Sliced across multiple arbitrary ticks
    let last = a, events = [];
    for (const [f, t] of [[0, 35], [35, 80], [80, 110], [110, 150]]) {
        const slice = advanceMonsterSimulation({
            ...a,
            ...last,
            basic: last.state ?? a.basic,
            stats: { ...a.stats, mp: last.mp ?? a.stats.mp },
            fromTick: f,
            toTick: t,
        });
        events.push(...slice.events);
        last = slice;
    }

    for (const k of ['monsters', 'player', 'targets', 'movement'])
        assert.deepEqual(last[k], whole[k]);
    assert.deepEqual(events, whole.events);
});

test('strict validation: rejects falsy non-null tactics and invalid effect kind', async () => {
    const valid = {
        actorId: 'm1',
        actorIndex: 1,
        templateRef: 'test',
        identity: 'ordinary',
        attackPower: '1000',
        nextDecisionTick: 0,
        readyAtTick: 0,
        sequence: 0,
        action: null,
        staggerUntilTick: 0,
        intentX: 0,
        intentY: 0,
        remainderX: '0',
        remainderY: '0',
        tactics: { role: 'frontline', effects: [] },
    };

    // Valid passes
    assert.ok(validateMonsterRuntime(valid));

    // Falsy non-null values for tactics MUST be rejected
    assert.throws(() => validateMonsterRuntime({ ...valid, tactics: false }), /INVALID_MONSTER_CONFIG/);
    assert.throws(() => validateMonsterRuntime({ ...valid, tactics: null }), /INVALID_MONSTER_CONFIG/);
    assert.throws(() => validateMonsterRuntime({ ...valid, tactics: '' }), /INVALID_MONSTER_CONFIG/);
    assert.throws(() => validateMonsterRuntime({ ...valid, tactics: 0 }), /INVALID_MONSTER_CONFIG/);

    // Invalid role or invalid effect kind
    assert.throws(() => validateMonsterRuntime({ ...valid, tactics: { role: 'invalid_role', effects: [] } }), /INVALID_MONSTER_CONFIG/);
    assert.throws(() => validateMonsterRuntime({ ...valid, tactics: { role: 'frontline', effects: [{ kind: 'unknown' }] } }), /INVALID_MONSTER_EFFECT/);
});
