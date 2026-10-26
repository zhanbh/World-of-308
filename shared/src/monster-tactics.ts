import type { Rational } from './basic-combat-kernel.ts';
import { defaultMonsterResist } from './monster-simulation.ts';
import type { MonsterConfig, MeleeSkill, MonsterTemplate } from './monster-simulation.ts';

export type TacticalRole = 'frontline' | 'flanker' | 'artillery' | 'charger' | 'heavy_guard' | 'area_controller';
export type TacticsDifficulty = 'normal' | 'adventure' | 'warrior' | 'king';

export type RangedSkill = {
    kind: 'ranged';
    windupTicks: number;
    recoveryTicks: number;
    cooldownTicks: number;
    reach: number;
    speed: number;
    projectileSpeed: number;
    projectileRadiusX: number;
    projectileRadiusY: number;
    coefficient: Rational;
    staggerTicks: number;
};

export type ChargeSkill = {
    kind: 'charge';
    windupTicks: number;
    activeTicks: number;
    recoveryTicks: number;
    cooldownTicks: number;
    reach: number;
    sweepDistance: number;
    sweepSpeed: number;
    contactRadius: number;
    coefficient: Rational;
    staggerTicks: number;
    speed: number;
};

export type DifficultyTacticsConfig = {
    difficulty: TacticsDifficulty;
    maxFlankers: number;
    maxConcurrentRetreaters: number;
    specialCap: number;
    retreatDistance: number;
    retreatTriggerDistance: number;
    flankOffsetX: number;
    flankOffsetY: number;
};

export const DIFFICULTY_PROFILES: Record<TacticsDifficulty, DifficultyTacticsConfig> = {
    normal: {
        difficulty: 'normal',
        maxFlankers: 0,
        maxConcurrentRetreaters: 0,
        specialCap: 1,
        retreatDistance: 120000,
        retreatTriggerDistance: 95000,
        flankOffsetX: 28000,
        flankOffsetY: 9000,
    },
    adventure: {
        difficulty: 'adventure',
        maxFlankers: 1,
        maxConcurrentRetreaters: 0,
        specialCap: 1,
        retreatDistance: 120000,
        retreatTriggerDistance: 95000,
        flankOffsetX: 28000,
        flankOffsetY: 9000,
    },
    warrior: {
        difficulty: 'warrior',
        maxFlankers: 1,
        maxConcurrentRetreaters: 1,
        specialCap: 2,
        retreatDistance: 120000,
        retreatTriggerDistance: 95000,
        flankOffsetX: 28000,
        flankOffsetY: 9000,
    },
    king: {
        difficulty: 'king',
        maxFlankers: 2,
        maxConcurrentRetreaters: 1,
        specialCap: 2,
        retreatDistance: 120000,
        retreatTriggerDistance: 95000,
        flankOffsetX: 28000,
        flankOffsetY: 9000,
    },
};

export function localTacticsConfig(
    mapping: Record<string, string>,
    difficulty: TacticsDifficulty = 'normal'
): MonsterConfig {
    const diff = DIFFICULTY_PROFILES[difficulty] ?? DIFFICULTY_PROFILES.normal;
    const templates: Record<string, MonsterTemplate> = {};
    const skills: Record<string, MeleeSkill | RangedSkill | ChargeSkill> = {};

    for (const [ref, kind] of Object.entries(mapping)) {
        const skillRef = `${ref}_skill`;
        templates[ref] = {
            type: 'humanoid',
            skillRef,
            behavior: 'chase',
            rewardTag: 'none',
            resist: defaultMonsterResist('humanoid'),
        };

        if (kind === 'ranged') {
            skills[skillRef] = {
                kind: 'ranged',
                windupTicks: 80,
                recoveryTicks: 50,
                cooldownTicks: 400,
                reach: 210000,
                speed: 1000,
                projectileSpeed: 4000,
                projectileRadiusX: 22000,
                projectileRadiusY: 16000,
                coefficient: { n: '1', d: '1' },
                staggerTicks: 24,
            };
        } else if (kind === 'charge') {
            skills[skillRef] = {
                kind: 'charge',
                windupTicks: 70,
                activeTicks: 35,
                recoveryTicks: 70,
                cooldownTicks: 500,
                reach: 150000,
                sweepDistance: 150000,
                sweepSpeed: 4285,
                contactRadius: 20000,
                coefficient: { n: '1', d: '1' },
                staggerTicks: 24,
                speed: 1000,
            };
        } else {
            skills[skillRef] = {
                kind: 'melee',
                windupTicks: 35,
                recoveryTicks: 50,
                cooldownTicks: 350,
                rangeX: 48000,
                rangeY: 18000,
                speed: 1000,
                coefficient: { n: '1', d: '1' },
                staggerTicks: 24,
            };
        }
    }

    return {
        version: 'local-melee-v1',
        decisionTicks: 5,
        control: {
            staggerTicks: 24,
            knockback: 100,
        },
        templates,
        skills,
        tactics: structuredClone(diff),
    };
}

export function tacticalDestination(
    role: TacticalRole,
    actorIndex: number,
    origin: { x: number; y: number },
    player: { x: number; y: number },
    difficultyCfg: DifficultyTacticsConfig,
    canRetreat: boolean
): { x: number; y: number } | null {
    if (role === 'artillery') {
        if (!canRetreat || difficultyCfg.maxConcurrentRetreaters <= 0) return null;
        const dx = origin.x - player.x, dy = origin.y - player.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= difficultyCfg.retreatTriggerDistance) return null;
        let nx = dx, ny = dy, len = dist;
        if (len < 1e-6) {
            nx = (actorIndex % 2 === 1 ? 1 : -1) * 120000;
            ny = 0;
            len = 120000;
        }
        return {
            x: Math.round(player.x + (nx / len) * difficultyCfg.retreatDistance),
            y: Math.round(player.y + (ny / len) * difficultyCfg.retreatDistance),
        };
    }
    if (role === 'flanker') {
        return {
            x: player.x + (actorIndex % 2 === 1 ? difficultyCfg.flankOffsetX : -difficultyCfg.flankOffsetX),
            y: player.y + (actorIndex % 2 === 1 ? difficultyCfg.flankOffsetY : -difficultyCfg.flankOffsetY),
        };
    }
    return {
        x: player.x - (player.x >= origin.x ? 1 : -1) * 28000,
        y: player.y,
    };
}
