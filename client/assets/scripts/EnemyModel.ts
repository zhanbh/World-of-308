import { CombatModel } from './CombatModel';

export type EnemyState = 'approach' | 'telegraph' | 'attack' | 'recover' | 'stunned' | 'dead';

/** One readable melee enemy. All attack damage is checked against the locked area. */
export class EnemyModel {
    hp = 3;
    state: EnemyState = 'approach';
    timer = 0;
    flash = 0;
    knockX = 0;
    lockedX = 0;
    lockedY = 0;
    impactId = 0;

    constructor(public x: number, public y: number, public readonly id: number) {}

    update(dt: number, player: CombatModel): void {
        this.flash = Math.max(0, this.flash - dt);
        if (this.state === 'dead') return;
        if (this.state === 'stunned') {
            this.timer -= dt;
            this.x += this.knockX * dt;
            this.knockX *= Math.exp(-dt * 7);
            if (this.timer <= 0) this.state = this.hp <= 0 ? 'dead' : 'approach';
            return;
        }
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

    hit(fromX: number, damage = 1, knockback = 88): void {
        if (this.state === 'dead' || this.state === 'stunned') return;
        this.hp = Math.max(0, this.hp - damage);
        this.flash = 0.12;
        this.state = this.hp <= 0 ? 'dead' : 'stunned';
        this.timer = 0.28;
        this.knockX = this.x >= fromX ? knockback : -knockback;
    }
}
