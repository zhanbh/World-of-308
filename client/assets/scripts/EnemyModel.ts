import { CombatModel } from './CombatModel';

export type EnemyState = 'approach' | 'telegraph' | 'attack' | 'recover' | 'stunned' | 'knockedDown' | 'gettingUp' | 'dead';

export const enemyFeedbackTuning = { bleedDuration: 5, stunDuration: 0.28, smallKnockdown: 0.8, riseDuration: 0.24, deathWhiten: 0.18, deathFade: 0.32 };
export interface EnemyHitOptions { knockdownFor?: number; bleedFor?: number; }
export interface EnemyKnockdownPolicy { allowed: boolean; damageRatio?: number; }
export const enemyKnockdownPolicies: Record<'normal' | 'elite' | 'boss', EnemyKnockdownPolicy> = {
    normal: { allowed: true, damageRatio: 0.30 },
    elite: { allowed: true, damageRatio: 0.20 },
    boss: { allowed: false }, // Each boss must opt in with its own policy.
};

/** Owned by one cast, retained by its projectile/ground phases until they finish. */
export class SkillHitLedger {
    private targets = new Map<EnemyModel, { damage: number; stages: Set<number>; knocked: boolean }>();
    hit(enemy: EnemyModel, stage: number, fromX: number, damage: number, knockback = 60, options: EnemyHitOptions = {}): boolean {
        if (enemy.state === 'dead') return false;
        const record = this.targets.get(enemy) || { damage: 0, stages: new Set<number>(), knocked: false };
        if (record.stages.has(stage)) return false;
        record.stages.add(stage);
        record.damage += Math.min(enemy.hp, Math.max(0, damage));
        const policy = enemy.knockdownPolicy;
        const threshold = !record.knocked && policy.allowed && policy.damageRatio !== undefined
            && record.damage + Math.max(1, enemy.maxHp) * 1e-10 >= enemy.maxHp * policy.damageRatio;
        if (threshold || policy.allowed && options.knockdownFor && options.knockdownFor > 0) record.knocked = true;
        this.targets.set(enemy, record);
        enemy.hit(fromX, damage, knockback, {
            ...options,
            knockdownFor: options.knockdownFor || (threshold ? enemyFeedbackTuning.smallKnockdown : undefined),
        });
        return true;
    }
}

/** One readable melee enemy. All attack damage is checked against the locked area. */
export class EnemyModel {
    hitSerial = 0;
    lastHitHeavy = false;
    readonly hitEvents: { serial: number; damage: number; heavy: boolean; x: number; y: number }[] = [];
    hp: number;
    state: EnemyState = 'approach';
    timer = 0;
    flash = 0;
    knockX = 0;
    lockedX = 0;
    lockedY = 0;
    impactId = 0;
    bleedLeft = 0;
    private bleedAge = 0;
    fallDirection = 1;
    deathAge = 0;
    private deathPose = 0;

    constructor(public x: number, public y: number, public readonly id: number, public readonly maxHp = 3, public readonly knockdownPolicy: EnemyKnockdownPolicy = enemyKnockdownPolicies.normal) {
        this.hp = maxHp;
    }

    get deathOpacity(): number {
        return this.state !== 'dead' ? 1 : Math.max(0, 1 - Math.max(0, this.deathAge - enemyFeedbackTuning.deathWhiten) / enemyFeedbackTuning.deathFade);
    }
    get deathWhite(): number {
        return this.state !== 'dead' ? 0 : Math.min(1, this.deathAge / enemyFeedbackTuning.deathWhiten);
    }

    /** Two soft pulses per heartbeat; refreshing duration does not restart the beat. */
    get bleedPulse(): number {
        if (this.state === 'dead' || this.bleedLeft <= 0) return 0;
        const phase = this.bleedAge % 0.9;
        const first = Math.exp(-Math.pow((phase - 0.12) / 0.065, 2));
        const second = 0.65 * Math.exp(-Math.pow((phase - 0.30) / 0.085, 2));
        return Math.min(1, 0.12 + first + second);
    }

    /** 0 = standing, 1 = fully down. Getting up blends the same body back upright. */
    get downPose(): number {
        if (this.state === 'dead') return this.deathPose;
        if (this.state === 'knockedDown') return 1;
        if (this.state === 'gettingUp') return Math.max(0, this.timer / enemyFeedbackTuning.riseDuration);
        return 0;
    }

    update(dt: number, player: CombatModel, passive = false): void {
        this.flash = Math.max(0, this.flash - dt);
        if (this.state === 'dead') { this.deathAge += dt; return; }
        if (this.bleedLeft > 0) {
            this.bleedAge += dt;
            this.bleedLeft = Math.max(0, this.bleedLeft - dt);
        }
        if (this.state === 'stunned' || this.state === 'knockedDown' || this.state === 'gettingUp') {
            const oldTimer = this.timer;
            this.timer -= dt;
            const decay = Math.exp(-dt * 7);
            this.x += this.knockX * (1 - decay) / 7;
            this.knockX *= decay;
            if (this.timer <= 0) {
                if (this.state === 'knockedDown') {
                    this.state = 'gettingUp';
                    this.timer = Math.max(0, enemyFeedbackTuning.riseDuration - (dt - oldTimer));
                    if (this.timer <= 0) this.state = 'approach';
                } else this.state = 'approach';
            }
            return;
        }
        if (passive) return; // Review targets still advance statuses but do not attack/move by AI.
        if (this.state === 'telegraph') {
            this.timer -= dt;
            if (this.timer <= 0) {
                this.state = 'attack';
                this.timer = 0.18;
                this.impactId++;
                // A committed attack stays at its original area. Walking away avoids it.
                if (Math.abs(player.x - this.lockedX) <= 40 && Math.abs(player.y - this.lockedY) <= 18) {
                    player.takeHit(this.x);
                }
            }
            return;
        }
        if (this.state === 'attack' || this.state === 'recover') {
            this.timer -= dt;
            if (this.timer <= 0) this.state = this.state === 'attack' ? 'recover' : 'approach';
            return;
        }

        const dx = player.x - this.x, dy = player.y - this.y;
        if (Math.abs(dx) <= 43 && Math.abs(dy) <= 20) {
            this.state = 'telegraph';
            this.timer = 0.68;
            this.lockedX = player.x;
            this.lockedY = player.y;
            return;
        }
        this.x += Math.sign(dx) * Math.min(Math.abs(dx), 34 * dt);
        this.y += Math.sign(dy) * Math.min(Math.abs(dy), 25 * dt);
    }

    hit(fromX: number, damage = 1, knockback = 88, options: EnemyHitOptions = {}): void {
        if (this.state === 'dead') return;
        if (damage <= 0) return;
        this.hitSerial++;
        this.lastHitHeavy = !!options.knockdownFor;
        this.hitEvents.push({ serial: this.hitSerial, damage: Math.min(this.hp, damage), heavy: this.lastHitHeavy, x: this.x, y: this.y });
        if (this.hitEvents.length > 32) this.hitEvents.shift();
        this.hp = Math.max(0, this.hp - Math.max(0, damage));
        if (this.hp < Math.max(1, this.maxHp) * 1e-10) this.hp = 0;
        this.flash = 0.12;
        if (this.hp <= 0) {
            this.deathPose = this.downPose;
            this.deathAge = this.flash = 0;
            this.state = 'dead';
            this.bleedLeft = this.bleedAge = this.timer = this.knockX = 0;
            return;
        }
        if (options.bleedFor && options.bleedFor > 0) {
            if (this.bleedLeft <= 0) this.bleedAge = 0;
            this.bleedLeft = options.bleedFor; // Refresh one status; never add stacks/duration.
        }
        if (this.knockdownPolicy.allowed && options.knockdownFor && options.knockdownFor > 0) {
            this.timer = this.state === 'knockedDown' ? Math.max(this.timer, options.knockdownFor) : options.knockdownFor;
            this.state = 'knockedDown';
            this.fallDirection = this.x >= fromX ? 1 : -1;
        } else if (this.state !== 'knockedDown' && this.state !== 'gettingUp') {
            this.state = 'stunned';
            this.timer = enemyFeedbackTuning.stunDuration;
        }
        this.knockX = this.x >= fromX ? knockback : -knockback;
    }
}

/** Presentation clock: simultaneous targets request the longest stop, never a sum. */
export const hitFeedbackTuning = { lightStop: 1 / 30, heavyStop: .05, sparkLife: .14, numberLife: .55, shakeLife: .15 };
export class CombatFeedback {
    hitStopEnabled = true;
    sparksEnabled = true;
    numbersEnabled = true;
    shakeEnabled = true;
    private shakeAge = hitFeedbackTuning.shakeLife;
    private shakeStrength = 0;
    configure(options: { hitStop?: boolean; sparks?: boolean; numbers?: boolean; shake?: boolean }): void {
        if (options.hitStop !== undefined) this.hitStopEnabled = options.hitStop;
        if (options.sparks !== undefined) this.sparksEnabled = options.sparks;
        if (options.numbers !== undefined) this.numbersEnabled = options.numbers;
        if (options.shake !== undefined) this.shakeEnabled = options.shake;
        if (!this.shakeEnabled) { this.shakeStrength = 0; this.shakeAge = hitFeedbackTuning.shakeLife; }
        if (!this.numbersEnabled) this.numbers = [];
        if (!this.hitStopEnabled) this.stopLeft = 0;
        if (!this.sparksEnabled) this.sparks = [];
    }
    groundImpact(id: string): void {
        if (!this.shakeEnabled || (id !== 'bengshan' && id !== 'earth')) return;
        const strength = id === 'earth' ? 3 : 2;
        this.shakeStrength = Math.max(strength, this.shakeStrength * Math.max(0, 1 - this.shakeAge / hitFeedbackTuning.shakeLife));
        this.shakeAge = 0;
    }
    get shakeOffset(): { x: number; y: number } {
        const p = Math.min(1, this.shakeAge / hitFeedbackTuning.shakeLife);
        const envelope = (1 - p) * (1 - p) * this.shakeStrength;
        return { x: Math.round(Math.cos(p * Math.PI * 6) * envelope) || 0,
            y: Math.round(Math.sin(p * Math.PI * 5) * envelope * .5) || 0 };
    }
    stopLeft = 0;
    sparks: { x: number; y: number; age: number; heavy: boolean }[] = [];
    numbers: { x: number; y: number; age: number; damage: number; heavy: boolean }[] = [];
    private seen = new WeakMap<EnemyModel, number>();
    observe(enemies: EnemyModel[]): void {
        for (const enemy of enemies) {
            const prior = this.seen.get(enemy) || 0;
            this.seen.set(enemy, enemy.hitSerial);
            for (const event of enemy.hitEvents) {
                if (event.serial <= prior) continue;
                if (this.hitStopEnabled) this.stopLeft = Math.max(this.stopLeft, event.heavy ? hitFeedbackTuning.heavyStop : hitFeedbackTuning.lightStop);
                if (this.sparksEnabled) this.sparks.push({ x: event.x, y: event.y + 15, age: 0, heavy: event.heavy });
                if (this.numbersEnabled) this.numbers.push({ x: event.x + (event.serial % 3 - 1) * 6,
                    y: event.y + 34, age: 0, damage: event.damage, heavy: event.heavy });
            }
            this.numbers = this.numbers.slice(-24);
            this.sparks = this.sparks.slice(-24);
        }
    }
    /** Called on fixed wall-clock steps; true consumes this step as hit-stop. */
    update(dt: number): boolean {
        this.shakeAge = Math.min(hitFeedbackTuning.shakeLife, this.shakeAge + dt);
        for (const number of this.numbers) number.age += dt;
        this.numbers = this.numbers.filter(number => number.age < hitFeedbackTuning.numberLife);
        for (const spark of this.sparks) spark.age += dt;
        this.sparks = this.sparks.filter(spark => spark.age < hitFeedbackTuning.sparkLife);
        const stopped = this.stopLeft > 1e-9;
        this.stopLeft = Math.max(0, this.stopLeft - dt);
        return stopped;
    }
    clear(enemies: EnemyModel[] = []): void {
        this.shakeAge = hitFeedbackTuning.shakeLife; this.shakeStrength = 0;
        this.stopLeft = 0; this.sparks = []; this.numbers = []; this.seen = new WeakMap();
        for (const enemy of enemies) this.seen.set(enemy, enemy.hitSerial);
    }
}
/** Integer source-pixel blocks, reused by Cocos and the Canvas review. */
export function hitSparkPixels(age: number, heavy: boolean): { x: number; y: number; size: number; core: boolean }[] {
    const phase = Math.min(1, age / hitFeedbackTuning.sparkLife);
    const reach = Math.round((heavy ? 6 : 4) + phase * (heavy ? 9 : 6));
    const size = phase < .55 ? 2 : 1;
    return [{ x: -1, y: -1, size: phase < .5 ? 3 : 1, core: true },
        ...[[1,0],[-1,0],[0,1],[0,-1],[.7,.7],[-.7,-.7]].map(([x,y]) => ({
            x: Math.round(x * reach), y: Math.round(y * reach), size, core: false,
        }))];
}

/** Round only display text, never the combat damage itself. */
export function damageText(damage: number): string {
    return damage > 0 && damage < .01 ? '<0.01' : String(Number(damage.toFixed(2)));
}
