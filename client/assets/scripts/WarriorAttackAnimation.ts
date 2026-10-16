/** Seconds from action start. Shared by combat, sprite playback and preview. */
export const basicAttacks = [
    { name: '交叉斩', duration: 0.28, impact: 0.112, moveAt: 0.238,
        frames: [0, 1, 2, 3, 4, 5, 6, 7], times: [0, 0.035, 0.07, 0.112, 0.147, 0.182, 0.217, 0.252] },
    { name: '反手上挑', duration: 0.30, impact: 0.1363636364, moveAt: 0.2590909091,
        frames: [8, 9, 10, 11, 12, 13, 14, 15], times: [0, 0.0409090909, 0.0818181818, 0.1363636364, 0.1704545455, 0.2045454545, 0.2386363636, 0.2727272727] },
    { name: '下劈收势', duration: 0.42, impact: 0.1633333333, moveAt: 0.3616666667,
        frames: [16, 17, 18, 19, 20, 21, 22, 23], times: [0, 0.0466666667, 0.105, 0.1633333333, 0.2333333333, 0.2916666667, 0.3616666667, 0.3966666667] },
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
