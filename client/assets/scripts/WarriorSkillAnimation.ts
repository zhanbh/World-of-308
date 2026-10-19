/** Shared seconds-based body animation and contact schedule. */
export type WarriorSkillId = 'cross' | 'bengshan' | 'badao' | 'earth';

export const skillAtlas = { columns: 4, rows: 3, anchorX: 0.5, anchorY: 64 / 416, displaySize: 58 * 416 / 320 * 1.24 };
export const skillAnimations = {
    cross: { resource: 'warrior-cross-v1', duration: 0.56, impactAt: 0.29, moveAt: 0.46,
        times: [0, 0.055, 0.12, 0.17, 0.20, 0.24, 0.29, 0.34, 0.39, 0.43, 0.48, 0.52] },
    bengshan: { resource: 'warrior-bengshan-v1', duration: 0.88, impactAt: 0.58, moveAt: 0.78,
        times: [0, 0.06, 0.12, 0.22, 0.34, 0.42, 0.48, 0.58, 0.65, 0.71, 0.78, 0.84] },
    badao: { resource: 'warrior-badao-v2', duration: 0.76, impactAt: 0.44, moveAt: 0.66,
        chargeStart: 0.14, chargeEnd: 0.34,
        times: [0, 0.07, 0.14, 0.34, 0.38, 0.40, 0.44, 0.48, 0.54, 0.60, 0.66, 0.72] },
    earth: { resource: 'warrior-earth-v1', duration: 1.32, impactAt: 0.88, moveAt: 1.32,
        times: [0, 0.12, 0.28, 0.45, 0.62, 0.72, 0.80, 0.88, 1.00, 1.10, 1.18, 1.26] },
} as const;

export function skillFrame(id: WarriorSkillId, elapsed: number): number {
    const times = skillAnimations[id].times;
    let index = 0;
    while (index + 1 < times.length && elapsed >= times[index + 1]) index++;
    return index;
}

/** Visual height is independent of the ground position and collision. */
export function skillLift(id: WarriorSkillId, elapsed: number): number {
    const start = id === 'bengshan' ? 0.12 : 0.28;
    const apex = id === 'bengshan' ? 0.34 : 0.62;
    const fall = id === 'bengshan' ? 0.42 : 0.72;
    const height = id === 'bengshan' ? 25 : 52;
    if (id !== 'bengshan' && id !== 'earth') return 0;
    if (elapsed <= start || elapsed >= skillAnimations[id].impactAt) return 0;
    if (elapsed < apex) return Math.sin((elapsed - start) / (apex - start) * Math.PI / 2) * height;
    if (elapsed < fall) return height;
    return Math.cos((elapsed - fall) / (skillAnimations[id].impactAt - fall) * Math.PI / 2) * height;
}

/** Tiny pixel cues only: they never shift poses, contact times or collision. */
export function skillCuePixels(id: WarriorSkillId | null, elapsed: number): { x: number; y: number; size: number; alpha: number }[] {
    if (id === 'badao' && elapsed >= skillAnimations.badao.chargeStart && elapsed < skillAnimations.badao.chargeEnd) {
        const p = (elapsed - skillAnimations.badao.chargeStart) / (skillAnimations.badao.chargeEnd - skillAnimations.badao.chargeStart);
        const x = Math.round(-18 - p * 9), alpha = Math.sin(p * Math.PI) * .8;
        return [{ x, y: 16, size: 2, alpha }, { x: x - 1, y: 17, size: 1, alpha: alpha * .6 }];
    }
    if (id === 'cross' && elapsed >= .29 && elapsed < .34) {
        const p = (elapsed - .29) / .05;
        return [{ x: 28, y: 21, size: 2, alpha: 1 - p },
            { x: 26, y: 23, size: 1, alpha: 1 - p }, { x: 31, y: 20, size: 1, alpha: 1 - p }];
    }
    return [];
}

/** Body-only review poses: run0..3, brake4, hurt5..6, landing7, uppercut-prep8. */
export const bodyAtlas = { resource: 'warrior-body-v1', columns: 3, rows: 3,
    cellSize: 416, anchorX: .5, anchorY: 64 / 416, displaySize: 58 * 416 / 320 };
/** One full stride: near-leg contact at 0, opposite-leg contact at 4. */
export const gaitAtlas = { resource: 'warrior-gait-v2', columns: 4, rows: 2,
    cellSize: 416, frameDuration: .05, frameCount: 8,
    anchorX: .5, anchorY: 64 / 416, displaySize: bodyAtlas.displaySize };
export class WarriorBodyAnimation {
    frame: number | null = null;
    gaitFrame: number | null = null;
    private gait = 0;
    private wasMoving = false;
    private brakeLeft = 0;
    update(dt: number, moving: boolean, running: boolean, hitStun: number, locked: boolean, dead = false): void {
        this.gaitFrame = null;
        if (hitStun > 0 || dead) {
            this.frame = hitStun > .12 ? 5 : 6;
            this.wasMoving = false; this.brakeLeft = 0; this.gait = 0;
            return;
        }
        if (locked) { this.reset(); return; }
        if (moving) {
            this.gait += dt * (running ? 1 : .65);
            this.frame = Math.floor(this.gait / .10) % 4;
            this.gaitFrame = Math.floor(this.gait / gaitAtlas.frameDuration) % gaitAtlas.frameCount;
            this.wasMoving = true; this.brakeLeft = 0;
            return;
        }
        if (this.wasMoving) { this.brakeLeft = .10; this.wasMoving = false; this.gait = 0; }
        if (this.brakeLeft > 0) {
            this.frame = 4; this.brakeLeft = Math.max(0, this.brakeLeft - dt);
        } else this.frame = null;
    }
    reset(): void { this.frame = null; this.gaitFrame = null; this.gait = 0; this.wasMoving = false; this.brakeLeft = 0; }
}

export function bodyVisibleRect(frame: number): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 416, height: 416 };
}
