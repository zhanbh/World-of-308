import { CombatModel } from './CombatModel';

export type EnemyState = 'approach' | 'telegraph' | 'attack' | 'recover' | 'stunned' | 'knockedDown' | 'gettingUp' | 'dead';

export const enemyFeedbackTuning = { bleedDuration: 5, stunDuration: 0.28, smallKnockdown: 0.8, riseDuration: 0.24 };
export interface EnemyHitOptions { knockdownFor?: number; bleedFor?: number; }

/** One readable melee enemy. All attack damage is checked against the locked area. */
export class EnemyModel {
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

    constructor(public x: number, public y: number, public readonly id: number, public readonly maxHp = 3) {
        this.hp = maxHp;
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
        if (this.state === 'knockedDown') return 1;
        if (this.state === 'gettingUp') return Math.max(0, this.timer / enemyFeedbackTuning.riseDuration);
        return 0;
    }

    update(dt: number, player: CombatModel, passive = false): void {
        this.flash = Math.max(0, this.flash - dt);
        if (this.state === 'dead') return;
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
        this.hp = Math.max(0, this.hp - damage);
        this.flash = 0.12;
        if (this.hp <= 0) {
            this.state = 'dead';
            this.bleedLeft = this.bleedAge = this.timer = this.knockX = 0;
            return;
        }
        if (options.bleedFor && options.bleedFor > 0) {
            if (this.bleedLeft <= 0) this.bleedAge = 0;
            this.bleedLeft = options.bleedFor; // Refresh one status; never add stacks/duration.
        }
        if (options.knockdownFor && options.knockdownFor > 0) {
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
