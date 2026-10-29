import {localTacticsConfig} from '../../../shared/src/monster-tactics.ts';
import {initialMonsterState} from '../../../shared/src/monster-simulation.ts';
import {earthFixture} from './earth-fixture.mjs';
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
