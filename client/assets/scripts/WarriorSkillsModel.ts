/** Prototype-only skill timings, costs, damage and geometry (source pixels / seconds). */
import { tuning } from './CombatModel';
import type { CombatModel } from './CombatModel';
import { skillAnimations, skillLift } from './WarriorSkillAnimation';
import type { WarriorSkillId } from './WarriorSkillAnimation';
import { EnemyModel, enemyFeedbackTuning, SkillHitLedger } from './EnemyModel';
import { skillEffectLifetimes } from './WarriorSkillEffects';
export type { WarriorSkillId } from './WarriorSkillAnimation';

export const warriorSkillTuning: Record<WarriorSkillId, {
    manaCost: number;
    cooldown: number;
    duration: number;
    impactAt: number;
    damage: number;
    range: number;
}> = {
    cross:   { manaCost: 8,  cooldown: 1.1, ...skillAnimations.cross, damage: 1, range: 58 },
    bengshan:{ manaCost: 18, cooldown: 3.4, ...skillAnimations.bengshan, damage: 2, range: 54 },
    badao:   { manaCost: 16, cooldown: 2.4, ...skillAnimations.badao, damage: 2, range: 142 },
    earth:   { manaCost: 40, cooldown: 8.0, ...skillAnimations.earth, damage: 3, range: 145 },
};

export const warriorSkillNames: Record<WarriorSkillId, string> = {
    cross: '十字斩', bengshan: '崩山击', badao: '拔刀斩', earth: '崩山裂地斩',
};

/** Shared by the real encounter and the durable feedback review target. */
export function applyWarriorSkillHit(id: WarriorSkillId, enemy: EnemyModel, x: number, y: number, facing: number, ledger = new SkillHitLedger()): boolean {
    if (enemy.state === 'dead') return false;
    const config = warriorSkillTuning[id];
    const dx = (enemy.x - x) * facing, dy = enemy.y - y;
    const hit = id === 'cross' ? dx >= -8 && dx <= config.range && Math.abs(dy) <= 34
        : id === 'badao' ? dx >= 0 && dx <= config.range && Math.abs(dy) <= 24 + dx * 0.11
            : Math.hypot(dx, dy) <= config.range;
    if (!hit) return false;
    return ledger.hit(enemy, 0, x, config.damage, id === 'earth' ? 110 : id === 'bengshan' ? 95 : 60, {
        bleedFor: enemyFeedbackTuning.bleedDuration,
        knockdownFor: id === 'earth' ? skillEffectLifetimes.earth
            : id === 'bengshan' ? enemyFeedbackTuning.smallKnockdown : undefined,
    });
}

/** Provisional review timings and equal weights; whole-cast damage stays unchanged. */
export const skillHitStages: Record<WarriorSkillId, number[]> = {
    cross: [0.29, 0.34], bengshan: [0.24, 0.48, 0.68],
    badao: [0.44], earth: [0.88, 1.00, 1.20, 1.40],
};
export const earthLeapTuning = { defaultDistance: 64, forwardDistance: 100, takeoffAt: .28 };
export const crossProjectile = { speed: 260, lifetime: 0.33, halfWidth: 22, halfDepth: 34 };
interface SkillCast {
    id: WarriorSkillId; age: number; previous: number; facing: number;
    ledger: SkillHitLedger; done: Set<number>; origin?: { x: number; y: number };
    launched: boolean; cancelled: boolean;
}

/** One local mana pool, four independently cooled-down moves and one active action. */
export class WarriorSkillsModel {
    hitLedger = new SkillHitLedger();
    private casts: SkillCast[] = [];
    private currentCast: SkillCast | null = null;
    readonly maxMana = 100;
    mana = this.maxMana;
    activeId: WarriorSkillId | null = null;
    elapsed = 0;
    facing = 1;
    impactId = 0;
    lastImpact: WarriorSkillId | null = null;
    motionDelta = 0;
    leapDistance = earthLeapTuning.defaultDistance;
    private impactSent = false;
    private movementFraction = 0;
    private cooldowns: Record<WarriorSkillId, number> = { cross: 0, bengshan: 0, badao: 0, earth: 0 };

    get casting(): boolean { return this.activeId !== null; }
    get isSuperArmor(): boolean {
        return this.activeId === 'bengshan' || this.activeId === 'badao' || this.activeId === 'earth';
    }
    get canMove(): boolean { return !this.activeId || this.elapsed >= skillAnimations[this.activeId].moveAt; }
    get progress(): number | null {
        if (!this.activeId) return null;
        return Math.min(1, this.elapsed / warriorSkillTuning[this.activeId].duration);
    }
    get jumpLift(): number {
        return this.activeId ? skillLift(this.activeId, this.elapsed) : 0;
    }

    cooldown(id: WarriorSkillId): number { return this.cooldowns[id]; }
    ready(id: WarriorSkillId): boolean {
        return !this.casting && this.cooldowns[id] <= 0 && this.mana >= warriorSkillTuning[id].manaCost;
    }

    cast(id: WarriorSkillId, facing: number, axisX = 0): boolean {
        if (!this.ready(id)) return false;
        const config = warriorSkillTuning[id];
        this.hitLedger = new SkillHitLedger();
        this.currentCast = { id, age: 0, previous: 0, facing: facing < 0 ? -1 : 1,
            ledger: this.hitLedger, done: new Set(), launched: false, cancelled: false };
        this.casts.push(this.currentCast);
        this.mana -= config.manaCost;
        this.cooldowns[id] = config.cooldown;
        this.activeId = id;
        this.elapsed = 0;
        this.facing = facing < 0 ? -1 : 1;
        this.leapDistance = axisX * this.facing > tuning.deadZone ? earthLeapTuning.forwardDistance : earthLeapTuning.defaultDistance;
        this.impactSent = false;
        this.movementFraction = 0;
        this.motionDelta = 0;
        this.lastImpact = null;
        return true;
    }

    update(dt: number): void {
        this.lastImpact = null;
        this.motionDelta = 0;
        for (const cast of this.casts) { cast.previous = cast.age; cast.age += dt; }
        for (const id of Object.keys(this.cooldowns) as WarriorSkillId[]) {
            this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
        }
        const id = this.activeId;
        if (!id) return;
        const oldElapsed = this.elapsed;
        this.elapsed = Math.min(warriorSkillTuning[id].duration, this.elapsed + dt);
        if (id === 'bengshan') {
            const movementProgress = Math.max(0, Math.min(1, (this.elapsed - 0.12) / (warriorSkillTuning.bengshan.impactAt - 0.12)));
            const easedProgress = 1 - (1 - movementProgress) * (1 - movementProgress);
            this.motionDelta = (easedProgress - this.movementFraction) * 34 * this.facing;
            this.movementFraction = easedProgress;
        }
        if (id === 'earth') {
            const p = Math.max(0, Math.min(1, (this.elapsed - earthLeapTuning.takeoffAt) / (skillAnimations.earth.impactAt - earthLeapTuning.takeoffAt)));
            const eased = p * p * (3 - 2 * p);
            this.motionDelta = (eased - this.movementFraction) * this.leapDistance * this.facing;
            this.movementFraction = eased;
        }
        if (!this.impactSent && oldElapsed < warriorSkillTuning[id].impactAt
            && this.elapsed >= warriorSkillTuning[id].impactAt) {
            this.impactSent = true;
            this.lastImpact = id;
            this.impactId++;
        }
        if (this.elapsed >= warriorSkillTuning[id].duration) this.activeId = null;
    }

    /** Evaluate against current ground coordinates; emitted effects retain their own cast. */
    resolveHits(enemies: EnemyModel[], x: number, y: number): number {
        let hits = 0;
        for (const cast of this.casts) {
            const { id, facing, age, previous } = cast;
            const times = skillHitStages[id];
            if (!cast.cancelled && !cast.launched && age >= (id === 'cross' ? times[1] : times[0])) {
                cast.origin = { x, y }; cast.launched = true;
            }
            for (let stage = 0; stage < times.length; stage++) {
                const projectile = id === 'cross' && stage === 1;
                const persistent = (id === 'earth' || projectile) && cast.launched;
                if (cast.cancelled && !persistent) continue;
                if (projectile ? !cast.launched || previous > times[stage] + crossProjectile.lifetime
                    : cast.done.has(stage) || age + 1e-9 < times[stage]) continue;
                if (!projectile) cast.done.add(stage);
                const origin = persistent ? cast.origin! : { x, y };
                for (const enemy of enemies) {
                    const dx = (enemy.x - origin.x) * facing, dy = enemy.y - origin.y;
                    const start = 29 + Math.max(0, previous - times[stage]) * crossProjectile.speed;
                    const end = 29 + Math.min(crossProjectile.lifetime, Math.max(0, age - times[stage])) * crossProjectile.speed;
                    const inside = projectile ? dx >= start - crossProjectile.halfWidth && dx <= end + crossProjectile.halfWidth && Math.abs(dy) <= crossProjectile.halfDepth
                        : id === 'cross' ? dx >= -8 && dx <= warriorSkillTuning.cross.range && Math.abs(dy) <= 34
                        : id === 'badao' ? dx >= 0 && dx <= warriorSkillTuning.badao.range && Math.abs(dy) <= 24 + dx * .11
                        : Math.hypot(dx, dy) <= warriorSkillTuning[id].range;
                    if (!inside) continue;
                    const knockdownFor = id === 'earth' && stage === 0 ? Math.max(0, 2.4 - age)
                        : id === 'bengshan' && stage === 2 ? enemyFeedbackTuning.smallKnockdown : undefined;
                    if (cast.ledger.hit(enemy, stage, origin.x, warriorSkillTuning[id].damage / times.length,
                        id === 'earth' ? 110 : id === 'bengshan' ? 95 : 60,
                        { bleedFor: enemyFeedbackTuning.bleedDuration, knockdownFor })) hits++;
                }
            }
        }
        this.casts = this.casts.filter(cast => cast.age < (cast.id === 'cross' ? .67 : skillHitStages[cast.id].slice(-1)[0])
            && (!cast.cancelled || cast.launched && (cast.id === 'cross' || cast.id === 'earth')));
        return hits;
    }

    cancel(): void {
        if (this.currentCast && this.activeId) this.currentCast.cancelled = true;
        this.activeId = null;
        this.elapsed = 0;
        this.motionDelta = 0;
        this.lastImpact = null;
    }

    resetCooldowns(): void {
        this.cooldowns = { cross: 0, bengshan: 0, badao: 0, earth: 0 };
    }

    reset(): void {
        this.cancel();
        this.casts = []; this.currentCast = null;
        this.mana = this.maxMana;
        this.cooldowns = { cross: 0, bengshan: 0, badao: 0, earth: 0 };
        this.impactSent = false;
        this.movementFraction = 0;
        this.impactId = 0;
    }
}

/** Successful skill input atomically cancels the basic combo; rejected input changes nothing. */
export function tryCastWarriorSkill(player: CombatModel, skills: WarriorSkillsModel, id: WarriorSkillId, feedback?: { stopLeft: number }, axisX = 0): boolean {
    if (player.hp <= 0 || player.hitStun > 0 || !skills.cast(id, player.facing, axisX)) return false;
    player.reset();
    if (feedback) feedback.stopLeft = 0; // A deliberate cancel must not wait for the old contact stop.
    return true;
}
