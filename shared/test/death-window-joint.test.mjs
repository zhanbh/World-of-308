import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMonsterSimulation, initialMonsterState } from '../src/monster-simulation.ts';
import { earthFixture } from '../../backend/test/fixtures/earth-fixture.mjs';

const testMonsterConfig = {
    version: 'local-melee-v1',
    decisionTicks: 5,
    control: { staggerTicks: 3, knockback: 100 },
    templates: {
        test: {
            type: 'humanoid',
            skillRef: 'heavy',
            behavior: 'chase',
            rewardTag: 'none',
            resist: { bleed: false, stagger: false, knockback: false, knockdown: false }
        }
    },
    skills: {
        heavy: {
            kind: 'melee',
            windupTicks: 2,
            recoveryTicks: 5,
            cooldownTicks: 50,
            rangeX: 500000,
            rangeY: 500000,
            speed: 1000,
            coefficient: { n: '1', d: '1' },
            staggerTicks: 3
        }
    }
};

async function createJointArgs(serverTime = 1000) {
    const h = await earthFixture();
    const cp = await h.cp();
    return {
        movement: cp.role.movement.state,
        basic: cp.role.combat.state,
        cross: cp.scene.cross,
        bengshan: cp.scene.bengshan,
        badao: cp.scene.badao,
        earth: cp.scene.earth,
        targets: cp.scene.combat.targets,
        inputs: [],
        fromTick: 0,
        toTick: 10,
        movementConfig: h.config,
        basicConfig: h.profile.config,
        crossConfig: h.profile.cross,
        bengshanConfig: h.profile.bengshan,
        badaoConfig: h.profile.badao,
        earthConfig: h.profile.earth,
        context: { challengeId: 'st14-death-window', sceneEpoch: 1, actorId: 'player', serverTime },
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
            controlled: false
        },
        random: () => 0,
        monsterConfig: testMonsterConfig,
        monsters: initialMonsterState(cp.scene.combat.targets.map(t => ({
            actorId: t.actorId,
            actorIndex: t.actorIndex,
            templateRef: 'test',
            identity: 'ordinary',
            attackPower: '2000'
        }))),
        player: { hp: '100', maxHp: '1000', lifeState: 'alive', controlledUntilTick: 0 }
    };
}

test('ST14-01: lethal hit triggers player death, deathIndex, and 10s deadline anchor', async () => {
    const a = await createJointArgs(5000);
    // Monster will hit at tick 2 with 2000 attack power, killing 100 HP player
    const r = advanceMonsterSimulation(a);
    assert.equal(r.player.hp, '0');
    assert.equal(r.player.lifeState, 'dead');
    assert.equal(r.player.deathIndex, 1, 'deathIndex increments to 1');
    assert.equal(r.player.deathAtTick, 2, 'deathAtTick recorded at tick 2');
    // serverTime (5000) + tick 2 (20ms) + 10_000ms = 15020
    assert.equal(r.player.deathDeadline, 15020, 'deathDeadline anchors to 10 seconds from death event');
    const deathEvt = r.events.find(e => e.kind === 'death' && e.targetId === 'player');
    assert.ok(deathEvt, 'death event emitted for player');
    assert.equal(deathEvt.code, 'DEATH_INDEX_1');
});

test('ST14-01: dead player cannot move, press basic attacks, or use supply items', async () => {
    const a = await createJointArgs(5000);
    // Start with dead player
    a.player = {
        hp: '0',
        maxHp: '1000',
        lifeState: 'dead',
        controlledUntilTick: 0,
        deathIndex: 1,
        deathDeadline: 15000,
        deathAtTick: 0
    };
    const startX = a.movement.x;
    a.inputs = [
        { seq: 1, tick: 1, kind: 'move', x: 1000, y: 0 },
        { seq: 2, tick: 2, kind: 'basic', pressed: true },
        { seq: 3, tick: 3, kind: 'item', itemRef: 'item:hp-potion-small-v1' },
        { seq: 4, tick: 4, kind: 'skill', skillId: 'cross' }
    ];
    const r = advanceMonsterSimulation(a);
    assert.equal(r.movement.x, startX, 'dead player movement is completely locked');
    assert.ok(r.events.some(e => e.kind === 'actionRejected' && e.seq === 2 && e.code === 'DEAD'), 'basic input rejected with DEAD');
    assert.ok(r.events.some(e => e.kind === 'actionRejected' && e.seq === 3 && e.code === 'DEAD'), 'item input rejected with DEAD');
    assert.ok(r.events.some(e => e.kind === 'actionRejected' && e.seq === 4 && e.code === 'CONTROLLED'), 'skill input rejected when dead');
});

test('ST14-01: dead player pauses natural MP and HP resource recovery', async () => {
    const a = await createJointArgs(5000);
    a.player = {
        hp: '0',
        maxHp: '1000',
        lifeState: 'dead',
        controlledUntilTick: 0,
        deathIndex: 1,
        deathDeadline: 15000,
        deathAtTick: 0
    };
    a.stats.mp = '100';
    let hpRegenCalled = false;
    a.playerResources = (p) => {
        hpRegenCalled = true;
        return { ...p, hp: '500' };
    };
    a.resources = (_tick, mp) => {
        return String(BigInt(mp) + 50n);
    };
    const r = advanceMonsterSimulation(a);
    assert.equal(r.player.hp, '0', 'dead player does not regenerate HP');
    assert.equal(r.mp, '100', 'dead player does not regenerate MP');
    assert.equal(hpRegenCalled, false, 'playerResources callback skipped while dead');
});

test('ST14-01: lingering bleed DOT continues ticking and kills monster after player death', async () => {
    const a = await createJointArgs(5000);
    // Player kills monster via cross skill pre-cast, but player also dies at tick 2
    const px = Number(a.movement.x), py = Number(a.movement.y);
    // Setup player with 100 HP, monster with 400 HP within melee reach
    // Node 0 deals 333 damage at tick 1 (leaving 67 HP), monster kills player at tick 2, then bleed DOT kills monster at tick 3
    a.targets = a.targets.map(t => ({ ...t, hp: '400', maxHp: '400', x: px + 100, y: py }));
    a.monsterConfig = structuredClone(a.monsterConfig);
    a.monsterConfig.templates.test.resist.stagger = true;
    a.monsterConfig.templates.test.resist.knockdown = true;
    a.crossConfig = structuredClone(a.crossConfig);
    a.crossConfig.nodeOffsetsUs = [10000, 20000]; // node 0 hits at tick 1 (10ms)
    a.crossConfig.bleed.intervalUs = 20000; // 2 ticks per bleed jump (jump 1 at tick 3)
    // Player casts cross at tick 0
    a.inputs = [{ seq: 1, tick: 0, kind: 'skill', skillId: 'cross' }];
    // Run simulation to tick 10
    a.toTick = 10;
    const r = advanceMonsterSimulation(a);
    // Player took lethal hit at tick 2 and died
    assert.equal(r.player.lifeState, 'dead');
    assert.equal(r.player.hp, '0');
    // But bleed DOT from cross continued ticking after player death and killed the target monsters
    const mobKills = r.targets.filter(t => t.lifeState === 'dead');
    assert.ok(mobKills.length > 0, 'monsters killed by lingering cross bleed attack after player death');
    // Player remains dead (does not revive on monster kill)
    assert.equal(r.player.lifeState, 'dead');
});
