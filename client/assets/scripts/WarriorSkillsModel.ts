/** Prototype-only skill timings, costs, damage and geometry (source pixels / seconds). */
export type WarriorSkillId = 'cross' | 'bengshan' | 'badao' | 'earth';

export const warriorSkillTuning: Record<WarriorSkillId, {
    manaCost: number;
    cooldown: number;
    duration: number;
    impactAt: number;
    damage: number;
    range: number;
}> = {
    cross:   { manaCost: 8,  cooldown: 1.1, duration: 0.48, impactAt: 0.23, damage: 1, range: 58 },
    bengshan:{ manaCost: 18, cooldown: 3.4, duration: 0.88, impactAt: 0.64, damage: 2, range: 54 },
    badao:   { manaCost: 16, cooldown: 2.4, duration: 0.54, impactAt: 0.25, damage: 2, range: 142 },
    earth:   { manaCost: 40, cooldown: 8.0, duration: 1.50, impactAt: 1.08, damage: 3, range: 145 },
};

export const warriorSkillNames: Record<WarriorSkillId, string> = {
    cross: '十字斩', bengshan: '崩山击', badao: '拔刀斩', earth: '崩山裂地斩',
};

/** One local mana pool, four independently cooled-down moves and one active action. */
export class WarriorSkillsModel {
    readonly maxMana = 100;
    mana = this.maxMana;
    activeId: WarriorSkillId | null = null;
    elapsed = 0;
    facing = 1;
    impactId = 0;
    lastImpact: WarriorSkillId | null = null;
    motionDelta = 0;
    private impactSent = false;
    private movementFraction = 0;
    private cooldowns: Record<WarriorSkillId, number> = { cross: 0, bengshan: 0, badao: 0, earth: 0 };

    get casting(): boolean { return this.activeId !== null; }
    get progress(): number | null {
        if (!this.activeId) return null;
        return Math.min(1, this.elapsed / warriorSkillTuning[this.activeId].duration);
    }
    get jumpLift(): number {
        const p = this.progress;
        if (p === null) return 0;
        if (this.activeId === 'bengshan') return Math.sin(Math.min(1, this.elapsed / warriorSkillTuning.bengshan.impactAt) * Math.PI) * 25;
        if (this.activeId === 'earth') {
            const impactProgress = warriorSkillTuning.earth.impactAt / warriorSkillTuning.earth.duration;
            return p < 0.35
                ? Math.sin(p / 0.35 * Math.PI / 2) * 52
                : Math.cos(Math.min(1, (p - 0.35) / (impactProgress - 0.35)) * Math.PI / 2) * 52;
        }
        return 0;
    }

    cooldown(id: WarriorSkillId): number { return this.cooldowns[id]; }
    ready(id: WarriorSkillId): boolean {
        return !this.casting && this.cooldowns[id] <= 0 && this.mana >= warriorSkillTuning[id].manaCost;
    }

    cast(id: WarriorSkillId, facing: number): boolean {
        if (!this.ready(id)) return false;
        const config = warriorSkillTuning[id];
        this.mana -= config.manaCost;
        this.cooldowns[id] = config.cooldown;
        this.activeId = id;
        this.elapsed = 0;
        this.facing = facing < 0 ? -1 : 1;
        this.impactSent = false;
        this.movementFraction = 0;
        this.motionDelta = 0;
        this.lastImpact = null;
        return true;
    }

    update(dt: number): void {
        this.lastImpact = null;
        this.motionDelta = 0;
        for (const id of Object.keys(this.cooldowns) as WarriorSkillId[]) {
            this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
        }
        const id = this.activeId;
        if (!id) return;
        const oldElapsed = this.elapsed;
        this.elapsed = Math.min(warriorSkillTuning[id].duration, this.elapsed + dt);
        if (id === 'bengshan') {
            const movementProgress = Math.min(1, this.elapsed / 0.42);
            const easedProgress = 1 - (1 - movementProgress) * (1 - movementProgress);
            this.motionDelta = (easedProgress - this.movementFraction) * 34 * this.facing;
            this.movementFraction = easedProgress;
        }
        if (!this.impactSent && oldElapsed < warriorSkillTuning[id].impactAt
            && this.elapsed >= warriorSkillTuning[id].impactAt) {
            this.impactSent = true;
            this.lastImpact = id;
            this.impactId++;
        }
        if (this.elapsed >= warriorSkillTuning[id].duration) this.activeId = null;
    }

    cancel(): void {
        this.activeId = null;
        this.elapsed = 0;
        this.motionDelta = 0;
        this.lastImpact = null;
    }

    reset(): void {
        this.cancel();
        this.mana = this.maxMana;
        this.cooldowns = { cross: 0, bengshan: 0, badao: 0, earth: 0 };
        this.impactSent = false;
        this.movementFraction = 0;
        this.impactId = 0;
    }
}
