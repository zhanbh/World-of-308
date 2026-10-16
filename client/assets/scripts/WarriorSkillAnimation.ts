/** Shared seconds-based body animation and contact schedule. */
export type WarriorSkillId = 'cross' | 'bengshan' | 'badao' | 'earth';

export const skillAtlas = { columns: 4, rows: 3, anchorX: 0.5, anchorY: 64 / 416, displaySize: 58 * 416 / 320 };
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
