/** Temporary, local-only tuning for the expanding sword-wave prototype. */
export const swordWaveTuning = {
    windupDuration: 0.30,
    waveDuration: 0.72,
    cooldownDuration: 2.5,
    manaCost: 20,
    maxMana: 100,
    startRadius: 12,
    maxRadius: 175,
    thickness: 18,
    halfAngle: Math.PI / 3,
};

export class SwordWaveModel {
    elapsed = -1;
    cooldown = 0;
    mana = swordWaveTuning.maxMana;
    private hitIds = new Set<number>();

    get casting(): boolean { return this.elapsed >= 0; }

    /** Fraction of the two-swing wind-up, or null while idle/after launch. */
    get windupProgress(): number | null {
        if (this.elapsed < 0 || this.elapsed >= swordWaveTuning.windupDuration) return null;
        return this.elapsed / swordWaveTuning.windupDuration;
    }

    /** Fraction of the active wave, or null before launch/after it disappears. */
    get waveProgress(): number | null {
        if (this.elapsed < swordWaveTuning.windupDuration) return null;
        if (this.elapsed < 0 || this.elapsed >= swordWaveTuning.windupDuration + swordWaveTuning.waveDuration) return null;
        return (this.elapsed - swordWaveTuning.windupDuration) / swordWaveTuning.waveDuration;
    }

    get waveRadius(): number | null {
        const progress = this.waveProgress;
        return progress === null ? null : swordWaveTuning.startRadius
            + (swordWaveTuning.maxRadius - swordWaveTuning.startRadius) * progress;
    }

    get ready(): boolean { return this.cooldown <= 0 && this.mana >= swordWaveTuning.manaCost; }

    cast(): boolean {
        if (!this.ready || this.casting) return false;
        this.mana -= swordWaveTuning.manaCost;
        this.cooldown = swordWaveTuning.cooldownDuration;
        this.elapsed = 0;
        this.hitIds.clear();
        return true;
    }

    update(dt: number): void {
        this.cooldown = Math.max(0, this.cooldown - dt);
        if (!this.casting) return;
        this.elapsed += dt;
        if (this.elapsed >= swordWaveTuning.windupDuration + swordWaveTuning.waveDuration) this.elapsed = -1;
    }

    /** Each target can be struck once by this wave. Tests the moving arc band and front-facing sector. */
    hitsTarget(id: number, targetX: number, targetY: number, originX: number, originY: number, facing: number): boolean {
        const radius = this.waveRadius;
        if (radius === null || this.hitIds.has(id)) return false;
        const dx = (targetX - originX) * facing;
        const dy = targetY - originY;
        const distance = Math.hypot(dx, dy);
        if (dx <= 0 || distance < radius - swordWaveTuning.thickness / 2
            || distance > radius + swordWaveTuning.thickness / 2
            || Math.abs(dy) > dx * Math.tan(swordWaveTuning.halfAngle)) return false;
        this.hitIds.add(id);
        return true;
    }

    reset(): void {
        this.elapsed = -1;
        this.cooldown = 0;
        this.mana = swordWaveTuning.maxMana;
        this.hitIds.clear();
    }
}
