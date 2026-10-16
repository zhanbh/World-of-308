import { basicAttacks } from './WarriorAttackAnimation';

/** Movement and three-beat combo timing. Units are source pixels/seconds. */
export const tuning = {
    deadZone: 0.15, horizontalSpeed: 100, depthSpeed: 45,
    comboWindow: 0.3, bufferWindow: 0.12,
    durations: basicAttacks.map(action => action.duration),
};

export class CombatModel {
    x = 0;
    y = 0;
    facing = 1;
    stage = -1;
    elapsed = 0;
    nextStage = 0;
    windowLeft = 0;
    buffered = false;
    held = false;
    moving = false;
    running = false;
    hp = 100;
    hitStun = 0;
    invulnerable = 0;
    knockX = 0;
    impactId = 0;
    private impactSent = false;

    press(): void {
        if (this.hp <= 0 || this.hitStun > 0) return;
        this.held = true;
        if (this.stage < 0) this.begin();
        else if (tuning.durations[this.stage] - this.elapsed <= tuning.bufferWindow) this.buffered = true;
    }

    release(): void { this.held = false; }

    reset(): void {
        this.elapsed = 0;
        this.stage = -1;
        this.nextStage = 0;
        this.windowLeft = 0;
        this.buffered = false;
        this.held = false;
    }

    private begin(): void {
        this.stage = this.nextStage;
        this.elapsed = 0;
        this.windowLeft = 0;
        this.buffered = false;
        this.impactSent = false;
    }

    update(dt: number, axisX: number, axisY: number): void {
        // The application advances in small fixed steps, independent of render FPS.
        if (this.hp <= 0) {
            this.moving = false;
            this.running = false;
            return;
        }
        if (this.stage >= 0) {
            const oldElapsed = this.elapsed;
            this.elapsed += dt;
            // Damage lands during the first visible stroke (one hit event per
            // combo beat; the paired sword motions are for animation feel).
            const impactAt = basicAttacks[this.stage].impact;
            if (!this.impactSent && oldElapsed < impactAt && this.elapsed >= impactAt) {
                this.impactSent = true;
                this.impactId++;
            }
            if (this.elapsed >= tuning.durations[this.stage]) {
                const overflow = this.elapsed - tuning.durations[this.stage];
                this.nextStage = (this.stage + 1) % basicAttacks.length;
                this.stage = -1;
                this.windowLeft = tuning.comboWindow;
                if (this.buffered || this.held) {
                    this.begin();
                    this.elapsed = overflow;
                } else this.windowLeft = Math.max(0, this.windowLeft - overflow);
            }
        } else {
            this.windowLeft = Math.max(0, this.windowLeft - dt);
            if (this.windowLeft === 0) this.nextStage = 0;
            if (this.held) this.begin();
        }
        const x = Math.abs(axisX) > tuning.deadZone
            ? Math.sign(axisX) * (Math.min(1, Math.abs(axisX)) - tuning.deadZone) / (1 - tuning.deadZone) : 0;
        const y = Math.abs(axisY) > tuning.deadZone ? Math.sign(axisY) : 0;
        this.invulnerable = Math.max(0, this.invulnerable - dt);
        if (this.hitStun > 0) {
            this.hitStun = Math.max(0, this.hitStun - dt);
            this.x = Math.max(-218, Math.min(218, this.x + this.knockX * dt));
            this.knockX *= Math.exp(-dt * 8);
            this.moving = false;
            this.running = false;
            return;
        }
        const locked = this.stage >= 0 && this.elapsed < basicAttacks[this.stage].moveAt;
        this.moving = !locked && (x !== 0 || y !== 0);
        this.running = this.moving && Math.abs(x) > 0.6;
        if (!locked) {
            if (x !== 0) this.facing = Math.sign(x);
            this.x = Math.max(-218, Math.min(218, this.x + x * tuning.horizontalSpeed * dt));
            this.y = Math.max(-35, Math.min(78, this.y + y * tuning.depthSpeed * dt));
        }
    }

    takeHit(fromX: number): boolean {
        if (this.invulnerable > 0 || this.hp <= 0) return false;
        this.hp = Math.max(0, this.hp - 22);
        this.invulnerable = 0.72;
        this.hitStun = 0.24;
        this.knockX = this.x >= fromX ? 105 : -105;
        this.stage = -1;
        this.nextStage = 0;
        this.windowLeft = 0;
        this.buffered = false;
        this.held = false;
        return true;
    }
}
