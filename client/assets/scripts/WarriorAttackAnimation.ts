/** Seconds from action start. Shared by combat, sprite playback and preview. */
export const basicAttacks = [
    { name: '交叉斩', duration: 0.20, impact: 0.08, moveAt: 0.17,
        frames: [0, 1, 2, 3, 4, 5, 6, 7], times: [0, 0.025, 0.05, 0.08, 0.105, 0.13, 0.155, 0.18] },
    { name: '反手上挑', duration: 0.22, impact: 0.10, moveAt: 0.19,
        frames: [8, 9, 10, 11, 12, 13, 14, 15], times: [0, 0.03, 0.06, 0.10, 0.125, 0.15, 0.175, 0.20] },
    { name: '下劈收势', duration: 0.36, impact: 0.14, moveAt: 0.31,
        frames: [16, 17, 18, 19, 20, 21, 22, 23], times: [0, 0.04, 0.09, 0.14, 0.20, 0.25, 0.31, 0.34] },
] as const;

export const attackAtlas = { resource: 'warrior-basic-attack-v2', columns: 8, rows: 3,
    anchorX: 0.5, anchorY: 30 / 320 };

export function attackFrame(stage: number, elapsed: number): number {
    const action = basicAttacks[stage];
    if (!action) return 0;
    let index = 0;
    while (index + 1 < action.times.length && elapsed >= action.times[index + 1]) index++;
    return action.frames[index];
}

const attackCropLeft: Readonly<Record<number, number>> = { 4: 70, 5: 64, 9: 48, 11: 40 };

/** Version-v2-specific crop of verified neighboring-frame fragments, not a rescale.
 * Cell coordinates and boot anchor stay fixed. Ambiguous attached trails are kept.
 */
export function attackVisibleRect(index: number, cleaned = true): { left: number; top: number; width: number; height: number } {
    const left = cleaned ? attackCropLeft[index] || 0 : 0;
    return { left, top: 0, width: 320 - left, height: 320 };
}
