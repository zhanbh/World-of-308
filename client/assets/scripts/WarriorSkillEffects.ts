import type { WarriorSkillId } from './WarriorSkillAnimation';

/** Seconds after contact. Also the minimum ultimate knockdown before standing up. */
export const skillEffectLifetimes: Record<WarriorSkillId, number> = {
    cross: 0.33, bengshan: 0.42, badao: 0.22, earth: 1.52,
};

export interface SkillEffect {
    id: WarriorSkillId;
    x: number;
    y: number;
    facing: number;
    age: number;
    lifetime: number;
}

/** Visual-only instances. They never emit damage or follow a moving actor. */
export class WarriorSkillEffects {
    items: SkillEffect[] = [];

    impact(id: WarriorSkillId, x: number, y: number, facing: number, initialAge = 0): void {
        const lifetime = skillEffectLifetimes[id];
        this.items.push({ id, x, y, facing, age: initialAge, lifetime });
    }

    update(dt: number): void {
        for (const item of this.items) item.age += dt;
        this.items = this.items.filter(item => item.age < item.lifetime);
    }

    clear(): void { this.items.length = 0; }
}
